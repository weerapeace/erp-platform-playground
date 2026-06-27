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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { owner_type?: string; owner_id?: string; r2_key?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

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
