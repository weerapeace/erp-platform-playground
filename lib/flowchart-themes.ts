/**
 * 🎨 ชุดสีของกระดาน flowchart (เจ้าของสั่ง 2026-11-22 ข้อ 1) — จุดสี 7 จุดบนแถบ = สีของชุดที่เลือก
 *   เก็บในกระดาน (FlowScene.theme) · กล่อง/โซนที่ใช้จุดสีเปลี่ยนตามทันที · กล่องที่ตั้งสีพื้น/เส้นเองไม่เปลี่ยน
 *   ใช้ทั้งบนจอ (components/flowchart-board) และตอนบันทึกเป็นรูป (export-html) → แก้ที่นี่ที่เดียว
 * ไม่มี React · เทสต์: lib/__tests__/flowchart-themes.test.ts
 */
import { FLOW_COLORS, FLOW_PALETTE, type FlowColor } from "./flowchart";

export const FLOW_THEME_KEYS = ["std", "pastel", "corp", "nature", "vivid", "night"] as const;
export type FlowThemeKey = (typeof FLOW_THEME_KEYS)[number];
export const isFlowTheme = (v: unknown): v is FlowThemeKey => typeof v === "string" && (FLOW_THEME_KEYS as readonly string[]).includes(v);

type Tone = { stroke: string; fill: string; text: string; sub: string };
/** ลำดับสี = FLOW_COLORS (slate · violet · emerald · blue · amber · rose · cyan) */
const T = (rows: [string, string, string, string][]): Record<FlowColor, Tone> =>
  Object.fromEntries(FLOW_COLORS.map((c, i) => [c, { stroke: rows[i][0], fill: rows[i][1], text: rows[i][2], sub: rows[i][3] }])) as Record<FlowColor, Tone>;

export const FLOW_THEMES: Record<FlowThemeKey, { th: string; en: string; tones: Record<FlowColor, Tone> | null; dark?: boolean }> = {
  std:    { th: "มาตรฐาน", en: "Standard", tones: null },
  pastel: { th: "พาสเทล",   en: "Pastel", tones: T([
    ["#a8a29e", "#fafaf9", "#44403c", "#78716c"], ["#c4b5fd", "#f5f3ff", "#5b21b6", "#7c3aed"], ["#86efac", "#f0fdf4", "#166534", "#15803d"],
    ["#93c5fd", "#eff6ff", "#1e40af", "#2563eb"], ["#fcd34d", "#fefce8", "#854d0e", "#a16207"], ["#f9a8d4", "#fdf2f8", "#9d174d", "#be185d"], ["#67e8f9", "#ecfeff", "#155e75", "#0e7490"]]) },
  corp:   { th: "องค์กร",   en: "Corporate", tones: T([
    ["#475569", "#f8fafc", "#0f172a", "#475569"], ["#1e3a8a", "#eef2ff", "#1e1b4b", "#3730a3"], ["#0f766e", "#f0fdfa", "#134e4a", "#0f766e"],
    ["#1d4ed8", "#eff6ff", "#172554", "#1d4ed8"], ["#b45309", "#fffbeb", "#451a03", "#b45309"], ["#9f1239", "#fff1f2", "#4c0519", "#9f1239"], ["#0e7490", "#ecfeff", "#083344", "#0e7490"]]) },
  nature: { th: "ธรรมชาติ", en: "Nature", tones: T([
    ["#78716c", "#fafaf9", "#292524", "#78716c"], ["#65a30d", "#f7fee7", "#365314", "#4d7c0f"], ["#15803d", "#f0fdf4", "#14532d", "#15803d"],
    ["#0369a1", "#f0f9ff", "#0c4a6e", "#0369a1"], ["#a16207", "#fefce8", "#422006", "#a16207"], ["#c2410c", "#fff7ed", "#431407", "#c2410c"], ["#0d9488", "#f0fdfa", "#134e4a", "#0d9488"]]) },
  vivid:  { th: "สดใส",     en: "Vivid", tones: T([
    ["#111827", "#f9fafb", "#111827", "#4b5563"], ["#a855f7", "#faf5ff", "#581c87", "#9333ea"], ["#22c55e", "#f0fdf4", "#14532d", "#16a34a"],
    ["#3b82f6", "#eff6ff", "#1e3a8a", "#2563eb"], ["#f97316", "#fff7ed", "#7c2d12", "#ea580c"], ["#ef4444", "#fef2f2", "#7f1d1d", "#dc2626"], ["#06b6d4", "#ecfeff", "#164e63", "#0891b2"]]) },
  night:  { th: "กลางคืน",  en: "Night", dark: true, tones: T([
    ["#94a3b8", "#1e293b", "#e2e8f0", "#94a3b8"], ["#a78bfa", "#2e1065", "#ede9fe", "#c4b5fd"], ["#34d399", "#064e3b", "#d1fae5", "#6ee7b7"],
    ["#60a5fa", "#172554", "#dbeafe", "#93c5fd"], ["#fbbf24", "#451a03", "#fef3c7", "#fcd34d"], ["#fb7185", "#4c0519", "#ffe4e6", "#fda4af"], ["#22d3ee", "#083344", "#cffafe", "#67e8f9"]]) },
};

export type FlowPaletteMap = typeof FLOW_PALETTE;
const cache = new Map<string, FlowPaletteMap>();
/** สีทั้ง 7 ของชุด (ชื่อสีไทย/อังกฤษคงเดิม) · ไม่รู้จัก = มาตรฐาน */
export function themePalette(key: unknown): FlowPaletteMap {
  const k = isFlowTheme(key) ? key : "std";
  const tones = FLOW_THEMES[k].tones;
  if (!tones) return FLOW_PALETTE;
  let p = cache.get(k);
  if (!p) {
    p = Object.fromEntries(FLOW_COLORS.map((c) => [c, { ...FLOW_PALETTE[c], ...tones[c] }])) as FlowPaletteMap;
    cache.set(k, p);
  }
  return p;
}
