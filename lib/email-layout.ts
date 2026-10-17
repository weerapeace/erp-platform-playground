/**
 * ✉️ หน้าตาอีเมลถึงลูกค้า (ของกลาง · pure) — กล่องขาวกลางจอ ชื่อร้าน · หัวเรื่อง · ย่อหน้า · ตารางรายการ · ปุ่ม · ท้ายอีเมล
 * ใช้ร่วม: อีเมลสมาชิก (lib/member-emails) · อีเมลแจ้งออเดอร์ (lib/customer-messages)
 * ภาษา = ภาษาของลูกค้า (th/en) — มีผลกับ <html lang> และข้อความ "หรือคัดลอกลิงก์นี้"
 */
export const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface EmailLayoutInput {
  lang: "th" | "en";
  shopName: string;
  title: string;
  /** ย่อหน้า (ข้อความล้วน — ขึ้นบรรทัดใหม่ได้) */
  lines: string[];
  /** ตารางสองคอลัมน์ (รายการสินค้า / ยอดเงิน) · แถวตัวหนา = ยอดรวม */
  table?: { left: string; right: string; bold?: boolean }[];
  button?: { text: string; href: string };
  foot?: string;
}

export function emailLayout(m: EmailLayoutInput): string {
  const p = (s: string, style = "padding-top:14px;font-size:15px;line-height:1.6") =>
    `<tr><td style="${style}">${escHtml(s).replace(/\n/g, "<br>")}</td></tr>`;
  const table = m.table?.length
    ? `<tr><td style="padding-top:18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb">${m.table
        .map(
          (r) =>
            `<tr><td style="padding:8px 0;font-size:14px;border-bottom:1px solid #f3f4f6;${r.bold ? "font-weight:700" : "color:#374151"}">${escHtml(r.left)}</td><td align="right" style="padding:8px 0 8px 12px;font-size:14px;white-space:nowrap;border-bottom:1px solid #f3f4f6;${r.bold ? "font-weight:700" : "color:#374151"}">${escHtml(r.right)}</td></tr>`
        )
        .join("")}</table></td></tr>`
    : "";
  const button = m.button
    ? `<tr><td style="padding-top:24px"><a href="${escHtml(m.button.href)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600">${escHtml(m.button.text)}</a></td></tr>
<tr><td style="padding-top:18px;font-size:12px;color:#6b7280;word-break:break-all">${m.lang === "en" ? "Or copy this link:" : "หรือคัดลอกลิงก์นี้ไปเปิด:"} ${escHtml(m.button.href)}</td></tr>`
    : "";
  return `<!doctype html><html lang="${m.lang}"><body style="margin:0;background:#f5f5f4;font-family:Tahoma,'Noto Sans Thai',Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:14px;color:#6b7280;letter-spacing:.08em">${escHtml(m.shopName)}</td></tr>
<tr><td style="padding-top:8px;font-size:22px;font-weight:700">${escHtml(m.title)}</td></tr>
${m.lines.map((l) => p(l)).join("")}
${table}
${button}
${m.foot ? p(m.foot, "padding-top:24px;font-size:12px;color:#9ca3af;line-height:1.5") : ""}
</table></td></tr></table></body></html>`;
}
