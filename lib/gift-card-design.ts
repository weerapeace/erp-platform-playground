/**
 * 💌 การ์ดของขวัญจากหมายเหตุออเดอร์ — กติกากลาง (pure · ใช้ได้ทั้ง server/client · มีเทสต์)
 *   เจ้าของเลือก 2026-11-24: แบบ A = ออกแบบแม่แบบครั้งเดียว ใบต่อไปแก้แค่ข้อความ · ตัวออกแบบลากวางแบบ Canva
 *
 * การ์ด 1 ใบ = CardDoc { w, h (มม.) · พื้น · ชิ้น[] } · ชิ้น = ข้อความ / รูป / รูปทรง วางด้วยหน่วย มม. (มุมซ้ายบน + กว้าง/สูง + หมุน)
 *   หน่วยจริง → พิมพ์ได้ขนาดเป๊ะ · บนจอคูณด้วย px ต่อ มม.
 *   ชิ้นข้อความมี role = "message" | "to" | "from" → แบบ A เอาข้อความจากหมายเหตุไปใส่ชิ้น role=message ให้เอง
 * รูป: "r2:<key>" = รูปในคลัง/อัปโหลด · "sticker:<key>" = สติ๊กเกอร์ในตัว (STICKERS)
 *
 * ใช้ที่: ตัวออกแบบ components/card-designer · หน้า /order-ops/gift-cards · หน้าพิมพ์ /print/order-gift-cards · API /api/order-gift-cards
 * คู่มือ docs/order-gift-cards.md
 */
import { sheetGrid, type GiftCardConfig } from "@/lib/website-gift-cards";

// ─── ชนิด ───

export type CardRole = "message" | "to" | "from";
export type CardAlign = "left" | "center" | "right";
export type CardVAlign = "top" | "middle" | "bottom";
export type CardShape = "rect" | "ellipse" | "line";

export interface CardTextStyle {
  /** ชื่อฟอนต์ (family) จาก CARD_FONTS หรือ "upload:<id>" ฟอนต์ที่อัปโหลด */
  font: string;
  /** ขนาด pt (1 pt = 0.3528 มม.) */
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: CardAlign;
  valign: CardVAlign;
  /** ระยะบรรทัด (เท่าของขนาดตัวอักษร) */
  lineHeight: number;
  /** ระยะห่างตัวอักษร (มม.) */
  letterSpacing: number;
}

export interface CardEl {
  id: string;
  kind: "text" | "image" | "shape";
  x: number; y: number; w: number; h: number;
  /** องศา หมุนรอบจุดกลางชิ้น */
  rot: number;
  /** 0-1 */
  opacity: number;
  locked?: boolean;
  hidden?: boolean;
  // ข้อความ
  text?: string;
  role?: CardRole | null;
  style?: CardTextStyle;
  // รูป
  src?: string;
  fit?: "contain" | "cover";
  flipX?: boolean;
  // รูปทรง
  shape?: CardShape;
  fill?: string;
  stroke?: string;
  /** ความหนาเส้น (มม.) */
  strokeW?: number;
  /** มุมมน (มม.) สี่เหลี่ยมเท่านั้น */
  radius?: number;
}

export type CardBg = { color: string; image: string | null; fit: "cover" | "contain" };
/** การ์ดพับ: side = พับข้างเปิดแบบหนังสือ · top = พับบนเปิดขึ้น (เจ้าของเลือก 2026-11-25 รอบ 2) */
export type CardFold = "side" | "top";
export type CardFace = "out" | "in";

export interface CardDoc {
  v: 1;
  /** การ์ดพับ = ขนาดกระดาษทั้งแผ่นก่อนพับ (A5) · el/bg ระดับบน = ด้านนอก (หลัง+ปกหน้า) */
  w: number;
  h: number;
  bg: CardBg;
  els: CardEl[];
  /** มี = การ์ดพับครึ่ง (รอยพับกลางแผ่น) */
  fold?: CardFold | null;
  /** ด้านในของการ์ดพับ (ช่องข้อความจากลูกค้าอยู่ด้านนี้) */
  inside?: { bg: CardBg; els: CardEl[] } | null;
}

export type CardTexts = { message: string; to: string; from: string };

// ─── ขนาด / ค่าตั้งต้น ───

export const PT_MM = 0.3528;
export const CARD_MIN_MM = 30;
export const CARD_MAX_MM = 300;
export const CARD_MAX_ELS = 60;
export const CARD_TEXT_MAX = 600;
export const FONT_SIZE_MIN = 4;
export const FONT_SIZE_MAX = 160;

/** ขนาดการ์ดสำเร็จรูป (ชุดเดียวกับเว็บร้าน lib/website-gift-cards GIFT_SIZE_PRESETS + แนวตั้ง) */
export const CARD_SIZES: { key: string; label: string; w: number; h: number }[] = [
  { key: "a6", label: "A6 แนวนอน (14.8 × 10.5 ซม.)", w: 148, h: 105 },
  { key: "a6p", label: "A6 แนวตั้ง (10.5 × 14.8 ซม.)", w: 105, h: 148 },
  { key: "a7", label: "A7 (10.5 × 7.4 ซม.)", w: 105, h: 74 },
  { key: "card", label: "นามบัตร (9 × 5.5 ซม.)", w: 90, h: 55 },
  { key: "square", label: "จัตุรัส (10 × 10 ซม.)", w: 100, h: 100 },
];

export interface CardFont { family: string; label: string; thai: boolean; weights: number[] }

