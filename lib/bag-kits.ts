/**
 * 👜 ชุดแม่แบบทรงกระเป๋า 6 ทรง + ซับในทุกทรง — สูตรบริสุทธิ์ ไม่มีหน้าจอ
 *   เจ้าของสั่ง 2026-11-11 (ผ่าน session เอกสารเทียบ CLO · ดูภาพตัวอย่างแล้วตอบ "ทำตามแบบนี้"):
 *   "อยากเพิ่มแบบเริ่มต้นให้ครอบคลุมกระเป๋าหลายๆแบบ ต้องมีซับในทุกแบบนะ" → "เอา 6 ทรงนี้"
 *
 *   1) tote  Tote อยู่ทรง        = สูตรเดิม lib/bag-templates (หน้า/หลัง · ข้าง+ก้น · หูหิ้ว · ช่องโชว์/ช่องซิป) + ซับใน
 *   2) flat  ถุงผ้า / ช้อปปิ้งแบน = หน้า/หลัง ×2 (เย็บ ข้าง–ก้น–ข้าง กับตัวเอง) · หูหิ้ว ×2
 *   3) pouch ซองซิป / คลัทช์      = หน้า/หลัง ×2 มุมก้นมนได้ · ซิปปาก = ค่าของขอบ "ติดซิป" (อะไหล่ ไม่ใช่ชิ้นตัด)
 *   4) box   สะพายข้างทรงกล่อง    = หน้า · หลัง · ข้าง+ก้น · แถบซิปบน 2 ชิ้น · สายสะพาย
 *   5) flap  กระเป๋าฝาปิด          = หน้า · หลัง · ข้าง+ก้น · ฝาปิด (เย็บกับปากแผ่นหลัง) · สายสะพาย
 *   6) round ทรงกลม               = หน้า · หลัง (วงกลม 5 ขอบ) · ชิ้นข้างรอบ (3 ขอบล่าง) · แถบซิป 2 ชิ้น (2 ขอบบน)
 *
 *   ชุดสอง (2026-11-11 · เจ้าของเลือกทำต่อ):
 *   7) bucket     ทรงถัง          = ก้นวงกลม · ตัวถัง (สี่เหลี่ยมม้วนรอบก้น เย็บข้างกับตัวเอง) · สายสะพาย (ยังไม่มีจุดติดในภาพ)
 *   8) duffel     ดัฟเฟิล         = ปลายวงกลม 2 · ตัวกระเป๋าม้วนรอบ (ซิปที่ขอบที่มาชนกัน) · หูหิ้ว (พาดข้ามตัว)
 *   9) backpack   เป้             = หน้า · หลัง (มุมมนทั้ง 4) · ข้าง+ก้น · แถบซิปบน (ช่องเจาะซิป) · กระเป๋าหน้า · สายสะพายบ่า 2 · หูหิ้วบน
 *  10) cosmetic   เครื่องสำอางก้นกล่อง = หน้า/หลัง ×2 ตัดมุมก้น (เย็บข้าง ก้น แล้วเย็บมุมให้เป็นก้นกล่อง) · ซิปปาก — ภาพ 3 มิติยังเป็นซองแบน
 *  11) drawstring หูรูด           = หน้า/หลัง ×2 พับปากเป็นช่องร้อยเชือก (เชือกเป็นอะไหล่ ใส่ที่ปุ่ม ซิป / อะไหล่)
 *  12) wallet     กระเป๋าสตางค์    = ตัวนอก · แผ่นใน (เย็บ 3 ด้าน ด้านบนเป็นช่องธนบัตร) · ช่องใส่บัตรซ้าย/ขวา · แนวพับกลาง — แผ่นในทำหน้าที่ซับใน
 *
 *   ทุกทรงได้ "ชุด" เดียวกัน (BagKit): ชิ้น + ตะเข็บ (อ้างชิ้นด้วย key) + จุดติดหู/สาย → หน้าจอวางลงกระดานทีเดียว
 *   ซับใน (KitOpts.lining): คัดลอกชิ้นตัวกระเป๋า (หน้า หลัง ข้าง ก้น แถบซิป) เป็นชิ้นชั้นซับใน ขนาดเท่าตัวนอก + ตะเข็บชุดเดียวกัน
 *     ผูกรูปกับตัวนอก (linkTo) · ฝาปิดมีซับในประกบ (เย็บ 3 ขอบกับฝา) · หู/สาย ไม่มีซับใน · ไม่มีตะเข็บปากซับในกับปากตัวนอก (กติกาเดิมของ lib/pattern-lining)
 *   ช่องใส่ของในซับใน 1 ช่อง (KitOpts.pocket): pocketPlan เดิม บนซับในแผ่นหลัง (แผ่นเล็กเกิน = ไม่ใส่)
 *
 *   ⚠️ สัดส่วนตั้งต้นเป็นค่าสมมติ ไม่ใช่สูตรช่าง — ต้องให้ช่างยืนยัน: แถบซิปกว้าง หนา÷2 · ฝาปิดสูง หนา + 0.6×สูง · ทรงกลม ซิป 2/5 ของรอบ ชิ้นข้าง 3/5 ·
 *     หูถุงผ้า 55×6 · สายสะพาย 120 · ความยาวชิ้นข้าง/แถบ = วัดจากขอบจริงของแผ่นหน้า (ขอบคู่จึงยาวเท่ากันเสมอ)
 *   สายสะพาย (ทรงกล่อง / ฝาปิด) = พาดข้างถึงข้าง โคนเย็บกับชิ้นข้าง (KitAttach.across) · ปลายแถบซิปเย็บกับปลายชิ้นข้าง ครึ่งละชิ้น (ตะเข็บบางช่วงของปลายชิ้นข้าง)
 *   รูปชิ้น = ขนาดสำเร็จ (เส้นเย็บ) · ชิ้นแรกของแต่ละแถววางที่ 0 · at = มุมซ้ายบนของกรอบเส้นเย็บ
 *
 * ใช้ที่: components/pattern-studio (ตัวสร้างจากแม่แบบ) · เทสต์ lib/__tests__/bag-kits.test.ts · คู่มือ docs/pattern-studio.md
 */
