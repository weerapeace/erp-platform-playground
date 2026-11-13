/**
 * 🔒 เงื่อนไขรูปชิ้น + ขนาดบังคับ (Bag CAD รอบ I1) — สูตรบริสุทธิ์ ไม่มีหน้าจอ
 *   ขนาดบังคับ (driving dimension) = ขอบยาวเท่านี้ · เงื่อนไข = แนวนอน / แนวตั้ง / ยาวเท่ากัน / ขนาน / ตั้งฉาก / มุมที่จุด / สมมาตร
 *   ตัวจัดรูปแบบวนปรับทีละเงื่อนไข (เลื่อนจุดน้อยที่สุด) จนนิ่ง → บอกเงื่อนไขที่ยังไม่ผ่าน + คู่ที่ขัดกันเอง
 *   ความอิสระ (DOF): ยังขยับได้ / ครบพอดี / เกิน — ประมาณจาก 2 × จำนวนจุด − 3 − จำนวนสมการ
 *   ขอบโค้งใช้เส้นตรงระหว่างจุดปลาย (คอร์ด) · ไม่ใช้กับวงรี · เก็บใน PieceInfo.cons (ไปกับชิ้นทุกที่)
 *
 * ใช้ที่: components/pattern-sheet/shape-editor (หัวข้อ เงื่อนไขรูปชิ้น) · เทสต์ lib/__tests__/pattern-constraints.test.ts
 * คู่มือ: docs/pattern-studio.md (Bag CAD รอบ I)
 */
import { flattenShape, shapeBox, toPathShape, type PNode, type Pt, type Shape } from "./pattern-shape";
import type { EdgePlan } from "./pattern-edge-map";

export type ConstraintKind = "length" | "horizontal" | "vertical" | "equal" | "parallel" | "perpendicular" | "angle" | "symmetric";
export type Constraint = {
  id: string; kind: ConstraintKind;
  /** ขอบหลัก (ดัชนีขอบ) — length/horizontal/vertical/equal/parallel/perpendicular */ e?: number;
  /** ขอบคู่ — equal/parallel/perpendicular */ f?: number;
  /** จุด — angle */ n?: number;
  /** ค่า: ความยาว ซม. (length) · องศา (angle) */ v?: number;
  /** แกนสมมาตร (symmetric) */ axis?: "v" | "h";
};
export const CONSTRAINT_KINDS: { key: ConstraintKind; th: string; en: string; needs: "e" | "ef" | "n" | "axis" }[] = [
  { key: "length", th: "ขอบยาว (ขนาดบังคับ)", en: "Edge length (driving)", needs: "e" },
  { key: "horizontal", th: "ขอบแนวนอน", en: "Horizontal edge", needs: "e" },
  { key: "vertical", th: "ขอบแนวตั้ง", en: "Vertical edge", needs: "e" },
  { key: "equal", th: "2 ขอบยาวเท่ากัน", en: "Two edges equal", needs: "ef" },
  { key: "parallel", th: "2 ขอบขนานกัน", en: "Two edges parallel", needs: "ef" },
  { key: "perpendicular", th: "2 ขอบตั้งฉาก", en: "Two edges perpendicular", needs: "ef" },
  { key: "angle", th: "มุมที่จุด (องศา)", en: "Angle at a point", needs: "n" },
  { key: "symmetric", th: "สมมาตรซ้าย-ขวา / บน-ล่าง", en: "Symmetric", needs: "axis" },
];
const KIND_SET = new Set(CONSTRAINT_KINDS.map((k) => k.key));
const MAX_CONS = 30, TOL_LEN = 0.01, TOL_DEG = 0.1;

