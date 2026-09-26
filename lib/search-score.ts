/**
 * search-score — ตัวจัดอันดับค้นหากลาง "เป๊ะ-first" (pure, ใช้ได้ทั้ง server/client)
 *
 * มาตรฐานเดียวกับ picker ทั้งระบบ (/api/pickers/skus, /api/admin/picker, /api/bom/components):
 *   1. แตกคำค้นด้วยช่องว่าง/ขีด/จุด/# → ค้นข้ามตัวคั่นได้ ("ZH-BT 5" เจอ "ZH-BT-NO.5#345")
 *   2. ทุกคำต้องเจอ (AND) ในฟิลด์ใดฟิลด์หนึ่ง
 *   3. คะแนน: รหัสตรงเป๊ะ 1,000,000 → ขึ้นต้นด้วย 900k → มีคำค้น 800k → ที่เหลือนับคำที่เจอ
 *
 * ใช้: const toks = tokenize(q); const s = scoreRow(q, toks, { code: r.code, texts: [r.name, r.barcode] });
 */

/** แตกคำค้น (สูงสุด 6 คำ) — ตัดอักขระพิเศษของ PostgREST (% _ ( ) * ,) ออกด้วย */
export function tokenize(q: string): string[] {
  return String(q ?? "").toLowerCase()
    .split(/[\s\-_#/.,()]+/)
    .map((t) => t.replace(/[%_()*,]/g, "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

/** normalize เทียบค่า — ตัวเล็ก + ตัดทุกอย่างที่ไม่ใช่ตัวอักษร/ตัวเลข/ไทย */
export function normText(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/[^0-9a-z฀-๿]+/g, "");
}

/** สร้างเงื่อนไข PostgREST `.or()` ของ 1 token บนหลายคอลัมน์ — ใช้คู่กับ token-AND (เรียก .or ต่อ token) */
export function ilikeOr(cols: string[], token: string): string {
  const t = token.replace(/[%_(),.*]/g, " ").trim();
  return cols.map((c) => `${c}.ilike.%${t}%`).join(",");
}

export type ScoreInput = {
  /** รหัส/เลขเอกสาร — ตรงเป๊ะได้คะแนนสูงสุด */
  code?: string | null;
  /** ชื่อ/ข้อความอื่น ๆ ที่ค้นได้ */
  texts?: (string | null | undefined)[];
};

/**
 * คะแนนแถวเดียว (มาก = ขึ้นก่อน) — 0 ถ้าไม่เข้าเงื่อนไข AND
 */
export function scoreRow(q: string, tokens: string[], row: ScoreInput): number {
  const S = normText(q);
  const code = normText(row.code);
  const texts = (row.texts ?? []).map(normText).filter(Boolean);
  const all = [code, ...texts].filter(Boolean);
  if (all.length === 0) return 0;
  const toks = tokens.map(normText).filter(Boolean);
  if (toks.length && !toks.every((t) => all.some((h) => h.includes(t)))) return 0;

  if (S) {
    if (code && code === S) return 1_000_000;
    if (code && code.startsWith(S)) return 900_000 - code.length;
    if (texts.some((t) => t === S)) return 880_000;
    if (texts.some((t) => t.startsWith(S))) return 850_000 - Math.min(...texts.filter((t) => t.startsWith(S)).map((t) => t.length));
    if (code && code.includes(S)) return 800_000 - code.length;
    if (texts.some((t) => t.includes(S))) return 700_000;
  }
  // ไม่มีตัวไหนมีคำค้นทั้งก้อน (เจอแบบข้ามตัวคั่น) → นับจำนวน token ที่เจอในรหัสก่อน แล้วค่อยชื่อ
  let s = 0;
  for (const t of toks) { if (code.includes(t)) s += 1000; else s += 100; }
  return s;
}
