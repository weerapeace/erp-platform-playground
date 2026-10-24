/**
 * ของกลาง — "ปั๊มชื่อ" (Personalize) บนสินค้าเว็บร้าน
 *
 *   - ตั้งค่าต่อรุ่น/ร้าน เก็บที่ store_listings.web_personalize (แท็บ 🛍 เว็บไซต์ ของ Parent SKU → 🔤 ปั๊มชื่อ)
 *     { enabled, maxChars, styles[], imageKey, positions[{key,label,enabled,x,y,size,rotate,align}], letterSpacing, charset, autoUpper, symbols[] }
 *     x/y = % ของรูป (จุดยึดข้อความ — align บอกว่าข้อความเริ่ม/กลาง/จบที่จุดนี้) · size = ขนาดตัวอักษรเป็น % ของความกว้างรูป · rotate = องศา
 *   - ลูกค้าเลือกได้แค่: ข้อความ + แบบปั๊ม + ตำแหน่ง (จากที่แอดมินเปิดไว้) → PersonalizeChoice เก็บที่ store_order_items.personalize
 *   - ตัวที่ปั๊มได้ตั้งต่อรุ่น (charset + ตัวพิเศษ symbols) — ตัวกรองเดียวกันทั้งตอนพิมพ์ (เว็บร้าน) และตอนสั่ง (ERP ตรวจซ้ำ)
 *     storefront มิเรอร์ใน src/lib/personalize.ts
 *   - ฟอนต์ Times New Roman ตายตัว (ตามที่เจ้าของร้านกำหนด) · นับความยาวเป็น "ตัว" (♥ = 1 ตัว)
 */
export type PersonalizeStyle = "emboss" | "silver" | "gold";
export type PersonalizePositionKey = "center" | "right";
/** ข้อความเริ่มที่จุด (left) · กลางจุด (center) · จบที่จุด (right — ยาวขึ้นแล้วงอกไปทางซ้าย) */
export type PersonalizeAlign = "left" | "center" | "right";

export interface PersonalizePosition {
  key: PersonalizePositionKey;
  label: string;
  enabled: boolean;
  x: number;
  y: number;
  size: number;
  rotate: number;
  align: PersonalizeAlign;
}
/** กลุ่มตัวอักษรที่ปั๊มได้ (ตามบล็อกตัวปั๊มที่โรงงานมี) */
export interface PersonalizeCharset {
  upper: boolean;
  lower: boolean;
  digits: boolean;
  space: boolean;
  punct: boolean;
}
export interface PersonalizeConfig {
  enabled: boolean;
  maxChars: number;
  styles: PersonalizeStyle[];
  /** รูปที่ใช้เป็นฉากปั๊ม (r2 key) — null = รูปแรกของสินค้า */
  imageKey: string | null;
  positions: PersonalizePosition[];
  /** ความห่างตัวอักษร (em) */
  letterSpacing: number;
  charset: PersonalizeCharset;
  /** เปลี่ยนตัวเล็กเป็นตัวใหญ่ให้อัตโนมัติ */
  autoUpper: boolean;
  /** ตัวพิเศษ (ตัวละ 1 ตัวอักษร เช่น ♥ ★) — ลูกค้ากดเลือกจากปุ่ม "ตัวพิเศษ" */
  symbols: string[];
  /** 🎚 เอฟเฟกต์ "พิมพ์จม" แบบ Photoshop (ตั้งต่อรุ่น) */
  embossFx: PersonalizeEmbossFx;
  /** ✨ สี (สีเดียว/ไล่สี) + นูน/เงา ของพิมพ์เงิน/ทอง (ตั้งต่อรุ่น) */
  foilFx: Record<PersonalizeFoilStyle, PersonalizeFoilFx>;
  /** 🎨 ค่าแยกตามสี (คีย์ = id SKU ลูก) — ไม่มี = ใช้ค่าหลัก */
  colorOverrides: Record<string, PersonalizeColorOverride>;
}
export interface PersonalizeChoice {
  text: string;
  style: PersonalizeStyle;
  position: PersonalizePositionKey;
}
/** ส่วนของค่าตั้งที่ตัวกรองข้อความใช้ */
export type PersonalizeCharRules = Pick<PersonalizeConfig, "maxChars" | "charset" | "autoUpper" | "symbols">;

