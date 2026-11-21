import { describe, expect, it } from "vitest";
import { applyH, defaultQuad, homography, isConvexQuad, outputSize, warpQuad, type Quad } from "../perspective-warp";

describe("perspective-warp", () => {
  it("homography พามุมไปตรงจุด", () => {
    const from: Quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
    const to: Quad = [{ x: 10, y: 5 }, { x: 90, y: 12 }, { x: 95, y: 70 }, { x: 3, y: 60 }];
    const h = homography(from, to)!;
    for (let i = 0; i < 4; i++) {
      const p = applyH(h, from[i]);
      expect(p.x).toBeCloseTo(to[i].x, 6);
      expect(p.y).toBeCloseTo(to[i].y, 6);
    }
  });

  it("มุมซ้อนกัน = ใช้ไม่ได้", () => {
    const bad: Quad = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    expect(homography(bad, bad)).toBeNull();
  });

  it("เช็กสี่เหลี่ยมนูน / ไขว้กัน", () => {
    expect(isConvexQuad(defaultQuad(100, 80))).toBe(true);
    expect(isConvexQuad([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe(false);
  });

  it("ขนาดผลลัพธ์ย่อตาม maxSide", () => {
    const q: Quad = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }, { x: 0, y: 2000 }];
    expect(outputSize(q, 2400)).toEqual({ w: 2400, h: 1200 });
  });

  it("ดัดทั้งรูป (มุม = ขอบรูป) ได้รูปเดิม", () => {
    const w = 4, h = 3;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { data[i * 4] = i * 20; data[i * 4 + 1] = 100; data[i * 4 + 2] = 200 - i * 10; data[i * 4 + 3] = 255; }
    const q: Quad = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    const out = warpQuad({ data, width: w, height: h }, q, w, h);
    for (let i = 0; i < data.length; i++) expect(Math.abs(out[i] - data[i])).toBeLessThanOrEqual(1);
  });
});
