/**
 * Brand Theme — ระบบกลางตั้งค่าหน้าตาต่อแบรนด์ (ไม่ hardcode ตามชื่อแบรนด์)
 *
 * BrandTheme = config ของธีม (เก็บใน brand_themes.draft_config/published_config เป็น jsonb)
 * themeToCssVars(theme) → object สำหรับ style={{...}} ใส่ตัวแปร --brand-* ให้หน้าใด ๆ อ่านไปใช้
 *
 * หน้า dashboard ไม่ต้องรู้ว่าแบรนด์อะไร — แค่รับ theme object แล้ว apply ตัวแปร
 * รูป (พื้นหลัง/ไอคอน) เก็บเป็น R2 key → ใช้ /api/r2-image?key=...&w= ตอนแสดง (lib/r2-image)
 */
import type { CSSProperties } from "react";
import { withImageWidth } from "@/lib/r2-image";

export type BrandTheme = {
  theme_name?: string;
  // พื้นหลัง
  background_color: string;
  background_image_key?: string | null;   // R2 key (โหลดผ่าน ?w=)
  background_overlay_color: string;        // สีทับรูปพื้นหลัง (เช่น rgba ขาว/ดำโปร่ง)
  background_opacity: number;              // 0..1 ความเข้มของ overlay
  // สีหลัก
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  // ตัวอักษร
  heading_text_color: string;
  body_text_color: string;
  muted_text_color: string;
  // การ์ด
  card_background_color: string;
  card_border_color: string;
  card_shadow_style: string;               // ค่าของ box-shadow
  card_radius: string;                     // เช่น "12px"
  // ปุ่ม
  button_primary_bg: string;
  button_primary_text: string;
  button_secondary_bg: string;
  button_secondary_text: string;
  // ไอคอน (รูปอัปเอง — R2 key) ใช้บนการ์ดสถิติ/คอลัมน์ ถ้าไม่มี = ไม่โชว์
  stat_icon_image_key?: string | null;
  card_icon_image_key?: string | null;
  // อื่น ๆ
  kanban_header_style?: "soft" | "solid" | "line";
  workflow_line_color: string;
  custom_css_variables?: Record<string, string>;   // ตัวแปรเพิ่มเองอิสระ
  // Component Slots — รูปตกแต่งตามตำแหน่งที่ระบบกำหนด (slotId → R2 key) + ซ่อนราย slot
  slots?: Record<string, string | null>;
  slotHidden?: Record<string, boolean>;
  // ปรับแต่งต่อ slot — ขนาด (scale 0.5–1.5) + ความเข้ม (opacity 0–1)
  slotOpts?: Record<string, { scale?: number; opacity?: number }>;
};

// ── Component Slot Registry — นิยาม slot ตกแต่ง (ตำแหน่ง/ขนาด/responsive ที่ระบบคุม ไม่ freeform) ──
export type SlotKind = "deco" | "icon" | "illustration";
export type SlotGroup = "page" | "header" | "sidebar" | "stat" | "task" | "audit";
export type SlotDef = {
  id: string; group: SlotGroup; label: string; kind: SlotKind;
  w: 96 | 160 | 256 | 320;
  pos: string; size: string; hideOnMobile?: boolean;
};