import { BAG_HANDLE_ATTACH, bagAttachRefs, bagGeometry, bagPieces, bagSeamRefs, filletNodes, type BagParams } from "@/lib/bag-templates";
import { LINING_GAP, pocketPlan } from "@/lib/pattern-lining";
import { pieceEdges, type EdgeMeta, type SeamKind } from "@/lib/pattern-seams";
import { pieceGeometry, shapeBox, type InnerLine, type Pt, type Shape } from "@/lib/pattern-shape";

export type BagStyle = "tote" | "flat" | "pouch" | "box" | "flap" | "round" | "bucket" | "duffel" | "backpack" | "cosmetic" | "drawstring" | "wallet";
export type KitPiece = {
  key: string; name: string; nameEn: string; count: number;
  shape: Shape; holes: Shape[]; allow: number; allowEdges: number[] | null; foldEdges: number[] | null; grain: [Pt, Pt] | null; notches: Pt[];
  at: [number, number];
  /** ชิ้นชั้นซับใน */ lining?: true;
  /** ผูกรูปกับชิ้นนี้ (key) — แก้ต้นแบบแล้วชิ้นนี้เปลี่ยนตาม */ linkTo?: string;
  /** ค่ารายขอบ (เช่น ขอบปากติดซิป) */ edgeMeta?: EdgeMeta[];
  /** เส้นในชิ้น (พิกัดของชิ้นเอง) */ inner?: InnerLine[];
};
export type KitSide = { piece: string; from: number; count: number; n: number; t0?: number; t1?: number; inner?: string };
export type KitSeam = { a: KitSide; b: KitSide; kind?: SeamKind };
export type KitAttach = { kind: "handle" | "behind"; piece: string; on: string; a?: Pt; b?: Pt; len?: number; w?: number; tail?: number; /** สายพาดข้างถึงข้าง (โคนอยู่ที่ชิ้นข้าง) */ across?: boolean };
export type BagKit = { style: BagStyle; pieces: KitPiece[]; seams: KitSeam[]; attach: KitAttach[]; /** ค่าแม่แบบ Tote (ไว้จำในแพทเทิร์น) */ params?: BagParams };
export type KitOpts = { lining: boolean; pocket: boolean };
export const KIT_OPTS_DEFAULT: KitOpts = { lining: true, pocket: true };