/** ตรวจรายการเงื่อนไข (จากหน้าจอ/ฐานข้อมูล) */
export function cleanConstraints(raw: unknown): Constraint[] | null {
  if (!Array.isArray(raw)) return null;
  const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 4000 ? v : undefined);
  const out: Constraint[] = [];
  for (const x of raw.slice(0, MAX_CONS)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>, kind = r.kind as ConstraintKind;
    if (!KIND_SET.has(kind) || typeof r.id !== "string" || !/^[\w-]{1,24}$/.test(r.id)) continue;
    const c: Constraint = { id: r.id, kind };
    const e = int(r.e), f = int(r.f), n = int(r.n), v = typeof r.v === "number" && Number.isFinite(r.v) ? r.v : undefined;
    const need = CONSTRAINT_KINDS.find((k) => k.key === kind)!.needs;
    if (need === "e" || need === "ef") { if (e == null) continue; c.e = e; }
    if (need === "ef") { if (f == null || f === e) continue; c.f = f; }
    if (need === "n") { if (n == null || v == null || v <= 0 || v >= 360) continue; c.n = n; c.v = Math.round(v * 10) / 10; }
    if (kind === "length") { if (v == null || v < 0.2 || v > 500) continue; c.v = Math.round(v * 1000) / 1000; }
    if (need === "axis") c.axis = r.axis === "h" ? "h" : "v";
    out.push(c);
  }
  return out.length ? out : null;
}

const ang = (a: Pt, b: Pt) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const len = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const wrap = (x: number) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
const deg = (r: number) => (r * 180) / Math.PI;

/** มุมภายในที่จุด n (องศา) ของรูปหลายเหลี่ยมจากจุด */
function insideAngle(P: Pt[], n: number, orient: number): number {
  const N = P.length, a = P[(n - 1 + N) % N], v = P[n], b = P[(n + 1) % N];
  const t = wrap(ang(v, a) - ang(v, b));
  const d = deg(orient > 0 ? t : -t);
  return d < 0 ? d + 360 : d;
}
function signed(P: Pt[]): number { let s = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += p[0] * q[1] - q[0] * p[1]; } return s; }

/** ค่าที่วัดได้ตอนนี้ของเงื่อนไข และความคลาด (ซม. หรือ องศา) */
export function measureConstraint(P: Pt[], c: Constraint): { now: number; err: number } {
  const N = P.length, E = (i: number): [Pt, Pt] => [P[i % N], P[(i + 1) % N]];
  switch (c.kind) {
    case "length": { const [a, b] = E(c.e!); const L = len(a, b); return { now: L, err: Math.abs(L - (c.v ?? L)) }; }
    case "horizontal": { const [a, b] = E(c.e!); return { now: b[1] - a[1], err: Math.abs(b[1] - a[1]) }; }
    case "vertical": { const [a, b] = E(c.e!); return { now: b[0] - a[0], err: Math.abs(b[0] - a[0]) }; }
    case "equal": { const [a, b] = E(c.e!), [p, q] = E(c.f!); const d = len(a, b) - len(p, q); return { now: d, err: Math.abs(d) }; }
    case "parallel": case "perpendicular": {
      const [a, b] = E(c.e!), [p, q] = E(c.f!);
      let d = wrap(ang(a, b) - ang(p, q)); if (c.kind === "perpendicular") d = wrap(d - Math.PI / 2);
      d = Math.abs(d); if (d > Math.PI / 2) d = Math.PI - d;   // ทิศกลับด้าน = ขนานเหมือนกัน
      return { now: deg(d), err: deg(d) };
    }
    case "angle": { const a = insideAngle(P, c.n!, signed(P)); return { now: a, err: Math.abs(a - (c.v ?? a)) }; }
    case "symmetric": {
      const b = boxOf(P), axisV = c.axis !== "h", mid = axisV ? b.x + b.w / 2 : b.y + b.h / 2;
      let worst = 0;
      for (const p of P) { const m: Pt = axisV ? [2 * mid - p[0], p[1]] : [p[0], 2 * mid - p[1]]; worst = Math.max(worst, Math.min(...P.map((q) => len(q, m)))); }
      return { now: worst, err: worst };
    }
  }
}
const boxOf = (P: Pt[]) => { const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]), x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; };
const okErr = (c: Constraint, err: number) => err <= (c.kind === "parallel" || c.kind === "perpendicular" || c.kind === "angle" ? TOL_DEG : TOL_LEN);

/** หมุนจุด q รอบ c */
const rot = (q: Pt, c: Pt, th: number): Pt => { const cs = Math.cos(th), sn = Math.sin(th), dx = q[0] - c[0], dy = q[1] - c[1]; return [c[0] + dx * cs - dy * sn, c[1] + dx * sn + dy * cs]; };

