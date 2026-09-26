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
      { currency: "RMB", fx_rate: 5.2, ship_method: "cube", ship_rate_cube: 3500, ship_rate_kg: null },
      [{ qty: 1000, unit_price: 3.5, cbm_per_unit: 0.00252 }],
    );
    expect(lines[0].unit_price_thb).toBe(18.2);
    expect(lines[0].line_total_thb).toBe(18200);
    expect(totals.total_cbm).toBe(2.52);
    expect(totals.charged_cbm).toBe(2.52);
    expect(totals.ship_total_thb).toBe(8820);
    expect(lines[0].ship_alloc_thb).toBe(8820);
    expect(lines[0].landed_unit_thb).toBe(27.02);
    expect(totals.grand_total_thb).toBe(27020);
  });

  it("ข้อมูลเก่าที่มี ship_rate ตัวเดียว ยังคิดได้เหมือนเดิม", () => {
    const { totals } = computeVoucher(
      { currency: "THB", fx_rate: null, ship_method: "weight", ship_rate: 45 },
      [{ qty: 7, unit_price: 10, kg_per_unit: 1 }],
    );
    expect(totals.ship_total_thb).toBe(315);
  });

  // ใบส่งของจริง: BOX (คิว) + CLOTH BLOCK (น้ำหนัก) ในใบเดียว — บรรทัดเลือกวิธีคิดเอง
  it("ผสมวิธีคิดในใบเดียว: BOX ตามคิว · CLOTH BLOCK ตามน้ำหนัก · รวมค่าส่งจากทั้งสองแบบ", () => {
    const { lines, totals } = computeVoucher(
      { currency: "RMB", fx_rate: 5, ship_method: "cube", ship_rate_cube: 3500, ship_rate_kg: 45 },
      [
        { qty: 20, unit_price: 2, cbm_per_unit: 0.000495, kg_per_unit: 0.125, ship_method: "cube" },     // กล่อง 0.0099 คิว → 34.65
        { qty: 1, unit_price: 100, cbm_per_unit: 0.0204, kg_per_unit: 9.22, ship_method: "weight" },    // บล็อกผ้า 9.22 กก. → 414.90
        { qty: 5, unit_price: 1, cbm_per_unit: 0.001, kg_per_unit: 1 },                                  // ไม่ระบุ → ตามใบ = คิว 0.005 → 17.50
      ],
    );
    expect(lines[0].method).toBe("cube"); expect(lines[0].ship_alloc_thb).toBe(34.65);
    expect(lines[1].method).toBe("weight"); expect(lines[1].ship_alloc_thb).toBe(414.9);
    expect(lines[2].method).toBe("cube"); expect(lines[2].ship_alloc_thb).toBe(17.5);
    expect(totals.charged_cbm).toBe(0.0149);
    expect(totals.charged_kg).toBe(9.22);
    expect(totals.ship_total_thb).toBe(467.05);
    expect(totals.missing_rate_count).toBe(0);
  });

  it("กรอกยอดค่าส่งจริงทับ → เฉลี่ยตามสัดส่วนค่าส่งตามเรท รวมเท่ายอดจริงเป๊ะ", () => {
    const { lines, totals } = computeVoucher(
      { currency: "THB", fx_rate: null, ship_method: "cube", ship_rate_cube: 3500, ship_rate_kg: 45, ship_manual_total: 1000 },
      [
        { qty: 1, unit_price: 10, cbm_per_unit: 0.1, ship_method: "cube" },      // 350 ตามเรท
        { qty: 1, unit_price: 10, kg_per_unit: 10, ship_method: "weight" },      // 450 ตามเรท
      ],
    );
    expect(totals.ship_from_rate_thb).toBe(800);
    expect(totals.ship_total_thb).toBe(1000);
    expect(lines[0].ship_alloc_thb).toBe(437.5);
    expect(lines[1].ship_alloc_thb).toBe(562.5);
    expect(totals.grand_total_thb).toBe(1020);
  });

  it("ไม่มีคิว/กก.เลย + ยอดจริง → เฉลี่ยตามจำนวนชิ้น · นับบรรทัดที่ขาดข้อมูล/ไม่มีราคา", () => {
    const { lines, totals } = computeVoucher(
      { currency: "THB", fx_rate: null, ship_method: "cube", ship_rate_cube: 3500, ship_manual_total: 100 },
      [{ qty: 3, unit_price: null }, { qty: 1, unit_price: 5 }],
    );
    expect(totals.missing_basis_count).toBe(2);
    expect(totals.missing_price_count).toBe(1);
    expect(lines[0].ship_alloc_thb).toBe(75);
    expect(lines[1].ship_alloc_thb).toBe(25);
  });

  it("มีปริมาณแต่ไม่มีเรทของวิธีนั้น → นับ missing_rate", () => {
    const { totals } = computeVoucher(
      { currency: "THB", fx_rate: null, ship_method: "cube", ship_rate_cube: 3500, ship_rate_kg: null },
      [{ qty: 1, unit_price: 1, kg_per_unit: 2, ship_method: "weight" }],
    );
    expect(totals.missing_rate_count).toBe(1);
    expect(totals.ship_total_thb).toBe(0);
  });

  it("ไม่คิดค่าส่ง (none) → ค่าส่ง 0 ทุกบรรทัด", () => {
    const { lines, totals } = computeVoucher(
      { currency: "RMB", fx_rate: 5, ship_method: "none", ship_rate_cube: 3500 },
      [{ qty: 2, unit_price: 10, cbm_per_unit: 1 }],
    );
    expect(totals.ship_total_thb).toBe(0);
    expect(lines[0].ship_alloc_thb).toBe(0);
    expect(lines[0].landed_unit_thb).toBe(50);
  });
});
