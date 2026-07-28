/**
 * ของกลาง — ธีมเว็บร้านออนไลน์ (เก็บที่ shops.theme)
 *
 * ⚠️ ร้าน Pixiedustie มีค่าเดิมอยู่แล้ว (`vars`, `colors.panel` ฯลฯ ที่เว็บของเขาใช้)
 *    ทุกฟังก์ชันในไฟล์นี้จึง "merge" เท่านั้น — ไม่ลบคีย์ที่เราไม่รู้จัก
 *
 * ใช้ที่: /api/website/theme (ตั้งค่า) · /api/public/storefront/site (ส่งให้เว็บ) · UI แท็บดีไซน์
 */

export type LogoMode = "icon-text" | "image" | "text" | "icon";
export type HeaderBg = "surface" | "page" | "ink" | "brand" | "transparent";
export type MenuAlign = "left" | "center" | "right";
export type CardPreset = "flat" | "border" | "shadow" | "floating" | "minimal";
export type ImageRatio = "1:1" | "4:3" | "4:5" | "3:4" | "16:9";
export type CardHover = "none" | "lift" | "zoom";

export interface SiteTheme {
  colors: {
    brand: string;
    brandDeep: string;
    ink: string;
    page: string;
    surface: string;
    muted: string;
  };
  fonts: { display: string; body: string };
  radius: "sharp" | "soft" | "round";
  logo: {
    /** ตัวอักษรในกล่องโลโก้ เช่น "IG" */
    mark: string;
    /** ข้อความต่อท้าย เช่น "International" */
    text: string;
    /** รูปแบบการแสดง */
    mode: LogoMode;
    /** ไฟล์โลโก้ (r2 key) — ใช้เมื่อ mode = image */
    imageKey: string | null;
    /** โลโก้สำหรับพื้นหลังเข้ม (เช่น footer) */
    imageDarkKey: string | null;
    /** ไอคอนบนแท็บเบราว์เซอร์ */
    faviconKey: string | null;
    /** ความสูงโลโก้ (px) */
    height: number;
  };
  header: {
    /** ความสูงแถบเมนู (px) */
    height: number;
    /** ตรึงแถบเมนูไว้ด้านบนเมื่อเลื่อน */
    sticky: boolean;
    bg: HeaderBg;
    menuAlign: MenuAlign;
    showCart: boolean;
    /** เส้นคั่นใต้แถบเมนู */
    border: boolean;
  };
  card: {
    preset: CardPreset;
    imageRatio: ImageRatio;
    /** จำนวนบรรทัดของชื่อสินค้า */
    titleLines: number;
    showBadge: boolean;
    showStock: boolean;
    hover: CardHover;
  };
}

export const DEFAULT_THEME: SiteTheme = {
  colors: {
    brand: "#E2540F",
    brandDeep: "#B8420A",
    ink: "#141517",
    page: "#FAFAF9",
    surface: "#FFFFFF",
    muted: "#9BA1A9",
  },
  fonts: { display: "Kanit", body: "Noto Sans Thai" },
  radius: "soft",
  logo: {
    mark: "IG",
    text: "International",
    mode: "icon-text",
    imageKey: null,
    imageDarkKey: null,
    faviconKey: null,
    height: 34,
  },
  header: { height: 72, sticky: true, bg: "page", menuAlign: "center", showCart: true, border: true },
  card: { preset: "flat", imageRatio: "4:5", titleLines: 2, showBadge: true, showStock: true, hover: "lift" },
};

export const FONT_CHOICES = ["Kanit", "Noto Sans Thai", "Prompt", "Sarabun", "IBM Plex Sans Thai"];

export const RADIUS_CHOICES: { value: SiteTheme["radius"]; label: string }[] = [
  { value: "sharp", label: "เหลี่ยม (คม)" },
  { value: "soft", label: "มนเล็กน้อย" },
  { value: "round", label: "มนมาก" },
];

export const LOGO_MODES: { value: LogoMode; label: string }[] = [
  { value: "icon-text", label: "กล่องอักษร + ชื่อ" },
  { value: "image", label: "รูปโลโก้" },
  { value: "text", label: "ชื่อร้านอย่างเดียว" },
  { value: "icon", label: "กล่องอักษรอย่างเดียว" },
];

export const HEADER_BG: { value: HeaderBg; label: string }[] = [
  { value: "page", label: "สีพื้นหลังเว็บ" },
  { value: "surface", label: "สีพื้นการ์ด (ขาว)" },
  { value: "ink", label: "สีเข้ม" },
  { value: "brand", label: "สีแบรนด์" },
  { value: "transparent", label: "โปร่งใส" },
];

export const MENU_ALIGNS: { value: MenuAlign; label: string }[] = [
  { value: "left", label: "ชิดซ้าย" },
  { value: "center", label: "กึ่งกลาง" },
  { value: "right", label: "ชิดขวา" },
];

