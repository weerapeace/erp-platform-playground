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
import { CANVAS_COLORS, CANVAS_FONTS, CANVAS_WEIGHTS } from "@/lib/website-canvas";

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
  | "logos"
  | "collections"
  | "fitcheck"
  | "beltbuilder";

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
export type BlockBg = "auto" | "page" | "surface" | "brand" | "ink" | "custom" | "gradient";

export const BLOCK_SPACINGS: readonly BlockSpacing[] = ["auto", "none", "sm", "md", "lg"];
export const BLOCK_WIDTHS: readonly BlockWidth[] = ["auto", "narrow", "full"];
export const BLOCK_ALIGNS: readonly BlockAlign[] = ["auto", "left", "center", "right"];
export const BLOCK_BGS: readonly BlockBg[] = ["auto", "page", "surface", "brand", "ink", "custom", "gradient"];

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
}
export const DEFAULT_BLOCK_TEXT: BlockText = { font: "auto", size: "auto", weight: "auto", color: "auto", colorHex: "", subColor: "auto", subColorHex: "" };

/** ลูกเล่น — โผล่ตอนเลื่อนถึง / ตอนชี้เมาส์ · "none" = ไม่มี (ค่าเริ่มต้น หน้าเว็บเหมือนเดิม) */
export type MotionEntrance = "none" | "fade-up" | "fade-in" | "slide-left" | "slide-right" | "zoom" | "pop" | "spin-in" | "blur";
export type MotionHover = "none" | "lift" | "zoom" | "glow";
export type MotionSpeed = "normal" | "slow" | "fast";
/** ⚠️ CSS ของกลาง [data-motion] ที่เว็บร้าน globals.css — ผืนผ้าใบใช้ชุดเดียวกันต่อชิ้น (CANVAS_ENTRANCES) */
export const MOTION_ENTRANCES: readonly MotionEntrance[] = ["none", "fade-up", "fade-in", "slide-left", "slide-right", "zoom", "pop", "spin-in", "blur"];
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

