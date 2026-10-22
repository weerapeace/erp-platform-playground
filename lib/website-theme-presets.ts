/**
 * 🎨 ธีมทั้งชุด (กดครั้งเดียว) — เปลี่ยน สี · ฟอนต์ · ความมน · ปุ่ม · การ์ดสินค้า · หัวเว็บ · การเปลี่ยนหน้า พร้อมกัน
 * ไม่แตะเนื้อหา (โลโก้ เมนู ท้ายเว็บ หน้าสินค้า รูปแทรก ฯลฯ) · กดแล้วปรับต่อได้ทุกค่า · ย้อนกลับได้ (↶) ก่อนบันทึก
 * ใช้ที่: แท็บ "สี" ในหน้าดีไซน์เว็บ (components/website-theme-panel.tsx)
 */
import { FINE_COLOR_DEFAULTS, type SiteTheme } from "@/lib/website-theme";

/** สีหลัก 6 ตัวของชุดสำเร็จรูป (สีละเอียดกลับเป็นค่าเริ่มต้นเมื่อใช้ธีมทั้งชุด) */
export type BaseColors = Pick<SiteTheme["colors"], "brand" | "brandDeep" | "ink" | "page" | "surface" | "muted">;

export interface FullThemePreset {
  key: string;
  label: string;
  hint: string;
  colors: BaseColors;
  /** ฟอนต์ไทย (ฟอนต์อังกฤษแยกถูกล้างเป็น "ใช้ฟอนต์เดียวกัน" ตอนกดใช้ชุด) */
  fonts: Pick<SiteTheme["fonts"], "display" | "body">;
  radius: SiteTheme["radius"];
  shape: Partial<SiteTheme["shape"]>;
  card: Partial<SiteTheme["card"]>;
  header: Partial<SiteTheme["header"]>;
  page: Partial<SiteTheme["page"]>;
}

export const FULL_THEME_PRESETS: FullThemePreset[] = [
  {
    key: "luxury",
    label: "หรูเรียบ",
    hint: "ดำ-ครีม · หัวข้อตัวมีเชิง · ปุ่มเหลี่ยม · การ์ดเรียบ รูปแนวตั้ง",
    colors: { brand: "#1A1A1A", brandDeep: "#000000", ink: "#161616", page: "#F7F4EF", surface: "#FFFFFF", muted: "#8E8A83" },
    fonts: { display: "Noto Serif Thai", body: "IBM Plex Sans Thai" },
    radius: "sharp",
    shape: { button: "square", shadow: "none", borderWidth: 1 },
    card: { preset: "minimal", hover: "swap", imageRatio: "3:4", nameWeight: 400 },
    header: { bg: "page", bgKind: "preset", border: false },
    page: { transition: "rise" },
  },
  {
    key: "editorial",
    label: "นิตยสาร",
    hint: "ขาวสะอาด · หัวข้อใหญ่ตัวมีเชิง · สีไวน์ · รูปเต็ม ซูมเมื่อชี้",
    colors: { brand: "#8C2F2B", brandDeep: "#6B2320", ink: "#111111", page: "#FFFFFF", surface: "#FAF8F6", muted: "#9A9A9A" },
    fonts: { display: "Trirong", body: "Sarabun" },
    radius: "sharp",
    shape: { button: "square", shadow: "none", borderWidth: 1 },
    card: { preset: "flat", hover: "zoom", imageRatio: "4:5", nameWeight: 500 },
    header: { bg: "surface", bgKind: "preset", border: true },
    page: { transition: "fade" },
  },
  {
    key: "street",
    label: "สตรีท",
    hint: "สีสด ตัวหนา · ปุ่มแคปซูล · การ์ดมีเงา ยกตัว+เปลี่ยนรูป",
    colors: { brand: "#FF3B30", brandDeep: "#D12A20", ink: "#0E0E0E", page: "#FFFFFF", surface: "#F4F4F4", muted: "#8A8A8A" },
    fonts: { display: "Kanit", body: "Prompt" },
    radius: "round",
    shape: { button: "pill", shadow: "soft", borderWidth: 2 },
    card: { preset: "shadow", hover: "lift-swap", imageRatio: "1:1", nameWeight: 600 },
    header: { bg: "page", bgKind: "preset", border: true },
    page: { transition: "rise" },
  },
  {
    key: "soft",
    label: "อ่อนโยน",
    hint: "โทนชมพู-เบจ · ตัวกลมมน · การ์ดลอย ขอบมน",
    colors: { brand: "#C97B84", brandDeep: "#A35E67", ink: "#3B2F2F", page: "#FBF6F3", surface: "#FFFFFF", muted: "#A8988F" },
    fonts: { display: "Mitr", body: "Anuphan" },
    radius: "round",
    shape: { button: "pill", shadow: "soft", borderWidth: 1 },
    card: { preset: "floating", hover: "lift", imageRatio: "4:5", nameWeight: 500 },
    header: { bg: "page", bgKind: "preset", border: false },
    page: { transition: "fade" },
  },
];

/** ใส่ธีมทั้งชุดลงธีมปัจจุบัน — แทนเฉพาะค่าหน้าตา (สี/ฟอนต์/ปุ่ม/การ์ด/หัวเว็บ/การเปลี่ยนหน้า) */
export function applyFullPreset<T extends Pick<SiteTheme, "colors" | "fonts" | "radius" | "shape" | "card" | "header" | "page">>(t: T, p: FullThemePreset): T {
  return {
    ...t,
    colors: { ...t.colors, ...FINE_COLOR_DEFAULTS, ...p.colors },
    fonts: { ...t.fonts, displayLatin: "", bodyLatin: "", ...p.fonts },
    radius: p.radius,
    shape: { ...t.shape, ...p.shape },
    card: { ...t.card, ...p.card },
    header: { ...t.header, ...p.header },
    page: { ...t.page, ...p.page },
  };
}
