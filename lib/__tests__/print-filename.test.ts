import { describe, it, expect } from "vitest";
import { docFileName, sanitizeFileName } from "../print-filename";

describe("ชื่อไฟล์ PDF", () => {
  it("ประกอบชื่อตามรูปแบบที่ตกลง", () => {
    expect(docFileName("ใบเสนอราคา", "QT-202607-0005")).toBe("ใบเสนอราคา - QT-202607-0005");
    expect(docFileName("ใบสั่งซื้อ", "PO-2026-00032")).toBe("ใบสั่งซื้อ - PO-2026-00032");
  });
  it("ไม่มีเลขที่เอกสาร → เหลือแค่ชื่อเอกสาร", () => {
    expect(docFileName("ใบเสนอราคา", null)).toBe("ใบเสนอราคา");
    expect(docFileName("ใบเสนอราคา", "  ")).toBe("ใบเสนอราคา");
  });
  it("ตัดอักขระที่ตั้งชื่อไฟล์ไม่ได้ แต่คงขีดกลางกับเว้นวรรคไว้", () => {
    expect(sanitizeFileName("ใบเสนอราคา - QT/2026:05")).toBe("ใบเสนอราคา - QT-2026-05");
    expect(sanitizeFileName("a\nb\tc")).toBe("a b c");
  });
  it("ชื่อยาวเกินถูกตัด", () => {
    expect(sanitizeFileName("ก".repeat(200)).length).toBe(120);
  });
});
