/**
 * 🪡 ภาพ 3 มิติ "ตอนเย็บติดแล้ว" ของกระดานวาด — สูตรบริสุทธิ์ ไม่มีหน้าจอ · สตูดิโอแพทเทิร์น (เจ้าของสั่ง 2026-11-11
 *   "3d ต้องเป็นรูปตอนเย็บติดแล้ว ไม่เอาวางเฉย ๆ และเปลี่ยน realtime")
 *
 *   คิดจากชิ้น + ตะเข็บ (ทั้งเต็มขอบและบางช่วง) แล้วคืน "ฉาก" ที่ตัวแสดง 3D วาดได้ทันที — คิดใหม่ทุกครั้งที่ชิ้น/ตะเข็บเปลี่ยน
 *     1) ตัวกระเป๋า: ถ้าตะเข็บเต็มขอบประกอบเป็นทรงได้ (lib/pattern-assembly) ใช้ทรงนั้น · ไม่งั้นตั้ง "ชิ้นหลัก" (ชิ้นใหญ่สุดที่มีตะเข็บ) ขึ้นเป็นแผ่นตั้ง
 *     2) ชิ้นที่เย็บติดกับแผ่นที่วางแล้ว ด้วย ตะเข็บเดียว = "แผ่นพับ" เกาะที่ตำแหน่งตะเข็บ (ชิ้นยาวที่เย็บขอบบน = ห้อยลงมาด้านนอก)
 *     3) ชิ้นที่เย็บ 2 ตะเข็บ (ปลายสองข้าง เช่น สายหู) = "ห่วง" โค้งระหว่างสองโคน ยาวตามระยะจริงระหว่างสองปลายของชิ้น
 *     5) ซับใน (ชิ้นที่ตั้งชั้นเป็นซับใน): ประกอบแยกเป็นถุงอีกใบ วางซ้อนอยู่ข้างในตัวนอก (ย่อเล็กน้อยให้เห็นเป็นคนละชั้น)
 *     6) ชิ้นที่เย็บกับ "เส้นในชิ้น" ของแผ่นที่วางแล้ว = "ชิ้นปะ" แนบอยู่บนผิวแผ่นนั้น (ช่องใส่ของ) · เส้นในแบบช่องเจาะ (ซิป) = ชิ้นไปอยู่ด้านหลังแผ่น (ถุงช่องซิป) · ชิ้นที่มีแนวพับ = พับทบตรงนั้น
 *     4) ที่เหลือ: ชิ้นที่มีตะเข็บแต่ยังวางไม่ได้ (เย็บ 3 จุดขึ้นไป / เย็บกับชิ้นที่ยังไม่ได้วาง) และชิ้นที่ยังไม่ได้เย็บ → วางแบนข้างหน้า พร้อมหมายเหตุ (ไม่เดาภาพ)
 *   เป็นการ "วางตามสูตร" ไม่ใช่การจำลองผ้า: ตำแหน่ง/สัดส่วนถูก แต่การทิ้งตัวเป็นค่าประมาณ
 *
 * ใช้ที่: components/pattern-studio (ภาพ 3D ข้างกระดาน) · components/pattern-3d (mode "sewn") · เทสต์ lib/__tests__/pattern-sewn.test.ts
 * คู่มือ: docs/pattern-studio.md
 */
import { assemble, type AsmPiece, type AssemblyOk, type Attach } from "@/lib/pattern-assembly";
import { checkSeam, cleanEdgeMeta, isInnerSide, isPartialSeam, pieceEdges, sidePoints, type Seam, type SeamSide } from "@/lib/pattern-seams";
import { flattenShape, shapeArea, shapeBox, type InnerKind, type Pt } from "@/lib/pattern-shape";
import { panelMesh } from "@/lib/pattern-sim";

