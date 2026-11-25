// ============================================================
// ธีม → เอฟเฟกต์ในหน้าจริง (ธีมกลาง ERP เฟส 4 · pure) — docs/erp-theme.md
//   คืน attrs (ตั้งที่ <html> เป็น data-tm-*) + vars (ตัวแปร CSS) + ค่าชั้นตกแต่ง (พื้นหลัง/แบนเนอร์/มาสคอต)
//   CSS ที่อ่านค่าพวกนี้อยู่ใน app/globals.css หัวข้อ "ธีมกลาง เฟส 4"
//   เจ้าของเลือก (2026-11-24): แบนเนอร์ = แถบตกแต่งบนสุดทุกหน้า · แถบบน PC = หัวเมนูข้าง · มาสคอต = มุมขวาล่าง
//   มือถือ = โหมดเบา (mobileLiteConfig) · ปิดแอนิเมชัน (ผู้ใช้/เครื่องตั้งลดการเคลื่อนไหว) = ไม่ตั้ง attr แอนิเมชันเลย
// เทสต์: lib/__tests__/erp-theme-effects.test.ts
// ============================================================
import { SPEED_FACTOR, effectiveBgOpacity, mobileLiteConfig, scaleOf, type ErpThemeConfig } from "./erp-theme-config";
import { EFFECTS, blinkMinOpacity, fxDuration, fxSpread, type EffectKey, type EffectTarget } from "./erp-theme-fx";

/** จุดที่รอบ 2 ทาในหน้าจริง (ป้ายด่วน/การ์ด = รอบ 3–4) */
export const ROUND2_TARGETS: EffectTarget[] = ["button", "topbar", "menu", "number", "bell", "card", "badge"];

/**
 * "การ์ด" ในหน้าจริง (รอบ 3) = กล่องขาว มีเส้นขอบ มุมมน ในเนื้อหาของหน้า ([data-tm-page])
 *   - ไม่นับกล่องที่ซ้อนอยู่ในการ์ดอีกที (นับแค่ชั้นนอก) · ไม่นับกล่อง/โซนที่ใส่ data-tm-skip
 *   - ⚠️ ต้องตรงกับ CSS ใน app/globals.css หัวข้อ "การ์ด รอบ 3" (เทสต์เช็กให้)
 *   - ยกตัว/เรือง ไม่ทำกับการ์ดที่มีตารางข้างใน (CARD_MOTION_SELECTOR) — ตารางใหญ่ขยับแล้วเวียนหัว
 */
export const CARD_SELECTOR = "[data-tm-page] :is(div, section, article, li, a).bg-white:is(.border, .border-2):is(.rounded-lg, .rounded-xl, .rounded-2xl):not([data-tm-skip]):not(:is(.bg-white.border, [data-tm-skip]) *)";
export const CARD_MOTION_SELECTOR = `${CARD_SELECTOR}:not(:has(table))`;
const MOTION_FX = new Set<EffectKey>(EFFECTS.filter((e) => e.motion).map((e) => e.key));
const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };

export type ThemeEffectEnv = { mobile: boolean; motionOff: boolean };

export type ThemeLayer = { image: string | null; gradient: string | null; opacity: number; blur: number };

export type ThemeEffects = {
  attrs: Record<string, string>;
  vars: Record<string, string>;
  page: ThemeLayer | null;
  banner: (ThemeLayer & { animate: boolean }) | null;
  mascot: { image: string | null; color: string } | null;
  /** อนุภาคตกแต่ง (รอบ 4) — มือถือ/ปิดแอนิเมชัน = null */
  particles: { kind: "snow" | "stars" | "bubbles" | "sakura"; color: string; speed: number } | null;
};

/** แบนเนอร์อยู่หลังหัวหน้า (ตัวหนังสือเข้ม) → จางลงไม่เกินเท่านี้ ถ้าเปิดตัวกันอ่านยาก */
export const BANNER_MAX_OPACITY = 55;
/** ไล่สีของแบนเนอร์/พื้นหน้าเป็นแบบอ่อน (ไม่ทึบ) */
const SOFT = { banner: 0.42, page: 0.16 };

export const imgUrl = (key: string, w: number) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;

