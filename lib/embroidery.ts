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
 *   ⚠️ ข้อจำกัด (แปลงอัตโนมัติ ไม่ใช่คน digitize): ไม่มีฝีรองพื้น (underlay) · ซิกแซกทิศเดียวต่อชิ้น (ไม่เลี้ยวตามตัวอักษร)
 *      · ไม่ตัดส่วนที่ซ้อนกันออก (สีที่ปักทีหลังทับสีก่อน) · ควรให้ร้านปักทดสอบก่อนทุกครั้ง
 *   หน่วยภายใน = มม. แกน y ชี้ลง (เหมือน lib/block-print) · DST = 0.1 มม. แกน y ชี้ขึ้น
 *   คู่มือ docs/embroidery.md
 */
import { eachOp, OP, pieceShapes, type BlockPiece, type FillRule } from "@/lib/block-print";

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
};

export const DEFAULTS = { fill_spacing: 0.45, satin_spacing: 0.4, fill_len: 3.5, run_len: 2.5, pull_comp: 0.2, angle: 45 };
export const LIMITS = { width_min: 5, width_max: 400, spacing_min: 0.2, spacing_max: 2, len_min: 1, len_max: 7, comp_max: 1 };
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

/** สีทั้งหมดในงาน ตามลำดับที่เจอในไฟล์ */
export function colorsOf(pieces: BlockPiece[]): string[] {
  const out: string[] = [];
  for (const p of pieces) { const c = pieceColor(p); if (!out.includes(c)) out.push(c); }
  return out;
}

