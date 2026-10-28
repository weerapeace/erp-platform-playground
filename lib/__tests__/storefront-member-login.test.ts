import { describe, it, expect, beforeAll } from "vitest";
import { createPublicKey, verify } from "crypto";
import { issueMemberToken, memberPublicJwk, verifyMemberToken, MEMBER_TOKEN_TTL_SEC } from "../storefront-member-token";
import { callbackUrl, providerReady, readIdToken, redirectMatches } from "../storefront-oauth";
import { loginMember, sanitizeLoginIntent } from "../website-members-db";
import { fakeDb } from "./fake-db";

/** 👤 สมาชิกเว็บร้าน: บัตรสมาชิก (ERP เซ็น) · ตรวจ OAuth ฝั่ง ERP · แท็บสมัคร/เข้าสู่ระบบ + ยอมรับนโยบาย (PDPA) */
beforeAll(() => {
  process.env.STOREFRONT_MEMBER_SECRET = "test-secret-for-member-token-0123456789";
});

const ID = "11111111-2222-4333-8444-555555555555";
const T0 = Date.UTC(2026, 9, 28, 3, 0, 0);

describe("🎫 บัตรสมาชิก", () => {
  it("ออกแล้วตรวจผ่าน · คนละร้าน / หมดอายุ / แก้ไส้ใน = ไม่ผ่าน", () => {
    const t = issueMemberToken({ shop: "louismontini", memberId: ID, name: "ทดลอง", avatar: null }, T0)!;
    expect(t.split(".")).toHaveLength(3);
    expect(verifyMemberToken(t, "louismontini", T0)?.memberId).toBe(ID);
    expect(verifyMemberToken(t, "pixiedustie", T0)).toBeNull();
    expect(verifyMemberToken(t, "louismontini", T0 + (MEMBER_TOKEN_TTL_SEC + 1) * 1000)).toBeNull();
    const [h, p, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), sub: "99999999-2222-4333-8444-555555555555" })).toString("base64url");
    expect(verifyMemberToken(`${h}.${forged}.${s}`, "louismontini", T0)).toBeNull();
    expect(verifyMemberToken("abc.def.ghi", "louismontini", T0)).toBeNull();
  });

  it("เว็บร้านตรวจเองได้ด้วยกุญแจสาธารณะ (ไม่ต้องรู้กุญแจลับ)", () => {
    const t = issueMemberToken({ shop: "pixiedustie", memberId: ID, name: "A", avatar: "https://x.test/a.jpg" }, T0)!;
    const jwk = memberPublicJwk()!;
    expect(jwk).toMatchObject({ kty: "OKP", crv: "Ed25519", alg: "EdDSA" });
    expect(JSON.stringify(jwk)).not.toContain("\"d\"");
    const pub = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: jwk.x }, format: "jwk" });
    const [h, p, s] = t.split(".");
    expect(verify(null, Buffer.from(`${h}.${p}`), pub, Buffer.from(s, "base64url"))).toBe(true);
  });
});

describe("🔑 OAuth ฝั่ง ERP", () => {
  const idToken = (claims: Record<string, unknown>) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
  it("id_token ต้องออกให้แอปของร้านนี้ (aud) จากผู้ให้บริการจริง (iss)", () => {
    const want = { aud: "abc.apps.googleusercontent.com", iss: ["https://accounts.google.com", "accounts.google.com"] };
    const exp = Math.floor(T0 / 1000) + 600;
    expect(readIdToken(idToken({ aud: want.aud, iss: "https://accounts.google.com", sub: "g1", exp }), want, T0)?.sub).toBe("g1");
    expect(readIdToken(idToken({ aud: "other", iss: "https://accounts.google.com", sub: "g1", exp }), want, T0)).toBeNull();
    expect(readIdToken(idToken({ aud: want.aud, iss: "https://evil.test", sub: "g1", exp }), want, T0)).toBeNull();
    expect(readIdToken(idToken({ aud: want.aud, iss: "accounts.google.com", sub: "", exp }), want, T0)).toBeNull();
    expect(readIdToken("garbage", want, T0)).toBeNull();
  });
  it("callback ต้องตรงกับช่องทาง + โดเมนที่เชื่อถือ", () => {
    const o = "https://louismontini.co.th";
    expect(redirectMatches(callbackUrl(o, "line"), o, "line")).toBe(true);
    expect(redirectMatches(callbackUrl(o, "google"), o, "line")).toBe(false);
    expect(redirectMatches(callbackUrl(o, "line"), null, "line")).toBe(false);
    expect(redirectMatches("https://evil.test/api/auth/line/callback", o, "line")).toBe(false);
  });
  it("ปุ่มขึ้นเมื่อมีทั้งรหัส + รหัสลับ + เปิดอยู่", () => {
    expect(providerReady({ client_id: "1", client_secret: "s", enabled: true })).toBe(true);
    expect(providerReady({ client_id: "1", client_secret: "", enabled: true })).toBe(false);
    expect(providerReady({ client_id: "1", client_secret: "s", enabled: false })).toBe(false);
    expect(providerReady(undefined)).toBe(false);
  });
});

describe("✅ แท็บสมัคร / เข้าสู่ระบบ (PDPA)", () => {
  const profile = { provider: "google" as const, providerUserId: "g-new", email: "new@example.test", emailVerified: true, name: "ลูกค้าใหม่", avatarUrl: null };
  const db = () => {
    const tables = { store_customers: [] as Record<string, unknown>[], store_customer_identities: [] as Record<string, unknown>[] };
    return { tables, sb: fakeDb(tables) as unknown as Parameters<typeof loginMember>[0] };
  };

  it("แท็บเข้าสู่ระบบ + ยังไม่เคยสมัคร = ไม่สร้างบัญชี (need_signup)", async () => {
    const { tables, sb } = db();
    const r = await loginMember(sb, "shop-1", profile, { mode: "login" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("need_signup");
    expect(tables.store_customers).toHaveLength(0);
  });

  it("แท็บสมัครแต่ไม่ติ๊กยอมรับ = ไม่สร้างบัญชี", async () => {
    const { tables, sb } = db();
    const r = await loginMember(sb, "shop-1", profile, { mode: "signup", consent: false });
    expect(!r.ok && r.code).toBe("need_consent");
    expect(tables.store_customers).toHaveLength(0);
  });

  it("ติ๊กยอมรับ = สร้างบัญชี + บันทึกเวลายอมรับ + รับข่าวสารตามที่ติ๊ก", async () => {
    const { tables, sb } = db();
    const r = await loginMember(sb, "shop-1", profile, sanitizeLoginIntent({ mode: "signup", consent: true, marketing: true }));
    expect(r.ok && r.created).toBe(true);
    expect(tables.store_customers[0].terms_accepted_at).toBeTruthy();
    expect(tables.store_customers[0].marketing_opt_in).toBe(true);
    expect(tables.store_customer_identities).toHaveLength(1);
  });

  it("เว็บร้านรุ่นเก่า (ไม่ส่ง mode) = สร้างให้แบบเดิม", async () => {
    const { tables, sb } = db();
    const r = await loginMember(sb, "shop-1", profile);
    expect(r.ok).toBe(true);
    expect(tables.store_customers).toHaveLength(1);
  });

  it("sanitizeLoginIntent รับเฉพาะค่าที่รู้จัก", () => {
    expect(sanitizeLoginIntent({ mode: "hack", consent: "yes" })).toEqual({ mode: undefined, consent: false, marketing: false });
  });
});
