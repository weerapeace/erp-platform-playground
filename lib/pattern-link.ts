/**
 * 🔗 ชิ้นคู่ผูกกัน — สูตรบริสุทธิ์ ไม่มีหน้าจอ · สตูดิโอแพทเทิร์น (เจ้าของสั่ง 2026-11-11 "ทำต่อเลย" — ข้อ "แก้ตัวนอกแล้วซับในตาม")
 *
 *   ชิ้นที่มี link = "ชิ้นตาม": รูปเส้นรอบของมันมาจาก "ชิ้นต้นแบบ" (link.to) เสมอ — แก้ต้นแบบ (ลากจุด ย่อขยาย พิมพ์ความยาวขอบ) ชิ้นตามเปลี่ยนตามทันที
 *     • ตามเฉพาะ "รูปเส้นรอบ" · ของตัวเองยังเป็นของตัวเอง: ตำแหน่งบนกระดาน ชื่อ วัสดุ ชนิดชิ้น จำนวนตัด เผื่อเย็บ รูเจาะ รอยบาก เส้นใน (ช่องใส่ของบนซับใน ไม่ไปโผล่บนตัวนอก)
 *     • ชิ้นตามอยู่กับที่: มุมซ้ายบนของกรอบเส้นเย็บของมันไม่ขยับ (ย้ายชิ้นตามเองได้ตามปกติ)
 *     • mirror "x" = กลับซ้ายขวา (ชิ้นคู่ซ้าย/ขวา)
 *     • ห้ามผูกเป็นทอด (ชิ้นตามเป็นต้นแบบของชิ้นอื่นไม่ได้) · ต้นแบบถูกลบ = ชิ้นตามกลับเป็นชิ้นอิสระ (เลิกผูกเอง รูปคงเดิม)
 *   ตะเข็บไม่ได้ผูกตามตลอดเวลา — แต่ "คัดลอกตะเข็บของต้นแบบให้ชิ้นตาม" ได้ครั้งละชุด (followerSeams · 2026-11-11):
 *     ตะเข็บของต้นแบบ 1 แนว (ต้นแบบ ↔ ชิ้นอื่น) → ตะเข็บของชิ้นตาม ↔ "คู่ของชิ้นอื่น":
 *       • ชิ้นอื่นมีชิ้นตามแบบเดียวกัน (เช่น ชุดซับใน หรือชุดซ้าย/ขวา) = เย็บกับชิ้นตามตัวนั้น
 *       • ไม่มี และชิ้นตามเป็นแบบกลับซ้ายขวา = เย็บกับ "ขอบฝั่งตรงข้าม" ของชิ้นอื่นตัวเดิม (ชิ้นอื่นต้องสมมาตรซ้ายขวา — หาขอบจากภาพสะท้อนของขอบเดิม)
 *     หาขอบคู่ไม่เจอ / ขอบนั้นเย็บไปแล้ว / เย็บกับเส้นใน = ข้าม (นับไว้บอกผู้ใช้) · มีตะเข็บนั้นอยู่แล้ว = ไม่สร้างซ้ำ
 *
 * ใช้ที่: components/pattern-sheet/shape-editor (prop pieceLinks) · lib/pattern-project · เทสต์ lib/__tests__/pattern-link.test.ts
 * คู่มือ: docs/pattern-studio.md
 */
import { mirrorShape, moveShape, shapeBox, type Pt, type Shape } from "@/lib/pattern-shape";
import { edgeBusy, isInnerSide, pieceEdges, posOnLine, rangeFree, rangedSide, sideFullPoints, sideHasEdge, sidePoints, type Seam, type SeamSide } from "@/lib/pattern-seams";

export type PieceLink = { to: string; mirror?: "x" };

export function cleanPieceLink(raw: unknown): PieceLink | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.to !== "string" || !/^[\w-]{1,48}$/.test(r.to)) return null;
  return r.mirror === "x" ? { to: r.to, mirror: "x" } : { to: r.to };
}

/** รูปของชิ้นตาม: รูปของต้นแบบ (กลับซ้ายขวาถ้าตั้งไว้) ย้ายมาให้มุมซ้ายบนของกรอบอยู่ที่ at */
export function linkedShape(master: Shape, link: PieceLink, at: { x: number; y: number }): Shape {
  const b0 = shapeBox(master);
  const s = link.mirror === "x" ? mirrorShape(master, "x", b0.x + b0.w / 2) : master;
  const b = shapeBox(s);
  return moveShape(s, at.x - b.x, at.y - b.y);
}

const near = (a: number | undefined, b: number | undefined) => Math.abs((a ?? 0) - (b ?? 0)) < 1e-6;
/** รูปสองรูปเหมือนกัน (คลาดได้นิดเดียว) — กันวนอัปเดตไม่จบจากเศษทศนิยม */
export function shapesClose(a: Shape, b: Shape): boolean {
  if (a.k !== b.k) return false;
  if (a.k !== "path" && b.k !== "path") return near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);
  if (a.k !== "path" || b.k !== "path" || a.nodes.length !== b.nodes.length) return false;
  return a.nodes.every((p, i) => { const q = b.nodes[i]; return near(p.x, q.x) && near(p.y, q.y) && near(p.ix, q.ix) && near(p.iy, q.iy) && near(p.ox, q.ox) && near(p.oy, q.oy); });
}

