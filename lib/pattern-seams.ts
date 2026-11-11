/**
 * 🧵 ขอบของชิ้น + ตะเข็บ (คู่ขอบที่เย็บติดกัน) — สูตรบริสุทธิ์ ไม่มีหน้าจอ · สตูดิโอแพทเทิร์น รอบ 2 (เจ้าของสั่ง 2026-11-10)
 *
 *   ขอบ (edge) = เส้นระหว่างจุดที่ i กับจุดถัดไปของรูปชิ้น (เส้นเย็บ)
 *     สี่เหลี่ยม = 4 ขอบ (0 บน · 1 ขวา · 2 ล่าง · 3 ซ้าย) · วงกลม/วงรี = 1 ขอบ (ทั้งรอบ) · รูปจากปากกา = ขอบละ 1 ช่วงระหว่างจุด
 *   ด้านของตะเข็บ (SeamSide) = ขอบที่อยู่ติดกันบนชิ้นเดียว: เริ่มที่ขอบ from นับไป count ขอบ (วนรอบรูปได้)
 *     n = จำนวนขอบของชิ้นตอนสร้างตะเข็บ → ถ้าชิ้นถูกเพิ่ม/ลบจุดจนจำนวนขอบเปลี่ยน ตะเข็บนั้น "ต้องกำหนดใหม่" (ไม่เดาให้)
 *     ย้ายชิ้น / ย่อขยาย / ขยับจุด / ดัดโค้ง จำนวนขอบไม่เปลี่ยน → ตะเข็บยังอยู่ และความยาวคิดใหม่จากรูปปัจจุบันเสมอ
 *   ตะเข็บ (Seam) = ด้าน a เย็บติดกับด้าน b · ตรวจ: ความยาวสองด้านต่างกันเกิน tol = "ยาวไม่เท่ากัน"
 *   ห้ามปรับขนาดชิ้นเองให้เย็บได้ — แค่เตือน (ตามเอกสารแนวทางของเจ้าของ)
 *   เย็บบางช่วง (2026-11-11): ด้านมี t0/t1 = เย็บแค่ช่วงนั้นของด้าน (ซม. จากจุดเริ่มของด้าน ตามแนวเส้น) → ขอบเดียวมีได้หลายตะเข็บ (ห้ามทับกัน)
 *     ชิ้นถูกแก้จนขอบสั้นกว่าช่วง → ตัดช่วงให้อยู่บนขอบ · ไม่เหลือช่วงเลย = "ต้องเย็บใหม่"
 *     ease = ตั้งใจให้สองด้านยาวต่างกัน (รูด / ย่น) → ไม่นับเป็นข้อผิดพลาด
 *
 * ใช้ที่: components/pattern-studio/sew-view · lib/pattern-project · เทสต์ lib/__tests__/pattern-seams.test.ts
 * คู่มือ: docs/pattern-studio.md
 */
import { flattenShape, type Pt, type Shape } from "@/lib/pattern-shape";

