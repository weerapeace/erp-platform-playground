/**
 * 👜 แม่แบบทรงกระเป๋า — สูตรบริสุทธิ์ ไม่มีหน้าจอ · เจ้าของขอ 2026-11-10 ("โปรแกรมทำแพทเทิร์นกระเป๋า เห็นโมเดล 3D ตอนเย็บแล้ว")
 *   รอบ 1 ของสตูดิโอแพทเทิร์น: ใส่ขนาดกระเป๋าตอนเสร็จ (กว้าง สูง หนา …) → ได้
 *     1) bagGeometry  = เรขาคณิตของกระเป๋าที่เย็บแล้ว (ใช้วาดโมเดล 3D + อธิบายตะเข็บ)
 *     2) bagPieces    = ชิ้นแพทเทิร์นแบบเดียวกับที่ตัววาดชิ้นวัสดุ (ShapeEditor) ใช้ → วางลงกระดานแล้วแก้ต่อได้
 *
 *   ทรงที่มีตอนนี้: Tote อยู่ทรง = ตัวหน้า + ตัวหลัง + (ข้าง+ก้นชิ้นเดียว หรือ ข้าง 2 + ก้น 1) + หูหิ้ว 2 · ช่องโชว์ PVC (เหลี่ยมมน / หัวใจ / วงกลม)
 *   หน่วย = ซม. · bagGeometry ใช้แกน y ชี้ขึ้น (ก้นกระเป๋า y = 0) · bagPieces ใช้แกน y ชี้ลงแบบ lib/pattern-shape
 *
 *   ข้อจำกัดรอบ 1 (ตัววาดยังเผื่อเย็บได้ค่าเดียวทั้งชิ้น):
 *     • พับปาก = ต่อรูปชิ้นขึ้นไปด้านบน (พับปาก − เผื่อเย็บ) แล้วใส่รอยบาก 2 ข้างบอกแนวพับ → เส้นตัดด้านบน = สูง + พับปาก พอดี
 *     • หูหิ้ว = แถบกว้าง 2 เท่าของหู (พับครึ่ง) เผื่อเย็บรอบชิ้น · รอยบากบอกจุดที่หูโผล่พ้นปากกระเป๋า
 *   ค่าที่สมมติ (ต้องให้ช่างยืนยัน): ระยะเย็บโคนหู 4 ซม. · แผ่น PVC ใหญ่กว่ารูรอบละ 1.5 ซม.
 *
 * ใช้ที่: components/pattern-studio (ตัวสร้างจากแม่แบบ) · components/pattern-3d (โมเดลกระเป๋า) · เทสต์ lib/__tests__/bag-templates.test.ts
 * คู่มือ: docs/pattern-studio.md
 */
import { fitShape, roundCorners, type PNode, type Pt, type Shape } from "@/lib/pattern-shape";

export type BagWindow = "none" | "rect" | "heart" | "circle";
export type BagParams = {
  W: number;        // กว้างก้น
  flare: number;    // ปากบานออก ข้างละ
  H: number;        // สูง
  D: number;        // หนา (ก้นลึก)
  r: number;        // มุมก้นโค้ง (รัศมี)
  strip: boolean;   // ข้าง+ก้น ชิ้นเดียว (มุมโค้ง > 0 = บังคับชิ้นเดียว)
  Lh: number;       // ยาวหู ส่วนที่โผล่
  wh: number;       // กว้างหู
  g: number;        // ระยะห่างโคนหู
  sa: number;       // เผื่อเย็บรอบชิ้น
  hem: number;      // พับปาก
  win: BagWindow;   // ช่องโชว์
  ws: number;       // กว้างช่อง
  wy: number;       // กลางช่องสูงจากก้น
};
export type BagNumKey = Exclude<keyof BagParams, "strip" | "win">;

export const BAG_HANDLE_ATTACH = 4;   // ระยะเย็บโคนหูทับตัวกระเป๋า (ซม.)
export const BAG_PVC_MARGIN = 1.5;    // แผ่น PVC ใหญ่กว่ารูรอบละ (ซม.)
const WIN_RATIO: Record<Exclude<BagWindow, "none">, number> = { rect: 0.8, heart: 0.9, circle: 1 };

