/**
 * 🖼 กรอบรูปที่สร้างเอง (คลังกรอบของร้าน) — ของกลาง ฟังก์ชันล้วน ไม่มี import (คัดลอกไปเว็บร้านได้ทั้งไฟล์)
 *   ⚠️ มิเรอร์: storefront src/lib/frames.ts — แก้ที่นี่แล้วคัดลอกไปทั้งไฟล์ (แก้แค่หัวไฟล์ 2 บรรทัดแรก)
 *
 * กรอบ 1 อัน = "ชุดค่ากรอบ" ของชิ้นรูปในผืนผ้าใบ (ใช้แล้ว = คัดลอกค่าไปที่รูปนั้น · แก้/ลบกรอบในคลังทีหลังไม่กระทบรูปที่ใช้ไปแล้ว)
 *   ทรง: ทรงที่มีในระบบ (rect/ellipse/heart/…) · ทรงที่อัปเอง (SVG → shape เส้นทาง) · ทรงจากรูป PNG พื้นใส (maskKey)
 *   เส้นขอบ: ไม่มี / เส้น / จุด / เส้นคู่ / ลูกไม้ + สี + หนา + ห่างจากรูป (เส้นวาดตามทรงได้เฉพาะทรงที่เป็นเส้นทาง — PNG ไม่มีเส้น)
 *   กรอบวางทับ: รูป PNG ตรงกลางใส (overlayKey) + รูปห่างขอบกรอบ (overlayInset %)
 *
 * ทรงที่อัปเอง (FrameShape) เก็บเป็น "เส้นทาง SVG ล้วน" ที่ผ่านตัวกรอง — ไม่เก็บ SVG ดิบ (กันสคริปต์/ลิงก์แฝง)
 *   vb = กรอบของทรง [x, y, กว้าง, สูง] (ยืดเต็มกล่องรูป) · parts = เส้นทาง d + ตัวแปลงตำแหน่ง matrix(…) + กฎเติมสี evenodd
 *
 * 🎨 ลายของร้าน (ShopPattern · ท้ายไฟล์) = ของตกแต่งจากไฟล์ SVG ที่ร้านอัป — เส้นทางแบบเดียวกัน + สีพื้น/สีเส้น/ความหนาเดิมของแต่ละชิ้น
 *   วางแล้ว = คัดลอกลายไปที่ชิ้นนั้น (ผืนผ้าใบ / ของตกแต่ง Section) · เปลี่ยนสีได้ 3 แบบ: สีเดิมของไฟล์ · สีเดียวทั้งลาย · แยกตามสีในไฟล์
 */

export interface FrameShapePart {
  d: string;
  /** matrix(a b c d e f) — ตำแหน่ง/ขนาดของชิ้นนี้ในไฟล์ (ไม่มี = ไม่ขยับ) */
  t?: string;
  rule?: "evenodd";
}
export interface FrameShape {
  vb: [number, number, number, number];
  parts: FrameShapePart[];
}

export const FRAME_SHAPE_LIMITS = { parts: 80, chars: 40000 } as const;
const D_RE = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;
const NUM = "-?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?";
const T_RE = new RegExp(`^matrix\\(\\s*${NUM}(?:[\\s,]+${NUM}){5}\\s*\\)$`);
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** ทรงที่อัปเอง: ค่าที่เก็บ → ทรงที่ปลอดภัย · ผิดรูป/ว่าง/ใหญ่เกิน = null */
export function normalizeFrameShape(raw: unknown): FrameShape | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const vb = Array.isArray(r.vb) && r.vb.length === 4 && r.vb.every(finite) ? (r.vb.map((n) => Math.round(n * 1000) / 1000) as FrameShape["vb"]) : null;
  if (!vb || vb[2] <= 0 || vb[3] <= 0) return null;
  const parts: FrameShapePart[] = [];
  let chars = 0;
  for (const p of Array.isArray(r.parts) ? r.parts.slice(0, FRAME_SHAPE_LIMITS.parts) : []) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const d = typeof o.d === "string" ? o.d.replace(/\s+/g, " ").trim() : "";
    if (!d || !D_RE.test(d)) continue;
    chars += d.length;
    if (chars > FRAME_SHAPE_LIMITS.chars) return null;
    const part: FrameShapePart = { d };
    if (typeof o.t === "string" && T_RE.test(o.t.trim())) part.t = o.t.trim();
    if (o.rule === "evenodd") part.rule = "evenodd";
    parts.push(part);
  }
  return parts.length ? { vb, parts } : null;
}

