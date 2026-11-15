/**
 * 📚 Design Library — เสนอแท็กอะไหล่จากชื่อ SKU (รอบ 7 · pure · เทสต์ lib/design-library-hwtags.test.ts)
 * ข้อมูลจริง 2026-11-14: แท็ก "อะไหล่" มี SKU แค่ 2 ตัว แต่ชื่อเหมือนอะไหล่ ~870 ตัว → ป๊อปเลือกอะไหล่ตามแท็กเกือบว่าง
 * ระบบ "เสนอ" เท่านั้น — คนติ๊กยืนยันก่อนบันทึก (app/api/design-library/hw-tags)
 * แท็กย่อยอยู่ในกลุ่มแท็ก "อะไหล่" (ใต้ วัตถุดิบ) → trigger roll-up ติดแท็กพ่อ "อะไหล่" ให้เอง (เหมือนกลุ่ม "ซิป")
 * 2026-11-15 (เจ้าของเลือก): หัวซิป/ของที่มีคำ "ซิป" = แท็ก "ซิป" ไม่ใช่อะไหล่ (ข้อมูลเดิม ZH ติด ซิป · กลุ่ม วัตถุดิบ เลือกได้ 1)
 *   คำอะไหล่ชุดนี้ใช้ร่วมกับ "ระบบช่วยเดาแท็ก" (lib/tag-suggest-rules → HARDWARE_WORDS) — แก้คำอะไหล่ที่นี่ที่เดียว
 */
export const HW_PARENT = "อะไหล่";
export const HW_PARENT_GROUP = "วัตถุดิบ";

/** แท็กย่อย + คำในชื่อที่บอกว่าเป็นอะไหล่ชนิดนั้น (เรียงจากเจาะจงไปกว้าง — ตัวแรกที่ตรงชนะ) */
export const HW_TAG_RULES: { tag: string; words: string[] }[] = [
  { tag: "หัวเข็มขัด", words: ["หัวเข็มขัด"] },
  { tag: "ตาไก่", words: ["ตาไก่"] },
  { tag: "ตีนเป็ด", words: ["ตีนเป็ด"] },
  { tag: "กระดุมแป๊ก", words: ["แป๊ก", "แป็ก", "แป้ก", "กระดุม"] },
  { tag: "ตัวล็อก", words: ["ตัวล็อค", "ตัวล็อก", "ล็อค", "ล็อก"] },
  { tag: "ตะขอ / ก้ามปู", words: ["ก้ามปู", "ตะขอ"] },
  { tag: "ตัวปรับสาย", words: ["ตัวปรับ", "ปรับสาย", "เลื่อนสาย"] },
  { tag: "หมุด", words: ["หมุด"] },
  { tag: "ห่วง", words: ["ห่วง"] },
];
export const HW_WORDS = [...new Set(HW_TAG_RULES.flatMap((r) => r.words))];

/** แท็กย่อยที่เสนอจากชื่อ · ไม่ตรงคำไหนเลย = null */
export function suggestHwTag(name: string | null | undefined): string | null {
  const n = String(name ?? "").toLowerCase();
  if (!n || n.includes("ซิป")) return null;   // ของซิป → แท็ก "ซิป" (ไม่ใช่อะไหล่)
  return HW_TAG_RULES.find((r) => r.words.some((w) => n.includes(w.toLowerCase())))?.tag ?? null;
}

/** คำในชื่อที่บอกว่าเป็นสินค้าสำเร็จรูป ไม่ใช่อะไหล่ (เช่น "กระเป๋าสะพายห่วงทอง") */
const FINISHED_WORDS = ["กระเป๋า", "เข็มขัดหนัง", "กล่องของขวัญ"];
export const looksFinished = (name: string | null | undefined) => FINISHED_WORDS.some((w) => String(name ?? "").includes(w));
