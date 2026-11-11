/**
 * 🧷 ซิปและอะไหล่ของแพทเทิร์น (สูตรบริสุทธิ์ ไม่มีหน้าจอ ไม่แตะฐานข้อมูล) — เจ้าของสั่ง 2026-11-11 "ส่งซิปและอะไหล่ไปตีราคา"
 *
 *   ของที่ไม่ใช่ "ชิ้นที่ตัด" แต่ต้องอยู่ในต้นทุน: ซิป · สาย/เทป (คิดตามความยาว) · ห่วง ล็อก หมุด แม่เหล็ก (นับชิ้น)
 *   เก็บเป็นรายการของแพทเทิร์นทั้งใบ ในช่อง template.trims (ไม่มีตารางใหม่) — 1 แถว = วัสดุตีราคา 1 ตัว + จำนวนต่อกระเป๋า 1 ใบ
 *     • ซิปของช่องเจาะ: ผูกกับเส้นใน "ช่องเจาะ (ซิป)" ของชิ้น (src) → ยาว = ความยาวช่อง + เผื่อปลาย · จำนวน = จำนวนตัดของชิ้น
 *       แก้ความยาวช่องบนกระดาน ความยาวซิปเปลี่ยนตามเอง · ลบช่อง = แถวนี้หายตอนบันทึก
 *     • อะไหล่อื่น: ใส่เอง — วัสดุคิดตามยาว = ยาวต่อเส้น × จำนวน · วัสดุนับชิ้น = จำนวน
 *     • ซิปตามขอบ (เพิ่ม 2026-11-11): ขอบที่ติ๊ก "ติดซิปตามขอบนี้" (edgeMeta.zip) → ยาว = ความยาวขอบ + เผื่อ (ตั้งต้น 0) · จำนวนใส่เอง (ตั้งต้น 1 —
 *       ซิป 1 เส้นติดกับขอบของ 2 ชิ้น ให้ติ๊กขอบเดียว)
 *     • กุ๊น / หุ้มขอบ (เพิ่ม 2026-11-11): 1 แถวรวมทั้งใบ = ขอบที่ติ๊ก "กุ้นขอบ" (× จำนวนตัดของชิ้น) + ตะเข็บชนิด "หุ้มขอบ" (นับครั้งเดียว ใช้ด้านที่ยาวกว่า)
 *       ขอบที่อยู่ในตะเข็บหุ้มขอบทั้งขอบแล้ว ไม่นับซ้ำ · + เผื่อเพิ่มรวม (ซม.)
 *     • ซิป / กุ๊น เฉพาะบางช่วงของขอบ (EdgeMeta.zipR / bindR): ความยาว = ช่วงที่ตั้งไว้ ไม่ใช่ทั้งขอบ
 *     • อะไหล่ที่วางบนชิ้น (เพิ่ม 2026-11-11): เส้นในชนิด "อะไหล่" นับตามชนิด (ห่วง หมุดย้ำ ตัวล็อก กระดุมแม่เหล็ก ตาไก่) × จำนวนตัดของชิ้น → 1 แถวต่อชนิด (trim.hw) จำนวนตามกระดานเสมอ
 *   วิธีคิดเงิน (ตามยาว / นับชิ้น) ตามกลุ่มของวัสดุตีราคา (material_groups.calc_method) — จำไว้ในแถวตอนเลือก (mode)
 *
 *   planTrimsSend = รวมรายการเป็นบรรทัดตีราคา **1 วัสดุ = 1 บรรทัด** (รวมความยาว / จำนวนทั้งใบ)
 *     • บรรทัดเดิมจับคู่ด้วย วัสดุ + ป้ายในหมายเหตุ "[แพทเทิร์น <เลขที่>]" (บรรทัดอะไหล่ไม่มีรูปทรง จึงไม่มีรหัสชิ้นให้จับ)
 *       → ส่งซ้ำ = อัปเดตความยาว/จำนวน ราคาและหมายเหตุเดิมไม่เปลี่ยน · ลบป้ายในหมายเหตุออก = ส่งครั้งหน้าจะเพิ่มบรรทัดใหม่
 *     • **ไม่ลบบรรทัดไหนเลย** — บรรทัดที่มีป้ายแต่วัสดุไม่อยู่ในรายการแล้ว นับเป็น stale ให้ผู้ใช้ไปลบเอง
 *     • บรรทัดที่ผู้ใช้เพิ่มเองในตีราคา (ไม่มีป้าย) ไม่ถูกแตะ แม้เป็นวัสดุเดียวกัน
 *
 * ใช้ที่: app/api/pattern-projects/[id]/costing · components/pattern-studio/trims-modal · หน้าพิมพ์ · เทสต์ lib/__tests__/pattern-trims.test.ts
 */
