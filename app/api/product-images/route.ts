/**
 * Product Images — ของกลาง: ใส่รูปเข้า "แกลเลอรีสินค้า" ของ SKU หรือ Parent SKU
 * แกลเลอรีที่ผู้ใช้เห็นจริง = erp_playground_attachments (entity_type skus_v2/parent_skus_v2, entity_id = record id)
 * POST { owner_type: "product_sku" | "parent_sku", owner_id, r2_key }
 *   → เพิ่มรูปเข้าแกลเลอรี (sort_order ถัดไป) + ตั้งเป็นรูปปก (cover) ถ้ายังไม่มี
 * POST { action:"restore", slot_id, r2_key }  → คืนรูปเก่าเข้าแถวเดิม (slot_id = id ของแถว attachment)
 * GET  ?owner_type=&owner_id=&versions=1      → ประวัติ "รูปเก่าที่ถูกแทน" (จาก ledger erp_subtask_sync)
 * ใช้จากป๊อปอัปส่ง/ตรวจงาน · guard products.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function entityTypeOf(ownerType: string): "parent_skus_v2" | "skus_v2" {
  return ownerType === "parent_sku" ? "parent_skus_v2" : "skus_v2";
}
function ctFromKey(key: string): string {
  const ext = (key.split(".").pop() ?? "").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  return "image/jpeg";
}

// GET ?owner_type=&owner_id=&versions=1 → ประวัติ "รูปเก่าที่ถูกแทน" (จาก ledger erp_subtask_sync) ต่อสินค้า
export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const ownerType = sp.get("owner_type") === "parent_sku" ? "parent_sku" : "product_sku";
  const ownerId = (sp.get("owner_id") ?? "").trim();
  if (!ownerId) return NextResponse.json({ versions: [], error: null });
  const admin = supabaseAdmin();
  const entityType = entityTypeOf(ownerType);
  // แถวแกลเลอรีปัจจุบันของสินค้านี้ (id = slot_id, file_path = รูปปัจจุบัน)
  const { data: atts } = await admin.from("erp_playground_attachments").select("id, sort_order, file_path").eq("entity_type", entityType).eq("entity_id", ownerId);
  const attRows = (atts ?? []) as { id: string; sort_order: number; file_path: string }[];
  if (!attRows.length) return NextResponse.json({ versions: [], error: null });
  const attById = new Map(attRows.map((s) => [s.id, s]));
  const attIds = attRows.map((s) => s.id);
  const { data: led } = await admin.from("erp_subtask_sync").select("target_id, prev_value, new_value, created_at").eq("target_kind", "media_replace").eq("target_table", "erp_playground_attachments").in("target_id", attIds).order("created_at", { ascending: false });
  // รูปเก่าที่ยังไม่ได้เป็นรูปปัจจุบันของช่องนั้น (กันโชว์ซ้ำกับรูปที่โชว์อยู่)
  const versions = ((led ?? []) as { target_id: string; prev_value: string | null; new_value: string | null; created_at: string }[])
    .filter((r) => r.prev_value && attById.get(r.target_id)?.file_path !== r.prev_value)
    .map((r) => ({ slot_id: String(r.target_id), slot: attById.get(r.target_id)?.sort_order ?? null, old_r2_key: String(r.prev_value), replaced_at: r.created_at }));
  return NextResponse.json({ versions, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { owner_type?: string; owner_id?: string; r2_key?: string; action?: string; slot_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // action=restore → คืนรูปเก่าเข้าแถวเดิม (slot_id = id ของแถว attachment) — ย้ายปกตามถ้ารูปเดิมเป็นปก
  if (body.action === "restore") {
    const slotId = (body.slot_id ?? "").trim(); const r2 = (body.r2_key ?? "").trim();
    if (!slotId || !r2) return NextResponse.json({ error: "ต้องมี slot_id + r2_key" }, { status: 400 });
    const admin2 = supabaseAdmin();
    const { data: row } = await admin2.from("erp_playground_attachments").select("id, entity_type, entity_id, file_path").eq("id", slotId).maybeSingle();
    if (!row) return NextResponse.json({ error: "ไม่พบช่องรูป" }, { status: 404 });
    const s = row as { entity_type: string; entity_id: string; file_path: string };
    const prev = String(s.file_path ?? "");
    await admin2.from("erp_playground_attachments").update({ file_path: r2, public_url: `/api/r2-image?key=${encodeURIComponent(r2)}`, file_name: r2.split("/").pop() ?? "image", content_type: ctFromKey(r2) }).eq("id", slotId);
    const tbl = s.entity_type === "parent_skus_v2" ? "parent_skus_v2" : "skus_v2";
    const { data: cur } = await admin2.from(tbl).select("cover_image_r2_key").eq("id", s.entity_id).maybeSingle();
    if ((cur?.cover_image_r2_key ?? null) === prev && prev) await admin2.from(tbl).update({ cover_image_r2_key: r2 }).eq("id", s.entity_id);
    await writeAudit(admin2, { action: "product:restore_image", entityType: tbl, entityId: s.entity_id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { slot_id: slotId, restored: r2, was: prev } });
    return NextResponse.json({ ok: true, error: null });
  }

  const ownerType = body.owner_type === "parent_sku" ? "parent_sku" : "product_sku";
  const ownerId = (body.owner_id ?? "").trim();
  const r2Key = (body.r2_key ?? "").trim();
  if (!ownerId || !r2Key) return NextResponse.json({ error: "ต้องมี owner_id + r2_key" }, { status: 400 });

  const table = ownerType === "parent_sku" ? "parent_skus_v2" : "skus_v2";
  const entityType = entityTypeOf(ownerType);
  const admin = supabaseAdmin();

  // sort_order ถัดไปในแกลเลอรี + มีรูปอยู่แล้วไหม (ตั้งรูปหลักถ้ายังว่าง)
  const { data: ex } = await admin.from("erp_playground_attachments").select("sort_order, is_primary").eq("entity_type", entityType).eq("entity_id", ownerId).order("sort_order", { ascending: false });
  const rows = (ex ?? []) as { sort_order: number; is_primary: boolean }[];
  const ord = (rows.length ? Number(rows[0].sort_order ?? rows.length - 1) : -1) + 1;
  const makePrimary = rows.length === 0;
  const { error: insErr } = await admin.from("erp_playground_attachments").insert({ entity_type: entityType, entity_id: ownerId, file_name: r2Key.split("/").pop() ?? "image", file_path: r2Key, public_url: `/api/r2-image?key=${encodeURIComponent(r2Key)}`, content_type: ctFromKey(r2Key), is_primary: makePrimary, sort_order: ord, uploaded_by: user?.id ?? null });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  // ตั้งรูปปก (cover_image_r2_key ของสินค้า) ถ้ายังไม่มี
  const { data: cur } = await admin.from(table).select("cover_image_r2_key").eq("id", ownerId).maybeSingle();
  let cover = (cur?.cover_image_r2_key as string | null) ?? null;
  if (!cover) { await admin.from(table).update({ cover_image_r2_key: r2Key }).eq("id", ownerId); cover = r2Key; }

  await writeAudit(admin, { action: "product:add_image", entityType: table, entityId: ownerId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { owner_type: ownerType, r2_key: r2Key } });
  return NextResponse.json({ ok: true, cover, error: null });
}
