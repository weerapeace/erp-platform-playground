/**
 * ของกลาง — คำนวณสีสำหรับหน้าตั้งค่าธีมเว็บ
 *  - contrastRatio / wcagLevel : ตรวจว่าข้อความอ่านออกไหม (มาตรฐาน WCAG 2.1)
 *  - shades                    : สร้างเฉดสี 50-900 จากสีเดียว
 *  - suggestReadable           : แนะนำสีที่อ่านออกเมื่อ contrast ไม่ผ่าน
 * ไม่มี dependency ภายนอก (ใช้ได้ทั้ง server/client)
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb | null {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export const rgbToHex = ({ r, g, b }: Rgb): string =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/** ความสว่างสัมพัทธ์ตามสูตร WCAG */
function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** อัตราส่วนความต่างของสี 1–21 (ยิ่งสูงยิ่งอ่านง่าย) */
export function contrastRatio(fg: string, bg: string): number {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!a || !b) return 0;
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export type WcagLevel = "AAA" | "AA" | "AA-large" | "fail";

/** สรุปผลว่าผ่านระดับไหน (large = ตัวอักษรใหญ่/หนา) */
export function wcagLevel(ratio: number): WcagLevel {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA-large";
  return "fail";
}

export const WCAG_LABEL: Record<WcagLevel, string> = {
  AAA: "ผ่านระดับ AAA (อ่านง่ายมาก)",
  AA: "ผ่านระดับ AA (อ่านง่าย)",
  "AA-large": "ผ่านเฉพาะตัวอักษรใหญ่",
  fail: "ไม่ผ่าน — อ่านยาก",
};

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/** สร้างเฉดสี 50–900 จากสีหลัก (50 = อ่อนสุด, 900 = เข้มสุด) */
export function shades(hex: string): Record<string, string> {
  const base = hexToRgb(hex);
  if (!base) return {};
  const white: Rgb = { r: 255, g: 255, b: 255 };
  const black: Rgb = { r: 0, g: 0, b: 0 };

  // 500 = สีตั้งต้น; ต่ำกว่าผสมขาว, สูงกว่าผสมดำ
  const steps: [string, number][] = [
    ["50", 0.95],
    ["100", 0.9],
    ["200", 0.75],
    ["300", 0.6],
    ["400", 0.3],
  ];
  const dark: [string, number][] = [
    ["600", 0.15],
    ["700", 0.3],
    ["800", 0.45],
    ["900", 0.6],
  ];

  const out: Record<string, string> = {};
  for (const [k, t] of steps) out[k] = rgbToHex(mix(base, white, t));
  out["500"] = rgbToHex(base);
  for (const [k, t] of dark) out[k] = rgbToHex(mix(base, black, t));
  return out;
}

/** สีเข้มขึ้นสำหรับสถานะ hover (ผสมดำ ~22%) */
export const darken = (hex: string, amount = 0.22): string => {
  const c = hexToRgb(hex);
  return c ? rgbToHex(mix(c, { r: 0, g: 0, b: 0 }, amount)) : hex;
};

/** สีอ่อนมากสำหรับพื้นหลังอ่อน (ผสมขาว ~90%) */
export const lighten = (hex: string, amount = 0.9): string => {
  const c = hexToRgb(hex);
  return c ? rgbToHex(mix(c, { r: 255, g: 255, b: 255 }, amount)) : hex;
};

/**
 * แนะนำสีที่อ่านออกบนพื้นหลังที่กำหนด — ค่อย ๆ ทำให้เข้ม/สว่างขึ้นจนผ่าน AA
 * คืน null ถ้าสีเดิมผ่านอยู่แล้ว
 */
export function suggestReadable(fg: string, bg: string, target = 4.5): string | null {
  if (contrastRatio(fg, bg) >= target) return null;
  const bgRgb = hexToRgb(bg);
  const fgRgb = hexToRgb(fg);
  if (!bgRgb || !fgRgb) return null;

  // พื้นหลังสว่าง → ทำตัวอักษรเข้มลง / พื้นหลังเข้ม → ทำให้สว่างขึ้น
  const toward: Rgb = luminance(bgRgb) > 0.5 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  for (let t = 0.05; t <= 1; t += 0.05) {
    const candidate = rgbToHex(mix(fgRgb, toward, t));
    if (contrastRatio(candidate, bg) >= target) return candidate;
  }
  return rgbToHex(toward);
}
