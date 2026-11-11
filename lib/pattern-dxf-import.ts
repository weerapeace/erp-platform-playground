/**
 * 📥 นำเข้าแพทเทิร์นจากไฟล์ DXF — สูตรบริสุทธิ์ ไม่มีหน้าจอ · สตูดิโอแพทเทิร์น (เจ้าของสั่ง 2026-11-11 "ทำต่อเลย" — ย้ายแพทเทิร์นเก่าจาก CLO3D)
 *
 *   อ่าน DXF แบบข้อความ (ASCII) 2 แบบ:
 *     1) แบบโรงงานเสื้อผ้า (AAMA / ASTM — ที่ CLO3D ส่งออก): 1 ชิ้น = 1 บล็อก · ชั้น 1 = เส้นตัด · 14 = เส้นเย็บ · 8 = เส้นใน · 4 = รอยบาก · 7 = เส้นทางผ้า · ข้อความ "Piece Name:" / "Quantity:"
 *     2) แบบเส้นล้วน (รวมไฟล์ที่ระบบนี้ส่งออกเอง): ชั้น CUT / SEW / HOLE / INNER / FOLD / NOTCH / GRAIN / LABEL · ชั้นที่ไม่รู้จัก = เส้นตัด
 *   ขั้นตอน: แตกไฟล์เป็นเส้น → ต่อเส้นสั้น ๆ เป็นวงปิด → วงนอกสุด = ชิ้น · วงข้างใน = เส้นเย็บ / รูเจาะ · เส้นเปิดข้างใน = เส้นใน
 *            → เส้นโค้งที่ไฟล์เก็บเป็นจุดถี่ ๆ ถูกแปลงกลับเป็น "ขอบโค้ง 1 ขอบ" (หามุม แล้วหาเส้นโค้งที่ทับจุดเดิม) เพื่อให้เย็บขอบกับขอบได้
 *   หน่วย: อ่านจากหัวไฟล์ ($INSUNITS) ถ้ามี · ไม่มี = มิลลิเมตร (ผู้ใช้เปลี่ยนได้ในหน้าต่างนำเข้า แล้วดูขนาดชิ้นว่าตรงไหม)
 *
 *   ⚠️ ทำจากรูปแบบมาตรฐานของ DXF — ยังไม่ได้ทดสอบกับไฟล์ที่ส่งออกจาก CLO3D ของโรงงานจริง · เส้นแบบ SPLINE ใช้จุดควบคุมแทน (รูปใกล้เคียง ไม่เป๊ะ)
 *      ไม่อ่าน: ไฟล์ DXF แบบไบนารี · ตะเข็บ (DXF ไม่มีข้อมูลว่าขอบไหนเย็บกับขอบไหน) · วัสดุ · หลายไซซ์
 *
 * ใช้ที่: components/pattern-studio/dxf-modal · เทสต์ lib/__tests__/pattern-dxf-import.test.ts · คู่มือ: docs/pattern-studio.md
 */
import { MAX_ALLOW, pointInPolygon, polyBox, projectOnOutline, type InnerLine, type PNode, type Pt, type Shape } from "@/lib/pattern-shape";

export type DxfUnit = "mm" | "cm" | "inch";
export const DXF_UNIT_CM: Record<DxfUnit, number> = { mm: 0.1, cm: 1, inch: 2.54 };
export type DxfPiece = {
  name: string; count: number; shape: Shape; holes: Shape[]; allow: number;
  inner: InnerLine[]; notches: Pt[]; grain: [Pt, Pt] | null;
  /** มุมซ้ายบนของกรอบเส้นเย็บ ในพื้นที่ของไฟล์ (ซม. · y ลง · ชิ้นซ้ายบนสุดเริ่มที่ 0,0) + ขนาดสำเร็จ */
  at: [number, number]; w: number; h: number; edges: number;
};
/** spline = มีเส้นแบบ SPLINE (ใช้จุดควบคุมแทน) · uneven = เผื่อเย็บไม่เท่ากันทุกด้าน (ใช้ค่าน้อยสุด) · open = มีเส้นที่ต่อไม่ครบวง (ข้ามไป) · nocut = ไม่มีเส้นตัด ใช้เส้นเย็บเป็นรูปชิ้น */
export type DxfNote = "spline" | "uneven" | "open" | "nocut";
export type DxfImport = { pieces: DxfPiece[]; unit: DxfUnit; detected: DxfUnit | null; notes: DxfNote[]; width: number; height: number };

