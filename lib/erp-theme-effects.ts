// ============================================================
// ธีม → เอฟเฟกต์ในหน้าจริง (ธีมกลาง ERP เฟส 4 · pure) — docs/erp-theme.md
//   คืน attrs (ตั้งที่ <html> เป็น data-tm-*) + vars (ตัวแปร CSS) + ค่าชั้นตกแต่ง (พื้นหลัง/แบนเนอร์/มาสคอต)
//   CSS ที่อ่านค่าพวกนี้อยู่ใน app/globals.css หัวข้อ "ธีมกลาง เฟส 4"
//   เจ้าของเลือก (2026-11-24): แบนเนอร์ = แถบตกแต่งบนสุดทุกหน้า · แถบบน PC = หัวเมนูข้าง · มาสคอต = มุมขวาล่าง
//   มือถือ = โหมดเบา (mobileLiteConfig) · ปิดแอนิเมชัน (ผู้ใช้/เครื่องตั้งลดการเคลื่อนไหว) = ไม่ตั้ง attr แอนิเมชันเลย
// เทสต์: lib/__tests__/erp-theme-effects.test.ts
// ============================================================
import { effectiveBgOpacity, mobileLiteConfig, scaleOf, type ErpThemeConfig } from "./erp-theme-config";

export type ThemeEffectEnv = { mobile: boolean; motionOff: boolean };

export type ThemeLayer = { image: string | null; gradient: string | null; opacity: number; blur: number };

export type ThemeEffects = {
  attrs: Record<string, string>;
  vars: Record<string, string>;
  page: ThemeLayer | null;
  banner: (ThemeLayer & { animate: boolean }) | null;
  mascot: { image: string | null; color: string } | null;
};

/** แบนเนอร์อยู่หลังหัวหน้า (ตัวหนังสือเข้ม) → จางลงไม่เกินเท่านี้ ถ้าเปิดตัวกันอ่านยาก */
export const BANNER_MAX_OPACITY = 55;
/** ไล่สีของแบนเนอร์/พื้นหน้าเป็นแบบอ่อน (ไม่ทึบ) */
const SOFT = { banner: 0.42, page: 0.16 };

export const imgUrl = (key: string, w: number) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;

export function themeEffects(raw: ErpThemeConfig | null, env: ThemeEffectEnv): ThemeEffects {
  const none: ThemeEffects = { attrs: {}, vars: {}, page: null, banner: null, mascot: null };
  if (!raw) return none;
  const c = env.mobile ? mobileLiteConfig(raw) : raw;
  const p = scaleOf(c.colors.primary);
  const g = c.gradient, sp = g.spots, b = c.background, a = c.animation;
  const grad = `linear-gradient(${g.angle}deg, ${p[600]}, ${g.color2})`;
  const motion = !env.motionOff;
  const attrs: Record<string, string> = {};
  const vars: Record<string, string> = { "--tm-gradient": grad };
  const w = env.mobile ? 900 : 1600;

  // ปุ่มหลัก (คลาส bg-blue-600 ทั้งระบบ) — เฉพาะแบบปุ่มทึบ
  if (c.components.button === "solid") {
    if (sp.button) attrs["tm-btn"] = "grad";
    if (a.shine && motion) attrs["tm-shine"] = "1";
  }
  // แถบบน: มือถือ = แถบบนเชลล์ · PC = หัวเมนูข้าง
  const topImg = b.image && b.where === "top" ? b.image : null;
  if (sp.top || topImg) {
    const veil = topImg && b.veil ? "linear-gradient(rgba(0,0,0,.28), rgba(0,0,0,.28)), " : "";
    vars["--tm-topbar"] = topImg ? `${veil}url("${imgUrl(topImg, 800)}") center / cover` : grad;
    attrs["tm-topbar"] = "1";
  }
  // เมนูข้าง
  if (c.components.sidebar !== "light") attrs["tm-sidebar"] = c.components.sidebar;
  if (c.components.sidebar === "brand") vars["--tm-sidebar-bg"] = p[800];
  if (sp.sidebar) attrs["tm-sidegrad"] = "1";
  // แอนิเมชัน
  if (motion) {
    if (a.enter) attrs["tm-enter"] = "1";
    if (g.animate && (sp.top || sp.banner || sp.button || sp.page)) attrs["tm-ganim"] = "1";
  }
  if (a.hover) attrs["tm-hover"] = "1";
  if (!a.countUp || !motion) attrs["tm-count"] = "off";

  // พื้นหลังทั้งหน้า
  const pageImg = b.image && b.where === "page" ? b.image : null;
  const page: ThemeLayer | null = pageImg || sp.page ? {
    image: pageImg ? imgUrl(pageImg, w) : null,
    gradient: sp.page ? `linear-gradient(${g.angle}deg, ${p[500]}, ${g.color2})` : null,
    opacity: pageImg ? effectiveBgOpacity(c) / 100 : SOFT.page,
    blur: pageImg ? c.background.blur : 0,
  } : null;

  // แบนเนอร์ (แถบตกแต่งบนสุดของทุกหน้า)
  const banImg = b.image && b.where === "banner" ? b.image : null;
  const banner = banImg || sp.banner ? {
    image: banImg ? imgUrl(banImg, w) : null,
    gradient: sp.banner ? grad : null,
    opacity: banImg ? (b.veil ? Math.min(b.opacity, BANNER_MAX_OPACITY) : b.opacity) / 100 : SOFT.banner,
    blur: banImg ? c.background.blur : 0,
    animate: motion && g.animate && sp.banner,
  } : null;

  const mascot = a.mascot && motion ? { image: a.mascotImage ? `/api/r2-image?key=${encodeURIComponent(a.mascotImage)}` : null, color: scaleOf(c.colors.accent)[500] } : null;
  return { attrs, vars, page, banner, mascot };
}

/** ชื่อ attr ทั้งหมดที่ตัวทาธีมอาจตั้ง (ไว้ล้างตอนเปลี่ยนแอป/ไม่มีธีม) */
export const EFFECT_ATTRS = ["tm-btn", "tm-shine", "tm-topbar", "tm-sidebar", "tm-sidegrad", "tm-enter", "tm-ganim", "tm-hover", "tm-count"] as const;
