import { describe, expect, it } from "vitest";
import { computeFakePrice, DEFAULT_FAKE_FORMULAS, describeFormula, discountPercent, formulaProblem, parseFormulas, roundFakePrice } from "@/lib/fake-price";

describe("fake-price", () => {
  it("ปัดราคาขึ้นเสมอ", () => {
    expect(roundFakePrice(1224, "end90")).toBe(1290);
    expect(roundFakePrice(1690, "end90")).toBe(1690);
    expect(roundFakePrice(1780, "end90")).toBe(1790);
    expect(roundFakePrice(1201, "end99")).toBe(1299);
    expect(roundFakePrice(1201, "ceil100")).toBe(1300);
    expect(roundFakePrice(1201, "ceil10")).toBe(1210);
    expect(roundFakePrice(1223.9999, "none")).toBe(1224);
    expect(roundFakePrice(40, "end90")).toBe(90);
  });

  it("คิดจากราคาขาย 3 วิธี", () => {
    expect(computeFakePrice(890, { mode: "multiply", value: 2, round: "end90" })).toBe(1790);
    expect(computeFakePrice(720, { mode: "multiply", value: 1.7, round: "end90" })).toBe(1290);
    expect(computeFakePrice(720, { mode: "discount", value: 40, round: "end90" })).toBe(1290);
    expect(computeFakePrice(820, { mode: "add", value: 500, round: "none" })).toBe(1320);
  });

  it("ไม่มีราคาขาย / ไม่สูงกว่าราคาขาย = ไม่ใส่", () => {
    expect(computeFakePrice(0, DEFAULT_FAKE_FORMULAS[0])).toBeNull();
    expect(computeFakePrice(null, DEFAULT_FAKE_FORMULAS[0])).toBeNull();
    expect(computeFakePrice(890, { mode: "multiply", value: 1, round: "none" })).toBeNull();
  });

  it("อ่านสูตรจากตั้งค่า — ไม่มี = ตั้งต้น · ตัวเพี้ยนตัดทิ้ง", () => {
    expect(parseFormulas(null)).toEqual(DEFAULT_FAKE_FORMULAS);
    expect(parseFormulas({ formulas: [] })).toEqual([]);
    const got = parseFormulas({ formulas: [{ id: "a", name: "×3", mode: "multiply", value: 3, round: "end99" }, { id: "b", name: "พัง", mode: "multiply", value: 0.5, round: "none" }, { id: "a", name: "ซ้ำ", mode: "add", value: 10, round: "none" }] });
    expect(got.map((f) => f.id)).toEqual(["a"]);
  });

  it("เตือนสูตรที่ใช้ไม่ได้ + อธิบายเป็นภาษาคน", () => {
    expect(formulaProblem({ name: "", mode: "multiply", value: 2 })).toBeTruthy();
    expect(formulaProblem({ name: "x", mode: "discount", value: 99 })).toBeTruthy();
    expect(formulaProblem({ name: "x", mode: "multiply", value: 2 })).toBeNull();
    expect(describeFormula({ mode: "multiply", value: 2, round: "end90" })).toBe("ราคาขาย × 2 แล้วลงท้าย 90");
    expect(discountPercent(890, 1790)).toBe(50);
  });
});
