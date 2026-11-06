/**
 * แอปหน้าเดียว — ฝั่งเซิร์ฟเวอร์: หาชื่อ/ไอคอน/สีของหน้าจากเมนู (erp_menu_items) + สีของแอปที่เมนูสังกัด
 * ใช้ใน /api/page-manifest · /api/page-icon · app/solo/[...path]/layout (สาธารณะ — ไม่มีข้อมูลลับ แค่ชื่อเมนู)
 * ไอคอน/ชื่อที่ตั้งเองของแอปหน้าเดียว (ของกลางไอคอนแอป key "page:<path>") มาก่อนของเมนู — ไม่แตะเมนูในระบบ
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { labelFromPath, matchMenuForPath } from "@/lib/solo-page";
import { isAppIconKey, pageBrandKey } from "@/lib/app-branding";
import { readBrandingStore, type BrandingStore } from "@/lib/app-branding-store";

export type SoloPageInfo = {
  /** ชื่อที่ใช้จริง (ตั้งเอง > ชื่อเมนู > เดาจาก path) */
  label: string;
  /** ชื่อเมนู (ไม่สนชื่อที่ตั้งเอง) */
  menuLabel: string;
  /** ชื่อบนหน้าจอที่ตั้งเอง (null = ใช้ชื่อเมนู) */
  customLabel: string | null;
  /** อีโมจิ / "i:<key>" ของเมนู */
  icon: string | null;
  /** r2_key รูปไอคอนที่ใช้จริง (ตั้งเอง > รูปเมนู) */
  iconUrl: string | null;
  /** r2_key รูปไอคอนที่ตั้งเองของแอปหน้าเดียว (null = ไม่ได้ตั้ง) */
  customIconUrl: string | null;
  /** เลขรุ่นของที่ตั้งเอง (ต่อท้ายที่อยู่รูปกันแคช) */
  version: string | null;
  theme: string;
  permissionKey: string | null;
};

const DEFAULT_THEME = "#2563eb";
const HEX = /^#[0-9a-fA-F]{6}$/;

/** ignoreCustom = ไม่สนไอคอน/ชื่อที่ตั้งเอง (ตัวอย่าง "ไอคอนตั้งต้น" ในตัวแก้ไอคอน) */
export async function loadSoloPageInfo(admin: SupabaseClient, pagePath: string, opts: { ignoreCustom?: boolean } = {}): Promise<SoloPageInfo> {
  const [{ data }, store] = await Promise.all([
    admin.from("erp_menu_items")
      .select("href, label, icon, icon_url, app_keys, permission_key")
      .eq("is_active", true)
      .limit(2000),
    opts.ignoreCustom ? Promise.resolve({} as BrandingStore) : readBrandingStore(admin).catch(() => ({} as BrandingStore)),
  ]);
  const items = (data ?? []) as { href: string; label: string; icon: string | null; icon_url: string | null; app_keys: string[] | null; permission_key: string | null }[];
  const m = matchMenuForPath(items, pagePath);
  let theme = DEFAULT_THEME;
  const appKey = m?.app_keys?.[0];
  if (appKey) {
    const { data: g } = await admin.from("erp_app_groups").select("theme_color").eq("key", appKey).maybeSingle();
    if (typeof g?.theme_color === "string" && HEX.test(g.theme_color)) theme = g.theme_color;
  }
  const entry = store[pageBrandKey(pagePath)];
  const customIconUrl = entry?.icon_url && isAppIconKey(entry.icon_url) ? entry.icon_url : null;
  const customLabel = entry?.label?.trim() || null;
  const menuLabel = m?.label?.trim() || labelFromPath(pagePath);
  return {
    label: customLabel ?? menuLabel,
    menuLabel,
    customLabel,
    icon: m?.icon ?? null,
    iconUrl: customIconUrl ?? m?.icon_url ?? null,
    customIconUrl,
    version: entry?.updated_at ? String(Date.parse(entry.updated_at)) : null,
    theme,
    permissionKey: m?.permission_key ?? null,
  };
}