/** ฟอนต์ Google ที่ใช้ได้ (ไทย 13 · อังกฤษ 7) — ฟอนต์อังกฤษล้วน ตัวไทยจะใช้ฟอนต์สำรอง */
export const CARD_FONTS: CardFont[] = [
  { family: "Charm", label: "ชาร์ม (ลายมือหวาน)", thai: true, weights: [400, 700] },
  { family: "Charmonman", label: "ชาร์มมนแมน (ลายมือพู่กัน)", thai: true, weights: [400, 700] },
  { family: "Itim", label: "ไอติม (น่ารัก)", thai: true, weights: [400] },
  { family: "Sriracha", label: "ศรีราชา (ปากกา)", thai: true, weights: [400] },
  { family: "Mali", label: "มะลิ (กลมมน)", thai: true, weights: [400, 700] },
  { family: "Sarabun", label: "สารบรรณ (เรียบ)", thai: true, weights: [400, 700] },
  { family: "Kanit", label: "คณิต (ทันสมัย)", thai: true, weights: [400, 700] },
  { family: "Prompt", label: "พร้อมท์ (สะอาด)", thai: true, weights: [400, 700] },
  { family: "Mitr", label: "มิตร (หนานุ่ม)", thai: true, weights: [400, 600] },
  { family: "Pridi", label: "ปรีดี (มีหัว หรู)", thai: true, weights: [400, 700] },
  { family: "Trirong", label: "ตรีรงค์ (คลาสสิก)", thai: true, weights: [400, 700] },
  { family: "Chonburi", label: "ชลบุรี (หัวโต)", thai: true, weights: [400] },
  { family: "Niramit", label: "นิรมิต (โปร่ง)", thai: true, weights: [400, 700] },
  { family: "Great Vibes", label: "Great Vibes (ลายมือหรู)", thai: false, weights: [400] },
  { family: "Dancing Script", label: "Dancing Script (ลายมือ)", thai: false, weights: [400, 700] },
  { family: "Pacifico", label: "Pacifico (สนุก)", thai: false, weights: [400] },
  { family: "Playfair Display", label: "Playfair Display (หรู)", thai: false, weights: [400, 700] },
  { family: "Cormorant Garamond", label: "Cormorant (คลาสสิก)", thai: false, weights: [400, 700] },
  { family: "Montserrat", label: "Montserrat (เรียบ)", thai: false, weights: [400, 700] },
  { family: "Bebas Neue", label: "Bebas Neue (หัวข้อ)", thai: false, weights: [400] },
];
export const DEFAULT_FONT = "Charm";
export const findCardFont = (family: string) => CARD_FONTS.find((f) => f.family === family) ?? null;
export const isUploadFont = (font: string) => font.startsWith("upload:");
export const uploadFontFamily = (id: string) => `gcf-${id.replace(/[^a-z0-9]/gi, "").slice(0, 32)}`;