/** ค่าที่ปรับได้ของทรง 2–6 (ซม.) — แต่ละทรงใช้บางตัว (BAG_STYLES.fields) */
export type KitParams = { W: number; H: number; D: number; r: number; sa: number; hem: number; Lh: number; wh: number; g: number; strap: number; ws: number; flapH: number };
export type KitKey = keyof KitParams;
export const KIT_LIMITS: Record<KitKey, { min: number; max: number; step: number }> = {
  W: { min: 8, max: 60, step: 0.5 }, H: { min: 8, max: 55, step: 0.5 }, D: { min: 2, max: 22, step: 0.5 }, r: { min: 0, max: 8, step: 0.5 },
  sa: { min: 0.3, max: 2, step: 0.1 }, hem: { min: 0, max: 5, step: 0.5 }, Lh: { min: 20, max: 80, step: 1 }, wh: { min: 1.5, max: 5, step: 0.5 }, g: { min: 8, max: 30, step: 0.5 },
  strap: { min: 60, max: 150, step: 1 }, ws: { min: 1, max: 5, step: 0.5 }, flapH: { min: 4, max: 40, step: 0.5 },
};
const BASE: KitParams = { W: 30, H: 22, D: 8, r: 2, sa: 1, hem: 3, Lh: 55, wh: 3, g: 14, strap: 120, ws: 1.5, flapH: 13 };
export const BAG_STYLES: { key: BagStyle; th: string; en: string; hintTh: string; hintEn: string; fields: KitKey[]; defaults: KitParams }[] = [
  { key: "tote", th: "Tote อยู่ทรง", en: "Structured tote", hintTh: "หน้า/หลัง · ข้าง+ก้น · หูหิ้ว", hintEn: "Front/back · gusset · handles", fields: [], defaults: BASE },
  { key: "flat", th: "ถุงผ้า / ช้อปปิ้งแบน", en: "Flat tote / shopper", hintTh: "หน้า/หลัง · หูหิ้ว (ไม่มีความหนา)", hintEn: "Front/back · handles (no depth)", fields: ["W", "H", "Lh", "wh", "g", "sa", "hem"], defaults: { ...BASE, W: 38, H: 42, r: 0 } },
  { key: "pouch", th: "ซองซิป / คลัทช์ / ใส่เหรียญ", en: "Zip pouch / clutch", hintTh: "หน้า/หลัง · ซิปปาก (ไม่มีความหนา)", hintEn: "Front/back · mouth zip (no depth)", fields: ["W", "H", "r", "sa"], defaults: { ...BASE, W: 20, H: 13, r: 2 } },
  { key: "box", th: "สะพายข้างทรงกล่อง", en: "Boxy crossbody", hintTh: "หน้า · หลัง · ข้าง+ก้น · แถบซิปบน · สายสะพาย", hintEn: "Front · back · gusset · top zip strips · strap", fields: ["W", "H", "D", "r", "strap", "ws", "sa"], defaults: { ...BASE, W: 24, H: 16, D: 8, r: 3 } },
  { key: "flap", th: "กระเป๋าฝาปิด (เมสเซนเจอร์)", en: "Flap bag (messenger)", hintTh: "หน้า · หลัง · ข้าง+ก้น · ฝาปิด · สายสะพาย", hintEn: "Front · back · gusset · flap · strap", fields: ["W", "H", "D", "r", "flapH", "strap", "ws", "sa", "hem"], defaults: { ...BASE, W: 30, H: 22, D: 8, r: 2, flapH: 13 } },
  { key: "round", th: "ทรงกลม", en: "Round bag", hintTh: "หน้า · หลัง วงกลม · ชิ้นข้างรอบ · แถบซิป", hintEn: "Round front · back · side band · zip strips", fields: ["W", "D", "sa"], defaults: { ...BASE, W: 12, H: 12, D: 4, r: 0 } },
  { key: "bucket", th: "ทรงถัง", en: "Bucket bag", hintTh: "ก้นกลม · ตัวถังม้วนรอบ · สายสะพาย", hintEn: "Round base · wrap-around body · strap", fields: ["W", "H", "strap", "ws", "sa", "hem"], defaults: { ...BASE, W: 18, H: 24, r: 0 } },
  { key: "duffel", th: "ดัฟเฟิล", en: "Duffel", hintTh: "ปลายกลม 2 · ตัวม้วนรอบ มีซิป · หูหิ้ว", hintEn: "Two round ends · wrap-around body with zip · handles", fields: ["W", "H", "Lh", "wh", "sa"], defaults: { ...BASE, W: 45, H: 22, r: 0, Lh: 40, wh: 2.5 } },
  { key: "backpack", th: "เป้", en: "Backpack", hintTh: "หน้า · หลัง · ข้าง+ก้น · แถบซิปบน · กระเป๋าหน้า · สายบ่า", hintEn: "Front · back · gusset · zip top · front pocket · shoulder straps", fields: ["W", "H", "D", "r", "strap", "ws", "sa"], defaults: { ...BASE, W: 28, H: 40, D: 12, r: 4, strap: 70, ws: 2 } },
  { key: "cosmetic", th: "เครื่องสำอางก้นกล่อง", en: "Boxed-corner pouch", hintTh: "หน้า/หลัง ตัดมุมก้น · ซิปปาก", hintEn: "Front/back with boxed corners · mouth zip", fields: ["W", "H", "D", "sa"], defaults: { ...BASE, W: 22, H: 13, D: 8, r: 0 } },
  { key: "drawstring", th: "หูรูด", en: "Drawstring bag", hintTh: "หน้า/หลัง · พับปากเป็นช่องร้อยเชือก", hintEn: "Front/back · folded casing for the cord", fields: ["W", "H", "sa", "hem"], defaults: { ...BASE, W: 30, H: 38, r: 0 } },
  { key: "wallet", th: "กระเป๋าสตางค์", en: "Bifold wallet", hintTh: "ตัวนอก · แผ่นใน · ช่องใส่บัตร 2", hintEn: "Outer · inner panel · two card slots", fields: ["W", "H", "sa"], defaults: { ...BASE, W: 22, H: 9.5, r: 0, sa: 0.5 } },
];
export const bagStyle = (key: BagStyle) => BAG_STYLES.find((s) => s.key === key) ?? BAG_STYLES[0];

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
type Raw = Omit<KitPiece, "at">;
type Draft = { pieces: Raw[]; seams: KitSeam[]; attach: KitAttach[]; /** ชิ้นตัวกระเป๋าที่คัดลอกเป็นซับใน */ body: string[]; /** ชิ้นที่มีซับในประกบ (เย็บ 3 ขอบกับตัวเอง เช่น ฝาปิด) */ faced: string[]; /** ชิ้นตัวนอกที่ซับในของมันรับช่องใส่ของ */ pocketOn: string };
const S = (piece: string, from: number, count = 1, n = 4): KitSide => ({ piece, from, count, n });

/** ปรับค่าเข้าขอบเขตของทรง (มุมมนไม่เกินครึ่งด้านสั้น · ฝาปิดไม่ยาวเกินตัว) */
export function kitParams(style: BagStyle, raw: Partial<KitParams>): KitParams {
  const p: KitParams = { ...bagStyle(style).defaults, ...raw };
  (Object.keys(KIT_LIMITS) as KitKey[]).forEach((k) => { const L = KIT_LIMITS[k], v = Number(p[k]); p[k] = clamp(Number.isFinite(v) ? v : bagStyle(style).defaults[k], L.min, L.max); });
  if (style === "round") p.H = p.W;
  if (style === "backpack") p.r = Math.max(1, p.r);                      // เป้: มุมมนทั้ง 4 เสมอ (แผ่นหน้าแบ่งเป็น 8 ขอบ)
  if (style === "cosmetic") p.D = Math.min(p.D, Math.max(2, Math.floor((p.W - 4) * 2) / 2));
  p.r = clamp(p.r, 0, Math.max(0, Math.floor((Math.min(p.W, p.H) / 2 - 1) * 2) / 2));
  p.g = clamp(p.g, Math.min(KIT_LIMITS.g.min, p.W - 4), Math.max(4, Math.min(p.W - 2 * p.wh - 2, p.Lh - 4)));
  p.flapH = clamp(p.flapH, KIT_LIMITS.flapH.min, Math.max(KIT_LIMITS.flapH.min, p.H - 2));
  return p;
}

