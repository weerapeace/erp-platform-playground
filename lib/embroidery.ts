/**
 * 🧵 ไฟล์ปัก — สูตรกลาง (ไม่มีหน้าจอ · ใช้ได้ทั้งเบราว์เซอร์และเทสต์)
 *
 *   ลายเวกเตอร์ (ชิ้นที่อ่านจาก .ai/.pdf/.svg ด้วย lib/block-print-ai · มีสีพื้น) → ฝีเข็ม → ไฟล์เครื่องปัก .DST (Tajima — ร้านส่วนใหญ่รับ)
 *
 *   ชนิดฝีเข็มต่อชิ้น:
 *     fill  = ถมเต็ม (tatami) แถวขนานกันตามมุมที่ตั้ง ฝีละ ~3.5 มม. เหลื่อมกันแบบก่ออิฐ
 *     satin = ซิกแซก ฝีเดียวพาดข้ามชิ้น (เหมาะตัวหนังสือ/เส้นกว้าง ≤ ~7 มม.) · ทิศขวางแนวยาวของชิ้นเอง
 *     run   = เดินเส้นตามขอบ
 *     auto  = ชิ้นแคบ (ความกว้างเฉลี่ย ≤ 6 มม.) ใช้ซิกแซก นอกนั้นถมเต็ม
 *     skip  = ไม่ปัก
 *   ทุกบล็อกมีฝีล็อกด้ายต้น/ท้าย · ย้ายไกลเกิน 2 มม. = ล็อก → ตัดด้าย → กระโดด · เปลี่ยนสี = ล็อก → ตัดด้าย → เปลี่ยนสี
 *
 *   ซิกแซกเลี้ยวตามเส้น + ขอบซิกแซกรอบพื้นถม = lib/embroidery-satin (ปิดได้ในค่าตั้ง satin_follow / border_mm)
 *   ⚠️ ข้อจำกัด (แปลงอัตโนมัติ ไม่ใช่คน digitize): ฝีรองพื้นแบบง่าย
 *      · ไม่ตัดส่วนที่ซ้อนกันออก (สีที่ปักทีหลังทับสีก่อน) · ควรให้ร้านปักทดสอบก่อนทุกครั้ง
 *   หน่วยภายใน = มม. แกน y ชี้ลง (เหมือน lib/block-print) · DST = 0.1 มม. แกน y ชี้ขึ้น
 *   คู่มือ docs/embroidery.md
 */
import { autoGroup, eachOp, OP, pieceShapes, type BlockPiece, type FillRule } from "@/lib/block-print";
import { dirAt, satinBorder, turningSatin, type DirLine } from "@/lib/embroidery-satin";

export type Pt = [number, number];
export type StitchType = "auto" | "fill" | "satin" | "run" | "skip";
export const STITCH_TYPES: { key: StitchType; th: string; hint: string }[] = [
  { key: "auto", th: "อัตโนมัติ", hint: "ชิ้นแคบใช้ซิกแซก ชิ้นกว้างถมเต็ม" },
  { key: "fill", th: "ถมเต็ม", hint: "แถวขนานเต็มพื้นที่ (tatami)" },
  { key: "satin", th: "ซิกแซก", hint: "ฝีพาดข้ามชิ้น เงา เหมาะตัวหนังสือ" },
  { key: "run", th: "เดินเส้น", hint: "ปักตามขอบอย่างเดียว" },
  { key: "skip", th: "ไม่ปัก", hint: "ข้ามชิ้นนี้" },
];
export const isStitchType = (v: unknown): v is StitchType => STITCH_TYPES.some((t) => t.key === v);

/** ตั้งค่าต่อ 1 สี (สีด้าย) */
export type ColorSetting = { type: StitchType; angle: number; thread: string; on: boolean };
/** ตั้งค่างานปัก (เก็บใน embroidery_designs.settings) */
export type EmbSettings = {
  /** กว้างจริงที่จะปัก (มม.) — สูงคิดตามสัดส่วน */ width_mm: number;
  /** ระยะห่างแถวถมเต็ม (มม.) ยิ่งน้อยยิ่งแน่น */ fill_spacing: number;
  /** ระยะห่างฝีซิกแซก (มม.) */ satin_spacing: number;
  /** ความยาวฝีถมเต็ม (มม.) */ fill_len: number;
  /** ความยาวฝีเดินเส้น (มม.) */ run_len: number;
  /** ชดเชยผ้าหด — ยืดปลายฝีออกข้างละ (มม.) */ pull_comp: number;
  /** ตั้งค่าตามสี — key = "#rrggbb" */ colors: Record<string, ColorSetting>;
  /** ลำดับสีที่ปัก (สีที่ไม่อยู่ในนี้ต่อท้ายตามลำดับในไฟล์) */ color_order: string[];
  /** ชนิดฝีเข็มรายชิ้น (ทับค่าของสี) — key = id ชิ้น */ piece_types: Record<string, StitchType>;
  /** ฝีรองพื้นอัตโนมัติ (ใต้ถมเต็ม/ซิกแซก) */ underlay: boolean;
  /** ย้ายไกลเกินนี้ (มม.) = ตัดด้าย · ใกล้กว่า = กระโดดไม่ตัด */ trim_at: number;
  /** สีพื้นผ้า (ภาพตัวอย่าง/ใบสั่งปัก) */ fabric: string;
  /** ซิกแซกเลี้ยวตามเส้น (false = ทิศเดียวทั้งชิ้นแบบเดิม) */ satin_follow: boolean;
  /** ขอบซิกแซกรอบพื้นถม กว้าง (มม.) · 0 = ไม่ใส่ */ border_mm: number;
  /** ถมเต็ม: ชิ้นยาวตั้งมุมแถวตามรูปทรงเอง (ไม่ใช้มุมของสี) */ fill_auto_angle: boolean;
  /** ตั้งค่ารายชิ้น (ทับค่าของสี/ทั้งงาน) — key = id ชิ้น */ piece_opts: Record<string, PieceOpt>;
  /** ลำดับปักที่ตั้งเอง (id ชิ้น) · ว่าง = อัตโนมัติ (ตามลำดับสี แล้วใกล้สุดก่อน) */ sequence: string[];
};
/** ตั้งค่ารายชิ้น · lines = เส้นทิศฝีเข็มที่ลากเอง (มม. พิกัดในไฟล์ เหมือน ax/ay ของชิ้น — ย่อขยายงานแล้วยังตรง) */
export type PieceOpt = { angle?: number; spacing?: number; underlay?: boolean; lines?: DirLine[] };

