/**
 * 🎨 แต่งหน้าแรก /apps (ของกลาง · pure ห้ามใส่ "use client" — API/เทสต์ import ได้)
 *
 *   ค่ากลางทีม = ui_config key THEME_TEAM_KEY (ขึ้นต้น admin_ → แก้ได้เฉพาะ admin.users · อ่านได้ทุกคนที่ล็อกอิน)
 *   ค่าของฉัน  = user_ui_prefs key THEME_MINE_KEY (/api/user-prefs)
 *   ค่าที่ใช้จริง (resolveLauncherTheme): ค่าเริ่มต้น ← ทีม ← ของฉัน
 *     - พื้นหลัง (สี/ไล่สี/รูป + ความชัด/ตำแหน่ง/ขนาด/ซูม) ไปเป็นชุด: ของฉันตั้งพื้นหลังไว้ = ใช้ชุดของฉันทั้งชุด
 *     - สีหลัก / ฟอนต์ ทีละช่อง · ของตกแต่ง: ของฉันมีรายการ (แม้ว่าง) = ใช้ของฉัน ไม่งั้นตามทีม
 *   ค่าเริ่มต้น = หน้าตาเดิม (รูปพื้นหลังจาง ~8% ตรงกลาง เต็มจอ · ไม่มีของตกแต่ง)
 * ของตกแต่ง: รูป/GIF/PNG/WebP จากคลังไฟล์ ≤ DECOR_MAX ชิ้น · ตำแหน่ง/ขนาดเป็น % ของจอ · ท่าขยับชุดเดียวกับของตกแต่งเว็บร้าน
 * ใช้ที่: app/apps/page.tsx · components/launcher-theme (ชั้นพื้นหลัง + แผงแต่ง)
 */

export const THEME_TEAM_KEY = "admin_launcher_theme";
export const THEME_MINE_KEY = "launcher_theme";
export const DECOR_MAX = 8;
export const LEGACY_BG_OPACITY = 8;

export const BG_POSITIONS = ["left top", "center top", "right top", "left center", "center", "right center", "left bottom", "center bottom", "right bottom"] as const;
export type BgPos = (typeof BG_POSITIONS)[number];
export const BG_POS_LABEL: Record<BgPos, string> = {
  "left top": "ซ้ายบน", "center top": "กลางบน", "right top": "ขวาบน", "left center": "ซ้าย", center: "กลาง",
  "right center": "ขวา", "left bottom": "ซ้ายล่าง", "center bottom": "กลางล่าง", "right bottom": "ขวาล่าง",
};
export const BG_FITS = ["cover", "contain", "tile"] as const;
export type BgFit = (typeof BG_FITS)[number];
export const BG_FIT_LABEL: Record<BgFit, string> = { cover: "เต็มจอ", contain: "พอดีรูป", tile: "ปูซ้ำ" };

/** ท่าขยับ — ชื่อชุดเดียวกับของตกแต่งเว็บร้าน (lib/website-blocks DECOR_ANIMS) */
export const LAUNCHER_DECOR_ANIMS = ["none", "float", "sway", "pulse", "spin", "twinkle", "bounce"] as const;
export type LauncherDecorAnim = (typeof LAUNCHER_DECOR_ANIMS)[number];
export const DECOR_ANIM_LABEL: Record<LauncherDecorAnim, string> = { none: "ไม่ขยับ", float: "ลอย", sway: "ส่าย", pulse: "เต้นตุบ", spin: "หมุน", twinkle: "กะพริบ", bounce: "เด้ง" };

export type LauncherDecor = {
  id: string;
  /** รูปในคลัง (r2 key) — GIF/WebP ขยับในตัวได้ */
  key: string;
  /** จุดกลางของชิ้น — % ของกว้าง/สูงจอ */
  x: number;
  y: number;
  /** กว้าง % ของจอ */
  w: number;
  rotate: number;
  /** ความชัด % */
  opacity: number;
  anim: LauncherDecorAnim;
  /** true = อยู่หน้าการ์ดแอป (กดทะลุได้) · false = หลังการ์ด */
  front: boolean;
  /** โชว์บนมือถือ (< 768px) — ค่าเริ่ม = ซ่อน */
  mobile: boolean;
};

