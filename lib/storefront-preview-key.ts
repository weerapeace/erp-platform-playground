/**
 * 🔑 รหัสพรีวิวเว็บร้าน (ฝั่งเซิร์ฟเวอร์เท่านั้น) · audit 2026-10-21 ขั้นที่ 5 เฟส 2
 *
 * ปัญหาเดิม: ใครก็เติม ?preview=1 แล้วเห็นเว็บที่ปิดอยู่ / ร่างที่ยังไม่เผยแพร่ / สั่งซื้อตอนปิดเว็บได้
 * ทางแก้: ERP แนบ &pk=<รหัส> ให้ลิงก์พรีวิวทุกลิงก์ (ตัวจัดหน้า / ดีไซน์ / เข็มขัด) — รหัสผูกกับร้าน + มีวันหมดอายุ + เซ็นด้วยกุญแจลับ
 * - กุญแจ = แฮชจาก STOREFRONT_PREVIEW_SECRET (ถ้าตั้ง) หรือ SUPABASE_SERVICE_ROLE_KEY — ไม่ต้องตั้ง env ใหม่
 * - อายุ 12–18 ชม. (ปัดเป็นช่วง 6 ชม.) → รหัสเหมือนเดิมตลอดช่วง = โหลดข้อมูลใหม่แล้ว iframe ไม่รีโหลดเอง
 * - ลิงก์ที่คัดลอกส่งทีม ใช้ได้ถึงหมดอายุ (เปิดหน้าตัวจัดหน้าใหม่ = ได้รหัสใหม่)
 * ฝั่งหน้าจอใช้ lib/storefront-preview-link (ต่อ pk เข้า URL) · ห้าม import ไฟล์นี้ในโค้ด "use client"
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";

const BUCKET_SEC = 6 * 3600;
/** อายุขั้นต่ำ 12 ชม. (ออกต้นช่วง = 18 ชม.) */
const MIN_LIFE_BUCKETS = 2;
const MAX_LIFE_SEC = (MIN_LIFE_BUCKETS + 1) * BUCKET_SEC;

function secretKey(): Buffer | null {
  const base = process.env.STOREFRONT_PREVIEW_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base) return null;
  return createHash("sha256").update(`storefront-preview:v1:${base}`).digest();
}

function sign(key: Buffer, shopSlug: string, exp: number): string {
  return createHmac("sha256", key).update(`${shopSlug}|${exp}`).digest("base64url").slice(0, 32);
}

/** ออกรหัสพรีวิวของร้าน (ไม่มีกุญแจ = null → ลิงก์ไม่มี pk เหมือนเดิม) */
export function issuePreviewKey(shopSlug: string, nowMs = Date.now()): string | null {
  const key = secretKey();
  if (!key || !shopSlug) return null;
  const exp = (Math.floor(nowMs / 1000 / BUCKET_SEC) + MIN_LIFE_BUCKETS + 1) * BUCKET_SEC;
  return `${exp.toString(36)}.${sign(key, shopSlug, exp)}`;
}

/** รหัสนี้ใช้กับร้านนี้ได้ไหม (ยังไม่หมดอายุ + ลายเซ็นตรง) */
export function verifyPreviewKey(shopSlug: string, pk: unknown, nowMs = Date.now()): boolean {
  if (typeof pk !== "string" || pk.length > 64 || !shopSlug) return false;
  const m = /^([0-9a-z]{1,10})\.([A-Za-z0-9_-]{32})$/.exec(pk);
  if (!m) return false;
  const exp = parseInt(m[1], 36);
  const now = nowMs / 1000;
  if (!(exp > now) || exp - now > MAX_LIFE_SEC + 60) return false;
  const key = secretKey();
  if (!key) return false;
  const want = Buffer.from(sign(key, shopSlug, exp));
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got);
}
