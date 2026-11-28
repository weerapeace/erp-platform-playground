/**
 * ✂️ วางแบบบนผ้าลาย — สูตรล้วน (ไม่มีหน้าจอ · ใช้ได้ทั้ง API และหน้าเว็บ) · เทสต์ lib/__tests__/fabric-lay.test.ts
 *
 *   ผ้า (fabric)   = รูปผ้าที่ดัดตรงแล้ว + ขนาดจริง กว้าง×ยาว ซม. → พิกัดบนผ้า = ซม. (0,0 = มุมซ้ายบน)
 *   แบบตัด (pattern) = ชิ้นของกระเป๋า 1 แบบ · รูปชิ้น = lib/pattern-shape (เส้นเย็บ ซม.) + เผื่อเย็บ (allow) → เส้นตัด
 *   แผน (plan)     = กระเป๋าหลายใบ (bags) บนผ้า 1 ผืน + ชิ้นที่วาง (items: ตรงกลางชิ้นอยู่ที่ x,y ซม. · หมุน rot องศา · พลิก flip)
 *
 *   สูตรเรขาคณิต (เส้นตัด/เผื่อเย็บ/พลิก) ใช้ของกลาง lib/pattern-shape ทั้งหมด — ไม่เขียนซ้ำ
 *   หน้าจอ: components/fabric-lay · ภาพสรุป JPEG: components/fabric-lay/summary-image.ts
 */
import { cleanAllow, cleanShape, pieceGeometry, shapeBox, type Pt, type Shape } from "@/lib/pattern-shape";

// ─── ส่วนของกระเป๋า ──────────────────────────────────────────────────────────
export const LAY_PARTS = [
  { key: "front", th: "ด้านหน้า" },
  { key: "back", th: "ด้านหลัง" },
  { key: "side", th: "ด้านข้าง" },
  { key: "bottom", th: "ก้นกระเป๋า" },
  { key: "top", th: "ด้านบน / ขอบซิป" },
  { key: "flap", th: "ฝาปิด" },
  { key: "pocket", th: "ช่องกระเป๋า" },
  { key: "handle", th: "หูหิ้ว" },
  { key: "strap", th: "สายสะพาย" },
  { key: "lining", th: "ซับใน" },
  { key: "other", th: "อื่น ๆ" },
] as const;
export type LayPart = (typeof LAY_PARTS)[number]["key"];
export const partLabel = (k: string): string => LAY_PARTS.find((p) => p.key === k)?.th ?? "อื่น ๆ";
const isPart = (v: unknown): v is LayPart => LAY_PARTS.some((p) => p.key === v);

/** สีแยกกระเป๋าแต่ละใบบนกระดาน (วนซ้ำเมื่อเกิน) */
export const BAG_COLORS = ["#2563eb", "#ea580c", "#7c3aed", "#059669", "#db2777", "#ca8a04", "#0891b2", "#dc2626"];

export const MAX_PIECES = 40;
export const MAX_BAGS = 12;
export const MAX_ITEMS = 300;
export const MAX_COUNT = 20;