export type LauncherTheme = {
  bg: string | null;
  bgGradient: { from: string; to: string } | null;
  bgImage: string | null;
  /** ความชัดของรูปพื้นหลัง 5–100 (null = แบบเดิม ~8%) */
  bgOpacity: number | null;
  bgPos: BgPos | null;
  bgFit: BgFit | null;
  /** ซูม 100–300 % */
  bgZoom: number | null;
  accent: string | null;
  font: string | null;
  /** undefined = ตามค่ากลางทีม */
  decor?: LauncherDecor[];
};

export const DEFAULT_LAUNCHER_THEME: LauncherTheme = {
  bg: null, bgGradient: null, bgImage: null, bgOpacity: null, bgPos: null, bgFit: null, bgZoom: null, accent: null, font: null,
};

export const BG_PRESETS: { from: string; to: string }[] = [
  { from: "#f8fafc", to: "#eff6ff" }, { from: "#fef3c7", to: "#fff7ed" }, { from: "#ecfdf5", to: "#f0fdfa" },
  { from: "#faf5ff", to: "#fdf2f8" }, { from: "#eff6ff", to: "#e0e7ff" }, { from: "#fff1f2", to: "#fef2f2" },
];
export const LAUNCHER_FONTS: { key: string; label: string; css: string }[] = [
  { key: "", label: "ค่าเริ่มต้น", css: "" },
  { key: "sarabun", label: "Sarabun", css: "'Sarabun', sans-serif" },
  { key: "tahoma", label: "Tahoma", css: "Tahoma, sans-serif" },
  { key: "angsana", label: "Angsana (ทางการ)", css: "'Angsana New', 'TH Sarabun New', serif" },
  { key: "mono", label: "Monospace", css: "'Courier New', monospace" },
];

export const BG_KEYS = ["bg", "bgGradient", "bgImage", "bgOpacity", "bgPos", "bgFit", "bgZoom"] as const;

const HEX = /^#[0-9a-f]{3,8}$/i;
const R2_KEY = /^[\w\-./]{1,300}$/;
const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 10) / 10)) : null;
const pick = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null);
const color = (v: unknown): string | null => (typeof v === "string" && HEX.test(v) ? v : null);
const r2key = (v: unknown): string | null => (typeof v === "string" && R2_KEY.test(v) && !v.includes("..") ? v : null);

export function cleanDecor(raw: unknown): LauncherDecor[] {
  if (!Array.isArray(raw)) return [];
  const out: LauncherDecor[] = [];
  for (const d of raw) {
    if (!d || typeof d !== "object") continue;
    const r = d as Record<string, unknown>;
    const key = r2key(r.key);
    if (!key) continue;
    out.push({
      id: typeof r.id === "string" && r.id ? r.id.slice(0, 40) : `d${out.length + 1}`,
      key,
      x: num(r.x, 0, 100) ?? 50,
      y: num(r.y, 0, 100) ?? 50,
      w: num(r.w, 2, 40) ?? 8,
      rotate: num(r.rotate, -180, 180) ?? 0,
      opacity: num(r.opacity, 10, 100) ?? 100,
      anim: pick(r.anim, LAUNCHER_DECOR_ANIMS) ?? "none",
      front: r.front === true,
      mobile: r.mobile === true,
    });
    if (out.length >= DECOR_MAX) break;
  }
  return out;
}

