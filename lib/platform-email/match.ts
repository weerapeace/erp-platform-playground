/**
 * 🔗 จับคู่ "สินค้าในเมลแพลตฟอร์ม" → SKU ใน ERP (pure — ทดสอบที่ lib/__tests__/platform-email-match.test.ts)
 *
 * กติกา (ตรวจกับข้อมูลจริง 2026-10-27):
 *   - ชื่อสินค้าบนร้านลงท้ายด้วยรหัสรุ่น เช่น "… Men's Wallet TTM061" → รุ่น TTM061
 *   - SKU ลูก = รหัสรุ่น-เลขสี (TTM061-04) และ color_platform_th = "ดำ (04)"
 *   rule   คนเคยยืนยันคู่นี้แล้ว → ใช้ที่จำไว้
 *   exact  ตัวเลือกมีเลขสีในวงเล็บ "Black (04)" → TTM061-04 · หรือในเมลมีรหัส SKU เต็มอยู่แล้ว
 *   single รุ่นนั้นมี SKU เดียว และตัวเลือกไม่ได้บอกสีที่ขัดกัน
 *   guess  เดาจากชื่อสีได้ตัวเดียว (เช่น "ดำ (Special)" → LYP14-01) → ยังไม่ผูกเอง ให้คนกดยืนยันครั้งแรก
 *   none   หาไม่เจอ → รอคนเลือกเอง
 * ผูกเองอัตโนมัติเฉพาะ rule / exact / single (AUTO_CONFIDENCE)
 */

export type SkuCandidate = {
  id: string;
  code: string;
  name_th?: string | null;
  color?: string | null;
  color_th?: string | null;
  color_platform_th?: string | null;
  color_platform_en?: string | null;
  is_active?: boolean | null;
};

export type MatchConfidence = "rule" | "exact" | "single" | "guess" | "none";
export const AUTO_CONFIDENCE: readonly MatchConfidence[] = ["rule", "exact", "single"];

export type ItemMatch = {
  confidence: MatchConfidence;
  /** ผูกแล้ว (rule/exact/single) */
  sku_id: string | null;
  sku_code: string | null;
  /** เดาไว้ให้คนยืนยัน (guess) */
  suggest: { id: string; code: string } | null;
  reason: string;
};

const norm = (s: string | null | undefined) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** รหัสรุ่นท้ายชื่อสินค้า: คำสุดท้ายที่มีทั้งตัวพิมพ์ใหญ่และตัวเลข เช่น "… Baguette LYP14" → LYP14 */
export function modelCodeFromTitle(title: string | null | undefined): string | null {
  const tokens = [...String(title ?? "").matchAll(/[A-Za-z0-9][A-Za-z0-9\-_.]*/g)]
    .map((m) => m[0].replace(/[-_.]+$/, ""))
    .filter((t) => /[A-Z]/.test(t) && /\d/.test(t) && t.length >= 3);
  return tokens.length ? tokens[tokens.length - 1].toUpperCase() : null;
}

/** เลขสีในวงเล็บท้ายตัวเลือก: "Black (04)" → "04" · "น้ำตาล (05/1)" → "05/1" */
export function variantNumber(variant: string | null | undefined): string | null {
  const m = /\((\d{1,3}(?:\/\d{1,2})?)\)\s*$/.exec(String(variant ?? ""));
  return m ? m[1] : null;
}

/** กุญแจจำคู่ที่คนยืนยัน: รุ่น + ตัวเลือก (ไม่มีรุ่น = ชื่อเต็ม + ตัวเลือก) */
export function itemKey(title: string, variant: string | null | undefined): string {
  const model = modelCodeFromTitle(title);
  return `${model ? `m:${model}` : `t:${norm(title)}`}|${norm(variant)}`;
}

/** ชื่อสีอังกฤษ → ไทย (ตัวเลือกบน Shopee บางตัวเป็นอังกฤษ แต่ ERP เก็บสีไทย) */
const COLOR_EN_TH: Record<string, string> = {
  black: "ดำ", white: "ขาว", brown: "น้ำตาล", navy: "กรมท่า", blue: "น้ำเงิน", beige: "เบจ", cream: "ครีม",
  red: "แดง", tan: "แทน", green: "เขียว", emerald: "มรกต", pink: "ชมพู", grey: "เทา", gray: "เทา",
  yellow: "เหลือง", orange: "ส้ม", purple: "ม่วง", gold: "ทอง", silver: "เงิน", khaki: "กากี", ivory: "งาช้าง",
};

