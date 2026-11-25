// ============================================================
// เอฟเฟกต์ · เส้นขอบ · เงา ของธีม (ธีมกลาง ERP · เอฟเฟกต์เพิ่ม รอบ 1 · pure) — docs/erp-theme.md
//   เจ้าของเลือก 2026-11-25 (28 ข้อ): ตาราง "จุด × เอฟเฟกต์ (เลือกได้ 2) × ความแรง 1–3" · ชุดสำเร็จรูป 4 ชุด
//   · เส้นขอบ (หนา/สี/ลาย/ไล่สี/วิ่ง/แถบซ้าย) · เงา (สี/ความเข้ม/เรืองตอนชี้/ด้านใน) · ชี้/กด (ขยาย/คลื่นน้ำ/ขีดเส้นใต้/ไอคอนขยับ)
//   · เข้าหน้า 4 แบบ · การ์ดโผล่ทีละใบ · อนุภาค 4 แบบ
//   ข้อ 34 (ล็อก): กระพริบ/เปลี่ยนสีวนเร็วสุด 1 รอบต่อ MIN_FLASH_MS — ปลอดภัยต่อคนไวแสง (ไม่เกิน 3 ครั้ง/วินาทีแบบห่างมาก)
// ใช้ผ่าน normalizeThemeConfig (lib/erp-theme-config) · เทสต์ lib/__tests__/erp-theme-fx.test.ts
// ============================================================

export type EffectTarget = "button" | "badge" | "card" | "topbar" | "menu" | "number" | "bell";
export type EffectKey = "pulse" | "blink" | "colorShift" | "flow" | "glow" | "shine" | "lift" | "accentBar" | "countUp" | "shake";
export type EnterStyle = "none" | "fade" | "up" | "zoom" | "blur";
export type Particles = "none" | "snow" | "stars" | "bubbles" | "sakura";
export type Strength = 1 | 2 | 3;

export type ThemeFx = {
  targets: Record<EffectTarget, { fx: EffectKey[]; strength: Strength }>;
  enter: EnterStyle;
  stagger: boolean;
  particles: Particles;
  scaleHover: boolean;
  ripple: boolean;
  underline: boolean;
  iconWiggle: boolean;
};

export type ThemeOutline = {
  width: number;                                 // 0–3 px
  color: "gray" | "soft" | "theme";
  style: "solid" | "dashed" | "dotted" | "double";
  gradient: boolean;                              // ขอบไล่สี (การ์ด)
  running: boolean;                               // ขอบไล่สีวิ่ง
  accentBar: boolean;                             // แถบเน้นด้านซ้ายของการ์ดหัวข้อ
};

export type ThemeElevation = {
  depth: "none" | "soft" | "medium" | "float";
  color: "gray" | "theme" | "black";
  hoverGlow: boolean;                             // ชี้แล้วเรืองสีธีม
  inset: boolean;                                 // เงาด้านในช่องกรอก
};

export const EFFECT_TARGETS: { key: EffectTarget; label: string; hint: string }[] = [
  { key: "button", label: "ปุ่มหลัก", hint: "ปุ่มสีหลักทุกปุ่ม" },
  { key: "badge", label: "ป้ายด่วน", hint: "ป้ายรออนุมัติ/ด่วน" },
  { key: "card", label: "การ์ด", hint: "กล่องเนื้อหา" },
  { key: "topbar", label: "แถบบน", hint: "แถบบน/หัวเมนูข้าง" },
  { key: "menu", label: "เมนูที่เลือก", hint: "เมนูข้างที่เปิดอยู่" },
  { key: "number", label: "ตัวเลขสรุป", hint: "ตัวเลขบนแดชบอร์ด" },
  { key: "bell", label: "กระดิ่ง", hint: "เมื่อมีแจ้งเตือนใหม่" },
];

export const EFFECTS: { key: EffectKey; label: string; motion: boolean }[] = [
  { key: "pulse", label: "Pulse วงกระเพื่อม", motion: true },
  { key: "blink", label: "กระพริบนุ่ม", motion: true },
  { key: "colorShift", label: "เปลี่ยนสีวน", motion: true },
  { key: "flow", label: "ไล่สีวิ่ง", motion: true },
  { key: "glow", label: "เรืองแสงหายใจ", motion: true },
  { key: "shine", label: "แสงวิ่ง", motion: true },
  { key: "lift", label: "ยกตัวตอนชี้", motion: false },
  { key: "accentBar", label: "แถบเน้นซ้าย", motion: false },
  { key: "countUp", label: "นับขึ้น", motion: true },
  { key: "shake", label: "สั่น", motion: true },
];

