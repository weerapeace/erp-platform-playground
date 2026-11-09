/**
 * ✏️ รูปทรงชิ้นวัสดุ (วาดเอง / วางจาก Illustrator) — สูตรบริสุทธิ์ ไม่มีหน้าจอ · เจ้าของขอ 2026-11-09
 *   "อยากเพิ่มวัสดุแบบวาดได้ สี่เหลี่ยม วงกลม pen tool และ copy จาก Illustrator ได้"
 *
 *   หน่วยทั้งหมด = เซนติเมตร · แกน y ชี้ลง (เหมือนหน้าจอ/SVG)
 *   Shape:
 *     rect    = สี่เหลี่ยม x,y,w,h
 *     ellipse = วงกลม/วงรี ในกรอบ x,y,w,h
 *     path    = รูปปิดจากจุด (ปากกา / Illustrator) · จุดมีหูจับเข้า (ix,iy) / ออก (ox,oy) แบบสัมพัทธ์ → เส้นโค้งเบซิเยร์
 *   ทุกอย่างคิดผ่าน flattenShape (แปลงโค้งเป็นจุดถี่ ๆ) → พื้นที่ (สูตรเชือกผูกรองเท้า) / รอบรูป / กรอบ
 *
 *   LineShape (เก็บในบรรทัดตีราคา design_sheet_cost_lines.shape):
 *     { v:1, shape (เริ่มที่ 0,0), basis: "box" = คิดผ้าจากกรอบ (สูตรเดิม) | "area" = คิดจากพื้นที่จริง }
 *
 *   นำเข้า SVG (parseSvgShapes): rect / circle / ellipse / polygon / polyline / path (M L H V C S Q T A Z) + transform ของ g/ชิ้น
 *     หน่วย: มี width/height เป็น mm/cm/in/pt + viewBox = ใช้ตามนั้น · ไม่มี (Illustrator ก๊อปมา) = 72 หน่วยต่อนิ้ว (1 หน่วย = 1 pt)
 *     path ที่มีหลายเส้นในตัว (compound เช่น รูเจาะ) = แยกเป็นหลายชิ้น (ขั้นเจาะรูจริง = ขั้นที่ 2)
 *
 * ใช้ที่: components/pattern-sheet/shape-editor.tsx · lib/pattern-sheet (ชิ้นแพทเทิร์นรูปทรงจริง) · ตีราคา (components/design-sheet-detail)
 * คู่มือ: docs/pattern-sheet.md
 */

export type Pt = [number, number];
export type PNode = { x: number; y: number; ix?: number; iy?: number; ox?: number; oy?: number };
export type Shape =
  | { k: "rect"; x: number; y: number; w: number; h: number }
  | { k: "ellipse"; x: number; y: number; w: number; h: number }
  | { k: "path"; nodes: PNode[] };
export type ShapeBasis = "box" | "area";
/**
 * รูปทรงของบรรทัดตีราคา (design_sheet_cost_lines.shape) — shape/holes = เส้นเย็บ (ขนาดสำเร็จ) เริ่มที่ 0,0
 *   allow = เผื่อพับ/เผื่อเย็บ (ซม.) → เส้นตัด = ขยายออก allow · รูเจาะหดเข้า allow · กว้าง×ยาวในบรรทัด = กรอบของเส้นตัด
 *   pid = รหัสชิ้น (บรรทัดหลายวัสดุของชิ้นเดียวกัน เช่น หนัง + ซับใน ใช้ pid เดียวกัน) · name = ชื่อชิ้น เช่น "ตัวหน้า"
 *   at = ตำแหน่งชิ้นบนกระดาน "แบบวาด" (มุมซ้ายบนของเส้นเย็บ · ซม.) · refs = รูปอ้างอิงบนกระดาน (พิกัดกระดาน · เก็บซ้ำทุกบรรทัดของแท็บ)
 */
export type LineShape = { v: 1; shape: Shape; basis: ShapeBasis; holes?: Shape[]; allow?: number; pid?: string; name?: string; at?: [number, number]; refs?: RefImage[]; grain?: [Pt, Pt]; notches?: Pt[] };
/** เครื่องหมายบนชิ้น: เส้นทางผ้า (2 จุด) · รอยบาก (จุดบนเส้นเย็บ) — พิกัดเดียวกับรูปทรง ย้าย/ยืด/หมุน/กลับด้านไปพร้อมชิ้น */
export type PieceMarks = { grain?: Pt[] | null; notches?: Pt[] | null };
/** รูปอ้างอิง (รูปสินค้า) วางใต้กระดานวาด — url จากรูปในระบบ · x,y,w = ซม. บนกระดาน · ar = สูง/กว้าง · op = ความจาง 0–1 */
export type RefImage = { url: string; label?: string; x: number; y: number; w: number; ar: number; op: number };
/** ชิ้นงาน 1 ชิ้น = เส้นรอบนอก + รูเจาะ + เผื่อพับ */
export type PieceGeom = { shape: Shape; holes?: Shape[]; allow?: number };
export type Box = { x: number; y: number; w: number; h: number };
export type ShapeStats = { w: number; h: number; area: number; perimeter: number; fill: number };

/** ระยะ "ดูดเข้า" ที่ให้เลือก (ซม.) · 0 = ไม่ดูด */
export const SNAP_STEPS = [0, 0.1, 0.5, 1, 5] as const;
export const MAX_NODES = 4000;
const KAPPA = 0.5522847498;   // หูจับเบซิเยร์ที่ทำวงกลม 1/4 วง
const CURVE_STEPS = 32;

const fin = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** ดูดค่าเข้าหาตัวคูณของ step (0 = ไม่ดูด แต่ปัด 2 ตำแหน่งกันเศษ) */
export function snapTo(v: number, step: number): number {
  if (!(step > 0)) return Math.round(v * 100) / 100;
  return Math.round(Math.round(v / step) * step * 1000) / 1000;
}

const hasIn = (n: PNode) => !!(n.ix || n.iy);
const hasOut = (n: PNode) => !!(n.ox || n.oy);

/** โค้ง/เส้นรอบรูป → จุด (รูปปิด ไม่ซ้ำจุดแรกท้ายสุด) */
export function flattenShape(s: Shape, steps = CURVE_STEPS): Pt[] {
  if (s.k === "rect") return [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]];
  if (s.k === "ellipse") {
    const n = 72, cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * s.w / 2, cy + Math.sin(a) * s.h / 2] as Pt; });
  }
  const N = s.nodes;
  const out: Pt[] = [];
  for (let i = 0; i < N.length; i++) {
    const a = N[i], b = N[(i + 1) % N.length];
    out.push([a.x, a.y]);
    if (hasOut(a) || hasIn(b)) {
      const x1 = a.x + (a.ox ?? 0), y1 = a.y + (a.oy ?? 0), x2 = b.x + (b.ix ?? 0), y2 = b.y + (b.iy ?? 0);
      for (let t = 1; t < steps; t++) {
        const u = t / steps, v = 1 - u;
        out.push([v * v * v * a.x + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * b.x, v * v * v * a.y + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * b.y]);
      }
    }
  }
  return out;
}

export function shapeBox(s: Shape): Box {
  if (s.k !== "path") return { x: s.x, y: s.y, w: s.w, h: s.h };
  const P = flattenShape(s);
  if (!P.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function shapeArea(s: Shape): number {
  if (s.k === "rect") return Math.abs(s.w * s.h);
  if (s.k === "ellipse") return Math.PI * Math.abs(s.w / 2) * Math.abs(s.h / 2);
  const P = flattenShape(s);
  let A = 0;
  for (let i = 0; i < P.length; i++) { const [a, b] = P[i], [c, d] = P[(i + 1) % P.length]; A += a * d - c * b; }
  return Math.abs(A) / 2;
}

export function shapePerimeter(s: Shape): number {
  if (s.k === "rect") return 2 * (Math.abs(s.w) + Math.abs(s.h));
  if (s.k === "ellipse") { const a = Math.abs(s.w / 2), b = Math.abs(s.h / 2); return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))); }
  const P = flattenShape(s);
  let L = 0;
  for (let i = 0; i < P.length; i++) { const [a, b] = P[i], [c, d] = P[(i + 1) % P.length]; L += Math.hypot(c - a, d - b); }
  return L;
}

export function shapeStats(s: Shape): ShapeStats {
  const b = shapeBox(s), area = shapeArea(s);
  return { w: b.w, h: b.h, area, perimeter: shapePerimeter(s), fill: b.w * b.h > 0 ? area / (b.w * b.h) : 0 };
}

export function moveShape(s: Shape, dx: number, dy: number): Shape {
  if (s.k !== "path") return { ...s, x: s.x + dx, y: s.y + dy };
  return { k: "path", nodes: s.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })) };
}

