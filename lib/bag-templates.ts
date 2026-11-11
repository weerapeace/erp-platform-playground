/**
 * 👜 แม่แบบทรงกระเป๋า — สูตรบริสุทธิ์ ไม่มีหน้าจอ · เจ้าของขอ 2026-11-10 ("โปรแกรมทำแพทเทิร์นกระเป๋า เห็นโมเดล 3D ตอนเย็บแล้ว")
 *   รอบ 1 ของสตูดิโอแพทเทิร์น: ใส่ขนาดกระเป๋าตอนเสร็จ (กว้าง สูง หนา …) → ได้
 *     1) bagGeometry  = เรขาคณิตของกระเป๋าที่เย็บแล้ว (ใช้วาดโมเดล 3D + อธิบายตะเข็บ)
 *     2) bagPieces    = ชิ้นแพทเทิร์นแบบเดียวกับที่ตัววาดชิ้นวัสดุ (ShapeEditor) ใช้ → วางลงกระดานแล้วแก้ต่อได้
 *
 *   ทรงที่มีตอนนี้: Tote อยู่ทรง = ตัวหน้า + ตัวหลัง + (ข้าง+ก้นชิ้นเดียว หรือ ข้าง 2 + ก้น 1) + หูหิ้ว 2 · ช่องโชว์ PVC (เหลี่ยมมน / หัวใจ / วงกลม)
 *   หน่วย = ซม. · bagGeometry ใช้แกน y ชี้ขึ้น (ก้นกระเป๋า y = 0) · bagPieces ใช้แกน y ชี้ลงแบบ lib/pattern-shape
 *
 *   รูปชิ้น = ขนาดสำเร็จ (เส้นเย็บ) พอดี · พับปาก = เผื่อเย็บของ "ขอบปาก" (เผื่อรายขอบ allowEdges — 2026-11-10 แทนวิธีเดิมที่ต่อรูปชิ้นขึ้นไป)
 *     • หูหิ้ว = แถบกว้าง 2 เท่าของหู (พับครึ่ง) เผื่อเย็บรอบชิ้น · รอยบากบอกจุดที่หูโผล่พ้นปากกระเป๋า
 *   ค่าที่สมมติ (ต้องให้ช่างยืนยัน): ระยะเย็บโคนหู 4 ซม. · แผ่น PVC ใหญ่กว่ารูรอบละ 1.5 ซม.
 *   ชนิดช่อง (รอบ 4 · 2026-11-10): หน้าต่างโชว์ (รู + แผ่นใส) · ช่องซิป (ช่องกว้าง 1.2 ซม. + ถุงซับใน) · ช่องสอด (รอยกรีด 0.4 ซม. + ถุงซับใน)
 *     ถุงซับใน = กว้างกว่าช่องข้างละ 2 ซม. · สูง = 2 × ความลึกถุง + 3 ซม. (พับครึ่งเป็นถุง) — ค่าสมมติ ให้ช่างยืนยัน
 *   ขอบที่พับเข้าใน (ปาก) ติดธง foldEdges → เส้นพับบนกระดาน / หน้าพิมพ์ / ชั้น FOLD ของไฟล์ตัด
 *
 * ใช้ที่: components/pattern-studio (ตัวสร้างจากแม่แบบ) · components/pattern-3d (โมเดลกระเป๋า) · เทสต์ lib/__tests__/bag-templates.test.ts
 * คู่มือ: docs/pattern-studio.md
 */
import { fitShape, pieceGeometry, roundCorners, type PNode, type Pt, type Shape } from "@/lib/pattern-shape";

export type BagWindow = "none" | "rect" | "heart" | "circle";
/** ชนิดช่องบนตัวหน้า: หน้าต่างโชว์ (แผ่นใสปิดหลัง) · ช่องซิป · ช่องสอด (สองอย่างหลังมีถุงซับในอยู่หลังช่อง) */
export type BagWinType = "window" | "zip" | "slot";
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
  win: BagWindow;   // ช่องโชว์ (รูปช่อง — ใช้กับชนิดหน้าต่างโชว์)
  winType: BagWinType;   // ชนิดช่อง
  ws: number;       // กว้างช่อง
  wy: number;       // กลางช่องสูงจากก้น
};
export type BagNumKey = Exclude<keyof BagParams, "strip" | "win" | "winType">;