export const DEFAULTS = { fill_spacing: 0.45, satin_spacing: 0.4, fill_len: 3.5, run_len: 2.5, pull_comp: 0.2, angle: 45, trim_at: 4, fabric: "#ffffff", border_mm: 1.2 };
export const LIMITS = { width_min: 5, width_max: 400, spacing_min: 0.2, spacing_max: 2, len_min: 1, len_max: 7, comp_max: 1, trim_min: 2, trim_max: 12, border_max: 4 };
/** สีพื้นผ้าที่เลือกได้เร็ว */
export const FABRICS: { hex: string; th: string }[] = [
  { hex: "#ffffff", th: "ขาว" }, { hex: "#f3ead8", th: "ครีม" }, { hex: "#c8a97e", th: "กากี" }, { hex: "#7a4a2a", th: "น้ำตาล" },
  { hex: "#1f2a44", th: "กรม" }, { hex: "#2b2b2b", th: "ดำ" }, { hex: "#8a1c1c", th: "แดงเลือดหมู" }, { hex: "#5b6b4a", th: "เขียวขี้ม้า" },
];
/** ความกว้างเฉลี่ยที่ "อัตโนมัติ" เปลี่ยนจากซิกแซกเป็นถมเต็ม */
export const AUTO_SATIN_MAX = 6;
/** ซิกแซกกว้างกว่านี้ ด้ายหลวม/เกี่ยวง่าย → แบ่งฝีกลางทาง */
export const SATIN_SPLIT = 8;
/** ฝีที่ยาวที่สุดที่ไฟล์ DST เขียนได้ใน 1 คำสั่ง (12.1 มม.) */
const DST_MAX = 12.1;
const TRAVEL_STITCH_MAX = 2;
const TIE = 0.4;

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** สีของชิ้น (ไม่มีสี = ดำ) */
export const pieceColor = (p: BlockPiece) => p.color ?? "#000000";

/** สีทั้งหมดในงาน ตามลำดับที่เจอในไฟล์ (onlyOn = เฉพาะชิ้นที่เลือกปัก) */
export function colorsOf(pieces: BlockPiece[], onlyOn = false): string[] {
  const out: string[] = [];
  for (const p of pieces) { if (onlyOn && !isActive(p)) continue; const c = pieceColor(p); if (!out.includes(c)) out.push(c); }
  return out;
}
/** ชิ้นที่เลือกปัก (ติ๊ก on และไม่ใช่พื้นหลัง) */
export const isActive = (p: BlockPiece) => p.on !== false && p.kind !== "background";

/** ค่าตั้งต้นของงานใหม่ */
export function defaultSettings(pieces: BlockPiece[], widthMm: number): EmbSettings {
  const colors: Record<string, ColorSetting> = {};
  for (const c of colorsOf(pieces)) colors[c] = { type: "auto", angle: DEFAULTS.angle, thread: "", on: true };
  return {
    width_mm: clamp(r2(widthMm || 80), LIMITS.width_min, LIMITS.width_max),
    fill_spacing: DEFAULTS.fill_spacing, satin_spacing: DEFAULTS.satin_spacing, fill_len: DEFAULTS.fill_len,
    run_len: DEFAULTS.run_len, pull_comp: DEFAULTS.pull_comp, colors, color_order: colorsOf(pieces), piece_types: {},
    underlay: true, trim_at: DEFAULTS.trim_at, fabric: DEFAULTS.fabric, satin_follow: true, border_mm: DEFAULTS.border_mm,
    fill_auto_angle: true, piece_opts: {}, sequence: [],
  };
}

/** ตรวจ/ทำความสะอาดค่าตั้ง (จากหน้าเว็บ/ฐานข้อมูล) */
export function cleanSettings(raw: unknown, pieces: BlockPiece[]): EmbSettings {
  const o = (raw ?? {}) as Record<string, unknown>;
  const base = defaultSettings(pieces, num(o.width_mm, 80));
  const colors: Record<string, ColorSetting> = {};
  const rc = (o.colors ?? {}) as Record<string, Record<string, unknown>>;
  for (const c of Object.keys(base.colors)) {
    const v = rc[c] ?? {};
    colors[c] = {
      type: isStitchType(v.type) ? v.type : "auto",
      angle: ((Math.round(num(v.angle, DEFAULTS.angle)) % 180) + 180) % 180,
      thread: String(v.thread ?? "").trim().slice(0, 60),
      on: v.on !== false,
    };
  }
  const order = Array.isArray(o.color_order) ? (o.color_order as unknown[]).map(String).filter((c) => c in colors) : [];
  for (const c of Object.keys(colors)) if (!order.includes(c)) order.push(c);
  const ids = new Set(pieces.map((p) => p.id));
  const pt: Record<string, StitchType> = {};
  for (const [k, v] of Object.entries((o.piece_types ?? {}) as Record<string, unknown>)) if (ids.has(k) && isStitchType(v)) pt[k] = v;
  return {
    width_mm: base.width_mm,
    fill_spacing: clamp(num(o.fill_spacing, DEFAULTS.fill_spacing), LIMITS.spacing_min, LIMITS.spacing_max),
    satin_spacing: clamp(num(o.satin_spacing, DEFAULTS.satin_spacing), LIMITS.spacing_min, LIMITS.spacing_max),
    fill_len: clamp(num(o.fill_len, DEFAULTS.fill_len), LIMITS.len_min, LIMITS.len_max),
    run_len: clamp(num(o.run_len, DEFAULTS.run_len), LIMITS.len_min, LIMITS.len_max),
    pull_comp: clamp(num(o.pull_comp, DEFAULTS.pull_comp), 0, LIMITS.comp_max),
    colors, color_order: order, piece_types: pt,
    underlay: o.underlay !== false,
    trim_at: clamp(num(o.trim_at, DEFAULTS.trim_at), LIMITS.trim_min, LIMITS.trim_max),
    fabric: typeof o.fabric === "string" && /^#[0-9a-f]{6}$/i.test(o.fabric) ? o.fabric.toLowerCase() : DEFAULTS.fabric,
    satin_follow: o.satin_follow !== false,
    border_mm: r2(clamp(num(o.border_mm, DEFAULTS.border_mm), 0, LIMITS.border_max)),
    fill_auto_angle: o.fill_auto_angle !== false,
    piece_opts: cleanPieceOpts(o.piece_opts, ids),
    sequence: Array.isArray(o.sequence) ? [...new Set((o.sequence as unknown[]).map(String).filter((id) => ids.has(id)))] : [],
  };
}

/** ตั้งค่ารายชิ้น: ตัดชิ้นที่ไม่มีแล้ว · ตัวเลขอยู่ในช่วง · เส้นทิศไม่เกิน 20 เส้นต่อชิ้น · ชิ้นที่ไม่มีค่าอะไรเลยไม่เก็บ */
function cleanPieceOpts(raw: unknown, ids: Set<string>): Record<string, PieceOpt> {
  const out: Record<string, PieceOpt> = {};
  for (const [id, v] of Object.entries((raw ?? {}) as Record<string, Record<string, unknown>>)) {
    if (!ids.has(id) || !v || typeof v !== "object") continue;
    const o: PieceOpt = {};
    if (v.angle != null && Number.isFinite(Number(v.angle))) o.angle = ((Math.round(Number(v.angle)) % 180) + 180) % 180;
    if (v.spacing != null && Number.isFinite(Number(v.spacing))) o.spacing = r2(clamp(Number(v.spacing), LIMITS.spacing_min, LIMITS.spacing_max));
    if (typeof v.underlay === "boolean") o.underlay = v.underlay;
    if (Array.isArray(v.lines)) {
      const ls = (v.lines as unknown[]).filter((l): l is number[] => Array.isArray(l) && l.length === 4 && l.every((n) => Number.isFinite(Number(n))))
        .map((l) => l.map((n) => Math.round(Number(n) * 1000) / 1000) as DirLine).filter(([a, b, c, d]) => Math.hypot(c - a, d - b) > 0.01).slice(0, 20);
      if (ls.length) o.lines = ls;
    }
    if (Object.keys(o).length) out[id] = o;
  }
  return out;
}

