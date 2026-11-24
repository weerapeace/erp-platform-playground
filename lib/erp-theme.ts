// ============================================================
// ธีมกลาง ERP (ของกลาง · เฟส 1 = ฐานสี) — docs/erp-theme.md
//
// หลักคิด: สีหลักของระบบไม่เขียนตายตัว แต่ให้ Tailwind อ่านจาก "ตัวแปรสี" (CSS var)
//   - primary = สีหลัก (ปุ่ม/ลิงก์/แท็บ) → คลาส blue-* และ brand-* ทั้งระบบ (ค่าเริ่ม = ส้มเดิม)
//   - accent  = สีเน้นรอง (งาน Creative ใช้เยอะ) → คลาส violet-* (ค่าเริ่ม = ม่วง Tailwind เดิม)
//   - สีสถานะ (ร่าง/รออนุมัติ/อนุมัติ) ห้ามตามธีม → ใช้ชุดล็อก status-blue-* / status-violet-*
//
// ค่าเก็บเป็น "R G B" (ไม่มี #) เพื่อให้คลาสแบบโปร่งใส เช่น bg-blue-500/20 ยังใช้ได้
// ไฟล์นี้ต้อง pure (ไม่ import อะไร) เพราะ tailwind.config.ts โหลดตรง
// ============================================================

export const THEME_STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type ThemeStop = (typeof THEME_STOPS)[number];
export type ColorScale = Record<ThemeStop, string>;
export type ThemeRole = "primary" | "accent";
export const THEME_ROLES: readonly ThemeRole[] = ["primary", "accent"];

/** ส้มเดิมของระบบ (เดิมเขียนทับ blue ใน tailwind.config ตั้งแต่ 2026-05-31) */
export const ORANGE_SCALE: ColorScale = {
  50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 300: "#fdba74", 400: "#fb923c",
  500: "#f97316", 600: "#ea580c", 700: "#c2410c", 800: "#9a3412", 900: "#7c2d12", 950: "#431407",
};

/** ม่วงมาตรฐาน Tailwind (violet) — ค่าเดิมของคลาส violet-* */
export const VIOLET_SCALE: ColorScale = {
  50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6fe", 300: "#c4b5fd", 400: "#a78bfa",
  500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9", 800: "#5b21b6", 900: "#4c1d95", 950: "#2e1065",
};

/** ฟอนต์เริ่มต้นของระบบ (ตัวแปร --tm-font) — ธีมเปลี่ยนได้ (lib/erp-theme-config FONT_OPTIONS) */
export const DEFAULT_THEME_FONT = "'Inter','Noto Sans Thai',system-ui,sans-serif";

/** ค่าเริ่มต้นของทุกบทบาท = หน้าตาเดิมของระบบเป๊ะ */
export const DEFAULT_THEME_SCALES: Record<ThemeRole, ColorScale> = {
  primary: ORANGE_SCALE,
  accent: VIOLET_SCALE,
};

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX_RE.test(v.trim());
}

/** "#ea580c" → "234 88 12" (รูปแบบที่ Tailwind ใช้กับ <alpha-value>) */
export function hexToChannels(hex: string): string {
  const m = HEX_RE.exec(hex.trim());
  if (!m) throw new Error(`สีไม่ถูกต้อง: ${hex}`);
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** ชื่อตัวแปร เช่น --tm-primary-600 */
export function themeVarName(role: ThemeRole, stop: ThemeStop): string {
  return `--tm-${role}-${stop}`;
}

/** สำหรับ tailwind.config: blue/brand/violet ชี้ไปตัวแปรแทนสีตายตัว */
export function tailwindScaleFor(role: ThemeRole): Record<ThemeStop, string> {
  const out = {} as Record<ThemeStop, string>;
  for (const s of THEME_STOPS) out[s] = `rgb(var(${themeVarName(role, s)}) / <alpha-value>)`;
  return out;
}

/** ชุดสีตายตัว (ไม่ตามธีม) — ใช้กับสีสถานะ */
export function fixedScale(scale: ColorScale): Record<ThemeStop, string> {
  return { ...scale };
}

/** แปลงชุดสีของบทบาทหนึ่งเป็นตัวแปร CSS { "--tm-primary-50": "255 247 237", ... } */
export function scaleToVars(role: ThemeRole, scale: ColorScale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of THEME_STOPS) out[themeVarName(role, s)] = hexToChannels(scale[s]);
  return out;
}

/** ตัวแปรทั้งหมดของธีม (บทบาทไหนไม่ส่งมา = ใช้ค่าเริ่ม) — วางที่ :root หรือกล่องครอบโมดูล */
export function themeVars(scales: Partial<Record<ThemeRole, ColorScale>> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of THEME_ROLES) Object.assign(out, scaleToVars(r, scales[r] ?? DEFAULT_THEME_SCALES[r]));
  return out;
}

function mix(hex: string, target: [number, number, number], t: number): string {
  const [r, g, b] = hexToChannels(hex).split(" ").map(Number);
  const c = (a: number, z: number) => Math.round(a + (z - a) * t);
  const h = (v: number) => v.toString(16).padStart(2, "0");
  return `#${h(c(r, target[0]))}${h(c(g, target[1]))}${h(c(b, target[2]))}`;
}

// สัดส่วนผสมขาว (50–400) / ดำ (600–950) — ใช้สร้างชุดสีจากสีเดียว (ตัวแก้ธีมเฟส 2)
const LIGHTEN: Partial<Record<ThemeStop, number>> = { 50: 0.95, 100: 0.88, 200: 0.75, 300: 0.55, 400: 0.3 };
const DARKEN: Partial<Record<ThemeStop, number>> = { 600: 0.12, 700: 0.3, 800: 0.45, 900: 0.58, 950: 0.75 };

/** สร้างชุดสี 11 เฉดจากสีเดียว (สีที่ส่งมา = เฉด 500) */
export function scaleFromHex(hex: string): ColorScale {
  const base = `#${HEX_RE.exec(hex.trim())?.[1]?.toLowerCase() ?? ""}`;
  if (base.length !== 7) throw new Error(`สีไม่ถูกต้อง: ${hex}`);
  const out = {} as ColorScale;
  for (const s of THEME_STOPS) {
    if (s === 500) out[s] = base;
    else if (LIGHTEN[s] != null) out[s] = mix(base, [255, 255, 255], LIGHTEN[s]!);
    else out[s] = mix(base, [0, 0, 0], DARKEN[s]!);
  }
  return out;
}
