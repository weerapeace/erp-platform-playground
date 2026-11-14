// เชื่อมโปรแกรมบนเครื่องกับบัญชี ERP (หน้า /desktop-link + API /api/desktop-link) — ตรรกะล้วน มีเทสต์
// คู่มือ: docs/desktop-link.md

/** โปรแกรมที่ยอมให้เชื่อม — เพิ่มโปรแกรมใหม่ที่นี่ที่เดียว */
export const DESKTOP_APPS: string[] = ["Louis Batch"];

/**
 * ที่อยู่ที่หน้าเว็บส่ง token กลับไปให้โปรแกรม — รับเฉพาะเครื่องตัวเอง (127.0.0.1) ที่ path /erp-linked
 * ห้ามหลวมกว่านี้: ถ้ารับ URL อื่นได้ ใครก็ทำลิงก์หลอกให้ token ไหลไปเว็บตัวเองได้
 */
export function safeReturnUrl(raw: string | null | undefined): string | null {
  const m = /^http:\/\/127\.0\.0\.1:(\d{2,5})\/erp-linked$/.exec(String(raw ?? ""));
  if (!m) return null;
  const port = Number(m[1]);
  return port >= 1024 && port <= 65535 ? `http://127.0.0.1:${port}/erp-linked` : null;
}

/** รหัสกันลิงก์ปลอม ที่โปรแกรมสร้างเองแล้วรอรับกลับ */
export function safeState(raw: string | null | undefined): string | null {
  const s = String(raw ?? "");
  return /^[A-Za-z0-9_-]{16,64}$/.test(s) ? s : null;
}

export function knownApp(raw: string | null | undefined): string | null {
  const a = String(raw ?? "");
  return DESKTOP_APPS.includes(a) ? a : null;
}

/** ส่วนท้าย # ที่ส่งกลับ (fragment ไม่ถูกส่งไปเซิร์ฟเวอร์ใด ๆ ระหว่างทาง) */
export function returnHash(fields: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  return "#" + p.toString();
}
