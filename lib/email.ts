/**
 * ✉️ ส่งอีเมล (ของกลาง ERP · ฝั่งเซิร์ฟเวอร์เท่านั้น) — ผ่าน Resend REST API (ไม่มีไลบรารีเพิ่ม)
 *
 * env (ตั้งใน Vercel โปรเจกต์ ERP — ความลับ):
 *   RESEND_API_KEY  กุญแจ API ของ Resend
 *   EMAIL_FROM      อีเมลผู้ส่งบนโดเมนที่ยืนยันกับ Resend แล้ว เช่น no-reply@pixiedustie.com
 * ไม่ตั้ง = ส่งไม่ได้ (คืน { ok:false, error:"email-not-configured" }) — ฟีเจอร์ที่พึ่งอีเมลต้องบอกผู้ใช้เอง
 * เครื่อง dev: EMAIL_DEV_ECHO=1 (+ NODE_ENV=development) = ไม่ส่งจริง พิมพ์ลง console + คืนเนื้อหาให้ผู้เรียก (ทดสอบลิงก์ได้)
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** ชื่อผู้ส่งที่ลูกค้าเห็น เช่น ชื่อร้าน */
  fromName?: string;
}

export type EmailResult = { ok: true; id?: string; devEcho?: EmailMessage } | { ok: false; error: string };

export const emailDevEcho = () => process.env.NODE_ENV === "development" && process.env.EMAIL_DEV_ECHO === "1";
export const emailConfigured = () => !!process.env.RESEND_API_KEY?.trim() && !!process.env.EMAIL_FROM?.trim();

const safeName = (s: string) => s.replace(/["<>\r\n]/g, "").slice(0, 60);

export async function sendEmail(m: EmailMessage): Promise<EmailResult> {
  if (emailDevEcho()) {
    console.log(`[email:dev] to=${m.to} subject=${m.subject}\n${m.text}`);
    return { ok: true, devEcho: m };
  }
  if (!emailConfigured()) return { ok: false, error: "email-not-configured" };
  const from = process.env.EMAIL_FROM!.trim();
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: m.fromName ? `${safeName(m.fromName)} <${from}>` : from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
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