export type V3 = [number, number, number];
/** base = ชิ้นหลัก (แผ่นตั้ง) · flap = แผ่นพับเกาะตะเข็บ · hang = ห้อยลง · loop = ห่วง (สายหู) · patch = ชิ้นปะแนบผิวแผ่น (เย็บกับเส้นใน) · loose = วางแบนข้างหน้า */
export type SewnKind = "base" | "flap" | "hang" | "loop" | "patch" | "loose";
export type SewnPart = { pid: string; name: string; kind: SewnKind; pos: number[]; tri: number[]; label: V3; /** ชิ้นหลักที่ชิ้นนี้เกาะอยู่ (แผ่นหน้า/หลังของตัวกระเป๋า หรือชิ้นหลักที่ตั้งเป็นแผ่น) — ชิ้นที่ไม่ได้เกาะ = ไม่มี */ on?: string; /** ชิ้นของชั้นซับใน */ layer?: "lining" };
/** เส้นในชิ้นที่ต้องเห็นในภาพ (ตอนนี้ = ช่องเจาะ/ซิป) บนแผ่นที่วางแล้ว */
export type SewnMark = { pts: V3[]; kind: InnerKind; on?: string };
/** งานขอบที่ต้องเห็นในภาพ (2026-11-11): ขอบที่ติดซิป / กุ๊น — เส้นตามขอบของชิ้นที่วางแล้ว · n = ทิศตั้งฉากผิวชิ้น (ให้ฟันซิปหันออก) */
export type SewnFinish = { pid: string; edge: number; kind: "zip" | "bind"; pts: V3[]; n: V3; on?: string };
/** เส้นตะเข็บในภาพ (ตำแหน่งบนชิ้นที่ถูกเย็บติด) · idx = ลำดับตะเข็บ (ใช้สีเดียวกับกระดาน) · bad = ยาวไม่เท่ากันและไม่ได้ตั้งใจ */
export type SewnLine = { id: string; idx: number; pts: V3[]; bad: boolean; /** ชิ้นหลักที่เส้นนี้อยู่บนนั้น */ on?: string };
/** unsewn = ยังไม่ได้เย็บ · unsupported = มีตะเข็บแต่ยังวางไม่ได้ · short = สายสั้นกว่าระยะระหว่างสองโคน */
export type SewnNote = { pid: string; name: string; why: "unsewn" | "unsupported" | "short" };
export type SewnScene = {
  /** ตัวกระเป๋าที่ประกอบจากตะเข็บเต็มขอบ (ถ้าประกอบได้) — ตัวแสดงวาดส่วนนี้ด้วยวิธีเดิมของโหมดประกอบ */
  asm: AssemblyOk | null;
  /** ซับในที่ประกอบได้ (ถุงอีกใบซ้อนอยู่ข้างใน) — k = ย่อเท่านี้รอบจุดกึ่งกลางก้น · lift = ยกขึ้นจากก้น (ซม.) */
  lining: { asm: AssemblyOk; k: number; lift: number } | null;
  marks: SewnMark[];
  /** ขอบที่ติดซิป / กุ๊น ของชิ้นที่วางแล้ว (ชิ้นข้าง/ก้นที่โค้งตามตัวกระเป๋ายังไม่วาด) */
  finishes: SewnFinish[];
  parts: SewnPart[];
  lines: SewnLine[];
  notes: SewnNote[];
  /** จำนวนชิ้นที่ "เย็บติดแล้ว" ในภาพ (รวมชิ้นของตัวกระเป๋า) — 0 = ยังไม่มีอะไรเย็บติด */
  joined: number;
  min: V3; max: V3;
};

const HINGE = 0.26;        // แผ่นพับเอนเข้าในเล็กน้อย (เรเดียน) ให้เห็นว่าเป็นชิ้นแยก
const HANG_MIN = 12;       // ชิ้นที่ยื่นจากตะเข็บเกินนี้ (ซม.) และเย็บที่ขอบบน = ห้อยลง
const LOOSE_GAP = 6;       // ชิ้นที่ยังไม่เย็บ วางห่างจากตัวกระเป๋าไปข้างหน้า (ซม.)
const CURVE_N = 48;
const LINING_K = 0.965;    // ซับในย่อเล็กน้อยให้เห็นเป็นอีกชั้นข้างในตัวนอก (รูปชิ้นจริงไม่ได้ย่อ)
const LINING_LIFT = 0.25;
const PATCH_OFF = 0.3;     // ชิ้นปะลอยจากผิวแผ่นเท่านี้ (ซม.) กันภาพซ้อนกัน

