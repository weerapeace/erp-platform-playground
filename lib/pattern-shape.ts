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
export type LineShape = { v: 1; shape: Shape; basis: ShapeBasis };
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

export function cleanLineShape(raw: unknown): LineShape | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const shape = cleanShape(o.shape);
  if (!shape) return null;
  return { v: 1, shape: normalizeShape(shape), basis: o.basis === "area" ? "area" : "box" };
}

/** พื้นที่จริง (ตร.ซม.) ของรูปทรงในบรรทัด — ใช้แทน กว้าง×ยาว เมื่อเลือก "คิดจากพื้นที่จริง" */
export function lineShapeArea(ls: LineShape | null | undefined): number | null {
  if (!ls || ls.basis !== "area") return null;
  const a = shapeArea(ls.shape);
  return a > 0 ? Math.round(a * 100) / 100 : null;
}

/** แก้กว้าง/ยาวในตารางเอง → ยืดรูปทรงตาม (รูปไม่หลุดจากขนาดในตาราง) */
export function refitLineShape(ls: LineShape | null | undefined, w: number | null, h: number | null): LineShape | null | undefined {
  if (!ls) return ls;
  const b = shapeBox(ls.shape);
  const nw = w != null && w > 0 ? w : b.w, nh = h != null && h > 0 ? h : b.h;
  return { ...ls, shape: normalizeShape(fitShape(ls.shape, 0, 0, nw, nh)) };
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
function ellipseNodes(cx: number, cy: number, rx: number, ry: number): PNode[] {
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

export type SvgImport = { shapes: Shape[]; cmPerUnit: number; unitNote: string };

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
      for (const sub of parsePathData(a.d ?? "")) raw.push({ k: "path", nodes: txNodes(sub, m) });
    }
  }
  const shapes = raw.map((s) => scaleShape(s, cmPerUnit)).filter((s) => shapeArea(s) > 0.0001);
  if (!shapes.length) return null;
  // เลื่อนทั้งกลุ่มให้เริ่มที่ 0,0 (ตำแหน่งระหว่างชิ้นเหมือนใน Illustrator)
  let x0 = Infinity, y0 = Infinity;
  for (const s of shapes) { const b = shapeBox(s); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); }
  return { shapes: shapes.map((s) => moveShape(s, -x0, -y0)), cmPerUnit, unitNote };
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