export type PieceEdge = { i: number; pts: Pt[]; len: number };
export type SeamSide = { pid: string; from: number; count: number; n: number; t0?: number; t1?: number };
/** วิธีเย็บของตะเข็บ (ค่ารายตะเข็บแบบ CLO · 2026-11-10) — ตอนนี้เป็นข้อมูลที่จดไว้ + ออกในตารางตะเข็บของใบพิมพ์ ยังไม่มีผลกับภาพ 3D */
export type SeamKind = "turned" | "lapped" | "bound";
export const SEAM_KINDS: { key: SeamKind; th: string; en: string; hintTh: string; hintEn: string }[] = [
  { key: "turned", th: "เย็บกลับใน", en: "Turned seam", hintTh: "ประกบหน้าชนหน้า เย็บ แล้วกลับตะเข็บเข้าใน — ตะเข็บทั่วไปของตัวกระเป๋า", hintEn: "Right sides together, stitch, then turn the seam inside — the usual body seam" },
  { key: "lapped", th: "เย็บทับ", en: "Lapped seam", hintTh: "วางชิ้นหนึ่งทับอีกชิ้นแล้วเย็บจากด้านนอก — หู กระเป๋าแปะ ป้าย", hintEn: "One piece laid over the other and stitched from outside — handles, patch pockets, labels" },
  { key: "bound", th: "หุ้มขอบ", en: "Bound seam", hintTh: "ประกบขอบดิบสองชิ้นแล้วหุ้มด้วยกุ๊น", hintEn: "Raw edges together, wrapped with binding" },
];
/** เดินด้ายทับ: ห่างจากตะเข็บ/ขอบ (มม.) · จำนวนแถว · ฝีเข็มต่อนิ้ว */
export type SeamTop = { off: number; rows: 1 | 2; spi: number };
export const SEAM_TOP_DEFAULT: SeamTop = { off: 2, rows: 1, spi: 8 };
/** rev = ด้าน b เย็บกลับทิศ (จุดเริ่มของ b ไปชนจุดจบของ a) — ตอนนี้ใช้แสดงขีดบอกทิศบนกระดาน ยังไม่มีผลกับการประกอบ 3D */
export type Seam = { id: string; a: SeamSide; b: SeamSide; rev?: boolean; name?: string; kind?: SeamKind; top?: SeamTop; ease?: boolean };
/** ค่ารายขอบที่ไม่ใช่เผื่อเย็บ: กุ้นขอบ · เดินด้ายทับห่างจากขอบ (มม.) — เก็บเป็นรายการ 1 ค่าต่อขอบ (ครบทุกขอบ) */
export type EdgeMeta = { bind?: boolean; top?: number };
export type SeamStatus = "ok" | "mismatch" | "broken";
export type SeamCheck = { status: SeamStatus; la: number | null; lb: number | null; diff: number };

export const SEAM_TOL = 0.1;      // ซม. — ต่างกันไม่เกินนี้ถือว่าเท่ากัน
export const SEAM_MIN_LEN = 0.5;  // ซม. — ช่วงเย็บสั้นสุดที่ยอมให้สร้าง/ปรับ
export const MAX_SEAMS = 200;
const CURVE_STEPS = 32;

const lenOf = (P: Pt[]) => P.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - P[i][0], q[1] - P[i][1]), 0);

/** ขอบทั้งหมดของรูป (เรียงตามลำดับจุด · จุดของขอบรวมหัวท้าย) */
export function pieceEdges(shape: Shape): PieceEdge[] {
  if (shape.k === "ellipse") { const P = flattenShape(shape); const pts = [...P, P[0]]; return [{ i: 0, pts, len: lenOf(pts) }]; }
  if (shape.k === "rect") {
    const P = flattenShape(shape);
    return P.map((a, i) => { const pts: Pt[] = [a, P[(i + 1) % P.length]]; return { i, pts, len: lenOf(pts) }; });
  }
  const N = shape.nodes;
  return N.map((a, i) => {
    const b = N[(i + 1) % N.length];
    const pts: Pt[] = [[a.x, a.y]];
    if (a.ox || a.oy || b.ix || b.iy) {
      const x1 = a.x + (a.ox ?? 0), y1 = a.y + (a.oy ?? 0), x2 = b.x + (b.ix ?? 0), y2 = b.y + (b.iy ?? 0);
      for (let t = 1; t < CURVE_STEPS; t++) {
        const u = t / CURVE_STEPS, v = 1 - u;
        pts.push([v * v * v * a.x + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * b.x, v * v * v * a.y + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * b.y]);
      }
    }
    pts.push([b.x, b.y]);
    return { i, pts, len: lenOf(pts) };
  });
}

/** ด้านนี้เย็บแค่บางช่วง (มี t0/t1) */
export const isPartialSide = (side: SeamSide): boolean => side.t0 != null && side.t1 != null;
/** ตะเข็บนี้มีด้านที่เย็บบางช่วง → ไม่ใช้ในการประกอบทรงตามกติกา (lib/pattern-assembly) แต่ใช้ในภาพเย็บติด (lib/pattern-sewn) */
export const isPartialSeam = (seam: Seam): boolean => isPartialSide(seam.a) || isPartialSide(seam.b);

