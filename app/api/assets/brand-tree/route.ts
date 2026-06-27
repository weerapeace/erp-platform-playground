/**
 * GET /api/assets/brand-tree  — มุมมอง "ดูตามแบรนด์" ของคลังไฟล์
 *   ?mode=brands                 → รายการแบรนด์ที่มีรูป (+ จำนวน)
 *   ?mode=parents&brand_id=      → Parent SKU ในแบรนด์ (เฉพาะที่มีรูป) + จำนวนต่อโฟลเดอร์  (brand_id ว่าง/none = ไม่ระบุแบรนด์)
 *   ?mode=parent&parent_id=      → รายละเอียด 1 Parent: รูป Parent + โฟลเดอร์ SKUs (ย่อยราย SKU) + Description
 *
 * รูปผูกสินค้าผ่าน asset_usages (ของเดิม) — ไม่ดึงไฟล์ใหม่ · ของกลาง guardApi/supabaseAdmin/buildRow
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildRow, loadTags, loadUsageCounts, type AssetRow } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;

// asset_ids (เรียงลำดับมาแล้ว) → AssetRow[] คงลำดับเดิม (เฟส 2 จะใช้ sort_order)
async function rowsByIds(admin: Admin, orderedIds: string[]): Promise<AssetRow[]> {
  const ids = [...new Set(orderedIds)];
  if (ids.length === 0) return [];
  const { data } = await admin.from("assets").select("*").in("id", ids).eq("status", "active");
  const rows = (data ?? []) as Parameters<typeof buildRow>[0][];
  const tagsBy = await loadTags(admin, ids);
  const useBy = await loadUsageCounts(admin, ids);
  const map = new Map(rows.map((r) => [r.id, buildRow(r, tagsBy.get(r.id) ?? [], useBy.get(r.id) ?? 0)]));
  return orderedIds.map((id) => map.get(id)).filter((x): x is AssetRow => !!x);
}

// asset_ids ที่ผูกกับ (module, record_id) เรียงตาม sort_order (null ไปท้าย) แล้ว created_at
async function usageIds(admin: Admin, module: string, recordId: string): Promise<string[]> {
  const { data } = await admin.from("asset_usages").select("asset_id, sort_order, created_at")
    .eq("module", module).eq("record_id", recordId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  return (data ?? []).map((u) => (u as { asset_id: string }).asset_id);
}

// รูปแสดงในมุมมองแบรนด์ (อ่านอย่างเดียว) — ไม่ต้องเป็น asset จริงก็แสดงได้
type GalleryImg = { id: string; url: string; title: string };

// แกลเลอรี "จริง" ของ entity = รูปภาพเพิ่มเติม (erp_playground_attachments: รูปหลักก่อน → ลำดับที่ตั้งในฟอร์ม) + รูป Odoo (asset_usages) รวม dedup
async function galleryFor(admin: Admin, entityType: string, entityId: string, usageModule: string): Promise<GalleryImg[]> {
  const { data: att } = await admin.from("erp_playground_attachments")
    .select("id, file_name, public_url, file_path, is_primary, sort_order, created_at")
    .eq("entity_type", entityType).eq("entity_id", entityId)
    .order("is_primary", { ascending: false }).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  type Att = { id: string; file_name: string | null; public_url: string | null; file_path: string };
  const attList = ((att ?? []) as Att[]).map((a) => ({
    id: "att:" + a.id,
    url: a.public_url || `/api/r2-image?key=${encodeURIComponent(a.file_path)}`,
    title: a.file_name ?? "",
    key: a.file_path,
  }));
  const seen = new Set(attList.map((a) => a.key));
  const odoo = (await rowsByIds(admin, await usageIds(admin, usageModule, entityId)))
    .filter((r) => !seen.has(r.r2_key))
    .map((r) => ({ id: r.id, url: r.url, title: r.title, key: r.r2_key }));
  return [...attList, ...odoo].map(({ id, url, title }) => ({ id, url, title }));
}

// แกลเลอรีจาก asset_usages อย่างเดียว (เช่น Description) → GalleryImg
async function usageGallery(admin: Admin, module: string, recordId: string): Promise<GalleryImg[]> {
  return (await rowsByIds(admin, await usageIds(admin, module, recordId))).map((r) => ({ id: r.id, url: r.url, title: r.title }));
}

// นับจำนวนรูปต่อ entity (รวม 2 แหล่ง) สำหรับ badge/กรอง
async function countImages(admin: Admin, entityType: string, entityIds: string[], usageModule: string): Promise<Map<string, number>> {
  const cnt = new Map<string, number>();
  if (entityIds.length === 0) return cnt;
  const { data: att } = await admin.from("erp_playground_attachments").select("entity_id").eq("entity_type", entityType).in("entity_id", entityIds);
  for (const a of (att ?? []) as { entity_id: string }[]) cnt.set(a.entity_id, (cnt.get(a.entity_id) ?? 0) + 1);
  const { data: au } = await admin.from("asset_usages").select("record_id").eq("module", usageModule).in("record_id", entityIds);
  for (const u of (au ?? []) as { record_id: string }[]) cnt.set(u.record_id, (cnt.get(u.record_id) ?? 0) + 1);
  return cnt;
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;

  const sp = new URL(request.url).searchParams;
  const mode = sp.get("mode") ?? "brands";
  const admin = supabaseAdmin();

  if (mode === "brands") {
    const { data, error } = await admin.rpc("erp_artwork_brands");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // cache สั้น (เปลี่ยนไม่บ่อย) → สลับกลับเข้ามุมมองไม่ต้องนับใหม่ทุกครั้ง
    return NextResponse.json({ brands: data ?? [], error: null }, { headers: { "Cache-Control": "private, max-age=60" } });
  }

  if (mode === "parents") {
    const raw = sp.get("brand_id");
    const brandId = raw && raw !== "none" ? raw : null;
    const { data, error } = await admin.rpc("erp_artwork_parents", { p_brand_id: brandId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // cache 60s — ลิสต์ Parent ต่อแบรนด์เปลี่ยนไม่บ่อย + เป็น query หนักสุด (เปิดแบรนด์ใหญ่ซ้ำจะไว)
    return NextResponse.json({ parents: data ?? [], error: null }, { headers: { "Cache-Control": "private, max-age=60" } });
  }

  if (mode === "parent") {
    const parentId = sp.get("parent_id");
    if (!parentId) return NextResponse.json({ error: "missing parent_id" }, { status: 400 });

    // นับรูปต่อ SKU (lazy — โหลดรูปจริงตอนกางโฟลเดอร์ผ่าน mode=sku) · นับรวม 2 แหล่ง (แกลเลอรี+Odoo)
    const skuCounts = async () => {
      const { data: skus } = await admin.from("skus_v2").select("id, code, name_th, color, color_th").eq("parent_sku_id", parentId).order("code");
      const skuList = (skus ?? []) as { id: string; code: string; name_th: string | null; color: string | null; color_th: string | null }[];
      const cnt = await countImages(admin, "skus_v2", skuList.map((s) => s.id), "product_sku");
      return skuList.map((s) => ({ id: s.id, code: s.code, name: s.name_th ?? "", color: s.color_th || s.color || "", img_count: cnt.get(s.id) ?? 0 })).filter((s) => s.img_count > 0);
    };

    // ดึงขนาน: ข้อมูล parent + แกลเลอรีจริงของ Parent (รูปหลักก่อน) + นับ SKU + รูป Description
    const [p, parentImages, skus, description] = await Promise.all([
      admin.from("parent_skus_v2").select("id, code, name_th").eq("id", parentId).maybeSingle().then((r) => r.data),
      galleryFor(admin, "parent_skus_v2", parentId, "parent_sku"),
      skuCounts(),
      usageGallery(admin, "parent_sku_description", parentId),
    ]);

    return NextResponse.json({
      parent: p ? { id: p.id, code: p.code, name: (p.name_th as string) ?? "" } : null,
      parentImages, skus, description, error: null,
    });
  }

  if (mode === "sku") {
    const skuId = sp.get("sku_id");
    if (!skuId) return NextResponse.json({ error: "missing sku_id" }, { status: 400 });
    const images = await galleryFor(admin, "skus_v2", skuId, "product_sku");
    return NextResponse.json({ images, error: null });
  }

  // รวมรูป "ทั้งหมด" ของ Parent (รูป Parent + ทุก SKU ลูก + Description) แบบแบน → ใช้ทำ zip ดาวน์โหลด
  if (mode === "all-images") {
    const parentId = sp.get("parent_id");
    if (!parentId) return NextResponse.json({ error: "missing parent_id" }, { status: 400 });

    const [{ data: p }, { data: skus }] = await Promise.all([
      admin.from("parent_skus_v2").select("code").eq("id", parentId).maybeSingle(),
      admin.from("skus_v2").select("id, code").eq("parent_sku_id", parentId).order("code"),
    ]);
    const skuList = (skus ?? []) as { id: string; code: string }[];

    const [parentImgs, descImgs, ...skuImgsArr] = await Promise.all([
      galleryFor(admin, "parent_skus_v2", parentId, "parent_sku"),
      usageGallery(admin, "parent_sku_description", parentId),
      ...skuList.map((s) => galleryFor(admin, "skus_v2", s.id, "product_sku")),
    ]);

    const clean = (t: string) => (t || "").replace(/[\\/:*?"<>|]+/g, "_").trim();
    const guessExt = (t: string) => (/\.[a-z0-9]{2,5}$/i.test(t || "") ? "" : ".jpg");   // เดานามสกุลถ้าชื่อไม่มี
    const pad = (i: number) => String(i + 1).padStart(2, "0");
    const out: { url: string; name: string }[] = [];
    parentImgs.forEach((im, i) => out.push({ url: im.url, name: `Parent/${pad(i)}_${clean(im.title) || "image"}${guessExt(im.title)}` }));
    skuList.forEach((s, si) => (skuImgsArr[si] ?? []).forEach((im, i) =>
      out.push({ url: im.url, name: `SKU_${clean(s.code)}/${pad(i)}_${clean(im.title) || "image"}${guessExt(im.title)}` })));
    descImgs.forEach((im, i) => out.push({ url: im.url, name: `Description/${pad(i)}_${clean(im.title) || "image"}${guessExt(im.title)}` }));

    return NextResponse.json({ images: out, code: (p as { code?: string } | null)?.code ?? "", error: null });
  }

  return NextResponse.json({ error: "bad mode" }, { status: 400 });
}

// ---- POST: บันทึกลำดับรูปในโฟลเดอร์ (per module + record_id) ----
const REORDER_MODULES = new Set(["parent_sku", "product_sku", "parent_sku_description"]);
export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "assets.edit");
  if (denied) return denied;
  let body: { module?: string; record_id?: string; ordered_asset_ids?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { module, record_id, ordered_asset_ids } = body;
  if (!module || !REORDER_MODULES.has(module) || !record_id || !Array.isArray(ordered_asset_ids))
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const admin = supabaseAdmin();
  for (let i = 0; i < ordered_asset_ids.length; i++) {
    const { error } = await admin.from("asset_usages").update({ sort_order: i })
      .eq("module", module).eq("record_id", record_id).eq("asset_id", ordered_asset_ids[i]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, error: null });
}
