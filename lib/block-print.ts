/**
 * 🧱 บล็อกพิมพ์ (Block Print) — สูตรบริสุทธิ์ ไม่มีหน้าจอ · เจ้าของขอ 2026-11-24 (ดู widget 3 รอบ แล้วเลือก "เริ่มรอบ 1")
 *   งาน: เปิดไฟล์ .ai → แยกชิ้นเวกเตอร์ → ตั้งขนาดจริง → PDF ที่มีแค่ลาย + เส้นบอกขนาด ส่งโรงงานทำบล็อก
 *
 *   หน่วยทั้งหมด = มิลลิเมตร · แกน y ชี้ลง (เหมือนหน้าจอ/SVG)
 *   เส้นของชิ้น (DrawOps) = ตัวเลขเรียงต่อกันแบบเดียวกับตัวอ่าน PDF (pdf.js DrawOPS):
 *     0 x y = เริ่มเส้น · 1 x y = เส้นตรง · 2 x1 y1 x2 y2 x y = เส้นโค้ง · 4 = ปิดเส้น  (โค้ง 2 จุด (3) แปลงเป็น 2 ตอนอ่าน)
 *   ทำไมไม่ใช้รูปทรงของสตูดิโอแพทเทิร์น (lib/pattern-shape): ของนั้น 1 ชิ้น = เส้นรอบนอก 1 วง + รู
 *   แต่ลายบล็อก/ตัวอักษร (เช่น g) มีหลายวงในชิ้นเดียว → เก็บแบบเส้น PDF ตรง ๆ ไม่ตกหล่น
 *
 *   ชิ้น (BlockPiece): d = เส้นที่เลื่อนให้มุมซ้ายบนอยู่ที่ 0,0 · ow/oh = ขนาดเดิมในไฟล์ · w/h = ขนาดที่ตั้ง · ax/ay = ตำแหน่งเดิมในไฟล์
 *   ชิ้นที่รวมจากหลายเส้น (parts) เก็บเส้นเดิมแต่ละเส้นไว้ → "แยกออก" คืนได้ และคงวิธีเติมสีของแต่ละเส้น (รูในตัวอักษรไม่หาย)
 *   หน้าเลือกชิ้น (จัดกลุ่ม): autoGroup / applyGrouping — รวมเส้นที่ทับกันหรืออยู่ใกล้กันเป็นชิ้นเดียวให้ก่อน แล้วให้ผู้ใช้ปรับเอง
 *   เส้นบอกขนาด (dimGeometry) ใช้ร่วมทั้งภาพตัวอย่างบนจอ (SVG) และตัวเขียน PDF → หน้าจอกับไฟล์ตรงกันเสมอ
 *
 * ใช้ที่: lib/block-print-ai (อ่านไฟล์) · lib/block-print-pdf (เขียน PDF) · components/block-print · คู่มือ docs/block-print.md
 */

export const PT_TO_MM = 25.4 / 72;
export const OP = { M: 0, L: 1, C: 2, Q: 3, Z: 4 } as const;
export type DrawOps = number[];
export type FillRule = "nonzero" | "evenodd";
export type BlockUnit = "cm" | "mm";
export type BlockPaper = "A4" | "A3";
export type Box = { x: number; y: number; w: number; h: number };

/** เส้นย่อย 1 เส้นในชิ้นที่รวมแล้ว (d เลื่อนให้มุมซ้ายบนของเส้นนี้อยู่ที่ 0,0 · ax/ay = ตำแหน่งเดิมในไฟล์) */
export type BlockPart = { id: string; name: string; d: DrawOps; fill: FillRule; ow: number; oh: number; ax: number; ay: number };
/** ชิ้นที่ระบบแยกไว้ต่างหากตอนนำเข้า: พื้นหลังเต็มอาร์ตบอร์ด · เศษเล็ก · เส้นกรอบยาวบาง */
export type PieceKind = "background" | "dust" | "frame";
export const KIND_NAME: Record<PieceKind, string> = { background: "พื้นหลัง", dust: "เศษเล็ก", frame: "เส้นกรอบ" };

export type BlockPiece = {
  id: string;
  name: string;
  /** เส้นทั้งชิ้น (ถ้ามี parts = เส้นของทุก part ต่อกัน ใช้คิดกรอบ — ตอนวาดใช้ parts) */ d: DrawOps;
  fill: FillRule;
  /** ขนาดเดิมในไฟล์ (มม.) */ ow: number; oh: number;
  /** ขนาดที่ตั้ง (มม.) */ w: number; h: number;
  /** ตำแหน่งเดิมในไฟล์ (มม.) — ใช้เรียงชิ้น + รวมชิ้น */ ax: number; ay: number;
  /** ติ๊ก = ส่งออก */ on: boolean;
  /** ชิ้นที่รวมจากหลายเส้น — เก็บเส้นเดิมไว้ให้แยกคืนได้ */ parts?: BlockPart[];
  kind?: PieceKind;
};

export const MIN_SIZE_MM = 0.5;
export const MAX_SIZE_MM = 2000;
export const MAX_POINTS = 300_000;
export const UNITS: { key: BlockUnit; th: string }[] = [{ key: "cm", th: "ซม." }, { key: "mm", th: "มม." }];
export const PAPERS: Record<BlockPaper, { w: number; h: number }> = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } };

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ───────── เส้น ─────────

/** เดินทุกคำสั่งในเส้น — cb ได้ (op, ตัวเลขของคำสั่งนั้น) */
export function eachOp(d: DrawOps, cb: (op: number, a: number[]) => void): void {
  for (let i = 0; i < d.length;) {
    const op = d[i++];
    const n = op === OP.M || op === OP.L ? 2 : op === OP.C ? 6 : op === OP.Q ? 4 : op === OP.Z ? 0 : -1;
    if (n < 0) throw new Error(`คำสั่งเส้นไม่รู้จัก: ${op}`);
    cb(op, d.slice(i, i + n));
    i += n;
  }
}

