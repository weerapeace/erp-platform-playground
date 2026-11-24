// ============================================================
// ค่าตั้งของธีม 1 ชุด (ของกลาง · เฟส 2) — docs/erp-theme.md
//   9 หมวด: สี · พื้นหลัง · ไล่สี · แอนิเมชัน · ตัวอักษร · รูปทรง · ความแน่น · ชิ้นส่วน · สว่าง/มืด
//   normalizeThemeConfig = กรองค่าเพี้ยน/เกินช่วง (ใช้ทั้งฝั่งเว็บและ API)
//   THEME_PRESETS = ธีมสำเร็จรูป · themeIssues/autoFixContrast = เตือนสีอ่านยาก + แก้ให้
//   paletteFromPixels = ดูดสีจากรูป · themeCssVars = ตัวแปร CSS ทั้งชุด
// ไฟล์ pure (ไม่มี "use client") — เทสต์ lib/__tests__/erp-theme-config.test.ts
// ============================================================
import { ORANGE_SCALE, VIOLET_SCALE, hexToChannels, isHexColor, scaleFromHex, themeVars, type ColorScale } from "./erp-theme";

export type BgWhere = "page" | "top" | "banner";
export type AnimSpeed = "slow" | "normal" | "fast";
export type Density = "compact" | "normal" | "spacious";
export type FontKey = "inter-noto" | "sarabun" | "prompt" | "ibm-plex-thai" | "kanit";

export type ErpThemeConfig = {
  v: 1;
  colors: { primary: string; accent: string };
  background: { image: string | null; where: BgWhere; opacity: number; blur: number; veil: boolean; darkImage: string | null };
  gradient: { color2: string; angle: number; spots: { top: boolean; button: boolean; sidebar: boolean; banner: boolean; page: boolean }; animate: boolean };
  animation: { enter: boolean; hover: boolean; shine: boolean; countUp: boolean; mascot: boolean; mascotImage: string | null; speed: AnimSpeed };
  typography: { font: FontKey; baseSize: number; headingWeight: 500 | 600 | 700 };
  shape: { radius: number; shadow: "none" | "soft" | "strong" };
  density: Density;
  components: {
    button: "solid" | "soft" | "outline";
    table: "plain" | "zebra" | "lines";
    input: "outline" | "filled";
    tabs: "underline" | "pill";
    badge: "soft" | "solid";
    sidebar: "light" | "dark" | "brand";
  };
  mode: { allowDark: boolean };
};

export const FONT_OPTIONS: { key: FontKey; label: string; family: string; google: string | null }[] = [
  { key: "inter-noto", label: "Inter + Noto Sans Thai (ค่าเริ่ม)", family: "'Inter','Noto Sans Thai',system-ui,sans-serif", google: null },
  { key: "sarabun", label: "Sarabun", family: "'Sarabun',system-ui,sans-serif", google: "Sarabun:wght@400;500;600;700" },
  { key: "prompt", label: "Prompt", family: "'Prompt',system-ui,sans-serif", google: "Prompt:wght@400;500;600;700" },
  { key: "ibm-plex-thai", label: "IBM Plex Sans Thai", family: "'IBM Plex Sans Thai',system-ui,sans-serif", google: "IBM+Plex+Sans+Thai:wght@400;500;600;700" },
  { key: "kanit", label: "Kanit", family: "'Kanit',system-ui,sans-serif", google: "Kanit:wght@400;500;600;700" },
];

/** หน้าตาเดิมของระบบ = ธีม "ส้มคลาสสิก" */
export const DEFAULT_THEME_CONFIG: ErpThemeConfig = {
  v: 1,
  colors: { primary: ORANGE_SCALE[500], accent: VIOLET_SCALE[500] },
  background: { image: null, where: "page", opacity: 30, blur: 0, veil: true, darkImage: null },
  gradient: { color2: "#f59e0b", angle: 90, spots: { top: false, button: false, sidebar: false, banner: false, page: false }, animate: false },
  animation: { enter: false, hover: false, shine: false, countUp: false, mascot: false, mascotImage: null, speed: "normal" },
  typography: { font: "inter-noto", baseSize: 14, headingWeight: 600 },
  shape: { radius: 8, shadow: "soft" },
  density: "normal",
  components: { button: "solid", table: "plain", input: "outline", tabs: "underline", badge: "soft", sidebar: "light" },
  mode: { allowDark: true },
};