export const BAG_DEFAULT: BagParams = { W: 32, flare: 3, H: 28, D: 12, r: 4, strip: true, Lh: 45, wh: 2.5, g: 14, sa: 1, hem: 3, win: "none", ws: 12, wy: 12 };
export const BAG_LIMITS: Record<BagNumKey, { min: number; max: number; step: number }> = {
  W: { min: 18, max: 55, step: 0.5 }, flare: { min: 0, max: 8, step: 0.5 }, H: { min: 14, max: 45, step: 0.5 }, D: { min: 4, max: 22, step: 0.5 }, r: { min: 0, max: 10, step: 0.5 },
  Lh: { min: 20, max: 75, step: 1 }, wh: { min: 1.5, max: 5, step: 0.5 }, g: { min: 8, max: 30, step: 0.5 },
  sa: { min: 0.3, max: 2, step: 0.1 }, hem: { min: 0, max: 5, step: 0.5 }, ws: { min: 6, max: 24, step: 0.5 }, wy: { min: 4, max: 40, step: 0.5 },
};
export const BAG_PRESETS: { key: string; th: string; en: string; params: Partial<BagParams> }[] = [
  { key: "tote", th: "Tote ใบกลาง", en: "Medium tote", params: {} },
  { key: "display", th: "กระเป๋าโชว์ ช่องหัวใจ", en: "Display bag, heart window", params: { W: 26, flare: 1, H: 24, D: 8, r: 5, Lh: 34, wh: 2, g: 12, win: "heart", ws: 13, wy: 11 } },
  { key: "shopper", th: "ช้อปปิ้งใบใหญ่ ก้นเหลี่ยม", en: "Large shopper, square base", params: { W: 40, flare: 4, H: 34, D: 15, r: 0, strip: false, Lh: 60, wh: 3, g: 18 } },
];

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const unit = (x: number, y: number): Pt => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const half = (x: number) => Math.round(x * 2) / 2;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export type BagSeam = { key: "A" | "B" | "C"; th: string; en: string; withTh: string; withEn: string; len: number; lines: number };
export type BagEdgePart = { kind: "side" | "corner" | "bottom"; len: number };
export type BagGeometry = {
  p: BagParams;               // ค่าที่ปรับเข้าขอบเขตแล้ว
  Wt: number;                 // กว้างปาก
  Ls: number;                 // ความยาวขอบข้างของตัวหน้า (ไม่หักมุมโค้ง)
  tan: number;                // ระยะจากมุมก้นถึงจุดเริ่มโค้ง (0 = มุมเหลี่ยม)
  arc: number;                // ความยาวโค้งมุมก้น 1 มุม
  U: Pt[];                    // ขอบ ข้าง–ก้น–ข้าง ของตัวหน้า (ขนาดสำเร็จ · y ขึ้น · จากปากซ้ายไปปากขวา)
  Lg: number;                 // ความยาวขอบ U = ความยาวชิ้นข้าง+ก้น
  parts: BagEdgePart[];       // U แยกเป็นช่วง (ไว้อธิบายว่าชิ้นข้างยาวเท่าไหร่)
  marks: number[];            // ตำแหน่งรอยบากตามขอบ U (ระยะจากปากซ้าย)
  strip: boolean;
  rMax: number; gMin: number; gMax: number;
  win: null | { kind: Exclude<BagWindow, "none">; w: number; h: number; cy: number; wsMax: number; yMin: number; yMax: number };
  arch: { a: number; v: number; eb: number; h: number };   // หู: ครึ่งระยะโคน · ช่วงตั้งตรง · โค้งแบน (ถ้าหูสั้น) · สูงพ้นปาก
  seams: BagSeam[];
  hemLen: number;             // รอบปาก
  ext: number;                // ส่วนต่อด้านบนของชิ้น (พับปาก − เผื่อเย็บ)
};