/** แปลงทุกจุดในเส้น (โค้ง 2 จุดแปลงเป็นโค้ง 3 จุดไปพร้อมกัน) */
export function mapOps(d: DrawOps, fn: (x: number, y: number) => [number, number]): DrawOps {
  const out: number[] = [];
  let cx = 0, cy = 0;
  eachOp(d, (op, a) => {
    if (op === OP.Z) { out.push(OP.Z); return; }
    if (op === OP.Q) {
      const [qx, qy, x, y] = a;
      const c1 = [cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy)], c2 = [x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y)];
      out.push(OP.C, ...fn(c1[0], c1[1]), ...fn(c2[0], c2[1]), ...fn(x, y));
      cx = x; cy = y; return;
    }
    out.push(op);
    for (let k = 0; k < a.length; k += 2) out.push(...fn(a[k], a[k + 1]));
    cx = a[a.length - 2]; cy = a[a.length - 1];
  });
  return out;
}

/** จุดสุดขอบของโค้งเบซิเยร์ตามแกนเดียว (ค่า t ที่ 0 < t < 1) */
function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;
  const ts: number[] = [];
  if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) ts.push(-c / b); }
  else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) { const s = Math.sqrt(disc); ts.push((-b + s) / (2 * a), (-b - s) / (2 * a)); }
  }
  return ts.filter((t) => t > 0 && t < 1);
}
const cubicAt = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

/** กรอบจริงของเส้น (คิดโค้งตรงตามรูป ไม่ใช่กรอบจุดจับ) */
export function opsBox(d: DrawOps): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  let cx = 0, cy = 0;
  eachOp(mapOps(d, (x, y) => [x, y]), (op, a) => {
    if (op === OP.Z) return;
    if (op === OP.C) {
      const [ax, ay, bx, by, x, y] = a;
      for (const t of cubicExtrema(cx, ax, bx, x)) add(cubicAt(cx, ax, bx, x, t), cubicAt(cy, ay, by, y, t));
      for (const t of cubicExtrema(cy, ay, by, y)) add(cubicAt(cx, ax, bx, x, t), cubicAt(cy, ay, by, y, t));
      add(x, y); cx = x; cy = y; return;
    }
    add(a[0], a[1]); cx = a[0]; cy = a[1];
  });
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** เส้นของชิ้นเป็นข้อความ SVG path · วางที่ (tx,ty) ขยาย sx,sy */
export function opsToSvgPath(d: DrawOps, sx = 1, sy = 1, tx = 0, ty = 0): string {
  const f = (n: number) => String(Math.round(n * 1000) / 1000);
  const parts: string[] = [];
  eachOp(mapOps(d, (x, y) => [tx + x * sx, ty + y * sy]), (op, a) => {
    if (op === OP.Z) parts.push("Z");
    else parts.push((op === OP.M ? "M" : op === OP.L ? "L" : "C") + a.map(f).join(" "));
  });
  return parts.join("");
}

// ───────── อ่านไฟล์ (รายการคำสั่งวาดจาก pdf.js) ─────────

type Mat = [number, number, number, number, number, number];
const IDENT: Mat = [1, 0, 0, 1, 0, 0];
/** M(p) = A(B(p)) */
const mul = (A: Mat, B: Mat): Mat => [
  A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
];
const asMat = (v: unknown): Mat | null => {
  if (!v || typeof (v as ArrayLike<number>).length !== "number" || (v as ArrayLike<number>).length < 6) return null;
  const m = Array.from(v as ArrayLike<number>).slice(0, 6).map(Number);
  return m.every(Number.isFinite) ? (m as Mat) : null;
};

/** สีพื้นจากคำสั่งตั้งสี → ขาวไหม (pdf.js ส่งเป็น "#rrggbb" หรือเลข 0-255 / 0-1) */
export function isWhiteFill(args: unknown[]): boolean {
  const a = args?.[0];
  if (typeof a === "string") {
    const m = /^#?([0-9a-f]{6})$/i.exec(a.trim());
    if (!m) return false;
    const n = parseInt(m[1], 16);
    return ((n >> 16) & 255) >= 250 && ((n >> 8) & 255) >= 250 && (n & 255) >= 250;
  }
  const nums = (Array.isArray(args) ? args : []).map(Number).filter(Number.isFinite);
  if (!nums.length) return false;
  const max = Math.max(...nums);
  return nums.every((v) => (max > 1 ? v >= 250 : v >= 0.98));
}

/** เรียงตามที่วางในไฟล์: แถวบนก่อน แล้วซ้าย → ขวา (แนวตั้งซ้อนกันเกินครึ่งของชิ้นที่เตี้ยกว่า = แถวเดียวกัน เช่น เครื่องหมายคำพูดเล็ก ๆ ข้างตัวอักษร) */
export function byPosition(a: { ax: number; ay: number; oh: number }, b: { ax: number; ay: number; oh: number }): number {
  const overlap = Math.min(a.ay + a.oh, b.ay + b.oh) - Math.max(a.ay, b.ay);
  if (overlap < Math.min(a.oh, b.oh) / 2) return (a.ay + a.oh / 2) - (b.ay + b.oh / 2);
  return a.ax - b.ax;
}

