/**
 * ✂ หน้าแพทเทิร์นจากตีราคา (ส่วนคิดเลข — ไม่มีหน้าจอ) · เจ้าของขอ 2026-11-07
 *   "อยากลองทำแบบเป็นหน้าแบบ pattern ที่สร้างจากตรงนี้ได้เอง" (ตารางตีราคาในใบงานออกแบบ)
 *
 *   • patternPieces  — บรรทัดที่มี กว้าง×ยาว → ชิ้นแพทเทิร์น (P1, P2, …) 1 แบบต่อบรรทัด + ตัดกี่ชิ้น
 *   • shelfLayout    — วางชิ้นเรียงเป็นแถวบนแผ่นกว้างที่กำหนด (ซม.) → ตำแหน่งแต่ละชิ้น
 *   • tilePages      — แบ่งแผ่นใหญ่เป็นหน้า A4 (พิมพ์ขนาดจริง 1:1 แล้วต่อกัน)
 *   • buildPatternDxf / buildPatternSvg — ไฟล์ส่งเครื่องตัด (DXF หน่วยมม. ข้อความ ASCII) / ไฟล์ภาพเวกเตอร์
 *
 *   ชิ้นเป็นสี่เหลี่ยมตาม กว้าง×ยาว ในตาราง · บรรทัดที่ "วาดรูปทรง" ไว้ (shape — lib/pattern-shape) = ใช้รูปทรงจริง (2026-11-09)
 * คู่มือ: docs/pattern-sheet.md · หน้าจอ: components/pattern-sheet · หน้าพิมพ์: app/print/design-sheet/[id]/pattern
 */

import { cleanLineShape, foldSegments, notchSegments, pieceGeometry, polyD, shapePathD, type Pt, foldSecondLines, edgeAllowances, shapeEdgeCount } from "@/lib/pattern-shape";
import { notchStyleSegs } from "@/lib/pattern-edit";

export type PatternLineInput = {
  key?: string | null;
  /** รูปทรงที่วาด/วางจาก Illustrator (design_sheet_cost_lines.shape) — มี = ชิ้นแพทเทิร์นเป็นรูปทรงจริง */
  shape?: unknown;
  /** วิธีคิดของบรรทัด (ตีราคา) — ส่งมา = เอาเฉพาะแบบคิดพื้นที่ (area_face / area_100) · ไม่ส่ง = เอาทุกบรรทัดที่มีกว้าง×ยาว */
  calc_method?: string | null;
  item_name?: string | null;
  /** วัสดุที่ใช้จัดกลุ่ม "วางบนผ้า" — ไม่ส่ง = ชื่อวัสดุของบรรทัด (item_name) */
  material?: string | null;
  group_name?: string | null;
  width_cm?: number | null;
  length_cm?: number | null;
  pieces?: number | null;
  face_width_cm?: number | null;
  note?: string | null;
};

