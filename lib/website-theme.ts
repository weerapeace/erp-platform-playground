/**
 * ของกลาง — ธีมเว็บร้านออนไลน์ (เก็บที่ shops.theme)
 *
 * ⚠️ ร้าน Pixiedustie มีค่าเดิมอยู่แล้ว (`vars`, `colors.panel` ฯลฯ ที่เว็บของเขาใช้)
 *    ทุกฟังก์ชันในไฟล์นี้จึง "merge" เท่านั้น — ไม่ลบคีย์ที่เราไม่รู้จัก
 *
 * ใช้ที่: /api/website/theme (ตั้งค่า) · /api/public/storefront/site (ส่งให้เว็บ) · UI แท็บดีไซน์
 */

export interface SiteTheme {
  colors: {
    brand: string;      // สีหลักแบรนด์ (ปุ่ม/ไฮไลต์)
    brandDeep: string;  // สีหลักเข้ม (ตอนชี้เมาส์)
    ink: string;        // สีตัวอักษรหลัก
    page: string;       // สีพื้นหลังเว็บ
    surface: string;    // สีพื้นการ์ด/กล่อง
    muted: string;      // สีตัวอักษรรอง
  };
  fonts: {
    display: string; // ฟอนต์หัวข้อ
    body: string;    // ฟอนต์เนื้อหา
  };
  /** ความมนของขอบทั้งเว็บ */
  radius: "sharp" | "soft" | "round";
  logo: {
    /** ตัวอักษรในกล่องโลโก้ เช่น "IG" */
    mark: string;
    /** ข้อความต่อท้าย เช่น "International" */
    text: string;
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
  logo: { mark: "IG", text: "International" },
};

/** ฟอนต์ที่เลือกได้ (ต้องมีใน next/font ฝั่งเว็บด้วย) */
export const FONT_CHOICES = ["Kanit", "Noto Sans Thai", "Prompt", "Sarabun", "IBM Plex Sans Thai"];

export const RADIUS_CHOICES: { value: SiteTheme["radius"]; label: string }[] = [
  { value: "sharp", label: "เหลี่ยม (คม)" },
  { value: "soft", label: "มนเล็กน้อย" },
  { value: "round", label: "มนมาก" },
];

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const color = (v: unknown, fallback: string) =>
  typeof v === "string" && HEX.test(v.trim()) ? v.trim() : fallback;
const text = (v: unknown, fallback: string, max = 40) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;

/** อ่านค่าจาก DB ให้เป็น SiteTheme ที่ครบเสมอ (คีย์อื่นของร้านเดิมไม่ถูกแตะ) */
export function normalizeTheme(raw: unknown): SiteTheme {
  const r = (raw ?? {}) as Record<string, Record<string, unknown> | string | undefined>;
  const c = (r.colors ?? {}) as Record<string, unknown>;
  const f = (r.fonts ?? {}) as Record<string, unknown>;
  const l = (r.logo ?? {}) as Record<string, unknown>;
  const d = DEFAULT_THEME;

  const radiusRaw = typeof r.radius === "string" ? r.radius : "";
  const radius = (["sharp", "soft", "round"] as const).includes(radiusRaw as SiteTheme["radius"])
    ? (radiusRaw as SiteTheme["radius"])
    : d.radius;

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
    radius,
    logo: {
      mark: text(l.mark, d.logo.mark, 4),
      text: text(l.text, d.logo.text, 40),
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
  };
}