import { costLineFromItem, recomputeCostLine, type CostItemLike } from "@/lib/design-sheet-cost-row";
import { HW_KINDS, cleanLineShape, hwKind, type HwKind, type Pt } from "@/lib/pattern-shape";
import { checkSeam, cleanEdgeMeta, finishRange, isPartialSide, pieceEdges, type Seam } from "@/lib/pattern-seams";
import type { CostingInsert, CostingUpdate, ExistingCostLine } from "@/lib/pattern-costing";
import type { ProjectPiece } from "@/lib/pattern-project";

/** วิธีคิด: length = ตามความยาว (ซิป สาย เทป) · count = นับชิ้น (ห่วง ล็อก หมุด) */
export type TrimMode = "length" | "count";
export type TrimMat = { id: string; name: string; mode: TrimMode };
export type ProjectTrim = {
  id: string;
  /** ป้ายที่ผู้ใช้ตั้ง เช่น "ห่วงหู" (ไม่ใส่ = ใช้ชื่อวัสดุ) */
  name?: string;
  mat: TrimMat;
  /** จำนวนต่อกระเป๋า 1 ใบ (เส้น / ตัว) — แถวที่ผูกกับช่องเจาะไม่ใช้ (ใช้จำนวนตัดของชิ้น) */
  qty: number;
  /** ยาวต่อเส้น ซม. (วัสดุคิดตามยาว) — แถวที่ผูกกับช่องเจาะไม่ใช้ (ใช้ความยาวช่อง) */
  len?: number;
  /** เผื่อ ซม.: ซิปของช่องเจาะ / ซิปตามขอบ = เผื่อปลายต่อเส้น · กุ๊น = เผื่อเพิ่มรวมทั้งใบ */
  extra?: number;
  /** ผูกกับเส้นใน "ช่องเจาะ" ของชิ้น */
  src?: { pid: string; line: string };
  /** ซิปตามขอบ: ผูกกับขอบที่ติ๊ก "ติดซิปตามขอบนี้" (i = ลำดับขอบ เริ่ม 0) */
  edge?: { pid: string; i: number };
  /** กุ๊น / หุ้มขอบ ทั้งใบ (มีได้แถวเดียว) */
  bind?: true;
  /** อะไหล่ที่วางบนชิ้น ชนิดนี้ทั้งใบ (1 แถวต่อชนิด · วัสดุนับชิ้น) — จำนวน = ที่วางบนกระดาน × จำนวนตัดของชิ้น */
  hw?: HwKind;
};
export const MAX_TRIMS = 40;
/** เผื่อปลายซิปตั้งต้น (ซม.) — ซิปยาวกว่าช่องข้างละราว 1 ซม. · แก้ได้รายแถว */
export const ZIP_EXTRA_DEFAULT = 2;
export const TRIM_MAX_QTY = 999, TRIM_MAX_LEN = 2000, TRIM_MAX_EXTRA = 50, BIND_MAX_EXTRA = 500;

const ID = /^[\w-]{1,40}$/;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const fin = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** วิธีคิดของกลุ่มวัสดุ → แบบที่ใช้เป็นซิป/อะไหล่ได้ (อย่างอื่น เช่น ผ้า หนัง = ไม่ใช่อะไหล่) */
export const trimModeOf = (calc: string | null | undefined): TrimMode | null => (calc === "length" ? "length" : calc === "count" ? "count" : null);

