/**
 * 📏 ขยายไซซ์ (Size grading · Bag CAD รอบ I2) — สูตรบริสุทธิ์ ไม่มีหน้าจอ
 *   ไซซ์ = รายชื่อ (เช่น S M L XL) + ไซซ์ตั้งต้น (= แบบที่วาดอยู่บนกระดาน ไม่ถูกแก้)
 *   กฎ (ต่อ 1 ไซซ์): กว้าง +dw · สูง +dh (ซม.) ขยายจากจุดยึด (กลางชิ้น / มุมซ้ายบน / กลางขอบล่าง)
 *                    + กฎรายจุด: จุดที่ n (นับตามลำดับรอบชิ้น เริ่ม 0) ขยับเพิ่ม dx, dy
 *   กฎกลาง (def) ใช้กับทุกชิ้นที่ไม่ได้ตั้งกฎเฉพาะ · ไซซ์ที่เล็กกว่าตั้งต้น = ขยับกลับทาง (step ติดลบ)
 *   เส้นใน · จุดบาก · รู · ทางผ้า ขยายตามสัดส่วนเดียวกับชิ้น (กฎรายจุดใช้กับเส้นนอกเท่านั้น)
 *
 * ใช้ที่: components/pattern-studio/grading-panel (ซ้อนดูทุกไซซ์ · ตรวจตะเข็บทุกไซซ์ · ไฟล์ทุกไซซ์)
 * เก็บใน template.grading ของแพทเทิร์น · เทสต์: lib/__tests__/pattern-grading.test.ts · คู่มือ: docs/pattern-studio.md (รอบ I2)
 */
import { pieceGeometry, shapeBox, toPathShape, type InnerLine, type Pt, type Shape } from "./pattern-shape";
import { checkSeam, seamLabel, type EdgeMeta, type Seam, type SeamPiece } from "./pattern-seams";
import { toCsv } from "./pattern-export";

export type GradeAnchor = "c" | "tl" | "bc";
export const GRADE_ANCHORS: { key: GradeAnchor; th: string; en: string }[] = [
  { key: "c", th: "กลางชิ้น", en: "Centre" }, { key: "tl", th: "มุมซ้ายบน", en: "Top-left" }, { key: "bc", th: "กลางขอบล่าง", en: "Bottom centre" },
];
export type PointRule = { n: number; dx: number; dy: number };
export type PieceGrade = { dw: number; dh: number; anchor?: GradeAnchor; pts?: PointRule[] };
export type GradeSpec = { sizes: string[]; base: number; def: PieceGrade; rules: Record<string, PieceGrade> };

export const GRADE_MAX_SIZES = 10;
export const DEFAULT_GRADING: GradeSpec = { sizes: ["S", "M", "L"], base: 1, def: { dw: 2, dh: 2, anchor: "c" }, rules: {} };

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 100) / 100 : null);
function cleanGrade(raw: unknown): PieceGrade | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const dw = num(r.dw, -50, 50) ?? 0, dh = num(r.dh, -50, 50) ?? 0;
  const out: PieceGrade = { dw, dh };
  if (r.anchor === "c" || r.anchor === "tl" || r.anchor === "bc") out.anchor = r.anchor;
  if (Array.isArray(r.pts)) {
    const pts = r.pts.flatMap((q): PointRule[] => {
      if (!q || typeof q !== "object") return [];
      const o = q as Record<string, unknown>, n = typeof o.n === "number" && Number.isInteger(o.n) && o.n >= 0 && o.n < 500 ? o.n : null;
      const dx = num(o.dx, -50, 50) ?? 0, dy = num(o.dy, -50, 50) ?? 0;
      return n == null || (dx === 0 && dy === 0) ? [] : [{ n, dx, dy }];
    }).slice(0, 40);
    if (pts.length) out.pts = pts;
  }
  return out;
}
/** ตรวจค่าไซซ์จากหน้าจอ/ฐานข้อมูล — ไซซ์ 2–10 ชื่อไม่ซ้ำ · ผิดรูปแบบ = null */
export function cleanGrading(raw: unknown): GradeSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.sizes)) return null;
  const sizes = [...new Set(r.sizes.filter((s): s is string => typeof s === "string").map((s) => s.trim().slice(0, 12)).filter(Boolean))].slice(0, GRADE_MAX_SIZES);
  if (sizes.length < 2) return null;
  const base = typeof r.base === "number" && Number.isInteger(r.base) && r.base >= 0 && r.base < sizes.length ? r.base : 0;
  const def = cleanGrade(r.def) ?? { dw: 0, dh: 0 };
  const rules: Record<string, PieceGrade> = {};
  if (r.rules && typeof r.rules === "object" && !Array.isArray(r.rules)) {
    for (const [pid, g] of Object.entries(r.rules as Record<string, unknown>).slice(0, 80)) {
      const c = cleanGrade(g);
      if (c && pid.length <= 40) rules[pid] = c;
    }
  }
  return { sizes, base, def, rules };
}