export const PERSONALIZE_STYLES: { value: PersonalizeStyle; label: string }[] = [
  { value: "emboss", label: "พิมพ์จม" },
  { value: "silver", label: "พิมพ์เงิน" },
  { value: "gold", label: "พิมพ์ทอง" },
];
export const PERSONALIZE_POSITIONS: { key: PersonalizePositionKey; label: string }[] = [
  { key: "center", label: "ตรงกลาง" },
  { key: "right", label: "มุมขวาล่าง" },
];
export const PERSONALIZE_ALIGNS: { value: PersonalizeAlign; label: string }[] = [
  { value: "left", label: "ชิดซ้าย" },
  { value: "center", label: "กลาง" },
  { value: "right", label: "ชิดขวา" },
];
/** เครื่องหมายในกลุ่ม punct */
export const PERSONALIZE_PUNCT = "&_-.,/";
export const PERSONALIZE_CHARSETS: { key: keyof PersonalizeCharset; label: string; labelEn: string }[] = [
  { key: "upper", label: "A–Z", labelEn: "A–Z" },
  { key: "lower", label: "a–z", labelEn: "a–z" },
  { key: "digits", label: "0–9", labelEn: "0–9" },
  { key: "space", label: "เว้นวรรค", labelEn: "spaces" },
  { key: "punct", label: "& _ - . , /", labelEn: "& _ - . , /" },
];
export const PERSONALIZE_MAX_SYMBOLS = 24;
/** ตำแหน่ง x ของจุดยึดเทียบกับความกว้างข้อความ (ใช้ขยับจุดตอนเปลี่ยนการจัด ไม่ให้ตัวหนังสือกระโดด) */
export const PERSONALIZE_ALIGN_OFFSET: Record<PersonalizeAlign, number> = { left: 0, center: 0.5, right: 1 };

/* ── 🎚 เอฟเฟกต์ "พิมพ์จม" แบบ Photoshop Layer Style (ตั้งต่อรุ่น) ──
 * Bevel & Emboss (ขอบนูน/ยุบ) · Inner Shadow (เงาในร่อง) · Outer Glow (ขอบเข้มรอบตัว) · Fill (เนื้อตัวอักษร)
 * ค่า px อ้างอิงตัวอักษรสูง 100px แล้วย่อ/ขยายตามขนาดจริงบนรูป · วาดด้วย SVG filter (personalizeEmbossFilter)
 * ค่าเริ่ม = ค่าที่เจ้าของร้านตั้งใน Photoshop (2026-10-24) */
export interface PersonalizeEmbossFx {
  bevel: boolean;
  /** down = ยุบลง (เงาด้านแสง · ไฮไลต์ด้านตรงข้าม) · up = นูนขึ้น */
  dir: "up" | "down";
  depth: number;
  size: number;
  soften: number;
  angle: number;
  altitude: number;
  highlight: number;
  shadow: number;
  inner: boolean;
  innerOpacity: number;
  innerDistance: number;
  innerSize: number;
  glow: boolean;
  glowOpacity: number;
  glowSpread: number;
  glowSize: number;
  fill: number;
}
export const DEFAULT_EMBOSS_FX: PersonalizeEmbossFx = {
  bevel: true,
  dir: "down",
  depth: 136,
  size: 0,
  soften: 0,
  angle: 119,
  altitude: 30,
  highlight: 42,
  shadow: 85,
  inner: true,
  innerOpacity: 18,
  innerDistance: 12,
  innerSize: 21,
  glow: true,
  glowOpacity: 61,
  glowSpread: 5,
  glowSize: 5,
  fill: 0,
};
/** ช่วงค่าของช่องตัวเลข [ต่ำสุด, สูงสุด] */
export const EMBOSS_FX_RANGE: Record<Exclude<keyof PersonalizeEmbossFx, "bevel" | "dir" | "inner" | "glow">, [number, number]> = {
  depth: [0, 300],
  size: [0, 50],
  soften: [0, 16],
  angle: [0, 360],
  altitude: [0, 90],
  highlight: [0, 100],
  shadow: [0, 100],
  innerOpacity: [0, 100],
  innerDistance: [0, 100],
  innerSize: [0, 100],
  glowOpacity: [0, 100],
  glowSpread: [0, 100],
  glowSize: [0, 100],
  fill: [0, 100],
};

/** อ่านค่าเอฟเฟกต์จาก DB (ไม่มี/ผิด = ค่าเริ่ม) */
export function normalizeEmbossFx(raw: unknown): PersonalizeEmbossFx {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_EMBOSS_FX };
  for (const [k, [lo, hi]] of Object.entries(EMBOSS_FX_RANGE) as [keyof typeof EMBOSS_FX_RANGE, [number, number]][]) {
    const n = Number(r[k]);
    if (r[k] != null && r[k] !== "" && Number.isFinite(n)) out[k] = Math.min(hi, Math.max(lo, Math.round(n)));
  }
  for (const k of ["bevel", "inner", "glow"] as const) if (typeof r[k] === "boolean") out[k] = r[k] as boolean;
  if (r.dir === "up" || r.dir === "down") out.dir = r.dir;
  return out;
}