export type OperatorList = { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> };
/** backgrounds = ชิ้นที่ใหญ่เกือบเท่าอาร์ตบอร์ด (พื้นหลังสี) — นำเข้าแต่ไม่ติ๊กส่งออก */
export type AiSkipped = { strokes: number; texts: number; images: number; whites: number; backgrounds?: number };
export type AiParseResult = { pieces: BlockPiece[]; skipped: AiSkipped; page: { w: number; h: number } };

/**
 * แปลงรายการคำสั่งวาดของหน้า PDF (จาก pdf.js getOperatorList) เป็นชิ้นงาน
 *   ops = ตาราง OPS ของ pdf.js (ชื่อ → เลข) · view = page.view [x0,y0,x1,y1] (หน่วย pt)
 *   ชิ้น = เส้นที่ "เติมสี" 1 คำสั่ง (compound path จาก Illustrator = 1 ชิ้น เช่น g ทั้งตัว)
 *   ข้าม: เส้นขอบอย่างเดียว (เส้นไกด์/เส้นบอกขนาดเดิม) · ตัวหนังสือที่ยังไม่แปลงเป็นเส้น · รูปภาพ · พื้นสีขาว · เส้นตัดขอบ (clip)
 */
export function piecesFromOperatorList(list: OperatorList, ops: Record<string, number>, view: number[]): AiParseResult {
  const [vx0, , , vy1] = view.map(Number);
  const pageW = (Number(view[2]) - vx0) * PT_TO_MM, pageH = (vy1 - Number(view[1])) * PT_TO_MM;
  const name = new Map<number, string>(Object.entries(ops).map(([k, v]) => [v, k]));
  const FILL = new Set(["fill", "eoFill", "fillStroke", "eoFillStroke", "closeFillStroke", "closeEOFillStroke"]);
  const EO = new Set(["eoFill", "eoFillStroke", "closeEOFillStroke"]);
  const STROKE = new Set(["stroke", "closeStroke"]);
  const TEXT = new Set(["showText", "showSpacedText", "nextLineShowText", "nextLineSetSpacingShowText"]);
  const IMAGE = new Set(["paintImageXObject", "paintInlineImageXObject", "paintImageMaskXObject", "paintInlineImageXObjectGroup", "paintImageXObjectRepeat", "paintImageMaskXObjectRepeat", "paintSolidColorImageMask"]);
  const FILLCOLOR = new Set(["setFillRGBColor", "setFillGray", "setFillCMYKColor", "setFillColor", "setFillColorN"]);

  type St = { m: Mat; white: boolean };
  let st: St = { m: IDENT, white: false };
  const stack: St[] = [];
  const skipped: AiSkipped = { strokes: 0, texts: 0, images: 0, whites: 0 };
  const raw: { d: DrawOps; fill: FillRule }[] = [];
  let points = 0;

  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = name.get(list.fnArray[i]) ?? "";
    const args = (list.argsArray[i] ?? []) as unknown[];
    if (fn === "save") { stack.push(st); st = { ...st }; continue; }
    if (fn === "restore") { st = stack.pop() ?? st; continue; }
    if (fn === "transform") { const m = asMat(args); if (m) st = { ...st, m: mul(st.m, m) }; continue; }
    if (fn === "paintFormXObjectBegin") { stack.push(st); const m = asMat(args[0]); st = { ...st, m: m ? mul(st.m, m) : st.m }; continue; }
    if (fn === "paintFormXObjectEnd") { st = stack.pop() ?? st; continue; }
    if (fn === "beginGroup") { stack.push(st); const m = asMat((args[0] as { matrix?: unknown } | undefined)?.matrix); st = { ...st, m: m ? mul(st.m, m) : st.m }; continue; }
    if (fn === "endGroup") { st = stack.pop() ?? st; continue; }
    if (FILLCOLOR.has(fn)) { st = { ...st, white: isWhiteFill(args) }; continue; }
    if (TEXT.has(fn)) { skipped.texts++; continue; }
    if (IMAGE.has(fn)) { skipped.images++; continue; }
    if (fn !== "constructPath") continue;

    const paint = name.get(Number(args[0])) ?? "";
    const data = (args[1] as unknown[] | undefined)?.[0] as ArrayLike<number> | null | undefined;
    if (STROKE.has(paint)) { skipped.strokes++; continue; }
    if (!FILL.has(paint) || !data || !data.length) continue;
    if (st.white) { skipped.whites++; continue; }
    const m = st.m;
    const toMm = (x: number, y: number): [number, number] => {
      const px = m[0] * x + m[2] * y + m[4], py = m[1] * x + m[3] * y + m[5];
      return [r3((px - vx0) * PT_TO_MM), r3((vy1 - py) * PT_TO_MM)];
    };
    const d = mapOps(Array.from(data), toMm);
    points += d.length;
    if (points > MAX_POINTS) throw new Error("ไฟล์นี้มีจุดเส้นเยอะเกินไป (เกิน 300,000) — ลองลดจุดใน Illustrator (Object › Path › Simplify) แล้วเปิดใหม่");
    raw.push({ d, fill: EO.has(paint) ? "evenodd" : "nonzero" });
  }

  const pieces: BlockPiece[] = [];
  for (const r of raw) {
    const b = opsBox(r.d);
    if (!b || b.w < 0.01 || b.h < 0.01) continue;
    pieces.push({
      id: "", name: "", fill: r.fill, on: true,
      d: mapOps(r.d, (x, y) => [r3(x - b.x), r3(y - b.y)]),
      ow: r3(b.w), oh: r3(b.h), w: r3(b.w), h: r3(b.h), ax: r3(b.x), ay: r3(b.y),
    });
  }
  pieces.sort(byPosition);
  let n = 0;
  skipped.backgrounds = 0;
  pieces.forEach((p, i) => {
    p.id = `p${i + 1}`;
    // พื้นหลังสีเต็มอาร์ตบอร์ด (เจอในไฟล์จริง) → เก็บไว้แต่ไม่ติ๊กส่งออก ไม่นับเป็นลำดับชิ้น
    if (p.ow >= pageW * 0.9 && p.oh >= pageH * 0.9) { p.on = false; p.name = KIND_NAME.background; p.kind = "background"; skipped.backgrounds!++; return; }
    p.name = `ชิ้น ${++n}`;
  });
  return { pieces, skipped, page: { w: r3(pageW), h: r3(pageH) } };
}

