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
