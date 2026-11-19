import { describe, it, expect } from "vitest";
import { togglePackItem, cleanPackItems, cleanPackFlags, cleanPackNote, summarizePackaging } from "@/lib/packaging";

const A = "a9ebfcdd-94ed-48da-b1e3-f70c0b2b8ffe", B = "9b2d3b43-b0db-4bed-8187-73a888939191", C = "1b3496fd-c474-4b07-a770-f9f15898b764";

describe("packaging", () => {
  it("เพิ่ม/เอาออกไม่ซ้ำ คงลำดับ", () => {
    expect(togglePackItem([A], B, true)).toEqual([A, B]);
    expect(togglePackItem([A, B], A, true)).toEqual([A, B]);
    expect(togglePackItem([A, B], A, false)).toEqual([B]);
    expect(togglePackItem(null, A, true)).toEqual([A]);
    expect(togglePackItem(["junk", A], B, false)).toEqual([A]);
  });

  it("รับเฉพาะ id ที่มีจริง", () => {
    expect(cleanPackItems([A, A, "x", B], new Set([A]))).toEqual([A]);
    expect(cleanPackItems("nope")).toEqual([]);
  });

  it("ป้ายเตือน/โน้ต ทำความสะอาด", () => {
    expect(cleanPackFlags([" แตกง่าย ", "แตกง่าย", "", null, "x".repeat(40)])).toEqual(["แตกง่าย", "x".repeat(30)]);
    expect(cleanPackFlags(Array.from({ length: 12 }, (_, i) => `f${i}`))).toHaveLength(8);
    expect(cleanPackNote("   ")).toBeNull();
    expect(cleanPackNote(" ห่อ 2 ชั้น ")).toBe("ห่อ 2 ชั้น");
  });

  it("สรุปรวมทั้งออเดอร์นับตามจำนวนชิ้น เรียงตามลำดับกลาง", () => {
    const box = { id: A, name: "กล่องกระเป๋าสตางค์" }, bag = { id: B, name: "ถุงผ้า" }, card = { id: C, name: "Card Care" };
    const out = summarizePackaging([{ qty: 2, packaging: [box, card] }, { qty: 1, packaging: [bag, card] }, { qty: 0, packaging: [box] }], new Map([[A, 1], [B, 2], [C, 4]]));
    expect(out).toEqual([{ id: A, name: "กล่องกระเป๋าสตางค์", qty: 2 }, { id: B, name: "ถุงผ้า", qty: 1 }, { id: C, name: "Card Care", qty: 3 }]);
  });
});
