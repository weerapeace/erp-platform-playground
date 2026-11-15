import { describe, it, expect } from "vitest";
import { stepGalleryCols } from "../gallery-cols";

describe("Ctrl + ลูกกลิ้ง: ขั้นจำนวนการ์ดต่อแถว", () => {
  const opts = [2, 3, 4, 5, 6, 8];
  it("หมุนลง = ต่อแถวมากขึ้น (การ์ดเล็กลง) · หมุนขึ้น = น้อยลง", () => {
    expect(stepGalleryCols(3, 1, opts)).toBe(4);
    expect(stepGalleryCols(6, 1, opts)).toBe(8);
    expect(stepGalleryCols(3, -1, opts)).toBe(2);
  });
  it("สุดปลายแล้วอยู่ที่เดิม", () => {
    expect(stepGalleryCols(8, 1, opts)).toBe(8);
    expect(stepGalleryCols(2, -1, opts)).toBe(2);
  });
  it("ค่าที่ไม่อยู่ในรายการ (เช่น ค่าเก่า) เริ่มจากตัวที่ใกล้สุด", () => {
    expect(stepGalleryCols(7, 1, opts)).toBe(8);
    expect(stepGalleryCols(1, 1, opts)).toBe(3);
    expect(stepGalleryCols(5, 1, [])).toBe(5);
  });
});