/**
 * มุมแถวของชิ้น (ถมเต็ม/ซิกแซกทิศเดียว): ตั้งเองรายชิ้น > เส้นทิศที่ลาก (ทิศฝีเข็มตรงกลางชิ้น) > ชิ้นยาว + ตั้งมุมตามรูปทรง > มุมของสี
 *   ถมเต็มตามรูปทรง = แนวยาวของชิ้น + 45° (แถวเฉียงข้ามชิ้นสม่ำเสมอทุกชิ้น ไม่ใช่ 45° ของหน้ากระดาษ)
 */
export function pieceAngle(rings: Pt[][], type: ResolvedType, st: EmbSettings, colorAngle: number, po: PieceOpt, lines: DirLine[]): number {
  if (po.angle != null) return po.angle;
  if (lines.length) {
    let n = 0, mx = 0, my = 0;
    for (const r of rings) for (const p of r) { n++; mx += p[0]; my += p[1]; }
    const d = dirAt(lines, n ? [mx / n, my / n] : [0, 0]);
    // ทิศฝีเข็ม = ทิศเส้นที่ลาก → แถวถมเต็มวิ่งตามเส้นนั้น
    if (d) return ((Math.atan2(d[1], d[0]) * 180) / Math.PI + 180) % 180;
  }
  if (type === "fill" && st.fill_auto_angle !== false) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const ax = mainAxisDeg(rings), t = (-ax * Math.PI) / 180;
    for (const r of rings) for (const [x, y] of r) { const u = x * Math.cos(t) - y * Math.sin(t), v = x * Math.sin(t) + y * Math.cos(t); x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
    if (y1 - y0 > 0 && (x1 - x0) / (y1 - y0) >= 1.6) return Math.round(ax + 45) % 180;
  }
  return colorAngle;
}

// ───────── เรขาคณิต ─────────

/** กรอบรวมของชิ้นทั้งหมด (ตำแหน่งในไฟล์ · มม.) */
export function designBox(pieces: BlockPiece[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pieces) { x0 = Math.min(x0, p.ax); y0 = Math.min(y0, p.ay); x1 = Math.max(x1, p.ax + p.ow); y1 = Math.max(y1, p.ay + p.oh); }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
}

/** เส้นโค้ง → เส้นตรงหลายท่อน (วง = เส้นปิด 1 วง) */
export function flattenOps(d: number[], tol = 0.1): Pt[][] {
  const rings: Pt[][] = [];
  let cur: Pt[] = [];
  let p: Pt = [0, 0];
  const push = () => { if (cur.length >= 3) rings.push(cur); cur = []; };
  const curve = (pts: Pt[]) => {
    const len = pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
    const n = Math.max(2, Math.min(64, Math.ceil(len / Math.max(0.05, tol * 4))));
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      const q: Pt = pts.length === 4
        ? [u * u * u * pts[0][0] + 3 * u * u * t * pts[1][0] + 3 * u * t * t * pts[2][0] + t * t * t * pts[3][0], u * u * u * pts[0][1] + 3 * u * u * t * pts[1][1] + 3 * u * t * t * pts[2][1] + t * t * t * pts[3][1]]
        : [u * u * pts[0][0] + 2 * u * t * pts[1][0] + t * t * pts[2][0], u * u * pts[0][1] + 2 * u * t * pts[1][1] + t * t * pts[2][1]];
      cur.push(q);
    }
  };
  eachOp(d, (op, a) => {
    if (op === OP.M) { push(); p = [a[0], a[1]]; cur.push(p); }
    else if (op === OP.L) { p = [a[0], a[1]]; cur.push(p); }
    else if (op === OP.C) { curve([p, [a[0], a[1]], [a[2], a[3]], [a[4], a[5]]]); p = [a[4], a[5]]; }
    else if (op === OP.Q) { curve([p, [a[0], a[1]], [a[2], a[3]]]); p = [a[2], a[3]]; }
    else if (op === OP.Z) push();
  });
  push();
  // ตัดจุดซ้ำติดกัน + จุดท้ายที่ซ้ำจุดแรก
  return rings.map((r) => r.filter((q, i) => i === 0 || Math.hypot(q[0] - r[i - 1][0], q[1] - r[i - 1][1]) > 1e-6))
    .map((r) => (r.length > 1 && Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) < 1e-6 ? r.slice(0, -1) : r))
    .filter((r) => r.length >= 3);
}

/** ชิ้น → วงเส้นตรง ตำแหน่งจริงหลังย่อ/ขยาย (มม. · มุมซ้ายบนของงาน = 0,0) */
export function pieceRings(p: BlockPiece, scale: number, origin: { x: number; y: number }): Pt[][] {
  const out: Pt[][] = [];
  for (const sh of pieceShapes(p)) {
    for (const r of flattenOps(sh.d, 0.1 / Math.max(scale, 0.01))) out.push(r.map(([x, y]) => [(x + p.ax - origin.x) * scale, (y + p.ay - origin.y) * scale]));
  }
  return out;
}

export function ringsArea(rings: Pt[][]): number {
  let a = 0;
  for (const r of rings) for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a / 2);
}
export function ringsPerimeter(rings: Pt[][]): number {
  let s = 0;
  for (const r of rings) for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; s += Math.hypot(q[0] - p[0], q[1] - p[1]); }
  return s;
}
/** ความกว้างเฉลี่ยของชิ้น (มม.) ≈ 2 × พื้นที่ ÷ เส้นรอบ — แท่งยาวกว้าง 1 มม. ได้ ~1 · วงกลมได้ ~รัศมี */
export const meanWidth = (rings: Pt[][]) => { const per = ringsPerimeter(rings); return per > 0 ? (2 * ringsArea(rings)) / per : 0; };

/** แนวยาวของชิ้น (องศา 0-180) จากการกระจายของจุดขอบ */
export function mainAxisDeg(rings: Pt[][]): number {
  let n = 0, mx = 0, my = 0;
  for (const r of rings) for (const p of r) { n++; mx += p[0]; my += p[1]; }
  if (!n) return 0;
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const r of rings) for (const p of r) { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const deg = (Math.atan2(2 * sxy, sxx - syy) / 2) * (180 / Math.PI);
  return ((deg % 180) + 180) % 180;
}

const rot = (p: Pt, c: number, s: number): Pt => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];

type Seg = { row: number; y: number; x0: number; x1: number; used?: boolean };

