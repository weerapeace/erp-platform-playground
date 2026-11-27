/**
 * ทะเบียนหน้า/เมนูที่ "คนนี้เห็นได้" (ฝั่งเซิร์ฟเวอร์) — ใช้ร่วม: ค้นหารวม (/api/global-search) + ผู้ช่วยเสียง (/api/voice-assistant/command)
 * กฎเดียวกันทุกที่: เมนูเปิดอยู่ · สิทธิ์เมนูผ่าน · ถ้าเมนูสังกัดแอป ต้องเข้าแอปนั้นได้อย่างน้อย 1 แอป (admin = เห็นหมด)
 * แหล่งข้อมูล = erp_menu_items + erp_app_groups (แคช 60 วิ · ตารางเล็ก ~200 แถว)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type MenuRowLite = {
  id: string; label: string; href: string; section: string | null; icon: string | null;
  app_keys: string[] | null; permission_key: string | null; is_active: boolean;
  search_keywords?: string[] | null;   // คำค้นเพิ่ม/คำพ้อง (ตั้งที่ /admin/menu)
};
export type AppGroupLite = { key: string; label: string; permission_key: string | null; is_active: boolean };
export type CanFn = (key: string | null | undefined) => boolean;

let menuCache: { at: number; rows: MenuRowLite[]; apps: AppGroupLite[] } | null = null;
const MENU_TTL = 60_000;

export async function loadMenuRegistry() {
  if (menuCache && Date.now() - menuCache.at < MENU_TTL) return menuCache;
  const admin = supabaseAdmin();
  const [{ data: rows }, { data: apps }] = await Promise.all([
    admin.from("erp_menu_items").select("*").eq("is_active", true),
    admin.from("erp_app_groups").select("key, label, permission_key, is_active"),
  ]);
  menuCache = { at: Date.now(), rows: (rows ?? []) as MenuRowLite[], apps: (apps ?? []) as AppGroupLite[] };
  return menuCache;
}

/** สิทธิ์ของคนที่ขอ — ใช้กรองเมนู/แอปที่เขาเห็นได้เท่านั้น (admin = เห็นหมด) */
export async function loadMyAccess(sb: ReturnType<typeof supabaseFromRequest>, userId: string): Promise<{ can: CanFn }> {
  const [{ data: perms }, { data: prof }] = await Promise.all([
    sb.rpc("erp_my_permissions"),
    supabaseAdmin().from("user_profiles").select("role").eq("id", userId).maybeSingle(),
  ]);
  const isAdmin = (prof as { role?: string } | null)?.role === "admin";
  const set = new Set<string>(Array.isArray(perms) ? (perms as string[]) : []);
  return { can: (key) => !key || isAdmin || set.has(key) };
}

/** แอปที่เมนูนี้สังกัด + คนนี้เข้าได้ · null = คนนี้ไม่เห็นเมนูนี้ (ไม่สังกัดแอปไหน = เห็นได้ถ้าสิทธิ์เมนูผ่าน → คืน []) */
export function menuAppsFor(r: MenuRowLite, can: CanFn, appByKey: Map<string, AppGroupLite>): AppGroupLite[] | null {
  if (!r.is_active || !r.href || !r.label) return null;
  if (!can(r.permission_key)) return null;
  const myApps = (r.app_keys ?? []).map((k) => appByKey.get(k)).filter((a): a is AppGroupLite => !!a && a.is_active && can(a.permission_key));
  if ((r.app_keys ?? []).length > 0 && myApps.length === 0) return null;
  return myApps;
}

export type VisiblePage = { id: string; label: string; href: string; where: string; keywords: string[] };

/** ทุกหน้าที่คนนี้เห็นได้ (ไม่ซ้ำลิงก์) — ใช้ให้ผู้ช่วยเสียงเลือกหน้าจากรายการจริง */
export async function listVisiblePages(can: CanFn): Promise<VisiblePage[]> {
  const { rows, apps } = await loadMenuRegistry();
  const appByKey = new Map(apps.map((a) => [a.key, a]));
  const out: VisiblePage[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const myApps = menuAppsFor(r, can, appByKey);
    if (!myApps || seen.has(r.href)) continue;
    seen.add(r.href);
    out.push({
      id: r.id, label: r.label, href: r.href,
      where: [myApps.map((a) => a.label).join(" / "), r.section].filter(Boolean).join(" · "),
      keywords: (r.search_keywords ?? []).filter(Boolean),
    });
  }
  return out;
}
