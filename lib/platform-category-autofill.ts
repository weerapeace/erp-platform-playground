/**
 * เดา "หมวดของแต่ละร้าน" ให้หมวดกลาง (ปุ่ม "ใส่ให้เอง (ไม่เสียเงิน)" ในหน้าจับคู่หมวดหมู่แพลตฟอร์ม) — ของกลาง · pure ไม่แตะ DB · ไม่ใช้ AI
 *
 * เจ้าของเลือก 2026-11-20 (ข้อเสนอ 1-4):
 *   1. ใช้หมวดที่ร้านอื่นจับไว้แล้วช่วยเดา — เช่น Shopee "กระเป๋าผู้หญิง > กระเป๋าถือ" → เอาไปหาใน TikTok
 *   2. ติ๊กให้ก่อนเฉพาะ "มั่นใจสูง" (high) · "ควรเช็ก" (check) ไม่ติ๊ก
 *   3. แต่ละช่องมีตัวเลือกสำรอง 2-3 อัน
 *   4. ไม่เดาไปโดนหมวดทดสอบขยะ (Test Product… / การทดสอบ…)
 * เทียบชื่อด้วยของกลาง lib/text-similarity (คู่ตัวอักษร · ตัวเดียวกับเดาคู่สินค้าบนร้าน) — ห้ามสร้างตัวเทียบตัวที่ 2
 * เดาเฉพาะช่องที่ "ยังว่าง" — ช่องที่ตั้งไว้แล้วไม่แตะ (ผู้เรียกส่งมาเฉพาะช่องว่าง)
 *
 * คะแนน 0..1 ต่อหมวดของร้าน = ค่ามากสุดจากคำค้นทุกตัว:
 *   - ชื่อหมวดกลาง (ไทย / อังกฤษ แยกกัน) เทียบใบสุด — ยอมให้ "คำสั้นอยู่ในชื่อยาว" ("เข็มกลัด" ⊂ "คลิปติดปกเสื้อและเข็มกลัด")
 *   - คำพ้อง ×0.9 (ไม่ใช้กับหมวดวัตถุดิบ/อะไหล่ เช่น "อะไหล่…เข็มขัด" ต้องไม่ไปได้ "Belts")
 *   - หมวดที่ร้านอื่นจับไว้ ×0.9 แบบ Dice ล้วน (กันคำทั่วไป "อุปกรณ์เสริม"/"ของตกแต่ง" ได้คะแนนเต็ม)
 *   - หมวดสินค้ามือสอง/เด็ก ×0.8 (ยกเว้นหมวดกลางพูดถึงเอง)
 *   เสมอกัน → ตัวที่ทั้ง path คล้ายหมวดของร้านอื่นมากกว่า → path สั้นกว่า
 */
import { bigramCounts, bigramDice, bigramSimilarity, type Bigrams } from "@/lib/text-similarity";

export type AutofillOption = { value: string; label: string };
export type AutofillCandidate = AutofillOption & { score: number };
export type AutofillConfidence = "high" | "check";
export type AutofillSuggestion = { candidates: AutofillCandidate[]; confidence: AutofillConfidence; reason: string };

/** คะแนนตั้งแต่นี้ = มั่นใจสูง (ติ๊กให้ก่อน) · ต่ำกว่า MIN = ไม่เสนอ */
export const AUTOFILL_HIGH = 0.8;
export const AUTOFILL_MIN = 0.5;
const ALT_COUNT = 3;

/** หมวดทดสอบ/ขยะที่ร้านใส่มา — ไม่เอามาเสนอ (ไม่ลบข้อมูล) */
export function isJunkCategory(label: string): boolean {
  return /test\s*product|การทดสอบ|^test\b|\btest\s*category/i.test(label);
}

