import { describe, it, expect } from "vitest";
import { newOtpCode, otpHash, OTP_RE, OTP_RESEND_SEC, OTP_TTL_MIN, OTP_MAX_PER_HOUR } from "../member-password";
import { otpEmailMessage } from "../member-emails";

describe("✉️ รหัส 6 หลักทางอีเมล", () => {
  it("รหัสเป็นตัวเลข 6 หลักเสมอ (เติม 0 ข้างหน้า)", () => {
    for (let i = 0; i < 200; i++) expect(newOtpCode()).toMatch(/^\d{6}$/);
  });
  it("hash ผูกกับคน — รหัสเดียวกันของ 2 คน ไม่ชนกัน", () => {
    expect(otpHash("a", "123456")).not.toBe(otpHash("b", "123456"));
    expect(otpHash("a", "123456")).toBe(otpHash("a", " 123456 "));
    expect(otpHash("a", "123456")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("รับเฉพาะ 6 หลัก", () => {
    expect(OTP_RE.test("012345")).toBe(true);
    expect(OTP_RE.test("12345")).toBe(false);
    expect(OTP_RE.test("12a456")).toBe(false);
  });
  it("กติกา: ใช้ได้ 10 นาที · ขอใหม่ทุก 60 วิ · ไม่เกิน 5 ครั้ง/ชม.", () => {
    expect([OTP_TTL_MIN, OTP_RESEND_SEC, OTP_MAX_PER_HOUR]).toEqual([10, 60, 5]);
  });
  it("อีเมลรหัส 2 ภาษา · มีรหัสในหัวเรื่อง · ไม่มีปุ่มลิงก์", () => {
    const th = otpEmailMessage("a@b.co", "ร้านทดสอบ", "048213", "th");
    expect(th.subject).toContain("048213");
    expect(th.html).toContain("048213");
    expect(th.html).not.toContain("<a href");
    expect(otpEmailMessage("a@b.co", "Shop", "048213", "en").subject).toMatch(/^Your code: 048213/);
  });
});
