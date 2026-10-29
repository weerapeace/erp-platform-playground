/**
 * ของกลาง — นิยาม "บล็อก" (Section) ของหน้าเว็บร้าน (เก็บที่ shops.home_layout / store_pages.layout)
 *
 * ตั้งแต่เฟส Schema-Driven: ชนิดบล็อก ค่าเริ่มต้น การทำความสะอาดข้อมูล และการตรวจก่อนเผยแพร่
 * ทั้งหมด "อ่านจาก lib/website-schema.ts" — ไฟล์นี้เหลือแค่ชนิดข้อมูล (TypeScript) + ตัวแปลงที่ใช้ schema
 *
 * โครงเดิมในระบบเป็น array ของ { type, ...props } (ร้าน Pixiedustie ใช้ hero/product-grid ชุดเก่า)
 * บล็อกชนิดที่ schema ไม่รู้จักจะถูก "เก็บไว้ทั้งก้อนแบบไม่แตะ" เสมอ
 *
 * ใช้ที่: /api/website/layout · /api/website/pages · /api/public/storefront/* · UI ตัวจัดหน้า
 */
import {
  SECTION_SCHEMAS,
  SECTION_TYPES,
  blankChild,
  defaultForType,
  matchShowIf,
  newChildId,
  structuredCloneSafe,
  type ChildSpec,
  type FieldDef,
  type SectionMeta,
  type ValidationIssue,
} from "@/lib/website-schema";
import { sanitizeCustomHtml } from "@/lib/website-html";
import { sanitizeTranslations } from "@/lib/website-i18n";
import { sanitizeGradient, type GradientValue } from "@/lib/website-gradient";
import { CANVAS_COLORS, CANVAS_FONTS, CANVAS_SHAPES, CANVAS_WEIGHTS } from "@/lib/website-canvas";
import { normalizeFrameShape, normalizePatternSlots, normalizeShopPattern, SHOP_PATTERN_MODES, type ShopPattern, type ShopPatternMode } from "@/lib/website-frames";
import { cleanExpId } from "@/lib/website-web-stats";

export type { ValidationIssue };

export type BlockType =
  | "announcement"
  | "hero"
  | "two-tracks"
  | "categories"
  | "featured"
  | "products"
  | "faq"
  | "cta"
  | "rich-text"
  | "image"
  | "image-text"
  | "multicolumn"
  | "slideshow"
  | "newsletter"
  | "gallery"
  | "button"
  | "divider"
  | "video"
  | "steps"
  | "reviews"
  | "instagram"
  | "map"
  | "custom-html"
  | "spotlight"
  | "stats"
  | "personalize"
  | "canvas"
  | "timeline"
  | "countdown"
  | "lookbook"
  | "runway"
  | "scene"
  | "hover-reveal"
  | "logos"
  | "collections"
  | "fitcheck"
  | "beltbuilder"
  | "drop"
  | "doc"
  | "order-track"
  | "contact-form";

/** ซ่อน/แสดงแยกตามขนาดจอ */
export interface Visibility {
  desktop: boolean;
  tablet: boolean;
  mobile: boolean;
}

/**
 * ทุกค่าใช้ "auto" เป็นค่าเริ่มต้น = ปล่อยตามดีไซน์เดิมของบล็อกนั้น
 * สำคัญมาก: บล็อกที่สร้างไว้ก่อนมีแผงนี้ต้องหน้าตาไม่เปลี่ยนเลยแม้แต่นิดเดียว
 */
export type BlockSpacing = "auto" | "none" | "sm" | "md" | "lg";
/** ความกว้างเนื้อหา — narrow=แคบอ่านง่าย · full=เต็มจอ */
export type BlockWidth = "auto" | "narrow" | "full";
export type BlockAlign = "auto" | "left" | "center" | "right";
/** พื้นหลัง — อิงสีจากธีมร้าน (เปลี่ยนธีมแล้วบล็อกเปลี่ยนตาม) */
export type BlockBg = "auto" | "page" | "surface" | "brand" | "ink" | "custom" | "gradient" | "image";

export const BLOCK_SPACINGS: readonly BlockSpacing[] = ["auto", "none", "sm", "md", "lg"];
export const BLOCK_WIDTHS: readonly BlockWidth[] = ["auto", "narrow", "full"];
export const BLOCK_ALIGNS: readonly BlockAlign[] = ["auto", "left", "center", "right"];
export const BLOCK_BGS: readonly BlockBg[] = ["auto", "page", "surface", "brand", "ink", "custom", "gradient", "image"];

/**
 * 🖼 พื้นหลังรูปของ Section (bg = "image") — เว็บร้านวาดเป็นชั้นหลังเนื้อหา (globals.css "พื้นหลังรูปของ Section")
 * fx: zoom = ซูมเข้าออกช้า ๆ · pan = เลื่อนซ้ายขวา · float = ลอยขึ้นลง · parallax = เลื่อนจอแล้วรูปเลื่อนช้ากว่า
 * dim + tone = สีทับให้รูปจาง (ดำ = ตัวหนังสือสีอ่อนเอง · ขาว) · blur = เบลอรูป (px)
 */
export type BgImageFit = "cover" | "contain" | "repeat";
export type BgImagePos = "top" | "center" | "bottom";
export type BgImageFx = "none" | "zoom" | "pan" | "float" | "parallax";
export const BG_IMAGE_FITS: readonly BgImageFit[] = ["cover", "contain", "repeat"];
export const BG_IMAGE_POSES: readonly BgImagePos[] = ["top", "center", "bottom"];
export const BG_IMAGE_FXS: readonly BgImageFx[] = ["none", "zoom", "pan", "float", "parallax"];
export interface BlockBgImage {
  key: string | null;
  fit: BgImageFit;
  pos: BgImagePos;
  fx: BgImageFx;
  speed: "normal" | "slow" | "fast";
  /** สีทับ 0–90 % */
  dim: number;
  tone: "dark" | "light";
  /** เบลอ 0–20 px */
  blur: number;
}
export const DEFAULT_BG_IMAGE: BlockBgImage = { key: null, fit: "cover", pos: "center", fx: "none", speed: "normal", dim: 30, tone: "dark", blur: 0 };

/** ค่าที่ตั้งทับเฉพาะมือถือ — "auto" = ใช้ค่าเดียวกับคอม */
export interface BlockStyleMobile {
  padTop: BlockSpacing;
  padBottom: BlockSpacing;
  align: BlockAlign;
  /** ขนาดหัวข้อเฉพาะมือถือ ("auto" = ตามที่ตั้งของทุกจอ) */
  hSize: TextSize;
  /** ซ่อนตัวเล็กเหนือหัวข้อ (eyebrow) บนมือถือ */
  hideEyebrow: boolean;
  /** ซ่อนคำโปรยใต้หัวข้อบนมือถือ */
  hideSub: boolean;
}

/**
 * ตัวอักษรหัวข้อของ Section (แผง "🔤 ตัวอักษร") — "auto" = ตามเดิมของ Section/ธีม (ไม่ตั้ง = หน้าเว็บเหมือนเดิม)
 * ฟอนต์/สี/ความหนา ใช้ชุดเดียวกับผืนผ้าใบ (CANVAS_FONTS · CANVAS_COLORS · CANVAS_WEIGHTS) — เว็บร้านโหลดฟอนต์ให้เอง
 * ขนาดเก็บเป็นชื่อสเกล (s…xxl) ไม่ใช่ px → เว็บร้านแปลงเป็นขนาดที่ย่อตามจอ
 */
export type TextSize = "auto" | "s" | "m" | "l" | "xl" | "xxl";
export const TEXT_SIZES: readonly TextSize[] = ["auto", "s", "m", "l", "xl", "xxl"];
export const TEXT_FONTS: readonly string[] = ["auto", ...CANVAS_FONTS.map((o) => o.v)];
export const TEXT_WEIGHTS: readonly string[] = ["auto", ...CANVAS_WEIGHTS.map((o) => o.v)];
export const TEXT_COLORS: readonly string[] = ["auto", ...CANVAS_COLORS.map((o) => o.v)];
/** ระยะห่างตัวอักษรหัวข้อ */
export type TextSpacing = "auto" | "tight" | "wide" | "wider";
export const TEXT_SPACINGS: readonly TextSpacing[] = ["auto", "tight", "wide", "wider"];
export interface BlockText {
  font: string;
  size: TextSize;
  weight: string;
  /** สีหัวข้อ — ชื่อสีธีม หรือ "custom" + colorHex */
  color: string;
  colorHex: string;
  /** สีตัวเล็กเหนือหัวข้อ + คำโปรยใต้หัวข้อ */
  subColor: string;
  subColorHex: string;
  /** ระยะห่างตัวอักษร · ตัวพิมพ์ใหญ่ทั้งหมด (อังกฤษ) · ตัวเอียง — หัวข้อใหญ่เท่านั้น */
  spacing: TextSpacing;
  upper: boolean;
  italic: boolean;
  /** ── ตัวเล็กเหนือหัวข้อ (.eyebrow) ── ฟอนต์ · ขนาด · ระยะตัวอักษร · ตัวพิมพ์ */
  eyeFont: string;
  eyeSize: EyeSize;
  eyeSpacing: TextSpacing;
  eyeCase: TextCase;
  /** ── เนื้อหาใน Section (ชื่อการ์ด/ราคา/คำอธิบาย/คำโปรย) ── ฟอนต์ · สี · ระยะตัวอักษร · ตัวพิมพ์ใหญ่ */
  bodyFont: string;
  bodyColor: string;
  bodyColorHex: string;
  bodySpacing: TextSpacing;
  bodyUpper: boolean;
  /** ── ปุ่มใน Section (.btn) ── ฟอนต์ · ตัวพิมพ์ · ระยะตัวอักษร */
  btnFont: string;
  btnCase: TextCase;
  btnSpacing: TextSpacing;
}
/** ตัวพิมพ์: auto = ตามเดิม · upper = ตัวพิมพ์ใหญ่ทั้งหมด · normal = ตามที่พิมพ์ (ปิดตัวพิมพ์ใหญ่ที่ธีมบังคับ) */
export type TextCase = "auto" | "upper" | "normal";
export const TEXT_CASES: readonly TextCase[] = ["auto", "upper", "normal"];
/** ขนาดตัวเล็กเหนือหัวข้อ */
export type EyeSize = "auto" | "s" | "m" | "l";
export const EYE_SIZES: readonly EyeSize[] = ["auto", "s", "m", "l"];
export const DEFAULT_BLOCK_TEXT: BlockText = {
  font: "auto",
  size: "auto",
  weight: "auto",
  color: "auto",
  colorHex: "",
  subColor: "auto",
  subColorHex: "",
  spacing: "auto",
  upper: false,
  italic: false,
  eyeFont: "auto",
  eyeSize: "auto",
  eyeSpacing: "auto",
  eyeCase: "auto",
  bodyFont: "auto",
  bodyColor: "auto",
  bodyColorHex: "",
  bodySpacing: "auto",
  bodyUpper: false,
  btnFont: "auto",
  btnCase: "auto",
  btnSpacing: "auto",
};

/** ลูกเล่น — โผล่ตอนเลื่อนถึง / ตอนชี้เมาส์ · "none" = ตามค่าทั้งเว็บ (ธีม page.sectionMotion · ไม่ตั้ง = ไม่ขยับเหมือนเดิม) · "still" = ไม่ขยับแม้ตั้งค่าทั้งเว็บ */
export type MotionEntrance = "none" | "still" | "fade-up" | "fade-in" | "slide-left" | "slide-right" | "zoom" | "pop" | "spin-in" | "blur";
export type MotionHover = "none" | "lift" | "zoom" | "glow";
export type MotionSpeed = "normal" | "slow" | "fast";
/** ⚠️ CSS ของกลาง [data-motion] ที่เว็บร้าน globals.css — ผืนผ้าใบใช้ชุดเดียวกันต่อชิ้น (CANVAS_ENTRANCES) */
export const MOTION_ENTRANCES: readonly MotionEntrance[] = ["none", "still", "fade-up", "fade-in", "slide-left", "slide-right", "zoom", "pop", "spin-in", "blur"];
export const MOTION_HOVERS: readonly MotionHover[] = ["none", "lift", "zoom", "glow"];
export const MOTION_SPEEDS: readonly MotionSpeed[] = ["normal", "slow", "fast"];
export interface BlockMotion {
  entrance: MotionEntrance;
  /** ชิ้นย่อย/การ์ดโผล่ไล่กันทีละชิ้น */
  stagger: boolean;
  hover: MotionHover;
  speed: MotionSpeed;
}
export const DEFAULT_MOTION: BlockMotion = { entrance: "none", stagger: false, hover: "none", speed: "normal" };

