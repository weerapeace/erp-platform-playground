import { describe, it, expect } from "vitest";
import { canUnlink, deletedMemberPatch, resolveLogin, sanitizeAddress, sanitizeLoginInput, sanitizeProfilePatch } from "../website-members";

/**
 * 👤 สมาชิกเว็บร้าน — กฎผูกบัญชี (ความปลอดภัย) + ตรวจข้อมูล
 *  ⚠️ อีเมลที่ผู้ให้บริการไม่ได้ยืนยัน ห้ามใช้ผูกเข้าบัญชีคนอื่น
 */
describe("sanitizeLoginInput", () => {
  it("รับเฉพาะวิธีที่รองรับ + ต้องมีรหัสผู้ใช้", () => {
    expect(sanitizeLoginInput({ provider: "twitter", providerUserId: "1" }).ok).toBe(false);
    expect(sanitizeLoginInput({ provider: "google", providerUserId: "" }).ok).toBe(false);
  });
  it("อีเมลตัวเล็ก · อีเมลผิดรูป = ไม่มีอีเมล · ยืนยันแล้วต้องมีอีเมลจริง · รูปต้อง https", () => {
    const r = sanitizeLoginInput({ provider: "google", providerUserId: "g1", email: " A@B.CO ", emailVerified: true, name: "  เอ   บี ", avatarUrl: "http://x/a.png" });
    expect(r).toMatchObject({ ok: true, input: { email: "a@b.co", emailVerified: true, name: "เอ บี", avatarUrl: null } });
    const bad = sanitizeLoginInput({ provider: "line", providerUserId: "l1", email: "not-email", emailVerified: true });
    expect(bad).toMatchObject({ ok: true, input: { email: null, emailVerified: false } });
  });
});

describe("resolveLogin — เข้าเป็นใคร", () => {
  const none = { byIdentity: null, byEmail: null };
  it("เคยเข้าด้วยวิธีนี้ = สมาชิกเดิม", () => {
    expect(resolveLogin({ email: null, emailVerified: false }, { ...none, byIdentity: { customerId: "c1", status: "active" } })).toEqual({ kind: "existing", customerId: "c1" });
  });
  it("อีเมลยืนยันแล้วตรงสมาชิกเดิม = ผูกวิธีใหม่เข้าบัญชีเดิม", () => {
    expect(resolveLogin({ email: "a@b.co", emailVerified: true }, { ...none, byEmail: { customerId: "c2", status: "active" } })).toEqual({ kind: "link", customerId: "c2" });
  });
  it("⚠️ อีเมลไม่ได้ยืนยัน = ไม่ผูก สร้างบัญชีใหม่ (กันสวมบัญชี)", () => {
    expect(resolveLogin({ email: "a@b.co", emailVerified: false }, { ...none, byEmail: { customerId: "c2", status: "active" } })).toEqual({ kind: "create" });
  });
  it("บัญชีถูกระงับ = เข้าไม่ได้", () => {
    expect(resolveLogin({ email: null, emailVerified: false }, { ...none, byIdentity: { customerId: "c1", status: "blocked" } })).toEqual({ kind: "blocked" });
    expect(resolveLogin({ email: "a@b.co", emailVerified: true }, { ...none, byEmail: { customerId: "c2", status: "blocked" } })).toEqual({ kind: "blocked" });
  });
  it("ไม่เจอใคร = สร้างใหม่", () => {
    expect(resolveLogin({ email: "a@b.co", emailVerified: true }, none)).toEqual({ kind: "create" });
  });
});

describe("ที่อยู่ / โปรไฟล์", () => {
  it("ที่อยู่: บอกว่าขาดอะไร · เบอร์เหลือแต่ตัวเลข · รหัสไปรษณีย์ 5 หลัก", () => {
    expect(sanitizeAddress({ name: "ก", phone: "0812345678", addressLine: "99/9 ถนน" })).toEqual({ ok: false, error: "กรุณากรอกชื่อผู้รับ" });
    expect(sanitizeAddress({ name: "สมชาย", phone: "08-1", addressLine: "99/9 ถนน" }).ok).toBe(false);
    expect(sanitizeAddress({ name: "สมชาย", phone: "081-234-5678", addressLine: "99/9 ถนนสุขุมวิท", postal: "10110-99", isDefault: true })).toMatchObject({ ok: true, address: { phone: "0812345678", postal: "10110", isDefault: true } });
  });
  it("โปรไฟล์: แก้เฉพาะช่องที่ส่งมา · ชื่อว่างไม่ได้ · เบอร์ว่าง = ลบเบอร์", () => {
    expect(sanitizeProfilePatch({ name: " " }).ok).toBe(false);
    expect(sanitizeProfilePatch({ phone: "" })).toEqual({ ok: true, patch: { phone: null } });
    expect(sanitizeProfilePatch({ marketingOptIn: true, email: "x@y.z" })).toEqual({ ok: true, patch: { marketing_opt_in: true } });
  });
});

describe("ลบบัญชี / ยกเลิกเชื่อม", () => {
  it("ลบบัญชี = ล้างข้อมูลส่วนตัวทุกช่อง + สถานะ deleted", () => {
    const p = deletedMemberPatch(new Date("2026-10-15T00:00:00Z"));
    expect(p).toMatchObject({ status: "deleted", email: null, email_verified: false, phone: null, avatar_url: null, password_hash: null, marketing_opt_in: false });
    expect(p.name).not.toMatch(/@/);
  });
  it("ยกเลิกเชื่อม: ต้องเหลืออย่างน้อย 1 ช่องทาง · ไม่ได้เชื่อม = บอก", () => {
    expect(canUnlink(2, 1)).toEqual({ ok: true });
    expect(canUnlink(1, 1).ok).toBe(false);
    expect(canUnlink(2, 0).ok).toBe(false);
  });
});
