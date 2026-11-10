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
 *
 * ใช้ที่: components/pattern-studio/sew-view · lib/pattern-project · เทสต์ lib/__tests__/pattern-seams.test.ts
 * คู่มือ: docs/pattern-studio.md
 */
import { flattenShape, type Pt, type Shape } from "@/lib/pattern-shape";

export type PieceEdge = { i: number; pts: Pt[]; len: number };
export type SeamSide = { pid: string; from: number; count: number; n: number };
/** rev = ด้าน b เย็บกลับทิศ (จุดเริ่มของ b ไปชนจุดจบของ a) — ตอนนี้ใช้แสดงขีดบอกทิศบนกระดาน ยังไม่มีผลกับการประกอบ 3D */
export type Seam = { id: string; a: SeamSide; b: SeamSide; rev?: boolean };
export type SeamStatus = "ok" | "mismatch" | "broken";
export type SeamCheck = { status: SeamStatus; la: number | null; lb: number | null; diff: number };

export const SEAM_TOL = 0.1;      // ซม. — ต่างกันไม่เกินนี้ถือว่าเท่ากัน
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

/** จุดของด้านตะเข็บ (ขอบที่ติดกันต่อเป็นเส้นเดียว) · ใช้ไม่ได้แล้ว (จำนวนขอบเปลี่ยน / ลำดับเกิน) = null */
export function sidePoints(shape: Shape, side: SeamSide): Pt[] | null {
  const E = pieceEdges(shape);
  if (!E.length || E.length !== side.n || side.from < 0 || side.from >= E.length || side.count < 1 || side.count > E.length) return null;
  const out: Pt[] = [];
  for (let k = 0; k < side.count; k++) { const e = E[(side.from + k) % E.length]; out.push(...(k ? e.pts.slice(1) : e.pts)); }
  return out;
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
  return { pid, from, count, n };
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
    seen.add(id); out.push(r.rev === true ? { id, a, b, rev: true } : { id, a, b });
  }
  return out;
}
