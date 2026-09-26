/**
 * รูปปก SKU (ของกลาง) — "ไม่มีรูปของตัวเอง → ใช้รูปของ Parent SKU แทน"
 *
 * ทุก API ที่ join skus_v2 เพื่อเอารูปปกไปโชว์ (รับของ / สั่งซื้อ / ขอซื้อ / ประวัติ) ให้ใช้ชุดนี้
 *   select: `id, code, ${SKU_COVER_SELECT}`            ← ดึง cover ตัวเอง + cover ของ parent มาพร้อมกัน (embed ผ่าน FK parent_sku_id)
 *   แล้ว   const { key, fromParent } = resolveSkuCover(row)  ← ได้ r2 key ที่ควรใช้ + ธงว่าเป็นรูปตัวแม่
 *   แล้ว   coverUrl(key)                                   ← แปลงเป็น URL /api/r2-image
 *
 * ห้ามเขียน "own || parent" ซ้ำเองในแต่ละ API — แก้ที่นี่ที่เดียว
 */

export const SKU_COVER_SELECT = "cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key )";

export type SkuCover = { key: string | null; fromParent: boolean };

/** เลือกรูปปก: ของตัวเองก่อน ไม่มีค่อยใช้ของ parent */
export function resolveSkuCover(row: Record<string, unknown> | null | undefined): SkuCover {
  if (!row) return { key: null, fromParent: false };
  const own = String(row.cover_image_r2_key ?? "").trim();
  if (own) return { key: own, fromParent: false };
  const raw = row.parent_skus_v2;
  const par = (Array.isArray(raw) ? raw[0] : raw) as { cover_image_r2_key?: string | null } | null | undefined;
  const pk = String(par?.cover_image_r2_key ?? "").trim();
  return pk ? { key: pk, fromParent: true } : { key: null, fromParent: false };
}

/** r2 key → URL ที่ <img> ใช้ได้ (null เมื่อไม่มีรูป) */
export function coverUrl(key: string | null | undefined): string | null {
  return key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null;
}
