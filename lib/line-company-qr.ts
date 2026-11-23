/**
 * ไลน์บริษัท — QR 4 แบบ (server เท่านั้น · เซ็นด้วย HMAC) · เจ้าของเลือก 2026-11-21 · docs/line-company-oa.md
 *
 *   staff     QR พนักงาน (โปสเตอร์ติดโรงงาน)  → หน้าเล็กให้กรอกรหัสพนักงาน+เบอร์ → รอ HR ยืนยันก่อนเห็นเงินเดือน/ใบเตือน
 *   customer  QR ลูกค้ารวม (ใบเดียวทุกร้าน)    → ลูกค้าพิมพ์ชื่อร้าน → พนักงานเลือกร้าน+ยืนยันในห้องแชต /chat
 *   admin     QR แอดมิน (ไม่ติดที่สาธารณะ)     → ล็อกอินบัญชี ERP ในไลน์ → เช็กสิทธิ์ admin.users ทุกครั้ง
 *   shop      QR รายร้าน (พิมพ์ให้ร้านนั้น)     → ผูกร้านนั้นทันที ไม่ต้องรอยืนยัน
 *
 * ทุก QR = ลิงก์หน้าเล็ก LIFF  ?cq=<รหัส> (หน้า /a) · รหัสมี "เลขรุ่น" ที่เก็บใน line_config.company_qr
 *   กด "เปลี่ยน QR" = เปลี่ยนเลขรุ่น → QR ใบเก่าใช้ไม่ได้ทันที (ต้องพิมพ์ติดใหม่)
 * menu.staff / menu.customer = ลิงก์จากปุ่มเมนูล่างจอของคนที่ยังไม่ผูก (ต้องเป็นเพื่อนไลน์บริษัทแล้วถึงเห็นเมนู) — ไม่มีเลขรุ่น ไม่เลิกใช้ตอนเปลี่ยน QR
 * QR ไม่ใช่ความลับ (โปสเตอร์ใครก็ถ่ายได้) — ความปลอดภัยมาจากขั้นยืนยันตัวตนหลังสแกน ไม่ใช่ตัว QR
 *   ยกเว้น QR รายร้าน: เซ็นรหัสร้านไว้ แก้เป็นร้านอื่นเองไม่ได้ (ใครได้ QR ร้านไป = ผูกร้านนั้นได้ → ให้เฉพาะร้านนั้น)
 */
import crypto from "crypto";
import { APPROVE_LIFF_ID } from "@/lib/approval-token";

const SECRET = process.env.APPROVAL_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-approval-secret";
const APP_BASE = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://erp-platform-playground.vercel.app").replace(/\/$/, "");

// ชื่อ/ชนิด QR อยู่ไฟล์แยก (หน้าเว็บ import ได้โดยไม่ติด crypto) — ส่งต่อจากที่นี่ให้ฝั่งเซิร์ฟเวอร์ใช้เหมือนเดิม
import { QR_KINDS, type CompanyQrKind } from "@/lib/line-company-qr-labels";
export { POSTER_QR_KINDS, QR_KINDS, QR_LABEL, type CompanyQrKind } from "@/lib/line-company-qr-labels";

/** เลขรุ่นของ QR แต่ละแบบ (line_config.company_qr) */
export type CompanyQrState = Partial<Record<CompanyQrKind, string>> & { rotated_at?: Partial<Record<CompanyQrKind, string>> };

const NONCE_RE = /^[A-Za-z0-9_-]{6,24}$/;
export const newQrNonce = (): string => crypto.randomBytes(6).toString("base64url");

/** อ่านเลขรุ่นที่เก็บไว้ — ค่าแปลกทิ้ง */
export function qrStateOf(raw: unknown): CompanyQrState {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: CompanyQrState = {};
  for (const k of QR_KINDS) if (typeof o[k] === "string" && NONCE_RE.test(o[k] as string)) out[k] = o[k] as string;
  if (o.rotated_at && typeof o.rotated_at === "object") out.rotated_at = o.rotated_at as CompanyQrState["rotated_at"];
  return out;
}

/** มีเลขรุ่นครบทุกแบบไหม (ยังไม่ครบ = ต้องสร้างแล้วบันทึกก่อนแจก QR) */
export const qrStateComplete = (st: CompanyQrState): boolean => QR_KINDS.every((k) => !!st[k]);

/** เติมเลขรุ่นที่ยังไม่มี (ไม่เปลี่ยนของเดิม) */
export function fillQrState(st: CompanyQrState): CompanyQrState {
  const out = { ...st };
  for (const k of QR_KINDS) if (!out[k]) out[k] = newQrNonce();
  return out;
}