/** ตรวจรายการจากหน้าจอ/ฐานข้อมูล — แถวผิดรูปแบบ = ทิ้งแถวนั้น · ซ้ำ id / ผูกช่องเดียวกันซ้ำ = เก็บตัวแรก */
export function cleanTrims(raw: unknown): ProjectTrim[] {
  if (!Array.isArray(raw)) return [];
  const out: ProjectTrim[] = [], ids = new Set<string>(), srcs = new Set<string>();
  for (const x of raw) {
    if (out.length >= MAX_TRIMS) break;
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.id === "string" && ID.test(o.id) ? o.id : "";
    const m = o.mat as Record<string, unknown> | null | undefined;
    const mid = m && typeof m.id === "string" && m.id.length > 0 && m.id.length <= 60 ? m.id : "";
    const mname = m && typeof m.name === "string" ? m.name.trim().slice(0, 80) : "";
    const mode = m ? trimModeOf(typeof m.mode === "string" ? m.mode : null) : null;
    if (!id || ids.has(id) || !mid || !mname || !mode) continue;
    const t: ProjectTrim = { id, mat: { id: mid, name: mname, mode }, qty: 1 };
    const s = o.src as Record<string, unknown> | null | undefined;
    if (s && typeof s.pid === "string" && ID.test(s.pid) && typeof s.line === "string" && ID.test(s.line)) {
      if (mode !== "length") continue;                       // ช่องเจาะรับได้แต่วัสดุคิดตามยาว (ซิป)
      const key = `${s.pid}/${s.line}`;
      if (srcs.has(key)) continue;
      srcs.add(key);
      t.src = { pid: s.pid, line: s.line };
      const ex = fin(o.extra);
      t.extra = ex != null && ex >= 0 ? Math.min(TRIM_MAX_EXTRA, r1(ex)) : ZIP_EXTRA_DEFAULT;
    } else if (o.edge && typeof o.edge === "object" && typeof (o.edge as Record<string, unknown>).pid === "string" && ID.test((o.edge as { pid: string }).pid)
      && Number.isInteger((o.edge as Record<string, unknown>).i) && (o.edge as { i: number }).i >= 0 && (o.edge as { i: number }).i < 400) {
      if (mode !== "length") continue;                       // ซิปตามขอบ = วัสดุคิดตามยาว
      const e = o.edge as { pid: string; i: number }, key = `${e.pid}#${e.i}`;
      if (srcs.has(key)) continue;
      srcs.add(key);
      t.edge = { pid: e.pid, i: e.i };
      const ex = fin(o.extra), q = fin(o.qty);
      t.extra = ex != null && ex >= 0 ? Math.min(TRIM_MAX_EXTRA, r1(ex)) : 0;
      t.qty = q != null && q >= 1 ? Math.min(TRIM_MAX_QTY, Math.round(q)) : 1;
    } else if (typeof o.hw === "string" && HW_KINDS.some((k) => k.key === o.hw)) {
      if (mode !== "count" || srcs.has(`hw:${o.hw}`)) continue;   // อะไหล่บนชิ้น = วัสดุนับชิ้น · 1 แถวต่อชนิด
      srcs.add(`hw:${o.hw}`);
      t.hw = hwKind(o.hw);
    } else if (o.bind === true) {
      if (mode !== "length" || srcs.has("bind")) continue;   // กุ๊นมีได้แถวเดียว
      srcs.add("bind");
      t.bind = true;
      const ex = fin(o.extra);
      t.extra = ex != null && ex >= 0 ? Math.min(BIND_MAX_EXTRA, r1(ex)) : 0;
    } else {
      const q = fin(o.qty);
      t.qty = q != null && q >= 1 ? Math.min(TRIM_MAX_QTY, Math.round(q)) : 1;
      if (mode === "length") { const l = fin(o.len); if (l != null && l > 0) t.len = Math.min(TRIM_MAX_LEN, r1(l)); }
    }
    if (typeof o.name === "string" && o.name.trim()) t.name = o.name.trim().slice(0, 60);
    ids.add(id);
    out.push(t);
  }
  return out;
}