// ───────────────────────── 1) แตกไฟล์เป็นเส้น ─────────────────────────
type Rec = { type: string; g: [number, string][] };
type Ent =
  | { t: "poly"; layer: string; pts: Pt[]; closed: boolean; grp: number }
  | { t: "point"; layer: string; p: Pt; grp: number }
  | { t: "text"; layer: string; p: Pt; s: string; grp: number };
type Raw = { layer: string } & (
  | { t: "poly"; pts: Pt[]; closed: boolean }
  | { t: "point"; p: Pt }
  | { t: "text"; p: Pt; s: string }
  | { t: "insert"; name: string; p: Pt; sx: number; sy: number; rot: number });

const num = (v: string | undefined) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const one = (r: Rec, code: number) => r.g.find(([c]) => c === code)?.[1];
const all = (r: Rec, code: number) => r.g.filter(([c]) => c === code).map(([, v]) => num(v));

/** ส่วนโค้งระหว่างจุด a → b ตามค่า bulge ของ DXF (0 = ตรง) → จุดระหว่างทาง (ไม่รวม a, b) */
function bulgePts(a: Pt, b: Pt, bulge: number): Pt[] {
  if (Math.abs(bulge) < 1e-9) return [];
  const th = 4 * Math.atan(bulge), d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(d > 1e-9)) return [];
  const r = d / (2 * Math.sin(th / 2)), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, h = r * Math.cos(th / 2);
  const cx = mx - ((b[1] - a[1]) / d) * h, cy = my + ((b[0] - a[0]) / d) * h;
  const a0 = Math.atan2(a[1] - cy, a[0] - cx), n = Math.max(2, Math.ceil(Math.abs(th) / (Math.PI / 18))), out: Pt[] = [];
  for (let i = 1; i < n; i++) { const an = a0 + (th * i) / n; out.push([cx + Math.abs(r) * Math.cos(an), cy + Math.abs(r) * Math.sin(an)]); }
  return out;
}
const arcPts = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, rot = 0): Pt[] => {
  let sweep = a1 - a0; while (sweep <= 0) sweep += 2 * Math.PI;
  const n = Math.max(6, Math.ceil(sweep / (Math.PI / 24))), out: Pt[] = [], c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i <= n; i++) { const an = a0 + (sweep * i) / n, x = rx * Math.cos(an), y = ry * Math.sin(an); out.push([cx + x * c - y * s, cy + x * s + y * c]); }
  return out;
};
const withBulges = (V: { p: Pt; b: number }[], closed: boolean): Pt[] => {
  const out: Pt[] = [];
  V.forEach((v, i) => { out.push(v.p); const nx = V[i + 1] ?? (closed ? V[0] : null); if (nx && v.b) out.push(...bulgePts(v.p, nx.p, v.b)); });
  return out;
};

function readRecords(text: string): Rec[] {
  const L = text.split(/\r\n|\r|\n/), out: Rec[] = [];
  let cur: Rec | null = null;
  for (let i = 0; i + 1 < L.length; i += 2) {
    const code = parseInt(L[i].trim(), 10), val = L[i + 1].trim();
    if (!Number.isFinite(code)) continue;
    if (code === 0) { cur = { type: val.toUpperCase(), g: [] }; out.push(cur); } else cur?.g.push([code, val]);
  }
  return out;
}

