/**
 * 🏷️ ระบบช่วยเดาแท็ก — กฎกลาง (pure · เทสต์ lib/__tests__/tag-suggest-rules.test.ts)
 *
 * เจ้าของเลือก 2026-11-15 (Tags Manager → "ระบบช่วยเดาแท็ก"): ระบบ "เสนอ" เท่านั้น คนกดยืนยันทีละกลุ่มก่อนบันทึก
 * ใช้ที่: app/api/product-tags/suggest (เดา + บันทึก) → components/tag-suggest (ป๊อป)
 *
 * กฎมี 2 แบบ
 *   1) ก๊อปจากข้อมูลที่มีอยู่แล้ว (แน่นอน) — แบรนด์/หมวดหมู่ของ Parent → แท็กชื่อเดียวกัน (matchTagByName / CATEGORY_TAG_ALIASES)
 *   2) เดาชนิดวัตถุดิบจาก รหัสนำหน้า / คำในชื่อ (MATERIAL_RULES · ตัวแรกที่ตรงชนะ เรียงจากเจาะจงไปกว้าง)
 *
 * คำอะไหล่ใช้รายการเดียวกับ Design Library (HW_WORDS ใน lib/design-library-hwtags) + คำเพิ่มที่นี่ — แก้คำอะไหล่ที่นั่นที่เดียว
 * กับดักที่เจอในข้อมูลจริง: "หนังยาง" ≠ หนัง · "ผ้าใบ…ด้ายขาว" ≠ ด้าย · "กรรไกรตัดด้าย"/"ถุงห่อด้าย" ≠ ด้าย · "ก้นกระเป๋า" = อะไหล่ ไม่ใช่สินค้าสำเร็จ
 * หัวซิป = แท็ก "ซิป" (ข้อมูลเดิม ZH ติด ซิป ทั้งหมด · กลุ่ม วัตถุดิบ เลือกได้ 1)
 */
import { HW_WORDS } from "@/lib/design-library-hwtags";

/** sure = ก๊อปจากข้อมูลที่มีอยู่ · high = รหัส/คำชัด กดยอมรับทั้งกลุ่มได้ · check = ควรเช็กทีละตัว · new = ต้องสร้างแท็กก่อน */
export type SuggestConf = "sure" | "high" | "check" | "new";

export type MaterialRule = {
  key: string;
  /** ชื่อแท็ก (product_families.name) */
  tag: string;
  conf: Exclude<SuggestConf, "sure">;
  /** คำอธิบายกฎแบบภาษาคน (โชว์หัวกลุ่ม) */
  label: string;
  /** ตัวอักษรนำหน้ารหัส (ก่อนตัวเลข/ขีดตัวแรก) ตรงทั้งคำ เช่น ZIP */
  prefixes?: string[];
  /** ชื่อขึ้นต้นด้วย */
  startsWith?: string[];
  /** มีคำนี้ในชื่อ */
  contains?: string[];
  /** มีคำนี้ในชื่อ = ข้ามกฎนี้ */
  except?: string[];
  /** รูปแบบในชื่อ (เมื่อคำเดียวกว้างเกินไป) — word = คำที่โชว์ในเหตุผล */
  patterns?: { re: RegExp; word: string }[];
};

/** คำอะไหล่เพิ่มจาก Design Library (เจอในข้อมูลจริง 2026-11-15) */
const HW_EXTRA = ["หัวเข็มขัด", "ตัวดี", "คอหมา", "กิ้ปหนีบ", "กระดุม", "นมหนู", "ก้นกระเป๋า", "ตัวเก็บสาย", "โซ่", "พู่ห้อย"];
export const HARDWARE_WORDS = [...new Set([...HW_WORDS, ...HW_EXTRA])];