const rectShape = (w: number, h: number): Shape => ({ k: "rect", x: 0, y: 0, w: r3(w), h: r3(h) });
/** แผ่นหน้า/หลัง: ปากอยู่บน (ขอบสุดท้าย) · ขอบ ข้าง–(โค้ง)–ก้น–(โค้ง)–ข้าง เรียงจากปากซ้ายไปปากขวา — แบบเดียวกับ Tote */
function uPanel(W: number, H: number, r: number): { shape: Shape; n: number; U: number } {
  const TL: Pt = [0, 0], BL: Pt = [0, H], BR: Pt = [W, H], TR: Pt = [W, 0];
  const shape: Shape = { k: "path", nodes: [{ x: 0, y: 0 }, ...filletNodes(TL, BL, BR, r), ...filletNodes(BL, BR, TR, r), { x: r3(W), y: 0 }] };
  const n = r > 0 ? 6 : 4, E = pieceEdges(shape);
  return { shape, n, U: r3(E.slice(0, n - 1).reduce((s, e) => s + e.len, 0)) };
}
/** วงกลม 5 ขอบ (โค้งละ 72°): ขอบ 0–1 = ครึ่งบน (ติดแถบซิป) · ขอบ 2–4 = ส่วนล่าง (ติดชิ้นข้างรอบ) */
function circle5(R: number): Shape {
  const h = (4 / 3) * Math.tan((72 * Math.PI) / 180 / 4) * R;
  return { k: "path", nodes: [-162, -90, -18, 54, 126].map((deg) => {
    const a = (deg * Math.PI) / 180, tx = -Math.sin(a), ty = Math.cos(a);
    return { x: r3(R + R * Math.cos(a)), y: r3(R + R * Math.sin(a)), ix: r3(-tx * h), iy: r3(-ty * h), ox: r3(tx * h), oy: r3(ty * h) };
  }) };
}
const allowE = (n: number, hemEdges: number[], sa: number, hem: number): number[] | null => (hemEdges.length && hem > 0 && hem !== sa ? Array.from({ length: n }, (_, i) => (hemEdges.includes(i) ? hem : sa)) : null);
const foldE = (n: number, hemEdges: number[], hem: number): number[] | null => (hemEdges.length && hem > 0 ? Array.from({ length: n }, (_, i) => (hemEdges.includes(i) ? 1 : 0)) : null);
const piece = (key: string, name: string, nameEn: string, count: number, shape: Shape, sa: number, extra: Partial<Raw> = {}): Raw =>
  ({ key, name, nameEn, count, shape, holes: [], allow: sa, allowEdges: null, foldEdges: null, grain: null, notches: [], ...extra });
const zipEdge = (n: number, i: number): EdgeMeta[] => Array.from({ length: n }, (_, k) => (k === i ? { zip: true } : {}));

