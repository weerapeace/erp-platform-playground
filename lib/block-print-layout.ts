/**
 * 🧱 บล็อกพิมพ์ — แท็บ "จัดวางในบล็อก" (สูตรล้วน ไม่มีหน้าจอ) · เจ้าของเลือกใน widget 2026-11-24 (ข้อเสนอ 1-6)
 *   ตั้งขนาดบล็อก → วางชิ้นจากไฟล์ .ai / ข้อความ / รูปทรง ตามตำแหน่ง (มม. จากมุมซ้ายบนของบล็อก)
 *   สี = ใช้แยกส่วนบนจอเท่านั้น · PDF/SVG ส่งโรงงานเป็นสีดำล้วนเสมอ (เจ้าของเลือก)
 *   PDF = กรอบบล็อก + ลาย + ขนาดบล็อก + ระยะตำแหน่งแบบนับจากขอบ (เส้นไกด์ชมพูแบบรูปตัวอย่างของเจ้าของ)
 *   ภาพบนจอกับ PDF ใช้ layoutDims / blockPage ตัวเดียวกัน → เห็นแบบไหนได้แบบนั้น
 *
 * ใช้ที่: components/block-print/layout-editor.tsx · lib/block-print-pdf.ts · app/api/block-print (cleanLayouts) · คู่มือ docs/block-print.md
 */
import {
  DIM, DIM_COLORS, OP, PAPERS, eachOp, fmtDim, mapOps, opsToSvgPath, pieceShapes,
  type BlockPaper, type BlockPiece, type BlockUnit, type DrawOps, type FillRule,
} from "@/lib/block-print";

export type ItemKind = "piece" | "text" | "rect" | "ellipse" | "line";
export type BlockItem = {
  id: string;
  t: ItemKind;
  /** มุมซ้ายบนของกรอบชิ้น (มม. จากมุมซ้ายบนของบล็อก) */ x: number; y: number;
  /** ขนาดกรอบชิ้น (มม.) · เส้นตรง: w หรือ h เป็น 0 ได้ */ w: number; h: number;
  /** ชิ้นจากไฟล์ .ai (รหัสชิ้นในงาน) */ pieceId?: string;
  /** ข้อความ: ตัวหนังสือ + ฟอนต์ + เส้นที่แปลงแล้ว (d ขนาด dw×dh มม. มุมซ้ายบน 0,0) */
  text?: string; font?: string; weight?: number; d?: DrawOps; dw?: number; dh?: number;
  /** สีบนจอ (#rrggbb) — พื้นของชิ้น/ข้อความ/รูปทรง · สีของเส้นตรง */ color: string;
  /** สี่เหลี่ยม/วงกลม: มีพื้นไหม (false = เส้นขอบอย่างเดียว) */ fill: boolean;
  /** ความหนาเส้นขอบ (มม.) 0 = ไม่มี · เส้นตรง = ความหนาเส้น */ stroke: number;
  /** สีเส้นขอบบนจอ */ strokeColor: string;
  /** เส้นตรง: true = จากซ้ายล่างไปขวาบน */ flip?: boolean;
};
export type BlockLayout = { id: string; name: string; w: number; h: number; items: BlockItem[] };

export const LAYOUT_LIMITS = { blocks: 30, items: 500, minSize: 0.5, maxSize: 1000 };
export const MIN_LINE_MM = 0.1;
/** สีชมพูของเส้นไกด์ตำแหน่ง (แบบรูปตัวอย่างของเจ้าของ) */
export const POS_COLOR = "#ec4899";
export const SCREEN_COLORS = ["#111111", "#6b7280", "#d1d5db", "#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed"];
/** ฟอนต์ให้เลือก (Google Fonts — เซิร์ฟเวอร์ดึงไฟล์ TTF เต็มให้ที่ /api/block-print/font) · อัปโหลดฟอนต์เองได้อีกทาง */
export type BlockFont = { family: string; weights: number[]; thai: boolean };
export const BLOCK_FONTS: BlockFont[] = [
  { family: "Sarabun", weights: [400, 700], thai: true },
  { family: "Kanit", weights: [400, 700], thai: true },
  { family: "Prompt", weights: [400, 700], thai: true },
  { family: "Mitr", weights: [400, 600], thai: true },
  { family: "Noto Sans Thai", weights: [400, 700], thai: true },
  { family: "IBM Plex Sans Thai", weights: [400, 700], thai: true },
  { family: "Chakra Petch", weights: [400, 700], thai: true },
  { family: "Bai Jamjuree", weights: [400, 700], thai: true },
  { family: "Noto Serif Thai", weights: [400, 700], thai: true },
  { family: "Roboto", weights: [400, 700], thai: false },
  { family: "Montserrat", weights: [400, 700], thai: false },
  { family: "Oswald", weights: [400, 700], thai: false },
  { family: "Bebas Neue", weights: [400], thai: false },
  { family: "Playfair Display", weights: [400, 700], thai: false },
];
export const findBlockFont = (family: string) => BLOCK_FONTS.find((f) => f.family === family) ?? null;