export const SLOT_REGISTRY: SlotDef[] = [
  { id: "page_tl", group: "page", label: "ตกแต่งมุมซ้ายบน", kind: "deco", w: 256, pos: "absolute top-0 left-0", size: "w-28 lg:w-44", hideOnMobile: true },
  { id: "page_tr", group: "page", label: "ตกแต่งมุมขวาบน", kind: "deco", w: 256, pos: "absolute top-0 right-0", size: "w-28 lg:w-44", hideOnMobile: true },
  { id: "page_bl", group: "page", label: "ตกแต่งมุมซ้ายล่าง", kind: "deco", w: 256, pos: "absolute bottom-0 left-0", size: "w-28 lg:w-44", hideOnMobile: true },
  { id: "page_br", group: "page", label: "ตกแต่ง/illustration มุมขวาล่าง", kind: "illustration", w: 320, pos: "absolute bottom-0 right-0", size: "w-36 lg:w-60", hideOnMobile: true },
  { id: "header_left", group: "header", label: "Mascot ซ้าย (หัวหน้า)", kind: "deco", w: 160, pos: "", size: "h-12 lg:h-16" },
  { id: "header_right", group: "header", label: "Mascot ขวา (หัวหน้า)", kind: "deco", w: 160, pos: "", size: "h-12 lg:h-16", hideOnMobile: true },
  { id: "stat_icon_0", group: "stat", label: "ไอคอน: งานทั้งหมด", kind: "icon", w: 96, pos: "absolute top-2 right-2", size: "w-7 h-7" },
  { id: "stat_icon_1", group: "stat", label: "ไอคอน: กำลังเดินงาน", kind: "icon", w: 96, pos: "absolute top-2 right-2", size: "w-7 h-7" },
  { id: "stat_icon_2", group: "stat", label: "ไอคอน: ใกล้ครบกำหนด", kind: "icon", w: 96, pos: "absolute top-2 right-2", size: "w-7 h-7" },
  { id: "stat_icon_3", group: "stat", label: "ไอคอน: ปิดงานแล้ว", kind: "icon", w: 96, pos: "absolute top-2 right-2", size: "w-7 h-7" },
  { id: "task_corner", group: "task", label: "ตกแต่งมุมการ์ดงาน", kind: "icon", w: 96, pos: "absolute top-1 right-1", size: "w-6 h-6", hideOnMobile: true },
  { id: "task_placeholder", group: "task", label: "รูปแทนการ์ดที่ไม่มีรูป", kind: "icon", w: 160, pos: "", size: "" },
  { id: "page_empty", group: "page", label: "รูปตอนไม่มีงาน (empty)", kind: "illustration", w: 320, pos: "", size: "w-40" },
  { id: "sidebar_top", group: "sidebar", label: "รูปบนหัวแถบแบรนด์ (banner)", kind: "deco", w: 320, pos: "", size: "mx-auto mb-2 h-16 w-auto" },
  { id: "sidebar_bottom", group: "sidebar", label: "รูปท้ายแถบแบรนด์", kind: "deco", w: 256, pos: "", size: "mx-auto mt-3 h-12 w-auto" },
  { id: "audit_badge", group: "audit", label: "ไอคอน/Mascot แผงประวัติ", kind: "icon", w: 96, pos: "", size: "h-10 w-10" },
];

// อ่าน R2 key ของ slot (เคารพ slotHidden) · ไอคอนสถานะ workflow → `wf_icon:<statusKey>`
export function slotKey(theme: Partial<BrandTheme> | null | undefined, id: string): string | null {
  if (!theme?.slots || theme.slotHidden?.[id]) return null;
  return theme.slots[id] ?? null;
}
export const wfIconSlotId = (statusKey: string) => `wf_icon:${statusKey}`;

// สไตล์ปรับแต่งต่อ slot (ขนาด/ความเข้ม) → ใช้ transform scale + opacity · origin อิงตำแหน่ง slot
export function slotStyle(theme: Partial<BrandTheme> | null | undefined, id: string): CSSProperties | undefined {
  const o = theme?.slotOpts?.[id];
  if (!o) return undefined;
  const scale = o.scale ?? 1;
  const opacity = o.opacity ?? 1;
  if (scale === 1 && opacity === 1) return undefined;
  const pos = SLOT_REGISTRY.find((d) => d.id === id)?.pos ?? "";
  const ox = pos.includes("left") ? "left" : pos.includes("right") ? "right" : "center";
  const oy = pos.includes("top") ? "top" : pos.includes("bottom") ? "bottom" : "center";
  const style: CSSProperties = {};
  if (opacity !== 1) style.opacity = opacity;
  if (scale !== 1) { style.transform = `scale(${scale})`; style.transformOrigin = `${oy} ${ox}`; }
  return style;
}

// ธีมเริ่มต้นของ ERP (ใช้เมื่อเลือก "ทั้งหมด" หรือแบรนด์ยังไม่มีธีม) — โทนสว่างมาตรฐาน slate/blue
export const DEFAULT_THEME: BrandTheme = {
  theme_name: "ERP Default",
  background_color: "#f8fafc",
  background_image_key: null,
  background_overlay_color: "#ffffff",
  background_opacity: 0,
  primary_color: "#2563eb",
  secondary_color: "#0ea5e9",
  accent_color: "#f59e0b",
  heading_text_color: "#1e293b",
  body_text_color: "#475569",
  muted_text_color: "#94a3b8",
  card_background_color: "#ffffff",
  card_border_color: "#e2e8f0",
  card_shadow_style: "0 1px 2px rgba(15,23,42,0.06)",
  card_radius: "12px",
  button_primary_bg: "#2563eb",
  button_primary_text: "#ffffff",
  button_secondary_bg: "#ffffff",
  button_secondary_text: "#475569",
  stat_icon_image_key: null,
  card_icon_image_key: null,
  kanban_header_style: "soft",
  workflow_line_color: "#cbd5e1",
  custom_css_variables: {},
};

