import { describe, it, expect } from "vitest";
import { costFingerprint, costTotals, diffCostLines, diffExtras } from "../design-sheet-cost-snapshot";

const L = (p: Partial<Parameters<typeof costTotals>[0][number]>) => ({ item_name: "ผ้า A", item_id: "i1", qty: 2, unit_price: 100, amount: 200, parent_code: null, ...p });

describe("costFingerprint", () => {
  it("เนื้อหาเดียวกัน = ลายนิ้วมือเดียวกัน แม้ id/sort_order/prev_item ต่าง", () => {
    const a = costFingerprint([{ ...L({}), ...({ id: "x", sort_order: 1, prev_item: { a: 1 } } as object) }], { "": [{ label: "ค่าแรง", amount: 10 }] });
    const b = costFingerprint([L({})], { "": [{ label: "ค่าแรง", amount: "10" as unknown as number }] });
    expect(a).toBe(b);
  });
  it("ราคาเปลี่ยน → ลายนิ้วมือเปลี่ยน", () => {
    expect(costFingerprint([L({})], {})).not.toBe(costFingerprint([L({ unit_price: 101 })], {}));
  });
});

describe("costTotals", () => {
  it("รวมต่อ Parent + ยอดรวมทั้งใบ", () => {
    const { totals, grand_total } = costTotals(
      [L({}), L({ parent_code: "P1", amount: 50 })],
      { "": [{ label: "ค่าแรง", amount: 10 }], P1: [{ label: "ค่าแรง", amount: 5 }] },
    );
    expect(totals[""]).toEqual({ material: 200, extra: 10, total: 210 });
    expect(totals.P1).toEqual({ material: 50, extra: 5, total: 55 });
    expect(grand_total).toBe(265);
  });
});

describe("diffCostLines", () => {
  it("จับคู่วัสดุเดียวกัน → same/changed, ไม่มีคู่ → removed/added", () => {
    const a = [L({}), L({ item_id: "i2", item_name: "ผ้า B", amount: 300 })];
    const b = [L({ unit_price: 120, amount: 240 }), L({ item_id: "i3", item_name: "ซิป", amount: 5 })];
    const rows = diffCostLines(a, b);
    expect(rows.map((r) => r.status)).toEqual(["changed", "removed", "added"]);
    expect(rows[0].changedFields).toEqual(["unit_price", "amount"]);
    expect(rows[0].amountDiff).toBe(40);
    expect(rows[1].amountDiff).toBe(-300);
    expect(rows[2].amountDiff).toBe(5);
  });
  it("วัสดุซ้ำ 2 บรรทัด จับคู่ตามลำดับ", () => {
    const rows = diffCostLines([L({ qty: 1, amount: 100 }), L({ qty: 2, amount: 200 })], [L({ qty: 1, amount: 100 })]);
    expect(rows.map((r) => r.status)).toEqual(["same", "removed"]);
  });
});

describe("diffExtras", () => {
  it("จับคู่ด้วยชื่อ ตัดรายการ 0 ทั้งคู่", () => {
    const d = diffExtras([{ label: "ค่าแรง", amount: 10 }, { label: "โสหุ้ย", amount: 0 }], [{ label: "ค่าแรง", amount: 15 }, { label: "ขนส่ง", amount: 3 }]);
    expect(d).toEqual([{ label: "ค่าแรง", a: 10, b: 15, diff: 5 }, { label: "ขนส่ง", a: null, b: 3, diff: 3 }]);
  });
});
