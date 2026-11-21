/**
 * เลือกชื่อสินค้าที่จะส่งร้าน — ของกลาง (pure) · คู่กับ lib/listing-description (กติกาเดียวกัน)
 *
 * ลำดับ: ร่างที่ "คนแก้เอง" → ชื่อสำหรับแพลตฟอร์ม (name_platform) → ชื่อสินค้า (name_th)
 * ร่างที่ "เป็นสำเนา" = ตรงกับชื่อตอนนี้ หรือ **ชื่อเวอร์ชันเก่า** (ประวัติเวอร์ชัน) → ไม่นับ ใช้ชื่อล่าสุดแทน
 * ทำไม (เจอ 2026-11-21 LY22): ร่าง Shopee/Lazada คัดลอกชื่อไว้ตอนเตรียม → ต่อมาแก้ชื่อสินค้าเป็น "…พร้อมพวงกุญแจ LY22"
 *   ร่างยังเก็บชื่อเก่า และตัวเตรียมข้อมูลถือว่าร่างชนะเสมอ → เช็ก "ตรงกับระบบ" ไม่จับว่าชื่อบนร้านเก่า
 * ผู้เรียกโหลดประวัติด้วย loadFieldHistoryValues(admin, "parent_skus_v2", id, "name_th" | "name_platform") (lib/field-history)
 * ใช้: lib/platform-listing-drift-server (เทียบกับระบบ) · ตัวเตรียมข้อมูลของแต่ละร้านนำไปใช้ได้ (แทน dTitle || namePf || nameTh)
 * ห้าม import "@/..." ที่นี่
 */

const norm = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();

export type ListingTitleSource = {
  name_platform: string | null;
  name_th: string | null;
  /** ชื่อเวอร์ชันเก่าของ name_th / name_platform (ประวัติเวอร์ชัน) — ร่างที่ตรงกับค่าเหล่านี้ = สำเนาเก่า */
  name_history?: string[] | null;
};

/** ชื่อในร่างนี้คนแก้เองไหม (ไม่ตรงกับชื่อตอนนี้หรือชื่อเวอร์ชันเก่า) */
export function isEditedListingTitle(draftTitle: string | null | undefined, p: ListingTitleSource): boolean {
  const d = norm(draftTitle);
  if (!d) return false;
  const copies = new Set([p.name_platform, p.name_th, ...(p.name_history ?? [])].map(norm).filter(Boolean));
  return !copies.has(d);
}

export function pickListingTitle(draftTitle: string | null | undefined, p: ListingTitleSource, platformName: string): { text: string; src: string } {
  const pf = norm(p.name_platform), th = norm(p.name_th);
  if (isEditedListingTitle(draftTitle, p)) return { text: norm(draftTitle), src: `แก้ไว้สำหรับ ${platformName}` };
  if (pf) return { text: pf, src: "ชื่อสำหรับแพลตฟอร์ม" };
  if (th) return { text: th, src: "ชื่อสินค้า" };
  return { text: "", src: "ยังไม่มีชื่อ" };
}
