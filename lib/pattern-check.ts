/**
 * 🩺 ตรวจแบบก่อนผลิต (ของกลางของสตูดิโอแพทเทิร์น · Bag CAD รอบ B · 2026-11-12)
 *   ตรวจจากข้อมูลจริงของชิ้น/ตะเข็บ ไม่ใช่จากข้อความในหน้าจอ — ใช้ทั้งแผง "ตรวจแบบ" ข้างกระดาน และด่าน "ตรวจก่อนพิมพ์/ส่งไฟล์ตัด"
 *   ระดับ: error = ต้องแก้ก่อนเป็นไฟล์ผลิต · warn = ควรดู (พิมพ์ได้) · info = รับรู้ (เช่น ตั้งใจให้รูด)
 *   สิ่งที่ตรวจ:
 *     ตะเข็บ: อ้างขอบที่เปลี่ยนไปแล้ว (ต้องเลือกขอบใหม่) · สองด้านยาวต่างเกินค่าคลาด (ค่าเริ่ม 0.5 มม. ตั้งต่อแพทเทิร์นได้) · ตั้งใจรูด
 *     ขอบที่ยังไม่ได้เย็บ ของชิ้นที่เย็บแล้ว — ไม่นับขอบที่ติ๊ก "ขอบเปิดตั้งใจ" / ขอบพับ / ติดซิป / กุ๊น (ปากกระเป๋าเปิดได้ ไม่ใช่ error)
 *     รูปชิ้น: เส้นเย็บ/เส้นตัดตัดกันเอง · รูหลุดหรือคร่อมเส้นเย็บ · รูชิดเส้นเย็บเกิน · ขอบสั้นผิดปกติ (จุดซ้ำ)
 *     ข้อมูลผลิต: ยังไม่เลือกวัสดุ · ยังไม่ตั้งชื่อชิ้น
 *   ข้อความมีตัวเลขความยาว → ส่งตัวแปลงหน่วยมาที่ describeIssue (แสดงตามหน่วยที่ผู้ใช้เลือก)
 * ใช้ที่: components/pattern-studio (แผงตรวจแบบ) · app/pattern-studio/[id]/editor (ด่านก่อนพิมพ์) · เทสต์ lib/__tests__/pattern-check.test.ts
 */
import { checkSeam, isInnerSide, pieceEdges, seamLabel, sidePoints, type EdgeMeta, type Seam } from "./pattern-seams";
import { flattenShape, pieceGeometry, pointInPolygon, type InnerLine, type Pt, type Shape } from "./pattern-shape";

/** ค่าคลาดตะเข็บตั้งต้น (ซม.) = 0.5 มม. — ค่าทดลอง ไม่ใช่มาตรฐานโรงงาน ปรับต่อแพทเทิร์นได้ */
export const DEFAULT_SEAM_TOL = 0.05;
export const SEAM_TOL_CHOICES = [0.05, 0.1, 0.2, 0.5] as const;
/** ขอบสั้นกว่านี้ (ซม.) = น่าจะเป็นจุดซ้ำ */
export const MIN_EDGE = 0.2;
/** รูควรห่างเส้นเย็บอย่างน้อยเท่านี้ (ซม.) ไม่งั้นจักรเย็บ/เดินด้ายทับชนรู */
export const HOLE_CLEAR = 0.5;
/** รอยบากคู่ของตะเข็บคลาดกันได้ไม่เกินนี้ (ซม.) */
export const NOTCH_TOL = 0.2;
const polyLen = (P: Pt[]) => P.reduce((m, p, k) => (k ? m + Math.hypot(p[0] - P[k - 1][0], p[1] - P[k - 1][1]) : 0), 0);
/** ระยะของรอยบากตามแนวด้านของตะเข็บ (นับจากต้นด้าน) — เฉพาะรอยบากที่อยู่บนด้านนี้ (ห่างไม่เกิน 0.3 ซม.) */
function notchPositions(P: Pt[], notches: Pt[]): number[] {
  const out: number[] = [];
  for (const q of notches) {
    let best = Infinity, at = 0, acc = 0;
    for (let k = 1; k < P.length; k++) {
      const a = P[k - 1], b = P[k], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
      const t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)) : 0;
      const d = Math.hypot(a[0] + dx * t - q[0], a[1] + dy * t - q[1]);
      if (d < best) { best = d; at = acc + L * t; }
      acc += L;
    }
    if (best <= 0.3) out.push(at);
  }
  return out.sort((x, y) => x - y);
}
/** ขอบที่ยังไม่ได้เย็บยาวไม่ถึงนี้ (ซม.) = ไม่นับ (เศษปลายตะเข็บ) */
const OPEN_MIN = 0.3;