/** อ่านไฟล์ → เส้นทั้งหมด (แตกบล็อกที่ถูกวางแล้ว) · grp = ลำดับของบล็อกที่วาง (ชิ้นแบบ AAMA) · 0 = เส้นลอย */
function readEntities(text: string): { ents: Ent[]; insunits: number | null; spline: boolean; stacked: boolean } {
  const R = readRecords(text);
  const blocks = new Map<string, Raw[]>(), top: Raw[] = [];
  let section = "", block: Raw[] | null = null, insunits: number | null = null, spline = false;
  for (let i = 0; i < R.length; i++) {
    const r = R[i], layer = (one(r, 8) ?? "0").toUpperCase(), into = block ?? (section === "ENTITIES" ? top : null);
    if (r.type === "SECTION") { section = (one(r, 2) ?? "").toUpperCase(); if (section === "HEADER") { const k = r.g.findIndex(([c, v]) => c === 9 && v.toUpperCase() === "$INSUNITS"); if (k >= 0) insunits = num(r.g.slice(k + 1).find(([c]) => c === 70)?.[1]); } continue; }
    if (r.type === "ENDSEC") { section = ""; continue; }
    if (r.type === "BLOCK") { block = []; blocks.set((one(r, 2) ?? "").toUpperCase(), block); continue; }
    if (r.type === "ENDBLK") { block = null; continue; }
    if (!into) continue;
    const xs = all(r, 10), ys = all(r, 20);
    if (r.type === "LINE") into.push({ t: "poly", layer, closed: false, pts: [[xs[0] ?? 0, ys[0] ?? 0], [num(one(r, 11)), num(one(r, 21))]] });
    else if (r.type === "LWPOLYLINE") {
      // bulge (42) ของจุดอยู่หลังพิกัดของจุดนั้น → ไล่ตามลำดับในไฟล์
      const V: { p: Pt; b: number }[] = [];
      for (let k = 0; k < r.g.length; k++) { const [c, v] = r.g[k]; if (c === 10) V.push({ p: [num(v), 0], b: 0 }); else if (c === 20 && V.length) V[V.length - 1].p[1] = num(v); else if (c === 42 && V.length) V[V.length - 1].b = num(v); }
      const closed = (num(one(r, 70)) & 1) === 1;
      if (V.length >= 2) into.push({ t: "poly", layer, closed, pts: withBulges(V, closed) });
    } else if (r.type === "POLYLINE") {
      const closed = (num(one(r, 70)) & 1) === 1, V: { p: Pt; b: number }[] = [];
      for (i++; i < R.length && R[i].type === "VERTEX"; i++) { if ((num(one(R[i], 70)) & 16) === 16) continue; V.push({ p: [num(one(R[i], 10)), num(one(R[i], 20))], b: num(one(R[i], 42)) }); }
      if (i < R.length && R[i].type !== "SEQEND") i--;
      if (V.length >= 2) into.push({ t: "poly", layer, closed, pts: withBulges(V, closed) });
    } else if (r.type === "CIRCLE") { const rad = num(one(r, 40)); into.push({ t: "poly", layer, closed: true, pts: arcPts(xs[0] ?? 0, ys[0] ?? 0, rad, rad, 0, 2 * Math.PI).slice(0, -1) }); }
    else if (r.type === "ARC") { const rad = num(one(r, 40)); into.push({ t: "poly", layer, closed: false, pts: arcPts(xs[0] ?? 0, ys[0] ?? 0, rad, rad, (num(one(r, 50)) * Math.PI) / 180, (num(one(r, 51)) * Math.PI) / 180) }); }
    else if (r.type === "ELLIPSE") {
      const mx = num(one(r, 11)), my = num(one(r, 21)), rx = Math.hypot(mx, my), ratio = num(one(r, 40)) || 1, a0 = num(one(r, 41)), a1 = one(r, 42) != null ? num(one(r, 42)) : 2 * Math.PI;
      const full = Math.abs(a1 - a0 - 2 * Math.PI) < 1e-6, P = arcPts(xs[0] ?? 0, ys[0] ?? 0, rx, rx * ratio, a0, a1, Math.atan2(my, mx));
      into.push({ t: "poly", layer, closed: full, pts: full ? P.slice(0, -1) : P });
    } else if (r.type === "SPLINE") {
      const fx = all(r, 11), fy = all(r, 21), P: Pt[] = (fx.length >= 2 ? fx.map((x, k) => [x, fy[k] ?? 0] as Pt) : xs.map((x, k) => [x, ys[k] ?? 0] as Pt));
      if (P.length >= 2) { spline = true; into.push({ t: "poly", layer, closed: (num(one(r, 70)) & 1) === 1, pts: P }); }
    } else if (r.type === "POINT") into.push({ t: "point", layer, p: [xs[0] ?? 0, ys[0] ?? 0] });
    else if (r.type === "TEXT" || r.type === "MTEXT") { const s = (one(r, 1) ?? "").trim(); if (s) into.push({ t: "text", layer, p: [xs[0] ?? 0, ys[0] ?? 0], s }); }
    else if (r.type === "INSERT") into.push({ t: "insert", layer, name: (one(r, 2) ?? "").toUpperCase(), p: [xs[0] ?? 0, ys[0] ?? 0], sx: one(r, 41) != null ? num(one(r, 41)) : 1, sy: one(r, 42) != null ? num(one(r, 42)) : 1, rot: (num(one(r, 50)) * Math.PI) / 180 });
  }
  const ents: Ent[] = [];
  let grp = 0;
  const place = (list: Raw[], f: (p: Pt) => Pt, g: number, depth: number) => {
    for (const e of list) {
      if (e.t === "insert") {
        const b = blocks.get(e.name); if (!b || depth > 4) continue;
        const c = Math.cos(e.rot), s = Math.sin(e.rot), ins = e;
        place(b, (p) => f([ins.p[0] + p[0] * ins.sx * c - p[1] * ins.sy * s, ins.p[1] + p[0] * ins.sx * s + p[1] * ins.sy * c]), depth === 0 ? ++grp : g, depth + 1);
      } else if (e.t === "poly") ents.push({ t: "poly", layer: e.layer, closed: e.closed, pts: e.pts.map(f), grp: g });
      else if (e.t === "point") ents.push({ t: "point", layer: e.layer, p: f(e.p), grp: g });
      else ents.push({ t: "text", layer: e.layer, p: f(e.p), s: e.s, grp: g });
    }
  };
  place(top, (p) => p, 0, 0);
  // ไฟล์ที่มีแต่บล็อก ไม่ได้วางลงพื้นที่ → ถือว่าแต่ละบล็อกคือ 1 ชิ้น (เรียงต่อกันทีหลัง)
  let stacked = false;
  if (!ents.some((e) => e.t === "poly")) { stacked = true; for (const [name, b] of blocks) { if (name.startsWith("*")) continue; place(b, (p) => p, ++grp, 1); } }
  return { ents, insunits, spline, stacked };
}