/** จุดของด้านตะเข็บแบบเต็มด้าน (ขอบที่ติดกันต่อเป็นเส้นเดียว · ไม่สนช่วง) · ใช้ไม่ได้แล้ว (จำนวนขอบเปลี่ยน / ลำดับเกิน) = null */
export function sideFullPoints(shape: Shape, side: SeamSide): Pt[] | null {
  const E = pieceEdges(shape);
  if (!E.length || E.length !== side.n || side.from < 0 || side.from >= E.length || side.count < 1 || side.count > E.length) return null;
  const out: Pt[] = [];
  for (let k = 0; k < side.count; k++) { const e = E[(side.from + k) % E.length]; out.push(...(k ? e.pts.slice(1) : e.pts)); }
  return out;
}
/** ช่วงของเส้น: จากระยะ t0 ถึง t1 (ซม. จากจุดเริ่ม ตามแนวเส้น) — รวมจุดหักของเส้นที่อยู่ในช่วง */
export function subLine(P: Pt[], t0: number, t1: number): Pt[] {
  const out: Pt[] = [];
  let acc = 0;
  for (let k = 1; k < P.length; k++) {
    const a = P[k - 1], b = P[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > 0 && acc + l >= t0 - 1e-9 && acc <= t1 + 1e-9) {
      const f0 = Math.max(0, (t0 - acc) / l), f1 = Math.min(1, (t1 - acc) / l);
      if (!out.length) out.push([a[0] + (b[0] - a[0]) * f0, a[1] + (b[1] - a[1]) * f0]);
      if (f1 > f0 + 1e-9) out.push([a[0] + (b[0] - a[0]) * f1, a[1] + (b[1] - a[1]) * f1]);
    }
    acc += l;
  }
  return out;
}
/** ช่วงที่เย็บจริงของด้าน (ตัดให้อยู่บนเส้นปัจจุบัน) + ความยาวเต็มของด้าน · ด้านใช้ไม่ได้แล้ว = null */
export function sideRange(shape: Shape, side: SeamSide): { t0: number; t1: number; full: number } | null {
  const P = sideFullPoints(shape, side);
  if (!P) return null;
  const full = lenOf(P);
  if (!isPartialSide(side)) return { t0: 0, t1: full, full };
  const t0 = Math.max(0, side.t0 as number), t1 = Math.min(full, side.t1 as number);
  return t1 - t0 < 0.05 ? null : { t0, t1, full };
}
/** จุดของด้านตะเข็บ (เฉพาะช่วงที่เย็บ ถ้าเย็บบางช่วง) · ใช้ไม่ได้แล้ว (จำนวนขอบเปลี่ยน / ลำดับเกิน / ช่วงหลุดจากขอบ) = null */
export function sidePoints(shape: Shape, side: SeamSide): Pt[] | null {
  const P = sideFullPoints(shape, side);
  if (!P || !isPartialSide(side)) return P;
  const r = sideRange(shape, side);
  if (!r) return null;
  const out = subLine(P, r.t0, r.t1);
  return out.length >= 2 ? out : null;
}
/** ระยะตามแนวเส้น (ซม. จากจุดเริ่ม) ของจุดบนเส้นที่ใกล้ p ที่สุด + ระยะห่างจากเส้น */
export function posOnLine(P: Pt[], p: Pt): { pos: number; d: number } {
  let best = { pos: 0, d: Infinity }, acc = 0;
  for (let k = 1; k < P.length; k++) {
    const a = P[k - 1], b = P[k], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
    const f = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    const d = Math.hypot(p[0] - (a[0] + dx * f), p[1] - (a[1] + dy * f));
    if (d < best.d) best = { pos: acc + l * f, d };
    acc += l;
  }
  return best;
}
/**
 * ช่วงที่ถูกเย็บไปแล้วบนขอบ i ของชิ้น (ซม. จากจุดเริ่มของขอบ) — ด้านเต็มขอบ / ด้านหลายขอบที่คลุมขอบนี้ = ทั้งขอบ
 * skip = ไม่นับด้านนี้ของตะเข็บนี้ (ตอนกำลังย้าย/ปรับช่วงของมันเอง)
 */
