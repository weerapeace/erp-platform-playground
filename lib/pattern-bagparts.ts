/**
 * 👜 ตัวสร้างชิ้นกระเป๋า (Bag CAD รอบ F2) — สูตรบริสุทธิ์ ไม่มีหน้าจอ · ไม่ต่อฐานข้อมูล
 *   1) สาย / หูหิ้ว จากความกว้างสำเร็จ + วิธีพับ + จำนวนชั้น (strapPlan)
 *   2) ชิ้นกุ๊น / หุ้มขอบ ที่ต้องตัดเพิ่ม จากความยาวกุ๊นรวมของแพทเทิร์น (bindingPlan)
 *   3) ช่องโชว์บนชิ้นที่มีอยู่: รูจริง + แผ่น PVC + กรอบ + แผ่นกั้น ตามโครงสร้างที่เลือก (windowPlan) — รูป เมฆ/แมว/หมี/หัวใจ/SVG เอง
 *   4) อัปเดตชิ้นจากแม่แบบเมื่อเปลี่ยนค่า โดยไม่ทับชิ้นที่แก้มือ (templateUpdatePlan)
 *   ค่าตั้งต้นทุกค่าเป็นค่าที่ใช้กันทั่วไป (เช่น พับขอบสาย 1 ซม. · กุ๊นต่อกันเผื่อ 2 ซม.) — ให้ช่างปรับตามงานจริง
 *
 * ใช้ที่: components/pattern-studio/bag-parts-modal (ปุ่ม "ชิ้นกระเป๋า") · components/pattern-studio (อัปเดตจากแม่แบบ)
 * เทสต์: lib/__tests__/pattern-bagparts.test.ts · คู่มือ: docs/pattern-studio.md (Bag CAD รอบ F2)
 */
import { BAG_PVC_MARGIN, bagWindowShape, type BagWindow } from "./bag-templates";
import type { KitPiece } from "./bag-kits";
import { pieceEdges, type EdgeMeta } from "./pattern-seams";
import { fitShape, offsetShape, parseSvgShapes, shapeBox, shapeInside, type InnerLine, type Pt, type Shape } from "./pattern-shape";

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** ชิ้นที่ตัวสร้างคืนให้ (พิกัดเริ่มที่ 0,0 — หน้าจอเลื่อนไปวางเอง) */
export type PlanPiece = {
  name: string; nameEn: string; shape: Shape; holes?: Shape[]; count: number; allow: number;
  foldEdges?: number[] | null; grain?: [Pt, Pt] | null; notches?: Pt[]; inner?: InnerLine[]; edgeMeta?: EdgeMeta[] | null;
  /** คู่ขอบที่เย็บในชิ้นเดียวกัน (เช่น สายพับครึ่ง: ขอบยาวสองข้างเย็บเข้าหากัน) */ selfSeams?: { a: number; b: number; rev?: boolean }[];
};

// ───────── 1) สาย / หูหิ้ว ─────────
export type StrapFold = "half" | "four" | "edge" | "flat";
export const STRAP_FOLDS: { key: StrapFold; th: string; en: string; hintTh: string; hintEn: string }[] = [
  { key: "half", th: "พับครึ่ง เย็บแล้วกลับ", en: "Folded in half, sewn, turned", hintTh: "ตัดกว้าง 2 เท่า + เผื่อเย็บ · เย็บขอบยาวแล้วกลับด้าน", hintEn: "Cut 2× wide + allowance · sew the long edge, turn" },
  { key: "four", th: "พับเข้ากลางแล้วพับครึ่ง (4 ทบ)", en: "Fold to centre then in half (4 layers)", hintTh: "ตัดกว้าง 4 เท่า ไม่ต้องเผื่อ · เดินด้ายทับ", hintEn: "Cut 4× wide, no allowance · topstitch" },
  { key: "edge", th: "พับขอบเข้า เดินด้ายทับ", en: "Edges folded in, topstitched", hintTh: "ตัดกว้าง + พับขอบข้างละ 1 ซม. (สายเส้นเดียว)", hintEn: "Cut width + 1 cm fold each side (single layer)" },
  { key: "flat", th: "ไม่พับ (หนัง/PU ตัดขอบ)", en: "Flat (leather/PU, cut edge)", hintTh: "ตัดกว้างเท่าสำเร็จ · ขอบทาสี/กุ๊น", hintEn: "Cut to finished width · paint or bind the edges" },
];
export type StrapOpts = { w: number; L: number; fold: StrapFold; layers: 1 | 2; sa: number; count: number; attach: number };
export const STRAP_DEFAULT: StrapOpts = { w: 2.5, L: 45, fold: "half", layers: 1, sa: 1, count: 2, attach: 4 };
/**
 * สาย/หูหิ้ว: กว้างสำเร็จ w · ยาวส่วนที่โผล่ L · ปลายละ attach เย็บทับตัวกระเป๋า (ซม.)
 *   ยาวตัด = L + 2 × attach · รอยบากบอกจุดเริ่มเย็บทับทั้งสองปลาย · เส้นพับตามวิธีพับ · ประกบ 2 ชั้น = จำนวนตัด × 2
 */
