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

/** ลิงก์หน้าอนุมัติเล็ก (ใส่ในข้อความ LINE) */
export function approvalLink(subtaskId: string): string {
  return `${APP_BASE}/a/${signApprovalToken(subtaskId)}`;
}
