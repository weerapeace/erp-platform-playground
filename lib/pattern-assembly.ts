/**
 * 🧩 ประกอบชิ้นแพทเทิร์นเป็นกระเป๋า 3D จากตะเข็บ — สูตรบริสุทธิ์ ไม่มีหน้าจอ · สตูดิโอแพทเทิร์น รอบ 3 (เจ้าของสั่ง 2026-11-10 "ประกอบเป็น 3D")
 *
 *   เป็นการ "ประกอบทรงตามกติกา" ไม่ใช่การจำลองวัสดุ: ระบบอ่านตะเข็บแล้วหาโครงสร้างที่เข้าใจ 2 แบบ
 *     wrap  = ตัวหน้า + ตัวหลัง (แผ่นขนานกัน) + ชิ้นคั่นกลาง ("ชิ้นสะพาน" เช่น ข้าง+ก้นชิ้นเดียว หรือ ข้าง/ก้นแยกชิ้น)
 *             ชิ้นสะพาน = ชิ้น 4 ขอบที่ขอบตรงข้ามกัน 2 ขอบถูกเย็บกับตัวหน้า/ตัวหลัง → ความลึกกระเป๋า = ระยะระหว่าง 2 ขอบนั้น
 *             ขอบของตัวหน้าที่เย็บกับชิ้นสะพาน ถูก "ลากข้ามความลึก" เป็นผิวข้าง/ก้น · ขอบที่ไม่ได้เย็บ = ปากกระเป๋า (หันขึ้น)
 *     pouch = ไม่มีชิ้นสะพาน: สองแผ่นเย็บขอบติดกันตรง ๆ (ซองแบน)
 *   ถ้าเลือกแกนได้หลายแบบ (เช่น ทรงกล่องก้นเหลี่ยม) เลือกแบบที่ "แผ่นหน้า" ใหญ่ที่สุด และแผ่นที่มีหูติดอยู่ก่อน
 *   หู / แผ่นหลังช่องโชว์ ไม่ได้เย็บขอบชนขอบ → ใช้ "จุดติด" (Attach) ที่ได้จากแม่แบบทรง
 *   โครงสร้างที่ไม่เข้ากติกา = ok:false พร้อมเหตุผล (หน้าจอบอกตรง ๆ ว่าประกอบไม่ได้ — ไม่วาดภาพหลอก)
 *   ชั้นของชิ้น: layer "lining" = ซับใน — ประกอบแยกจากตัวนอก (assemble(…, "lining")) · ตะเข็บข้ามชั้น (เช่น ปากซับในกับปากตัวนอก) ไม่ใช้หาโครงสร้าง
 *   ตะเข็บชุด "1 ขอบกับหลายชิ้น" (Seam.group · 2026-11-11) ใช้หาโครงสร้างได้: ขอบยาวของแผ่นถูกแบ่งเป็นช่วง แต่ละช่วงเย็บกับขอบเต็มของชิ้นคั่นกลาง 1 ชิ้น
 *     → ชิ้นคั่นกลางหลายชิ้นต่อกันรอบแผ่นเดียวได้ (เช่น กระเป๋ากลม: แถบซิปด้านบน + แถบก้น) · ด้านของชิ้นคั่นกลางต้องเป็นขอบเต็ม
 *   ตะเข็บที่เย็บบางช่วงของขอบแบบอื่น (ไม่มี group เช่น โคนหู) ไม่ใช้หาโครงสร้าง (ใช้เฉพาะตะเข็บเต็มขอบ) — ชิ้นที่ติดด้วยตะเข็บบางช่วงไปอยู่ในภาพเย็บติด (lib/pattern-sewn)
 *
 *   ผลลัพธ์อยู่ในกรอบของตัวหน้า: x ขวา · y ขึ้น (ก้น = 0) · กึ่งกลางซ้ายขวา = 0 · ตัวหน้าอยู่ z = +ลึก/2 ตัวหลัง z = −ลึก/2 (กลับด้าน)
 *
 * ใช้ที่: components/pattern-studio/assembly-view · components/pattern-3d (mode assembly) · เทสต์ lib/__tests__/pattern-assembly.test.ts
 * คู่มือ: docs/pattern-studio.md
 */
import { flattenShape, shapeArea, shapeBox, type InnerLine, type Pt, type Shape } from "@/lib/pattern-shape";
import { checkSeam, isInnerSide, isPartialSeam, isRangedSide, pieceEdges, sidePoints, type Seam, type SeamSide } from "@/lib/pattern-seams";