/** ปรับค่าให้อยู่ในขอบเขต + คิดเรขาคณิตของกระเป๋าที่เย็บแล้ว */
export function bagGeometry(raw: Partial<BagParams>): BagGeometry {
  const p: BagParams = { ...BAG_DEFAULT, ...raw };
  (Object.keys(BAG_LIMITS) as BagNumKey[]).forEach((k) => { const L = BAG_LIMITS[k], v = Number(p[k]); p[k] = clamp(Number.isFinite(v) ? v : BAG_DEFAULT[k], L.min, L.max); });
  if (!["none", "rect", "heart", "circle"].includes(p.win)) p.win = "none";
  const { W, H, D } = p, fl = p.flare, Wt = W + 2 * fl;
  const Ls = Math.hypot(fl, H);
  const theta = Math.acos(-fl / Ls);                     // มุมภายในที่มุมก้น (≥ 90°)
  const tanH = Math.tan(theta / 2);
  const rMax = Math.max(0, Math.floor(Math.min(BAG_LIMITS.r.max, Math.min(W / 2 - 0.5, Ls - 1) * tanH) * 2) / 2);
  p.r = clamp(p.r, 0, rMax);
  const gMax = Math.max(BAG_LIMITS.g.min, Math.floor(Math.min(BAG_LIMITS.g.max, Wt - p.wh - 2, p.Lh - 4) * 2) / 2);
  const gMin = Math.min(gMax, Math.max(BAG_LIMITS.g.min, Math.ceil((2 * p.wh + 2) * 2) / 2));
  p.g = clamp(p.g, gMin, gMax);
  const strip = p.strip || p.r > 0;
  p.strip = strip;

  const tan = p.r > 0 ? p.r / tanH : 0;
  const arc = p.r > 0 ? p.r * (Math.PI - theta) : 0;
  const Lg = 2 * (Ls - tan) + (W - 2 * tan) + 2 * arc;
  // ขอบ U เป็นจุด (โค้งมุมก้น = 16 ช่วง)
  const TL: Pt = [-Wt / 2, H], BL: Pt = [-W / 2, 0], BR: Pt = [W / 2, 0], TR: Pt = [Wt / 2, H];
  const corner = (P: Pt, A: Pt, B: Pt): Pt[] => {
    if (!(p.r > 0)) return [P];
    const u = unit(A[0] - P[0], A[1] - P[1]), v = unit(B[0] - P[0], B[1] - P[1]), bis = unit(u[0] + v[0], u[1] + v[1]);
    const hgt = p.r / Math.sin(theta / 2), C: Pt = [P[0] + bis[0] * hgt, P[1] + bis[1] * hgt];
    const T1: Pt = [P[0] + u[0] * tan, P[1] + u[1] * tan], T2: Pt = [P[0] + v[0] * tan, P[1] + v[1] * tan];
    const a1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]);
    let d = Math.atan2(T2[1] - C[1], T2[0] - C[0]) - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Array.from({ length: 17 }, (_, i) => { const a = a1 + (d * i) / 16; return [C[0] + p.r * Math.cos(a), C[1] + p.r * Math.sin(a)] as Pt; });
  };
  const U: Pt[] = [TL, ...corner(BL, TL, BR), ...corner(BR, BL, TR), TR];
  const parts: BagEdgePart[] = p.r > 0
    ? [{ kind: "side", len: Ls - tan }, { kind: "corner", len: arc }, { kind: "bottom", len: W - 2 * tan }, { kind: "corner", len: arc }, { kind: "side", len: Ls - tan }]
    : [{ kind: "side", len: Ls }, { kind: "bottom", len: W }, { kind: "side", len: Ls }];
  const marks = p.r > 0 ? [Ls - tan, Ls - tan + arc, Lg / 2, Lg - (Ls - tan) - arc, Lg - (Ls - tan)] : [Ls, Lg / 2, Ls + W];

  let win: BagGeometry["win"] = null;
  if (p.win !== "none") {
    const ratio = WIN_RATIO[p.win];
    const wsMax = Math.max(BAG_LIMITS.ws.min, Math.floor(Math.min(BAG_LIMITS.ws.max, W - 8, (H - 11) / ratio) * 2) / 2);
    p.ws = clamp(p.ws, BAG_LIMITS.ws.min, wsMax);
    const hh = (p.ws * ratio) / 2, yMin = Math.ceil((hh + 4) * 2) / 2;
    const yMax = Math.max(yMin, Math.floor((H - BAG_HANDLE_ATTACH - 2 - hh) * 2) / 2);
    p.wy = clamp(half(p.wy), yMin, yMax);
    win = { kind: p.win, w: p.ws, h: p.ws * ratio, cy: p.wy, wsMax, yMin, yMax };
  }

  // หู: ตั้งตรงแล้วโค้งครึ่งวงกลม · ถ้าหูสั้นกว่านั้นใช้โค้งแบน (ครึ่งวงรี) ที่ยาวเท่าหู
  const a = p.g / 2;
  let v = (p.Lh - Math.PI * a) / 2, eb = 0;
  if (v < 0) {
    v = 0;
    let lo = 0.3, hi = a;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      let len = 0, px = -a, py = 0;
      for (let k = 1; k <= 48; k++) { const ph = Math.PI * (1 - k / 48), x = a * Math.cos(ph), y = mid * Math.sin(ph); len += Math.hypot(x - px, y - py); px = x; py = y; }
      if (len > p.Lh) hi = mid; else lo = mid;
    }
    eb = Math.max(lo, 0.8);
  }

  const seams: BagSeam[] = strip
    ? [{ key: "A", th: "ขอบข้าง–ก้น–ข้าง ของตัวหน้าและตัวหลัง", en: "Side–bottom–side edge of front and back", withTh: "ขอบยาวของชิ้นข้าง+ก้น", withEn: "Long edge of the gusset strip", len: Lg, lines: 2 }]
    : [
      { key: "A", th: "ขอบข้างของตัวหน้าและตัวหลัง", en: "Side edges of front and back", withTh: "ขอบยาวของชิ้นข้าง", withEn: "Long edge of the side piece", len: Ls, lines: 4 },
      { key: "B", th: "ขอบก้นของตัวหน้าและตัวหลัง", en: "Bottom edge of front and back", withTh: "ขอบยาวของชิ้นก้น", withEn: "Long edge of the bottom piece", len: W, lines: 2 },
      { key: "C", th: "ปลายล่างของชิ้นข้าง", en: "Lower end of the side piece", withTh: "ขอบสั้นของชิ้นก้น", withEn: "Short edge of the bottom piece", len: D, lines: 2 },
    ];
  return {
    p, Wt, Ls, tan, arc, U, Lg, parts, marks, strip, rMax, gMin, gMax, win,
    arch: { a, v, eb, h: eb ? eb : v + a }, seams, hemLen: p.hem > 0 ? 2 * Wt + 2 * D : 0, ext: Math.max(0, p.hem - p.sa),
  };
}

