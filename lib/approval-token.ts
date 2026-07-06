// ============================================================
// โทเคนลับสำหรับ "หน้าอนุมัติเล็ก" (LINE) — เซ็นด้วย HMAC (ไม่ต้องเก็บ DB)
// รูปแบบ: base64url("<subtaskId>.<exp>") + "." + sig  · มีวันหมดอายุในตัว
// ============================================================
import crypto from "crypto";

const SECRET = process.env.APPROVAL_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-approval-secret";
const APP_BASE = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://erp-platform-playground.vercel.app").replace(/\/$/, "");

function sigOf(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url").slice(0, 32);
}

/** สร้างโทเคนสำหรับงานย่อยหนึ่ง (default อายุ 14 วัน) */
export function signApprovalToken(subtaskId: string, ttlDays = 14): string {
  const exp = Math.floor(Date.now() / 1000) + Math.round(ttlDays * 86400);
  const payload = `${subtaskId}.${exp}`;
  return `${Buffer.from(payload).toString("base64url")}.${sigOf(payload)}`;
}

/** ตรวจโทเคน → คืน subtaskId ถ้าถูกต้อง+ยังไม่หมดอายุ · ไม่งั้น null */
export function verifyApprovalToken(token: string): { subtaskId: string } | null {
  try {
    const [b64, sig] = String(token || "").split(".");
    if (!b64 || !sig) return null;
    const payload = Buffer.from(b64, "base64url").toString("utf8");
    if (sigOf(payload) !== sig) return null;
    const [subtaskId, expStr] = payload.split(".");
    if (!subtaskId || !expStr) return null;
    if (Number(expStr) < Math.floor(Date.now() / 1000)) return null;
    return { subtaskId };
  } catch { return null; }
}

// LINE Login channel + LIFF ของหน้าอนุมัติ (ตั้ง env ทับได้ · default = channel "ISG ERP Login")
export const APPROVE_CHANNEL_ID = process.env.LINE_APPROVE_CHANNEL_ID || "2010621559";
export const APPROVE_LIFF_ID = process.env.NEXT_PUBLIC_LINE_LIFF_ID || process.env.NEXT_PUBLIC_LIFF_ID || "2010621559-NELkN0OU";

/** ลิงก์หน้าอนุมัติเล็ก (ใส่ในข้อความ LINE) — เปิดผ่าน LIFF เพื่อ auto-login รู้ตัวตนทันที */
export function approvalLink(subtaskId: string): string {
  const token = signApprovalToken(subtaskId);
  // ส่ง token เป็น query — LIFF จะเด้งไปที่ Endpoint /a?token=... (มีหน้าจริง) · ถ้าไม่มี LIFF ใช้ path ตรง
  return APPROVE_LIFF_ID ? `https://liff.line.me/${APPROVE_LIFF_ID}?token=${token}` : `${APP_BASE}/a?token=${token}`;
}