/** คำบอกสีในตัวเลือก (ตัดส่วนในวงเล็บ) → ชุดคำภาษาไทย/อังกฤษตัวเล็ก */
export function variantColorWords(variant: string | null | undefined): string[] {
  const words = norm(String(variant ?? "").replace(/\([^)]*\)/g, " ")).split(/[\s,/\-+]+/).filter((w) => w.length >= 2);
  const out = new Set<string>();
  for (const w of words) { out.add(w); if (COLOR_EN_TH[w]) out.add(COLOR_EN_TH[w]); }
  return [...out];
}

function candidateColors(c: SkuCandidate): string[] {
  return [c.color, c.color_th, c.color_platform_th, c.color_platform_en]
    .map((x) => norm(String(x ?? "").replace(/\([^)]*\)/g, " ")))
    .filter(Boolean);
}

const colorHit = (c: SkuCandidate, words: string[]) => {
  const cs = candidateColors(c);
  return words.some((w) => cs.some((cc) => cc === w || cc.split(" ").includes(w)));
};

/**
 * จับคู่สินค้า 1 รายการ
 * @param candidates SKU ทั้งหมดของรุ่นนั้น (code = รุ่น หรือขึ้นต้นด้วย "รุ่น-")
 * @param rule คู่ที่คนยืนยันไว้ (ถ้ามี)
 */
export function matchEmailItem(
  item: { title: string; variant: string | null },
  candidates: readonly SkuCandidate[],
  rule?: { id: string; code: string } | null,
): ItemMatch {
  if (rule) return { confidence: "rule", sku_id: rule.id, sku_code: rule.code, suggest: null, reason: "เคยยืนยันคู่นี้แล้ว" };

  const active = candidates.filter((c) => c.is_active !== false);
  const pool = active.length ? active : [...candidates];
  const model = modelCodeFromTitle(item.title);
  if (!pool.length) return { confidence: "none", sku_id: null, sku_code: null, suggest: null, reason: model ? `ไม่พบรหัส ${model} ใน ERP` : "ชื่อสินค้าไม่มีรหัสรุ่น" };

  const ok = (c: SkuCandidate, confidence: MatchConfidence, reason: string): ItemMatch =>
    ({ confidence, sku_id: c.id, sku_code: c.code, suggest: null, reason });
  const guess = (c: SkuCandidate, reason: string): ItemMatch =>
    ({ confidence: "guess", sku_id: null, sku_code: null, suggest: { id: c.id, code: c.code }, reason });

  // 1) เลขสีในวงเล็บ → รหัสเต็ม
  const num = variantNumber(item.variant);
  if (model && num) {
    const want = `${model}-${num}`.toUpperCase();
    const hit = pool.find((c) => c.code.toUpperCase() === want);
    if (hit) return ok(hit, "exact", `ตัวเลือก (${num}) = ${hit.code}`);
  }
  // 2) ในเมลมีรหัส SKU เต็มอยู่แล้ว
  const text = ` ${item.title} ${item.variant ?? ""} `.toUpperCase();
  const full = pool.filter((c) => c.code.includes("-") && new RegExp(`[^A-Z0-9]${escapeRe(c.code.toUpperCase())}[^A-Z0-9/]`).test(text));
  if (full.length === 1) return ok(full[0], "exact", `เมลมีรหัส ${full[0].code}`);

  const words = variantColorWords(item.variant);
  // 3) รุ่นนี้มี SKU เดียว
  if (pool.length === 1) {
    const only = pool[0];
    if (words.length && candidateColors(only).length && !colorHit(only, words)) return guess(only, `รุ่นนี้มีตัวเดียว (${only.code}) แต่สีในเมลไม่ตรง — ช่วยยืนยัน`);
    return ok(only, "single", `รุ่นนี้มี SKU เดียว (${only.code})`);
  }
  // 4) เดาจากชื่อสี
  if (words.length) {
    const hits = pool.filter((c) => colorHit(c, words));
    if (hits.length === 1) return guess(hits[0], `สี "${item.variant}" น่าจะเป็น ${hits[0].code} — ช่วยยืนยัน`);
  }
  return { confidence: "none", sku_id: null, sku_code: null, suggest: null, reason: `รุ่น ${model ?? "?"} มี ${pool.length} สี เลือกจากเมลไม่ได้` };
}