export function cleanSeamTol(raw: unknown): number {
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0.01 && v <= 1 ? Math.round(v * 1000) / 1000 : DEFAULT_SEAM_TOL;
}

export type CheckPiece = {
  pid: string; name: string; count?: number; shape: Shape; holes?: Shape[]; inner?: InnerLine[] | null;
  allow?: number; allowEdges?: number[] | null; foldEdges?: number[] | null; edgeMeta?: EdgeMeta[] | null; mats?: { id: string }[];
  /** รอยบาก (จุดบนเส้นเย็บ) — ใช้ตรวจรอยบากคู่ของตะเข็บ (รอบ E) */ notches?: Pt[] | null;
};
export type CheckLevel = "error" | "warn" | "info";
export type CheckCode = "seam-broken" | "seam-mismatch" | "seam-eased" | "notch-mismatch" | "edge-open" | "self-cross" | "cut-cross" | "hole-out" | "hole-near" | "short-edge" | "no-material" | "no-name";
export type CheckIssue = {
  id: string; level: CheckLevel; code: CheckCode;
  /** ชิ้นที่เกี่ยว (ตัวแรก = ชิ้นหลักที่ควรเลือกให้ดู) */ pids: string[];
  /** ขอบที่เกี่ยว (ดัชนีขอบของ pids[0]) */ edges?: number[];
  seamId?: string;
  data: Record<string, number | string>;
};
export type CheckSummary = { errors: number; warns: number; infos: number };
export const summarize = (list: CheckIssue[]): CheckSummary => ({ errors: list.filter((x) => x.level === "error").length, warns: list.filter((x) => x.level === "warn").length, infos: list.filter((x) => x.level === "info").length });

const pieceName = (p: CheckPiece, i: number) => p.name?.trim() || `P${i + 1}`;

/* ── เรขาคณิต ── */
const orient = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function segCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) return false;
  const e = 1e-9, o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  return ((o1 > e && o2 < -e) || (o1 < -e && o2 > e)) && ((o3 > e && o4 < -e) || (o3 < -e && o4 > e));
}
/** เส้นรอบรูปปิดตัดกันเองไหม (ไม่นับขอบที่ติดกัน) — จุดเยอะมากสุ่มลดจุดก่อน กันช้า */
export function selfCrosses(P0: Pt[]): boolean {
  let P = P0.filter((p, i) => i === 0 || Math.hypot(p[0] - P0[i - 1][0], p[1] - P0[i - 1][1]) > 1e-6);
  if (P.length > 1 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1e-6) P = P.slice(0, -1);
  if (P.length > 1200) { const k = Math.ceil(P.length / 1200); P = P.filter((_, i) => i % k === 0); }
  const n = P.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segCross(a, b, P[j], P[(j + 1) % n])) return true;
    }
  }
  return false;
}
function distSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function minDistToOutline(H: Pt[], P: Pt[]): number {
  let m = Infinity;
  for (const h of H) for (let i = 0; i < P.length; i++) { const d = distSeg(h, P[i], P[(i + 1) % P.length]); if (d < m) m = d; }
  return m;
}