/** ตัวกันอ่านยาก: รูปพื้นหลังทั้งหน้าชัดได้ไม่เกินเท่านี้ (เมื่อเปิด veil) */
export const VEIL_MAX_OPACITY = 40;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const hex = (v: unknown, d: string) => (isHexColor(v) ? `#${v.trim().replace(/^#/, "").toLowerCase()}` : d);
const num = (v: unknown, d: number, min: number, max: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
};
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const pick = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);
const key = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null);

/** กรองค่าธีมจากที่ไหนก็ได้ (DB/ฟอร์ม/ไฟล์) ให้ครบทุกช่องและอยู่ในช่วง — ช่องที่ไม่มี = ค่าเริ่ม */
export function normalizeThemeConfig(raw: unknown): ErpThemeConfig {
  const r = isObj(raw) ? raw : {};
  const D = DEFAULT_THEME_CONFIG;
  const c = isObj(r.colors) ? r.colors : {};
  const b = isObj(r.background) ? r.background : {};
  const g = isObj(r.gradient) ? r.gradient : {};
  const gs = isObj(g.spots) ? g.spots : {};
  const a = isObj(r.animation) ? r.animation : {};
  const t = isObj(r.typography) ? r.typography : {};
  const s = isObj(r.shape) ? r.shape : {};
  const k = isObj(r.components) ? r.components : {};
  const m = isObj(r.mode) ? r.mode : {};
  return {
    v: 1,
    colors: { primary: hex(c.primary, D.colors.primary), accent: hex(c.accent, D.colors.accent) },
    background: {
      image: key(b.image), where: pick(b.where, ["page", "top", "banner"] as const, D.background.where),
      opacity: num(b.opacity, D.background.opacity, 0, 100), blur: num(b.blur, D.background.blur, 0, 10),
      veil: bool(b.veil, D.background.veil), darkImage: key(b.darkImage),
    },
    gradient: {
      color2: hex(g.color2, D.gradient.color2), angle: num(g.angle, D.gradient.angle, 0, 360),
      spots: {
        top: bool(gs.top, false), button: bool(gs.button, false), sidebar: bool(gs.sidebar, false),
        banner: bool(gs.banner, false), page: bool(gs.page, false),
      },
      animate: bool(g.animate, false),
    },
    animation: {
      enter: bool(a.enter, false), hover: bool(a.hover, false), shine: bool(a.shine, false),
      countUp: bool(a.countUp, false), mascot: bool(a.mascot, false), mascotImage: key(a.mascotImage),
      speed: pick(a.speed, ["slow", "normal", "fast"] as const, "normal"),
    },
    typography: {
      font: pick(t.font, FONT_OPTIONS.map((f) => f.key), D.typography.font),
      baseSize: num(t.baseSize, D.typography.baseSize, 12, 16),
      headingWeight: pick(t.headingWeight as never, [500, 600, 700] as never[], D.typography.headingWeight as never),
    },
    shape: { radius: num(s.radius, D.shape.radius, 0, 20), shadow: pick(s.shadow, ["none", "soft", "strong"] as const, D.shape.shadow) },
    density: pick(r.density, ["compact", "normal", "spacious"] as const, D.density),
    components: {
      button: pick(k.button, ["solid", "soft", "outline"] as const, D.components.button),
      table: pick(k.table, ["plain", "zebra", "lines"] as const, D.components.table),
      input: pick(k.input, ["outline", "filled"] as const, D.components.input),
      tabs: pick(k.tabs, ["underline", "pill"] as const, D.components.tabs),
      badge: pick(k.badge, ["soft", "solid"] as const, D.components.badge),
      sidebar: pick(k.sidebar, ["light", "dark", "brand"] as const, D.components.sidebar),
    },
    mode: { allowDark: bool(m.allowDark, D.mode.allowDark) },
  };
}

