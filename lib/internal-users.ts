/**
 * internal-users.ts — ผู้ใช้ภายใน (username + PIN) ที่ไม่มีอีเมลจริง
 *
 * เบื้องหลังยังใช้ Supabase Auth โดยสร้าง "อีเมลหลอก" จาก username
 * (เช่น gogo → gogo@pin.local) แล้วใช้ PIN เป็นรหัสผ่าน
 * ของกลาง — ใช้ทั้งฝั่งสร้าง (API) และฝั่ง login (หน้า login) เพื่อให้อีเมลตรงกันเสมอ
 */

/** โดเมนหลอกสำหรับผู้ใช้ภายใน (ไม่ใช่อีเมลจริง — ใช้เป็น login id เท่านั้น) */
export const INTERNAL_EMAIL_DOMAIN = "pin.local";

/** username → อีเมลหลอกที่ใช้กับ Supabase Auth */
export function internalEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`;
}

/** ตรวจ username: a-z 0-9 _ ความยาว 3-32 (ตัวพิมพ์เล็ก) */
export function isValidUsername(u: string): boolean {
  return /^[a-z0-9_]{3,32}$/.test(u.trim().toLowerCase());
}

/** ตรวจ PIN: ตัวเลข 6 หลัก */
export function isValidPin(p: string): boolean {
  return /^\d{6}$/.test(p);
}