/** ปรับจุดให้เข้าใกล้เงื่อนไข 1 ครั้ง (แบ่งการขยับให้ทั้งสองฝั่ง) */
function project(P: Pt[], c: Constraint, sym: Map<number, number> | null) {
  const N = P.length, I = (i: number) => ((i % N) + N) % N;
  const setLen = (e: number, L: number, k = 1) => {
    const i = I(e), j = I(e + 1), a = P[i], b = P[j], d = len(a, b); if (d < 1e-9) return;
    const corr = ((d - L) / 2) * k, ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d;
    P[i] = [a[0] + ux * corr, a[1] + uy * corr]; P[j] = [b[0] - ux * corr, b[1] - uy * corr];
  };
  const turn = (e: number, th: number) => { const i = I(e), j = I(e + 1), m: Pt = [(P[i][0] + P[j][0]) / 2, (P[i][1] + P[j][1]) / 2]; P[i] = rot(P[i], m, th); P[j] = rot(P[j], m, th); };
  switch (c.kind) {
    case "length": setLen(c.e!, c.v!); break;
    case "horizontal": { const i = I(c.e!), j = I(c.e! + 1), y = (P[i][1] + P[j][1]) / 2; P[i] = [P[i][0], y]; P[j] = [P[j][0], y]; break; }
    case "vertical": { const i = I(c.e!), j = I(c.e! + 1), x = (P[i][0] + P[j][0]) / 2; P[i] = [x, P[i][1]]; P[j] = [x, P[j][1]]; break; }
    case "equal": { const L = (len(P[I(c.e!)], P[I(c.e! + 1)]) + len(P[I(c.f!)], P[I(c.f! + 1)])) / 2; setLen(c.e!, L); setLen(c.f!, L); break; }
    case "parallel": case "perpendicular": {
      const ae = ang(P[I(c.e!)], P[I(c.e! + 1)]), af = ang(P[I(c.f!)], P[I(c.f! + 1)]);
      let d = wrap(ae - af); if (c.kind === "perpendicular") d = wrap(d - Math.PI / 2);
      if (d > Math.PI / 2) d -= Math.PI; else if (d < -Math.PI / 2) d += Math.PI;
      turn(c.e!, -d / 2); turn(c.f!, d / 2); break;
    }
    case "angle": {
      const n = I(c.n!), o = signed(P), now = insideAngle(P, n, o), d = ((now - c.v!) * Math.PI) / 180 / 2, s = o > 0 ? 1 : -1;
      P[I(n - 1)] = rot(P[I(n - 1)], P[n], -s * d); P[I(n + 1)] = rot(P[I(n + 1)], P[n], s * d); break;
    }
    case "symmetric": {
      if (!sym) break;
      const b = boxOf(P), axisV = c.axis !== "h", mid = axisV ? b.x + b.w / 2 : b.y + b.h / 2;
      const refl = (p: Pt): Pt => (axisV ? [2 * mid - p[0], p[1]] : [p[0], 2 * mid - p[1]]);
      for (const [i, j] of sym) {
        if (i > j) continue;
        if (i === j) { P[i] = axisV ? [mid, P[i][1]] : [P[i][0], mid]; continue; }
        const r = refl(P[j]), a: Pt = [(P[i][0] + r[0]) / 2, (P[i][1] + r[1]) / 2];
        P[i] = a; P[j] = refl(a);
      }
    }
  }
}
/** คู่จุดที่สะท้อนกัน (คิดครั้งเดียวจากรูปตอนเริ่ม) */
function symPairs(P: Pt[], axis: "v" | "h"): Map<number, number> {
  const b = boxOf(P), mid = axis === "v" ? b.x + b.w / 2 : b.y + b.h / 2, m = new Map<number, number>();
  P.forEach((p, i) => {
    const r: Pt = axis === "v" ? [2 * mid - p[0], p[1]] : [p[0], 2 * mid - p[1]];
    let best = i, bd = Infinity; P.forEach((q, j) => { const d = len(q, r); if (d < bd) { bd = d; best = j; } });
    m.set(i, best);
  });
  return m;
}