/** ผลตรวจรูปชิ้น (จำต่อรูป — รูปไม่เปลี่ยน = ไม่คิดใหม่) */
type GeoResult = { selfCross: boolean; cutCross: boolean; holeOut: number[]; holeNear: { i: number; d: number }[]; short: number[] };
const geoCache = new WeakMap<Shape, { key: string; r: GeoResult }>();
function geoCheck(p: CheckPiece): GeoResult {
  const key = JSON.stringify([p.holes ?? [], p.allow ?? 0, p.allowEdges ?? null]);
  const hit = geoCache.get(p.shape);
  if (hit && hit.key === key) return hit.r;
  const sew = flattenShape(p.shape);
  let cutCross = false;
  try { const g = pieceGeometry({ shape: p.shape, holes: p.holes ?? [], allow: p.allow ?? 0, allowEdges: p.allowEdges ?? null }); cutCross = (p.allow ?? 0) > 0 || (p.allowEdges ?? []).some((v) => v > 0) ? selfCrosses(g.cut) : false; } catch { cutCross = false; }
  const holeOut: number[] = [], holeNear: { i: number; d: number }[] = [];
  (p.holes ?? []).forEach((h, i) => {
    const H = flattenShape(h);
    if (!H.every((q) => pointInPolygon(q, sew))) { holeOut.push(i); return; }
    const d = minDistToOutline(H, sew);
    if (d < HOLE_CLEAR) holeNear.push({ i, d });
  });
  const short = pieceEdges(p.shape).filter((e) => e.len < MIN_EDGE).map((e) => e.i);
  const r: GeoResult = { selfCross: selfCrosses(sew), cutCross, holeOut, holeNear, short };
  geoCache.set(p.shape, { key, r });
  return r;
}

/** ช่วงที่ถูกเย็บบนแต่ละขอบของชิ้น (ซม. จากต้นขอบ) — ด้านที่อ้างขอบผิดจำนวน (broken) ไม่นับ */
function coveredRanges(p: CheckPiece, seams: Seam[]): [number, number][][] {
  const E = pieceEdges(p.shape), out: [number, number][][] = E.map(() => []);
  for (const s of seams) for (const side of [s.a, s.b]) {
    if (side.pid !== p.pid || isInnerSide(side) || side.n !== E.length) continue;
    const edges: number[] = [];
    for (let k = 0; k < Math.min(side.count, E.length); k++) edges.push((side.from + k) % E.length);
    const ranged = side.t0 != null && side.t1 != null;
    let off = 0;
    for (const i of edges) {
      const L = E[i].len;
      if (!ranged) out[i].push([0, L]);
      else { const s0 = Math.max(side.t0!, off) - off, s1 = Math.min(side.t1!, off + L) - off; if (s1 - s0 > 1e-6) out[i].push([s0, s1]); }
      off += L;
    }
  }
  return out;
}
const uncovered = (ranges: [number, number][], L: number): number => {
  const r = [...ranges].sort((a, b) => a[0] - b[0]);
  let at = 0, open = 0;
  for (const [a, b] of r) { if (a > at) open += a - at; at = Math.max(at, b); }
  return open + Math.max(0, L - at);
};

