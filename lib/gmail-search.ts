/**
 * ของกลาง: สร้างลิงก์ "ค้นหาเมลใบเสร็จ" ใน Gmail ของบัญชีที่ผูกกับ subscription
 *
 * ใช้ที่: พาเนล "บิลที่ยังขาด" (ค้นเจาะจงเดือน) และป๊อปอัปดาวน์โหลดใบเสร็จ (ค้นย้อน 60 วัน)
 * แนวคิด: เว็บสั่ง Chrome ให้ล็อกอินเมลไหนไม่ได้ → เราทำได้แค่เปิด Gmail ของบัญชีนั้น
 *         พร้อม "คำค้น" ที่กรอกไว้ให้แล้ว (ผู้ใช้แก้คำค้นต่อในหน้า Gmail ได้)
 */
import type { Subscription } from "@/lib/subscriptions";

export type MailSearchInfo = Pick<Subscription, "name" | "account_email" | "invoice_url">;

// โดเมนระดับสอง (co.th / co.uk / com.au …) → ต้องตัดเอา 3 ชั้นท้าย
const TWO_LEVEL_SLD = /^(co|com|net|org|gov|edu|ac|or|in|go)\.[a-z]{2,3}$/i;

/** โดเมนร้านจากลิงก์หน้าบิล เช่น https://account.adobe.com/... → adobe.com */
export function vendorDomain(invoiceUrl: string | null | undefined): string | null {
  if (!invoiceUrl) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(invoiceUrl) ? invoiceUrl : `https://${invoiceUrl}`);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const parts = host.split(".").filter(Boolean);
    if (parts.length < 2) return null;
    const lastTwo = parts.slice(-2).join(".");
    return TWO_LEVEL_SLD.test(lastTwo) && parts.length >= 3 ? parts.slice(-3).join(".") : lastTwo;
  } catch { return null; }
}

/** ดึงอีเมลจริงออกจากช่องที่ผู้ใช้อาจพิมพ์ปนคำอื่น เช่น "facebook: a@b.com" → a@b.com */
export function extractEmail(raw: string | null | undefined): string | null {
  const m = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(raw ?? "");
  return m ? m[0] : null;
}

/** ค้นเมลของรายการนี้ได้ไหม (ต้องรู้ว่าใช้เมลอะไร) */
export function canSearchMail(sub: MailSearchInfo): boolean {
  return !!extractEmail(sub.account_email);
}

const pad = (n: number) => String(n).padStart(2, "0");
const gdate = (d: Date) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;

/** ช่วงวันที่ค้นของเดือนบิล — เผื่อหน้า 5 วัน หลัง 12 วัน (บิลมักมาหลังวันตัดรอบ) */
function monthWindow(month: string): { after: string; before: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? "");
  if (!m) return null;
  const y = Number(m[1]), mi = Number(m[2]) - 1;
  return { after: gdate(new Date(y, mi, 1 - 5)), before: gdate(new Date(y, mi + 1, 1 + 12)) };
}

/** คำสำคัญจากชื่อรายการ (คำแรกที่เป็นตัวอักษร) เช่น "Adobe Full Subscription" → Adobe */
function keywordFromName(name: string): string | null {
  const w = (name ?? "").trim().split(/[\s/|,(-]+/).find((x) => /[A-Za-z฀-๿]{2,}/.test(x));
  return w ? w.replace(/["{}]/g, "") : null;
}

/** คำที่มักอยู่ในเมลใบเสร็จ (ทั้งอังกฤษ/ไทย) — ใช้กรองไม่ให้เจอเมลทั่วไปของร้านนั้นทั้งกล่อง */
const PURPOSE_TERMS = [
  "invoice", "receipt", "billing", "bill", "payment", "statement", "order", "subscription", "renewal",
  "ใบเสร็จ", "ใบแจ้งหนี้", "ใบกำกับภาษี", "ชำระเงิน",
];

const dedupe = (arr: string[]) => {
  const seen = new Set<string>();
  return arr.filter((x) => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
};

/**
 * คำค้น Gmail = (ใครส่ง/เกี่ยวกับร้านไหน) AND (เป็นเมลบิล) AND (ช่วงเดือน)
 * `{...}` คือ "หรือ" ของ Gmail — ใส่ทั้งโดเมนร้าน, ชื่อร้านจากโดเมน และชื่อรายการ
 * เพราะหลายร้านส่งบิลผ่านคนกลาง (เช่น Stripe) โดเมนผู้ส่งเลยไม่ตรงกับเว็บร้าน
 */
export function gmailSearchQuery(sub: MailSearchInfo, month?: string): string {
  const who: string[] = [];
  const domain = vendorDomain(sub.invoice_url);
  if (domain) {
    who.push(`from:${domain}`);
    const word = domain.split(".")[0];          // adobe.com → adobe, claude.ai → claude
    if (word.length >= 3) who.push(word);
  }
  const kw = keywordFromName(sub.name);
  if (kw) who.push(kw);
  const full = (sub.name ?? "").trim();
  if (full && kw && full.toLowerCase() !== kw.toLowerCase()) who.push(`"${full}"`);

  const uniq = dedupe(who);
  const scope = uniq.length > 1 ? `{${uniq.join(" ")}}` : (uniq[0] ?? "");
  const purpose = scope ? `{${PURPOSE_TERMS.join(" ")}}` : ""; // ไม่รู้ว่าร้านไหน → อย่ากรองซ้ำ เดี๋ยวว่างเปล่า
  const win = month ? monthWindow(month) : null;
  const range = win ? [`after:${win.after}`, `before:${win.before}`] : ["newer_than:60d"];
  return [scope, purpose, ...range].filter(Boolean).join(" ");
}

/** ลิงก์เปิด Gmail ของบัญชีนั้น พร้อมคำค้น — null ถ้าไม่รู้อีเมล */
export function gmailSearchUrl(sub: MailSearchInfo, month?: string): string | null {
  const email = extractEmail(sub.account_email);
  if (!email) return null;
  const q = gmailSearchQuery(sub, month);
  return `https://mail.google.com/mail/u/${encodeURIComponent(email)}/#search/${encodeURIComponent(q)}`;
}