/** ช่องเจาะ (ซิป) 1 ช่องบนชิ้น */
export type SlitRef = { pid: string; line: string; piece: string; label: string; len: number; count: number };
const openLen = (P: Pt[]) => { let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L; };

/** ช่องเจาะทุกช่องของแพทเทิร์น (เรียงตามชิ้น) — ความยาว = ความยาวเส้น · จำนวน = จำนวนตัดของชิ้น */
export function slitList(pieces: ProjectPiece[]): SlitRef[] {
  const out: SlitRef[] = [];
  pieces.forEach((p, i) => {
    for (const l of p.inner ?? []) {
      if (l.kind !== "slit") continue;
      out.push({ pid: p.pid, line: l.id, piece: p.name || `ชิ้น ${i + 1}`, label: l.name || "ช่องซิป", len: r1(openLen(l.pts)), count: Math.max(1, p.count || 1) });
    }
  });
  return out;
}

/** ขอบที่ติ๊ก "ติดซิปตามขอบนี้" */
export type ZipEdgeRef = { pid: string; i: number; piece: string; label: string; /** ยาวของซิปบนขอบ (ทั้งขอบ หรือช่วงที่ตั้งไว้) */ len: number; /** ความยาวขอบทั้งเส้น — มีเมื่อซิปติดเฉพาะบางช่วง */ full?: number };
export function zipEdgeList(pieces: ProjectPiece[]): ZipEdgeRef[] {
  const out: ZipEdgeRef[] = [];
  pieces.forEach((p, k) => {
    const meta = cleanEdgeMeta(p.shape, p.edgeMeta);
    if (!meta) return;
    for (const e of pieceEdges(p.shape)) {
      if (!meta[e.i]?.zip) continue;
      const [a, b] = finishRange(meta[e.i], "zip", e.len), part = b - a < e.len - 0.01;
      out.push({ pid: p.pid, i: e.i, piece: p.name || `ชิ้น ${k + 1}`, label: `ขอบ ${e.i + 1}`, len: r1(b - a), ...(part ? { full: r1(e.len) } : {}) });
    }
  });
  return out;
}

/** กุ๊น / หุ้มขอบ ทั้งใบ: edges = จำนวนขอบที่กุ๊น (นับตามจำนวนตัด) · seams = ตะเข็บชนิดหุ้มขอบ · total = ความยาวรวม ซม. */
export type BindRuns = { edges: number; seams: number; total: number };
export function bindRuns(pieces: ProjectPiece[], seams: Seam[] = []): BindRuns {
  const out: BindRuns = { edges: 0, seams: 0, total: 0 };
  const shapes = new Map(pieces.map((p) => [p.pid, { shape: p.shape, inner: p.inner }]));
  const inSeam = new Set<string>();   // ขอบที่อยู่ในตะเข็บหุ้มขอบทั้งขอบ → ไม่นับซ้ำกับ "กุ้นขอบ" ของขอบ
  for (const s of seams) {
    if (s.kind !== "bound") continue;
    const c = checkSeam(shapes, s), len = Math.max(c.la ?? 0, c.lb ?? 0);
    if (!(len > 0)) continue;
    out.seams++; out.total += len;
    for (const side of [s.a, s.b]) if (!isPartialSide(side)) for (let k = 0; k < side.count; k++) inSeam.add(`${side.pid}#${(side.from + k) % side.n}`);
  }
  for (const p of pieces) {
    const meta = cleanEdgeMeta(p.shape, p.edgeMeta);
    if (!meta) continue;
    const n = Math.max(1, p.count || 1);
    for (const e of pieceEdges(p.shape)) if (meta[e.i]?.bind && !inSeam.has(`${p.pid}#${e.i}`)) { const [a, b] = finishRange(meta[e.i], "bind", e.len); out.edges += n; out.total += (b - a) * n; }
  }
  out.total = r1(out.total);
  return out;
}