/** ล้างค่าที่อ่านมา (ผิดรูป/อันตราย = ทิ้ง) · ไม่มีช่อง decor = ไม่ใส่ key (ตามทีม) */
export function cleanLauncherTheme(raw: unknown): LauncherTheme {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const g = r.bgGradient && typeof r.bgGradient === "object" ? (r.bgGradient as Record<string, unknown>) : null;
  const from = color(g?.from), to = color(g?.to);
  const out: LauncherTheme = {
    bg: color(r.bg),
    bgGradient: from && to ? { from, to } : null,
    bgImage: r2key(r.bgImage),
    bgOpacity: num(r.bgOpacity, 5, 100),
    bgPos: pick(r.bgPos, BG_POSITIONS),
    bgFit: pick(r.bgFit, BG_FITS),
    bgZoom: num(r.bgZoom, 100, 300),
    accent: color(r.accent),
    font: typeof r.font === "string" && LAUNCHER_FONTS.some((f) => f.key === r.font) ? (r.font as string) || null : null,
  };
  if (Array.isArray(r.decor)) out.decor = cleanDecor(r.decor);
  return out;
}

/** ตั้งพื้นหลังไว้เองไหม (สี/ไล่สี/รูป อย่างใดอย่างหนึ่ง) */
export const hasOwnBg = (t: LauncherTheme) => !!(t.bg || t.bgGradient || t.bgImage);

/** ค่าที่ใช้จริง: ค่าเริ่มต้น ← ทีม ← ของฉัน (decor คืนเป็น array เสมอ) */
export function resolveLauncherTheme(team: unknown, mine: unknown): LauncherTheme & { decor: LauncherDecor[] } {
  const t = cleanLauncherTheme(team);
  const m = cleanLauncherTheme(mine);
  const bgSrc = hasOwnBg(m) ? m : t;
  const bg = Object.fromEntries(BG_KEYS.map((k) => [k, bgSrc[k]])) as Pick<LauncherTheme, (typeof BG_KEYS)[number]>;
  return { ...DEFAULT_LAUNCHER_THEME, ...bg, accent: m.accent ?? t.accent, font: m.font ?? t.font, decor: m.decor ?? t.decor ?? [] };
}

export function fontCssOf(t: Pick<LauncherTheme, "font">): string {
  return LAUNCHER_FONTS.find((f) => f.key === (t.font ?? ""))?.css ?? "";
}

/** พื้นหลังของหน้า (สีเดียว/ไล่สี) — รูปวาดเป็นชั้นแยก (bgImageLayer) */
export function pageBgStyle(t: LauncherTheme): Record<string, string> {
  if (t.bgImage) return {};
  if (t.bgGradient) return { background: `linear-gradient(160deg, ${t.bgGradient.from}, ${t.bgGradient.to})` };
  return t.bg ? { background: t.bg } : {};
}

/** ชั้นรูปพื้นหลัง (ตำแหน่งคงที่ทั้งจอ) — url = ที่อยู่รูปจาก r2ImageUrl */
export function bgImageLayer(t: LauncherTheme, url: string | null): Record<string, string | number> | null {
  if (!t.bgImage || !url) return null;
  const fit = t.bgFit ?? "cover";
  const zoom = t.bgZoom ?? 100;
  const pos = t.bgPos ?? "center";
  return {
    backgroundImage: `url("${url}")`,
    backgroundPosition: pos,
    backgroundRepeat: fit === "tile" ? "repeat" : "no-repeat",
    backgroundSize: fit === "tile" ? `${Math.round((320 * zoom) / 100)}px auto` : fit,
    opacity: (t.bgOpacity ?? LEGACY_BG_OPACITY) / 100,
    ...(fit !== "tile" && zoom !== 100 ? { transform: `scale(${zoom / 100})`, transformOrigin: pos } : {}),
  };
}

let seq = 0;
/** ของตกแต่งชิ้นใหม่ — วางเยื้องกันไม่ให้ทับชิ้นเดิม */
export function newDecor(key: string, existing: LauncherDecor[]): LauncherDecor {
  const n = existing.length;
  seq += 1;
  return {
    id: `d${Date.now().toString(36)}${seq}`, key,
    x: [88, 10, 90, 8, 50, 70, 30, 60][n % 8], y: [20, 78, 80, 24, 88, 12, 14, 70][n % 8],
    w: 8, rotate: 0, opacity: 100, anim: "float", front: false, mobile: false,
  };
}