export const CARD_PRESETS: { value: CardPreset; label: string; hint: string }[] = [
  { value: "flat", label: "เรียบ", hint: "ไม่มีกรอบ ไม่มีเงา" },
  { value: "border", label: "มีกรอบ", hint: "เส้นขอบบาง" },
  { value: "shadow", label: "เงานุ่ม", hint: "เงาอ่อน ๆ" },
  { value: "floating", label: "ลอย", hint: "เงาชัด ดูเด่น" },
  { value: "minimal", label: "มินิมอล", hint: "เฉพาะรูป+ข้อความ" },
];

export const IMAGE_RATIOS: { value: ImageRatio; label: string }[] = [
  { value: "1:1", label: "จัตุรัส 1:1" },
  { value: "4:3", label: "แนวนอน 4:3" },
  { value: "4:5", label: "แนวตั้ง 4:5" },
  { value: "3:4", label: "แนวตั้ง 3:4" },
  { value: "16:9", label: "กว้าง 16:9" },
];

export const CARD_HOVERS: { value: CardHover; label: string }[] = [
  { value: "none", label: "ไม่มี" },
  { value: "lift", label: "ยกขึ้นเล็กน้อย" },
  { value: "zoom", label: "ซูมรูป" },
];

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const R2_KEY = /^[a-zA-Z0-9._/-]+$/;

const color = (v: unknown, fallback: string) =>
  typeof v === "string" && HEX.test(v.trim()) ? v.trim() : fallback;
const text = (v: unknown, fallback: string, max = 40) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;
const key = (v: unknown): string | null =>
  typeof v === "string" && v.trim() && R2_KEY.test(v.trim()) ? v.trim().slice(0, 300) : null;
const num = (v: unknown, fb: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fb;
};
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/** อ่านค่าที่เก็บใน DB ให้เป็น SiteTheme ที่ครบถ้วนเสมอ (กันข้อมูลเก่า/ไม่ครบ) */
export function normalizeTheme(raw: unknown): SiteTheme {
  const r = (raw ?? {}) as Record<string, unknown>;
  const c = (r.colors ?? {}) as Record<string, unknown>;
  const f = (r.fonts ?? {}) as Record<string, unknown>;
  const l = (r.logo ?? {}) as Record<string, unknown>;
  const h = (r.header ?? {}) as Record<string, unknown>;
  const cd = (r.card ?? {}) as Record<string, unknown>;
  const d = DEFAULT_THEME;

  return {
    colors: {
      brand: color(c.brand, d.colors.brand),
      brandDeep: color(c.brandDeep, d.colors.brandDeep),
      ink: color(c.ink, d.colors.ink),
      page: color(c.page, d.colors.page),
      surface: color(c.surface, d.colors.surface),
      muted: color(c.muted, d.colors.muted),
    },
    fonts: {
      display: text(f.display, d.fonts.display),
      body: text(f.body, d.fonts.body),
    },
    radius: pick(r.radius, ["sharp", "soft", "round"] as const, d.radius),
    logo: {
      mark: text(l.mark, d.logo.mark, 4),
      text: text(l.text, d.logo.text, 40),
      mode: pick(l.mode, ["icon-text", "image", "text", "icon"] as const, d.logo.mode),
      imageKey: key(l.imageKey),
      imageDarkKey: key(l.imageDarkKey),
      faviconKey: key(l.faviconKey),
      height: num(l.height, d.logo.height, 20, 80),
    },
    header: {
      height: num(h.height, d.header.height, 48, 120),
      sticky: h.sticky !== false,
      bg: pick(h.bg, ["surface", "page", "ink", "brand", "transparent"] as const, d.header.bg),
      menuAlign: pick(h.menuAlign, ["left", "center", "right"] as const, d.header.menuAlign),
      showCart: h.showCart !== false,
      border: h.border !== false,
    },
    card: {
      preset: pick(cd.preset, ["flat", "border", "shadow", "floating", "minimal"] as const, d.card.preset),
      imageRatio: pick(cd.imageRatio, ["1:1", "4:3", "4:5", "3:4", "16:9"] as const, d.card.imageRatio),
      titleLines: num(cd.titleLines, d.card.titleLines, 1, 3),
      showBadge: cd.showBadge !== false,
      showStock: cd.showStock !== false,
      hover: pick(cd.hover, ["none", "lift", "zoom"] as const, d.card.hover),
    },
  };
}

/**
 * รวมธีมใหม่เข้ากับค่าเดิมใน DB โดยไม่ลบคีย์ที่เราไม่รู้จัก
 * (สำคัญกับ Pixiedustie ที่มี vars/colors.panel ของตัวเอง)
 */
export function mergeTheme(existing: unknown, incoming: unknown): Record<string, unknown> {
  const base = (existing ?? {}) as Record<string, unknown>;
  const baseColors = (base.colors ?? {}) as Record<string, unknown>;
  const t = normalizeTheme(incoming);

  return {
    ...base,
    colors: { ...baseColors, ...t.colors },
    fonts: t.fonts,
    radius: t.radius,
    logo: t.logo,
    header: t.header,
    card: t.card,
  };
}