export type LaySrc = "rect" | "svg" | "dxf" | "pattern" | "image";
export type LayPiece = {
  id: string;
  part: LayPart;
  name: string;
  /** เส้นเย็บ (ขนาดสำเร็จ) หน่วย ซม. */
  shape: Shape;
  holes?: Shape[];
  /** ต้องตัดกี่ชิ้น */
  count: number;
  /** ชิ้นคู่ซ้าย-ขวา: ชิ้นที่ 2, 4, … พลิกกระจกให้เอง */
  mirror: boolean;
  /** เผื่อเย็บ ซม. (0 = ไม่มี) */
  allow: number;
  note?: string;
  src: LaySrc;
  /** รูปอ้างอิงของชิ้น (ไฟล์ PNG/JPG ที่โยนมา) — โชว์เป็นภาพย่อ */
  ref?: string | null;
};
export type LayBag = { key: string; pattern_id: string; label: string; color: string };
export type LayItem = {
  id: string; bag: string; piece: string; copy: number;
  /** ตรงกลางชิ้น (กรอบเส้นตัด) บนผ้า ซม. */
  x: number; y: number;
  /** หมุนกี่องศา (ตามเข็ม) */
  rot: number;
  flip: boolean;
  note?: string;
};
export type LaySettings = { showAllow?: boolean; snap?: number };
export type LayCheck = { a: Pt; b: Pt; real: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const fin = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const ID = /^[A-Za-z0-9_-]{1,40}$/;
export const newId = (p = "p") => `${p}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

// ─── ตรวจค่าที่ส่งมา (ใช้ทั้ง API และหน้าเว็บ) ────────────────────────────────
type Clean<T> = { ok: true; value: T } | { ok: false; error: string };

export function cleanLayPieces(raw: unknown): Clean<LayPiece[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "ข้อมูลชิ้นแบบไม่ถูกรูปแบบ" };
  if (raw.length > MAX_PIECES) return { ok: false, error: `ชิ้นแบบได้ไม่เกิน ${MAX_PIECES} ชิ้น` };
  const out: LayPiece[] = [], seen = new Set<string>();
  for (const [i, r] of raw.entries()) {
    if (!r || typeof r !== "object") return { ok: false, error: `ชิ้นที่ ${i + 1} ไม่ถูกรูปแบบ` };
    const o = r as Record<string, unknown>;
    const id = String(o.id ?? "");
    if (!ID.test(id) || seen.has(id)) return { ok: false, error: `ชิ้นที่ ${i + 1} รหัสซ้ำหรือไม่ถูกต้อง` };
    seen.add(id);
    const shape = cleanShape(o.shape);
    if (!shape) return { ok: false, error: `ชิ้นที่ ${i + 1} รูปทรงไม่ถูกต้อง` };
    const b = shapeBox(shape);
    if (b.w > 500 || b.h > 500) return { ok: false, error: `ชิ้นที่ ${i + 1} ใหญ่เกิน 5 เมตร — เช็กหน่วยไฟล์` };
    const holes = Array.isArray(o.holes) ? o.holes.map(cleanShape).filter((h): h is Shape => !!h).slice(0, 40) : [];
    const count = Math.max(1, Math.min(MAX_COUNT, Math.round(fin(o.count) ?? 1)));
    const name = str(o.name, 80) || partLabel(String(o.part));
    const src: LaySrc = (["rect", "svg", "dxf", "pattern", "image"] as const).includes(o.src as LaySrc) ? (o.src as LaySrc) : "rect";
    const p: LayPiece = { id, part: isPart(o.part) ? o.part : "other", name, shape, count, mirror: o.mirror === true, allow: Math.min(5, cleanAllow(o.allow)), src };
    if (holes.length) p.holes = holes;
    const note = str(o.note, 300); if (note) p.note = note;
    const ref = str(o.ref, 500); if (ref) p.ref = ref;
    out.push(p);
  }
  return { ok: true, value: out };
}

export function cleanBags(raw: unknown): Clean<LayBag[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "ข้อมูลกระเป๋าไม่ถูกรูปแบบ" };
  if (raw.length > MAX_BAGS) return { ok: false, error: `ผ้า 1 ผืนวางได้ไม่เกิน ${MAX_BAGS} ใบ` };
  const out: LayBag[] = [], seen = new Set<string>();
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const key = String(o.key ?? ""), pid = String(o.pattern_id ?? "");
    if (!ID.test(key) || seen.has(key) || !/^[0-9a-f-]{36}$/i.test(pid)) return { ok: false, error: "ข้อมูลกระเป๋าในแผนไม่ถูกต้อง" };
    seen.add(key);
    const color = /^#[0-9a-f]{6}$/i.test(String(o.color)) ? String(o.color) : BAG_COLORS[out.length % BAG_COLORS.length];
    out.push({ key, pattern_id: pid, label: str(o.label, 60) || `ใบที่ ${out.length + 1}`, color });
  }
  return { ok: true, value: out };
}

export function cleanItems(raw: unknown, bags: LayBag[]): Clean<LayItem[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "ข้อมูลชิ้นที่วางไม่ถูกรูปแบบ" };
  if (raw.length > MAX_ITEMS) return { ok: false, error: `วางได้ไม่เกิน ${MAX_ITEMS} ชิ้นต่อแผน` };
  const bagKeys = new Set(bags.map((b) => b.key));
  const out: LayItem[] = [], seen = new Set<string>();
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const id = String(o.id ?? ""), bag = String(o.bag ?? ""), piece = String(o.piece ?? "");
    if (!ID.test(id) || seen.has(id) || !bagKeys.has(bag) || !ID.test(piece)) return { ok: false, error: "ชิ้นที่วางอ้างถึงกระเป๋า/ชิ้นที่ไม่มีในแผน" };
    seen.add(id);
    const x = fin(o.x), y = fin(o.y);
    if (x == null || y == null || Math.abs(x) > 2000 || Math.abs(y) > 2000) return { ok: false, error: "ตำแหน่งชิ้นไม่ถูกต้อง" };
    const it: LayItem = { id, bag, piece, copy: Math.max(0, Math.min(MAX_COUNT - 1, Math.round(fin(o.copy) ?? 0))), x: r2(x), y: r2(y), rot: normRot(fin(o.rot) ?? 0), flip: o.flip === true };
    const note = str(o.note, 300); if (note) it.note = note;
    out.push(it);
  }
  return { ok: true, value: out };
}

export function cleanSettings(raw: unknown): LaySettings {
  const o = (raw ?? {}) as Record<string, unknown>;
  const snap = fin(o.snap);
  return { showAllow: o.showAllow !== false, snap: snap && snap > 0 ? Math.min(10, snap) : 0 };
}

export function cleanChecks(raw: unknown): LayCheck[] {
  if (!Array.isArray(raw)) return [];
  const pt = (v: unknown): Pt | null => (Array.isArray(v) && v.length === 2 && fin(v[0]) != null && fin(v[1]) != null ? [Number(v[0]), Number(v[1])] : null);
  return raw.slice(0, 10).flatMap((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const a = pt(o.a), b = pt(o.b), real = fin(o.real);
    return a && b && real && real > 0 ? [{ a, b, real: r2(real) }] : [];
  });
}

export const normRot = (d: number): number => { const v = ((d % 360) + 360) % 360; return Math.round(v * 10) / 10; };

// ─── รูปชิ้น ──────────────────────────────────────────────────────────────────
export type PieceLocal = { cut: Pt[]; sew: Pt[]; holes: Pt[][]; w: number; h: number; area: number };

/** รูปชิ้นในกรอบของตัวเอง (มุมซ้ายบนของกรอบเส้นตัด = 0,0) · withAllow=false = ใช้เส้นเย็บเป็นเส้นตัด */
export function pieceLocal(p: Pick<LayPiece, "shape" | "holes" | "allow">, withAllow = true): PieceLocal {
  const g = pieceGeometry({ shape: p.shape, holes: p.holes ?? [], allow: withAllow ? p.allow : 0 });
  const box = g.cutBox;
  const sh = (P: Pt[]): Pt[] => P.map(([x, y]) => [x - box.x, y - box.y] as Pt);
  return { cut: sh(g.cut), sew: sh(g.sew), holes: g.holesCut.map(sh), w: box.w, h: box.h, area: g.cutArea };
}

/** เมทริกซ์ [a,b,c,d,e,f]: x' = a·u + c·v + e · y' = b·u + d·v + f */
export type M6 = [number, number, number, number, number, number];
export const applyM = (m: M6, [u, v]: Pt): Pt => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]];
export function invertM(m: M6): M6 {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c || 1e-12;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** จากกรอบชิ้น (0..w, 0..h) → พิกัดบนผ้า: ย้ายให้กลางชิ้นอยู่ 0,0 → พลิกซ้าย-ขวา → หมุน → ย้ายไป x,y */
export function itemMatrix(it: Pick<LayItem, "x" | "y" | "rot" | "flip">, w: number, h: number): M6 {
  const t = (it.rot * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t), fx = it.flip ? -1 : 1;
  // u' = fx·(u − w/2) , v' = v − h/2 → หมุน → + (x,y)
  const a = cs * fx, b = sn * fx, c = -sn, d = cs;
  const e = it.x - a * (w / 2) - c * (h / 2), f = it.y - b * (w / 2) - d * (h / 2);
  return [a, b, c, d, e, f];
}

export type Placed = { item: LayItem; piece: LayPiece; bag: LayBag; m: M6; cut: Pt[]; sew: Pt[]; holes: Pt[][]; local: PieceLocal; box: { x: number; y: number; w: number; h: number }; area: number };

export function polyBoxOf(P: Pt[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return P.length ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
}
export function polyArea(P: Pt[]): number {
  let a = 0;
  for (let i = 0; i < P.length; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}

/** ชิ้นที่วางทั้งหมด → รูปบนผ้า (ข้ามชิ้นที่แบบตัดถูกลบไปแล้ว) */
export function placeAll(items: LayItem[], bags: LayBag[], patterns: Record<string, { pieces: LayPiece[] } | undefined>, withAllow = true): Placed[] {
  const bagBy = new Map(bags.map((b) => [b.key, b]));
  const cache = new Map<string, PieceLocal>();
  const out: Placed[] = [];
  for (const it of items) {
    const bag = bagBy.get(it.bag); if (!bag) continue;
    const piece = patterns[bag.pattern_id]?.pieces.find((p) => p.id === it.piece); if (!piece) continue;
    const ck = `${bag.pattern_id}:${piece.id}`;
    let local = cache.get(ck);
    if (!local) { local = pieceLocal(piece, withAllow); cache.set(ck, local); }
    const m = itemMatrix(it, local.w, local.h);
    const cut = local.cut.map((p) => applyM(m, p));
    out.push({ item: it, piece, bag, m, cut, sew: local.sew.map((p) => applyM(m, p)), holes: local.holes.map((h) => h.map((p) => applyM(m, p))), local, box: polyBoxOf(cut), area: local.area });
  }
  return out;
}

// ─── ตรวจ: ล้นผ้า · ทับกัน · ทับส่วนที่ตัดไปแล้ว ──────────────────────────────
export function pointInPoly([x, y]: Pt, P: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function segX(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
}
/** สองรูปทับกันจริงไหม (ขอบแตะกันพอดี = ไม่นับ) */
export function polysOverlap(A: Pt[], B: Pt[]): boolean {
  const ba = polyBoxOf(A), bb = polyBoxOf(B);
  if (ba.x + ba.w <= bb.x + 1e-6 || bb.x + bb.w <= ba.x + 1e-6 || ba.y + ba.h <= bb.y + 1e-6 || bb.y + bb.h <= ba.y + 1e-6) return false;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (segX(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  const inner = (P: Pt[]) => { const b = polyBoxOf(P); return [b.x + b.w / 2, b.y + b.h / 2] as Pt; };
  return pointInPoly(A[0], B) || pointInPoly(B[0], A) || pointInPoly(inner(A), B) || pointInPoly(inner(B), A);
}
export const outsideFabric = (P: Pt[], W: number, H: number, tol = 0.05) => P.some(([x, y]) => x < -tol || y < -tol || x > W + tol || y > H + tol);

export type LayIssues = { outside: string[]; overlaps: [string, string][]; onCut: string[] };
/** cutZones = เส้นตัดของแผนอื่นบนผ้าผืนเดียวกันที่กด "ตัดแล้ว" (ส่วนผ้าที่ไม่มีแล้ว) */
export function layIssues(placed: Placed[], W: number, H: number, cutZones: Pt[][] = []): LayIssues {
  const outside = placed.filter((p) => outsideFabric(p.cut, W, H)).map((p) => p.item.id);
  const overlaps: [string, string][] = [];
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) if (polysOverlap(placed[i].cut, placed[j].cut)) overlaps.push([placed[i].item.id, placed[j].item.id]);
  const onCut = placed.filter((p) => cutZones.some((z) => polysOverlap(p.cut, z))).map((p) => p.item.id);
  return { outside, overlaps, onCut };
}

// ─── ครบไหม: กระเป๋าแต่ละใบต้องมีชิ้นครบตามจำนวน ──────────────────────────────
export type BagStatus = { bag: LayBag; need: number; placed: number; missing: { piece: LayPiece; copy: number }[] };
export function bagStatus(bags: LayBag[], items: LayItem[], patterns: Record<string, { pieces: LayPiece[] } | undefined>): BagStatus[] {
  return bags.map((bag) => {
    const pieces = patterns[bag.pattern_id]?.pieces ?? [];
    const have = new Set(items.filter((i) => i.bag === bag.key).map((i) => `${i.piece}#${i.copy}`));
    const missing: { piece: LayPiece; copy: number }[] = [];
    let need = 0;
    for (const p of pieces) for (let c = 0; c < p.count; c++) { need++; if (!have.has(`${p.id}#${c}`)) missing.push({ piece: p, copy: c }); }
    return { bag, need, placed: need - missing.length, missing };
  });
}