function draft(style: Exclude<BagStyle, "tote">, p: KitParams): Draft {
  const { W, H, D, sa } = p;
  const handle = (len: number, w: number, name: string, nameEn: string, count: number, key: string): Raw => {
    const L = len + 2 * BAG_HANDLE_ATTACH, hw = 2 * w;
    return piece(key, name, nameEn, count, rectShape(L, hw), sa, { notches: [[BAG_HANDLE_ATTACH, 0], [BAG_HANDLE_ATTACH, hw], [r3(L - BAG_HANDLE_ATTACH), 0], [r3(L - BAG_HANDLE_ATTACH), hw]] });
  };
  if (style === "flat" || style === "pouch" || style === "drawstring") {
    const zip = style === "pouch", bare = style !== "flat", hem = zip ? 0 : p.hem, P = uPanel(W, H, zip ? p.r : 0), m = P.n - 1;
    const front = piece("front", "ตัวหน้า / ตัวหลัง", "Front / back panel", 2, P.shape, sa, { allowEdges: allowE(P.n, [m], sa, hem), foldEdges: foldE(P.n, [m], hem), ...(zip ? { edgeMeta: zipEdge(P.n, m) } : {}) });
    const U = S("front", 0, m, P.n);
    return {
      pieces: bare ? [front] : [front, handle(p.Lh, p.wh, "หูหิ้ว (พับครึ่ง)", "Handle (folded in half)", 2, "handle")],
      seams: [{ a: U, b: { ...U } }],                                        // ตัด 2 ชิ้น เย็บ ข้าง–ก้น–ข้าง ประกบกัน
      attach: bare ? [] : [{ kind: "handle", piece: "handle", on: "front", a: [r3(W / 2 - p.g / 2), 0], b: [r3(W / 2 + p.g / 2), 0], len: p.Lh, w: p.wh, tail: BAG_HANDLE_ATTACH }],
      body: ["front"], faced: [], pocketOn: "front",
    };
  }
  const strap = handle(p.strap, p.ws, "สายสะพาย (พับครึ่ง)", "Shoulder strap (folded in half)", 1, "strap");
  // สายสะพายพาดข้างถึงข้าง: โคนสายเย็บกับชิ้นข้างซ้าย/ขวา ต่ำจากปาก 2 ซม. (ค่าสมมติ)
  const strapAt: KitAttach = { kind: "handle", piece: "strap", on: "back", across: true, a: [0, 2], b: [0, 2], len: p.strap, w: p.ws, tail: BAG_HANDLE_ATTACH };
  /** ปลายแถบซิป 2 ชิ้น เย็บกับปลายชิ้นข้าง (ปลายชิ้นข้างกว้าง = หนา · แถบซิปชิ้นละครึ่ง) — ครึ่งฝั่งแผ่นหน้า = แถบหน้า · ครึ่งฝั่งแผ่นหลัง = แถบหลัง */
  const zipEnds = (zw: number): KitSeam[] => [
    { a: { ...S("gusset", 1), t0: 0, t1: zw }, b: S("zipB", 3) }, { a: { ...S("gusset", 1), t0: zw, t1: r3(2 * zw) }, b: S("zipA", 3) },
    { a: { ...S("gusset", 3), t0: 0, t1: zw }, b: S("zipA", 1) }, { a: { ...S("gusset", 3), t0: zw, t1: r3(2 * zw) }, b: S("zipB", 1) },
  ];
  if (style === "box" || style === "flap") {
    const box = style === "box", hem = box ? 0 : p.hem, P = uPanel(W, H, p.r), m = P.n - 1;
    const panel = (key: string, name: string, nameEn: string, hemMouth: boolean, extra: Partial<Raw> = {}) =>
      piece(key, name, nameEn, 1, P.shape, sa, { allowEdges: hemMouth ? allowE(P.n, [m], sa, hem) : null, foldEdges: hemMouth ? foldE(P.n, [m], hem) : null, ...extra });
    const gusset = piece("gusset", "ข้าง + ก้น ชิ้นเดียว", "Gusset strip (sides + bottom)", 1, rectShape(P.U, D), sa, { allowEdges: allowE(4, [1, 3], sa, hem), foldEdges: foldE(4, [1, 3], hem) });
    const seams: KitSeam[] = [{ a: S("front", 0, m, P.n), b: S("gusset", 2) }, { a: S("back", 0, m, P.n), b: S("gusset", 0) }];
    if (box) {
      // แถบซิปบน 2 ชิ้น: ขอบยาวด้านล่างเย็บกับปากของแผ่นหน้า / แผ่นหลัง · ขอบยาวด้านบน (ว่าง) = ที่ติดซิป — ซิป 1 เส้นติดทั้งสองแถบ จึงติ๊กที่แถบหน้าแถบเดียว
      const zw = r3(D / 2);
      return {
        pieces: [panel("front", "ตัวหน้า", "Front panel", false), panel("back", "ตัวหลัง", "Back panel", false, { linkTo: "front" }), gusset,
          piece("zipA", "แถบซิปบน (ฝั่งหน้า)", "Top zip strip (front side)", 1, rectShape(W, zw), sa, { edgeMeta: zipEdge(4, 0) }),
          piece("zipB", "แถบซิปบน (ฝั่งหลัง)", "Top zip strip (back side)", 1, rectShape(W, zw), sa, { linkTo: "zipA" }), strap],
        seams: [...seams, { a: S("front", m, 1, P.n), b: S("zipA", 2) }, { a: S("back", m, 1, P.n), b: S("zipB", 2) }, ...zipEnds(zw)],
        attach: [strapAt], body: ["front", "back", "gusset", "zipA", "zipB"], faced: [], pocketOn: "back",
      };
    }
    // ฝาปิด: ขอบบนเย็บกับปากของแผ่นหลัง แล้วพับข้ามปากลงมาปิดด้านหน้า (สูง = หนา + ส่วนที่ทับด้านหน้า)
    return {
      pieces: [panel("front", "ตัวหน้า", "Front panel", true), panel("back", "ตัวหลัง", "Back panel", false, { linkTo: "front" }), gusset,
        piece("flap", "ฝาปิด", "Flap", 1, rectShape(W, D + p.flapH), sa), strap],
      seams: [...seams, { a: S("back", m, 1, P.n), b: S("flap", 0) }],
      attach: [strapAt], body: ["front", "back", "gusset"], faced: ["flap"], pocketOn: "back",
    };
  }
  if (style === "bucket") {
    // ทรงถัง: ตัวถังยาวเท่าเส้นรอบก้นจริง · ขอบบน = ปาก (พับ) · ขอบข้างสองด้านเย็บติดกันเอง
    const C = circle5(W / 2), per = r3(pieceEdges(C).reduce((n, e) => n + e.len, 0));
    return {
      pieces: [piece("base", "ก้น (วงกลม)", "Base (round)", 1, C, sa), piece("wall", "ตัวถัง (ม้วนรอบก้น)", "Body (wraps the base)", 1, rectShape(per, H), sa, { allowEdges: allowE(4, [0], sa, p.hem), foldEdges: foldE(4, [0], p.hem) }), strap],
      seams: [{ a: S("base", 0, 5, 5), b: S("wall", 2) }, { a: S("wall", 1), b: S("wall", 3) }],
      attach: [{ kind: "handle", piece: "strap", on: "wall", across: true, a: [0, 2], b: [0, 2], len: p.strap, w: p.ws, tail: BAG_HANDLE_ATTACH }],   // สายพาดข้ามปากถัง โคนต่ำจากปาก 2 ซม. (ค่าสมมติ)
      body: ["base", "wall"], faced: [], pocketOn: "",
    };
  }
  if (style === "duffel") {
    // ดัฟเฟิล: กว้าง = ความยาวตัวกระเป๋า · สูง = เส้นผ่านศูนย์กลางปลาย · ตัวกระเป๋าม้วนรอบปลายทั้งสอง ขอบสั้นสองด้านมาชนกันด้านบน = ที่ติดซิป
    const C = circle5(H / 2), per = r3(pieceEdges(C).reduce((n, e) => n + e.len, 0));
    return {
      pieces: [piece("front", "ปลายกระเป๋า (วงกลม)", "End (round)", 1, C, sa), piece("back", "ปลายกระเป๋า อีกด้าน", "Other end (round)", 1, C, sa, { linkTo: "front" }),
        piece("body", "ตัวกระเป๋า (ม้วนรอบ)", "Body (wrap-around)", 1, rectShape(per, W), sa, { edgeMeta: zipEdge(4, 1) }), handle(p.Lh, p.wh, "หูหิ้ว (พับครึ่ง)", "Handle (folded in half)", 2, "handle")],
      seams: [{ a: S("front", 0, 5, 5), b: S("body", 2) }, { a: S("back", 0, 5, 5), b: S("body", 0) }],
      attach: [{ kind: "handle", piece: "handle", on: "front", across: true, a: [0, r3(H / 2)], b: [0, r3(H / 2)], len: p.Lh, w: p.wh, tail: BAG_HANDLE_ATTACH }],
      body: ["front", "back", "body"], faced: [], pocketOn: "",
    };
  }
  if (style === "backpack") {
    // เป้: แผ่นหน้า/หลังมุมมนทั้ง 4 (มุมบนมนกว่า) · ขอบ 0–4 = ข้าง–ก้น–ข้าง ↔ ชิ้นข้าง+ก้น · ขอบ 5–7 = โค้งบน ↔ แถบซิปบน
    const rt = clamp(p.r * 2, p.r, Math.max(p.r, W / 2 - 1)), TL: Pt = [0, 0], BL: Pt = [0, H], BR: Pt = [W, H], TR: Pt = [W, 0];
    const fBL = filletNodes(TL, BL, BR, p.r), fBR = filletNodes(BL, BR, TR, p.r), fTR = filletNodes(BR, TR, TL, rt), fTL = filletNodes(TR, TL, BL, rt);
    const shape: Shape = { k: "path", nodes: [fTL[1], fBL[0], fBL[1], fBR[0], fBR[1], fTR[0], fTR[1], fTL[0]] };
    const E = pieceEdges(shape), U = r3(E.slice(0, 5).reduce((n, e) => n + e.len, 0)), top = r3(E[5].len + E[6].len + E[7].len), Lt = E[6].len, sw = 2 * p.ws;
    const pk = pocketPlan(shapeBox(shape), { kind: "patch", w: Math.round(W * 0.6), depth: Math.round(H * 0.3), top: Math.round(H * 0.45) }, "bp");
    const strapPiece = (key: string, name: string, nameEn: string, extra: Partial<Raw> = {}) => piece(key, name, nameEn, 1, rectShape(sw, p.strap), sa, extra);
    const fits = Lt >= 2 * sw + 1, m = Math.max(0.5, (Lt - 2 * sw) / 4);
    return {
      pieces: [piece("front", "ตัวหน้า", "Front panel", 1, shape, sa, { inner: [pk.line] }), piece("back", "ตัวหลัง", "Back panel", 1, shape, sa, { linkTo: "front" }),
        piece("gusset", "ข้าง + ก้น ชิ้นเดียว", "Gusset strip (sides + bottom)", 1, rectShape(U, D), sa),
        piece("ziptop", "แถบซิปบน", "Top zip gusset", 1, rectShape(top, D), sa, { inner: [{ id: "ilbpz", kind: "slit", name: "ซิปบน", pts: [[2, r3(D / 2)], [r3(top - 2), r3(D / 2)]] }] }),
        piece("fpocket", "กระเป๋าหน้า", "Front pocket", 1, pk.piece.shape, 0, { allowEdges: pk.piece.allowEdges ?? null, foldEdges: pk.piece.foldEdges ?? null }),
        strapPiece("strapL", "สายสะพายบ่า (ซ้าย)", "Shoulder strap (left)"), strapPiece("strapR", "สายสะพายบ่า (ขวา)", "Shoulder strap (right)", { linkTo: "strapL" }),
        handle(14, 1.5, "หูหิ้วบน (พับครึ่ง)", "Top grab handle (folded in half)", 1, "handle")],
      seams: [{ a: S("front", 0, 5, 8), b: S("gusset", 2) }, { a: S("back", 0, 5, 8), b: S("gusset", 0) }, { a: S("front", 5, 3, 8), b: S("ziptop", 2) }, { a: S("back", 5, 3, 8), b: S("ziptop", 0) },
        { a: { piece: "front", from: 0, count: 1, n: 1, inner: pk.line.id }, b: { piece: "fpocket", ...pk.side }, kind: "lapped" },
        // โคนบนของสายบ่าเย็บกับขอบบนของแผ่นหลัง (บางช่วง) — ปลายล่างของสายให้ช่างเย็บเอง
        ...(fits ? [{ a: { ...S("back", 6, 1, 8), t0: r3(m), t1: r3(m + sw) }, b: S("strapL", 0) }, { a: { ...S("back", 6, 1, 8), t0: r3(Lt - m - sw), t1: r3(Lt - m) }, b: S("strapR", 0) }] : []),
      ],
      attach: [{ kind: "handle", piece: "handle", on: "back", a: [r3(W / 2 - 4), 0], b: [r3(W / 2 + 4), 0], len: 14, w: 1.5, tail: BAG_HANDLE_ATTACH }],
      body: ["front", "back", "gusset", "ziptop"], faced: [], pocketOn: "back",
    };
  }
  if (style === "cosmetic") {
    // ก้นกล่อง: แผ่นกว้าง = กว้าง + หนา · สูง = สูง + หนา÷2 · ตัดมุมก้นเป็นสี่เหลี่ยม หนา÷2 — เย็บข้าง ก้น แล้วเย็บขอบมุมสองด้านเข้าหากัน
    const c = r3(D / 2), PW = r3(W + D), PH = r3(H + c);
    const shape: Shape = { k: "path", nodes: [{ x: 0, y: 0 }, { x: 0, y: r3(PH - c) }, { x: c, y: r3(PH - c) }, { x: c, y: PH }, { x: r3(PW - c), y: PH }, { x: r3(PW - c), y: r3(PH - c) }, { x: PW, y: r3(PH - c) }, { x: PW, y: 0 }] };
    const self = (i: number): KitSeam => ({ a: S("front", i, 1, 8), b: S("front", i, 1, 8) });
    return {
      pieces: [piece("front", "ตัวหน้า / ตัวหลัง (ตัดมุมก้น)", "Front / back panel (boxed corners)", 2, shape, sa, { edgeMeta: zipEdge(8, 7) })],
      seams: [self(0), self(3), self(6), { a: S("front", 1, 1, 8), b: S("front", 2, 1, 8) }, { a: S("front", 4, 1, 8), b: S("front", 5, 1, 8) }],
      attach: [], body: ["front"], faced: [], pocketOn: "front",
    };
  }
  if (style === "wallet") {
    // กระเป๋าสตางค์พับสอง: ตัวนอก + แผ่นใน เย็บ ขวา–ล่าง–ซ้าย (ด้านบนเปิด = ช่องธนบัตร) · ช่องใส่บัตรปะบนแผ่นใน ซ้าย/ขวา · แนวพับกลาง
    const fold = (id: string): InnerLine => ({ id, kind: "fold", name: "พับกลาง", pts: [[r3(W / 2), 0], [r3(W / 2), H]] });
    const slot = (side: "L" | "R") => pocketPlan({ x: side === "L" ? 0 : W / 2, y: 0, w: W / 2, h: H }, { kind: "patch", w: Math.max(4, r1(W / 2 - 2.5)), depth: Math.max(3, r1(H - 3.5)), top: 2 }, `w${side}`);
    const sl = slot("L"), sr = slot("R");
    const slotPiece = (key: string, name: string, nameEn: string, pl: typeof sl) => piece(key, name, nameEn, 1, pl.piece.shape, 0, { allowEdges: pl.piece.allowEdges ?? null, foldEdges: pl.piece.foldEdges ?? null });
    return {
      pieces: [piece("outer", "ตัวนอก", "Outer", 1, rectShape(W, H), sa, { inner: [fold("ilwf")] }), piece("inner", "แผ่นใน (ซับ)", "Inner panel (lining)", 1, rectShape(W, H), sa, { inner: [fold("ilwg"), sl.line, sr.line] }),
        slotPiece("slotL", "ช่องใส่บัตร (ซ้าย)", "Card slot (left)", sl), slotPiece("slotR", "ช่องใส่บัตร (ขวา)", "Card slot (right)", sr)],
      seams: [{ a: S("outer", 1, 3), b: S("inner", 1, 3) },
        { a: { piece: "inner", from: 0, count: 1, n: 1, inner: sl.line.id }, b: { piece: "slotL", ...sl.side }, kind: "lapped" },
        { a: { piece: "inner", from: 0, count: 1, n: 1, inner: sr.line.id }, b: { piece: "slotR", ...sr.side }, kind: "lapped" }],
      attach: [], body: [], faced: [], pocketOn: "",
    };
  }
  // ทรงกลม: ความยาวชิ้นข้างรอบ / แถบซิป วัดจากขอบจริงของวงกลม → ขอบคู่ยาวเท่ากันเสมอ
  const C = circle5(W / 2), E = pieceEdges(C), top = r3(E[0].len + E[1].len), low = r3(E[2].len + E[3].len + E[4].len), zw = r3(D / 2);
  return {
    pieces: [piece("front", "ตัวหน้า (วงกลม)", "Front (round)", 1, C, sa), piece("back", "ตัวหลัง (วงกลม)", "Back (round)", 1, C, sa, { linkTo: "front" }),
      piece("gusset", "ชิ้นข้างรอบ", "Side band", 1, rectShape(low, D), sa),
      piece("zipA", "แถบซิป (ฝั่งหน้า)", "Zip strip (front side)", 1, rectShape(top, zw), sa, { edgeMeta: zipEdge(4, 0) }),
      piece("zipB", "แถบซิป (ฝั่งหลัง)", "Zip strip (back side)", 1, rectShape(top, zw), sa, { linkTo: "zipA" })],
    seams: [{ a: S("front", 2, 3, 5), b: S("gusset", 2) }, { a: S("back", 2, 3, 5), b: S("gusset", 0) }, { a: S("front", 0, 2, 5), b: S("zipA", 2) }, { a: S("back", 0, 2, 5), b: S("zipB", 2) }, ...zipEnds(zw)],
    attach: [], body: ["front", "back", "gusset", "zipA", "zipB"], faced: [], pocketOn: "back",
  };
}