/** ตัดชิ้นเป็นแถวขนานแนวนอน (ในกรอบที่หมุนแล้ว) → ช่วงที่อยู่ในชิ้นของแต่ละแถว */
export function scanSegments(rings: Pt[][], fill: FillRule, spacing: number): Seg[] {
  let y0 = Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const segs: Seg[] = [];
  if (!Number.isFinite(y0) || y1 - y0 < 1e-6) return segs;
  const rows = Math.floor((y1 - y0) / spacing);
  const off = ((y1 - y0) - rows * spacing) / 2;
  for (let i = 0; i <= rows; i++) {
    const y = y0 + off + i * spacing;
    const xs: { x: number; dir: number }[] = [];
    for (const r of rings) for (let k = 0; k < r.length; k++) {
      const a = r[k], b = r[(k + 1) % r.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push({ x: a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), dir: b[1] > a[1] ? 1 : -1 });
    }
    xs.sort((p, q) => p.x - q.x);
    let w = 0, start = 0;
    for (const e of xs) {
      const was = fill === "evenodd" ? w % 2 !== 0 : w !== 0;
      w += fill === "evenodd" ? 1 : e.dir;
      const now = fill === "evenodd" ? w % 2 !== 0 : w !== 0;
      if (!was && now) start = e.x;
      else if (was && !now && e.x - start > 0.05) segs.push({ row: i, y, x0: start, x1: e.x });
    }
  }
  return segs;
}

/** จัดช่วงเป็นบล็อกที่ปักต่อกันได้ (แถวติดกัน + ซ้อนกันในแนวนอน) — เริ่มจากแถวบนสุดก่อน */
export function blocksOf(segs: Seg[]): Seg[][] {
  const byRow = new Map<number, Seg[]>();
  for (const s of segs) { const a = byRow.get(s.row) ?? []; a.push(s); byRow.set(s.row, a); }
  const sorted = [...segs].sort((a, b) => a.row - b.row || a.x0 - b.x0);
  const blocks: Seg[][] = [];
  for (const first of sorted) {
    if (first.used) continue;
    first.used = true;
    const blk = [first];
    let cur = first;
    for (;;) {
      const next = (byRow.get(cur.row + 1) ?? []).filter((s) => !s.used && Math.min(s.x1, cur.x1) - Math.max(s.x0, cur.x0) > 0)
        .sort((a, b) => (Math.min(b.x1, cur.x1) - Math.max(b.x0, cur.x0)) - (Math.min(a.x1, cur.x1) - Math.max(a.x0, cur.x0)))[0];
      if (!next) break;
      next.used = true; blk.push(next); cur = next;
    }
    blocks.push(blk);
  }
  return blocks;
}

/** ฝีของบล็อกแถว (ไปกลับทีละแถว) · len = ฝียาวสุดในแถว (Infinity = ฝีเดียวพาด) · stagger = เหลื่อมแบบก่ออิฐ */
function rowStitches(blk: Seg[], len: number, comp: number, stagger: boolean): Pt[] {
  const out: Pt[] = [];
  blk.forEach((s, i) => {
    const a = s.x0 - comp, b = s.x1 + comp;
    const xs: number[] = [a];
    if (Number.isFinite(len)) {
      const phase = stagger ? ((s.row % 3) / 3) * len : 0;
      for (let k = Math.ceil((a - phase) / len); ; k++) {
        const x = k * len + phase;
        if (x >= b - 0.5) break;
        if (x > a + 0.5) xs.push(x);
      }
    }
    xs.push(b);
    const row = i % 2 === 0 ? xs : xs.reverse();
    for (const x of row) out.push([x, s.y]);
  });
  return out;
}

export type ResolvedType = Exclude<StitchType, "auto">;
/** ชนิดฝีเข็มจริงของชิ้น (ตามชิ้น > ตามสี > อัตโนมัติ) */
export function resolveType(p: BlockPiece, st: EmbSettings, width: number): ResolvedType {
  const t = st.piece_types[p.id] ?? st.colors[pieceColor(p)]?.type ?? "auto";
  if (t !== "auto") return t;
  return width <= AUTO_SATIN_MAX ? "satin" : "fill";
}

/** ฝีเดินเส้นตามวง (ข้ามจุดที่ใกล้กันเกินไปของเส้นโค้งที่แตกเป็นท่อนสั้น) */
function runRing(r: Pt[], len: number): Pt[] {
  const out: Pt[] = [r[0]];
  for (let i = 1; i <= r.length; i++) {
    const a = r[i - 1], b = r[i % r.length];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(d / len));
    for (let k = 1; k <= n; k++) {
      const q: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      const last = out[out.length - 1];
      if (Math.hypot(q[0] - last[0], q[1] - last[1]) >= Math.min(len, 0.6) || i === r.length) out.push(q);
    }
  }
  return out;
}

/** แถวขนานตามมุม → บล็อกฝีเข็ม (ใช้ทั้งถมเต็ม ซิกแซก และฝีรองพื้น) · comp ติดลบ = หดเข้าจากขอบ · minSeg = ทิ้งช่วงสั้นกว่านี้ */
function rowBlocks(rings: Pt[][], fill: FillRule, deg: number, spacing: number, len: number, comp: number, stagger: boolean, minSeg = 0): Pt[][] {
  const t = (deg * Math.PI) / 180, c = Math.cos(-t), s = Math.sin(-t), cb = Math.cos(t), sb = Math.sin(t);
  const rr = rings.map((r) => r.map((p) => rot(p, c, s)));
  const segs = scanSegments(rr, fill, spacing).filter((g) => g.x1 - g.x0 + 2 * comp >= Math.max(minSeg, 0.05));
  return blocksOf(segs).map((blk) => rowStitches(blk, len, comp, stagger).map((p) => rot(p, cb, sb)));
}

/**
 * ฝีเข็มของ 1 ชิ้น → รายการบล็อก (แต่ละบล็อกปักต่อกันโดยไม่ตัดด้าย) · ฝีรองพื้นมาก่อนเสมอ
 *   ฝีรองพื้น (underlay): ถมเต็ม = แถวห่าง 2.5 มม. ตั้งฉากกับแถวจริง หดจากขอบ 0.5 มม. · ซิกแซก = ซิกแซกห่าง 1.6 มม. หดจากขอบ 0.4 มม.
 *   ส่วนแคบกว่า ~1.2 มม. ไม่ใส่ฝีรองพื้น (หดแล้วไม่เหลือ)
 */
export function pieceBlocks(rings: Pt[][], fill: FillRule, type: ResolvedType, stIn: EmbSettings, angleDeg: number, po: { lines?: DirLine[]; spacing?: number; underlay?: boolean } = {}): { under: Pt[][]; top: Pt[][]; edge: Pt[][] } {
  if (type === "skip" || !rings.length) return { under: [], top: [], edge: [] };
  // ค่ารายชิ้นทับค่าทั้งงาน (ความแน่น · ฝีรองพื้น)
  const st: EmbSettings = { ...stIn, ...(po.spacing != null ? (type === "satin" ? { satin_spacing: po.spacing } : { fill_spacing: po.spacing }) : {}), ...(po.underlay != null ? { underlay: po.underlay } : {}) };
  if (type === "run") return { under: [], top: rings.map((r) => runRing(r, st.run_len)), edge: [] };
  const satin = type === "satin";
  const width = meanWidth(rings);
  if (satin && st.satin_follow !== false) {
    const t = turningSatin(rings, fill, { spacing: st.satin_spacing, comp: st.pull_comp, underlay: st.underlay, meanWidth: width, lines: po.lines });
    if (t) return { ...t, edge: [] };
  }
  // ขอบซิกแซกรอบพื้นถม: เฉพาะชิ้นที่กว้างพอ (≥ 3 เท่าของขอบ) ไม่งั้นขอบกินทั้งชิ้น
  const edge = !satin && (st.border_mm ?? 0) > 0 && width >= st.border_mm * 3 ? satinBorder(rings, fill, { width: st.border_mm, spacing: st.satin_spacing, comp: st.pull_comp }) : [];
  // satin: ฝีขวางแนวยาวของชิ้น = แถววางตั้งฉากกับแนวยาว
  const deg = satin ? mainAxisDeg(rings) + 90 : angleDeg;
  const top = rowBlocks(rings, fill, deg, satin ? st.satin_spacing : st.fill_spacing, satin ? SATIN_SPLIT : st.fill_len, st.pull_comp, !satin);
  const under = !st.underlay ? []
    : satin ? rowBlocks(rings, fill, deg, 1.6, SATIN_SPLIT, -0.4, false, 0.4)
    : rowBlocks(rings, fill, deg + 90, 2.5, st.fill_len, -0.5, false, 0.5);
  return { under, top, edge };
}

