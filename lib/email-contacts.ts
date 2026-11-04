/**
 * 📇 สมุดอีเมลที่บันทึกไว้ (ของกลาง) — อีเมลนอกระบบที่ใช้บ่อย เช่น บัญชี / พาร์ทเนอร์ / เมลส่วนตัวเจ้าของ
 * พิมพ์ครั้งเดียว (+ ชื่อเรียก) → ครั้งต่อไปกดเลือกได้เลย ทุกรายงาน/ทุกหน้าที่ต้องใส่ผู้รับอีเมล
 * เก็บที่ ui_config key "email_contacts" (แถวเดียว · ไม่ต้องสร้างตาราง) · อ่าน/เขียนผ่าน /api/admin/email-contacts เท่านั้น
 * ส่วน pure (normalize/upsert/remove) ใช้ได้ทั้งหน้าเว็บและเซิร์ฟเวอร์ · ทดสอบที่ lib/__tests__/email-contacts.test.ts
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;

export const EMAIL_CONTACTS_KEY = "email_contacts";
export const EMAIL_CONTACTS_MAX = 200;
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export type EmailContact = { email: string; name: string | null; added_by: string | null; added_at: string };

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max) : "");

/** ตรวจ/จัดรายการ: อีเมลถูกรูปแบบ · ตัวเล็ก · ไม่ซ้ำ (ตัวแรกชนะ) · เรียงตามชื่อแล้วอีเมล · ไม่เกิน 200 */
export function normalizeEmailContacts(raw: unknown): EmailContact[] {
  const out: EmailContact[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(raw) ? raw : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const email = clean(o.email, 200).toLowerCase();
    if (!EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: clean(o.name, 80) || null, added_by: clean(o.added_by, 120) || null, added_at: clean(o.added_at, 40) || new Date(0).toISOString() });
  }
  return out.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, "th")).slice(0, EMAIL_CONTACTS_MAX);
}

/** เพิ่ม/แก้ชื่อ (อีเมลเดิม = อัปเดตชื่อ ถ้าใส่ชื่อมา) → { list, error } */
export function upsertEmailContact(list: EmailContact[], input: { email: string; name?: string | null }, by: string | null, now = new Date()): { list: EmailContact[]; error: string | null; added: boolean } {
  const email = clean(input.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return { list, error: "อีเมลไม่ถูกต้อง เช่น name@gmail.com", added: false };
  const name = clean(input.name, 80) || null;
  const i = list.findIndex((c) => c.email === email);
  if (i >= 0) {
    const next = [...list];
    next[i] = { ...next[i], name: name ?? next[i].name };
    return { list: normalizeEmailContacts(next), error: null, added: false };
  }
  if (list.length >= EMAIL_CONTACTS_MAX) return { list, error: `บันทึกได้ไม่เกิน ${EMAIL_CONTACTS_MAX} อีเมล — ลบอันที่ไม่ใช้ก่อน`, added: false };
  return { list: normalizeEmailContacts([...list, { email, name, added_by: by, added_at: now.toISOString() }]), error: null, added: true };
}

export function removeEmailContact(list: EmailContact[], email: string): EmailContact[] {
  const e = clean(email, 200).toLowerCase();
  return list.filter((c) => c.email !== e);
}

/** ป้ายโชว์: "ชื่อ (อีเมล)" หรืออีเมลอย่างเดียว */
export const emailContactLabel = (c: { email: string; name?: string | null }) => (c.name ? `${c.name} (${c.email})` : c.email);

// ---- ฝั่งเซิร์ฟเวอร์ (supabaseAdmin) ----
export async function loadEmailContacts(admin: Admin): Promise<EmailContact[]> {
  const { data, error } = await admin.from("ui_config").select("value").eq("key", EMAIL_CONTACTS_KEY).maybeSingle();
  if (error) throw new Error("โหลดอีเมลที่บันทึกไว้ไม่สำเร็จ");
  return normalizeEmailContacts((data as { value?: unknown } | null)?.value);
}
export async function saveEmailContacts(admin: Admin, list: EmailContact[]): Promise<void> {
  const { error } = await admin.from("ui_config").upsert({ key: EMAIL_CONTACTS_KEY, value: normalizeEmailContacts(list), updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error("บันทึกอีเมลไม่สำเร็จ");
}