export type SolveResult = { shape: Shape; ok: boolean; status: { id: string; err: number; ok: boolean }[]; conflicts: [string, string][]; dof: number; moved: number };
/** จำนวนสมการของเงื่อนไข (ใช้ประมาณความอิสระ) */
const eqs = (c: Constraint, n: number) => (c.kind === "symmetric" ? n : 1);
/** ความอิสระที่เหลือ: > 0 ยังขยับได้ · 0 ครบพอดี · < 0 เกิน */
export const freedom = (nodes: number, cons: Constraint[]) => 2 * nodes - 3 - cons.reduce((m, c) => m + eqs(c, nodes), 0);

function run(P0: Pt[], cons: Constraint[], iters: number): Pt[] {
  const P = P0.map((p) => [p[0], p[1]] as Pt);
  const syms = new Map(cons.filter((c) => c.kind === "symmetric").map((c) => [c.id, symPairs(P, c.axis ?? "v")]));
  for (let k = 0; k < iters; k++) {
    for (const c of cons) project(P, c, syms.get(c.id) ?? null);
    if (cons.every((c) => okErr(c, measureConstraint(P, c).err))) break;
  }
  return P;
}
/**
 * จัดรูปชิ้นตามเงื่อนไข: วนปรับจุด (สูงสุด iters รอบ) → รูปใหม่ (มือจับเส้นโค้งตามจุด) + ผลรายเงื่อนไข + คู่ที่ขัดกัน
 *   วงรี / จุดน้อยกว่า 3 = คืนรูปเดิม ok=false · ขอบ/จุดที่ไม่มีแล้ว = ข้ามเงื่อนไขนั้น
 */
export function solveConstraints(s: Shape, consRaw: Constraint[], iters = 400): SolveResult {
  if (s.k === "ellipse") return { shape: s, ok: false, status: [], conflicts: [], dof: 0, moved: 0 };
  const path = s.k === "path" ? s : toPathShape(s);
  if (path.k !== "path" || path.nodes.length < 3) return { shape: s, ok: false, status: [], conflicts: [], dof: 0, moved: 0 };
  const N = path.nodes.length;
  const cons = consRaw.filter((c) => (c.e == null || c.e < N) && (c.f == null || c.f < N) && (c.n == null || c.n < N));
  const P0: Pt[] = path.nodes.map((n) => [n.x, n.y]);
  const P = run(P0, cons, iters);
  const status = cons.map((c) => { const err = measureConstraint(P, c).err; return { id: c.id, err: Math.round(err * 1000) / 1000, ok: okErr(c, err) }; });
  const conflicts: [string, string][] = [];
  const bad = status.filter((x) => !x.ok).map((x) => x.id);
  for (const id of bad) {   // หาคู่ที่ขัดกัน: แก้แค่ 2 เงื่อนไขนี้แล้วยังไม่ผ่าน
    const c = cons.find((x) => x.id === id)!;
    for (const d of cons) {
      if (d.id === id || conflicts.some(([a, b]) => (a === id && b === d.id) || (a === d.id && b === id))) continue;
      const Q = run(P0, [c, d], iters);
      if (!okErr(c, measureConstraint(Q, c).err) || !okErr(d, measureConstraint(Q, d).err)) conflicts.push([id, d.id]);
    }
  }
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  const nodes: PNode[] = path.nodes.map((n, i) => ({ ...n, x: r4(P[i][0]), y: r4(P[i][1]) }));
  const moved = Math.max(0, ...P.map((p, i) => len(p, P0[i])));
  return { shape: { k: "path", nodes }, ok: status.every((x) => x.ok), status, conflicts, dof: freedom(N, cons), moved: Math.round(moved * 1000) / 1000 };
}
/** ค่าปัจจุบันของเงื่อนไข (โชว์ในรายการ) */
export function constraintNow(s: Shape, c: Constraint): number | null {
  if (s.k === "ellipse") return null;
  const p = s.k === "path" ? s : toPathShape(s);
  if (p.k !== "path") return null;
  const P: Pt[] = p.nodes.map((n) => [n.x, n.y]);
  if ((c.e != null && c.e >= P.length) || (c.f != null && c.f >= P.length) || (c.n != null && c.n >= P.length)) return null;
  return Math.round(measureConstraint(P, c).now * 100) / 100;
}
/** เงื่อนไขตามขอบใหม่เมื่อรูปเปลี่ยนจำนวนขอบ (แบ่ง/รวมขอบ) — ขอบที่ถูกแบ่ง/รวม = ทิ้งเงื่อนไขนั้น */
export function remapConstraints(cons: Constraint[], plan: EdgePlan): Constraint[] {
  const edge = (e: number): number | null => { const a = plan.map[e], b = plan.map[(e + 1) % plan.oldN]; return a != null && b != null && (a + 1) % plan.newN === b ? a : null; };
  const out: Constraint[] = [];
  for (const c of cons) {
    const x = { ...c };
    if (c.e != null) { const v = edge(c.e); if (v == null) continue; x.e = v; }
    if (c.f != null) { const v = edge(c.f); if (v == null) continue; x.f = v; }
    if (c.n != null) { const v = plan.map[c.n]; if (v == null) continue; x.n = v; }
    out.push(x);
  }
  return out;
}