// ───────── แผนการปักทั้งงาน ─────────

export type Cmd = { t: "stitch" | "jump" | "trim" | "color" | "end"; x: number; y: number; c?: number };
export type ColorBlock = { color: string; thread: string; stitches: number; pieces: number };
export type BoxMm = { x: number; y: number; w: number; h: number };
export type PieceInfo = {
  id: string; name: string; color: string; type: ResolvedType; width: number; area: number; stitches: number;
  warn: string | null; level: "danger" | "warn" | null; kind: WarnKind | null;
  /** กรอบ + วงเส้นของชิ้น (มม. · จุดกึ่งกลางงาน = 0,0) — ใช้หาชิ้นที่คลิก / ไฮไลต์ */
  box: BoxMm; rings: Pt[][];
  /** คำสั่งช่วงของชิ้นนี้ใน cmds [เริ่ม, จบ) */ cmdFrom: number; cmdTo: number;
};
export type EmbPlan = {
  cmds: Cmd[]; colors: ColorBlock[]; pieces: PieceInfo[];
  stitches: number; jumps: number; trims: number; colorChanges: number;
  width: number; height: number; minutes: number;
};

export type WarnKind = "tiny" | "thin" | "wide";
/** คำเตือนรายชิ้น (ส่วนที่บาง/เล็กเกินปัก) */
export function pieceWarning(type: ResolvedType, width: number, box: { w: number; h: number }): { warn: string | null; level: PieceInfo["level"]; kind: WarnKind | null } {
  if (type === "skip") return { warn: null, level: null, kind: null };
  if (Math.max(box.w, box.h) < 1.5) return { warn: "เล็กเกินปัก (ต่ำกว่า 1.5 มม.) — ร้านมักปักไม่ขึ้น", level: "danger", kind: "tiny" };
  if (type !== "run" && width < 0.8) return { warn: `บางมาก ${width.toFixed(1)} มม. — ปักไม่ขึ้น ลองขยายงานหรือเปลี่ยนเป็นเดินเส้น`, level: "danger", kind: "thin" };
  if (type !== "run" && width < 1.5) return { warn: `บาง ${width.toFixed(1)} มม. — อาจปักไม่ชัด (ตัวหนังสือควรหนาเส้น ≥ 1.5 มม.)`, level: "warn", kind: "thin" };
  if (type === "satin" && width > SATIN_SPLIT + 1) return { warn: `ซิกแซกกว้าง ${width.toFixed(1)} มม. — ด้ายหลวม/เกี่ยวง่าย ควรใช้ถมเต็ม`, level: "warn", kind: "wide" };
  return { warn: null, level: null, kind: null };
}

