/**
 * 🔑 ลิงก์รีวิวของออเดอร์ (ฝั่งเซิร์ฟเวอร์เท่านั้น) — /review?t=<รหัส> บนเว็บร้าน
 * ใส่ในอีเมลขอบคุณ + ปุ่มในหน้าตามออเดอร์ · ใครถือลิงก์ = รีวิวสินค้าในออเดอร์นั้นได้ (แทนการกรอกเลขออเดอร์+เบอร์)
 * รหัส = id ออเดอร์ + วันหมดอายุ (180 วัน) + ลายเซ็น · กุญแจแฮชจาก STOREFRONT_PREVIEW_SECRET / SUPABASE_SERVICE_ROLE_KEY (แบบ lib/storefront-preview-key)
 * ไม่มีข้อมูลส่วนตัวในลิงก์ (ไม่มีเบอร์/ชื่อ) · ห้าม import ในโค้ด "use client"
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";

const LIFE_SEC = 180 * 24 * 3600;

function secretKey(): Buffer | null {
  const base = process.env.STOREFRONT_PREVIEW_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base) return null;
  return createHash("sha256").update(`storefront-review:v1:${base}`).digest();
}

const sign = (key: Buffer, id: string, exp: number) => createHmac("sha256", key).update(`${id}|${exp}`).digest("base64url").slice(0, 24);

export function issueReviewToken(orderId: string, nowMs = Date.now()): string | null {
  const key = secretKey();
  const id = String(orderId ?? "").replace(/-/g, "").toLowerCase();
  if (!key || !/^[0-9a-f]{32}$/.test(id)) return null;
  const exp = Math.floor(nowMs / 1000) + LIFE_SEC;
  return `${id}.${exp.toString(36)}.${sign(key, id, exp)}`;
}

/** รหัสถูก + ยังไม่หมดอายุ → id ออเดอร์ (รูปแบบมีขีด) · ไม่งั้น null */
export function verifyReviewToken(token: unknown, nowMs = Date.now()): string | null {
  if (typeof token !== "string" || token.length > 80) return null;
  const m = /^([0-9a-f]{32})\.([0-9a-z]{1,10})\.([A-Za-z0-9_-]{24})$/.exec(token);
  const key = secretKey();
  if (!m || !key) return null;
  const exp = parseInt(m[2], 36);
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return null;
  const want = Buffer.from(sign(key, m[1], exp));
  const got = Buffer.from(m[3]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const h = m[1];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** ลิงก์เต็มบนเว็บร้าน (ยังไม่มีโดเมน/กุญแจ = null) */
export function reviewUrl(siteUrl: string | null, orderId: string, lang: "th" | "en" = "th"): string | null {
  const t = siteUrl ? issueReviewToken(orderId) : null;
  return t ? `${siteUrl}${lang === "en" ? "/en" : ""}/review?t=${t}` : null;
}