/** ชิ้นใหม่ที่จะวาง: ชิ้นคู่ (mirror) ตัวที่ 2, 4, … พลิกให้เอง */
export function newItem(bag: string, piece: LayPiece, copy: number, at: Pt): LayItem {
  return { id: newId("i"), bag, piece: piece.id, copy, x: r2(at[0]), y: r2(at[1]), rot: 0, flip: piece.mirror && copy % 2 === 1 };
}

/** หาตำแหน่งว่างแรกบนผ้า (ไล่จากซ้ายบน ทีละ 1 ซม.) ให้ชิ้นที่เพิ่งเพิ่ม — ไม่เจอ = กลางผ้า */
export function findFreeSpot(local: PieceLocal, W: number, H: number, taken: Pt[][], step = 1): Pt {
  for (let y = local.h / 2; y <= H - local.h / 2 + 1e-6; y += step) {
    for (let x = local.w / 2; x <= W - local.w / 2 + 1e-6; x += step) {
      const m = itemMatrix({ x, y, rot: 0, flip: false }, local.w, local.h);
      const P = local.cut.map((p) => applyM(m, p));
      if (!taken.some((t) => polysOverlap(P, t))) return [r2(x), r2(y)];
    }
  }
  return [r2(W / 2), r2(H / 2)];
}