/** แก้บางหมวดแบบลึก (ใช้กับ patch จากตัวแก้) แล้วกรองให้ถูกต้อง */
export function mergeThemeConfig(base: ErpThemeConfig, patch: Record<string, unknown>): ErpThemeConfig {
  const out: Obj = JSON.parse(JSON.stringify(base));
  const deep = (dst: Obj, src: Obj) => {
    for (const [k, v] of Object.entries(src)) {
      if (isObj(v) && isObj(dst[k])) deep(dst[k] as Obj, v);
      else dst[k] = v;
    }
  };
  deep(out, patch);
  return normalizeThemeConfig(out);
}

// ── ชุดสี ────────────────────────────────────────────────
/** สีหลัก/สีเน้น → 11 เฉด (ถ้าเป็นส้ม/ม่วงเดิม ใช้ชุดเดิมเป๊ะ) */
export function scaleOf(color: string): ColorScale {
  const c = color.toLowerCase();
  if (c === ORANGE_SCALE[500]) return ORANGE_SCALE;
  if (c === VIOLET_SCALE[500]) return VIOLET_SCALE;
  return scaleFromHex(c);
}

function luminance(h: string): number {
  const [r, g, b] = hexToChannels(h).split(" ").map((x) => {
    const v = Number(x) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** อัตราส่วนความต่างสี (WCAG) 1–21 */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

export type ThemeIssue = { key: string; level: "warn" | "info"; message: string; fixable: boolean };

/** เกณฑ์ "อ่านยาก" สำหรับตัวหนังสือบนปุ่ม/ลิงก์ (ปุ่มตัวหนา ≥ 3 ถือว่าอ่านออก) */
export const MIN_CONTRAST = 3;

/** เตือนจุดที่อ่านยาก */
export function themeIssues(cfg: ErpThemeConfig): ThemeIssue[] {
  const out: ThemeIssue[] = [];
  const p = scaleOf(cfg.colors.primary), a = scaleOf(cfg.colors.accent);
  if (contrastRatio("#ffffff", p[600]) < MIN_CONTRAST)
    out.push({ key: "primary-button", level: "warn", message: "ตัวหนังสือขาวบนปุ่มสีหลักอ่านยาก (สีหลักอ่อนเกินไป)", fixable: true });
  if (contrastRatio("#ffffff", a[600]) < MIN_CONTRAST)
    out.push({ key: "accent-button", level: "warn", message: "ตัวหนังสือขาวบนปุ่มสีเน้นอ่านยาก", fixable: true });
  if (cfg.gradient.spots.top || cfg.gradient.spots.banner || cfg.gradient.spots.button) {
    if (contrastRatio("#ffffff", cfg.gradient.color2) < MIN_CONTRAST)
      out.push({ key: "gradient", level: "warn", message: "สีที่ 2 ของไล่สีอ่อนเกินไป ตัวหนังสือขาวด้านนั้นอ่านยาก", fixable: true });
  }
  if (cfg.background.image && cfg.background.where === "page" && !cfg.background.veil && cfg.background.opacity > VEIL_MAX_OPACITY)
    out.push({ key: "bg-veil", level: "warn", message: `รูปพื้นหลังชัดเกิน ${VEIL_MAX_OPACITY}% และปิดตัวกันอ่านยากอยู่`, fixable: true });
  if (cfg.typography.baseSize < 13) out.push({ key: "font-small", level: "info", message: "ตัวอักษรเล็กกว่า 13px อาจอ่านยากบนมือถือ", fixable: false });
  return out;
}

function darkenUntil(color: string, ok: (h: string) => boolean): string {
  let c = color;
  for (let i = 0; i < 40 && !ok(c); i++) {
    const [r, g, b] = hexToChannels(c).split(" ").map(Number);
    const h = (v: number) => Math.max(0, Math.round(v * 0.94)).toString(16).padStart(2, "0");
    c = `#${h(r)}${h(g)}${h(b)}`;
  }
  return c;
}

/** แก้สีอ่านยากให้อัตโนมัติ (เข้มขึ้นทีละนิดจนผ่าน) — คืนค่าใหม่ ไม่แก้ของเดิม */
export function autoFixContrast(cfg: ErpThemeConfig): ErpThemeConfig {
  const next: ErpThemeConfig = JSON.parse(JSON.stringify(cfg));
  const okBtn = (base: string) => contrastRatio("#ffffff", scaleOf(base)[600]) >= MIN_CONTRAST;
  if (!okBtn(next.colors.primary)) next.colors.primary = darkenUntil(next.colors.primary, okBtn);
  if (!okBtn(next.colors.accent)) next.colors.accent = darkenUntil(next.colors.accent, okBtn);
  const okRaw = (h: string) => contrastRatio("#ffffff", h) >= MIN_CONTRAST;
  if ((next.gradient.spots.top || next.gradient.spots.banner || next.gradient.spots.button) && !okRaw(next.gradient.color2))
    next.gradient.color2 = darkenUntil(next.gradient.color2, okRaw);
  if (next.background.image && next.background.where === "page" && next.background.opacity > VEIL_MAX_OPACITY) next.background.veil = true;
  return next;
}

/** ความชัดของรูปพื้นหลังที่ใช้จริง (ตัวกันอ่านยาก) */
export function effectiveBgOpacity(cfg: ErpThemeConfig): number {
  const b = cfg.background;
  return b.veil && b.where === "page" ? Math.min(b.opacity, VEIL_MAX_OPACITY) : b.opacity;
}

/** โหมดเบาบนมือถือ: ไม่เบลอ รูปจางลง ปิดแสงวิ่ง/มาสคอต/ไล่สีขยับ */
export function mobileLiteConfig(cfg: ErpThemeConfig): ErpThemeConfig {
  const n: ErpThemeConfig = JSON.parse(JSON.stringify(cfg));
  n.background.blur = 0;
  n.background.opacity = Math.round(n.background.opacity * 0.6);
  n.gradient.animate = false;
  n.animation.shine = false;
  n.animation.mascot = false;
  return n;
}

export const DENSITY_SCALE: Record<Density, { rowPad: number; gap: number }> = {
  compact: { rowPad: 4, gap: 8 },
  normal: { rowPad: 8, gap: 12 },
  spacious: { rowPad: 12, gap: 16 },
};
export const SPEED_FACTOR: Record<AnimSpeed, number> = { slow: 1.6, normal: 1, fast: 0.6 };

/** ตัวแปร CSS ทั้งชุดของธีม (สี --tm-primary/accent-* ใช้ได้แล้วทั้งระบบ · ที่เหลือเตรียมให้เฟส 3–5) */
export function themeCssVars(cfg: ErpThemeConfig): Record<string, string> {
  const font = FONT_OPTIONS.find((f) => f.key === cfg.typography.font) ?? FONT_OPTIONS[0];
  const d = DENSITY_SCALE[cfg.density];
  return {
    ...themeVars({ primary: scaleOf(cfg.colors.primary), accent: scaleOf(cfg.colors.accent) }),
    "--tm-gradient": `linear-gradient(${cfg.gradient.angle}deg, ${scaleOf(cfg.colors.primary)[600]}, ${cfg.gradient.color2})`,
    "--tm-radius": `${cfg.shape.radius}px`,
    "--tm-font": font.family,
    "--tm-font-size": `${cfg.typography.baseSize}px`,
    "--tm-heading-weight": String(cfg.typography.headingWeight),
    "--tm-row-pad": `${d.rowPad}px`,
    "--tm-gap": `${d.gap}px`,
    "--tm-speed": String(SPEED_FACTOR[cfg.animation.speed]),
  };
}

// ── ดูดสีจากรูป ───────────────────────────────────────────
function hsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/**
 * ดูดสีจากพิกเซลรูป (RGBA เรียงกัน แบบ ImageData.data) → สีหลัก + สีเน้น + สีที่ 2 ของไล่สี
 * เลือกสีที่สด (ไม่เทา/ไม่ขาว/ไม่ดำ) และเจอบ่อย · สีเน้น = สีบ่อยรองที่โทนต่างจากสีหลัก
 */
export function paletteFromPixels(data: ArrayLike<number>): { primary: string; accent: string; color2: string } | null {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number; h: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [h, s, l] = hsl(r, g, b);
    if (s < 0.25 || l < 0.15 || l > 0.85) continue;
    const k = `${r >> 4},${g >> 4},${b >> 4}`;
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0, h };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(k, e);
  }
  const list = [...buckets.values()].sort((x, y) => y.n - x.n);
  if (!list.length) return null;
  const avg = (e: { n: number; r: number; g: number; b: number }) => toHex(e.r / e.n, e.g / e.n, e.b / e.n);
  const first = list[0];
  const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const second = list.find((e) => hueGap(e.h, first.h) >= 40) ?? list[1] ?? first;
  const third = list.find((e) => e !== first && e !== second && hueGap(e.h, first.h) >= 20) ?? second;
  return { primary: avg(first), accent: avg(second), color2: avg(third) };
}

// ── ธีมสำเร็จรูป ─────────────────────────────────────────
export type ThemePreset = { key: string; name: string; description: string; patch: Record<string, unknown> };

export const THEME_PRESETS: ThemePreset[] = [
  { key: "classic-orange", name: "ส้มคลาสสิก", description: "หน้าตาเดิมของระบบ", patch: {} },
  {
    key: "ocean", name: "น้ำทะเล", description: "ฟ้าอมเขียว สบายตา · แถบบนไล่สี",
    patch: { colors: { primary: "#0e7490", accent: "#0284c7" }, gradient: { color2: "#0891b2", angle: 90, spots: { top: true } }, shape: { radius: 10 }, animation: { enter: true, hover: true } },
  },
  {
    key: "creative-violet", name: "ม่วงครีเอทีฟ", description: "ม่วงชมพู ขอบมน มีแสงวิ่งบนปุ่ม",
    patch: { colors: { primary: "#7c3aed", accent: "#db2777" }, gradient: { color2: "#be185d", angle: 120, spots: { top: true, button: true, sidebar: true }, animate: true }, shape: { radius: 14 }, animation: { enter: true, hover: true, shine: true, countUp: true }, components: { tabs: "pill", badge: "soft" } },
  },
  {
    key: "factory-green", name: "เขียวโรงงาน", description: "เขียวเข้ม เหลี่ยม แน่น เหมาะงานผลิต",
    patch: { colors: { primary: "#15803d", accent: "#65a30d" }, shape: { radius: 4, shadow: "none" }, density: "compact", components: { table: "lines", sidebar: "dark" } },
  },
  {
    key: "luxury-black", name: "ดำหรู", description: "ทอง-ดำ เมนูข้างเข้ม ตัวอักษร Prompt",
    patch: { colors: { primary: "#a16207", accent: "#78716c" }, gradient: { color2: "#1c1917", angle: 135, spots: { top: true } }, shape: { radius: 2 }, typography: { font: "prompt" }, components: { sidebar: "dark", button: "solid" } },
  },
  {
    key: "sakura", name: "ซากุระ", description: "ชมพูอ่อนหวาน ไล่สีที่แบนเนอร์",
    patch: { colors: { primary: "#db2777", accent: "#e11d48" }, gradient: { color2: "#9d174d", angle: 90, spots: { banner: true } }, shape: { radius: 12 }, animation: { enter: true, hover: true }, components: { badge: "soft", tabs: "pill" } },
  },
  {
    key: "midnight-blue", name: "น้ำเงินเที่ยงคืน", description: "น้ำเงินเข้ม จริงจัง เหมาะงานบัญชี",
    patch: { colors: { primary: "#1d4ed8", accent: "#4f46e5" }, gradient: { color2: "#1e3a8a", angle: 90, spots: { top: true, sidebar: true } }, shape: { radius: 6 }, components: { sidebar: "brand", table: "zebra" } },
  },
  {
    key: "festive", name: "เทศกาล", description: "แดงทอง สำหรับช่วงปีใหม่/ตรุษจีน · แอนิเมชันครบ",
    patch: { colors: { primary: "#b91c1c", accent: "#ca8a04" }, gradient: { color2: "#a16207", angle: 90, spots: { top: true, banner: true, button: true }, animate: true }, shape: { radius: 10 }, animation: { enter: true, hover: true, shine: true, countUp: true } },
  },
];

export function presetConfig(presetKey: string | null | undefined): ErpThemeConfig {
  const p = THEME_PRESETS.find((x) => x.key === presetKey);
  return p ? mergeThemeConfig(DEFAULT_THEME_CONFIG, p.patch) : DEFAULT_THEME_CONFIG;
}