/** ทรงที่มีในระบบ (เส้นทางกรอบ 0–100) → รูปแบบเดียวกับทรงที่อัปเอง (วาดเส้นกรอบ/ตัดรูปด้วยโค้ดเดียวกัน) */
export const builtinFrameShape = (d: string): FrameShape => ({ vb: [0, 0, 100, 100], parts: [{ d }] });

/** ทรง → SVG ทั้งก้อน (ยืดเต็มกล่อง · ค่าในนี้ผ่านตัวกรองแล้วเท่านั้น) */
export function frameShapeSvg(shape: FrameShape, fill = "black"): string {
  const paths = shape.parts.map((p) => `<path d='${p.d}'${p.t ? ` transform='${p.t}'` : ""}${p.rule ? ` fill-rule='${p.rule}'` : ""}/>`).join("");
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${shape.vb.join(" ")}' preserveAspectRatio='none' fill='${fill}'>${paths}</svg>`;
}

/** ทรง → ค่า CSS mask-image (ตัดรูปตามทรง · ยืดเต็มกล่อง — ใช้คู่ mask-size 100% 100%) */
export const frameShapeMaskCss = (shape: FrameShape): string => `url("data:image/svg+xml,${encodeURIComponent(frameShapeSvg(shape))}")`;

/* ───────── ชุดค่ากรอบในคลัง ───────── */

export type FrameBorder = "none" | "line" | "dotted" | "double" | "lace";
export type FrameMode = "build" | "mask" | "overlay";

export interface FrameDef {
  /** มาจากหน้าไหนของตัวสร้าง (ไว้เปิดแก้ที่หน้าเดิม) */
  mode: FrameMode;
  /** ทรงที่มีในระบบ หรือ "custom" = ทรงที่อัปเอง (shape / maskKey) */
  frame: string;
  shape: FrameShape | null;
  /** ทรงจากรูป PNG พื้นใส (ส่วนทึบ = เห็นรูป) */
  maskKey: string | null;
  border: FrameBorder;
  borderColor: string;
  borderHex: string;
  borderWidth: number;
  borderGap: number;
  overlayKey: string | null;
  overlayInset: number;
}

/** ทรงที่มีในระบบที่ตัวสร้างกรอบเลือกได้ (⚠️ ตรงกับ CANVAS_FRAMES ของผืนผ้าใบ) */
export const FRAME_BUILTIN_KEYS = ["rect", "rounded", "ellipse", "arch", "heart", "star", "hexagon", "cloud", "blob", "scallop", "stamp", "polaroid", "mat"] as const;
const BORDERS: FrameBorder[] = ["none", "line", "dotted", "double", "lace"];
const COLOR_RE = /^[a-zA-Z]{2,20}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const KEY_RE = /^[\w./-]{1,300}$/;
const clamp = (v: unknown, fb: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fb;
};
const r2key = (v: unknown) => (typeof v === "string" && KEY_RE.test(v.trim()) ? v.trim() : null);

export const DEFAULT_FRAME_DEF: FrameDef = {
  mode: "build",
  frame: "ellipse",
  shape: null,
  maskKey: null,
  border: "dotted",
  borderColor: "brand",
  borderHex: "",
  borderWidth: 3,
  borderGap: 10,
  overlayKey: null,
  overlayInset: 12,
};

/** ค่าที่เก็บ → ชุดค่ากรอบที่ครบ · ไม่มีทรงอะไรเลย = กลับเป็นสี่เหลี่ยม */
export function normalizeFrameDef(raw: unknown): FrameDef {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const mode: FrameMode = r.mode === "mask" || r.mode === "overlay" ? r.mode : "build";
  const shape = normalizeFrameShape(r.shape);
  const maskKey = r2key(r.maskKey);
  const custom = r.frame === "custom" && (shape || maskKey);
  const frame = custom ? "custom" : (FRAME_BUILTIN_KEYS as readonly string[]).includes(String(r.frame)) ? String(r.frame) : "rect";
  return {
    mode,
    frame,
    shape: custom ? shape : null,
    maskKey: custom && !shape ? maskKey : null,
    border: BORDERS.includes(r.border as FrameBorder) ? (r.border as FrameBorder) : "none",
    borderColor: typeof r.borderColor === "string" && COLOR_RE.test(r.borderColor) ? r.borderColor : "brand",
    borderHex: typeof r.borderHex === "string" && HEX_RE.test(r.borderHex) ? r.borderHex : "",
    borderWidth: clamp(r.borderWidth, 2, 1, 16),
    borderGap: clamp(r.borderGap, 10, 0, 80),
    overlayKey: r2key(r.overlayKey),
    overlayInset: clamp(r.overlayInset, 12, 0, 40),
  };
}