// ─── ป้าย A, B, C… + คำอธิบาย ────────────────────────────────────────────────
export const letterOf = (i: number): string => { let s = "", n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };

/** เรียงชิ้นของกระเป๋า 1 ใบ (ตามลำดับชิ้นในแบบตัด → ตัวที่) แล้วให้ป้าย A, B, C… */
export function bagLetters(placed: Placed[], bagKey: string, pieces: LayPiece[]): Map<string, string> {
  const mine = placed.filter((p) => p.bag.key === bagKey);
  const idx = new Map(pieces.map((p, i) => [p.id, i]));
  const order = (p: Placed) => (idx.get(p.piece.id) ?? 99) * 100 + p.item.copy;
  return new Map([...mine].sort((a, b) => order(a) - order(b)).map((p, i) => [p.item.id, letterOf(i)]));
}

/** ตำแหน่งบนผ้าเป็นคำ เช่น "ซ้ายบน" */
export function regionLabel(cx: number, cy: number, W: number, H: number): string {
  const h = cx < W / 3 ? "ซ้าย" : cx > (W * 2) / 3 ? "ขวา" : "กลาง";
  const v = cy < H / 3 ? "บน" : cy > (H * 2) / 3 ? "ล่าง" : "กลาง";
  return h === "กลาง" && v === "กลาง" ? "กลางผืน" : v === "กลาง" ? `${h}กลาง` : h === "กลาง" ? `กลาง${v}` : `${h}${v}`;
}
const fmt = (n: number) => String(Math.round(n * 10) / 10);
export const sizeLabel = (w: number, h: number) => `${fmt(w)}×${fmt(h)} ซม.`;