// ───────────────────────── 2) ต่อเส้นเป็นวง + หาชิ้น ─────────────────────────
type Role = "cut" | "sew" | "hole" | "inner" | "fold" | "notch" | "grain" | "skip";
const roleOf = (layer: string): Role => {
  const L = layer.trim();
  if (L === "SEW" || L === "14") return "sew";
  if (L === "HOLE") return "hole";
  if (L === "INNER" || L === "8") return "inner";
  if (L === "FOLD" || L === "6") return "fold";
  if (L === "NOTCH" || L === "4") return "notch";
  if (L === "GRAIN" || L === "7") return "grain";
  if (L === "LABEL" || L === "15" || L === "2" || L === "3" || L === "5" || L === "13") return "skip";
  return "cut";
};
const area = (P: Pt[]) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
const lenOf = (P: Pt[]) => { let l = 0; for (let i = 1; i < P.length; i++) l += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return l; };

/** ต่อเส้นเปิดที่ปลายชนกันให้เป็นเส้นยาว/วงปิด (tol = ระยะที่ถือว่าเป็นจุดเดียวกัน) */
function chain(open: Pt[][], tol: number): { loops: Pt[][]; rest: Pt[][] } {
  const key = (p: Pt) => `${Math.round(p[0] / tol)}_${Math.round(p[1] / tol)}`;
  const ends = new Map<string, number[]>();
  open.forEach((P, i) => { for (const k of [key(P[0]), key(P[P.length - 1])]) (ends.get(k) ?? ends.set(k, []).get(k)!).push(i); });
  const used = new Array(open.length).fill(false), loops: Pt[][] = [], rest: Pt[][] = [];
  const grow = (C: Pt[], atEnd: boolean): boolean => {
    const tip = atEnd ? C[C.length - 1] : C[0], k = key(tip), j = (ends.get(k) ?? []).find((x) => !used[x]);
    if (j == null) return false;
    used[j] = true;
    const S = key(open[j][0]) === k ? open[j] : [...open[j]].reverse();
    if (atEnd) C.push(...S.slice(1)); else C.unshift(...[...S].reverse().slice(0, -1));
    return true;
  };
  open.forEach((P, i) => {
    if (used[i]) return;
    used[i] = true;
    const C = [...P];
    while (key(C[0]) !== key(C[C.length - 1]) && grow(C, true)) { /* ต่อท้าย */ }
    while (key(C[0]) !== key(C[C.length - 1]) && grow(C, false)) { /* ต่อหัว */ }
    if (C.length >= 4 && key(C[0]) === key(C[C.length - 1])) loops.push(C.slice(0, -1)); else rest.push(C);
  });
  return { loops, rest };
}

// ───────────────────────── 3) จุดถี่ ๆ → ขอบตรง / ขอบโค้ง ─────────────────────────
const CORNER = (30 * Math.PI) / 180;   // หักเกินนี้ = มุม (ไม่ใช่ส่วนของเส้นโค้ง)
const FIT_TOL = 0.04;                  // เส้นโค้งที่หาได้ ห่างจากจุดเดิมไม่เกินนี้ (ซม.)
const unit = (x: number, y: number): Pt => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
type Bez = [Pt, Pt, Pt, Pt];
const bezAt = (b: Bez, t: number): Pt => { const v = 1 - t; return [v * v * v * b[0][0] + 3 * v * v * t * b[1][0] + 3 * v * t * t * b[2][0] + t * t * t * b[3][0], v * v * v * b[0][1] + 3 * v * v * t * b[1][1] + 3 * v * t * t * b[2][1] + t * t * t * b[3][1]]; };

