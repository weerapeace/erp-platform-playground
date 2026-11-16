/**
 * 🧭 ช่วยหลังนำเข้าแพทเทิร์น (Bag CAD รอบ J1) — สูตรบริสุทธิ์ ไม่มีหน้าจอ
 *   ไฟล์ DXF (เช่น จาก CLO3D) มีแค่รูปชิ้น ไม่มีตะเข็บ ชื่อเป็นเลข (Pattern_31621) และไม่รู้ว่าชิ้นไหนคือชิ้นอะไร
 *   1) guessPieceTypes — เดาชนิดชิ้นจากขนาด/สัดส่วน: ตัวกระเป๋า · ข้าง · ก้น · หู · แถบซิป · ช่องใส่ของ · แถบเล็ก · อื่น ๆ
 *   2) autoNames — ตั้งชื่อไทยตามชนิด (ตัวหน้า ตัวหลัง ชิ้นข้าง 1 …)
 *   3) groupIdentical — ชิ้นที่เส้นรอบเหมือนกัน (รวมกลับซ้าย-ขวา) → ผูกเป็นชุด (ชิ้นแรก = ต้นแบบ)
 *   4) suggestSeams — จับคู่ขอบ (1–4 ขอบต่อกัน) ที่ยาวเท่ากันระหว่างชิ้น ตามชนิดที่เย็บเข้ากันได้ · ขอบหนึ่งใช้ได้ครั้งเดียว
 *   5) handleSpots — กรอบสี่เหลี่ยมเล็กในตัวกระเป๋า/ก้น = ตำแหน่งติดหู (ใช้ต่อรอบ J2)
 *
 * ใช้ที่: components/pattern-studio/dxf-modal (หน้าตรวจหลังนำเข้า) · เทสต์ lib/__tests__/pattern-import-assist.test.ts
 */
import { flattenShape, pieceGeometry, shapeBox, type InnerLine, type Pt, type Shape } from "./pattern-shape";
import { pieceEdges } from "./pattern-seams";

export type PartType = "body" | "side" | "base" | "handle" | "zip" | "pocket" | "tab" | "other";
export const PART_TYPES: { key: PartType; th: string; en: string }[] = [
  { key: "body", th: "ตัวกระเป๋า", en: "Body panel" }, { key: "side", th: "ชิ้นข้าง", en: "Side / gusset" }, { key: "base", th: "ก้น", en: "Base" },
  { key: "handle", th: "หู", en: "Handle" }, { key: "zip", th: "แถบซิป", en: "Zip strip" }, { key: "pocket", th: "ช่องใส่ของ", en: "Pocket" },
  { key: "tab", th: "แถบเล็ก / ห่วง", en: "Tab / loop" }, { key: "other", th: "อื่น ๆ", en: "Other" },
];
type AP = { shape: Shape; holes?: Shape[]; inner?: InnerLine[] | null };

const areaOf = (P: Pt[]) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
const outlineArea = (s: Shape) => areaOf(flattenShape(s, 16));

/** เดาชนิดชิ้นจากขนาด: เล็กมาก = แถบเล็ก · ยาวแคบ = หู/แถบซิป · ใหญ่สุด = ตัวกระเป๋า · ยาวปานกลาง = ก้น · ซ้ำหลายชิ้น = ข้าง */
export function guessPieceTypes(pieces: AP[]): PartType[] {
  const info = pieces.map((p) => { const b = shapeBox(p.shape), L = Math.max(b.w, b.h), S = Math.min(b.w, b.h); return { L, S, A: outlineArea(p.shape), asp: S > 0 ? L / S : 99 }; });
  const out: PartType[] = info.map((x) => (x.A < 30 ? "tab" : x.asp >= 8 ? (x.L < 30 ? "tab" : x.S >= 2.5 ? "handle" : "zip") : "other"));
  const rest = info.map((x, i) => ({ ...x, i })).filter((x) => out[x.i] === "other").sort((a, b) => b.A - a.A);
  if (!rest.length) return out;
  const maxA = rest[0].A;
  for (const x of rest) if (x.A >= maxA * 0.8 && x.asp < 4) out[x.i] = "body";
  const groups = groupIdentical(pieces);
  const groupSize = (i: number) => groups.find((g) => g.members.includes(i))?.members.length ?? 1;
  for (const x of rest) {
    if (out[x.i] !== "other") continue;
    if (x.asp >= 2.6 && x.asp < 8) out[x.i] = "base";
    else if (groupSize(x.i) >= 2) out[x.i] = "side";
    else if (pieces[x.i].shape.k === "rect" || pieceEdges(pieces[x.i].shape).length === 4) out[x.i] = "pocket";
  }
  return out;
}

