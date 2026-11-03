import { describe, it, expect } from "vitest";
import { laplacianVariance, flagBlurry, groupLookAlike, cullAlbum } from "./content-album-cull";

const flat = (w: number, h: number, v = 128) => new Array(w * h).fill(v);
const checker = (w: number, h: number) => Array.from({ length: w * h }, (_, i) => ((i % w) + Math.floor(i / w)) % 2 ? 255 : 0);

describe("content-album-cull · ช่วยคัดรูป", () => {
  it("รูปเรียบ = ความคม 0 · ลายตารางหมากรุก = คมมาก", () => {
    expect(laplacianVariance(flat(8, 8), 8, 8)).toBe(0);
    expect(laplacianVariance(checker(8, 8), 8, 8)).toBeGreaterThan(1000);
  });
  it("รูปน้อยกว่า 4 รูป ไม่ตัดสินว่าเบลอ", () => {
    expect(flagBlurry([{ id: "a", score: 1 }, { id: "b", score: 100 }, { id: "c", score: 100 }]).size).toBe(0);
  });
  it("ต่ำกว่า 40% ของค่ากลาง = อาจเบลอ", () => {
    const r = flagBlurry([{ id: "a", score: 100 }, { id: "b", score: 90 }, { id: "c", score: 110 }, { id: "d", score: 20 }, { id: "e", score: null }]);
    expect([...r]).toEqual(["d"]);
  });
  it("ลายนิ้วมือห่างไม่เกิน 6 บิต = กลุ่มเดียวกัน", () => {
    const base = "0".repeat(32);
    const near = "7" + "0".repeat(31);          // ต่าง 3 บิต
    const far = "f".repeat(8) + "0".repeat(24);   // ต่าง 32 บิต
    expect(groupLookAlike([{ id: "a", phash: base }, { id: "b", phash: near }, { id: "c", phash: far }, { id: "d", phash: null }])).toEqual([["a", "b"]]);
  });
  it("แนะนำเก็บ: ตัดรูปเบลอ + กลุ่มคล้ายเก็บรูปที่คมสุด", () => {
    const base = "0".repeat(32), near = "1" + "0".repeat(31), other = "f".repeat(32);
    const r = cullAlbum([
      { id: "a", score: 100, phash: base, area: 10 },
      { id: "b", score: 150, phash: near, area: 10 },
      { id: "c", score: 120, phash: other, area: 10 },
      { id: "d", score: 10, phash: "0f".repeat(16), area: 10 },
      { id: "e", score: 110, phash: null, area: 10 },
    ]);
    expect(r.blurry).toEqual(["d"]);
    expect(r.groups).toEqual([["a", "b"]]);
    expect(r.keep).toEqual(["b", "c", "e"]);
  });
});