/**
 * 🎨 พื้นหลังเพิ่ม (แผงรูปลักษณ์ → ทุกจอ) — วาดเป็นชั้นของตัวเองใน Section (เว็บร้าน SectionLayers) ไม่ใช้ ::before/::after ของตัวห่อ
 * ลวดลายทับพื้น · ขอบบน/ล่างเป็นรูปทรง (สี = สีของส่วนที่ติดกัน · ค่าเริ่ม = สีพื้นเว็บ) · กล่องเนื้อหามีพื้น
 * ไม่เคยตั้ง = ไม่มีช่องนี้ใน style = หน้าตาเดิม
 */
export const PATTERN_KINDS = ["none", "dots", "lines", "grid", "checks", "grain", "waves"] as const;
export type PatternKind = (typeof PATTERN_KINDS)[number];
export const EDGE_SHAPES = ["none", "wave", "waves", "curve", "arch", "tilt", "zigzag"] as const;
export type EdgeShape = (typeof EDGE_SHAPES)[number];
export type LayerSize = "s" | "m" | "l";
export const LAYER_SIZES: readonly LayerSize[] = ["s", "m", "l"];
export const BOX_RADII = ["none", "s", "m", "l", "xl"] as const;
export type BoxRadius = (typeof BOX_RADII)[number];
export interface BlockPattern {
  kind: PatternKind;
  /** สีลาย — "auto" = สีตัวอักษรหลัก */
  color: string;
  colorHex: string;
  /** ความเข้ม % (3–60) */
  opacity: number;
  size: LayerSize;
}
export interface BlockEdge {
  shape: EdgeShape;
  /** ความสูง px บนคอม (16–200 · มือถือย่อเหลือ 60%) */
  height: number;
  /** กลับซ้าย-ขวา */
  flip: boolean;
  /** สีส่วนที่ "ตัด" — "auto" = สีพื้นเว็บ (ให้ตรงกับ Section ข้าง ๆ) */
  color: string;
  colorHex: string;
}
export interface BlockBox {
  on: boolean;
  /** สีกล่อง — "auto" = สีพื้นการ์ด */
  color: string;
  colorHex: string;
  /** ความทึบ % (40–100) */
  opacity: number;
  radius: BoxRadius;
  /** ระยะกล่องจากขอบ Section */
  gap: LayerSize;
  shadow: boolean;
  border: boolean;
}
export const DEFAULT_PATTERN: BlockPattern = { kind: "none", color: "auto", colorHex: "", opacity: 12, size: "m" };
export const DEFAULT_EDGE: BlockEdge = { shape: "none", height: 60, flip: false, color: "auto", colorHex: "" };
export const DEFAULT_BOX: BlockBox = { on: false, color: "auto", colorHex: "", opacity: 100, radius: "l", gap: "m", shadow: false, border: false };

/**
 * ✨ ของตกแต่งของ Section (แผงรูปลักษณ์ → แท็บ "✨ ตกแต่ง") — วางอิสระ · ลากย้ายในพรีวิวได้
 * ตำแหน่ง/ขนาด = % ของ Section (ทุกจอสัดส่วนเดิม) · เว็บร้านวาดที่ components/home/SectionLayers.tsx
 */
export const DECOR_MAX = 12;
export const DECOR_KINDS = ["shape", "image", "text"] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];
/** ขยับตลอดเวลา — ชื่อตรงกับ data-loop ของกลางในเว็บร้าน (globals.css) */
export const DECOR_ANIMS = ["none", "float", "sway", "pulse", "spin", "twinkle", "bounce"] as const;
export type DecorAnim = (typeof DECOR_ANIMS)[number];
export const DECOR_LAYERS = ["back", "front"] as const;
export type DecorLayer = (typeof DECOR_LAYERS)[number];
/**
 * 📱 จอที่ปรับแยกได้ — คอม ≥ 1024px · แท็บเล็ต 768–1023px · มือถือ < 768px (⚠️ ตรงกับ globals.css .sec-decor ของเว็บร้าน)
 * แท็บเล็ต/มือถือ ยังไม่ปรับแยก (tab/mob = null) = ใช้ตำแหน่ง/ขนาด/มุมเดียวกับคอม
 */
