/**
 * ✂️ เครื่องมือทรงกระเป๋าบนชิ้น (Bag CAD รอบ F) — สูตรบริสุทธิ์ ไม่มีหน้าจอ · ไม่ต่อฐานข้อมูล
 *   เกล็ด (dart) · มุมกล่อง (box corner) · ผ่าแล้วกาง (slash & spread) · จีบ (pleat) · ชิ้นข้างจากขอบ (gusset) · แถบตามขอบ (ทากาว / ปาดบาง)
 *
 *   หลักเรื่องความยาวตะเข็บ: เนื้อที่ "หายไปตอนเย็บ" (ขาเกล็ด · เนื้อจีบ · ขามุมกล่อง) ติดค่า take ของขอบนั้น
 *     (EdgeMeta.take ใน lib/pattern-seams) → ตรวจตะเข็บนับเฉพาะส่วนที่เย็บจริง ไม่เตือนว่ายาวไม่เท่ากันผิด ๆ
 *   ขาเกล็ดแบบเปิด / ขามุมกล่อง = ตะเข็บในชิ้นเดียวกัน (Seam.self) — ประกอบ 3D ไม่นับ (ภาพ 3D ยังไม่แสดงรอยพับเหล่านี้)
 *   ทุกฟังก์ชันคืน null เมื่อทำไม่ได้ (ขอบสั้นเกิน · มุมโค้งอยู่แล้ว · เส้นผ่าตัดขอบไม่ครบ 2 จุด) — หน้าจอแจ้งเป็นภาษาคน
 *
 * ใช้ที่: components/pattern-sheet/shape-editor (ค่าของขอบ · จุดที่เลือก · เครื่องมือของชิ้น) · เทสต์ lib/__tests__/pattern-shaping.test.ts
 * คู่มือ: docs/pattern-studio.md (Bag CAD รอบ F)
 */
import { pieceEdges, type EdgeMeta } from "./pattern-seams";
import { flattenShape, shapeBox, toPathShape, type InnerLine, type PNode, type Pt, type Shape } from "./pattern-shape";
import { splitEdgeAt } from "./pattern-edit";

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const P = (n: PNode): Pt => [n.x, n.y];
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const hasOut = (n: PNode) => !!(n.ox || n.oy), hasIn = (n: PNode) => !!(n.ix || n.iy);
const strip = (n: PNode, which: "in" | "out"): PNode => { const { ix, iy, ox, oy, ...rest } = n; return which === "in" ? { ...rest, ...(ox || oy ? { ox, oy } : {}) } : { ...rest, ...(ix || iy ? { ix, iy } : {}) }; };

function nodesOf(s: Shape): PNode[] | null {
  if (s.k === "ellipse") return null;
  const p = s.k === "path" ? s : toPathShape(s);
  return p.k === "path" ? p.nodes.map((n) => ({ ...n })) : null;
}
function area2(N: PNode[]): number { let a = 0; for (let i = 0; i < N.length; i++) { const p = N[i], q = N[(i + 1) % N.length]; a += p.x * q.y - q.x * p.y; } return a; }
/** ทิศเข้าในชิ้นของขอบที่วิ่งจาก a ไป b (หนึ่งหน่วย) */
function inwardOf(a: Pt, b: Pt, orient: number): Pt { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [(-orient * dy) / L, (orient * dx) / L]; }
/** ขอบในรูปที่วิ่งจาก a ไป b (จุดปลายตรงกัน) — ไม่เจอ = −1 */
export function edgeIndexByEnds(s: Shape, a: Pt, b: Pt, eps = 1e-3): number {
  const E = pieceEdges(s);
  return E.findIndex((e) => dist(e.pts[0], a) < eps && dist(e.pts[e.pts.length - 1], b) < eps);
}

/** ผลของเครื่องมือทรง: รูปใหม่ + ค่า take รายขอบ (ดัชนีขอบของรูปใหม่) + คู่ขาที่ต้องเย็บในชิ้น + เส้นใน/รอยบากที่เพิ่ม */
export type ShapingResult = { shape: Shape; take: Record<number, number>; legs?: [number, number][]; inner?: InnerLine[]; notches?: Pt[] };

