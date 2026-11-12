/**
 * ✂️ คำสั่งแก้ชิ้นแบบละเอียด (Bag CAD รอบ E · 2026-11-12) — สูตรล้วน ไม่มีหน้าจอ (หน้าจออยู่ใน components/pattern-sheet/shape-editor)
 *   ขอบ: แบ่งตามระยะ / แบ่งเท่ากัน N ส่วน · รวมกับขอบถัดไป (ลบจุดปลาย) · เลื่อนขอบออก/เข้า (ยืด/หด) · ดัดขอบตรงเป็นโค้ง (ระยะโก่ง) · รัศมีของขอบโค้ง
 *   มุม (จุด): มุมโค้งเฉพาะจุด · ตัดมุมเฉพาะจุด · มุมภายใน (องศา)
 *   วาด: หลายเหลี่ยม N ด้าน · ดูดเข้าจุดปลาย/กึ่งกลางขอบของชิ้น
 *   ทุกคำสั่งคืนรูปใหม่ (ไม่แก้ของเดิม) — จำนวนขอบเปลี่ยน = ตะเข็บ/ค่ารายขอบตามเองด้วย lib/pattern-edge-map (เรียกใน commit ของกระดาน)
 * เทสต์: lib/__tests__/pattern-edit.test.ts
 */
import { pieceEdges } from "./pattern-seams";
import { splitSegment, toPathShape, type NotchStyle, type PNode, type Pt, type Shape } from "./pattern-shape";

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const hasIn = (n: PNode) => !!(n.ix || n.iy), hasOut = (n: PNode) => !!(n.ox || n.oy);
const asPath = (s: Shape): PNode[] | null => { const p = toPathShape(s); return p.k === "path" ? p.nodes.map((n) => ({ ...n })) : null; };
const area2 = (N: PNode[]) => N.reduce((m, a, i) => { const b = N[(i + 1) % N.length]; return m + a.x * b.y - b.x * a.y; }, 0);

/** จุดบนขอบโค้ง (Bezier) ที่ t */
function bez(a: PNode, b: PNode, t: number): Pt {
  const x1 = a.x + (a.ox ?? 0), y1 = a.y + (a.oy ?? 0), x2 = b.x + (b.ix ?? 0), y2 = b.y + (b.iy ?? 0), u = 1 - t;
  return [u * u * u * a.x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * b.x, u * u * u * a.y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * b.y];
}
/** t ของจุดที่ห่างจากต้นขอบ d (ซม.) ตามแนวเส้น — ขอบตรง = สัดส่วนตรง ๆ · ขอบโค้ง = เดินทีละช่วงย่อย */
export function edgeParamAt(a: PNode, b: PNode, d: number): number {
  if (!hasOut(a) && !hasIn(b)) { const L = Math.hypot(b.x - a.x, b.y - a.y); return L > 0 ? Math.max(0, Math.min(1, d / L)) : 0; }
  const STEPS = 200; let acc = 0, prev = bez(a, b, 0);
  for (let k = 1; k <= STEPS; k++) {
    const t = k / STEPS, p = bez(a, b, t), seg = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    if (acc + seg >= d) return (k - 1) / STEPS + ((d - acc) / (seg || 1)) / STEPS;
    acc += seg; prev = p;
  }
  return 1;
}