export const BAG_HANDLE_ATTACH = 4;   // ระยะเย็บโคนหูทับตัวกระเป๋า (ซม.)
export const BAG_PVC_MARGIN = 1.5;    // แผ่น PVC ใหญ่กว่ารูรอบละ (ซม.)
export const BAG_ZIP_OPEN = 1.2;      // ช่องซิป: ความกว้างของช่องที่เจาะ (ซม.) — ฟันซิปโผล่ตรงนี้
export const BAG_SLOT_OPEN = 0.4;     // ช่องสอด: ความกว้างของรอยกรีด (ซม.)
export const BAG_POCKET_MARGIN = 2;   // ถุงซับในกว้างกว่าช่องข้างละ (ซม.)
export const BAG_POCKET_TOP = 3;      // ส่วนของถุงเหนือช่อง ไว้เย็บติดตัวหน้า (ซม.)
const WIN_RATIO: Record<Exclude<BagWindow, "none">, number> = { rect: 0.8, heart: 0.9, circle: 1 };

export const BAG_DEFAULT: BagParams = { W: 32, flare: 3, H: 28, D: 12, r: 4, strip: true, Lh: 45, wh: 2.5, g: 14, sa: 1, hem: 3, win: "none", winType: "window", ws: 12, wy: 12 };
export const BAG_LIMITS: Record<BagNumKey, { min: number; max: number; step: number }> = {
  W: { min: 18, max: 55, step: 0.5 }, flare: { min: 0, max: 8, step: 0.5 }, H: { min: 14, max: 45, step: 0.5 }, D: { min: 4, max: 22, step: 0.5 }, r: { min: 0, max: 10, step: 0.5 },
  Lh: { min: 20, max: 75, step: 1 }, wh: { min: 1.5, max: 5, step: 0.5 }, g: { min: 8, max: 30, step: 0.5 },
  sa: { min: 0.3, max: 2, step: 0.1 }, hem: { min: 0, max: 5, step: 0.5 }, ws: { min: 6, max: 24, step: 0.5 }, wy: { min: 4, max: 40, step: 0.5 },
};
export const BAG_PRESETS: { key: string; th: string; en: string; params: Partial<BagParams> }[] = [
  { key: "tote", th: "Tote ใบกลาง", en: "Medium tote", params: {} },
  { key: "display", th: "กระเป๋าโชว์ ช่องหัวใจ", en: "Display bag, heart window", params: { W: 26, flare: 1, H: 24, D: 8, r: 5, Lh: 34, wh: 2, g: 12, win: "heart", ws: 13, wy: 11 } },
  { key: "shopper", th: "ช้อปปิ้งใบใหญ่ ก้นเหลี่ยม", en: "Large shopper, square base", params: { W: 40, flare: 4, H: 34, D: 15, r: 0, strip: false, Lh: 60, wh: 3, g: 18 } },
  { key: "zip", th: "Tote มีช่องซิปด้านหน้า", en: "Tote with a front zip pocket", params: { win: "rect", winType: "zip", ws: 18, wy: 17 } },
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
  win: null | { kind: Exclude<BagWindow, "none">; type: BagWinType; w: number; h: number; cy: number; wsMax: number; yMin: number; yMax: number;
    /** ถุงซับในหลังช่อง (ช่องซิป / ช่องสอด) — กว้าง × ลึก (ชิ้นที่ตัด = กว้าง × (2 × ลึก + ส่วนบน)) */
    pocket: null | { w: number; depth: number } };
  arch: { a: number; v: number; eb: number; h: number };   // หู: ครึ่งระยะโคน · ช่วงตั้งตรง · โค้งแบน (ถ้าหูสั้น) · สูงพ้นปาก
  seams: BagSeam[];
  hemLen: number;             // รอบปาก
};

