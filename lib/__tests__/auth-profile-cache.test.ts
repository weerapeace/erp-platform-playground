import { describe, expect, it } from "vitest";
import {
  clearProfileCache, PROFILE_CACHE_KEY, PROFILE_CACHE_TTL, readProfileCache, shouldReloadProfile, writeProfileCache, writeProfilePerms,
  type CachedProfile,
} from "@/lib/auth-profile-cache";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
};
const P: CachedProfile = { id: "u1", email: "a@b.c", display_name: "แนน", role: "designer", active: true, avatar_url: null };

describe("profile cache (ใช้ร่วมทุกแท็บ)", () => {
  it("จดแล้วอ่านคืนได้ภายใน 60 วิ · เกินแล้วไม่ใช้", () => {
    const s = mem();
    writeProfileCache(P, ["products.view"], 1000, s);
    expect(readProfileCache("u1", 1000 + PROFILE_CACHE_TTL - 1, s)?.perms).toEqual(["products.view"]);
    expect(readProfileCache("u1", 1000 + PROFILE_CACHE_TTL + 1, s)).toBeNull();
  });
  it("คนละคน = ไม่ใช้ของคนอื่น", () => {
    const s = mem();
    writeProfileCache(P, null, 1000, s);
    expect(readProfileCache("u2", 1000, s)).toBeNull();
  });
  it("เติมสิทธิ์ทีหลังได้ (คนเดียวกันเท่านั้น)", () => {
    const s = mem();
    writeProfileCache(P, null, 1000, s);
    writeProfilePerms("u2", ["x"], s);
    expect(readProfileCache("u1", 1000, s)?.perms).toBeNull();
    writeProfilePerms("u1", ["a", "b"], s);
    expect(readProfileCache("u1", 1000, s)?.perms).toEqual(["a", "b"]);
  });
  it("ค่าผิดรูป / ล้างแล้ว = null ไม่พัง", () => {
    const s = mem();
    s.setItem(PROFILE_CACHE_KEY, "{bad");
    expect(readProfileCache("u1", 1000, s)).toBeNull();
    writeProfileCache(P, null, 1000, s);
    clearProfileCache(s);
    expect(readProfileCache("u1", 1000, s)).toBeNull();
  });
});

describe("shouldReloadProfile (กันถามซ้ำ)", () => {
  const now = 10 * 60000;
  it("ยังไม่เคยโหลด / คนใหม่ = ถาม", () => {
    expect(shouldReloadProfile("INITIAL_SESSION", "u1", null, now)).toBe(true);
    expect(shouldReloadProfile("SIGNED_IN", "u2", { uid: "u1", at: now }, now)).toBe(true);
  });
  it("คนเดิม + ต่ออายุล็อกอิน / แจ้งซ้ำ = ไม่ถาม", () => {
    expect(shouldReloadProfile("TOKEN_REFRESHED", "u1", { uid: "u1", at: now - 60000 }, now)).toBe(false);
    expect(shouldReloadProfile("INITIAL_SESSION", "u1", { uid: "u1", at: now }, now)).toBe(false);
    expect(shouldReloadProfile("SIGNED_IN", "u1", { uid: "u1", at: now }, now)).toBe(false);
  });
  it("แก้โปรไฟล์ / ค้างนานเกิน 15 นาที = ถามใหม่", () => {
    expect(shouldReloadProfile("USER_UPDATED", "u1", { uid: "u1", at: now }, now)).toBe(true);
    expect(shouldReloadProfile("TOKEN_REFRESHED", "u1", { uid: "u1", at: now - 16 * 60000 }, now)).toBe(true);
  });
});