/** ทั้งงาน → คำสั่งเครื่องปัก (มม. · จุดกึ่งกลางงาน = 0,0 · แกน y ชี้ลง) — คิดเฉพาะชิ้นที่เลือกปัก */
export function buildPlan(pieces: BlockPiece[], st: EmbSettings): EmbPlan {
  const active = pieces.filter(isActive);
  const box = designBox(active);
  const scale = box.w > 0 ? st.width_mm / box.w : 1;
  const W = box.w * scale, H = box.h * scale;
  const cx = W / 2, cy = H / 2;
  const cmds: Cmd[] = [];
  const colors: ColorBlock[] = [];
  const infos: PieceInfo[] = [];
  let pos: Pt = [0, 0];
  let stitches = 0, jumps = 0, trims = 0, changes = 0;
  let needle = false;   // มีด้ายอยู่ในผ้า (ต้องล็อก/ตัดก่อนกระโดด)

  const stitchTo = (q: Pt) => {
    const d = Math.hypot(q[0] - pos[0], q[1] - pos[1]);
    if (d < 0.05) return;
    const n = Math.ceil(d / DST_MAX);
    for (let k = 1; k <= n; k++) cmds.push({ t: "stitch", x: pos[0] + ((q[0] - pos[0]) * k) / n, y: pos[1] + ((q[1] - pos[1]) * k) / n });
    stitches += n; pos = q;
  };
  const jumpTo = (q: Pt) => {
    const d = Math.hypot(q[0] - pos[0], q[1] - pos[1]);
    if (d < 0.05) return;
    const n = Math.ceil(d / DST_MAX);
    for (let k = 1; k <= n; k++) cmds.push({ t: "jump", x: pos[0] + ((q[0] - pos[0]) * k) / n, y: pos[1] + ((q[1] - pos[1]) * k) / n });
    jumps += n; pos = q;
  };
  const tie = (toward: Pt) => {
    const d = Math.hypot(toward[0] - pos[0], toward[1] - pos[1]) || 1;
    const p2: Pt = [pos[0] + ((toward[0] - pos[0]) / d) * TIE, pos[1] + ((toward[1] - pos[1]) / d) * TIE];
    const here = pos; stitchTo(p2); stitchTo(here);
  };
  let last: Pt = [0, 0];
  const trim = () => { if (needle) { tie(last); cmds.push({ t: "trim", x: pos[0], y: pos[1] }); trims++; needle = false; } };
  /** ไปจุดเริ่มบล็อกถัดไป: ใกล้มาก = เย็บต่อ · ไม่ไกล = กระโดดไม่ตัด · ไกล = ล็อก → ตัด → กระโดด */
  const travel = (start: Pt, next: Pt, newColor: boolean) => {
    const d = Math.hypot(start[0] - pos[0], start[1] - pos[1]);
    if (needle && !newColor && d <= TRAVEL_STITCH_MAX) { stitchTo(start); return; }
    if (needle && !newColor && d <= st.trim_at) { jumpTo(start); tie(next); return; }
    trim();
    if (newColor) { cmds.push({ t: "color", x: pos[0], y: pos[1] }); changes++; }
    jumpTo(start); tie(next); needle = true;
  };
  const dist = (p: Pt) => Math.hypot(p[0] - pos[0], p[1] - pos[1]);
  /** เรียงบล็อกแบบ "ใกล้สุดก่อน" (เลือกกลับหัวบล็อกได้ถ้าปลายอีกด้านใกล้กว่า — ฝีถม/ซิกแซกเย็บย้อนได้) */
  const nearestOrder = (blocks: Pt[][], from: Pt): Pt[][] => {
    const left = blocks.filter((b) => b.length);
    const out: Pt[][] = [];
    let at = from;
    while (left.length) {
      let bi = 0, rev = false, bd = Infinity;
      left.forEach((b, i) => {
        const d0 = Math.hypot(b[0][0] - at[0], b[0][1] - at[1]);
        const d1 = Math.hypot(b[b.length - 1][0] - at[0], b[b.length - 1][1] - at[1]);
        if (d0 < bd) { bd = d0; bi = i; rev = false; }
        if (d1 < bd) { bd = d1; bi = i; rev = true; }
      });
      const b = left.splice(bi, 1)[0];
      const o = rev ? [...b].reverse() : b;
      out.push(o); at = o[o.length - 1];
    }
    return out;
  };

  const order = st.color_order.filter((c) => st.colors[c]);
  for (const c of colorsOf(active)) if (!order.includes(c)) order.push(c);
  // เตรียมฝีเข็มทุกชิ้นก่อน (เส้นทิศ/มุม/ความแน่นรายชิ้นแปลงจากพิกัดไฟล์ → พิกัดงาน)
  const toPlan = (x: number, y: number): Pt => [(x - box.x) * scale - cx, (y - box.y) * scale - cy];
  const prepAll = active.map((p) => {
    const color = pieceColor(p);
    const cs = st.colors[color];
    const po = st.piece_opts?.[p.id] ?? {};
    const rings = pieceRings(p, scale, box).map((r) => r.map(([x, y]) => [x - cx, y - cy] as Pt));
    const width = meanWidth(rings);
    const type: ResolvedType = cs && cs.on === false ? "skip" : resolveType(p, st, width);
    const lines = (po.lines ?? []).map(([x1, y1, x2, y2]) => [...toPlan(x1, y1), ...toPlan(x2, y2)] as DirLine);
    const blocks = pieceBlocks(rings, p.fill, type, st, pieceAngle(rings, type, st, cs?.angle ?? DEFAULTS.angle, po, lines), { lines, spacing: po.spacing, underlay: po.underlay });
    const pb: BoxMm = { x: (p.ax - box.x) * scale - cx, y: (p.ay - box.y) * scale - cy, w: p.ow * scale, h: p.oh * scale };
    return { p, color, rings, width, type, blocks, pb };
  });
  type Prep = (typeof prepAll)[number];
  // ลำดับปัก: ตั้งเอง (sequence) = ปักตามนั้นเป๊ะ เปลี่ยนสีเมื่อสีต่างจากชิ้นก่อน · ไม่ตั้ง = ตามลำดับสี แล้วใกล้สุดก่อน
  const runs: { color: string; items: Prep[]; fixed: boolean }[] = [];
  const seq = (st.sequence ?? []).filter((id) => prepAll.some((t) => t.p.id === id));
  if (seq.length) {
    const byId = new Map(prepAll.map((t) => [t.p.id, t]));
    const ordered = [...seq.map((id) => byId.get(id)!), ...prepAll.filter((t) => !seq.includes(t.p.id))];
    for (const t of ordered) {
      const lastRun = runs[runs.length - 1];
      if (lastRun && lastRun.color === t.color) lastRun.items.push(t); else runs.push({ color: t.color, items: [t], fixed: true });
    }
  } else for (const color of order) runs.push({ color, items: prepAll.filter((t) => t.color === color), fixed: false });

  let first = true;
  for (const run of runs) {
    const color = run.color;
    const cs = st.colors[color];
    const block: ColorBlock = { color, thread: cs?.thread ?? "", stitches: 0, pieces: 0 };
    const before = stitches;
    let colorStarted = false;
    const todo = [...run.items];
    while (todo.length) {
      let bi = 0, bd = Infinity;
      // ชิ้นแรกของสี = มุมซ้ายบนสุด (เริ่มจากกลางงานแล้วต้องย้อนกลับ = ตัดด้ายเพิ่ม) · ชิ้นต่อไป = ใกล้เข็มที่สุด
      if (run.fixed) bi = 0;
      else if (!colorStarted) todo.forEach((t, i) => { const d = t.pb.x + t.pb.y; if (d < bd) { bd = d; bi = i; } });
      else todo.forEach((t, i) => {
        const all = [...t.blocks.under, ...t.blocks.top, ...t.blocks.edge];
        if (!all.length) { if (bd > 1e9) { bd = 1e9; bi = i; } return; }
        const d = Math.min(...all.map((b) => Math.min(dist(b[0]), dist(b[b.length - 1]))));
        if (d < bd) { bd = d; bi = i; }
      });
      const t = todo.splice(bi, 1)[0];
      const pStart = stitches, cFrom = cmds.length;
      const under = nearestOrder(t.blocks.under, pos);
      const endOf = (bs: Pt[][], d: Pt) => (bs.length ? bs[bs.length - 1][bs[bs.length - 1].length - 1] : d);
      const top = nearestOrder(t.blocks.top, endOf(under, pos));
      const edge = nearestOrder(t.blocks.edge, endOf(top, endOf(under, pos)));
      for (const blk of [...under, ...top, ...edge]) {
        travel(blk[0], blk[1] ?? blk[0], !colorStarted && !first);
        colorStarted = true;
        for (let i = 1; i < blk.length; i++) { last = pos; stitchTo(blk[i]); }
      }
      if (t.type !== "skip" && stitches > pStart) block.pieces++;
      const pw = pieceWarning(t.type, t.width, { w: t.pb.w, h: t.pb.h });
      infos.push({ id: t.p.id, name: t.p.name, color, type: t.type, width: r2(t.width), area: r2(ringsArea(t.rings)), stitches: stitches - pStart, ...pw, box: t.pb, rings: t.rings, cmdFrom: cFrom, cmdTo: cmds.length });
    }
    block.stitches = stitches - before;
    if (block.stitches > 0) { colors.push(block); first = false; trim(); }
  }
  trim();
  cmds.push({ t: "end", x: pos[0], y: pos[1] });
  // นาทีโดยประมาณ: 700 ฝี/นาที + เปลี่ยนสีครั้งละ ~0.5 นาที + ตัดด้ายครั้งละ ~3 วิ
  const minutes = stitches / 700 + changes * 0.5 + trims * 0.05;
  return { cmds, colors, pieces: infos, stitches, jumps, trims, colorChanges: changes, width: r2(W), height: r2(H), minutes: Math.round(minutes * 10) / 10 };
}

/** จุด (มม. ในพิกัดแผน) อยู่ในชิ้นไหน — ชิ้นเล็กสุดที่ครอบจุดนั้นชนะ (คลิกตัวอักษรบนพื้น = ได้ตัวอักษร) · ไม่โดนชิ้นไหน = ชิ้นที่ขอบใกล้สุดไม่เกิน tol */
export function pieceAt(plan: EmbPlan, x: number, y: number, tol = 0.8): PieceInfo | null {
  const inside = (rings: Pt[][]) => {
    let c = false;
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const hits = plan.pieces.filter((p) => x >= p.box.x - tol && x <= p.box.x + p.box.w + tol && y >= p.box.y - tol && y <= p.box.y + p.box.h + tol);
  const inHits = hits.filter((p) => inside(p.rings)).sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h);
  if (inHits.length) return inHits[0];
  let best: PieceInfo | null = null, bd = tol;
  for (const p of hits) for (const r of p.rings) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
    const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / L, 0, 1);
    const d = Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/** คำเตือนรวมกลุ่ม: ชิ้นที่เตือนแบบเดียวกันและอยู่ติดกัน (≤ 2 มม.) = 1 แถว · บอกขนาดที่ควรขยายเป็นเพื่อให้หาย */