/** เปลี่ยน QR แบบหนึ่ง = เลขรุ่นใหม่ (ใบเก่าใช้ไม่ได้) */
export function rotateQr(st: CompanyQrState, kind: CompanyQrKind, nowIso = new Date().toISOString()): CompanyQrState {
  return { ...st, [kind]: newQrNonce(), rotated_at: { ...(st.rotated_at ?? {}), [kind]: nowIso } };
}

function sigOf(payload: string): string {
  return crypto.createHmac("sha256", `line-company-qr:${SECRET}`).update(payload).digest("base64url").slice(0, 22);
}

/** รหัสใน QR โปสเตอร์ (staff/customer/admin) */
export function posterQrCode(kind: Exclude<CompanyQrKind, "shop">, st: CompanyQrState): string | null {
  const n = st[kind];
  return n ? `${kind}.${n}` : null;
}

/** รหัสใน QR รายร้าน — เซ็นรหัสร้าน+เลขรุ่น (แก้เป็นร้านอื่นไม่ได้) */
export function shopQrCode(partnerId: string, st: CompanyQrState): string | null {
  const n = st.shop;
  if (!n || !/^[0-9a-f-]{36}$/i.test(partnerId)) return null;
  const body = Buffer.from(`${partnerId}|${n}`).toString("base64url");
  return `shop.${body}.${sigOf(`shop|${partnerId}|${n}`)}`;
}

export type ParsedQr =
  | { ok: true; kind: Exclude<CompanyQrKind, "shop"> }
  | { ok: true; kind: "shop"; partnerId: string }
  | { ok: false; reason: "invalid" | "rotated" };

/** อ่านรหัส QR — ปลอม/พิมพ์ผิด = invalid · เลขรุ่นเก่า (เปลี่ยน QR ไปแล้ว) = rotated */
export function parseQrCode(code: unknown, st: CompanyQrState): ParsedQr {
  const c = typeof code === "string" ? code.trim() : "";
  const [kind, a, b, extra] = c.split(".");
  if (extra !== undefined) return { ok: false, reason: "invalid" };
  if (kind === "menu" && b === undefined && (a === "staff" || a === "customer")) return { ok: true, kind: a };
  if (kind === "staff" || kind === "customer" || kind === "admin") {
    if (b !== undefined || !a || !NONCE_RE.test(a)) return { ok: false, reason: "invalid" };
    return a === st[kind] ? { ok: true, kind } : { ok: false, reason: "rotated" };
  }
  if (kind === "shop" && a && b) {
    let partnerId = ""; let n = "";
    try { [partnerId, n] = Buffer.from(a, "base64url").toString("utf8").split("|"); } catch { return { ok: false, reason: "invalid" }; }
    if (!partnerId || !n || !/^[0-9a-f-]{36}$/i.test(partnerId)) return { ok: false, reason: "invalid" };
    const expected = sigOf(`shop|${partnerId}|${n}`);
    if (b.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(b), Buffer.from(expected))) return { ok: false, reason: "invalid" };
    return n === st.shop ? { ok: true, kind: "shop", partnerId } : { ok: false, reason: "rotated" };
  }
  return { ok: false, reason: "invalid" };
}

/** ลิงก์จากปุ่มเมนูล่างจอ "ฉันเป็นพนักงาน/ลูกค้า" → หน้ายืนยันตัวตน (ไม่ผูกเลขรุ่น QR) */
export const menuVerifyCode = (kind: "staff" | "customer") => `menu.${kind}`;

/** ลิงก์ที่อยู่ใน QR — เปิดผ่าน LIFF (รู้ว่าเป็นใครในไลน์ + ชวนเพิ่มเพื่อนไลน์บริษัท) → หน้า /a?cq=<รหัส> */
export function companyQrLink(code: string): string {
  return APPROVE_LIFF_ID ? `https://liff.line.me/${APPROVE_LIFF_ID}?cq=${encodeURIComponent(code)}` : `${APP_BASE}/a?cq=${encodeURIComponent(code)}`;
}

export const QR_INVALID_TEXT: Record<"invalid" | "rotated", string> = {
  invalid: "QR นี้ใช้ไม่ได้ — สแกนใหม่อีกครั้ง หรือติดต่อบริษัท",
  rotated: "QR นี้เลิกใช้แล้ว (บริษัทเปลี่ยน QR ใหม่) — ขอ QR ใบใหม่จากบริษัท",
};