/** เส้นขอบวาดได้ไหม — ทรงจากรูป PNG ไม่มีเส้นทางให้วาดตาม */
export const frameDefCanBorder = (d: Pick<FrameDef, "frame" | "shape" | "maskKey">) => !(d.frame === "custom" && !d.shape && d.maskKey);

/** ใช้กรอบนี้กับชิ้นรูปในผืนผ้าใบ = ค่าที่ต้องเขียนทับ (ล้างค่าทรงเดิมทุกช่อง) */
export function frameDefCanvasPatch(def: FrameDef): Record<string, unknown> {
  const d = normalizeFrameDef(def);
  return {
    frame: d.frame,
    // ทรงที่อัปเก็บที่ช่อง frameShape ของชิ้นรูป (ช่อง shape = ลายของของตกแต่ง)
    frameShape: d.shape,
    maskKey: d.maskKey,
    border: frameDefCanBorder(d) ? d.border : "none",
    borderColor: d.borderColor,
    borderHex: d.borderHex,
    borderWidth: d.borderWidth,
    borderGap: d.borderGap,
    overlayKey: d.overlayKey,
    overlayInset: d.overlayInset,
  };
}

/** กรอบในคลัง (แถวจาก API) */
export interface SavedFrame {
  id: string;
  /** null = ใช้ได้ทุกร้าน */
  shopId: string | null;
  name: string;
  def: FrameDef;
  updatedAt: string;
}

/* ───────── 🎨 ลายของร้าน (ของตกแต่งจาก SVG ที่อัป · เปลี่ยนสีได้) ───────── */

export interface ShopPatternPart extends FrameShapePart {
  /** สีพื้นเดิมในไฟล์ (#rrggbb) — ไม่มี = ไม่เติมสี */
  f?: string;
  /** สีเส้นเดิมในไฟล์ (#rrggbb) — ไม่มี = ไม่มีเส้น */
  s?: string;
  /** ความหนาเส้นเดิม (หน่วยของชิ้นนี้ในไฟล์) */
  w?: number;
  /** ความทึบเดิม 0–1 (ไม่มี = ทึบ) */
  o?: number;
  /** ปลายเส้น / มุมเส้น (ไม่มี = ค่าปกติของ SVG) */
  lc?: "round" | "square";
  lj?: "round" | "bevel";
}
export interface ShopPattern {
  /** ชื่อไฟล์ (ไว้โชว์ในรายการ) */
  name?: string;
  vb: [number, number, number, number];
  parts: ShopPatternPart[];
}
export type ShopPatternMode = "orig" | "one" | "slot";
export const SHOP_PATTERN_MODES: readonly ShopPatternMode[] = ["orig", "one", "slot"];
/** เพดาน: ชิ้นส่วน · ตัวอักษรของเส้นทางรวม (ลายถูกคัดลอกลงข้อมูลหน้า — ใหญ่ไป = หน้าโหลดช้า) · สีที่แยกเปลี่ยนได้ */
export const SHOP_PATTERN_LIMITS = { parts: 400, chars: 80000, colors: 8 } as const;
/** สีธีมที่ใช้กับช่องสีของลายได้ (⚠️ ตรงกับ CANVAS_COLORS ไม่รวม custom) */
export const SHOP_PATTERN_TOKENS = ["ink", "brand", "brandDeep", "brandSoft", "muted", "page", "surface", "white"] as const;

const hex6 = (v: unknown) => (typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim().toLowerCase() : undefined);
const finNum = (v: unknown, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n * 1000) / 1000)) : undefined;
};

