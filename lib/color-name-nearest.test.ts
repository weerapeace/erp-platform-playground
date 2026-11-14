import { describe, expect, it } from "vitest";
import { colorNamePalette, deltaE2000, hexToLab, nearestColorName, type SwatchEntry } from "./color-swatch";

const e = (th: string, en: string, hex: string, kind: SwatchEntry["kind"] = "solid"): SwatchEntry => ({ th, en, kind, colors: [hex], imageKey: null });
const ENTRIES: SwatchEntry[] = [
  e("ดำ", "Black", "#1A1A1A"), e("ขาว", "White", "#F7F7F5"), e("กรมท่า", "Navy", "#1F2A44"), e("กากี", "Khaki", "#A89A6A"),
  e("คาราเมล", "Caramel", "#A86B32"), e("แดงเลือดหมู", "Maroon", "#6E1F2A"), e("บานเย็น", "Fuchsia Pink", "#C14B71"),
  e("Black Cat", "Black Cat", "#303030"), e("ลายจุด", "Dots", "#000000", "image"), e("เเทน", "Tan", "#CD6640"), e("แทน", "Tan", "#C19A6B"),
];

describe("deltaE2000", () => {
  it("สีเดียวกัน = 0 · ค่าอ้างอิงมาตรฐาน (Sharma 2005 คู่ที่ 1) ≈ 2.04", () => {
    const l = hexToLab("#336699")!;
    expect(deltaE2000(l, l)).toBeCloseTo(0, 6);
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3);
  });
});

describe("nearestColorName (ตั้งชื่อสีจากสีที่วัดได้)", () => {
  const pal = colorNamePalette(ENTRIES);
  it("ใช้เฉพาะสีเดียว + ชื่อไทย · สะกด เเ = แ ซ้ำใช้แถวแรก", () => {
    expect(pal.map((p) => p.th)).toEqual(["ดำ", "ขาว", "กรมท่า", "กากี", "คาราเมล", "แดงเลือดหมู", "บานเย็น", "แทน"]);
  });
  it("สีที่วัดได้จากแผงจริง → ชื่อที่ใกล้ที่สุด", () => {
    expect(nearestColorName("#b5761e", pal)?.th).toBe("คาราเมล");    // เหลืองทองอมน้ำตาล (เดิม AI เรียก ม่วงแดง)
    expect(nearestColorName("#b0a26f", pal)?.th).toBe("กากี");       // (เดิม AI เรียก ชมพูอ่อน)
    expect(nearestColorName("#1b1f3a", pal)?.th).toBe("กรมท่า");
    expect(nearestColorName("#4a0b14", pal)?.th).toBe("แดงเลือดหมู");
    expect(nearestColorName("#0a0d0b", pal)?.th).toBe("ดำ");
  });
  it("ค่าสีผิด / ทะเบียนว่าง = null", () => {
    expect(nearestColorName("red", pal)).toBeNull();
    expect(nearestColorName("#ffffff", [])).toBeNull();
  });
});