// ───────── ขนาด ─────────

export const clampSize = (mm: number) => Math.min(MAX_SIZE_MM, Math.max(MIN_SIZE_MM, mm));

/** ตั้งกว้างหรือสูง (มม.) · lock = คงสัดส่วนเดิมในไฟล์ */
export function setPieceSize(p: BlockPiece, field: "w" | "h", mm: number, lock: boolean): BlockPiece {
  if (!Number.isFinite(mm) || mm <= 0) return p;
  const v = r3(clampSize(mm));
  if (field === "w") return { ...p, w: v, h: lock ? r3(clampSize(v * p.oh / p.ow)) : p.h };
  return { ...p, h: v, w: lock ? r3(clampSize(v * p.ow / p.oh)) : p.w };
}

/** ทุกชิ้นที่ติ๊กไว้ สูงเท่าชิ้นอ้างอิง (คงสัดส่วนของแต่ละชิ้น) */
export function equalHeight(pieces: BlockPiece[], refId: string): BlockPiece[] {
  const ref = pieces.find((p) => p.id === refId);
  if (!ref) return pieces;
  return pieces.map((p) => (p.on && p.id !== refId ? setPieceSize(p, "h", ref.h, true) : p));
}

export const resetPieceSize = (p: BlockPiece): BlockPiece => ({ ...p, w: p.ow, h: p.oh });
export const isResized = (p: BlockPiece) => Math.abs(p.w - p.ow) > 0.001 || Math.abs(p.h - p.oh) > 0.001;

/** รวมหลายชิ้นเป็นชิ้นเดียว (ใช้รูปทรงเดิมในไฟล์ · ขนาดกลับเป็นขนาดรวมเดิม) — ชิ้นที่รวมใช้รหัส/ชื่อ/ตำแหน่งในรายการของชิ้นแรก */
export function mergePieces(pieces: BlockPiece[], ids: string[]): BlockPiece[] {
  const picked = pieces.filter((p) => ids.includes(p.id));
  if (picked.length < 2) return pieces;
  const first = picked[0];
  const merged = buildPiece(picked.flatMap(atomsOf), first.id, first.name);
  const rest = new Set(picked.slice(1).map((p) => p.id));
  return pieces.filter((p) => !rest.has(p.id)).map((p) => (p.id === first.id ? merged : p));
}

// ───────── จัดกลุ่มชิ้น (หน้าเลือกชิ้น) ─────────

/** เส้นที่ใช้วาดชิ้น (หน่วย มม. เทียบมุมซ้ายบนของชิ้น ขนาดเดิมในไฟล์) — ชิ้นรวมวาดทีละเส้นด้วยวิธีเติมสีของเส้นนั้น */
export function pieceShapes(p: BlockPiece): { d: DrawOps; fill: FillRule }[] {
  if (!p.parts?.length) return [{ d: p.d, fill: p.fill }];
  return p.parts.map((q) => {
    const dx = q.ax - p.ax, dy = q.ay - p.ay;
    return { d: dx || dy ? mapOps(q.d, (x, y) => [x + dx, y + dy]) : q.d, fill: q.fill };
  });
}

const partAsPiece = (q: BlockPart): BlockPiece => ({ id: q.id, name: q.name, d: q.d, fill: q.fill, ow: q.ow, oh: q.oh, w: q.ow, h: q.oh, ax: q.ax, ay: q.ay, on: true });

/** เส้นย่อยของชิ้น เป็นชิ้นเดี่ยว ๆ (ชิ้นที่ไม่ได้รวม = ตัวมันเอง) — ใช้ตอนแยก/จัดกลุ่มใหม่ */
export function atomsOf(p: BlockPiece): BlockPiece[] {
  if (!p.parts?.length) return [p];
  return p.parts.map((q) => ({ ...partAsPiece(q), on: p.on }));
}

/** รวมเส้นเดี่ยวหลายเส้นเป็น 1 ชิ้น (ขนาด = ขนาดรวมเดิมในไฟล์) */
export function buildPiece(atoms: BlockPiece[], id: string, name: string): BlockPiece {
  const parts: BlockPart[] = atoms.map((a) => ({ id: a.id, name: a.name, d: a.d, fill: a.fill, ow: a.ow, oh: a.oh, ax: a.ax, ay: a.ay }));
  const x0 = Math.min(...parts.map((q) => q.ax)), y0 = Math.min(...parts.map((q) => q.ay));
  const x1 = Math.max(...parts.map((q) => q.ax + q.ow)), y1 = Math.max(...parts.map((q) => q.ay + q.oh));
  const d = parts.flatMap((q) => mapOps(q.d, (x, y) => [r3(x + q.ax - x0), r3(y + q.ay - y0)]));
  const ow = r3(x1 - x0), oh = r3(y1 - y0);
  return {
    id, name, d, fill: parts.every((q) => q.fill === parts[0].fill) ? parts[0].fill : "nonzero",
    ow, oh, w: ow, h: oh, ax: r3(x0), ay: r3(y0), on: true, parts,
  };
}

