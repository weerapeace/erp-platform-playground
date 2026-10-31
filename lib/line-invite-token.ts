// ============================================================
// รหัสลับในบัตร QR "สมัครรับสลิปทาง LINE" (HR พิมพ์แจกพนักงานทีละคน) — เซ็นด้วย HMAC ไม่ต้องเก็บ DB
// รูปแบบ: base64url("join|<employeeId>|<iat>|<exp>") + "." + sig · มีวันออก/วันหมดอายุในตัว
// "ใช้ได้ครั้งเดียว" ตรวจที่ตอนผูก (lib/line-employee-portal-db): ผูกแล้ว = ใช้ซ้ำไม่ได้ ·
// HR กด "ปลดผูก" หลังพิมพ์บัตร = บัตรเก่าใช้ไม่ได้ (เทียบ iat กับเวลาปลดผูกล่าสุด)
// ============================================================
import crypto from "crypto";
import { APPROVE_LIFF_ID } from "@/lib/approval-token";

const SECRET = process.env.APPROVAL_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-approval-secret";
const APP_BASE = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://erp-platform-playground.vercel.app").replace(/\/$/, "");
const PREFIX = "join";

/** อายุบัตร QR (วัน) */
export const LINE_INVITE_TTL_DAYS = 14;

// แยก key จากโทเคนหน้าอนุมัติ (lib/approval-token) — เอาโทเคนชนิดหนึ่งไปใช้แทนอีกชนิดไม่ได้
function sigOf(payload: string): string {
  return crypto.createHmac("sha256", `line-invite:${SECRET}`).update(payload).digest("base64url").slice(0, 32);
}

export type LineInvite = { employeeId: string; iat: number; exp: number };

/** สร้างรหัสบัตร QR ของพนักงานหนึ่งคน */
export function signLineInviteToken(employeeId: string, ttlDays = LINE_INVITE_TTL_DAYS, nowMs = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + Math.round(ttlDays * 86400);
  const payload = `${PREFIX}|${employeeId}|${iat}|${exp}`;
  return `${Buffer.from(payload).toString("base64url")}.${sigOf(payload)}`;
}

/** ตรวจรหัสบัตร → คืนข้อมูลถ้าถูกต้อง+ยังไม่หมดอายุ · ไม่งั้น null */
export function verifyLineInviteToken(token: string, nowMs = Date.now()): LineInvite | null {
  try {
    const [b64, sig, extra] = String(token || "").split(".");
    if (!b64 || !sig || extra !== undefined) return null;
    const payload = Buffer.from(b64, "base64url").toString("utf8");
    const expected = sigOf(payload);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const [prefix, employeeId, iatStr, expStr] = payload.split("|");
    if (prefix !== PREFIX || !employeeId) return null;
    const iat = Number(iatStr);
    const exp = Number(expStr);
    if (!Number.isFinite(iat) || !Number.isFinite(exp)) return null;
    if (exp < Math.floor(nowMs / 1000)) return null;
    return { employeeId, iat, exp };
  } catch {
    return null;
  }
}

/** ลิงก์ในบัตร QR — เปิดผ่าน LIFF (ยืนยันตัวตน LINE อัตโนมัติ) → หน้า /a?join=<token> */
export function lineInviteLink(token: string): string {
  return APPROVE_LIFF_ID
    ? `https://liff.line.me/${APPROVE_LIFF_ID}?join=${token}`
    : `${APP_BASE}/a?join=${token}`;
}
