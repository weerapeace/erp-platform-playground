/**
 * 🔑 รหัสผ่าน + โทเคนลิงก์ของสมาชิกเว็บร้าน (ฝั่งเซิร์ฟเวอร์เท่านั้น · ใช้ crypto ของ Node ไม่มีไลบรารีเพิ่ม)
 *
 * รหัสผ่าน: scrypt (N=16384, r=8, p=1) + salt สุ่ม 16 ไบต์ → เก็บ "scrypt$N$r$p$salt$hash" (base64url) · เทียบแบบเวลาคงที่
 * โทเคน (ยืนยันอีเมล/ตั้งรหัสใหม่): สุ่ม 32 ไบต์ ส่งในลิงก์ · ฐานข้อมูลเก็บแค่ sha256 (หลุดฐานข้อมูลก็ใช้ลิงก์ไม่ได้)
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

export const PASSWORD_MIN = 8;

/** กติการหัสผ่าน (บอกว่าต้องแก้อะไร) — ยาว 8–72 ตัว มีทั้งตัวอักษรและตัวเลข */
export function passwordProblem(pw: unknown): string | null {
  const s = String(pw ?? "");
  if (s.length < PASSWORD_MIN) return `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN} ตัว`;
  if (s.length > 72) return "รหัสผ่านยาวเกินไป (ไม่เกิน 72 ตัว)";
  if (!/[A-Za-z฀-๿]/.test(s) || !/\d/.test(s)) return "รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข";
  return null;
}

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [alg, n, r, p, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
  const want = Buffer.from(hashB64, "base64url");
  const got = scryptSync(String(pw).normalize("NFKC"), Buffer.from(saltB64, "base64url"), want.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return got.length === want.length && timingSafeEqual(got, want);
}

/** โทเคนสำหรับลิงก์ + hash ที่เก็บในฐานข้อมูล */
export function newLinkToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: tokenHash(token) };
}
export const tokenHash = (token: string) => createHash("sha256").update(String(token)).digest("hex");

/** อายุลิงก์ */
export const TOKEN_TTL_MIN = { verify: 60 * 24, reset: 30 } as const;
/** ส่งอีเมลซ้ำได้ไม่เกินกี่ครั้งต่อชั่วโมงต่อคน (กันถูกใช้ยิงอีเมลรบกวน) */
export const TOKEN_MAX_PER_HOUR = 3;
/** ผิดกี่ครั้งถึงล็อก · ล็อกกี่นาที */
export const LOGIN_MAX_FAILS = 5;
export const LOGIN_LOCK_MIN = 15;