/** ย้าย/ยืดให้กรอบเป็น x,y,w,h (ปากกา/Illustrator ยืดทั้งจุดและหูจับ) */
export function fitShape(s: Shape, x: number, y: number, w: number, h: number): Shape {
  if (s.k !== "path") return { k: s.k, x, y, w, h };
  const b = shapeBox(s);
  const sx = b.w > 0 ? w / b.w : 1, sy = b.h > 0 ? h / b.h : 1;
  return {
    k: "path",
    nodes: s.nodes.map((n) => {
      const m: PNode = { x: x + (n.x - b.x) * sx, y: y + (n.y - b.y) * sy };
      if (hasIn(n)) { m.ix = (n.ix ?? 0) * sx; m.iy = (n.iy ?? 0) * sy; }
      if (hasOut(n)) { m.ox = (n.ox ?? 0) * sx; m.oy = (n.oy ?? 0) * sy; }
      return m;
    }),
  };
}

/** เลื่อนให้กรอบเริ่มที่ 0,0 + ปัดทศนิยม 3 ตำแหน่ง (ก่อนเก็บ) */
export function normalizeShape(s: Shape): Shape {
  const b = shapeBox(s);
  const m = moveShape(s, -b.x, -b.y);
  if (m.k !== "path") return { k: m.k, x: 0, y: 0, w: r3(m.w), h: r3(m.h) };
  return {
    k: "path",
    nodes: m.nodes.map((n) => {
      const o: PNode = { x: r3(n.x), y: r3(n.y) };
      if (hasIn(n)) { o.ix = r3(n.ix ?? 0); o.iy = r3(n.iy ?? 0); }
      if (hasOut(n)) { o.ox = r3(n.ox ?? 0); o.oy = r3(n.oy ?? 0); }
      return o;
    }),
  };
}