/** ค่าตั้งต้นของงานใหม่ */
export function defaultSettings(pieces: BlockPiece[], widthMm: number): EmbSettings {
  const colors: Record<string, ColorSetting> = {};
  for (const c of colorsOf(pieces)) colors[c] = { type: "auto", angle: DEFAULTS.angle, thread: "", on: true };
  return {
    width_mm: clamp(r2(widthMm || 80), LIMITS.width_min, LIMITS.width_max),
    fill_spacing: DEFAULTS.fill_spacing, satin_spacing: DEFAULTS.satin_spacing, fill_len: DEFAULTS.fill_len,
    run_len: DEFAULTS.run_len, pull_comp: DEFAULTS.pull_comp, colors, color_order: colorsOf(pieces), piece_types: {},
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
  };
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

/** ฝีเข็มของ 1 ชิ้น → รายการบล็อก (แต่ละบล็อกปักต่อกันโดยไม่ตัดด้าย) */
export function pieceBlocks(rings: Pt[][], fill: FillRule, type: ResolvedType, st: EmbSettings, angleDeg: number): Pt[][] {
  if (type === "skip" || !rings.length) return [];
  if (type === "run") {
    return rings.map((r) => {
      const out: Pt[] = [r[0]];
      for (let i = 1; i <= r.length; i++) {
        const a = r[i - 1], b = r[i % r.length];
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(1, Math.round(d / st.run_len));
        // เส้นโค้งที่แตกเป็นท่อนสั้น: ข้ามจุดที่ใกล้กว่า 0.6 มม. ยกเว้นจุดสุดท้ายของวง
        for (let k = 1; k <= n; k++) {
          const q: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
          const last = out[out.length - 1];
          if (Math.hypot(q[0] - last[0], q[1] - last[1]) >= Math.min(st.run_len, 0.6) || i === r.length) out.push(q);
        }
      }
      return out;
    });
  }
  const satin = type === "satin";
  // satin: ฝีขวางแนวยาวของชิ้น = แถววางตั้งฉากกับแนวยาว
  const deg = satin ? mainAxisDeg(rings) + 90 : angleDeg;
  const t = (deg * Math.PI) / 180, c = Math.cos(-t), s = Math.sin(-t), cb = Math.cos(t), sb = Math.sin(t);
  const rr = rings.map((r) => r.map((p) => rot(p, c, s)));
  const segs = scanSegments(rr, fill, satin ? st.satin_spacing : st.fill_spacing);
  return blocksOf(segs).map((blk) => rowStitches(blk, satin ? SATIN_SPLIT : st.fill_len, st.pull_comp, !satin).map((p) => rot(p, cb, sb)));
}

// ───────── แผนการปักทั้งงาน ─────────

export type Cmd = { t: "stitch" | "jump" | "trim" | "color" | "end"; x: number; y: number; c?: number };
export type ColorBlock = { color: string; thread: string; stitches: number; pieces: number };
export type PieceInfo = { id: string; name: string; color: string; type: ResolvedType; width: number; area: number; stitches: number; warn: string | null; level: "danger" | "warn" | null };
export type EmbPlan = {
  cmds: Cmd[]; colors: ColorBlock[]; pieces: PieceInfo[];
  stitches: number; jumps: number; trims: number; colorChanges: number;
  width: number; height: number; minutes: number;
};

/** คำเตือนรายชิ้น (ข้อเสนอ 1: ส่วนที่บาง/เล็กเกินปัก) */
export function pieceWarning(type: ResolvedType, width: number, box: { w: number; h: number }): { warn: string | null; level: PieceInfo["level"] } {
  if (type === "skip") return { warn: null, level: null };
  if (Math.max(box.w, box.h) < 1.5) return { warn: "เล็กเกินปัก (ต่ำกว่า 1.5 มม.) — ร้านมักปักไม่ขึ้น", level: "danger" };
  if (type !== "run" && width < 0.8) return { warn: `บางมาก ${width.toFixed(1)} มม. — ปักไม่ขึ้น ลองขยายงานหรือเปลี่ยนเป็นเดินเส้น`, level: "danger" };
  if (type !== "run" && width < 1.5) return { warn: `บาง ${width.toFixed(1)} มม. — อาจปักไม่ชัด (ตัวหนังสือควรหนาเส้น ≥ 1.5 มม.)`, level: "warn" };
  if (type === "satin" && width > SATIN_SPLIT + 1) return { warn: `ซิกแซกกว้าง ${width.toFixed(1)} มม. — ด้ายหลวม/เกี่ยวง่าย ควรใช้ถมเต็ม`, level: "warn" };
  return { warn: null, level: null };
}

/** ทั้งงาน → คำสั่งเครื่องปัก (มม. · จุดกึ่งกลางงาน = 0,0 · แกน y ชี้ลง) */
export function buildPlan(pieces: BlockPiece[], st: EmbSettings): EmbPlan {
  const box = designBox(pieces);
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
  const tieOff = (prev: Pt) => {
    const d = Math.hypot(pos[0] - prev[0], pos[1] - prev[1]) || 1;
    const back: Pt = [pos[0] + ((prev[0] - pos[0]) / d) * TIE, pos[1] + ((prev[1] - pos[1]) / d) * TIE];
    const here = pos; stitchTo(back); stitchTo(here);
  };
  const tieIn = (next: Pt) => {
    const d = Math.hypot(next[0] - pos[0], next[1] - pos[1]) || 1;
    const fwd: Pt = [pos[0] + ((next[0] - pos[0]) / d) * TIE, pos[1] + ((next[1] - pos[1]) / d) * TIE];
    const here = pos; stitchTo(fwd); stitchTo(here);
  };
  let last: Pt = [0, 0];
  const trim = () => { if (needle) { tieOff(last); cmds.push({ t: "trim", x: pos[0], y: pos[1] }); trims++; needle = false; } };

  const order = st.color_order.filter((c) => st.colors[c]);
  for (const c of colorsOf(pieces)) if (!order.includes(c)) order.push(c);
  let first = true;
  for (const color of order) {
    const cs = st.colors[color];
    const mine = pieces.filter((p) => pieceColor(p) === color && p.on !== false && p.kind !== "background");
    const block: ColorBlock = { color, thread: cs?.thread ?? "", stitches: 0, pieces: 0 };
    const before = stitches;
    let started = false;
    for (const p of mine) {
      const rings = pieceRings(p, scale, box).map((r) => r.map(([x, y]) => [x - cx, y - cy] as Pt));
      const width = meanWidth(rings);
      const type: ResolvedType = cs && cs.on === false ? "skip" : resolveType(p, st, width);
      const pw = pieceWarning(type, width, { w: p.ow * scale, h: p.oh * scale });
      const pStart = stitches;
      for (const blk of pieceBlocks(rings, p.fill, type, st, cs?.angle ?? DEFAULTS.angle)) {
        if (!blk.length) continue;
        const start = blk[0];
        if (needle && Math.hypot(start[0] - pos[0], start[1] - pos[1]) <= TRAVEL_STITCH_MAX) stitchTo(start);
        else {
          trim();
          if (!started && !first) { cmds.push({ t: "color", x: pos[0], y: pos[1] }); changes++; }
          started = true;
          jumpTo(start);
          tieIn(blk[1] ?? start);
          needle = true;
        }
        for (let i = 1; i < blk.length; i++) { last = pos; stitchTo(blk[i]); }
      }
      if (type !== "skip" && stitches > pStart) block.pieces++;
      infos.push({ id: p.id, name: p.name, color, type, width: r2(width), area: r2(ringsArea(rings)), stitches: stitches - pStart, ...pw });
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