export function edgeBusy(seams: Seam[], pid: string, i: number, n: number, edgeLen: number, skip?: { id: string; which: "a" | "b" }): [number, number][] {
  const out: [number, number][] = [];
  for (const x of seams) for (const which of ["a", "b"] as const) {
    const s = x[which];
    if (s.pid !== pid || s.n !== n || !sideHasEdge(s, i) || (skip && skip.id === x.id && skip.which === which)) continue;
    if (s.count === 1 && isPartialSide(s)) out.push([Math.max(0, s.t0 as number), Math.min(edgeLen, s.t1 as number)]);
    else out.push([0, edgeLen]);
  }
  return out;
}
/** ช่วง a–b ไม่ทับกับช่วงที่ถูกเย็บไปแล้ว (ชนปลายกันพอดีได้) */
export const rangeFree = (busy: [number, number][], a: number, b: number): boolean => busy.every(([p, q]) => b <= p + 0.01 || a >= q - 0.01);
/** ด้าน 1 ขอบที่เย็บช่วง a–b ของขอบยาว len — คลุมทั้งขอบ = ด้านเต็มขอบ (ไม่มี t0/t1) */
export function rangedSide(pid: string, i: number, n: number, a: number, b: number, len: number): SeamSide {
  const t0 = Math.round(Math.max(0, a) * 100) / 100, t1 = Math.round(Math.min(len, b) * 100) / 100;
  return t0 <= 0.005 && t1 >= len - 0.005 ? { pid, from: i, count: 1, n } : { pid, from: i, count: 1, n, t0, t1 };
}
export function sideLength(shape: Shape, side: SeamSide): number | null { const P = sidePoints(shape, side); return P ? lenOf(P) : null; }

/** ขอบลำดับ i อยู่ในด้านนี้ไหม */
export function sideHasEdge(side: SeamSide, i: number): boolean {
  for (let k = 0; k < side.count; k++) if ((side.from + k) % side.n === i) return true;
  return false;
}

/**
 * ต่อขอบ i เข้ากับด้านที่กำลังเลือก (ชิ้นเดียวกัน) — รับเฉพาะขอบที่ติดกับปลายด้านใดด้านหนึ่ง (ตะเข็บต้องเป็นเส้นต่อเนื่อง)
 * คืนด้านใหม่ · ไม่ติดกัน/ซ้ำ = null
 */
export function extendSide(side: SeamSide, i: number): SeamSide | null {
  if (sideHasEdge(side, i) || side.count >= side.n) return null;
  if (i === (side.from + side.count) % side.n) return { ...side, count: side.count + 1 };
  if (i === (side.from - 1 + side.n) % side.n) return { ...side, from: i, count: side.count + 1 };
  return null;
}

/** ตรวจตะเข็บ: ความยาวสองด้านเท่ากันไหม · ชิ้นหาย/จำนวนขอบเปลี่ยน = broken */
export function checkSeam(shapes: Map<string, Shape> | Record<string, Shape>, seam: Seam, tol = SEAM_TOL): SeamCheck {
  const get = (pid: string) => (shapes instanceof Map ? shapes.get(pid) : shapes[pid]);
  const sa = get(seam.a.pid), sb = get(seam.b.pid);
  const la = sa ? sideLength(sa, seam.a) : null, lb = sb ? sideLength(sb, seam.b) : null;
  if (la == null || lb == null) return { status: "broken", la, lb, diff: 0 };
  const diff = Math.abs(la - lb);
  return { status: diff > tol ? "mismatch" : "ok", la, lb, diff };
}