export const KIND_LABEL: Record<ItemKind, string> = { piece: "ชิ้นจากไฟล์", text: "ข้อความ", rect: "สี่เหลี่ยม", ellipse: "วงกลม", line: "เส้นตรง" };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const HEX = /^#[0-9a-f]{6}$/i;

export function newLayout(existing: BlockLayout[]): BlockLayout {
  const used = new Set(existing.map((l) => l.name));
  let n = existing.length + 1;
  while (used.has(`บล็อก ${n}`)) n++;
  return { id: uid("b"), name: `บล็อก ${n}`, w: 60, h: 40, items: [] };
}
export function uid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
export function baseItem(t: ItemKind, x: number, y: number, w: number, h: number): BlockItem {
  return { id: uid("i"), t, x: r3(x), y: r3(y), w: r3(w), h: r3(h), color: "#111111", fill: true, stroke: t === "line" ? 0.5 : 0, strokeColor: "#111111" };
}

// ───────── รูปทรงสำหรับวาด/ส่งออก (หน่วย มม. ในบล็อก) ─────────

export type InkShape = { d: DrawOps; mode: "fill"; rule: FillRule } | { d: DrawOps; mode: "stroke"; width: number };
const K = 0.5522847498;
export function rectOps(x: number, y: number, w: number, h: number): DrawOps {
  return [OP.M, x, y, OP.L, x + w, y, OP.L, x + w, y + h, OP.L, x, y + h, OP.Z];
}
export function ellipseOps(x: number, y: number, w: number, h: number): DrawOps {
  const rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry, ox = rx * K, oy = ry * K;
  return [
    OP.M, cx - rx, cy,
    OP.C, cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry,
    OP.C, cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy,
    OP.C, cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry,
    OP.C, cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy,
    OP.Z,
  ];
}
const place = (d: DrawOps, sx: number, sy: number, tx: number, ty: number) => mapOps(d, (x, y) => [r3(tx + x * sx), r3(ty + y * sy)]);

/** เส้นที่ต้องวาดของชิ้นหนึ่ง (ชิ้นจากไฟล์ที่ถูกลบไปแล้ว = ว่าง) */
export function itemInk(it: BlockItem, pieceById: Map<string, BlockPiece>): InkShape[] {
  const out: InkShape[] = [];
  const outline = (d: DrawOps) => { if (it.stroke > 0) out.push({ d, mode: "stroke", width: it.stroke }); };
  if (it.t === "piece") {
    const p = it.pieceId ? pieceById.get(it.pieceId) : undefined;
    if (!p) return out;
    const sx = it.w / p.ow, sy = it.h / p.oh;
    for (const s of pieceShapes(p)) { const d = place(s.d, sx, sy, it.x, it.y); out.push({ d, mode: "fill", rule: s.fill }); outline(d); }
  } else if (it.t === "text") {
    if (!it.d?.length || !it.dw || !it.dh) return out;
    const d = place(it.d, it.w / it.dw, it.h / it.dh, it.x, it.y);
    out.push({ d, mode: "fill", rule: "nonzero" }); outline(d);
  } else if (it.t === "rect" || it.t === "ellipse") {
    const d = it.t === "rect" ? rectOps(it.x, it.y, it.w, it.h) : ellipseOps(it.x, it.y, it.w, it.h);
    if (it.fill) out.push({ d, mode: "fill", rule: "nonzero" });
    outline(d);
    if (!it.fill && it.stroke <= 0) out.push({ d, mode: "stroke", width: MIN_LINE_MM });   // กันรูปทรงหายไปเฉย ๆ
  } else if (it.t === "line") {
    const d: DrawOps = it.flip ? [OP.M, it.x, it.y + it.h, OP.L, it.x + it.w, it.y] : [OP.M, it.x, it.y, OP.L, it.x + it.w, it.y + it.h];
    out.push({ d, mode: "stroke", width: Math.max(it.stroke, MIN_LINE_MM) });
  }
  return out;
}