/** ลิงก์ Google Fonts ของฟอนต์ที่ใช้ (เฉพาะในรายการ) · ไม่มี = "" */
export function googleFontsHref(families: Iterable<string>): string {
  const fams = [...new Set([...families])].map(findCardFont).filter((f): f is CardFont => !!f);
  if (!fams.length) return "";
  const q = fams.map((f) => `family=${encodeURIComponent(f.family).replace(/%20/g, "+")}:wght@${f.weights.join(";")}`).join("&");
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

/** font-family ใน CSS ของฟอนต์หนึ่ง (มีฟอนต์สำรองไทยท้ายเสมอ) */
export function fontStack(font: string): string {
  const fam = isUploadFont(font) ? uploadFontFamily(font.slice(7)) : (findCardFont(font)?.family ?? DEFAULT_FONT);
  return `'${fam.replace(/'/g, "")}', 'Sarabun', sans-serif`;
}

/** ฟอนต์ทั้งหมดที่การ์ดใช้ (การ์ดพับ = รวมด้านใน) */
export function docFonts(docs: CardDoc | CardDoc[]): string[] {
  const out = new Set<string>();
  for (const d of Array.isArray(docs) ? docs : [docs]) for (const e of allEls(d)) if (e.kind === "text" && e.style?.font) out.add(e.style.font);
  return [...out];
}

// ─── การ์ดพับ (A5 พับครึ่ง = A6) ───

/** ขนาดแผ่นก่อนพับ: พับข้าง = A5 แนวนอน (หน้าละ A6 แนวตั้ง) · พับบน = A5 แนวตั้ง (หน้าละ A6 แนวนอน) */
export const FOLD_SHEET: Record<CardFold, { w: number; h: number; label: string }> = {
  side: { w: 210, h: 148, label: "พับข้าง เปิดแบบหนังสือ (หน้าการ์ด A6 แนวตั้ง)" },
  top: { w: 148, h: 210, label: "พับบน เปิดขึ้น (หน้าการ์ด A6 แนวนอน)" },
};
export const isFolded = (doc: CardDoc): boolean => doc.fold === "side" || doc.fold === "top";
/** ชิ้นทุกชิ้นของการ์ด (ด้านนอก + ด้านใน) */
export const allEls = (doc: CardDoc): CardEl[] => (isFolded(doc) && doc.inside ? [...doc.els, ...doc.inside.els] : doc.els);
/** รอยพับ (มม.) — พับข้าง = เส้นตั้งที่ x · พับบน = เส้นนอนที่ y */
export function foldLine(doc: CardDoc): { x?: number; y?: number } | null {
  if (!isFolded(doc)) return null;
  return doc.fold === "side" ? { x: doc.w / 2 } : { y: doc.h / 2 };
}
/** ด้านหนึ่งของการ์ด เป็น CardDoc ธรรมดา (ใช้กับตัวออกแบบ/วาด/พิมพ์) · การ์ดแผ่นเดียว = ตัวมันเอง */
export function faceDoc(doc: CardDoc, face: CardFace): CardDoc {
  if (!isFolded(doc)) return doc;
  if (face === "in") return { v: 1, w: doc.w, h: doc.h, bg: doc.inside?.bg ?? { color: "#ffffff", image: null, fit: "cover" }, els: doc.inside?.els ?? [] };
  return { v: 1, w: doc.w, h: doc.h, bg: doc.bg, els: doc.els };
}
/** ใส่ด้านที่แก้แล้วกลับเข้าการ์ด */
export function withFace(doc: CardDoc, face: CardFace, f: CardDoc): CardDoc {
  if (!isFolded(doc)) return f;
  return face === "in" ? { ...doc, inside: { bg: f.bg, els: f.els } } : { ...doc, bg: f.bg, els: f.els };
}
/** การ์ดพับเปล่า — ด้านในมีช่องข้อความจากลูกค้า + ถึง/จาก ที่ครึ่งหลัง (ขวา/ล่าง) */
export function newFoldedDoc(fold: CardFold = "side"): CardDoc {
  const { w, h } = FOLD_SHEET[fold];
  const half = fold === "side" ? { x: w / 2, y: 0, w: w / 2, h } : { x: 0, y: h / 2, w, h: h / 2 };
  const m = 10;
  const inEls: CardEl[] = [
    { id: newElId(), kind: "text", x: half.x + m, y: half.y + m, w: half.w - m * 2, h: 12, rot: 0, opacity: 1, text: "", role: "to", style: { ...DEFAULT_TEXT_STYLE, font: "Charm", size: 13, align: "left", valign: "top" } },
    { id: newElId(), kind: "text", x: half.x + m, y: half.y + m + 16, w: half.w - m * 2, h: half.h - m * 2 - 34, rot: 0, opacity: 1, text: "", role: "message", style: { ...DEFAULT_TEXT_STYLE, font: "Charm", size: 20 } },
    { id: newElId(), kind: "text", x: half.x + m, y: half.y + half.h - m - 12, w: half.w - m * 2, h: 12, rot: 0, opacity: 1, text: "", role: "from", style: { ...DEFAULT_TEXT_STYLE, font: "Charm", size: 13, align: "right", valign: "bottom" } },
  ];
  return { v: 1, w, h, bg: { color: "#fffdf8", image: null, fit: "cover" }, els: [], fold, inside: { bg: { color: "#ffffff", image: null, fit: "cover" }, els: inEls } };
}

// ─── สติ๊กเกอร์ในตัว (ข้อ 9) ───

const sv = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
export const STICKERS: { key: string; label: string; svg: string }[] = [
  { key: "heart", label: "หัวใจ", svg: sv('<path d="M50 88 L14 52 A20 20 0 0 1 50 22 A20 20 0 0 1 86 52 Z" fill="#E24B4A"/>') },
  { key: "heart-line", label: "หัวใจเส้น", svg: sv('<path d="M50 86 L15 51 A19 19 0 0 1 50 23 A19 19 0 0 1 85 51 Z" fill="none" stroke="#D4537E" stroke-width="5" stroke-linejoin="round"/>') },
  { key: "hearts", label: "หัวใจคู่", svg: sv('<path d="M38 78 L12 52 A14 14 0 0 1 38 30 A14 14 0 0 1 64 52 Z" fill="#F09595"/><path d="M66 70 L46 50 A11 11 0 0 1 66 33 A11 11 0 0 1 86 50 Z" fill="#E24B4A"/>') },
  { key: "bow", label: "โบว์", svg: sv('<path d="M50 50 L12 26 Q6 50 12 74 Z" fill="#D4537E"/><path d="M50 50 L88 26 Q94 50 88 74 Z" fill="#D4537E"/><path d="M46 54 L36 92 L44 88 L50 96 L52 56 Z" fill="#993556"/><circle cx="50" cy="50" r="10" fill="#993556"/>') },
  { key: "balloon", label: "ลูกโป่ง", svg: sv('<ellipse cx="50" cy="38" rx="24" ry="30" fill="#EF9F27"/><path d="M46 68 L54 68 L50 74 Z" fill="#BA7517"/><path d="M50 74 Q44 86 52 98" stroke="#854F0B" stroke-width="2" fill="none"/>') },
  { key: "balloons", label: "ลูกโป่งช่อ", svg: sv('<ellipse cx="32" cy="34" rx="16" ry="20" fill="#85B7EB"/><ellipse cx="66" cy="30" rx="16" ry="20" fill="#F09595"/><ellipse cx="50" cy="48" rx="16" ry="20" fill="#FAC775"/><path d="M32 54 L50 96 M66 50 L50 96 M50 68 L50 96" stroke="#5F5E5A" stroke-width="1.5" fill="none"/>') },
  { key: "star", label: "ดาว", svg: sv('<path d="M50 6 L62 38 L96 38 L68 58 L79 92 L50 71 L21 92 L32 58 L4 38 L38 38 Z" fill="#EFC23F"/>') },
  { key: "sparkle", label: "ประกาย", svg: sv('<path d="M50 4 Q55 45 96 50 Q55 55 50 96 Q45 55 4 50 Q45 45 50 4 Z" fill="#FAC775"/>') },
  { key: "flower", label: "ดอกไม้", svg: sv('<g fill="#ED93B1"><circle cx="50" cy="26" r="16"/><circle cx="74" cy="44" r="16"/><circle cx="65" cy="72" r="16"/><circle cx="35" cy="72" r="16"/><circle cx="26" cy="44" r="16"/></g><circle cx="50" cy="52" r="12" fill="#FAC775"/>') },
  { key: "cake", label: "เค้ก", svg: sv('<rect x="18" y="52" width="64" height="36" rx="4" fill="#F4C0D1"/><rect x="18" y="52" width="64" height="10" fill="#ED93B1"/><rect x="47" y="28" width="6" height="22" fill="#85B7EB"/><path d="M50 14 Q56 22 50 28 Q44 22 50 14 Z" fill="#EF9F27"/>') },
  { key: "gift", label: "กล่องของขวัญ", svg: sv('<rect x="14" y="40" width="72" height="50" rx="3" fill="#5DCAA5"/><rect x="10" y="30" width="80" height="14" rx="2" fill="#1D9E75"/><rect x="45" y="30" width="10" height="60" fill="#E24B4A"/><path d="M50 30 Q34 8 26 22 Q24 30 50 30 Q76 30 74 22 Q66 8 50 30 Z" fill="#E24B4A"/>') },
  { key: "crown", label: "มงกุฎ", svg: sv('<path d="M12 74 L18 30 L36 52 L50 22 L64 52 L82 30 L88 74 Z" fill="#EFC23F"/><rect x="12" y="74" width="76" height="10" fill="#BA7517"/>') },
  { key: "leaf", label: "ใบไม้", svg: sv('<path d="M20 84 Q16 30 78 16 Q84 72 20 84 Z" fill="#97C459"/><path d="M22 82 Q46 54 72 22" stroke="#3B6D11" stroke-width="2.5" fill="none"/>') },
  { key: "confetti", label: "พลุกระดาษ", svg: sv('<g><rect x="14" y="20" width="8" height="14" fill="#E24B4A" transform="rotate(20 18 27)"/><rect x="70" y="16" width="8" height="14" fill="#378ADD" transform="rotate(-25 74 23)"/><circle cx="46" cy="18" r="5" fill="#EFC23F"/><rect x="28" y="62" width="8" height="14" fill="#1D9E75" transform="rotate(-30 32 69)"/><circle cx="76" cy="64" r="6" fill="#D4537E"/><rect x="52" y="44" width="8" height="14" fill="#EF9F27" transform="rotate(40 56 51)"/><circle cx="18" cy="86" r="4" fill="#7F77DD"/></g>') },
];
export const stickerByKey = (key: string) => STICKERS.find((s) => s.key === key) ?? null;
export const stickerDataUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/** แปลง src ของชิ้นรูปเป็นลิงก์ · r2ToUrl = ฟังก์ชันจากฝั่งที่เรียก (lib/r2-image) */
export function resolveSrc(src: string | null | undefined, r2ToUrl: (key: string) => string | null): string | null {
  if (!src) return null;
  if (src.startsWith("sticker:")) { const s = stickerByKey(src.slice(8)); return s ? stickerDataUrl(s.svg) : null; }
  if (src.startsWith("r2:")) return r2ToUrl(src.slice(3));
  if (src.startsWith("data:image/")) return src;
  return null;
}

// ─── ตรวจ/ทำความสะอาดข้อมูล ───

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, d: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : d;
};
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : d);
const okSrc = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  if (/^sticker:[a-z0-9-]{1,40}$/.test(v)) return v;
  if (/^r2:[\w./\-%:]{1,400}$/.test(v) && !v.includes("..")) return v;
  return null;
};
let seq = 0;
export function newElId(): string {
  seq = (seq + 1) % 100000;
  return `e${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export const DEFAULT_TEXT_STYLE: CardTextStyle = {
  font: DEFAULT_FONT, size: 18, color: "#3f3a33", bold: false, italic: false, underline: false,
  align: "center", valign: "middle", lineHeight: 1.35, letterSpacing: 0,
};

export function cleanStyle(raw: unknown): CardTextStyle {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const font = typeof r.font === "string" && (findCardFont(r.font) || /^upload:[0-9a-f-]{36}$/i.test(r.font)) ? r.font : DEFAULT_FONT;
  return {
    font,
    size: num(r.size, DEFAULT_TEXT_STYLE.size, FONT_SIZE_MIN, FONT_SIZE_MAX),
    color: hex(r.color, DEFAULT_TEXT_STYLE.color),
    bold: r.bold === true,
    italic: r.italic === true,
    underline: r.underline === true,
    align: r.align === "left" || r.align === "right" ? r.align : "center",
    valign: r.valign === "top" || r.valign === "bottom" ? r.valign : "middle",
    lineHeight: num(r.lineHeight, DEFAULT_TEXT_STYLE.lineHeight, 0.8, 3),
    letterSpacing: num(r.letterSpacing, 0, -2, 10),
  };
}

export function cleanEl(raw: unknown, doc: { w: number; h: number }): CardEl | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind === "text" || r.kind === "image" || r.kind === "shape" ? r.kind : null;
  if (!kind) return null;
  const big = Math.max(doc.w, doc.h) * 3;
  const base: CardEl = {
    id: typeof r.id === "string" && /^[\w-]{1,40}$/.test(r.id) ? r.id : newElId(),
    kind,
    x: num(r.x, 0, -big, big), y: num(r.y, 0, -big, big),
    w: num(r.w, 20, 1, big), h: num(r.h, 10, kind === "shape" ? 0 : 1, big),
    rot: num(r.rot, 0, -360, 360),
    opacity: num(r.opacity, 1, 0, 1),
  };
  if (r.locked === true) base.locked = true;
  if (r.hidden === true) base.hidden = true;
  if (kind === "text") {
    base.text = typeof r.text === "string" ? r.text.slice(0, CARD_TEXT_MAX) : "";
    base.role = r.role === "message" || r.role === "to" || r.role === "from" ? r.role : null;
    base.style = cleanStyle(r.style);
  } else if (kind === "image") {
    const src = okSrc(r.src);
    if (!src) return null;
    base.src = src;
    base.fit = r.fit === "cover" ? "cover" : "contain";
    if (r.flipX === true) base.flipX = true;
  } else {
    base.shape = r.shape === "ellipse" || r.shape === "line" ? r.shape : "rect";
    base.fill = typeof r.fill === "string" && HEX.test(r.fill) ? r.fill.toLowerCase() : "";
    base.stroke = typeof r.stroke === "string" && HEX.test(r.stroke) ? r.stroke.toLowerCase() : "";
    base.strokeW = num(r.strokeW, 0.5, 0, 20);
    base.radius = num(r.radius, 0, 0, 100);
  }
  return base;
}

/** ข้อมูลจากที่เก็บ/ฟอร์ม → CardDoc ที่ถูกต้องเสมอ (ค่าผิด = ใช้ค่าตั้งต้น · ชิ้นเสีย = ตัดทิ้ง) */
export function cleanDoc(raw: unknown): CardDoc {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const w = num(r.w, 148, CARD_MIN_MM, CARD_MAX_MM);
  const h = num(r.h, 105, CARD_MIN_MM, CARD_MAX_MM);
  const bgr = (r.bg && typeof r.bg === "object" ? r.bg : {}) as Record<string, unknown>;
  const cleanEls = (arr: unknown) => (Array.isArray(arr) ? arr : []).slice(0, CARD_MAX_ELS).map((e) => cleanEl(e, { w, h })).filter((e): e is CardEl => !!e);
  const cleanBg = (raw: unknown, d: string): CardBg => {
    const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return { color: hex(b.color, d), image: okSrc(b.image), fit: b.fit === "contain" ? "contain" : "cover" };
  };
  const els = cleanEls(r.els);
  const fold: CardFold | null = r.fold === "side" || r.fold === "top" ? r.fold : null;
  const ir = (r.inside && typeof r.inside === "object" ? r.inside : {}) as Record<string, unknown>;
  const inside = fold ? { bg: cleanBg(ir.bg, "#ffffff"), els: cleanEls(ir.els) } : null;
  const ids = new Set<string>();
  for (const e of [...els, ...(inside?.els ?? [])]) { if (ids.has(e.id)) e.id = newElId(); ids.add(e.id); }
  const doc: CardDoc = { v: 1, w, h, bg: cleanBg(bgr, "#fffdf8"), els };
  if (fold) { doc.fold = fold; doc.inside = inside; }
  return doc;
}

// ─── สร้างชิ้นใหม่ ───

export function newTextEl(doc: CardDoc, text = "พิมพ์ข้อความ", style: Partial<CardTextStyle> = {}): CardEl {
  const w = Math.round(doc.w * 0.7), h = Math.round(Math.max(12, doc.h * 0.18));
  return { id: newElId(), kind: "text", x: Math.round((doc.w - w) / 2), y: Math.round((doc.h - h) / 2), w, h, rot: 0, opacity: 1, text, role: null, style: { ...DEFAULT_TEXT_STYLE, size: 16, font: "Sarabun", ...style } };
}
export function newImageEl(doc: CardDoc, src: string, ratio = 1): CardEl {
  const w = Math.round(Math.min(doc.w, doc.h) * 0.35);
  const h = Math.max(1, Math.round(w / (ratio > 0 ? ratio : 1)));
  return { id: newElId(), kind: "image", x: Math.round((doc.w - w) / 2), y: Math.round((doc.h - h) / 2), w, h, rot: 0, opacity: 1, src, fit: "contain" };
}
export function newShapeEl(doc: CardDoc, shape: CardShape): CardEl {
  const w = Math.round(doc.w * 0.4), h = shape === "line" ? 0 : Math.round(doc.h * 0.3);
  return { id: newElId(), kind: "shape", x: Math.round((doc.w - w) / 2), y: Math.round((doc.h - h) / 2), w, h, rot: 0, opacity: 1, shape, fill: shape === "line" ? "" : "#f4c0d1", stroke: shape === "line" ? "#993556" : "", strokeW: 0.6, radius: shape === "rect" ? 3 : 0 };
}

/** เปลี่ยนขนาดการ์ด — ชิ้นทุกชิ้นย่อ/ขยายตามสัดส่วน (ข้อความย่อตามด้านที่ย่อมากกว่า) */
export function resizeDoc(doc: CardDoc, w: number, h: number): CardDoc {
  const nw = num(w, doc.w, CARD_MIN_MM, CARD_MAX_MM), nh = num(h, doc.h, CARD_MIN_MM, CARD_MAX_MM);
  const kx = nw / doc.w, ky = nh / doc.h, k = Math.min(kx, ky);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    ...doc, w: nw, h: nh,
    els: doc.els.map((e) => ({
      ...e, x: r2(e.x * kx), y: r2(e.y * ky), w: r2(e.w * kx), h: r2(e.h * ky),
      ...(e.style ? { style: { ...e.style, size: Math.max(FONT_SIZE_MIN, r2(e.style.size * k)) } } : {}),
    })),
  };
}

// ─── ข้อความตาม role (แบบ A) ───

export function roleTexts(doc: CardDoc): CardTexts {
  const get = (role: CardRole) => allEls(doc).find((e) => e.kind === "text" && e.role === role)?.text ?? "";
  return { message: get("message"), to: get("to"), from: get("from") };
}
export const hasRole = (doc: CardDoc, role: CardRole) => allEls(doc).some((e) => e.kind === "text" && e.role === role);
/** แม่แบบนี้ใส่ข้อความจากลูกค้าได้ไหม (มีชิ้น "ข้อความจากลูกค้า") — ป้าย ใส่ข้อความได้ / ข้อความตายตัว */
export const acceptsMessage = (doc: CardDoc) => hasRole(doc, "message");

/** ใส่ข้อความลงชิ้นที่มี role · การ์ดไม่มีชิ้น message = เพิ่มให้กลางการ์ด (การ์ดพับ = ด้านในครึ่งหลัง) · ถึง/จาก ว่าง = ปล่อยว่าง */
export function fillTexts(doc: CardDoc, t: Partial<CardTexts>): CardDoc {
  const fill = (list: CardEl[]) => list.map((e) => (e.kind === "text" && e.role && t[e.role] !== undefined ? { ...e, text: String(t[e.role]).slice(0, CARD_TEXT_MAX) } : e));
  const out: CardDoc = { ...doc, els: fill(doc.els), ...(isFolded(doc) && doc.inside ? { inside: { ...doc.inside, els: fill(doc.inside.els) } } : {}) };
  if (t.message !== undefined && !hasRole(doc, "message")) {
    const text = String(t.message).slice(0, CARD_TEXT_MAX);
    if (isFolded(out)) {
      const half = out.fold === "side" ? { x: out.w / 2, y: 0, w: out.w / 2, h: out.h } : { x: 0, y: out.h / 2, w: out.w, h: out.h / 2 };
      const el: CardEl = { id: newElId(), kind: "text", x: half.x + 10, y: half.y + 14, w: half.w - 20, h: half.h - 28, rot: 0, opacity: 1, text, role: "message", style: { ...DEFAULT_TEXT_STYLE, font: DEFAULT_FONT, size: 20 } };
      out.inside = { bg: out.inside?.bg ?? { color: "#ffffff", image: null, fit: "cover" }, els: [...(out.inside?.els ?? []), el] };
    } else {
      const el = newTextEl(doc, text, { font: DEFAULT_FONT, size: 20 });
      el.role = "message";
      out.els = [...out.els, el];
    }
  }
  return out;
}

// ─── แม่แบบเริ่มต้น (ใช้ได้ทันที ยังไม่ต้องออกแบบ · กด "ทำสำเนาไปแก้" = เก็บลงฐานข้อมูล) ───

export const BUILTIN_PREFIX = "builtin:";
const T = (o: Omit<Partial<CardEl>, "style"> & { text: string; style: Partial<CardTextStyle> }): CardEl => ({
  id: newElId(), kind: "text", x: 0, y: 0, w: 10, h: 10, rot: 0, opacity: 1, role: null, ...o, style: { ...DEFAULT_TEXT_STYLE, ...o.style },
});
const I = (o: Partial<CardEl> & { src: string }): CardEl => ({ id: newElId(), kind: "image", x: 0, y: 0, w: 10, h: 10, rot: 0, opacity: 1, fit: "contain", ...o });

export const GROUP_GENERAL = "การ์ดทั่วไป";
export const GROUP_BDAY = "การ์ดวันเกิด";

export function builtinTemplates(): { id: string; name: string; group: string; doc: CardDoc }[] {
  const foldBday = (() => {
    const d = newFoldedDoc("side");   // 210×148 · ซ้าย = หลังการ์ด · ขวา = ปกหน้า
    d.bg = { color: "#fff4f1", image: null, fit: "cover" };
    d.els = [
      T({ x: 125, y: 40, w: 70, h: 26, text: "Happy Birthday", style: { font: "Great Vibes", size: 36, color: "#9b2c4a" } }),
      I({ x: 118, y: 8, w: 26, h: 30, rot: -10, src: "sticker:balloons" }),
      I({ x: 176, y: 10, w: 22, h: 22, src: "sticker:confetti" }),
      I({ x: 150, y: 86, w: 24, h: 26, src: "sticker:cake" }),
      I({ x: 46, y: 128, w: 13, h: 13, src: "sticker:heart" }),
    ];
    return d;
  })();
  return [
    {
      id: `${BUILTIN_PREFIX}plain`, name: "การ์ดเรียบ", group: GROUP_GENERAL,
      doc: { v: 1, w: 148, h: 105, bg: { color: "#fffdf8", image: null, fit: "cover" }, els: [
        T({ x: 14, y: 8, w: 70, h: 12, text: "", role: "to", style: { font: "Charm", size: 13, align: "left", valign: "top" } }),
        T({ x: 14, y: 24, w: 120, h: 58, text: "", role: "message", style: { font: "Charm", size: 24 } }),
        T({ x: 64, y: 85, w: 70, h: 12, text: "", role: "from", style: { font: "Charm", size: 13, align: "right", valign: "bottom" } }),
      ] },
    },
    {
      id: `${BUILTIN_PREFIX}bday`, name: "วันเกิด", group: GROUP_BDAY,
      doc: { v: 1, w: 148, h: 105, bg: { color: "#fff4f1", image: null, fit: "cover" }, els: [
        I({ x: 8, y: 6, w: 26, h: 30, rot: -10, src: "sticker:balloons" }),
        I({ x: 120, y: 78, w: 18, h: 18, rot: 12, src: "sticker:heart" }),
        I({ x: 118, y: 8, w: 22, h: 22, src: "sticker:confetti" }),
        T({ x: 24, y: 18, w: 100, h: 22, text: "Happy Birthday", style: { font: "Great Vibes", size: 34, color: "#9b2c4a" } }),
        T({ x: 18, y: 44, w: 112, h: 38, text: "", role: "message", style: { font: "Charm", size: 18, color: "#5f5e5a" } }),
        T({ x: 60, y: 86, w: 56, h: 11, text: "", role: "from", style: { font: "Charm", size: 12, color: "#9b2c4a", align: "right", valign: "bottom" } }),
      ] },
    },
    {
      id: `${BUILTIN_PREFIX}lux`, name: "หรูเข้ม", group: GROUP_GENERAL,
      doc: { v: 1, w: 148, h: 105, bg: { color: "#1f2a44", image: null, fit: "cover" }, els: [
        { id: newElId(), kind: "shape", x: 6, y: 6, w: 136, h: 93, rot: 0, opacity: 1, shape: "rect", fill: "", stroke: "#e8d3a2", strokeW: 0.5, radius: 2 },
        T({ x: 14, y: 14, w: 120, h: 50, text: "", role: "message", style: { font: "Playfair Display", size: 22, color: "#ffffff" } }),
        I({ x: 66, y: 68, w: 16, h: 14, src: "sticker:bow" }),
        T({ x: 34, y: 84, w: 80, h: 10, text: "", role: "from", style: { font: "Cormorant Garamond", size: 12, color: "#e8d3a2" } }),
      ] },
    },
    { id: `${BUILTIN_PREFIX}bday-fold`, name: "วันเกิด พับ A6", group: GROUP_BDAY, doc: foldBday },
  ].map((t) => ({ ...t, doc: cleanDoc(t.doc) }));
}
/** แม่แบบนี้เป็น "การ์ดพิเศษ" ไหม — ติ๊กไว้ใช้ค่านั้น · ยังไม่ตั้ง = การ์ดพับถือเป็นพิเศษ (เจ้าของเลือก 2026-11-25 รอบ 5 ข้อ 3) */
export const isSpecialTemplate = (t: { is_special?: boolean | null; doc: CardDoc }): boolean => (typeof t.is_special === "boolean" ? t.is_special : isFolded(t.doc));
export const isBuiltinId = (id: string | null | undefined) => !!id && id.startsWith(BUILTIN_PREFIX);

/** แม่แบบ 1 ใบในรายการ (ของที่ออกแบบเอง + ในตัว) — ใช้ทั้งหน้าตั้งค่าและหน้าเขียนการ์ด */
export type TemplateItem = { id: string; name: string; group: string; sort_order: number; builtin: boolean; replaces_builtin: string | null; doc: CardDoc };

/**
 * รวมแม่แบบเป็นกลุ่ม (ข้อ 2) — ของที่ออกแบบเองเรียงตาม sort_order · แม่แบบในตัวต่อท้ายกลุ่ม · ในตัวที่ถูกแก้แล้ว = ซ่อน (ใช้ฉบับแก้แทน)
 * คืน [{ group, items }] เรียงกลุ่มตามลำดับที่เจอครั้งแรก (การ์ดทั่วไป/วันเกิด ก่อน ถ้าไม่มีลำดับอื่น)
 */
export function groupTemplates<T extends { id: string; group?: string | null; sort_order?: number | null; builtin?: boolean; replaces_builtin?: string | null }>(own: T[], builtins: T[]): { group: string; items: T[] }[] {
  const replaced = new Set(own.map((t) => t.replaces_builtin).filter(Boolean) as string[]);
  const list = [
    ...[...own].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    ...builtins.filter((b) => !replaced.has(b.id)),
  ];
  const map = new Map<string, T[]>();
  for (const t of list) { const g = (t.group ?? "").trim() || "ไม่มีกลุ่ม"; map.set(g, [...(map.get(g) ?? []), t]); }
  return [...map.entries()].map(([group, items]) => ({ group, items }));
}

// ─── หมายเหตุลูกค้า: อ่าน · คัดแยก · เดาข้อความ (ข้อ 1) ───

type RawLike = { shopee?: { message_to_seller?: unknown }; tiktok?: { buyer_message?: unknown }; lazada?: { remarks?: unknown; gift_message?: unknown }; buyer_message?: unknown; note?: unknown; gift_message?: unknown } | null | undefined;
/** ข้อความลูกค้าในออเดอร์ (platform_orders.raw) — Shopee message_to_seller · TikTok buyer_message · Lazada remarks/gift_message · สร้างเอง note */
export function buyerNoteOf(raw: unknown): string | null {
  const r = raw as RawLike;
  const cands = [r?.shopee?.message_to_seller, r?.tiktok?.buyer_message, r?.lazada?.gift_message, r?.lazada?.remarks, r?.gift_message, r?.buyer_message, r?.note];
  for (const c of cands) if (typeof c === "string" && c.trim()) return c.trim();
  return null;
}

const CARD_RE = /การ์ด|card|อวยพร|ข้อความ(?:แนบ|ถึง)|ห่อ|ของขวัญ|gift|ริบบิ้น|ribbon|wrap|วันเกิด|birthday|hbd|ครบรอบ|anniversary|valentine|วาเลนไทน์|ขอบคุณ(?:แม่|พ่อ)|congrat|ยินดี(?:ด้วย|กับ)|รับปริญญา|graduat/i;
const ENGRAVE_RE = /สลัก|สลีก|ปั๊ม|ปั้ม|ปัก(?:ชื่อ)?|เลเซอร์|laser|engrav|emboss|พิมพ์(?:ชื่อ|คำ|ว่า)|พิมพ์\s*[A-Za-z]|ใส่ชื่อ|ชื่อ\s*[:：]|ฟอนต์|ฟร้อน|ฟ้อน|font|ตัวพิมพ์(?:ใหญ่|เล็ก)|พิมพ์จม/i;
/** ชื่อล้วนสั้น ๆ (ไม่มีภาษาไทย) เช่น "Pasit" "KARUNA.M" "MN🤍" = ลูกค้าส่งชื่อมาสลัก */
const NAME_ONLY_RE = /^[\p{L}\p{N}][\p{L}\p{N} .&'’\-_+]{0,28}[\p{L}\p{N}.]?\s*[\p{Extended_Pictographic}❤️]*$/u;
const THAI_RE = /[฀-๿]/;

/** คัดแยกหมายเหตุ: ขอการ์ด/ห่อของขวัญ · ขอสลักชื่อ (มีได้ทั้งคู่) · ไม่ใช่ทั้งคู่ = "อื่น ๆ" */
export function classifyNote(note: string | null | undefined): { card: boolean; engrave: boolean } {
  const s = (note ?? "").trim();
  if (!s) return { card: false, engrave: false };
  const card = CARD_RE.test(s);
  const firstLine = s.split(/\n/)[0].trim();
  const engrave = ENGRAVE_RE.test(s) || (!THAI_RE.test(firstLine) && NAME_ONLY_RE.test(firstLine) && !/^(hbd|happy|thank|love)/i.test(firstLine));
  return { card, engrave };
}

/** เดาข้อความบนการ์ดจากหมายเหตุ (คนแก้ต่อได้เสมอ) · "รบกวนเขียนการ์ด Happy Birthday ให้ด้วยนะคะ" → "Happy Birthday" */
export function suggestMessage(note: string | null | undefined): string {
  const s = (note ?? "").trim();
  if (!s) return "";
  const quoted = s.match(/["“”'‘’「]([^"“”'‘’」]{2,200})["“”'‘’」]/);
  if (quoted) return quoted[1].trim();
  const after = s.match(/(?:การ์ด|card|ข้อความ)\s*(?:ว่า|คำว่า|เขียนว่า|:|：)?\s*(.+?)(?:\s*(?:ให้(?:ด้วย|หน่อย|ที)?|ด้วย(?:นะ)?|หน่อย|นะ(?:คะ|ครับ|ค่ะ)?|ค่ะ|คะ|ครับ|จ้า|ขอบคุณ)[\s\S]*)?$/i);
  if (after && after[1].trim().length >= 2 && !/^(ห่อ|ด้วย|ให้)/.test(after[1].trim())) return after[1].trim().replace(/[\s,.!]+$/, "");
  if (/วันเกิด|birthday|hbd/i.test(s)) return "Happy Birthday";
  if (/ครบรอบ|anniversary/i.test(s)) return "Happy Anniversary";
  if (/วาเลนไทน์|valentine/i.test(s)) return "Happy Valentine's Day";
  return "";   // "ขอบคุณค่ะ" เป็นคำสุภาพ ไม่เดาเป็นการ์ดขอบคุณ
}

/** ชื่อที่จะสลัก (ส่งต่อไปคำสั่งสลักชื่อ) — "สลักชื่อ : KORN" → "KORN" · ชื่อล้วน → ทั้งบรรทัด */
export function extractEngraveText(note: string | null | undefined): string {
  const s = (note ?? "").trim();
  if (!s) return "";
  const quoted = s.match(/["“”'‘’]([^"“”'‘’]{1,40})["“”'‘’]/);
  if (quoted) return quoted[1].trim();
  const m = s.match(/(?:สลัก(?:ชื่อ)?|สลีก(?:ชื่อ)?|ปั๊ม(?:ชื่อ)?|ปั้ม(?:ชื่อ)?|ปัก(?:ชื่อ)?|พิมพ์(?:ชื่อ|คำว่า|ว่า)?|ใส่ชื่อ(?:ว่า)?|ชื่อ)\s*(?:คำว่า|ว่า)?\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9 .&'’\-_\p{Extended_Pictographic}️]{0,30})/u);
  if (m) return m[1].trim();
  const first = s.split(/\n/)[0].trim();
  if (!THAI_RE.test(first)) return first.slice(0, 40);
  // "jay(ตัวพิมพ์เล็กทั้งหมด)" → "jay"
  return first.match(/^([A-Za-z0-9][A-Za-z0-9 .&'’\-_]{0,30}?)\s*[(（]/)?.[1].trim() ?? "";
}

// ─── วาดการ์ดเป็น HTML (หน้าพิมพ์ / รูป PNG) — สูตรเดียวกับตัวออกแบบบนจอ ───

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** กรอบชิ้น (หน่วยตามที่ส่ง เช่น mm หรือ px) — ตัวออกแบบใช้สูตรเดียวกัน */
export function elBox(e: CardEl, k = 1): { left: number; top: number; width: number; height: number; transform: string } {
  const t = [e.rot ? `rotate(${e.rot}deg)` : "", e.flipX ? "scaleX(-1)" : ""].filter(Boolean).join(" ");
  return { left: r3(e.x * k), top: r3(e.y * k), width: r3(e.w * k), height: r3(e.h * k), transform: t || "none" };
}
/** สไตล์ข้อความ (font-size หน่วยเดียวกับ k: มม. × k) */
export function textCss(s: CardTextStyle, k = 1): Record<string, string | number> {
  return {
    fontFamily: fontStack(s.font),
    fontSize: r3(s.size * PT_MM * k),
    lineHeight: s.lineHeight,
    letterSpacing: r3(s.letterSpacing * k),
    color: s.color,
    fontWeight: s.bold ? 700 : 400,
    fontStyle: s.italic ? "italic" : "normal",
    textDecoration: s.underline ? "underline" : "none",
    textAlign: s.align,
    justifyContent: s.valign === "top" ? "flex-start" : s.valign === "bottom" ? "flex-end" : "center",
  };
}

const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
function cssStr(o: Record<string, string | number>, unit: string): string {
  const px = new Set(["fontSize", "letterSpacing", "left", "top", "width", "height", "borderRadius", "borderWidth"]);
  return Object.entries(o).map(([k, v]) => `${kebab(k)}:${typeof v === "number" && px.has(k) ? `${v}${unit}` : v}`).join(";");
}

/**
 * การ์ด 1 ใบเป็น HTML ขนาดจริง (มม.) — ใช้ในหน้าพิมพ์และแปลงเป็นรูป
 * unit "mm" = ขนาดจริง · ส่ง pxPerMm = วาดเป็น px (แปลงเป็น PNG)
 */
export function cardHtml(doc: CardDoc, opts: { r2ToUrl: (key: string) => string | null; pxPerMm?: number }): string {
  const k = opts.pxPerMm ?? 1;
  const unit = opts.pxPerMm ? "px" : "mm";
  const bgUrl = resolveSrc(doc.bg.image, opts.r2ToUrl);
  const parts: string[] = [];
  if (bgUrl) parts.push(`<img src="${esc(bgUrl)}" alt="" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:${doc.bg.fit}"/>`);
  for (const e of doc.els) {
    if (e.hidden) continue;
    const b = elBox(e, k);
    const box = cssStr({ position: "absolute", left: b.left, top: b.top, width: b.width, height: b.height, transform: b.transform, opacity: e.opacity } as Record<string, string | number>, unit);
    if (e.kind === "text" && e.style) {
      const t = textCss(e.style, k);
      const inner = cssStr({ display: "flex", flexDirection: "column", width: "100%", height: "100%", whiteSpace: "pre-wrap", overflowWrap: "anywhere", ...t } as Record<string, string | number>, unit);
      parts.push(`<div style="${box}"><div style="${inner}"><span style="display:block">${esc(e.text ?? "")}</span></div></div>`);
    } else if (e.kind === "image") {
      const url = resolveSrc(e.src, opts.r2ToUrl);
      if (url) parts.push(`<img src="${esc(url)}" alt="" style="${box};object-fit:${e.fit ?? "contain"}"/>`);
    } else if (e.kind === "shape") {
      const sw = r3((e.strokeW ?? 0) * k);
      if (e.shape === "line") {
        parts.push(`<div style="${box};height:0;border-top:${Math.max(sw, 0.1)}${unit} solid ${e.stroke || "#000"}"></div>`);
      } else {
        const radius = e.shape === "ellipse" ? "50%" : `${r3((e.radius ?? 0) * k)}${unit}`;
        parts.push(`<div style="${box};box-sizing:border-box;background:${e.fill || "transparent"};border:${e.stroke ? `${sw}${unit} solid ${e.stroke}` : "none"};border-radius:${radius}"></div>`);
      }
    }
  }
  return `<div class="gcd" style="position:relative;overflow:hidden;width:${r3(doc.w * k)}${unit};height:${r3(doc.h * k)}${unit};background:${doc.bg.color};-webkit-print-color-adjust:exact;print-color-adjust:exact">${parts.join("")}</div>`;
}