/** หาเส้นโค้ง (cubic) ที่ทับจุดของช่วง P โดยปลายสองข้างมีทิศ t1, t2 — ไม่พอดี = แบ่งช่วงแล้วหาใหม่ */
function fitRun(P: Pt[], t1: Pt, t2: Pt, depth = 0): Bez[] {
  const a = P[0], b = P[P.length - 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (P.length === 2 || d < 1e-6) return [[a, [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], [a[0] + ((b[0] - a[0]) * 2) / 3, a[1] + ((b[1] - a[1]) * 2) / 3], b]];
  let u = [0]; for (let i = 1; i < P.length; i++) u.push(u[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const tot = u[u.length - 1] || 1; u = u.map((v) => v / tot);
  // หาเส้นโค้งที่ใกล้จุดที่สุด (กำลังสองน้อยสุด) สำหรับตำแหน่ง u ของแต่ละจุด
  const gen = (U: number[]): Bez => {
    let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
    for (let i = 0; i < P.length; i++) {
      const t = U[i], v = 1 - t, b0 = v * v * v, b1 = 3 * v * v * t, b2 = 3 * v * t * t, b3 = t * t * t;
      const a1: Pt = [t1[0] * b1, t1[1] * b1], a2: Pt = [t2[0] * b2, t2[1] * b2];
      const px = P[i][0] - (a[0] * (b0 + b1) + b[0] * (b2 + b3)), py = P[i][1] - (a[1] * (b0 + b1) + b[1] * (b2 + b3));
      c00 += a1[0] * a1[0] + a1[1] * a1[1]; c01 += a1[0] * a2[0] + a1[1] * a2[1]; c11 += a2[0] * a2[0] + a2[1] * a2[1];
      x0 += a1[0] * px + a1[1] * py; x1 += a2[0] * px + a2[1] * py;
    }
    const det = c00 * c11 - c01 * c01;
    let al = Math.abs(det) > 1e-12 ? (x0 * c11 - x1 * c01) / det : 0, ar = Math.abs(det) > 1e-12 ? (c00 * x1 - c01 * x0) / det : 0;
    if (!(al > d * 1e-3) || !(ar > d * 1e-3)) al = ar = d / 3;
    return [a, [a[0] + t1[0] * al, a[1] + t1[1] * al], [b[0] + t2[0] * ar, b[1] + t2[1] * ar], b];
  };
  const errOf = (z: Bez, U: number[]) => { let w = 0, k = Math.floor(P.length / 2); for (let i = 1; i < P.length - 1; i++) { const q = bezAt(z, U[i]), e = Math.hypot(q[0] - P[i][0], q[1] - P[i][1]); if (e > w) { w = e; k = i; } } return { w, k }; };
  // ขยับตำแหน่ง u ของแต่ละจุดให้ตรงกับจุดที่ใกล้ที่สุดบนเส้นโค้ง (นิวตัน 1 รอบ) — ทำซ้ำไม่กี่รอบก่อนยอมแบ่งช่วง
  const refine = (z: Bez, U: number[]) => U.map((t, i) => {
    const v = 1 - t, q = bezAt(z, t);
    const d1: Pt = [3 * (v * v * (z[1][0] - z[0][0]) + 2 * v * t * (z[2][0] - z[1][0]) + t * t * (z[3][0] - z[2][0])), 3 * (v * v * (z[1][1] - z[0][1]) + 2 * v * t * (z[2][1] - z[1][1]) + t * t * (z[3][1] - z[2][1]))];
    const d2: Pt = [6 * (v * (z[2][0] - 2 * z[1][0] + z[0][0]) + t * (z[3][0] - 2 * z[2][0] + z[1][0])), 6 * (v * (z[2][1] - 2 * z[1][1] + z[0][1]) + t * (z[3][1] - 2 * z[2][1] + z[1][1]))];
    const ex = q[0] - P[i][0], ey = q[1] - P[i][1], den = d1[0] * d1[0] + d1[1] * d1[1] + ex * d2[0] + ey * d2[1];
    return Math.abs(den) < 1e-12 ? t : Math.min(1, Math.max(0, t - (ex * d1[0] + ey * d1[1]) / den));
  });
  let bez = gen(u), { w: worst, k: at } = errOf(bez, u);
  for (let it = 0; it < 6 && worst > FIT_TOL && worst < FIT_TOL * 40; it++) { u = refine(bez, u); bez = gen(u); ({ w: worst, k: at } = errOf(bez, u)); }
  if (worst <= FIT_TOL || depth >= 5 || P.length < 4) return [bez];
  const tc = unit(P[at - 1][0] - P[at + 1][0], P[at - 1][1] - P[at + 1][1]);
  return [...fitRun(P.slice(0, at + 1), t1, tc, depth + 1), ...fitRun(P.slice(at), [-tc[0], -tc[1]], t2, depth + 1)];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** วงปิด (จุดเป็น ซม.) → รูปทรงของตัววาด: สี่เหลี่ยมตรงแกน = สี่เหลี่ยม · อื่น ๆ = เส้นทางที่มุมเป็นจุดมุม และช่วงโค้งเป็นขอบโค้ง */
export function loopShape(loop: Pt[]): Shape | null {
  // ตัดจุดซ้ำ + จุดที่อยู่บนเส้นตรงเดียวกัน
  let P = loop.filter((q, i) => { const p = loop[(i + loop.length - 1) % loop.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-4; });
  P = P.filter((q, i) => { const p = P[(i + P.length - 1) % P.length], n = P[(i + 1) % P.length]; return Math.abs((q[0] - p[0]) * (n[1] - q[1]) - (q[1] - p[1]) * (n[0] - q[0])) > 1e-6 * Math.max(1, Math.hypot(n[0] - p[0], n[1] - p[1])); });
  if (P.length < 3) return null;
  const bx = polyBox(P);
  if (P.length === 4 && P.every(([x, y]) => (Math.abs(x - bx.x) < 1e-3 || Math.abs(x - bx.x - bx.w) < 1e-3) && (Math.abs(y - bx.y) < 1e-3 || Math.abs(y - bx.y - bx.h) < 1e-3))) return { k: "rect", x: r3(bx.x), y: r3(bx.y), w: r3(bx.w), h: r3(bx.h) };
  const n = P.length, turn = (i: number) => { const p = P[(i + n - 1) % n], q = P[i], x = P[(i + 1) % n]; return Math.abs(Math.atan2((q[0] - p[0]) * (x[1] - q[1]) - (q[1] - p[1]) * (x[0] - q[0]), (q[0] - p[0]) * (x[0] - q[0]) + (q[1] - p[1]) * (x[1] - q[1]))); };
  let corners = P.map((_, i) => i).filter((i) => turn(i) > CORNER);
  const smooth = corners.length === 0;
  if (smooth) corners = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)].filter((v, i, A) => A.indexOf(v) === i);   // วงโค้งล้วน (วงกลม/วงรี) = แบ่ง 4 ช่วง
  const nodes: PNode[] = [];
  corners.forEach((c, k) => {
    const e = corners[(k + 1) % corners.length], run: Pt[] = [];
    for (let i = c; ; i = (i + 1) % n) { run.push(P[i]); if (i === e && run.length > 1) break; }
    const tan = (i: number, dir: 1 | -1): Pt => (smooth ? unit((P[(i + 1) % n][0] - P[(i + n - 1) % n][0]) * dir, (P[(i + 1) % n][1] - P[(i + n - 1) % n][1]) * dir) : dir > 0 ? unit(run[1][0] - run[0][0], run[1][1] - run[0][1]) : unit(run[run.length - 2][0] - run[run.length - 1][0], run[run.length - 2][1] - run[run.length - 1][1]));
    const B = fitRun(run, tan(c, 1), tan(e, -1)), straight = run.length === 2;
    B.forEach((b, j) => {
      if (j === 0 && k === 0) nodes.push({ x: r3(b[0][0]), y: r3(b[0][1]) });
      const from = nodes[nodes.length - 1];
      if (!straight) { from.ox = r3(b[1][0] - b[0][0]); from.oy = r3(b[1][1] - b[0][1]); }
      const last = k === corners.length - 1 && j === B.length - 1, to: PNode = last ? nodes[0] : { x: r3(b[3][0]), y: r3(b[3][1]) };
      if (!straight) { to.ix = r3(b[2][0] - b[3][0]); to.iy = r3(b[2][1] - b[3][1]); }
      if (!last) nodes.push(to);
    });
  });
  return nodes.length >= 2 ? { k: "path", nodes } : null;
}

// ───────────────────────── 4) รวมเป็นชิ้น ─────────────────────────
/** หน่วยจากหัวไฟล์ DXF ($INSUNITS: 1 = นิ้ว · 4 = มม. · 5 = ซม.) — ไม่มี/ไม่รู้จัก = null */
const unitOf = (ins: number | null): DxfUnit | null => (ins === 1 ? "inch" : ins === 4 ? "mm" : ins === 5 ? "cm" : null);

/** อ่านไฟล์ DXF เป็นชิ้นแพทเทิร์น — unit ไม่ส่ง = ใช้หน่วยจากหัวไฟล์ (ไม่มี = มม.) · อ่านไม่ได้ / ไม่มีวงปิดเลย = null */
export function parseDxfPattern(text: string, unit?: DxfUnit): DxfImport | null {
  if (!/(^|\n)\s*0\s*\r?\n\s*SECTION/i.test(text)) return null;
  const { ents, insunits, spline, stacked } = readEntities(text);
  const detected = unitOf(insunits), use = unit ?? detected ?? "mm", k = DXF_UNIT_CM[use];
  if (!ents.length) return null;
  const notes = new Set<DxfNote>();
  if (spline) notes.add("spline");
  const tol = 0.02;                                                // ปลายเส้นห่างกันไม่เกิน 0.2 มม. = จุดเดียวกัน
  // ไฟล์ที่มีแต่บล็อก (ไม่ได้วางลงพื้นที่) ทุกชิ้นกองอยู่ที่จุดเดียวกัน → เรียงต่อกันทางขวา ห่างกัน 3 ซม.
  const shift = new Map<number, Pt>();
  if (stacked) {
    let cur = 0;
    for (const g of [...new Set(ents.map((e) => e.grp))]) {
      let a = Infinity, b = -Infinity, top = Infinity;
      for (const e of ents) if (e.grp === g && e.t === "poly") for (const p of e.pts) { a = Math.min(a, p[0] * k); b = Math.max(b, p[0] * k); top = Math.min(top, -p[1] * k); }
      if (a === Infinity) continue;
      shift.set(g, [cur - a, -top]); cur += b - a + 3;
    }
  }
  let off: Pt = [0, 0];
  const cm = (p: Pt): Pt => [p[0] * k + off[0], -p[1] * k + off[1]];   // หน่วยของไฟล์ → ซม. · แกน y ของ DXF ชี้ขึ้น → กลับให้ชี้ลงแบบกระดาน
  type Found = { cut: Pt[]; sew: Pt[] | null; holes: Pt[][]; inner: { pts: Pt[]; kind: InnerLine["kind"] }[]; notch: Pt[]; grain: Pt[][]; texts: string[]; grp: number };
  const found: Found[] = [];
  const groups = [...new Set(ents.map((e) => e.grp))];
  for (const g of groups) {
    const E = ents.filter((e) => e.grp === g);
    off = shift.get(g) ?? [0, 0];
    const loops: Record<"cut" | "sew" | "hole", Pt[][]> = { cut: [], sew: [], hole: [] }, openOf: Record<"cut" | "sew" | "hole", Pt[][]> = { cut: [], sew: [], hole: [] };
    const inner: Found["inner"] = [], notch: Pt[] = [], grain: Pt[][] = [];
    for (const e of E) {
      const role = roleOf(e.layer);
      if (e.t === "point") { if (role === "notch") notch.push(cm(e.p)); continue; }
      if (e.t !== "poly" || role === "skip") continue;
      const P = e.pts.map(cm);
      if (role === "notch") { notch.push(P[0]); continue; }
      if (role === "grain") { grain.push(P); continue; }
      if (role === "inner" || role === "fold") { inner.push({ pts: e.closed ? [...P, P[0]] : P, kind: role === "fold" ? "fold" : "mark" }); continue; }
      if (e.closed && P.length >= 3) loops[role].push(P); else if (P.length >= 2) openOf[role].push(P);
    }
    for (const r of ["cut", "sew", "hole"] as const) {
      const c = chain(openOf[r], tol);
      loops[r].push(...c.loops);
      // เส้นเปิดในชั้นเส้นตัด/ไม่รู้จัก = เส้นใน (ถ้าอยู่ในชิ้น) · ชั้นอื่นที่ต่อไม่ครบวง = ข้าม
      for (const P of c.rest) { if (r === "cut" && lenOf(P) > 0.3) inner.push({ pts: P, kind: "mark" }); else if (lenOf(P) > 0.3) notes.add("open"); }
    }
    let outer = loops.cut.filter((P) => !loops.cut.some((Q) => Q !== P && area(Q) > area(P) && pointInPolygon(P[0], Q)));
    if (!outer.length && loops.sew.length) { outer = loops.sew.filter((P) => !loops.sew.some((Q) => Q !== P && area(Q) > area(P) && pointInPolygon(P[0], Q))); notes.add("nocut"); }
    const texts = E.filter((e): e is Extract<Ent, { t: "text" }> => e.t === "text");
    for (const O of outer) {
      const inside = (p: Pt) => pointInPolygon(p, O);
      let sew = loops.sew.filter((S) => S !== O && inside(S[0])).sort((a, b) => area(b) - area(a))[0] ?? null;
      let holes = [...loops.cut, ...loops.hole].filter((H) => H !== O && inside(H[0]));
      // ไม่มีชั้นเส้นเย็บ แต่มีวงข้างในที่ใหญ่เกือบเท่าเส้นตัด (เกิน 70%) = เส้นเย็บที่อยู่ชั้นเดียวกับเส้นตัด
      if (!sew) { const big = holes.filter((H) => area(H) > area(O) * 0.7).sort((a, b) => area(b) - area(a))[0]; if (big) { sew = big; holes = holes.filter((H) => H !== big); } }
      found.push({
        cut: O, sew, holes, grp: g,
        inner: inner.filter((l) => inside(l.pts[Math.floor(l.pts.length / 2)])),
        notch: notch.filter((p) => { const pr = projectOnOutline(sew ?? O, p); return pr.d < 2.5; }),
        grain: grain.filter((P) => inside(P[0]) || inside(P[P.length - 1])),
        texts: texts.filter((t) => g !== 0 || inside(cm(t.p))).map((t) => t.s),
      });
    }
  }
  if (!found.length) return null;
  // บล็อกที่ไม่ได้ถูกวาง (ทุกชิ้นกองที่จุดเดียวกัน) → เรียงต่อกันทางขวา
  let x0 = Infinity, y0 = Infinity;
  for (const f of found) { const b = polyBox(f.cut); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); }
  let n = 0, width = 0, height = 0;
  const pieces: DxfPiece[] = [];
  for (const f of found) {
    const base = f.sew ?? f.cut, sh = (p: Pt): Pt => [r3(p[0] - x0), r3(p[1] - y0)];
    const shape = loopShape(base.map(sh));
    if (!shape) continue;
    const cb = polyBox(f.cut), sb = polyBox(base);
    let allow = 0;
    if (f.sew) { const ax = (cb.w - sb.w) / 2, ay = (cb.h - sb.h) / 2; allow = Math.min(MAX_ALLOW, Math.max(0, Math.round(Math.min(ax, ay) * 10) / 10)); if (Math.abs(ax - ay) > 0.15) notes.add("uneven"); }
    const name = f.texts.map((s) => /piece\s*name\s*:\s*(.+)/i.exec(s)?.[1]?.trim()).find(Boolean) ?? "";
    const qty = f.texts.map((s) => /quantity\s*:\s*(\d+)/i.exec(s)?.[1] ?? /\sx(\d+)\s*$/i.exec(s)?.[1]).find(Boolean);
    const g = f.grain.sort((a, b) => lenOf(b) - lenOf(a))[0];
    const outline = base.map(sh);
    pieces.push({
      name: name.slice(0, 60), count: Math.min(999, Math.max(1, Number(qty) || 1)), shape, allow,
      holes: f.holes.map((H) => loopShape(H.map(sh))).filter((s): s is Shape => !!s).slice(0, 40),
      inner: f.inner.slice(0, 40).map((l, i) => ({ id: `dx${n}i${i}`, kind: l.kind, pts: l.pts.slice(0, 60).map(sh) })),
      notches: f.notch.map((p) => projectOnOutline(outline, sh(p)).at).slice(0, 100),
      grain: g && g.length >= 2 ? [sh(g[0]), sh(g[g.length - 1])] : null,
      at: [r3(sb.x - x0), r3(sb.y - y0)], w: Math.round(sb.w * 10) / 10, h: Math.round(sb.h * 10) / 10,
      edges: shape.k === "rect" ? 4 : shape.k === "ellipse" ? 1 : shape.nodes.length,
    });
    width = Math.max(width, cb.x - x0 + cb.w); height = Math.max(height, cb.y - y0 + cb.h);
    n++;
  }
  if (!pieces.length) return null;
  pieces.sort((a, b) => a.at[1] - b.at[1] || a.at[0] - b.at[0]);
  return { pieces, unit: use, detected, notes: [...notes], width: Math.round(width * 10) / 10, height: Math.round(height * 10) / 10 };
}