/** กรอบที่ใช้วัด (เส้นตรง = รวมความหนาเส้นไม่คิด) */
export const itemBox = (it: BlockItem) => ({ x: it.x, y: it.y, w: it.w, h: it.h });
export function selectionBox(items: BlockItem[]): { x: number; y: number; w: number; h: number } | null {
  if (!items.length) return null;
  const x0 = Math.min(...items.map((i) => i.x)), y0 = Math.min(...items.map((i) => i.y));
  return { x: x0, y: y0, w: Math.max(...items.map((i) => i.x + i.w)) - x0, h: Math.max(...items.map((i) => i.y + i.h)) - y0 };
}
/** ชิ้นที่ล้นขอบบล็อก (เตือน ไม่ห้าม) */
export function outsideIds(l: BlockLayout): string[] {
  const e = 0.001;
  return l.items.filter((i) => i.x < -e || i.y < -e || i.x + i.w > l.w + e || i.y + i.h > l.h + e).map((i) => i.id);
}
/** ชิ้นจากไฟล์ที่ชิ้นต้นฉบับหายไปแล้ว (จัดกลุ่มใหม่/ลบ) */
export function missingPieceIds(l: BlockLayout, pieceById: Map<string, BlockPiece>): string[] {
  return l.items.filter((i) => i.t === "piece" && (!i.pieceId || !pieceById.has(i.pieceId))).map((i) => i.id);
}

// ───────── จัดแนว / กระจาย / ทำซ้ำ ─────────

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
/** ชิ้นเดียว = จัดเทียบบล็อก · หลายชิ้น = จัดเทียบกรอบรวมของที่เลือก */
export function alignItems(l: BlockLayout, ids: string[], mode: AlignMode): BlockItem[] {
  const sel = l.items.filter((i) => ids.includes(i.id));
  if (!sel.length) return l.items;
  const ref = sel.length === 1 ? { x: 0, y: 0, w: l.w, h: l.h } : selectionBox(sel)!;
  return l.items.map((i) => {
    if (!ids.includes(i.id)) return i;
    const n = { ...i };
    if (mode === "left") n.x = ref.x;
    if (mode === "hcenter") n.x = ref.x + (ref.w - i.w) / 2;
    if (mode === "right") n.x = ref.x + ref.w - i.w;
    if (mode === "top") n.y = ref.y;
    if (mode === "vcenter") n.y = ref.y + (ref.h - i.h) / 2;
    if (mode === "bottom") n.y = ref.y + ref.h - i.h;
    n.x = r3(n.x); n.y = r3(n.y);
    return n;
  });
}
/** กระจายให้ช่องว่างระหว่างชิ้นเท่ากัน (ตั้งแต่ 3 ชิ้น · ชิ้นหัว-ท้ายอยู่ที่เดิม) */
export function distributeItems(l: BlockLayout, ids: string[], axis: "h" | "v"): BlockItem[] {
  const sel = l.items.filter((i) => ids.includes(i.id));
  if (sel.length < 3) return l.items;
  const pos = (i: BlockItem) => (axis === "h" ? i.x : i.y), size = (i: BlockItem) => (axis === "h" ? i.w : i.h);
  const sorted = [...sel].sort((a, b) => pos(a) - pos(b));
  const first = sorted[0], last = sorted[sorted.length - 1];
  const span = pos(last) + size(last) - pos(first);
  const gap = (span - sorted.reduce((s, i) => s + size(i), 0)) / (sorted.length - 1);
  const at = new Map<string, number>();
  let cur = pos(first);
  for (const i of sorted) { at.set(i.id, r3(cur)); cur += size(i) + gap; }
  return l.items.map((i) => (at.has(i.id) ? { ...i, [axis === "h" ? "x" : "y"]: at.get(i.id)! } : i));
}
/** ทำซ้ำชิ้นเป็นแถว: count ชิ้นเพิ่ม · ห่างกัน gap มม. (ขอบถึงขอบ) */
export function repeatItem(l: BlockLayout, id: string, count: number, gap: number, axis: "h" | "v"): { items: BlockItem[]; added: string[] } {
  const src = l.items.find((i) => i.id === id);
  const n = Math.max(0, Math.min(200, Math.floor(count)));
  if (!src || !n) return { items: l.items, added: [] };
  const added: BlockItem[] = [];
  for (let k = 1; k <= n; k++) {
    added.push({ ...src, id: uid("i"), x: axis === "h" ? r3(src.x + k * (src.w + gap)) : src.x, y: axis === "v" ? r3(src.y + k * (src.h + gap)) : src.y });
  }
  return { items: [...l.items, ...added], added: added.map((a) => a.id) };
}
/** ตั้งขนาด (ล็อกสัดส่วนได้) — เส้นตรงที่ด้านหนึ่งเป็น 0 ไม่ล็อก */
export function resizeItem(it: BlockItem, field: "w" | "h", v: number, lock: boolean): BlockItem {
  if (!Number.isFinite(v) || v < 0) return it;
  const val = r3(Math.min(LAYOUT_LIMITS.maxSize, v));
  if (it.t !== "line" && val < 0.05) return it;
  const ratio = it.w > 0 && it.h > 0 ? it.h / it.w : 0;
  if (field === "w") return { ...it, w: val, h: lock && ratio ? r3(val * ratio) : it.h };
  return { ...it, h: val, w: lock && ratio ? r3(val / ratio) : it.w };
}

