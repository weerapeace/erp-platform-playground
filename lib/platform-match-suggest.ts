/**
 * เดาคู่ "สินค้าบนร้าน" ↔ "สินค้าในระบบ (Parent SKU)" — ของกลาง · pure ไม่แตะ DB
 *
 * ใช้ในหน้า สินค้าบนแพลตฟอร์ม (การ์ด "ระบบเดาให้" + โหมดจับคู่ทีละตัว) ใช้ได้ทุกร้าน
 * ⚠️ แค่ "เสนอ" — ทุกคู่ต้องมีคนกดยืนยัน ระบบไม่ผูกเอง (ผูกผิด = ส่งสต๊อก/ราคาผิดตัว)
 *
 * ลำดับความมั่นใจ (คะแนน 0-100):
 *   100 รหัส SKU บนร้านตรงกับรหัสในระบบเป๊ะ (ไม่สนตัวเล็ก/ใหญ่)
 *    95 รหัสตรงเมื่อตัดขีด/เว้นวรรค/วงเล็บ    PIN6 = PIN-6 · IG-EQ008 = "IG-EQ008 (ที่ง้างโซ่)"
 *    90 รหัสท้ายชื่อสินค้าตรง                   "…1 ชิ้น DH12" → DH12 (ไฟล์ Shopee หลายตัวไม่มีช่อง SKU)
 *    75 มีรหัสนี้อยู่ในชื่อสินค้า (คำอื่น)
 *    60 รหัสขึ้นต้นเหมือนกัน                     LHP-SET → LHP · TTN32 → TTN
 *  34-55 ชื่อคล้ายกัน (เทียบคู่ตัวอักษร)       ใช้ตอนไม่มีรหัสช่วย · ตัดชื่อแบรนด์ทั้งสองฝั่งก่อนเทียบ
 * รหัสสั้น ≤2 ตัว (PT, CE, CM) หัก 20 เพราะบังเอิญตรงคำในชื่อได้ง่าย
 * ตัวซ้ำ (_DUP_) ไม่เอามาเสนอ — ควรจับคู่กับตัวจริง
 */
import { bigramCounts, bigramSimilarity, type Bigrams } from "@/lib/text-similarity";

export type MatchCandidate = { id: string; code: string; name: string | null; alt_name?: string | null };
export type MatchListing = { title?: string | null; sku_code?: string | null };
export type MatchSuggestion = { parent_sku_id: string; code: string; name: string | null; score: number; reason: string };

/** คะแนนตั้งแต่นี้ = "รหัสตรงกัน" (ใช้กับปุ่มยืนยันทีเดียวหลายตัว) */
export const HIGH_CONFIDENCE = 90;
const MIN_SCORE = 35;
const NAME_SIM_MIN = 0.35;

/** รหัสแบบมาตรฐาน: ตัวใหญ่ + เหลือแต่ A-Z/0-9 (ตัดขีด เว้นวรรค วงเล็บ และคำไทยในวงเล็บ) */
export function normCode(raw: string | null | undefined): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const isDupCode = (code: string) => /_DUP_\d+$/i.test(code);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** ตัดคำที่ขึ้นต้นทุกชื่อ (เช่น ชื่อแบรนด์) ออกก่อนเทียบความคล้าย ไม่งั้นทุกตัวคล้ายกันหมด */
function stripText(text: string | null | undefined, words: readonly string[] | undefined): string {
  let t = String(text ?? "");
  for (const w of words ?? []) if (w.trim()) t = t.replace(new RegExp(escapeRe(w.trim()), "gi"), " ");
  return t;
}

/**
 * คำในชื่อที่หน้าตาเหมือนรหัส (มีตัวพิมพ์ใหญ่ ยาว ≥2 หลังตัดเครื่องหมาย) ตามลำดับที่เจอ
 * คำตัวเล็กล้วน (cm. mm ml) = หน่วย ไม่ใช่รหัส — เคยเดา "2 cm." เป็นสินค้ารหัส CM
 */
export function codeTokens(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of String(text ?? "").matchAll(/[A-Za-z0-9][A-Za-z0-9\-_.]*/g)) {
    const n = normCode(m[0]);
    if (n.length >= 2 && /[A-Z]/.test(m[0])) out.push(n);
  }
  return out;
}

type PreparedCandidate = MatchCandidate & { norm: string; grams: Bigrams; altGrams: Bigrams | null };

/** เตรียมรายการสินค้าในระบบครั้งเดียว แล้วเรียก suggest ได้หลายรอบ (เร็วขึ้นมากตอนร้านมีหลายร้อยตัว) */
export function prepareCandidates(candidates: readonly MatchCandidate[], opts: { stripWords?: readonly string[] } = {}): PreparedCandidate[] {
  return candidates
    .filter((c) => c.id && c.code && !isDupCode(c.code))
    .map((c) => ({
      ...c, norm: normCode(c.code),
      grams: bigramCounts(stripText(c.name, opts.stripWords)),
      altGrams: c.alt_name ? bigramCounts(stripText(c.alt_name, opts.stripWords)) : null,
    }))
    .filter((c) => c.norm.length > 0);
}

