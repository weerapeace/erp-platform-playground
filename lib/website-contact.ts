/**
 * ✉️ ฟอร์มติดต่อของเว็บร้าน (ของกลาง · pure ใช้ได้ทั้งเซิร์ฟเวอร์และหน้าจอ)
 *
 * ลูกค้ากรอกที่ Section "ฟอร์มติดต่อ" (contact-form) → POST /api/public/storefront/contact → ตาราง store_contact_messages
 * ร้านดู/ติ๊กตอบแล้ว/ลบที่ ERP แท็บ 🏪 ข้อมูลร้าน › 📨 ข้อความลูกค้า (/api/website/contact-messages)
 * ตรวจค่า "บอกว่าขาดอะไร ไม่เดาค่าให้" · ข้อความ error 2 ภาษา (ตามหน้าที่ลูกค้าใช้)
 */

export type ContactStatus = "new" | "done" | "spam";
export const CONTACT_STATUSES: { key: ContactStatus; label: string; tone: string }[] = [
  { key: "new", label: "ใหม่", tone: "bg-blue-50 text-blue-700" },
  { key: "done", label: "ตอบแล้ว", tone: "bg-emerald-50 text-emerald-700" },
  { key: "spam", label: "สแปม", tone: "bg-slate-100 text-slate-500" },
];
export const contactStatusLabel = (s: string) => CONTACT_STATUSES.find((x) => x.key === s)?.label ?? s;

export interface ContactInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  topic: string;
  message: string;
  lang: "th" | "en";
  page: string;
}

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** ตรวจข้อความจากฟอร์ม — ok:false = บอกว่าขาด/ผิดอะไร (ภาษาเดียวกับหน้าที่ลูกค้าใช้) */
export function normalizeContactInput(raw: unknown, opts: { phoneRequired?: boolean } = {}): { ok: true; input: ContactInput } | { ok: false; error: string } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const lang = o.lang === "en" ? "en" : "th";
  const t = (th: string, en: string) => (lang === "en" ? en : th);
  const input: ContactInput = {
    firstName: clean(o.firstName, 80),
    lastName: clean(o.lastName, 80),
    email: clean(o.email, 160).toLowerCase(),
    phone: clean(o.phone, 30),
    topic: clean(o.topic, 80),
    message: String(o.message ?? "").replace(/\r\n/g, "\n").trim().slice(0, 3000),
    lang,
    page: clean(o.page, 200),
  };
  if (!input.firstName) return { ok: false, error: t("กรอกชื่อ", "Enter your first name") };
  if (!input.email) return { ok: false, error: t("กรอกอีเมล", "Enter your email") };
  if (!EMAIL.test(input.email)) return { ok: false, error: t("อีเมลไม่ถูกต้อง", "Enter a valid email") };
  const digits = input.phone.replace(/\D/g, "");
  if (opts.phoneRequired && !digits) return { ok: false, error: t("กรอกเบอร์โทร", "Enter your phone number") };
  if (input.phone && (digits.length < 9 || digits.length > 15)) return { ok: false, error: t("เบอร์โทรไม่ถูกต้อง", "Enter a valid phone number") };
  if (input.message.length < 5) return { ok: false, error: t("พิมพ์ข้อความที่ต้องการติดต่อ", "Type your message") };
  return { ok: true, input };
}