// ───────── ระยะบอกตำแหน่ง (ใช้ร่วมจอ/PDF) ─────────

export type LayoutLine = { x1: number; y1: number; x2: number; y2: number; kind: "guide" | "dim" | "pos" | "outline" };
export type LayoutText = { x: number; y: number; text: string; rotate: 0 | 90 };
const LABEL = DIM.text;
/** ความยาวโดยประมาณของตัวเลข (ฟอนต์ Courier กว้าง ~0.6 เท่าความสูง) */
export const labelLen = (s: string) => s.length * LABEL * 0.6;

function uniqueSorted(vals: number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (const v of [...vals].sort((a, b) => a - b)) {
    if (v <= lo + 0.05 || v >= hi - 0.05) continue;
    if (out.length && v - out[out.length - 1] < 0.05) continue;
    out.push(r3(v));
  }
  return out;
}

/**
 * เส้น/ตัวเลขรอบบล็อก (พิกัดเทียบมุมซ้ายบนของบล็อก)
 *   กรอบบล็อก · เส้นไกด์ชมพูที่ขอบซ้าย/ขวาของทุกชิ้น (ยาวเต็มความสูงบล็อก) + ตัวเลขระยะจากขอบซ้ายด้านบน (หมุนตั้ง)
 *   ระยะจากขอบบนของขอบบน/ล่างทุกชิ้นด้านซ้าย · ขนาดบล็อก: กว้างด้านล่าง สูงด้านขวา (แบบเส้นบอกขนาดเดิม)
 *   ตัวเลขชิดกันเกินไป → ขยับขึ้นชั้นถัดไป (มีเส้นไกด์เทาโยงถึง)
 */