export type PatternPiece = {
  id: string;          // P1, P2, …
  name: string;        // ชื่อวัสดุ (· ชื่อชิ้น ถ้าวาดไว้)
  material: string;    // วัสดุที่ตัด — ชิ้นวัสดุเดียวกันวางบนผ้าผืนเดียวกัน
  group: string;       // ชนิด (ผ้า / ตัวเสริม …) — ใช้แยกสี
  w: number;           // กว้าง (ซม.)
  h: number;           // ยาว (ซม.)
  count: number;       // ตัดกี่ชิ้นต่อ 1 ใบ
  faceWidth: number | null;   // หน้าผ้า (ซม.) ถ้ามี
  note: string | null;
  /** รูปทรงจริง (เริ่มที่ 0,0 ภายในกรอบ w×h) — ไม่มี = สี่เหลี่ยม */
  d?: string | null;          // SVG path data ของเส้นตัด (+รูเจาะ · fill-rule evenodd)
  sewD?: string | null;       // เส้นเย็บ (มีเผื่อพับ) — วาดเส้นประ
  outline?: Pt[] | null;      // จุดรอบเส้นตัด (ไฟล์ DXF)
  holes?: Pt[][] | null;      // รูเจาะที่ตัดจริง (ไฟล์ DXF)
  sewOutline?: Pt[] | null;   // จุดรอบเส้นเย็บ (ไฟล์ DXF layer SEW)
  grainSegs?: [Pt, Pt][] | null;   // เส้นทางผ้า: ก้าน + หัวลูกศร 2 ข้าง (DXF layer GRAIN)
  notchSegs?: [Pt, Pt][] | null;   // รอยบาก: ขีดจากเส้นตัดเข้าในชิ้น (DXF layer NOTCH)
  marksD?: string | null;          // เส้นทางผ้า + รอยบาก รวมเป็น SVG path (วาดเส้นทึบบาง)
  dims?: { a: Pt; b: Pt; label: string }[] | null;
  bands?: { kind: "glue" | "skive"; pts: Pt[] }[] | null;
  stitchSegs?: Pt[][] | null;      // เดินด้ายทับ (รอบ G2) — DXF layer STITCH
  /** รอบ H: พื้นที่ตัด 1 ชิ้น (ตร.ซม.) · ขนาดสำเร็จ (เส้นเย็บ) · ป้ายวิธีวางตัด (คู่ซ้าย-ขวา / คว่ำหน้า / ทางเดียว) */
  area?: number; fin?: { w: number; h: number } | null; tag?: string | null;   // แนวทากาว / ปาดบาง (รอบ F) — DXF layer GLUE / SKIVE   // เส้นวัดถาวร (รอบ E) — DXF layer DIM + ตัวเลข
  foldSegs?: Pt[][] | null;        // เส้นพับ (ขอบที่ตั้งว่าพับเข้าใน) — DXF layer FOLD
  foldD?: string | null;           // เส้นพับเป็น SVG path (วาดเส้นประยาว-สั้น)
  innerSegs?: Pt[][] | null;       // เส้นในชิ้น (แนวเย็บ / ช่องเจาะ / แนวพับ / ตำแหน่ง) — DXF layer INNER
  innerD?: string | null;          // เส้นในชิ้นเป็น SVG path (วาดเส้นประสั้น) — รวมสัญลักษณ์อะไหล่ (วงกลม + กากบาท)
  hwMarks?: { c: Pt; r: number }[] | null;   // อะไหล่ที่วางบนชิ้น (กึ่งกลาง + รัศมี ซม.) — DXF: วงกลมในชั้น HW
};

/** ลูกศรเส้นทางผ้า 2 หัว → ชุดเส้นตรง (ก้าน + หัว 4 เส้น) */
export function grainArrowSegs(a: Pt, b: Pt, oneWay = false): [Pt, Pt][] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(L > 0)) return [];
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, hs = Math.min(1, L * 0.15), hw = hs * 0.55;
  const head = (p: Pt, s: number): [Pt, Pt][] => [
    [p, [p[0] + s * ux * hs - uy * hw, p[1] + s * uy * hs + ux * hw]],
    [p, [p[0] + s * ux * hs + uy * hw, p[1] + s * uy * hs - ux * hw]],
  ];
  return oneWay ? [[a, b], ...head(b, -1)] : [[a, b], ...head(a, 1), ...head(b, -1)];   // ทางเดียว (ผ้ามีขน/ลาย) = หัวลูกศรเดียว
}
const r2 = (v: number) => Math.round(v * 100) / 100;
const segsD = (S: [Pt, Pt][]) => S.map(([a, b]) => `M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`).join("");

export type PlacedPiece = PatternPiece & { x: number; y: number };
export type PatternLayout = { placed: PlacedPiece[]; width: number; height: number };
export type PatternPage = { row: number; col: number; x: number; y: number; w: number; h: number };

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r1 = (v: number) => Math.round(v * 10) / 10;

/** วิธีคิดที่ใช้ทั้งกว้างและยาว (ชิ้นตัดจริง) — สาย/เทปคิดตามยาว ("length") อาจมีค่ากว้างค้างจากเดิม ห้ามนับเป็นชิ้น
 *  (เจอจริง 2026-11-07: กุ้น 7 หุน 167 × 100 ใน DS-2026-0064 → เคยจะกลายเป็นชิ้นยักษ์ พิมพ์ A4 หลายสิบหน้า) */
export const PATTERN_AREA_METHODS = new Set(["area_face", "area_100", "area_sheet"]);

