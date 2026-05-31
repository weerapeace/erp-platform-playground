import { describe, it, expect } from "vitest";
import { calculateLine, calculateDocument } from "@/lib/tax";
import { toMajor } from "@/lib/money";

describe("tax — calculateLine: basic", () => {
  it("no tax, no discount — qty=2 × 100 = subtotal 200, net 200", () => {
    const r = calculateLine({ qty: 2, unit_price: 100 });
    expect(toMajor(r.subtotal.amount)).toBe(200);
    expect(toMajor(r.net.amount)).toBe(200);
    expect(toMajor(r.vat_amount.amount)).toBe(0);
    expect(toMajor(r.line_total.amount)).toBe(200);
  });

  it("VAT excluded 7% — net 100 → vat 7, line_total 107", () => {
    const r = calculateLine({ qty: 1, unit_price: 100 }, { vat_rate: 7, vat_included: false });
    expect(toMajor(r.net.amount)).toBe(100);
    expect(toMajor(r.vat_amount.amount)).toBe(7);
    expect(toMajor(r.line_total.amount)).toBe(107);
  });

  it("VAT included 7% — gross 107 → vat 7.00, net 107 (line_total = net)", () => {
    const r = calculateLine({ qty: 1, unit_price: 107 }, { vat_rate: 7, vat_included: true });
    expect(toMajor(r.net.amount)).toBe(107);
    expect(toMajor(r.vat_amount.amount)).toBe(7);
    expect(toMajor(r.line_total.amount)).toBe(107);  // included → no addition
  });
});

describe("tax — calculateLine: discount", () => {
  it("line percent discount 10% — subtotal 200, discount 20, net 180", () => {
    const r = calculateLine({ qty: 2, unit_price: 100, discount: { type: "percent", value: 10 } });
    expect(toMajor(r.subtotal.amount)).toBe(200);
    expect(toMajor(r.discount.amount)).toBe(20);
    expect(toMajor(r.net.amount)).toBe(180);
  });

  it("line amount discount 30 — subtotal 200, discount 30, net 170", () => {
    const r = calculateLine({ qty: 2, unit_price: 100, discount: { type: "amount", value: 30 } });
    expect(toMajor(r.discount.amount)).toBe(30);
    expect(toMajor(r.net.amount)).toBe(170);
  });

  it("discount + VAT excluded — net 180, vat 12.60, total 192.60", () => {
    const r = calculateLine(
      { qty: 2, unit_price: 100, discount: { type: "percent", value: 10 } },
      { vat_rate: 7 },
    );
    expect(toMajor(r.net.amount)).toBe(180);
    expect(toMajor(r.vat_amount.amount)).toBe(12.6);
    expect(toMajor(r.line_total.amount)).toBe(192.6);
  });
});

describe("tax — calculateLine: WHT", () => {
  it("WHT 3% on net 1000 → wht 30", () => {
    const r = calculateLine({ qty: 1, unit_price: 1000 }, { wht_rate: 3 });
    expect(toMajor(r.wht_amount.amount)).toBe(30);
  });

  it("WHT + VAT excluded — wht on net (before VAT)", () => {
    const r = calculateLine({ qty: 1, unit_price: 1000 }, { vat_rate: 7, wht_rate: 3 });
    expect(toMajor(r.net.amount)).toBe(1000);
    expect(toMajor(r.vat_amount.amount)).toBe(70);
    expect(toMajor(r.wht_amount.amount)).toBe(30);   // 3% × 1000 (ก่อน VAT)
  });

  it("WHT + VAT included — wht on (net − vat)", () => {
    // gross 1070, vat = 70 → wht base = 1000 → wht = 30
    const r = calculateLine({ qty: 1, unit_price: 1070 }, { vat_rate: 7, vat_included: true, wht_rate: 3 });
    expect(toMajor(r.vat_amount.amount)).toBe(70);
    expect(toMajor(r.wht_amount.amount)).toBe(30);
  });
});

describe("tax — calculateDocument: realistic invoice", () => {
  it("3 lines + VAT 7% excluded + shipping 50", () => {
    const r = calculateDocument({
      currency: "THB",
      lines: [
        { qty: 2, unit_price: 100 },    // 200
        { qty: 1, unit_price: 500 },    // 500
        { qty: 3, unit_price: 50 },     // 150
      ],
      shipping_fee: 50,
      tax: { vat_rate: 7 },
    });
    expect(toMajor(r.subtotal.amount)).toBe(850);
    expect(toMajor(r.shipping.amount)).toBe(50);
    expect(toMajor(r.taxable.amount)).toBe(900);   // 850 + 50 - 0
    // Implementation: VAT คำนวณ per-line (เพราะ defaultTax กระจายไป line) → sum, ไม่บวก shipping เข้า VAT
    // 7% × (200 + 500 + 150) = 14 + 35 + 10.5 = 59.5
    expect(toMajor(r.total_vat.amount)).toBe(59.5);
    expect(toMajor(r.grand_total.amount)).toBe(959.5);  // taxable 900 + VAT 59.5
    expect(toMajor(r.amount_due.amount)).toBe(959.5);   // no WHT
  });

  it("header discount 5% — taxable ลด, VAT ยึดตาม line (ไม่ recompute)", () => {
    const r = calculateDocument({
      lines: [{ qty: 1, unit_price: 1000 }],
      header_discount: { type: "percent", value: 5 },
      tax: { vat_rate: 7 },
    });
    expect(toMajor(r.net_before_header_disc.amount)).toBe(1000);
    expect(toMajor(r.header_discount.amount)).toBe(50);
    expect(toMajor(r.taxable.amount)).toBe(950);
    // หมายเหตุ design: VAT ใน implementation มาจาก line-level (7%×1000 = 70) ไม่ปรับตาม header discount
    expect(toMajor(r.total_vat.amount)).toBe(70);
    expect(toMajor(r.grand_total.amount)).toBe(1020);
  });

  it("WHT 3% on doc — amount_due < grand_total", () => {
    const r = calculateDocument({
      lines: [{ qty: 1, unit_price: 1000 }],
      tax: { vat_rate: 7, wht_rate: 3 },
    });
    expect(toMajor(r.grand_total.amount)).toBe(1070);  // 1000 + VAT 70
    expect(toMajor(r.total_wht.amount)).toBe(30);      // 3% × 1000 (taxable ก่อน VAT)
    expect(toMajor(r.amount_due.amount)).toBe(1040);
  });

  it("VAT included — grand_total = taxable", () => {
    const r = calculateDocument({
      lines: [{ qty: 1, unit_price: 107 }],
      tax: { vat_rate: 7, vat_included: true },
    });
    expect(toMajor(r.taxable.amount)).toBe(107);
    expect(toMajor(r.grand_total.amount)).toBe(107);
    expect(toMajor(r.total_vat.amount)).toBe(7);
  });

  it("empty doc — all zero", () => {
    const r = calculateDocument({ lines: [] });
    expect(toMajor(r.subtotal.amount)).toBe(0);
    expect(toMajor(r.grand_total.amount)).toBe(0);
    expect(toMajor(r.amount_due.amount)).toBe(0);
  });
});