/** SVG path data (d) ของรูปทรง เลื่อนไป ox,oy — ไว้วาดในหน้าจอ/หน้าพิมพ์/ไฟล์ SVG */
export function shapePathD(s: Shape, ox = 0, oy = 0): string {
  const f = (v: number) => String(Math.round(v * 1000) / 1000);
  if (s.k === "rect") return `M${f(s.x + ox)} ${f(s.y + oy)}H${f(s.x + s.w + ox)}V${f(s.y + s.h + oy)}H${f(s.x + ox)}Z`;
  if (s.k === "ellipse") {
    const rx = s.w / 2, ry = s.h / 2, cx = s.x + rx + ox, cy = s.y + ry + oy;
    return `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
  }
  const N = s.nodes;
  if (!N.length) return "";
  let d = `M${f(N[0].x + ox)} ${f(N[0].y + oy)}`;
  for (let i = 0; i < N.length; i++) {
    const a = N[i], b = N[(i + 1) % N.length];
    if (hasOut(a) || hasIn(b)) d += `C${f(a.x + (a.ox ?? 0) + ox)} ${f(a.y + (a.oy ?? 0) + oy)} ${f(b.x + (b.ix ?? 0) + ox)} ${f(b.y + (b.iy ?? 0) + oy)} ${f(b.x + ox)} ${f(b.y + oy)}`;
    else if (i < N.length - 1) d += `L${f(b.x + ox)} ${f(b.y + oy)}`;
  }
  return d + "Z";
}

/** ตรวจ/ทำความสะอาดรูปทรงที่มาจากหน้าจอหรือฐานข้อมูล — ผิดรูปแบบ = null (ไม่เดาให้) */
export function cleanShape(raw: unknown): Shape | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.k === "rect" || o.k === "ellipse") {
    const x = fin(o.x) ?? 0, y = fin(o.y) ?? 0, w = fin(o.w), h = fin(o.h);
    if (w == null || h == null || !(w > 0) || !(h > 0)) return null;
    return { k: o.k, x, y, w, h };
  }
  if (o.k === "path" && Array.isArray(o.nodes)) {
    const nodes: PNode[] = [];
    for (const r of o.nodes.slice(0, MAX_NODES)) {
      if (!r || typeof r !== "object") return null;
      const n = r as Record<string, unknown>;
      const x = fin(n.x), y = fin(n.y);
      if (x == null || y == null) return null;
      const m: PNode = { x, y };
      const ix = fin(n.ix), iy = fin(n.iy), ox = fin(n.ox), oy = fin(n.oy);
      if (ix || iy) { m.ix = ix ?? 0; m.iy = iy ?? 0; }
      if (ox || oy) { m.ox = ox ?? 0; m.oy = oy ?? 0; }
      nodes.push(m);
    }
    if (nodes.length < 3) return null;
    const s: Shape = { k: "path", nodes };
    return shapeArea(s) > 0 ? s : null;
  }
  return null;
}

export const MAX_ALLOW = 20;   // เผื่อพับสูงสุด (ซม.)
export const cleanAllow = (v: unknown): number => { const n = fin(v); return n == null || n <= 0 ? 0 : Math.min(MAX_ALLOW, Math.round(n * 100) / 100); };

export function cleanLineShape(raw: unknown): LineShape | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const shape = cleanShape(o.shape);
  if (!shape) return null;
  const holes = Array.isArray(o.holes) ? o.holes.slice(0, 50).map(cleanShape).filter((h): h is Shape => !!h) : [];
  const pt = (v: unknown): Pt | null => (Array.isArray(v) && v.length === 2 && fin(v[0]) != null && fin(v[1]) != null && Math.abs(Number(v[0])) < 1e5 && Math.abs(Number(v[1])) < 1e5 ? [Number(v[0]), Number(v[1])] : null);
  const grain = Array.isArray(o.grain) && o.grain.length === 2 ? o.grain.map(pt) : null;
  const notches = Array.isArray(o.notches) ? o.notches.slice(0, 100).map(pt).filter((q): q is Pt => !!q) : [];
  const norm = normalizePiece(shape, holes, { grain: grain && grain[0] && grain[1] ? (grain as Pt[]) : null, notches });
  const out: LineShape = { v: 1, shape: norm.shape, basis: o.basis === "area" ? "area" : "box" };
  if (norm.holes.length) out.holes = norm.holes;
  if (norm.grain && norm.grain.length === 2) out.grain = [norm.grain[0], norm.grain[1]];
  if (norm.notches?.length) out.notches = norm.notches;
  const allow = cleanAllow(o.allow);
  if (allow) out.allow = allow;
  if (typeof o.pid === "string" && /^[\w-]{1,40}$/.test(o.pid)) out.pid = o.pid;
  if (typeof o.name === "string" && o.name.trim()) out.name = o.name.trim().slice(0, 60);
  if (Array.isArray(o.at) && o.at.length === 2) { const x = fin(o.at[0]), y = fin(o.at[1]); if (x != null && y != null && Math.abs(x) < 1e5 && Math.abs(y) < 1e5) out.at = [r3(x), r3(y)]; }
  if (Array.isArray(o.refs)) { const refs = o.refs.slice(0, 4).map(cleanRefImage).filter((r): r is RefImage => !!r); if (refs.length) out.refs = refs; }
  return out;
}

/** ตรวจรูปอ้างอิง — รับเฉพาะรูปในระบบ (/api/r2-image?key=…) หรือ https · ห้าม data:/javascript: (กันไฟล์ยักษ์/สคริปต์แฝง) */
export function cleanRefImage(raw: unknown): RefImage | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const url = typeof o.url === "string" ? o.url.trim() : "";
  if (!url || url.length > 600 || !(/^\/api\/r2-image\?key=/.test(url) || /^https:\/\//.test(url))) return null;
  const x = fin(o.x), y = fin(o.y), w = fin(o.w), ar = fin(o.ar), op = fin(o.op);
  if (x == null || y == null || w == null || !(w >= 0.5 && w <= 2000) || ar == null || !(ar >= 0.02 && ar <= 50)) return null;
  const out: RefImage = { url, x: r3(x), y: r3(y), w: r3(w), ar: Math.round(ar * 10000) / 10000, op: op != null && op >= 0.05 && op <= 1 ? Math.round(op * 100) / 100 : 0.5 };
  if (typeof o.label === "string" && o.label.trim()) out.label = o.label.trim().slice(0, 60);
  return out;
}

/** พื้นที่ตัดจริง (ตร.ซม. รวมเผื่อพับ หักรูเจาะ) — ใช้แทน กว้าง×ยาว เมื่อเลือก "คิดจากพื้นที่จริง" · โหมดกรอบ = null */
export function lineShapeArea(ls: LineShape | null | undefined): number | null {
  if (!ls || ls.basis !== "area") return null;
  const a = pieceGeometry(ls).cutArea;
  return a > 0 ? Math.round(a * 100) / 100 : null;
}

/** ขนาดตัด (กรอบเส้นตัด รวมเผื่อพับ) = กว้าง×ยาวที่ลงบรรทัดตีราคา */
export function lineCutSize(g: PieceGeom): { w: number; h: number } {
  const b = pieceGeometry(g).cutBox;
  return { w: Math.round(b.w * 100) / 100, h: Math.round(b.h * 100) / 100 };
}

/** แก้กว้าง/ยาว (ขนาดตัด) ในตารางเอง → ยืดรูปทรง+รูตาม (หักเผื่อพับ 2 ข้างออกเป็นขนาดสำเร็จ) */
export function refitLineShape(ls: LineShape | null | undefined, w: number | null, h: number | null): LineShape | null | undefined {
  if (!ls) return ls;
  const a = ls.allow ?? 0;
  const b = shapeBox(ls.shape);
  const nw = w != null && w > 2 * a ? w - 2 * a : b.w, nh = h != null && h > 2 * a ? h - 2 * a : b.h;
  const f = fitPiece({ shape: ls.shape, holes: ls.holes ?? [], grain: ls.grain ?? null, notches: ls.notches ?? [] }, 0, 0, nw, nh);
  const norm = normalizePiece(f.shape, f.holes, { grain: f.grain, notches: f.notches });
  const { grain: _g, notches: _n, ...rest } = ls;   // eslint-disable-line @typescript-eslint/no-unused-vars
  return {
    ...rest, shape: norm.shape, ...(norm.holes.length ? { holes: norm.holes } : {}),
    ...(norm.grain && norm.grain.length === 2 ? { grain: [norm.grain[0], norm.grain[1]] as [Pt, Pt] } : {}),
    ...(norm.notches?.length ? { notches: norm.notches } : {}),
  };
}

// ───────────────────────── นำเข้า SVG (Illustrator) ─────────────────────────

type M6 = [number, number, number, number, number, number];   // a b c d e f → x' = a x + c y + e · y' = b x + d y + f
const I6: M6 = [1, 0, 0, 1, 0, 0];
const mul = (m: M6, n: M6): M6 => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apP = (m: M6, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const apV = (m: M6, x: number, y: number): Pt => [m[0] * x + m[2] * y, m[1] * x + m[3] * y];

export function parseTransform(t: string | null | undefined): M6 {
  let m = I6;
  if (!t) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let g: RegExpExecArray | null;
  while ((g = re.exec(t))) {
    const v = (g[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    let n: M6 = I6;
    if (g[1] === "matrix" && v.length >= 6) n = [v[0], v[1], v[2], v[3], v[4], v[5]];
    else if (g[1] === "translate") n = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
    else if (g[1] === "scale") n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    else if (g[1] === "rotate") {
      const a = ((v[0] ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      const r: M6 = [c, s, -s, c, 0, 0];
      n = v.length >= 3 ? mul(mul([1, 0, 0, 1, v[1], v[2]], r), [1, 0, 0, 1, -v[1], -v[2]]) : r;
    } else if (g[1] === "skewX") n = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (g[1] === "skewY") n = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, n);
  }
  return m;
}

function attrs(s: string): Record<string, string> {
  const o: Record<string, string> = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let g: RegExpExecArray | null;
  while ((g = re.exec(s))) o[g[1]] = g[2] ?? g[3] ?? "";
  return o;
}

const UNIT_CM: Record<string, number> = { mm: 0.1, cm: 1, in: 2.54, pt: 2.54 / 72, pc: 2.54 / 6, px: 2.54 / 72 };
/** หน่วยของ Illustrator: 1 หน่วย = 1 pt (72 ต่อนิ้ว) */
export const ILLUSTRATOR_CM_PER_UNIT = 2.54 / 72;

function lenCm(v: string | undefined): { n: number; unit: string } | null {
  const g = /^\s*(-?\d*\.?\d+)\s*(mm|cm|in|pt|pc|px)?\s*$/i.exec(v ?? "");
  return g ? { n: Number(g[1]), unit: (g[2] ?? "px").toLowerCase() } : null;
}

/** ellipse → path 4 โค้ง (ใช้ตอนโดนหมุน/เอียง) */
export function ellipseNodes(cx: number, cy: number, rx: number, ry: number): PNode[] {
  const kx = rx * KAPPA, ky = ry * KAPPA;
  return [
    { x: cx + rx, y: cy, ix: 0, iy: -ky, ox: 0, oy: ky },
    { x: cx, y: cy + ry, ix: kx, iy: 0, ox: -kx, oy: 0 },
    { x: cx - rx, y: cy, ix: 0, iy: ky, ox: 0, oy: -ky },
    { x: cx, y: cy - ry, ix: -kx, iy: 0, ox: kx, oy: 0 },
  ];
}

function roundRectNodes(x: number, y: number, w: number, h: number, rx: number, ry: number): PNode[] {
  rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
  const kx = rx * KAPPA, ky = ry * KAPPA;
  return [
    { x: x + rx, y, ix: -kx, iy: 0 }, { x: x + w - rx, y, ox: kx, oy: 0 },
    { x: x + w, y: y + ry, ix: 0, iy: -ky }, { x: x + w, y: y + h - ry, ox: 0, oy: ky },
    { x: x + w - rx, y: y + h, ix: kx, iy: 0 }, { x: x + rx, y: y + h, ox: -kx, oy: 0 },
    { x, y: y + h - ry, ix: 0, iy: ky }, { x, y: y + ry, ox: 0, oy: -ky },
  ];
}

/** path d → รูปปิดหลายเส้น (หน่วยเดิมของไฟล์) */
export function parsePathData(d: string): PNode[][] {
  const tk = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) ?? [];
  const subs: PNode[][] = [];
  let cur: PNode[] | null = null;
  let x = 0, y = 0, sx = 0, sy = 0, i = 0, cmd = "";
  let lastC: Pt | null = null, lastQ: Pt | null = null;
  const num = () => Number(tk[i++]);
  const isCmd = (s: string | undefined) => !!s && /^[a-zA-Z]$/.test(s);
  const lineTo = (nx: number, ny: number) => { if (!cur) { cur = [{ x, y }]; subs.push(cur); } cur.push({ x: nx, y: ny }); x = nx; y = ny; };
  const cubicTo = (x1: number, y1: number, x2: number, y2: number, nx: number, ny: number) => {
    if (!cur) { cur = [{ x, y }]; subs.push(cur); }
    const last = cur[cur.length - 1];
    if (x1 !== last.x || y1 !== last.y) { last.ox = x1 - last.x; last.oy = y1 - last.y; }
    const n: PNode = { x: nx, y: ny };
    if (x2 !== nx || y2 !== ny) { n.ix = x2 - nx; n.iy = y2 - ny; }
    cur.push(n); x = nx; y = ny;
  };
  while (i < tk.length) {
    if (isCmd(tk[i])) cmd = tk[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const bx = rel ? x : 0, by = rel ? y : 0;
    if (C === "Z") { if (cur) { closeSub(cur); } cur = null; x = sx; y = sy; lastC = lastQ = null; cmd = ""; continue; }
    if (i >= tk.length || isCmd(tk[i])) { cmd = ""; continue; }   // คำสั่งไม่มีตัวเลขตาม
    if (C === "M") { const nx = num() + bx, ny = num() + by; cur = [{ x: nx, y: ny }]; subs.push(cur); x = sx = nx; y = sy = ny; cmd = rel ? "l" : "L"; lastC = lastQ = null; continue; }
    if (C === "L") { lineTo(num() + bx, num() + by); lastC = lastQ = null; }
    else if (C === "H") { lineTo(num() + bx, y); lastC = lastQ = null; }
    else if (C === "V") { lineTo(x, num() + by); lastC = lastQ = null; }
    else if (C === "C") { const a = [num() + bx, num() + by, num() + bx, num() + by, num() + bx, num() + by]; cubicTo(a[0], a[1], a[2], a[3], a[4], a[5]); lastC = [a[2], a[3]]; lastQ = null; }
    else if (C === "S") { const c1: Pt = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y]; const a = [num() + bx, num() + by, num() + bx, num() + by]; cubicTo(c1[0], c1[1], a[0], a[1], a[2], a[3]); lastC = [a[0], a[1]]; lastQ = null; }
    else if (C === "Q" || C === "T") {
      const q: Pt = C === "Q" ? [num() + bx, num() + by] : lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y];
      const nx = num() + bx, ny = num() + by;
      cubicTo(x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y), nx + (2 / 3) * (q[0] - nx), ny + (2 / 3) * (q[1] - ny), nx, ny);
      lastQ = q; lastC = null;
    } else if (C === "A") {
      const rx = num(), ry = num(), rot = num(), large = num(), sweep = num(), nx = num() + bx, ny = num() + by;
      arcTo(rx, ry, rot, large, sweep, nx, ny);
      lastC = lastQ = null;
    } else i++;
  }
  return subs.map((s) => { closeSub(s); return s; }).filter((s) => s.length >= 3);

  // จุดสุดท้ายทับจุดแรก (Illustrator ชอบปิดรูปแบบนี้) → รวมเป็นจุดเดียว เก็บหูจับเข้าไว้
  function closeSub(s: PNode[]) {
    if (s.length < 2) return;
    const a = s[0], z = s[s.length - 1];
    if (Math.abs(a.x - z.x) < 1e-6 && Math.abs(a.y - z.y) < 1e-6) {
      if (hasIn(z)) { a.ix = z.ix; a.iy = z.iy; }
      s.pop();
    }
  }
  // ส่วนโค้งวงรี (คำสั่ง A) → เบซิเยร์ทีละไม่เกิน 90°
  function arcTo(rx: number, ry: number, rotDeg: number, large: number, sweep: number, nx: number, ny: number) {
    if (!rx || !ry) { lineTo(nx, ny); return; }
    const phi = (rotDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
    const dx = (x - nx) / 2, dy = (y - ny) / 2;
    const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const sign = large === sweep ? -1 : 1;
    const num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const co = sign * Math.sqrt(Math.max(0, num2 / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
    const cx1 = (co * rx * y1) / ry, cy1 = (-co * ry * x1) / rx;
    const cx = cp * cx1 - sp * cy1 + (x + nx) / 2, cy = sp * cx1 + cp * cy1 + (y + ny) / 2;
    const ang = (ux: number, uy: number, vx: number, vy: number) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
    const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
    let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
    const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
    const step = dt / segs, k = (4 / 3) * Math.tan(step / 4);
    let t = t1;
    for (let s = 0; s < segs; s++) {
      const c1 = Math.cos(t), s1 = Math.sin(t), c2 = Math.cos(t + step), s2 = Math.sin(t + step);
      const P = (ex: number, ey: number): Pt => [cx + cp * rx * ex - sp * ry * ey, cy + sp * rx * ex + cp * ry * ey];
      const q1 = P(c1 - k * s1, s1 + k * c1), q2 = P(c2 + k * s2, s2 - k * c2), e = P(c2, s2);
      cubicTo(q1[0], q1[1], q2[0], q2[1], e[0], e[1]);
      t += step;
    }
  }
}

function txNodes(nodes: PNode[], m: M6): PNode[] {
  return nodes.map((n) => {
    const [x, y] = apP(m, n.x, n.y);
    const o: PNode = { x, y };
    if (hasIn(n)) { const [a, b] = apV(m, n.ix ?? 0, n.iy ?? 0); o.ix = a; o.iy = b; }
    if (hasOut(n)) { const [a, b] = apV(m, n.ox ?? 0, n.oy ?? 0); o.ox = a; o.oy = b; }
    return o;
  });
}

export type SvgImport = { pieces: { shape: Shape; holes: Shape[] }[]; cmPerUnit: number; unitNote: string };

/**
 * ข้อความ SVG (ก๊อปจาก Illustrator / ไฟล์ .svg) → รูปทรงหน่วย ซม. (เลื่อนให้กลุ่มเริ่มที่ 0,0) · ไม่ใช่ SVG / ไม่มีรูปปิด = null
 * ข้าม defs / clipPath / mask / symbol / pattern / marker (ของตกแต่ง ไม่ใช่ชิ้นงาน)
 */
export function parseSvgShapes(text: string): SvgImport | null {
  if (!/<svg[\s>]/i.test(text)) return null;
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)\b([^>]*?)(\/?)>/g;
  const SKIP = new Set(["defs", "clipPath", "mask", "symbol", "pattern", "marker", "linearGradient", "radialGradient", "style", "title", "desc", "metadata"]);
  const stack: { tag: string; m: M6; hid?: boolean }[] = [];
  let skip = 0, cmPerUnit = ILLUSTRATOR_CM_PER_UNIT, unitNote = "72 จุดต่อนิ้ว (แบบ Illustrator)", root = false;
  const raw: Shape[] = [];
  const rawHoles = new Map<number, Shape[]>();   // ดัชนีชิ้นใน raw → รูเจาะ (จาก path หลายเส้นที่อยู่ในกันและกัน)
  const curM = () => (stack.length ? stack[stack.length - 1].m : I6);
  let g: RegExpExecArray | null;
  while ((g = tagRe.exec(text))) {
    const [, close, tag, rest, selfClose] = g;
    if (close) {
      const at = stack.map((s) => s.tag).lastIndexOf(tag);
      if (at >= 0) { skip -= stack.slice(at).filter((s) => s.hid).length; stack.splice(at); }
      continue;
    }
    const a = attrs(rest);
    const hidden = SKIP.has(tag) || /display\s*:\s*none/i.test(a.style ?? "") || a.display === "none";
    if (hidden || skip > 0) { if (!selfClose) { stack.push({ tag, m: curM(), hid: true }); skip++; } continue; }
    const m = mul(curM(), parseTransform(a.transform));
    if (tag === "svg") {
      if (!root) {
        root = true;
        const vb = (a.viewBox ?? "").trim().split(/[\s,]+/).map(Number);
        const W = lenCm(a.width), H = lenCm(a.height);
        if (vb.length === 4 && vb[2] > 0 && W && W.unit !== "px" && W.n > 0) { cmPerUnit = (W.n * UNIT_CM[W.unit]) / vb[2]; unitNote = `ตามขนาดในไฟล์ (${a.width})`; }
        else if (vb.length === 4 && vb[3] > 0 && H && H.unit !== "px" && H.n > 0) { cmPerUnit = (H.n * UNIT_CM[H.unit]) / vb[3]; unitNote = `ตามขนาดในไฟล์ (${a.height})`; }
        else if (!vb.length && W && W.unit !== "px") { cmPerUnit = UNIT_CM[W.unit] ?? cmPerUnit; unitNote = `หน่วย ${W.unit}`; }
      }
      if (!selfClose) stack.push({ tag, m });
      continue;
    }
    if (tag === "g" || tag === "a") { if (!selfClose) stack.push({ tag, m }); continue; }
    const n = (k: string, d = 0) => { const v = Number(a[k]); return Number.isFinite(v) ? v : d; };
    const pure = m[1] === 0 && m[2] === 0;   // ไม่หมุน/ไม่เอียง
    if (tag === "rect") {
      const x = n("x"), y = n("y"), w = n("width"), h = n("height");
      if (!(w > 0) || !(h > 0)) continue;
      let rx = n("rx", NaN), ry = n("ry", NaN);
      if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
      if (Number.isNaN(ry)) ry = rx;
      if (rx > 0 || ry > 0) raw.push({ k: "path", nodes: txNodes(roundRectNodes(x, y, w, h, rx, ry), m) });
      else if (pure) { const [px, py] = apP(m, x, y); raw.push({ k: "rect", x: Math.min(px, px + w * m[0]), y: Math.min(py, py + h * m[3]), w: Math.abs(w * m[0]), h: Math.abs(h * m[3]) }); }
      else raw.push({ k: "path", nodes: txNodes([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], m) });
    } else if (tag === "circle" || tag === "ellipse") {
      const cx = n("cx"), cy = n("cy"), rx = tag === "circle" ? n("r") : n("rx"), ry = tag === "circle" ? n("r") : n("ry");
      if (!(rx > 0) || !(ry > 0)) continue;
      if (pure) { const [px, py] = apP(m, cx, cy); const w = Math.abs(2 * rx * m[0]), h = Math.abs(2 * ry * m[3]); raw.push({ k: "ellipse", x: px - w / 2, y: py - h / 2, w, h }); }
      else raw.push({ k: "path", nodes: txNodes(ellipseNodes(cx, cy, rx, ry), m) });
    } else if (tag === "polygon" || tag === "polyline") {
      const v = (a.points ?? "").trim().split(/[\s,]+/).map(Number).filter((x) => Number.isFinite(x));
      const nodes: PNode[] = [];
      for (let k = 0; k + 1 < v.length; k += 2) nodes.push({ x: v[k], y: v[k + 1] });
      if (nodes.length >= 3) raw.push({ k: "path", nodes: txNodes(nodes, m) });
    } else if (tag === "path") {
      // path หลายเส้น (compound path) — เส้นที่อยู่ในอีกเส้น = รูเจาะของเส้นนั้น (เช่น ช่องหูหิ้ว)
      const subs = parsePathData(a.d ?? "").map((sub): Shape => ({ k: "path", nodes: txNodes(sub, m) }));
      const holeOf = subs.map((s, j) => subs.findIndex((o, i) => i !== j && shapeInside(s, o)));
      const base = raw.length;
      const idx = new Map<number, number>();
      subs.forEach((s, j) => { if (holeOf[j] < 0 || holeOf[holeOf[j]] >= 0) { idx.set(j, raw.length); raw.push(s); } });
      subs.forEach((s, j) => { const host = holeOf[j]; if (host >= 0 && holeOf[host] < 0) { const at = idx.get(host) ?? base; (rawHoles.get(at) ?? rawHoles.set(at, []).get(at)!).push(s); } });
    }
  }
  const pieces = raw.map((s, i) => ({ shape: scaleShape(s, cmPerUnit), holes: (rawHoles.get(i) ?? []).map((h) => scaleShape(h, cmPerUnit)) }))
    .filter((p) => shapeArea(p.shape) > 0.0001);
  if (!pieces.length) return null;
  // เลื่อนทั้งกลุ่มให้เริ่มที่ 0,0 (ตำแหน่งระหว่างชิ้นเหมือนใน Illustrator)
  let x0 = Infinity, y0 = Infinity;
  for (const p of pieces) { const b = shapeBox(p.shape); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); }
  return { pieces: pieces.map((p) => movePiece(p, -x0, -y0)), cmPerUnit, unitNote };
}

function scaleShape(s: Shape, k: number): Shape {
  if (s.k !== "path") return { k: s.k, x: s.x * k, y: s.y * k, w: s.w * k, h: s.h * k };
  return {
    k: "path",
    nodes: s.nodes.map((n) => {
      const o: PNode = { x: n.x * k, y: n.y * k };
      if (hasIn(n)) { o.ix = (n.ix ?? 0) * k; o.iy = (n.iy ?? 0) * k; }
      if (hasOut(n)) { o.ox = (n.ox ?? 0) * k; o.oy = (n.oy ?? 0) * k; }
      return o;
    }),
  };
}

// ───────────────────────── ชิ้นงาน: เผื่อพับ · รูเจาะ · พับครึ่ง · กลับด้าน · แก้จุด (2026-11-09 ขั้นที่ 2) ─────────────────────────

const signedArea = (P: Pt[]) => { let A = 0; for (let i = 0; i < P.length; i++) { const [a, b] = P[i], [c, d] = P[(i + 1) % P.length]; A += a * d - c * b; } return A / 2; };
const polyArea = (P: Pt[]) => Math.abs(signedArea(P));
const polyLen = (P: Pt[]) => { let L = 0; for (let i = 0; i < P.length; i++) { const [a, b] = P[i], [c, d] = P[(i + 1) % P.length]; L += Math.hypot(c - a, d - b); } return L; };
export function polyBox(P: Pt[]): Box {
  if (!P.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** SVG path data ของรูปหลายเหลี่ยม (จุด) */
export function polyD(P: Pt[], ox = 0, oy = 0): string {
  if (!P.length) return "";
  const f = (v: number) => String(Math.round(v * 1000) / 1000);
  return "M" + P.map(([x, y]) => `${f(x + ox)} ${f(y + oy)}`).join("L") + "Z";
}

/**
 * ขยาย (d > 0) / หด (d < 0) รูปหลายเหลี่ยมออกเท่ากันทุกด้าน — ใช้ทำเส้นตัดจากเส้นเย็บ (เผื่อพับ)
 * มุมแหลมมาก (ยื่นเกิน 4 เท่าของ d) ตัดมุมเป็น 2 จุดแทน กันมุมพุ่งยาว
 */
export function offsetPolygon(P: Pt[], d: number): Pt[] {
  if (!d || P.length < 3) return P;
  const pts = P.filter((p, i) => { const q = P[(i + 1) % P.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-9; });
  const n = pts.length;
  if (n < 3) return P;
  const s = signedArea(pts) > 0 ? 1 : -1;   // แกน y ลง: พื้นที่บวก = ตามเข็ม → เส้นตั้งฉากด้านนอก = (dy, -dx)
  const L = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const nx = s * dy, ny = -s * dx;
    return { p: [a[0] + nx * d, a[1] + ny * d] as Pt, v: [dx, dy] as Pt, n: [nx, ny] as Pt };
  });
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const l1 = L[(i - 1 + n) % n], l2 = L[i];
    const den = l1.v[0] * l2.v[1] - l1.v[1] * l2.v[0];
    if (Math.abs(den) < 1e-9) { out.push(l2.p); continue; }   // เส้นตรงต่อกัน
    const t = ((l2.p[0] - l1.p[0]) * l2.v[1] - (l2.p[1] - l1.p[1]) * l2.v[0]) / den;
    const q: Pt = [l1.p[0] + l1.v[0] * t, l1.p[1] + l1.v[1] * t];
    const v = pts[i];
    if (Math.hypot(q[0] - v[0], q[1] - v[1]) > Math.abs(d) * 4) out.push([v[0] + l1.n[0] * d, v[1] + l1.n[1] * d], [v[0] + l2.n[0] * d, v[1] + l2.n[1] * d]);
    else out.push(q);
  }
  return out;
}

export type PieceGeometry = {
  sew: Pt[];            // เส้นเย็บ (ขนาดสำเร็จ)
  cut: Pt[];            // เส้นตัด (รวมเผื่อพับ)
  holesSew: Pt[][];     // รูเจาะ (ขนาดสำเร็จ)
  holesCut: Pt[][];     // รูเจาะที่ตัดจริง (หดเข้า = เผื่อพับเข้าด้านใน · รูเล็กกว่าเผื่อพับ = หายไป)
  finished: Box; cutBox: Box;
  finishedArea: number; cutArea: number;   // หักรูแล้ว
  perimeter: number; cutPerimeter: number; // รอบรูปเส้นเย็บ (รวมขอบรู) / เส้นตัด
};

/** คิดทุกอย่างของชิ้น: เส้นเย็บ · เส้นตัด · รู · กรอบ · พื้นที่ · รอบรูป */
export function pieceGeometry(g: PieceGeom): PieceGeometry {
  const a = cleanAllow(g.allow);
  const sew = flattenShape(g.shape);
  const cut = a ? offsetPolygon(sew, a) : sew;
  const holesSew = (g.holes ?? []).map((h) => flattenShape(h));
  const holesCut = holesSew.map((h) => {
    if (!a) return h;
    const b = polyBox(h);
    if (b.w <= 2 * a || b.h <= 2 * a) return null;
    const o = offsetPolygon(h, -a);
    return polyArea(o) > 0 && Math.sign(signedArea(o)) === Math.sign(signedArea(h)) ? o : null;
  }).filter((h): h is Pt[] => !!h);
  const holesA = (hs: Pt[][]) => hs.reduce((m, h) => m + polyArea(h), 0);
  return {
    sew, cut, holesSew, holesCut,
    finished: polyBox(sew), cutBox: polyBox(cut),
    finishedArea: Math.max(0, shapeArea(g.shape) - (g.holes ?? []).reduce((m, h) => m + shapeArea(h), 0)),
    cutArea: a ? Math.max(0, polyArea(cut) - holesA(holesCut)) : Math.max(0, shapeArea(g.shape) - (g.holes ?? []).reduce((m, h) => m + shapeArea(h), 0)),   // ไม่เผื่อ = พื้นที่แม่นตามสูตร
    perimeter: shapePerimeter(g.shape) + holesSew.reduce((m, h) => m + polyLen(h), 0),
    cutPerimeter: polyLen(cut) + holesCut.reduce((m, h) => m + polyLen(h), 0),
  };
}

/** แปลงจุดของเส้นทางผ้า/รอยบาก ด้วยสูตรเดียวกับชิ้น (ถ้ามี) */
function mapMarks<T>(p: T, f: (q: Pt) => Pt): T {
  const m = p as T & PieceMarks;
  const o: PieceMarks = {};
  if (m.grain && m.grain.length === 2) o.grain = [f(m.grain[0]), f(m.grain[1])];
  if (m.notches?.length) o.notches = m.notches.map(f);
  return Object.keys(o).length ? { ...p, ...o } : p;
}

export function movePiece<T extends { shape: Shape; holes?: Shape[] }>(p: T, dx: number, dy: number): T & { holes: Shape[] } {
  return mapMarks({ ...p, shape: moveShape(p.shape, dx, dy), holes: (p.holes ?? []).map((h) => moveShape(h, dx, dy)) }, ([x, y]) => [x + dx, y + dy]);
}

/** ยืด/ย้ายชิ้น (เส้นนอก = กรอบ x,y,w,h) — รูยืดและเลื่อนตามสัดส่วนเดียวกัน */
export function fitPiece<T extends { shape: Shape; holes?: Shape[] }>(p: T, x: number, y: number, w: number, h: number): T & { holes: Shape[] } {
  const b = shapeBox(p.shape);
  const sx = b.w > 0 ? w / b.w : 1, sy = b.h > 0 ? h / b.h : 1;
  return mapMarks({
    ...p, shape: fitShape(p.shape, x, y, w, h),
    holes: (p.holes ?? []).map((hs) => { const hb = shapeBox(hs); return fitShape(hs, x + (hb.x - b.x) * sx, y + (hb.y - b.y) * sy, hb.w * sx, hb.h * sy); }),
  }, ([qx, qy]) => [x + (qx - b.x) * sx, y + (qy - b.y) * sy]);
}

/** เลื่อนชิ้น (เส้นนอก+รู) ให้กรอบเส้นนอกเริ่มที่ 0,0 + ปัดทศนิยม (ก่อนเก็บ) */
export function normalizePiece(shape: Shape, holes: Shape[] = [], marks: PieceMarks = {}): { shape: Shape; holes: Shape[]; grain?: Pt[]; notches?: Pt[] } {
  const b = shapeBox(shape);
  const sh = ([x, y]: Pt): Pt => [r3(x - b.x), r3(y - b.y)];
  return {
    shape: normalizeShape(shape), holes: holes.map((h) => roundShape(moveShape(h, -b.x, -b.y))),
    ...(marks.grain && marks.grain.length === 2 ? { grain: marks.grain.map(sh) } : {}),
    ...(marks.notches?.length ? { notches: marks.notches.map(sh) } : {}),
  };
}
function roundShape(s: Shape): Shape {
  if (s.k !== "path") return { k: s.k, x: r3(s.x), y: r3(s.y), w: r3(s.w), h: r3(s.h) };
  return { k: "path", nodes: s.nodes.map((n) => { const o: PNode = { x: r3(n.x), y: r3(n.y) }; if (hasIn(n)) { o.ix = r3(n.ix ?? 0); o.iy = r3(n.iy ?? 0); } if (hasOut(n)) { o.ox = r3(n.ox ?? 0); o.oy = r3(n.oy ?? 0); } return o; }) };
}

export function pointInPolygon(p: Pt, P: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/** inner อยู่ข้างใน outer ทั้งชิ้นไหม (ใช้ตัดสินว่าเจาะเป็นรูได้) */
export function shapeInside(inner: Shape, outer: Shape): boolean {
  const ib = shapeBox(inner), ob = shapeBox(outer);
  if (ib.x < ob.x - 1e-6 || ib.y < ob.y - 1e-6 || ib.x + ib.w > ob.x + ob.w + 1e-6 || ib.y + ib.h > ob.y + ob.h + 1e-6) return false;
  if (ib.w * ib.h >= ob.w * ob.h) return false;
  const O = flattenShape(outer, 12);
  const I = flattenShape(inner, 8);
  const step = Math.max(1, Math.floor(I.length / 24));
  for (let i = 0; i < I.length; i += step) if (!pointInPolygon(I[i], O)) return false;
  return true;
}

/** สี่เหลี่ยม/วงกลม → จุด (ไว้แก้จุด / พับครึ่ง) */
export function toPathShape(s: Shape): Shape {
  if (s.k === "path") return s;
  if (s.k === "rect") return { k: "path", nodes: [{ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y }, { x: s.x + s.w, y: s.y + s.h }, { x: s.x, y: s.y + s.h }] };
  return { k: "path", nodes: ellipseNodes(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2) };
}

/** สะท้อนรูปรอบเส้น x = c (axis "x") หรือ y = c (axis "y") */
export function mirrorShape(s: Shape, axis: "x" | "y", c: number): Shape {
  if (s.k !== "path") return axis === "x" ? { ...s, x: 2 * c - s.x - s.w } : { ...s, y: 2 * c - s.y - s.h };
  // กลับลำดับจุด (ให้ทิศทางเดิม) + สลับหูจับเข้า/ออก
  const fx = axis === "x" ? -1 : 1, fy = axis === "y" ? -1 : 1;
  const m = (n: PNode): PNode => {
    const o: PNode = axis === "x" ? { x: 2 * c - n.x, y: n.y } : { x: n.x, y: 2 * c - n.y };
    if (hasOut(n)) { o.ix = (n.ox ?? 0) * fx; o.iy = (n.oy ?? 0) * fy; }
    if (hasIn(n)) { o.ox = (n.ix ?? 0) * fx; o.oy = (n.iy ?? 0) * fy; }
    return o;
  };
  return { k: "path", nodes: [...s.nodes].reverse().map(m) };
}

/** กลับด้านทั้งชิ้น (รอบกึ่งกลางของตัวเอง) — ได้ชิ้นซ้าย/ขวาเป็นคู่ */
export function flipPiece<T extends { shape: Shape; holes?: Shape[] }>(p: T, axis: "x" | "y" = "x"): T & { holes: Shape[] } {
  const b = shapeBox(p.shape);
  const c = axis === "x" ? b.x + b.w / 2 : b.y + b.h / 2;
  return mapMarks({ ...p, shape: mirrorShape(p.shape, axis, c), holes: (p.holes ?? []).map((h) => mirrorShape(h, axis, c)) }, ([x, y]) => (axis === "x" ? [2 * c - x, y] : [x, 2 * c - y]));
}

/**
 * พับครึ่ง: วาดครึ่งเดียว แล้วต่อกระจกด้านขวา (axis "x") หรือด้านล่าง (axis "y") ได้ชิ้นสมมาตร
 *   ต้องมีเส้นตรงแนบขอบที่จะพับ (สี่เหลี่ยม = ได้เสมอ) · วงกลม/ไม่มีเส้นแนบ = null
 *   รูเจาะสะท้อนไปอีกฝั่งด้วย
 */
export function foldPiece<T extends { shape: Shape; holes?: Shape[] }>(p: T, axis: "x" | "y"): (T & { holes: Shape[] }) | null {
  const s = p.shape;
  const b = shapeBox(s);
  const F = axis === "x" ? b.x + b.w : b.y + b.h;
  const holes = p.holes ?? [];
  const notches = (p as T & PieceMarks).notches ?? [];
  const mirPt = ([x, y]: Pt): Pt => (axis === "x" ? [2 * F - x, y] : [x, 2 * F - y]);
  const withHoles = (shape: Shape) => ({ ...p, shape, holes: [...holes, ...holes.map((h) => mirrorShape(h, axis, F))], ...(notches.length ? { notches: [...notches, ...notches.map(mirPt)] } : {}) });
  if (s.k === "rect") return withHoles(axis === "x" ? { ...s, w: s.w * 2 } : { ...s, h: s.h * 2 });
  if (s.k !== "path") return null;
  const N = s.nodes, n = N.length;
  const on = (q: PNode) => Math.abs((axis === "x" ? q.x : q.y) - F) < 0.01;
  let e = -1;
  for (let i = 0; i < n; i++) { const a = N[i], c = N[(i + 1) % n]; if (on(a) && on(c) && !hasOut(a) && !hasIn(c)) { e = i; break; } }
  if (e < 0) return null;
  // C = จาก B (ปลายเส้นพับ) วนไปถึง A (ต้นเส้นพับ) · M = สะท้อน C ย้อนกลับ (เริ่มที่ A' = A · จบที่ B' = B)
  const C = Array.from({ length: n }, (_, k) => ({ ...N[(e + 1 + k) % n] }));
  const mir = mirrorShape({ k: "path", nodes: C }, axis, F);
  if (mir.k !== "path") return null;
  const M = mir.nodes;
  const A = C[C.length - 1], B = C[0];
  const mA = M[0], mB = M[M.length - 1];
  if (hasOut(mA)) { A.ox = mA.ox; A.oy = mA.oy; }   // หูจับของ A/B ฝั่งที่ต่อกับกระจก
  if (hasIn(mB)) { B.ix = mB.ix; B.iy = mB.iy; }
  return withHoles({ k: "path", nodes: [...C, ...M.slice(1, -1)] });
}

/** จุดบนเส้นที่ใกล้ p ที่สุด: ช่วงที่ i (จาก node i → i+1) + ตำแหน่ง t (0–1) + ระยะ */
export function nearestSegment(nodes: PNode[], p: Pt): { i: number; t: number; dist: number } {
  let best = { i: 0, t: 0.5, dist: Infinity };
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    const a = nodes[i], b = nodes[(i + 1) % n];
    const x1 = a.x + (a.ox ?? 0), y1 = a.y + (a.oy ?? 0), x2 = b.x + (b.ix ?? 0), y2 = b.y + (b.iy ?? 0);
    for (let k = 0; k <= 24; k++) {
      const t = k / 24, u = 1 - t;
      const x = u * u * u * a.x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * b.x;
      const y = u * u * u * a.y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * b.y;
      const d = Math.hypot(x - p[0], y - p[1]);
      if (d < best.dist) best = { i, t, dist: d };
    }
  }
  return best;
}

/** แทรกจุดใหม่ในช่วงที่ i ตำแหน่ง t — แบ่งเส้นโค้งแบบ de Casteljau รูปทรงไม่เปลี่ยน */
export function splitSegment(nodes: PNode[], i: number, t: number): PNode[] {
  const n = nodes.length;
  const a: PNode = { ...nodes[i] }, b: PNode = { ...nodes[(i + 1) % n] };
  const P0: Pt = [a.x, a.y], P1: Pt = [a.x + (a.ox ?? 0), a.y + (a.oy ?? 0)], P2: Pt = [b.x + (b.ix ?? 0), b.y + (b.iy ?? 0)], P3: Pt = [b.x, b.y];
  const L = (p: Pt, q: Pt): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const curved = hasOut(a) || hasIn(b);
  const Q0 = L(P0, P1), Q1 = L(P1, P2), Q2 = L(P2, P3), R0 = L(Q0, Q1), R1 = L(Q1, Q2), S = L(R0, R1);
  const mid: PNode = { x: S[0], y: S[1] };
  if (curved) {
    a.ox = Q0[0] - a.x; a.oy = Q0[1] - a.y;
    mid.ix = R0[0] - S[0]; mid.iy = R0[1] - S[1]; mid.ox = R1[0] - S[0]; mid.oy = R1[1] - S[1];
    b.ix = Q2[0] - b.x; b.iy = Q2[1] - b.y;
  }
  const out = nodes.map((x) => ({ ...x }));
  out[i] = a; out[(i + 1) % n] = b;
  out.splice(i + 1, 0, mid);
  return out;
}

/** สลับจุดมุม ↔ จุดโค้ง (โค้ง = หูจับขนานเส้นเพื่อนบ้าน ยาว 1/6 ของระยะ) */
export function toggleSmooth(nodes: PNode[], i: number): PNode[] {
  const n = nodes.length, out = nodes.map((x) => ({ ...x }));
  const c = out[i];
  if (hasIn(c) || hasOut(c)) { delete c.ix; delete c.iy; delete c.ox; delete c.oy; return out; }
  const p = out[(i - 1 + n) % n], q = out[(i + 1) % n];
  const vx = (q.x - p.x) / 6, vy = (q.y - p.y) / 6;
  c.ox = vx; c.oy = vy; c.ix = -vx; c.iy = -vy;
  return out;
}

// ───────────────────────── ไม้บรรทัด: วัดตรง · วัดโค้ง · วัดตามขอบชิ้น (2026-11-09) ─────────────────────────

/** เส้นเปิด (ไม่ปิดกลับจุดแรก) จากจุด+หูจับ → จุดถี่ ๆ */
export function flattenOpen(nodes: PNode[], steps = CURVE_STEPS): Pt[] {
  if (!nodes.length) return [];
  const out: Pt[] = [[nodes[0].x, nodes[0].y]];
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1], b = nodes[i];
    if (hasOut(a) || hasIn(b)) {
      const x1 = a.x + (a.ox ?? 0), y1 = a.y + (a.oy ?? 0), x2 = b.x + (b.ix ?? 0), y2 = b.y + (b.iy ?? 0);
      for (let t = 1; t <= steps; t++) {
        const u = t / steps, v = 1 - u;
        out.push([v * v * v * a.x + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * b.x, v * v * v * a.y + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * b.y]);
      }
    } else out.push([b.x, b.y]);
  }
  return out;
}

/** ความยาวเส้นเปิด (วัดโค้ง) — ซม. */
export function openPathLength(nodes: PNode[]): number {
  const P = flattenOpen(nodes);
  let L = 0;
  for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  return L;
}

/** จุดบนรูปปิด (จุดถี่ ๆ) ที่ใกล้ p ที่สุด → ระยะทางสะสมตามขอบจากจุดแรก (pos) + ระยะห่างจาก p (d) + จุดที่ตก (at) */
export function projectOnOutline(P: Pt[], p: Pt): { pos: number; d: number; at: Pt } {
  let best = { pos: 0, d: Infinity, at: P[0] ?? p };
  let acc = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    const q: Pt = [a[0] + dx * t, a[1] + dy * t];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < best.d) best = { pos: acc + L * t, d, at: q };
    acc += L;
  }
  return best;
}

/**
 * วัดตามขอบชิ้นระหว่าง 2 จุด (เช่น ความยาวซิป / ขอบที่ต้องกุ๊น) — คืนทั้งทางสั้นและทางยาวรอบรูป
 * path = จุดตามขอบช่วงที่สั้นกว่า (ไว้วาดเส้นวัด)
 */
export function outlineDistance(P: Pt[], a: Pt, b: Pt): { short: number; long: number; total: number; path: Pt[] } {
  const total = polyLen(P);
  const pa = projectOnOutline(P, a), pb = projectOnOutline(P, b);
  const fwd = ((pb.pos - pa.pos) % total + total) % total;
  const short = Math.min(fwd, total - fwd);
  // เดินตามขอบจาก a ไป b ทางที่สั้นกว่า เก็บจุดไว้วาด
  const forward = fwd <= total - fwd;
  const cum: number[] = [0];
  for (let i = 0; i < P.length; i++) { const q = P[(i + 1) % P.length], c = P[i]; cum.push(cum[i] + Math.hypot(q[0] - c[0], q[1] - c[1])); }
  const from = forward ? pa.pos : pb.pos, to = forward ? pb.pos : pa.pos;
  const path: Pt[] = [forward ? pa.at : pb.at];
  const span = ((to - from) % total + total) % total;
  for (let k = 0; k < P.length * 2 && path.length < 2000; k++) {
    const i = k % P.length, pos = cum[i] + (k >= P.length ? total : 0);
    const rel = pos - from;
    if (rel > 0 && rel < span) path.push(P[i]);
    if (rel >= span) break;
  }
  path.push(forward ? pb.at : pa.at);
  return { short, long: total - short, total, path };
}

/** ความยาวรอบรูป (เส้นปิด) */
export const outlineLength = (P: Pt[]) => polyLen(P);

/**
 * วัดตามขอบแบบ "ตามที่ลาก": ขยับเคอร์เซอร์จาก last (ตำแหน่งบนขอบ) ไปจุด p → ระยะที่เดินเพิ่ม (มีทิศ + / −)
 * ก้าวเล็ก ๆ ทีละครั้ง เลือกทางสั้นของก้าวนั้น → ลากอ้อมทางไหน ระยะสะสมก็ไปทางนั้น (อ้อมทางยาวได้)
 */
export function outlineStep(P: Pt[], last: number, p: Pt): { pos: number; delta: number; at: Pt; d: number } {
  const total = polyLen(P) || 1;
  const pr = projectOnOutline(P, p);
  let delta = (((pr.pos - last) % total) + total) % total;
  if (delta > total / 2) delta -= total;
  return { pos: pr.pos, delta, at: pr.at, d: pr.d };
}

/** จุดตามขอบ: เริ่มที่ตำแหน่ง from (ระยะตามขอบ) เดิน len ซม. (บวก = ทิศเดียวกับลำดับจุด · ลบ = ย้อน · ไม่เกิน 1 รอบ) */
export function outlineWalk(P: Pt[], from: number, len: number): Pt[] {
  const n = P.length, total = polyLen(P);
  if (n < 2 || !(total > 0)) return [];
  const cum: number[] = [0];
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = Math.max(-total, Math.min(total, len)), end = from + L;
  const at = (pos: number): Pt => {
    const q = ((pos % total) + total) % total;
    let i = 0; while (i < n - 1 && cum[i + 1] < q) i++;
    const seg = cum[i + 1] - cum[i], t = seg > 0 ? (q - cum[i]) / seg : 0, a = P[i], b = P[(i + 1) % n];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const lo = Math.min(from, end), hi = Math.max(from, end), mid: { pos: number; p: Pt }[] = [];
  for (let m = -1; m <= 2; m++) for (let i = 0; i < n; i++) { const pos = cum[i] + m * total; if (pos > lo && pos < hi) mid.push({ pos, p: P[i] }); }
  mid.sort((x, y) => (L >= 0 ? x.pos - y.pos : y.pos - x.pos));
  return [at(from), ...mid.map((x) => x.p), at(end)];
}

// ───────────────────────── หมุนชิ้น (2026-11-09) ─────────────────────────

const rotXY = (x: number, y: number, deg: number, cx: number, cy: number): Pt => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];   // แกน y ลง: องศาบวก = ตามเข็มนาฬิกา
};

/** หมุนรูปรอบจุด cx,cy (องศา · บวก = ตามเข็ม) — สี่เหลี่ยม/วงกลมหมุนทีละ 90° ยังเป็นรูปเดิม · มุมอื่น = แปลงเป็นจุด */
export function rotateShape(s: Shape, deg: number, cx: number, cy: number): Shape {
  const a = ((Math.round(deg * 1000) / 1000) % 360 + 360) % 360;
  if (a === 0) return s;
  if ((s.k === "rect" || s.k === "ellipse") && a % 90 === 0) {
    const [nx, ny] = rotXY(s.x + s.w / 2, s.y + s.h / 2, a, cx, cy);
    const [w, h] = a % 180 === 0 ? [s.w, s.h] : [s.h, s.w];
    return { k: s.k, x: nx - w / 2, y: ny - h / 2, w, h };
  }
  const p = toPathShape(s);
  if (p.k !== "path") return s;
  const rv = (vx: number, vy: number): Pt => { const [x, y] = rotXY(vx, vy, a, 0, 0); return [x, y]; };
  return {
    k: "path",
    nodes: p.nodes.map((n) => {
      const [x, y] = rotXY(n.x, n.y, a, cx, cy);
      const o: PNode = { x, y };
      if (hasIn(n)) { const [ix, iy] = rv(n.ix ?? 0, n.iy ?? 0); o.ix = ix; o.iy = iy; }
      if (hasOut(n)) { const [ox, oy] = rv(n.ox ?? 0, n.oy ?? 0); o.ox = ox; o.oy = oy; }
      return o;
    }),
  };
}

/** หมุนทั้งชิ้น (เส้นนอก+รู) รอบจุดกึ่งกลางของเส้นนอก (หรือจุดที่ส่งมา) */
export function rotatePiece<T extends { shape: Shape; holes?: Shape[] }>(p: T, deg: number, cx?: number, cy?: number): T & { holes: Shape[] } {
  const b = shapeBox(p.shape);
  const ox = cx ?? b.x + b.w / 2, oy = cy ?? b.y + b.h / 2;
  return mapMarks({ ...p, shape: rotateShape(p.shape, deg, ox, oy), holes: (p.holes ?? []).map((h) => rotateShape(h, deg, ox, oy)) }, ([x, y]) => rotXY(x, y, deg, ox, oy));
}

// ───────────────────────── เครื่องมือ vector: ลบมุมโค้ง · เส้นขนาน · เส้นทางผ้า · รอยบาก (2026-11-09) ─────────────────────────

/**
 * ลบมุมโค้งรัศมี r ทุกมุมที่เป็นมุมแหลม/มุมตรง (จุดที่ไม่มีหูจับ) — สี่เหลี่ยม = มุมมนทั้ง 4 · วงกลม = เหมือนเดิม
 * มุมที่ขอบสั้นกว่า 2 เท่าของระยะตัด = ลดรัศมีลงให้พอดี (ไม่ทับกัน)
 */
export function roundCorners(s: Shape, r: number): Shape {
  if (!(r > 0) || s.k === "ellipse") return s;
  if (s.k === "rect") return { k: "path", nodes: roundRectNodes(s.x, s.y, s.w, s.h, r, r) };
  const N = s.nodes, n = N.length, out: PNode[] = [];
  for (let i = 0; i < n; i++) {
    const v = N[i];
    if (hasIn(v) || hasOut(v)) { out.push({ ...v }); continue; }
    const a = N[(i - 1 + n) % n], b = N[(i + 1) % n];
    const ax = a.x - v.x, ay = a.y - v.y, bx = b.x - v.x, by = b.y - v.y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-6 || lb < 1e-6) { out.push({ ...v }); continue; }
    const theta = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));   // มุมภายใน
    if (theta > Math.PI - 0.01) { out.push({ ...v }); continue; }   // เส้นตรง ไม่ใช่มุม
    const d = Math.min(r / Math.tan(theta / 2), la / 2, lb / 2);
    const rr = d * Math.tan(theta / 2);
    const hl = (4 / 3) * Math.tan((Math.PI - theta) / 4) * rr;   // หูจับที่ทำส่วนโค้งวงกลม
    const ua: Pt = [ax / la, ay / la], ub: Pt = [bx / lb, by / lb];
    out.push({ x: v.x + ua[0] * d, y: v.y + ua[1] * d, ox: -ua[0] * hl, oy: -ua[1] * hl });
    out.push({ x: v.x + ub[0] * d, y: v.y + ub[1] * d, ix: -ub[0] * hl, iy: -ub[1] * hl });
  }
  return { k: "path", nodes: out };
}

/** เส้นขนาน: รูปใหม่ห่างจากเดิม d ซม. (บวก = ใหญ่ขึ้น · ลบ = เล็กลง เช่น ผ้ากาว/ซับ) · เล็กจนหาย = null */
export function offsetShape(s: Shape, d: number): Shape | null {
  if (s.k === "rect" || s.k === "ellipse") { const w = s.w + 2 * d, h = s.h + 2 * d; return w > 0.1 && h > 0.1 ? { k: s.k, x: s.x - d, y: s.y - d, w, h } : null; }
  const P = untangle(offsetPolygon(flattenShape(s, 16), d));
  if (P.length < 3) return null;
  const out: Shape = { k: "path", nodes: P.map(([x, y]) => ({ x, y })) };
  const before = shapeArea(s), after = shapeArea(out);
  return after > 0.01 && (d >= 0 ? after >= before : after <= before) ? out : null;
}

/** จุดตัดของเส้น ab กับ cd (เฉพาะตัดกันกลางเส้นจริง ๆ) */
function segCross(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? [a[0] + rx * t, a[1] + ry * t] : null;
}

/**
 * แก้เส้นที่ไขว้ตัวเอง (หลังทำเส้นขนานเข้าด้านในของมุมโค้ง จะเกิดห่วงเล็ก ๆ ตรงมุม) → ตัดห่วงทิ้ง เหลือรูปหลัก
 * + ตัดจุดที่ซ้อนกัน (ห่างกัน < 0.3 มม.)
 */
export function untangle(P: Pt[]): Pt[] {
  let Q = P.filter((p, i) => { const q = P[(i + 1) % P.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.03; });
  for (let guard = 0; guard < 500 && Q.length >= 4; guard++) {
    const n = Q.length;
    let hit: { i: number; k: number; x: Pt } | null = null;
    for (let i = 0; i < n && !hit; i++) {
      for (let k = 2; k < n - 1; k++) {   // เส้นที่ i+k (ข้ามเส้นติดกัน)
        const j = (i + k) % n;
        const x = segCross(Q[i], Q[(i + 1) % n], Q[j], Q[(j + 1) % n]);
        if (x) { hit = { i, k, x }; break; }
      }
    }
    if (!hit) break;
    const { i, k, x } = hit;
    const loop: Pt[] = [x], rest: Pt[] = [];
    for (let m = 1; m <= k; m++) loop.push(Q[(i + m) % n]);
    for (let m = k + 1; m <= n; m++) rest.push(Q[(i + m) % n]);
    rest.push(x);
    Q = Math.abs(signedArea(rest)) >= Math.abs(signedArea(loop)) ? rest : loop;   // เก็บส่วนที่ใหญ่กว่า
  }
  return Q;
}

/** เส้นทางผ้าตั้งต้น: แนวตั้งกลางชิ้น 15%–85% ของความสูง */
export function defaultGrain(s: Shape): [Pt, Pt] {
  const b = shapeBox(s), cx = b.x + b.w / 2;
  return [[cx, b.y + b.h * 0.15], [cx, b.y + b.h * 0.85]];
}

/** รอยบากกลางทุกขอบ (ขอบตรงยาวกว่า minLen ซม.) — จุดอยู่บนเส้นเย็บ */
export function midEdgeNotches(s: Shape, minLen = 3): Pt[] {
  const p = toPathShape(s);
  if (p.k !== "path") return [];
  const N = p.nodes, out: Pt[] = [];
  for (let i = 0; i < N.length; i++) {
    const a = N[i], b = N[(i + 1) % N.length];
    if (hasOut(a) || hasIn(b)) continue;   // ขอบโค้ง ข้าม
    if (Math.hypot(b.x - a.x, b.y - a.y) >= minLen) out.push([(a.x + b.x) / 2, (a.y + b.y) / 2]);
  }
  return out;
}

/**
 * เส้นรอยบากสำหรับพิมพ์/DXF: จากเส้นตัด (ห่างเส้นเย็บ = เผื่อพับ) เข้าไปในชิ้น len ซม.
 * sew = จุดรอบเส้นเย็บ · notches = จุดรอยบาก (บน/ใกล้เส้นเย็บ)
 */
export function notchSegments(sew: Pt[], notches: Pt[], allow = 0, len = 0.5): [Pt, Pt][] {
  if (sew.length < 3) return [];
  const s = signedArea(sew) > 0 ? 1 : -1;
  return notches.map((q): [Pt, Pt] => {
    let best = { d: Infinity, nx: 0, ny: 0, px: q[0], py: q[1] };
    for (let i = 0; i < sew.length; i++) {
      const a = sew[i], b = sew[(i + 1) % sew.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      if (L2 <= 0) continue;
      const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2));
      const px = a[0] + dx * t, py = a[1] + dy * t, d = Math.hypot(px - q[0], py - q[1]);
      if (d < best.d) { const L = Math.sqrt(L2); best = { d, nx: (s * dy) / L, ny: (-s * dx) / L, px, py }; }
    }
    const sx = best.px + best.nx * allow, sy = best.py + best.ny * allow;
    return [[sx, sy], [sx - best.nx * len, sy - best.ny * len]];
  });
}
