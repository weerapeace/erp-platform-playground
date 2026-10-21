/**
 * 🔒 คำขอนี้มาจากตัวตั้งเวลา (Vercel Cron) จริงไหม — ของกลางสำหรับ app/api/cron/*
 *
 * - ตั้ง env CRON_SECRET ใน Vercel แล้ว → เชื่อแค่ "Authorization: Bearer <CRON_SECRET>"
 *   (Vercel แนบรหัสนี้ให้ cron ของตัวเองอัตโนมัติ) — header x-vercel-cron ใครก็ปลอมส่งมาได้
 * - ยังไม่ตั้ง CRON_SECRET → ใช้แบบเดิม (เชื่อ header x-vercel-cron) ไปก่อน ไม่ให้ cron หยุด
 *   ⚠️ ควรตั้ง CRON_SECRET ให้เร็วที่สุด (audit 2026-10-21 S13)
 */
export function isTrustedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return request.headers.get("authorization") === `Bearer ${secret}`;
  return request.headers.get("x-vercel-cron") != null;
}