/**
 * รูปแบบรหัสที่เป็นไปได้จาก SKU บนร้าน (เฉพาะเจาะจง → กว้าง) ไว้ถามตาราง SKU ลูก
 * WK42-01D → [WK42-01D, WK42-01, WK42] · "TPLN&TP" → แยกเป็น TPLN, TP ก่อน
 */
export function skuCodeForms(sku: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of String(sku ?? "").split(/[\s&,/|+]+/).map((s) => s.trim()).filter(Boolean)) {
    out.push(part);
    const noTail = part.replace(/[A-Za-z]+$/, "");          // ตัดตัวอักษรท้าย: WK42-01D → WK42-01
    if (noTail && noTail !== part) out.push(noTail);
    const m = part.match(/^(.*?)-[0-9]+[A-Za-z]*$/);         // ตัด -เลข(อักษร) ท้าย: FFB16-01 → FFB16
    if (m?.[1]) out.push(m[1]);
  }
  return [...new Set(out)];
}

/** คู่ที่ระบบรู้มาจากที่อื่น (เช่น SKU บนร้าน = รหัส SKU ลูกในระบบ) — รวมเข้ากับการเดาปกติ เอาคะแนนสูงกว่า */
export type ExtraHit = { parent_sku_id: string; score: number; reason: string };

/**
 * เดาคู่ให้สินค้าบนร้าน 1 ตัว → เรียงจากมั่นใจสุด (สูงสุด limit ตัว)
 * stripWords = คำที่ตัดออกจากชื่อก่อนเทียบความคล้าย (เช่น ชื่อแบรนด์ "IG International" ที่ขึ้นต้นทุกชื่อ)
 */
export function suggestMatches(
  listing: MatchListing,
  candidates: readonly PreparedCandidate[],
  opts: { limit?: number; stripWords?: readonly string[]; useNames?: boolean; extraHits?: readonly ExtraHit[] } = {},
): MatchSuggestion[] {
  const extra = new Map<string, ExtraHit>();
  for (const h of opts.extraHits ?? []) if ((extra.get(h.parent_sku_id)?.score ?? -1) < h.score) extra.set(h.parent_sku_id, h);
  const limit = opts.limit ?? 3;
  const skuRaw = String(listing.sku_code ?? "").trim().toUpperCase();
  const skuToks = String(listing.sku_code ?? "").split(/[\s&,/|+]+/).map(normCode).filter((t) => t.length >= 2);
  const titleToks = codeTokens(listing.title);
  const lastTitle = titleToks[titleToks.length - 1] ?? "";
  const prefixToks = [...new Set([...skuToks, lastTitle].filter((t) => t.length >= 3))];
  const titleGrams = opts.useNames === false ? null : bigramCounts(stripText(listing.title, opts.stripWords));

  const scored: (MatchSuggestion & { sim: number })[] = [];
  for (const c of candidates) {
    let score = 0, reason = "";
    if (skuRaw && skuRaw === c.code.trim().toUpperCase()) { score = 100; reason = "รหัส SKU ตรงกัน"; }
    else if (skuToks.includes(c.norm)) { score = 95; reason = "รหัส SKU ตรงกัน (ต่างแค่ขีด/เว้นวรรค)"; }
    else if (lastTitle && lastTitle === c.norm) { score = 90; reason = "รหัสท้ายชื่อสินค้าตรงกัน"; }
    else if (titleToks.includes(c.norm)) { score = 75; reason = "มีรหัสนี้ในชื่อสินค้า"; }
    else if (c.norm.length >= 3 && prefixToks.some((t) => t !== c.norm && (t.startsWith(c.norm) || c.norm.startsWith(t)))) { score = 60; reason = "รหัสขึ้นต้นเหมือนกัน"; }
    if (score > 0 && score < 100 && c.norm.length <= 2) { score -= 20; reason += " (รหัสสั้น ตรวจให้ดี)"; }
    const hit = extra.get(c.id);
    if (hit && hit.score > score) { score = hit.score; reason = hit.reason; }

    const sim = titleGrams ? Math.max(bigramSimilarity(titleGrams, c.grams), c.altGrams ? bigramSimilarity(titleGrams, c.altGrams) : 0) : 0;
    if (sim >= NAME_SIM_MIN) {
      const nameScore = Math.min(55, Math.round(20 + sim * 40));
      if (nameScore > score) { score = nameScore; reason = "ชื่อคล้ายกัน"; }
    }
    if (score >= MIN_SCORE) scored.push({ parent_sku_id: c.id, code: c.code, name: c.name, score, reason, sim });
  }
  scored.sort((a, b) => b.score - a.score || b.sim - a.sim || a.code.length - b.code.length || a.code.localeCompare(b.code));
  return scored.slice(0, limit).map(({ sim: _sim, ...s }) => s);
}

/** มั่นใจพอให้ "ยืนยันทีเดียวหลายตัว" ได้ไหม: ตัวแรกรหัสตรง และไม่มีตัวที่สองรหัสตรงด้วย (ไม่กำกวม) */
export function isHighConfidence(suggestions: readonly MatchSuggestion[]): boolean {
  return (suggestions[0]?.score ?? 0) >= HIGH_CONFIDENCE && (suggestions[1]?.score ?? 0) < HIGH_CONFIDENCE;
}