export const JUNK_DUST_MM = 0.3;
/** เศษเล็ก (ด้านยาวไม่ถึง 0.3 มม.) · เส้นกรอบ (บางไม่ถึง 0.6 มม. และยาวเกิน 40 เท่าของความหนา) */
export function junkKind(p: { ow: number; oh: number }): "dust" | "frame" | null {
  const a = Math.max(p.ow, p.oh), b = Math.min(p.ow, p.oh);
  if (a < JUNK_DUST_MM) return "dust";
  if (b < 0.6 && a / Math.max(b, 0.001) > 40) return "frame";
  return null;
}
const isBackground = (p: BlockPiece) => p.kind === "background" || (!p.on && p.name === KIND_NAME.background);

export type GroupOpts = {
  /** เส้นที่ทับ/ซ้อนกัน = ชิ้นเดียว */ overlap: boolean;
  /** รวมเส้นที่ห่างกันไม่เกินนี้ (มม.) · null = ไม่รวม */ gap: number | null;
  /** ซ่อนเศษเล็ก/เส้นกรอบไว้ก่อน */ hideJunk: boolean;
};
/** ค่าเริ่มต้น 0.2 มม.: ไฟล์จริงของเจ้าของ (final 2) วางลายห่างกันแค่ 0.25-0.33 มม. แต่เส้นย่อยในลายเดียวกันห่าง ~0.12 มม. — ตั้งมากกว่านี้ลายข้างกันจะรวมกันหมด */
export const GROUP_DEFAULT: GroupOpts = { overlap: true, gap: 0.2, hideJunk: true };
export const GROUP_GAP_MAX = 5;
/** กลุ่ม = รหัสเส้นเดี่ยว (atom) ที่จะเป็นชิ้นเดียวกัน */
export type PieceGroup = { ids: string[]; on: boolean; kind?: PieceKind };

type BoxLike = { ax: number; ay: number; ow: number; oh: number };
/** ระยะห่างระหว่างกรอบสองกรอบ (ทับ/ชนกัน = 0) แยกแกน x / y */
export function boxGap(a: BoxLike, b: BoxLike): { dx: number; dy: number } {
  return {
    dx: Math.max(0, Math.max(a.ax, b.ax) - Math.min(a.ax + a.ow, b.ax + b.ow)),
    dy: Math.max(0, Math.max(a.ay, b.ay) - Math.min(a.ay + a.oh, b.ay + b.oh)),
  };
}

/**
 * จัดกลุ่มเส้นเดี่ยวอัตโนมัติ: ทับกัน / ห่างไม่เกิน gap = ชิ้นเดียว
 *   พื้นหลัง = แยกไว้ ไม่ติ๊ก · เศษเล็ก/เส้นกรอบ = แยกไว้ ไม่ติ๊ก (ถ้า hideJunk)
 *   เส้นพื้นใหญ่ที่ทับ/ชนเส้นเล็กตั้งแต่ 3 เส้น (เล็กกว่า 10 เท่า เช่น แถบสายเข็มขัด เส้นคั่น กรอบรอบงาน) = ไม่รวมกับใคร
 *     กันลายทั้งแถวถูกดูดเป็นชิ้นเดียวผ่านแถบพื้น (เจอในไฟล์จริง final 2)
 *   กลุ่มติ๊กส่งออกถ้ามีเส้นไหนในกลุ่มติ๊กอยู่
 */
export function autoGroup(atoms: BlockPiece[], opts: GroupOpts): PieceGroup[] {
  const side: PieceGroup[] = [];
  const live: BlockPiece[] = [];
  for (const a of atoms) {
    if (isBackground(a)) { side.push({ ids: [a.id], on: false, kind: "background" }); continue; }
    const j = opts.hideJunk ? junkKind(a) : null;
    if (j) { side.push({ ids: [a.id], on: false, kind: j }); continue; }
    live.push(a);
  }
  const lone = new Set<number>();
  if (live.length > 3) {
    const area = (b: BoxLike) => Math.max(b.ow * b.oh, 1e-6);
    for (let i = 0; i < live.length; i++) {
      const big = area(live[i]);
      let n = 0;
      for (let k = 0; k < live.length && n < 3; k++) {
        if (k === i || area(live[k]) * 10 > big) continue;
        const { dx, dy } = boxGap(live[i], live[k]);
        if (dx === 0 && dy === 0) n++;
      }
      if (n >= 3) lone.add(i);
    }
  }
  const par = live.map((_, i) => i);
  const find = (i: number): number => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const g = opts.gap != null && opts.gap >= 0 ? opts.gap : null;
  const reach = g ?? 0;
  const order = live.map((_, i) => i).sort((a, b) => live[a].ax - live[b].ax);
  for (let x = 0; x < order.length; x++) {
    const i = order[x];
    if (lone.has(i)) continue;
    const A = live[i];
    for (let y = x + 1; y < order.length; y++) {
      const k = order[y], B = live[k];
      if (B.ax > A.ax + A.ow + reach + 1e-9) break;
      if (lone.has(k)) continue;
      const { dx, dy } = boxGap(A, B);
      if ((opts.overlap && dx === 0 && dy === 0) || (g != null && Math.max(dx, dy) <= g + 1e-9)) par[find(i)] = find(k);
    }
  }
  const groups = new Map<number, BlockPiece[]>();
  live.forEach((a, i) => { const r = find(i); const arr = groups.get(r); if (arr) arr.push(a); else groups.set(r, [a]); });
  return [...[...groups.values()].map((arr) => ({ ids: arr.map((a) => a.id), on: arr.some((a) => a.on) })), ...side];
}

