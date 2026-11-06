/**
 * 🎨 ไอคอนแอป (ของกลาง · ใช้ได้ทั้งหน้าจอและเซิร์ฟเวอร์) — ทุกแอปที่ติดตั้งลงเครื่องได้ ใช้ที่อยู่รูปไอคอนชุดเดียว
 *
 * - แอปในทะเบียนเมนู (erp_app_groups → /app/<key>) เก็บไอคอนที่ erp_app_groups.icon_url เหมือนเดิม (แก้ได้ที่ /admin/menu ด้วย)
 * - แอปเดี่ยวที่มีหน้าของตัวเอง (เช่น /notify) ลงทะเบียนใน STANDALONE_APPS ด้านล่าง · ไอคอนที่ตั้งเองเก็บใน
 *   china_app_settings skey=app_branding → { <key>: { icon_url, updated_at } }
 * - ที่อยู่รูป: /api/app-icon/<key>?s=<ขนาด> (ย่อ/ครอปจัตุรัสให้) · ไม่ได้ตั้ง = ไอคอนตั้งต้นของแอป
 * - เปลี่ยนไอคอน: <AppIconEditButton appKey> (components/app-icon-editor) → PATCH /api/app-branding (สิทธิ์ admin.users)
 * เพิ่มแอปเดี่ยวใหม่ = เพิ่มใน STANDALONE_APPS + ใช้ /api/app-manifest/<key> เป็น manifest ของหน้านั้น
 * - แอปหน้าเดียว (/solo<path> · lib/solo-page) — key = "page:<path>" (pageBrandKey) · ไอคอน + ชื่อบนหน้าจอเก็บในที่เดียวกัน
 *   (china_app_settings app_branding) ไม่แตะไอคอน/ชื่อของเมนูในระบบ · รูปเสิร์ฟที่ /api/page-icon<path> (ใช้ brandIconUrl)
 */
import { cleanPagePath } from "@/lib/solo-page";

export type StandaloneApp = {
  key: string;
  name: string;
  shortName: string;
  description: string;
  startUrl: string;
  scope: string;
  themeColor: string;
  /** ไอคอนตั้งต้น (PNG จัตุรัสใน public/) */
  defaultIcon: { 192: string; 512: string; maskable: string };
};

export const STANDALONE_APPS: Record<string, StandaloneApp> = {
  notify: {
    key: "notify",
    name: "แจ้งเตือน ERP",
    shortName: "แจ้งเตือน",
    description: "รับแจ้งเตือนจาก ERP เด้งเข้ามือถือ · ดูรายการ · กดเปิดเรื่องนั้น",
    startUrl: "/notify",
    scope: "/",
    themeColor: "#2563eb",
    defaultIcon: { 192: "/notify-icon-192.png", 512: "/notify-icon-512.png", maskable: "/notify-icon-maskable-512.png" },
  },
};

export const APP_BRANDING_KEY = "app_branding";
export const APP_KEY_RE = /^[a-z][a-z0-9_-]{0,30}$/;
/** โฟลเดอร์ R2 ที่ยอมรับเป็นไอคอนแอป (อัปโหลดผ่าน /api/admin/upload folder=app-icons) */
export const APP_ICON_FOLDER = "app-icons";

/** ที่อยู่รูปไอคอนแอปขนาดที่ต้องการ — v = เลขรุ่น (เปลี่ยนเมื่อเปลี่ยนไอคอน → รูปไม่ค้างแคช) */
export function appIconUrl(appKey: string, size = 192, v?: string | null): string {
  return `/api/app-icon/${appKey}?s=${size}${v ? `&v=${encodeURIComponent(v)}` : ""}`;
}

/** ขนาดที่เสิร์ฟได้ (ปัดเข้าใกล้สุด กันขอขนาดแปลก ๆ ให้เซิร์ฟเวอร์ย่อทุกครั้ง) */
export const APP_ICON_SIZES = [32, 48, 64, 96, 128, 180, 192, 256, 512] as const;
export function nearestIconSize(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 192;
  return APP_ICON_SIZES.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), 192);
}

export function isAppIconKey(key: unknown): key is string {
  return typeof key === "string" && key.startsWith(`${APP_ICON_FOLDER}/`) && /^[a-zA-Z0-9._/-]+$/.test(key)
    && !key.split("/").some((seg) => seg === "." || seg === "..");
}

// ── แอปหน้าเดียว (/solo<path>) ── ไอคอน/ชื่อบนหน้าจอของหน้านั้น (เจ้าของ 2026-11-06 · ใส่รูปเองได้ เหมือนไอคอนแอป)
export const PAGE_BRAND_PREFIX = "page:";
/** ชื่อบนหน้าจอยาวได้ไม่เกิน (หน้าจอโฮมโชว์ ~12 ตัว ที่เหลือตัด "…") */
export const PAGE_LABEL_MAX = 30;
export const pageBrandKey = (pagePath: string) => `${PAGE_BRAND_PREFIX}${pagePath}`;
/** "page:/master/work-board" → "/master/work-board" · ไม่ใช่ key ของหน้า / path ใช้ไม่ได้ = null */
export function pagePathOfBrandKey(key: unknown): string | null {
  if (typeof key !== "string" || !key.startsWith(PAGE_BRAND_PREFIX)) return null;
  const p = cleanPagePath(key.slice(PAGE_BRAND_PREFIX.length));
  return p && pageBrandKey(p) === key ? p : null;
}
/** key ที่ระบบไอคอนแอปรู้จัก: แอป (ทะเบียนเมนู/แอปเดี่ยว) หรือแอปหน้าเดียว */
export function isBrandKey(key: unknown): key is string {
  return typeof key === "string" && (APP_KEY_RE.test(key) || pagePathOfBrandKey(key) !== null);
}
/** ที่อยู่รูปไอคอนของ key ใดก็ได้ · def = ไอคอนตั้งต้น (ไม่สนรูปที่ตั้งเอง) ไว้ทำตัวอย่างก่อนบันทึก */
export function brandIconUrl(key: string, size = 192, v?: string | null, def = false): string {
  const page = pagePathOfBrandKey(key);
  const base = page ? `/api/page-icon${page}?s=${size}${v ? `&v=${encodeURIComponent(v)}` : ""}` : appIconUrl(key, size, v);
  return def ? `${base}&d=1` : base;
}
/** ทำชื่อบนหน้าจอให้สะอาด — ว่าง = null (ใช้ชื่อเมนู) */
export function cleanPageLabel(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, PAGE_LABEL_MAX) : "";
  return s || null;
}
