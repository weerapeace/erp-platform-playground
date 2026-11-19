/**
 * 🔒 ล็อกพนักงานให้อยู่ในแอป (แอปพนักงาน รอบ 2) — กฎกลาง (ไฟล์ pure ห้ามใส่ "use client")
 * เอกสาร: docs/staff-apps.md §ล็อก
 *
 * ใครถูกล็อก: แอดมินติ๊กในแอปพนักงาน (draft.lock = { roles?, users? }) แล้วกดเผยแพร่ · แอดมินไม่ถูกล็อกเลย
 * ล็อกแล้วเป็นยังไง (กันจริง 2 ชั้น):
 *   1) ข้อมูล (ฝั่งฐานข้อมูล) — erp_can / erp_can_user / erp_my_permissions ใน DB:
 *        สิทธิ์ที่ใช้ได้ = สิทธิ์ของคนนั้นเอง ∩ allowed_perms ของทุกแอปที่ล็อกเขาไว้ (รวมกัน)
 *        → API / RLS ที่เช็กสิทธิ์ ปฏิเสธเอง แม้พิมพ์ URL หรือยิง API ตรง
 *   2) หน้าเว็บ (ฝั่งเบราว์เซอร์) — components/app-lock-gate: เปิดหน้าที่ไม่อยู่ในแอป → หน้า "หน้านี้ไม่อยู่ในแอป X"
 * allowed_perms (คำนวณตอนเผยแพร่ด้วย computeAllowedPerms):
 *   เมนูในแอป → permission_key ของเมนู + สิทธิ์ย่อยตามกฎ lib/menu-permissions + สิทธิ์เข้าแอปหลักที่เมนูอยู่ (app.*)
 *   ข้อยกเว้นอ่านอย่างเดียว (draft.exceptions) → เฉพาะสิทธิ์ "ดู" ของเมนูนั้น
 *   + สิทธิ์ที่แอดมินเพิ่มเอง (draft.extra_perms) + สิทธิ์พื้นฐาน (BASE_PERMS)
 * ข้อจำกัด: API ที่เช็กแค่ "ล็อกอินแล้ว" (ไม่เช็กสิทธิ์) ไม่ถูกกันชั้น 1 — ชั้น 2 ยังกันที่หน้าเว็บ
 */
import { menuPermissions, type MenuPermRule } from "@/lib/menu-permissions";

export type AppLock = { roles?: string[]; users?: string[] };
export type AllowedHref = { href: string; ro?: boolean };

/** สิทธิ์ที่คนถูกล็อกใช้ได้เสมอ (ของพื้นฐานทั้งระบบ) */
export const BASE_PERMS = ["notifications.view", "staff_apps.announce"] as const;

/** หน้าเปิดได้เสมอ (ล็อกอิน/ออก) */
export const ALWAYS_OPEN_PATHS = ["/login", "/logout", "/auth", "/reset-password", "/offline"] as const;

const list = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, max) : []);

export function cleanLock(raw: unknown): AppLock | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const roles = list(r.roles, 50).filter((x) => x !== "admin");
  const users = list(r.users, 500);
  if (!roles.length && !users.length) return null;
  return { ...(roles.length ? { roles } : {}), ...(users.length ? { users } : {}) };
}

/** คนนี้ถูกแอปนี้ล็อกไหม (แอดมินไม่เคยถูกล็อก) */
export function lockIncludes(lock: unknown, user: { id?: string | null; role?: string | null } | null | undefined): boolean {
  const l = cleanLock(lock);
  if (!l || !user || user.role === "admin") return false;
  return (!!user.role && !!l.roles?.includes(user.role)) || (!!user.id && !!l.users?.includes(String(user.id)));
}

/** สิทธิ์ "ดูอย่างเดียว" — มีคำว่า view เป็นท่อนหนึ่ง (products.view · products.cost.view · notifications.view_team) */
export function isViewPerm(key: string): boolean {
  return key.split(".").some((s) => s === "view" || s.startsWith("view_"));
}

type MenuLike = { id: string; href: string; permission_key?: string | null; app_keys?: string[] | null };
type CatalogPerm = { key: string; category?: string | null; sort_order?: number | null };
type AppGroupLike = { key: string; permission_key?: string | null; kind?: string | null };

