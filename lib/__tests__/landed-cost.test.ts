import { describe, it, expect } from "vitest";
import { computeVoucher, cbmFromCm, effectiveFx } from "@/lib/landed-cost";

describe("ใบสำคัญรับ — คิว/น้ำหนัก/ค่าส่งเฉลี่ย", () => {
  it("คิวจากขนาดซม. (21×30×4 = 0.00252 คิว) · ขนาดขาด = null", () => {
    expect(cbmFromCm(21, 30, 4)).toBe(0.00252);
    expect(cbmFromCm(21, 0, 4)).toBeNull();
    expect(cbmFromCm(null, 30, 4)).toBeNull();
  });

  it("เรท: THB = 1 · หยวนไม่มีเรท = 0", () => {
    expect(effectiveFx("THB", null)).toBe(1);
    expect(effectiveFx("RMB", 5.2)).toBe(5.2);
    expect(effectiveFx("RMB", null)).toBe(0);
  });

  // เคสจริงจากใบตีราคา: ¥3.5 × 5.2 = 18.20 · 1,000 ชิ้น × 0.00252 คิว = 2.52 คิว × 3,500 = 8,820 → ค่าส่ง/ชิ้น 8.82 → ถึงมือ 27.02
  it("แบบคิว: เรท × คิวรวม เฉลี่ยลงบรรทัด ต้นทุนถึงมือ = ราคา + ค่าส่ง/ชิ้น", () => {
    const { lines, totals } = computeVoucher(
      { currency: "RMB", fx_rate: 5.2, ship_method: "cube", ship_rate: 3500 },
      [{ qty: 1000, unit_price: 3.5, cbm_per_unit: 0.00252 }],
    );
    expect(lines[0].unit_price_thb).toBe(18.2);
    expect(lines[0].line_total_thb).toBe(18200);
    expect(totals.total_cbm).toBe(2.52);
    expect(totals.ship_total_thb).toBe(8820);
    expect(lines[0].ship_alloc_thb).toBe(8820);
    expect(lines[0].landed_unit_thb).toBe(27.02);
    expect(totals.subtotal_foreign).toBe(3500);
    expect(totals.grand_total_thb).toBe(27020);
  });

  it("แบบน้ำหนัก: เฉลี่ยตามสัดส่วนกก. · เศษปัดลงบรรทัดสุดท้าย รวมเท่ายอดค่าส่งเป๊ะ", () => {
    const { lines, totals } = computeVoucher(
      { currency: "THB", fx_rate: null, ship_method: "weight", ship_rate: 45 },
      [
        { qty: 3, unit_price: 100, kg_per_unit: 1 },      // 3 กก.
        { qty: 3, unit_price: 50, kg_per_unit: 1 },       // 3 กก.
        { qty: 1, unit_price: 20, kg_per_unit: 1 },       // 1 กก.
      ],
    );
    expect(totals.total_kg).toBe(7);
    expect(totals.ship_total_thb).toBe(315);              // 7 × 45
    const sum = lines.reduce((a, l) => a + l.ship_alloc_thb, 0);
    expect(Math.round(sum * 100) / 100).toBe(315);
    expect(lines[0].ship_alloc_thb).toBe(135);            // 3/7 × 315
    expect(lines[0].landed_unit_thb).toBe(145);           // 100 + 135/3
  });

  it("กรอกยอดค่าส่งจริงทับ → ใช้ยอดนั้น แต่ยังบอกยอดตามเรทไว้เทียบ", () => {
    const { totals } = computeVoucher(
      { currency: "THB", fx_rate: null, ship_method: "cube", ship_rate: 3500, ship_manual_total: 9000 },
      [{ qty: 10, unit_price: 10, cbm_per_unit: 0.1 }],
    );
    expect(totals.ship_from_rate_thb).toBe(3500);
    expect(totals.ship_total_thb).toBe(9000);
    expect(totals.grand_total_thb).toBe(9100);
  });

  it("ไม่มีคิว/กก.เลย → เฉลี่ยตามจำนวนชิ้น + นับบรรทัดที่ขาดข้อมูล · ไม่มีราคา = นับ missing", () => {
    const { lines, totals } = computeVoucher(
      { currency: "THB", fx_rate: null, ship_method: "cube", ship_rate: 3500, ship_manual_total: 100 },
      [{ qty: 3, unit_price: null }, { qty: 1, unit_price: 5 }],
    );
    expect(totals.missing_basis_count).toBe(2);
    expect(totals.missing_price_count).toBe(1);
    expect(lines[0].ship_alloc_thb).toBe(75);
    expect(lines[1].ship_alloc_thb).toBe(25);
    expect(lines[0].has_price).toBe(false);
  });

  it("ไม่คิดค่าส่ง (none) → ค่าส่ง 0 ทุกบรรทัด", () => {
    const { lines, totals } = computeVoucher(
      { currency: "RMB", fx_rate: 5, ship_method: "none", ship_rate: 3500 },
      [{ qty: 2, unit_price: 10, cbm_per_unit: 1 }],
    );
    expect(totals.ship_total_thb).toBe(0);
    expect(lines[0].ship_alloc_thb).toBe(0);
    expect(lines[0].landed_unit_thb).toBe(50);
    expect(totals.missing_basis_count).toBe(0);
  });
});
