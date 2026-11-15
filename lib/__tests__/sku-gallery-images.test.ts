import { describe, expect, it } from "vitest";
import { skuImageKeys } from "@/lib/sku-gallery-images";

describe("skuImageKeys — รูปทั้งหมดของ SKU 1 ตัว", () => {
  it("ปกก่อน → แกลเลอรีของตัวเอง → แกลเลอรีของตัวสี · ไม่ซ้ำ · ข้ามค่าว่าง", () => {
    expect(skuImageKeys({ cover: "a", gallery: ["a", "b", " ", "c"] }, { cover: "m", gallery: ["m", "b", "d"] })).toEqual(["a", "b", "c", "m", "d"]);
  });
  it("ตัวขายไม่มีปก = ใช้ปกตัวสี", () => {
    expect(skuImageKeys({ cover: null, gallery: [] }, { cover: "m", gallery: ["m2"] })).toEqual(["m", "m2"]);
  });
  it("ไม่มีอะไรเลย = ว่าง", () => {
    expect(skuImageKeys({ cover: null, gallery: [] }, null)).toEqual([]);
  });
});
