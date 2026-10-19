/**
 * 👁 ใครเห็นเมนูไหน (ของกลาง) — erp_menu_items.audience
 * (ไฟล์ pure ห้ามใส่ "use client" — API route / เทสต์ import ได้)
 *
 *   audience = { roles?: string[], users?: string[], hide_users?: string[] }
 *     - ไม่ตั้ง / ว่าง          = ทุกคนเห็น (แล้วแต่สิทธิ์ permission_key เดิม)
 *     - roles มีค่า              = เห็นเฉพาะตำแหน่งที่ติ๊ก + คนใน users (ให้เห็นเพิ่มรายคน)
 *     - users อย่างเดียว         = เห็นเฉพาะคนในรายชื่อ
 *     - hide_users               = ซ่อนจากคนเหล่านี้เสมอ (ชนะทุกข้อ)
 *     - admin เห็นทุกเมนูเสมอ (ไว้จัดการ)
 * เป็นการ "ซ่อน/โชว์ในเมนู" เท่านั้น — กันเข้าหน้าจริงใช้สิทธิ์ตำแหน่ง (permission_key / ล็อกแอป) เหมือนเดิม
 * ใช้ที่: แอปเดี่ยว /app/<key> · เมนูซ้าย (PlaygroundShell) · หน้ารวมแอป /apps · ตั้งค่าที่ ⚙️ ในแอปเดี่ยว (components/app-settings-panel)
 */

export type MenuAudience = { roles?: string[]; users?: string[]; hide_users?: string[] };

const list = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map((x) => String(x ?? "").trim()).filter(Boolean))] : []);

/** ล้างค่า → null ถ้าไม่มีข้อจำกัดอะไร (= ทุกคนเห็น) */
export function cleanAudience(raw: unknown): MenuAudience | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const roles = list(r.roles).slice(0, 50);
  const users = list(r.users).slice(0, 500);
  const hide = list(r.hide_users).filter((u) => !users.includes(u)).slice(0, 500);
  if (!roles.length && !users.length && !hide.length) return null;
  return { ...(roles.length ? { roles } : {}), ...(users.length ? { users } : {}), ...(hide.length ? { hide_users: hide } : {}) };
}

/** เมนูนี้โชว์ให้คนนี้ไหม — ยังไม่รู้ว่าใคร (กำลังโหลด) = โชว์ไว้ก่อน ให้ตัวกันอื่นทำงานตามปกติ */
export function menuVisibleTo(raw: unknown, user: { id?: string | null; role?: string | null } | null | undefined): boolean {
  const a = cleanAudience(raw);
  if (!a || !user) return true;
  if (user.role === "admin") return true;
  const id = String(user.id ?? "");
  if (id && a.hide_users?.includes(id)) return false;
  if (!a.roles?.length && !a.users?.length) return true;   // มีแค่รายชื่อซ่อน
  return (!!user.role && !!a.roles?.includes(user.role)) || (!!id && !!a.users?.includes(id));
}

/** สรุปเป็นภาษาคน เช่น "เฉพาะ staff, manager + 2 คน · ซ่อนจาก 1 คน" */
export function describeAudience(raw: unknown, roleLabel: (key: string) => string = (k) => k): string {
  const a = cleanAudience(raw);
  if (!a) return "ทุกคน";
  const parts: string[] = [];
  if (a.roles?.length || a.users?.length) {
    const who = [a.roles?.map(roleLabel).join(", "), a.users?.length ? `${a.users.length} คน` : ""].filter(Boolean).join(" + ");
    parts.push(`เฉพาะ ${who}`);
  } else parts.push("ทุกคน");
  if (a.hide_users?.length) parts.push(`ซ่อนจาก ${a.hide_users.length} คน`);
  return parts.join(" · ");
}