export function themeEffects(raw: ErpThemeConfig | null, env: ThemeEffectEnv): ThemeEffects {
  const none: ThemeEffects = { attrs: {}, vars: {}, page: null, banner: null, mascot: null, particles: null };
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
    if (c.effects.enter !== "none") attrs["tm-enter"] = c.effects.enter;   // fade | up | zoom | blur (รอบ 4)
    if (g.animate && (sp.top || sp.banner || sp.button || sp.page)) attrs["tm-ganim"] = "1";
  }
  if (a.hover) attrs["tm-hover"] = "1";
  if (!a.countUp || !motion) attrs["tm-count"] = "off";

  // ── เอฟเฟกต์ต่อจุด (รอบ 2: ปุ่มหลัก · แถบบน · เมนูที่เลือก · ตัวเลขสรุป · กระดิ่ง) ──
  //   attr data-tm-fx-<จุด>="pulse glow" + ตัวแปร --tm-anim-<จุด> (รายการ animation รวม) · CSS globals "เอฟเฟกต์ต่อจุด"
  const acc = scaleOf(c.colors.accent);
  vars["--tm-flow"] = `linear-gradient(90deg, ${p[600]}, ${g.color2}, ${acc[600]}, ${p[600]})`;
  vars["--tm-c1"] = p[600];
  vars["--tm-c2"] = acc[600];
  const speed = SPEED_FACTOR[a.speed];
  for (const t of ROUND2_TARGETS) {
    const v = c.effects.targets[t];
    const list = v.fx.filter((e) => (motion ? true : !MOTION_FX.has(e)) && e !== "countUp" && e !== "shine");
    if (!list.length) continue;
    attrs[`tm-fx-${t}`] = list.join(" ");
    vars[`--tm-ring-${t}`] = rgba(t === "badge" ? "#d97706" : p[500], 0.55);   // ป้ายด่วนใช้วงสีเหลืองอำพัน (สีป้ายล็อก)
    vars[`--tm-spread-${t}`] = `${fxSpread(v.strength)}px`;
    vars[`--tm-blinkmin-${t}`] = String(blinkMinOpacity(v.strength));
    const text = t === "number";
    const anims = (keys: EffectKey[]) => keys.flatMap((e) => {
      const d = fxDuration(e, v.strength, speed);
      switch (e) {
        case "pulse": return [text ? `tmNumPulse ${d}s ease-in-out infinite` : `tmPulse ${d}s ease-out infinite`];
        case "glow": return [text ? `tmTextGlow ${d}s ease-in-out infinite` : `tmGlow ${d}s ease-in-out infinite`];
        case "blink": return [`tmBlink ${d}s ease-in-out infinite`];
        case "colorShift": return [`tmShift ${d}s ease-in-out infinite`];
        case "flow": return [`tmGrad ${d}s ease infinite`];
        case "shake": return [`tmShake ${Math.max(2.4, d * 4)}s ease-in-out infinite`];
        default: return [];
      }
    });
    if (t === "bell") {
      vars["--tm-anim-bell-btn"] = anims(list.filter((e) => e === "pulse")).join(", ") || "none";
      vars["--tm-anim-bell-icon"] = anims(list.filter((e) => e === "shake")).join(", ") || "none";
    } else vars[`--tm-anim-${t}`] = anims(list).join(", ") || "none";
  }
  // ── การ์ด: เส้นขอบ · เงา (รอบ 3) — ค่าเริ่ม (ขอบเทา 1px ทึบ · เงาบางสีเทา) = ไม่แตะ ปล่อยหน้าตาเดิม ──
  const o = c.outline, el = c.elevation;
  const bdColor = o.color === "theme" ? p[500] : o.color === "soft" ? p[200] : "#e2e8f0";
  if (o.width !== 1 || o.color !== "gray" || o.style !== "solid" || o.gradient) {
    attrs["tm-card-border"] = o.gradient ? "grad" : "1";
    vars["--tm-card-bw"] = `${o.gradient ? Math.max(1, o.width) : o.width}px`;
    vars["--tm-card-bc"] = bdColor;
    vars["--tm-card-bs"] = o.style;
    if (o.gradient && o.running && motion) attrs["tm-card-run"] = "1";
  }
  if (o.accentBar || c.effects.targets.card.fx.includes("accentBar")) attrs["tm-card-bar"] = "1";
  if (el.depth !== "soft" || el.color !== "gray") {
    const sh = el.color === "theme" ? p[600] : el.color === "black" ? "#000000" : "#0f172a";
    vars["--tm-card-shadow"] = el.depth === "none" ? "none"
      : el.depth === "soft" ? `0 1px 3px ${rgba(sh, 0.12)}`
      : el.depth === "medium" ? `0 6px 16px -4px ${rgba(sh, el.color === "black" ? 0.35 : 0.22)}`
      : `0 18px 30px -10px ${rgba(sh, el.color === "black" ? 0.45 : 0.3)}`;
    attrs["tm-card-shadow"] = "1";
  }
  if (el.hoverGlow) { attrs["tm-card-hglow"] = "1"; vars["--tm-hring"] = rgba(p[500], 0.35); }
  if (el.inset) attrs["tm-inset"] = "1";
  if (motion && c.effects.stagger) attrs["tm-stagger"] = "1";

  // ชี้/กด
  if (motion) {
    if (c.effects.scaleHover) attrs["tm-scale"] = "1";
    if (c.effects.ripple) attrs["tm-ripple"] = "1";
    if (c.effects.underline) attrs["tm-underline"] = "1";
    if (c.effects.iconWiggle) attrs["tm-wiggle"] = "1";
  }

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
  const particles = motion && c.effects.particles !== "none" ? { kind: c.effects.particles, color: scaleOf(c.colors.accent)[300], speed: SPEED_FACTOR[a.speed] } : null;
  return { attrs, vars, page, banner, mascot, particles };
}

/** ชื่อ attr ทั้งหมดที่ตัวทาธีมอาจตั้ง (ไว้ล้างตอนเปลี่ยนแอป/ไม่มีธีม) */
export const EFFECT_ATTRS = [
  "tm-btn", "tm-shine", "tm-topbar", "tm-sidebar", "tm-sidegrad", "tm-enter", "tm-ganim", "tm-hover", "tm-count",
  "tm-fx-button", "tm-fx-topbar", "tm-fx-menu", "tm-fx-number", "tm-fx-bell", "tm-scale", "tm-ripple", "tm-underline", "tm-wiggle",
  "tm-fx-badge", "tm-fx-card", "tm-card-border", "tm-card-run", "tm-card-bar", "tm-card-shadow", "tm-card-hglow", "tm-inset", "tm-stagger",
] as const;