/** ชั้นของ SVG filter (ใส่ใน <filter> ที่ตั้งขอบเขตเอง) — fontPx = ขนาดตัวอักษรจริง (px) · ตัวเลขล้วน ไม่มีข้อความจากผู้ใช้ */
export function personalizeEmbossFilter(fx: PersonalizeEmbossFx, fontPx: number): string {
  const sc = Math.max(0.05, fontPx / 100);
  const f = (n: number) => (Math.round(n * 100) / 100).toString();
  const a = (fx.angle * Math.PI) / 180;
  const lx = Math.cos(a);
  const ly = -Math.sin(a);
  // แสงต่ำ (altitude น้อย) = ขอบเข้มชัดกว่า · ความลึก = ทั้งความหนาขอบและความเข้ม
  const k = 0.4 + 0.6 * Math.cos((fx.altitude * Math.PI) / 180);
  const dep = Math.min(1.6, fx.depth / 100);
  const d = Math.max(0.6, (1 + fx.size * 0.5) * (fx.depth / 100) * sc * 1.4);
  const sign = fx.dir === "down" ? 1 : -1;
  const bx = -lx * d * sign;
  const by = -ly * d * sign;
  const soft = Math.max(0.01, fx.soften * sc * 0.6 + fx.size * sc * 0.3);
  const parts: string[] = [];
  const merge: string[] = [];
  if (fx.glow) {
    parts.push(
      `<feMorphology in="SourceAlpha" operator="dilate" radius="${f((fx.glowSize * sc * fx.glowSpread) / 100)}" result="og1"/>`,
      `<feGaussianBlur in="og1" stdDeviation="${f(Math.max(0.01, (fx.glowSize * sc * (1 - fx.glowSpread / 100)) / 2))}" result="og2"/>`,
      `<feFlood flood-color="#000" flood-opacity="${f(fx.glowOpacity / 100)}"/>`,
      `<feComposite in2="og2" operator="in" result="og3"/>`,
      `<feComposite in="og3" in2="SourceAlpha" operator="out" result="og"/>`,
    );
    merge.push("og");
  }
  if (fx.fill > 0) {
    parts.push(`<feFlood flood-color="#000" flood-opacity="${f(fx.fill / 100)}"/>`, `<feComposite in2="SourceAlpha" operator="in" result="fl"/>`);
    merge.push("fl");
  }
  if (fx.inner) {
    parts.push(
      `<feOffset in="SourceAlpha" dx="${f(-lx * fx.innerDistance * sc)}" dy="${f(-ly * fx.innerDistance * sc)}" result="is1"/>`,
      `<feGaussianBlur in="is1" stdDeviation="${f(Math.max(0.01, (fx.innerSize * sc) / 2))}" result="is2"/>`,
      `<feComposite in="SourceAlpha" in2="is2" operator="out" result="is3"/>`,
      `<feFlood flood-color="#000" flood-opacity="${f(fx.innerOpacity / 100)}"/>`,
      `<feComposite in2="is3" operator="in" result="is"/>`,
    );
    merge.push("is");
  }
  if (fx.bevel) {
    parts.push(
      `<feOffset in="SourceAlpha" dx="${f(bx)}" dy="${f(by)}" result="b1"/>`,
      `<feComposite in="SourceAlpha" in2="b1" operator="out" result="b2"/>`,
      `<feGaussianBlur in="b2" stdDeviation="${f(soft)}" result="b3"/>`,
      `<feFlood flood-color="#2a2a2a" flood-opacity="${f(Math.min(1, (fx.shadow / 100) * k * dep))}"/>`,
      `<feComposite in2="b3" operator="in" result="bs"/>`,
      `<feOffset in="SourceAlpha" dx="${f(-bx)}" dy="${f(-by)}" result="h1"/>`,
      `<feComposite in="SourceAlpha" in2="h1" operator="out" result="h2"/>`,
      `<feGaussianBlur in="h2" stdDeviation="${f(soft)}" result="h3"/>`,
      `<feFlood flood-color="#fff" flood-opacity="${f(Math.min(1, (fx.highlight / 100) * k * dep))}"/>`,
      `<feComposite in2="h3" operator="in" result="bh"/>`,
    );
    merge.push("bs", "bh");
  }
  return `${parts.join("")}<feMerge>${merge.map((m) => `<feMergeNode in="${m}"/>`).join("")}</feMerge>`;
}

/* ── ✨ พิมพ์เงิน/ทอง: สี (สีเดียว/ไล่สี 2–6 ระดับ) + นูน/เงาแบบ Photoshop (ตั้งต่อรุ่น) ──
 * ไล่สี = linearGradient ใน SVG (มุม 90 = บนลงล่าง) · เอฟเฟกต์ = personalizeFoilFilter (Bevel & Emboss · Drop Shadow · Inner Shadow)
 * ค่าเริ่ม = หน้าตาเดิมของเว็บ (ไล่สีฟอยล์เดิม + เงาบาง ๆ ใต้ตัวอักษร) — ร้านเปิดนูน/ปรับสีเองได้ */