/** ส่งขึ้นเซิร์ฟเวอร์: ชิ้นรวมไม่ต้องส่งเส้นรวม (เซิร์ฟเวอร์สร้างใหม่จาก parts เองใน cleanPieces) — ข้อมูลที่ส่งเล็กลงครึ่งหนึ่ง */
export const piecesForSave = (ps: BlockPiece[]): BlockPiece[] => ps.map((p) => (p.parts?.length ? { ...p, d: [] } : p));

/** กลุ่มตามชิ้นที่มีอยู่ตอนนี้ (เปิดหน้าเลือกชิ้นจากหน้าตั้งขนาด) */
export function groupsFromPieces(pieces: BlockPiece[]): PieceGroup[] {
  return pieces.map((p) => ({ ids: atomsOf(p).map((a) => a.id), on: p.on, ...(p.kind ? { kind: p.kind } : {}) }));
}

/**
 * แปลงกลุ่มกลับเป็นชิ้น — กลุ่มที่ตรงกับชิ้นเดิมเป๊ะ ใช้ชิ้นเดิม (ขนาด/ชื่อที่ตั้งไว้ไม่หาย)
 *   กลุ่มใหม่ = ขนาดเดิมในไฟล์ · เรียงตามตำแหน่ง · ชื่ออัตโนมัติ "ชิ้น n" เรียงใหม่ (ชื่อที่ตั้งเองคงไว้)
 */
export function applyGrouping(current: BlockPiece[], groups: PieceGroup[]): BlockPiece[] {
  const atoms = new Map(current.flatMap(atomsOf).map((a) => [a.id, a] as const));
  const keyOf = (ids: string[]) => [...ids].sort().join("|");
  const byKey = new Map(current.map((p) => [keyOf(atomsOf(p).map((a) => a.id)), p] as const));
  const taken = new Set<string>([...current.map((p) => p.id), ...atoms.keys()]);
  let seq = 0;
  const newId = () => { let id: string; do id = `g${++seq}`; while (taken.has(id)); taken.add(id); return id; };
  const out: BlockPiece[] = [];
  for (const g of groups) {
    const as = g.ids.map((id) => atoms.get(id)).filter((a): a is BlockPiece => !!a);
    if (!as.length) continue;
    const keep = byKey.get(keyOf(as.map((a) => a.id)));
    const p: BlockPiece = { ...(keep ?? (as.length === 1 ? as[0] : buildPiece(as, newId(), ""))), on: g.on };
    if (g.kind) p.kind = g.kind; else delete p.kind;
    out.push(p);
  }
  const main = out.filter((p) => !p.kind).sort(byPosition), side = out.filter((p) => p.kind);
  const autoName = new Set(Object.values(KIND_NAME));
  main.forEach((p, i) => { if (!p.name || /^ชิ้น \d+$/.test(p.name) || autoName.has(p.name)) p.name = `ชิ้น ${i + 1}`; });
  for (const p of side) p.name = KIND_NAME[p.kind!];
  return [...main, ...side];
}

function validOps(v: unknown): number[] | null {
  const d = Array.isArray(v) ? (v as unknown[]).map(Number) : [];
  if (!d.length || !d.every(Number.isFinite)) return null;
  try { eachOp(d, () => undefined); } catch { return null; }
  return d;
}

/** ตรวจ/ทำความสะอาดชิ้นที่รับมาจากหน้าเว็บก่อนเก็บ (กันข้อมูลเพี้ยน) */
export function cleanPieces(raw: unknown): { ok: true; pieces: BlockPiece[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "ข้อมูลชิ้นไม่ถูกต้อง" };
  if (raw.length > 500) return { ok: false, error: "ชิ้นเยอะเกินไป (เกิน 500 ชิ้น)" };
  let points = 0;
  const out: BlockPiece[] = [];
  const ids = new Set<string>();
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const num = (k: string) => Number(o[k]);
    let parts: BlockPart[] | undefined;
    if (Array.isArray(o.parts) && o.parts.length) {
      if (o.parts.length > 5000) return { ok: false, error: "เส้นในชิ้นเยอะเกินไป" };
      parts = [];
      for (const q of o.parts as Record<string, unknown>[]) {
        const qd = validOps(q?.d);
        const qs = ["ow", "oh", "ax", "ay"].map((k) => Number(q?.[k]));
        if (!qd || !qs.every(Number.isFinite) || qs[0] <= 0 || qs[1] <= 0) return { ok: false, error: "เส้นของชิ้นไม่ถูกต้อง" };
        points += qd.length;
        parts.push({ id: String(q.id ?? "").slice(0, 40) || `q${parts.length + 1}`, name: String(q.name ?? "").slice(0, 80), d: qd, fill: q.fill === "evenodd" ? "evenodd" : "nonzero", ow: qs[0], oh: qs[1], ax: qs[2], ay: qs[3] });
      }
    }
    // ชิ้นรวม: สร้างเส้นรวมใหม่จาก parts เอง (ไม่เชื่อค่าที่ส่งมา)
    const d = parts ? buildPiece(parts.map(partAsPiece), "_", "").d : validOps(o.d);
    if (!d) return { ok: false, error: "เส้นของชิ้นไม่ถูกต้อง" };
    if (!parts) points += d.length;
    if (points > MAX_POINTS) return { ok: false, error: "จุดเส้นรวมเยอะเกินไป" };
    const id = String(o.id ?? "").slice(0, 40);
    if (!id || ids.has(id)) return { ok: false, error: "รหัสชิ้นซ้ำหรือว่าง" };
    ids.add(id);
    const sizes = ["ow", "oh", "w", "h"].map(num);
    if (!sizes.every((v) => Number.isFinite(v) && v > 0 && v <= MAX_SIZE_MM)) return { ok: false, error: "ขนาดชิ้นไม่ถูกต้อง" };
    out.push({
      id, name: String(o.name ?? "").trim().slice(0, 80) || id, d,
      fill: o.fill === "evenodd" ? "evenodd" : "nonzero",
      ow: sizes[0], oh: sizes[1], w: sizes[2], h: sizes[3],
      ax: Number.isFinite(num("ax")) ? num("ax") : 0, ay: Number.isFinite(num("ay")) ? num("ay") : 0,
      on: o.on !== false,
      ...(parts ? { parts } : {}),
      ...(o.kind === "background" || o.kind === "dust" || o.kind === "frame" ? { kind: o.kind as PieceKind } : {}),
    });
  }
  return { ok: true, pieces: out };
}

