/**
 * ✉️ แม่แบบอีเมลของระบบสมาชิกเว็บร้าน (ยืนยันอีเมล · ตั้งรหัสผ่านใหม่) — ภาษาไทย ทั้ง HTML และข้อความล้วน
 * ส่งด้วยของกลาง lib/email.ts · ลิงก์ชี้กลับโดเมนของร้านที่ลูกค้าใช้ (ตรวจกับ shop_domains แล้ว)
 */
import type { EmailMessage } from "@/lib/email";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(shopName: string, title: string, lines: string[], button: { text: string; href: string }, foot: string): string {
  return `<!doctype html><html lang="th"><body style="margin:0;background:#f5f5f4;font-family:Tahoma,'Noto Sans Thai',Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:14px;color:#6b7280;letter-spacing:.08em">${esc(shopName)}</td></tr>
<tr><td style="padding-top:8px;font-size:22px;font-weight:700">${esc(title)}</td></tr>
${lines.map((l) => `<tr><td style="padding-top:14px;font-size:15px;line-height:1.6">${esc(l)}</td></tr>`).join("")}
<tr><td style="padding-top:24px"><a href="${esc(button.href)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600">${esc(button.text)}</a></td></tr>
<tr><td style="padding-top:18px;font-size:12px;color:#6b7280;word-break:break-all">หรือคัดลอกลิงก์นี้ไปเปิด: ${esc(button.href)}</td></tr>
<tr><td style="padding-top:24px;font-size:12px;color:#9ca3af">${esc(foot)}</td></tr>
</table></td></tr></table></body></html>`;
}

export function verifyEmailMessage(to: string, shopName: string, link: string): EmailMessage {
  const title = "ยืนยันอีเมลของคุณ";
  const lines = [`ขอบคุณที่สมัครสมาชิก ${shopName}`, "กดปุ่มด้านล่างเพื่อยืนยันอีเมลและเริ่มใช้บัญชี (ลิงก์ใช้ได้ 24 ชั่วโมง)"];
  const foot = "ถ้าคุณไม่ได้สมัคร ไม่ต้องทำอะไร — บัญชีจะยังใช้ไม่ได้จนกว่าจะยืนยัน";
  return {
    to,
    fromName: shopName,
    subject: `ยืนยันอีเมล — ${shopName}`,
    html: layout(shopName, title, lines, { text: "ยืนยันอีเมล", href: link }, foot),
    text: `${title}\n\n${lines.join("\n")}\n\n${link}\n\n${foot}`,
  };
}

export function resetPasswordMessage(to: string, shopName: string, link: string): EmailMessage {
  const title = "ตั้งรหัสผ่านใหม่";
  const lines = ["มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้", "กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ (ลิงก์ใช้ได้ 30 นาที ครั้งเดียว)"];
  const foot = "ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร — รหัสผ่านเดิมยังใช้ได้ตามปกติ";
  return {
    to,
    fromName: shopName,
    subject: `ตั้งรหัสผ่านใหม่ — ${shopName}`,
    html: layout(shopName, title, lines, { text: "ตั้งรหัสผ่านใหม่", href: link }, foot),
    text: `${title}\n\n${lines.join("\n")}\n\n${link}\n\n${foot}`,
  };
}
