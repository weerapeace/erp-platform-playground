import { describe, it, expect } from "vitest";
import { billNetGoods, billPaidFx, normalizeBillSummary, reconcileBillDiscount, summaryFromAi, billCur } from "@/lib/seller-bill-summary";
import { normalizeBillLine } from "@/lib/seller-bill-match";
import { computeVoucher, fxForTargetThb } from "@/lib/landed-cost";

const line = (o: Record<string, unknown>) => normalizeBillLine({ name_cn: "x", qty: 10, unit_price: 5.86, amount: 58.6, ...o });

describe("seller-bill-summary — บิล Taobao จริง (เจ้าของ 2026-11-15: ต้องได้ ฿347.53)", () => {
  const s = summaryFromAi({ goods_total: 69.1, discounts: [{ label: "店铺优惠", amount: 5 }, { label: "回头客立减", amount: -5.5 }], ship: 8, fee: 10.12, fee_currency: "THB", paid_total: 347.53, paid_currency: "THB" })!;
  it("อ่านกล่อง payment → รวมส่วนลด ¥10.50 · สกุล THB", () => {
    expect(s).toMatchObject({ goods_total: 69.1, discount_total: 10.5, ship: 8, fee: 10.12, fee_currency: "THB", paid_total: 347.53, paid_currency: "THB" });
  });
  it("ราคา ¥5.86 หักส่วนลดมาแล้ว → ล้างส่วนลด ¥5 ที่ AI ใส่ซ้ำ", () => {
    const r = reconcileBillDiscount([line({ discount: 5 })], s);
    expect(r.changed).toBe("cleared");
    expect(r.summary?.discount_in_price).toBe(true);
    expect(r.lines[0].discount).toBeNull();
    expect(billNetGoods(r.lines)).toBe(58.6);
  });
  it("เรทจากยอดจ่ายจริง = 5.066216 · ใบรวมทั้งสิ้นได้ ฿347.53 พอดี", () => {
    const fx = billPaidFx(s, 58.6)!;
    expect(fx).toBeCloseTo(5.066216, 5);
    const header = { currency: "RMB", fx_rate: null, ship_method: "none" as const, seller_ship_foreign: 8, pay_fee_thb: 10.12 };
    const lines = [{ qty: 10, unit_price: 5.86 }];
    const exact = fxForTargetThb(header, lines, 347.53, "shop")!;
    const t = computeVoucher({ ...header, fx_rate: exact }, lines).totals;
    expect(t.shop_total_thb).toBe(347.53);
    expect(t.grand_total_thb).toBe(347.53);
    expect(t.seller_ship_thb).toBeCloseTo(40.53, 2);
  });
  it("ราคายังไม่หัก → แบ่งส่วนลดท้ายบิลลงแถวตามมูลค่า", () => {
    const s2 = normalizeBillSummary({ goods_total: 100, discount_total: 10 })!;
    const r = reconcileBillDiscount([line({ qty: 6, unit_price: 10, amount: 60 }), line({ qty: 4, unit_price: 10, amount: 40 })], s2);
    expect(r.changed).toBe("distributed");
    expect(r.lines.map((l) => l.discount)).toEqual([6, 4]);
    expect(billNetGoods(r.lines)).toBe(90);
  });
  it("แถว 运费 ยอดเท่าค่าส่งในสรุป = ข้าม (ไม่นับซ้ำ) · สกุลเงิน", () => {
    const r = reconcileBillDiscount([line({}), normalizeBillLine({ name_cn: "运费", amount: 8, is_fee: true })], normalizeBillSummary({ ship: 8 }));
    expect(r.lines[1].decision).toBe("skip");
    expect([billCur("฿"), billCur("RMB"), billCur("¥"), billCur("x")]).toEqual(["THB", "CNY", "CNY", null]);
    expect(normalizeBillSummary({})).toBeNull();
  });
});

describe("landed-cost — ค่าส่งในจีน + ค่าธรรมเนียม เฉลี่ยเข้าต้นทุนตามมูลค่า", () => {
  it("แบ่งตามค่าสินค้า เศษลงบรรทัดสุดท้าย · ใบเดิมไม่มีค่าเหล่านี้ = เหมือนเดิม", () => {
    const h = { currency: "RMB", fx_rate: 5, ship_method: "none" as const, seller_ship_foreign: 3, pay_fee_thb: 1 };
    const c = computeVoucher(h, [{ qty: 1, unit_price: 10 }, { qty: 2, unit_price: 10 }]);
    expect(c.lines.map((l) => l.extra_alloc_thb)).toEqual([5.33, 10.67]);
    expect(c.totals.shop_total_thb).toBe(166);
    expect(c.lines[1].landed_unit_thb).toBeCloseTo(55.335, 3);
    const old = computeVoucher({ currency: "RMB", fx_rate: 5, ship_method: "none" }, [{ qty: 1, unit_price: 10 }]);
    expect(old.totals.grand_total_thb).toBe(50);
    expect(old.lines[0].landed_unit_thb).toBe(50);
  });
});

describe("landed-cost — ค่าส่งพิมพ์เอง (★ 2026-11-15)", () => {
  it("ใบตั้งไม่คิดค่าส่ง แต่พิมพ์ยอดเอง = นับ + เฉลี่ยตามจำนวนชิ้น · ไม่พิมพ์ = 0 เหมือนเดิม", () => {
    const lines = [{ qty: 30, unit_price: 1 }, { qty: 10, unit_price: 2 }];
    const c = computeVoucher({ currency: "RMB", fx_rate: 5, ship_method: "none", ship_manual_total: 120 }, lines);
    expect(c.totals.ship_total_thb).toBe(120);
    expect(c.lines.map((l) => l.ship_alloc_thb)).toEqual([90, 30]);
    expect(c.totals.grand_total_thb).toBe(370);
    expect(computeVoucher({ currency: "RMB", fx_rate: 5, ship_method: "none" }, lines).totals.ship_total_thb).toBe(0);
    // คิดตามคิวแต่ไม่มีคิวเลย + พิมพ์ยอดเอง = เฉลี่ยตามจำนวนชิ้นของบรรทัดที่คิดค่าส่ง
    const c2 = computeVoucher({ currency: "RMB", fx_rate: 5, ship_method: "cube", ship_rate_cube: 7000, ship_manual_total: 80 }, lines);
    expect(c2.lines.map((l) => l.ship_alloc_thb)).toEqual([60, 20]);
  });
});