// รวม config บางส่วนทับ default → ได้ธีมเต็มที่ใช้งานได้เสมอ (กัน field หาย)
export function resolveTheme(config: Partial<BrandTheme> | null | undefined): BrandTheme {
  return { ...DEFAULT_THEME, ...(config ?? {}) };
}

// แปลงธีม → CSS variables (--brand-*) สำหรับ style={{...}} ครอบ container
export function themeToCssVars(config: Partial<BrandTheme> | null | undefined): CSSProperties {
  const t = resolveTheme(config);
  const vars: Record<string, string> = {
    "--brand-bg": t.background_color,
    "--brand-bg-overlay": t.background_overlay_color,
    "--brand-bg-opacity": String(t.background_opacity),
    "--brand-primary": t.primary_color,
    "--brand-secondary": t.secondary_color,
    "--brand-accent": t.accent_color,
    "--brand-heading": t.heading_text_color,
    "--brand-text": t.body_text_color,
    "--brand-muted": t.muted_text_color,
    "--brand-card-bg": t.card_background_color,
    "--brand-card-border": t.card_border_color,
    "--brand-card-shadow": t.card_shadow_style,
    "--brand-card-radius": t.card_radius,
    "--brand-btn-bg": t.button_primary_bg,
    "--brand-btn-text": t.button_primary_text,
    "--brand-btn2-bg": t.button_secondary_bg,
    "--brand-btn2-text": t.button_secondary_text,
    "--brand-wf-line": t.workflow_line_color,
  };
  for (const [k, v] of Object.entries(t.custom_css_variables ?? {})) {
    if (/^--[a-z0-9-]+$/i.test(k) && typeof v === "string") vars[k] = v;
  }
  return vars as CSSProperties;
}

// URL รูปพื้นหลัง (ย่อขนาดตาม viewport) — ห้ามโหลด original
export function brandBgUrl(key: string | null | undefined, w: 1600 | 900 | 640 = 1600): string | null {
  if (!key) return null;
  return withImageWidth(`/api/r2-image?key=${encodeURIComponent(key)}`, w);
}
export function brandIconUrl(key: string | null | undefined, w: 96 | 160 = 96): string | null {
  if (!key) return null;
  return withImageWidth(`/api/r2-image?key=${encodeURIComponent(key)}`, w);
}

// hex (#rgb/#rrggbb) + alpha → rgba(...) · ถ้าไม่ใช่ hex คืนค่าเดิม (รองรับ rgba อยู่แล้ว)
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return hex || `rgba(0,0,0,${alpha})`;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}

// ── Preset สำเร็จรูป (ค่าเริ่มต้นให้เลือกแล้วปรับต่อ — ไม่ผูกแบรนด์) ──
export type ThemePreset = { key: string; label: string; theme: BrandTheme };
const mk = (label: string, over: Partial<BrandTheme>): BrandTheme => ({ ...DEFAULT_THEME, theme_name: label, ...over });