/** ปรับค่าให้อยู่ในขอบเขต + คิดเรขาคณิตของกระเป๋าที่เย็บแล้ว */
export function bagGeometry(raw: Partial<BagParams>): BagGeometry {
  const p: BagParams = { ...BAG_DEFAULT, ...raw };
  (Object.keys(BAG_LIMITS) as BagNumKey[]).forEach((k) => { const L = BAG_LIMITS[k], v = Number(p[k]); p[k] = clamp(Number.isFinite(v) ? v : BAG_DEFAULT[k], L.min, L.max); });
  if (!["none", "rect", "heart", "circle"].includes(p.win)) p.win = "none";
  if (!["window", "zip", "slot"].includes(p.winType)) p.winType = "window";
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
    // ช่องซิป/ช่องสอด = ช่องแคบความสูงตายตัว (รูปเหลี่ยมมนเสมอ) · หน้าต่างโชว์ = สูงตามสัดส่วนของรูป
    const fixedH = p.winType === "zip" ? BAG_ZIP_OPEN : p.winType === "slot" ? BAG_SLOT_OPEN : null;
    if (fixedH) p.win = "rect";
    const ratio = WIN_RATIO[p.win];
    const wsMax = Math.max(BAG_LIMITS.ws.min, Math.floor(Math.min(BAG_LIMITS.ws.max, W - 8, fixedH ? Infinity : (H - 11) / ratio) * 2) / 2);
    p.ws = clamp(p.ws, BAG_LIMITS.ws.min, wsMax);
    const hh = (fixedH ?? p.ws * ratio) / 2, yMin = Math.ceil((hh + (fixedH ? 8 : 4)) * 2) / 2;   // ช่องซิป/สอด: เหลือที่ให้ถุงลึกอย่างน้อย ~6 ซม.
    const yMax = Math.max(yMin, Math.floor((H - BAG_HANDLE_ATTACH - 2 - hh) * 2) / 2);
    p.wy = clamp(half(p.wy), yMin, yMax);
    win = { kind: p.win, type: p.winType, w: p.ws, h: fixedH ?? p.ws * ratio, cy: p.wy, wsMax, yMin, yMax,
      pocket: fixedH ? { w: p.ws + 2 * BAG_POCKET_MARGIN, depth: clamp(Math.floor((p.wy - hh - 2) * 2) / 2, 4, 16) } : null };   // ก้นถุงอยู่เหนือตะเข็บก้น ~2 ซม.
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
    arch: { a, v, eb, h: eb ? eb : v + a }, seams, hemLen: p.hem > 0 ? 2 * Wt + 2 * D : 0,
  };
}

export type BagPieceKey = "front" | "back" | "pvc" | "pocket" | "strip" | "side" | "bottom" | "handle";
/** ชิ้นแพทเทิร์น 1 แบบ — รูปทรง/รู/รอยบาก/เส้นทางผ้า อยู่ในพิกัดของชิ้นเอง (กรอบเส้นเย็บเริ่มที่ 0,0 · y ลง) · at = ตำแหน่งวางบนกระดาน */
export type BagPiece = {
  key: BagPieceKey; name: string; nameEn: string; count: number;
  shape: Shape; holes: Shape[]; allow: number; allowEdges: number[] | null; foldEdges: number[] | null; grain: [Pt, Pt] | null; notches: Pt[];
  finished: { w: number; h: number }; cut: { w: number; h: number }; at: [number, number];
};