/** คำอธิบายชิ้นที่วาง 1 ชิ้น (ใช้ทั้ง JPEG และคำสั่ง ChatGPT) */
export function describePlaced(p: Placed, letter: string, W: number, H: number): string {
  const sew = polyBoxOf(p.local.sew);
  const b = p.box;
  const parts = [
    `${letter} · ${p.piece.name === partLabel(p.piece.part) ? p.piece.name : `${p.piece.name} (${partLabel(p.piece.part)})`}${p.piece.count > 1 ? ` ชิ้นที่ ${p.item.copy + 1}/${p.piece.count}` : ""}`,
    `ขนาดสำเร็จ ${sizeLabel(sew.w, sew.h)}${p.piece.allow ? ` + เผื่อเย็บ ${fmt(p.piece.allow)} ซม.` : ""}`,
    `ตัดจากผ้าบริเวณ${regionLabel(b.x + b.w / 2, b.y + b.h / 2, W, H)} (แนวนอน ${fmt(b.x)}–${fmt(b.x + b.w)} · แนวตั้ง ${fmt(b.y)}–${fmt(b.y + b.h)} ซม.)`,
  ];
  const how = [p.item.rot ? `หมุน ${fmt(p.item.rot)}°` : "", p.item.flip ? "พลิกกระจก" : ""].filter(Boolean).join(" · ");
  if (how) parts.push(how);
  if (p.piece.note) parts.push(p.piece.note);
  if (p.item.note) parts.push(p.item.note);
  return parts.join(" — ");
}