/** กรอบตัดของชิ้น (รวมเผื่อ) เทียบกับกรอบเส้นเย็บ */
const cutOf = (q: Raw) => { const g = pieceGeometry({ shape: q.shape, holes: q.holes, allow: q.allow, allowEdges: q.allowEdges }); return { w: g.cutBox.w, h: g.cutBox.h, ox: g.finished.x - g.cutBox.x, oy: g.finished.y - g.cutBox.y }; };
/** วางเรียงเป็นแถว กว้างไม่เกิน ~110 ซม. (at = มุมซ้ายบนของกรอบเส้นเย็บ) */
function layout(list: Raw[]): KitPiece[] {
  const gap = 3, cuts = list.map(cutOf), rowMax = Math.max(110, ...cuts.map((c) => c.w));
  let x = 0, y = 0, rowH = 0;
  return list.map((q, i) => {
    const c = cuts[i];
    if (x > 0 && x + c.w > rowMax + 0.01) { x = 0; y += rowH + gap; rowH = 0; }
    const at: [number, number] = [r3(x + c.ox), r3(y + c.oy)];
    x += c.w + gap; rowH = Math.max(rowH, c.h);
    return { ...q, at };
  });
}

/** เติมซับใน + ช่องใส่ของ ให้ชุดตัวนอกที่วางตำแหน่งแล้ว */
function finish(style: BagStyle, outer: KitPiece[], d: Omit<Draft, "pieces">, o: KitOpts, params?: BagParams): BagKit {
  const kit: BagKit = { style, pieces: [...outer], seams: [...d.seams], attach: d.attach, ...(params ? { params } : {}) };
  if (!o.lining) return kit;
  const bottom = Math.max(0, ...outer.map((q) => { const c = cutOf(q); return q.at[1] - c.oy + c.h; }));
  const dy = r1(bottom + LINING_GAP), L = (key: string) => `L:${key}`;
  const copy = (q: KitPiece): KitPiece => ({
    key: L(q.key), name: `ซับใน ${q.name}`, nameEn: `Lining ${q.nameEn}`, count: q.count, shape: q.shape, holes: [], allow: q.allow, allowEdges: q.allowEdges, foldEdges: q.foldEdges,
    grain: q.grain, notches: q.notches, at: [q.at[0], r3(q.at[1] + dy)], lining: true, ...(q.holes.length ? {} : { linkTo: q.linkTo ?? q.key }),   // ชิ้นที่มีช่องโชว์: ซับในไม่เจาะช่อง จึงไม่ผูกรูป · ชิ้นที่ผูกกับชิ้นอื่นอยู่แล้ว (แผ่นหลัง → แผ่นหน้า) = ผูกกับต้นแบบตัวเดียวกัน (ระบบไม่รับการผูกต่อเป็นทอด)
  });
  const body = d.body.filter((k) => outer.some((q) => q.key === k)), faced = d.faced.filter((k) => outer.some((q) => q.key === k));
  for (const k of [...body, ...faced]) kit.pieces.push(copy(outer.find((q) => q.key === k)!));
  for (const s of d.seams) if (body.includes(s.a.piece) && body.includes(s.b.piece)) kit.seams.push({ ...s, a: { ...s.a, piece: L(s.a.piece) }, b: { ...s.b, piece: L(s.b.piece) } });
  for (const k of faced) { const n = pieceEdges(outer.find((q) => q.key === k)!.shape).length; kit.seams.push({ a: S(k, 1, n - 1, n), b: S(L(k), 1, n - 1, n) }); }   // ซับในฝาปิด: ประกบแล้วเย็บ 3 ขอบ (ขอบบนเปิดไว้กลับตะเข็บ)
  if (!o.pocket) return kit;
  // ช่องใส่ของ 1 ช่องบนซับในแผ่นหลัง (ถุงผ้า/ซอง = ซับในของแผ่นหน้า/หลัง) — แผ่นเล็กเกินไป = ไม่ใส่ · ทรงที่ไม่มีแผ่นให้ติด (ทรงถัง ดัฟเฟิล กระเป๋าสตางค์) = ไม่ใส่
  if (!d.pocketOn) return kit;
  const host = kit.pieces.find((q) => q.key === L(outer.some((x) => x.key === d.pocketOn) ? d.pocketOn : "front"));
  if (!host) return kit;
  const hb = shapeBox(host.shape);
  if (hb.w < 14 || hb.h < 12) return kit;
  const w = Math.min(18, Math.floor(hb.w * 0.55)), depth = Math.min(11, Math.floor(hb.h * 0.4)), top = Math.max(3, Math.min(9, Math.floor(hb.h * 0.25)));
  const plan = pocketPlan(hb, { kind: "patch", w, depth, top }, "kit");
  if (plan.warnings.length) return kit;
  host.inner = [...(host.inner ?? []), plan.line];
  const right = Math.max(...kit.pieces.filter((q) => q.lining).map((q) => { const c = cutOf(q); return q.at[0] - c.ox + c.w; }));
  kit.pieces.push({ key: "lpocket", name: plan.piece.name, nameEn: "Pocket", count: 1, shape: plan.piece.shape, holes: [], allow: 0, allowEdges: plan.piece.allowEdges ?? null, foldEdges: plan.piece.foldEdges ?? null,
    grain: null, notches: [], at: [r3(right + 3), r3(dy + (plan.piece.allowEdges?.[0] ?? 0))], lining: true });
  kit.seams.push({ a: { piece: host.key, from: 0, count: 1, n: 1, inner: plan.line.id }, b: { piece: "lpocket", ...plan.side }, kind: "lapped" });
  return kit;
}