export const ruleFor = (spec: GradeSpec, pid: string): PieceGrade => spec.rules[pid] ?? spec.def;

/** ตัวแปลงจุดแบบสัดส่วนของชิ้นหนึ่ง ที่ไซซ์ห่างจากตั้งต้น step ขั้น (กว้าง/สูงไม่ต่ำกว่า 0.5 ซม.) */
export function gradeMap(box: { x: number; y: number; w: number; h: number }, g: PieceGrade, step: number): { f: (p: Pt) => Pt; sx: number; sy: number } {
  const nw = Math.max(0.5, box.w + g.dw * step), nh = Math.max(0.5, box.h + g.dh * step);
  const sx = box.w > 0 ? nw / box.w : 1, sy = box.h > 0 ? nh / box.h : 1;
  const a = g.anchor ?? "c";
  const ax = a === "tl" ? box.x : box.x + box.w / 2, ay = a === "tl" ? box.y : a === "bc" ? box.y + box.h : box.y + box.h / 2;
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  return { f: ([x, y]) => [r4(ax + (x - ax) * sx), r4(ay + (y - ay) * sy)], sx, sy };
}

function mapShape(s: Shape, f: (p: Pt) => Pt, sx: number, sy: number): Shape {
  if (s.k !== "path") { const [x0, y0] = f([s.x, s.y]), [x1, y1] = f([s.x + s.w, s.y + s.h]); return { ...s, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
  return { k: "path", nodes: s.nodes.map((n) => {
    const [x, y] = f([n.x, n.y]), o: typeof n = { ...n, x, y };
    if (n.ix != null || n.iy != null) { o.ix = (n.ix ?? 0) * sx; o.iy = (n.iy ?? 0) * sy; }
    if (n.ox != null || n.oy != null) { o.ox = (n.ox ?? 0) * sx; o.oy = (n.oy ?? 0) * sy; }
    return o;
  }) };
}

/** รูปเส้นนอกที่ไซซ์ห่างจากตั้งต้น step ขั้น */
export function gradeShape(s: Shape, g: PieceGrade, step: number): Shape {
  if (step === 0) return s;
  const { f, sx, sy } = gradeMap(shapeBox(s), g, step);
  const pts = g.pts?.length ? g.pts : null;
  const base = pts && s.k !== "path" ? toPathShape(s) : s;
  const out = mapShape(base, f, sx, sy);
  if (!pts || out.k !== "path") return out;
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  return { k: "path", nodes: out.nodes.map((n, i) => { const q = pts.find((p) => p.n === i); return q ? { ...n, x: r4(n.x + q.dx * step), y: r4(n.y + q.dy * step) } : n; }) };
}

type Gradable = { shape: Shape; holes?: Shape[] | null; grain?: Pt[] | null; notches?: Pt[] | null; inner?: InnerLine[] | null };
/** ชิ้นทั้งชิ้นที่ไซซ์ห่างจากตั้งต้น step ขั้น — รู/เส้นใน/จุดบาก/ทางผ้า ตามสัดส่วนของกรอบเส้นนอก */
export function gradePiece<T extends Gradable>(p: T, g: PieceGrade, step: number): T {
  if (step === 0) return p;
  const { f, sx, sy } = gradeMap(shapeBox(p.shape), g, step);
  const o = { ...p, shape: gradeShape(p.shape, g, step) } as T;
  if (p.holes) (o as Gradable).holes = p.holes.map((h) => mapShape(h, f, sx, sy));
  if (p.grain && p.grain.length === 2) (o as Gradable).grain = [f(p.grain[0]), f(p.grain[1])];
  if (p.notches?.length) (o as Gradable).notches = p.notches.map(f);
  if (p.inner?.length) (o as Gradable).inner = p.inner.map((l) => ({ ...l, pts: l.pts.map(f) }));
  return o;
}

/** ชิ้นของทุกไซซ์ (ไซซ์ตั้งต้น = ชิ้นเดิมทุกอย่าง) */
export function gradeSizes<T extends Gradable & { pid: string }>(pieces: T[], spec: GradeSpec): { size: string; step: number; pieces: T[] }[] {
  return spec.sizes.map((size, i) => { const step = i - spec.base; return { size, step, pieces: pieces.map((p) => gradePiece(p, ruleFor(spec, p.pid), step)) }; });
}

/** ตรวจตะเข็บทุกไซซ์: ขอบที่เย็บคู่กันยังยาวเท่ากันไหม (ตัวตรวจเดียวกับกระดาน) */
export function gradeSeamReport<T extends Gradable & { pid: string; edgeMeta?: EdgeMeta[] | null }>(pieces: T[], seams: Seam[], spec: GradeSpec, tol?: number): { size: string; step: number; ok: number; bad: { seam: string; name?: string; diff: number }[] }[] {
  return gradeSizes(pieces, spec).map(({ size, step, pieces: ps }) => {
    const shapes = new Map<string, SeamPiece>(ps.map((p) => [p.pid, { shape: p.shape, inner: p.inner ?? null, meta: p.edgeMeta ?? null }]));
    const bad: { seam: string; name?: string; diff: number }[] = [];
    let ok = 0;
    seams.forEach((s, i) => {
      const c = checkSeam(shapes, s, tol);
      if (c.status === "ok") ok++;
      else bad.push({ seam: seamLabel(i), ...(s.name ? { name: s.name } : {}), diff: Math.round(c.diff * 100) / 100 });
    });
    return { size, step, ok, bad };
  });
}

/** ตารางขนาดสำเร็จทุกไซซ์ (กว้าง × สูง · พื้นที่) */
export function gradeSizeRows<T extends Gradable & { pid: string; name?: string }>(pieces: T[], spec: GradeSpec): { pid: string; name: string; sizes: { w: number; h: number; area: number }[] }[] {
  const all = gradeSizes(pieces, spec);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return pieces.map((p, k) => ({
    pid: p.pid, name: p.name || `ชิ้น ${k + 1}`,
    sizes: all.map((s) => { const q = s.pieces[k], b = shapeBox(q.shape); return { w: r1(b.w), h: r1(b.h), area: r1(pieceGeometry({ shape: q.shape, holes: q.holes ?? [] }).finishedArea) }; }),
  }));
}
export function gradeSizeCsv<T extends Gradable & { pid: string; name?: string }>(pieces: T[], spec: GradeSpec, code = ""): string {
  const rows: (string | number)[][] = [["รหัสชิ้น", "ชื่อ", ...spec.sizes.flatMap((s, i) => [`${s}${i === spec.base ? " (ตั้งต้น)" : ""} กว้าง`, `${s} สูง`, `${s} พื้นที่ (ตร.ซม.)`]), "แพทเทิร์น"]];
  for (const r of gradeSizeRows(pieces, spec)) rows.push([r.pid, r.name, ...r.sizes.flatMap((z) => [z.w, z.h, z.area]), code]);
  return toCsv(rows);
}

export const GRADED_FILE_KIND = "erp-pattern-graded";
/** ไฟล์ทุกไซซ์ (.json): กฎ + ชิ้นของแต่ละไซซ์ + ตะเข็บ — เปิดดู/ส่งต่อโรงงาน · ไฟล์โปรเจกต์ปกติก็มีกฎไปด้วยอยู่แล้ว (template.grading) */
export function buildGradedFile<T extends Gradable & { pid: string }>(p: { pattern_no?: string | null; name: string; pieces: T[]; seams: Seam[] }, spec: GradeSpec, at = new Date()): string {
  return JSON.stringify({ kind: GRADED_FILE_KIND, v: 1, exported_at: at.toISOString(), pattern_no: p.pattern_no ?? null, name: p.name, grading: spec, seams: p.seams, sizes: gradeSizes(p.pieces, spec).map((s) => ({ size: s.size, step: s.step, base: s.step === 0, pieces: s.pieces })) }, null, 1);
}