export interface PersonalizeFoilStop {
  color: string;
  /** ตำแหน่ง 0–100 (%) */
  pos: number;
}
export interface PersonalizeFoilFx {
  mode: "solid" | "gradient";
  solid: string;
  stops: PersonalizeFoilStop[];
  /** มุมไล่สี 0–180° (0 = ซ้าย→ขวา · 90 = บน→ล่าง) */
  gradAngle: number;
  bevel: boolean;
  dir: "up" | "down";
  depth: number;
  size: number;
  angle: number;
  altitude: number;
  highlight: number;
  shadow: number;
  drop: boolean;
  dropOpacity: number;
  dropDistance: number;
  dropSize: number;
  inner: boolean;
  innerOpacity: number;
  innerDistance: number;
  innerSize: number;
}
export type PersonalizeFoilStyle = "silver" | "gold";
const FOIL_FX_BASE = {
  gradAngle: 90,
  bevel: false,
  dir: "up" as const,
  depth: 90,
  size: 2,
  angle: 119,
  altitude: 30,
  highlight: 55,
  shadow: 45,
  drop: true,
  dropOpacity: 60,
  dropDistance: 4,
  dropSize: 2,
  inner: false,
  innerOpacity: 25,
  innerDistance: 3,
  innerSize: 4,
};
export const DEFAULT_FOIL_FX: Record<PersonalizeFoilStyle, PersonalizeFoilFx> = {
  gold: {
    ...FOIL_FX_BASE,
    mode: "gradient",
    solid: "#e8cf80",
    stops: [
      { color: "#fff1b8", pos: 0 },
      { color: "#f0cf6a", pos: 20 },
      { color: "#b98a2c", pos: 44 },
      { color: "#f9e08f", pos: 54 },
      { color: "#d4a640", pos: 70 },
      { color: "#8f6519", pos: 100 },
    ],
  },
  silver: {
    ...FOIL_FX_BASE,
    mode: "gradient",
    solid: "#d9dce1",
    stops: [
      { color: "#fdfdfd", pos: 0 },
      { color: "#c9ccd1", pos: 30 },
      { color: "#8e939a", pos: 48 },
      { color: "#eef0f2", pos: 58 },
      { color: "#a7abb1", pos: 78 },
      { color: "#6f747a", pos: 100 },
    ],
  },
};
/** ชุดสีสำเร็จรูป (ชื่อ · ระดับสี) — หลังบ้านกดใช้ได้ */
export const FOIL_PRESETS: Record<PersonalizeFoilStyle, { name: string; stops: PersonalizeFoilStop[] }[]> = {
  gold: [
    { name: "ทองฟอยล์เงา (เดิม)", stops: DEFAULT_FOIL_FX.gold.stops },
    { name: "ทองอ่อน", stops: [{ color: "#fbefb8", pos: 0 }, { color: "#ecd384", pos: 45 }, { color: "#c9a24e", pos: 100 }] },
    { name: "ทองเข้ม", stops: [{ color: "#f6dc8c", pos: 0 }, { color: "#c9971d", pos: 55 }, { color: "#8a6516", pos: 100 }] },
    { name: "ทองชมพู", stops: [{ color: "#f8dccc", pos: 0 }, { color: "#e3b39a", pos: 50 }, { color: "#b67c63", pos: 100 }] },
  ],
  silver: [
    { name: "เงินฟอยล์ (เดิม)", stops: DEFAULT_FOIL_FX.silver.stops },
    { name: "เงินเงา", stops: [{ color: "#ffffff", pos: 0 }, { color: "#d9dce1", pos: 45 }, { color: "#9aa0a8", pos: 100 }] },
    { name: "เงินด้าน", stops: [{ color: "#e6e8eb", pos: 0 }, { color: "#b9bdc3", pos: 100 }] },
  ],
};
export const FOIL_FX_RANGE: Record<
  "gradAngle" | "depth" | "size" | "angle" | "altitude" | "highlight" | "shadow" | "dropOpacity" | "dropDistance" | "dropSize" | "innerOpacity" | "innerDistance" | "innerSize",
  [number, number]
> = {
  gradAngle: [0, 180],
  depth: [0, 300],
  size: [0, 50],
  angle: [0, 360],
  altitude: [0, 90],
  highlight: [0, 100],
  shadow: [0, 100],
  dropOpacity: [0, 100],
  dropDistance: [0, 100],
  dropSize: [0, 100],
  innerOpacity: [0, 100],
  innerDistance: [0, 100],
  innerSize: [0, 100],
};
export const FOIL_MAX_STOPS = 6;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** อ่านค่าสี/เอฟเฟกต์ของเงินหรือทองจาก DB (ไม่มี/ผิด = ค่าเริ่ม) */
export function normalizeFoilFx(raw: unknown, style: PersonalizeFoilStyle): PersonalizeFoilFx {
  const d = DEFAULT_FOIL_FX[style];
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: PersonalizeFoilFx = { ...d, stops: d.stops.map((s) => ({ ...s })) };
  for (const [k, [lo, hi]] of Object.entries(FOIL_FX_RANGE) as [keyof typeof FOIL_FX_RANGE, [number, number]][]) {
    const n = Number(r[k]);
    if (r[k] != null && r[k] !== "" && Number.isFinite(n)) out[k] = Math.min(hi, Math.max(lo, Math.round(n)));
  }
  for (const k of ["bevel", "drop", "inner"] as const) if (typeof r[k] === "boolean") out[k] = r[k] as boolean;
  if (r.dir === "up" || r.dir === "down") out.dir = r.dir;
  if (r.mode === "solid" || r.mode === "gradient") out.mode = r.mode;
  if (typeof r.solid === "string" && HEX_RE.test(r.solid)) out.solid = r.solid.toLowerCase();
  if (Array.isArray(r.stops)) {
    const stops = (r.stops as Record<string, unknown>[])
      .filter((s) => s && typeof s.color === "string" && HEX_RE.test(s.color) && Number.isFinite(Number(s.pos)))
      .map((s) => ({ color: String(s.color).toLowerCase(), pos: Math.min(100, Math.max(0, Math.round(Number(s.pos)))) }))
      .sort((a, b) => a.pos - b.pos)
      .slice(0, FOIL_MAX_STOPS);
    if (stops.length >= 2) out.stops = stops;
  }
  return out;
}