/** @font-face ของฟอนต์ที่อัปโหลด (ลิงก์ไฟล์ = /api/order-gift-cards/fonts/<id>) */
export function uploadFontFaces(fonts: string[], urlOf: (id: string) => string = (id) => `/api/order-gift-cards/fonts/${id}`): string {
  return fonts.filter(isUploadFont).map((f) => {
    const id = f.slice(7);
    return `@font-face{font-family:'${uploadFontFamily(id)}';src:url('${urlOf(id)}');font-display:block}`;
  }).join("");
}

export type CardPrintMode = "sheet" | "single";

/**
 * เอกสารพิมพ์การ์ดหลายใบ (ข้อ 3) — sheet = เรียงบน A4 มีเส้นประให้ตัด (สูตรจัดวางเดียวกับการ์ดเว็บร้าน sheetGrid)
 *   single = 1 ใบต่อแผ่น กระดาษขนาดการ์ด · การ์ดคนละขนาด = แยกหน้ากันตามขนาด
 */
export function cardsPrintHtml(docs: CardDoc[], mode: CardPrintMode, opts: { r2ToUrl: (key: string) => string | null; title?: string; /** ใส่โดเมนหน้าฟอนต์ที่อัปโหลด (หน้าต่างพิมพ์ใหม่ใช้ลิงก์สั้นไม่ได้) */ origin?: string; /** การ์ดพับ: หมุนด้านใน 180° (กรณีพิมพ์ออกมากลับหัว) */ flipInside?: boolean }): string {
  const groups = new Map<string, CardDoc[]>();
  for (const d of docs.filter((x) => !isFolded(x))) { const key = `${d.w}x${d.h}`; groups.set(key, [...(groups.get(key) ?? []), d]); }
  const pages: string[] = [];
  const pageCss: string[] = [];
  // การ์ดพับ (A5 พับครึ่ง) — ด้านนอกทุกใบก่อน แล้วด้านในทุกใบ ลำดับเดียวกัน → พิมพ์ด้านนอกเสร็จ กลับกระดาษทั้งปึก แล้วพิมพ์ด้านในต่อ
  const folded = docs.filter(isFolded);
  if (folded.length) {
    pageCss.push(`.fo{position:relative}.fo .cut{position:absolute;left:0;top:0;outline:0.25mm dashed #b8b8b8}.fo .fl{position:absolute;pointer-events:none}`);
    for (const face of ["out", "in"] as CardFace[]) {
      for (const d of folded) {
        const f = faceDoc(d, face);
        const card = cardHtml(f, { r2ToUrl: opts.r2ToUrl });
        const flip = face === "in" && opts.flipInside ? `transform:rotate(180deg);transform-origin:${d.w / 2}mm ${d.h / 2}mm;` : "";
        const inner = `<div class="cut" style="width:${d.w}mm;height:${d.h}mm;${flip}">${card}</div>`;
        pages.push(mode === "sheet"
          ? `<div class="pg fo" data-size="a4" style="width:210mm;height:297mm">${inner}</div>`
          : `<div class="pg fo" data-size="${d.w}x${d.h}" style="width:${d.w}mm;height:${d.h}mm">${inner}</div>`);
      }
    }
  }
  let gi = 0;
  for (const [, list] of groups) {
    const { w, h } = list[0];
    const g = sheetGrid({ size: { preset: "custom", w, h } } as GiftCardConfig);
    const useSheet = mode === "sheet" && g.cols > 0 && g.rows > 0;
    const per = useSheet ? g.cols * g.rows : 1;
    const cls = `g${gi++}`;
    if (useSheet) {
      const cw = g.rotate ? h : w, ch = g.rotate ? w : h;
      pageCss.push(`.${cls}{width:210mm;height:297mm;padding:8mm;display:grid;grid-template-columns:repeat(${g.cols},${cw}mm);grid-auto-rows:${ch}mm;gap:4mm;justify-content:center;align-content:start}.${cls} .cell{position:relative;width:${cw}mm;height:${ch}mm;outline:0.25mm dashed #b8b8b8}${g.rotate ? `.${cls} .rot{position:absolute;left:0;top:0;transform-origin:0 0;transform:translate(${h}mm,0) rotate(90deg)}` : ""}`);
    } else {
      pageCss.push(`.${cls}{width:${w}mm;height:${h}mm}.${cls} .cell{width:${w}mm;height:${h}mm}`);
    }
    for (let i = 0; i < list.length; i += per) {
      const cells = list.slice(i, i + per).map((d) => {
        const c = cardHtml(d, { r2ToUrl: opts.r2ToUrl });
        return useSheet && g.rotate ? `<div class="cell"><div class="rot">${c}</div></div>` : `<div class="cell">${c}</div>`;
      });
      pages.push(`<div class="pg ${cls}" data-size="${useSheet ? "a4" : `${w}x${h}`}">${cells.join("")}</div>`);
    }
  }
  const fonts = docFonts(docs);
  const href = googleFontsHref(fonts);
  // ขนาดกระดาษต่อหน้า: A4 หรือขนาดการ์ด (CSS named page)
  const named = [...new Set(pages.map((p) => p.match(/data-size="([^"]+)"/)?.[1] ?? "a4"))];
  const pageRules = named.map((n) => (n === "a4" ? `@page a4{size:A4 portrait;margin:0}.pg[data-size="a4"]{page:a4}` : `@page s${n.replace(/\./g, "_")}{size:${n.split("x")[0]}mm ${n.split("x")[1]}mm;margin:0}.pg[data-size="${n}"]{page:s${n.replace(/\./g, "_")}}`)).join("");
  const body = pages.length ? pages.join("") : `<p style="padding:20mm;font-family:sans-serif;color:#94a3b8;text-align:center">ไม่มีการ์ดที่ต้องพิมพ์</p>`;
  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"/><title>${esc(opts.title ?? "การ์ดของขวัญ")}</title>${href ? `<link rel="stylesheet" href="${href}"/>` : ""}<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap"/><style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}${uploadFontFaces(fonts, (id) => `${opts.origin ?? ""}/api/order-gift-cards/fonts/${id}`)}@media screen{body{background:#e2e8f0;padding:6mm 0}.pg{background:#fff;margin:0 auto 6mm;box-shadow:0 1px 4px rgba(0,0,0,.15)}}.pg{break-after:page}.pg:last-child{break-after:auto}${pageRules}${pageCss.join("")}</style></head><body>${body}</body></html>`;
}

/** ป้ายสถานะการ์ด */
export function cardStatus(c: { printed_at?: string | null; hand_written_at?: string | null } | null | undefined): { key: "none" | "draft" | "printed" | "written"; label: string; tone: "danger" | "accent" | "success" } {
  if (!c) return { key: "none", label: "ยังไม่เขียน", tone: "danger" };
  if (c.hand_written_at) return { key: "written", label: "เขียนมือแล้ว", tone: "success" };
  if (c.printed_at) return { key: "printed", label: "พิมพ์แล้ว", tone: "success" };
  return { key: "draft", label: "ร่างไว้", tone: "accent" };
}
