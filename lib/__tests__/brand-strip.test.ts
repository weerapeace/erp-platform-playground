import { describe, it, expect } from "vitest";
import { brandStripColor, hexLuminance, BRAND_STRIP_FALLBACK } from "@/lib/brand-strip";

describe("brand-strip (แถบสีแบรนด์)", () => {
  it("สีปกติใช้ได้เลย (ตัวพิมพ์เล็ก)", () => {
    expect(brandStripColor("#0B68EA")).toBe("#0b68ea");   // Louis Montini
    expect(brandStripColor("#ff70e5")).toBe("#ff70e5");   // Pixie Dustie
  });
  it("สีอ่อนมากถูกทำให้เข้มขึ้น (เหลือง Risara Ja Kissa)", () => {
    const c = brandStripColor("#ffdc5c")!;
    expect(c).not.toBe("#ffdc5c");
    expect(hexLuminance(c)).toBeLessThan(hexLuminance("#ffdc5c"));
  });
  it("ไม่มีสี / รูปแบบผิด → เทาสำรอง", () => {
    expect(brandStripColor(null)).toBe(BRAND_STRIP_FALLBACK);
    expect(brandStripColor("red")).toBe(BRAND_STRIP_FALLBACK);
    expect(brandStripColor("#fff")).toBe(BRAND_STRIP_FALLBACK);
  });
  it("fallback = null → ไม่วาดแถบ", () => {
    expect(brandStripColor(undefined, null)).toBeNull();
  });
});