/** ชุดชิ้นของทรง 2–6 */
export function bagKit(style: Exclude<BagStyle, "tote">, raw: Partial<KitParams>, o: KitOpts = KIT_OPTS_DEFAULT): BagKit {
  const d = draft(style, kitParams(style, raw));
  return finish(style, layout(d.pieces), d, o);
}
/** ชุดชิ้นของ Tote (สูตรเดิม) + ซับใน — ซับใน = หน้า หลัง ข้าง ก้น (แผ่นใส / ถุงช่องซิป / หู ไม่มีซับใน) */
export function toteKit(raw: Partial<BagParams>, o: KitOpts = KIT_OPTS_DEFAULT): BagKit {
  const G = bagGeometry(raw);
  const outer: KitPiece[] = bagPieces(G).map((q) => ({ key: q.key, name: q.name, nameEn: q.nameEn, count: q.count, shape: q.shape, holes: q.holes, allow: q.allow, allowEdges: q.allowEdges, foldEdges: q.foldEdges, grain: q.grain, notches: q.notches, at: q.at }));
  return finish("tote", outer, {
    seams: bagSeamRefs(G).map((s) => ({ a: s.a, b: s.b })), attach: bagAttachRefs(G),
    body: ["front", "back", "strip", "side", "bottom"], faced: [], pocketOn: G.win ? "back" : "front",
  }, o, G.p);
}