/** จุดติดของชิ้นที่ไม่ได้เย็บขอบชนขอบ — handle: ปลายหู 2 จุดบนแผ่น (พิกัดเทียบมุมซ้ายบนของกรอบเส้นเย็บของแผ่น · y ลง) · behind: แผ่นปิดหลังรูแรกของแผ่น */
export type Attach = { id: string; kind: "handle" | "behind"; pid: string; on: string; a?: Pt; b?: Pt; len?: number; w?: number; tail?: number };
export type AsmPiece = { pid: string; name: string; count: number; shape: Shape; holes: Shape[]; /** ชั้นซับใน (ไม่ใส่ = ชั้นนอก) */ layer?: "lining"; /** เส้นในชิ้น — ให้ชิ้นอื่นมาเย็บ (ภาพเย็บติด lib/pattern-sewn) */ inner?: InnerLine[] };

export type AsmPanel = { pid: string; side: 1 | -1; outline: Pt[]; holes: Pt[][] };
export type AsmSweep = { pid: string; pts: Pt[]; dir: Pt };
export type AsmHandle = { pid: string; side: 1 | -1; a: Pt; b: Pt; len: number; w: number; tail: number };
export type AsmBehind = { pid: string; side: 1 | -1; x: number; y: number; w: number; h: number };
/** extra = ชิ้นเสริมที่เย็บบางช่วงกับแผ่นหน้า/หลัง (มาจากภาพเย็บติด lib/pattern-sewn · assemble() เองไม่สร้างขั้นนี้) */
export type AsmStepKey = "behind" | "handle" | "extra" | "gusset" | "back" | "lining";
export type AsmStep = { key: AsmStepKey; pids: string[] };
export type AsmNote = "depth-differs" | "mismatch" | "same-back";
export type AssemblyOk = {
  ok: true; kind: "wrap" | "pouch"; depth: number; width: number; height: number;
  front: string; back: string; bridges: string[];
  panels: AsmPanel[]; sweeps: AsmSweep[]; handles: AsmHandle[]; behind: AsmBehind[];
  steps: AsmStep[]; loose: string[]; notes: AsmNote[];
  /** สูงของแผ่นหน้า / แผ่นหลัง ในกรอบประกอบ */
  panelH: [number, number];
  /** แปลงจุดในกรอบประกอบ (x กึ่งกลาง = 0 · y ขึ้น) → พิกัดจุดติดของแผ่น (เทียบมุมซ้ายบนของกรอบเส้นเย็บ · y ลง) — ไว้สร้าง Attach จากหน้าจอ */
  toLocal: { front: (p: Pt) => Pt; back: (p: Pt) => Pt };
  /** แปลงจุดบนกระดานวาดของแผ่นหน้า / แผ่นหลัง → กรอบประกอบของแผ่นนั้น (x กึ่งกลาง = 0 · y ขึ้น) — ไว้วางชิ้นที่เย็บติดกับแผ่น (lib/pattern-sewn) */
  fromBoard: { front: (p: Pt) => Pt; back: (p: Pt) => Pt };
};
export type Assembly = AssemblyOk | { ok: false; reason: "no-pieces" | "no-seams" | "no-structure"; loose: string[] };

const POUCH_DEPTH = 1.5;
const unit = (x: number, y: number): Pt => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const mid = (P: Pt[]): Pt => [(P[0][0] + P[P.length - 1][0]) / 2, (P[0][1] + P[P.length - 1][1]) / 2];
/** จุดศูนย์ถ่วงของเส้น (ถ่วงตามความยาว) + ความยาวรวม */
function lineCentroid(lines: Pt[][]): { c: Pt; len: number } {
  let sx = 0, sy = 0, L = 0;
  for (const P of lines) for (let i = 1; i < P.length; i++) {
    const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    sx += ((P[i][0] + P[i - 1][0]) / 2) * d; sy += ((P[i][1] + P[i - 1][1]) / 2) * d; L += d;
  }
  return { c: L ? [sx / L, sy / L] : [0, 0], len: L };
}
const signed = (P: Pt[]) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
const sameSide = (a: SeamSide, b: SeamSide) => a.pid === b.pid && a.from === b.from && a.count === b.count && a.n === b.n && (a.t0 ?? -1) === (b.t0 ?? -1) && (a.t1 ?? -1) === (b.t1 ?? -1);