export type WarnGroup = { key: string; level: "danger" | "warn"; kind: WarnKind; ids: string[]; box: BoxMm; text: string; fixWidthMm: number | null };
export function warningGroups(plan: EmbPlan, widthMm: number): WarnGroup[] {
  const warned = plan.pieces.filter((p) => p.warn && p.kind && p.level);
  const par = warned.map((_, i) => i);
  const find = (i: number): number => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let i = 0; i < warned.length; i++) for (let k = i + 1; k < warned.length; k++) {
    const a = warned[i], b = warned[k];
    if (a.kind !== b.kind) continue;
    const gx = Math.max(0, Math.max(a.box.x, b.box.x) - Math.min(a.box.x + a.box.w, b.box.x + b.box.w));
    const gy = Math.max(0, Math.max(a.box.y, b.box.y) - Math.min(a.box.y + a.box.h, b.box.y + b.box.h));
    if (gx <= 2 && gy <= 2) par[find(i)] = find(k);
  }
  const groups = new Map<number, PieceInfo[]>();
  warned.forEach((p, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), p]); });
  const out: WarnGroup[] = [];
  for (const list of groups.values()) {
    const kind = list[0].kind as WarnKind;
    const level = list.some((p) => p.level === "danger") ? "danger" : "warn";
    const x0 = Math.min(...list.map((p) => p.box.x)), y0 = Math.min(...list.map((p) => p.box.y));
    const x1 = Math.max(...list.map((p) => p.box.x + p.box.w)), y1 = Math.max(...list.map((p) => p.box.y + p.box.h));
    const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const n = list.length;
    const where = `${n > 1 ? `${n} ชิ้น ` : `"${list[0].name}" `}(กลุ่มสูง ${box.h.toFixed(1)} มม.)`;
    let text = "", fix: number | null = null;
    if (kind === "tiny") {
      const big = Math.max(...list.map((p) => Math.max(p.box.w, p.box.h)));
      fix = big > 0 ? widthMm * (1.5 / big) : null;
      text = `เล็กเกินปัก ${where} — ชิ้นใหญ่สุดแค่ ${big.toFixed(1)} มม.`;
    } else if (kind === "thin") {
      const thin = Math.min(...list.map((p) => p.width));
      fix = thin > 0 ? widthMm * (1.5 / thin) : null;
      text = `เส้นบาง ${where} — บางสุด ${thin.toFixed(1)} มม. (ควร ≥ 1.5 มม.)`;
    } else {
      text = `ซิกแซกกว้างเกิน ${where} — ควรใช้ถมเต็ม`;
    }
    out.push({ key: list.map((p) => p.id).join(","), level, kind, ids: list.map((p) => p.id), box, text, fixWidthMm: fix && fix <= LIMITS.width_max ? Math.ceil(fix / 5) * 5 : null });
  }
  return out.sort((a, b) => (a.level === b.level ? b.ids.length - a.ids.length : a.level === "danger" ? -1 : 1));
}

// ───────── เลือกส่วนที่จะปัก (ขั้นหลังเปิดไฟล์) ─────────

/** กลุ่มที่ระบบแยกให้ติ๊ก (ใช้ autoGroup ของบล็อกพิมพ์ — ห่างไม่เกิน gap = กลุ่มเดียวกัน) */
export type PickGroup = { key: string; ids: string[]; box: BoxMm; colors: string[]; on: boolean; kind?: "junk" | "note"; dupOf?: number };
/** สีแดงสด = สีที่ใบนำเสนอใช้เขียนคำกำกับ/เส้นบอกขนาด (เดา) */
const isMarkRed = (hex: string) => { const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return r >= 200 && g <= 90 && b <= 90; };
export function pickGroups(pieces: BlockPiece[], gapMm: number): PickGroup[] {
  const atoms = pieces.filter((p) => p.kind !== "background").map((p) => ({ ...p, on: true }));
  const groups = autoGroup(atoms, { overlap: true, gap: gapMm, hideJunk: true });
  const byId = new Map(atoms.map((p) => [p.id, p]));
  const out: PickGroup[] = groups.map((g) => {
    const ps = g.ids.map((id) => byId.get(id)!).filter(Boolean);
    const b = designBox(ps);
    return { key: g.ids.join(","), ids: g.ids, box: { x: b.x, y: b.y, w: b.w, h: b.h }, colors: colorsOf(ps), on: false, ...(g.kind ? { kind: "junk" as const } : {}) };
  });
  // เรียงบนลงล่าง ซ้ายไปขวา · ติ๊กให้ก่อน: กลุ่มใหญ่ (≥ 25% ของกลุ่มใหญ่สุด) ที่ไม่ซ้ำกับกลุ่มที่ติ๊กแล้ว
  out.sort((a, b) => (Math.abs(a.box.y - b.box.y) > Math.min(a.box.h, b.box.h) / 2 ? a.box.y - b.box.y : a.box.x - b.box.x));
  const area = (g: PickGroup) => g.box.w * g.box.h;
  // ไฟล์มีทั้งสีแดงสดและสีอื่น → กลุ่มที่เป็นสีแดงล้วน = คำกำกับ/เส้นบอกขนาด (ไม่ติ๊กให้ — ติ๊กเองได้)
  const hasOther = out.some((g) => !g.kind && g.colors.some((c) => !isMarkRed(c)));
  if (hasOther) for (const g of out) if (!g.kind && g.colors.length && g.colors.every(isMarkRed)) g.kind = "note";
  const maxA = Math.max(0, ...out.filter((g) => !g.kind).map(area));
  out.forEach((g, i) => {
    if (g.kind || area(g) < maxA * 0.25) return;
    const dup = out.findIndex((h, k) => k < i && h.on && h.ids.length === g.ids.length && Math.abs(h.box.w - g.box.w) <= h.box.w * 0.05 && Math.abs(h.box.h - g.box.h) <= h.box.h * 0.05);
    if (dup >= 0) { g.dupOf = dup; return; }
    g.on = true;
  });
  return out;
}

// ───────── ไฟล์ .DST (Tajima) ─────────

/** 1 คำสั่ง DST (dx, dy หน่วย 0.1 มม. ช่วง -121..121 · แกน y ชี้ขึ้น) → 3 ไบต์ */
export function dstRecord(dx: number, dy: number, kind: "stitch" | "jump" | "color" | "end"): [number, number, number] {
  let x = Math.round(dx), y = Math.round(dy);
  if (Math.abs(x) > 121 || Math.abs(y) > 121) throw new Error("ฝียาวเกิน 12.1 มม. ต่อคำสั่ง");
  let b0 = 0, b1 = 0, b2 = kind === "jump" ? 0x83 : kind === "color" ? 0xc3 : kind === "end" ? 0xf3 : 0x03;
  if (x > 40) { b2 |= 0x04; x -= 81; } if (x < -40) { b2 |= 0x08; x += 81; }
  if (x > 13) { b1 |= 0x04; x -= 27; } if (x < -13) { b1 |= 0x08; x += 27; }
  if (x > 4) { b0 |= 0x04; x -= 9; } if (x < -4) { b0 |= 0x08; x += 9; }
  if (x > 1) { b1 |= 0x01; x -= 3; } if (x < -1) { b1 |= 0x02; x += 3; }
  if (x > 0) { b0 |= 0x01; x -= 1; } if (x < 0) { b0 |= 0x02; x += 1; }
  if (y > 40) { b2 |= 0x20; y -= 81; } if (y < -40) { b2 |= 0x10; y += 81; }
  if (y > 13) { b1 |= 0x20; y -= 27; } if (y < -13) { b1 |= 0x10; y += 27; }
  if (y > 4) { b0 |= 0x20; y -= 9; } if (y < -4) { b0 |= 0x10; y += 9; }
  if (y > 1) { b1 |= 0x80; y -= 3; } if (y < -1) { b1 |= 0x40; y += 3; }
  if (y > 0) { b0 |= 0x80; y -= 1; } if (y < 0) { b0 |= 0x40; y += 1; }
  return [b0, b1, b2];
}