// ───────── เกล็ด ─────────
export type DartOpts = { at: number; width: number; depth: number; open?: boolean };
/**
 * เกล็ดบนขอบ i: กึ่งกลางห่างต้นขอบ at · ปากกว้าง width · ลึกเข้าในชิ้น depth (ซม.)
 *   ปิด (ค่าเดิม) = เนื้อเกล็ดยังอยู่ · วาดขาเกล็ด (เส้นเย็บ) + เส้นกลางเกล็ด + รอยบากที่ปาก · ช่วงปากติด take = กว้างปาก
 *   เปิด = ตัดเนื้อเกล็ดออกเป็นรูปตัว V · ขาสองข้างติด take เต็มขา + คู่ขาเย็บเข้าหากัน (legs)
 */
export function dartOnEdge(s: Shape, i: number, o: DartOpts, stamp = "d"): ShapingResult | null {
  const E = pieceEdges(s)[i];
  if (!E || s.k === "ellipse") return null;
  const w = o.width, d = o.depth, a0 = o.at - w / 2, a1 = o.at + w / 2;
  if (!(w >= 0.2) || !(d >= 0.2) || !(a0 >= 0.1) || !(a1 <= E.len - 0.1)) return null;
  const s1 = splitEdgeAt(s, i, a1); if (!s1) return null;
  const s2 = splitEdgeAt(s1, i, a0); if (!s2 || s2.k !== "path") return null;
  const N = s2.nodes.map((n) => ({ ...n })), orient = area2(N) > 0 ? 1 : -1;
  const p1 = P(N[i + 1]), p2 = P(N[i + 2]), m: Pt = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], nv = inwardOf(p1, p2, orient);
  const apex: Pt = [r4(m[0] + nv[0] * d), r4(m[1] + nv[1] * d)];
  if (o.open) {
    const nodes = [...N.slice(0, i + 1), strip(N[i + 1], "out"), { x: apex[0], y: apex[1] }, strip(N[i + 2], "in"), ...N.slice(i + 3)];
    const shape: Shape = { k: "path", nodes };
    return { shape, take: { [i + 1]: r4(dist(p1, apex)), [i + 2]: r4(dist(apex, p2)) }, legs: [[i + 1, i + 2]] };
  }
  const pieceEdgesNew = pieceEdges(s2);
  return {
    shape: s2, take: { [i + 1]: r4(pieceEdgesNew[i + 1].len) }, notches: [p1, p2],
    inner: [
      { id: `${stamp}l`, kind: "sew", name: "ขาเกล็ด", pts: [p1, apex, p2] },
      { id: `${stamp}c`, kind: "fold", name: "กลางเกล็ด", pts: [m.map(r4) as Pt, apex] },
    ],
  };
}

// ───────── มุมกล่อง ─────────
/**
 * มุมกล่องที่จุด k: ตัดเหลี่ยมมุมออกขนาด size × size (ซม.) — ขาสองข้างยาวเท่ากัน เย็บเข้าหากันเป็นก้นกล่อง
 *   ความลึกของก้นที่ได้ ≈ 2 × size (มุมฉาก) · ต้องเป็นมุมแหลม (ไม่ใช่จุดโค้ง) และขอบข้างยาวพอ
 */
export function boxCorner(s: Shape, k: number, size: number): ShapingResult | null {
  const N = nodesOf(s);
  if (!N || N.length < 3 || !(size >= 0.3)) return null;
  const n = N.length, V = N[k], A0 = N[(k - 1 + n) % n], C0 = N[(k + 1) % n];
  if (!V || hasIn(V) || hasOut(V) || hasOut(A0) || hasIn(C0)) return null;
  const v = P(V), lp = dist(v, P(A0)), ln = dist(v, P(C0));
  if (!(size <= Math.min(lp, ln) - 0.2)) return null;
  const u: Pt = [(A0.x - v[0]) / lp, (A0.y - v[1]) / lp], w: Pt = [(C0.x - v[0]) / ln, (C0.y - v[1]) / ln];
  const orient = area2(N) > 0 ? 1 : -1, cross = (v[0] - A0.x) * (C0.y - v[1]) - (v[1] - A0.y) * (C0.x - v[0]);
  if (cross * orient <= 0) return null;                                           // มุมเว้า / เส้นตรง = ตัดมุมกล่องไม่ได้
  const A: PNode = { x: r4(v[0] + u[0] * size), y: r4(v[1] + u[1] * size) };
  const B: PNode = { x: r4(v[0] + (u[0] + w[0]) * size), y: r4(v[1] + (u[1] + w[1]) * size) };
  const C: PNode = { x: r4(v[0] + w[0] * size), y: r4(v[1] + w[1] * size) };
  const nodes = [...N.slice(0, k), A, B, C, ...N.slice(k + 1)];
  return { shape: { k: "path", nodes }, take: { [k]: r4(size), [k + 1]: r4(size) }, legs: [[k, k + 1]] };
}

