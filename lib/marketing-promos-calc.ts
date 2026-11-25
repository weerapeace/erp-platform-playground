/**
 * สูตรแท็บ "โปรโมชั่น" ของหน้าภาพรวมการตลาด — pure + เทสต์ lib/__tests__/marketing-promos-calc.test.ts
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-25 (แผนการตลาด รอบ 6 · แบบ A + ข้อ 2 ผลของแต่ละโปร · 3 แยกโค้ดส่วนลดร้าน · 4 ส่วนลดที่ Shopee ช่วยออก)
 * ผลของโปร = ยอดเฉลี่ยต่อวันช่วงโปร เทียบ 7 วันก่อนเริ่มโปร (ยอดของร้าน/แบรนด์นั้นบน Shopee)
 *   ≥ +15% = ได้ผล · ≤ −10% = ไม่ได้ผล · ระหว่างนั้น = เสมอตัว · โปรที่ยาวเกิน 31 วัน = "ลดตลอด" (ไม่วัดผล — ไม่มีช่วงปกติให้เทียบ)
 * ห้าม import "@/..." (ใช้ได้ทั้งหน้าเว็บ/หลังบ้าน/เทสต์)
 */

const DAY_MS = 86_400_000;
const shift = (d: string, k: number) => new Date(Date.parse(`${d}T00:00:00Z`) + k * DAY_MS).toISOString().slice(0, 10);
const bkkDay = (isoTs: string) => new Date(Date.parse(isoTs) + 7 * 3_600_000).toISOString().slice(0, 10);

export type PromoEffect = "worked" | "flat" | "failed" | "always_on" | "no_data" | "upcoming";
export const EFFECT_META: Record<PromoEffect, { label: string }> = {
  worked: { label: "ได้ผล" }, flat: { label: "เสมอตัว" }, failed: { label: "ไม่ได้ผล" },
  always_on: { label: "ลดตลอด (ไม่วัดผล)" }, no_data: { label: "ข้อมูลไม่พอ" }, upcoming: { label: "ยังไม่เริ่ม" },
};

/**
 * ผลของโปร 1 ตัว — daily = ยอดรายวัน (วันไทย) ของร้านนั้น · today = วันนี้
 * ช่วงโปรตัดที่วันนี้ · ต้องมียอดก่อนโปรอย่างน้อย 4 วันใน 7 วัน
 */
export function promoEffect(p: { start_at: string | null; end_at: string | null }, daily: Map<string, number>, today: string): { effect: PromoEffect; days: number; avgDuring: number | null; avgBefore: number | null; lift: number | null } {
  if (!p.start_at) return { effect: "no_data", days: 0, avgDuring: null, avgBefore: null, lift: null };
  const s = bkkDay(p.start_at);
  if (s > today) return { effect: "upcoming", days: 0, avgDuring: null, avgBefore: null, lift: null };
  const e0 = p.end_at ? bkkDay(p.end_at) : today;
  const e = e0 > today ? today : e0;
  const days = Math.round((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / DAY_MS) + 1;
  if (days > 31) return { effect: "always_on", days, avgDuring: null, avgBefore: null, lift: null };
  let during = 0, dn = 0, before = 0, bn = 0;
  for (let d = s; d <= e; d = shift(d, 1)) { if (daily.has(d)) { during += daily.get(d) as number; dn++; } }
  for (let k = 1; k <= 7; k++) { const d = shift(s, -k); if (daily.has(d)) { before += daily.get(d) as number; bn++; } }
  if (!dn || bn < 4) return { effect: "no_data", days, avgDuring: dn ? during / dn : null, avgBefore: bn ? before / bn : null, lift: null };
  const avgDuring = during / dn, avgBefore = before / bn;
  const lift = avgBefore > 0 ? (avgDuring - avgBefore) / avgBefore : null;
  const effect: PromoEffect = lift == null ? "no_data" : lift >= 0.15 ? "worked" : lift <= -0.1 ? "failed" : "flat";
  return { effect, days, avgDuring, avgBefore, lift };
}

/** จำนวนโปรอื่นที่ซ้อนช่วงเดียวกัน (ไว้เตือนว่าแยกผลไม่ได้) */
export function overlapCount<T extends { promo_id: string; kind: string; start_at: string | null; end_at: string | null }>(p: T, all: readonly T[]): number {
  if (!p.start_at) return 0;
  const a1 = Date.parse(p.start_at), a2 = p.end_at ? Date.parse(p.end_at) : Infinity;
  return all.filter((q) => !(q.promo_id === p.promo_id && q.kind === p.kind) && q.start_at && Date.parse(q.start_at) <= a2 && (q.end_at ? Date.parse(q.end_at) : Infinity) >= a1
    && (q.end_at ? (Date.parse(q.end_at) - Date.parse(q.start_at)) / DAY_MS <= 31 : false)).length;
}

/** ค่าโค้ดโดยประมาณ — ลดเป็นบาท: ใช้ไป × ส่วนลด · ลด % / คืน coins: ไม่รู้ยอดต่อใบ = null */
export const voucherCostEstimate = (v: { reward_type: number | null; discount_amount: number | null; current_usage: number | null }): number | null =>
  v.reward_type === 1 && v.discount_amount != null && v.current_usage != null ? v.discount_amount * v.current_usage : null;

/** ส่วนลดจากรายได้ต่อออเดอร์ (Shopee escrow) — โค้ดร้าน (เฉพาะรุ่นที่แยกแล้ว fmt 2) · Shopee ช่วยออก */
export function discountSplit(incomes: readonly { fmt?: number; lines: { key: string; amount: number }[] }[]): { sellerVoucher: number; voucherCovered: number; shopeeFunded: number; orders: number } {
  let sellerVoucher = 0, voucherCovered = 0, shopeeFunded = 0;
  for (const inc of incomes) {
    if (inc.fmt === 2) { voucherCovered++; sellerVoucher += -(inc.lines.find((l) => l.key === "seller_voucher")?.amount ?? 0); }
    shopeeFunded += inc.lines.find((l) => l.key === "shopee_discount")?.amount ?? 0;
  }
  return { sellerVoucher, voucherCovered, shopeeFunded, orders: incomes.length };
}