// ───────── ตัดชิ้นตามเส้น ─────────
/**
 * ตัดชิ้นด้วยเส้นตรง (ผ่านจุด a → b ยืดจนสุดชิ้น) → 2 ชิ้น · ขอบที่ตัดของแต่ละชิ้น = ขอบสุดท้าย (เย็บกลับเข้าหากันได้)
 *   เส้นต้องผ่านขอบชิ้น 2 จุดพอดี (ชิ้นเว้าที่เส้นผ่านหลายครั้ง = null) · ขอบโค้งใช้จุดบนเส้นโค้งที่ตัด (ประมาณ)
 */
export function cutAlongLine(s: Shape, a: Pt, b: Pt): { left: Shape; right: Shape; cutEdge: [number, number]; side: (p: Pt) => 1 | -1; sides: [1 | -1, 1 | -1] } | null {
  if (s.k === "ellipse") return null;
  const P = flattenShape(s, 24), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  if (L < 0.05 || P.length < 3) return null;
  const sideOf = (p: Pt) => (dx * (p[1] - a[1]) - dy * (p[0] - a[0]));
  const hits: { k: number; t: number; p: Pt }[] = [];
  for (let k = 0; k < P.length; k++) {
    const p = P[k], q = P[(k + 1) % P.length], sp = sideOf(p), sq = sideOf(q);
    if ((sp < 0 && sq >= 0) || (sp >= 0 && sq < 0)) { const t = sp / (sp - sq); hits.push({ k, t, p: [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t] }); }
  }
  if (hits.length !== 2) return null;
  const [h1, h2] = hits, r4 = (v: number) => Math.round(v * 10000) / 10000;
  const ring = (from: { k: number; p: Pt }, to: { k: number; p: Pt }): PNode[] => {
    const out: PNode[] = [{ x: r4(from.p[0]), y: r4(from.p[1]) }];
    for (let k = (from.k + 1) % P.length; ; k = (k + 1) % P.length) { out.push({ x: r4(P[k][0]), y: r4(P[k][1]) }); if (k === to.k) break; }
    out.push({ x: r4(to.p[0]), y: r4(to.p[1]) });
    return out.filter((n, i, arr) => i === 0 || Math.hypot(n.x - arr[i - 1].x, n.y - arr[i - 1].y) > 1e-4);
  };
  const A = ring(h1, h2), B = ring(h2, h1);
  if (A.length < 3 || B.length < 3) return null;
  const left: Shape = { k: "path", nodes: A }, right: Shape = { k: "path", nodes: B };
  const bA = shapeBox(left), bB = shapeBox(right);
  if (bA.w * bA.h < 0.01 || bB.w * bB.h < 0.01) return null;
  const side = (p: Pt): 1 | -1 => (sideOf(p) >= 0 ? 1 : -1), sA = side(P[(h1.k + 1) % P.length]);
  return { left, right, cutEdge: [A.length - 1, B.length - 1], side, sides: [sA, sA === 1 ? -1 : 1] };
}