/** แบ่งขอบ i ที่ระยะ d จากต้นขอบ → รูปใหม่ (path) · ระยะชิดปลายเกิน = null */
export function splitEdgeAt(s: Shape, i: number, d: number): Shape | null {
  const N = asPath(s); if (!N || s.k === "ellipse") return null;
  const E = pieceEdges(s)[i]; if (!E || !(d > 0.05) || d > E.len - 0.05) return null;
  const a = N[i], b = N[(i + 1) % N.length];
  if (!hasOut(a) && !hasIn(b)) {   // ขอบตรง: วางจุดตามระยะตรง ๆ (splitSegment ใช้ t ของเส้นโค้ง ซึ่งบนเส้นตรงไม่เป็นสัดส่วนกับระยะ)
    const f = d / E.len, q: PNode = { x: r4(a.x + (b.x - a.x) * f), y: r4(a.y + (b.y - a.y) * f) };
    return { k: "path", nodes: [...N.slice(0, i + 1), q, ...N.slice(i + 1)] };
  }
  return { k: "path", nodes: splitSegment(N, i, edgeParamAt(a, b, d)) };
}
/** แบ่งขอบ i เท่ากัน n ส่วน */
export function splitEdgeEven(s: Shape, i: number, n: number): Shape | null {
  const E = pieceEdges(s)[i]; if (!E || n < 2 || n > 20 || s.k === "ellipse") return null;
  let cur: Shape | null = s;
  // แบ่งจากปลายเข้าหาต้น: ขอบ i ยังเป็นช่วงแรกเสมอ ระยะจากต้นขอบไม่เปลี่ยน
  for (let k = n - 1; k >= 1 && cur; k--) cur = splitEdgeAt(cur, i, (E.len * k) / n);
  return cur;
}
/** รวมขอบ i กับขอบถัดไป = ลบจุดปลายของขอบ i (ต้องเหลืออย่างน้อย 3 จุด) */
export function joinEdgeWithNext(s: Shape, i: number): Shape | null {
  const N = asPath(s); if (!N || s.k === "ellipse" || N.length <= 3) return null;
  const j = (i + 1) % N.length;
  return { k: "path", nodes: N.filter((_, k) => k !== j) };
}
/** ทิศออกนอกชิ้นของขอบ i (เวกเตอร์หนึ่งหน่วย) */
function outwardNormal(N: PNode[], i: number): Pt {
  const a = N[i], b = N[(i + 1) % N.length], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, s = area2(N) > 0 ? 1 : -1;
  return [(s * dy) / L, (-s * dx) / L];
}
/** เลื่อนขอบ i ออกนอกชิ้น d ซม. (ลบ = เข้าใน) — จุดปลายทั้งสองเลื่อนตามแนวตั้งฉาก (ขอบข้างเคียงยืด/หดตาม) · รูปพัง (พื้นที่กลับด้าน) = null */
export function moveEdge(s: Shape, i: number, d: number): Shape | null {
  if (s.k === "ellipse" || !d) return null;
  if (s.k === "rect") {   // สี่เหลี่ยมคงเป็นสี่เหลี่ยม: บน 0 · ขวา 1 · ล่าง 2 · ซ้าย 3
    const r = { ...s };
    if (i === 0) { r.y -= d; r.h += d; } else if (i === 1) r.w += d; else if (i === 2) r.h += d; else { r.x -= d; r.w += d; }
    return r.w > 0.1 && r.h > 0.1 ? { ...r, x: r4(r.x), y: r4(r.y), w: r4(r.w), h: r4(r.h) } : null;
  }
  const N = asPath(s); if (!N) return null;
  const [nx, ny] = outwardNormal(N, i), j = (i + 1) % N.length, before = Math.sign(area2(N));
  N[i] = { ...N[i], x: r4(N[i].x + nx * d), y: r4(N[i].y + ny * d) };
  N[j] = { ...N[j], x: r4(N[j].x + nx * d), y: r4(N[j].y + ny * d) };
  return Math.sign(area2(N)) === before && Math.abs(area2(N)) > 1e-6 ? { k: "path", nodes: N } : null;
}
/** ดัดขอบตรง i เป็นส่วนโค้งวงกลม โก่งออก h ซม. (ลบ = โก่งเข้า · 0 = กลับเป็นเส้นตรง) */
export function bendEdge(s: Shape, i: number, h: number): Shape | null {
  const N = asPath(s); if (!N || s.k === "ellipse") return null;
  const j = (i + 1) % N.length, a = N[i], b = N[j];
  const c = Math.hypot(b.x - a.x, b.y - a.y); if (c < 0.1) return null;
  const strip = (n: PNode, w: "i" | "o"): PNode => { const o = { ...n }; if (w === "o") { delete o.ox; delete o.oy; } else { delete o.ix; delete o.iy; } return o; };
  if (!h) { N[i] = strip(a, "o"); N[j] = strip(b, "i"); return { k: "path", nodes: N }; }
  if (Math.abs(h) > c / 2 + 1e-9) return null;   // เกินครึ่งวงกลม
  const R = (c * c / 4 + h * h) / (2 * Math.abs(h)), theta = 2 * Math.asin(Math.min(1, c / (2 * R)));
  const k = (4 / 3) * Math.tan(theta / 4) * R;
  const ux = (b.x - a.x) / c, uy = (b.y - a.y) / c, [nx, ny] = outwardNormal(N, i), sg = Math.sign(h), half = theta / 2;
  // ทิศสัมผัสที่ต้นขอบ = เอียงจากแนวคอร์ดไปทางที่โก่ง ครึ่งมุม · ปลายขอบ = สมมาตร
  const t0: Pt = [ux * Math.cos(half) + nx * sg * Math.sin(half), uy * Math.cos(half) + ny * sg * Math.sin(half)];
  const t1: Pt = [ux * Math.cos(half) - nx * sg * Math.sin(half), uy * Math.cos(half) - ny * sg * Math.sin(half)];
  N[i] = { ...a, ox: r4(t0[0] * k), oy: r4(t0[1] * k) };
  N[j] = { ...b, ix: r4(-t1[0] * k), iy: r4(-t1[1] * k) };
  return { k: "path", nodes: N };
}
/** รัศมีของขอบ (วงกลมผ่านต้น · กลาง · ปลาย) — เส้นตรง = null */
export function edgeRadius(pts: Pt[]): number | null {
  if (pts.length < 3) return null;
  const A = pts[0], B = pts[Math.floor(pts.length / 2)], C = pts[pts.length - 1];
  const d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
  if (Math.abs(d) < 1e-6) return null;
  const a2 = A[0] ** 2 + A[1] ** 2, b2 = B[0] ** 2 + B[1] ** 2, c2 = C[0] ** 2 + C[1] ** 2;
  const ux = (a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / d, uy = (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / d;
  const r = Math.hypot(A[0] - ux, A[1] - uy);
  return r > 1e4 ? null : r;
}
/** มุมภายในที่จุด i (องศา) — ใช้ทิศหูจับถ้ามี */
export function cornerAngle(s: Shape, i: number): number | null {
  const N = asPath(s); if (!N || s.k === "ellipse" || N.length < 3) return null;
  const v = N[i], a = N[(i - 1 + N.length) % N.length], b = N[(i + 1) % N.length];
  const din: Pt = hasIn(v) ? [v.ix ?? 0, v.iy ?? 0] : a.ox || a.oy ? [a.x + (a.ox ?? 0) - v.x, a.y + (a.oy ?? 0) - v.y] : [a.x - v.x, a.y - v.y];
  const dout: Pt = hasOut(v) ? [v.ox ?? 0, v.oy ?? 0] : b.ix || b.iy ? [b.x + (b.ix ?? 0) - v.x, b.y + (b.iy ?? 0) - v.y] : [b.x - v.x, b.y - v.y];
  const la = Math.hypot(...din), lb = Math.hypot(...dout); if (la < 1e-9 || lb < 1e-9) return null;
  let ang = Math.acos(Math.max(-1, Math.min(1, (din[0] * dout[0] + din[1] * dout[1]) / (la * lb)))) * 180 / Math.PI;
  // มุมเว้า (จุดยื่นเข้าใน) = 360 − มุม
  const cross = din[0] * dout[1] - din[1] * dout[0], cw = area2(N) > 0;
  if ((cw && cross > 0) || (!cw && cross < 0)) ang = 360 - ang;
  return Math.round(ang * 10) / 10;
}
/** ทำมุมโค้งเฉพาะจุด i (รัศมี r) — จุดที่โค้งอยู่แล้ว/เส้นตรง = null */
export function filletCorner(s: Shape, i: number, r: number): Shape | null {
  const N = asPath(s); if (!N || s.k === "ellipse" || !(r > 0)) return null;
  const v = N[i]; if (hasIn(v) || hasOut(v)) return null;
  const a = N[(i - 1 + N.length) % N.length], b = N[(i + 1) % N.length];
  const ax = a.x - v.x, ay = a.y - v.y, bx = b.x - v.x, by = b.y - v.y, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < 1e-6 || lb < 1e-6) return null;
  const theta = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
  if (theta > Math.PI - 0.01) return null;
  const d = Math.min(r / Math.tan(theta / 2), la * 0.5, lb * 0.5), rr = d * Math.tan(theta / 2), hl = (4 / 3) * Math.tan((Math.PI - theta) / 4) * rr;
  const ua: Pt = [ax / la, ay / la], ub: Pt = [bx / lb, by / lb];
  const p1: PNode = { x: r4(v.x + ua[0] * d), y: r4(v.y + ua[1] * d), ox: r4(-ua[0] * hl), oy: r4(-ua[1] * hl) };
  const p2: PNode = { x: r4(v.x + ub[0] * d), y: r4(v.y + ub[1] * d), ix: r4(-ub[0] * hl), iy: r4(-ub[1] * hl) };
  return { k: "path", nodes: [...N.slice(0, i), p1, p2, ...N.slice(i + 1)] };
}
/** ตัดมุมเฉพาะจุด i: ถอยจากมุมไปตามขอบทั้งสองข้าง d ซม. แล้วต่อเส้นตรง */
export function chamferCorner(s: Shape, i: number, d: number): Shape | null {
  const N = asPath(s); if (!N || s.k === "ellipse" || !(d > 0)) return null;
  const v = N[i]; if (hasIn(v) || hasOut(v)) return null;
  const a = N[(i - 1 + N.length) % N.length], b = N[(i + 1) % N.length];
  const la = Math.hypot(a.x - v.x, a.y - v.y), lb = Math.hypot(b.x - v.x, b.y - v.y), dd = Math.min(d, la * 0.5, lb * 0.5);
  if (dd < 0.01) return null;
  const p1: PNode = { x: r4(v.x + ((a.x - v.x) / la) * dd), y: r4(v.y + ((a.y - v.y) / la) * dd) };
  const p2: PNode = { x: r4(v.x + ((b.x - v.x) / lb) * dd), y: r4(v.y + ((b.y - v.y) / lb) * dd) };
  return { k: "path", nodes: [...N.slice(0, i), p1, p2, ...N.slice(i + 1)] };
}
/** หลายเหลี่ยมด้านเท่า n ด้าน รัศมีวงล้อม r · จุดแรกอยู่บนสุด */
export function polygonShape(cx: number, cy: number, r: number, n: number): Shape {
  const k = Math.max(3, Math.min(24, Math.round(n)));
  return { k: "path", nodes: Array.from({ length: k }, (_, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / k; return { x: r4(cx + r * Math.cos(a)), y: r4(cy + r * Math.sin(a)) }; }) };
}
/** หลายเหลี่ยมพอดีกรอบที่ลาก (กว้าง w สูง h) */
export function polygonInBox(x: number, y: number, w: number, h: number, n: number): Shape {
  const P = polygonShape(0, 0, 1, n) as Extract<Shape, { k: "path" }>;
  const xs = P.nodes.map((q) => q.x), ys = P.nodes.map((q) => q.y), x0 = Math.min(...xs), y0 = Math.min(...ys), sx = w / (Math.max(...xs) - x0 || 1), sy = h / (Math.max(...ys) - y0 || 1);
  return { k: "path", nodes: P.nodes.map((q) => ({ x: r4(x + (q.x - x0) * sx), y: r4(y + (q.y - y0) * sy) })) };
}
/** ดูดเข้าจุด: จุดยอด + กึ่งกลางขอบของทุกชิ้นที่ใกล้ p ไม่เกิน tol (ซม.) — คืนจุดที่ใกล้สุด + ชนิด */
export function objectSnap(shapes: Shape[], p: Pt, tol: number): { at: Pt; kind: "end" | "mid" } | null {
  let best: { at: Pt; kind: "end" | "mid"; d: number } | null = null;
  const consider = (q: Pt, kind: "end" | "mid") => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d <= tol && (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) < 1e-9 && kind === "end"))) best = { at: q, kind, d }; };
  for (const s of shapes) for (const e of pieceEdges(s)) {
    consider(e.pts[0], "end");
    // กึ่งกลางตามความยาว
    let acc = 0; const half = e.len / 2;
    for (let k = 1; k < e.pts.length; k++) {
      const a = e.pts[k - 1], b = e.pts[k], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + seg >= half) { const t = seg ? (half - acc) / seg : 0; consider([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], "mid"); break; }
      acc += seg;
    }
  }
  return best ? { at: (best as { at: Pt }).at, kind: (best as { kind: "end" | "mid" }).kind } : null;
}