/** อะไหล่ที่วางบนชิ้น นับตามชนิด (× จำนวนตัดของชิ้น) — เรียงตามลำดับชนิดใน HW_KINDS */
export type HwCount = { hw: HwKind; th: string; en: string; count: number };
export function hwCounts(pieces: ProjectPiece[]): HwCount[] {
  const n = new Map<HwKind, number>();
  for (const p of pieces) for (const l of p.inner ?? []) if (l.kind === "hw") { const k = hwKind(l.hw); n.set(k, (n.get(k) ?? 0) + Math.max(1, p.count || 1)); }
  return HW_KINDS.filter((k) => n.has(k.key)).map((k) => ({ hw: k.key, th: k.th, en: k.en, count: n.get(k.key)! }));
}

/** 1 แถวที่คิดเลขแล้ว — each = ยาวต่อเส้น (ซม. · เฉพาะตามยาว) · total = รวมทั้งใบ (ซม. หรือ ชิ้น) */
export type TrimRow = { trim: ProjectTrim; label: string; mode: TrimMode; each: number | null; qty: number; total: number; slit?: SlitRef; edge?: ZipEdgeRef; runs?: BindRuns; hw?: HwCount; gone?: true };

/** รายการ → แถวที่คิดเลขแล้ว (ซิปของช่องเจาะ / ซิปตามขอบ / กุ๊น อ่านความยาวจากชิ้นล่าสุด · ช่องถูกลบ ขอบเลิกติ๊ก = gone ยอด 0) */
export function trimRows(trims: ProjectTrim[], pieces: ProjectPiece[], seams: Seam[] = []): TrimRow[] {
  const slits = new Map(slitList(pieces).map((s) => [`${s.pid}/${s.line}`, s]));
  const edges = new Map(zipEdgeList(pieces).map((e) => [`${e.pid}#${e.i}`, e]));
  let runs: BindRuns | null = null;
  const hws = new Map(hwCounts(pieces).map((h) => [h.hw, h]));
  return trims.map((t) => {
    const mode = t.mat.mode;
    if (t.hw) {
      const h = hws.get(t.hw);
      if (!h) return { trim: t, label: t.name || t.mat.name, mode, each: null, qty: 0, total: 0, gone: true as const };
      return { trim: t, label: t.name || `${h.th} (วางบนชิ้น)`, mode, each: null, qty: h.count, total: h.count, hw: h };
    }
    if (t.edge) {
      const edge = edges.get(`${t.edge.pid}#${t.edge.i}`);
      if (!edge) return { trim: t, label: t.name || t.mat.name, mode, each: null, qty: 0, total: 0, gone: true as const };
      const each = r1(edge.len + (t.extra ?? 0));
      return { trim: t, label: t.name || `${edge.piece} · ${edge.label}`, mode, each, qty: t.qty, total: r1(each * t.qty), edge };
    }
    if (t.bind) {
      runs ??= bindRuns(pieces, seams);
      const parts = runs.edges + runs.seams;
      if (!parts) return { trim: t, label: t.name || "กุ๊น / หุ้มขอบ", mode, each: null, qty: 0, total: 0, gone: true as const };
      return { trim: t, label: t.name || "กุ๊น / หุ้มขอบ", mode, each: null, qty: parts, total: r1(runs.total + (t.extra ?? 0)), runs };
    }
    if (t.src) {
      const slit = slits.get(`${t.src.pid}/${t.src.line}`);
      if (!slit) return { trim: t, label: t.name || t.mat.name, mode, each: null, qty: 0, total: 0, gone: true as const };
      const each = r1(slit.len + (t.extra ?? ZIP_EXTRA_DEFAULT));
      return { trim: t, label: t.name || `${slit.piece} · ${slit.label}`, mode, each, qty: slit.count, total: r1(each * slit.count), slit };
    }
    if (mode === "length") { const each = t.len ?? 0; return { trim: t, label: t.name || t.mat.name, mode, each, qty: t.qty, total: r1(each * t.qty) }; }
    return { trim: t, label: t.name || t.mat.name, mode, each: null, qty: t.qty, total: t.qty };
  });
}

