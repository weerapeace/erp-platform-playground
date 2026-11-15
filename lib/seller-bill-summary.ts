/**
 * บิลร้าน — "สรุปยอดบิล" (付款详情 ของ Taobao/1688) แบบ pure (ใช้ได้ทั้งหน้าเว็บและเซิร์ฟเวอร์)
 * ★ 2026-11-15 เจ้าของ: "ยอดสุดท้ายไม่ตรงบิล รวมทั้งสิ้นต้องได้ 347.53 (ตามบิล)"
 *   บิลจริง: 商品总价 ¥69.10 − 店铺优惠 ¥5 − 回头客 ¥5.50 + 运费 ¥8 + 支付手续费 ฿10.12 = 实付款 ฿347.53
 *   ใบเดิม: ราคา ¥5.86 (หักส่วนลดมาแล้ว) แต่ระบบหักส่วนลด ¥5 ซ้ำ + ไม่มีค่าส่งในจีน/ค่าธรรมเนียม → ฿272.29
 *   normalizeBillSummary / summaryFromAi: ค่าที่ AI อ่าน / คนแก้ → รูปเดียวกัน
 *   reconcileBillDiscount: ราคาในแถวหักส่วนลดมาแล้ว → ล้างส่วนลดแถว (กันหักซ้ำ) · ราคายังไม่หัก → แบ่งส่วนลดท้ายบิลลงแถวตามมูลค่า
 *   billPaidFx: เรทจากยอดจ่ายจริง = (ยอดจ่าย ฿ − ค่าธรรมเนียม ฿) ÷ (ค่าสินค้า ¥ + ค่าส่งในจีน ¥)
 * เก็บที่ purchase_delivery_bills.summary · ใส่ลงใบ → หัวใบ seller_ship_foreign / pay_fee_thb / paid_total_thb (lib/seller-bill syncSellerBillExtras)
 * ทดสอบ: lib/__tests__/seller-bill-summary.test.ts
 */
import { billLineDiscount, type SellerBillLine } from "@/lib/seller-bill-match";

export type BillCur = "THB" | "CNY";
export type BillSummary = {
  goods_total: number | null;      // 商品总价 (สกุลบิล)
  discount_total: number | null;   // ส่วนลดท้ายบิลรวม (店铺优惠 + 平台优惠 + 立减 …) ยอดบวก
  discount_in_price: boolean;      // ราคาในแถวหักส่วนลดนี้มาแล้ว (ไม่หักซ้ำ)
  ship: number | null;             // 运费 ค่าส่งในจีน (สกุลบิล)
  fee: number | null;              // 支付手续费 ค่าธรรมเนียมจ่ายเงิน
  fee_currency: BillCur | null;
  paid_total: number | null;       // 实付款 ยอดจ่ายจริง
  paid_currency: BillCur | null;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[,，¥￥฿\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const pos = (v: unknown) => { const n = num(v); return n != null && n > 0 ? r2(n) : null; };
export const billCur = (v: unknown): BillCur | null => {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return null;
  if (/THB|฿|BAHT|บาท/.test(s)) return "THB";
  if (/CNY|RMB|YUAN|¥|￥|元/.test(s)) return "CNY";
  return null;
};

export const emptySummary = (): BillSummary => ({ goods_total: null, discount_total: null, discount_in_price: false, ship: null, fee: null, fee_currency: null, paid_total: null, paid_currency: null });
export const summaryIsEmpty = (s: BillSummary | null | undefined) => !s || [s.goods_total, s.discount_total, s.ship, s.fee, s.paid_total].every((x) => x == null);

/** ค่าที่เก็บ/ที่หน้าเว็บส่งมา → รูปเดียวกัน · ว่างทั้งหมด = null */
export function normalizeBillSummary(raw: unknown): BillSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s: BillSummary = {
    goods_total: pos(r.goods_total), discount_total: pos(r.discount_total), discount_in_price: r.discount_in_price === true,
    ship: pos(r.ship), fee: pos(r.fee), fee_currency: billCur(r.fee_currency), paid_total: pos(r.paid_total), paid_currency: billCur(r.paid_currency),
  };
  if (s.fee != null && !s.fee_currency) s.fee_currency = "CNY";
  if (s.paid_total != null && !s.paid_currency) s.paid_currency = "CNY";
  return summaryIsEmpty(s) ? null : s;
}

/** กล่อง payment ที่ AI อ่าน ({goods_total, discounts:[{label, amount}], ship, fee, fee_currency, paid_total, paid_currency}) → BillSummary */
export function summaryFromAi(payment: unknown): BillSummary | null {
  if (!payment || typeof payment !== "object") return null;
  const p = payment as Record<string, unknown>;
  const ds = Array.isArray(p.discounts) ? (p.discounts as Record<string, unknown>[]) : [];
  const dsum = ds.reduce((a, d) => a + Math.abs(num(d?.amount) ?? 0), 0);
  return normalizeBillSummary({ ...p, discount_total: dsum > 0 ? dsum : p.discount_total, discount_in_price: false });
}

const isGoods = (l: SellerBillLine) => !l.is_fee && l.decision !== "skip";
/** ค่าสินค้าในบิล (หลังหักส่วนลดแถว) — แถวสินค้าที่ไม่ได้ข้าม */
export function billNetGoods(lines: SellerBillLine[]): number {
  return r2(lines.filter(isGoods).reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.unit_price) || 0) - billLineDiscount({ ...l, amount: null }), 0));
}

