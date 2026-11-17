import { describe, expect, it } from "vitest";
import { addToCart, applyCartToLines, cartEntryAmount, isPartsItem, parseSetItems, partsModeOf } from "@/lib/parts-cart";
import type { CostItemLike } from "@/lib/design-sheet-cost-row";

const item = (id: string, name: string, calc: string, price: number, uom: string, group: string): CostItemLike => ({
  id, name, price_per_unit: price, uom, face_width_cm: null, width_cm: null, length_cm: null,
  group_name: group, group_code: null, calc_method: calc, loss_percent: 0, divisor: calc === "length" ? 91.44 : null, uom_default: uom,
});
const zip = item("z", "ซิปฟันเหล็ก #5", "length", 12, "หลา", "ซิป");
const slider = item("s", "หัวซิปฟันเหล็ก #5", "count", 3, "ชิ้น", "อะไหล่");
const fabric = item("f", "ผ้า Oxford", "area_face", 50, "หลา", "ผ้า");
const items = new Map([zip, slider, fabric].map((i) => [i.id, i]));
const make = (base: ReturnType<typeof import("@/lib/design-sheet-cost-row").costLineFromItem>, idx: number) => ({ ...base, key: `k${idx}` });

describe("ตะกร้าอะไหล่ — กรองกลุ่ม", () => {
  it("นับชิ้น/ตามยาว = อะไหล่ · ผ้า = ไม่ใช่", () => {
    expect(partsModeOf("count")).toBe("count");
    expect(partsModeOf("length")).toBe("length");
    expect(isPartsItem(fabric)).toBe(false);
    expect(isPartsItem(slider)).toBe(true);
  });
});

describe("ชุดอะไหล่ — อ่านจากฐานข้อมูล", () => {
  it("ตัดตัวเอง ตัวซ้ำ ค่าเพี้ยน · qty ปัดเป็นจำนวนเต็ม ≥ 1 · on ค่าเริ่ม true", () => {
    expect(parseSetItems([{ item_id: "s", qty: 2.4 }, { item_id: "s" }, { item_id: "z" }, { item_id: "t", qty: 0, on: false }, "x", null], "z"))
      .toEqual([{ item_id: "s", qty: 2, on: true }, { item_id: "t", qty: 1, on: false }]);
    expect(parseSetItems("ไม่ใช่ array")).toEqual([]);
  });
});

describe("ตะกร้าอะไหล่ — ใส่ตะกร้า", () => {
  it("ใส่ซ้ำ = บวกจำนวน · ซิปเริ่มยาว 30 ซม.", () => {
    let c = addToCart([], "z", "length");
    c = addToCart(c, "z", "length", 2);
    expect(c).toEqual([{ item_id: "z", qty: 3, cm: 30 }]);
    expect(addToCart([], "s", "count")[0].cm).toBeNull();
  });
  it("ราคาในตะกร้า = สูตรเดียวกับตาราง", () => {
    expect(cartEntryAmount({ item_id: "s", qty: 2 }, slider)).toBe(6);
    // 2 เส้น × 45.72 ซม. = 91.44 ซม. = 1 หลา × 12
    expect(cartEntryAmount({ item_id: "z", qty: 2, cm: 45.72 }, zip)).toBe(12);
  });
});

describe("ตะกร้า → บรรทัดตีราคา", () => {
  it("ไม่มีในตาราง = บรรทัดใหม่ (นับชิ้นใส่ pieces · ซิปใส่ยาวรวม + โน้ต)", () => {
    const r = applyCartToLines([], [{ item_id: "s", qty: 2 }, { item_id: "z", qty: 2, cm: 30 }], items, make);
    expect(r.added).toBe(2);
    expect(r.lines[0]).toMatchObject({ item_id: "s", pieces: 2, qty: 2, amount: 6 });
    expect(r.lines[1]).toMatchObject({ item_id: "z", length_cm: 60, note: "2 เส้น × 30 ซม." });
  });
  it("มีอะไหล่ตัวเดียวกันแล้ว = บวกเข้าบรรทัดเดิม", () => {
    const first = applyCartToLines([], [{ item_id: "s", qty: 1 }, { item_id: "z", qty: 1, cm: 20 }], items, make).lines;
    const r = applyCartToLines(first, [{ item_id: "s", qty: 3 }, { item_id: "z", qty: 1, cm: 10 }], items, make);
    expect(r).toMatchObject({ added: 0, merged: 2 });
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ pieces: 4, amount: 12 });
    expect(r.lines[1]).toMatchObject({ length_cm: 30, note: "1 เส้น × 20 ซม. + 1 เส้น × 10 ซม." });
  });
  it("วัสดุไม่ใช่อะไหล่/ไม่รู้จัก = ข้าม", () => {
    const r = applyCartToLines([], [{ item_id: "f", qty: 1 }, { item_id: "nope", qty: 1 }], items, make);
    expect(r).toMatchObject({ added: 0, merged: 0, lines: [] });
  });
});
