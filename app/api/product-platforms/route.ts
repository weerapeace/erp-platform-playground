/**
 * Product Platform Listing Manager — /api/product-platforms (เฟส 1a, MVP ในบ้าน)
 * GET   ?parent_sku_id=  (products.platforms.view) → แพลตฟอร์มที่เปิด + ร่างต่อแพลตฟอร์ม + SKU variants จริง + ข้อมูล parent
 * PATCH { parent_sku_id, platform_id, title?, description?, category_path?, status? } (products.platforms.edit) → upsert ร่าง
 * ตาราง: erp_platforms (registry) + platform_listing_drafts (ร่างต่อสินค้า×แพลตฟอร์ม) + skus_v2 (variant ดึงสด)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit, writeAuditMany } from "@/lib/audit";
import { loadListingContext } from "@/lib/product-listing-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ตรรกะประกอบข้อมูล (ตัวสี/ตัวขาย · รวมรูป · น้ำหนัก/กล่อง · หมวดกลาง→ร้าน) อยู่ที่ของกลาง lib/product-listing-context
export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const parentId = (new URL(request.url).searchParams.get("parent_sku_id") ?? "").trim();
  if (!parentId) return NextResponse.json({ error: "ต้องระบุ parent_sku_id" }, { status: 400 });
  const ctx = await loadListingContext(supabaseAdmin(), parentId);
  return NextResponse.json({ ...ctx, error: null });
}

const FIELDS = ["title", "description", "category_path", "status", "image_keys", "description_image_keys"] as const;

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const platform_id = String(body.platform_id ?? "").trim();

  // บันทึกหมวดหมู่กลาง→แพลตฟอร์ม เป็น "ค่ามาตรฐาน" (ใช้ซ้ำทุกสินค้าในหมวดเดียวกัน)
  if (body.save_mapping) {
    const central = String(body.central_category_id ?? "").trim();
    if (!central || !platform_id) return NextResponse.json({ error: "ต้องมี central_category_id + platform_id" }, { status: 400 });
    const admin0 = supabaseAdmin();
    const { error } = await admin0.from("platform_category_mappings")
      .upsert({ central_category_id: central, platform_id, platform_category_path: String(body.platform_category_path ?? "").trim() || null, updated_by: user?.id ?? null, updated_at: new Date().toISOString(), created_by: user?.id ?? null }, { onConflict: "central_category_id,platform_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAudit(admin0, { action: "update", entityType: "platform_category_mapping", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { central_category_id: central, platform_id } });
    return NextResponse.json({ ok: true, error: null });
  }

  // ตั้ง "หมวดกลางสำหรับลงขาย" ของสินค้า (parent_skus_v2.platform_category_id)
  // สินค้าเดียว: parent_sku_id · หลายสินค้าพร้อมกัน (หน้า 📤 ลงสินค้าบนแพลตฟอร์ม): parent_sku_ids[] ≤ 500
  if (body.set_platform_category) {
    const ids = Array.isArray(body.parent_sku_ids)
      ? [...new Set((body.parent_sku_ids as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean))]
      : [String(body.parent_sku_id ?? "").trim()].filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: "ต้องมี parent_sku_id" }, { status: 400 });
    if (ids.length > 500) return NextResponse.json({ error: "ตั้งได้สูงสุด 500 สินค้าต่อครั้ง" }, { status: 400 });
    const central = String(body.platform_category_id ?? "").trim() || null;
    const admin1 = supabaseAdmin();
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await admin1.from("parent_skus_v2").update({ platform_category_id: central }).in("id", ids.slice(i, i + 200));
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    await writeAuditMany(admin1, ids.map((pid) => ({ action: "update", entityType: "parent_sku", entityId: pid, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { platform_category_id: central, parent_sku_id: pid, bulk: ids.length > 1 } })));
    return NextResponse.json({ ok: true, updated: ids.length, error: null });
  }

  const parent_sku_id = String(body.parent_sku_id ?? "").trim();
  if (!parent_sku_id || !platform_id) return NextResponse.json({ error: "ต้องมี parent_sku_id + platform_id" }, { status: 400 });

  const row: Record<string, unknown> = { parent_sku_id, platform_id, updated_by: user?.id ?? null, updated_at: new Date().toISOString() };
  for (const f of FIELDS) if (f in body) row[f] = body[f] === "" ? null : body[f];
  // ฟิลด์เสริม (แบรนด์/บาร์โค้ด/น้ำหนัก-ขนาด/ของขวัญ/ส่วนลด) — client ส่งทั้งก้อนมา set
  if ("extra" in body && body.extra && typeof body.extra === "object") row.extra = body.extra;

  const admin = supabaseAdmin();
  const { error } = await admin.from("platform_listing_drafts")
    .upsert({ ...row, created_by: user?.id ?? null }, { onConflict: "parent_sku_id,platform_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, { action: "update", entityType: "platform_listing_draft", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { parent_sku_id, platform_id, fields: FIELDS.filter((f) => f in body) } });
  return NextResponse.json({ ok: true, error: null });
}