/** กรอบของแผ่น: พิกัดกระดาน (y ลง) → พิกัดประกอบ (y ขึ้น · ปากหันขึ้น · กึ่งกลาง x = 0 · ก้น y = 0) */
function frameOf(shape: Shape, swept: Pt[][]): { map: (p: Pt) => Pt; unmap: (p: Pt) => Pt; outline: Pt[]; w: number; h: number; ccw: boolean } {
  const flip = (P: Pt[]) => P.map(([x, y]) => [x, -y] as Pt);
  const O = flip(flattenShape(shape)), closed = [...O, O[0]];
  let up: Pt = [0, 1];
  if (swept.length) {
    const all = lineCentroid([closed]), sw = lineCentroid(swept.map(flip));
    const v: Pt = [all.c[0] - sw.c[0], all.c[1] - sw.c[1]];
    if (Math.hypot(v[0], v[1]) > 1e-4 * Math.max(1, all.len)) up = unit(v[0], v[1]);
  }
  const th = Math.atan2(up[0], up[1]), c = Math.cos(th), s = Math.sin(th);
  const rot = ([x, y]: Pt): Pt => [x * c - y * s, x * s + y * c];
  const R = O.map(rot);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of R) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const tx = -(x0 + x1) / 2, ty = -y0;
  const map = (p: Pt): Pt => { const q = rot([p[0], -p[1]]); return [q[0] + tx, q[1] + ty]; };
  const unmap = ([x, y]: Pt): Pt => { const u = x - tx, v = y - ty; return [u * c + v * s, -(-u * s + v * c)]; };   // ย้อน: เลื่อนกลับ → หมุนกลับ → กลับแกน y
  const outline = R.map(([x, y]) => [x + tx, y + ty] as Pt);
  return { map, unmap, outline, w: x1 - x0, h: y1 - y0, ccw: signed(outline) > 0 };
}

type Link = { mine: SeamSide; other: SeamSide };
type Cand = { pid: string; depth: number; ends: SeamSide[]; endPids: string[] };