/** ประวัติการแก้ชิ้น (ใส่ใน audit metadata.changes) — จดต่อชิ้น: ขนาด · ติ๊กส่งออก · ชื่อ · เพิ่ม/เอาออก (ไม่จดเส้นทั้งก้อน) */
export function pieceAuditChanges(before: BlockPiece[], after: BlockPiece[], max = 40): { field: string; label: string; old: string | null; new: string | null }[] {
  const show = (p?: BlockPiece) => (p ? `${p.name} · ${+p.w.toFixed(2)}×${+p.h.toFixed(2)} มม.${p.on ? "" : " (ไม่ส่งออก)"}` : null);
  const a = new Map(before.map((p) => [p.id, p])), b = new Map(after.map((p) => [p.id, p]));
  const out: { field: string; label: string; old: string | null; new: string | null }[] = [];
  let more = 0;
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const o = a.get(id), n = b.get(id);
    const shapeChanged = !!o && !!n && (o.d.length !== n.d.length || o.ow !== n.ow || o.oh !== n.oh);
    if (show(o) === show(n) && !shapeChanged) continue;
    if (out.length >= max) { more++; continue; }
    out.push({ field: `piece:${id}`, label: `ชิ้น ${n?.name ?? o?.name ?? id}`, old: show(o), new: shapeChanged ? `${show(n)} (รูปทรงเปลี่ยน)` : show(n) });
  }
  if (more) out.push({ field: "piece:_more", label: "ชิ้นอื่น ๆ", old: null, new: `เปลี่ยนอีก ${more} ชิ้น` });
  return out;
}

// ───────── ตัวเลขบนเส้นบอกขนาด ─────────

/** 43.2 มม. → "4.32 cm" · 43 มม. → "4.3 cm" (ตัด 0 ท้าย แบบตัวอย่างของเจ้าของ) */
export function fmtDim(mm: number, unit: BlockUnit): string {
  return unit === "cm" ? `${+(mm / 10).toFixed(2)} cm` : `${+mm.toFixed(1)} mm`;
}
/** ค่าในช่องกรอก (ไม่มีหน่วย) */
export const toUnit = (mm: number, unit: BlockUnit) => (unit === "cm" ? +(mm / 10).toFixed(3) : +mm.toFixed(2));
export const fromUnit = (v: number, unit: BlockUnit) => (unit === "cm" ? v * 10 : v);

// ───────── จัดหน้า + เส้นบอกขนาด (ใช้ร่วมจอ/PDF) ─────────

/** ระยะของเส้นบอกขนาดรอบชิ้น (มม.) */
export const DIM = {
  margin: 12,
  padLeft: 12, padRight: 18, padTop: 12, padBottom: 17,
  gapX: 4, gapY: 4,
  guideGap: 2, guideLen: 8,
  hBracket: 8, tick: 2,
  wBracket: 10, wTick: 4,
  text: 3.2, textGap: 2,
};
export const DIM_COLORS = { guide: "#9ca3af", dim: "#a24da3", text: "#111111" };

export type PlacedPiece = { id: string; x: number; y: number; w: number; h: number };
export type PageLayout =
  | { ok: true; orientation: "portrait" | "landscape"; pageW: number; pageH: number; items: PlacedPiece[] }
  | { ok: false; error: string; tooBig: string[] };

function packRows(pieces: BlockPiece[], pageW: number, pageH: number): PlacedPiece[] | null {
  const maxX = pageW - DIM.margin, maxY = pageH - DIM.margin;
  const items: PlacedPiece[] = [];
  let x = DIM.margin, rowTop = DIM.margin, row: BlockPiece[] = [], rowH = 0;
  const flush = () => {
    let cx = DIM.margin;
    for (const p of row) {
      const cellW = DIM.padLeft + p.w + DIM.padRight;
      items.push({ id: p.id, x: r3(cx + DIM.padLeft), y: r3(rowTop + DIM.padTop + (rowH - p.h)), w: p.w, h: p.h });
      cx += cellW + DIM.gapX;
    }
    rowTop += DIM.padTop + rowH + DIM.padBottom + DIM.gapY;
    row = []; rowH = 0;
  };
  for (const p of pieces) {
    const cellW = DIM.padLeft + p.w + DIM.padRight;
    if (DIM.margin + cellW > maxX + 0.001) return null;            // ชิ้นเดียวก็กว้างเกินหน้านี้
    if (row.length && x + cellW > maxX) { flush(); x = DIM.margin; }
    row.push(p); rowH = Math.max(rowH, p.h); x += cellW + DIM.gapX;
  }
  if (row.length) flush();
  return rowTop - DIM.gapY <= maxY + 0.001 ? items : null;
}

/**
 * วางทุกชิ้นที่ติ๊กไว้ในหน้าเดียว (เจ้าของเลือก "ทุกชิ้นในหน้าเดียว") — เรียงซ้าย→ขวา ล้นแล้วขึ้นแถวใหม่ (ชิดล่างในแถว)
 *   ลองแนวตั้งก่อน ไม่พอค่อยแนวนอน · ห้ามย่อลายเองเด็ดขาด — ไม่พอ = แจ้งเตือน
 */