/** เอฟเฟกต์ที่แต่ละจุดเลือกได้ */
export const TARGET_EFFECTS: Record<EffectTarget, EffectKey[]> = {
  button: ["pulse", "blink", "colorShift", "flow", "glow", "shine"],
  badge: ["blink", "pulse", "glow"],
  card: ["lift", "glow", "accentBar"],
  topbar: ["flow", "colorShift"],
  menu: ["accentBar", "pulse", "glow", "flow"],
  number: ["countUp", "glow", "pulse"],
  bell: ["shake", "pulse"],
};

export const MAX_FX_PER_TARGET = 2;
/** ข้อ 34: กระพริบ/เปลี่ยนสีวน ห้ามเร็วกว่า 1 รอบต่อเท่านี้ (มิลลิวินาที) */
export const MIN_FLASH_MS = 1200;

const NO_FX = (): ThemeFx["targets"] => ({
  button: { fx: [], strength: 2 }, badge: { fx: [], strength: 2 }, card: { fx: [], strength: 2 },
  topbar: { fx: [], strength: 2 }, menu: { fx: [], strength: 2 }, number: { fx: ["countUp"], strength: 2 }, bell: { fx: [], strength: 2 },
});

export const DEFAULT_FX: ThemeFx = {
  targets: NO_FX(), enter: "none", stagger: false, particles: "none",
  scaleHover: false, ripple: false, underline: false, iconWiggle: false,
};
export const DEFAULT_OUTLINE: ThemeOutline = { width: 1, color: "gray", style: "solid", gradient: false, running: false, accentBar: false };
export const DEFAULT_ELEVATION: ThemeElevation = { depth: "soft", color: "gray", hoverGlow: false, inset: false };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const pick = <T extends string | number>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);

/** ค่าเดิมยุคเฟส 4 (ยังไม่มีตารางเอฟเฟกต์) → แปลงเป็นตาราง */
export type LegacyAnim = { shine: boolean; hover: boolean; countUp: boolean; enter: boolean; gradientAnimate: boolean; gradientTop: boolean; gradientButton: boolean };

function fromLegacy(l: LegacyAnim): ThemeFx {
  const t = NO_FX();
  if (l.shine) t.button.fx.push("shine");
  if (l.gradientAnimate && l.gradientButton) t.button.fx.push("flow");
  if (l.gradientAnimate && l.gradientTop) t.topbar.fx.push("flow");
  if (l.hover) t.card.fx.push("lift");
  t.number.fx = l.countUp ? ["countUp"] : [];
  return { ...DEFAULT_FX, targets: t, enter: l.enter ? "fade" : "none" };
}

/** กรองตารางเอฟเฟกต์ (เฉพาะเอฟเฟกต์ที่จุดนั้นรองรับ · ไม่เกิน 2 · ไม่ซ้ำ) — ไม่มีค่า = แปลงจากค่าเดิม */
export function normalizeFx(raw: unknown, legacy: LegacyAnim): ThemeFx {
  if (!isObj(raw)) return fromLegacy(legacy);
  const rt = isObj(raw.targets) ? raw.targets : {};
  const targets = NO_FX();
  for (const { key } of EFFECT_TARGETS) {
    const v = isObj(rt[key]) ? (rt[key] as Obj) : null;
    if (!v) continue;
    const list = Array.isArray(v.fx) ? v.fx : [];
    const fx = [...new Set(list.filter((x): x is EffectKey => TARGET_EFFECTS[key].includes(x as EffectKey)))].slice(0, MAX_FX_PER_TARGET);
    targets[key] = { fx, strength: pick(v.strength, [1, 2, 3] as const, 2) };
  }
  return {
    targets,
    enter: pick(raw.enter, ["none", "fade", "up", "zoom", "blur"] as const, "none"),
    stagger: bool(raw.stagger, false),
    particles: pick(raw.particles, ["none", "snow", "stars", "bubbles", "sakura"] as const, "none"),
    scaleHover: bool(raw.scaleHover, false), ripple: bool(raw.ripple, false),
    underline: bool(raw.underline, false), iconWiggle: bool(raw.iconWiggle, false),
  };
}

export function normalizeOutline(raw: unknown): ThemeOutline {
  const r = isObj(raw) ? raw : {};
  const w = typeof r.width === "number" && Number.isFinite(r.width) ? Math.min(3, Math.max(0, Math.round(r.width))) : DEFAULT_OUTLINE.width;
  return {
    width: w,
    color: pick(r.color, ["gray", "soft", "theme"] as const, DEFAULT_OUTLINE.color),
    style: pick(r.style, ["solid", "dashed", "dotted", "double"] as const, DEFAULT_OUTLINE.style),
    gradient: bool(r.gradient, false), running: bool(r.running, false), accentBar: bool(r.accentBar, false),
  };
}

