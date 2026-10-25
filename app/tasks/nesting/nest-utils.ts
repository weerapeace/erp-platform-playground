/**
 * ของช่วยคำนวณฝั่งหน้าจอของงานจัดเรียง — ย้ายมาจากหน้าเว็บของตัวช่วย (tools/nesting-app/web/static/app.js)
 * หน่วยภายในเป็น mm เสมอ (หน่วย cm เป็นแค่ตอนแสดง/กรอก)
 */
import type { NestingItem } from "./data";

/** ผลตรวจไฟล์จากตัวช่วย (POST/GET /api/files) */
export type FileInfo = {
  sha: string;
  name?: string;
  error?: string;
  canvas_px: [number, number];
  dpi: [number, number];
  dpi_source?: string;
  trim_box: [number, number, number, number];
  thin?: [number, number][];
  specks?: { x: number; y: number; w: number; h: number }[];
};

export type Unit = "mm" | "cm";

export const SETTINGS_DEFAULTS = {
  sheet_width_mm: 580, sheet_height_mm: null as number | null, margin_mm: 5, spacing_mm: 3,
  rotate: [0, 90, 180, 270] as number[] | null, rotate_step: null as number | null,
  cut_contour: false, cut_offset_mm: 1, alpha_threshold: 10, default_dpi: 300, min_dpi: 150,
  time_limit_s: 60, resample_to_dpi: 1200, min_line_mm: 0.1, fill: false, fill_length_mm: 1000,
  fill_roll: "used" as "used" | "length",   // แผ่นม้วน + เติม: เติมช่องว่างไม่ยืดม้วน / เติมถึงความยาว
  layout: "nest" as "nest" | "rows", rows_new_row: true, header: true, header_text: true, unit: "cm" as Unit,
};
export type Settings = typeof SETTINGS_DEFAULTS;

export function readSettings(raw: Record<string, unknown> | null | undefined): Settings {
  const s = { ...SETTINGS_DEFAULTS, ...(raw ?? {}) } as Settings;
  // งานเก่า (ก่อนมีตัวเลือกนี้) ม้วน + เติม = เติมถึงความยาวเสมอ → คงแบบเดิม
  if (raw && raw.fill_roll === undefined && raw.fill) s.fill_roll = "length";
  return s;
}

export const unitScale = (u: Unit) => (u === "cm" ? 10 : 1);
/** mm → ตัวเลขในหน่วยที่เลือก (ปัดเศษกันเลขเพี้ยน 0.30000000004) */
export const toUnit = (mm: number | null | undefined, u: Unit) => (mm == null ? "" : String(+(mm / unitScale(u)).toFixed(4)));

export function fmt(n: number | null | undefined, d = 1, lang: "th" | "en" = "th"): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Number(n).toLocaleString(lang === "en" ? "en-US" : "th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtLen(mm: number | null | undefined, u: Unit, lang: "th" | "en" = "th", digits?: number): string {
  if (mm == null || !Number.isFinite(mm)) return "—";
  const v = mm / unitScale(u);
  const d = digits ?? (u === "cm" ? (Math.abs(v) < 10 ? 2 : 1) : 1);
  return `${fmt(v, d, lang)} ${u}`;
}

/** ขนาดจริงตาม DPI ในไฟล์ (เฉพาะส่วนที่มีภาพ ตัดขอบใสออก) */
export function natural(info: FileInfo) {
  const [u0, v0, u1, v1] = info.trim_box;
  return { wpx: u1 - u0, hpx: v1 - v0, w: ((u1 - u0) * 25.4) / info.dpi[0], h: ((v1 - v0) * 25.4) / info.dpi[1] };
}

/** ขนาดที่จะพิมพ์จริง + DPI ที่ได้ (ยังไม่ใส่ขนาด = null) */
export function sizeOf(item: NestingItem, info: FileInfo) {
  const n = natural(info);
  const v = Number(item.size.value);
  let k = 1;
  if (item.size.mode !== "natural") {
    if (!(v > 0)) return null;
    k = { width: v / n.w, height: v / n.h, scale: v / 100, max: v / Math.max(n.w, n.h) }[item.size.mode];
  }
  return { w: n.w * k, h: n.h * k, dpi: Math.min(info.dpi[0], info.dpi[1]) / k, mmPerPx: (25.4 / info.dpi[0]) * k };
}

/** เปลี่ยนวิธีกำหนดขนาด โดยคงขนาดจริงเดิม (กว้าง 4 cm → กด "สูง" = ใส่ความสูงที่เท่ากับตอนนี้ให้) */
export function switchMode(item: NestingItem, info: FileInfo | undefined, mode: NestingItem["size"]["mode"]): NestingItem["size"] {
  if (mode === "natural") return { mode, value: null };
  if (!info) return { mode, value: item.size.mode === mode ? item.size.value : null };
  const n = natural(info);
  const k = (sizeOf(item, info)?.w ?? n.w) / n.w;
  const raw = { width: n.w * k, height: n.h * k, scale: 100 * k, max: Math.max(n.w, n.h) * k }[mode];
  return { mode, value: Number(raw.toFixed(mode === "scale" ? 2 : 1)) };
}

/** % พื้นที่ที่บางกว่า t pixel (จากเส้นกราฟที่ตัวช่วยวัดไว้) */
export function thinFraction(curve: [number, number][] | undefined, t: number): number {
  if (!curve || !curve.length) return 0;
  const c: [number, number][] = [[0, 0], ...curve];
  if (t >= c[c.length - 1][0]) return c[c.length - 1][1];
  for (let i = 1; i < c.length; i++) {
    if (t <= c[i][0]) {
      const [t0, f0] = c[i - 1], [t1, f1] = c[i];
      return f0 + ((f1 - f0) * (t - t0)) / (t1 - t0);
    }
  }
  return 0;
}

/** ความหนา (pixel) ที่บางกว่านั้นมีไม่เกิน 1% → ใช้คำนวณ "ควรกว้างอย่างน้อย" */
export function safeThicknessPx(curve: [number, number][], limit = 0.01): number {
  const c: [number, number][] = [[0, 0], ...curve];
  for (let i = 1; i < c.length; i++) {
    if (c[i][1] > limit) {
      const [t0, f0] = c[i - 1], [t1, f1] = c[i];
      return t0 + ((t1 - t0) * (limit - f0)) / (f1 - f0 || 1);
    }
  }
  return c[c.length - 1][0];
}

export const newKey = () => Math.random().toString(36).slice(2, 10);