export const THEME_PRESETS: ThemePreset[] = [
  { key: "clean_saas", label: "Clean SaaS", theme: mk("Clean SaaS", {}) },
  { key: "luxury_navy", label: "Luxury Navy", theme: mk("Luxury Navy", {
      background_color: "#f5f7fb", primary_color: "#0e2742", secondary_color: "#7890aa", accent_color: "#b8c3cf",
      heading_text_color: "#0e2742", body_text_color: "#66758a", muted_text_color: "#9aa7b6",
      card_background_color: "#ffffff", card_border_color: "#dfe6ed", card_shadow_style: "0 18px 42px rgba(13,32,54,0.08)",
      button_primary_bg: "#0e2742", button_primary_text: "#ffffff", button_secondary_bg: "#ffffff", button_secondary_text: "#0e2742",
      workflow_line_color: "#b8c3cf", kanban_header_style: "soft" }) },
  { key: "soft_pink", label: "Soft Pink", theme: mk("Soft Pink", {
      background_color: "#fff5f7", primary_color: "#db2777", secondary_color: "#f472b6", accent_color: "#f59e0b",
      heading_text_color: "#831843", body_text_color: "#9d4e6c", muted_text_color: "#c98aa6",
      card_border_color: "#fbcfe8", workflow_line_color: "#f9a8d4", button_primary_bg: "#db2777", button_primary_text: "#ffffff" }) },
  { key: "cute_mascot", label: "Cute Mascot", theme: mk("Cute Mascot", {
      background_color: "#fffdf5", primary_color: "#fb7185", secondary_color: "#fcd34d", accent_color: "#34d399",
      heading_text_color: "#7c2d12", body_text_color: "#9a6a4a", muted_text_color: "#c4a484",
      card_background_color: "#ffffff", card_border_color: "#fde68a", card_radius: "18px", card_shadow_style: "0 8px 20px rgba(251,113,133,0.12)",
      workflow_line_color: "#fcd34d", button_primary_bg: "#fb7185", button_primary_text: "#ffffff" }) },
  { key: "minimal_gray", label: "Minimal Gray", theme: mk("Minimal Gray", {
      background_color: "#fafafa", primary_color: "#404040", secondary_color: "#737373", accent_color: "#525252",
      heading_text_color: "#262626", body_text_color: "#525252", muted_text_color: "#a3a3a3",
      card_border_color: "#e5e5e5", card_shadow_style: "none", workflow_line_color: "#d4d4d4",
      button_primary_bg: "#262626", button_primary_text: "#ffffff" }) },
  { key: "bold_brand", label: "Bold Brand", theme: mk("Bold Brand", {
      background_color: "#fef3c7", primary_color: "#ea580c", secondary_color: "#f97316", accent_color: "#7c3aed",
      heading_text_color: "#7c2d12", body_text_color: "#9a3412", muted_text_color: "#c2853f",
      card_border_color: "#fed7aa", workflow_line_color: "#fdba74", button_primary_bg: "#ea580c", button_primary_text: "#ffffff" }) },
  { key: "photo_bg", label: "Photo Background", theme: mk("Photo Background", {
      background_color: "#1e293b", background_overlay_color: "#0f172a", background_opacity: 0.45,
      primary_color: "#38bdf8", secondary_color: "#818cf8", accent_color: "#fbbf24",
      heading_text_color: "#f8fafc", body_text_color: "#e2e8f0", muted_text_color: "#cbd5e1",
      card_background_color: "rgba(255,255,255,0.92)", card_border_color: "rgba(255,255,255,0.6)",
      workflow_line_color: "#64748b", button_primary_bg: "#38bdf8", button_primary_text: "#0f172a" }) },
  { key: "dark_premium", label: "Dark Premium", theme: mk("Dark Premium", {
      background_color: "#0b1220", background_overlay_color: "#0b1220", background_opacity: 0,
      primary_color: "#6366f1", secondary_color: "#a78bfa", accent_color: "#22d3ee",
      heading_text_color: "#f1f5f9", body_text_color: "#cbd5e1", muted_text_color: "#94a3b8",
      card_background_color: "#111a2e", card_border_color: "#1e2a44", card_shadow_style: "0 10px 30px rgba(0,0,0,0.4)",
      workflow_line_color: "#334155", button_primary_bg: "#6366f1", button_primary_text: "#ffffff",
      button_secondary_bg: "#1e2a44", button_secondary_text: "#e2e8f0" }) },
];

// ── Validation: ตรวจสีถูกต้อง + ความอ่านง่าย (contrast) ──
export function isValidColor(v: string): boolean {
  if (!v) return false;
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim()) || /^rg(b|ba)\(/i.test(v.trim());
}
// relative luminance (เฉพาะ hex) — ใช้เตือน contrast
function lum(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrastRatio(a: string, b: string): number | null {
  const la = lum(a), lb = lum(b);
  if (la == null || lb == null) return null;
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
// คืนรายการเตือน (อ่านยาก/สีผิด) สำหรับ Builder
export function themeWarnings(t: BrandTheme): string[] {
  const w: string[] = [];
  const cr = contrastRatio(t.button_primary_text, t.button_primary_bg);
  if (cr != null && cr < 3) w.push("ปุ่มหลัก: สีตัวอักษรกับพื้นปุ่มอ่านยาก (contrast ต่ำ)");
  const cb = contrastRatio(t.body_text_color, t.card_background_color);
  if (cb != null && cb < 3) w.push("ตัวอักษรในการ์ด: อ่านยากเทียบกับพื้นการ์ด");
  return w;
}