// ───────── ผ่าแล้วกาง ─────────
export type SpreadOpts = { axis: "v" | "h"; at: number; amount: number; mode?: "parallel" | "pivot"; hinge?: "min" | "max" };
/** จุดที่เส้นผ่าตัดขอบ: ขอบ i · ระยะจากต้นขอบ d */
function crossings(s: Shape, axis: "v" | "h", at: number): { i: number; d: number; p: Pt }[] {
  const out: { i: number; d: number; p: Pt }[] = [], c = axis === "v" ? 0 : 1;
  pieceEdges(s).forEach((e) => {
    let acc = 0;
    for (let k = 1; k < e.pts.length; k++) {
      const a = e.pts[k - 1], b = e.pts[k], l = dist(a, b), fa = a[c] - at, fb = b[c] - at;
      if (l > 0 && ((fa < 0 && fb >= 0) || (fa >= 0 && fb < 0))) {
        const t = fa / (fa - fb);
        out.push({ i: e.i, d: acc + l * t, p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] });
      }
      acc += l;
    }
  });
  return out;
}
/**
 * ผ่าชิ้นด้วยเส้นตรงแนวตั้ง (x = at) หรือแนวนอน (y = at) แล้วกางฝั่งขวา/ล่างออก amount ซม.
 *   parallel = กางขนาน (เพิ่มเนื้อเท่ากันตลอดแนว) · pivot = หมุนกางจากจุดหมุน (min = ปลายบน/ซ้าย · max = ปลายล่าง/ขวา) ได้ทรงบาน
 *   คืนรูปใหม่ + gaps = ช่วงขอบใหม่ที่เกิดจากการกาง (คู่จุด) — จีบใช้ติด take
 */
