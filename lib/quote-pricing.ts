/**
 * 💰 ตัวช่วยตั้งราคาขาย (แท็บเสนอราคา ใบงานออกแบบ) — สูตรบริสุทธิ์ ไม่แตะฐานข้อมูล
 *   เจ้าของขอ 2026-11-09: "ต้นทุน 100 กำไร 25%, 50%, 75%, 100%, 150%, 200% คือเท่าไหร่ + ดูราคากระเป๋าใบอื่นใน brand นี้"
 *
 *   2 แบบคิด % (คำว่า "กำไร 50%" ตีความได้ 2 แบบ เลยให้สลับ):
 *     markup = บวกจากต้นทุน      ราคาขาย = ต้นทุน × (1 + %)        ต้นทุน 100 บวก 100% = 200
 *     margin = กำไรคิดจากราคาขาย  ราคาขาย = ต้นทุน ÷ (1 − %)        ต้นทุน 100 กำไร 50% = 200 (เกิน 100% เป็นไปไม่ได้)
 *   ทุกวิธีแปลงเป็น "ตัวคูณ" (mult) ตัวเดียว → เอาไปคูณตีราคาของแต่ละช่อง (ไซส์ × ขั้นจำนวน) ได้เลย
 *   ปัดราคา: ไม่ปัด · ขึ้นหลัก 5 · ขึ้นหลักสิบ · ลงท้าย 9 (ต่างจาก lib/fake-price ที่ปัดราคาขีดฆ่าแบบลงท้าย 90/99)
 *   VAT: แค่โชว์ราคารวม VAT ให้บอกลูกค้า — ราคาที่ใส่ในรอบเสนอราคายังเป็นราคาก่อน VAT เหมือนเดิม
 *   ใช้ที่: components/design-sheet-detail/quote-pricing-helper.tsx · API /api/design-sheets/[id]/price-refs
 */

export type PriceMode = "markup" | "margin";
export type PriceRound = "none" | "ceil5" | "ceil10" | "end9";

export const PRICE_STEPS = [25, 50, 75, 100, 150, 200] as const;
export const VAT_RATE = 7;

export const MODE_LABEL: Record<PriceMode, string> = { markup: "บวกจากต้นทุน", margin: "กำไรคิดจากราคาขาย" };
export const MODE_HINT: Record<PriceMode, string> = {
  markup: "ราคาขาย = ต้นทุน × (1 + %)",
  margin: "ราคาขาย = ต้นทุน ÷ (1 − %) · ให้กำไรเป็น % ของราคาขายจริง (ตั้งได้ไม่ถึง 100%)",
};
export const ROUND_LABEL: Record<PriceRound, string> = { none: "ไม่ปัด", ceil5: "ขึ้นหลัก 5", ceil10: "ขึ้นหลักสิบ", end9: "ลงท้าย 9" };

const r2 = (v: number) => Math.round(v * 100) / 100;

/** % → ตัวคูณ (markup 100% = ×2 · margin 50% = ×2) · margin ≥ 100% หรือค่าติดลบ = ใช้ไม่ได้ (null) */
export function multiplierOf(mode: PriceMode, pct: number): number | null {
  if (!Number.isFinite(pct) || pct < 0) return null;
  if (mode === "markup") return 1 + pct / 100;
  return pct < 100 ? 1 / (1 - pct / 100) : null;
}

/** ปัดราคาให้สวย — ปัด "ขึ้น" เสมอ (ไม่ทำให้กำไรต่ำกว่าที่เลือก) */
export function roundQuotePrice(v: number, round: PriceRound): number {
  const x = r2(v);   // กันเศษทศนิยมลอย (เช่น 82.97 × 1.1 = 91.26700000000001)
  switch (round) {
    case "ceil5": return Math.ceil(x / 5) * 5;
    case "ceil10": return Math.ceil(x / 10) * 10;
    case "end9": { const n = Math.ceil(x); return Math.floor(n / 10) * 10 + 9; }   // 141.3 → 149 · 149 → 149 · 150 → 159
    default: return x;
  }
}

/** ต้นทุน × ตัวคูณ แล้วปัด · ต้นทุนยังไม่มี (≤0) = null (ไม่เดาราคาให้) */
export function priceFromCost(cost: number, mult: number, round: PriceRound = "none"): number | null {
  if (!(cost > 0) || !(mult > 0)) return null;
  return roundQuotePrice(cost * mult, round);
}