/**
 * กันหักส่วนลดซ้ำ / ใส่ส่วนลดท้ายบิล
 *   ราคาในแถวรวม = ยอดสินค้า − ส่วนลด → ราคาหักมาแล้ว: ล้างส่วนลดแถว · discount_in_price = true
 *   ราคาในแถวรวม = ยอดสินค้า (ยังไม่หัก) และส่วนลดแถวยังไม่ครบ → แบ่งส่วนลดท้ายบิลลงแถวตามมูลค่า
 *   ค่าส่งในจีนอยู่ในสรุปแล้ว → แถว 运费 ที่ยอดเท่ากัน = ข้าม (ไม่นับซ้ำ)
 */
export function reconcileBillDiscount(lines: SellerBillLine[], s: BillSummary | null): { lines: SellerBillLine[]; summary: BillSummary | null; changed: "cleared" | "distributed" | null } {
  if (!s) return { lines, summary: s, changed: null };
  let out = lines;
  if (s.ship != null) {
    out = out.map((l) => (l.is_fee && !l.decision && l.amount != null && Math.abs(Number(l.amount) - Number(s.ship)) < 0.01 && /运费|快递|物流/.test(`${l.name_cn ?? ""}${l.spec_cn ?? ""}`) ? { ...l, decision: "skip" as const } : l));
  }
  const G = Number(s.goods_total) || 0, D = Number(s.discount_total) || 0;
  if (!(G > 0) || !(D > 0)) return { lines: out, summary: s, changed: null };
  const goods = out.filter(isGoods);
  const gross = r2(goods.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0));
  const lineDisc = r2(goods.reduce((a, l) => a + billLineDiscount({ ...l, amount: null }), 0));
  const tol = Math.max(0.05, G * 0.002);
  if (Math.abs(gross - (G - D)) <= tol) {
    return { lines: out.map((l) => (isGoods(l) && (l.discount != null || l.discount_pct != null) ? { ...l, discount: null, discount_pct: null } : l)), summary: { ...s, discount_in_price: true }, changed: lineDisc > 0 ? "cleared" : null };
  }
  if (Math.abs(gross - G) <= tol && Math.abs(lineDisc - D) > 0.01 && gross > 0) {
    const idx = out.map((l, i) => (isGoods(l) ? i : -1)).filter((i) => i >= 0);
    let left = D;
    const next = out.map((l) => ({ ...l }));
    idx.forEach((i, k) => {
      const g = (Number(next[i].qty) || 0) * (Number(next[i].unit_price) || 0);
      const share = k === idx.length - 1 ? r2(left) : r2(D * g / gross);
      left = r2(left - share);
      next[i] = { ...next[i], discount: share > 0 ? share : null, discount_pct: null };
    });
    return { lines: next, summary: { ...s, discount_in_price: false }, changed: "distributed" };
  }
  return { lines: out, summary: s, changed: null };
}

/** เรทจากยอดจ่ายจริง (บาทต่อ 1 หยวน) — ยอดจ่ายเป็นบาทเท่านั้น · ค่าธรรมเนียมเป็นบาทหักออกก่อน / เป็นหยวนบวกเข้ายอดหยวน */
export function billPaidFx(s: BillSummary | null, goodsForeign: number): number | null {
  if (!s || s.paid_currency !== "THB" || !(Number(s.paid_total) > 0)) return null;
  const feeThb = s.fee_currency === "THB" ? Number(s.fee) || 0 : 0;
  const feeF = s.fee_currency === "CNY" ? Number(s.fee) || 0 : 0;
  const foreign = (Number(goodsForeign) || 0) + (Number(s.ship) || 0) + feeF;
  const thb = Number(s.paid_total) - feeThb;
  if (!(foreign > 0) || !(thb > 0)) return null;
  return Math.round((thb / foreign) * 1e6) / 1e6;
}