export type BagPieceKey = "front" | "back" | "pvc" | "strip" | "side" | "bottom" | "handle";
/** ชิ้นแพทเทิร์น 1 แบบ — รูปทรง/รู/รอยบาก/เส้นทางผ้า อยู่ในพิกัดของชิ้นเอง (กรอบเส้นเย็บเริ่มที่ 0,0 · y ลง) · at = ตำแหน่งวางบนกระดาน */
export type BagPiece = {
  key: BagPieceKey; name: string; nameEn: string; count: number;
  shape: Shape; holes: Shape[]; allow: number; grain: [Pt, Pt] | null; notches: Pt[];
  finished: { w: number; h: number }; cut: { w: number; h: number }; at: [number, number];
};

/** มุมโค้งที่จุด v (ระหว่างเพื่อนบ้าน a → v → b) รัศมี r → จุดเริ่มโค้ง + จุดจบโค้ง พร้อมหูจับ (สูตรเดียวกับ roundCorners) */
function filletNodes(a: Pt, v: Pt, b: Pt, r: number): PNode[] {
  if (!(r > 0)) return [{ x: v[0], y: v[1] }];
  const ua = unit(a[0] - v[0], a[1] - v[1]), ub = unit(b[0] - v[0], b[1] - v[1]);
  const th = Math.acos(clamp(ua[0] * ub[0] + ua[1] * ub[1], -1, 1));
  const d = r / Math.tan(th / 2), hl = (4 / 3) * Math.tan((Math.PI - th) / 4) * r;
  return [
    { x: r3(v[0] + ua[0] * d), y: r3(v[1] + ua[1] * d), ox: r3(-ua[0] * hl), oy: r3(-ua[1] * hl) },
    { x: r3(v[0] + ub[0] * d), y: r3(v[1] + ub[1] * d), ix: r3(-ub[0] * hl), iy: r3(-ub[1] * hl) },
  ];
}

