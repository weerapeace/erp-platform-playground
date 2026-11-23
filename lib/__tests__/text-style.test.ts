import { describe, expect, it } from "vitest";
import { applyListPrefix, cleanTextStyle, clampTextSize, describeTextStyle, textStyleCss } from "@/lib/text-style";

describe("text style (ตัวตั้งค่าตัวอักษรกลาง)", () => {
  it("cleanTextStyle: เก็บแค่ค่าถูกต้อง · ขนาดบีบ 6-25 · ว่าง = null", () => {
    expect(cleanTextStyle({ size: 99, color: "red", highlight: "#FEF08A", bold: true, italic: "yes", align: "middle", list: "number", font: 6 }))
      .toEqual({ size: 25, highlight: "#FEF08A", bold: true, list: "number", font: "6" });
    expect(cleanTextStyle({ junk: 1 })).toBeNull();
    expect(cleanTextStyle(null)).toBeNull();
    expect(clampTextSize(2)).toBe(6);
    expect(clampTextSize("x", 12)).toBe(12);
  });
  it("bullets / เลข", () => {
    expect(applyListPrefix("a\nb", "bullet")).toBe("• a\n• b");
    expect(applyListPrefix("a\nb", "number")).toBe("1. a\n2. b");
    expect(applyListPrefix("a", "none")).toBe("a");
  });
  it("แปลงเป็น CSS + คำสรุป", () => {
    expect(textStyleCss({ size: 14, bold: true, underline: true, strike: true, highlight: "#fef08a", align: "center", font: "k" }, (f) => (f === "k" ? "Kanit" : undefined)))
      .toMatchObject({ fontSize: 14, fontWeight: 700, textDecoration: "underline line-through", backgroundColor: "#fef08a", textAlign: "center", fontFamily: "Kanit" });
    expect(textStyleCss(null)).toEqual({});
    expect(describeTextStyle({ size: 12, bold: true, list: "bullet" })).toBe("12px · หนา · •");
  });
});