/** ชื่อตะเข็บ A, B, … Z, AA, AB … */
export function seamLabel(i: number): string {
  let s = "", n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
function cleanSide(raw: unknown, pids: Set<string>): SeamSide | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pid = typeof r.pid === "string" ? r.pid : "", from = int(r.from), count = int(r.count), n = int(r.n);
  if (!pid || !pids.has(pid) || from == null || count == null || n == null) return null;
  if (n < 1 || n > 4000 || from < 0 || from >= n || count < 1 || count > n) return null;
  const t0 = fin(r.t0), t1 = fin(r.t1);
  if (t0 != null && t1 != null && t0 >= 0 && t1 - t0 >= 0.05 && t1 <= 5000) return { pid, from, count, n, t0: Math.round(t0 * 100) / 100, t1: Math.round(t1 * 100) / 100 };
  return { pid, from, count, n };
}
function fin(v: unknown): number | null { return typeof v === "number" && Number.isFinite(v) ? v : null; }
/** เดินด้ายทับที่ใช้ได้: ห่าง 0.5–30 มม. · 1–2 แถว · 2–20 ฝีเข็มต่อนิ้ว — ผิดรูปแบบ = ไม่มี */
export function cleanSeamTop(raw: unknown): SeamTop | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>, off = fin(r.off), spi = fin(r.spi);
  if (off == null || off < 0.5 || off > 30 || spi == null || spi < 2 || spi > 20) return null;
  return { off: Math.round(off * 10) / 10, rows: r.rows === 2 ? 2 : 1, spi: Math.round(spi * 10) / 10 };
}
/** ค่ารายขอบ (กุ้น / เดินด้ายทับ): ต้องครบทุกขอบและมีอย่างน้อย 1 ขอบที่ตั้งค่า ไม่งั้น = ไม่มี */
export function cleanEdgeMeta(shape: Shape, raw: unknown): EdgeMeta[] | null {
  if (!Array.isArray(raw) || raw.length !== pieceEdges(shape).length) return null;
  const out: EdgeMeta[] = raw.map((x) => {
    const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>, top = fin(r.top), m: EdgeMeta = {};
    if (r.bind === true) m.bind = true;
    if (top != null && top >= 0.5 && top <= 30) m.top = Math.round(top * 10) / 10;
    return m;
  });
  return out.some((m) => m.bind || m.top != null) ? out : null;
}
/** จุดบนเส้น ห่างจากจุดเริ่ม d (ซม.) ตามแนวเส้น — เกินความยาว = null */
export function pointAlong(P: Pt[], d: number): Pt | null {
  if (!(d >= 0) || P.length < 2) return null;
  let left = d;
  for (let k = 1; k < P.length; k++) {
    const l = Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
    if (left <= l + 1e-9 && l > 0) { const f = Math.min(1, left / l); return [P[k - 1][0] + (P[k][0] - P[k - 1][0]) * f, P[k - 1][1] + (P[k][1] - P[k - 1][1]) * f]; }
    left -= l;
  }
  return null;
}
/**
 * ตั้งความยาวของขอบด้วยตัวเลข — สี่เหลี่ยม: ขอบบน/ล่าง = กว้าง · ขอบข้าง = สูง · รูปจากจุด: ขอบตรงเท่านั้น (เลื่อนจุดปลายของขอบไปตามแนวเดิม)
 * ขอบโค้ง / วงรี / ค่าไม่สมเหตุผล = null (แก้ด้วยการลากจุดแทน)
 */
export function setEdgeLength(shape: Shape, i: number, len: number): Shape | null {
  if (!(len >= 0.2 && len <= 500)) return null;
  const L = Math.round(len * 1000) / 1000;
  if (shape.k === "rect") return i === 0 || i === 2 ? { ...shape, w: L } : i === 1 || i === 3 ? { ...shape, h: L } : null;
  if (shape.k !== "path") return null;
  const N = shape.nodes, a = N[i], j = (i + 1) % N.length, b = N[j];
  if (!a || !b || a.ox || a.oy || b.ix || b.iy) return null;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(d > 1e-6)) return null;
  const nx = Math.round((a.x + ((b.x - a.x) * L) / d) * 1000) / 1000, ny = Math.round((a.y + ((b.y - a.y) * L) / d) * 1000) / 1000;
  return { ...shape, nodes: N.map((q, k) => (k === j ? { ...q, x: nx, y: ny } : q)) };
}

/** ตรวจ/ทำความสะอาดตะเข็บจากหน้าจอหรือฐานข้อมูล — ด้านที่ชี้ชิ้นที่ไม่มีแล้ว หรือรูปแบบผิด = ทิ้งตะเข็บนั้น */
export function cleanSeams(raw: unknown, pids: Set<string>): Seam[] {
  if (!Array.isArray(raw)) return [];
  const out: Seam[] = [], seen = new Set<string>();
  for (const x of raw.slice(0, MAX_SEAMS)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const id = typeof r.id === "string" && /^[\w-]{1,40}$/.test(r.id) ? r.id : "";
    const a = cleanSide(r.a, pids), b = cleanSide(r.b, pids);
    if (!id || seen.has(id) || !a || !b) continue;
    seen.add(id);
    const seam: Seam = { id, a, b };
    if (r.rev === true) seam.rev = true;
    if (r.ease === true) seam.ease = true;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 60) : "";
    if (name) seam.name = name;
    if (SEAM_KINDS.some((k) => k.key === r.kind)) seam.kind = r.kind as SeamKind;
    const top = cleanSeamTop(r.top);
    if (top) seam.top = top;
    out.push(seam);
  }
  return out;
}