export function strapPlan(o: StrapOpts): { piece: PlanPiece; cutW: number; cutL: number } | null {
  const w = o.w, L = o.L, att = Math.max(0, o.attach);
  if (!(w >= 0.5 && w <= 15) || !(L >= 2 && L <= 300) || !(att <= 20) || !(o.count >= 1 && o.count <= 20)) return null;
  const hem = Math.min(1, w / 2);
  const width = o.fold === "half" ? 2 * w : o.fold === "four" ? 4 * w : o.fold === "edge" ? w + 2 * hem : w;
  const folds = o.fold === "half" ? [w] : o.fold === "four" ? [w, 2 * w, 3 * w] : o.fold === "edge" ? [hem, w + hem] : [];
  const allow = o.fold === "half" ? Math.max(0, o.sa) : 0;
  const cutL = r2(L + 2 * att);
  const inner: InnerLine[] = folds.map((y, k) => ({ id: `sf${k}`, kind: "fold", name: "แนวพับสาย", pts: [[0, r3(y)], [cutL, r3(y)]] }));
  const notches: Pt[] = att > 0 ? [[att, 0], [att, r3(width)], [r2(cutL - att), 0], [r2(cutL - att), r3(width)]] : [];
  const fold = STRAP_FOLDS.find((f) => f.key === o.fold)!;
  const layers = o.layers === 2 ? 2 : 1;
  return {
    cutW: r2(width + 2 * allow), cutL: r2(cutL + 2 * allow),
    piece: {
      name: `สาย/หู กว้างสำเร็จ ${r2(w)} ซม. (${fold.th}${layers === 2 ? " · ประกบ 2 ชั้น" : ""})`, nameEn: `Strap ${r2(w)} cm (${fold.en}${layers === 2 ? ", 2 layers" : ""})`,
      shape: { k: "rect", x: 0, y: 0, w: cutL, h: r3(width) }, count: o.count * layers, allow,
      grain: [[r2(cutL * 0.1), r3(width / 2)], [r2(cutL * 0.35), r3(width / 2)]], notches, inner,
      ...(o.fold === "half" ? { selfSeams: [{ a: 0, b: 2, rev: true }] } : {}),
    },
  };
}

// ───────── 2) กุ๊น / หุ้มขอบ ─────────
export type BindKind = "double" | "single" | "wrap";
export const BIND_KINDS: { key: BindKind; th: string; en: string }[] = [
  { key: "double", th: "กุ๊นพับสองทบ (ผ้า)", en: "Double-fold binding (fabric)" },
  { key: "single", th: "กุ๊นพับทบเดียว (ผ้า)", en: "Single-fold binding (fabric)" },
  { key: "wrap", th: "หุ้มขอบหนัง/PU (ไม่พับ)", en: "Leather/PU edge wrap (no fold)" },
];
/** กว้างตัดของแถบกุ๊น จากกว้างสำเร็จ w (ซม.) */
export const bindCutWidth = (w: number, kind: BindKind) => r2(kind === "double" ? 4 * w : kind === "single" ? 2 * w + 1.2 : 2 * w);
export type BindOpts = { w: number; kind: BindKind; bias: boolean; maxLen?: number; join?: number; ends?: number };
/**
 * ชิ้นกุ๊นที่ต้องตัด: ยาวที่ใช้ = ยาวกุ๊นรวม + เผื่อหัวท้าย (ends) · แถบยาวไม่เกิน maxLen ต่อเส้น · ต่อกันเผื่อ join ต่อรอยต่อ
 *   ผ้า (bias) = ตัดเฉียง 45° (ลูกศรเกรนเฉียง) โค้งตามขอบได้ · หนัง/PU = ตัดตรง
 */
