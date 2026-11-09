/**
 * รวม / ตัดออก / ส่วนทับ ของชิ้นแพทเทิร์น (boolean) — เขียนเอง ไม่พึ่งไลบรารีภายนอก (เจ้าของเลือก 2026-11-09)
 *
 * วิธีคิด (แบบคนอ่านได้):
 *   1. แตกขอบทุกเส้นของทั้ง 2 รูป ตรงจุดที่ตัด/แตะกัน
 *   2. ดูแต่ละท่อนว่าอยู่ "ใน" หรือ "นอก" อีกรูป — ท่อนที่ทับขอบเดียวกันพอดี ดูว่าหันทางเดียวกันไหม
 *   3. เลือกท่อนตามคำสั่ง (รวม = ท่อนนอก · ส่วนทับ = ท่อนใน · ตัดออก = ท่อนนอกของรูปหลัก + ท่อนในของตัวตัด กลับทิศ)
 *   4. ต่อท่อนเป็นวง → วงที่หันขวา = ขอบนอก · วงที่หันซ้าย = รู (จับคู่ใส่ชิ้นที่ล้อมอยู่)
 *
 * โค้งถูกแตกเป็นจุดก่อน → ผลลัพธ์เป็นรูปจุด (แก้จุดต่อได้) · ใช้ได้ทั้งชิ้นที่มีรู
 */
import { flattenShape, type Pt, type Shape } from "@/lib/pattern-shape";

export type BoolOp = "union" | "subtract" | "intersect";
export type BoolPiece = { shape: Shape; holes?: Shape[] };
type Ring = Pt[];
type Edge = { a: Pt; b: Pt };

const SNAP = 1e-6;   // ซม. — จุดใกล้กันกว่านี้ = จุดเดียวกัน
const area = (R: Ring) => { let A = 0; for (let i = 0; i < R.length; i++) { const p = R[i], q = R[(i + 1) % R.length]; A += p[0] * q[1] - q[0] * p[1]; } return A / 2; };
const key = (p: Pt) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
const ekey = (e: Edge) => `${key(e.a)}>${key(e.b)}`;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** จุดซ้ำ/ขอบยาว 0 ออก */
function cleanRing(P: Pt[]): Ring {
  const out: Pt[] = [];
  for (const p of P) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > SNAP) out.push(p); }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= SNAP) out.pop();
  return out;
}

/** ตัดจุดที่อยู่กลางเส้นตรง (ต่อกันเป็นเส้นเดียว) */
function simplifyRing(R: Ring): Ring {
  let P = R.slice();
  for (let changed = true; changed && P.length > 3;) {
    changed = false;
    for (let i = 0; i < P.length && P.length > 3; i++) {
      const a = P[(i - 1 + P.length) % P.length], b = P[i], c = P[(i + 1) % P.length];
      const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
      const cr = ux * vy - uy * vx, L = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      if (L === 0 || (Math.abs(cr) <= 1e-9 * L && ux * vx + uy * vy > 0)) { P.splice(i, 1); changed = true; i--; }
    }
  }
  return P;
}