/** หัวใจจากเส้นโค้ง 4 จุด (y ลง · กรอบประมาณ −1…1) */
const HEART: PNode[] = [
  { x: 0, y: -0.55, ix: -0.15, iy: -0.5, ox: 0.15, oy: -0.5 },
  { x: 1, y: -0.35, ix: 0, iy: -0.6, ox: 0, oy: 0.6 },
  { x: 0, y: 1, ix: 0.35, iy: -0.4, ox: -0.35, oy: -0.4 },
  { x: -1, y: -0.35, ix: 0, iy: 0.6, ox: 0, oy: -0.6 },
];
/** รูปช่องโชว์ในกรอบ x,y,w,h (y ลง) */
export function bagWindowShape(kind: Exclude<BagWindow, "none">, x: number, y: number, w: number, h: number): Shape {
  if (kind === "circle") return { k: "ellipse", x: r3(x), y: r3(y), w: r3(w), h: r3(h) };
  if (kind === "heart") return fitShape({ k: "path", nodes: HEART.map((n) => ({ ...n })) }, r3(x), r3(y), r3(w), r3(h));
  return roundCorners({ k: "rect", x: r3(x), y: r3(y), w: r3(w), h: r3(h) }, Math.min(w, h) * 0.2);
}

/** ชิ้นแพทเทิร์นทั้งหมดของกระเป๋า (พร้อมตำแหน่งวางเรียงเป็นแถว กว้างไม่เกิน ~110 ซม.) */
export function bagPieces(G: BagGeometry): BagPiece[] {
  const { p, Wt, ext } = G, { W, H, D, sa } = p, fl = p.flare;
  const Htop = H + ext, halfTop = W / 2 + (fl * Htop) / H;     // ต่อขอบข้างขึ้นไปตามแนวเอียงเดิม
  const X = (x: number) => r3(x + halfTop), Y = (y: number) => r3(Htop - y);   // y ขึ้น (ก้น = 0) → พิกัดชิ้น (y ลง)
  const TL: Pt = [X(-halfTop), Y(Htop)], BL: Pt = [X(-W / 2), Y(0)], BR: Pt = [X(W / 2), Y(0)], TR: Pt = [X(halfTop), Y(Htop)];
  const panelShape: Shape = { k: "path", nodes: [{ x: TL[0], y: TL[1] }, ...filletNodes(TL, BL, BR, p.r), ...filletNodes(BL, BR, TR, p.r), { x: TR[0], y: TR[1] }] };
  const sideAt = (s: number): Pt => { const t = s / G.Ls; return [-Wt / 2 + (Wt / 2 - W / 2) * t, H - H * t]; };   // จุดบนขอบข้างซ้าย ห่างจากปาก s
  const panelNotches: Pt[] = [[X(0), Y(0)]];                                          // กึ่งกลางก้น
  if (p.r > 0) {
    const l1 = sideAt(G.Ls - G.tan);                                                  // จุดเริ่มโค้ง (ขอบข้าง)
    panelNotches.push([X(l1[0]), Y(l1[1])], [X(-l1[0]), Y(l1[1])], [X(-W / 2 + G.tan), Y(0)], [X(W / 2 - G.tan), Y(0)]);
  }
  if (ext > 0.05) panelNotches.push([X(-Wt / 2), Y(H)], [X(Wt / 2), Y(H)]);           // แนวพับปาก
  const grainX = X(-(W / 2 - 2.2));
  const panelGrain: [Pt, Pt] = [[grainX, Y(H * 0.8)], [grainX, Y(H * 0.45)]];
  const panel = (key: "front" | "back", name: string, nameEn: string, count: number, holes: Shape[]): Omit<BagPiece, "at"> => ({
    key, name, nameEn, count, shape: panelShape, holes, allow: sa, grain: panelGrain, notches: panelNotches,
    finished: { w: 2 * halfTop, h: Htop }, cut: { w: 2 * halfTop + 2 * sa, h: Htop + 2 * sa },
  });
  const rect = (key: BagPieceKey, name: string, nameEn: string, count: number, w: number, h: number, allow: number, notches: Pt[] = [], grain: [Pt, Pt] | null = null): Omit<BagPiece, "at"> => ({
    key, name, nameEn, count, shape: { k: "rect", x: 0, y: 0, w: r3(w), h: r3(h) }, holes: [], allow, grain, notches: notches.map(([x, y]) => [r3(x), r3(y)] as Pt),
    finished: { w, h }, cut: { w: w + 2 * allow, h: h + 2 * allow },
  });

  const list: Omit<BagPiece, "at">[] = [];
  if (G.win) {
    const w = G.win, hole = bagWindowShape(w.kind, X(-w.w / 2), Y(w.cy + w.h / 2), w.w, w.h);
    list.push(panel("front", "ตัวหน้า", "Front panel", 1, [hole]), panel("back", "ตัวหลัง", "Back panel", 1, []));
    list.push(rect("pvc", "แผ่น PVC ใส", "Clear PVC window", 1, w.w + 2 * BAG_PVC_MARGIN, w.h + 2 * BAG_PVC_MARGIN, 0));
  } else list.push(panel("front", "ตัวหน้า / ตัวหลัง", "Front / back panel", 2, []));

  const hl = p.Lh + 2 * BAG_HANDLE_ATTACH, hw = 2 * p.wh;
  const handle = rect("handle", "หูหิ้ว (พับครึ่ง)", "Handle (folded in half)", 2, hl, hw, sa,
    [[BAG_HANDLE_ATTACH, 0], [BAG_HANDLE_ATTACH, hw], [hl - BAG_HANDLE_ATTACH, 0], [hl - BAG_HANDLE_ATTACH, hw]]);
  if (G.strip) {
    const len = G.Lg + 2 * ext;
    const xs = [...G.marks.map((s) => ext + s), ...(ext > 0.05 ? [ext, ext + G.Lg] : [])];
    list.push(handle, rect("strip", "ข้าง + ก้น ชิ้นเดียว", "Gusset strip (sides + bottom)", 1, len, D, sa, xs.flatMap((x) => [[x, 0], [x, D]] as Pt[]), [[len * 0.06, D / 2], [len * 0.2, D / 2]]));
  } else {
    const sideH = G.Ls + ext;
    list.push(
      rect("side", "ข้าง", "Side piece", 2, D, sideH, sa, ext > 0.05 ? [[0, ext], [D, ext]] : [], [[D / 2, sideH * 0.25], [D / 2, sideH * 0.75]]),
      rect("bottom", "ก้น", "Bottom piece", 1, W, D, sa, [[W / 2, 0], [W / 2, D]], [[W * 0.1, D / 2], [W * 0.3, D / 2]]),
      handle,
    );
  }
  // วางเรียงเป็นแถว (ตำแหน่ง = มุมซ้ายบนของเส้นเย็บ)
  const gap = 3, rowMax = Math.max(110, ...list.map((q) => q.cut.w));
  let x = 0, y = 0, rowH = 0;
  return list.map((q) => {
    if (x > 0 && x + q.cut.w > rowMax + 0.01) { x = 0; y += rowH + gap; rowH = 0; }
    const at: [number, number] = [r3(x + q.allow), r3(y + q.allow)];
    x += q.cut.w + gap; rowH = Math.max(rowH, q.cut.h);
    return { ...q, at };
  });
}
