// ============================================================
// fuzzy-rank — ค้นในรายการแบบ "ไม่ต้องตรงเป๊ะ" ฝั่งหน้าเว็บ (ของกลาง · pure เทสต์ได้)
// กฎจัดอันดับเดียวกับฝั่ง API (memory search_ranking_standard): ตรงเป๊ะขึ้นก่อน → ขึ้นต้นด้วย → มีคำนี้ → ทุกคำมีครบ
// เพิ่ม:
//   • ค้นข้ามตัวคั่น (เว้นวรรค - _ / . #) — "pix 22" เจอ "PIX-22"
//   • พิมพ์ผิดภาษา (ลืมสลับแป้น) — พิมพ์ "ทหห" ตั้งใจ "mss" / พิมพ์ "l;ylfu" ตั้งใจ "สวัสดี" → เดาให้ (คะแนนต่ำกว่าตรงจริงนิดหน่อย)
//   • ตัวอักษรเรียงตามลำดับ (ข้ามตัวได้) — "pxbk" เจอ "PIX BLACK" (เฉพาะคำค้น ≥ 3 ตัว · คะแนนต่ำสุด)
// ใช้ที่: SearchableSelect / SearchableMultiSelect (components/searchable-select)
// ============================================================

// แป้นอังกฤษ (US) → แป้นไทย (เกษมณี) ตามตำแหน่งปุ่มเดียวกัน
const EN = "`1234567890-=qwertyuiop[]\\asdfghjkl;'zxcvbnm,./~!@#$%^&*()_+QWERTYUIOP{}|ASDFGHJKL:\"ZXCVBNM<>?";
const TH = "_ๅ/-ภถุึคตจขชๆไำพะัีรนยบลฃฟหกดเ้่าสวงผปแอิืทมใฝ%+๑๒๓๔ู฿๕๖๗๘๙๐\"ฎฑธํ๊ณฯญฐ,ฅฤฆฏโฌ็๋ษศซ.()ฉฮฺ์?ฒฬฦ";
const EN2TH = new Map<string, string>();
const TH2EN = new Map<string, string>();
for (let i = 0; i < Math.min(EN.length, TH.length); i++) {
  if (!EN2TH.has(EN[i])) EN2TH.set(EN[i], TH[i]);
  if (!TH2EN.has(TH[i])) TH2EN.set(TH[i], EN[i]);
}

/** พิมพ์ด้วยแป้นไทยแต่ตั้งใจภาษาอังกฤษ → แปลงกลับ (ตัวที่ไม่ใช่ไทยคงเดิม) */
export function thaiKeysToEnglish(s: string): string {
  return Array.from(s).map((c) => TH2EN.get(c) ?? c).join("");
}
/** พิมพ์ด้วยแป้นอังกฤษแต่ตั้งใจภาษาไทย → แปลงกลับ */
export function englishKeysToThai(s: string): string {
  return Array.from(s).map((c) => EN2TH.get(c) ?? c).join("");
}

/** ตัดตัวคั่น + ตัวเล็ก (คงไทย/อังกฤษ/ตัวเลข) */
export function normSearch(s: string): string {
  return String(s ?? "").toLowerCase().replace(/[\s\-_#/.,()[\]{}:;'"|\\+*&^%$@!~`<>?=]+/g, "");
}
function tokens(s: string): string[] {
  return String(s ?? "").toLowerCase().split(/[\s\-_#/.,()]+/).filter(Boolean).slice(0, 6);
}

/** ตัวอักษรของ q อยู่ใน text ตามลำดับไหม — คืนจำนวนช่องว่างที่ข้าม (−1 = ไม่ครบ) */
function subseqGaps(text: string, q: string): number {
  let i = 0, gaps = 0, last = -1;
  for (const ch of q) {
    const j = text.indexOf(ch, i);
    if (j < 0) return -1;
    if (last >= 0) gaps += j - last - 1;
    last = j; i = j + 1;
  }
  return gaps;
}

/** คะแนนของข้อความหนึ่งกับคำค้น (0 = ไม่เจอ) */
export function scoreText(text: string, query: string): number {
  const t = normSearch(text), q = normSearch(query);
  if (!q || !t) return 0;
  if (t === q) return 1_000_000;
  if (t.startsWith(q)) return 900_000 - t.length;
  if (t.includes(q)) return 800_000 - t.length - t.indexOf(q);
  const toks = tokens(query).map(normSearch).filter(Boolean);
  if (toks.length > 1 && toks.every((k) => t.includes(k))) return 600_000 - t.length;
  if (q.length >= 3) {
    const g = subseqGaps(t, q);
    if (g >= 0 && g <= q.length * 3) return 200_000 - g * 100 - t.length;
  }
  return 0;
}

export type RankableOption = { value: string; label: string; sub?: string; searchText?: string };

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** คะแนนดีที่สุดของตัวเลือก (ป้าย > รหัส > คำรอง) กับคำค้นทุกแบบ (ตามที่พิมพ์ / สลับแป้น) */
export function scoreOption(o: RankableOption, query: string): number {
  const variants: [string, number][] = [[query, 0]];
  const toEn = thaiKeysToEnglish(query), toTh = englishKeysToThai(query);
  if (toEn !== query) variants.push([toEn, 50_000]);
  if (toTh !== query) variants.push([toTh, 50_000]);
  let best = 0;
  for (const [q, penalty] of variants) {
    const s = Math.max(
      scoreText(o.label, q),
      isUuid(o.value) ? 0 : scoreText(o.value, q) * 0.95,
      scoreText(o.sub ?? "", q) * 0.85,
      scoreText(o.searchText ?? "", q) * 0.85,
    );
    if (s > 0) best = Math.max(best, s - penalty);
  }
  return best;
}

/** กรอง + เรียงตามคะแนน (คำค้นว่าง = ลำดับเดิม) · คะแนนเท่ากัน = ลำดับเดิม */
export function rankOptions<T extends RankableOption>(options: T[], query: string): T[] {
  if (!query.trim()) return options;
  return options
    .map((o, i) => ({ o, i, s: scoreOption(o, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.o);
}