/** จุดอยู่ในชุดวง (นับเส้นตัด คู่ = นอก · คี่ = ใน) */
function inside(p: Pt, rings: Ring[]): boolean {
  let c = false;
  for (const R of rings) for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
    const a = R[i], b = R[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/** จุดที่ขอบ s กับ o ตัด/แตะ/ทับกัน (จุดใกล้ปลายเส้น = ดูดเข้าปลายเส้นพอดี ให้ทั้งสองเส้นได้จุดเดียวกันเป๊ะ) */
function crossPoints(s: Edge, o: Edge): Pt[] {
  const rx = s.b[0] - s.a[0], ry = s.b[1] - s.a[1], sx = o.b[0] - o.a[0], sy = o.b[1] - o.a[1];
  const L1 = Math.hypot(rx, ry), L2 = Math.hypot(sx, sy);
  if (!L1 || !L2) return [];
  const et = SNAP / L1, eu = SNAP / L2;
  const den = rx * sy - ry * sx;
  const near = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= SNAP * 2;
  if (Math.abs(den) > 1e-12 * L1 * L2) {
    const t = ((o.a[0] - s.a[0]) * sy - (o.a[1] - s.a[1]) * sx) / den;
    const u = ((o.a[0] - s.a[0]) * ry - (o.a[1] - s.a[1]) * rx) / den;
    if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) return [];
    let p: Pt = [s.a[0] + rx * t, s.a[1] + ry * t];
    for (const e of [s.a, s.b, o.a, o.b]) if (near(p, e)) { p = e; break; }
    return [p];
  }
  // ขนานกัน — อยู่บนเส้นเดียวกันไหม (ทับกันบางช่วง)
  if (Math.abs((o.a[0] - s.a[0]) * ry - (o.a[1] - s.a[1]) * rx) / L1 > SNAP) return [];
  const out: Pt[] = [];
  for (const e of [o.a, o.b]) { const t = ((e[0] - s.a[0]) * rx + (e[1] - s.a[1]) * ry) / (L1 * L1); if (t > -et && t < 1 + et) out.push(e); }
  for (const e of [s.a, s.b]) { const u = ((e[0] - o.a[0]) * sx + (e[1] - o.a[1]) * sy) / (L2 * L2); if (u > -eu && u < 1 + eu) out.push(e); }
  return out;
}

const edgesOf = (rings: Ring[]): Edge[] => rings.flatMap((R) => R.map((a, i) => ({ a, b: R[(i + 1) % R.length] })));
const bboxOf = (e: Edge) => [Math.min(e.a[0], e.b[0]) - SNAP, Math.min(e.a[1], e.b[1]) - SNAP, Math.max(e.a[0], e.b[0]) + SNAP, Math.max(e.a[1], e.b[1]) + SNAP];

/** แตกเส้นของ A และ B ตรงจุดตัดกันทั้งหมด */
function splitAll(EA: Edge[], EB: Edge[]): [Edge[], Edge[]] {
  const ca: Pt[][] = EA.map(() => []), cb: Pt[][] = EB.map(() => []);
  const ba = EA.map(bboxOf), bb = EB.map(bboxOf);
  for (let i = 0; i < EA.length; i++) for (let j = 0; j < EB.length; j++) {
    const p = ba[i], q = bb[j];
    if (p[0] > q[2] || q[0] > p[2] || p[1] > q[3] || q[1] > p[3]) continue;
    for (const x of crossPoints(EA[i], EB[j])) { ca[i].push(x); cb[j].push(x); }
  }
  const cut = (E: Edge[], C: Pt[][]): Edge[] => E.flatMap((e, i) => {
    const ka = key(e.a), kb = key(e.b), dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], L2 = dx * dx + dy * dy;
    const seen = new Set([ka, kb]);
    const mids = C[i].filter((p) => { const k = key(p); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((p) => ({ p, t: ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / L2 }))
      .filter((m) => m.t > 0 && m.t < 1).sort((m, n) => m.t - n.t).map((m) => m.p);
    const pts = [e.a, ...mids, e.b], out: Edge[] = [];
    for (let k = 0; k + 1 < pts.length; k++) out.push({ a: pts[k], b: pts[k + 1] });
    return out;
  });
  return [cut(EA, ca), cut(EB, cb)];
}

/** ต่อท่อนเป็นวง — ทางแยก (จุดที่วงแตะกัน) เลือกเลี้ยวขวาสุด ให้ได้วงเล็กแยกกัน ไม่เป็นเลข 8 */
function chain(E: Edge[]): Ring[] {
  const from = new Map<string, number[]>();
  E.forEach((e, i) => { const k = key(e.a); (from.get(k) ?? from.set(k, []).get(k)!).push(i); });
  const used = new Array<boolean>(E.length).fill(false), rings: Ring[] = [];
  for (let s = 0; s < E.length; s++) {
    if (used[s]) continue;
    const start = key(E[s].a), ring: Pt[] = [];
    let i = s;
    for (let guard = 0; guard <= E.length; guard++) {
      used[i] = true; ring.push(E[i].a);
      const k = key(E[i].b);
      if (k === start) { rings.push(ring); break; }
      const cand = (from.get(k) ?? []).filter((j) => !used[j]);
      if (!cand.length) break;   // ขาดตอน (ไม่ควรเกิด) — ทิ้งวงนี้
      if (cand.length === 1) { i = cand[0]; continue; }
      const dx = E[i].b[0] - E[i].a[0], dy = E[i].b[1] - E[i].a[1];
      let best = cand[0], bestA = -Infinity;
      for (const j of cand) {
        const ex = E[j].b[0] - E[j].a[0], ey = E[j].b[1] - E[j].a[1];
        const ang = Math.atan2(dx * ey - dy * ex, dx * ex + dy * ey);   // แกน y ลง: บวก = เลี้ยวขวา
        if (ang > bestA) { bestA = ang; best = j; }
      }
      i = best;
    }
  }
  return rings;
}

/** boolean ของชุดวง 2 ชุด (วงนอก = พื้นที่บวก · รู = พื้นที่ลบ) */
function boolRings(op: BoolOp, A: Ring[], B: Ring[]): Ring[] {
  const [SA, SB] = splitAll(edgesOf(A), edgesOf(B));
  const aset = new Set(SA.map(ekey)), bset = new Set(SB.map(ekey));
  const mid = (e: Edge): Pt => [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
  const rev = (e: Edge): Edge => ({ a: e.b, b: e.a });
  const keep: Edge[] = [];
  for (const e of SA) {
    if (bset.has(ekey(e))) { if (op !== "subtract") keep.push(e); continue; }   // ทับขอบ หันทางเดียวกัน
    if (bset.has(ekey(rev(e)))) { if (op === "subtract") keep.push(e); continue; }   // ทับขอบ หันสวนกัน
    const inB = inside(mid(e), B);
    if (op === "intersect" ? inB : !inB) keep.push(e);
  }
  for (const e of SB) {
    if (aset.has(ekey(e)) || aset.has(ekey(rev(e)))) continue;
    const inA = inside(mid(e), A);
    if (op === "union" && !inA) keep.push(e);
    else if (op === "intersect" && inA) keep.push(e);
    else if (op === "subtract" && inA) keep.push(rev(e));
  }
  return chain(keep).map((R) => simplifyRing(cleanRing(R))).filter((R) => R.length >= 3 && Math.abs(area(R)) > 1e-4);
}

function ringsOf(p: BoolPiece): Ring[] {
  const o = cleanRing(flattenShape(p.shape));
  if (area(o) < 0) o.reverse();
  const hs = (p.holes ?? []).map((h) => { const r = cleanRing(flattenShape(h)); if (area(r) > 0) r.reverse(); return r; });
  return [o, ...hs].filter((R) => R.length >= 3 && Math.abs(area(R)) > 1e-6);
}

/** วง → ชิ้น (วงนอก + รูที่อยู่ข้างใน) เรียงชิ้นใหญ่ก่อน */
function group(rings: Ring[]): { outer: Ring; holes: Ring[] }[] {
  const outers = rings.filter((R) => area(R) > 0).map((R) => ({ outer: R, holes: [] as Ring[], a: area(R) })).sort((x, y) => x.a - y.a);
  for (const h of rings.filter((R) => area(R) < 0)) {
    const p: Pt = [(h[0][0] + h[1][0]) / 2, (h[0][1] + h[1][1]) / 2];
    const o = outers.find((x) => inside(p, [x.outer]));
    if (o) o.holes.push(h);
  }
  return outers.sort((x, y) => y.a - x.a).map(({ outer, holes }) => ({ outer, holes }));
}

const toPath = (R: Ring): Shape => ({ k: "path", nodes: R.map(([x, y]) => ({ x: r3(x), y: r3(y) })) });

/**
 * รวม / ตัดออก / ส่วนทับ หลายชิ้น
 *   union     = รวมทุกชิ้นเป็นรูปเดียว (ไม่ได้ซ้อนกัน = ได้หลายชิ้น)
 *   subtract  = ชิ้นแรก ลบด้วยชิ้นที่เหลือทั้งหมด (ชิ้นแรก = ชิ้นที่อยู่ล่างสุด/วาดก่อน)
 *   intersect = เฉพาะส่วนที่ทุกชิ้นซ้อนกัน
 * คืนชิ้นผลลัพธ์ (ใหญ่ก่อน) · ว่าง = ไม่เหลืออะไร (เช่น ไม่มีส่วนทับกัน)
 */
export function booleanPieces(op: BoolOp, pieces: BoolPiece[]): { shape: Shape; holes: Shape[] }[] {
  if (!pieces.length) return [];
  let acc = ringsOf(pieces[0]);
  if (op === "subtract") {
    let cutter: Ring[] = [];
    for (const p of pieces.slice(1)) cutter = cutter.length ? boolRings("union", cutter, ringsOf(p)) : ringsOf(p);
    if (cutter.length) acc = boolRings("subtract", acc, cutter);
  } else {
    for (const p of pieces.slice(1)) acc = boolRings(op, acc, ringsOf(p));
  }
  return group(acc).map((g) => ({ shape: toPath(g.outer), holes: g.holes.map(toPath) }));
}
