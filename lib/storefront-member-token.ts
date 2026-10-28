/**
 * 🎫 บัตรสมาชิกเว็บร้าน (ฝั่งเซิร์ฟเวอร์เท่านั้น — ห้าม import ในโค้ด "use client")
 *
 * ERP เป็นคนออกบัตรให้ลูกค้าที่เข้าสู่ระบบสำเร็จ → เว็บร้านเก็บในคุกกี้ httpOnly (sf_member) → ส่งกลับมากับทุกคำขอของสมาชิก
 *   header `x-storefront-member-token` → lib/storefront-internal guardMember ตรวจลายเซ็น + ร้าน + วันหมดอายุ
 * - เซ็นด้วย Ed25519 (JWT alg EdDSA) — เว็บร้านตรวจเองได้ด้วยกุญแจสาธารณะ (memberPublicJwk → /api/public/storefront/member-config)
 *   โดยไม่ต้องรู้กุญแจลับ → ไม่ต้องตั้ง env ใน Vercel ของเว็บร้าน
 * - กุญแจลับ = สืบจาก STOREFRONT_MEMBER_SECRET (ถ้าตั้ง) หรือ SUPABASE_SERVICE_ROLE_KEY (แบบเดียวกับ lib/storefront-preview-key)
 *   เปลี่ยนค่าต้นทาง = บัตรเก่าทุกใบใช้ไม่ได้ (ลูกค้าต้องเข้าสู่ระบบใหม่)
 * - บัตรผูกร้าน (shop) + รหัสสมาชิก (sub) · อายุ 30 วัน · สถานะสมาชิก (ระงับ/ลบ) ตรวจจาก DB ทุกครั้งที่ใช้ (guardMember)
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "crypto";

export const MEMBER_TOKEN_TTL_SEC = 60 * 60 * 24 * 30;
const ISSUER = "erp";
const AUDIENCE = "storefront";
// หัว DER มาตรฐานของกุญแจลับ Ed25519 (PKCS#8) — ต่อท้ายด้วย seed 32 ไบต์
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export interface MemberPublicJwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  kid: string;
  alg: "EdDSA";
  use: "sig";
}

type Keys = { priv: KeyObject; pub: KeyObject; jwk: MemberPublicJwk };
let cache: { base: string; keys: Keys } | null = null;

function keys(): Keys | null {
  const base = process.env.STOREFRONT_MEMBER_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base) return null;
  if (cache?.base === base) return cache.keys;
  const seed = createHash("sha256").update(`storefront-member:v1:${base}`).digest();
  const priv = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
  const pub = createPublicKey(priv);
  const x = String((pub.export({ format: "jwk" }) as { x?: string }).x ?? "");
  const kid = createHash("sha256").update(x).digest("base64url").slice(0, 12);
  cache = { base, keys: { priv, pub, jwk: { kty: "OKP", crv: "Ed25519", x, kid, alg: "EdDSA", use: "sig" } } };
  return cache.keys;
}

/** ออกบัตรได้ไหม (มีกุญแจต้นทาง) — ไม่มี = ระบบสมาชิกแบบไม่ใช้กุญแจภายในปิดอยู่ */
export const memberTokensReady = (): boolean => keys() !== null;

/** กุญแจสาธารณะ (ส่งให้เว็บร้านตรวจบัตรเอง) · ไม่มีกุญแจต้นทาง = null */
export function memberPublicJwk(): MemberPublicJwk | null {
  return keys()?.jwk ?? null;
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

export interface MemberTokenInput {
  shop: string;
  memberId: string;
  name: string;
  avatar: string | null;
  isTest?: boolean;
}

/** ออกบัตรสมาชิก (JWT EdDSA) · ไม่มีกุญแจ = null */
export function issueMemberToken(m: MemberTokenInput, nowMs = Date.now()): string | null {
  const k = keys();
  if (!k || !m.shop || !m.memberId) return null;
  const iat = Math.floor(nowMs / 1000);
  const head = b64({ alg: "EdDSA", typ: "JWT", kid: k.jwk.kid });
  const body = b64({
    iss: ISSUER,
    aud: AUDIENCE,
    sub: m.memberId,
    shop: m.shop,
    name: m.name.slice(0, 120),
    avatar: m.avatar && /^https:\/\//i.test(m.avatar) ? m.avatar.slice(0, 500) : null,
    ...(m.isTest ? { test: true } : {}),
    iat,
    exp: iat + MEMBER_TOKEN_TTL_SEC,
  });
  const sig = sign(null, Buffer.from(`${head}.${body}`), k.priv).toString("base64url");
  return `${head}.${body}.${sig}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ตรวจบัตร: ลายเซ็นถูก + ของร้านนี้ + ยังไม่หมดอายุ → รหัสสมาชิก · ไม่ผ่าน = null */
export function verifyMemberToken(token: unknown, shop: string, nowMs = Date.now()): { memberId: string; iat: number } | null {
  const k = keys();
  if (!k || typeof token !== "string" || token.length > 2048 || !shop) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const head = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { alg?: string; kid?: string };
    if (head.alg !== "EdDSA" || head.kid !== k.jwk.kid) return null;
    if (!verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), k.pub, Buffer.from(parts[2], "base64url"))) return null;
    const p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { iss?: string; aud?: string; sub?: string; shop?: string; iat?: number; exp?: number };
    const now = Math.floor(nowMs / 1000);
    if (p.iss !== ISSUER || p.aud !== AUDIENCE || p.shop !== shop) return null;
    if (typeof p.sub !== "string" || !UUID_RE.test(p.sub)) return null;
    if (typeof p.exp !== "number" || p.exp <= now || typeof p.iat !== "number" || p.iat > now + 60) return null;
    return { memberId: p.sub, iat: p.iat };
  } catch {
    return null;
  }
}