/** ค่าเงิน+ทอง ทั้งคู่ */
export function normalizeFoilFxPair(raw: unknown): Record<PersonalizeFoilStyle, PersonalizeFoilFx> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { silver: normalizeFoilFx(r.silver, "silver"), gold: normalizeFoilFx(r.gold, "gold") };
}

/** ปลายเส้นไล่สี (% ของกรอบตัวอักษร) จากมุม — ใช้กับ <linearGradient x1 y1 x2 y2> */
export function personalizeFoilGradientEnds(angle: number): { x1: string; y1: string; x2: string; y2: string } {
  const a = (angle * Math.PI) / 180;
  const p = (n: number) => `${Math.round(n * 10) / 10}%`;
  return { x1: p(50 - Math.cos(a) * 50), y1: p(50 - Math.sin(a) * 50), x2: p(50 + Math.cos(a) * 50), y2: p(50 + Math.sin(a) * 50) };
}

/** สีเป็น CSS background-image (สีเดียว = ไล่สีสีเดียวกัน) — ปุ่มเลือกแบบ · ตัวอักษรแบบสำรองก่อนวาด SVG */
export function personalizeFoilCss(fx: PersonalizeFoilFx): string {
  if (fx.mode === "solid") return `linear-gradient(${fx.solid}, ${fx.solid})`;
  return `linear-gradient(${fx.gradAngle + 90}deg, ${fx.stops.map((s) => `${s.color} ${s.pos}%`).join(", ")})`;
}

/** ชั้นของ SVG filter ของเงิน/ทอง (ตัวอักษรสีจริง = SourceGraphic + เงา/นูน) — fontPx = ขนาดจริง (px) · ตัวเลขล้วน */
export function personalizeFoilFilter(fx: PersonalizeFoilFx, fontPx: number): string {
  const sc = Math.max(0.05, fontPx / 100);
  const f = (n: number) => (Math.round(n * 100) / 100).toString();
  const a = (fx.angle * Math.PI) / 180;
  const lx = Math.cos(a);
  const ly = -Math.sin(a);
  const k = 0.4 + 0.6 * Math.cos((fx.altitude * Math.PI) / 180);
  const dep = Math.min(1.6, fx.depth / 100);
  const parts: string[] = [];
  const merge: string[] = [];
  if (fx.drop) {
    parts.push(
      `<feOffset in="SourceAlpha" dx="${f(-lx * fx.dropDistance * sc)}" dy="${f(-ly * fx.dropDistance * sc)}" result="ds1"/>`,
      `<feGaussianBlur in="ds1" stdDeviation="${f(Math.max(0.01, (fx.dropSize * sc) / 2))}" result="ds2"/>`,
      `<feFlood flood-color="#000" flood-opacity="${f(fx.dropOpacity / 100)}"/>`,
      `<feComposite in2="ds2" operator="in" result="ds"/>`,
    );
    merge.push("ds");
  }
  merge.push("SourceGraphic");
  if (fx.inner) {
    parts.push(
      `<feOffset in="SourceAlpha" dx="${f(-lx * fx.innerDistance * sc)}" dy="${f(-ly * fx.innerDistance * sc)}" result="is1"/>`,
      `<feGaussianBlur in="is1" stdDeviation="${f(Math.max(0.01, (fx.innerSize * sc) / 2))}" result="is2"/>`,
      `<feComposite in="SourceAlpha" in2="is2" operator="out" result="is3"/>`,
      `<feFlood flood-color="#000" flood-opacity="${f(fx.innerOpacity / 100)}"/>`,
      `<feComposite in2="is3" operator="in" result="is"/>`,
    );
    merge.push("is");
  }
  if (fx.bevel) {
    const d = Math.max(0.6, (1 + fx.size * 0.5) * dep * sc * 1.2);
    const sign = fx.dir === "down" ? 1 : -1;
    const bx = -lx * d * sign;
    const by = -ly * d * sign;
    const soft = Math.max(0.01, fx.size * sc * 0.4);
    parts.push(
      `<feOffset in="SourceAlpha" dx="${f(bx)}" dy="${f(by)}" result="b1"/>`,
      `<feComposite in="SourceAlpha" in2="b1" operator="out" result="b2"/>`,
      `<feGaussianBlur in="b2" stdDeviation="${f(soft)}" result="b3"/>`,
      `<feFlood flood-color="#3a2a10" flood-opacity="${f(Math.min(1, (fx.shadow / 100) * k * dep))}"/>`,
      `<feComposite in2="b3" operator="in" result="bs"/>`,
      `<feOffset in="SourceAlpha" dx="${f(-bx)}" dy="${f(-by)}" result="h1"/>`,
      `<feComposite in="SourceAlpha" in2="h1" operator="out" result="h2"/>`,
      `<feGaussianBlur in="h2" stdDeviation="${f(soft)}" result="h3"/>`,
      `<feFlood flood-color="#fff" flood-opacity="${f(Math.min(1, (fx.highlight / 100) * k * dep))}"/>`,
      `<feComposite in2="h3" operator="in" result="bh"/>`,
    );
    merge.push("bs", "bh");
  }
  return `${parts.join("")}<feMerge>${merge.map((m) => `<feMergeNode in="${m}"/>`).join("")}</feMerge>`;
}