/** คำสั่งภาษาอังกฤษ + ไทยสำหรับวางใน ChatGPT คู่กับภาพสรุป JPEG */
export function chatGptPrompt(bagName: string, lines: { letter: string; part: string; name: string; size: string; note?: string }[], fabricName: string): string {
  const en = lines.map((l) => `- Piece ${l.letter} = ${l.part} (${l.name}), finished size ${l.size}. Use EXACTLY the fabric area shown in cut-out ${l.letter}${l.note ? ` — ${l.note}` : ""}.`).join("\n");
  return [
    `Create a realistic product photo of the bag "${bagName}" sewn from the patterned fabric "${fabricName}" in the attached summary image.`,
    `The summary shows the bag shape (photo), where each pattern piece is cut on the fabric, and each cut-out piece. Keep the fabric motifs in the same position, scale and orientation as the cut-outs — do not invent new patterns.`,
    en,
    `Studio lighting, plain light background, 3/4 front view, show the front (piece of the front panel) clearly. Keep the hardware/trim like the bag photo.`,
    ``,
    `(ไทย) สร้างรูปกระเป๋า "${bagName}" จากผ้าลายในภาพสรุป · แต่ละชิ้นให้ใช้ลายตามภาพชิ้นที่ตัดออกมา ห้ามแต่งลายใหม่ · ทรงและอะไหล่ตามรูปกระเป๋า`,
  ].join("\n");
}

// ─── ผ้า: สเกล + ตรวจระยะ ─────────────────────────────────────────────────────
/** จุดตรวจระยะบนรูปดัดตรง (พิกัด ซม.) → วัดได้กี่ ซม. คลาดกี่ % */
export function checkResults(checks: LayCheck[]): { got: number; err: number; pct: number; ok: boolean }[] {
  return checks.map((c) => {
    const got = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
    const err = got - c.real;
    const pct = (err / c.real) * 100;
    return { got: r2(got), err: r2(err), pct: Math.round(pct * 10) / 10, ok: Math.abs(err) <= Math.max(0.5, c.real * 0.01) };
  });
}

/** ขนาดผ้า: เล็ก < 50 ซม. · กลาง 50–100 · ใหญ่ > 100 (ด้านที่ยาวกว่า) */
export type FabricSize = "s" | "m" | "l";
export const FABRIC_SIZES: { key: FabricSize; th: string }[] = [{ key: "s", th: "เล็ก < 50 ซม." }, { key: "m", th: "กลาง 50–100 ซม." }, { key: "l", th: "ใหญ่ > 100 ซม." }];
export function fabricSize(w: number | null | undefined, h: number | null | undefined): FabricSize | null {
  const m = Math.max(Number(w) || 0, Number(h) || 0);
  if (!m) return null;
  return m < 50 ? "s" : m <= 100 ? "m" : "l";
}

/** เหลือผ้ากี่ % หลังหักส่วนที่ตัดไปแล้ว */
export function fabricLeftPct(w: number | null | undefined, h: number | null | undefined, used: number | null | undefined): number | null {
  const a = (Number(w) || 0) * (Number(h) || 0);
  if (!a) return null;
  return Math.max(0, Math.round((1 - (Number(used) || 0) / a) * 100));
}

/** สี่เหลี่ยมผืนผ้า (ชิ้นแบบเร็ว) ขนาด w×h ซม. */
export const rectShape = (w: number, h: number): Shape => ({ k: "rect", x: 0, y: 0, w: r2(w), h: r2(h) });