type Linkable = { pid: string; shape: Shape; link?: PieceLink | null };
/** ชิ้นที่เป็นต้นแบบของชิ้นนี้ได้: ไม่ใช่ตัวเอง · ไม่ใช่ชิ้นตามของใคร · ไม่ใช่ชิ้นที่ตามชิ้นนี้อยู่ (กันผูกวน/ผูกเป็นทอด) */
export function linkTargets<T extends Linkable>(pieces: T[], pid: string): T[] {
  if (pieces.some((p) => p.link?.to === pid)) return [];           // ชิ้นนี้เป็นต้นแบบของชิ้นอื่นอยู่ → เป็นชิ้นตามไม่ได้
  return pieces.filter((p) => p.pid !== pid && !p.link);
}

/**
 * ทำให้ชิ้นตามทุกชิ้นมีรูปตรงกับต้นแบบ — คืนรายการเดิม (ตัวเดิมเป๊ะ) ถ้าไม่มีอะไรต้องเปลี่ยน
 * ต้นแบบหาย / ผูกเป็นทอด / ผูกกับตัวเอง = เลิกผูกชิ้นนั้น (รูปคงเดิม)
 */
export function applyLinks<T extends Linkable>(pieces: T[]): T[] {
  if (!pieces.some((p) => p.link)) return pieces;
  const byPid = new Map(pieces.map((p) => [p.pid, p]));
  let changed = false;
  const out = pieces.map((p) => {
    if (!p.link) return p;
    const m = byPid.get(p.link.to);
    if (!m || m.pid === p.pid || m.link) { changed = true; const { link: _l, ...rest } = p; void _l; return rest as T; }
    const b = shapeBox(p.shape), ns = linkedShape(m.shape, p.link, b);
    if (shapesClose(ns, p.shape)) return p;
    changed = true;
    return { ...p, shape: ns };
  });
  return changed ? out : pieces;
}

// ───────────────────────── ตะเข็บของชิ้นตาม (คัดลอกจากต้นแบบ) ─────────────────────────
export type LinkSeamPiece = { pid: string; shape: Shape; count?: number; link?: PieceLink | null };
const SIDE_TOL = 0.05;
const lenOfPts = (P: Pt[]) => { let l = 0; for (let i = 1; i < P.length; i++) l += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return l; };
const samePt = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < SIDE_TOL;

/** จุดบนชิ้นต้นแบบ → จุดเดียวกันบนชิ้นตาม (กลับซ้ายขวารอบกึ่งกลางของต้นแบบถ้าตั้งไว้ แล้วเลื่อนไปที่ชิ้นตาม) */
function toFollower(master: Shape, follower: Shape, link: PieceLink): (p: Pt) => Pt {
  const mb = shapeBox(master), fb = shapeBox(follower), cx = mb.x + mb.w / 2;
  return ([x, y]) => [(link.mirror === "x" ? 2 * cx - x : x) + fb.x - mb.x, y + fb.y - mb.y];
}
/** หาว่าเส้น P ทับอยู่บนขอบไหนของชิ้น → ด้านของตะเข็บ (ขอบเดียว: เต็มขอบหรือบางช่วง · หลายขอบติดกัน: เต็มทุกขอบ) · ไม่ทับขอบ = null */
function locateSide(pid: string, shape: Shape, P: Pt[]): SeamSide | null {
  const E = pieceEdges(shape), n = E.length, a = P[0], b = P[P.length - 1], m = P[Math.floor(P.length / 2)];
  for (const e of E) {
    const pa = posOnLine(e.pts, a), pb = posOnLine(e.pts, b), pm = posOnLine(e.pts, m);
    if (pa.d < SIDE_TOL && pb.d < SIDE_TOL && pm.d < SIDE_TOL && Math.abs(pa.pos - pb.pos) > SIDE_TOL) return rangedSide(pid, e.i, n, Math.min(pa.pos, pb.pos), Math.max(pa.pos, pb.pos), e.len);
  }
  if (n < 3 || n > 60) return null;
  const L = lenOfPts(P);
  for (let from = 0; from < n; from++) for (let count = 2; count < n; count++) {
    const side: SeamSide = { pid, from, count, n }, Q = sideFullPoints(shape, side);
    if (!Q || Math.abs(lenOfPts(Q) - L) > SIDE_TOL * 2) continue;
    if (((samePt(Q[0], a) && samePt(Q[Q.length - 1], b)) || (samePt(Q[0], b) && samePt(Q[Q.length - 1], a))) && posOnLine(Q, m).d < SIDE_TOL) return side;
  }
  return null;
}
/** ด้าน side ของชิ้น src ไปตกที่ด้านไหนของชิ้น target เมื่อย้ายจุดด้วย f */
function mapSide(src: Shape, side: SeamSide, target: LinkSeamPiece, f: (p: Pt) => Pt): SeamSide | null {
  if (isInnerSide(side)) return null;
  const n = pieceEdges(target.shape).length;
  if (side.t0 == null && side.count === side.n && n === side.n) return { pid: target.pid, from: side.from, count: side.count, n };   // เย็บทั้งรอบรูป (เช่น รอบวงกลม)
  const P = sidePoints(src, side);
  return P && P.length >= 2 ? locateSide(target.pid, target.shape, P.map(f)) : null;
}
const sideEq = (a: SeamSide, b: SeamSide) => a.pid === b.pid && a.from === b.from && a.count === b.count && a.n === b.n && Math.abs((a.t0 ?? -1) - (b.t0 ?? -1)) < 0.02 && Math.abs((a.t1 ?? -1) - (b.t1 ?? -1)) < 0.02;
/** ด้านนี้ยังเย็บได้ (ไม่ทับตะเข็บอื่นเกินจำนวนตัดของชิ้น) */
function sideFree(list: Seam[], piece: LinkSeamPiece, side: SeamSide): boolean {
  const E = pieceEdges(piece.shape), cap = Math.max(1, piece.count ?? 1);
  if (E.length !== side.n) return false;
  if (side.count === 1) { const L = E[side.from].len; return rangeFree(edgeBusy(list, side.pid, side.from, side.n, L), side.t0 ?? 0, side.t1 ?? L, cap); }
  return E.every((e) => !sideHasEdge(side, e.i) || edgeBusy(list, side.pid, e.i, side.n, e.len).length < cap);
}