export function bindingPlan(total: number, o: BindOpts): { piece: PlanPiece; need: number; strips: number; cutW: number; stripLen: number } | null {
  const maxLen = o.maxLen ?? 140, join = o.join ?? 2, ends = o.ends ?? 5;
  if (!(total > 0) || !(o.w >= 0.3 && o.w <= 5) || !(maxLen >= 20)) return null;
  const need = r2(total + ends), strips = Math.max(1, Math.ceil((need - join) / (maxLen - join)));
  const stripLen = Math.ceil(((need + (strips - 1) * join) / strips) * 2) / 2;
  const cutW = bindCutWidth(o.w, o.kind);
  const folds = o.kind === "double" ? [o.w, 2 * o.w, 3 * o.w] : o.kind === "single" ? [0.6, cutW - 0.6] : [o.w];
  const g = Math.min(cutW * 0.8, stripLen * 0.2);
  return {
    need, strips, cutW, stripLen,
    piece: {
      name: `แถบ${BIND_KINDS.find((k) => k.key === o.kind)!.th} กว้างสำเร็จ ${r2(o.w)} ซม.${o.bias ? " (ตัดเฉียง 45°)" : ""}`, nameEn: `${BIND_KINDS.find((k) => k.key === o.kind)!.en} ${r2(o.w)} cm${o.bias ? " (bias cut)" : ""}`,
      shape: { k: "rect", x: 0, y: 0, w: stripLen, h: cutW }, count: strips, allow: 0,
      grain: o.bias ? [[r2(stripLen * 0.1), r3(cutW * 0.9)], [r2(stripLen * 0.1 + g), r3(cutW * 0.9 - g)]] : [[r2(stripLen * 0.1), r3(cutW / 2)], [r2(stripLen * 0.35), r3(cutW / 2)]],
      inner: folds.map((y, k) => ({ id: `bf${k}`, kind: "fold" as const, name: "แนวพับกุ๊น", pts: [[0, r3(y)], [stripLen, r3(y)]] as Pt[] })),
    },
  };
}

