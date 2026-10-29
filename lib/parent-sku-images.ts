/**
 * parent-sku-images — รวม "รูปทั้งหมดของ Parent SKU" ให้ตัวเลือกรูปกลาง (AssetPicker) ค้นเจอ (pure · ใช้ได้ทั้ง server/client)
 *
 * รูปของ Parent อยู่ 2 ที่ (เหมือนมุมมอง "ดูตามแบรนด์" ใน /api/assets/brand-tree):
 *   1. แกลเลอรีสินค้า  = erp_playground_attachments (entity_type parent_skus_v2 / skus_v2) — บางรูปยังไม่อยู่ในคลัง
 *   2. คลังกลาง        = asset_usages → assets (module parent_sku / product_sku / parent_sku_description)
 * ลำดับ: รูป Parent → รูป SKU ลูก (เรียงรหัส) → รูป Description · รูปเดียวกัน (r2_key ซ้ำ) โชว์ครั้งเดียว
 *
 * รูปที่ยังไม่อยู่ในคลัง ได้ id ชั่วคราว "att:<attachment id>" — ตอนกดใช้ ป๊อปอัปส่งไปลงคลังก่อน (POST /api/assets/parent-images)
 * ใช้ที่: app/api/assets/parent-images (ประกอบผล) · components/asset-picker (กล่อง "รูปจาก Parent SKU")
 */
import type { AssetRow } from "@/app/api/assets/shared";
import { scoreRow, tokenize } from "@/lib/search-score";

/** แหล่งของรูปภายใน Parent — ใช้ทำป้าย/ปุ่มกรองย่อย */
export type ParentImageGroup = "parent" | "sku" | "description";
export const PARENT_IMAGE_GROUP_LABEL: Record<ParentImageGroup, string> = { parent: "รูป Parent", sku: "รูป SKU ลูก", description: "รูป Description" };

/** รูปที่ยังไม่อยู่ในคลัง (มีแค่ในแกลเลอรีสินค้า) ใช้ id ขึ้นต้นนี้ */
export const PARENT_ATT_PREFIX = "att:";
export const isPendingParentImage = (id: string) => id.startsWith(PARENT_ATT_PREFIX);

export type ParentImageItem = { asset: AssetRow; group: ParentImageGroup; owner: string };
export type ParentImageHit = { id: string; code: string; name: string; is_active: boolean; items: ParentImageItem[] };

/** แถวแกลเลอรีสินค้า (erp_playground_attachments) */
export type GalleryAtt = {
  id: string; entity_type: string; entity_id: string; file_name: string | null; file_path: string;
  public_url: string | null; content_type: string | null; size_bytes: number | null; created_at: string;
};
/** แถว asset_usages ที่ join รูปในคลังแล้ว */
export type UsageImg = { module: string; record_id: string; asset: AssetRow };

export type ParentCandidate = { id: string; code: string; name: string; is_active: boolean; sku_codes?: string[] };

/**
 * จัดอันดับ Parent ที่ตรงคำค้น (มาตรฐานเดียวกับ picker ทั้งระบบ: รหัสเป๊ะ → ขึ้นต้น → มีคำค้น)
 * sku_codes = รหัส SKU ลูกที่ตรงคำค้น (ค้น "PIX22-03" แล้วเจอ Parent PIX22) · ตัวที่ยังใช้งานขึ้นก่อนเมื่อคะแนนเท่ากัน
 */
export function rankParentHits(search: string, rows: ParentCandidate[], limit: number): ParentCandidate[] {
  const toks = tokenize(search);
  return rows
    .map((r) => ({ r, s: scoreRow(search, toks, { code: r.code, texts: [r.name, ...(r.sku_codes ?? [])] }) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || Number(b.r.is_active) - Number(a.r.is_active) || a.r.code.localeCompare(b.r.code, "th"))
    .slice(0, limit)
    .map((x) => x.r);
}

/** แปลงรูปในแกลเลอรีสินค้าที่ยังไม่อยู่ในคลัง → AssetRow ชั่วคราว (เลือกได้เหมือนรูปในคลัง) */
export function pendingAssetRow(att: GalleryAtt, owner: string): AssetRow {
  const name = att.file_name?.trim() || att.file_path.split("/").pop() || "image";
  return {
    id: PARENT_ATT_PREFIX + att.id,
    title: `${owner} ${name}`.trim(),
    file_name: name,
    r2_key: att.file_path,
    url: att.public_url || `/api/r2-image?key=${encodeURIComponent(att.file_path)}`,
    asset_type: !att.content_type || att.content_type.startsWith("image/") ? "image" : att.content_type.startsWith("video/") ? "video" : "other",
    content_type: att.content_type, ext: null, size_bytes: att.size_bytes, width: null, height: null,
    description: null, collection_id: null, status: "active", trashed_at: null, uploaded_by: null, created_at: att.created_at,
    master_path: null, master_url: null, source: "odoo_product", print_type: null, print_items: [],
    artwork_type: null, artwork_types: [], keywords: null, sizes: [], parent_sku_codes: [], tags: [], usage_count: 0,
  };
}

/**
 * ประกอบรูปของ Parent 1 ตัว (เรียง + ตัดซ้ำ + กรองชนิด)
 * - atts: แกลเลอรีที่เรียงมาแล้ว (รูปหลักก่อน → sort_order) · usages: เรียงตาม sort_order มาแล้ว
 * - assetByKey: รูปในคลังตาม r2_key (รูปแกลเลอรีที่อยู่ในคลังแล้ว → ใช้ตัวในคลัง id จริง)
 */
export function assembleParentImages(args: {
  parent: { id: string; code: string };
  skus: { id: string; code: string }[];
  atts: GalleryAtt[];
  usages: UsageImg[];
  assetByKey: Map<string, AssetRow>;
  type?: string | null;
}): ParentImageItem[] {
  const { parent, skus, atts, usages, assetByKey, type } = args;
  const out: ParentImageItem[] = [];
  const seen = new Set<string>();
  const push = (asset: AssetRow, group: ParentImageGroup, owner: string) => {
    if (seen.has(asset.r2_key)) return;
    if (type && asset.asset_type !== type) return;
    seen.add(asset.r2_key);
    out.push({ asset, group, owner });
  };
  const addEntity = (entityType: string, module: string, id: string, owner: string, group: ParentImageGroup) => {
    for (const a of atts) if (a.entity_type === entityType && a.entity_id === id) push(assetByKey.get(a.file_path) ?? pendingAssetRow(a, owner), group, owner);
    for (const u of usages) if (u.module === module && u.record_id === id) push(u.asset, group, owner);
  };
  addEntity("parent_skus_v2", "parent_sku", parent.id, parent.code, "parent");
  for (const s of skus) addEntity("skus_v2", "product_sku", s.id, s.code, "sku");
  for (const u of usages) if (u.module === "parent_sku_description" && u.record_id === parent.id) push(u.asset, "description", parent.code);
  return out;
}
