/**
 * 🎨 ไอคอนแอป ฝั่งเซิร์ฟเวอร์ (ของกลาง) — อ่าน/ตั้ง/เสิร์ฟรูปไอคอนของแอปใดก็ได้ (ดู lib/app-branding.ts)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { absoluteUrl } from "@/lib/app-url";
import { r2GetObject } from "@/lib/r2";
import { APP_BRANDING_KEY, STANDALONE_APPS, isAppIconKey } from "@/lib/app-branding";

type Admin = ReturnType<typeof supabaseAdmin>;

export type AppBranding = {
  key: string;
  label: string;
  /** r2 key ของไอคอนที่ตั้งเอง (null = ใช้ไอคอนตั้งต้น) */
  iconUrl: string | null;
  /** เลขรุ่น (เวลาแก้ล่าสุด) ใช้ต่อท้ายที่อยู่รูปกันแคช */
  version: string | null;
  /** เก็บที่ไหน: แอปในทะเบียนเมนู / แอปเดี่ยว / ไม่รู้จัก */
  source: "app_group" | "standalone" | null;
};

type BrandingStore = Record<string, { icon_url?: string | null; updated_at?: string }>;

async function readStore(admin: Admin): Promise<BrandingStore> {
  const { data } = await admin.from("china_app_settings").select("sval").eq("skey", APP_BRANDING_KEY).maybeSingle();
  const v = (data as { sval?: unknown } | null)?.sval;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as BrandingStore) : {};
}

export async function getAppBranding(admin: Admin, appKey: string): Promise<AppBranding> {
  const { data: g } = await admin.from("erp_app_groups").select("key, label, icon_url, updated_at").eq("key", appKey).maybeSingle();
  const group = g as { key: string; label: string; icon_url: string | null; updated_at: string | null } | null;
  if (group) {
    return { key: appKey, label: group.label, iconUrl: group.icon_url || null, version: group.updated_at ? String(Date.parse(group.updated_at)) : null, source: "app_group" };
  }
  const app = STANDALONE_APPS[appKey];
  if (!app) return { key: appKey, label: appKey, iconUrl: null, version: null, source: null };
  const entry = (await readStore(admin))[appKey];
  return { key: appKey, label: app.shortName, iconUrl: entry?.icon_url || null, version: entry?.updated_at ? String(Date.parse(entry.updated_at)) : null, source: "standalone" };
}

/** ตั้ง/ล้างไอคอน (null = กลับไปใช้ไอคอนตั้งต้น) — คืนค่าก่อน/หลัง ไว้ลง audit */
export async function setAppIcon(admin: Admin, appKey: string, iconUrl: string | null): Promise<{ before: string | null; after: string | null }> {
  const cur = await getAppBranding(admin, appKey);
  if (!cur.source) throw new Error("ไม่รู้จักแอปนี้");
  if (iconUrl !== null && !isAppIconKey(iconUrl)) throw new Error("ไฟล์ไอคอนไม่ถูกต้อง — อัปโหลดใหม่อีกครั้ง");
  const now = new Date().toISOString();
  if (cur.source === "app_group") {
    const { error } = await admin.from("erp_app_groups").update({ icon_url: iconUrl, updated_at: now }).eq("key", appKey);
    if (error) throw new Error(error.message);
  } else {
    const store = await readStore(admin);
    store[appKey] = { icon_url: iconUrl, updated_at: now };
    const { error } = await admin.from("china_app_settings").upsert({ skey: APP_BRANDING_KEY, sval: store, updated_at: now }, { onConflict: "skey" });
    if (error) throw new Error(error.message);
  }
  return { before: cur.iconUrl, after: iconUrl };
}

function defaultIconPath(appKey: string, size: number, maskable: boolean): string {
  const app = STANDALONE_APPS[appKey];
  if (!app) return size > 192 ? "/icon-512.png" : "/icon-192.png";
  if (maskable) return app.defaultIcon.maskable;
  return size > 192 ? app.defaultIcon[512] : app.defaultIcon[192];
}

/**
 * รูปไอคอน PNG จัตุรัสขนาด size — ไอคอนที่ตั้งเอง (R2 · ครอปกลางให้จัตุรัส) ไม่งั้นไอคอนตั้งต้นของแอป
 * maskable = เผื่อขอบ (Android ตัดเป็นวงกลม/มน) → ย่อรูปเหลือ 80% บนพื้นสีธีม
 */
export async function loadAppIconPng(admin: Admin, appKey: string, size: number, maskable = false, forceDefault = false): Promise<{ body: Buffer; custom: boolean }> {
  const b = forceDefault ? null : await getAppBranding(admin, appKey);
  const sharp = (await import("sharp")).default;
  if (b?.iconUrl && isAppIconKey(b.iconUrl)) {
    try {
      const obj = await r2GetObject(b.iconUrl);
      if (obj) {
        const src = Buffer.from(await new Response(obj.body).arrayBuffer());
        if (maskable) {
          const inner = Math.round(size * 0.8);
          const img = await sharp(src).resize(inner, inner, { fit: "cover" }).png().toBuffer();
          const bg = STANDALONE_APPS[appKey]?.themeColor ?? "#ffffff";
          const body = await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
            .composite([{ input: img, gravity: "center" }]).png().toBuffer();
          return { body, custom: true };
        }
        return { body: await sharp(src).resize(size, size, { fit: "cover" }).png().toBuffer(), custom: true };
      }
    } catch (e) {
      console.warn(`[app-icon] อ่านไอคอน ${appKey} ไม่ได้ ใช้ไอคอนตั้งต้นแทน:`, e instanceof Error ? e.message : e);
    }
  }
  const res = await fetch(absoluteUrl(defaultIconPath(appKey, size, maskable))!);
  if (!res.ok) throw new Error(`โหลดไอคอนตั้งต้นไม่ได้ (${res.status})`);
  const raw = Buffer.from(await res.arrayBuffer());
  return { body: await sharp(raw).resize(size, size, { fit: "cover" }).png().toBuffer(), custom: false };
}

/** Response รูปไอคอน (ใช้ใน /api/app-icon และไฟล์ icon.tsx / apple-icon.tsx ของหน้าแอป) */
export async function appIconResponse(admin: Admin, appKey: string, size: number, maskable = false, forceDefault = false): Promise<Response> {
  try {
    const { body } = await loadAppIconPng(admin, appKey, size, maskable, forceDefault);
    return new Response(new Uint8Array(body), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300, s-maxage=300", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    console.error(`[app-icon] ${appKey}:`, e);
    return Response.redirect(absoluteUrl(defaultIconPath(appKey, size, maskable))!, 302);
  }
}