/** มุมโค้งที่จุด v (ระหว่างเพื่อนบ้าน a → v → b) รัศมี r → จุดเริ่มโค้ง + จุดจบโค้ง พร้อมหูจับ (สูตรเดียวกับ roundCorners) */
export function filletNodes(a: Pt, v: Pt, b: Pt, r: number): PNode[] {
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

/**
 * ชิ้นแพทเทิร์นทั้งหมดของกระเป๋า (พร้อมตำแหน่งวางเรียงเป็นแถว กว้างไม่เกิน ~110 ซม.)
 *   รูปชิ้น = ขนาดสำเร็จพอดี (เส้นเย็บ) · เผื่อเย็บรอบชิ้น = sa · ขอบปาก (ขอบที่พับเข้าใน) เผื่อ = พับปาก → ใช้เผื่อรายขอบ (allowEdges)
 */
export function bagPieces(G: BagGeometry): BagPiece[] {
  const { p, Wt } = G, { W, H, D, sa, hem } = p;
  const X = (x: number) => r3(x + Wt / 2), Y = (y: number) => r3(H - y);   // y ขึ้น (ก้น = 0) → พิกัดชิ้น (y ลง)
  const TL: Pt = [X(-Wt / 2), Y(H)], BL: Pt = [X(-W / 2), Y(0)], BR: Pt = [X(W / 2), Y(0)], TR: Pt = [X(Wt / 2), Y(H)];
  const panelShape: Shape = { k: "path", nodes: [{ x: TL[0], y: TL[1] }, ...filletNodes(TL, BL, BR, p.r), ...filletNodes(BL, BR, TR, p.r), { x: TR[0], y: TR[1] }] };
  const pn = p.r > 0 ? 6 : 4;                                                         // จำนวนขอบของตัวหน้า (ขอบสุดท้าย = ขอบปาก)
  /** เผื่อรายขอบ: ขอบในรายการ = พับปาก · ขอบอื่น = เผื่อเย็บ — ถ้าเท่ากันหมด = ไม่ต้องใช้รายขอบ */
  const edges = (n: number, hemEdges: number[]): number[] | null => (hemEdges.length && hem !== sa ? Array.from({ length: n }, (_, i) => (hemEdges.includes(i) ? hem : sa)) : null);
  /** ขอบพับ: ขอบในรายการ = พับเข้าใน (มีพับปาก > 0) */
  const folds = (n: number, hemEdges: number[]): number[] | null => (hemEdges.length && hem > 0 ? Array.from({ length: n }, (_, i) => (hemEdges.includes(i) ? 1 : 0)) : null);
  const sideAt = (s: number): Pt => { const t = s / G.Ls; return [-Wt / 2 + (Wt / 2 - W / 2) * t, H - H * t]; };   // จุดบนขอบข้างซ้าย ห่างจากปาก s
  const panelNotches: Pt[] = [[X(0), Y(0)]];                                          // กึ่งกลางก้น
  if (p.r > 0) {
    const l1 = sideAt(G.Ls - G.tan);                                                  // จุดเริ่มโค้ง (ขอบข้าง)
    panelNotches.push([X(l1[0]), Y(l1[1])], [X(-l1[0]), Y(l1[1])], [X(-W / 2 + G.tan), Y(0)], [X(W / 2 - G.tan), Y(0)]);
  }
  const grainX = X(-(W / 2 - 2.2));
  const panelGrain: [Pt, Pt] = [[grainX, Y(H * 0.8)], [grainX, Y(H * 0.45)]];
  type Raw = Omit<BagPiece, "at" | "finished" | "cut"> & { off: [number, number] };
  type Sized = Omit<BagPiece, "at"> & { off: [number, number] };
  /** ขนาดสำเร็จ/ขนาดตัด คิดจากรูปจริง (ตัวคิดเดียวกับตัววาด) · off = ระยะจากมุมกรอบตัดถึงมุมกรอบเส้นเย็บ */
  const sized = (q: Omit<Raw, "off">): Sized => {
    const g = pieceGeometry({ shape: q.shape, holes: q.holes, allow: q.allow, allowEdges: q.allowEdges });
    return { ...q, finished: { w: g.finished.w, h: g.finished.h }, cut: { w: g.cutBox.w, h: g.cutBox.h }, off: [g.finished.x - g.cutBox.x, g.finished.y - g.cutBox.y] };
  };
  const panel = (key: "front" | "back", name: string, nameEn: string, count: number, holes: Shape[]) =>
    sized({ key, name, nameEn, count, shape: panelShape, holes, allow: sa, allowEdges: edges(pn, [pn - 1]), foldEdges: folds(pn, [pn - 1]), grain: panelGrain, notches: panelNotches });
  const rect = (key: BagPieceKey, name: string, nameEn: string, count: number, w: number, h: number, allow: number, hemEdges: number[] = [], notches: Pt[] = [], grain: [Pt, Pt] | null = null) =>
    sized({ key, name, nameEn, count, shape: { k: "rect", x: 0, y: 0, w: r3(w), h: r3(h) }, holes: [], allow, allowEdges: allow ? edges(4, hemEdges) : null, foldEdges: allow ? folds(4, hemEdges) : null, grain, notches: notches.map(([x, y]) => [r3(x), r3(y)] as Pt) });

  const list: Sized[] = [];
  if (G.win) {
    const w = G.win, hole = bagWindowShape(w.kind, X(-w.w / 2), Y(w.cy + w.h / 2), w.w, w.h);
    list.push(panel("front", "ตัวหน้า", "Front panel", 1, [hole]), panel("back", "ตัวหลัง", "Back panel", 1, []));
    if (w.pocket) list.push(rect("pocket", w.type === "zip" ? "ถุงกระเป๋าซิป (ซับใน)" : "ถุงช่องสอด (ซับใน)", w.type === "zip" ? "Zip pocket bag (lining)" : "Slot pocket bag (lining)", 1, w.pocket.w, 2 * w.pocket.depth + BAG_POCKET_TOP, sa));
    else list.push(rect("pvc", "แผ่น PVC ใส", "Clear PVC window", 1, w.w + 2 * BAG_PVC_MARGIN, w.h + 2 * BAG_PVC_MARGIN, 0));
  } else list.push(panel("front", "ตัวหน้า / ตัวหลัง", "Front / back panel", 2, []));

  const hl = p.Lh + 2 * BAG_HANDLE_ATTACH, hw = 2 * p.wh;
  const handle = rect("handle", "หูหิ้ว (พับครึ่ง)", "Handle (folded in half)", 2, hl, hw, sa, [],
    [[BAG_HANDLE_ATTACH, 0], [BAG_HANDLE_ATTACH, hw], [hl - BAG_HANDLE_ATTACH, 0], [hl - BAG_HANDLE_ATTACH, hw]]);
  if (G.strip) {
    // ชิ้นข้าง+ก้น: ยาว = ขอบ U ของตัวหน้าพอดี · ปลาย 2 ข้าง (ขอบขวา/ซ้าย) อยู่ที่ปากกระเป๋า → เผื่อ = พับปาก
    list.push(handle, rect("strip", "ข้าง + ก้น ชิ้นเดียว", "Gusset strip (sides + bottom)", 1, G.Lg, D, sa, [1, 3], G.marks.flatMap((x) => [[x, 0], [x, D]] as Pt[]), [[G.Lg * 0.06, D / 2], [G.Lg * 0.2, D / 2]]));
  } else {
    list.push(
      rect("side", "ข้าง", "Side piece", 2, D, G.Ls, sa, [0], [], [[D / 2, G.Ls * 0.25], [D / 2, G.Ls * 0.75]]),   // ขอบบน = ปาก
      rect("bottom", "ก้น", "Bottom piece", 1, W, D, sa, [], [[W / 2, 0], [W / 2, D]], [[W * 0.1, D / 2], [W * 0.3, D / 2]]),
      handle,
    );
  }
  // วางเรียงเป็นแถว (ตำแหน่ง = มุมซ้ายบนของเส้นเย็บ)
  const gap = 3, rowMax = Math.max(110, ...list.map((q) => q.cut.w));
  let x = 0, y = 0, rowH = 0;
  return list.map(({ off, ...q }) => {
    if (x > 0 && x + q.cut.w > rowMax + 0.01) { x = 0; y += rowH + gap; rowH = 0; }
    const at: [number, number] = [r3(x + off[0]), r3(y + off[1])];
    x += q.cut.w + gap; rowH = Math.max(rowH, q.cut.h);
    return { ...q, at };
  });
}

/** ขอบของชิ้นจากแม่แบบ: ชิ้นไหน · เริ่มที่ขอบลำดับไหน · กี่ขอบติดกัน · ชิ้นนั้นมีกี่ขอบ (ลำดับขอบ = ลำดับจุดของรูป — ดู lib/pattern-seams) */
export type BagEdgeRef = { piece: BagPieceKey; from: number; count: number; n: number };
export type BagSeamRef = { key: "A" | "B" | "C"; a: BagEdgeRef; b: BagEdgeRef };
/**
 * ตะเข็บของกระเป๋าจากแม่แบบ — คู่ขอบที่ต้องเย็บติดกัน (ใช้ตั้งต้นให้เครื่องมือเย็บ ไม่ต้องจับคู่เอง)
 *   ตัวหน้า/หลัง: จุดเรียง ปากซ้าย → (มุมก้นซ้าย) → (มุมก้นขวา) → ปากขวา · ขอบสุดท้าย = ขอบปาก
 *   สี่เหลี่ยม: ขอบ 0 บน · 1 ขวา · 2 ล่าง · 3 ซ้าย
 */
export function bagSeamRefs(G: BagGeometry): BagSeamRef[] {
  const pn = G.p.r > 0 ? 6 : 4, back: BagPieceKey = G.win ? "back" : "front";
  const R = (piece: BagPieceKey, from: number, count = 1, n = 4): BagEdgeRef => ({ piece, from, count, n });
  if (G.strip) return [
    { key: "A", a: R("front", 0, pn - 1, pn), b: R("strip", 2) },
    { key: "A", a: R(back, 0, pn - 1, pn), b: R("strip", 0) },
  ];
  const sides = (panel: BagPieceKey): BagSeamRef[] => [
    { key: "A", a: R(panel, 0), b: R("side", 3) },
    { key: "A", a: R(panel, 2), b: R("side", 1) },
  ];
  return [
    ...sides("front"), ...(G.win ? sides("back") : []),
    { key: "B", a: R("front", 1), b: R("bottom", 0) },
    { key: "B", a: R(back, 1), b: R("bottom", 2) },
    { key: "C", a: R("side", 2), b: R("bottom", 1) },
    { key: "C", a: R("side", 2), b: R("bottom", 3) },
  ];
}

/** จุดติดของชิ้นที่ไม่ได้เย็บขอบชนขอบ (หู · แผ่น PVC หลังช่องโชว์) — พิกัดเทียบมุมซ้ายบนของกรอบเส้นเย็บของแผ่นที่ติด (y ลง) · ใช้ตอนประกอบ 3D (lib/pattern-assembly) */
export type BagAttachRef = { kind: "handle" | "behind"; piece: BagPieceKey; on: BagPieceKey; a?: Pt; b?: Pt; len?: number; w?: number; tail?: number };
export function bagAttachRefs(G: BagGeometry): BagAttachRef[] {
  const { p, Wt } = G;   // ขอบบนของแผ่น = ปากกระเป๋า → โคนหูอยู่ที่ y = 0
  const handle = (on: BagPieceKey): BagAttachRef => ({ kind: "handle", piece: "handle", on, a: [r3(Wt / 2 - p.g / 2), 0], b: [r3(Wt / 2 + p.g / 2), 0], len: p.Lh, w: p.wh, tail: BAG_HANDLE_ATTACH });
  return G.win ? [handle("front"), handle("back"), { kind: "behind", piece: G.win.pocket ? "pocket" : "pvc", on: "front" }] : [handle("front")];
}