/**
 * ตะเข็บที่ควรเพิ่มให้ชิ้นตาม เพื่อให้เย็บเหมือนชิ้นต้นแบบ — add = ตะเข็บใหม่ (ยังไม่ได้ใส่ลงรายการ) · skipped = ตะเข็บของต้นแบบที่หาคู่ให้ไม่ได้
 * stamp = ข้อความสั้น ๆ ไว้ทำรหัสตะเข็บใหม่ไม่ให้ซ้ำ
 */
export function followerSeams(pieces: LinkSeamPiece[], seams: Seam[], followerPid: string, stamp: string): { add: Seam[]; skipped: number } {
  const byPid = new Map(pieces.map((p) => [p.pid, p]));
  const F = byPid.get(followerPid), link = F?.link ?? null, M = link ? byPid.get(link.to) : null;
  if (!F || !M || !link) return { add: [], skipped: 0 };
  const toF = toFollower(M.shape, F.shape, link), add: Seam[] = [], groups = new Map<string, string>();
  let skipped = 0;
  for (const s of seams) {
    const isA = s.a.pid === M.pid, isB = s.b.pid === M.pid;
    if (!isA && !isB) continue;
    if (isA && isB) { skipped++; continue; }                                    // ต้นแบบเย็บกับตัวเอง — ไม่คัดลอก
    const mine = isA ? s.a : s.b, other = isA ? s.b : s.a, O = byPid.get(other.pid);
    if (!O || O.pid === F.pid) { skipped++; continue; }
    const sideF = mapSide(M.shape, mine, F, toF);
    // คู่ของชิ้นอื่น: ชิ้นตามของมัน (แบบเดียวกับชิ้นนี้) · ไม่มีและเป็นแบบกลับซ้ายขวา = ขอบฝั่งตรงข้ามของชิ้นอื่นตัวเดิม
    const twin = pieces.find((p) => p.link?.to === O.pid && (p.link.mirror ?? "") === (link.mirror ?? ""));
    let partner: SeamSide | null = null, P: LinkSeamPiece = O;
    if (twin?.link) { P = twin; partner = mapSide(O.shape, other, twin, toFollower(O.shape, twin.shape, twin.link)); }
    else if (link.mirror === "x") { const ob = shapeBox(O.shape), cx = ob.x + ob.w / 2; partner = mapSide(O.shape, other, O, ([x, y]) => [2 * cx - x, y]); }
    if (!sideF || !partner) { skipped++; continue; }
    const list = [...seams, ...add];
    if (list.some((x) => (sideEq(x.a, sideF) && sideEq(x.b, partner!)) || (sideEq(x.b, sideF) && sideEq(x.a, partner!)))) continue;   // มีอยู่แล้ว
    if (!sideFree(list, F, sideF) || !sideFree(list, P, partner)) { skipped++; continue; }
    const g = s.group ? groups.get(s.group) ?? groups.set(s.group, `${s.group}m${stamp}`.replace(/[^\w-]/g, "").slice(0, 40)).get(s.group) : undefined;
    add.push({ id: `s${stamp}f${add.length}`, a: isA ? sideF : partner, b: isA ? partner : sideF, ...(s.kind ? { kind: s.kind } : {}), ...(s.top ? { top: s.top } : {}), ...(s.ease ? { ease: true } : {}), ...(g ? { group: g } : {}) });
  }
  return { add, skipped };
}
