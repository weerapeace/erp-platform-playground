/**
 * ร้านที่แบรนด์ "สั่งซ่อน" ในแท็บแพลตฟอร์มของ Parent SKU (pure + เทสต์ lib/__tests__/listing-hidden-platforms.test.ts)
 * --------------------------------------------------------------------------
 * เจ้าของขอ 2026-11-15: "บางอันไม่มีร้านเช่น Instagram อยากให้ซ่อนได้" — ตั้งครั้งเดียวต่อแบรนด์ ทุกสินค้าของแบรนด์นั้นซ่อนแถวร้านนั้น
 *   (Instagram เชื่อมไว้เพื่อโพสต์คอนเทนต์ → ระบบนับว่า "เชื่อมแล้ว" ซ่อนอัตโนมัติไม่ได้)
 * เก็บที่ ui_config(key = LISTING_HIDDEN_KEY) = { [brand_id]: platform_code[] } — ไม่ต้องแก้โครงตาราง
 * อ่าน: lib/product-listing-context (hiddenPlatformCodes) · เขียน: PATCH /api/product-platforms { set_platform_hidden }
 * กฎแบ่งแถว (ซ่อน/โชว์ · ของที่ขายอยู่ห้ามหาย) = lib/platform-visibility
 * ห้าม import "@/..." (ใช้ได้ทั้งหน้าเว็บ/หลังบ้าน/เทสต์)
 */

export const LISTING_HIDDEN_KEY = "listing_hidden_platforms";
export type HiddenPlatformMap = Record<string, string[]>;

/** อ่านค่าจาก ui_config แบบปลอดภัย (ค่าเสีย/ไม่มี = ว่าง) */
export function normalizeHiddenMap(v: unknown): HiddenPlatformMap {
  const out: HiddenPlatformMap = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [brand, codes] of Object.entries(v as Record<string, unknown>)) {
    if (!brand || !Array.isArray(codes)) continue;
    const list = [...new Set(codes.map((c) => String(c ?? "").trim()).filter(Boolean))];
    if (list.length) out[brand] = list;
  }
  return out;
}

export const hiddenCodesOf = (map: HiddenPlatformMap, brandId: string | null | undefined): string[] =>
  brandId ? map[brandId] ?? [] : [];

/** ซ่อน/เลิกซ่อน 1 ร้านของ 1 แบรนด์ → map ใหม่ (ไม่แก้ตัวเดิม · แบรนด์ที่ไม่เหลือร้านซ่อน = ลบคีย์ทิ้ง) */
export function setPlatformHidden(map: HiddenPlatformMap, brandId: string, code: string, hidden: boolean): HiddenPlatformMap {
  const next: HiddenPlatformMap = { ...map };
  const cur = new Set(next[brandId] ?? []);
  if (hidden) cur.add(code); else cur.delete(code);
  if (cur.size) next[brandId] = [...cur]; else delete next[brandId];
  return next;
}