/** ประกอบ: หาตัวหน้า/ตัวหลัง/ชิ้นสะพานจากตะเข็บ แล้วคิดเรขาคณิต 3D */
export function assemble(allPieces: AsmPiece[], allSeams: Seam[], attaches: Attach[] = [], layer: "outer" | "lining" = "outer"): Assembly {
  const pieces = allPieces.filter((p) => (p.layer === "lining") === (layer === "lining"));
  if (!pieces.length) return { ok: false, reason: "no-pieces", loose: [] };
  const inLayer = new Set(pieces.map((p) => p.pid));
  const structural = (s: Seam) => !isPartialSeam(s) || (!!s.group && !isInnerSide(s.a) && !isInnerSide(s.b));   // เต็มขอบ หรือ ชุด 1 ขอบกับหลายชิ้น
  const seams = allSeams.filter((s) => structural(s) && inLayer.has(s.a.pid) && inLayer.has(s.b.pid));
  const byPid = new Map(pieces.map((p) => [p.pid, p]));
  const shapes = new Map(pieces.map((p) => [p.pid, p.shape]));
  const all = pieces.map((p) => p.pid);
  const checks = seams.map((s) => checkSeam(shapes, s));
  const usable = seams.filter((_, i) => checks[i].status !== "broken");
  if (!usable.length) return { ok: false, reason: "no-seams", loose: all };

  const links = new Map<string, Link[]>();
  const push = (pid: string, l: Link) => { (links.get(pid) ?? links.set(pid, []).get(pid)!).push(l); };
  for (const s of usable) { push(s.a.pid, { mine: s.a, other: s.b }); push(s.b.pid, { mine: s.b, other: s.a }); }
  const attachOn = new Set(attaches.filter((a) => byPid.has(a.pid) && byPid.has(a.on)).map((a) => a.on));

  // ชิ้นสะพาน: ชิ้น 4 ขอบที่ขอบตรงข้ามกันถูกเย็บทั้งคู่
  const cands: Cand[] = [];
  for (const p of pieces) {
    const E = pieceEdges(p.shape);
    if (E.length !== 4) continue;
    const L = links.get(p.pid) ?? [];
    for (const i of [0, 1]) {
      const j = i + 2;
      const whole = (l: Link, k: number) => l.mine.count === 1 && l.mine.from === k && !isRangedSide(l.mine);   // ด้านของชิ้นคั่นกลางต้องเป็นขอบเต็ม
      const li = L.filter((l) => whole(l, i)), lj = L.filter((l) => whole(l, j));
      if (!li.length || !lj.length) continue;
      const ends = [...li, ...lj].map((l) => l.other), endPids = [...new Set(ends.map((e) => e.pid))].sort();
      if (endPids.includes(p.pid) || endPids.length > 2) continue;
      const a = mid(E[i].pts), b = mid(E[j].pts);
      cands.push({ pid: p.pid, depth: Math.hypot(a[0] - b[0], a[1] - b[1]), ends, endPids });
    }
  }
  const area = (pid: string) => { const p = byPid.get(pid); return p ? shapeArea(p.shape) : 0; };
  const groups = new Map<string, Cand[]>();
  for (const c of cands) { const k = c.endPids.join("|"); (groups.get(k) ?? groups.set(k, []).get(k)!).push(c); }
  let best: Cand[] | null = null, bestScore = -1;
  for (const g of groups.values()) {
    const pids = g[0].endPids;
    const score = pids.reduce((s, pid) => s + area(pid), 0) / pids.length + (pids.some((pid) => attachOn.has(pid)) ? 1e9 : 0);
    if (score > bestScore) { bestScore = score; best = g; }
  }

  let kind: "wrap" | "pouch" = "wrap", front = "", back = "", depth = 0;
  const bridges: string[] = [], notes: AsmNote[] = [];
  let sweepSides: { side: SeamSide; pid: string }[] = [], backSides: SeamSide[] = [];
  if (best) {
    const pids = best[0].endPids;
    const order = (pid: string) => all.indexOf(pid);
    const withHole = pids.filter((pid) => (byPid.get(pid)?.holes.length ?? 0) > 0);
    front = withHole[0] ?? [...pids].sort((a, b) => order(a) - order(b))[0];
    back = pids.find((pid) => pid !== front) ?? front;
    for (const c of best) if (!bridges.includes(c.pid)) bridges.push(c.pid);
    const ds = best.map((c) => c.depth).sort((a, b) => a - b);
    depth = ds[Math.floor(ds.length / 2)];
    if (ds[ds.length - 1] - ds[0] > 0.2) notes.push("depth-differs");
    for (const c of best) for (const e of c.ends) {
      if (e.pid === front && !sweepSides.some((x) => sameSide(x.side, e))) sweepSides.push({ side: e, pid: c.pid });
      else if (e.pid === back && back !== front && !backSides.some((x) => sameSide(x, e))) backSides.push(e);
    }
  } else {
    // ซองแบน: สองแผ่นเย็บขอบติดกันตรง ๆ → เลือกคู่ที่แผ่นใหญ่สุด
    kind = "pouch"; depth = POUCH_DEPTH;
    const s0 = [...usable].sort((x, y) => area(y.a.pid) + area(y.b.pid) - area(x.a.pid) - area(x.b.pid))[0];
    const twoCopies = s0.a.pid === s0.b.pid && (byPid.get(s0.a.pid)?.count ?? 1) >= 2;
    if (s0.a.pid === s0.b.pid && !twoCopies) return { ok: false, reason: "no-structure", loose: all };
    const withHole = [s0.a.pid, s0.b.pid].filter((pid) => (byPid.get(pid)?.holes.length ?? 0) > 0);
    front = withHole[0] ?? s0.a.pid; back = s0.a.pid === front ? s0.b.pid : s0.a.pid;
    for (const s of usable) {
      const pair = (s.a.pid === front && s.b.pid === back) ? [s.a, s.b] : (s.b.pid === front && s.a.pid === back) ? [s.b, s.a] : null;
      if (!pair) continue;
      if (!sweepSides.some((x) => sameSide(x.side, pair[0]))) sweepSides.push({ side: pair[0], pid: back });
      if (back !== front && !backSides.some((x) => sameSide(x, pair[1]))) backSides.push(pair[1]);
    }
  }
  const F = byPid.get(front), B = byPid.get(back);
  if (!F || !B || !sweepSides.length) return { ok: false, reason: "no-structure", loose: all };
  if (seams.some((_, i) => checks[i].status === "mismatch")) notes.push("mismatch");
  if (back === front && F.count < 2) notes.push("same-back");

  const sweptBoard = sweepSides.map((x) => sidePoints(F.shape, x.side)).filter((P): P is Pt[] => !!P);
  const ff = frameOf(F.shape, sweptBoard);
  const fb = back === front ? ff : frameOf(B.shape, backSides.map((s) => sidePoints(B.shape, s)).filter((P): P is Pt[] => !!P));
  const holesOf = (p: AsmPiece, f: typeof ff) => p.holes.map((h) => flattenShape(h).map(f.map));
  const panels: AsmPanel[] = [
    { pid: front, side: 1, outline: ff.outline, holes: holesOf(F, ff) },
    { pid: back, side: -1, outline: fb.outline, holes: holesOf(B, fb) },
  ];
  const cen = lineCentroid([[...ff.outline, ff.outline[0]]]).c;
  const sweeps: AsmSweep[] = sweepSides.map((x, i) => {
    let pts = sweptBoard[i].map(ff.map);
    if (!ff.ccw) pts = pts.reverse();                       // ให้ผิวข้างหันหน้าออกนอกเสมอ
    const c = lineCentroid([pts]).c, v: Pt = [c[0] - cen[0], c[1] - cen[1]];
    return { pid: x.pid, pts, dir: Math.hypot(v[0], v[1]) > 1e-6 ? unit(v[0], v[1]) : [0, -1] };
  });

  const handles: AsmHandle[] = [], behind: AsmBehind[] = [], attached = new Set<string>();
  for (const at of attaches) {
    const child = byPid.get(at.pid);
    if (!child || (at.on !== front && at.on !== back)) continue;
    const sides: (1 | -1)[] = front === back ? [1, -1] : [at.on === front ? 1 : -1];
    for (const side of sides) {
      const P = side > 0 ? F : B, f = side > 0 ? ff : fb, box = shapeBox(P.shape);
      if (at.kind === "handle" && at.a && at.b && at.len && at.w) {
        handles.push({ pid: at.pid, side, a: f.map([box.x + at.a[0], box.y + at.a[1]]), b: f.map([box.x + at.b[0], box.y + at.b[1]]), len: at.len, w: at.w, tail: at.tail ?? 4 });
        attached.add(at.pid);
      } else if (at.kind === "behind" && P.holes.length) {
        const hb = shapeBox(P.holes[0]), cb = shapeBox(child.shape), c = f.map([hb.x + hb.w / 2, hb.y + hb.h / 2]);
        behind.push({ pid: at.pid, side, x: c[0] - cb.w / 2, y: c[1] - cb.h / 2, w: cb.w, h: cb.h });
        attached.add(at.pid);
        break;                                               // แผ่นหลังช่องมีชิ้นเดียว ติดฝั่งที่มีรู
      }
    }
  }
  const used = new Set([front, back, ...bridges, ...attached]);
  const steps: AsmStep[] = [];
  if (behind.length) steps.push({ key: "behind", pids: [...new Set(behind.map((x) => x.pid))] });
  if (handles.length) steps.push({ key: "handle", pids: [...new Set(handles.map((x) => x.pid))] });
  if (kind === "wrap") steps.push({ key: "gusset", pids: bridges });
  steps.push({ key: "back", pids: [back] });
  return {
    ok: true, kind, depth, width: Math.max(ff.w, fb.w), height: Math.max(ff.h, fb.h), front, back, bridges,
    panels, sweeps, handles, behind, steps, loose: all.filter((pid) => !used.has(pid)), notes,
    panelH: [ff.h, fb.h],
    toLocal: {
      front: (q) => { const b = shapeBox(F.shape), u = ff.unmap(q); return [u[0] - b.x, u[1] - b.y]; },
      back: (q) => { const b = shapeBox(B.shape), u = fb.unmap(q); return [u[0] - b.x, u[1] - b.y]; },
    },
    fromBoard: { front: ff.map, back: fb.map },
  };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pt = (v: unknown): Pt | null => { if (!Array.isArray(v) || v.length !== 2) return null; const x = num(v[0]), y = num(v[1]); return x == null || y == null ? null : [x, y]; };
/** ตรวจจุดติดจากหน้าจอ/ฐานข้อมูล — ชี้ชิ้นที่ไม่มีแล้ว หรือรูปแบบผิด = ทิ้ง */
export function cleanAttaches(raw: unknown, pids: Set<string>): Attach[] {
  if (!Array.isArray(raw)) return [];
  const out: Attach[] = [];
  for (const x of raw.slice(0, 40)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const id = typeof r.id === "string" && /^[\w-]{1,40}$/.test(r.id) ? r.id : "";
    const pid = typeof r.pid === "string" ? r.pid : "", on = typeof r.on === "string" ? r.on : "";
    if (!id || !pids.has(pid) || !pids.has(on) || pid === on || out.some((o) => o.id === id)) continue;
    if (r.kind === "behind") { out.push({ id, kind: "behind", pid, on }); continue; }
    const a = pt(r.a), b = pt(r.b), len = num(r.len), w = num(r.w), tail = num(r.tail);
    if (r.kind !== "handle" || !a || !b || !len || !w || len <= 0 || len > 300 || w <= 0 || w > 30) continue;
    out.push({ id, kind: "handle", pid, on, a, b, len, w, tail: tail != null && tail >= 0 && tail <= 30 ? tail : 4 });
  }
  return out;
}
