/**
 * /api/product-tags — แท็กประเภทสินค้า (product_families) แบบ 2 ภาษา + ติด/ปลดแท็กให้สินค้า
 *   GET  ?parent_id=            → { tags: [{id,name,name_en,group_id}], mine: [tag_id...], groups: [{id,name,parent_group_id}] }
 *   POST { parent_id, tag_id, on }         → ติด (on=true) / ปลด (on=false)
 *   POST { tag_id, name_en }               → แก้ชื่ออังกฤษของแท็ก
 *   POST { create: { name, name_en?, group_id? } } → สร้างแท็กใหม่ (ชื่อซ้ำ = คืนตัวเดิม) · ป๊อป AI ร่าง ขั้นตั้งต้น
 *   GET  ?usage=<tag_id>                  → { count } สินค้าที่ติดแท็กนี้ (ป๊อปแก้แท็กเตือนก่อนแก้ชื่อ)
 *   POST { tag_id, update: { name?, name_en?, group_id? } } → แก้แท็ก (มีผลกับทุกสินค้าที่ติดแท็กนี้) · audit changes
 *   POST { tag_id, archive: true|false }    → เก็บเข้าถังขยะ / กู้คืน (is_active) — ใช้ตอนกด "ย้อนกลับ" หลังสร้าง
 *
 * ทำไมไม่ใช้ /api/admin/schema/m2m-links: ตัวนั้นต้องมีสิทธิ์ระดับแอดมินโครงสร้างตาราง
 * (admin.schema.view / delete_field) ซึ่งแรงเกินไปสำหรับ "คนที่แก้สินค้าได้ควรติดแท็กได้"
 * (2026-11-15: m2m-links ปรับแล้ว — ตารางแท็กสินค้าใช้ products.view / products.edit + มี audit ทุกครั้ง)
 *
 * สิทธิ์: อ่าน = products.view · ติด/ปลด/แก้ชื่อ = products.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { auditDiff, writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const JUNCTION = "parent_skus_v2_product_family_m2m";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const parentId = (sp.get("parent_id") ?? "").trim();
  const admin = supabaseAdmin();
  const usage = (sp.get("usage") ?? "").trim();
  if (usage) {
    const { count, error } = await admin.from(JUNCTION).select("id", { count: "exact", head: true }).eq("tgt_id", usage);
    if (error) return NextResponse.json({ count: null, error: error.message }, { status: 400 });
    return NextResponse.json({ count: count ?? 0, error: null });
  }
  const [tagsRes, linkRes, groupsRes] = await Promise.all([
    admin.from("product_families").select("id, name, name_en, group_id").eq("is_active", true).order("name", { ascending: true }),
    parentId ? admin.from(JUNCTION).select("tgt_id").eq("src_id", parentId) : Promise.resolve({ data: [], error: null }),
    // กลุ่ม → หน้าจอหา "แท็กแม่" ของแท็กย่อยได้ (lib/tag-hierarchy)
    admin.from("product_family_groups").select("id, name, parent_group_id").eq("is_active", true),
  ]);
  if (tagsRes.error) return NextResponse.json({ tags: [], mine: [], groups: [], error: tagsRes.error.message }, { status: 400 });
  return NextResponse.json({
    tags: tagsRes.data ?? [],
    mine: ((linkRes.data ?? []) as { tgt_id: string }[]).map((r) => r.tgt_id),
    groups: groupsRes.data ?? [],
    error: null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "products.edit")))
    return NextResponse.json({ error: "ต้องมีสิทธิ์แก้สินค้า (products.edit)" }, { status: 401 });
  let b: { parent_id?: string; tag_id?: string; on?: boolean; name_en?: string | null; archive?: boolean; update?: { name?: string; name_en?: string | null; group_id?: string | null }; create?: { name?: string; name_en?: string | null; group_id?: string | null } };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  // โหมดสร้างแท็กใหม่ — ชื่อซ้ำกับแท็กที่ใช้อยู่ = คืนตัวเดิม (กันแท็กซ้ำ) · ซ้ำกับตัวในถังขยะ = กู้คืนตัวนั้น
  if (b.create) {
    const name = String(b.create.name ?? "").trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "ใส่ชื่อแท็กก่อน" }, { status: 400 });
    const nameEn = String(b.create.name_en ?? "").trim().slice(0, 80) || null;
    const groupId = String(b.create.group_id ?? "").trim() || null;
    const { data: same } = await admin.from("product_families").select("id, name, name_en, group_id, is_active").ilike("name", name).limit(1).maybeSingle();
    if (same) {
      if (!same.is_active) await admin.from("product_families").update({ is_active: true, updated_at: new Date().toISOString() }).eq("id", same.id);
      return NextResponse.json({ data: { id: same.id, name: same.name, name_en: same.name_en, group_id: same.group_id }, existed: true, error: null });
    }
    const { data, error } = await admin.from("product_families").insert({ name, name_en: nameEn, group_id: groupId, is_active: true }).select("id, name, name_en, group_id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAudit(admin, { action: "create", entityType: "product_families", entityId: data.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name, name_en: nameEn, group_id: groupId, from: "ai_draft" } });
    return NextResponse.json({ data, existed: false, error: null });
  }

  const tagId = (b.tag_id ?? "").trim();
  if (!tagId) return NextResponse.json({ error: "ต้องระบุ tag_id" }, { status: 400 });

  // โหมดแก้แท็ก (ชื่อไทย/อังกฤษ/กลุ่ม) — มีผลกับทุกสินค้าที่ติดแท็กนี้ · จดค่าเดิม→ใหม่ (ย้อนกลับได้จากป๊อป)
  if (b.update) {
    const { data: before } = await admin.from("product_families").select("name, name_en, group_id").eq("id", tagId).maybeSingle();
    if (!before) return NextResponse.json({ error: "ไม่พบแท็ก" }, { status: 404 });
    const patch: Record<string, unknown> = {};
    if (b.update.name !== undefined) {
      const nm = String(b.update.name ?? "").trim().slice(0, 80);
      if (!nm) return NextResponse.json({ error: "ชื่อแท็กห้ามว่าง" }, { status: 400 });
      const { data: dup } = await admin.from("product_families").select("id").ilike("name", nm).eq("is_active", true).neq("id", tagId).limit(1).maybeSingle();
      if (dup) return NextResponse.json({ error: `มีแท็กชื่อ "${nm}" อยู่แล้ว` }, { status: 400 });
      patch.name = nm;
    }
    if (b.update.name_en !== undefined) patch.name_en = String(b.update.name_en ?? "").trim().slice(0, 80) || null;
    if (b.update.group_id !== undefined) patch.group_id = String(b.update.group_id ?? "").trim() || null;
    if (!Object.keys(patch).length) return NextResponse.json({ success: true, before, error: null });
    const { error } = await admin.from("product_families").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", tagId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAudit(admin, { action: "update", entityType: "product_families", entityId: tagId, actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { from: "ai_draft", changes: auditDiff(before as Record<string, unknown>, patch) } });
    return NextResponse.json({ success: true, before, error: null });
  }

  // โหมดเก็บเข้าถังขยะ/กู้คืน (ไม่ลบจริง — สินค้าที่ติดแท็กนี้ไม่พัง)
  if (b.archive !== undefined) {
    const { error } = await admin.from("product_families").update({ is_active: !b.archive, updated_at: new Date().toISOString() }).eq("id", tagId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAudit(admin, { action: b.archive ? "archive" : "restore", entityType: "product_families", entityId: tagId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { changes: [{ field: "is_active", old: !!b.archive, new: !b.archive }] } });
    return NextResponse.json({ success: true, error: null });
  }

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
