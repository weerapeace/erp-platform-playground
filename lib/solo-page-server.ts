/**
 * แอปหน้าเดียว — ฝั่งเซิร์ฟเวอร์: หาชื่อ/ไอคอน/สีของหน้าจากเมนู (erp_menu_items) + สีของแอปที่เมนูสังกัด
 * ใช้ใน /api/page-manifest · /api/page-icon · app/solo/[...path]/layout (สาธารณะ — ไม่มีข้อมูลลับ แค่ชื่อเมนู)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { labelFromPath, matchMenuForPath } from "@/lib/solo-page";

export type SoloPageInfo = {
  label: string;
  /** อีโมจิ / "i:<key>" ของเมนู */
  icon: string | null;
  /** r2_key รูปไอคอนเมนูที่อัปโหลดไว้ */
  iconUrl: string | null;
  theme: string;
  permissionKey: string | null;
};

const DEFAULT_THEME = "#2563eb";
const HEX = /^#[0-9a-fA-F]{6}$/;

export async function loadSoloPageInfo(admin: SupabaseClient, pagePath: string): Promise<SoloPageInfo> {
  const { data } = await admin.from("erp_menu_items")
    .select("href, label, icon, icon_url, app_keys, permission_key")
    .eq("is_active", true)
    .limit(2000);
  const items = (data ?? []) as { href: string; label: string; icon: string | null; icon_url: string | null; app_keys: string[] | null; permission_key: string | null }[];
  const m = matchMenuForPath(items, pagePath);
  let theme = DEFAULT_THEME;
  const appKey = m?.app_keys?.[0];
  if (appKey) {
    const { data: g } = await admin.from("erp_app_groups").select("theme_color").eq("key", appKey).maybeSingle();
    if (typeof g?.theme_color === "string" && HEX.test(g.theme_color)) theme = g.theme_color;
  }
  return {
    label: m?.label?.trim() || labelFromPath(pagePath),
    icon: m?.icon ?? null,
    iconUrl: m?.icon_url ?? null,
    theme,
    permissionKey: m?.permission_key ?? null,
  };
}
