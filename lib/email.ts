/**
 * ✉️ ส่งอีเมล (ของกลาง ERP · ฝั่งเซิร์ฟเวอร์เท่านั้น) — รองรับ 2 ช่องทาง เลือกให้อัตโนมัติ
 *
 * env (ตั้งใน Vercel โปรเจกต์ ERP — ความลับ):
 *   ช่องทาง 1 · Resend (ใช้โดเมนบริษัท — มาก่อนถ้าตั้งครบ)
 *     RESEND_API_KEY      กุญแจ API ของ Resend
 *     EMAIL_FROM          อีเมลผู้ส่งบนโดเมนที่ยืนยันกับ Resend แล้ว เช่น erp@louismontini.co.th
 *   ช่องทาง 2 · Gmail (เจ้าของเลือก 2026-10-22 — ไม่ต้องยุ่ง DNS · ส่งได้ ~500 ฉบับ/วัน)
 *     GMAIL_USER          อีเมล Gmail ที่ใช้ส่ง เช่น louismontini.erp@gmail.com
 *     GMAIL_APP_PASSWORD  "รหัสผ่านสำหรับแอป" 16 ตัว (myaccount.google.com/apppasswords · ต้องเปิดยืนยัน 2 ขั้นตอนก่อน)
 * ไม่ตั้งทั้งคู่ = ส่งไม่ได้ (คืน { ok:false, error:"email-not-configured" }) — ฟีเจอร์ที่พึ่งอีเมลต้องบอกผู้ใช้เอง
 * เครื่อง dev: EMAIL_DEV_ECHO=1 (+ NODE_ENV=development) = ไม่ส่งจริง พิมพ์ลง console + คืนเนื้อหาให้ผู้เรียก (ทดสอบลิงก์ได้)
 * คู่มือตั้งค่า: docs/email-setup.md · หน้า ตั้งค่า → ส่งอีเมลรายงาน
 */
import type { Transporter } from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** ชื่อผู้ส่งที่ลูกค้าเห็น เช่น ชื่อร้าน */
  fromName?: string;
  /** ผู้รับกด "ตอบกลับ" แล้วไปหาอีเมลนี้ (เช่น พนักงานที่กดส่ง) */
  replyTo?: string;
}

export type EmailResult = { ok: true; id?: string; devEcho?: EmailMessage } | { ok: false; error: string };
export type EmailProvider = "resend" | "gmail";

export const emailDevEcho = () => process.env.NODE_ENV === "development" && process.env.EMAIL_DEV_ECHO === "1";
const resendReady = () => !!process.env.RESEND_API_KEY?.trim() && !!process.env.EMAIL_FROM?.trim();
const gmailUser = () => process.env.GMAIL_USER?.trim() ?? "";
const gmailPass = () => (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s+/g, "");   // รหัสแอปมีเว้นวรรคมาก็ใช้ได้
const gmailReady = () => !!gmailUser() && !!gmailPass();

/** ช่องทางที่ใช้อยู่ (Resend มาก่อนถ้าตั้งครบ) · null = ยังไม่ได้ตั้ง */
export const emailProvider = (): EmailProvider | null => (resendReady() ? "resend" : gmailReady() ? "gmail" : null);
export const emailConfigured = () => emailProvider() !== null;
/** อีเมลผู้ส่งที่ผู้รับจะเห็น (ไว้โชว์ในหน้าตั้งค่า — ไม่ใช่ความลับ) */
export const emailSenderAddress = (): string | null => {
  const p = emailProvider();
  return p === "resend" ? process.env.EMAIL_FROM!.trim() : p === "gmail" ? gmailUser() : null;
};

const safeName = (s: string) => s.replace(/["<>\r\n]/g, "").slice(0, 60);
const safeAddr = (s: string | undefined) => (s && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s.trim()) ? s.trim() : undefined);

// Gmail: ใช้ตัวส่งเดียวกันทั้งเซิร์ฟเวอร์ (ไม่ต่อใหม่ทุกฉบับ)
let gmailTransport: Transporter | null = null;
async function gmail(): Promise<Transporter> {
  if (gmailTransport) return gmailTransport;
  const nodemailer = await import("nodemailer");
  gmailTransport = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: gmailUser(), pass: gmailPass() },
  });
  return gmailTransport;
}