export function layoutPage(pieces: BlockPiece[], paper: BlockPaper): PageLayout {
  const on = pieces.filter((p) => p.on);
  if (!on.length) return { ok: false, error: "ยังไม่ได้ติ๊กชิ้นที่จะส่งออก", tooBig: [] };
  const { w: pw, h: ph } = PAPERS[paper];
  const tooBig = on.filter((p) => {
    const cw = DIM.padLeft + p.w + DIM.padRight + 2 * DIM.margin, ch = DIM.padTop + p.h + DIM.padBottom + 2 * DIM.margin;
    return !((cw <= pw && ch <= ph) || (cw <= ph && ch <= pw));
  }).map((p) => p.id);
  if (tooBig.length) return { ok: false, error: `มี ${tooBig.length} ชิ้นใหญ่เกินกระดาษ ${paper} (รวมที่ว่างของเส้นบอกขนาด) — เปลี่ยนเป็นกระดาษใหญ่ขึ้นหรือลดขนาดชิ้น`, tooBig };
  for (const orientation of ["portrait", "landscape"] as const) {
    const pageW = orientation === "portrait" ? pw : ph, pageH = orientation === "portrait" ? ph : pw;
    const items = packRows(on, pageW, pageH);
    if (items) return { ok: true, orientation, pageW, pageH, items };
  }
  return { ok: false, error: `ชิ้นที่ติ๊กไว้วางไม่พอในหน้า ${paper} หน้าเดียว — เปลี่ยนเป็นกระดาษใหญ่ขึ้น ติ๊กออกบางชิ้น หรือลดขนาด`, tooBig: [] };
}

/**
 * วางแบบไม่จำกัดความสูง (กว้างเท่าด้านยาวของกระดาษ ล้นแล้วขึ้นแถวใหม่) — ใช้โชว์บนจอตอนลงหน้ากระดาษไม่ได้
 * ให้ยังเห็นทุกชิ้นชัด ๆ และแก้ขนาด/ติ๊กออกต่อได้ (ไม่ใช่หน้าตา PDF)
 */
export function layoutFree(pieces: BlockPiece[], paper: BlockPaper): { w: number; h: number; items: PlacedPiece[] } {
  const on = pieces.filter((p) => p.on);
  if (!on.length) return { w: 0, h: 0, items: [] };
  const widest = Math.max(...on.map((p) => DIM.padLeft + p.w + DIM.padRight));
  const w = Math.max(PAPERS[paper].h, widest + 2 * DIM.margin);
  const items = packRows(on, w, 1e9) ?? [];
  const h = Math.max(...items.map((it) => it.y + it.h)) + DIM.padBottom + DIM.margin;
  return { w: r3(w), h: r3(h), items };
}

export type DimLine ={ x1: number; y1: number; x2: number; y2: number; kind: "guide" | "dim" };
export type DimText = { x: number; y: number; text: string; /** 90 = หมุนตามเข็ม อ่านจากบนลงล่าง (แบบตัวอย่าง) */ rotate: 0 | 90 };

/** เส้นไกด์สีเทา + เส้นบอกขนาดสีม่วง + ตัวเลข รอบกรอบชิ้นหนึ่ง (แบบตัวอย่าง g E N ของเจ้าของ) */
export function dimGeometry(it: PlacedPiece, unit: BlockUnit): { lines: DimLine[]; texts: DimText[] } {
  const { x, y, w, h } = it;
  const r = x + w, b = y + h, g = DIM.guideGap;
  const lines: DimLine[] = [];
  const L = (x1: number, y1: number, x2: number, y2: number, kind: DimLine["kind"]) => lines.push({ x1: r3(x1), y1: r3(y1), x2: r3(x2), y2: r3(y2), kind });
  // ไกด์แนวตั้งเหนือชิ้น + ใต้ชิ้น (ใต้ชิ้นยาวถึงปลายขีดของเส้นกว้าง)
  const wy = b + DIM.wBracket;
  for (const gx of [x, r]) { L(gx, y - g - DIM.guideLen, gx, y - g, "guide"); L(gx, b + g, gx, wy - DIM.wTick - 0.6, "guide"); }
  // ไกด์แนวนอนซ้าย/ขวา ที่ขอบบนและล่าง
  const hx = r + DIM.hBracket;
  for (const gy of [y, b]) { L(x - g - DIM.guideLen, gy, x - g, gy, "guide"); L(r + g, gy, hx - DIM.tick - 0.6, gy, "guide"); }
  // เส้นสูง (ขวา) + ขีดปลาย
  L(hx, y, hx, b, "dim"); L(hx - DIM.tick, y, hx + DIM.tick, y, "dim"); L(hx - DIM.tick, b, hx + DIM.tick, b, "dim");
  // เส้นกว้าง (ล่าง) + ขีดปลายชี้ขึ้น
  L(x, wy, r, wy, "dim"); L(x, wy - DIM.wTick, x, wy, "dim"); L(r, wy - DIM.wTick, r, wy, "dim");
  const texts: DimText[] = [
    { x: r3(hx + DIM.tick + 0.8), y: r3((y + b) / 2), text: fmtDim(h, unit), rotate: 90 },
    { x: r3((x + r) / 2), y: r3(wy + DIM.textGap + DIM.text), text: fmtDim(w, unit), rotate: 0 },
  ];
  return { lines, texts };
}

/** ชื่อไฟล์ PDF ที่ปลอดภัย */
export function pdfFileName(code: string, name: string): string {
  const clean = `${code} ${name}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${clean || "block"}.pdf`;
}
