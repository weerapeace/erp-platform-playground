/**
 * 🏷️ แท็ก → หมวดบนเว็บ (กฎกลาง · ไฟล์ pure ใช้ได้ทั้งหน้าจอและ API)
 *
 * เก็บที่ shops.field_map.category.tagRules = { [tag_id]: <รหัสหมวดเว็บ> } (ต่อร้าน เพราะแต่ละร้านมีหมวดไม่เหมือนกัน)
 * แก้ได้ 2 ที่ ข้อมูลชุดเดียวกัน: ป๊อป 🔗 ของแท็ก (components/tag-usage) · ตารางกฎในหน้าจัดเว็บ (components/website-tag-category-rules)
 *
 * กฎที่เจ้าของเลือก (2026-10-18):
 *   1. ติดหลายแท็ก = อยู่ทุกหมวดที่ตรง · แท็กย่อยเป็นหมวดหลัก (แท็กลึกกว่ามาก่อน แล้วค่อยตามลำดับกฎ)
 *   2. กฎแท็กมาก่อนกฎหมวด ERP (field_map.category.rules) และหมวดตั้งต้นของร้าน
 *   3. รุ่นที่จัดหมวดเองแล้ว (web_categories เป็น array / web_category) ไม่เปลี่ยนเอง
 *      → ปุ่ม "ใส่หมวดให้รุ่นที่มีอยู่" = เพิ่มหมวดอย่างเดียว ไม่ลบของเดิม (addCategories)
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isTagId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export const MAX_TAG_RULES = 300;

/** ทำความสะอาดกฎจาก DB/หน้าจอ: key ต้องเป็นรหัสแท็ก · หมวดต้องยังมีอยู่ในร้าน (ลบหมวดแล้วกฎเก่าไม่ค้าง) */
export function cleanTagRules(raw: unknown, catKeys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [tag, key] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_TAG_RULES)) {
    if (isTagId(tag) && typeof key === "string" && catKeys.includes(key)) out[tag] = key;
  }
  return out;
}

/**
 * หมวดเว็บของสินค้าจากแท็กที่ติด — เรียง: แท็กลึกกว่า (แท็กย่อย) ก่อน → ตามลำดับกฎ · ไม่ซ้ำ
 * depthOf(tagId) = จำนวนชั้นแท็กแม่ (0 = แท็กชั้นบน · 1 = แท็กย่อย) จาก lib/tag-hierarchy
 */
export function tagRuleCategories(rules: Record<string, string>, tagIds: string[], depthOf: (tagId: string) => number): string[] {
  const order = Object.keys(rules);
  const matched = [...new Set(tagIds)].filter((t) => rules[t]);
  matched.sort((a, b) => depthOf(b) - depthOf(a) || order.indexOf(a) - order.indexOf(b));
  return [...new Set(matched.map((t) => rules[t]))];
}

/** เพิ่มหมวดให้รุ่นที่จัดไว้แล้ว (ไม่ลบ/ไม่สลับของเดิม · ว่าง = หมวดใหม่ตัวแรกเป็นหมวดหลัก) — null = ไม่มีอะไรเพิ่ม */
export function addCategories(existing: readonly string[] | null | undefined, add: readonly string[]): string[] | null {
  const base = [...(existing ?? [])];
  const missing = add.filter((k, i) => !base.includes(k) && add.indexOf(k) === i);
  return missing.length ? [...base, ...missing] : null;
}

/** รุ่นนี้ "จัดหมวดเองแล้ว" ไหม (กฎแท็กจะไม่เปลี่ยนให้เอง) */
export function hasManualCategories(listing: { web_categories?: unknown; web_category?: unknown } | null | undefined): boolean {
  if (!listing) return false;
  return Array.isArray(listing.web_categories) || String(listing.web_category ?? "").trim() !== "";
}