/* ── รอยบากแบบต่าง ๆ (แบบ/มุมเส้นตัด กำหนดใน lib/pattern-shape) ── */
export { ALLOW_CORNERS, type AllowCorner, type NotchStyle } from "./pattern-shape";
export const NOTCH_STYLES: { key: NotchStyle; th: string; en: string }[] = [
  { key: "single", th: "เดี่ยว", en: "Single" }, { key: "double", th: "คู่", en: "Double" }, { key: "v", th: "รูปตัว V", en: "V" },
];
/** เส้นของรอยบาก 1 จุดตามแบบ — รับเส้นตรงของรอยบากเดี่ยว [ขอบนอก, ปลายใน] แล้วแปลงเป็นหลายเส้น */
export function notchStyleSegs(seg: [Pt, Pt], style: NotchStyle | undefined, gap = 0.3): [Pt, Pt][] {
  if (!style || style === "single") return [seg];
  const [a, b] = seg, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, tx = -dy / L, ty = dx / L;
  if (style === "double") { const g = gap / 2; return [[[a[0] + tx * g, a[1] + ty * g], [b[0] + tx * g, b[1] + ty * g]], [[a[0] - tx * g, a[1] - ty * g], [b[0] - tx * g, b[1] - ty * g]]]; }
  const w = L * 0.45;
  return [[[a[0] + tx * w, a[1] + ty * w], b], [[a[0] - tx * w, a[1] - ty * w], b]];
}
