/**
 * ➕➖ เพิ่ม / เอาออกเมนูจากแอป (ของกลาง) — แผนว่าจะแก้ช่องไหนของ erp_menu_items
 * (ไฟล์ pure ห้ามใส่ "use client" — เทสต์ import ได้)
 *
 * เมนู 1 แถว = 1 หน้า (href unique) อยู่ได้หลายแอปผ่าน app_keys[] → เพิ่มเมนูที่มีอยู่แล้ว = เติม app_keys (ไม่สร้างแถวซ้ำ)
 * เอาออกแบบปลอดภัย (ไม่ลบแถวจริง — กู้คืนได้เสมอ):
 *   "app" = เอาออกจากแอปนี้ (ถอด appKey จาก app_keys) — แอปอื่นเห็นเหมือนเดิม
 *   "off" = ปิดทั้งระบบ (is_active = false) — หายจากทุกแอป เปิดกลับได้
 *   (ซ่อนในแอปนี้ = app_overrides[app].place "hidden" → lib/app-menu-layout)
 * ลบถาวร (DELETE /api/menu) ไม่ได้ใช้ที่นี่
 * ใช้ที่: ⚙️ ตั้งค่าแอปเดี่ยว → แท็บ "เมนูและคนเห็น" (components/app-settings-panel/menus-tab.tsx)
 */

export type MembershipMenu = {
  id: string;
  label: string;
  href: string;
  app_keys?: string[] | null;
  is_active?: boolean | null;
  show_in_sidebar?: boolean | null;
};
export type MenuMembershipPatch = { app_keys?: string[]; is_active?: boolean; show_in_sidebar?: boolean };
export type MenuRemoveMode = "app" | "off";

const keysOf = (m: { app_keys?: string[] | null }) => [...new Set((m.app_keys ?? []).filter(Boolean))];

/** แอปอื่นที่เมนูนี้อยู่ด้วย (ไม่นับแอปนี้) */
export function otherAppsOf(m: { app_keys?: string[] | null }, appKey: string): string[] {
  return keysOf(m).filter((k) => k !== appKey);
}

/** ให้เมนูนี้โผล่ในแถบของแอปนี้ — เติม app_keys · เปิดโชว์ในเมนู · เปิดกลับถ้าปิดทั้งระบบอยู่ · คืน {} ถ้าอยู่ครบแล้ว */
export function addToAppPatch(m: MembershipMenu, appKey: string): MenuMembershipPatch {
  const p: MenuMembershipPatch = {};
  const keys = keysOf(m);
  if (!keys.includes(appKey)) p.app_keys = [...keys, appKey];
  if (m.show_in_sidebar === false) p.show_in_sidebar = true;
  if (m.is_active === false) p.is_active = true;
  return p;
}

/** เอาเมนูออกแบบไม่ลบแถว — "app" ถอดจากแอปนี้ · "off" ปิดทั้งระบบ */
export function removeFromAppPatch(m: MembershipMenu, appKey: string, mode: MenuRemoveMode): MenuMembershipPatch {
  if (mode === "off") return m.is_active === false ? {} : { is_active: false };
  const keys = keysOf(m);
  return keys.includes(appKey) ? { app_keys: keys.filter((k) => k !== appKey) } : {};
}

/** เมนูนี้อยู่ในแถบของแอปนี้อยู่แล้วไหม (เปิดอยู่ + โชว์ในเมนู + มี appKey) — กฎเดียวกับแถบแอปเดี่ยว */
export function isInAppBar(m: MembershipMenu, appKey: string): boolean {
  return m.is_active !== false && m.show_in_sidebar !== false && keysOf(m).includes(appKey);
}

const hrefKey = (h: string) => h.trim().replace(/\/+$/, "").toLowerCase() || "/";

/** ตรวจลิงก์ใหม่ก่อนสร้างเมนู — ชื่อ/ลิงก์ต้องมี · ลิงก์ต้องขึ้นต้น / หรือ http(s):// · ลิงก์ซ้ำเมนูเดิม = ใช้เมนูเดิมแทน (ไม่สร้างซ้ำ) */
export function checkNewMenuLink(
  input: { label: string; href: string },
  existing: MembershipMenu[] = [],
  pendingHrefs: string[] = [],
): { ok: true; label: string; href: string } | { ok: false; field: "label" | "href"; error: string; existing?: MembershipMenu } {
  const label = input.label.trim();
  const href = input.href.trim();
  if (!label) return { ok: false, field: "label", error: "ใส่ชื่อเมนูก่อน" };
  if (label.length > 60) return { ok: false, field: "label", error: "ชื่อยาวเกินไป (ไม่เกิน 60 ตัวอักษร)" };
  if (!href) return { ok: false, field: "href", error: "ใส่ลิงก์ก่อน" };
  if (!(/^\/(?!\/)/.test(href) || /^https?:\/\/\S+$/i.test(href))) return { ok: false, field: "href", error: "ลิงก์ต้องขึ้นต้นด้วย / (หน้าในระบบ) หรือ https://" };
  if (/\s/.test(href)) return { ok: false, field: "href", error: "ลิงก์ห้ามมีช่องว่าง" };
  const dup = existing.find((m) => hrefKey(m.href) === hrefKey(href));
  if (dup) return { ok: false, field: "href", error: `มีเมนูของหน้านี้อยู่แล้ว: “${dup.label}”`, existing: dup };
  if (pendingHrefs.some((h) => hrefKey(h) === hrefKey(href))) return { ok: false, field: "href", error: "เพิ่มลิงก์นี้ไว้แล้ว (ยังไม่บันทึก)" };
  return { ok: true, label, href };
}

// ── 🗑 ถังขยะ (หน้ารวมทุกแอป /admin/app-manager) ──
/** อยู่ในถังขยะเพราะอะไร — "off" ปิดทั้งระบบ · "no_app" ไม่อยู่แอปไหนเลย · null = ยังใช้งานอยู่ (ไม่อยู่ในถังขยะ) */
export type MenuTrashReason = "off" | "no_app";
export function trashReason(m: { is_active?: boolean | null; app_keys?: string[] | null }): MenuTrashReason | null {
  if (m.is_active === false) return "off";
  if (!keysOf(m).length) return "no_app";
  return null;
}
/** ลบถาวรได้เฉพาะเมนูในถังขยะ (ปิดแล้ว หรือไม่อยู่แอปไหน) — เมนูที่ยังใช้อยู่ต้องย้ายไปถังขยะก่อน · ใช้ทั้งหน้าเว็บและ DELETE /api/menu */
export function canHardDelete(m: { is_active?: boolean | null; app_keys?: string[] | null }): boolean {
  return trashReason(m) !== null;
}
