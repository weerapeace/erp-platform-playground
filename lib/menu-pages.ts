// ============================================================
// menu-pages — "หน้าใน ERP" จากเมนูจริง (erp_menu_items + erp_app_groups) — ตรรกะล้วน (ไม่มี React)
//
// ใช้กับตัวเลือกหน้ากลาง components/menu-page-picker (เลือกหน้าจากเมนู ไม่ต้องพิมพ์ลิงก์)
//   + กล่อง "หน้าใน ERP" ในกระดาน flowchart (lib/flowchart · components/flowchart-board)
// หน้าที่อยู่หลายแอป = โผล่ในทุกแอปที่อยู่ (เลือกจากแอปไหน = ป้ายแอปนั้น) · ชื่อเมนูเฉพาะแอป (app_overrides.label) ใช้ตามแอป
// หน้าที่ไม่อยู่แอปไหน = กลุ่ม "ไม่อยู่ในแอปไหน" ท้ายสุด · เมนูที่ปิดทั้งระบบ (is_active=false) = ไม่เอา
// เทสต์: lib/__tests__/menu-pages.test.ts
// ============================================================

import { appOverride, effectiveSort } from "./app-menu-layout";

/** แถวเมนูจาก GET /api/menu (เอาเฉพาะช่องที่ใช้) */
export type MenuPageRow = {
  href: string;
  label: string;
  icon?: string | null;
  app_keys?: string[] | null;
  is_active?: boolean | null;
  sort_order?: number | null;
  app_overrides?: unknown;
};

/** แอปจาก GET /api/menu/apps */
export type MenuAppRow = { key: string; label: string; icon?: string | null; sort_order?: number | null };

/** หน้า 1 หน้า (ในแอป 1 แอป) */
export type MenuPage = { href: string; label: string; icon: string | null; app: string; appName: string; appIcon: string | null };
export type MenuPageGroup = { app: string; appName: string; appIcon: string | null; pages: MenuPage[] };

/** รหัสกลุ่ม "ไม่อยู่ในแอปไหน" */
export const NO_APP = "";
export const NO_APP_TH = "ไม่อยู่ในแอปไหน";

/** ลิงก์หน้าในระบบเราเท่านั้น: ขึ้นต้น "/" (ไม่ใช่ "//") · ไม่มีช่องว่าง/ตัวควบคุม/แบ็กสแลช · ไม่เกิน 300 ตัว */
export function isErpPageHref(v: unknown): v is string {
  return typeof v === "string" && v.length <= 300 && v.startsWith("/") && !v.startsWith("//") && !/[\s\\\u0000-\u001f\u007f]/.test(v);
}

/** รหัสแอป (เช่น design · china-pay) */
export const isAppKey = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(v);

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** หน้าทั้งหมด จัดกลุ่มตามแอป (เรียงตามลำดับแอป · ในแอปเรียงตามลำดับเมนูของแอปนั้น) — query = ค้นชื่อหน้า / ลิงก์ / ชื่อแอป */
export function menuPageGroups(menus: MenuPageRow[], apps: MenuAppRow[], query = ""): MenuPageGroup[] {
  const q = norm(query);
  const appOrder = new Map(apps.map((a, i) => [a.key, { app: a, i: a.sort_order ?? i }]));
  const groups = new Map<string, { g: MenuPageGroup; sort: Map<string, number> }>();
  const seen = new Set<string>();
  for (const m of menus) {
    if (m.is_active === false || !isErpPageHref(m.href)) continue;
    const keys = [...new Set((m.app_keys ?? []).filter((k) => typeof k === "string" && k))];
    for (const key of keys.length ? keys : [NO_APP]) {
      const a = key ? appOrder.get(key)?.app : null;
      const appName = key ? (typeof a?.label === "string" ? a.label.trim() : "") || key : NO_APP_TH;
      const ovLabel = key ? appOverride(m, key)?.label : null;
      const label = (typeof ovLabel === "string" ? ovLabel.trim() : "") || (typeof m.label === "string" ? m.label.trim() : "") || m.href;
      if (q && !norm(label).includes(q) && !norm(m.label).includes(q) && !norm(m.href).includes(q) && !norm(appName).includes(q)) continue;
      const dup = `${key}\u0001${m.href}`;
      if (seen.has(dup)) continue;   // เมนูแถวซ้ำลิงก์เดียวกันในแอปเดียวกัน = เอาแถวแรก
      seen.add(dup);
      let entry = groups.get(key);
      if (!entry) { entry = { g: { app: key, appName, appIcon: a?.icon ?? null, pages: [] }, sort: new Map() }; groups.set(key, entry); }
      entry.g.pages.push({ href: m.href, label, icon: m.icon ?? null, app: key, appName, appIcon: a?.icon ?? null });
      entry.sort.set(m.href, key ? effectiveSort({ sort_order: m.sort_order ?? 0, app_overrides: m.app_overrides }, key) : (m.sort_order ?? 0));
    }
  }
  const rank = (key: string) => (key === NO_APP ? Number.POSITIVE_INFINITY : appOrder.get(key)?.i ?? Number.MAX_SAFE_INTEGER);
  return [...groups.values()]
    .sort((x, y) => rank(x.g.app) - rank(y.g.app) || x.g.appName.localeCompare(y.g.appName, "th"))
    .map(({ g, sort }) => ({ ...g, pages: g.pages.sort((p, r) => (sort.get(p.href) ?? 0) - (sort.get(r.href) ?? 0) || p.label.localeCompare(r.label, "th")) }));
}

/** หาหน้าตามลิงก์ (ไว้ดูชื่อแอปล่าสุด / ยังอยู่ในเมนูไหม) · app = แอปที่เลือกไว้ (ไม่อยู่แอปนั้นแล้ว = ใช้แอปแรกที่อยู่) · ไม่เจอ = null */
export function findMenuPage(menus: MenuPageRow[], apps: MenuAppRow[], href: string, app?: string | null): MenuPage | null {
  if (!isErpPageHref(href)) return null;
  const rows = menus.filter((m) => m.href === href);
  if (!rows.length) return null;
  const pages = menuPageGroups(rows, apps).flatMap((g) => g.pages);
  return pages.find((p) => p.app === (app ?? NO_APP)) ?? pages[0] ?? null;
}