/** บรรทัดตีราคา → ชิ้นแพทเทิร์น (เฉพาะบรรทัดที่มีทั้งกว้างและยาว + คิดแบบพื้นที่) · ชิ้น = 0/ว่าง ถือเป็น 1 */
export function patternPieces(lines: PatternLineInput[]): PatternPiece[] {
  const out: PatternPiece[] = [];
  for (const l of lines) {
    const ls = cleanLineShape(l.shape);   // ชิ้นที่วาดไว้ = ชิ้นแพทเทิร์นเสมอ ไม่ว่าวิธีคิดไหน (เจอจริง 2026-11-09: วาดแบบ "ตัดจากผืน" area_sheet แล้วหน้าพิมพ์ไม่ขึ้น)
    if (!ls && l.calc_method !== undefined && !PATTERN_AREA_METHODS.has(l.calc_method ?? "")) continue;
    const g = ls ? pieceGeometry(ls) : null;   // เส้นตัด (รวมเผื่อพับ) · รู · เส้นเย็บ
    const cb = g?.cutBox;
    const w = cb ? cb.w : num(l.width_cm), h = cb ? cb.h : num(l.length_cm);
    const sh = (P: Pt[]): Pt[] => P.map(([x, y]) => [x - (cb?.x ?? 0), y - (cb?.y ?? 0)]);   // ให้มุมซ้ายบนของเส้นตัด = 0,0
    const allow = ls?.allow ?? 0;
    const hasAllow = allow > 0 || !!g?.segAllow;   // มีเส้นตัดแยกจากเส้นเย็บ (ค่าเดียวทั้งชิ้น หรือ เผื่อรายขอบ)
    if (!(w > 0) || !(h > 0)) continue;
    const grainSegs = ls?.grain ? grainArrowSegs(...(sh(ls.grain) as [Pt, Pt]), !!ls.nap) : [];
    const perAllow = ls ? edgeAllowances(ls.shape, ls.allowEdges, allow) ?? Array.from({ length: shapeEdgeCount(ls.shape) }, () => allow) : [];
    const foldSegs = ls?.foldEdges ? [...foldSegments(ls.shape, ls.foldEdges), ...foldSecondLines(ls.shape, ls.foldEdges, perAllow)].map(sh) : [];   // พับสองทบ = เส้นพับที่สองนอกเส้นเย็บครึ่งเผื่อ
    const innerSegs = (ls?.inner ?? []).filter((x) => x.pts.length >= 2 && x.kind !== "hw" && x.kind !== "dim" && x.kind !== "glue" && x.kind !== "skive").map((x) => sh(x.pts));
    // แนวทากาว / แนวปาดบาง (รอบ F): เส้นบอกงานบนชิ้น — ใบพิมพ์ + DXF ชั้น GLUE / SKIVE (ไม่ใช่เส้นตัด)
    const bands = (ls?.inner ?? []).filter((x) => (x.kind === "glue" || x.kind === "skive") && x.pts.length >= 2).map((x) => ({ kind: x.kind as "glue" | "skive", pts: sh(x.pts) }));
    const stitchSegs = (ls?.stitch ?? []).map((L) => sh(L));   // เดินด้ายทับ (รอบ G2)
    // เส้นวัดถาวร (รอบ E): เส้นบาง + ตัวเลขความยาว — ใบพิมพ์ + DXF ชั้น DIM (ไม่ใช่เส้นตัด)
    const dims = (ls?.inner ?? []).filter((x) => x.kind === "dim" && x.pts.length >= 2).map((x) => { const [a, b] = sh([x.pts[0], x.pts[x.pts.length - 1]]); return { a, b, label: `${r1(Math.hypot(b[0] - a[0], b[1] - a[1]))} cm` }; });
    // อะไหล่ที่วางบนชิ้น: วงกลมขนาดจริง + กากบาทกึ่งกลาง (ใบพิมพ์) · วงกลมในชั้น HW (ไฟล์ตัด) — ไม่ใช่เส้นสั้นในชั้น INNER
    const hwMarks = (ls?.inner ?? []).filter((x) => x.kind === "hw" && x.pts.length >= 2).map((x) => { const [a, b] = sh([x.pts[0], x.pts[x.pts.length - 1]]); return { c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt, r: Math.max(0.15, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2) }; });
    const hwD = hwMarks.map(({ c, r }) => `M${r2(c[0] - r)} ${r2(c[1])}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0M${r2(c[0] - r / 2)} ${r2(c[1])}h${r2(r)}M${r2(c[0])} ${r2(c[1] - r / 2)}v${r2(r)}`).join("");
    const notchSegs = g && ls?.notches?.length ? notchSegments(g.sew, ls.notches, allow, 0.5, g.segAllow).flatMap((x) => notchStyleSegs(x, ls.notchStyle)).map((x) => sh(x) as [Pt, Pt]) : [];   // แบบรอยบาก: เดี่ยว / คู่ / V
    out.push({
      id: `P${out.length + 1}`,
      name: [(l.item_name ?? "").trim() || "ไม่ระบุวัสดุ", ls?.name].filter(Boolean).join(" · "),
      material: (l.material ?? "").trim() || (l.item_name ?? "").trim() || "ไม่ระบุวัสดุ",
      group: (l.group_name ?? "").trim() || "ไม่ระบุชนิด",
      w: r1(w), h: r1(h),
      d: ls && g ? (hasAllow ? polyD(sh(g.cut)) + g.holesCut.map((x) => polyD(sh(x))).join("") : shapePathD(ls.shape, -(cb?.x ?? 0), -(cb?.y ?? 0)) + (ls.holes ?? []).map((x) => shapePathD(x, -(cb?.x ?? 0), -(cb?.y ?? 0))).join("")) : null,
      sewD: ls && g && hasAllow ? shapePathD(ls.shape, -(cb?.x ?? 0), -(cb?.y ?? 0)) + (ls.holes ?? []).map((x) => shapePathD(x, -(cb?.x ?? 0), -(cb?.y ?? 0))).join("") : null,
      outline: g ? sh(g.cut) : null,
      holes: g ? g.holesCut.map(sh) : null,
      sewOutline: g && hasAllow ? sh(g.sew) : null,
      ...(grainSegs.length ? { grainSegs } : {}),
      ...(notchSegs.length ? { notchSegs } : {}),
      ...(grainSegs.length || notchSegs.length ? { marksD: segsD([...grainSegs, ...notchSegs]) } : {}),
      ...(foldSegs.length ? { foldSegs, foldD: foldSegs.map((L) => "M" + L.map(([x, y]) => `${r2(x)} ${r2(y)}`).join("L")).join("") } : {}),
      ...(innerSegs.length || hwMarks.length ? { ...(innerSegs.length ? { innerSegs } : {}), innerD: innerSegs.map((L) => "M" + L.map(([x, y]) => `${r2(x)} ${r2(y)}`).join("L")).join("") + hwD } : {}),
      ...(hwMarks.length ? { hwMarks } : {}),
      ...(dims.length ? { dims } : {}),
      ...(bands.length ? { bands } : {}),
      ...(stitchSegs.length ? { stitchSegs } : {}),
      count: Math.max(1, Math.round(num(l.pieces)) || 1),
      faceWidth: num(l.face_width_cm) > 0 ? num(l.face_width_cm) : null,
      note: (l.note ?? "").trim() || null,
      area: r1(g ? g.cutArea : w * h), fin: g ? { w: r1(g.finished.w), h: r1(g.finished.h) } : null, tag: ls?.tag ?? null,
    });
  }
  return out;
}

