/** ของใช้ร่วมของ /api/content-albums/* (แยกจาก route.ts — route ต้อง export แค่ handler) */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
export const uuidList = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter(isUuid))] : []);
export const codeList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x ?? "").trim()).filter((s) => /^[a-z0-9_-]{1,40}$/i.test(s)))] : [];

/**
 * ตรวจ + ทำความสะอาดช่องของอัลบั้ม (ใช้ทั้งสร้างและแก้) — คืน { patch } หรือ { error } เป็นภาษาคน
 * ส่งมาเฉพาะช่องที่จะเปลี่ยน · ช่องที่ไม่ส่ง = ไม่แตะ
 */
export function cleanAlbumFields(body: Record<string, unknown>): { album: Record<string, unknown>; collection: Record<string, unknown> } | { error: string } {
  const album: Record<string, unknown> = {};
  const collection: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return { error: "ต้องมีชื่ออัลบั้ม" };
    if (name.length > 120) return { error: "ชื่ออัลบั้มยาวเกิน 120 ตัวอักษร" };
    collection.name = name;
  }
  if (body.description !== undefined) collection.description = String(body.description ?? "").trim() || null;
  if (body.brand_id !== undefined) {
    if (body.brand_id && !isUuid(body.brand_id)) return { error: "แบรนด์ไม่ถูกต้อง" };
    album.brand_id = body.brand_id || null;
  }
  if (body.assignee_ids !== undefined) album.assignee_ids = uuidList(body.assignee_ids);
  if (body.due_date !== undefined) {
    const d = String(body.due_date ?? "").trim();
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: "วันที่ต้องลงไม่ถูกต้อง" };
    album.due_date = d || null;
  }
  if (body.planned_platforms !== undefined) album.planned_platforms = codeList(body.planned_platforms);
  if (body.caption_draft !== undefined) album.caption_draft = String(body.caption_draft ?? "").trim() || null;
  if (body.picked_asset_ids !== undefined) album.picked_asset_ids = uuidList(body.picked_asset_ids);
  if (body.file_order !== undefined) album.file_order = uuidList(body.file_order).slice(0, 2000);
  if (body.parent_sku_codes !== undefined) {
    album.parent_sku_codes = Array.isArray(body.parent_sku_codes) ? [...new Set(body.parent_sku_codes.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, 50) : [];
  }
  if (body.cover_asset_id !== undefined) {
    if (body.cover_asset_id && !isUuid(body.cover_asset_id)) return { error: "รูปปกไม่ถูกต้อง" };
    collection.cover_asset_id = body.cover_asset_id || null;
  }
  if (body.closed !== undefined) album.closed_at = body.closed ? new Date().toISOString() : null;
  return { album, collection };
}
