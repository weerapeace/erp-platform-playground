import { describe, expect, it } from "vitest";
import { applyShipFixes, isQuickFix, mappedUnapplied, shipZeroCauses } from "../voucher-ship-zero";
import type { VoucherHeaderInput, VoucherLineInput } from "../landed-cost";

const H: VoucherHeaderInput = { currency: "RMB", fx_rate: 5, ship_method: "cube", ship_rate_cube: 7000, ship_rate_kg: null, ship_manual_total: null };
// ใบจริง PV2026-11-18-004: 1000 ชิ้น · คิดตาม กก. · กล่อง 0.52 กก. / 0.0056 คิว · ช่องยอดจริง = 0
const L: VoucherLineInput[] = [{ qty: 1000, unit_price: 1, kg_per_unit: 0.00052, cbm_per_unit: 0.0000056, ship_method: "weight" }];

describe("shipZeroCauses", () => {
  it("ค่าส่ง > 0 = ไม่มีสาเหตุ", () => {
    const r = shipZeroCauses({ header: H, lines: [{ ...L[0], ship_method: null }] });
    expect(r.ship_thb).toBeCloseTo(39.2, 2);
    expect(r.causes).toEqual([]);
  });

  it("เคสจริง: ยอดจริง 0 + คิดตาม กก. แต่มีแค่เรทคิว → 2 สาเหตุ แก้ทั้งหมด = ฿39.20", () => {
    const r = shipZeroCauses({ header: { ...H, ship_manual_total: 0 }, lines: L, delivery: { mineRows: 1, unappliedRows: 0, unmappedRows: 0 } });
    expect(r.ship_thb).toBe(0);
    expect(r.causes.map((c) => c.key)).toEqual(["manual_zero", "no_rate"]);
    expect(r.causes[1].fix).toEqual({ kind: "switch_method", to: "cube", line_idx: [0] });
    expect(r.causes[1].text).toContain("เรทต่อคิว ฿7,000");
    // แก้ข้อเดียวยังเป็น 0 (อีกข้อยังทับอยู่) → ไม่โชว์ยอดล่วงหน้า
    expect(r.causes[0].preview_thb).toBeNull();
    expect(r.causes[1].preview_thb).toBeNull();
    expect(r.preview_all_thb).toBeCloseTo(39.2, 2);
  });

  it("ยอดจริง 0 อย่างเดียว → ล้างแล้วได้ค่าส่งตามเรท", () => {
    const r = shipZeroCauses({ header: { ...H, ship_manual_total: 0 }, lines: [{ ...L[0], ship_method: null }] });
    expect(r.causes.map((c) => c.key)).toEqual(["manual_zero"]);
    expect(r.causes[0].preview_thb).toBeCloseTo(39.2, 2);
  });

  it("ไม่มีเรทของทั้งสองวิธี → ปุ่มไปใส่เรท", () => {
    const r = shipZeroCauses({ header: { ...H, ship_rate_cube: null, ship_rate: null }, lines: [{ ...L[0], ship_method: null }] });
    expect(r.causes).toHaveLength(1);
    expect(r.causes[0]).toMatchObject({ key: "no_rate", fix: { kind: "goto_ship" } });
    expect(r.preview_all_thb).toBeNull();
  });

  it("กล่องยังไม่ได้ใช้/จับคู่ → บอกก่อน · ไม่ซ้ำกับ 'ไม่มีคิว/กก.'", () => {
    const r = shipZeroCauses({ header: H, lines: [{ qty: 10, unit_price: 1, ship_method: null }], delivery: { mineRows: 3, unappliedRows: 2, unmappedRows: 1 } });
    expect(r.causes.map((c) => c.key)).toEqual(["unapplied", "unmapped"]);
    expect(r.causes[0].fix.kind).toBe("apply");
    expect(r.causes[0].text).toContain("1 กล่อง");   // 2 ที่ยังไม่ใช้ − 1 ที่ยังไม่จับคู่
  });

  it("กล่องที่ยังไม่ใช้ทั้งหมดยังไม่ได้จับคู่ → ไม่มีปุ่ม 'ใช้' (กดไปก็ไม่มีอะไรเกิด)", () => {
    const r = shipZeroCauses({ header: H, lines: [{ qty: 10, unit_price: 1, ship_method: null }], delivery: { mineRows: 2, unappliedRows: 2, unmappedRows: 2 } });
    expect(r.causes.map((c) => c.key)).toEqual(["unmapped"]);
    expect(mappedUnapplied({ unappliedRows: 2, unmappedRows: 2 })).toBe(0);
  });

  it("ไม่มีคิว/กก. และไม่มีใบส่งของ → ไปใส่ในตาราง", () => {
    const r = shipZeroCauses({ header: H, lines: [{ qty: 10, unit_price: 1, ship_method: null }] });
    expect(r.causes).toEqual([expect.objectContaining({ key: "no_basis", fix: { kind: "goto_lines" } })]);
  });

  it("ใบตั้งไม่คิดค่าส่ง แต่มีกล่อง → เสนอคิดตามคิว (มีเรทคิว)", () => {
    const r = shipZeroCauses({ header: { ...H, ship_method: "none" }, lines: [{ ...L[0], ship_method: null }], delivery: { mineRows: 1, unappliedRows: 0, unmappedRows: 0 } });
    expect(r.causes.map((c) => c.key)).toEqual(["method_none"]);
    expect(r.causes[0].fix).toEqual({ kind: "set_header_method", to: "cube" });
    expect(r.causes[0].preview_thb).toBeCloseTo(39.2, 2);
  });

  it("ใบไม่คิดค่าส่ง ไม่มีกล่อง ไม่มีคิว/กก. → ไม่เตือน (ตั้งใจไม่คิด)", () => {
    expect(shipZeroCauses({ header: { ...H, ship_method: "none" }, lines: [{ qty: 5, unit_price: 2 }] }).causes).toEqual([]);
  });

  it("applyShipFixes + isQuickFix", () => {
    const x = applyShipFixes({ ...H, ship_manual_total: 0 }, L, [{ kind: "clear_manual" }, { kind: "switch_method", to: "cube", line_idx: [0] }, { kind: "apply" }]);
    expect(x.header.ship_manual_total).toBeNull();
    expect(x.lines[0].ship_method).toBe("cube");
    expect(L[0].ship_method).toBe("weight");   // ไม่แก้ของเดิม
    expect(isQuickFix({ kind: "apply" })).toBe(false);
    expect(isQuickFix({ kind: "clear_manual" })).toBe(true);
  });
});
