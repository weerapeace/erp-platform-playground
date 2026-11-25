import { describe, expect, it } from "vitest";
import { discountSplit, overlapCount, promoEffect, voucherCostEstimate } from "../marketing-promos-calc";
import { parseDiscounts, parseFlashSales, parseVouchers } from "../shopee-promos";
import { shopeeIncomeOf } from "../shopee";

const day = (d: string) => new Date(Date.parse(`${d}T03:00:00+07:00`)).toISOString();
const daily = new Map<string, number>();
for (let i = 1; i <= 7; i++) daily.set(`2026-11-${String(10 + i).padStart(2, "0")}`, 1000);   // 11-11..11-17 ปกติ 1,000
daily.set("2026-11-18", 1500); daily.set("2026-11-19", 1300);

describe("ผลของโปร", () => {
  it("ได้ผล / เสมอตัว / ลดตลอด / ยังไม่เริ่ม / ข้อมูลไม่พอ", () => {
    expect(promoEffect({ start_at: day("2026-11-18"), end_at: day("2026-11-19") }, daily, "2026-11-25")).toMatchObject({ effect: "worked", lift: 0.4, days: 2 });
    daily.set("2026-11-20", 1050);
    expect(promoEffect({ start_at: day("2026-11-20"), end_at: day("2026-11-20") }, daily, "2026-11-25").effect).toBe("flat");
    expect(promoEffect({ start_at: day("2026-09-01"), end_at: day("2026-11-20") }, daily, "2026-11-25").effect).toBe("always_on");
    expect(promoEffect({ start_at: day("2026-12-01"), end_at: null }, daily, "2026-11-25").effect).toBe("upcoming");
    expect(promoEffect({ start_at: day("2026-11-12"), end_at: day("2026-11-12") }, daily, "2026-11-25").effect).toBe("no_data");
  });
  it("โปรซ้อน (ไม่นับโปรลดตลอด)", () => {
    const a = { promo_id: "1", kind: "voucher", start_at: day("2026-11-18"), end_at: day("2026-11-20") };
    const all = [a, { promo_id: "2", kind: "flash_sale", start_at: day("2026-11-19"), end_at: day("2026-11-19") }, { promo_id: "3", kind: "discount", start_at: day("2026-01-01"), end_at: day("2026-12-31") }];
    expect(overlapCount(a, all)).toBe(1);
  });
  it("ค่าโค้ดประมาณ", () => {
    expect(voucherCostEstimate({ reward_type: 1, discount_amount: 50, current_usage: 12 })).toBe(600);
    expect(voucherCostEstimate({ reward_type: 2, discount_amount: null, current_usage: 12 })).toBeNull();
  });
});

describe("ส่วนลด", () => {
  it("แยกโค้ดร้านจากรายได้ (รุ่นใหม่) + Shopee ช่วยออก", () => {
    const inc = shopeeIncomeOf({ response: { order_income: { original_price: 1000, seller_discount: 500, voucher_from_seller: 50, voucher_from_shopee: 30, coins: 10, escrow_amount: 380 } } });
    expect(inc.fmt).toBe(2);
    expect(inc.lines.find((l) => l.key === "seller_discount")?.amount).toBe(-500);
    expect(inc.lines.find((l) => l.key === "seller_voucher")?.amount).toBe(-50);
    const s = discountSplit([inc, { lines: [{ key: "seller_discount", amount: -300 }, { key: "shopee_discount", amount: 20 }] }]);
    expect(s).toEqual({ sellerVoucher: 50, voucherCovered: 1, shopeeFunded: 60, orders: 2 });
  });
});

describe("แปลงคำตอบโปร Shopee", () => {
  it("โค้ด / ลดราคา / แฟลชเซล", () => {
    const v = parseVouchers({ response: { more: true, voucher_list: [{ voucher_id: 39, voucher_code: "T1", voucher_name: "ลด 60", reward_type: 1, usage_quantity: 11, current_usage: 3, start_time: 1656647700, end_time: 1659243300, discount_amount: 60, voucher_purpose: 3 }] } });
    expect(v.more).toBe(true);
    expect(v.rows[0]).toMatchObject({ kind: "voucher", promo_id: "39", code: "T1", usage_quantity: 11, current_usage: 3, discount_amount: 60, purpose: 3, start_at: "2022-07-01T03:55:00.000Z" });
    expect(parseDiscounts({ response: { more: false, discount_list: [{ discount_id: 66, discount_name: "x", status: "ongoing", start_time: 1644910200, end_time: 1645864200 }] } }).rows[0]).toMatchObject({ kind: "discount", promo_id: "66", status: "ongoing" });
    expect(parseFlashSales({ response: { total_count: 1, flash_sale_list: [{ flash_sale_id: 7, status: 1, start_time: 1721978628, end_time: 1727335428, enabled_item_count: 10, remindme_count: 100, click_count: 200 }] } }).rows[0]).toMatchObject({ kind: "flash_sale", status: "enabled", item_count: 10, remind_count: 100, click_count: 200 });
  });
});