/** ช่องเจาะที่ยังไม่ได้เลือกซิป */
export function openSlits(trims: ProjectTrim[], pieces: ProjectPiece[]): SlitRef[] {
  const used = new Set(trims.filter((t) => t.src).map((t) => `${t.src!.pid}/${t.src!.line}`));
  return slitList(pieces).filter((s) => !used.has(`${s.pid}/${s.line}`));
}

/** ของที่ยังไม่ได้เลือกวัสดุ: ช่องซิป · ขอบที่ติดซิป · กุ๊น (มีขอบกุ๊นแต่ยังไม่เลือกเทป) — count = รวมกี่รายการ */
export type OpenTrims = { slits: SlitRef[]; edges: ZipEdgeRef[]; bind: BindRuns | null; /** อะไหล่บนชิ้นชนิดที่ยังไม่เลือกวัสดุ */ hw: HwCount[]; count: number };
export function openTrims(trims: ProjectTrim[], pieces: ProjectPiece[], seams: Seam[] = []): OpenTrims {
  const slits = openSlits(trims, pieces);
  const used = new Set(trims.filter((t) => t.edge).map((t) => `${t.edge!.pid}#${t.edge!.i}`));
  const edges = zipEdgeList(pieces).filter((e) => !used.has(`${e.pid}#${e.i}`));
  const runs = trims.some((t) => t.bind) ? null : bindRuns(pieces, seams);
  const bind = runs && runs.edges + runs.seams > 0 ? runs : null;
  const hw = hwCounts(pieces).filter((h) => !trims.some((t) => t.hw === h.hw));
  return { slits, edges, bind, hw, count: slits.length + edges.length + (bind ? 1 : 0) + hw.length };
}

/** ทิ้งแถวที่ของต้นทางหายไปแล้ว: ช่องเจาะถูกลบ · ขอบเลิกติดซิป · ไม่มีขอบกุ๊นเหลือ (เรียกตอนบันทึก) — ไม่มีอะไรทิ้ง = คืนตัวเดิม */
export function pruneTrims(trims: ProjectTrim[], pieces: ProjectPiece[], seams: Seam[] = []): ProjectTrim[] {
  const keep = trimRows(trims, pieces, seams).filter((r) => !r.gone).map((r) => r.trim);
  return keep.length === trims.length ? trims : keep;
}

/** รวมต่อวัสดุ (ทั้งใบ) — ไว้โชว์สรุปในหน้าจอ และเป็นฐานของบรรทัดตีราคา */
export type TrimTotal = { id: string; name: string; mode: TrimMode; total: number; parts: number };
export function trimTotals(rows: TrimRow[]): TrimTotal[] {
  const map = new Map<string, TrimTotal>();
  for (const r of rows) {
    if (r.gone || !(r.total > 0)) continue;
    const k = `${r.trim.mat.id}|${r.mode}`;
    const cur = map.get(k) ?? { id: r.trim.mat.id, name: r.trim.mat.name, mode: r.mode, total: 0, parts: 0 };
    cur.total = r1(cur.total + r.total); cur.parts += r.mode === "length" ? r.qty : 1;
    map.set(k, cur);
  }
  return [...map.values()];
}

/** ป้ายในหมายเหตุของบรรทัดตีราคา — ใช้จับคู่ตอนส่งซ้ำ */
export const trimMarker = (patternNo: string) => `[แพทเทิร์น ${patternNo}]`;
export const trimNote = (patternNo: string) => `${trimMarker(patternNo)} ซิป/อะไหล่`;