/** ชื่อไทยตามชนิด: ตัวกระเป๋า 2 ชิ้นแรก = ตัวหน้า / ตัวหลัง · ที่เหลือนับเลขในชนิด (ชนิดที่มีชิ้นเดียวไม่ใส่เลข) */
export function autoNames(types: PartType[], lang: "th" | "en" = "th"): string[] {
  const total = new Map<PartType, number>(), seen = new Map<PartType, number>();
  for (const t of types) total.set(t, (total.get(t) ?? 0) + 1);
  return types.map((t) => {
    const k = (seen.get(t) ?? 0) + 1; seen.set(t, k);
    if (t === "body" && (total.get(t) ?? 0) <= 2) return lang === "th" ? (k === 1 ? "ตัวหน้า" : "ตัวหลัง") : (k === 1 ? "Front" : "Back");
    const d = PART_TYPES.find((x) => x.key === t)!, base = lang === "th" ? d.th.split(" / ")[0] : d.en.split(" / ")[0];
    return (total.get(t) ?? 0) > 1 ? `${base} ${k}` : base;
  });
}

/** ลำดับความยาวขอบรอบชิ้น (วนได้) — ใช้เทียบว่าเส้นรอบเหมือนกันไหม */
const edgeSig = (s: Shape) => pieceEdges(s).map((e) => e.len);
function cyclicMatch(a: number[], b: number[], tol: number): boolean {
  if (a.length !== b.length) return false;
  const n = a.length;
  for (let k = 0; k < n; k++) { let ok = true; for (let i = 0; i < n && ok; i++) if (Math.abs(a[i] - b[(i + k) % n]) > tol) ok = false; if (ok) return true; }
  return false;
}
/** กลุ่มชิ้นที่เส้นรอบเหมือนกัน (ขนาดกรอบ พื้นที่ และความยาวขอบเรียงรอบชิ้นตรงกัน) · mirror = ชิ้นนั้นกลับซ้าย-ขวาจากต้นแบบ */
export function groupIdentical(pieces: AP[], tol = 0.15): { members: number[]; mirror: boolean[] }[] {
  const meta = pieces.map((p) => { const b = shapeBox(p.shape); return { w: b.w, h: b.h, A: outlineArea(p.shape), sig: edgeSig(p.shape) }; });
  const used = new Set<number>(), out: { members: number[]; mirror: boolean[] }[] = [];
  for (let i = 0; i < pieces.length; i++) {
    if (used.has(i)) continue;
    const g = { members: [i], mirror: [false] };
    for (let j = i + 1; j < pieces.length; j++) {
      if (used.has(j)) continue;
      const a = meta[i], b = meta[j];
      if (Math.abs(a.w - b.w) > tol * 2 || Math.abs(a.h - b.h) > tol * 2 || Math.abs(a.A - b.A) > Math.max(0.5, a.A * 0.01)) continue;
      if (cyclicMatch(a.sig, b.sig, tol)) { g.members.push(j); g.mirror.push(false); used.add(j); }
      else if (cyclicMatch(a.sig, [...b.sig].reverse(), tol)) { g.members.push(j); g.mirror.push(true); used.add(j); }
    }
    if (g.members.length > 1) { used.add(i); out.push(g); }
  }
  return out;
}

export type SeamSuggestion = { a: { i: number; from: number; count: number; n: number }; b: { i: number; from: number; count: number; n: number }; la: number; lb: number; /** ยาวต่างกัน (ซม. · 2 ตำแหน่ง) */ diff: number; pct: number; score: number };
/** ชนิดที่เย็บต่อกันได้ + น้ำหนัก (มาก = ควรเลือกก่อน) · หู แถบเล็ก ช่องใส่ของ ไม่จับคู่อัตโนมัติ (ติดด้วยเครื่องมือหู/อะไหล่/ช่อง) */
const PAIR_W: Record<string, number> = { "body|side": 1.25, "body|base": 1.25, "base|side": 1.15, "body|zip": 1.05, "side|side": 0.85, "base|base": 0.5, "body|body": 0.7, "zip|zip": 0.5, "other|body": 0.7, "other|side": 0.7, "other|base": 0.7, "other|zip": 0.6, "other|other": 0.6, "side|zip": 0.8, "base|zip": 0.6 };
const pairW = (a: PartType, b: PartType) => PAIR_W[[a, b].sort().join("|")] ?? 0;

/**
 * จับคู่ขอบที่ยาวเท่ากัน (ช่วงขอบ 1–4 ขอบต่อกัน) ระหว่างชิ้นต่างกัน
 *   ต่างกันได้ไม่เกิน max(0.4 ซม., 1.5%) · สั้นกว่า 3 ซม. ไม่นับ · ขอบเดียวกันของชิ้นเหมือนกัน 2 ชิ้น = ซ้อนชั้น ไม่ใช่ตะเข็บ
 *   เลือกแบบโลภ: คะแนน = ความยาว × ความตรง × น้ำหนักชนิด · ขอบที่ใช้แล้วไม่ใช้ซ้ำ
 */
