import { describe, it, expect } from "vitest";
import { sanitizeRichHtml } from "../sanitize-html";

// เทสต์รันบน node (ไม่มีหน้าเว็บ) → ทดสอบทางสำรองฝั่ง server: ต้องไม่เหลือ tag ที่รันสคริปต์ได้
describe("sanitizeRichHtml (ทางสำรองตอนไม่มีหน้าเว็บ)", () => {
  it("ค่าว่าง/null → สตริงว่าง", () => {
    expect(sanitizeRichHtml(null)).toBe("");
    expect(sanitizeRichHtml(undefined)).toBe("");
    expect(sanitizeRichHtml("")).toBe("");
  });
  it("ตัด tag ทิ้ง เหลือข้อความ", () => {
    expect(sanitizeRichHtml("<p>สวัสดี <b>ครับ</b></p>")).toBe("สวัสดี ครับ");
  });
  it("สคริปต์แฝงใน tag ถูกตัดทั้ง tag", () => {
    const out = sanitizeRichHtml('<img src=x onerror="alert(1)">รูป<script>alert(2)</script>');
    expect(out).not.toMatch(/<img|<script|onerror/i);
  });
  it("tag ที่ไม่ปิด (ไม่มี >) ถูก escape ไม่กลายเป็น tag", () => {
    expect(sanitizeRichHtml("ข้อความ <img src=x onerror=alert(1)")).not.toContain("<img");
  });
});