/** 3 ไบต์ DST → dx, dy (0.1 มม. · y ชี้ขึ้น) + ชนิด */
export function dstDecode(b0: number, b1: number, b2: number): { dx: number; dy: number; kind: "stitch" | "jump" | "color" | "end" } {
  const bit = (b: number, m: number) => ((b & m) !== 0 ? 1 : 0);
  const dx = bit(b0, 0x01) - bit(b0, 0x02) + 9 * (bit(b0, 0x04) - bit(b0, 0x08)) + 3 * (bit(b1, 0x01) - bit(b1, 0x02)) + 27 * (bit(b1, 0x04) - bit(b1, 0x08)) + 81 * (bit(b2, 0x04) - bit(b2, 0x08));
  const dy = bit(b0, 0x80) - bit(b0, 0x40) + 9 * (bit(b0, 0x20) - bit(b0, 0x10)) + 3 * (bit(b1, 0x80) - bit(b1, 0x40)) + 27 * (bit(b1, 0x20) - bit(b1, 0x10)) + 81 * (bit(b2, 0x20) - bit(b2, 0x10));
  const kind = b2 === 0xf3 ? "end" : (b2 & 0xc3) === 0xc3 ? "color" : (b2 & 0x83) === 0x83 ? "jump" : "stitch";
  return { dx, dy, kind };
}

/** แผนการปัก → ไบต์ไฟล์ .DST (หัวไฟล์ 512 ไบต์ + คำสั่งละ 3 ไบต์) · ตัดด้าย = กระโดดเปล่า 3 ครั้ง (ค่าตั้งต้นของเครื่อง Tajima) */
export function buildDst(plan: EmbPlan, label: string): Uint8Array {
  const recs: number[] = [];
  let cx = 0, cy = 0;   // ตำแหน่งปัจจุบัน หน่วย 0.1 มม. แกน y ชี้ขึ้น
  let minX = 0, maxX = 0, minY = 0, maxY = 0, count = 0, colorCount = 0;
  const emit = (dx: number, dy: number, kind: "stitch" | "jump" | "color" | "end") => {
    recs.push(...dstRecord(dx, dy, kind)); count++;
    cx += dx; cy += dy;
    minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
  };
  for (const c of plan.cmds) {
    if (c.t === "end") break;
    if (c.t === "trim") { emit(2, 2, "jump"); emit(-4, -4, "jump"); emit(2, 2, "jump"); continue; }
    if (c.t === "color") { emit(0, 0, "color"); colorCount++; continue; }
    const tx = Math.round(c.x * 10), ty = Math.round(-c.y * 10);
    let dx = tx - cx, dy = ty - cy;
    // กันพลาดจากการปัดเศษ: แตกเป็นคำสั่งย่อยไม่เกิน 121
    while (Math.abs(dx) > 121 || Math.abs(dy) > 121) {
      const n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 121);
      const sx = Math.round(dx / n), sy = Math.round(dy / n);
      emit(sx, sy, c.t === "jump" ? "jump" : "stitch"); dx -= sx; dy -= sy;
    }
    if (dx || dy || c.t === "stitch") emit(dx, dy, c.t === "jump" ? "jump" : "stitch");
  }
  recs.push(0, 0, 0xf3); count++;

  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
  const n5 = (v: number) => String(Math.abs(Math.round(v))).padStart(5, " ");
  const ascii = label.replace(/[^\x20-\x7e]/g, "").trim() || "DESIGN";
  const head =
    `LA:${pad(ascii, 16)}\r` +
    `ST:${String(count).padStart(7, " ")}\r` +
    `CO:${String(colorCount).padStart(3, " ")}\r` +
    `+X:${n5(maxX)}\r-X:${n5(minX)}\r+Y:${n5(maxY)}\r-Y:${n5(minY)}\r` +
    `AX:+${n5(cx)}\rAY:+${n5(cy)}\rMX:+    0\rMY:+    0\rPD:******\r\x1a`;
  const out = new Uint8Array(512 + recs.length);
  out.fill(0x20, 0, 512);
  for (let i = 0; i < head.length; i++) out[i] = head.charCodeAt(i) & 0xff;
  out.set(recs, 512);
  return out;
}

/** อ่านไฟล์ .DST กลับเป็นคำสั่ง (มม. · แกน y ชี้ลง) — ใช้ตรวจไฟล์ที่สร้าง/เทสต์ */
export function readDst(bytes: Uint8Array): { label: string; stitches: number; colors: number; cmds: Cmd[] } {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 512));
  const label = /LA:(.{0,16})/.exec(head)?.[1].trim() ?? "";
  const cmds: Cmd[] = [];
  let x = 0, y = 0, stitches = 0, colors = 0;
  for (let i = 512; i + 2 < bytes.length; i += 3) {
    const r = dstDecode(bytes[i], bytes[i + 1], bytes[i + 2]);
    if (r.kind === "end") { cmds.push({ t: "end", x: x / 10, y: -y / 10 }); break; }
    x += r.dx; y += r.dy;
    if (r.kind === "color") colors++;
    if (r.kind === "stitch") stitches++;
    cmds.push({ t: r.kind, x: x / 10, y: -y / 10 });
  }
  return { label, stitches, colors, cmds };
}

/** ชื่อไฟล์ที่ดาวน์โหลด (อังกฤษ/ตัวเลข — เครื่องปักบางรุ่นอ่านชื่อไทยไม่ได้) */
export function dstFileName(code: string, name: string): string {
  const safe = name.normalize("NFKD").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
  return `${code}${safe ? `_${safe}` : ""}.dst`;
}

/** ติ๊กเลือกชิ้นตามรายการ id (นอกนั้นไม่ปัก) */
export const withSelection = (pieces: BlockPiece[], ids: string[]): BlockPiece[] => {
  const set = new Set(ids);
  return pieces.map((p) => ({ ...p, on: set.has(p.id) }));
};
/** กว้างตั้งต้นของงาน = ขนาดส่วนที่เลือกในไฟล์ (ไม่ต่ำกว่า 3 ซม. ไม่เกิน 12 ซม. — ขนาดโลโก้ปักทั่วไป) */
export const startWidth = (pieces: BlockPiece[]) => Math.min(120, Math.max(30, designBox(pieces.filter(isActive)).w));