/** วางชิ้นเรียงเป็นแถวบนแผ่นกว้าง maxWidth (ซม.) — ชิ้นสูงก่อน · ชิ้นที่กว้างกว่าแผ่นได้แถวของตัวเอง */
export function shelfLayout(pieces: PatternPiece[], maxWidth: number, gap = 2): PatternLayout {
  const sorted = [...pieces].sort((a, b) => b.h - a.h || b.w - a.w);
  const placed: PlacedPiece[] = [];
  let x = 0, y = 0, rowH = 0, width = 0;
  for (const p of sorted) {
    if (x > 0 && x + p.w > maxWidth) { x = 0; y += rowH + gap; rowH = 0; }
    placed.push({ ...p, x, y });
    width = Math.max(width, x + p.w);
    x += p.w + gap;
    rowH = Math.max(rowH, p.h);
  }
  // คืนลำดับเดิม (P1, P2, …) ให้ตารางรายการตรงกับภาพ
  placed.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  return { placed, width: r1(width), height: r1(placed.length ? y + rowH : 0) };
}

/** แบ่งแผ่น (กว้าง×สูง ซม.) เป็นหน้า pageW×pageH (ซม.) · overlap = ส่วนทับกันไว้ต่อกระดาษ */
export function tilePages(width: number, height: number, pageW: number, pageH: number, overlap = 1): PatternPage[] {
  if (!(width > 0) || !(height > 0)) return [];
  const stepX = Math.max(1, pageW - overlap), stepY = Math.max(1, pageH - overlap);
  const cols = Math.max(1, Math.ceil((width - overlap) / stepX));
  const rows = Math.max(1, Math.ceil((height - overlap) / stepY));
  const pages: PatternPage[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pages.push({ row: r + 1, col: c + 1, x: c * stepX, y: r * stepY, w: pageW, h: pageH });
  return pages;
}

/** เฉพาะหน้าที่มีชิ้นอยู่ (หน้าว่างไม่ต้องพิมพ์ — ประหยัดกระดาษ) */
export function pagesWithPieces(pages: PatternPage[], layout: PatternLayout): PatternPage[] {
  return pages.filter((g) => layout.placed.some((p) => p.x < g.x + g.w && g.x < p.x + p.w && p.y < g.y + g.h && g.y < p.y + p.h));
}

/** กระดาษ A4 แนวตั้ง ขอบพิมพ์ 10 มม. → พื้นที่พิมพ์ 19 × 27.7 ซม. */
export const A4_PRINTABLE = { w: 19, h: 27.7 } as const;

/** หน้ากว้างแผ่นที่ใช้วาง (ซม.) — ให้พอดีจำนวนหน้า A4 เต็ม ๆ และไม่แคบกว่าชิ้นที่กว้างที่สุด */
export function patternSheetWidth(pieces: PatternPiece[], pageW: number = A4_PRINTABLE.w, overlap = 1, minCols = 2): number {
  const widest = pieces.reduce((m, p) => Math.max(m, p.w), 0);
  const step = pageW - overlap;
  const cols = Math.max(minCols, Math.ceil((widest + overlap) / step));
  return r1(cols * step + overlap);
}

// ── ไฟล์ส่งออก ──

/** ข้อความในไฟล์ DXF ใช้ตัวอักษรอังกฤษเท่านั้น (โปรแกรมเครื่องตัดหลายตัวอ่านภาษาไทยเพี้ยน) */
export const dxfLabel = (p: PatternPiece) => `${p.id} ${p.w}x${p.h}cm x${p.count}`;

/** DXF (R12) หน่วยมิลลิเมตร — เส้นตัดรอบชิ้น layer CUT · รูเจาะ/ช่องในชิ้น HOLE · เส้นเย็บ SEW · เส้นพับ FOLD · เส้นทางผ้า GRAIN · รอยบาก NOTCH · ป้าย LABEL · แกน Y กลับด้าน (DXF นับจากล่างขึ้นบน) */
/** โปรไฟล์ไฟล์ DXF (รอบ H): named = ชั้นตามชื่อ (CUT SEW …) · aama = ชั้นเลขแบบ AAMA/ASTM D6673 + 1 ชิ้น = 1 บล็อก (ยังไม่ได้ทดสอบกับโปรแกรมปลายทางจริง) */
export type DxfProfile = "named" | "aama";
export const DXF_PROFILES: { key: DxfProfile; th: string; en: string }[] = [
  { key: "named", th: "ทั่วไป (ชั้นตามชื่อ · เครื่องเลเซอร์)", en: "General (named layers · laser)" },
  { key: "aama", th: "AAMA / ASTM (ชั้นเลข · 1 ชิ้น = 1 บล็อก)", en: "AAMA / ASTM (numbered layers · 1 piece = 1 block)" },
];
/** ชั้น AAMA/ASTM: 1 เส้นตัด · 4 รอยบาก · 7 ทางผ้า · 8 เส้นใน · 11 รูเจาะ · 13 จุดเจาะ/อะไหล่ · 14 เส้นเย็บ · 15 ข้อความ */
const AAMA_LAYER: Record<string, string> = { CUT: "1", NOTCH: "4", GRAIN: "7", FOLD: "8", INNER: "8", STITCH: "8", GLUE: "8", SKIVE: "8", HOLE: "11", HW: "13", SEW: "14", DIM: "15", LABEL: "15" };
export function buildPatternDxf(layout: PatternLayout, opts: { profile?: DxfProfile; stamp?: string } = {}): string {
  const mm = (cm: number) => Math.round(cm * 100) / 10;   // ซม. → มม. (ทศนิยม 1)
  const H = mm(layout.height), aama = opts.profile === "aama";
  const lay = (l: string) => (aama ? AAMA_LAYER[l] ?? "8" : l);
  const head = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", "4", "0", "ENDSEC"];
  let out: string[] = [];
  const blocks: { name: string; ents: string[] }[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, layer = "CUT") =>
    out.push("0", "LINE", "8", lay(layer), "10", String(x1), "20", String(y1), "30", "0", "11", String(x2), "21", String(y2), "31", "0");
  const all: string[] = [];
  for (const p of layout.placed) {
    out = [];
    const x0 = mm(p.x), x1 = mm(p.x + p.w);
    const yTop = H - mm(p.y), yBot = H - mm(p.y + p.h);
    if (p.outline && p.outline.length >= 3) {   // รูปทรงจริง → เส้นตัดรอบรูป + รูเจาะ (CUT) · เส้นเย็บ (SEW)
      const ring = (Q: Pt[], layer: string) => {
        const P = Q.map(([x, y]) => [mm(p.x + x), H - mm(p.y + y)] as const);
        for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; line(a[0], a[1], b[0], b[1], layer); }
      };
      ring(p.outline, "CUT");
      for (const h of p.holes ?? []) ring(h, "HOLE");   // รูเจาะ/ช่องซิป/ช่องสอด แยกชั้น (2026-11-10) — เครื่องตัดตั้งให้ตัดชั้นนี้ก่อนเส้นรอบชิ้นได้
      if (p.sewOutline) ring(p.sewOutline, "SEW");
      const segs = (S: [Pt, Pt][] | null | undefined, layer: string) => { for (const [a, b] of S ?? []) line(mm(p.x + a[0]), H - mm(p.y + a[1]), mm(p.x + b[0]), H - mm(p.y + b[1]), layer); };
      segs(p.grainSegs, "GRAIN");
      segs(p.notchSegs, "NOTCH");
      for (const L of p.foldSegs ?? []) for (let i = 0; i + 1 < L.length; i++) line(mm(p.x + L[i][0]), H - mm(p.y + L[i][1]), mm(p.x + L[i + 1][0]), H - mm(p.y + L[i + 1][1]), "FOLD");
      for (const m of p.hwMarks ?? []) out.push("0", "CIRCLE", "8", lay("HW"), "10", String(mm(p.x + m.c[0])), "20", String(H - mm(p.y + m.c[1])), "30", "0", "40", String(mm(m.r)));   // อะไหล่ = วงกลมในชั้น HW (ตำแหน่งเจาะ/ติด)
      for (const L of p.stitchSegs ?? []) for (let i = 0; i + 1 < L.length; i++) line(mm(p.x + L[i][0]), H - mm(p.y + L[i][1]), mm(p.x + L[i + 1][0]), H - mm(p.y + L[i + 1][1]), "STITCH");
      for (const bd of p.bands ?? []) for (let i = 0; i + 1 < bd.pts.length; i++) line(mm(p.x + bd.pts[i][0]), H - mm(p.y + bd.pts[i][1]), mm(p.x + bd.pts[i + 1][0]), H - mm(p.y + bd.pts[i + 1][1]), bd.kind === "glue" ? "GLUE" : "SKIVE");
      for (const dm of p.dims ?? []) {   // เส้นวัด: เส้น + ตัวเลข ชั้น DIM (เครื่องตัดไม่ตัดชั้นนี้)
        line(mm(p.x + dm.a[0]), H - mm(p.y + dm.a[1]), mm(p.x + dm.b[0]), H - mm(p.y + dm.b[1]), "DIM");
        out.push("0", "TEXT", "8", lay("DIM"), "10", String(mm(p.x + (dm.a[0] + dm.b[0]) / 2)), "20", String(H - mm(p.y + (dm.a[1] + dm.b[1]) / 2) + 2), "30", "0", "40", "3", "1", dm.label);
      }
      for (const L of p.innerSegs ?? []) for (let i = 0; i + 1 < L.length; i++) line(mm(p.x + L[i][0]), H - mm(p.y + L[i][1]), mm(p.x + L[i + 1][0]), H - mm(p.y + L[i + 1][1]), "INNER");   // เส้นในชิ้น: วาดตำแหน่ง ไม่ใช่เส้นตัด
    } else { line(x0, yBot, x1, yBot); line(x1, yBot, x1, yTop); line(x1, yTop, x0, yTop); line(x0, yTop, x0, yBot); }
    const textH = Math.max(3, Math.min(8, mm(Math.min(p.w, p.h)) / 8));
    const txt = (s: string, k: number) => out.push("0", "TEXT", "8", lay("LABEL"), "10", String(Math.round((x0 + 2) * 10) / 10), "20", String(Math.round((yTop - textH * (k + 1) - 2 * (k + 1)) * 10) / 10), "30", "0", "40", String(Math.round(textH * (k ? 0.7 : 1) * 10) / 10), "1", s);
    txt(dxfLabel(p), 0);
    if (aama) { txt(`Piece Name: ${dxfAscii(p.id)}`, 1); txt(`Quantity: ${p.count}`, 2); if (opts.stamp) txt(dxfAscii(opts.stamp), 3); }   // ข้อความประจำชิ้นแบบ AAMA (อักษรอังกฤษ)
    else if (opts.stamp) txt(dxfAscii(opts.stamp), 1);
    if (aama) blocks.push({ name: `P_${dxfAscii(p.id).replace(/[^A-Za-z0-9_-]/g, "_")}_${blocks.length + 1}`, ents: out }); else all.push(...out);
  }
  if (!aama) return [...head, "0", "SECTION", "2", "ENTITIES", ...all, "0", "ENDSEC", "0", "EOF"].join("\n") + "\n";
  const bl: string[] = ["0", "SECTION", "2", "BLOCKS"];
  for (const b of blocks) bl.push("0", "BLOCK", "8", "0", "2", b.name, "70", "0", "10", "0", "20", "0", "30", "0", "3", b.name, ...b.ents, "0", "ENDBLK", "8", "0");
  bl.push("0", "ENDSEC");
  const ins: string[] = ["0", "SECTION", "2", "ENTITIES"];
  for (const b of blocks) ins.push("0", "INSERT", "8", "1", "2", b.name, "10", "0", "20", "0", "30", "0");
  ins.push("0", "ENDSEC", "0", "EOF");
  return [...head, ...bl, ...ins].join("\n") + "\n";
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c] as string));

