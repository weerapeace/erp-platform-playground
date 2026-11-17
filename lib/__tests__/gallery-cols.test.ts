import { describe, it, expect } from "vitest";
import { galleryTemplate, galleryThumbWidth, isCompactGallery, stepGalleryCols } from "../gallery-cols";
import { GALLERY_COL_CHOICES, GALLERY_COL_OPTIONS } from "../../components/gallery-columns/options";

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

describe("สูงสุด 16 ใบต่อแถว", () => {
  it("ตัวเลือกมาตรฐานไปถึง 16 และเรียงจากน้อยไปมาก", () => {
    expect(GALLERY_COL_OPTIONS.at(-1)).toBe(16);
    expect(GALLERY_COL_CHOICES[0]).toBe(2);
    expect(GALLERY_COL_CHOICES.at(-1)).toBe(16);
    expect([...GALLERY_COL_CHOICES].sort((a, b) => a - b)).toEqual([...GALLERY_COL_CHOICES]);
  });
  it("หมุนลูกกลิ้งไปถึง 16 แล้วหยุด", () => {
    expect(stepGalleryCols(14, 1, GALLERY_COL_CHOICES)).toBe(16);
    expect(stepGalleryCols(16, 1, GALLERY_COL_CHOICES)).toBe(16);
  });
  it("แม่แบบกริด: จอแคบลดจำนวนเอง (auto-fill + ขั้นต่ำ 70px)", () => {
    const t = galleryTemplate(16, "0.75rem");
    expect(t).toContain("auto-fill");
    expect(t).toContain("max(70px");
    expect(t).toContain("15 * 0.75rem");
    expect(galleryTemplate(1)).toBe("minmax(0, 1fr)");
  });
  it("การ์ดเล็กมาก (12+) = ซ่อนชื่อ · รูปย่อเล็กลงตามจำนวน", () => {
    expect(isCompactGallery(10)).toBe(false);
    expect(isCompactGallery(12)).toBe(true);
    expect(galleryThumbWidth(6)).toBe(480);
    expect(galleryThumbWidth(10)).toBe(240);
    expect(galleryThumbWidth(16)).toBe(200);
    expect(galleryThumbWidth(16, 120)).toBe(120);
  });
});