/** สิทธิ์ที่แอปนี้เปิดให้คนถูกล็อก — menuIds = เมนูในแอป · readOnlyIds = ข้อยกเว้นดูอย่างเดียว */
export function computeAllowedPerms(
  input: { menuIds: string[]; readOnlyIds?: string[]; extraPerms?: string[] },
  menus: MenuLike[],
  catalog: CatalogPerm[],
  appGroups: AppGroupLike[],
  rules?: MenuPermRule[],
): string[] {
  const byId = new Map(menus.map((m) => [m.id, m]));
  const known = new Set(catalog.map((c) => c.key));
  const appPerm = new Map(appGroups.filter((a) => (a.kind ?? "module") !== "staff" && a.permission_key).map((a) => [a.key, a.permission_key!]));
  const out = new Set<string>(BASE_PERMS);
  const add = (m: MenuLike, viewOnly: boolean) => {
    const keys = menuPermissions(m, catalog, rules).keys;
    if (m.permission_key) keys.push(m.permission_key);
    for (const k of keys) if (!viewOnly || isViewPerm(k) || k.startsWith("app.")) out.add(k);
    // สิทธิ์เข้าแอปหลักที่หน้านี้สังกัด — กันเชลล์ของหน้า (ในกรอบ) ขึ้น "ไม่มีสิทธิ์เข้าแอป"
    for (const ak of m.app_keys ?? []) { const p = appPerm.get(ak); if (p) out.add(p); }
  };
  for (const id of input.menuIds) { const m = byId.get(id); if (m) add(m, false); }
  for (const id of input.readOnlyIds ?? []) { const m = byId.get(id); if (m && !input.menuIds.includes(id)) add(m, true); }
  for (const k of input.extraPerms ?? []) if (known.has(k)) out.add(k);
  return [...out].sort();
}

/** หน้าที่เปิดได้ในแอปนี้ (href ของเมนู · ro = ข้อยกเว้นดูอย่างเดียว) */
export function computeAllowedHrefs(input: { menuIds: string[]; readOnlyIds?: string[] }, menus: MenuLike[]): AllowedHref[] {
  const byId = new Map(menus.map((m) => [m.id, m]));
  const out: AllowedHref[] = [];
  const seen = new Set<string>();
  const push = (id: string, ro: boolean) => {
    const m = byId.get(id);
    if (!m?.href || !m.href.startsWith("/")) return;
    const h = baseHref(m.href);
    if (seen.has(h)) return;
    seen.add(h);
    out.push(ro ? { href: h, ro: true } : { href: h });
  };
  for (const id of input.menuIds) push(id, false);
  for (const id of input.readOnlyIds ?? []) if (!input.menuIds.includes(id)) push(id, true);
  return out;
}

export const baseHref = (h: string) => (h.split(/[?#]/)[0].replace(/\/+$/, "") || "/");
const under = (path: string, base: string) => base !== "/" && (path === base || path.startsWith(`${base}/`));

export type MyLock = { locked: boolean; apps: { key: string; label: string; label_en?: string | null }[]; hrefs: AllowedHref[] };

/**
 * หน้านี้เปิดได้ไหม สำหรับคนถูกล็อก — ไม่ถูกล็อก = เปิดได้ทุกหน้า (ตามสิทธิ์เดิม)
 *   เปิดได้: หน้าแอปที่ล็อกเขาไว้ (/app/<key>) · หน้าเมนูในแอป (และหน้าลึกใต้เมนูนั้น) · ข้อยกเว้นดูอย่างเดียว · หน้าล็อกอิน
 */
export function pathAllowed(pathname: string, lock: MyLock | null | undefined): boolean {
  if (!lock?.locked) return true;
  const p = baseHref(pathname || "/");
  if (ALWAYS_OPEN_PATHS.some((a) => under(p, a))) return true;
  if (p.startsWith("/api/") || p.startsWith("/_next/")) return true;
  if (lock.apps.some((a) => under(p, `/app/${a.key}`))) return true;
  return lock.hrefs.some((h) => under(p, h.href));
}

/** หน้านี้เปิดได้แบบดูอย่างเดียวไหม (ตรงกับข้อยกเว้น ro และไม่ตรงเมนูปกติ) */
export function pathReadOnly(pathname: string, lock: MyLock | null | undefined): boolean {
  if (!lock?.locked) return false;
  const p = baseHref(pathname || "/");
  const hits = lock.hrefs.filter((h) => under(p, h.href));
  return hits.length > 0 && hits.every((h) => h.ro);
}