// ───────── 3) ช่องโชว์บนชิ้น ─────────
export type WindowStructure = "pvc" | "top" | "zip" | "divider";
export const WINDOW_STRUCTURES: { key: WindowStructure; th: string; en: string; hintTh: string; hintEn: string }[] = [
  { key: "pvc", th: "ช่องเปิดติด PVC ตายตัว", en: "Fixed PVC window", hintTh: "รู + แผ่น PVC เย็บติดหลังรู", hintEn: "Hole + PVC sewn behind it" },
  { key: "top", th: "ช่องโชว์ล้วงจากด้านบน", en: "Slip-in display (from the top)", hintTh: "รู + PVC + แผ่นหลังช่อง เย็บประกบตัวหน้า เปิดด้านบน", hintEn: "Hole + PVC + backing sewn to the front, open at the top" },
  { key: "zip", th: "ช่องโชว์แบบซิป", en: "Zip display pocket", hintTh: "เหมือนล้วงด้านบน แต่ปากช่องติดซิป", hintEn: "Like slip-in, with a zip at the top" },
  { key: "divider", th: "ช่องโชว์ + แผ่นกั้นแยกช่องหลัก", en: "Display + divider", hintTh: "แผ่นกั้นประกบตัวหน้าแล้วเข้าชิ้นข้างพร้อมกัน = ช่องโชว์ 1 + ช่องหลัก 1", hintEn: "Divider sewn to the front, then into the gusset = 1 display + 1 main compartment" },
];
export type WindowKind = Exclude<BagWindow, "none"> | "svg";
export type WindowOpts = { kind: WindowKind; svg?: string; w: number; h: number; cx: number; cy: number; structure: WindowStructure; margin?: number; frame?: number };
/** ขอบบนของชิ้น (กึ่งกลางขอบสูงสุดบนจอ = y น้อยสุด) */
export function topEdgeIndex(s: Shape): number {
  const E = pieceEdges(s);
  let best = 0, by = Infinity;
  E.forEach((e, i) => { const m = e.pts[Math.floor(e.pts.length / 2)], y = (e.pts[0][1] + e.pts[e.pts.length - 1][1] + m[1]) / 3; if (y < by) { by = y; best = i; } });
  return best;
}
/** รูปช่อง: รูปที่มี หรือ SVG เอง (รูปแรกในไฟล์) ย่อ/ขยายลงกรอบ cx,cy (กลาง) · w × h */
export function windowShape(o: Pick<WindowOpts, "kind" | "svg" | "w" | "h" | "cx" | "cy">): Shape | null {
  if (!(o.w >= 1 && o.h >= 1)) return null;
  const x = r3(o.cx - o.w / 2), y = r3(o.cy - o.h / 2);
  if (o.kind === "svg") {
    const imp = o.svg ? parseSvgShapes(o.svg) : null, s = imp?.pieces[0]?.shape;
    return s ? fitShape(s.k === "path" ? s : s, x, y, r3(o.w), r3(o.h)) : null;
  }
  return bagWindowShape(o.kind, x, y, o.w, o.h);
}
export type WindowPlan = {
  hole: Shape; pvc: PlanPiece; frame: PlanPiece | null; divider: PlanPiece | null;
  /** แผ่นกั้นเย็บประกบชิ้นนี้: ขอบ from ต่อกัน count ขอบ (ทุกขอบยกเว้นขอบบน) */ dividerSide: { from: number; count: number; n: number } | null;
  warnings: { th: string; en: string }[];
};
/**
 * ช่องโชว์บนชิ้น host (รูปตามที่วางบนกระดาน): รูจริง + แผ่น PVC (ใหญ่กว่ารูรอบละ margin) + กรอบ (frame > 0) + แผ่นกั้น (โครงสร้างที่ไม่ใช่ pvc)
 *   รูต้องอยู่ในชิ้น · ชิดขอบเกิน 1 ซม. / ทับรูเดิม = เตือน (ยังสร้างได้) · ออกนอกชิ้น = null
 */