export function slashSpread(s: Shape, o: SpreadOpts): { shape: Shape; gaps: [Pt, Pt][] } | null {
  if (s.k === "ellipse" || !(o.amount > 0.05) || o.amount > 200) return null;
  const X = crossings(s, o.axis, o.at);
  if (X.length !== 2) return null;
  // แบ่งขอบที่จุดตัด (ขอบลำดับมากก่อน ดัชนีขอบน้อยไม่เลื่อน)
  let cur: Shape | null = s.k === "path" ? s : toPathShape(s);
  for (const x of [...X].sort((a, b) => b.i - a.i || b.d - a.d)) {
    const E = pieceEdges(cur as Shape)[x.i];
    if (!E) return null;
    if (x.d <= 0.05 || x.d >= E.len - 0.05) continue;                              // ตัดตรงจุดยอดพอดี = ใช้จุดเดิม
    cur = splitEdgeAt(cur as Shape, x.i, x.d);
    if (!cur) return null;
  }
  if (!cur || cur.k !== "path") return null;
  const N = cur.nodes.map((n) => ({ ...n })), n = N.length, c = o.axis === "v" ? 0 : 1;
  const near = (p: Pt) => { let best = -1, bd = Infinity; N.forEach((q, j) => { const dd = dist(p, P(q)); if (dd < bd) { bd = dd; best = j; } }); return bd < 0.06 ? best : -1; };
  const iP = near(X[0].p), iQ = near(X[1].p);
  if (iP < 0 || iQ < 0 || iP === iQ) return null;
  const chain = (from: number, to: number) => { const r: number[] = []; for (let j = from; ; j = (j + 1) % n) { r.push(j); if (j === to) break; } return r; };
  let c1 = chain(iP, iQ), c2 = chain(iQ, iP);
  const side = (ids: number[]) => ids.slice(1, -1).reduce((m, j) => m + (N[j][c === 0 ? "x" : "y"] - o.at), 0);
  let pIdx = iP, qIdx = iQ;
  if (side(c1) < side(c2)) { [c1, c2] = [c2, c1]; [pIdx, qIdx] = [qIdx, pIdx]; }       // c1 = ฝั่งที่กาง (ขวา/ล่าง) เริ่มที่ pIdx จบที่ qIdx
  const pp = P(N[pIdx]), qq = P(N[qIdx]);
  const mid = c1.slice(1, -1);
  if (!mid.length) return null;
  if ((o.mode ?? "parallel") === "parallel") {
    const mv: Pt = c === 0 ? [o.amount, 0] : [0, o.amount];
    const sh = (q: PNode): PNode => ({ ...q, x: r4(q.x + mv[0]), y: r4(q.y + mv[1]) });
    const Pn = N[pIdx], Qn = N[qIdx];
    const P2: PNode = { ...sh(strip(Pn, "in")) }, Q2: PNode = { ...sh(strip(Qn, "out")) };
    const nodes = [strip(Pn, "out"), P2, ...mid.map((j) => sh(N[j])), Q2, strip(Qn, "in"), ...c2.slice(1, -1).map((j) => N[j])];
    return { shape: { k: "path", nodes }, gaps: [[pp, P(P2)], [P(Q2), qq]] };
  }
  // หมุนกาง: จุดหมุน = จุดตัดที่ค่าแกนตั้งฉากน้อย (min) หรือมาก (max)
  const oc = c === 0 ? 1 : 0;
  const pIsHinge = (o.hinge ?? "max") === "max" ? pp[oc] >= qq[oc] : pp[oc] <= qq[oc];
  const H = pIsHinge ? pp : qq, O = pIsHinge ? qq : pp, R = dist(H, O);
  if (!(o.amount < 2 * R - 0.01)) return null;
  const base = 2 * Math.asin(o.amount / (2 * R));
  const rot = (p: Pt, th: number): Pt => { const cs = Math.cos(th), sn = Math.sin(th), dx = p[0] - H[0], dy = p[1] - H[1]; return [H[0] + dx * cs - dy * sn, H[1] + dx * sn + dy * cs]; };
  const th = rot(O, base)[c] - O[c] > 0 ? base : -base;                               // หมุนทางที่ปลายกางออกไปฝั่งที่กาง
  const rn = (q: PNode): PNode => {
    const [x, y] = rot(P(q), th), cs = Math.cos(th), sn = Math.sin(th), out: PNode = { x: r4(x), y: r4(y) };
    if (hasIn(q)) { out.ix = r4((q.ix ?? 0) * cs - (q.iy ?? 0) * sn); out.iy = r4((q.ix ?? 0) * sn + (q.iy ?? 0) * cs); }
    if (hasOut(q)) { out.ox = r4((q.ox ?? 0) * cs - (q.oy ?? 0) * sn); out.oy = r4((q.ox ?? 0) * sn + (q.oy ?? 0) * cs); }
    return out;
  };
  const rest = c2.slice(1, -1).map((j) => N[j]);
  if (pIsHinge) {
    const Qn = N[qIdx], Q2 = rn(strip(Qn, "out"));
    const Pn = rn(N[pIdx]), Pk: PNode = { ...N[pIdx], ...(hasOut(N[pIdx]) ? { ox: Pn.ox, oy: Pn.oy } : {}) };   // จุดหมุนอยู่ที่เดิม หมุนแค่มือจับขาออก
    return { shape: { k: "path", nodes: [Pk, ...mid.map((j) => rn(N[j])), Q2, strip(Qn, "in"), ...rest] }, gaps: [[P(Q2), qq]] };
  }
  const Pn = N[pIdx], P2 = rn(strip(Pn, "in"));
  const Qr = rn(N[qIdx]), Qk: PNode = { ...N[qIdx], ...(hasIn(N[qIdx]) ? { ix: Qr.ix, iy: Qr.iy } : {}) };
  return { shape: { k: "path", nodes: [strip(Pn, "out"), P2, ...mid.map((j) => rn(N[j])), Qk, ...rest] }, gaps: [[pp, P(P2)]] };
}

