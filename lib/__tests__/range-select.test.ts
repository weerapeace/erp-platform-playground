import { describe, expect, it } from "vitest";
import { clickSelect, selectAllVisible } from "../range-select";

const order = ["a", "b", "c", "d", "e"];
const set = (...k: string[]) => new Set(k);
const sorted = (s: Set<string>) => [...s].sort();

describe("clickSelect", () => {
  it("กดธรรมดา = สลับตัวเดียว", () => {
    expect(sorted(clickSelect(order, set(), "b"))).toEqual(["b"]);
    expect(sorted(clickSelect(order, set("b"), "b"))).toEqual([]);
  });

  it("Shift + anchor ติ๊กอยู่ = ติ๊กทั้งช่วง (ทั้งลงและขึ้น)", () => {
    expect(sorted(clickSelect(order, set("b"), "d", { shift: true, anchor: "b" }))).toEqual(["b", "c", "d"]);
    expect(sorted(clickSelect(order, set("d"), "a", { shift: true, anchor: "d" }))).toEqual(["a", "b", "c", "d"]);
  });

  it("Shift + anchor ไม่ได้ติ๊ก = เอาติ๊กออกทั้งช่วง (แบบ Gmail)", () => {
    expect(sorted(clickSelect(order, set("a", "c", "d", "e"), "e", { shift: true, anchor: "b" }))).toEqual(["a"]);
  });

  it("anchor ไม่อยู่บนจอ / ไม่มี anchor / กดตัวเดิม = สลับตัวเดียว", () => {
    expect(sorted(clickSelect(order, set("x"), "c", { shift: true, anchor: "x" }))).toEqual(["c", "x"]);
    expect(sorted(clickSelect(order, set(), "c", { shift: true, anchor: null }))).toEqual(["c"]);
    expect(sorted(clickSelect(order, set("c"), "c", { shift: true, anchor: "c" }))).toEqual([]);
  });

  it("ตัวที่เลือกไว้นอกจอไม่ถูกแตะ + ไม่แก้ชุดเดิม", () => {
    const cur = set("zz", "b");
    const next = clickSelect(order, cur, "d", { shift: true, anchor: "b" });
    expect(sorted(next)).toEqual(["b", "c", "d", "zz"]);
    expect(sorted(cur)).toEqual(["b", "zz"]);
  });
});

describe("selectAllVisible", () => {
  it("เพิ่มทุกตัวที่เห็น เก็บตัวนอกจอไว้", () => {
    expect(sorted(selectAllVisible(["a", "b"], set("zz")))).toEqual(["a", "b", "zz"]);
  });
});
