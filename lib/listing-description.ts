/**
 * เลือกรายละเอียดที่จะส่งร้าน — ของกลาง (pure · ใช้ร่วม Shopee · Lazada · LINE · TikTok)
 *
 * ลำดับ: ร่างที่ "คนแก้เอง" → Platform Description สด (ตัวเดียวกับป๊อป Parent SKU) → คอลัมน์ platform_description → รายละเอียดสินค้า
 * ร่างที่ "เป็นสำเนา" = ตัวเตรียมร่างคัดลอกมาเอง (ไม่ใช่ที่คนแก้) → ไม่นับ ใช้ค่าล่าสุดแทน
 *   สำเนา = ตรงกับ คอลัมน์ตอนนี้ / รายละเอียดสินค้า / ค่าสด / **ค่าเก่าของคอลัมน์** (ประวัติเวอร์ชัน)
 * ทำไมต้องดูค่าเก่า (เจอ 2026-11-21): ระบบเขียนค่าล่าสุดลงคอลัมน์ (lib/parent-computed-sync) → ร่างที่เคยคัดลอกค่าเก่าไว้
 *   ไม่ตรงกับคอลัมน์ใหม่แล้ว จึงถูกนับว่า "แก้เอง" และส่งข้อความเก่า (LY22 ร่าง Lazada/Shopee · ร่าง LINE BSD14/BSD15/JEAN08)
 *   → ผู้เรียกโหลด platform_description_history = loadFieldHistoryValues(admin, "parent_skus_v2", id, "platform_description") (lib/field-history)
 *   + description_history = loadFieldHistoryValues(…, "description") — เจอ 2026-11-22 BSAC008: ร่าง Lazada/LINE เก็บ "รายละเอียดสินค้า" เวอร์ชันเก่า (2 บรรทัด)
 *     ถูกนับว่าแก้เอง → ชนะ Platform Description 1,499 ตัวอักษร
 */

const normDesc = (s: string) => s.replace(/\s+/g, " ").trim();

export type ListingDescriptionSource = {
  platform_description: string | null;
  description: string | null;
  /** Platform Description สด (loadParentComputedTexts) — ไม่ส่ง = ใช้คอลัมน์ */
  platform_description_live?: string | null;
  /** ค่าเก่าของคอลัมน์ platform_description (ประวัติเวอร์ชัน) — ร่างที่ตรงกับค่าเหล่านี้ = สำเนาเก่า */
  platform_description_history?: string[] | null;
  /** ค่าเก่าของช่อง description (รายละเอียดสินค้า · ประวัติเวอร์ชัน) — ร่างที่ตรงค่าเหล่านี้ = สำเนาเก่า (เจอ 2026-11-22 BSAC008) */
  description_history?: string[] | null;
};

/** ร่างนี้คนแก้เองไหม (ไม่ตรงกับสำเนาใด ๆ) */
export function isEditedListingDescription(draftDesc: string, p: ListingDescriptionSource): boolean {
  if (!draftDesc.trim()) return false;
  const d = normDesc(draftDesc);
  const copies = new Set([p.platform_description, p.description, p.platform_description_live, ...(p.platform_description_history ?? []), ...(p.description_history ?? [])]
    .map((x) => normDesc(String(x ?? ""))).filter(Boolean));
  return !copies.has(d);
}

export function pickListingDescription(draftDesc: string, p: ListingDescriptionSource, platformName: string): { text: string; src: string } {
  // ตัดช่องว่างหัว-ท้าย (สูตรขึ้นต้นด้วย "  " ทุกรุ่น — Lazada แปลงเป็น &nbsp; หน้าข้อความ)
  const live = String(p.platform_description_live ?? "").trim(), stored = String(p.platform_description ?? "").trim(), main = String(p.description ?? "").trim();
  if (isEditedListingDescription(draftDesc, p)) return { text: draftDesc, src: `แก้ไว้สำหรับ ${platformName}` };
  if (live) return { text: live, src: "Platform Description ของ Parent SKU" };
  if (stored) return { text: stored, src: p.platform_description_live === undefined ? "Platform Description ของ Parent SKU" : "รายละเอียดสำหรับแพลตฟอร์ม (ค่าที่เก็บไว้)" };
  if (main) return { text: main, src: "รายละเอียดสินค้า" };
  return { text: "", src: "ยังไม่มีรายละเอียด" };
}