/** บวกจากต้นทุนกี่ % (ต้นทุน 100 ขาย 200 = 100%) */
export function markupPctOf(cost: number, price: number): number | null {
  return cost > 0 && price >= 0 ? (price / cost - 1) * 100 : null;
}
/** กำไรคิดเป็นกี่ % ของราคาขาย (ต้นทุน 100 ขาย 200 = 50%) */
export function marginPctOf(cost: number, price: number): number | null {
  return price > 0 && cost >= 0 ? ((price - cost) / price) * 100 : null;
}

export const withVat = (v: number, rate = VAT_RATE) => r2(v * (1 + rate / 100));
export const exVat = (v: number, rate = VAT_RATE) => r2(v / (1 + rate / 100));

export type MarkupRow = { pct: number; mult: number; price: number; profit: number; markupPct: number; marginPct: number };

/** ตาราง "ต้นทุน X กำไร 25/50/…% = ขายเท่าไหร่" · % ที่ใช้ไม่ได้ (margin ≥ 100) ไม่ใส่ในตาราง */
export function markupTable(cost: number, mode: PriceMode, round: PriceRound = "none", pcts: readonly number[] = PRICE_STEPS): MarkupRow[] {
  const out: MarkupRow[] = [];
  for (const pct of pcts) {
    const mult = multiplierOf(mode, pct);
    if (mult == null) continue;
    const price = priceFromCost(cost, mult, round);
    if (price == null) continue;
    out.push({ pct, mult, price, profit: r2(price - cost), markupPct: markupPctOf(cost, price) ?? 0, marginPct: marginPctOf(cost, price) ?? 0 });
  }
  return out;
}

/** ย้อนจากงบลูกค้า: งบ X บาท/ใบ → ต้นทุนต้องไม่เกินเท่าไหร่ถึงได้กำไรตามตัวคูณ + ตอนนี้กำไร/ขาดทุนเท่าไหร่ */
export function budgetCheck(budget: number, cost: number, mult: number, vatIncluded = false): { budgetExVat: number; maxCost: number; profit: number; markupPct: number | null } | null {
  if (!(budget > 0) || !(mult > 0)) return null;
  const b = vatIncluded ? exVat(budget) : r2(budget);
  return { budgetExVat: b, maxCost: r2(b / mult), profit: r2(b - Math.max(0, cost)), markupPct: markupPctOf(cost, b) };
}

// ---------------- ราคาอ้างอิงในแบรนด์เดียวกัน ----------------

/** 1 ช่องเสนอราคาของใบงานอื่นในแบรนด์ (design_sheet_quotes: price = ตีราคาตอนเสนอ · offered_price = ราคาที่เสนอ) */
export type BrandQuoteRef = {
  sheet_id: string; sheet_code: string | null; sheet_name: string | null;
  parent_code: string | null; qty: number | null; cost: number; offered: number; status: string; quote_date: string | null;
};
/** ราคาป้าย (ขายปลีก) ของรุ่นสินค้าในแบรนด์ — skus_v2.list_price รวมต่อรุ่น */
export type BrandSkuRef = { code: string; name: string | null; min: number; max: number; n: number };

export function median(xs: number[]): number | null {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export type BrandMarkupSummary = {
  byStatus: Record<string, { n: number; median: number | null }>;
  /** % บวกที่แนะนำ = กลาง ๆ ของรอบที่ลูกค้าตกลง (ผ่าน) · ยังไม่มีรอบผ่าน = กลาง ๆ ของทุกรอบ */
  suggestPct: number | null;
  basis: "passed" | "all" | null;
};

export function brandMarkupSummary(refs: BrandQuoteRef[]): BrandMarkupSummary {
  const pct = (r: BrandQuoteRef) => markupPctOf(r.cost, r.offered);
  const groups = new Map<string, number[]>();
  for (const r of refs) { const p = pct(r); if (p == null) continue; (groups.get(r.status) ?? groups.set(r.status, []).get(r.status)!).push(p); }
  const byStatus: BrandMarkupSummary["byStatus"] = {};
  for (const [s, xs] of groups) byStatus[s] = { n: xs.length, median: median(xs) };
  const passed = groups.get("passed") ?? [];
  if (passed.length) return { byStatus, suggestPct: median(passed), basis: "passed" };
  const all = [...groups.values()].flat();
  return { byStatus, suggestPct: median(all), basis: all.length ? "all" : null };
}

/** ต้นทุนงานนี้คิดเป็นกี่ % ของราคาป้ายสินค้าในแบรนด์ (ช่วยดูว่าขายส่งแพง/ถูกไปไหม) */
export const costShareOfPrice = (cost: number, price: number): number | null => (cost > 0 && price > 0 ? (cost / price) * 100 : null);