export type TrimPlanLine = { name: string; mode: TrimMode; total: number; parts: number; amount: number | null; action: "add" | "update" };
/** บรรทัดซิป/อะไหล่ใหม่ — เหมือนบรรทัดของชิ้น แต่ไม่มีรูปทรง */
export type TrimInsert = Omit<CostingInsert, "shape"> & { shape: null };
export type TrimPlan = {
  inserts: TrimInsert[]; updates: CostingUpdate[];
  /** บรรทัดที่จะเพิ่ม/อัปเดต (ไว้โชว์ก่อนกดส่ง) */
  lines: TrimPlanLine[];
  /** บรรทัดเดิมที่มีป้ายของแพทเทิร์นนี้ แต่วัสดุไม่อยู่ในรายการแล้ว (ไม่แตะ) */
  stale: number;
  /** วัสดุที่วิธีคิดในรายการวัสดุตีราคาเปลี่ยนไปแล้ว (ไม่ใช่ตามยาว/นับชิ้น หรือไม่ตรงกับตอนเลือก) — ไม่ส่ง */
  skipped: string[];
  /** วัสดุที่ไม่อยู่ในรายการวัสดุตีราคาแล้ว (ส่งเป็นชื่ออย่างเดียว ไม่มีราคา) */
  missingItems: string[];
  /** แถวที่ยังไม่ได้ใส่ความยาว (ยอด 0) — ไม่ส่ง */
  noQty: number;
  amount: number;
};

/**
 * รวมรายการซิป/อะไหล่เป็นบรรทัดตีราคา 1 วัสดุ = 1 บรรทัด แล้วเทียบกับบรรทัดเดิมของแท็บนั้น
 *   sortStart = ลำดับสุดท้ายที่ใช้ไปแล้ว (บรรทัดใหม่ต่อท้าย) · marker = trimMarker(เลขที่แพทเทิร์น)
 */
export function planTrimsSend(
  rows: TrimRow[], existing: ExistingCostLine[], parentCode: string | null, items: Map<string, CostItemLike>, patternNo: string, sortStart: number,
): TrimPlan {
  const plan: TrimPlan = { inserts: [], updates: [], lines: [], stale: 0, skipped: [], missingItems: [], noQty: 0, amount: 0 };
  const marker = trimMarker(patternNo);
  const pool = existing.filter((r) => (r.parent_code ?? "") === (parentCode ?? "") && !cleanLineShape(r.shape) && (r.note ?? "").includes(marker));
  const taken = new Set<string>();
  let sort = sortStart;
  plan.noQty = rows.filter((r) => !r.gone && !(r.total > 0)).length;

  for (const tot of trimTotals(rows)) {
    const it = items.get(tot.id);
    if (it && trimModeOf(it.calc_method) !== tot.mode) { if (!plan.skipped.includes(tot.name)) plan.skipped.push(tot.name); continue; }
    if (!it && !plan.missingItems.includes(tot.name)) plan.missingItems.push(tot.name);
    const size = tot.mode === "length" ? { length_cm: r2(tot.total) } : { pieces: tot.total };
    const hit = pool.find((r) => !taken.has(r.id) && (it ? r.item_id === tot.id : !r.item_id && r.item_name === tot.name));
    if (hit) {
      taken.add(hit.id);
      const next = recomputeCostLine({ ...hit, ...size, shape: null });
      plan.updates.push({ id: hit.id, patch: { ...size, qty: next.qty, amount: next.amount } });
      plan.lines.push({ name: tot.name, mode: tot.mode, total: tot.total, parts: tot.parts, amount: next.amount, action: "update" });
      plan.amount += next.amount ?? 0;
      continue;
    }
    const base = it
      ? (() => { const { sort_order: _s, ...b } = costLineFromItem(it, 0); void _s; return b; })()
      : { item_id: null, item_name: tot.name, group_name: null, group_code: null, calc_method: tot.mode as string | null, width_cm: null, length_cm: null, pieces: null,
          face_width_cm: null, waste_percent: null, divisor: null, qty: null, uom: tot.mode === "count" ? "ชิ้น" : null, unit_price: null, amount: null, note: null };
    const next = recomputeCostLine({ ...base, ...size, shape: null });
    plan.inserts.push({ ...next, note: trimNote(patternNo), parent_code: parentCode || null, sort_order: ++sort, shape: null });
    plan.lines.push({ name: tot.name, mode: tot.mode, total: tot.total, parts: tot.parts, amount: next.amount, action: "add" });
    plan.amount += next.amount ?? 0;
  }
  plan.stale = pool.filter((r) => !taken.has(r.id)).length;
  plan.amount = r2(plan.amount);
  return plan;
}