type Frame = { o: V3; u: V3; v: V3; n: V3 };
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit3 = (a: V3, fb: V3 = [1, 0, 0]): V3 => { const l = len3(a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : fb; };
/** เอาส่วนที่ขนานกับ t ออกจาก w แล้วทำให้ยาว 1 (ให้ตั้งฉากกับแนวเส้น) */
const orth = (w: V3, t: V3, fb: V3): V3 => unit3(sub(w, mul(t, dot(w, t))), fb);
const angleAbout = (a: V3, b: V3, axis: V3) => Math.atan2(dot(cross(a, b), axis), dot(a, b));
const rotAbout = (v: V3, axis: V3, th: number): V3 => add(add(mul(v, Math.cos(th)), mul(cross(axis, v), Math.sin(th))), mul(axis, dot(axis, v) * (1 - Math.cos(th))));
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const place = (f: Frame, p: Pt): V3 => [f.o[0] + f.u[0] * p[0] + f.v[0] * p[1], f.o[1] + f.u[1] * p[0] + f.v[1] * p[1], f.o[2] + f.u[2] * p[0] + f.v[2] * p[1]];
const dir3 = (f: Frame, d: Pt): V3 => [f.u[0] * d[0] + f.v[0] * d[1], f.u[1] * d[0] + f.v[1] * d[1], f.u[2] * d[0] + f.v[2] * d[1]];

// ตาข่ายของชิ้น (จุด 2 มิติบนกระดาน + สามเหลี่ยม) — จำไว้ตามรูปชิ้น: ตอนลากตะเข็บ รูปชิ้นไม่เปลี่ยน ไม่ต้องแตกตาข่ายใหม่
const meshCache = new Map<string, { pts: Pt[]; tri: number[] }>();
function meshOf(p: AsmPiece, fine: boolean): { pts: Pt[]; tri: number[] } {
  const b = shapeBox(p.shape);
  let cell = fine ? Math.max(0.8, Math.min(1.6, Math.min(b.w, b.h) / 3)) : Math.max(2, Math.max(b.w, b.h) / 6);
  cell = Math.max(cell, Math.sqrt((b.w * b.h) / 1500));          // ชิ้นใหญ่มาก: ไม่ให้จุดเกินราว 1,500 จุด
  cell = Math.round(cell * 100) / 100;
  const key = `${cell}|${JSON.stringify(p.shape)}|${JSON.stringify(p.holes)}`;
  const hit = meshCache.get(key);
  if (hit) return hit;
  const m = panelMesh(flattenShape(p.shape), p.holes.map((h) => flattenShape(h)), cell);
  if (meshCache.size > 300) meshCache.clear();
  meshCache.set(key, m);
  return m;
}

type Seg = { mid: Pt; dir: Pt; inward: Pt; len: number; pts: Pt[]; bulk: Pt | null };
/** ช่วงที่เย็บของด้าน: จุดกึ่งกลาง · ทิศตามแนว (จากปลายถึงปลาย) · ทิศเข้าหาเนื้อชิ้น · bulk = ทิศที่เส้นโป่งไป (เส้นรูปตัว U) · เส้นตรง = null */
function segOf(piece: AsmPiece, side: SeamSide): Seg | null {
  const shape = piece.shape, P = sidePoints({ shape, inner: piece.inner }, side);
  if (!P || P.length < 2) return null;
  const a = P[0], b = P[P.length - 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (d < 0.05) return null;                                       // ด้านที่วนกลับมาจุดเดิม (เช่น ทั้งรอบวงกลม) — ยังวางไม่ได้
  const O = flattenShape(shape);
  let cx = 0, cy = 0; for (const q of O) { cx += q[0]; cy += q[1]; } cx /= O.length; cy /= O.length;
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dir: Pt = [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  let inward: Pt = [-dir[1], dir[0]];
  if (inward[0] * (cx - mid[0]) + inward[1] * (cy - mid[1]) < 0) inward = [-inward[0], -inward[1]];
  let len = 0; for (let k = 1; k < P.length; k++) len += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
  let bx = 0, by = 0; for (const q of P) { bx += q[0] - mid[0]; by += q[1] - mid[1]; } bx /= P.length; by /= P.length;
  const bl = Math.hypot(bx, by);
  return { mid, dir, inward, len, pts: P, bulk: bl > 0.03 * len ? [bx / bl, by / bl] : null };
}

/** เส้นกลางของห่วง: โค้งจากโคน F1 (ออกทาง T1) ไปโคน F2 (กลับเข้าทาง −T2) ให้ยาวเท่า L + ทิศความกว้างตลอดเส้น (บิดให้ตรงกับแนวตะเข็บที่โคนทั้งสอง) */
function loopCurve(F1: V3, T1: V3, W1: V3, F2: V3, T2: V3, W2: V3, L: number): { at: (s: number, w: number) => V3; short: boolean } {
  const chord = len3(sub(F2, F1));
  const sample = (k: number): V3[] => {
    const c1 = add(F1, mul(T1, k)), c2 = add(F2, mul(T2, k)), out: V3[] = [];
    for (let i = 0; i <= CURVE_N; i++) { const t = i / CURVE_N, v = 1 - t; out.push(add(add(mul(F1, v * v * v), mul(c1, 3 * v * v * t)), add(mul(c2, 3 * v * t * t), mul(F2, t * t * t)))); }
    return out;
  };
  const lengthOf = (P: V3[]) => { let l = 0; for (let i = 1; i < P.length; i++) l += len3(sub(P[i], P[i - 1])); return l; };
  const short = chord >= L - 0.05;
  let k = 0;
  if (!short) {
    let lo = 0, hi = Math.max(L, 1);
    for (let i = 0; i < 6 && lengthOf(sample(hi)) < L; i++) hi *= 2;
    for (let i = 0; i < 30; i++) { k = (lo + hi) / 2; if (lengthOf(sample(k)) < L) lo = k; else hi = k; }
  }
  const P = sample(k), cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + len3(sub(P[i], P[i - 1])));
  const total = cum[CURVE_N] || 1;
  const tan = P.map((_, i) => unit3(sub(P[Math.min(CURVE_N, i + 1)], P[Math.max(0, i - 1)]), T1));
  tan[0] = k > 1e-6 ? T1 : tan[0]; tan[CURVE_N] = k > 1e-6 ? mul(T2, -1) : tan[CURVE_N];
  // ทิศความกว้างแบบไม่บิด (ลากตามเส้น) แล้วค่อยบิดเพิ่ม: กลางเส้นให้แถบโค้งรอบแกนความกว้าง (สายจริงโค้งแบบนี้) · ปลายเส้นให้ตรงกับแนวตะเข็บของโคนที่สอง
  const W: V3[] = [orth(W1, tan[0], [1, 0, 0])];
  for (let i = 1; i <= CURVE_N; i++) W.push(orth(W[i - 1], tan[i], W[i - 1]));
  let thEnd = angleAbout(W[CURVE_N], orth(W2, tan[CURVE_N], W[CURVE_N]), tan[CURVE_N]);
  const bn = cross(T1, sub(F2, F1)), mid = CURVE_N / 2;
  let thMid: number | null = null;
  if (!short && chord > 0.5 && len3(bn) > 0.15 * chord) {
    const b = orth(unit3(bn), tan[mid], W[mid]), a1 = angleAbout(W[mid], b, tan[mid]), a2 = angleAbout(W[mid], mul(b, -1), tan[mid]);
    thMid = Math.abs(a1) <= Math.abs(a2) ? a1 : a2;
    while (thEnd - thMid > Math.PI) thEnd -= 2 * Math.PI;
    while (thEnd - thMid < -Math.PI) thEnd += 2 * Math.PI;
  }
  for (let i = 0; i <= CURVE_N; i++) {
    const u = cum[i] / total;
    const th = thMid == null ? thEnd * smooth(u) : u < 0.5 ? thMid * smooth(u / 0.3) : thMid + (thEnd - thMid) * smooth((u - 0.7) / 0.3);
    W[i] = rotAbout(W[i], tan[i], th);
  }
  const at = (s: number, w: number): V3 => {
    const d = (s * total) / Math.max(L, 1e-6);
    if (d <= 0) return add(add(P[0], mul(tan[0], d)), mul(W[0], w));
    if (d >= total) return add(add(P[CURVE_N], mul(tan[CURVE_N], d - total)), mul(W[CURVE_N], w));
    let i = 1; while (i < CURVE_N && cum[i] < d) i++;
    const f = (d - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-9);
    return add(add(mul(P[i - 1], 1 - f), mul(P[i], f)), mul(unit3(add(mul(W[i - 1], 1 - f), mul(W[i], f)), W[i]), w));
  };
  return { at, short };
}

/** สร้างฉากภาพเย็บติดจากชิ้น + ตะเข็บ (+ จุดติดหูของแม่แบบ) */
export function buildSewn(pieces: AsmPiece[], seams: Seam[], attaches: Attach[] = []): SewnScene {
  const byPid = new Map(pieces.map((p) => [p.pid, p]));
  const shapes = new Map(pieces.map((p) => [p.pid, { shape: p.shape, inner: p.inner }]));
  const idxOf = new Map(seams.map((s, i) => [s.id, i]));
  const checks = new Map(seams.map((s) => [s.id, checkSeam(shapes, s)]));
  const usable = seams.filter((s) => checks.get(s.id)?.status !== "broken" && byPid.has(s.a.pid) && byPid.has(s.b.pid));
  const parts: SewnPart[] = [], lines: SewnLine[] = [], notes: SewnNote[] = [], marks: SewnMark[] = [], finishes: SewnFinish[] = [];
  /** ขอบที่ติดซิป / กุ๊น ของชิ้น → เส้นในภาพ (f = วางจุดของชิ้นลงในฉาก · n = ทิศออกจากผิว) */
  const finishOf = (p: AsmPiece, f: (q: Pt) => V3, n: V3, on?: string) => {
    const meta = cleanEdgeMeta(p.shape, p.edgeMeta);
    if (!meta) return;
    for (const e of pieceEdges(p.shape)) {
      const m = meta[e.i];
      for (const kind of ["bind", "zip"] as const) if (m?.[kind]) finishes.push({ pid: p.pid, edge: e.i, kind, pts: e.pts.map((q) => add(f(q), mul(n, kind === "zip" ? 0.2 : 0.14))), n, ...(on ? { on } : {}) });
    }
  };
  const frames = new Map<string, Frame>();       // ชิ้นที่วางแล้วและเป็นแผ่นเรียบ (ให้ชิ้นอื่นมาเกาะได้)
  const done = new Set<string>();
  const rootOf = new Map<string, string>();      // ชิ้นที่วางแล้ว → ชิ้นหลักต้นทาง (แผ่นพับที่เกาะแผ่นพับ ย้อนไปถึงแผ่นหน้า/หลัง)
  let joined = 0, zFront = 0;

  const emit = (p: AsmPiece, kind: SewnKind, fine: boolean, f: (q: Pt) => V3, on?: string) => {
    const m = meshOf(p, fine), pos: number[] = [];
    let sx = 0, sy = 0, sz = 0;
    for (const q of m.pts) { const v = f(q); pos.push(v[0], v[1], v[2]); sx += v[0]; sy += v[1]; sz += v[2]; }
    const n = Math.max(1, m.pts.length);
    parts.push({ pid: p.pid, name: p.name, kind, pos, tri: m.tri, label: [sx / n, sy / n, sz / n], ...(on ? { on } : {}), ...(p.layer === "lining" ? { layer: "lining" as const } : {}) });
    done.add(p.pid);
  };

  // 1) ตัวกระเป๋า
  const A0 = assemble(pieces, usable, attaches);
  const asm = A0.ok ? A0 : null;
  if (asm) {
    const D = asm.depth, fo = asm.fromBoard.front([0, 0]), fx = asm.fromBoard.front([1, 0]), fy = asm.fromBoard.front([0, 1]);
    frames.set(asm.front, { o: [fo[0], fo[1], D / 2], u: [fx[0] - fo[0], fx[1] - fo[1], 0], v: [fy[0] - fo[0], fy[1] - fo[1], 0], n: [0, 0, 1] });
    if (asm.back !== asm.front) {
      const bo = asm.fromBoard.back([0, 0]), bx = asm.fromBoard.back([1, 0]), by = asm.fromBoard.back([0, 1]);
      frames.set(asm.back, { o: [-bo[0], bo[1], -D / 2], u: [-(bx[0] - bo[0]), bx[1] - bo[1], 0], v: [-(by[0] - bo[0]), by[1] - bo[1], 0], n: [0, 0, -1] });
    }
    for (const p of pieces) if (p.layer !== "lining" && !asm.loose.includes(p.pid)) { done.add(p.pid); joined++; }
    rootOf.set(asm.front, asm.front); rootOf.set(asm.back, asm.back);
    zFront = D / 2;
  }
  // ซับใน: ถุงอีกใบ ประกอบจากชิ้นชั้นซับใน วางซ้อนข้างในตัวนอก — ผิวที่เห็น (และที่ชิ้นปะไปเกาะ) หันเข้าหากลางกระเป๋า
  const L0 = assemble(pieces, usable, [], "lining");
  const lining = L0.ok ? { asm: L0, k: LINING_K, lift: LINING_LIFT } : null;
  if (L0.ok) {
    const D = L0.depth, k = LINING_K;
    const bo = L0.fromBoard.back([0, 0]), bx = L0.fromBoard.back([1, 0]), by = L0.fromBoard.back([0, 1]);
    const backF: Frame = { o: [-bo[0] * k, bo[1] * k + LINING_LIFT, (-D / 2) * k], u: [-(bx[0] - bo[0]) * k, (bx[1] - bo[1]) * k, 0], v: [-(by[0] - bo[0]) * k, (by[1] - bo[1]) * k, 0], n: [0, 0, 1] };
    if (L0.back !== L0.front) {
      const fo = L0.fromBoard.front([0, 0]), fx = L0.fromBoard.front([1, 0]), fy = L0.fromBoard.front([0, 1]);
      frames.set(L0.front, { o: [fo[0] * k, fo[1] * k + LINING_LIFT, (D / 2) * k], u: [(fx[0] - fo[0]) * k, (fx[1] - fo[1]) * k, 0], v: [(fy[0] - fo[0]) * k, (fy[1] - fo[1]) * k, 0], n: [0, 0, -1] });
    }
    frames.set(L0.back, backF);                                   // แผ่นหน้า/หลังเป็นชิ้นเดียวกัน (ตัด 2) = ใช้แผ่นหลัง → ผ่าด้านหน้าแล้วเห็นช่อง
    rootOf.set(L0.front, L0.front); rootOf.set(L0.back, L0.back);
    for (const p of pieces) if (p.layer === "lining" && !L0.loose.includes(p.pid)) { done.add(p.pid); joined++; }
    if (!asm) zFront = D / 2;
  }
  if (!asm && !lining) {
    const inSeam = new Set(usable.flatMap((s) => [s.a.pid, s.b.pid]));
    const root = pieces.filter((p) => inSeam.has(p.pid)).sort((a, b) => shapeArea(b.shape) - shapeArea(a.shape))[0];
    if (root) {
      const b = shapeBox(root.shape), f: Frame = { o: [-(b.x + b.w / 2), b.y + b.h, 0], u: [1, 0, 0], v: [0, -1, 0], n: [0, 0, 1] };
      frames.set(root.pid, f); rootOf.set(root.pid, root.pid);
      emit(root, "base", false, (q) => place(f, q));
    }
  }

  // 2) + 3) ชิ้นที่เย็บติดกับแผ่นที่วางแล้ว — วนจนไม่มีชิ้นไหนวางเพิ่มได้ (แผ่นพับเป็นที่เกาะของชิ้นถัดไปได้)
  const linksOf = (pid: string) => usable.filter((s) => s.a.pid === pid || s.b.pid === pid);
  const seamLine = (s: Seam, host: Frame, P: Pt[], on?: string) => {
    const c = checks.get(s.id);
    lines.push({ id: s.id, idx: idxOf.get(s.id) ?? 0, pts: P.map((q) => add(place(host, q), mul(host.n, 0.12))), bad: c?.status === "mismatch" && !s.ease, ...(on ? { on } : {}) });
  };
  let progress = true;
  while (progress) {
    progress = false;
    for (const C of pieces) {
      if (done.has(C.pid)) continue;
      const L = linksOf(C.pid);
      if (!L.length || L.length > 2 || L.some((s) => s.a.pid === s.b.pid)) continue;
      const ends = L.map((s) => {
        const mine = s.a.pid === C.pid ? s.a : s.b, other = s.a.pid === C.pid ? s.b : s.a, host = frames.get(other.pid), hp = byPid.get(other.pid);
        const cs = segOf(C, mine), hs = host && hp ? segOf(hp, other) : null;
        const line = hp && isInnerSide(other) ? (hp.inner ?? []).find((l) => l.id === other.inner) ?? null : null;
        return host && cs && hs ? { s, host, cs, hs, on: rootOf.get(other.pid), line } : null;
      });
      if (ends.some((e) => !e)) continue;
      const E = ends as { s: Seam; host: Frame; cs: Seg; hs: Seg; on?: string; line: { kind: InnerKind } | null }[];
      const world = (e: (typeof E)[number]) => {
        const M = place(e.host, e.hs.mid), Dv = unit3(dir3(e.host, e.hs.dir)), O = unit3(dir3(e.host, [-e.hs.inward[0], -e.hs.inward[1]]));
        return { M, Dv, O, N: e.host.n };
      };
      if (E.length === 1 && E[0].line) {
        // เย็บกับเส้นในชิ้น = ชิ้นปะ: หมุนชิ้นบนระนาบของแผ่นให้แนวเย็บทับกัน (ด้านที่เส้นรูปตัว U โป่งไปต้องตรงกัน · เส้นตรง = ให้ชิ้นห้อยลง) แล้วแนบผิวแผ่น
        const e = E[0], N = e.host.n, cb = e.cs.bulk ?? e.cs.inward;
        let c = 1, s = 0, best = -Infinity;
        for (const sg of [1, -1]) {
          const th = Math.atan2(sg * e.hs.dir[1], sg * e.hs.dir[0]) - Math.atan2(e.cs.dir[1], e.cs.dir[0]), cc = Math.cos(th), ss = Math.sin(th);
          const bx = cb[0] * cc - cb[1] * ss, by = cb[0] * ss + cb[1] * cc;
          const score = e.hs.bulk ? bx * e.hs.bulk[0] + by * e.hs.bulk[1] : -dir3(e.host, [bx, by])[1];
          if (score > best) { best = score; c = cc; s = ss; }
        }
        const off = e.line?.kind === "slit" ? -PATCH_OFF - 0.05 : PATCH_OFF;      // ช่องเจาะ (ซิป) = ถุงอยู่ด้านหลังแผ่น
        const fold = (C.inner ?? []).find((l) => l.kind === "fold" && l.pts.length >= 2);
        const f0 = fold?.pts[0], f1 = fold?.pts[fold.pts.length - 1];
        const sideOf = (q: Pt) => (f0 && f1 ? (f1[0] - f0[0]) * (q[1] - f0[1]) - (f1[1] - f0[1]) * (q[0] - f0[0]) : 0);
        const seamSide = Math.sign(sideOf(e.cs.mid));
        emit(C, "patch", !!fold, (q) => {
          let p = q, second = false;
          if (f0 && f1 && seamSide !== 0 && sideOf(q) * seamSide < 0) {         // เลยแนวพับ = ทบกลับมาเป็นชั้นที่สอง
            const dx = f1[0] - f0[0], dy = f1[1] - f0[1], l2 = dx * dx + dy * dy || 1, t = ((q[0] - f0[0]) * dx + (q[1] - f0[1]) * dy) / l2;
            p = [2 * (f0[0] + dx * t) - q[0], 2 * (f0[1] + dy * t) - q[1]]; second = true;
          }
          const dx = p[0] - e.cs.mid[0], dy = p[1] - e.cs.mid[1];
          return add(place(e.host, [e.hs.mid[0] + dx * c - dy * s, e.hs.mid[1] + dx * s + dy * c]), mul(N, off + (second ? Math.sign(off) * PATCH_OFF : 0)));
        }, e.on);
        seamLine(e.s, e.host, e.hs.pts, e.on); joined++; progress = true;
      } else if (E.length === 1) {
        const e = E[0], { M, Dv, O, N } = world(e);
        // หมุนชิ้นบนระนาบ (ไม่กลับด้าน) ให้แนวตะเข็บทับกัน และเนื้อชิ้นยื่นออกนอกแผ่นที่เกาะ
        let c = 1, s = 0;
        for (const sg of [1, -1]) {
          const th = Math.atan2(sg * e.hs.dir[1], sg * e.hs.dir[0]) - Math.atan2(e.cs.dir[1], e.cs.dir[0]);
          c = Math.cos(th); s = Math.sin(th);
          const ix = e.cs.inward[0] * c - e.cs.inward[1] * s, iy = e.cs.inward[0] * s + e.cs.inward[1] * c;
          if (ix * -e.hs.inward[0] + iy * -e.hs.inward[1] > 0) break;
        }
        const local = (q: Pt): [number, number] => {
          const dx = q[0] - e.cs.mid[0], dy = q[1] - e.cs.mid[1], rx = dx * c - dy * s, ry = dx * s + dy * c;
          return [rx * e.hs.dir[0] + ry * e.hs.dir[1], -(rx * e.hs.inward[0] + ry * e.hs.inward[1])];   // [ตามแนวตะเข็บ, ยื่นออกจากตะเข็บ]
        };
        let reach = 0; for (const q of flattenShape(C.shape)) reach = Math.max(reach, local(q)[1]);
        if (O[1] > 0.7 && Math.abs(N[1]) < 0.3 && reach > HANG_MIN) {
          // ชิ้นยาวที่เย็บขอบบน: พับลงมาห้อยด้านนอกของแผ่น ส่วนที่ยาวเกินพื้นวางราบไปข้างหน้า
          const Nh = unit3([N[0], 0, N[2]], [0, 0, 1]);
          emit(C, "hang", true, (q) => {
            const [al, out] = local(q), v = add(add(M, mul(Dv, al)), mul(N, 0.3));
            const y = v[1] - out;
            return y >= 0.05 ? [v[0], y, v[2]] : add([v[0], 0.05, v[2]], mul(Nh, 0.05 - y));
          }, e.on);
        } else {
          const Ot = unit3(sub(mul(O, Math.cos(HINGE)), mul(N, Math.sin(HINGE)))), at = (q: Pt): V3 => { const [al, out] = local(q); return add(add(M, mul(Dv, al)), mul(Ot, out)); };
          emit(C, "flap", false, at, e.on);
          if (e.on) rootOf.set(C.pid, e.on);
          const o = at([0, 0]);
          frames.set(C.pid, { o, u: sub(at([1, 0]), o), v: sub(at([0, 1]), o), n: unit3(add(mul(N, Math.cos(HINGE)), mul(O, Math.sin(HINGE)))) });
        }
        seamLine(e.s, e.host, e.hs.pts, e.on); joined++; progress = true;
      } else {
        const [e1, e2] = E, w1 = world(e1), w2 = world(e2);
        const ax = e2.cs.mid[0] - e1.cs.mid[0], ay = e2.cs.mid[1] - e1.cs.mid[1], Ls = Math.hypot(ax, ay);
        if (Ls < 1) continue;                                      // สองตะเข็บอยู่ที่เดียวกันบนชิ้น — ไม่ใช่สาย
        const a: Pt = [ax / Ls, ay / Ls], ap: Pt = [-a[1], a[0]];
        // ทิศความกว้างที่โคน: หน้าของชิ้น (ด้านที่เห็นบนกระดาน) หันออกนอกแผ่นที่เกาะ
        const W1 = dot(cross(w1.Dv, w1.O), w1.N) > 0 ? w1.Dv : mul(w1.Dv, -1), tEnd = mul(w2.O, -1), W2 = dot(cross(w2.Dv, tEnd), w2.N) > 0 ? w2.Dv : mul(w2.Dv, -1);
        const curve = loopCurve(w1.M, w1.O, W1, w2.M, w2.O, W2, Ls);
        emit(C, "loop", true, (q) => { const dx = q[0] - e1.cs.mid[0], dy = q[1] - e1.cs.mid[1]; return curve.at(dx * a[0] + dy * a[1], dx * ap[0] + dy * ap[1]); }, e1.on);
        if (curve.short) notes.push({ pid: C.pid, name: C.name, why: "short" });
        seamLine(e1.s, e1.host, e1.hs.pts, e1.on); seamLine(e2.s, e2.host, e2.hs.pts, e2.on); joined++; progress = true;
      }
    }
  }
  if (!asm && !lining && joined > 0) joined++;                    // นับชิ้นหลักด้วย เมื่อมีชิ้นมาเกาะแล้ว
  // ช่องเจาะ (ซิป) บนแผ่นที่วางแล้ว → เส้นให้เห็นในภาพ
  for (const p of pieces) {
    const f = frames.get(p.pid);
    if (f) for (const l of p.inner ?? []) if (l.kind === "slit") marks.push({ pts: l.pts.map((q) => add(place(f, q), mul(f.n, 0.14))), kind: l.kind, ...(rootOf.get(p.pid) ? { on: rootOf.get(p.pid) } : {}) });
    if (f) finishOf(p, (q) => place(f, q), f.n, rootOf.get(p.pid));
  }

  // 4) ชิ้นที่เหลือ: วางแบนเรียงกันข้างหน้า
  const rest = pieces.filter((p) => !done.has(p.pid));
  let total = 0; for (const p of rest) total += shapeBox(p.shape).w + 2;
  let cur = -Math.max(0, total - 2) / 2;
  for (const p of rest) {
    const b = shapeBox(p.shape), x0 = cur, z0 = zFront + LOOSE_GAP;
    emit(p, "loose", false, (q) => [x0 + (q[0] - b.x), 0.05, z0 + (q[1] - b.y)]);
    finishOf(p, (q) => [x0 + (q[0] - b.x), 0.05, z0 + (q[1] - b.y)], [0, 1, 0]);
    cur += b.w + 2;
    notes.push({ pid: p.pid, name: p.name, why: linksOf(p.pid).length ? "unsupported" : "unsewn" });
  }

  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  const grow = (x: number, y: number, z: number) => { min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z); max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z); };
  for (const p of parts) for (let i = 0; i < p.pos.length; i += 3) grow(p.pos[i], p.pos[i + 1], p.pos[i + 2]);
  for (const a of [asm, lining?.asm]) if (a) { grow(-a.width / 2, 0, -a.depth / 2); grow(a.width / 2, a.height, a.depth / 2); }
  if (min[0] === Infinity) { min[0] = min[1] = min[2] = 0; max[0] = max[1] = max[2] = 1; }
  return { asm, lining, marks, finishes, parts, lines, notes, joined: asm || lining || joined > 1 ? joined : 0, min, max };
}

/** ชิ้นนี้ "เย็บติด" กับชิ้นอื่นในภาพ (แผ่นพับ / ห้อย / ห่วง) — ไม่ใช่ชิ้นหลักและไม่ใช่ชิ้นที่วางแบน */
export const isSewnExtra = (p: SewnPart): boolean => p.kind === "flap" || p.kind === "hang" || p.kind === "loop" || p.kind === "patch";

/** ตะเข็บบางช่วงกี่แนว (ไว้บอกบนหน้าจอว่าตะเข็บแบบนี้ไม่ได้ใช้หาทรงกระเป๋า) */
export const partialSeamCount = (seams: Seam[]): number => seams.filter(isPartialSeam).length;