export function layoutDims(l: BlockLayout, unit: BlockUnit): { lines: LayoutLine[]; texts: LayoutText[] } {
  const lines: LayoutLine[] = [];
  const texts: LayoutText[] = [];
  const L = (x1: number, y1: number, x2: number, y2: number, kind: LayoutLine["kind"]) => lines.push({ x1: r3(x1), y1: r3(y1), x2: r3(x2), y2: r3(y2), kind });
  const { w: W, h: H } = l;
  L(0, 0, W, 0, "outline"); L(W, 0, W, H, "outline"); L(W, H, 0, H, "outline"); L(0, H, 0, 0, "outline");
  const g = DIM.guideGap;
  const xs = uniqueSorted(l.items.flatMap((i) => [i.x, i.x + i.w]), 0, W);
  const ys = uniqueSorted(l.items.flatMap((i) => [i.y, i.y + i.h]), 0, H);
  // ระยะแนวนอน: ตัวเลขหมุนตั้งเหนือบล็อก
  let lastX = -Infinity, tier = 0;
  for (const x of xs) {
    L(x, 0, x, H, "pos");
    tier = x - lastX < LABEL * 1.15 ? (tier + 1) % 3 : 0;
    lastX = x;
    const t = fmtDim(x, unit), len = labelLen(t);
    const base = g + tier * (len + 1.5);
    if (tier) L(x, -g, x, -base, "guide");
    texts.push({ x: r3(x + LABEL * 0.35), y: r3(-base - len / 2), text: t, rotate: 90 });
  }
  // ระยะแนวตั้ง: ตัวเลขแนวนอนด้านซ้าย
  let lastY = -Infinity; tier = 0;
  for (const y of ys) {
    L(-g, y, 0, y, "guide");
    tier = y - lastY < LABEL * 1.15 ? (tier + 1) % 3 : 0;
    lastY = y;
    const t = fmtDim(y, unit), len = labelLen(t);
    const base = g + 0.5 + tier * (len + 1.5);
    if (tier) L(-g, y, -base, y, "guide");
    texts.push({ x: r3(-base - len / 2), y: r3(y + LABEL * 0.35), text: t, rotate: 0 });
  }
  // ขนาดบล็อก: กว้าง (ล่าง) · สูง (ขวา)
  const wy = H + DIM.wBracket, hx = W + DIM.hBracket;
  for (const gx of [0, W]) L(gx, H + g, gx, wy - DIM.wTick - 0.6, "guide");
  for (const gy of [0, H]) L(W + g, gy, hx - DIM.tick - 0.6, gy, "guide");
  L(0, wy, W, wy, "dim"); L(0, wy - DIM.wTick, 0, wy, "dim"); L(W, wy - DIM.wTick, W, wy, "dim");
  L(hx, 0, hx, H, "dim"); L(hx - DIM.tick, 0, hx + DIM.tick, 0, "dim"); L(hx - DIM.tick, H, hx + DIM.tick, H, "dim");
  texts.push({ x: r3(W / 2), y: r3(wy + DIM.textGap + LABEL), text: fmtDim(W, unit), rotate: 0 });
  texts.push({ x: r3(hx + DIM.tick + 0.8), y: r3(H / 2), text: fmtDim(H, unit), rotate: 90 });
  return { lines, texts };
}

/** กรอบรวมของเส้น/ตัวเลข (เผื่อขอบตัวหนังสือ) */
export function dimsExtent(d: { lines: LayoutLine[]; texts: LayoutText[] }): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const l of d.lines) { add(l.x1, l.y1); add(l.x2, l.y2); }
  for (const t of d.texts) {
    const len = labelLen(t.text);
    if (t.rotate) { add(t.x - LABEL * 0.3, t.y - len / 2); add(t.x + LABEL, t.y + len / 2); }   // หมุนตามเข็ม: ตัวอักษรอยู่ทางขวาของเส้นฐาน
    else { add(t.x - len / 2, t.y - LABEL); add(t.x + len / 2, t.y + LABEL * 0.3); }
  }
  return { x0, y0, x1, y1 };
}

export type BlockPage =
  | { ok: true; orientation: "portrait" | "landscape"; pageW: number; pageH: number; ox: number; oy: number; dims: { lines: LayoutLine[]; texts: LayoutText[] } }
  | { ok: false; error: string };
/** วางบล็อกกลางหน้ากระดาษ (ขนาดจริง 1:1) — ลองแนวตั้งก่อน · ใหญ่เกิน = แจ้งเตือน ไม่ย่อเอง */
export function blockPage(l: BlockLayout, paper: BlockPaper, unit: BlockUnit): BlockPage {
  const dims = layoutDims(l, unit);
  const e = dimsExtent(dims);
  const ew = e.x1 - e.x0, eh = e.y1 - e.y0;
  const { w: pw, h: ph } = PAPERS[paper];
  for (const orientation of ["portrait", "landscape"] as const) {
    const pageW = orientation === "portrait" ? pw : ph, pageH = orientation === "portrait" ? ph : pw;
    if (ew + 2 * DIM.margin <= pageW && eh + 2 * DIM.margin <= pageH) {
      return { ok: true, orientation, pageW, pageH, ox: r3((pageW - ew) / 2 - e.x0), oy: r3((pageH - eh) / 2 - e.y0), dims };
    }
  }
  return { ok: false, error: `บล็อก ${fmtDim(l.w, unit)} × ${fmtDim(l.h, unit)} (รวมที่ว่างของตัวเลขบอกระยะ) ใหญ่เกินกระดาษ ${paper} — เปลี่ยนเป็นกระดาษใหญ่ขึ้น` };
}