/** ตรวจทั้งแพทเทิร์น — tol = ค่าคลาดตะเข็บ (ซม.) */
export function checkPattern(pieces: CheckPiece[], seams: Seam[], opts: { tol?: number } = {}): CheckIssue[] {
  const tol = opts.tol ?? DEFAULT_SEAM_TOL;
  const out: CheckIssue[] = [];
  const idx = new Map(pieces.map((p, i) => [p.pid, i]));
  const shapes = new Map(pieces.map((p) => [p.pid, { shape: p.shape, inner: p.inner ?? null }]));
  // ตะเข็บ
  seams.forEach((s, i) => {
    if (!idx.has(s.a.pid) || !idx.has(s.b.pid)) return;
    const c = checkSeam(shapes, s, tol), label = s.name?.trim() || seamLabel(i);
    const pa = pieces[idx.get(s.a.pid)!], pb = pieces[idx.get(s.b.pid)!];
    const names = { label, a: pieceName(pa, idx.get(s.a.pid)!), b: pieceName(pb, idx.get(s.b.pid)!) };
    const edges = isInnerSide(s.a) ? undefined : Array.from({ length: Math.min(s.a.count, s.a.n) }, (_, k) => (s.a.from + k) % Math.max(1, s.a.n));
    if (c.status === "broken") out.push({ id: `sb:${s.id}`, level: "error", code: "seam-broken", pids: [s.a.pid, s.b.pid], seamId: s.id, data: names });
    else if (c.status === "mismatch") out.push({ id: `sm:${s.id}`, level: s.ease ? "info" : "error", code: s.ease ? "seam-eased" : "seam-mismatch", pids: [s.a.pid, s.b.pid], edges, seamId: s.id, data: { ...names, la: c.la ?? 0, lb: c.lb ?? 0, diff: c.diff, tol } });
    // เดินตะเข็บ (Walk seam): รอยบากสองด้านต้องมีจำนวนเท่ากันและอยู่ระยะเดียวกันตามแนวเย็บ (ด้านที่กลับทิศ = นับจากปลาย)
    if (c.status !== "broken" && !isInnerSide(s.a) && !isInnerSide(s.b) && (pa.notches?.length || pb.notches?.length)) {
      const PA = sidePoints(pa.shape, s.a), PB = sidePoints(pb.shape, s.b);
      if (PA && PB) {
        const na = notchPositions(PA, pa.notches ?? []), nbRaw = notchPositions(PB, pb.notches ?? []), Lb = polyLen(PB);
        const nb = (s.rev ? nbRaw.map((v) => Lb - v) : nbRaw).sort((x, y) => x - y);
        const lim = Math.max(tol, NOTCH_TOL);
        if (na.length !== nb.length) out.push({ id: `nt:${s.id}`, level: "warn", code: "notch-mismatch", pids: [s.a.pid, s.b.pid], edges, seamId: s.id, data: { ...names, na: na.length, nb: nb.length, d: 0 } });
        else { const worst = na.reduce((m, v, k) => Math.max(m, Math.abs(v - nb[k])), 0); if (worst > lim) out.push({ id: `nt:${s.id}`, level: "warn", code: "notch-mismatch", pids: [s.a.pid, s.b.pid], edges, seamId: s.id, data: { ...names, na: na.length, nb: nb.length, d: worst } }); }
      }
    }
  });
  // ขอบที่ยังไม่ได้เย็บ (เฉพาะชิ้นที่มีตะเข็บบนขอบแล้ว)
  pieces.forEach((p, pi) => {
    const has = seams.some((s) => [s.a, s.b].some((x) => x.pid === p.pid && !isInnerSide(x)));
    if (!has) return;
    const E = pieceEdges(p.shape), cov = coveredRanges(p, seams), open: number[] = [];
    E.forEach((e, i) => {
      const m = p.edgeMeta?.[i];
      if (m?.open || (m?.zip && !m.zipR) || (m?.bind && !m.bindR) || (p.foldEdges?.[i] ?? 0) > 0) return;
      if (uncovered(cov[i], e.len) >= OPEN_MIN) open.push(i);
    });
    if (open.length) out.push({ id: `eo:${p.pid}`, level: "warn", code: "edge-open", pids: [p.pid], edges: open, data: { piece: pieceName(p, pi), list: open.map((i) => i + 1).join(", "), n: open.length } });
  });
  // รูปชิ้น + ข้อมูลผลิต
  pieces.forEach((p, pi) => {
    const g = geoCheck(p), piece = pieceName(p, pi);
    if (g.selfCross) out.push({ id: `sx:${p.pid}`, level: "error", code: "self-cross", pids: [p.pid], data: { piece } });
    else if (g.cutCross) out.push({ id: `cx:${p.pid}`, level: "error", code: "cut-cross", pids: [p.pid], data: { piece } });
    for (const i of g.holeOut) out.push({ id: `ho:${p.pid}:${i}`, level: "error", code: "hole-out", pids: [p.pid], data: { piece, hole: i + 1 } });
    for (const h of g.holeNear) out.push({ id: `hn:${p.pid}:${h.i}`, level: "warn", code: "hole-near", pids: [p.pid], data: { piece, hole: h.i + 1, d: h.d, min: HOLE_CLEAR } });
    if (g.short.length) out.push({ id: `se:${p.pid}`, level: "warn", code: "short-edge", pids: [p.pid], edges: g.short, data: { piece, list: g.short.map((i) => i + 1).join(", "), min: MIN_EDGE } });
    if (p.mats && !p.mats.length) out.push({ id: `nm:${p.pid}`, level: "warn", code: "no-material", pids: [p.pid], data: { piece } });
    if (!p.name?.trim()) out.push({ id: `nn:${p.pid}`, level: "info", code: "no-name", pids: [p.pid], data: { piece } });
  });
  const order: Record<CheckLevel, number> = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** ข้อความของปัญหา (ไทย/อังกฤษ) — L = แปลง ซม. เป็นข้อความตามหน่วยที่เลือก เช่น (cm) => "7 มม." */
export function describeIssue(x: CheckIssue, L: (cm: number) => string): { th: string; en: string } {
  const d = x.data, n = (k: string) => Number(d[k] ?? 0), s = (k: string) => String(d[k] ?? "");
  switch (x.code) {
    case "seam-broken": return { th: `ตะเข็บ ${s("label")} (${s("a")} ↔ ${s("b")}) อ้างขอบที่เปลี่ยนไปแล้ว — ต้องเลือกขอบใหม่`, en: `Seam ${s("label")} (${s("a")} ↔ ${s("b")}) points at edges that changed — reselect the edges` };
    case "seam-mismatch": return { th: `ตะเข็บ ${s("label")}: ${s("a")} ${L(n("la"))} กับ ${s("b")} ${L(n("lb"))} ต่างกัน ${L(n("diff"))} (เกินค่าคลาด ${L(n("tol"))}) — แก้ความยาว หรือติ๊ก "ตั้งใจให้ย่น" ถ้าตั้งใจรูด`, en: `Seam ${s("label")}: ${s("a")} ${L(n("la"))} vs ${s("b")} ${L(n("lb"))}, ${L(n("diff"))} apart (tolerance ${L(n("tol"))}) — fix the length, or mark it eased if the gather is intended` };
    case "notch-mismatch": return n("na") !== n("nb")
      ? { th: `ตะเข็บ ${s("label")}: รอยบาก ${s("a")} ${n("na")} จุด แต่ ${s("b")} ${n("nb")} จุด — ตอนเย็บจะจับคู่ไม่ได้`, en: `Seam ${s("label")}: ${s("a")} has ${n("na")} notch(es), ${s("b")} has ${n("nb")} — they won't line up when sewing` }
      : { th: `ตะเข็บ ${s("label")}: รอยบากสองด้านห่างกัน ${L(n("d"))} ตามแนวเย็บ — ย้ายให้ตรงกัน`, en: `Seam ${s("label")}: the notches are ${L(n("d"))} apart along the seam — move them to match` };
    case "seam-eased": return { th: `ตะเข็บ ${s("label")}: ตั้งใจรูด ${L(n("diff"))}`, en: `Seam ${s("label")}: eased by ${L(n("diff"))} on purpose` };
    case "edge-open": return { th: `${s("piece")}: ขอบ ${s("list")} ยังไม่ได้เย็บ — ถ้าเป็นปากกระเป๋า/ช่องล้วง ให้ตั้งเป็น "ขอบเปิดตั้งใจ"`, en: `${s("piece")}: edge ${s("list")} not sewn — if it's a bag mouth or opening, mark it as an intended opening` };
    case "self-cross": return { th: `${s("piece")}: เส้นเย็บตัดกันเอง — แก้จุดที่ไขว้กันก่อนเป็นไฟล์ผลิต`, en: `${s("piece")}: the sew line crosses itself — fix the crossing points before production` };
    case "cut-cross": return { th: `${s("piece")}: เส้นตัด (รวมเผื่อเย็บ) ตัดกันเอง — ลดเผื่อเย็บตรงมุมแคบ หรือแก้รูปชิ้น`, en: `${s("piece")}: the cut line (with allowance) crosses itself — reduce the allowance at tight corners or reshape` };
    case "hole-out": return { th: `${s("piece")}: รูที่ ${s("hole")} หลุดหรือคร่อมเส้นเย็บ`, en: `${s("piece")}: hole ${s("hole")} sits outside or across the sew line` };
    case "hole-near": return { th: `${s("piece")}: รูที่ ${s("hole")} ห่างเส้นเย็บ ${L(n("d"))} — น้อยกว่า ${L(n("min"))} จักรเย็บอาจชนรู`, en: `${s("piece")}: hole ${s("hole")} is ${L(n("d"))} from the sew line — under ${L(n("min"))}, the stitching may hit it` };
    case "short-edge": return { th: `${s("piece")}: ขอบ ${s("list")} สั้นไม่ถึง ${L(n("min"))} (น่าจะเป็นจุดซ้ำ)`, en: `${s("piece")}: edge ${s("list")} is under ${L(n("min"))} (probably a duplicate point)` };
    case "no-material": return { th: `${s("piece")}: ยังไม่เลือกวัสดุ — ใบตัดและตีราคาจะขาดชิ้นนี้`, en: `${s("piece")}: no material yet — the cut list and costing will miss it` };
    case "no-name": return { th: `${s("piece")}: ยังไม่ได้ตั้งชื่อชิ้น`, en: `${s("piece")}: piece has no name yet` };
  }
}
