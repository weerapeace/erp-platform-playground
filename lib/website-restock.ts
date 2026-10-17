/**
 * 🔔 "แจ้งฉันเมื่อมีของ" — ตรวจ/เกลาค่าที่ลูกค้าฝากไว้ (pure · ไม่มี import)
 *   ⚠️ มิเรอร์ทั้งไฟล์ไป storefront src/lib/restock.ts (ใช้ตรวจในฟอร์มก่อนส่ง) — แก้ที่นี่แล้วคัดลอก
 * ช่องทาง: email (อีเมล) · phone (เบอร์มือถือ 9–10 หลัก) · line (LINE ID)
 * ร้านดูรายชื่อแล้วติดต่อเอง (ไม่ส่งอัตโนมัติ) — ตาราง store_restock_requests
 */
export type RestockContactType = "email" | "phone" | "line";
export type RestockStatus = "pending" | "notified" | "cancelled";

export const RESTOCK_CONTACTS: { value: RestockContactType; label: string; placeholder: string; icon: string }[] = [
  { value: "email", label: "อีเมล", placeholder: "you@email.com", icon: "✉️" },
  { value: "phone", label: "เบอร์โทร", placeholder: "08x-xxx-xxxx", icon: "📞" },
  { value: "line", label: "LINE ID", placeholder: "LINE ID ของคุณ", icon: "💬" },
];
export const RESTOCK_STATUS_LABEL: Record<RestockStatus, string> = { pending: "รอแจ้ง", notified: "แจ้งแล้ว", cancelled: "ยกเลิก" };

export interface RestockInput {
  contactType: RestockContactType;
  contact: string;
  name: string | null;
  option: string | null;
}

/** ตรวจค่าที่ลูกค้ากรอก → ค่าที่เก็บได้ หรือข้อความเตือนภาษาคน */
export function normalizeRestockInput(raw: { contactType?: unknown; contact?: unknown; name?: unknown; option?: unknown }): { ok: true; input: RestockInput } | { ok: false; error: string } {
  const type = raw.contactType === "email" || raw.contactType === "phone" || raw.contactType === "line" ? raw.contactType : null;
  if (!type) return { ok: false, error: "เลือกช่องทางติดต่อ" };
  const c = typeof raw.contact === "string" ? raw.contact.trim() : "";
  let contact = "";
  if (type === "email") {
    contact = c.toLowerCase().slice(0, 160);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact)) return { ok: false, error: "รูปแบบอีเมลไม่ถูกต้อง" };
  } else if (type === "phone") {
    let d = c.replace(/[^\d+]/g, "");
    if (d.startsWith("+66")) d = "0" + d.slice(3);
    d = d.replace(/\D/g, "");
    if (!/^0\d{8,9}$/.test(d)) return { ok: false, error: "กรอกเบอร์โทรให้ถูกต้อง (9–10 หลัก ขึ้นต้นด้วย 0)" };
    contact = d;
  } else {
    contact = c.replace(/^@/, "").slice(0, 40);
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(contact)) return { ok: false, error: "LINE ID ใช้ได้เฉพาะตัวอังกฤษ ตัวเลข . _ - (3–40 ตัว)" };
  }
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 80) : null;
  const option = typeof raw.option === "string" && raw.option.trim() ? raw.option.trim().slice(0, 120) : null;
  return { ok: true, input: { contactType: type, contact, name, option } };
}

/** โชว์ช่องทางให้อ่านง่าย (เบอร์ใส่ขีด) */
export function formatRestockContact(type: RestockContactType, contact: string): string {
  if (type === "phone" && /^0\d{9}$/.test(contact)) return `${contact.slice(0, 3)}-${contact.slice(3, 6)}-${contact.slice(6)}`;
  if (type === "phone" && /^0\d{8}$/.test(contact)) return `${contact.slice(0, 2)}-${contact.slice(2, 5)}-${contact.slice(5)}`;
  return contact;
}
