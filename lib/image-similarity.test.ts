import { describe, expect, it } from "vitest";
import { colorDistance, printFromPixels, shapeDistance, similarity, type VisualPrint } from "./image-similarity";

/** ภาพจำลอง: ไล่ความสว่างตามแนวนอน (ลายต่างกันตาม seed) + สีพื้น */
function pixels(seed: number, rgb: [number, number, number], jitter = 0) {
  const d98 = new Uint8ClampedArray(9 * 8 * 4);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 9; x++) {
      const v = ((x * 37 + y * 11 + seed * 53) % 97) + jitter * ((x + y) % 2);
      const p = (y * 9 + x) * 4;
      d98[p] = rgb[0] * 0.3 + v;
      d98[p + 1] = rgb[1] * 0.3 + v;
      d98[p + 2] = rgb[2] * 0.3 + v;
      d98[p + 3] = 255;
    }
  }
  const d44 = new Uint8ClampedArray(16 * 4);
  for (let i = 0; i < 16; i++) d44.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  return printFromPixels(d98, d44);
}

describe("ลายนิ้วมือภาพ", () => {
  const brown = pixels(1, [120, 80, 40]);
  it("รูปเดียวกัน (ย่อ/บีบอัดนิดหน่อย) = เหมือนกัน", () => {
    const again = pixels(1, [121, 81, 41], 1);
    expect(shapeDistance(brown, again)).toBeLessThanOrEqual(3);
    expect(similarity(brown, again)).toBe("same");
  });
  it("ท่าเดียวกันคนละสี = ไม่นับว่าซ้ำ (เทียบสีด้วย)", () => {
    const navy = pixels(1, [30, 40, 90]);
    expect(shapeDistance(brown, navy)).toBe(0);
    expect(colorDistance(brown, navy)).toBeGreaterThan(6);
    expect(similarity(brown, navy)).toBeNull();
  });
  it("คนละรูป = ไม่คล้าย", () => {
    expect(similarity(brown, pixels(7, [120, 80, 40]))).toBeNull();
  });
  it("ระดับ คล้ายมาก", () => {
    const a: VisualPrint = { bits: "10".repeat(32), col: Array(48).fill(100) };
    const b: VisualPrint = { bits: "01" + "10".repeat(31), col: Array(48).fill(102) };
    const c: VisualPrint = { bits: "0101" + "10".repeat(30), col: Array(48).fill(105) };
    expect(similarity(a, b)).toBe("same");
    expect(similarity(a, c)).toBe("near");
  });
  it("รูปเรียบมาก (พื้นขาวล้วน) ต้องใกล้กว่าปกติ", () => {
    const white: VisualPrint = { bits: "0".repeat(64), col: Array(48).fill(245) };
    const whiteSmall: VisualPrint = { bits: "0".repeat(60) + "1111", col: Array(48).fill(243) };
    expect(similarity(white, whiteSmall)).toBeNull();
    expect(similarity(white, { bits: "0".repeat(64), col: Array(48).fill(244) })).toBe("same");
  });
});