/** แปลงข้อผิดพลาดเป็นรหัสสั้น ๆ ให้หน้าจอบอกเป็นภาษาคน (ไม่ส่งข้อความดิบจากผู้ให้บริการ) */
function errorCode(e: unknown): string {
  const msg = e instanceof Error ? `${e.message} ${(e as { code?: string }).code ?? ""}` : String(e);
  if (/Invalid login|Username and Password not accepted|EAUTH|535/i.test(msg)) return "auth-failed";
  if (/Daily user sending limit|limit exceeded|550 5\.4\.5/i.test(msg)) return "daily-limit";
  if (/recipient|5\.1\.1|invalid address|EENVELOPE/i.test(msg)) return "bad-recipient";
  return "send-failed";
}

export async function sendEmail(m: EmailMessage): Promise<EmailResult> {
  if (emailDevEcho()) {
    console.log(`[email:dev] to=${m.to} subject=${m.subject}${m.replyTo ? ` replyTo=${m.replyTo}` : ""}\n${m.text}`);
    return { ok: true, devEcho: m };
  }
  const provider = emailProvider();
  if (!provider) return { ok: false, error: "email-not-configured" };
  const replyTo = safeAddr(m.replyTo);

  if (provider === "gmail") {
    try {
      const t = await gmail();
      const info = await t.sendMail({
        from: m.fromName ? { name: safeName(m.fromName), address: gmailUser() } : gmailUser(),
        to: m.to, subject: m.subject, html: m.html, text: m.text, ...(replyTo ? { replyTo } : {}),
      });
      return { ok: true, id: info.messageId };
    } catch (e) {
      console.error("[email:gmail] send error", e instanceof Error ? e.message : e);
      if (errorCode(e) === "auth-failed") gmailTransport = null;   // รหัสเปลี่ยน → ครั้งหน้าต่อใหม่
      return { ok: false, error: errorCode(e) };
    }
  }

  const from = process.env.EMAIL_FROM!.trim();
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: m.fromName ? `${safeName(m.fromName)} <${from}>` : from, to: [m.to], subject: m.subject, html: m.html, text: m.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      console.error("[email] send failed", res.status, j.message);
      return { ok: false, error: "send-failed" };
    }
    return { ok: true, id: j.id };
  } catch (e) {
    console.error("[email] send error", e);
    return { ok: false, error: "send-failed" };
  }
}

/** ตรวจการเชื่อมต่อโดยไม่ส่งอีเมล — Gmail = ลองเข้าสู่ระบบ SMTP · Resend = ตั้งครบถือว่าพร้อม (ไม่มีวิธีตรวจแบบไม่ส่ง) */
export async function verifyEmailTransport(): Promise<{ ok: boolean; provider: EmailProvider | null; error?: string }> {
  const provider = emailProvider();
  if (!provider) return { ok: false, provider: null, error: "email-not-configured" };
  if (provider === "resend") return { ok: true, provider };
  try {
    await (await gmail()).verify();
    return { ok: true, provider };
  } catch (e) {
    console.error("[email:gmail] verify error", e instanceof Error ? e.message : e);
    const error = errorCode(e);
    if (error === "auth-failed") gmailTransport = null;
    return { ok: false, provider, error };
  }
}

/** ข้อความภาษาคนของรหัสข้อผิดพลาด (ใช้ร่วมทุกหน้าที่ส่งอีเมล) */
export function emailErrorText(code: string): string {
  switch (code) {
    case "email-not-configured": return "ยังไม่ได้ตั้งระบบส่งอีเมล (ดูคู่มือที่หน้า ตั้งค่า → ส่งอีเมลรายงาน)";
    case "auth-failed": return "Gmail ไม่ยอมให้เข้าสู่ระบบ — ตรวจ GMAIL_USER / รหัสผ่านสำหรับแอป ใน Vercel (หรือสร้างรหัสใหม่)";
    case "daily-limit": return "Gmail ส่งเกินโควตาวันนี้แล้ว (ราว 500 ฉบับ/วัน) — ลองใหม่พรุ่งนี้";
    case "bad-recipient": return "อีเมลผู้รับไม่ถูกต้องหรือไม่มีอยู่จริง";
    default: return "ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่";
  }
}
