import { describe, expect, it } from "vitest";
import { computeTotals } from "@/app/api/so-orders/shared";

// ยอดใบสั่งขายต้องเก็บเป็น "บาท" — เครื่องคิดเงินกลางคืนสตางค์ ต้องแปลงก่อนเก็บ (เคยเก็บสตางค์ ยอดเกิน 100 เท่า)
describe("computeTotals (ใบสั่งขาย)", () => {
  it("2 × ฿100 + VAT 7% = ฿214", () => {
    const t = computeTotals({ vat_rate: 7, vat_included: false, wht_rate: 0 }, [{ product_name: "กระเป๋า", qty: 2, unit_price: 100 }]);
    expect(t.subtotal).toBe(200);
    expect(t.total_vat).toBe(14);
    expect(t.grand_total).toBe(214);
  });
  it("ไม่มี VAT", () => {
    const t = computeTotals({ vat_rate: 0, vat_included: false, wht_rate: 0 }, [{ product_name: "กระเป๋า", qty: 3, unit_price: 59.5 }]);
    expect(t.total_vat).toBe(0);
    expect(t.grand_total).toBe(178.5);
  });
});