export function windowPlan(host: { shape: Shape; holes?: Shape[]; allow?: number; foldEdges?: number[] | null }, o: WindowOpts): WindowPlan | null {
  const hole = windowShape(o);
  if (!hole || !shapeInside(hole, host.shape)) return null;
  const margin = o.margin ?? BAG_PVC_MARGIN, frame = Math.max(0, o.frame ?? 0);
  const warnings: WindowPlan["warnings"] = [];
  const clear = offsetShape(hole, 1);
  if (!clear || !shapeInside(clear, host.shape)) warnings.push({ th: "ช่องชิดขอบชิ้นไม่ถึง 1 ซม. — เย็บติด PVC/กรอบยาก", en: "The window is under 1 cm from the edge — hard to sew the PVC/frame" });
  const hb = shapeBox(hole);
  if ((host.holes ?? []).some((h) => { const b = shapeBox(h); return b.x < hb.x + hb.w && hb.x < b.x + b.w && b.y < hb.y + hb.h && hb.y < b.y + b.h; })) warnings.push({ th: "ช่องทับรูเดิมของชิ้น", en: "The window overlaps an existing hole" });
  const pvcShape = offsetShape(hole, margin) ?? hole;
  const pvc: PlanPiece = { name: "แผ่น PVC ใส (ช่องโชว์)", nameEn: "Clear PVC (window)", shape: pvcShape, count: 1, allow: 0 };
  const fr = frame > 0 ? offsetShape(hole, frame) : null;
  const framePiece: PlanPiece | null = fr ? { name: `กรอบช่องโชว์ กว้าง ${r2(frame)} ซม.`, nameEn: `Window frame ${r2(frame)} cm`, shape: fr, holes: [hole], count: 1, allow: 0 } : null;
  if (frame > 0 && !fr) warnings.push({ th: "ทำกรอบไม่ได้ (กว้างกรอบไม่เหมาะกับรูปช่อง)", en: "Couldn't make the frame (width doesn't suit this shape)" });
  let divider: PlanPiece | null = null, dividerSide: WindowPlan["dividerSide"] = null;
  if (o.structure !== "pvc") {
    const n = pieceEdges(host.shape).length, top = topEdgeIndex(host.shape);
    const meta: EdgeMeta[] = Array.from({ length: n }, (_, i) => (i === top ? (o.structure === "zip" ? { zip: true } : { open: true }) : {}));
    const st = WINDOW_STRUCTURES.find((x) => x.key === o.structure)!;
    divider = {
      name: o.structure === "divider" ? "แผ่นกั้นช่องโชว์ / ช่องหลัก" : o.structure === "zip" ? "แผ่นหลังช่องโชว์ (ซิป)" : "แผ่นหลังช่องโชว์ (ล้วงด้านบน)",
      nameEn: o.structure === "divider" ? "Display / main divider" : `Display backing (${st.en})`,
      shape: host.shape, count: 1, allow: host.allow ?? 0, foldEdges: host.foldEdges ?? null, edgeMeta: meta,
    };
    dividerSide = n >= 2 ? { from: (top + 1) % n, count: n - 1, n } : null;
  }
  return { hole, pvc, frame: framePiece, divider, dividerSide, warnings };
}

// ───────── 4) อัปเดตจากแม่แบบ (เก็บงานแก้มือ) ─────────
export type TplNow = { key: string; pid: string; shape: Shape; holes?: Shape[]; allow?: number; allowEdges?: number[] | null; foldEdges?: number[] | null; notches?: Pt[] };
type Geo = { shape: Shape; holes?: Shape[]; allow?: number; allowEdges?: number[] | null; foldEdges?: number[] | null; notches?: Pt[] };
/** จุดรอบรูปเทียบมุมซ้ายบนของกรอบ (ไม่สนตำแหน่งบนกระดาน) */
function normPts(s: Shape, ox: number, oy: number): number[] {
  if (s.k !== "path") return [s.k === "rect" ? 1 : 2, r2(s.x - ox), r2(s.y - oy), r2(s.w), r2(s.h)];
  return s.nodes.flatMap((n) => [r2(n.x - ox), r2(n.y - oy), r2(n.ix ?? 0), r2(n.iy ?? 0), r2(n.ox ?? 0), r2(n.oy ?? 0)]);
}
const arrEq = (a?: number[] | null, b?: number[] | null) => JSON.stringify((a ?? []).map(r2)) === JSON.stringify((b ?? []).map(r2));
/** รูป + รู + เผื่อ + ขอบพับ + รอยบาก เหมือนกันไหม (ไม่สนตำแหน่งบนกระดาน) */
export function sameGeometry(a: Geo, b: Geo): boolean {
  const A = shapeBox(a.shape), B = shapeBox(b.shape);
  if (JSON.stringify(normPts(a.shape, A.x, A.y)) !== JSON.stringify(normPts(b.shape, B.x, B.y))) return false;
  if ((a.holes ?? []).length !== (b.holes ?? []).length) return false;
  for (let i = 0; i < (a.holes ?? []).length; i++) if (JSON.stringify(normPts(a.holes![i], A.x, A.y)) !== JSON.stringify(normPts(b.holes![i], B.x, B.y))) return false;
  if (r2(a.allow ?? 0) !== r2(b.allow ?? 0) || !arrEq(a.allowEdges, b.allowEdges) || !arrEq(a.foldEdges, b.foldEdges)) return false;
  const na = (a.notches ?? []).map(([x, y]) => `${r2(x - A.x)},${r2(y - A.y)}`).sort(), nb = (b.notches ?? []).map(([x, y]) => `${r2(x - B.x)},${r2(y - B.y)}`).sort();
  return JSON.stringify(na) === JSON.stringify(nb);
}
export type TplUpdatePlan = {
  /** ไม่ได้แก้มือ + ค่าใหม่ทำให้เปลี่ยน → อัปเดตได้เลย */ update: { key: string; pid: string; piece: KitPiece }[];
  /** แก้มือไว้ (ต่างจากที่แม่แบบเคยสร้าง) → ค่าเริ่มต้นไม่ทับ */ edited: { key: string; pid: string; piece: KitPiece }[];
  /** ค่าใหม่ไม่ทำให้เปลี่ยน */ same: { key: string; pid: string }[];
  /** ชิ้นใหม่ที่ค่าใหม่เพิ่มเข้ามา */ add: KitPiece[];
  /** ชิ้นที่ค่าใหม่ไม่มีแล้ว (ไม่ลบให้เอง) */ gone: { key: string; pid: string }[];
};
/**
 * เทียบชิ้นบนกระดาน (now · จับคู่ด้วยรหัสชิ้นของแม่แบบ) กับชุดที่แม่แบบเคยสร้าง (oldKit) และชุดใหม่ (newKit)
 *   ชิ้นที่ยังเหมือนที่แม่แบบเคยสร้าง = ไม่ได้แก้มือ → อัปเดตตามค่าใหม่ได้ · ชิ้นที่ต่าง = แก้มือ → ถามก่อนทับ
 */