/** ลายของร้าน: ค่าที่เก็บ → ลายที่ปลอดภัย · ผิดรูป/ว่าง/ใหญ่เกิน = null (เว็บร้านเรียกซ้ำก่อนวาด) */
export function normalizeShopPattern(raw: unknown): ShopPattern | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const vb = Array.isArray(r.vb) && r.vb.length === 4 && r.vb.every(finite) ? (r.vb.map((n) => Math.round(n * 1000) / 1000) as ShopPattern["vb"]) : null;
  if (!vb || vb[2] <= 0 || vb[3] <= 0) return null;
  const parts: ShopPatternPart[] = [];
  let chars = 0;
  for (const p of Array.isArray(r.parts) ? r.parts.slice(0, SHOP_PATTERN_LIMITS.parts) : []) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const d = typeof o.d === "string" ? o.d.replace(/\s+/g, " ").trim() : "";
    if (!d || !D_RE.test(d)) continue;
    const f = hex6(o.f);
    const s = hex6(o.s);
    // ไม่มีทั้งสีพื้นและสีเส้น = มองไม่เห็นอยู่แล้ว
    if (!f && !s) continue;
    chars += d.length;
    if (chars > SHOP_PATTERN_LIMITS.chars) return null;
    const part: ShopPatternPart = { d };
    if (typeof o.t === "string" && T_RE.test(o.t.trim())) part.t = o.t.trim();
    if (o.rule === "evenodd") part.rule = "evenodd";
    if (f) part.f = f;
    if (s) {
      part.s = s;
      part.w = finNum(o.w, 0, 10000) ?? 1;
      if (o.lc === "round" || o.lc === "square") part.lc = o.lc;
      if (o.lj === "round" || o.lj === "bevel") part.lj = o.lj;
    }
    const op = finNum(o.o, 0, 1);
    if (op !== undefined && op < 1) part.o = op;
    parts.push(part);
  }
  if (!parts.length) return null;
  const name = typeof r.name === "string" ? Array.from(r.name).filter((ch) => ch >= " " && ch !== "<" && ch !== ">").join("").trim().slice(0, 60) : "";
  return name ? { name, vb, parts } : { vb, parts };
}

/** สีทั้งหมดในไฟล์ (สีพื้น + สีเส้น ตามลำดับที่เจอ) — ใช้กับโหมด "แยกตามสีในไฟล์" (เกินเพดาน = สีที่เหลือคงสีเดิม) */
export function shopPatternColors(p: ShopPattern): string[] {
  const out: string[] = [];
  for (const pt of p.parts)
    for (const c of [pt.f, pt.s]) if (c && !out.includes(c)) out.push(c);
  return out;
}

/** สัดส่วน สูง/กว้าง ของลาย */
export const shopPatternRatio = (p: ShopPattern) => Math.max(0.02, Math.min(4, Math.round((p.vb[3] / p.vb[2]) * 100) / 100));

/** ช่องสีของโหมดแยกตามสี: "" = สีเดิม · สีธีม · #rrggbb */
export function normalizePatternSlots(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = raw.slice(0, SHOP_PATTERN_LIMITS.colors).map((v) => (typeof v === "string" && (SHOP_PATTERN_TOKENS as readonly string[]).includes(v) ? v : hex6(v) ?? ""));
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

/** ขนาดของ matrix(…) (ใช้แปลงความหนาเส้นที่ตั้งเอง ให้หนาเท่ากันทุกชิ้น) */
function partScale(t?: string): number {
  if (!t) return 1;
  const n = t.match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)?.map(Number) ?? [];
  const det = n.length >= 4 ? Math.abs(n[0] * n[3] - n[1] * n[2]) : 1;
  return det > 1e-9 ? Math.sqrt(det) : 1;
}

/** ความหนาเส้นที่ใช้บ่อยในไฟล์ (หน่วยของทั้งลาย) — ตั้งค่าเริ่มของ "ความหนาเส้น" ตอนวาง · ไม่มีเส้น = 0 */
export function shopPatternLineWidth(p: ShopPattern): number {
  const ws = p.parts.filter((pt) => pt.s && pt.w).map((pt) => (pt.w ?? 0) * partScale(pt.t)).sort((a, b) => a - b);
  return ws.length ? ws[Math.floor(ws.length / 2)] : 0;
}

