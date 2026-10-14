/**
 * ของกลาง — สีไล่ (Gradient) ของหน้าเว็บร้าน
 *
 * ใช้กับ: พื้นหลังทุก Section (style.bg = "gradient" + style.bgGrad) · ของตกแต่ง/ตัวหนังสือบนผืนผ้าใบ (ช่อง grad + color/color2)
 * จุดสี = ชื่อสีของธีม (เปลี่ยนธีมแล้วสีไล่เปลี่ยนตาม) หรือ #rrggbb · 2–3 จุด
 * ⚠️ ชื่อสี/ทิศต้องตรงกับเว็บร้าน src/lib/gradient.ts
 */
import type { FieldOption } from "@/lib/website-schema";

export type GradDir = "down" | "right" | "diag" | "diag-up" | "radial";
export interface GradientValue {
  dir: GradDir;
  stops: string[];
}

export const GRAD_DIR_VALUES: readonly GradDir[] = ["down", "right", "diag", "diag-up", "radial"];
export const GRAD_DIRS: FieldOption[] = [
  { v: "down", l: "บน → ล่าง" },
  { v: "right", l: "ซ้าย → ขวา" },
  { v: "diag", l: "เฉียงลง ↘" },
  { v: "diag-up", l: "เฉียงขึ้น ↗" },
  { v: "radial", l: "วงกลมจากกลาง" },
];

/** ชื่อสีธีมที่ใช้เป็นจุดสีได้ */
export const GRAD_THEME_COLORS = ["ink", "brand", "brandDeep", "brandSoft", "muted", "page", "surface", "white"] as const;

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export function isGradStop(v: unknown): v is string {
  return typeof v === "string" && ((GRAD_THEME_COLORS as readonly string[]).includes(v) || HEX6.test(v));
}

/** ค่าจากฟอร์ม/DB → สีไล่ที่ใช้ได้ (จุดสีใช้ได้ไม่ถึง 2 = null) */
export function sanitizeGradient(v: unknown): GradientValue | null {
  const o = (v ?? {}) as { dir?: unknown; stops?: unknown };
  const stops = (Array.isArray(o.stops) ? o.stops : []).map((s) => (typeof s === "string" ? s.trim() : s)).filter(isGradStop).map((s) => (HEX6.test(s) ? s.toLowerCase() : s)).slice(0, 3);
  if (stops.length < 2) return null;
  const dir = (GRAD_DIR_VALUES as readonly unknown[]).includes(o.dir) ? (o.dir as GradDir) : "down";
  return { dir, stops };
}

/** สีไล่สำเร็จรูป (ตามสีธีม — ร้านไหนก็เข้ากับธีมตัวเอง) */
export const GRADIENT_PRESETS: { key: string; label: string; g: GradientValue }[] = [
  { key: "soft-white", label: "แบรนด์จาง → ขาว", g: { dir: "down", stops: ["brandSoft", "white"] } },
  { key: "page-soft", label: "พื้นเว็บ → แบรนด์จาง (เฉียง)", g: { dir: "diag", stops: ["page", "brandSoft"] } },
  { key: "soft-brand", label: "แบรนด์จาง → แบรนด์", g: { dir: "right", stops: ["brandSoft", "brand"] } },
  { key: "glow", label: "วงกลมจากกลาง", g: { dir: "radial", stops: ["white", "brandSoft"] } },
  { key: "brand-deep", label: "แบรนด์ → เข้ม", g: { dir: "down", stops: ["brand", "brandDeep"] } },
  { key: "edge", label: "3 สี ขอบจาง", g: { dir: "down", stops: ["brandSoft", "white", "brandSoft"] } },
];

/** สีของธีม (hex) สำหรับวาดตัวอย่างใน ERP */
export type GradThemeHex = Record<(typeof GRAD_THEME_COLORS)[number], string>;

export function gradientPreviewCss(g: GradientValue, theme: GradThemeHex): string {
  const colors = g.stops.map((s) => (HEX6.test(s) ? s : theme[s as keyof GradThemeHex] ?? "#ffffff")).join(", ");
  if (g.dir === "radial") return `radial-gradient(circle at center, ${colors})`;
  const deg = g.dir === "right" ? 90 : g.dir === "diag" ? 135 : g.dir === "diag-up" ? 45 : 180;
  return `linear-gradient(${deg}deg, ${colors})`;
}
