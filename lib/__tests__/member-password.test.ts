import { describe, it, expect } from "vitest";
import { hashPassword, newLinkToken, passwordProblem, tokenHash, verifyPassword } from "../member-password";

/** 🔑 รหัสผ่าน/โทเคนของสมาชิก — ความปลอดภัยพื้นฐาน */
describe("รหัสผ่าน", () => {
  it("hash แล้วตรวจผ่าน · รหัสผิดไม่ผ่าน · salt สุ่ม (hash ไม่ซ้ำ)", () => {
    const h = hashPassword("Secret123");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("Secret123", h)).toBe(true);
    expect(verifyPassword("secret123", h)).toBe(false);
    expect(hashPassword("Secret123")).not.toBe(h);
  });
  it("ค่าเก็บเสีย/ว่าง = ไม่ผ่าน (ไม่พัง)", () => {
    expect(verifyPassword("x", null)).toBe(false);
    expect(verifyPassword("x", "md5$abc")).toBe(false);
  });
  it("กติกา: ≥ 8 ตัว · มีตัวอักษร+ตัวเลข (ตัวอักษรไทยนับ)", () => {
    expect(passwordProblem("abc12")).toContain("8");
    expect(passwordProblem("abcdefgh")).toContain("ตัวเลข");
    expect(passwordProblem("12345678")).toContain("ตัวอักษร");
    expect(passwordProblem("รหัสผ่าน2026")).toBeNull();
    expect(passwordProblem("Secret123")).toBeNull();
  });
});

describe("โทเคนลิงก์", () => {
  it("ฐานข้อมูลเก็บแค่ sha256 · โทเคนสุ่มไม่ซ้ำ", () => {
    const a = newLinkToken();
    const b = newLinkToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(tokenHash(a.token));
    expect(a.hash).not.toContain(a.token);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