/** SVG ขนาดจริง (หน่วยซม.) — เส้นตัด + ป้ายชื่อภาษาไทย · เปิดใน Illustrator / พิมพ์ / ส่งเครื่องตัดได้ */
export function buildPatternSvg(layout: PatternLayout): string {
  const W = Math.max(1, layout.width), H = Math.max(1, layout.height);
  const body = layout.placed.map((p) => {
    const fs = Math.max(0.8, Math.min(2.4, Math.min(p.w, p.h) / 6));
    const outlineSvg = p.d ? `<path transform="translate(${p.x} ${p.y})" d="${p.d}" fill="none" stroke="#000" stroke-width="0.05"/>` + (p.sewD ? `<path transform="translate(${p.x} ${p.y})" d="${p.sewD}" fill="none" stroke="#000" stroke-width="0.03" stroke-dasharray="0.3 0.2"/>` : "") + (p.marksD ? `<path transform="translate(${p.x} ${p.y})" d="${p.marksD}" fill="none" stroke="#000" stroke-width="0.04"/>` : "") + (p.foldD ? `<path transform="translate(${p.x} ${p.y})" d="${p.foldD}" fill="none" stroke="#000" stroke-width="0.04" stroke-dasharray="1 0.3 0.2 0.3"/>` : "") + (p.innerD ? `<path transform="translate(${p.x} ${p.y})" d="${p.innerD}" fill="none" stroke="#000" stroke-width="0.04" stroke-dasharray="0.5 0.3"/>` : "") : `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="none" stroke="#000" stroke-width="0.05"/>`;
    return `<g>${outlineSvg}`
      + `<text x="${r1(p.x + p.w / 2)}" y="${r1(p.y + p.h / 2)}" font-size="${r1(fs)}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${esc(`${p.id} ${p.name}`)}</text>`
      + `<text x="${r1(p.x + p.w / 2)}" y="${r1(p.y + p.h / 2 + fs * 1.3)}" font-size="${r1(fs * 0.8)}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${esc(`${p.w}×${p.h} ซม. · ตัด ×${p.count}`)}</text></g>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}cm" height="${H}cm" viewBox="0 0 ${W} ${H}">${body}</svg>\n`;
}

/** ข้อความสำหรับ DXF R12: เหลือเฉพาะอักษรอังกฤษ/ตัวเลข/เครื่องหมายพื้นฐาน (ภาษาไทยในไฟล์ R12 มักเพี้ยนในเครื่องตัด) */
export function dxfAscii(s: string): string { return s.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "-"; }
