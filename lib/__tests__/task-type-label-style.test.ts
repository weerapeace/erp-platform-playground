import { describe, it, expect } from "vitest";
import { cleanLabelStyle, labelTextStyle, labelToTextStyle, textStyleToLabel } from "@/lib/task-type-label-style";

describe("task-type label style", () => {
  it("keeps only known values", () => {
    expect(cleanLabelStyle({ weight: 600, size: "lg", color: "#fff" })).toEqual({ weight: 600, size: "lg" });
    expect(cleanLabelStyle({ weight: "700" })).toEqual({ weight: 700 });
    expect(cleanLabelStyle({ weight: 650, size: "xl" })).toBeNull();
    expect(cleanLabelStyle(null)).toBeNull();
    expect(cleanLabelStyle("bold")).toBeNull();
    expect(cleanLabelStyle({ size: 40, color: "#be123c", underline: true, highlight: "#fef08a", junk: 1 })).toEqual({ size: 25, color: "#be123c", underline: true, highlight: "#fef08a" });
  });
  it("maps to inline text style (null = chip default)", () => {
    expect(labelTextStyle(null)).toBeUndefined();
    expect(labelTextStyle({ size: "md" })).toEqual({ fontSize: 10 });
    expect(labelTextStyle({ weight: 700, size: "sm" })).toEqual({ fontWeight: 700, fontSize: 9 });
    expect(labelTextStyle({ size: 13, italic: true, strike: true, underline: true })).toEqual({ fontSize: 13, fontStyle: "italic", textDecoration: "underline line-through" });
  });
  it("ตัวตั้งค่าตัวอักษรกลาง ↔ ป้าย (คงน้ำหนักเดิมถ้าไม่ได้กดหนา)", () => {
    expect(labelToTextStyle({ weight: 600, size: "lg" })).toMatchObject({ bold: true, size: 12 });
    expect(textStyleToLabel({ size: 14, color: "#123456" }, { weight: 500 })).toEqual({ weight: 500, size: 14, color: "#123456" });
    expect(textStyleToLabel({ bold: true }, { weight: 500 })).toEqual({ weight: 700 });
    expect(textStyleToLabel({ bold: false }, { weight: 700 })).toBeNull();
  });
});
