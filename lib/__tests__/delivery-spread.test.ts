import { describe, expect, it } from "vitest";
import { spreadBoxesByValue, spreadLineValue, spreadStale } from "@/lib/delivery-bill-check";

const boxes = [{ weight_kg: 14.8, m3: 0.0327, method: null }, { weight_kg: 32.3, m3: 0.0725, method: null }, { weight_kg: 40, m3: 0.0775, method: null }];

describe("spreadBoxesByValue (เกลี่ยตามมูลค่า)", () => {
  it("รวมกล่องแล้วแบ่งตามมูลค่า · รวมกลับเท่ากล่อง", () => {
    const lines = [
      { id: "a", qty: 1000, unit_price: 0.1, is_product: true },   // ¥100 ชิ้นเล็กจำนวนมาก
      { id: "b", qty: 10, unit_price: 30, is_product: true },      // ¥300
    ];
    const r = spreadBoxesByValue(boxes, lines);
    expect(r.basis).toBe("value");
    const a = r.per.find((p) => p.id === "a")!, b = r.per.find((p) => p.id === "b")!;
    expect(a.kg_per_unit! * 1000).toBeCloseTo(87.1 * 0.25, 6);
    expect(b.kg_per_unit! * 10).toBeCloseTo(87.1 * 0.75, 6);
    expect(a.cbm_per_unit! * 1000 + b.cbm_per_unit! * 10).toBeCloseTo(0.1827, 8);
  });

  it("ส่วนลดหักจากมูลค่า · สินค้าที่ไม่ใช่สินค้า (ค่าใช้จ่าย) ไม่ได้ส่วนแบ่ง", () => {
    expect(spreadLineValue({ id: "x", qty: 10, unit_price: 10, discount_pct: 10 })).toBe(90);
    expect(spreadLineValue({ id: "x", qty: 10, unit_price: 10, discount: 30 })).toBe(70);
    const r = spreadBoxesByValue([{ weight_kg: 10, m3: null }], [{ id: "p", qty: 5, unit_price: 2, is_product: true }, { id: "fee", qty: 1, unit_price: 50, is_product: false }]);
    expect(r.per.map((p) => p.id)).toEqual(["p"]);
    expect(r.per[0]).toEqual({ id: "p", kg_per_unit: 2, cbm_per_unit: null });
  });

  it("ยังไม่มีราคาเลยทั้งใบ → แบ่งตามจำนวนชิ้น", () => {
    const r = spreadBoxesByValue([{ weight_kg: 30, m3: 0.3 }], [{ id: "a", qty: 10, unit_price: null }, { id: "b", qty: 20, unit_price: 0 }]);
    expect(r.basis).toBe("qty");
    expect(r.per).toEqual([{ id: "a", kg_per_unit: 1, cbm_per_unit: 0.01 }, { id: "b", kg_per_unit: 1, cbm_per_unit: 0.01 }]);
  });

  it("วิธีคิดตามกล่องส่วนใหญ่ · คนละแบบ = แจ้ง mixed", () => {
    const r = spreadBoxesByValue([{ weight_kg: 1, m3: 0.1, method: "cube" }, { weight_kg: 1, m3: 0.1, method: "weight" }, { weight_kg: 1, m3: 0.1, method: "weight" }], [{ id: "a", qty: 1, unit_price: 1 }]);
    expect(r.method).toBe("weight");
    expect(r.mixed).toEqual({ cube: 1, weight: 2 });
    expect(spreadBoxesByValue([{ weight_kg: 1, m3: 1, method: null }], [{ id: "a", qty: 1, unit_price: 1 }]).method).toBeNull();
  });

  it("ไม่มีกล่อง/ไม่มีสินค้า → ไม่เกลี่ย", () => {
    expect(spreadBoxesByValue([], [{ id: "a", qty: 1, unit_price: 1 }]).per).toEqual([]);
    expect(spreadBoxesByValue(boxes, [{ id: "a", qty: 0, unit_price: 1 }]).per).toEqual([]);
  });
});

describe("spreadStale (ต้องคิดใหม่ไหม)", () => {
  const box = [{ weight_kg: 40, m3: 0.4 }];
  const lines = [{ id: "a", qty: 10, unit_price: 1 }, { id: "b", qty: 10, unit_price: 3 }];
  const per = spreadBoxesByValue(box, lines).per;
  const withPer = (ls: typeof lines) => ls.map((l) => ({ ...l, ...(per.find((p) => p.id === l.id) ?? { kg_per_unit: null, cbm_per_unit: null }) }));
  it("ยอดรวมตรงกับกล่อง = ไม่ต้องคิดใหม่", () => {
    expect(spreadStale(box, withPer(lines))).toBe(false);
  });
  it("ใบเก่าเกลี่ยแบบเดิม (เท่ากันทุกชิ้น) แต่ยอดรวมตรง = ไม่คิดใหม่เอง", () => {
    expect(spreadStale(box, lines.map((l) => ({ ...l, kg_per_unit: 2, cbm_per_unit: 0.02 })))).toBe(false);
  });
  it("แก้จำนวนหลังใช้แล้ว = ต้องคิดใหม่", () => {
    expect(spreadStale(box, withPer(lines).map((l) => (l.id === "a" ? { ...l, qty: 20 } : l)))).toBe(true);
  });
  it("เพิ่มสินค้าใหม่ (ยังไม่มีค่า) = ต้องคิดใหม่ · ไม่มีกล่อง = ไม่ต้อง", () => {
    expect(spreadStale(box, [...withPer(lines), { id: "c", qty: 5, unit_price: 2, kg_per_unit: null, cbm_per_unit: null }])).toBe(true);
    expect(spreadStale([], withPer(lines))).toBe(false);
  });
});