// ───────── จีบ ─────────
export type PleatOpts = { axis: "v" | "h"; n: number; depth: number; kind?: "knife" | "box" };
/** เนื้อผ้าที่จีบ 1 จีบกิน (ซม.): จีบทบ = 2 × ลึก · จีบกล่อง = 4 × ลึก */
export const pleatTake = (depth: number, kind: "knife" | "box" = "knife") => (kind === "box" ? 4 : 2) * depth;
/** ช่วงเส้นแนว x = at (หรือ y = at) ที่อยู่ในชิ้น — จากจุดตัดแรกถึงจุดตัดสุดท้าย */
function chordAt(s: Shape, axis: "v" | "h", at: number): [Pt, Pt] | null {
  const X = crossings(s, axis, at).map((x) => x.p).sort((a, b) => (axis === "v" ? a[1] - b[1] : a[0] - b[0]));
  return X.length >= 2 ? [X[0], X[X.length - 1]] : null;
}
/**
 * จีบ n จีบ เรียงห่างเท่ากันตามกว้าง (axis v = จีบแนวตั้ง) หรือสูง (h) ของชิ้น — เพิ่มเนื้อผ้าให้จีบด้วยการผ่ากางขนาน
 *   รอยบากที่ขอบทั้งสองฝั่งของแต่ละเส้น + เส้นในบอก "พับ" / "วางทับ" · ช่วงเนื้อจีบบนขอบติด take (ความยาวตะเข็บ = ความยาวหลังพับจีบ)
 */
export function pleatPiece(s: Shape, o: PleatOpts, stamp = "p"): ShapingResult | null {
  const kind = o.kind ?? "knife", n = Math.round(o.n), amt = pleatTake(o.depth, kind);
  if (s.k === "ellipse" || !(n >= 1 && n <= 12) || !(o.depth >= 0.2 && o.depth <= 20)) return null;
  const b = shapeBox(s), c0 = o.axis === "v" ? b.x : b.y, span = o.axis === "v" ? b.w : b.h;
  const pos = Array.from({ length: n }, (_, k) => c0 + (span * (k + 1)) / (n + 1));
  let cur: Shape = s;
  const gaps: [Pt, Pt][] = [];
  for (const at of [...pos].reverse()) {                                             // กางจากตัวไกลสุดก่อน — ตำแหน่งตัวใกล้ไม่เลื่อน
    const r = slashSpread(cur, { axis: o.axis, at, amount: amt });
    if (!r) return null;
    const shift = (q: Pt): Pt => (o.axis === "v" ? (q[0] > at + 1e-6 ? [q[0] + amt, q[1]] : q) : (q[1] > at + 1e-6 ? [q[0], q[1] + amt] : q));
    for (let g = 0; g < gaps.length; g++) gaps[g] = [shift(gaps[g][0]), shift(gaps[g][1])];
    gaps.push(...r.gaps);
    cur = r.shape;
  }
  const take: Record<number, number> = {};
  for (const [a, z] of gaps) { const i = edgeIndexByEnds(cur, a, z); if (i >= 0) take[i] = r4(amt); }
  const inner: InnerLine[] = [], notches: Pt[] = [];
  pos.forEach((at, k) => {
    const X = at + k * amt;                                                           // ตำแหน่งต้นเนื้อจีบหลังกาง
    const lines: [number, string, "fold" | "mark"][] = kind === "box"
      ? [[X, `จีบ ${k + 1}: พับเข้ากลาง`, "fold"], [X + amt / 2, `จีบ ${k + 1}: ชนกลาง`, "mark"], [X + amt, `จีบ ${k + 1}: พับเข้ากลาง`, "fold"]]
      : [[X, `จีบ ${k + 1}: วางทับ`, "mark"], [X + amt, `จีบ ${k + 1}: พับ`, "fold"]];
    lines.forEach(([x, name, kd], li) => {
      const ch = chordAt(cur, o.axis, x + (li === lines.length - 1 && kind === "knife" ? -1e-4 : 1e-4));
      if (!ch) return;
      inner.push({ id: `${stamp}${k}${li}`, kind: kd, name, pts: [ch[0].map(r4) as Pt, ch[1].map(r4) as Pt] });
      notches.push(ch[0].map(r4) as Pt, ch[1].map(r4) as Pt);
    });
  });
  return { shape: cur, take, inner, notches };
}

// ───────── ชิ้นข้างจากขอบ ─────────
export type GussetPlan = { shape: Shape; length: number; notches: Pt[]; grain: [Pt, Pt]; side: { from: number; count: number; n: number } };
/**
 * ชิ้นข้าง (gusset) จากขอบที่เลือกของชิ้น: ขอบ from ต่อกัน count ขอบ · กว้าง depth (ซม.)
 *   ยาว = ความยาวตามเส้นจริงของขอบ (โค้งก็วัดตามโค้ง) หัก take (ขาเกล็ด/เนื้อจีบ) · รอยบากที่ทุกรอยต่อขอบ ทั้งสองข้างของชิ้นข้าง
 *   เย็บ: ขอบที่เลือก ↔ ขอบล่างของชิ้นข้าง (ขอบ 2) · ชิ้นที่สอง (ถ้ามี) ↔ ขอบบน (ขอบ 0) — แบบเดียวกับแม่แบบ
 */
