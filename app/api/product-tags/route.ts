/**
 * /api/product-tags — แท็กประเภทสินค้า (product_families) แบบ 2 ภาษา + ติด/ปลดแท็กให้สินค้า
 *   GET  ?parent_id=            → { tags: [{id,name,name_en}], mine: [tag_id...] }
 *   POST { parent_id, tag_id, on }         → ติด (on=true) / ปลด (on=false)
 *   POST { tag_id, name_en }               → แก้ชื่ออังกฤษของแท็ก
 *
 * ทำไมไม่ใช้ /api/admin/schema/m2m-links: ตัวนั้นต้องมีสิทธิ์ระดับแอดมินโครงสร้างตาราง
 * (admin.schema.view / delete_field) ซึ่งแรงเกินไปสำหรับ "คนที่แก้สินค้าได้ควรติดแท็กได้"
 *
 * สิทธิ์: อ่าน = products.view · ติด/ปลด/แก้ชื่อ = products.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const JUNCTION = "parent_skus_v2_product_family_m2m";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const parentId = (new URL(request.url).searchParams.get("parent_id") ?? "").trim();
  const admin = supabaseAdmin();
  const [tagsRes, linkRes] = await Promise.all([
    admin.from("product_families").select("id, name, name_en").eq("is_active", true).order("name", { ascending: true }),
    parentId ? admin.from(JUNCTION).select("tgt_id").eq("src_id", parentId) : Promise.resolve({ data: [], error: null }),
  ]);
  if (tagsRes.error) return NextResponse.json({ tags: [], mine: [], error: tagsRes.error.message }, { status: 400 });
  return NextResponse.json({
    tags: tagsRes.data ?? [],
    mine: ((linkRes.data ?? []) as { tgt_id: string }[]).map((r) => r.tgt_id),
    error: null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "products.edit")))
    return NextResponse.json({ error: "ต้องมีสิทธิ์แก้สินค้า (products.edit)" }, { status: 401 });
  let b: { parent_id?: string; tag_id?: string; on?: boolean; name_en?: string | null };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const tagId = (b.tag_id ?? "").trim();
  if (!tagId) return NextResponse.json({ error: "ต้องระบุ tag_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  // โหมดแก้ชื่ออังกฤษของแท็ก (ไม่ต้องมี parent_id)
  if (b.name_en !== undefined) {
    const nameEn = (b.name_en ?? "").trim() || null;
    const { error } = await admin.from("product_families").update({ name_en: nameEn, updated_at: new Date().toISOString() }).eq("id", tagId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAudit(admin, { action: "update", entityType: "product_families", entityId: tagId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name_en: nameEn } });
    return NextResponse.json({ success: true, error: null });
  }

  const parentId = (b.parent_id ?? "").trim();
  if (!parentId) return NextResponse.json({ error: "ต้องระบุ parent_id" }, { status: 400 });
  if (b.on === false) {
    const { error } = await admin.from(JUNCTION).delete().eq("src_id", parentId).eq("tgt_id", tagId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    // กันซ้ำ: มีอยู่แล้วก็ถือว่าสำเร็จ
    const { data: ex } = await admin.from(JUNCTION).select("id").eq("src_id", parentId).eq("tgt_id", tagId).maybeSingle();
    if (!ex) {
      const { error } = await admin.from(JUNCTION).insert({ src_id: parentId, tgt_id: tagId });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }
  await writeAudit(admin, {
    action: b.on === false ? "untag" : "tag", entityType: "parent_skus_v2", entityId: parentId,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { tag_id: tagId },
  });
  return NextResponse.json({ success: true, error: null });
}
