/**
 * Product Images — ของกลาง: ใส่รูปเข้า "แกลเลอรีสินค้า" (product_image_slots) ของ SKU หรือ Parent SKU
 * POST { owner_type: "product_sku" | "parent_sku", owner_id, r2_key }
 *   → เพิ่มรูปเข้า image_group=gallery (slot ถัดไป) + ตั้งเป็นรูปปก (cover) ถ้ายังไม่มี
 * ใช้จากป๊อปอัปส่งงาน (ปุ่ม 📷 ใส่รูป ต่อ SKU) · guard products.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET ?owner_type=&owner_id=&versions=1 → ประวัติ "รูปเก่าที่ถูกแทน" (จาก ledger erp_subtask_sync) ต่อสินค้า
export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const ownerType = sp.get("owner_type") === "parent_sku" ? "parent_sku" : "product_sku";
  const ownerId = (sp.get("owner_id") ?? "").trim();
  if (!ownerId) return NextResponse.json({ versions: [], error: null });
  const admin = supabaseAdmin();
  const { data: slots } = await admin.from("product_image_slots").select("id, slot, r2_key").eq("owner_type", ownerType).eq("owner_id", ownerId);
  const slotIds = ((slots ?? []) as { id: string }[]).map((s) => s.id);
  if (!slotIds.length) return NextResponse.json({ versions: [], error: null });
  const slotById = new Map(((slots ?? []) as { id: string; slot: number; r2_key: string }[]).map((s) => [s.id, s]));
  const { data: led } = await admin.from("erp_subtask_sync").select("target_id, prev_value, new_value, created_at").eq("target_kind", "media_replace").in("target_id", slotIds).order("created_at", { ascending: false });
  // รูปเก่าที่ยังไม่ได้เป็นรูปปัจจุบันของช่องนั้น (กันโชว์ซ้ำกับรูปที่โชว์อยู่)
  const versions = ((led ?? []) as { target_id: string; prev_value: string | null; new_value: string | null; created_at: string }[])
    .filter((r) => r.prev_value && slotById.get(r.target_id)?.r2_key !== r.prev_value)
    .map((r) => ({ slot_id: String(r.target_id), slot: slotById.get(r.target_id)?.slot ?? null, old_r2_key: String(r.prev_value), replaced_at: r.created_at }));
  return NextResponse.json({ versions, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { owner_type?: string; owner_id?: string; r2_key?: string; action?: string; slot_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // action=restore → คืนรูปเก่าเข้าช่องเดิม (ย้ายปกตามถ้ารูปเดิมเป็นปก)
  if (body.action === "restore") {
    const slotId = (body.slot_id ?? "").trim(); const r2 = (body.r2_key ?? "").trim();
    if (!slotId || !r2) return NextResponse.json({ error: "ต้องมี slot_id + r2_key" }, { status: 400 });
    const admin2 = supabaseAdmin();
    const { data: slot } = await admin2.from("product_image_slots").select("id, owner_type, owner_id, r2_key").eq("id", slotId).maybeSingle();
    if (!slot) return NextResponse.json({ error: "ไม่พบช่องรูป" }, { status: 404 });
    const s = slot as { owner_type: string; owner_id: string; r2_key: string };
    const prev = String(s.r2_key ?? "");
    await admin2.from("product_image_slots").update({ r2_key: r2 }).eq("id", slotId);
    const tbl = s.owner_type === "parent_sku" ? "parent_skus_v2" : "skus_v2";
    const { data: cur } = await admin2.from(tbl).select("cover_image_r2_key").eq("id", s.owner_id).maybeSingle();
    if ((cur?.cover_image_r2_key ?? null) === prev && prev) await admin2.from(tbl).update({ cover_image_r2_key: r2 }).eq("id", s.owner_id);
    await writeAudit(admin2, { action: "product:restore_image", entityType: tbl, entityId: s.owner_id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { slot_id: slotId, restored: r2, was: prev } });
    return NextResponse.json({ ok: true, error: null });
  }

  const ownerType = body.owner_type === "parent_sku" ? "parent_sku" : "product_sku";
  const ownerId = (body.owner_id ?? "").trim();
  const r2Key = (body.r2_key ?? "").trim();
  if (!ownerId || !r2Key) return NextResponse.json({ error: "ต้องมี owner_id + r2_key" }, { status: 400 });

  const table = ownerType === "parent_sku" ? "parent_skus_v2" : "skus_v2";
  const admin = supabaseAdmin();

  // slot ถัดไปในแกลเลอรี
  const { data: mx } = await admin.from("product_image_slots").select("slot")
    .eq("owner_type", ownerType).eq("owner_id", ownerId).eq("image_group", "gallery")
    .order("slot", { ascending: false }).limit(1);
  const slot = ((mx?.[0]?.slot as number) ?? -1) + 1;
  const { error: insErr } = await admin.from("product_image_slots").insert({ owner_type: ownerType, owner_id: ownerId, image_group: "gallery", slot, r2_key: r2Key });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  // ตั้งรูปปกถ้ายังไม่มี
  const { data: cur } = await admin.from(table).select("cover_image_r2_key").eq("id", ownerId).maybeSingle();
  let cover = (cur?.cover_image_r2_key as string | null) ?? null;
  if (!cover) { await admin.from(table).update({ cover_image_r2_key: r2Key }).eq("id", ownerId); cover = r2Key; }

  await writeAudit(admin, { action: "product:add_image", entityType: table, entityId: ownerId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { owner_type: ownerType, r2_key: r2Key } });
  return NextResponse.json({ ok: true, cover, error: null });
}