export function templateUpdatePlan(now: TplNow[], oldKit: KitPiece[], newKit: KitPiece[]): TplUpdatePlan {
  const out: TplUpdatePlan = { update: [], edited: [], same: [], add: [], gone: [] };
  const byKey = new Map(now.map((x) => [x.key, x])), oldBy = new Map(oldKit.map((q) => [q.key, q]));
  for (const q of newKit) {
    const cur = byKey.get(q.key);
    if (!cur) { out.add.push(q); continue; }
    const old = oldBy.get(q.key);
    if (old && sameGeometry(cur, old)) { if (sameGeometry(old, q)) out.same.push({ key: q.key, pid: cur.pid }); else out.update.push({ key: q.key, pid: cur.pid, piece: q }); }
    else if (sameGeometry(cur, q)) out.same.push({ key: q.key, pid: cur.pid });
    else out.edited.push({ key: q.key, pid: cur.pid, piece: q });
  }
  const newKeys = new Set(newKit.map((q) => q.key));
  for (const x of now) if (!newKeys.has(x.key)) out.gone.push({ key: x.key, pid: x.pid });
  return out;
}
/** ย้ายรูปของชิ้นใหม่ให้มุมซ้ายบนตรงกับชิ้นเดิมบนกระดาน (ไม่ย้ายตำแหน่งที่ผู้ใช้จัดไว้) */
export function alignTo(q: { shape: Shape; holes?: Shape[]; notches?: Pt[]; grain?: [Pt, Pt] | null }, target: Shape): { shape: Shape; holes: Shape[]; notches: Pt[]; grain: [Pt, Pt] | null } {
  const a = shapeBox(q.shape), b = shapeBox(target), dx = b.x - a.x, dy = b.y - a.y;
  const mv = (s: Shape): Shape => (s.k === "path" ? { k: "path", nodes: s.nodes.map((n) => ({ ...n, x: r3(n.x + dx), y: r3(n.y + dy) })) } : { ...s, x: r3(s.x + dx), y: r3(s.y + dy) });
  const mp = ([x, y]: Pt): Pt => [r3(x + dx), r3(y + dy)];
  return { shape: mv(q.shape), holes: (q.holes ?? []).map(mv), notches: (q.notches ?? []).map(mp), grain: q.grain ? [mp(q.grain[0]), mp(q.grain[1])] : null };
}
