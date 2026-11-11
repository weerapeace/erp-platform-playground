/**
 * 🎨 รอบเสนอราคาหลายสี (ใบงานออกแบบ) — กติกากลาง ไม่มีหน้าจอ · เจ้าของขอ 2026-11-11
 *
 *   1 ช่องรอบเสนอราคา (ครั้งที่ × ไซส์ × ขั้นจำนวน) มีสีได้หลายสี → design_sheet_quotes.colors
 *   QuoteColor = { name, hex, qty (จำนวนของสีนี้ในขั้นนั้น), delta (± บาท จากราคาที่เสนอของช่อง · แยกราคาตามสี) }
 *   ใช้ที่: API /api/design-sheets/[id]/quotes(+batch,+[qid]) ทำความสะอาดก่อนเก็บ · ฟอร์ม/การ์ดรอบเสนอราคา (quote-rounds)
 *          · ส่งไปใบเสนอราคา (1 สี = 1 บรรทัด จำนวนตามที่แบ่ง ราคา = ราคาช่อง + delta)
 * เทสต์ lib/__tests__/quote-colors.test.ts
 */

export type QuoteColor = { name: string; hex: string | null; qty: number | null; delta: number | null };

/** จานสีให้กดเลือกเร็ว (พิมพ์ชื่อสีเองได้ — ไม่มีในจาน = จุดสีเทา) */
export const QUOTE_COLOR_PALETTE: { name: string; hex: string }[] = [
  { name: "ดำ", hex: "#2C2C2A" }, { name: "ขาว", hex: "#FFFFFF" }, { name: "ครีม", hex: "#F1E6CC" }, { name: "เทา", hex: "#888780" },
  { name: "น้ำตาล", hex: "#8B5A2B" }, { name: "แดง", hex: "#E24B4A" }, { name: "ชมพู", hex: "#ED93B1" }, { name: "ส้ม", hex: "#D85A30" },
  { name: "เหลือง", hex: "#EF9F27" }, { name: "เขียว", hex: "#3B6D11" }, { name: "น้ำเงิน", hex: "#185FA5" }, { name: "ม่วง", hex: "#7F77DD" },
];
export const QUOTE_COLOR_MAX = 20;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** สีของชื่อนี้ในจาน (ไม่เจอ = null → หน้าจอวาดจุดเทา) */
export const paletteHex = (name: string): string | null => QUOTE_COLOR_PALETTE.find((p) => p.name === name.trim())?.hex ?? null;

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** ทำความสะอาดรายการสี (API + หน้าจอใช้ตัวเดียวกัน) · ว่าง = null (ไม่แยกสี) · ชื่อซ้ำ = เอาตัวแรก */
export function cleanQuoteColors(raw: unknown): QuoteColor[] | null {
  if (!Array.isArray(raw)) return null;
  const out: QuoteColor[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const name = String(o.name ?? "").trim().slice(0, 40);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const hex = typeof o.hex === "string" && HEX.test(o.hex) ? o.hex.toUpperCase() : paletteHex(name);
    const q = numOrNull(o.qty);
    const d = numOrNull(o.delta);
    out.push({ name, hex, qty: q != null && q >= 0 ? Math.round(q) : null, delta: d != null && d !== 0 ? Math.round(d * 100) / 100 : null });
    if (out.length >= QUOTE_COLOR_MAX) break;
  }
  return out.length ? out : null;
}

export type ColorQtyState = "ok" | "under" | "over" | "none";
/** แบ่งจำนวนครบไหม เทียบขั้นจำนวนของช่อง — none = ไม่มีสี/ไม่ระบุขั้นจำนวน (ไม่ต้องเตือน) */
export function colorQtyStatus(colors: Pick<QuoteColor, "qty">[] | null | undefined, tierQty: number | null | undefined): { total: number; remaining: number; state: ColorQtyState } {
  const total = (colors ?? []).reduce((s, c) => s + (Number(c.qty) || 0), 0);
  if (!colors?.length || tierQty == null || !(tierQty > 0)) return { total, remaining: 0, state: "none" };
  const remaining = tierQty - total;
  return { total, remaining, state: remaining === 0 ? "ok" : remaining > 0 ? "under" : "over" };
}

/** แบ่งเท่ากัน — เศษไปสีแรก ๆ (1,000 ÷ 3 = 334 · 333 · 333) */
export function splitEvenly(count: number, total: number): number[] {
  if (count <= 0) return [];
  const t = Math.max(0, Math.round(total));
  const q = Math.floor(t / count), r = t - q * count;
  return Array.from({ length: count }, (_, i) => q + (i < r ? 1 : 0));
}

/** เปอร์เซ็นต์ → ชิ้น ให้ผลรวมตรงขั้นจำนวน (ปัดแบบเศษมากได้ก่อน) · รวม % ไม่ถึง 100 = ได้ชิ้นตามสัดส่วนจริง */
export function percentsToQty(pcts: number[], total: number): number[] {
  const t = Math.max(0, Math.round(total));
  const raw = pcts.map((p) => (Math.max(0, p) / 100) * t);
  const base = raw.map(Math.floor);
  const sumPct = pcts.reduce((s, p) => s + Math.max(0, p), 0);
  const target = Math.abs(sumPct - 100) < 1e-6 ? t : Math.round(raw.reduce((s, v) => s + v, 0));
  let left = target - base.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; base[i] += 1; left -= 1; }
  return base;
}

/** ชิ้น → เปอร์เซ็นต์ (ทศนิยม 1 ตำแหน่ง) สำหรับโชว์ตอนสลับเป็นโหมด % */
export const qtyToPercent = (qty: number | null | undefined, total: number | null | undefined): number =>
  total && total > 0 && qty != null ? Math.round((qty / total) * 1000) / 10 : 0;

/** ราคาต่อชิ้นของสี = ราคาที่เสนอของช่อง + delta */
export const colorUnitPrice = (cellPrice: number | null | undefined, c: Pick<QuoteColor, "delta">): number | null =>
  cellPrice == null ? null : Math.round((Number(cellPrice) + (Number(c.delta) || 0)) * 100) / 100;