/* ── 🎨 ค่าแยกตามสี (ตั้งต่อรุ่น) ──
 * สีที่ "ตั้งค่าแยก" = ใช้ตำแหน่ง (x/y/ขนาด/เอียง/จัดชิด) + เอฟเฟกต์ (จม/เงิน/ทอง) ของสีนั้นแทนค่าหลัก
 * สีที่ไม่ได้แยก = ใช้ค่าหลัก · ค่าที่ใช้ร่วมทุกสี: เปิด/ปิดตำแหน่ง · ชื่อตำแหน่ง · จำนวนตัวอักษร · ตัวที่ปั๊มได้ · ตัวพิเศษ · แบบที่ให้เลือก
 * ERP เก็บด้วยรหัส SKU ลูก · เว็บร้านได้คีย์เป็นรหัสตัวเลือกสี ("sku-" + 8 ตัวแรก) จาก products API */
export type PersonalizeColorPos = Pick<PersonalizePosition, "key" | "x" | "y" | "size" | "rotate" | "align">;
export interface PersonalizeColorOverride {
  positions: PersonalizeColorPos[];
  embossFx: PersonalizeEmbossFx;
  foilFx: Record<PersonalizeFoilStyle, PersonalizeFoilFx>;
}
export const PERSONALIZE_MAX_COLOR_OVERRIDES = 40;
const COLOR_KEY_RE = /^[\w-]{1,64}$/;
const ALIGN_SET = new Set<string>(["left", "center", "right"]);

/** อ่านค่าแยกตามสีจาก DB (คีย์ผิด/เกิน = ตัดทิ้ง · ช่องที่ขาด = ค่าเริ่ม) */
export function normalizeColorOverrides(raw: unknown): Record<string, PersonalizeColorOverride> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, PersonalizeColorOverride> = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!COLOR_KEY_RE.test(key) || !v || typeof v !== "object") continue;
    if (Object.keys(out).length >= PERSONALIZE_MAX_COLOR_OVERRIDES) break;
    const r = v as Record<string, unknown>;
    const rawPos = Array.isArray(r.positions) ? (r.positions as Record<string, unknown>[]) : [];
    const positions: PersonalizeColorPos[] = [];
    for (const k of ["center", "right"] as const) {
      const p = rawPos.find((x) => x && typeof x === "object" && x.key === k);
      if (!p) continue;
      const n = (val: unknown, lo: number, hi: number, fb: number) => {
        const x = Number(val);
        return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x * 10) / 10)) : fb;
      };
      positions.push({
        key: k,
        x: n(p.x, 0, 100, 50),
        y: n(p.y, 0, 100, 50),
        size: n(p.size, 1, 30, 5),
        rotate: n(p.rotate, -45, 45, 0),
        align: (typeof p.align === "string" && ALIGN_SET.has(p.align) ? p.align : "center") as PersonalizeAlign,
      });
    }
    out[key] = { positions, embossFx: normalizeEmbossFx(r.embossFx), foilFx: normalizeFoilFxPair(r.foilFx) };
  }
  return out;
}

/** เริ่มค่าแยกของสีจากค่าหลัก (ติ๊ก "ตั้งค่าแยกสำหรับสีนี้") */
export function makeColorOverride(cfg: Pick<PersonalizeConfig, "positions" | "embossFx" | "foilFx">): PersonalizeColorOverride {
  return {
    positions: cfg.positions.map((p) => ({ key: p.key, x: p.x, y: p.y, size: p.size, rotate: p.rotate, align: p.align })),
    embossFx: { ...cfg.embossFx },
    foilFx: {
      silver: { ...cfg.foilFx.silver, stops: cfg.foilFx.silver.stops.map((s) => ({ ...s })) },
      gold: { ...cfg.foilFx.gold, stops: cfg.foilFx.gold.stops.map((s) => ({ ...s })) },
    },
  };
}