export function suggestSeams(pieces: AP[], types: PartType[], opts: { maxRun?: number; limit?: number } = {}): SeamSuggestion[] {
  const maxRun = opts.maxRun ?? 4, limit = opts.limit ?? 60;
  const groups = groupIdentical(pieces), gid = new Map<number, number>();
  groups.forEach((g, k) => g.members.forEach((m) => gid.set(m, k)));
  // ช่วงขอบต่อกันได้เฉพาะรอยต่อที่เรียบ (หักไม่เกิน 40°) — ไม่พาดข้ามมุมชิ้น (เดิมข้ามมุมแล้วยาวเท่ากันโดยบังเอิญ)
  const runs = pieces.map((p) => {
    const E = pieceEdges(p.shape), n = E.length, out: { from: number; count: number; len: number; n: number }[] = [];
    const dir = (k: number, end: boolean) => { const P = E[k].pts, u = end ? [P[P.length - 2], P[P.length - 1]] : [P[0], P[1]]; return Math.atan2(u[1][1] - u[0][1], u[1][0] - u[0][0]); };
    const smooth = (k: number) => { let d = Math.abs(dir((k + 1) % n, false) - dir(k, true)); if (d > Math.PI) d = 2 * Math.PI - d; return d <= (40 * Math.PI) / 180; };
    for (let f = 0; f < n; f++) {
      let len = 0;
      for (let c = 1; c <= Math.min(maxRun, n - 1); c++) {
        if (c > 1 && !smooth((f + c - 2) % n)) break;
        len += E[(f + c - 1) % n].len;
        if (len >= 3) out.push({ from: f, count: c, len, n });
      }
    }
    return out;
  });
  const cand: SeamSuggestion[] = [];
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    const w = pairW(types[i], types[j]);
    if (!w) continue;
    const same = gid.has(i) && gid.get(i) === gid.get(j);
    for (const ra of runs[i]) for (const rb of runs[j]) {
      const d = Math.abs(ra.len - rb.len), mx = Math.max(ra.len, rb.len);
      if (d > Math.max(0.4, mx * 0.015)) continue;
      if (same && ra.from === rb.from && ra.count === rb.count) continue;
      const pct = Math.round((1 - d / mx) * 1000) / 10;
      cand.push({ a: { i, from: ra.from, count: ra.count, n: ra.n }, b: { i: j, from: rb.from, count: rb.count, n: rb.n }, la: Math.round(ra.len * 10) / 10, lb: Math.round(rb.len * 10) / 10, diff: Math.round(d * 100) / 100, pct, score: mx * (pct / 100) ** 4 * w / (1 + 0.08 * (ra.count + rb.count - 2)) });
    }
  }
  cand.sort((x, y) => y.score - x.score);
  const busy = pieces.map(() => new Set<number>()), out: SeamSuggestion[] = [];
  const edgesOf = (r: { from: number; count: number; n: number }) => Array.from({ length: r.count }, (_, k) => (r.from + k) % r.n);
  for (const c of cand) {
    const ea = edgesOf(c.a), eb = edgesOf(c.b);
    if (ea.some((e) => busy[c.a.i].has(e)) || eb.some((e) => busy[c.b.i].has(e))) continue;
    ea.forEach((e) => busy[c.a.i].add(e)); eb.forEach((e) => busy[c.b.i].add(e));
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * เส้นในรูปกรอบ/ตัว U ขนาดเล็ก (กว้าง/สูง 0.3–10 ซม. · 4 จุดขึ้นไป) บนตัวกระเป๋า/ข้าง/ก้น = ตำแหน่งติดหู/แถบ → id ของเส้นนั้นต่อชิ้น
 *   (CLO วาดตำแหน่งปลายหูเป็นกรอบหรือตัว U สีแดงในชิ้น · เส้นตรง 2 จุด / กรอบใหญ่ เช่น ตำแหน่งช่องใส่ของ ไม่นับ)
 */
export function handleSpots(pieces: AP[], types: PartType[]): string[][] {
  return pieces.map((p, i) => {
    if (types[i] !== "body" && types[i] !== "base" && types[i] !== "side") return [];
    return (p.inner ?? []).filter((l) => {
      if (l.pts.length < 4) return false;
      const xs = l.pts.map((q) => q[0]), ys = l.pts.map((q) => q[1]), w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
      return w >= 0.3 && h >= 0.3 && w <= 10 && h <= 10;
    }).map((l) => l.id);
  });
}

/** ขนาดสำเร็จของชิ้น (ไว้แสดงในรายการ) */
export const pieceArea = (p: AP) => Math.round(pieceGeometry({ shape: p.shape, holes: p.holes ?? [] }).finishedArea);

/** ตะเข็บที่ "มั่นใจ" (ติ๊กรับให้ก่อน): ตรง ≥ 98% · ชนิดที่ปกติเย็บกัน (ตัวกระเป๋า/ข้าง/ก้น/แถบซิป) · ยาวอย่างน้อย 8 ซม. */
export const isConfident = (s: SeamSuggestion, types: PartType[]) => s.pct >= 98 && pairW(types[s.a.i], types[s.b.i]) >= 0.8 && Math.min(s.la, s.lb) >= 8;
