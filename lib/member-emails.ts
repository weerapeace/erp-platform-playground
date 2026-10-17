/**
 * ✉️ แม่แบบอีเมลของระบบสมาชิกเว็บร้าน (ยืนยันอีเมล · ตั้งรหัสผ่านใหม่) — 2 ภาษา ทั้ง HTML และข้อความล้วน
 * ภาษา = ภาษาของหน้าที่ลูกค้ากดสมัคร/ขอรหัส (เว็บร้านส่ง lang มา · ไม่มี = ไทย)
 * ส่งด้วยของกลาง lib/email.ts · หน้าตาจาก lib/email-layout.ts · ลิงก์ชี้กลับโดเมนของร้านที่ลูกค้าใช้ (ตรวจกับ shop_domains แล้ว)
 */
import type { EmailMessage } from "@/lib/email";
import { emailLayout } from "@/lib/email-layout";

type Lang = "th" | "en";

function build(to: string, shopName: string, link: string, lang: Lang, c: { subject: string; title: string; lines: string[]; button: string; foot: string }): EmailMessage {
  return {
    to,
    fromName: shopName,
    subject: `${c.subject} — ${shopName}`,
    html: emailLayout({ lang, shopName, title: c.title, lines: c.lines, button: { text: c.button, href: link }, foot: c.foot }),
    text: `${c.title}\n\n${c.lines.join("\n")}\n\n${link}\n\n${c.foot}`,
  };
}

export function verifyEmailMessage(to: string, shopName: string, link: string, lang: Lang = "th"): EmailMessage {
  return build(
    to,
    shopName,
    link,
    lang,
    lang === "en"
      ? {
          subject: "Confirm your email",
          title: "Confirm your email",
          lines: [`Thank you for joining ${shopName}.`, "Tap the button below to confirm your email and start using your account (link valid for 24 hours)."],
          button: "Confirm email",
          foot: "If you didn't sign up, you can ignore this email — the account stays inactive until confirmed.",
        }
      : {
          subject: "ยืนยันอีเมล",
          title: "ยืนยันอีเมลของคุณ",
          lines: [`ขอบคุณที่สมัครสมาชิก ${shopName}`, "กดปุ่มด้านล่างเพื่อยืนยันอีเมลและเริ่มใช้บัญชี (ลิงก์ใช้ได้ 24 ชั่วโมง)"],
          button: "ยืนยันอีเมล",
          foot: "ถ้าคุณไม่ได้สมัคร ไม่ต้องทำอะไร — บัญชีจะยังใช้ไม่ได้จนกว่าจะยืนยัน",
        }
  );
}

export function resetPasswordMessage(to: string, shopName: string, link: string, lang: Lang = "th"): EmailMessage {
  return build(
    to,
    shopName,
    link,
    lang,
    lang === "en"
      ? {
          subject: "Reset your password",
          title: "Reset your password",
          lines: ["We received a request to reset the password for this account.", "Tap the button below to set a new password (link valid for 30 minutes, one use only)."],
          button: "Set new password",
          foot: "If you didn't request this, you can ignore this email — your current password still works.",
        }
      : {
          subject: "ตั้งรหัสผ่านใหม่",
          title: "ตั้งรหัสผ่านใหม่",
          lines: ["มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้", "กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ (ลิงก์ใช้ได้ 30 นาที ครั้งเดียว)"],
          button: "ตั้งรหัสผ่านใหม่",
          foot: "ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร — รหัสผ่านเดิมยังใช้ได้ตามปกติ",
        }
  );
}