/** ค่าที่ใช้จริงของสีหนึ่ง = ค่าหลัก + ค่าแยกของสีนั้น (ไม่มีค่าแยก = ค่าหลักเดิม) */
export function applyColorOverride<C extends Pick<PersonalizeConfig, "positions" | "embossFx" | "foilFx">>(cfg: C, ov: PersonalizeColorOverride | undefined): C {
  if (!ov) return cfg;
  return {
    ...cfg,
    positions: cfg.positions.map((p) => {
      const o = ov.positions.find((x) => x.key === p.key);
      return o ? { ...p, x: o.x, y: o.y, size: o.size, rotate: o.rotate, align: o.align } : p;
    }),
    embossFx: ov.embossFx,
    foilFx: ov.foilFx,
  };
}

export const DEFAULT_PERSONALIZE: PersonalizeConfig = {
  enabled: false,
  maxChars: 10,
  styles: ["emboss", "silver", "gold"],
  imageKey: null,
  positions: [
    { key: "center", label: "ตรงกลาง", enabled: true, x: 50, y: 52, size: 5, rotate: 0, align: "center" },
    { key: "right", label: "มุมขวาล่าง", enabled: true, x: 80, y: 74, size: 4.5, rotate: 0, align: "right" },
  ],
  letterSpacing: 0.08,
  charset: { upper: true, lower: true, digits: true, space: true, punct: true },
  autoUpper: false,
  symbols: [],
  embossFx: DEFAULT_EMBOSS_FX,
  foilFx: DEFAULT_FOIL_FX,
  colorOverrides: {},
};

const KEY_RE = /^[\w\-./%()]+$/;
const ALIGNS = new Set<string>(["left", "center", "right"]);
const num = (v: unknown, fb: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * 10) / 10)) : fb;
};

/** ตัวพิเศษจากช่องที่แอดมินพิมพ์/วาง (ติดกันหรือเว้นวรรคก็ได้) → รายการตัวละ 1 ตัวอักษร ไม่ซ้ำ · ตัด A–Z a–z 0–9 (อยู่ในกลุ่มตัวอักษรอยู่แล้ว) และตัวควบคุม */
export function parsePersonalizeSymbols(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String).join("") : typeof raw === "string" ? raw : "";
  const out: string[] = [];
  for (const ch of Array.from(list.replace(/[\s︎️‍]/g, ""))) {
    if (/[A-Za-z0-9\u0000-\u001F\u007F-\u009F]/.test(ch) || out.includes(ch)) continue;
    out.push(ch);
    if (out.length >= PERSONALIZE_MAX_SYMBOLS) break;
  }
  return out;
}

/** อ่านค่าจาก DB ให้ครบทุกช่อง (ตำแหน่งมี 2 จุดเสมอ) — raw ว่าง = ค่าเริ่มต้น (ปิดอยู่)
 *  ค่าเก่าที่ยังไม่มี align = "center" (ตำแหน่งเดิมไม่ขยับ — แอดมินกดเปลี่ยนเองในหลังบ้าน) */
export function normalizePersonalize(raw: unknown): PersonalizeConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const styles = (Array.isArray(r.styles) ? r.styles : DEFAULT_PERSONALIZE.styles).filter((s): s is PersonalizeStyle =>
    PERSONALIZE_STYLES.some((d) => d.value === s)
  );
  const rawPos = Array.isArray(r.positions) ? (r.positions as Record<string, unknown>[]) : [];
  const positions = DEFAULT_PERSONALIZE.positions.map((d) => {
    const p = rawPos.find((x) => x && typeof x === "object" && x.key === d.key);
    const q = p ?? {};
    return {
      key: d.key,
      label: typeof q.label === "string" && q.label.trim() ? q.label.trim().slice(0, 40) : d.label,
      enabled: q.enabled !== false,
      x: num(q.x, d.x, 0, 100),
      y: num(q.y, d.y, 0, 100),
      size: num(q.size, d.size, 1, 30),
      rotate: num(q.rotate, d.rotate, -45, 45),
      align: (typeof q.align === "string" && ALIGNS.has(q.align) ? q.align : p ? "center" : d.align) as PersonalizeAlign,
    };
  });
  const cs = (r.charset && typeof r.charset === "object" ? r.charset : {}) as Record<string, unknown>;
  const charset = Object.fromEntries(
    PERSONALIZE_CHARSETS.map(({ key }) => [key, typeof cs[key] === "boolean" ? cs[key] : DEFAULT_PERSONALIZE.charset[key]])
  ) as unknown as PersonalizeCharset;
  const ls = typeof r.letterSpacing === "number" ? r.letterSpacing : NaN;
  return {
    enabled: r.enabled === true,
    maxChars: Math.round(num(r.maxChars, DEFAULT_PERSONALIZE.maxChars, 1, 30)),
    styles: styles.length ? [...new Set(styles)] : [...DEFAULT_PERSONALIZE.styles],
    imageKey: typeof r.imageKey === "string" && KEY_RE.test(r.imageKey) ? r.imageKey : null,
    positions,
    letterSpacing: Number.isFinite(ls) ? Math.min(0.5, Math.max(0, Math.round(ls * 100) / 100)) : DEFAULT_PERSONALIZE.letterSpacing,
    charset,
    autoUpper: r.autoUpper === true,
    symbols: parsePersonalizeSymbols(r.symbols),
    embossFx: normalizeEmbossFx(r.embossFx),
    foilFx: normalizeFoilFxPair(r.foilFx),
    colorOverrides: normalizeColorOverrides(r.colorOverrides),
  };
}