export function gussetFromEdges(s: Shape, from: number, count: number, depth: number, meta?: EdgeMeta[] | null): GussetPlan | null {
  const E = pieceEdges(s), n = E.length;
  if (!n || from < 0 || from >= n || count < 1 || count > n || !(depth >= 0.5 && depth <= 60)) return null;
  const lens: number[] = [];
  for (let k = 0; k < count; k++) { const i = (from + k) % n, tk = meta && meta.length === n ? Math.min(meta[i]?.take ?? 0, E[i].len) : 0; lens.push(E[i].len - tk); }
  const L = r4(lens.reduce((m, x) => m + x, 0));
  if (!(L >= 1)) return null;
  const notches: Pt[] = [];
  let cum = 0;
  for (let k = 0; k < count - 1; k++) {
    cum += lens[k];
    notches.push([r4(L - cum), r4(depth)], [r4(cum), 0]);
  }
  return { shape: { k: "rect", x: 0, y: 0, w: L, h: r4(depth) }, length: L, notches, grain: [[r4(L * 0.08), r4(depth / 2)], [r4(L * 0.25), r4(depth / 2)]], side: { from, count, n } };
}
/** ขอบติดกันที่ควรเป็นชิ้นข้าง เริ่มจากขอบ i: เดินต่อจนเจอขอบพับ/ขอบเปิด (ปากกระเป๋า) หรือครบรอบ */
export function gussetRun(s: Shape, i: number, foldEdges?: number[] | null, meta?: EdgeMeta[] | null): number {
  const n = pieceEdges(s).length;
  const stop = (j: number) => !!(foldEdges && foldEdges.length === n && foldEdges[j]) || !!(meta && meta.length === n && meta[j]?.open);
  let c = 0;
  for (let k = 0; k < n; k++) { const j = (i + k) % n; if (k > 0 && stop(j)) break; c++; if (stop(j)) break; }
  return Math.max(1, Math.min(c, n - 1));
}

// ───────── แถบตามขอบ (ทากาว / ปาดบาง) ─────────
/** เส้นขนานกับขอบ i เข้าในชิ้น width ซม. — ใช้เป็นเส้นในชนิด glue / skive (บอกแนวทากาว / แนวปาดบาง) */
export function edgeBandLine(s: Shape, i: number, width: number): Pt[] | null {
  const E = pieceEdges(s)[i];
  if (!E || !(width >= 0.1 && width <= 20)) return null;
  const orient = Math.sign(polySigned(flattenShape(s))) || 1, Q = E.pts;
  if (Q.length < 2) return null;
  const out: Pt[] = Q.map((p, k) => {
    const a = Q[Math.max(0, k - 1)], b = Q[Math.min(Q.length - 1, k + 1)], nv = inwardOf(a, b, orient);
    return [r4(p[0] + nv[0] * width), r4(p[1] + nv[1] * width)];
  });
  // ลดจุดบนเส้นตรง (ขอบตรง = 2 จุด)
  return Q.length === 2 ? out : out.filter((_, k) => k % 2 === 0 || k === out.length - 1);
}
function polySigned(Q: Pt[]): number { let a = 0; for (let i = 0; i < Q.length; i++) { const p = Q[i], q = Q[(i + 1) % Q.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; }

/** ค่า take ใหม่ลงในค่ารายขอบ (ครบทุกขอบของรูปใหม่) — ค่าเดิมของขอบอื่นคงไว้ */
export function withTakes(meta: EdgeMeta[] | null | undefined, n: number, take: Record<number, number>): EdgeMeta[] {
  const base: EdgeMeta[] = meta && meta.length === n ? meta.map((m) => ({ ...m })) : Array.from({ length: n }, () => ({}));
  for (const [k, v] of Object.entries(take)) { const i = Number(k); if (i >= 0 && i < n && v > 0) base[i] = { ...base[i], take: r4(v) }; }
  return base;
}