// ───────── SVG ─────────

const n3 = (v: number) => String(r3(v));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** SVG ขนาดจริง (มม.) ลายสีดำ — เปิดใน Illustrator ได้ตรงขนาด */
export function inkSvg(shapes: InkShape[], w: number, h: number, opts: { title?: string; outline?: boolean } = {}): string {
  const body = shapes.map((s) => (s.mode === "fill"
    ? `<path d="${opsToSvgPath(s.d)}" fill="#000000" fill-rule="${s.rule}"/>`
    : `<path d="${opsToSvgPath(s.d)}" fill="none" stroke="#000000" stroke-width="${n3(s.width)}" stroke-linejoin="round"/>`)).join("\n  ");
  const outline = opts.outline ? `\n  <rect id="block-outline" x="0" y="0" width="${n3(w)}" height="${n3(h)}" fill="none" stroke="${DIM_COLORS.guide}" stroke-width="0.1"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n3(w)}mm" height="${n3(h)}mm" viewBox="0 0 ${n3(w)} ${n3(h)}">${opts.title ? `\n  <title>${esc(opts.title)}</title>` : ""}${outline}
  ${body}
</svg>
`;
}
/** SVG ของชิ้นเดียว ตามขนาดที่ตั้ง */
export function pieceSvg(p: BlockPiece): string {
  const sx = p.w / p.ow, sy = p.h / p.oh;
  return inkSvg(pieceShapes(p).map((s) => ({ d: place(s.d, sx, sy, 0, 0), mode: "fill", rule: s.fill })), p.w, p.h, { title: p.name });
}
/** SVG ทั้งบล็อก (มีกรอบบล็อกเส้นเทาบางแยกชั้น) */
export function layoutSvg(l: BlockLayout, pieceById: Map<string, BlockPiece>): string {
  return inkSvg(l.items.flatMap((i) => itemInk(i, pieceById)), l.w, l.h, { title: l.name, outline: true });
}
/** SVG ของชิ้นเดียวในบล็อก (ตามขนาดในบล็อก · เผื่อขอบครึ่งความหนาเส้น) */
export function itemSvg(it: BlockItem, pieceById: Map<string, BlockPiece>): string {
  const pad = (it.t === "line" ? Math.max(it.stroke, MIN_LINE_MM) : it.stroke) / 2;
  return inkSvg(itemInk({ ...it, x: pad, y: pad }, pieceById), it.w + 2 * pad, it.h + 2 * pad, { title: it.text || KIND_LABEL[it.t] });
}
export function svgFileName(...parts: string[]): string {
  const clean = parts.join(" ").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${clean || "block"}.svg`;
}

// ───────── ตรวจข้อมูลก่อนบันทึก + ประวัติ ─────────

const KINDS = new Set<ItemKind>(["piece", "text", "rect", "ellipse", "line"]);
export function cleanLayouts(raw: unknown): { ok: true; layouts: BlockLayout[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "ข้อมูลบล็อกไม่ถูกต้อง" };
  if (raw.length > LAYOUT_LIMITS.blocks) return { ok: false, error: `บล็อกเยอะเกินไป (เกิน ${LAYOUT_LIMITS.blocks})` };
  const out: BlockLayout[] = [];
  const bids = new Set<string>();
  let points = 0;
  for (const rb of raw) {
    const b = (rb ?? {}) as Record<string, unknown>;
    const id = String(b.id ?? "").slice(0, 40);
    if (!id || bids.has(id)) return { ok: false, error: "รหัสบล็อกซ้ำหรือว่าง" };
    bids.add(id);
    const w = Number(b.w), h = Number(b.h);
    if (![w, h].every((v) => Number.isFinite(v) && v >= LAYOUT_LIMITS.minSize && v <= LAYOUT_LIMITS.maxSize)) return { ok: false, error: "ขนาดบล็อกต้องอยู่ระหว่าง 0.5 – 1000 มม." };
    const rawItems = Array.isArray(b.items) ? b.items : [];
    if (rawItems.length > LAYOUT_LIMITS.items) return { ok: false, error: `ชิ้นในบล็อกเยอะเกินไป (เกิน ${LAYOUT_LIMITS.items})` };
    const items: BlockItem[] = [];
    const iids = new Set<string>();
    for (const ri of rawItems as Record<string, unknown>[]) {
      const t = ri?.t as ItemKind;
      if (!KINDS.has(t)) return { ok: false, error: "ชนิดชิ้นในบล็อกไม่ถูกต้อง" };
      const iid = String(ri.id ?? "").slice(0, 40);
      if (!iid || iids.has(iid)) return { ok: false, error: "รหัสชิ้นในบล็อกซ้ำหรือว่าง" };
      iids.add(iid);
      const [x, y, iw, ih] = ["x", "y", "w", "h"].map((k) => Number(ri[k]));
      if (![x, y, iw, ih].every(Number.isFinite) || Math.abs(x) > 5000 || Math.abs(y) > 5000 || iw < 0 || ih < 0 || iw > LAYOUT_LIMITS.maxSize || ih > LAYOUT_LIMITS.maxSize || (iw === 0 && ih === 0))
        return { ok: false, error: "ตำแหน่ง/ขนาดชิ้นในบล็อกไม่ถูกต้อง" };
      const stroke = Number(ri.stroke);
      const it: BlockItem = {
        id: iid, t, x, y, w: iw, h: ih,
        color: HEX.test(String(ri.color)) ? String(ri.color) : "#111111",
        fill: ri.fill !== false,
        stroke: Number.isFinite(stroke) && stroke >= 0 && stroke <= 50 ? stroke : 0,
        strokeColor: HEX.test(String(ri.strokeColor)) ? String(ri.strokeColor) : "#111111",
      };
      if (t === "piece") it.pieceId = String(ri.pieceId ?? "").slice(0, 40);
      if (t === "line" && ri.flip === true) it.flip = true;
      if (t === "text") {
        it.text = String(ri.text ?? "").slice(0, 500);
        it.font = String(ri.font ?? "").slice(0, 80);
        const wt = Number(ri.weight); if (Number.isFinite(wt)) it.weight = wt;
        const d = Array.isArray(ri.d) ? (ri.d as unknown[]).map(Number) : [];
        if (d.length) {
          if (!d.every(Number.isFinite)) return { ok: false, error: "เส้นของข้อความไม่ถูกต้อง" };
          try { eachOp(d, () => undefined); } catch { return { ok: false, error: "เส้นของข้อความไม่ถูกต้อง" }; }
          const dw = Number(ri.dw), dh = Number(ri.dh);
          if (!(dw > 0 && dh > 0)) return { ok: false, error: "ขนาดข้อความไม่ถูกต้อง" };
          points += d.length;
          it.d = d; it.dw = dw; it.dh = dh;
        }
      }
      items.push(it);
    }
    out.push({ id, name: String(b.name ?? "").trim().slice(0, 80) || "บล็อก", w, h, items });
  }
  if (points > 400_000) return { ok: false, error: "เส้นของข้อความรวมเยอะเกินไป" };
  return { ok: true, layouts: out };
}

/** ประวัติการแก้บล็อก (ใส่ใน audit metadata.changes) — จดต่อบล็อก: ชื่อ · ขนาด · จำนวนชิ้น */
export function layoutAuditChanges(before: BlockLayout[], after: BlockLayout[]): { field: string; label: string; old: string | null; new: string | null }[] {
  const show = (l?: BlockLayout) => (l ? `${l.name} · ${+l.w.toFixed(2)}×${+l.h.toFixed(2)} มม. · ${l.items.length} ชิ้น` : null);
  const a = new Map(before.map((l) => [l.id, l])), b = new Map(after.map((l) => [l.id, l]));
  const out: { field: string; label: string; old: string | null; new: string | null }[] = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const o = a.get(id), n = b.get(id);
    const moved = !!o && !!n && JSON.stringify(o.items) !== JSON.stringify(n.items);
    if (show(o) === show(n) && !moved) continue;
    out.push({ field: `layout:${id}`, label: `บล็อก ${n?.name ?? o?.name ?? id}`, old: show(o), new: moved && show(o) === show(n) ? `${show(n)} (ย้าย/แก้ชิ้น)` : show(n) });
  }
  return out;
}