/** ตำแหน่งข้อความบนรูป: จุดยึด x/y + การจัด → transform (หมุนรอบจุดยึด) — ใช้ทั้งพรีวิว ERP และเว็บร้าน */
export function personalizeTextPlacement(p: Pick<PersonalizePosition, "x" | "y" | "rotate" | "align">): { left: string; top: string; transform: string; transformOrigin: string } {
  const off = PERSONALIZE_ALIGN_OFFSET[p.align] ?? 0.5;
  return { left: `${p.x}%`, top: `${p.y}%`, transform: `translate(${-off * 100}%, -50%) rotate(${p.rotate}deg)`, transformOrigin: `${off * 100}% 50%` };
}

/** แยกตัวสุดท้ายออก (ไม่ใส่ความห่างหลังตัวสุดท้าย → ชิดซ้าย/ขวาตรงจุดพอดี) */
export function personalizeSplitLast(text: string): [string, string] {
  const chars = Array.from(text);
  return [chars.slice(0, -1).join(""), chars.slice(-1).join("")];
}

/** ตัวนี้ปั๊มได้ไหม (ตามกลุ่มตัวอักษร + ตัวพิเศษของรุ่น) */
export function personalizeCharOk(ch: string, rules: Pick<PersonalizeCharRules, "charset" | "symbols">): boolean {
  const c = rules.charset;
  if (c.upper && /^[A-Z]$/.test(ch)) return true;
  if (c.lower && /^[a-z]$/.test(ch)) return true;
  if (c.digits && /^[0-9]$/.test(ch)) return true;
  if (c.space && ch === " ") return true;
  if (c.punct && ch.length === 1 && PERSONALIZE_PUNCT.includes(ch)) return true;
  return rules.symbols.includes(ch);
}

/** ข้อความที่ลูกค้าพิมพ์ → (ตัวใหญ่อัตโนมัติ) ตัดตัวที่ปั๊มไม่ได้ + จำกัดความยาว (ว่าง = null) — ตรวจฝั่งเซิร์ฟเวอร์ตอนสั่ง */
export function cleanPersonalizeText(text: unknown, rules: PersonalizeCharRules = DEFAULT_PERSONALIZE): string | null {
  if (typeof text !== "string") return null;
  const src = rules.autoUpper ? text.toUpperCase() : text;
  const kept = Array.from(src.replace(/\s+/g, " ")).filter((ch) => personalizeCharOk(ch, rules));
  const t = kept.join("").trim();
  const capped = Array.from(t).slice(0, Math.max(1, rules.maxChars)).join("").trim();
  return capped || null;
}

/** ค่าที่ลูกค้าเลือก (จากตะกร้า) → ตรวจกับค่าที่ตั้งไว้ของรุ่น — ไม่ผ่าน = null */
export function normalizePersonalizeChoice(raw: unknown, cfg: PersonalizeConfig | null): PersonalizeChoice | null {
  if (!raw || typeof raw !== "object" || !cfg || !cfg.enabled) return null;
  const r = raw as Record<string, unknown>;
  const text = cleanPersonalizeText(r.text, cfg);
  if (!text) return null;
  const style = cfg.styles.includes(r.style as PersonalizeStyle) ? (r.style as PersonalizeStyle) : cfg.styles[0];
  const pos = cfg.positions.find((p) => p.enabled && p.key === r.position) ?? cfg.positions.find((p) => p.enabled);
  if (!style || !pos) return null;
  return { text, style, position: pos.key };
}

const STYLE_EN: Record<string, string> = { emboss: "Debossed", silver: "Silver foil", gold: "Gold foil" };
const POSITION_EN: Record<string, string> = { center: "Center", right: "Bottom right" };

/** ป้ายสั้น ๆ ไว้โชว์ในตะกร้า/ออเดอร์: ปั๊ม "ANN" · พิมพ์ทอง · มุมขวาล่าง · 🌐 lang "en" = Name stamp "ANN" · Gold foil · Bottom right */
export function personalizeLabel(c: PersonalizeChoice, cfg?: PersonalizeConfig | null, lang: "th" | "en" = "th"): string {
  if (lang === "en") return `Name stamp "${c.text}" · ${STYLE_EN[c.style] ?? c.style} · ${POSITION_EN[c.position] ?? c.position}`;
  const style = PERSONALIZE_STYLES.find((s) => s.value === c.style)?.label ?? c.style;
  const pos = cfg?.positions.find((p) => p.key === c.position)?.label ?? PERSONALIZE_POSITIONS.find((p) => p.key === c.position)?.label ?? c.position;
  return `ปั๊ม "${c.text}" · ${style} · ${pos}`;
}