export type DecorScreen = "desktop" | "tablet" | "mobile";
/** ตำแหน่ง/ขนาด/มุม ของจอหนึ่ง (หน่วยเดียวกับช่องของคอม) */
export interface DecorPlace {
  x: number;
  y: number;
  w: number;
  size: number;
  rotate: number;
}
/** สัดส่วน สูง/กว้าง เริ่มต้นของลายในตัว (ลายเส้น/แถบ = แบน) */
export const DECOR_SHAPE_RATIO: Record<string, number> = { bow: 0.72, heart: 0.9, sparkle: 1, star: 0.96, flower: 1, pearls: 0.12, lace: 1.2, scallop: 0.12, wave: 0.12, line: 0.04, arch: 1.2, rect: 0.6, ellipse: 1, clip: 2.5, binder: 0.8, tape: 0.3, note: 1, badge: 1, barcode: 0.5 };
export interface DecorItem {
  id: string;
  kind: DecorKind;
  /** ลายในตัว (CANVAS_SHAPES) — kind = shape */
  shape: string;
  /** ลายแบบเส้นขอบ (ไม่ทึบ) */
  outline: boolean;
  /** รูปจากคลัง (r2 key) — kind = image */
  key: string;
  /** สัดส่วน สูง/กว้าง (รูป = ตามรูปจริง · ลาย = ปรับได้) */
  ratio: number;
  /** ข้อความ — kind = text */
  text: string;
  font: string;
  /** ขนาดตัวอักษร px บนคอม (จอแคบย่อตามความกว้าง) */
  size: number;
  /** สีลาย/ข้อความ — "auto" = สีแบรนด์ */
  color: string;
  colorHex: string;
  /** จุดกลางของชิ้น — % ของกว้าง/สูง Section (ทศนิยม 1 ตำแหน่ง) */
  x: number;
  y: number;
  /** ความกว้าง % ของ Section (ลาย/รูป) */
  w: number;
  rotate: number;
  /** ความทึบ % (5–100) */
  opacity: number;
  /** หลังเนื้อหา / หน้าเนื้อหา (หน้า = ทับสินค้า/ข้อความได้ แต่กดผ่านได้) */
  layer: DecorLayer;
  anim: DecorAnim;
  /** ซ่อนบนจอนั้น (คอม / แท็บเล็ต / มือถือ) */
  hideDesktop: boolean;
  hideTablet: boolean;
  hideMobile: boolean;
  /** ตำแหน่ง/ขนาด/มุม ที่ปรับแยกของแท็บเล็ต / มือถือ — null = ใช้ค่าคอม */
  tab: DecorPlace | null;
  mob: DecorPlace | null;
  /** กลับซ้าย-ขวา */
  flip: boolean;
  /** 🎨 ลายของร้าน (SVG ที่อัป · คัดลอกมาที่ชิ้น) — มี = วาดลายนี้แทนลายในตัว · สีพื้น = color · ไม่เติมพื้น = outline */
  pattern: ShopPattern | null;
  patMode: ShopPatternMode;
  /** สีเส้น ("none" = ไม่มีเส้นเพิ่ม) */
  lineColor: string;
  lineColorHex: string;
  /** ความหนาเส้น (หน่วย: ความกว้างชิ้น = 100) — ลายในตัวแบบเส้นขอบ + ลายของร้าน */
  strokeWidth: number;
  /** สีใหม่ของแต่ละสีในไฟล์ (โหมดแยกตามสี · "" = สีเดิม) */
  patSlots: string[];
}
export const DEFAULT_DECOR: Omit<DecorItem, "id" | "kind"> = {
  shape: "sparkle",
  outline: false,
  key: "",
  ratio: 1,
  text: "",
  font: "display",
  size: 40,
  color: "brand",
  colorHex: "",
  x: 50,
  y: 50,
  w: 8,
  rotate: 0,
  opacity: 100,
  layer: "back",
  anim: "none",
  hideDesktop: false,
  hideTablet: false,
  hideMobile: false,
  tab: null,
  mob: null,
  flip: false,
  pattern: null,
  patMode: "orig",
  lineColor: "none",
  lineColorHex: "",
  strokeWidth: 2,
  patSlots: [],
};
const placeKey = (s: DecorScreen) => (s === "tablet" ? "tab" : s === "mobile" ? "mob" : null);
/** ตำแหน่ง/ขนาด/มุม ที่ใช้จริงบนจอนั้น (แท็บเล็ต/มือถือ ไม่ได้ปรับแยก = ค่าคอม) */
export function decorPlaceOf(d: DecorItem, screen: DecorScreen): DecorPlace {
  const k = placeKey(screen);
  const own = k ? d[k] : null;
  return own ?? { x: d.x, y: d.y, w: d.w, size: d.size, rotate: d.rotate };
}
/** จอนั้นปรับแยกจากคอมอยู่ไหม */
export const decorIsCustom = (d: DecorItem, screen: DecorScreen): boolean => {
  const k = placeKey(screen);
  return !!(k && d[k]);
};
/** แก้ตำแหน่ง/ขนาด/มุม ของจอนั้น — คอม = ช่องหลัก · จอเล็กแก้ครั้งแรก = เริ่มปรับแยกจากค่าคอม (จออื่นไม่ขยับตาม) */
export function patchDecorPlace(d: DecorItem, screen: DecorScreen, p: Partial<DecorPlace>): DecorItem {
  const k = placeKey(screen);
  if (!k) return { ...d, ...p };
  return { ...d, [k]: { ...decorPlaceOf(d, screen), ...p } };
}
/** จอนั้นกลับไปใช้ค่าคอม */
export function resetDecorPlace(d: DecorItem, screen: DecorScreen): DecorItem {
  const k = placeKey(screen);
  return k ? { ...d, [k]: null } : d;
}
/** ช่องซ่อนของจอนั้น */
export const decorHideKey = (screen: DecorScreen) => (screen === "desktop" ? "hideDesktop" : screen === "tablet" ? "hideTablet" : "hideMobile") as "hideDesktop" | "hideTablet" | "hideMobile";
/** ชิ้นใหม่ (n = ลำดับ ใช้เหลื่อมตำแหน่งไม่ให้ทับกันสนิท) */
export function newDecor(kind: DecorKind, p: Partial<DecorItem> = {}, n = 0): DecorItem {
  const off = (n % 5) * 6;
  // ชิ้นใหม่ = อยู่หน้าเนื้อหา (เห็นทันที ไม่จมหลังรูป/วิดีโอ) — ชิ้นเก่าที่ไม่มีค่า layer ยังเป็นหลังเนื้อหาตาม DEFAULT_DECOR (หน้าตาเดิมไม่เปลี่ยน)
  const base: DecorItem = { ...DEFAULT_DECOR, id: `dc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind, x: 20 + off, y: 30 + off, layer: "front" };
  if (kind === "shape") Object.assign(base, { ratio: DECOR_SHAPE_RATIO[p.shape ?? base.shape] ?? 1 });
  if (kind === "image") Object.assign(base, { w: 14 });
  if (kind === "text") Object.assign(base, { text: "New!", font: "Parisienne", w: 0 });
  return { ...base, ...p };
}

/** หน้าตาของบล็อก — แยกจาก "เนื้อหา" ทุกชนิดบล็อกมีชุดนี้เหมือนกัน */
export interface BlockStyle {
  padTop: BlockSpacing;
  padBottom: BlockSpacing;
  bg: BlockBg;
  /** ใช้เมื่อ bg = "custom" เท่านั้น (#rrggbb) */
  bgColor: string;
  /** ใช้เมื่อ bg = "gradient" (ของกลาง lib/website-gradient.ts) */
  bgGrad?: GradientValue;
  /** ใช้เมื่อ bg = "image" — เก็บไว้แม้สลับไปแบบอื่น (สลับกลับได้ของเดิม) */
  bgImg?: BlockBgImage;
  width: BlockWidth;
  align: BlockAlign;
  /** ตั้งทับเฉพาะจอมือถือ (< 768px) */
  mobile: BlockStyleMobile;
  /** ลูกเล่น (แผง "✨ ลูกเล่น") */
  motion: BlockMotion;
  /** ตัวอักษรหัวข้อ (แผง "🔤 ตัวอักษร") */
  text: BlockText;
  /** 🎨 ลวดลายทับพื้น · ขอบบน/ล่าง · กล่องเนื้อหา (ไม่มี = ไม่ได้ตั้ง) */
  pattern?: BlockPattern;
  edgeTop?: BlockEdge;
  edgeBottom?: BlockEdge;
  box?: BlockBox;
  /** ✨ ของตกแต่ง (ไม่มี/ว่าง = ไม่มี) */
  decor?: DecorItem[];
}

export const DEFAULT_BLOCK_STYLE: BlockStyle = {
  padTop: "auto",
  padBottom: "auto",
  bg: "auto",
  bgColor: "",
  width: "auto",
  align: "auto",
  mobile: { padTop: "auto", padBottom: "auto", align: "auto", hSize: "auto", hideEyebrow: false, hideSub: false },
  motion: { ...DEFAULT_MOTION },
  text: { ...DEFAULT_BLOCK_TEXT },
};

export interface BlockBase {
  id: string;
  type: BlockType;
  /** ปิดชั่วคราวโดยไม่ต้องลบ (ปิดแล้วไม่แสดงทุกอุปกรณ์) */
  enabled: boolean;
  visibility: Visibility;
  style: BlockStyle;
  /** 🧪 ทดสอบ A/B — Section ที่ชื่อการทดสอบเดียวกัน: ลูกค้าครึ่งหนึ่งเห็นแบบ A อีกครึ่งเห็นแบบ B (ไม่ตั้ง = เห็นทุกคน) */
  ab?: BlockAb;
  /** 🏷 ชื่อที่ตั้งเอง ไว้หา Section ในตัวจัดหน้า (ไม่ส่งไปเว็บร้าน · ว่าง = ใช้ชื่อชนิด Section) */
  name?: string;
}

/** 🏷 ชื่อ Section ที่ตั้งเอง: ตัดช่องว่างซ้ำ · ยาวสุด 60 ตัว · ไม่ใช่ข้อความ = "" */
export const BLOCK_NAME_MAX = 60;
export const cleanBlockName = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, BLOCK_NAME_MAX) : "");

/** ชื่อที่โชว์ในตัวจัดหน้า/คำเตือน/ที่ที่ผูกรูป: ชื่อที่ตั้งเอง → ชื่อชนิด Section → รหัสชนิด */
export function blockDisplayName(b: { type?: unknown; name?: unknown }): string {
  return cleanBlockName(b.name) || SECTION_SCHEMAS[String(b.type)]?.meta.label || String(b.type ?? "");
}

/** ส่งให้เว็บร้าน: ตัดของที่ใช้เฉพาะหลังบ้าน (🏷 ชื่อที่ตั้งไว้หา Section) — ลูกค้าไม่ต้องเห็น */
export function toPublicBlocks(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    if (!b || typeof b !== "object" || !("name" in b)) return b;
    const c = { ...b };
    delete c.name;
    return c;
  });
}

export interface BlockAb {
  /** ชื่อการทดสอบ a-z0-9- (lib/website-web-stats cleanExpId) */
  exp: string;
  variant: "A" | "B";
}

/** ค่า ab จากที่บันทึก → ใช้ได้ / ไม่ใช้ (null) */
export function sanitizeAb(v: unknown): BlockAb | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const exp = cleanExpId(o.exp);
  return exp && (o.variant === "A" || o.variant === "B") ? { exp, variant: o.variant } : null;
}

/** ชิ้นย่อย (Block ใน Section) — มีรหัส + เปิด/ปิด + ซ่อนตามจอ ได้เหมือนบล็อกระดับบน */
export interface ChildBase {
  id?: string;
  enabled?: boolean;
  visibility?: Visibility;
}

export interface CtaLink {
  text: string;
  href: string;
}

export interface AnnouncementBlock extends BlockBase {
  type: "announcement";
  messages: string[];
  /** วิ่งต่อเนื่องแทนสลับทีละข้อความ */
  marquee: boolean;
  /** 🎨 สีแถบ (ink = เดิม) · ⏳ นับถอยหลัง (ชุด 3 · เว็บร้าน AnnouncementBar) */
  bg?: "ink" | "brand" | "sale" | "custom";
  bgColor?: string;
  countdown?: boolean;
  /** เวลาไทย "YYYY-MM-DDTHH:mm" */
  countdownAt?: string;
  /** {time} = ตรงที่เวลาโชว์ */
  countdownText?: string;
  afterEnd?: "hide" | "text";
  afterText?: string;
}

export type HeroHeight = "auto" | "tall" | "full";

export interface HeroBlock extends BlockBase {
  type: "hero";
  eyebrow: string;
  title: string;
  titleAccent: string;
  subtitle: string;
  primary: CtaLink;
  secondary: CtaLink;
  features: (ChildBase & { title: string; desc: string })[];
  /** รูปพื้นหลัง (r2 key) — ว่าง = ใช้พื้นหลังไล่สีเดิม */
  imageKey: string | null;
  /** รูปพื้นหลังสำหรับจอมือถือ (< 768px) — ว่าง = ใช้ imageKey (กฎเดียวกันทุก Section ที่มีรูปเต็มจอ) */
  mobileImageKey: string | null;
  imageAlt: string;
  /** ความทึบของสีดำที่ทับรูป 0–90 (%) */
  overlay: number;
  /** วิดีโอพื้นหลังที่อัปโหลด/เลือกจากคลัง (r2 key) — มี = ใช้ก่อนลิงก์ videoUrl */
  videoFile: string | null;
  /** คลิปสำหรับจอมือถือ (r2 key · เช่น แนวตั้ง) — ว่าง = ใช้คลิปเดียวกับคอม */
  videoFileMobile: string | null;
  /** วิดีโอพื้นหลัง (ลิงก์ mp4/webm) — ว่าง = ใช้รูป */
  videoUrl: string;
  parallax: boolean;
  height: HeroHeight;
}

export interface TwoTracksBlock extends BlockBase {
  type: "two-tracks";
  eyebrow: string;
  title: string;
  subtitle: string;
  cards: (ChildBase & {
    emoji: string;
    title: string;
    desc: string;
    bullets: string[];
    primary: CtaLink;
    secondary: CtaLink;
    dark: boolean;
  })[];
}

export interface CategoriesBlock extends BlockBase {
  type: "categories";
  eyebrow: string;
  title: string;
}

export interface FeaturedBlock extends BlockBase {
  type: "featured";
  eyebrow: string;
  title: string;
  limit: number;
}

/** ตารางสินค้า / คอลเลกชัน — เลือกเอง (codes) · ทั้งหมวด · ที่ติ๊กแนะนำ · ทั้งหมด */
export interface ProductsBlock extends BlockBase {
  type: "products";
  eyebrow: string;
  title: string;
  source: "manual" | "category" | "featured" | "new" | "newdrop" | "best" | "sale" | "all" | "skus";
  /** เรียง: ตามแหล่ง · ราคาถูก→แพง · แพง→ถูก · ใหม่ล่าสุด */
  sort?: "default" | "price-asc" | "price-desc" | "newest";
  /** รหัสรุ่น (parent code) ที่เลือกเอง */
  codes: string[];
  /** 🎨 SKU ที่เลือกเอง (source = skus) — "CODE:sku-xxxxxxxx" · ไม่มีสี = "CODE" */
  skus?: string[];
  /** การ์ด: 1 ใบ/รุ่น (เดิม) หรือ แยกทุกสี 1 ใบ/SKU */
  cardMode?: "parent" | "sku";
  /** แยกตาม SKU: สลับรุ่น (สีแรกของทุกรุ่นก่อน) / เรียงต่อกันทีละรุ่น */
  skuOrder?: "mix" | "group";
  category: string;
  limit: number;
  /** รูปแบบการโชว์ (ปุ่มรูปย่อใน schema) — เว็บร้านวาดที่ src/components/home/ProductsBlock.tsx */
  layout: "grid" | "carousel" | "feature" | "mosaic" | "lookbook" | "spotlight" | "rank" | "tabs" | "banner";
  columns: number;
  /** มือถือใช้แบบอื่น ("same" = เหมือนคอม) */
  layoutMobile?: "same" | ProductsBlock["layout"];
  /** เลื่อนเองอัตโนมัติ (เลื่อนข้าง/สปอตไลต์) + ทุกกี่วินาที */
  autoplay?: boolean;
  autoplaySec?: number;
  /** ตัวเด่น / แบนเนอร์ อยู่ด้านไหน */
  side?: "left" | "right";
  /** ลุคบุ๊ก: รูปต่อแถวบนคอม */
  lookCols?: "2" | "3";
  /** อันดับขายดี: เรียงจากยอดขายจริง หรือตามลำดับที่ดึงมา */
  rankBy?: "sales" | "order";
  /** แท็บตามหมวด: หมวดที่เป็นแท็บ (ว่าง = ทุกหมวดที่มีสินค้า) + มีแท็บ "ทั้งหมด" ไหม */
  tabCats?: string[];
  tabAll?: boolean;
  /** 🗂 แบ่งแท็บตาม หมวด (เดิม) / รุ่นสินค้า (Parent SKU) */
  tabBy?: "cat" | "parent";
  /** รุ่นที่เป็นแท็บ (รหัสรุ่น · ว่าง = รุ่นของสินค้าใน Section) */
  tabParents?: string[];
  /** หน้าตาแท็บรุ่น: รูป+ชื่อ / รูปอย่างเดียว / ชื่ออย่างเดียว */
  tabStyle?: "both" | "img" | "txt";
  /** กดแท็บรุ่นแล้ว ต่อท้ายด้วย SKU รุ่นอื่นใน Section */
  tabRest?: boolean;
  /** คั่นด้วยคำว่า "รุ่นอื่น" */
  tabRestSep?: boolean;
  /** ใต้แท็บ: ตาราง (เดิม) / เลื่อนข้าง */
  tabBody?: "grid" | "carousel";
  /** รูปบนแท็บรุ่น: SKU ต่อรุ่น "CODE:sku-xxxxxxxx" (ไม่เลือก = รูปปก Parent) */
  tabThumbs?: string[];
  /** รูปบนแท็บรุ่นที่อัปโหลด/เลือกจากคลัง { รหัสรุ่น: r2 key } — มาก่อน tabThumbs */
  tabImages?: Record<string, string>;
  tabThumbShape?: "circle" | "rounded" | "square";
  /** px · 0 = อัตโนมัติ (รูป+ชื่อ 30 · รูปอย่างเดียว 52) */
  tabThumbSize?: number;
  /** px · 0 = 80% ของขนาดบนคอม */
  tabThumbSizeM?: number;
  /** การ์ดต่อแถวบนมือถือใต้แท็บ */
  tabColsM?: "auto" | "1" | "2" | "3";
  /** แถบแท็บ: เลื่อน (เดิม) / มีลูกศร ◀ ▶ */
  tabNav?: "scroll" | "arrows";
  /** จำนวนแท็บที่โชว์ (0 = ทั้งหมด · ที่เกิน = ปุ่ม +N) */
  tabMax?: number;
  /** แบนเนอร์ + สินค้า */
  bannerImage?: string | null;
  bannerEyebrow?: string;
  bannerTitle?: string;
  bannerText?: string;
  bannerCta?: CtaLink;
  more: CtaLink;
  /** 🃏 การ์ดในส่วนนี้ — true/ไม่มี = ตามการ์ดของร้าน · false = ใช้ค่า card* ด้านล่าง (schema: PRODUCT_CARD_FIELDS) */
  cardUseShop?: boolean;
  cardName?: boolean;
  cardPrice?: boolean;
  cardBadge?: boolean;
  cardCompare?: boolean;
  cardPriceFrom?: boolean;
  cardUnit?: boolean;
  cardCategory?: boolean;
  cardStock?: boolean;
  cardSwatches?: boolean;
  cardColorCount?: boolean;
  cardQuickAdd?: boolean;
  cardQuickView?: boolean;
  cardTitleLines?: "1" | "2" | "3";
  cardAlign?: "left" | "center";
}

/** 🕰 ไทม์ไลน์ / เรื่องราวแบรนด์ */
export interface TimelineBlock extends BlockBase {
  type: "timeline";
  eyebrow: string;
  title: string;
  subtitle: string;
  layout: "line" | "zigzag" | "cards";
  imageRatio: "1:1" | "4:3" | "3:4" | "16:9";
  items: (ChildBase & { year: string; title: string; text: string; imageKey: string | null })[];
}
/** ⏳ นับถอยหลังแคมเปญ — endAt = เวลาไทย "YYYY-MM-DDTHH:mm" */
export interface CountdownBlock extends BlockBase {
  type: "countdown";
  eyebrow: string;
  title: string;
  subtitle: string;
  endAt: string;
  cta: CtaLink;
  afterEnd: "message" | "hide";
  endedTitle: string;
  layout: "bar" | "center";
  tone: "dark" | "light" | "brand";
  showDays: boolean;
}
/** 🆕 ชุดมาใหม่ — แบนเนอร์ + นับถอยหลัง + สินค้าในชุด (this = ชุดของหน้า /new/<ชุด> · หน้าอื่น = ชุดล่าสุด) */
export interface DropBlock extends BlockBase {
  type: "drop";
  which: "this" | "latest" | "soon";
  banner: "big" | "small" | "none";
  showProducts: boolean;
}
/** 🛍 ลุคบุ๊กกดซื้อได้ — spots[].pos = % บนรูป */
/** 🚶 รันเวย์ลุค — looks[] = รูปเต็มตัว + ชื่อ + สินค้า (รหัสรุ่น) · ลุคถัดไปเรียงแถวด้านหลัง (เว็บร้าน RunwayBody) */
export interface RunwayBlock extends BlockBase {
  type: "runway";
  eyebrow: string;
  title: string;
  subtitle: string;
  lookLabel: string;
  shopAllText: string;
  depth: "2" | "3" | "4";
  queueSide: "left" | "right";
  blur: "soft" | "strong" | "none";
  height: "md" | "tall" | "screen";
  panel: "right" | "left" | "none";
  showPrice: boolean;
  showHeart: boolean;
  auto: boolean;
  autoSec: number;
  scroll: boolean;
  scrollPace: "sm" | "md" | "lg";
  bigText: string;
  bigTextColor: string;
  bigTextPos: "top" | "middle" | "bottom";
  bg: "solid" | "floor" | "image";
  bgColor: string;
  floorColor: string;
  floorHeight: number;
  bgImage: string | null;
  bgDim: number;
  figSize: number;
  figLift: number;
  shadow: "soft" | "strong" | "none";
  zoom: boolean;
  looks: (ChildBase & {
    imageKey: string | null;
    name: string;
    products: string[];
    /** % ขนาดคน/ยกขึ้น เฉพาะลุคนี้ (คูณ/บวกกับค่าทั้ง Section) */
    size: number;
    lift: number;
    bgColor: string;
    /** จุดกดบนตัวนางแบบ 0–3 · spotN = % บนรูปลุค · spotNProducts = รหัสรุ่น */
    spots: "0" | "1" | "2" | "3";
    spot1: { x: number; y: number };
    spot1Products: string[];
    spot2: { x: number; y: number };
    spot2Products: string[];
    spot3: { x: number; y: number };
    spot3Products: string[];
  })[];
}
/** 🎞️ การ์ดบนฉาก — พื้นหลังเต็มจอ (ฉากรูป/วิดีโอ) + แถวการ์ดสินค้ากระจกเลื่อนข้าง (เว็บร้าน SceneBody)
 *  แท็บ 1–3 (tabNSource: new/best/pick) · scenes[].tab + from = เลื่อนการ์ดถึงชิ้นที่ from ของแท็บนั้น → เปลี่ยนฉาก */
export type SceneTabSource = "new" | "best" | "pick";
export interface SceneBlock extends BlockBase {
  type: "scene";
  title: string;
  tabs: "1" | "2" | "3";
  tab1Label: string;
  tab1Source: SceneTabSource;
  tab1Products: string[];
  tab1Count: number;
  tab2Label: string;
  tab2Source: SceneTabSource;
  tab2Products: string[];
  tab2Count: number;
  tab3Label: string;
  tab3Source: SceneTabSource;
  tab3Products: string[];
  tab3Count: number;
  card: "frost" | "liquid" | "solid";
  cardTint: "light" | "dark" | "white";
  cardOpacity: number;
  cardBlur: number;
  cardBorder: boolean;
  cardRadius: number;
  cardSize: "s" | "m" | "l";
  /** png = เฉพาะสินค้าที่มี "รูปตัดพื้น (PNG)" ของรุ่น (ไม่มี = ไม่โชว์) · original = รูปเดิมทุกตัว */
  imgMode: "png" | "original";
  showMeta: boolean;
  showPrice: boolean;
  showHeart: boolean;
  height: "md" | "tall" | "screen";
  dim: number;
  scenes: (ChildBase & {
    tab: "1" | "2" | "3";
    from: number;
    kind: "image" | "video";
    videoKey: string | null;
    imageKey: string | null;
    pos: "top" | "center" | "bottom";
  })[];
}
/** 🖱️ ข้อความใหญ่ + รูปตามเมาส์ (เว็บร้าน HoverReveal) — คำใหญ่หลายบรรทัด ชี้คำไหน รูปของคำนั้นลอยตามเมาส์
 *  มือถือ: แตะคำ = รูปขึ้น · แตะคำเดิมซ้ำ = ไปลิงก์ */
export interface HoverRevealBlock extends BlockBase {
  type: "hover-reveal";
  eyebrow: string;
  note: string;
  align: "left" | "center" | "right";
  font: string;
  weight: string;
  size: number;
  sizeMobile: number;
  upper: boolean;
  lineGap: "tight" | "normal" | "loose";
  color: string;
  hex: string;
  others: "fade" | "outline" | "none";
  imgW: number;
  imgWMobile: number;
  ratio: "3:4" | "1:1" | "4:5" | "2:3" | "4:3" | "16:9";
  radius: number;
  follow: "smooth" | "snap" | "fixed";
  tilt: boolean;
  imgFx: "pop" | "fade" | "clip";
  layer: "front" | "back";
  /** 🖼 รูปตอนชี้พื้นหลัง (ที่ว่างที่ไม่ใช่คำ/กรอบ) + ลิงก์ของพื้นที่ว่าง */
  bgImageKey: string | null;
  bgHref: string;
  /** kind word = คำ/บรรทัด · zone = กรอบล่องหน (x y w h = % ของ Section · ลากในพรีวิว → storefront-child-place) */
  items: (ChildBase & { kind: "word" | "zone"; text: string; tag: string; x: number; y: number; w: number; h: number; imageKey: string | null; alt: string; href: string })[];
}
export interface LookbookBlock extends BlockBase {
  type: "lookbook";
  eyebrow: string;
  title: string;
  subtitle: string;
  imageKey: string | null;
  layout: "side" | "pop";
  side: "left" | "right";
  dot: "dot" | "plus" | "num";
  showList: boolean;
  cardSize: "s" | "m" | "l";
  cardRatio: "auto" | "1:1" | "4:5" | "3:4";
  showImage: boolean;
  showName: boolean;
  showPrice: boolean;
  showSwatches: boolean;
  showDesc: boolean;
  showAdd: boolean;
  addText: string;
  showView: boolean;
  viewText: string;
  /** 🛍 ปรับเพิ่ม 2026-10-18 — ค่าเริ่มทุกช่อง = หน้าตาเดิม */
  imgFrame?: "rounded" | "rect";
  sideMode?: "card" | "list";
  imgWidth?: "50" | "58" | "65" | "70";
  dotColor?: "white" | "ink" | "brand" | "brandDeep" | "custom";
  dotHex?: string;
  dotSize?: "s" | "m" | "l";
  dotPulse?: "auto" | "on" | "off";
  dotLabel?: boolean;
  listTitle?: string;
  listStyle?: "grid" | "carousel";
  listCols?: string;
  mobileLayout?: "same" | "list";
  /** สินค้าเพิ่มเติมในลุค (ไม่มีจุด) — รหัสรุ่น */
  more?: string[];
  cardBg?: string;
  cardHex?: string;
  cardAlign?: "left" | "center";
  addStyle?: "brand" | "dark" | "outline";
  viewStyle?: "outline" | "brand" | "dark" | "link";
  showTotal?: boolean;
  totalText?: string;
  /** 🎞 สไลด์: single = ลุคเดียว (เดิม) · slides = หลายลุค (imageKey = ลุค 1 · imageKey2–6) · joinPrev = ต่อสไลด์กับลุคบุ๊กก่อนหน้า */
  mode?: "single" | "slides" | "grid";
  /** 🧱 grid = หลายลุควางเรียงกัน: คอลัมน์ (คอม) · ช่องว่าง · มือถือ (ปัด / เรียงลง / 2 คอลัมน์) */
  gridCols?: "2" | "3";
  gridGap?: "none" | "s" | "m" | "l";
  gridMobile?: "swipe" | "stack" | "two";
  imageKey2?: string | null;
  imageKey3?: string | null;
  imageKey4?: string | null;
  imageKey5?: string | null;
  imageKey6?: string | null;
  lookNames?: string[];
  joinPrev?: boolean;
  slideNav?: "both" | "arrows" | "dots";
  slideEffect?: "slide" | "fade";
  slideAuto?: boolean;
  slideSec?: number;
  /** code = หลายสินค้าต่อจุดได้ (ตัวแรก = หลัก) · label = ป้ายข้างจุด · look = อยู่ลุคที่ ("1"–"6") */
  spots: (ChildBase & { code: string[]; label?: string; look?: string; pos: { x: number; y: number }; popSide: "auto" | "right" | "left" | "top" | "bottom"; note: string })[];
}
/** 📖 การ์ดคอลเลกชัน (คอลเลกชันที่เปิดหน้าไว้ · แท็บ 🎞 คอลเลกชัน) */
export interface CollectionsBlock extends BlockBase {
  type: "collections";
  eyebrow: string;
  title: string;
  subtitle: string;
  layout: "grid" | "rows" | "carousel";
  columns: number;
  ratio: "3:4" | "4:5" | "1:1" | "16:9";
  textPos: "on" | "below";
  showCount: boolean;
  limit: number;
}
/** 🧵 ออกแบบเข็มขัด — ลูกค้าเลือกสาย/หัว/หู + สลักชื่อ + ไซซ์ → พรีวิวซ้อนรูป + ราคา (lib/belt-builder · ร้านต้องเปิดใน ข้อมูลร้าน → 🧵) */
export interface BeltBuilderBlock extends BlockBase {
  type: "beltbuilder";
  eyebrow: string;
  title: string;
  subtitle: string;
  showPrice: boolean;
  showSizeGuide: boolean;
  ctaLabel: string;
}
/** 📐 เช็คขนาด — ลูกค้าเลือกตุ๊กตา/ของ (หรือพิมพ์ขนาดเอง) → รุ่นที่ใส่ได้ (lib/fit-check · ร้านต้องเปิดเช็คขนาด) */
export interface FitCheckBlock extends BlockBase {
  type: "fitcheck";
  eyebrow: string;
  title: string;
  subtitle: string;
  showCustom: boolean;
  showSnug: boolean;
  columns: number;
  limit: number;
}
/** 📰 โลโก้สื่อ / พาร์ตเนอร์ */
export interface LogosBlock extends BlockBase {
  type: "logos";
  eyebrow: string;
  title: string;
  layout: "row" | "marquee";
  size: "s" | "m" | "l";
  speed: "slow" | "normal" | "fast";
  mono: boolean;
  items: (ChildBase & { imageKey: string | null; name: string; href: string })[];
}

export interface FaqBlock extends BlockBase {
  type: "faq";
  eyebrow: string;
  title: string;
  subtitle: string;
  showContact: boolean;
  contact: CtaLink;
  layout: "side" | "center" | "two" | "tabs";
  itemStyle: "line" | "card" | "fill";
  icon: "plus" | "chev" | "pm" | "none";
  iconSide: "right" | "left";
  numbering: "none" | "num" | "q";
  qSize: "sm" | "md" | "lg";
  openMode: "first" | "none" | "all";
  multi: boolean;
  search: boolean;
  seo: boolean;
  items: (ChildBase & { q: string; a: string; cat: string })[];
}

export interface CtaBlock extends BlockBase {
  type: "cta";
  title: string;
  subtitle: string;
  primary: CtaLink;
  secondary: CtaLink;
}

export interface RichTextBlock extends BlockBase {
  type: "rich-text";
  eyebrow: string;
  title: string;
  body: string;
}

/** 📜 เอกสาร/นโยบาย (ศูนย์ช่วยเหลือ) — ข้อความใส่ {shop} {email} ฯลฯ ได้ เว็บร้านแทนด้วยข้อมูลร้าน */
export interface DocBlock extends BlockBase {
  type: "doc";
  title: string;
  updated: string;
  intro: string;
  numbered: boolean;
  width: "narrow" | "normal" | "wide";
  sections: { id: string; enabled?: boolean; title: string; body: string }[];
}

/** 🚚 ติดตามคำสั่งซื้อ (ฟอร์มเลขที่+เบอร์ · สมาชิกเห็นคำสั่งซื้อตัวเอง) */
export interface OrderTrackBlock extends BlockBase {
  type: "order-track";
  title: string;
  intro: string;
  showMemberOrders: boolean;
  helpText: string;
}

/** ✉️ ฟอร์มติดต่อ → store_contact_messages (กล่องข้อความในแท็บข้อมูลร้าน) */
export interface ContactFormBlock extends BlockBase {
  type: "contact-form";
  title: string;
  intro: string;
  topics: string;
  askPhone: boolean;
  phoneRequired: boolean;
  showChannels: boolean;
  buttonText: string;
  successText: string;
}

export type ImageWidth = "full" | "wide" | "narrow";

export interface ImageBlock extends BlockBase {
  type: "image";
  imageKey: string | null;
  mobileImageKey: string | null;
  alt: string;
  caption: string;
  width: ImageWidth;
  /** ลิงก์เมื่อคลิกรูป (ไม่ใส่ = ไม่คลิก) */
  href: string;
}

export interface ImageTextBlock extends BlockBase {
  type: "image-text";
  imageKey: string | null;
  imageAlt: string;
  eyebrow: string;
  title: string;
  body: string;
  primary: CtaLink;
  secondary: CtaLink;
  imagePosition: "left" | "right";
}

export interface MulticolumnBlock extends BlockBase {
  type: "multicolumn";
  eyebrow: string;
  title: string;
  subtitle: string;
  columns: number;
  cardStyle: "card" | "plain";
  items: (ChildBase & { emoji: string; imageKey: string | null; title: string; text: string; link: CtaLink })[];
}

export interface SlideshowBlock extends BlockBase {
  type: "slideshow";
  autoplay: boolean;
  interval: number;
  height: "short" | "medium" | "tall";
  /** 🎞️ รูปทรง: height = ตามความสูงแบบเดิม · สัดส่วน กว้าง:สูง · full = เต็มจอ (schema: SLIDE_SHAPES) */
  shape?: "height" | "21:9" | "16:9" | "3:2" | "1:1" | "4:5" | "full";
  shapeMobile?: "same" | "height" | "16:9" | "3:2" | "1:1" | "4:5" | "3:4" | "full";
  width?: "full" | "contained";
  transition?: "fade" | "slide" | "zoom" | "peek";
  arrows?: "always" | "hover" | "none";
  indicator?: "dots" | "lines" | "number" | "progress" | "none";
  navColor?: "light" | "dark";
  titleSize?: "s" | "m" | "l" | "xl";
  textColor?: "light" | "dark";
  slides: (ChildBase & {
    imageKey: string | null;
    mobileImageKey: string | null;
    alt: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    link: CtaLink;
    align: "left" | "center";
    overlay: number;
    /** 📍 ตำแหน่งข้อความ 3×3 (auto = ตาม align) · สีทับไล่สี · กดทั้งสไลด์ = ลิงก์ของปุ่ม */
    textPos?: string;
    overlayStyle?: "solid" | "gradient";
    wholeLink?: boolean;
  })[];
}

export interface NewsletterBlock extends BlockBase {
  type: "newsletter";
  title: string;
  subtitle: string;
  buttonText: string;
  successText: string;
}

export interface GalleryBlock extends BlockBase {
  type: "gallery";
  eyebrow: string;
  title: string;
  columns: number;
  /** 📝 ข้อความประกอบรูป (imageCaptionFields ใน website-schema) — ค่าเริ่ม = ใต้รูปแบบเดิม */
  capShow?: boolean;
  capPos?: "below" | "card" | "overlay" | "hover";
  capAlign?: "auto" | "left" | "center" | "right";
  capGap?: "none" | "xs" | "sm" | "md" | "lg";
  capTitleFont?: string;
  capTitleSize?: "xs" | "s" | "m" | "l" | "xl";
  capTitleWeight?: string;
  capTitleColor?: string;
  capTitleHex?: string;
  capTitleUpper?: boolean;
  capTextSize?: "xs" | "s" | "m" | "l";
  capTextColor?: string;
  capTextHex?: string;
  capLinkStyle?: "text" | "button";
  capShade?: number;
  capCardBg?: string;
  capCardHex?: string;
  capMobile?: "all" | "title" | "none";
  /** 🖼️ grid = ตาราง (แบบเดิม) · strip = แถวรูปลุคบุ๊ก ชี้แล้วขยาย (ช่อง strip* — galleryStripFields ใน website-schema)
   *  tabs = แถบวิดีโอ: ช่องที่ชี้ขยายกว้าง (เล่นคลิป) ที่เหลือเป็นแถบบาง (ช่อง tabs* — galleryTabsFields) */
  layout?: "grid" | "strip" | "tabs";
  tabsH?: number;
  tabsHMobile?: number;
  tabsActive?: number;
  tabsGap?: number;
  tabsRadius?: number;
  tabsSliver?: "pixel" | "blur" | "dim" | "normal";
  tabsSpeed?: "fast" | "normal" | "slow";
  tabsStart?: "first" | "middle";
  tabsCycle?: boolean;
  tabsCycleSec?: "4" | "6" | "8" | "10";
  tabsMobile?: "row" | "column";
  tabsClick?: "auto" | "full" | "link";
  tabsCursor?: string;
  tabsCap?: "scramble" | "plain" | "none";
  tabsCapPos?: "below" | "on";
  tabsNum?: boolean;
  tabsFont?: string;
  tabsUpper?: boolean;
  /** 🗂 หน้าตาแฟ้มเอกสารของแถบวิดีโอ (galleryTabsFields) — plain = แบบเดิม */
  tabsLook?: "plain" | "folder";
  folderDir?: "h" | "v";
  folderShape?: "real" | "round" | "slant" | "square";
  folderPos?: "alt" | "stair" | "left";
  folderTex?: "none" | "lines" | "dots" | "grid" | "diag";
  folderShadow?: number;
  folderRadius?: number;
  folderPal?: "pastel" | "pink" | "mono" | "brand" | "custom";
  folderHex?: string;
  folderLabel?: "auto" | "sticker" | "plain";
  folderMedia?: "pol" | "full";
  folderPeek?: number;
  folderLift?: boolean;
  folderCover?: boolean;
  coverTitle?: string;
  coverTitle2?: string;
  coverFont?: string;
  coverFont2?: string;
  coverSize?: number;
  coverLogo?: string | null;
  stripEffect?: "soft" | "bounce" | "bend" | "lens";
  stripW?: number;
  stripWMobile?: number;
  stripZoom?: number;
  stripGap?: number;
  stripSpeed?: "fast" | "normal" | "slow" | "slower";
  stripStart?: "first" | "middle" | "none";
  stripFade?: boolean;
  stripDim?: "none" | "fade" | "gray";
  stripMove?: "still" | "drag" | "auto";
  stripAutoSpeed?: "slow" | "normal" | "fast";
  stripMobile?: "tap" | "center";
  stripCap?: "top" | "bottom" | "on" | "none";
  stripNum?: "paren" | "plain" | "of" | "none";
  stripAlign?: "left" | "center";
  stripFont?: string;
  stripTextSize?: "xs" | "s" | "m" | "l";
  stripUpper?: boolean;
  stripColor?: string;
  stripHex?: string;
  stripPrice?: boolean;
  /** 🔁 แบบตาราง: รูปมากกว่าคอลัมน์ → แถวเดียว เปลี่ยนเองทุก rotateSec วิ (slide/one/all · ท่า rotateFx เฉพาะ one/all) */
  rotate?: "off" | "slide" | "one" | "all";
  rotateFx?: "fade" | "up" | "zoom";
  rotateSec?: number;
  /** รายรูป: code = รหัสรุ่นสินค้า (≤1) → รูปแรก/ชื่อ/ลิงก์ของสินค้า เมื่อไม่ได้ใส่เอง
   *  media "video" = เล่นคลิป videoKey (วนเงียบ · imageKey = รูปปก) — แบบตาราง + แถบวิดีโอ (แถวรูปลุคบุ๊กโชว์รูปปก) */
  items: (ChildBase & { code?: string[]; media?: "image" | "video"; videoKey?: string | null; imageKey: string | null; alt: string; title?: string; caption: string; href?: string; linkText?: string; tabLabel?: string; folderColor?: string })[];
}

/** ปุ่มเดี่ยว — วางคั่นระหว่างเนื้อหาได้ทุกจุด */
export interface ButtonBlock extends BlockBase {
  type: "button";
  text: string;
  href: string;
  /** brand = ปุ่มทึบสีแบรนด์ · outline = ปุ่มขอบบาง */
  variant: "brand" | "outline";
}

/** เส้นคั่น / ช่องเว้นระยะ */
export interface DividerBlock extends BlockBase {
  type: "divider";
  /** line = เส้นบาง · dots = จุดไข่ปลา · space = เว้นว่างเปล่า ๆ */
  variant: "line" | "dots" | "space";
}

/** วิดีโอฝัง — รับเฉพาะ YouTube / Vimeo */
export interface VideoBlock extends BlockBase {
  type: "video";
  url: string;
  title: string;
  caption: string;
}

export interface StepsBlock extends BlockBase {
  type: "steps";
  eyebrow: string;
  title: string;
  subtitle: string;
  items: (ChildBase & { title: string; desc: string })[];
}

export interface ReviewsBlock extends BlockBase {
  type: "reviews";
  eyebrow: string;
  title: string;
  items: (ChildBase & { name: string; text: string; role: string })[];
}

/** HTML+CSS ที่วางเอง (ล้างแล้ว ไม่มี script) */
export interface CustomHtmlBlock extends BlockBase {
  type: "custom-html";
  html: string;
  note: string;
}

/** โชว์สินค้าเด่น — รูปใหญ่ + ตัวอักษรยักษ์ + สลับสินค้า/สี */
export interface SpotlightBlock extends BlockBase {
  type: "spotlight";
  eyebrow: string;
  bigText: string;
  codes: string[];
  showColors: boolean;
  showPrice: boolean;
  primary: CtaLink;
  bgMode: "tint" | "surface" | "custom";
  bgColor: string;
  autoplay: boolean;
  interval: number;
}

/** ตัวเลขเด่น นับขึ้นตอนเลื่อนถึง */
export interface StatsBlock extends BlockBase {
  type: "stats";
  eyebrow: string;
  title: string;
  items: (ChildBase & { value: number; prefix: string; suffix: string; label: string })[];
}

/** ปั๊มชื่อ — ลูกค้าเลือกสินค้าที่ปั๊มได้ พิมพ์ข้อความ เลือกแบบ/ตำแหน่ง */
export interface PersonalizeBlock extends BlockBase {
  type: "personalize";
  eyebrow: string;
  title: string;
  subtitle: string;
  source: "all" | "manual";
  codes: string[];
  buttonText: string;
  /** หน้าตา: classic เดิม · studio A · showcase B (C/D เดิมเลิกใช้ → เว็บร้านแสดงเป็นแบบเดิม) */
  look?: "classic" | "studio" | "showcase";
  /** ของเสริม: ตัวนับตัวอักษร · ข้อความใต้ปุ่ม · ไอเดียชื่อ */
  showCount?: boolean;
  showFree?: boolean;
  freeNote?: string;
  showIdeas?: boolean;
  ideas?: string[];
  /** การซูมรูป: off · hover ชี้แล้วซูม (มือถือแตะ) · circle วงซูมตรงจุดปั๊ม */
  zoomMode?: "off" | "hover" | "circle";
  /** 🖼 แกลเลอรีใต้พรีวิว (รูปของสีที่เลือก + ฉากพรีวิวเพิ่ม) — ไม่ตั้ง = เปิด */
  showGallery?: boolean;
  /** @deprecated ใช้ zoomMode (true = circle) */
  zoom?: boolean;
  /** A สตูดิโอ — ปรับละเอียด */
  imgSide?: "left" | "right";
  imgWidth?: number;
  panelGap?: number;
  inputStyle?: "line" | "box";
  btnWidth?: "full" | "auto";
  stepNums?: boolean;
  liveBadge?: boolean;
  stickyImg?: boolean;
  labelColor?: string;
  labelName?: string;
  labelFinish?: string;
  labelPosition?: string;
  /** 🧭 ตัวเลือกรุ่น: หน้าตา (auto = ตามหน้าตา Section) · ชื่อที่แสดง · ของเสริม */
  pickerStyle?: "auto" | "cards" | "rows" | "pills" | "strip" | "grid";
  /** 🗂 pickerStyle = grid: ค่าตั้งของตารางสินค้าด้านบน (ชุดเดียวกับ Section ตารางสินค้า · คีย์ขึ้นต้น pg_) */
  [gridKey: `pg_${string}`]: unknown;
  pickerName?: "collection" | "code" | "name";
  pickerPrice?: boolean;
  pickerCode?: boolean;
  pickerDots?: boolean;
  pickerTagline?: boolean;
}

/** แผนที่ร้าน — รับเฉพาะลิงก์ฝังของ Google Maps */
export interface MapBlock extends BlockBase {
  type: "map";
  title: string;
  address: string;
  embedUrl: string;
}

export type Block =
  | AnnouncementBlock
  | HeroBlock
  | TwoTracksBlock
  | CategoriesBlock
  | FeaturedBlock
  | ProductsBlock
  | FaqBlock
  | TimelineBlock
  | CountdownBlock
  | DropBlock
  | LookbookBlock
  | RunwayBlock
  | SceneBlock
  | HoverRevealBlock
  | LogosBlock
  | CollectionsBlock
  | FitCheckBlock
  | CtaBlock
  | RichTextBlock
  | ImageBlock
  | ImageTextBlock
  | MulticolumnBlock
  | SlideshowBlock
  | NewsletterBlock
  | GalleryBlock
  | ButtonBlock
  | DividerBlock
  | VideoBlock
  | StepsBlock
  | ReviewsBlock
  | MapBlock
  | CustomHtmlBlock
  | SpotlightBlock
  | StatsBlock
  | PersonalizeBlock
  | CanvasBlock
  | DocBlock
  | OrderTrackBlock
  | ContactFormBlock;

/** ชิ้นบนผืนผ้าใบอิสระ — ช่องตามชนิด (kind) ดู canvasItemFields() ใน lib/website-schema.ts */
export type CanvasItem = ChildBase & {
  kind: "image" | "text" | "button" | "shape";
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
  opacity: number;
  hideMobile: boolean;
  locked: boolean;
  href: string;
  newTab: boolean;
} & Record<string, unknown>;

/** ผืนผ้าใบอิสระ — วางชิ้นส่วนตำแหน่งอิสระบนผืนกว้าง 1200 หน่วย (ดู lib/website-canvas.ts) */
export interface CanvasBlock extends BlockBase {
  type: "canvas";
  height: number;
  bgImageKey: string | null;
  /** รูปพื้นหลัง: cover = เต็มผืน (ตัดส่วนเกิน) · contain = เห็นทั้งรูป */
  bgFit: "cover" | "contain";
  /** ตำแหน่งรูปพื้นหลัง 0–100% (จุดนี้ของรูปอยู่ในจอเสมอ) */
  bgX: number;
  bgY: number;
  /** ซูมรูปพื้นหลัง 100–300% (เฉพาะ cover) */
  bgZoom: number;
  /** มือถือปรับรูปพื้นหลังแยก (false = ใช้ค่าคอม) + ค่าของมือถือ */
  bgMCustom: boolean;
  bgMFit: "cover" | "contain";
  bgMX: number;
  bgMY: number;
  bgMZoom: number;
  mobileAlign: "center" | "left";
  items: CanvasItem[];
}

/** ชื่อ/ไอคอน/คำอธิบาย/กลุ่ม ของทุกชนิด — มาจาก schema */
export const BLOCK_META: Record<BlockType, SectionMeta> = Object.fromEntries(
  SECTION_TYPES.map((t) => [t, SECTION_SCHEMAS[t].meta])
) as Record<BlockType, SectionMeta>;

/**
 * รายการชนิดที่ "เพิ่มได้" ในคลังของร้านนี้ — Section ทดลอง (meta.beta) โชว์เฉพาะร้านที่เปิดสวิตช์นั้น
 * @param betas key ของสวิตช์ที่ร้านเปิดอยู่ เช่น new Set(["beta_canvas"])
 */
export function blockTypesFor(betas: Set<string>): ({ type: BlockType } & SectionMeta)[] {
  return (Object.entries(BLOCK_META) as [BlockType, SectionMeta][])
    .filter(([, m]) => !m.beta || betas.has(m.beta))
    .map(([type, m]) => ({ type, ...m }));
}

const uid = (t: string, n: number) => `${t}-${n}`;
const ALL_VISIBLE: Visibility = { desktop: true, tablet: true, mobile: true };

/* ─────────── ค่าเริ่มต้นจาก schema ─────────── */

function defaultsFromFields(fields: FieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const fd of fields) out[fd.key] = structuredCloneSafe(fd.default ?? defaultForType(fd.type));
  return out;
}

/**
 * บล็อกเปล่า — โรงงานผลิตบล็อกที่เดียวของทั้งระบบ (ทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ)
 *
 * uniqueId:
 *   false (ค่าเริ่มต้น) = รหัสนิ่ง เช่น "hero-2" — ใช้กับโครงหน้าแรกเริ่มต้น (defaultLayout)
 *     ต้องนิ่ง เพราะ API คืนค่านี้ทุกครั้งที่ร้านยังไม่เคยจัดหน้า ถ้ารหัสเปลี่ยนทุกครั้ง
 *     ตัวจัดหน้าจะเข้าใจผิดว่า "มีการแก้" แล้วเด้งบันทึกร่างเอง
 *   true = เติมเลขสุ่มท้าย — ใช้ตอนผู้ใช้กดเพิ่มบล็อกเอง กันรหัสชนกับบล็อกที่มีอยู่
 */
export function newBlock(type: BlockType, seq: number, opts?: { uniqueId?: boolean }): Block {
  const schema = SECTION_SCHEMAS[type];
  if (!schema) throw new Error(`ไม่รู้จักชนิดบล็อก "${type}"`);
  const id = opts?.uniqueId ? `${uid(type, seq)}-${Math.floor(Math.random() * 1000)}` : uid(type, seq);
  const base = { id, type, enabled: true, visibility: { ...ALL_VISIBLE }, style: structuredCloneSafe(DEFAULT_BLOCK_STYLE) };
  const body = defaultsFromFields(schema.fields);
  if (schema.children) {
    const spec = schema.children;
    // starter = ชิ้นตั้งต้นที่ต่างกันตอนวาง Section ใหม่ (เห็นหน้าตาทันที) · ไม่มี = ชิ้นเปล่าเท่าจำนวนขั้นต่ำ
    const starter = spec.starter?.() ?? [];
    const n = starter.length || (spec.min ?? (spec.key === "features" ? 0 : 1));
    body[spec.key] = Array.from({ length: n }, (_, i) => ({
      id: opts?.uniqueId ? newChildId(spec.key) : `${id}-${spec.key}-${i + 1}`,
      enabled: true,
      ...blankChild(spec),
      ...(starter[i] ?? {}),
    }));
  }
  return { ...base, ...body } as Block;
}

/** โครงหน้าแรกเริ่มต้นสำหรับร้านที่ยังไม่เคยจัดหน้า */
export function defaultLayout(): Block[] {
  return [newBlock("announcement", 1), newBlock("hero", 2), newBlock("categories", 3), newBlock("featured", 4), newBlock("faq", 5), newBlock("cta", 6)];
}

/* ─────────── ทำความสะอาดข้อมูลตาม schema ─────────── */

const R2_KEY = /^[a-zA-Z0-9._/-]+$/;
const HEX6 = /^#[0-9a-fA-F]{6}$/;
const str = (v: unknown, fb = "", max = 2000) => (typeof v === "string" ? v.slice(0, max) : fb);
const strArr = (v: unknown, max = 20) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, max).map((x) => (x as string).slice(0, 300)) : [];
const imgKey = (v: unknown): string | null =>
  typeof v === "string" && v.trim() && R2_KEY.test(v.trim()) ? v.trim().slice(0, 300) : null;
const num = (v: unknown, fb: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fb;
};
const linkVal = (v: unknown, fb: CtaLink): CtaLink => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { text: str(o.text, fb.text, 60), href: str(o.href, fb.href, 200) };
};
const vis = (v: unknown): Visibility => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { desktop: o.desktop !== false, tablet: o.tablet !== false, mobile: o.mobile !== false };
};
const pickOne = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fb;

/** โฮสต์วิดีโอที่ยอมให้ฝัง — กันใส่ลิงก์มั่วแล้วโดนยัดสคริปต์เข้าเว็บ */
const VIDEO_HOSTS = ["youtube.com", "www.youtube.com", "youtu.be", "vimeo.com", "player.vimeo.com"];
export const videoUrl = (v: unknown): string => {
  const raw = String(v ?? "").trim().slice(0, 300);
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return "";
    return VIDEO_HOSTS.includes(u.hostname) ? u.toString() : "";
  } catch {
    return "";
  }
};

/** ลิงก์ฝังแผนที่ — รับเฉพาะของ Google Maps ที่เป็น /maps/embed (ลิงก์อื่นยัดอะไรเข้าเว็บก็ได้) */
export const mapUrl = (v: unknown): string => {
  const raw = String(v ?? "").trim().slice(0, 600);
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const okHost = u.hostname === "www.google.com" || u.hostname === "google.com" || u.hostname.endsWith(".google.com");
    return u.protocol === "https:" && okHost && u.pathname.startsWith("/maps/embed") ? u.toString() : "";
  } catch {
    return "";
  }
};

/**
 * ลิงก์ปลายทาง (ช่องชนิด target) — รับเฉพาะ /หน้าในเว็บ · #ส่วนในหน้า · http(s):// · mailto: · tel:
 * กัน javascript: และลิงก์แปลก ๆ หลุดขึ้นเว็บ (เว็บร้านกรองซ้ำอีกชั้น)
 */
export function safeTarget(v: unknown): string {
  const raw = String(v ?? "").trim().slice(0, 300);
  if (!raw) return "";
  if (/^\/(?!\/)/.test(raw) || raw.startsWith("#")) return raw.replace(/\s/g, "");
  if (/^(https?:\/\/|mailto:|tel:)/i.test(raw)) return raw.replace(/\s/g, "");
  return "";
}

/** รหัสหมวด/รหัสสินค้า — ตัวอักษร ตัวเลข ขีด จุด เท่านั้น */
const codeStr = (v: unknown, max = 60) => String(v ?? "").trim().replace(/[^A-Za-z0-9._-]/g, "").slice(0, max);
/** SKU ที่เลือกเอง "CODE:sku-xxxxxxxx" (รหัสรุ่น + ตัวเลือกสีที่ API สินค้าส่งให้เว็บ) · ไม่มีสี = "CODE" · แบบอื่น = ว่าง */
const skuRefStr = (v: unknown): string => {
  const m = /^([A-Za-z0-9._-]{1,40})(?::(sku-[0-9a-f]{8}))?$/i.exec(String(v ?? "").trim());
  return m ? (m[2] ? `${m[1].toUpperCase()}:${m[2].toLowerCase()}` : m[1].toUpperCase()) : "";
};

/** ทำความสะอาดค่า 1 ช่องตามชนิดใน schema */
export function sanitizeField(fd: FieldDef, v: unknown): unknown {
  const fb = fd.default ?? defaultForType(fd.type);
  switch (fd.type) {
    case "text":
    case "emoji":
      return str(v, fb as string, fd.max ?? (fd.type === "emoji" ? 4 : 160));
    case "textarea":
      return str(v, fb as string, fd.max ?? 600);
    case "href":
      return str(v, fb as string, 200);
    case "target":
      return safeTarget(v);
    case "number":
    case "range":
      if (fd.decimals) {
        // ทศนิยม (เช่น วินาที 0.3) — ตัดเข้าช่วง + ปัดตามจำนวนตำแหน่ง
        const n = Number(v);
        const p = 10 ** Math.min(3, fd.decimals);
        return Number.isFinite(n) ? Math.round(Math.max(fd.min ?? 0, Math.min(fd.numMax ?? 999999, n)) * p) / p : (fb as number);
      }
      return num(v, fb as number, fd.min ?? 0, fd.numMax ?? 999999);
    case "select":
      return pickOne(v, (fd.options ?? []).map((o) => o.v), fb as string);
    case "toggle":
      return typeof v === "boolean" ? v : Boolean(fb);
    case "image":
    case "videoFile":
      return imgKey(v);
    case "frameShape":
      return normalizeFrameShape(v);
    case "shopPattern":
      return normalizeShopPattern(v);
    case "patternSlots":
      return normalizePatternSlots(v);
    case "link":
      return linkVal(v, fb as CtaLink);
    case "color":
      return typeof v === "string" && HEX6.test(v.trim()) ? v.trim().toLowerCase() : "";
    case "list":
      return strArr(v, fd.max ?? 20);
    case "video":
      return videoUrl(v);
    case "map":
      return mapUrl(v);
    case "products":
      return Array.isArray(v) ? [...new Set(v.map((c) => codeStr(c)).filter(Boolean))].slice(0, fd.max ?? 24) : [];
    case "categories":
      return Array.isArray(v) ? [...new Set(v.map((c) => codeStr(c, 40).toLowerCase()).filter(Boolean))].slice(0, fd.max ?? 40) : [];
    case "categoryImages": {
      // { รหัสหมวด: r2 key } — รหัส/รูปที่ใช้ไม่ได้ถูกตัดทิ้ง · สูงสุด 80 หมวด (เท่ากับเพดานหมวดของร้าน)
      const out: Record<string, string> = {};
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 80)) {
          const key = codeStr(k, 40).toLowerCase();
          const img = imgKey(x);
          if (key && img) out[key] = img;
        }
      }
      return out;
    }
    case "skus":
      return Array.isArray(v) ? [...new Set(v.map((x) => skuRefStr(x)).filter(Boolean))].slice(0, fd.max ?? 24) : [];
    case "categoryImageLists": {
      // { รหัสหมวด: r2 key[] } — รูปวนรายหมวด · หมวดละไม่เกิน 8 รูป (ไม่ซ้ำ) · สูงสุด 80 หมวด
      const out: Record<string, string[]> = {};
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 80)) {
          const key = codeStr(k, 40).toLowerCase();
          const list = [...new Set((Array.isArray(x) ? x : []).map(imgKey).filter((s): s is string => !!s))].slice(0, 8);
          if (key && list.length) out[key] = list;
        }
      }
      return out;
    }
    case "categoryNames": {
      // { รหัสหมวด: ชื่อ } — ชื่อว่าง/รหัสใช้ไม่ได้ถูกตัดทิ้ง · ชื่อยาวสุด 60 ตัว · สูงสุด 80 หมวด
      const out: Record<string, string> = {};
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 80)) {
          const key = codeStr(k, 40).toLowerCase();
          // ไม่ตัดช่องว่างหัว/ท้ายที่นี่ (กำลังพิมพ์อยู่ก็ผ่านตัวนี้ — เว็บร้าน trim ตอนโชว์)
          const name = typeof x === "string" ? x.replace(/\s+/g, " ").slice(0, 60) : "";
          if (key && name.trim()) out[key] = name;
        }
      }
      return out;
    }
    case "productImages": {
      // { รหัสรุ่น: r2 key } — รหัส/รูปที่ใช้ไม่ได้ถูกตัดทิ้ง · สูงสุด 24 รุ่น
      const out: Record<string, string> = {};
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 24)) {
          const code = codeStr(k);
          const img = imgKey(x);
          if (code && img) out[code] = img;
        }
      }
      return out;
    }
    case "datetime":
      // วันเวลาไทย "YYYY-MM-DDTHH:mm" — รูปแบบอื่น = ว่าง
      return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.trim()) ? v.trim() : "";
    case "point": {
      // จุดบนรูป { x, y } เป็น % (ทศนิยม 1 ตำแหน่ง) — ค่าแปลก ๆ = กลางรูป
      const o = (v ?? {}) as Record<string, unknown>;
      const n = (x: unknown) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Math.max(0, Math.min(100, Math.round(Number(x) * 10) / 10)) : 50);
      return { x: n(o.x), y: n(o.y) };
    }
    case "crop": {
      // ส่วนที่เห็นของรูป { x, y (0–100 %), zoom (100–300 %) } — ค่าแปลก ๆ = กลางรูป ไม่ซูม
      const o = (v ?? {}) as Record<string, unknown>;
      const n = (x: unknown, fb: number, lo: number, hi: number) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Math.max(lo, Math.min(hi, Math.round(Number(x)))) : fb);
      return { x: n(o.x, 50, 0, 100), y: n(o.y, 50, 0, 100), zoom: n(o.zoom, 100, 100, 300) };
    }
    case "category":
      return codeStr(v, 40).toLowerCase();
    case "code":
      return sanitizeCustomHtml(v, fd.max ?? 40000);
  }
}

/** ชิ้นย่อยใน Section — เติม id/enabled ให้ครบ (ข้อมูลเก่าที่ไม่มี id จะได้รหัสนิ่งจากลำดับ) */
function sanitizeChildren(spec: ChildSpec, raw: unknown, parentId: string): Record<string, unknown>[] {
  const list = Array.isArray(raw) ? (raw as unknown[]) : [];
  return list.slice(0, spec.max).map((item, i) => {
    const o = (item ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {
      id: str(o.id, "", 80) || `${parentId}-${spec.key}-${i + 1}`,
      enabled: o.enabled !== false,
    };
    if (o.visibility && typeof o.visibility === "object") out.visibility = vis(o.visibility);
    for (const fd of spec.fields) out[fd.key] = sanitizeField(fd, o[fd.key]);
    sanitizeTranslations(spec.fields, o, out); // 🌐 ภาษาอังกฤษ (`<key>_en`) — ไม่งั้นถูกทิ้งตอนบันทึก
    return out;
  });
}

/** รูปพื้นหลังของ Section — ไม่ใช่ object = ไม่มี (undefined) · ค่าเพี้ยน = ค่าเริ่มต้น */
function sanitizeBgImage(v: unknown): BlockBgImage | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const d = DEFAULT_BG_IMAGE;
  const n = (x: unknown, lo: number, hi: number, fb: number) => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : fb);
  return {
    key: imgKey(o.key),
    fit: pickOne(o.fit, BG_IMAGE_FITS, d.fit),
    pos: pickOne(o.pos, BG_IMAGE_POSES, d.pos),
    fx: pickOne(o.fx, BG_IMAGE_FXS, d.fx),
    speed: pickOne(o.speed, MOTION_SPEEDS, d.speed),
    dim: n(o.dim, 0, 90, d.dim),
    tone: o.tone === "light" ? "light" : "dark",
    blur: n(o.blur, 0, 20, d.blur),
  };
}

/** หน้าตาของบล็อก — บล็อกเก่าที่ยังไม่มี style จะได้ค่าเริ่มต้นเสมอ (เว็บแสดงผลเหมือนเดิม) */
/** สี (ชื่อสีธีม/"custom"+hex/"auto") — สีเองไม่มีรหัส = auto */
function colorPair(c: unknown, h: unknown): { color: string; colorHex: string } {
  const colorHex = typeof h === "string" && HEX6.test(h.trim()) ? h.trim().toLowerCase() : "";
  const color = pickOne(c, TEXT_COLORS, "auto");
  return { color: color === "custom" && !colorHex ? "auto" : color, colorHex };
}
/** สีเส้นของ 🎨 ลายของร้าน: "none" = ไม่มีเส้น · สีธีม · custom + สีเอง (custom ไม่มีสี = ไม่มีเส้น) */
function linePair(c: unknown, h: unknown): { lineColor: string; lineColorHex: string } {
  const lineColorHex = typeof h === "string" && HEX6.test(h.trim()) ? h.trim().toLowerCase() : "";
  const lineColor = pickOne(c, ["none", ...CANVAS_COLORS.map((o) => o.v)], "none");
  return { lineColor: lineColor === "custom" && !lineColorHex ? "none" : lineColor, lineColorHex };
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function sanitizePattern(v: unknown): BlockPattern | undefined {
  if (!isObj(v)) return undefined;
  const d = DEFAULT_PATTERN;
  return { kind: pickOne(v.kind, PATTERN_KINDS, d.kind), ...colorPair(v.color, v.colorHex), opacity: num(v.opacity, d.opacity, 3, 60), size: pickOne(v.size, LAYER_SIZES, d.size) };
}
function sanitizeEdge(v: unknown): BlockEdge | undefined {
  if (!isObj(v)) return undefined;
  const d = DEFAULT_EDGE;
  return { shape: pickOne(v.shape, EDGE_SHAPES, d.shape), height: num(v.height, d.height, 16, 200), flip: v.flip === true, ...colorPair(v.color, v.colorHex) };
}
function sanitizeBox(v: unknown): BlockBox | undefined {
  if (!isObj(v)) return undefined;
  const d = DEFAULT_BOX;
  return {
    on: v.on === true,
    ...colorPair(v.color, v.colorHex),
    opacity: num(v.opacity, d.opacity, 40, 100),
    radius: pickOne(v.radius, BOX_RADII, d.radius),
    gap: pickOne(v.gap, LAYER_SIZES, d.gap),
    shadow: v.shadow === true,
    border: v.border === true,
  };
}

const DECOR_SHAPES = CANVAS_SHAPES.map((o) => o.v);
const DECOR_FONTS = ["display", "body", ...CANVAS_FONTS.map((o) => o.v).filter((f) => f !== "display" && f !== "body")];
/** ตัวเลขทศนิยม 1 ตำแหน่ง (ตำแหน่ง/ขนาดเป็น % — ลากละเอียดได้) */
const num1 = (v: unknown, fb: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n * 10) / 10)) : fb;
};
/** ตำแหน่งจอแท็บเล็ต/มือถือ (ไม่ใช่ object = ไม่ได้ปรับแยก) — ขอบเขตเดียวกับช่องของคอม */
function sanitizeDecorPlace(v: unknown, kind: DecorKind, base: DecorPlace): DecorPlace | null {
  if (!isObj(v)) return null;
  return {
    x: num1(v.x, base.x, -20, 120),
    y: num1(v.y, base.y, -20, 120),
    w: num1(v.w, base.w, 0, 100),
    size: num(v.size, base.size, 10, 240),
    rotate: num(v.rotate, base.rotate, -180, 180),
  };
}
function sanitizeDecorItem(v: unknown, i: number): DecorItem | null {
  if (!isObj(v)) return null;
  const d = DEFAULT_DECOR;
  const kind = pickOne(v.kind, DECOR_KINDS, "shape");
  const key = imgKey(v.key) ?? "";
  const text = str(v.text, "", 120).trim();
  // รูปไม่มีไฟล์ / ข้อความว่าง = ไม่มีอะไรให้วาด → ทิ้ง
  if ((kind === "image" && !key) || (kind === "text" && !text)) return null;
  const shape = pickOne(v.shape, DECOR_SHAPES, d.shape);
  const pattern = kind === "shape" ? normalizeShopPattern(v.pattern) : null;
  const id = str(v.id, "", 40).replace(/[^\w-]/g, "");
  const base: DecorPlace = {
    x: num1(v.x, d.x, -20, 120),
    y: num1(v.y, d.y, -20, 120),
    w: num1(v.w, kind === "text" ? 0 : d.w, 0, 100),
    size: num(v.size, d.size, 10, 240),
    rotate: num(v.rotate, 0, -180, 180),
  };
  return {
    id: id || `dc-${i + 1}`,
    kind,
    shape,
    outline: v.outline === true,
    key,
    ratio: num1(v.ratio, kind === "shape" ? DECOR_SHAPE_RATIO[shape] ?? 1 : 1, 0.02, 4),
    text,
    font: pickOne(v.font, DECOR_FONTS, d.font),
    size: base.size,
    ...colorPair(v.color, v.colorHex),
    x: base.x,
    y: base.y,
    w: base.w,
    rotate: base.rotate,
    opacity: num(v.opacity, d.opacity, 5, 100),
    layer: pickOne(v.layer, DECOR_LAYERS, d.layer),
    anim: pickOne(v.anim, DECOR_ANIMS, d.anim),
    hideDesktop: v.hideDesktop === true,
    hideTablet: v.hideTablet === true,
    hideMobile: v.hideMobile === true,
    tab: sanitizeDecorPlace(v.tab, kind, base),
    mob: sanitizeDecorPlace(v.mob, kind, base),
    flip: v.flip === true,
    pattern,
    patMode: pattern ? pickOne(v.patMode, SHOP_PATTERN_MODES, d.patMode) : d.patMode,
    ...linePair(v.lineColor, v.lineColorHex),
    strokeWidth: num1(v.strokeWidth, d.strokeWidth, 0.5, 24),
    patSlots: pattern ? normalizePatternSlots(v.patSlots) : [],
  };
}
function sanitizeDecor(v: unknown): DecorItem[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<string>();
  const out: DecorItem[] = [];
  v.forEach((x, i) => {
    const it = sanitizeDecorItem(x, i);
    if (!it || out.length >= DECOR_MAX) return;
    if (seen.has(it.id)) it.id = `${it.id}-${i + 1}`;
    seen.add(it.id);
    out.push(it);
  });
  return out.length ? out : undefined;
}

export function sanitizeStyle(v: unknown): BlockStyle {
  const o = (v ?? {}) as Record<string, unknown>;
  const d = DEFAULT_BLOCK_STYLE;
  const bgColor = typeof o.bgColor === "string" && HEX6.test(o.bgColor.trim()) ? o.bgColor.trim().toLowerCase() : "";
  const bg = pickOne(o.bg, BLOCK_BGS, d.bg);
  const bgGrad = sanitizeGradient(o.bgGrad);
  const bgImg = sanitizeBgImage(o.bgImg);
  const m = (o.mobile ?? {}) as Record<string, unknown>;
  const mo = (o.motion ?? {}) as Record<string, unknown>;
  const tx = (o.text ?? {}) as Record<string, unknown>;
  const hex = (v: unknown) => (typeof v === "string" && HEX6.test(v.trim()) ? v.trim().toLowerCase() : "");
  const colorHex = hex(tx.colorHex);
  const subColorHex = hex(tx.subColorHex);
  const color = pickOne(tx.color, TEXT_COLORS, "auto");
  const subColor = pickOne(tx.subColor, TEXT_COLORS, "auto");
  const bodyColorHex = hex(tx.bodyColorHex);
  const bodyColor = pickOne(tx.bodyColor, TEXT_COLORS, "auto");
  return {
    padTop: pickOne(o.padTop, BLOCK_SPACINGS, d.padTop),
    padBottom: pickOne(o.padBottom, BLOCK_SPACINGS, d.padBottom),
    // เลือก "สีเอง"/"ไล่สี" แต่ยังไม่ได้ใส่สี → ถือว่าไม่ได้ตั้ง กันบล็อกกลายเป็นพื้นโปร่งแปลก ๆ
    bg: (bg === "custom" && !bgColor) || (bg === "gradient" && !bgGrad) || (bg === "image" && !bgImg?.key) ? d.bg : bg,
    bgColor,
    // เก็บสีไล่/รูปพื้นหลังไว้แม้สลับไปแบบอื่น (สลับกลับมาแล้วได้ของเดิม)
    ...(bgGrad ? { bgGrad } : {}),
    ...(bgImg ? { bgImg } : {}),
    width: pickOne(o.width, BLOCK_WIDTHS, d.width),
    align: pickOne(o.align, BLOCK_ALIGNS, d.align),
    mobile: {
      padTop: pickOne(m.padTop, BLOCK_SPACINGS, "auto"),
      padBottom: pickOne(m.padBottom, BLOCK_SPACINGS, "auto"),
      align: pickOne(m.align, BLOCK_ALIGNS, "auto"),
      hSize: pickOne(m.hSize, TEXT_SIZES, "auto"),
      hideEyebrow: m.hideEyebrow === true,
      hideSub: m.hideSub === true,
    },
    // เลือก "สีเอง" แต่ยังไม่ได้ใส่สี → ถือว่าไม่ได้ตั้ง (เหมือนพื้นหลัง)
    text: {
      font: pickOne(tx.font, TEXT_FONTS, "auto"),
      size: pickOne(tx.size, TEXT_SIZES, "auto"),
      weight: pickOne(tx.weight, TEXT_WEIGHTS, "auto"),
      color: color === "custom" && !colorHex ? "auto" : color,
      colorHex,
      subColor: subColor === "custom" && !subColorHex ? "auto" : subColor,
      subColorHex,
      spacing: pickOne(tx.spacing, TEXT_SPACINGS, "auto"),
      upper: tx.upper === true,
      italic: tx.italic === true,
      eyeFont: pickOne(tx.eyeFont, TEXT_FONTS, "auto"),
      eyeSize: pickOne(tx.eyeSize, EYE_SIZES, "auto"),
      eyeSpacing: pickOne(tx.eyeSpacing, TEXT_SPACINGS, "auto"),
      eyeCase: pickOne(tx.eyeCase, TEXT_CASES, "auto"),
      bodyFont: pickOne(tx.bodyFont, TEXT_FONTS, "auto"),
      bodyColor: bodyColor === "custom" && !bodyColorHex ? "auto" : bodyColor,
      bodyColorHex,
      bodySpacing: pickOne(tx.bodySpacing, TEXT_SPACINGS, "auto"),
      bodyUpper: tx.bodyUpper === true,
      btnFont: pickOne(tx.btnFont, TEXT_FONTS, "auto"),
      btnCase: pickOne(tx.btnCase, TEXT_CASES, "auto"),
      btnSpacing: pickOne(tx.btnSpacing, TEXT_SPACINGS, "auto"),
    },
    motion: {
      entrance: pickOne(mo.entrance, MOTION_ENTRANCES, "none"),
      stagger: mo.stagger === true,
      hover: pickOne(mo.hover, MOTION_HOVERS, "none"),
      speed: pickOne(mo.speed, MOTION_SPEEDS, "normal"),
    },
    // 🎨 ลวดลาย · ขอบบน/ล่าง · กล่องเนื้อหา — เก็บเฉพาะที่เคยตั้ง (ปิดแล้วค่าเดิมยังอยู่ เปิดใหม่ได้ของเดิม)
    ...((p) => (p ? { pattern: p } : {}))(sanitizePattern(o.pattern)),
    ...((e) => (e ? { edgeTop: e } : {}))(sanitizeEdge(o.edgeTop)),
    ...((e) => (e ? { edgeBottom: e } : {}))(sanitizeEdge(o.edgeBottom)),
    ...((b) => (b ? { box: b } : {}))(sanitizeBox(o.box)),
    ...((dc) => (dc ? { decor: dc } : {}))(sanitizeDecor(o.decor)),
  };
}

/**
 * ทำให้ข้อมูลที่มาจาก DB/ฟอร์มปลอดภัยและครบเสมอ (อ่านกติกาจาก schema)
 * บล็อกชนิดที่ไม่รู้จัก (เช่นของร้านอื่น) จะถูกเก็บไว้ทั้งก้อน ไม่แก้ไข
 */
export function normalizeBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];

  raw.slice(0, 60).forEach((item, i) => {
    const b = (item ?? {}) as Record<string, unknown>;
    const type = str(b.type) as BlockType;
    const schema = SECTION_SCHEMAS[type];
    if (!schema) {
      // ชนิดที่ระบบนี้ไม่รู้จัก = ของร้านที่ใช้ระบบเดิม (เช่น Pixiedustie ใช้ "product-grid")
      // ⚠️ ต้องเก็บไว้ทั้งก้อนแบบไม่แตะ — เดิมทิ้งทันที ทำให้กด "เผยแพร่" ครั้งเดียว
      // บล็อกของร้านนั้นหายจากเว็บจริง (ตัวจัดหน้าจะโชว์เป็น 🧩 แก้ไม่ได้ แต่ไม่หาย)
      if (typeof b.type === "string" && b.type.trim()) out.push(item as Block);
      return;
    }

    const id = str(b.id, uid(type, i + 1), 60);
    const block: Record<string, unknown> = {
      id,
      type,
      enabled: b.enabled !== false,
      visibility: vis(b.visibility),
      style: sanitizeStyle(b.style),
    };
    const ab = sanitizeAb(b.ab);
    if (ab) block.ab = ab;
    const name = cleanBlockName(b.name);
    if (name) block.name = name;
    for (const fd of schema.fields) block[fd.key] = sanitizeField(fd, b[fd.key]);
    sanitizeTranslations(schema.fields, b, block); // 🌐 ภาษาอังกฤษ (`<key>_en`) — ไม่งั้นถูกทิ้งตอนบันทึก
    if (schema.children) block[schema.children.key] = sanitizeChildren(schema.children, b[schema.children.key], id);
    out.push(block as unknown as Block);
  });

  return out;
}

/* ─────────── ตรวจก่อนเผยแพร่ ─────────── */

const isEmptyValue = (fd: FieldDef, v: unknown): boolean => {
  if (fd.type === "list" || fd.type === "products" || fd.type === "skus" || fd.type === "categories") return !Array.isArray(v) || !v.filter((x) => (typeof x === "string" ? x.trim() : x)).length;
  if (fd.type === "image" || fd.type === "videoFile") return !v;
  if (fd.type === "link") return !String((v as CtaLink | undefined)?.text ?? "").trim();
  return !String(v ?? "").trim();
};

/** ตรวจปัญหาที่พบบ่อยก่อนเผยแพร่ (ไม่บังคับ — แค่เตือน) · helpPage = หน้าในศูนย์ช่วยเหลือ (มีหัวแถวชื่อหน้าอยู่แล้ว ไม่ต้องมี Hero) */
export function validateBlocks(blocks: Block[], opts: { helpPage?: boolean } = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const active = blocks.filter((b) => b.enabled);

  if (!active.length) issues.push({ blockId: null, level: "error", message: "ยังไม่มีบล็อกที่เปิดใช้งาน — หน้าจะว่างเปล่า" });

  const heroes = active.filter((b) => b.type === "hero");
  // ผืนผ้าใบอิสระมักใช้เป็นหัวเว็บแทนแบนเนอร์ · 🆕 ชุดมาใหม่ที่โชว์แบนเนอร์ชุด (หน้า /new/<ชุด>) ก็เป็นหัวเรื่องแล้ว → ไม่ต้องเตือนว่าไม่มี Hero
  const hasHeader = opts.helpPage || active.some((b) => b.type === "canvas" || (b.type === "drop" && b.banner !== "none"));
  if (heroes.length === 0 && !hasHeader) issues.push({ blockId: null, level: "warning", message: "ไม่มีแบนเนอร์หลัก (Hero) — หน้าอาจดูไม่มีหัวเรื่อง" });
  if (heroes.length > 1) issues.push({ blockId: null, level: "warning", message: `มีแบนเนอร์หลัก ${heroes.length} อัน — ควรมีอันเดียวเพื่อ SEO` });

  // 🧪 A/B: ชื่อการทดสอบเดียวกันต้องมีทั้งแบบ A และ B (มีแบบเดียว = คนอีกครึ่งไม่เห็น Section นี้เลย)
  const abSeen = new Map<string, Set<string>>();
  for (const b of active) if (b.ab) abSeen.set(b.ab.exp, (abSeen.get(b.ab.exp) ?? new Set()).add(b.ab.variant));
  for (const [exp, vs] of abSeen) {
    if (vs.size < 2) {
      const only = [...vs][0];
      const first = active.find((b) => b.ab?.exp === exp);
      issues.push({ blockId: first?.id ?? null, level: "warning", message: `ทดสอบ A/B "${exp}" มีแค่แบบ ${only} — ต้องมีแบบ ${only === "A" ? "B" : "A"} ด้วย ไม่งั้นลูกค้าครึ่งหนึ่งไม่เห็น Section นี้` });
    }
  }

  for (const b of active) {
    const schema = SECTION_SCHEMAS[b.type];
    // บล็อกชนิดที่ไม่รู้จัก (ของร้านระบบเดิม) ไม่มี schema — ข้ามไป อย่าตรวจ อย่าพัง
    if (!schema) continue;
    const label = blockDisplayName(b);
    const rec = b as unknown as Record<string, unknown>;

    const v = b.visibility;
    if (v && !v.desktop && !v.tablet && !v.mobile)
      issues.push({ blockId: b.id, level: "warning", message: `${label}: ซ่อนทุกอุปกรณ์ — จะไม่แสดงที่ไหนเลย` });

    // ช่องที่ schema บอกว่าต้องกรอก (ข้ามช่องที่ซ่อนอยู่เพราะ showIf ไม่ตรง)
    for (const fd of schema.fields) {
      if (!fd.required) continue;
      if (!matchShowIf(fd, rec)) continue;
      // อย่างใดอย่างหนึ่ง (requiredOr) — ช่องคู่มีค่าแล้ว = ผ่าน (เช่น มีคลิปมือถือ ไม่ต้องมีคลิปคอม)
      const alt = fd.requiredOr ? schema.fields.find((x) => x.key === fd.requiredOr) : undefined;
      if (alt && !isEmptyValue(alt, rec[alt.key])) continue;
      if (isEmptyValue(fd, rec[fd.key]))
        issues.push({ blockId: b.id, level: "error", message: `${label}: ${fd.requiredMessage ?? `ยังไม่ได้กรอก "${fd.label}"`}` });
    }

    for (const extra of schema.validate?.(rec, label) ?? []) issues.push({ blockId: b.id, ...extra });
  }

  return issues;
}

/** ข้อความสรุปของบล็อก (ใช้ในต้นไม้ด้านซ้ายของตัวจัดหน้า) */
export function blockSummary(b: Record<string, unknown>): string {
  const schema = SECTION_SCHEMAS[String(b.type)];
  if (!schema) return String(b.title ?? "") || "บล็อกของระบบเดิม";
  try {
    return schema.summary(b) || "—";
  } catch {
    return "—";
  }
}
