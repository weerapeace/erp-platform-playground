/**
 * ตัวตั้งค่าตัวอักษรกลาง — ส่วนกติกา (pure · ใช้ได้ทั้ง server/client · มีเทสต์)
 *   ฟอนต์ · ขนาด px (6-25) · สีตัวอักษร · หนา/เอียง/ขีดเส้นใต้/ขีดฆ่า · จัดซ้าย/กลาง/ขวา · ไฮไลต์ · bullets/เลข
 * หน้าจอ = components/text-style-control (TextStyleControl) · คู่มือ docs/text-style-control.md
 * ทุกช่อง optional — ไม่ตั้ง = ใช้ค่าเริ่มของที่ที่เอาไปใช้ (เช่น ชิป/การ์ด)
 */
export type TextAlign = "left" | "center" | "right";
export type TextList = "none" | "bullet" | "number";
export type TextStyle = {
  /** ค่าฟอนต์ (ความหมายขึ้นกับรายการฟอนต์ที่ส่งให้ตัวตั้งค่า เช่น กระดาน = เลขฟอนต์ "6") */
  font?: string;
  /** ขนาด px */
  size?: number;
  /** สีตัวอักษร #rrggbb */
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  align?: TextAlign;
  /** สีไฮไลต์หลังตัวอักษร #rrggbb · ว่าง = ไม่มี */
  highlight?: string;
  list?: TextList;
};
/** ตัวเลือกฟอนต์ที่ส่งให้ตัวตั้งค่า — css = ชื่อฟอนต์ไว้โชว์ตัวอย่างในเมนู */
export type TextFontOption = { value: string; label: string; css?: string };
/** ส่วนที่ปิดได้ เช่น กระดานวาดทำตัวเอียงไม่ได้ → { italic: false } */
export type TextStyleFeature = "font" | "size" | "color" | "bold" | "italic" | "underline" | "strike" | "align" | "highlight" | "list";

export const TEXT_SIZE_MIN = 6;
export const TEXT_SIZE_MAX = 25;
const HEX = /^#[0-9a-f]{6}$/i;

export const clampTextSize = (n: unknown, d = 14): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, Math.round(v))) : d;
};

/** กรองค่าจากที่เก็บ/ฟอร์ม → เหลือเฉพาะค่าที่ถูกต้อง · ไม่มีอะไรเหลือ = null */
export function cleanTextStyle(raw: unknown): TextStyle | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: TextStyle = {};
  if (typeof r.font === "string" && r.font) out.font = r.font.slice(0, 60);
  else if (typeof r.font === "number") out.font = String(r.font);
  if (r.size != null && Number.isFinite(Number(r.size))) out.size = clampTextSize(r.size);
  if (typeof r.color === "string" && HEX.test(r.color)) out.color = r.color;
  for (const k of ["bold", "italic", "underline", "strike"] as const) if (r[k] === true) out[k] = true;
  if (r.align === "left" || r.align === "center" || r.align === "right") out.align = r.align;
  if (typeof r.highlight === "string" && HEX.test(r.highlight)) out.highlight = r.highlight;
  if (r.list === "bullet" || r.list === "number") out.list = r.list;
  return Object.keys(out).length ? out : null;
}

/** ใส่ "• " หรือ "1. " หน้าทุกบรรทัด */
export function applyListPrefix(text: string, list: TextList | undefined): string {
  if (!list || list === "none") return text;
  return text.split("\n").map((l, i) => (list === "bullet" ? `• ${l}` : `${i + 1}. ${l}`)).join("\n");
}

/** style สำหรับหน้าเว็บ (React style) · fontCss = แปลงค่าฟอนต์เป็น font-family */
export function textStyleCss(s: TextStyle | null | undefined, fontCss?: (font: string) => string | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!s) return out;
  if (s.font) { const f = fontCss ? fontCss(s.font) : s.font; if (f) out.fontFamily = f; }
  if (s.size) out.fontSize = s.size;
  if (s.color) out.color = s.color;
  if (s.bold) out.fontWeight = 700;
  if (s.italic) out.fontStyle = "italic";
  const deco = [s.underline ? "underline" : "", s.strike ? "line-through" : ""].filter(Boolean).join(" ");
  if (deco) out.textDecoration = deco;
  if (s.align) out.textAlign = s.align;
  if (s.highlight) { out.backgroundColor = s.highlight; out.boxDecorationBreak = "clone"; out.WebkitBoxDecorationBreak = "clone"; }
  return out;
}

/** สรุปเป็นคำสั้น ๆ (โชว์ในรายการ) เช่น "14px · หนา · ไฮไลต์" */
export function describeTextStyle(s: TextStyle | null | undefined, t: (th: string, en: string) => string = (th) => th): string {
  if (!s) return "";
  const parts: string[] = [];
  if (s.size) parts.push(`${s.size}px`);
  if (s.bold) parts.push(t("หนา", "bold"));
  if (s.italic) parts.push(t("เอียง", "italic"));
  if (s.underline) parts.push(t("ขีดเส้นใต้", "underline"));
  if (s.strike) parts.push(t("ขีดฆ่า", "strike"));
  if (s.highlight) parts.push(t("ไฮไลต์", "highlight"));
  if (s.list === "bullet") parts.push("•");
  if (s.list === "number") parts.push("1.");
  return parts.join(" · ");
}
