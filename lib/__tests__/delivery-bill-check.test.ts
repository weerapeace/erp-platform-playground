import { describe, it, expect } from "vitest";
import { deliveryQtyCheck, methodForDescription, normDesc, ruleForDescription, suggestBoxMatches, type CheckBill, type CheckLine } from "@/lib/delivery-bill-check";

const L = (id: string, qty: number, is_product = true): CheckLine => ({ id, label: id, qty, is_product });
const B = (id: string, boxes: [number | null, string[]][]): CheckBill => ({ id, tracking_no: id, lines: boxes.map(([qty, ids]) => ({ qty, voucher_line_ids: ids })) });

describe("delivery-bill-check — กฎ Description", () => {
  const rules = [{ keyword: "BOX", method: "cube" as const }, { keyword: "cloth  block", method: "weight" as const }];
  it("จับกฎแบบไม่สนตัวเล็ก/ใหญ่ + ช่องว่างซ้ำ · ไม่เข้ากฎ = null", () => {
    expect(methodForDescription("box", rules)).toBe("cube");
    expect(methodForDescription("Cloth Block", rules)).toBe("weight");
    expect(methodForDescription("METAL ACCY", rules)).toBeNull();
    expect(methodForDescription("", rules)).toBeNull();
    expect(ruleForDescription("GIFT BOX", rules)?.keyword).toBe("BOX");
    expect(normDesc("  metal   accy ")).toBe("METAL ACCY");
  });
  it("กฎตรงทั้งคำชนะกฎคำกว้างที่อยู่ก่อน", () => {
    const r = [{ keyword: "ACCY", method: "cube" as const }, { keyword: "METAL ACCY", method: "weight" as const }];
    expect(methodForDescription("metal accy", r)).toBe("weight");
    expect(methodForDescription("APPARELS ACCY", r)).toBe("cube");
  });
});

describe("delivery-bill-check — เช็กจำนวน", () => {
  it("สินค้ามา 2 รอบ (2 ใบส่งของ) รวมกันครบ = ครบ", () => {
    const c = deliveryQtyCheck([L("a", 15)], [B("ek1", [[5, ["a"]]]), B("ek2", [[10, ["a"]]])]);
    expect(c.rows[0]).toMatchObject({ expected: 15, got: 15, diff: 0, status: "ok", byBill: { ek1: 5, ek2: 10 } });
  });
  it("มาน้อยกว่าในใบ = ขาด · มามากกว่า = เกิน · ไม่มีกล่อง = ยังไม่มา", () => {
    const c = deliveryQtyCheck([L("a", 10), L("b", 20), L("c", 6)], [B("ek1", [[15, ["a"]], [12, ["b"]]])]);
    expect(c.rows.map((r) => [r.ids[0], r.status, r.diff])).toEqual([["a", "over", 5], ["b", "short", -8], ["c", "none", -6]]);
  });
  it("กล่องปนหลายสินค้า = เช็กยอดรวมของกลุ่ม", () => {
    const c = deliveryQtyCheck([L("a", 10), L("b", 5), L("c", 3)], [B("ek1", [[15, ["a", "b"]], [3, ["c"]]])]);
    expect(c.rows).toHaveLength(2);
    expect(c.rows[0]).toMatchObject({ ids: ["a", "b"], expected: 15, got: 15, status: "ok" });
  });
  it("อ่านจำนวนไม่ได้ = unknown · กล่องที่ยังไม่จับคู่ นับแยก · ค่าใช้จ่าย (ไม่ใช่สินค้า) ไม่เอามาเช็ก", () => {
    const c = deliveryQtyCheck([L("a", 10), L("fee", 1, false)], [B("ek1", [[null, ["a"]], [7, []], [2, ["fee"]]])]);
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0].status).toBe("unknown");
    expect(c.unmatched).toEqual([{ bill_id: "ek1", boxes: 2, qty: 9 }]);
    expect(c.matchedBoxes).toBe(1);
    expect(c.totalBoxes).toBe(3);
  });
});

describe("delivery-bill-check — เดาสินค้าให้กล่อง", () => {
  it("ใบมีสินค้าตัวเดียว → ทุกกล่องว่างเป็นสินค้านั้น", () => {
    expect(suggestBoxMatches([L("a", 10)], [B("ek1", [[5, []]]), B("ek2", [[10, []]])])).toEqual([
      { bill_id: "ek1", idx: 0, line_id: "a" }, { bill_id: "ek2", idx: 0, line_id: "a" },
    ]);
  });
  it("จำนวนตรงกับสินค้าตัวเดียว = จับให้ · ซ้ำกัน/ไม่ตรง = ไม่เดา", () => {
    const s = suggestBoxMatches([L("a", 10), L("b", 20), L("c", 20)], [B("ek1", [[10, []], [20, []], [7, []]])]);
    expect(s).toEqual([{ bill_id: "ek1", idx: 0, line_id: "a" }]);
    // กล่องว่าง 2 กล่องจำนวนเท่ากัน → ไม่รู้ว่ากล่องไหน
    expect(suggestBoxMatches([L("a", 10), L("b", 3)], [B("ek1", [[10, []], [10, []]])])).toEqual([]);
    // สินค้าที่มีกล่องแล้ว ไม่เอามาเดาซ้ำ
    expect(suggestBoxMatches([L("a", 10), L("b", 3)], [B("ek1", [[10, ["a"]], [10, []]])])).toEqual([]);
  });
});
