// ============================================================
// Secret Box (ของกลาง) — เข้ารหัส/ถอดรหัสความลับก่อนเก็บฐานข้อมูล (เช่น API Key ของแพลตฟอร์ม)
// วิธี: AES-256-GCM ผ่าน Web Crypto (globalThis.crypto) — พกพาได้ทั้ง Vercel (Node) และ Cloudflare Workers
//
// "กุญแจหลัก" (master key) เก็บใน env PLATFORM_SECRET_KEY (base64 ของ 32 ไบต์) — ไม่อยู่ใน DB/โค้ด
//  → ต้องรั่วทั้ง DB + env พร้อมกันถึงจะถอดรหัสได้
//
// สร้างกุญแจหลัก:  openssl rand -base64 32   (หรือ node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
// รูปแบบที่เก็บ:   "enc:v1:" + base64(iv[12] + ciphertext+tag)   · ข้อความไม่มี prefix = ยังไม่เข้ารหัส (legacy)
// ============================================================

const PREFIX = "enc:v1:";

export function hasMasterKey(): boolean {
  return !!process.env.PLATFORM_SECRET_KEY;
}

let cachedKey: CryptoKey | null = null;
async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const b64 = process.env.PLATFORM_SECRET_KEY;
  if (!b64) throw new Error("ยังไม่ได้ตั้งกุญแจหลัก (PLATFORM_SECRET_KEY)");
  const raw = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("กุญแจหลักต้องเป็น base64 ของ 32 ไบต์ (256-bit)");
  cachedKey = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return cachedKey;
}

// เข้ารหัสข้อความ → สตริงเก็บลง DB ได้ (โยน error ถ้าไม่มีกุญแจหลัก)
export async function encryptSecret(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  const buf = new Uint8Array(iv.length + ct.length);
  buf.set(iv); buf.set(ct, iv.length);
  let bin = ""; for (const b of buf) bin += String.fromCharCode(b);
  return PREFIX + btoa(bin);
}

// ถอดรหัส (ข้อความไม่มี prefix = ยังไม่เข้ารหัส → คืนตรง ๆ กัน legacy)
export async function decryptSecret(stored: string): Promise<string> {
  if (!stored.startsWith(PREFIX)) return stored;
  const key = await getKey();
  const raw = Uint8Array.from(atob(stored.slice(PREFIX.length)), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

export function isEncrypted(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith(PREFIX);
}