/**
 * หน้าตาที่ตั้ง (สีเป็นค่า CSS ที่แปลงแล้ว — ERP = สีจริง · เว็บร้าน = ตัวแปรสีธีม)
 *   width = ความหนาเส้นในหน่วยของทั้งลาย (ผู้เรียกแปลงจากหน่วยผืน/Section เอง) · slots เรียงตาม shopPatternColors (null = สีเดิม)
 */
export interface ShopPatternLook {
  mode: ShopPatternMode;
  fill: string;
  /** ไม่เติมสีพื้น (เหลือแต่เส้น) */
  noFill: boolean;
  /** สีเส้น — null = ไม่มีเส้นเพิ่ม */
  line: string | null;
  width: number;
  slots: (string | null)[];
}
export interface ShopPatternPaint {
  fill: string;
  stroke: string;
  width: number;
  opacity?: number;
}

/**
 * สีของแต่ละชิ้นตามโหมด
 *   orig = ตามไฟล์ · one = ทุกชิ้นสีเดียว (ชิ้นที่เป็นเส้นล้วนใช้สีเส้น ไม่มี = สีพื้น — ไม่หายไป) · slot = เปลี่ยนทีละสีในไฟล์ (+ เส้นขอบเพิ่มให้ชิ้นที่ไม่มีเส้น)
 */
export function shopPatternPaint(p: ShopPattern, look: ShopPatternLook): ShopPatternPaint[] {
  const cols = look.mode === "slot" ? shopPatternColors(p) : [];
  const map = (c?: string) => {
    if (!c) return "none";
    const i = cols.indexOf(c);
    return (i >= 0 && i < SHOP_PATTERN_LIMITS.colors && look.slots[i]) || c;
  };
  return p.parts.map((pt) => {
    const k = partScale(pt.t);
    const own = pt.w ?? 0;
    if (look.mode === "one") {
      const w = look.width / k;
      if (pt.f) return { fill: look.noFill ? "none" : look.fill, stroke: look.line ?? (look.noFill ? look.fill : "none"), width: w, opacity: pt.o };
      return { fill: "none", stroke: look.line ?? look.fill, width: w, opacity: pt.o };
    }
    if (look.mode === "slot") {
      if (pt.s) return { fill: map(pt.f), stroke: map(pt.s), width: own, opacity: pt.o };
      return { fill: map(pt.f), stroke: look.line ?? "none", width: look.line ? look.width / k : 0, opacity: pt.o };
    }
    return { fill: pt.f ?? "none", stroke: pt.s ?? "none", width: own, opacity: pt.o };
  });
}

/**
 * ค่าที่เก็บในชิ้น → หน้าตาที่ตั้ง (ใช้ร่วม: ผืนผ้าใบ + ของตกแต่ง Section ทั้ง ERP และเว็บร้าน)
 *   color(สีธีมหรือ "custom", สีเอง) → ค่า CSS · unit = ความยาว 1 หน่วยของลาย เป็นกี่หน่วยของชิ้น (แปลงความหนาเส้น)
 */
export function shopPatternLookOf(
  it: { patMode?: unknown; color?: unknown; colorHex?: unknown; outline?: unknown; lineColor?: unknown; lineColorHex?: unknown; strokeWidth?: unknown; patSlots?: unknown },
  color: (c: string, hex: string) => string,
  unit: number,
): ShopPatternLook {
  const mode = (SHOP_PATTERN_MODES as readonly unknown[]).includes(it.patMode) ? (it.patMode as ShopPatternMode) : "orig";
  const lc = typeof it.lineColor === "string" ? it.lineColor : "none";
  const sw = Number(it.strokeWidth);
  return {
    mode,
    fill: color(typeof it.color === "string" ? it.color : "brand", typeof it.colorHex === "string" ? it.colorHex : ""),
    noFill: it.outline === true,
    line: lc && lc !== "none" ? color(lc, typeof it.lineColorHex === "string" ? it.lineColorHex : "") : null,
    width: (Number.isFinite(sw) && sw > 0 ? Math.min(sw, 24) : 2) / (unit > 0 ? unit : 1),
    slots: normalizePatternSlots(it.patSlots).map((s) => (!s ? null : s.startsWith("#") ? s : color(s, ""))),
  };
}