export const MATERIAL_RULES: MaterialRule[] = [
  { key: "zip", tag: "ซิป", conf: "high", label: "รหัสขึ้นต้น ZIP / ZH · คำ “ซิป”", prefixes: ["ZIP", "ZH"], contains: ["ซิป"] },
  { key: "leather", tag: "หนัง", conf: "high", label: "รหัสขึ้นต้น LEA · ชื่อขึ้นต้น “หนัง” (ยกเว้น หนังยาง)", prefixes: ["LEA"], startsWith: ["หนัง"], except: ["หนังยาง"] },
  { key: "pu", tag: "PU", conf: "high", label: "คำ “พียู” หรือ (PU) · รหัสขึ้นต้น PU", prefixes: ["PU"], contains: ["พียู", "(PU)"] },
  { key: "thread", tag: "ด้าย", conf: "new", label: "ชื่อขึ้นต้น “ด้าย” · รหัส THREAD", prefixes: ["THREAD"], startsWith: ["ด้าย"] },
  { key: "tape", tag: "สาย/เทป", conf: "check", label: "คำ: สายเทป เชือก กุ้น", contains: ["สายเทป", "เทปไนล่อน", "เทปคอตตอน", "เทปทอ", "เชือก", "กุ้น"] },
  { key: "hardware", tag: "อะไหล่", conf: "high", label: "คำ: หัวเข็มขัด ห่วง ตัวดี กิ้ปหนีบ กระดุม ตาไก่ …", contains: HARDWARE_WORDS,
    patterns: [{ re: /^สี่เหลี่ยม\s*\d/, word: "สี่เหลี่ยม + ขนาด" }] },   // ห่วงสี่เหลี่ยม "สี่เหลี่ยม 3.3 cm." (ไม่จับ "ผ้าลายสี่เหลี่ยม")
  { key: "fabric", tag: "ผ้า", conf: "check", label: "ชื่อขึ้นต้น “ผ้า”", startsWith: ["ผ้า"] },
  { key: "stiffener", tag: "ตัวเสริม", conf: "check", label: "คำ: ฟองน้ำ กระดาษแข็ง", contains: ["ฟองน้ำ", "ตัวเสริม", "แผ่นเสริม", "กระดาษขาวแข็ง", "กระดาษแข็ง"] },
  { key: "packaging", tag: "บรรจุภัณฑ์", conf: "new", label: "คำ: กล่อง ถุง การ์ด สติกเกอร์ ป้าย", contains: ["กล่อง", "ถุง", "การ์ด", "สติกเกอร์", "สติ๊กเกอร์", "ป้าย", "ซองใส่"] },
  { key: "tools", tag: "อุปกรณ์", conf: "new", label: "คำ: กาว กรรไกร เข็มเย็บ สีทาขอบ", contains: ["กาว", "กรรไกร", "เข็มเย็บ", "สีสกรีน", "สีทาขอบ", "น้ำยา", "ละลาย", "มีด", "ค้อน"] },
  { key: "logo", tag: "โลโก้", conf: "new", label: "คำ “โลโก้”", contains: ["โลโก้"] },
];

/** ตัวอักษรนำหน้ารหัส (ตัวใหญ่) — "ZIP-N-NO.5#A604" → "ZIP" · "52196" → "" */
export function codePrefix(code: string | null | undefined): string {
  return (String(code ?? "").match(/^[A-Za-z]+/)?.[0] ?? "").toUpperCase();
}

/** ชื่อบอกว่าเป็นสินค้าสำเร็จรูป (ไม่เดาเป็นวัตถุดิบ) — ขึ้นต้น กระเป๋า/เข็มขัด หรือมีคำชัด ๆ · "ก้นกระเป๋า"/"หัวเข็มขัด" ไม่นับ */
export function looksFinishedProduct(name: string | null | undefined): boolean {
  const n = String(name ?? "").trim();
  if (!n) return false;
  if (/^(กระเป๋า|เข็มขัด)/.test(n) || /^(jacob|devy)/i.test(n)) return true;
  return ["เข็มขัดหนัง", "เข็มขัดสาย", "กระเป๋าสตางค์", "กระเป๋าใส่"].some((w) => n.includes(w));
}

export type MaterialGuess = { rule: MaterialRule; reason: string };

/** เดาแท็กชนิดวัตถุดิบจากรหัส + ชื่อ · ไม่ตรงกฎไหน / ดูเป็นสินค้าสำเร็จ = null */
export function suggestMaterial(code: string | null | undefined, name: string | null | undefined, rules: MaterialRule[] = MATERIAL_RULES): MaterialGuess | null {
  const n = String(name ?? "").trim();
  if (looksFinishedProduct(n)) return null;
  const lower = n.toLowerCase();
  const pfx = codePrefix(code);
  for (const r of rules) {
    if (r.except?.some((w) => lower.includes(w.toLowerCase()))) continue;
    if (pfx && r.prefixes?.includes(pfx)) return { rule: r, reason: `รหัสขึ้นต้น ${pfx}` };
    const sw = r.startsWith?.find((w) => lower.startsWith(w.toLowerCase()));
    if (sw) return { rule: r, reason: `ชื่อขึ้นต้น “${sw}”` };
    const hit = r.contains?.find((w) => lower.includes(w.toLowerCase()));
    if (hit) return { rule: r, reason: `เจอคำ “${hit}”` };
    const pat = r.patterns?.find((p) => p.re.test(n));
    if (pat) return { rule: r, reason: `เจอ “${pat.word}”` };
  }
  return null;
}

/** ชื่อเทียบกันได้ — ตัดช่องว่าง/ตัวพิมพ์ และพินทุ (U+0E3A) ที่หลุดหน้าชื่อ เช่นกลุ่ม "ฺBrands" */
export function normName(s: string | null | undefined): string {
  return String(s ?? "").replace(/ฺ/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** หมวดหมู่ (product_categories.name) ที่สะกดต่างจากชื่อแท็ก */
export const CATEGORY_TAG_ALIASES: Record<string, string> = { jelwery: "จิวเวลรี", jewelry: "จิวเวลรี", jewellery: "จิวเวลรี" };

/** หาแท็กที่ชื่อตรงกับชื่อนี้ (แบรนด์/หมวด) จากรายการแท็กที่ยอมให้ใช้ · ไม่เจอ = null */
export function matchTagByName<T extends { name: string }>(name: string | null | undefined, tags: T[], aliases: Record<string, string> = {}): T | null {
  const k = normName(name);
  if (!k) return null;
  const want = normName(aliases[k] ?? k);
  return tags.find((t) => normName(t.name) === want) ?? null;
}
