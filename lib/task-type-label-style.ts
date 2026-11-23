/**
 * สไตล์ป้ายประเภทงาน — เก็บที่ erp_task_types.label_style (jsonb)
 * ใช้ร่วม: API /api/creative-options · ชิปประเภทงาน (app/tasks/task-type-chip) · หน้าตั้งค่าประเภทงาน
 * ตั้งค่าผ่านตัวตั้งค่าตัวอักษรกลาง (components/text-style-control · lib/text-style) ตั้งแต่ 2026-11-23:
 *   ขนาด px · หนา · เอียง · ขีดเส้นใต้ · ขีดฆ่า · สีตัวอักษร · ไฮไลต์
 * ค่าแบบเดิมยังอ่านได้: weight 400-700 · size "sm"/"md"/"lg"
 * null / ค่าแปลก = หน้าตาเดิม (ตัวกลาง 10px) · pure ใช้ได้ทั้ง server/client
 */
import { clampTextSize, cleanTextStyle, type TextStyle } from "@/lib/text-style";

export type LabelWeight = 400 | 500 | 600 | 700;
export type LabelSize = "sm" | "md" | "lg";
export type TaskTypeLabelStyle = {
  weight?: LabelWeight;
  /** "sm"/"md"/"lg" (แบบเดิม) หรือ px */
  size?: LabelSize | number;
  color?: string;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  highlight?: string;
};

const WEIGHTS: LabelWeight[] = [400, 500, 600, 700];
const SIZES: LabelSize[] = ["sm", "md", "lg"];

/** กรองค่าที่มาจากฐานข้อมูล/ฟอร์ม → เหลือเฉพาะค่าที่รู้จัก · ไม่มีอะไรเหลือ = null */
export function cleanLabelStyle(v: unknown): TaskTypeLabelStyle | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out: TaskTypeLabelStyle = {};
  const w = Number(o.weight);
  if (WEIGHTS.includes(w as LabelWeight)) out.weight = w as LabelWeight;
  if (SIZES.includes(o.size as LabelSize)) out.size = o.size as LabelSize;
  else if (typeof o.size === "number" && Number.isFinite(o.size)) out.size = clampTextSize(o.size);
  const ts = cleanTextStyle({ color: o.color, italic: o.italic, underline: o.underline, strike: o.strike, highlight: o.highlight });
  if (ts) Object.assign(out, ts);
  return Object.keys(out).length ? out : null;
}

/** ขนาดตัวอักษรของป้าย (px) — ค่าเริ่ม md = 10px ตามชิปเดิม */
export const LABEL_SIZE_PX: Record<LabelSize, number> = { sm: 9, md: 10, lg: 12 };
export const LABEL_DEFAULT_PX = 10;
const sizePx = (s: TaskTypeLabelStyle["size"]): number | undefined => (typeof s === "number" ? s : s ? LABEL_SIZE_PX[s] : undefined);

type LabelCss = { fontWeight?: number; fontSize?: number; color?: string; fontStyle?: string; textDecoration?: string; backgroundColor?: string; borderRadius?: number; padding?: string };
/** style สำหรับตัวหนังสือในชิป · null = ใช้ค่าเริ่มต้นของชิป */
export function labelTextStyle(s: TaskTypeLabelStyle | null | undefined): LabelCss | undefined {
  if (!s) return undefined;
  const out: LabelCss = {};
  if (s.weight) out.fontWeight = s.weight;
  const px = sizePx(s.size);
  if (px) out.fontSize = px;
  if (s.color) out.color = s.color;
  if (s.italic) out.fontStyle = "italic";
  const deco = [s.underline ? "underline" : "", s.strike ? "line-through" : ""].filter(Boolean).join(" ");
  if (deco) out.textDecoration = deco;
  if (s.highlight) { out.backgroundColor = s.highlight; out.borderRadius = 2; out.padding = "0 2px"; }
  return Object.keys(out).length ? out : undefined;
}

/** ป้าย → ค่าของตัวตั้งค่าตัวอักษรกลาง (หนา = น้ำหนัก 600 ขึ้นไป) */
export function labelToTextStyle(s: TaskTypeLabelStyle | null | undefined): TextStyle {
  if (!s) return {};
  return { size: sizePx(s.size), bold: (s.weight ?? 400) >= 600 || undefined, color: s.color, italic: s.italic, underline: s.underline, strike: s.strike, highlight: s.highlight };
}
/** ค่าจากตัวตั้งค่าตัวอักษรกลาง → ป้าย (ไม่ได้กดหนา = คงน้ำหนักเดิม เช่น "กลาง 500") */
export function textStyleToLabel(next: TextStyle, prev: TaskTypeLabelStyle | null | undefined): TaskTypeLabelStyle | null {
  const prevBold = (prev?.weight ?? 400) >= 600;
  const weight: LabelWeight | undefined = !!next.bold === prevBold ? prev?.weight : next.bold ? 700 : undefined;
  return cleanLabelStyle({ weight, size: next.size, color: next.color, italic: next.italic, underline: next.underline, strike: next.strike, highlight: next.highlight });
}

export const LABEL_WEIGHT_OPTIONS: { value: LabelWeight; th: string; en: string }[] = [
  { value: 400, th: "ปกติ", en: "Regular" }, { value: 500, th: "กลาง", en: "Medium" }, { value: 600, th: "หนา", en: "Semibold" }, { value: 700, th: "หนามาก", en: "Bold" },
];
export const LABEL_SIZE_OPTIONS: { value: LabelSize; th: string; en: string }[] = [
  { value: "sm", th: "เล็ก", en: "Small" }, { value: "md", th: "กลาง", en: "Medium" }, { value: "lg", th: "ใหญ่", en: "Large" },
];