/** เงา: ไม่มีค่า = แปลงจาก shape.shadow เดิม (none/soft/strong) */
export function normalizeElevation(raw: unknown, legacyShadow: "none" | "soft" | "strong"): ThemeElevation {
  const r = isObj(raw) ? raw : {};
  const fromOld = legacyShadow === "strong" ? "medium" : legacyShadow;
  return {
    depth: pick(r.depth, ["none", "soft", "medium", "float"] as const, fromOld),
    color: pick(r.color, ["gray", "theme", "black"] as const, DEFAULT_ELEVATION.color),
    hoverGlow: bool(r.hoverGlow, false), inset: bool(r.inset, false),
  };
}

export const hasFx = (fx: ThemeFx, t: EffectTarget, e: EffectKey) => fx.targets[t].fx.includes(e);

/** ความยาวรอบ (วินาที) ของเอฟเฟกต์ — ความแรงมาก = เร็วขึ้นนิด · ข้อ 34 กันกระพริบ/เปลี่ยนสีเร็วเกิน */
export function fxDuration(e: EffectKey, strength: Strength, speedFactor = 1): number {
  const base: Record<EffectKey, number> = { pulse: 1.8, blink: 1.8, colorShift: 5, flow: 4, glow: 2.6, shine: 2.6, lift: 0.15, accentBar: 0, countUp: 0.8, shake: 0.7 };
  const k = strength === 3 ? 0.8 : strength === 1 ? 1.25 : 1;
  let s = base[e] * k * speedFactor;
  if (e === "blink" || e === "colorShift") s = Math.max(s, MIN_FLASH_MS / 1000);
  return Math.round(s * 100) / 100;
}

/** ระยะวงกระเพื่อม/รัศมีเรืองแสง (px) ตามความแรง */
export const fxSpread = (strength: Strength) => (strength === 1 ? 6 : strength === 2 ? 10 : 15);
/** ค่าจางสุดของการกระพริบตามความแรง (1 = จางนิดเดียว) */
export const blinkMinOpacity = (strength: Strength) => (strength === 1 ? 0.65 : strength === 2 ? 0.45 : 0.25);

// ── ชุดเอฟเฟกต์สำเร็จรูป (ข้อ 33) ───────────────────────────
export type FxPreset = { key: string; name: string; description: string; fx: ThemeFx; outline: ThemeOutline; elevation: ThemeElevation };
const T = (p: Partial<Record<EffectTarget, EffectKey[]>>, strength: Strength = 2): ThemeFx["targets"] => {
  const t = NO_FX();
  for (const [k, v] of Object.entries(p)) t[k as EffectTarget] = { fx: v!, strength };
  return t;
};

export const FX_PRESETS: FxPreset[] = [
  { key: "plain", name: "เรียบ", description: "นิ่ง สบายตา เน้นทำงาน",
    fx: { ...DEFAULT_FX, targets: T({ card: ["lift"], number: ["countUp"] }, 1), enter: "fade" },
    outline: { ...DEFAULT_OUTLINE }, elevation: { ...DEFAULT_ELEVATION } },
  { key: "fun", name: "สนุก", description: "ปุ่มเรืองแสง การ์ดยก กดแล้วมีคลื่น",
    fx: { targets: T({ button: ["glow", "shine"], badge: ["pulse"], card: ["lift", "glow"], topbar: ["flow"], menu: ["accentBar", "glow"], number: ["countUp", "pulse"], bell: ["shake"] }), enter: "up", stagger: true, particles: "none", scaleHover: true, ripple: true, underline: true, iconWiggle: true },
    outline: { width: 1, color: "soft", style: "solid", gradient: false, running: false, accentBar: true },
    elevation: { depth: "medium", color: "theme", hoverGlow: true, inset: false } },
  { key: "luxe", name: "หรู", description: "ขอบไล่สีบาง เงาลอย นิ่งแต่แพง",
    fx: { targets: T({ button: ["shine"], card: ["lift"], menu: ["accentBar"], number: ["countUp"] }, 1), enter: "blur", stagger: true, particles: "none", scaleHover: false, ripple: false, underline: true, iconWiggle: false },
    outline: { width: 1, color: "theme", style: "solid", gradient: true, running: false, accentBar: false },
    elevation: { depth: "float", color: "black", hoverGlow: false, inset: true } },
  { key: "festive", name: "เทศกาล", description: "ไล่สีวิ่ง ขอบวิ่ง อนุภาคตกลงมา",
    fx: { targets: T({ button: ["flow", "pulse"], badge: ["blink"], card: ["lift", "glow"], topbar: ["flow"], menu: ["flow"], number: ["countUp", "glow"], bell: ["shake", "pulse"] }, 3), enter: "zoom", stagger: true, particles: "snow", scaleHover: true, ripple: true, underline: true, iconWiggle: true },
    outline: { width: 2, color: "theme", style: "solid", gradient: true, running: true, accentBar: false },
    elevation: { depth: "medium", color: "theme", hoverGlow: true, inset: false } },
];