/** หน้าตาของบล็อก — แยกจาก "เนื้อหา" ทุกชนิดบล็อกมีชุดนี้เหมือนกัน */
export interface BlockStyle {
  padTop: BlockSpacing;
  padBottom: BlockSpacing;
  bg: BlockBg;
  /** ใช้เมื่อ bg = "custom" เท่านั้น (#rrggbb) */
  bgColor: string;
  /** ใช้เมื่อ bg = "gradient" (ของกลาง lib/website-gradient.ts) */
  bgGrad?: GradientValue;
  width: BlockWidth;
  align: BlockAlign;
  /** ตั้งทับเฉพาะจอมือถือ (< 768px) */
  mobile: BlockStyleMobile;
  /** ลูกเล่น (แผง "✨ ลูกเล่น") */
  motion: BlockMotion;
  /** ตัวอักษรหัวข้อ (แผง "🔤 ตัวอักษร") */
  text: BlockText;
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
  /** วิดีโอพื้นหลัง (mp4/webm) — ว่าง = ใช้รูป */
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
/** 🛍 ลุคบุ๊กกดซื้อได้ — spots[].pos = % บนรูป */
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
  mode?: "single" | "slides";
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
  items: (ChildBase & { imageKey: string | null; alt: string; title?: string; caption: string; href?: string; linkText?: string })[];
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
  | LookbookBlock
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
  | CanvasBlock;

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
    const n = schema.children.min ?? (schema.children.key === "features" ? 0 : 1);
    body[schema.children.key] = Array.from({ length: n }, (_, i) => ({
      id: opts?.uniqueId ? newChildId(schema.children!.key) : `${id}-${schema.children!.key}-${i + 1}`,
      enabled: true,
      ...blankChild(schema.children!),
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
      return num(v, fb as number, fd.min ?? 0, fd.numMax ?? 999999);
    case "select":
      return pickOne(v, (fd.options ?? []).map((o) => o.v), fb as string);
    case "toggle":
      return typeof v === "boolean" ? v : Boolean(fb);
    case "image":
    case "videoFile":
      return imgKey(v);
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

/** หน้าตาของบล็อก — บล็อกเก่าที่ยังไม่มี style จะได้ค่าเริ่มต้นเสมอ (เว็บแสดงผลเหมือนเดิม) */
export function sanitizeStyle(v: unknown): BlockStyle {
  const o = (v ?? {}) as Record<string, unknown>;
  const d = DEFAULT_BLOCK_STYLE;
  const bgColor = typeof o.bgColor === "string" && HEX6.test(o.bgColor.trim()) ? o.bgColor.trim().toLowerCase() : "";
  const bg = pickOne(o.bg, BLOCK_BGS, d.bg);
  const bgGrad = sanitizeGradient(o.bgGrad);
  const m = (o.mobile ?? {}) as Record<string, unknown>;
  const mo = (o.motion ?? {}) as Record<string, unknown>;
  const tx = (o.text ?? {}) as Record<string, unknown>;
  const hex = (v: unknown) => (typeof v === "string" && HEX6.test(v.trim()) ? v.trim().toLowerCase() : "");
  const colorHex = hex(tx.colorHex);
  const subColorHex = hex(tx.subColorHex);
  const color = pickOne(tx.color, TEXT_COLORS, "auto");
  const subColor = pickOne(tx.subColor, TEXT_COLORS, "auto");
  return {
    padTop: pickOne(o.padTop, BLOCK_SPACINGS, d.padTop),
    padBottom: pickOne(o.padBottom, BLOCK_SPACINGS, d.padBottom),
    // เลือก "สีเอง"/"ไล่สี" แต่ยังไม่ได้ใส่สี → ถือว่าไม่ได้ตั้ง กันบล็อกกลายเป็นพื้นโปร่งแปลก ๆ
    bg: (bg === "custom" && !bgColor) || (bg === "gradient" && !bgGrad) ? d.bg : bg,
    bgColor,
    // เก็บสีไล่ไว้แม้สลับไปแบบอื่น (สลับกลับมาแล้วได้ของเดิม)
    ...(bgGrad ? { bgGrad } : {}),
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
    },
    motion: {
      entrance: pickOne(mo.entrance, MOTION_ENTRANCES, "none"),
      stagger: mo.stagger === true,
      hover: pickOne(mo.hover, MOTION_HOVERS, "none"),
      speed: pickOne(mo.speed, MOTION_SPEEDS, "normal"),
    },
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

/** ตรวจปัญหาที่พบบ่อยก่อนเผยแพร่ (ไม่บังคับ — แค่เตือน) */
export function validateBlocks(blocks: Block[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const active = blocks.filter((b) => b.enabled);

  if (!active.length) issues.push({ blockId: null, level: "error", message: "ยังไม่มีบล็อกที่เปิดใช้งาน — หน้าจะว่างเปล่า" });

  const heroes = active.filter((b) => b.type === "hero");
  // ผืนผ้าใบอิสระมักใช้เป็นหัวเว็บแทนแบนเนอร์ → มีแล้วไม่ต้องเตือนว่าไม่มี Hero
  if (heroes.length === 0 && !active.some((b) => b.type === "canvas")) issues.push({ blockId: null, level: "warning", message: "ไม่มีแบนเนอร์หลัก (Hero) — หน้าอาจดูไม่มีหัวเรื่อง" });
  if (heroes.length > 1) issues.push({ blockId: null, level: "warning", message: `มีแบนเนอร์หลัก ${heroes.length} อัน — ควรมีอันเดียวเพื่อ SEO` });

  for (const b of active) {
    const schema = SECTION_SCHEMAS[b.type];
    // บล็อกชนิดที่ไม่รู้จัก (ของร้านระบบเดิม) ไม่มี schema — ข้ามไป อย่าตรวจ อย่าพัง
    if (!schema) continue;
    const label = schema.meta.label;
    const rec = b as unknown as Record<string, unknown>;

    const v = b.visibility;
    if (v && !v.desktop && !v.tablet && !v.mobile)
      issues.push({ blockId: b.id, level: "warning", message: `${label}: ซ่อนทุกอุปกรณ์ — จะไม่แสดงที่ไหนเลย` });

    // ช่องที่ schema บอกว่าต้องกรอก (ข้ามช่องที่ซ่อนอยู่เพราะ showIf ไม่ตรง)
    for (const fd of schema.fields) {
      if (!fd.required) continue;
      if (!matchShowIf(fd, rec)) continue;
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