/** หมวดกลางที่เป็นวัตถุดิบ/อะไหล่/เครื่องมือ — คำพ้องของสินค้าสำเร็จ (กระเป๋า/เข็มขัด) ไม่ใช้ */
const SUPPLY_RE = /อะไหล่|อุปกรณ์|วัตถุดิบ|เครื่องมือ|บรรจุภัณฑ์|น้ำยา|สีทา/;
/** หมวดที่ไม่ควรเลือกถ้าไม่ได้ตั้งใจ */
const OFF_RE = /^(สินค้ามือสอง|kids'?|เด็ก|คุณแม่และเด็ก)/i;

/** ใบสุดคำกลาง ๆ ที่มีในหลายหมวดแม่ — ร้านอื่นจับใบแบบนี้ ต้องเทียบทั้ง path (ไม่งั้น "อุปกรณ์เสริม" ไปโดนเครื่องใช้ไฟฟ้า) */
const GENERIC_LEAF_RE = /^(อุปกรณ์เสริม|อุปกรณ์|ของตกแต่ง|อื่น\s*ๆ|others?|accessories|misc)$/i;

/** คำพ้องไทย↔อังกฤษ ของหมวดที่ร้านเราขาย — ช่วยร้านที่ใช้หมวดอังกฤษ (เว็บ) หรือหมวดกลางชื่ออังกฤษ */
const SYNONYMS: [RegExp, string][] = [
  [/handbag/i, "กระเป๋าถือ"], [/กระเป๋าถือ/, "handbags"],
  [/belt/i, "เข็มขัด"], [/เข็มขัด/, "belts"],
  [/brooch/i, "เข็มกลัด"], [/เข็มกลัด/, "brooch pins"],
  [/wallet/i, "กระเป๋าสตางค์"], [/กระเป๋าสตางค์/, "wallets"],
  [/card\s*holder/i, "กระเป๋าใส่บัตร"], [/ใส่บัตร|นามบัตร/, "card holders"],
];

/** ใบสุดของ path ("A > B > C" → "C") · ตัดรหัสนำหน้า "12345 · " ออก */
export function leafOf(path: string): string {
  const s = stripCode(path);
  const parts = s.split(">").map((x) => x.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}
function stripCode(path: string): string {
  return String(path ?? "").replace(/^\s*[\w-]+\s*·\s*/, "");
}

type Query = { text: string; bg: Bigrams; full?: Bigrams; kind: "central" | "synonym" | "other" };

/** คำค้น: ชื่อหมวดกลาง (ทั้งก้อน/ไทย/อังกฤษ) + คำพ้อง + (ข้อ 1) หมวดที่ร้านอื่นจับไว้แล้ว */
export function buildQueries(centralName: string, otherPaths: string[]): Query[] {
  const out: Query[] = [];
  const add = (text: string, kind: Query["kind"], full?: string) => {
    const t = text.trim();
    if (t) out.push({ text: t, bg: bigramCounts(t), full: full ? bigramCounts(full) : undefined, kind });
  };
  add(centralName, "central");
  const th = centralName.replace(/[A-Za-z()]+/g, " ").replace(/\s+/g, " ").trim();
  const en = centralName.replace(/[^A-Za-z\s]+/g, " ").replace(/\s+/g, " ").trim();
  if (th && th !== centralName) add(th, "central");
  if (en && en !== centralName) add(en, "central");
  if (!SUPPLY_RE.test(centralName)) for (const [re, syn] of SYNONYMS) if (re.test(centralName)) add(syn, "synonym");
  for (const p of otherPaths) {
    const leaf = leafOf(p);
    add(GENERIC_LEAF_RE.test(leaf) ? stripCode(p) : leaf, "other", stripCode(p));
  }
  return out;
}

type Prepared = { opt: AutofillOption; leaf: Bigrams; full: Bigrams; off: boolean };

/** เตรียมตัวเลือกของร้านไว้ครั้งเดียว (ใช้ซ้ำทุกหมวดกลาง) · ตัดหมวดขยะทิ้ง (ข้อ 4) */
export function prepareOptions(options: AutofillOption[]): Prepared[] {
  return options
    .filter((o) => o.value && o.label && !isJunkCategory(o.label))
    .map((o) => ({ opt: o, leaf: bigramCounts(leafOf(o.label)), full: bigramCounts(stripCode(o.label)), off: OFF_RE.test(stripCode(o.label)) }));
}

const REASON: Record<Query["kind"], string> = { central: "ชื่อตรงกับหมวดกลาง", synonym: "คำพ้อง (ไทย/อังกฤษ)", other: "เหมือนที่ร้านอื่นจับไว้" };

/** เดาหมวดของร้านหนึ่งให้หมวดกลางหนึ่ง → null = เดาไม่ได้ */
export function suggestFor(centralName: string, otherPaths: string[], prepared: Prepared[]): AutofillSuggestion | null {
  const qs = buildQueries(centralName, otherPaths);
  const others = qs.filter((q) => q.full);
  const allowOff = OFF_RE.test(centralName) || /เด็ก|มือสอง/.test(centralName);
  const scored: (AutofillCandidate & { kind: Query["kind"]; ctx: number })[] = [];
  for (const p of prepared) {
    let best = 0;
    let kind: Query["kind"] = "central";
    for (const q of qs) {
      let s: number;
      if (q.kind === "other") s = 0.9 * Math.max(bigramDice(q.bg, p.leaf), q.full ? bigramDice(q.full, p.full) : 0);
      else s = (q.kind === "synonym" ? 0.9 : 1) * Math.max(bigramSimilarity(q.bg, p.leaf), 0.85 * bigramSimilarity(q.bg, p.full));
      if (s > best) { best = s; kind = q.kind; }
    }
    if (p.off && !allowOff) best *= 0.8;
    if (best < AUTOFILL_MIN) continue;
    const ctx = others.reduce((m, q) => Math.max(m, bigramDice(q.full as Bigrams, p.full)), 0);
    scored.push({ ...p.opt, score: Math.round(best * 100) / 100, kind, ctx });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score || b.ctx - a.ctx || a.label.length - b.label.length);
  const top = scored.slice(0, ALT_COUNT);
  return {
    candidates: top.map(({ value, label, score }) => ({ value, label, score })),
    confidence: top[0].score >= AUTOFILL_HIGH ? "high" : "check",
    reason: REASON[top[0].kind],
  };
}
