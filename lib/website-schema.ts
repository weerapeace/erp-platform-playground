/**
 * ของกลาง — "Schema" ของ Section และ Block ของหน้าเว็บร้าน (Schema-Driven Page Builder)
 *
 * โครง: Page → Sections (บล็อกระดับบน) → Blocks (รายการย่อยใน Section เช่น คำถาม FAQ, สไลด์, คอลัมน์) → Settings
 *
 * ไฟล์นี้คือ "แหล่งเดียว" ที่บอกว่า Section ชนิดไหน
 *   - มีช่องตั้งค่าอะไร (fields: ชนิดช่อง/ป้ายไทย/ค่าเริ่มต้น/ขีดจำกัด)
 *   - มี Block ย่อยไหม ชนิดไหน ใส่ได้กี่ชิ้น (children)
 *   - ตรวจอะไรก่อนเผยแพร่ (validate)
 *
 * ทุกอย่างที่เหลือ "อ่านจากที่นี่" โดยอัตโนมัติ:
 *   lib/website-blocks.ts    → newBlock / normalizeBlocks / validateBlocks / BLOCK_META
 *   components/website-schema-form.tsx → ฟอร์มตั้งค่าในหน้าจัดการ (วาดเองจาก fields ไม่ต้องเขียนฟอร์มต่อชนิด)
 *   /api/public/storefront/schema → เว็บร้านดึงไปเทียบว่าตัวแสดงผลครบทุกชนิดไหม
 *
 * กฎสำคัญ:
 *   1. ชื่อฟิลด์ (key) ต้องตรงกับที่เว็บร้านอ่าน (src/lib/blocks.ts) — เปลี่ยนชื่อ = เว็บไม่ขึ้น
 *   2. รูปแบบข้อมูลที่เก็บใน DB ไม่เปลี่ยน: ค่าตั้งค่าอยู่ระดับบนของบล็อกเหมือนเดิม (ไม่ซ้อนใน settings)
 *      → ร้านที่จัดหน้าไว้แล้ว (IG, Louis) เปิดมาเหมือนเดิมทุกประการ
 *   3. เพิ่ม Section ใหม่ = เพิ่มก้อนเดียวใน SECTION_SCHEMAS + ตัวแสดงผล 1 ตัวที่เว็บร้าน
 */

import {
  CANVAS_BORDERS,
  CANVAS_BORDERS_ON,
  CANVAS_BUTTON_VARIANTS,
  CANVAS_COLORS,
  CANVAS_ENTRANCES,
  CANVAS_FONTS,
  CANVAS_FRAMES,
  CANVAS_HOVERS,
  CANVAS_KINDS,
  CANVAS_SHOP_MAX,
  CANVAS_LOOPS,
  CANVAS_SHAPES,
  CANVAS_SPEEDS,
  CANVAS_TEXT_BGS,
  CANVAS_WEIGHTS,
  canvasItemPreset,
  canvasItemSummary,
  validateCanvas,
} from "@/lib/website-canvas";
import { GRAD_DIRS } from "@/lib/website-gradient";

/* ─────────── ชนิดช่องตั้งค่า ─────────── */

export type FieldType =
  | "text" // ข้อความบรรทัดเดียว
  | "textarea" // หลายบรรทัด
  | "number" // ตัวเลขมีขั้นต่ำ/สูงสุด
  | "range" // ตัวเลขแบบแถบเลื่อน (เช่น ความทึบ %)
  | "select" // เลือกจากรายการ
  | "toggle" // เปิด/ปิด
  | "image" // รูป (r2 key) — เลือกจากคลัง/อัปโหลด
  | "link" // ปุ่ม/ลิงก์ = { text, href }
  | "href" // ลิงก์อย่างเดียว (string)
  | "target" // ลิงก์ปลายทางแบบเลือกจากรายการ (หน้า/หมวด/สินค้า/ส่วนในหน้า/ภายนอก) → เก็บเป็น href string
  | "color" // สี #rrggbb
  | "list" // รายการข้อความ string[]
  | "emoji" // ไอคอนอีโมจิ (สั้น ๆ)
  | "video" // ลิงก์ YouTube/Vimeo (กรองโฮสต์)
  | "map" // ลิงก์ฝัง Google Maps (กรองโฮสต์)
  | "products" // เลือกสินค้าหลายตัว (เก็บรหัสรุ่น code[])
  | "skus" // เลือก SKU ทีละตัว (รุ่น + สี) เก็บ "CODE:sku-xxxxxxxx"[] · ไม่มีสี = "CODE" (lib/website-sku-cards)
  | "category" // หมวดสินค้าบนเว็บของร้าน (key)
  | "categories" // หลายหมวด เรียงตามที่เลือก (key[]) — ว่าง = ทุกหมวด
  | "videoFile" // ไฟล์วิดีโอที่อัปโหลดเอง (r2 key) — ช่องอัปโหลดคลิป (ไฟล์เล็กผ่าน ERP · ไฟล์ใหญ่ส่งตรงเข้า R2)
  | "categoryImages" // รูปแทนรายหมวด { รหัสหมวด: r2 key } — ตั้งในช่อง categories ของ Section เดียวกัน (ไม่วาดช่องแยก · ต้อง hidden)
  | "crop" // ส่วนที่เห็นของรูปในกรอบ { x, y, zoom } — ลากกรอบ/ซูม (ImageCropBox) · ต้องตั้ง cropImage (+ cropRatio)
  | "code" // HTML+CSS ที่วางเอง (ล้างด้วย lib/website-html.ts)
  | "datetime" // วันเวลา (เวลาไทย) เก็บ "YYYY-MM-DDTHH:mm" — ช่องกลาง ERPDateTime24
  | "point"; // จุดบนรูป { x, y } เป็น % — คลิกบนรูปเพื่อวาง · ต้องตั้ง pointImage

export type FieldGroup = "content" | "media" | "action" | "layout" | "products" | "caption" | "card";

export const FIELD_GROUP_LABEL: Record<FieldGroup, string> = {
  content: "เนื้อหา",
  media: "รูป / สื่อ",
  action: "ปุ่ม / ลิงก์",
  layout: "การจัดวาง",
  products: "สินค้า",
  caption: "ข้อความประกอบรูป",
  card: "🃏 การ์ดในส่วนนี้",
};

export interface FieldOption {
  v: string;
  l: string;
  /** โหมดปุ่มรูปย่อ (display "tiles"): ภาพร่างเล็ก ๆ ของตัวเลือก — ดู SKETCHES ใน components/website-schema-form */
  sketch?: string;
  /** โหมดปุ่มรูปย่อ: คำอธิบายสั้นใต้ชื่อ */
  hint?: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** select: "tiles" = แสดงเป็นปุ่มรูปย่อให้กดเลือก (แทน dropdown) · "font" = ตัวเลือกฟอนต์เห็นหน้าตาจริง (FontSelect · options = CANVAS_FONTS) */
  display?: "tiles" | "font";
  group?: FieldGroup;
  hint?: string;
  placeholder?: string;
  /** ค่าเริ่มต้นตอนสร้างบล็อกใหม่ (และค่าที่ใช้แทนเมื่อข้อมูลเก่าไม่มีช่องนี้) */
  default?: unknown;
  /** ความยาวสูงสุดของข้อความ / จำนวนสูงสุดของรายการ */
  max?: number;
  /** ตัวเลข: ต่ำสุด–สูงสุด */
  min?: number;
  numMax?: number;
  step?: number;
  options?: FieldOption[];
  /** ช่องกว้างเต็มแถว (ค่าเริ่มต้น = ครึ่งแถวสำหรับ text/select/number) */
  wide?: boolean;
  /** ต้องกรอก — ว่างแล้วตัวตรวจก่อนเผยแพร่จะขึ้น error */
  required?: boolean;
  /** ข้อความตอนตรวจไม่ผ่าน (ไม่ใส่ = สร้างจาก label) */
  requiredMessage?: string;
  /** required แบบ "อย่างใดอย่างหนึ่ง": ช่องนี้ว่างได้ถ้าช่อง key นี้มีค่า (เช่น คลิปคอมว่างได้ถ้ามีคลิปมือถือ) */
  requiredOr?: string;
  /**
   * โชว์เฉพาะเมื่อช่องอื่นมีค่าตามนี้ เช่น { key: "source", eq: "manual" }
   * eq เป็น array = ค่าใดค่าหนึ่งในรายการ · ใส่หลายเงื่อนไขเป็น array = ต้องตรงทุกข้อ
   */
  showIf?: ShowIf | ShowIf[];
  /** ไม่วาดในฟอร์ม (ค่าถูกแก้ผ่านช่องอื่น เช่น categoryImages แก้ในช่อง categories) — ยังเก็บ/ทำความสะอาดตามชนิดปกติ */
  hidden?: boolean;
  /** ช่องชนิด crop: key ของรูปในชิ้นเดียวกัน (เช่น "imageKey") */
  cropImage?: string;
  /** ช่องชนิด crop: key ของสัดส่วนกรอบใน Section แม่ (ค่าแบบ "4:5" · "auto" = ตามรูป ไม่ต้องครอป) */
  cropRatio?: string;
  /** ช่องชนิด crop: สัดส่วนกรอบตายตัว (ไม่มีช่องสัดส่วน เช่น แบนเนอร์เต็มจอ ≈ "16:7") — ใช้เมื่อไม่ได้ตั้ง cropRatio */
  cropBox?: string;
  /** ช่องชนิด point: key ของรูปใน Section แม่ (หรือชิ้นเดียวกัน) ที่ใช้คลิกวางจุด เช่น "imageKey" */
  pointImage?: string;
  /**
   * ช่องชนิด point: key ในชิ้นเดียวกันที่บอก "ลุคที่" (เช่น "look" = "1".."6") → ใช้รูป `${pointImage}${n}` ของ Section แม่
   * (ลุค 1 = pointImage เดิม) · จุดพี่น้องที่โชว์จาง ๆ = เฉพาะลุคเดียวกัน
   */
  pointLook?: string;
  /** ชิ้นย่อย: โชว์ช่องนี้เฉพาะเมื่อ Section แม่มีค่าตามนี้ (เช่น { key: "mode", eq: "slides" }) */
  showIfParent?: ShowIf | ShowIf[];
  /**
   * 🌐 2 ภาษา — ช่องข้อความ (text/textarea/link/list) แปลได้อัตโนมัติ (เก็บอังกฤษใน `<key>_en`)
   * ใส่ false กับช่องที่ "ไม่ใช่ภาษา" เช่น รหัสกลุ่ม · ชื่อบัญชี IG · บันทึกช่วยจำที่ไม่แสดงบนเว็บ
   * กติกากลาง: lib/content-i18n.ts · lib/website-i18n.ts
   */
  i18n?: boolean;
  /**
   * 📸 สวิตช์ "ใช้การ์ดตามค่ากลางของร้าน" (toggle): ตอนปิดสวิตช์ → ก๊อปค่าการ์ดของร้านตอนนี้ (ธีม → การ์ดสินค้า)
   * มาใส่ช่องในกลุ่ม ให้เริ่มจากหน้าตาเดิมแล้วค่อยปิดทีละอย่าง · ฟอร์มส่งค่าธีมมาทาง ctx.themeCard
   */
  copyShopCard?: (card: Record<string, unknown>, item: Record<string, unknown>) => Record<string, unknown>;
  /** ช่องรูป: ความกว้างขั้นต่ำที่ควรเป็น (px) — เล็กกว่า = ฟอร์มเตือน "รูปเล็กไป จะไม่คม" (ของกลาง ImageSizeNote) */
  minPx?: number;
}

export interface ShowIf {
  key: string;
  eq: unknown;
  /** ช่องอื่นที่ "ตรงก็พอ" (หรือ) เช่น รูปแบบคอม หรือ รูปแบบมือถือ เป็นแบนเนอร์ → โชว์ช่องแบนเนอร์ */
  orKey?: string;
}

/** ช่องนี้ควรโชว์ไหม (ใช้ร่วม: ฟอร์ม + ตัวตรวจก่อนเผยแพร่) */
export function matchShowIf(fd: FieldDef, value: Record<string, unknown>): boolean {
  if (!fd.showIf) return true;
  const conds = Array.isArray(fd.showIf) ? fd.showIf : [fd.showIf];
  const hit = (c: ShowIf, k: string) => (Array.isArray(c.eq) ? (c.eq as unknown[]).includes(value[k]) : value[k] === c.eq);
  return conds.every((c) => hit(c, c.key) || (!!c.orKey && hit(c, c.orKey)));
}

/** Block ย่อยใน Section (เก็บเป็น array ในฟิลด์ `key` ของ Section) */
export interface ChildSpec {
  /** ชื่อฟิลด์ที่เก็บ array เช่น "items", "cards", "slides" */
  key: string;
  /** ป้ายกลุ่ม เช่น "คำถาม-คำตอบ" */
  label: string;
  /** ป้ายต่อชิ้น เช่น "คำถาม" */
  itemLabel: string;
  icon: string;
  min?: number;
  max: number;
  fields: FieldDef[];
  /** ข้อความสรุปต่อชิ้น (โชว์ในต้นไม้ด้านซ้าย) */
  summary: (item: Record<string, unknown>) => string;
  /** ชิ้นใหม่ตอนกด "+ เพิ่ม" — ไม่ใส่ = ใช้ default ของ fields */
  blank?: () => Record<string, unknown>;
}

export interface SectionMeta {
  label: string;
  icon: string;
  hint: string;
  group: string;
  /**
   * Section ทดลอง — โชว์ในคลังเฉพาะร้านที่เปิดสวิตช์นี้ (store_settings key เช่น "beta_canvas" = true)
   * ตัวแสดงผล/ข้อมูลที่มีอยู่แล้วไม่ถูกกรอง (ปิดสวิตช์ทีหลัง Section ที่วางไว้ยังขึ้นเว็บตามเดิม)
   */
  beta?: string;
  /**
   * ปุ่ม "จัดการ … →" ใต้แผงตั้งค่าของ Section — เปิดหน้าหลังบ้านที่เก็บข้อมูลของ Section นี้ในแท็บใหม่
   * (เช่น ออกแบบเข็มขัด → สตูดิโอ /admin/belt-builder) · ไม่มี = ไม่โชว์ปุ่ม
   */
  manage?: { label: string; href: string; hint?: string };
}

export interface ValidationIssue {
  blockId: string | null;
  level: "error" | "warning";
  message: string;
  /** ลิงก์ไปแก้ที่อื่น (เช่น ข้อมูลสินค้า → แท็บสินค้าบนเว็บ) — เปิดแท็บใหม่ */
  fix?: string;
}

export interface SectionSchema {
  type: string;
  meta: SectionMeta;
  fields: FieldDef[];
  children?: ChildSpec;
  /** ข้อความสรุปของ Section (โชว์ใต้ชื่อในต้นไม้) */
  summary: (block: Record<string, unknown>) => string;
  /** ตรวจเพิ่มเติมนอกเหนือจาก required (ข้อความต้องเป็นภาษาคน) */
  validate?: (block: Record<string, unknown>, label: string) => Omit<ValidationIssue, "blockId">[];
}

/* ─────────── ตัวช่วยประกาศ ─────────── */

const f = (key: string, label: string, type: FieldType, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, type, ...extra });

/**
 * 🃏 การ์ดในส่วนนี้ (Section ตารางสินค้า) — เปิด/ปิดรายละเอียดบนการ์ดเฉพาะ Section นี้ ไม่กระทบการ์ดที่อื่น
 * สวิตช์หลักเปิด (ค่าเริ่ม) = ตามค่ากลางของร้าน (ดีไซน์ → การ์ดสินค้า) เหมือนเดิมทุกอย่าง
 * ปิด = ใช้ค่าในกลุ่มนี้ (ก๊อปจากการ์ดของร้านตอนปิด) · แก้การ์ดของร้านทีหลังไม่ลามมาที่ Section นี้
 * เว็บร้าน: src/lib/card-override.ts + src/components/shop/CardSettings.tsx (useCardConfig) — ทุกรูปแบบการโชว์ของ Section ใช้ค่าเดียวกัน
 *
 * แบบ "รูปนำ" (ลุคบุ๊ก/โมเสก/สปอตไลต์ — ไทล์ ProductTile) มีแค่ ชื่อ · ราคา · "เริ่มต้น" · ราคาขีดฆ่า · หน่วย · จำนวนสี · บรรทัดชื่อ · จัดชิด
 * → ป้าย/สต๊อก/หมวด/จุดสี/ปุ่ม โชว์เฉพาะเมื่อแบบคอมหรือมือถือเป็นการ์ดเต็ม (CARD_LAYOUTS) — กันกดแล้วพรีวิวไม่เปลี่ยน
 */
const CARD_LAYOUTS = ["grid", "carousel", "feature", "rank", "tabs", "banner"];
export const PRODUCT_TILE_LAYOUTS = ["mosaic", "lookbook", "spotlight"];
/** Section นี้มีการ์ดเต็มบนจอใดจอหนึ่งไหม (ไม่มี = รูปนำล้วน) */
const usesFullCards = (b: Record<string, unknown>) => CARD_LAYOUTS.includes(String(b.layout ?? "grid")) || CARD_LAYOUTS.includes(String(b.layoutMobile ?? "same"));
const cardOn = { key: "cardUseShop", eq: false };
const fullCard = { key: "layout", eq: CARD_LAYOUTS, orKey: "layoutMobile" };
const cardToggle = (key: string, label: string, def: boolean, hint?: string, onlyFull = false) =>
  f(key, label, "toggle", { group: "card", default: def, showIf: onlyFull ? [cardOn, fullCard] : cardOn, ...(hint ? { hint } : {}) });
const PRODUCT_CARD_FIELDS: FieldDef[] = [
  f("cardUseShop", "ใช้การ์ดตามค่ากลางของร้าน", "toggle", {
    group: "card",
    default: true,
    wide: true,
    hint: "ปิด = ตั้งเฉพาะ Section นี้ (เริ่มจากหน้าตาตอนนี้) · แบบรูปนำ (ลุคบุ๊ก/โมเสก/สปอตไลต์) ตั้งได้แค่ชื่อ-ราคา",
    copyShopCard: (c, b) => ({
      cardName: true,
      cardPrice: true,
      // ป้าย: เปิด = ตามที่ร้านตั้ง → ร้านไม่ได้เปิดป้ายชนิดไหนเลย = ปิด (หน้าตาเท่าเดิม)
      cardBadge: c.showBadge !== false || ["sale", "new", "best"].some((k) => (c.autoBadges as Record<string, unknown> | undefined)?.[k] === true),
      cardCompare: c.showCompare !== false,
      cardPriceFrom: c.priceFrom === true,
      cardUnit: c.showUnit !== false,
      cardCategory: c.showCategory !== false,
      cardStock: c.showStock !== false,
      cardSwatches: c.showSwatches === true,
      cardColorCount: c.showColorCount === true,
      cardQuickAdd: c.quickAdd !== "none",
      cardQuickView: !!c.quickView && c.quickView !== "none",
      cardTitleLines: ["1", "2", "3"].includes(String(c.titleLines)) ? String(c.titleLines) : "2",
      cardAlign: c.align === "center" ? "center" : "left",
      // รูปนำล้วน: เริ่มจากหน้าตาไทล์ตอนนี้ (มี "เริ่มต้น" + จำนวนสี · ไม่มีราคาขีดฆ่า/หน่วย · ชื่อ 2 บรรทัด ชิดซ้าย)
      ...(usesFullCards(b) ? {} : { cardCompare: false, cardUnit: false, cardPriceFrom: true, cardColorCount: true, cardTitleLines: "2", cardAlign: "left" }),
    }),
  }),
  cardToggle("cardName", "ชื่อสินค้า", true),
  cardToggle("cardPrice", "ราคา", true),
  cardToggle("cardBadge", "ป้ายบนรูป", true, "ลด % / ใหม่ / ขายดี · ป้ายหมดขึ้นเสมอ", true),
  cardToggle("cardCompare", "ราคาเต็มขีดฆ่า", true),
  cardToggle("cardPriceFrom", "คำว่า \"เริ่มต้น\" หน้าราคา", false),
  cardToggle("cardUnit", "หน่วย (/ ชิ้น)", true),
  cardToggle("cardCategory", "ชื่อหมวด", true, undefined, true),
  cardToggle("cardStock", "สถานะสต๊อก", true, undefined, true),
  cardToggle("cardSwatches", "จุดสี", false, undefined, true),
  cardToggle("cardColorCount", "จำนวนสี (4 สี)", false),
  cardToggle("cardQuickAdd", "ปุ่มใส่ตะกร้าเร็ว", true, undefined, true),
  cardToggle("cardQuickView", "ปุ่มดูด่วน", false, undefined, true),
  f("cardTitleLines", "ชื่อยาวสุดกี่บรรทัด", "select", {
    group: "card",
    default: "2",
    showIf: cardOn,
    options: [
      { v: "1", l: "1 บรรทัด" },
      { v: "2", l: "2 บรรทัด" },
      { v: "3", l: "3 บรรทัด" },
    ],
  }),
  f("cardAlign", "จัดชิด", "select", {
    group: "card",
    default: "left",
    showIf: cardOn,
    options: [
      { v: "left", l: "ชิดซ้าย" },
      { v: "center", l: "กึ่งกลาง" },
    ],
  }),
];
const text = (key: string, label: string, extra: Partial<FieldDef> = {}) => f(key, label, "text", { max: 160, ...extra });
const area = (key: string, label: string, extra: Partial<FieldDef> = {}) => f(key, label, "textarea", { max: 600, wide: true, ...extra });
const link = (key: string, label: string, dText = "", dHref = "", extra: Partial<FieldDef> = {}) =>
  f(key, label, "link", { group: "action", default: { text: dText, href: dHref }, wide: true, ...extra });
const image = (key: string, label: string, extra: Partial<FieldDef> = {}) => f(key, label, "image", { group: "media", default: null, wide: true, ...extra });

/** 🛍️ รูปแบบการโชว์ของ Section ตารางสินค้า (ใช้ทั้งช่องคอม + ช่องมือถือ) — เว็บร้านวาดที่ src/components/home/ProductsBlock.tsx */
const PRODUCT_LAYOUTS: FieldOption[] = [
  { v: "grid", l: "ตาราง", sketch: "grid", hint: "ใช้ได้ทุกกรณี" },
  { v: "carousel", l: "เลื่อนข้าง", sketch: "carousel", hint: "สินค้าเยอะ กินที่น้อย" },
  { v: "feature", l: "ตัวเด่น + ตาราง", sketch: "feature", hint: "ดันตัวแรก 1 ตัว + ตัวรอง 4" },
  { v: "mosaic", l: "นิตยสาร (โมเสก)", sketch: "mosaic", hint: "ใหญ่-เล็กสลับ แบบแคตตาล็อก" },
  { v: "lookbook", l: "ลุคบุ๊ก รูปใหญ่", sketch: "lookbook", hint: "รูปเต็ม ชื่อ/ราคาบนรูป" },
  { v: "spotlight", l: "สปอตไลต์", sketch: "spotlight", hint: "ตัวกลางใหญ่ เลื่อนทีละตัว" },
  { v: "rank", l: "อันดับขายดี", sketch: "rank", hint: "เลขอันดับ 01–05 ตัวใหญ่" },
  { v: "tabs", l: "แท็บตามหมวด", sketch: "tabs", hint: "กดแท็บสลับหมวด" },
  { v: "banner", l: "แบนเนอร์ + สินค้า", sketch: "banner", hint: "รูปแคมเปญ + สินค้าข้างกัน" },
];

/** 🛍 ลุคบุ๊กกดซื้อได้ — เว็บร้านวาดที่ src/components/home/LookbookBody.tsx */
const LOOKBOOK_LAYOUTS: FieldOption[] = [
  { v: "side", l: "รูป + การ์ดสินค้าข้าง", sketch: "lb-side", hint: "กดจุด → การ์ดข้างเปลี่ยน" },
  { v: "pop", l: "รูปเต็ม + ป๊อปที่จุด", sketch: "lb-pop", hint: "กดจุด → การ์ดเด้งตรงจุด" },
];

/** ❓ รูปแบบของ Section คำถามที่พบบ่อย — เว็บร้านวาดที่ src/components/home/FaqSection.tsx */
const FAQ_LAYOUTS: FieldOption[] = [
  { v: "side", l: "หัวข้อซ้าย + คำถามขวา", sketch: "faq-side", hint: "แบบเดิม" },
  { v: "center", l: "กึ่งกลาง 1 คอลัมน์", sketch: "faq-center", hint: "อ่านง่าย สะอาดตา" },
  { v: "two", l: "คำถาม 2 คอลัมน์", sketch: "faq-two", hint: "คำถามเยอะ ไม่ยาวลงไป" },
  { v: "tabs", l: "แท็บตามหมวด", sketch: "faq-tabs", hint: "ใส่หมวดให้แต่ละคำถาม" },
];

/** หัวข้อมาตรฐานของ Section ส่วนใหญ่: คำโปรยเล็ก + หัวข้อ (+ คำอธิบาย) */
/**
 * ของกลาง: ชุดตั้งค่าหน้าตารูป (สัดส่วน · ทรงกรอบ · เส้นกรอบ + สี) — ใช้ร่วมทุก Section ที่มีรูป (แกลเลอรี · รูปคู่ข้อความ …)
 * key คงที่ ratio / frame / border / borderColor · เว็บร้านวาดด้วยตัวกลาง FramedImage (src/components/home/FramedImage.tsx)
 * คู่กับช่อง crop (ส่วนที่เห็น/ซูม — cropRatio: "ratio") ได้
 */
const LINE_FRAME_KEYS = ["rounded", "rect", "circle", "arch"];
/** 🎬 Section วิดีโอ */
const VIDEO_LINK: ShowIf = { key: "source", eq: ["link", "", undefined] };
const VIDEO_UPLOAD: ShowIf = { key: "source", eq: "upload" };
const VIDEO_RATIOS: FieldOption[] = [
  { v: "16:9", l: "แนวนอน 16:9" },
  { v: "21:9", l: "จอกว้าง 21:9" },
  { v: "4:3", l: "แนวนอน 4:3" },
  { v: "1:1", l: "จัตุรัส 1:1" },
  { v: "4:5", l: "แนวตั้ง 4:5" },
  { v: "9:16", l: "แนวตั้ง 9:16 (Reels / TikTok)" },
];
const VIDEO_TEXT_POS: FieldOption[] = [
  { v: "top-left", l: "บนซ้าย" },
  { v: "top-center", l: "บนกลาง" },
  { v: "center-left", l: "กลางซ้าย" },
  { v: "center", l: "กลางจอ" },
  { v: "bottom-left", l: "ล่างซ้าย" },
  { v: "bottom-center", l: "ล่างกลาง" },
];
/** Section หมวดสินค้า: ช่องที่ใช้เฉพาะแบบ "การ์ดรูปใหญ่" */
const TILE_ONLY: ShowIf = { key: "layout", eq: "tile" };
const imageLookFields = (opts: { ratio: string; frame?: string; allowAuto?: boolean; ratioHint?: string; autoFrame?: string }): FieldDef[] => [
  f("ratio", "สัดส่วนรูป", "select", {
    group: "layout",
    default: opts.ratio,
    options: [
      { v: "1:1", l: "จัตุรัส 1:1" },
      { v: "4:5", l: "แนวตั้ง 4:5" },
      { v: "3:4", l: "แนวตั้ง 3:4" },
      { v: "2:3", l: "แนวตั้งสูง 2:3" },
      { v: "4:3", l: "แนวนอน 4:3" },
      { v: "16:9", l: "แนวนอนกว้าง 16:9" },
      ...(opts.allowAuto ? [{ v: "auto", l: "ตามรูปจริง (ไม่ตัด)" }] : []),
    ],
    hint: opts.ratioHint,
  }),
  f("frame", "ทรงกรอบ", "select", {
    group: "layout",
    default: opts.frame ?? "rounded",
    options: [
      ...(opts.autoFrame ? [{ v: "auto", l: opts.autoFrame }] : []),
      { v: "rounded", l: "มุมมน" },
      { v: "rect", l: "เหลี่ยม" },
      { v: "circle", l: "วงกลม / วงรี" },
      { v: "arch", l: "โค้งประตู" },
      { v: "heart", l: "หัวใจ" },
      { v: "scallop", l: "ขอบหยัก" },
      { v: "polaroid", l: "โพลารอยด์" },
      { v: "stamp", l: "แสตมป์" },
    ],
  }),
  f("border", "เส้นกรอบ", "select", {
    group: "layout",
    default: "none",
    options: [
      { v: "none", l: "ไม่มี" },
      { v: "line", l: "เส้นเดียว" },
      { v: "double", l: "เส้นคู่" },
      { v: "dotted", l: "จุดไข่ปลา" },
    ],
    showIf: { key: "frame", eq: [...LINE_FRAME_KEYS, "auto"] },
  }),
  f("borderColor", "สีเส้นกรอบ", "select", {
    group: "layout",
    default: "brand",
    options: [
      { v: "brand", l: "สีแบรนด์" },
      { v: "brandDeep", l: "แบรนด์เข้ม" },
      { v: "ink", l: "ตัวอักษรหลัก" },
      { v: "muted", l: "เทาอ่อน" },
      { v: "white", l: "ขาว" },
    ],
    showIf: [{ key: "frame", eq: [...LINE_FRAME_KEYS, "auto"] }, { key: "border", eq: ["line", "double", "dotted"] }],
  }),
];

/**
 * 📝 ของกลาง: ชุดตั้งค่า "ข้อความประกอบรูป" ทั้ง Section — ใช้คู่กับชิ้นย่อยที่มี title / caption / linkText (+ href)
 * key คงที่ cap* · ค่าเริ่ม = แบบเดิมของแกลเลอรี (ใต้รูป · ตัวเล็กสีรอง · ห่างรูปนิดเดียว) → บล็อกเก่าหน้าตาไม่เปลี่ยน
 * สี/ฟอนต์ = ชุดเดียวกับผืนผ้าใบ (ตามธีมร้าน) · ขนาด = ชื่อสเกล (ไม่ใช่ px) · เว็บร้านวาดที่ src/components/home/ImageCaption.tsx
 */
const CAP_POSITIONS: FieldOption[] = [
  { v: "below", l: "ใต้รูป", sketch: "cap-below", hint: "แบบเดิม" },
  { v: "card", l: "การ์ดมีพื้น", sketch: "cap-card", hint: "รูป + ข้อความในกล่อง" },
  { v: "overlay", l: "ซ้อนบนรูป", sketch: "cap-overlay", hint: "แถบมืดล่างรูป" },
  { v: "hover", l: "โผล่ตอนชี้", sketch: "cap-hover", hint: "มือถือเห็นตลอด" },
];
const CAP_AUTO_COLOR: FieldOption = { v: "auto", l: "อัตโนมัติ" };
const CAP_AUTO_HINT = "อัตโนมัติ = ใต้รูปตามธีม · บนรูปเป็นสีขาว";
const imageCaptionFields = (): FieldDef[] => {
  const on = { key: "capShow", eq: true };
  const g = { group: "caption" as FieldGroup };
  return [
    f("capShow", "แสดงข้อความประกอบรูป", "toggle", { ...g, default: true }),
    f("capPos", "ตำแหน่งข้อความ", "select", { ...g, default: "below", display: "tiles", options: CAP_POSITIONS, showIf: on, hint: "หัวข้อ / คำอธิบาย / ลิงก์ ใส่ทีละรูป (กดที่รูปในต้นไม้หรือพรีวิว)" }),
    f("capAlign", "จัดข้อความ", "select", {
      ...g,
      default: "auto",
      options: [
        { v: "auto", l: "ตามรูปลักษณ์ Section" },
        { v: "left", l: "ชิดซ้าย" },
        { v: "center", l: "กึ่งกลาง" },
        { v: "right", l: "ชิดขวา" },
      ],
      showIf: on,
      hint: "ตามรูปลักษณ์ = ปกติชิดซ้าย (ตั้งที่แท็บรูปลักษณ์)",
    }),
    f("capGap", "ระยะห่างข้อความกับรูป", "select", {
      ...g,
      default: "sm",
      options: [
        { v: "none", l: "ชิดกัน" },
        { v: "xs", l: "น้อยมาก" },
        { v: "sm", l: "น้อย (แบบเดิม)" },
        { v: "md", l: "กลาง" },
        { v: "lg", l: "มาก" },
      ],
      showIf: on,
    }),
    f("capTitleFont", "ฟอนต์หัวข้อ", "select", { ...g, default: "display", options: CANVAS_FONTS, display: "font", showIf: on }),
    f("capTitleSize", "ขนาดหัวข้อ", "select", {
      ...g,
      default: "m",
      options: [
        { v: "xs", l: "เล็กมาก" },
        { v: "s", l: "เล็ก" },
        { v: "m", l: "กลาง" },
        { v: "l", l: "ใหญ่" },
        { v: "xl", l: "ใหญ่มาก" },
      ],
      showIf: on,
      hint: "ใหญ่/ใหญ่มาก ย่อลงเองบนมือถือ",
    }),
    f("capTitleWeight", "ความหนาหัวข้อ", "select", { ...g, default: "600", options: CANVAS_WEIGHTS, showIf: on }),
    f("capTitleColor", "สีหัวข้อ", "select", { ...g, default: "auto", options: [CAP_AUTO_COLOR, ...CANVAS_COLORS], showIf: on, hint: CAP_AUTO_HINT }),
    f("capTitleHex", "สีหัวข้อ (เลือกเอง)", "color", { ...g, default: "", showIf: [on, { key: "capTitleColor", eq: "custom" }] }),
    f("capTitleUpper", "หัวข้อตัวพิมพ์ใหญ่ (อังกฤษ)", "toggle", { ...g, default: false, showIf: on }),
    f("capTextSize", "ขนาดคำอธิบาย", "select", {
      ...g,
      default: "s",
      options: [
        { v: "xs", l: "เล็กมาก" },
        { v: "s", l: "เล็ก (แบบเดิม)" },
        { v: "m", l: "กลาง" },
        { v: "l", l: "ใหญ่" },
      ],
      showIf: on,
    }),
    f("capTextColor", "สีคำอธิบาย", "select", { ...g, default: "auto", options: [CAP_AUTO_COLOR, ...CANVAS_COLORS], showIf: on, hint: CAP_AUTO_HINT }),
    f("capTextHex", "สีคำอธิบาย (เลือกเอง)", "color", { ...g, default: "", showIf: [on, { key: "capTextColor", eq: "custom" }] }),
    f("capLinkStyle", "หน้าตาลิงก์", "select", {
      ...g,
      default: "text",
      options: [
        { v: "text", l: "ข้อความขีดเส้นใต้" },
        { v: "button", l: "ปุ่มขอบบาง" },
      ],
      showIf: on,
      hint: "ลิงก์ = \"ข้อความลิงก์ใต้รูป\" ของแต่ละรูป",
    }),
    f("capShade", "ความเข้มแถบมืดบนรูป (%)", "range", { ...g, default: 45, min: 0, numMax: 90, step: 5, showIf: [on, { key: "capPos", eq: ["overlay", "hover"] }] }),
    f("capCardBg", "สีพื้นการ์ด", "select", { ...g, default: "surface", options: CANVAS_COLORS, showIf: [on, { key: "capPos", eq: "card" }] }),
    f("capCardHex", "สีพื้นการ์ด (เลือกเอง)", "color", { ...g, default: "", showIf: [on, { key: "capPos", eq: "card" }, { key: "capCardBg", eq: "custom" }] }),
    f("capMobile", "มือถือ: ข้อความ", "select", {
      ...g,
      default: "all",
      options: [
        { v: "all", l: "เหมือนคอม" },
        { v: "title", l: "หัวข้ออย่างเดียว" },
        { v: "none", l: "ซ่อนข้อความ" },
      ],
      showIf: on,
    }),
  ];
};

const headFields = (opts: { eyebrow?: string; title?: string; subtitle?: boolean; subtitleMax?: number } = {}): FieldDef[] => [
  text("eyebrow", "คำโปรยเหนือหัวข้อ", { default: opts.eyebrow ?? "", max: 120, placeholder: "เช่น ขายดี" }),
  text("title", "หัวข้อ", { default: opts.title ?? "", max: 160, wide: true }),
  ...(opts.subtitle ? [area("subtitle", "คำอธิบายใต้หัวข้อ", { default: "", max: opts.subtitleMax ?? 400 })] : []),
];

const count = (n: number, unit: string) => `${n} ${unit}`;
const s = (v: unknown) => String(v ?? "").trim();
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

/**
 * ช่องตั้งค่าของ "ชิ้น" บนผืนผ้าใบอิสระ — ชิ้นเดียวมีได้ 4 ชนิด (kind) ช่องที่โชว์เปลี่ยนตามชนิด
 * ตำแหน่ง/ขนาด (x,y,w,h,rotate) ปกติไม่ต้องกรอก — ลากในพรีวิวแล้วค่ามาเอง
 */
function canvasItemFields(): FieldDef[] {
  const isText = { key: "kind", eq: "text" };
  const isButton = { key: "kind", eq: "button" };
  const isImage = { key: "kind", eq: "image" };
  const isShape = { key: "kind", eq: "shape" };
  const isVideo = { key: "kind", eq: "video" };
  /** รูป/วิดีโอ = ทรงกรอบ/การจัดในกรอบ/สินค้าในรูป ใช้ร่วมกัน */
  const isMedia = { key: "kind", eq: ["image", "video"] };
  const typed = { key: "kind", eq: ["text", "button"] };
  const colored = { key: "kind", eq: ["text", "button", "shape"] };
  const framed = [isImage, { key: "border", eq: CANVAS_BORDERS_ON }];
  return [
    f("kind", "ชนิดชิ้น", "select", { default: "text", options: CANVAS_KINDS }),

    /* ข้อความ */
    area("text", "ข้อความ", { default: "ข้อความ", max: 2000, showIf: isText, hint: "ดับเบิลคลิกข้อความในพรีวิวเพื่อพิมพ์แก้ตรงนั้นก็ได้" }),
    /* ปุ่ม */
    text("label", "ข้อความบนปุ่ม", { default: "เลือกดูสินค้า", max: 60, showIf: isButton }),
    f("variant", "รูปแบบปุ่ม", "select", { default: "brand", options: CANVAS_BUTTON_VARIANTS, showIf: isButton }),
    /* ตัวอักษร (ข้อความ + ปุ่ม) */
    f("font", "ฟอนต์", "select", { default: "display", options: CANVAS_FONTS, display: "font", showIf: typed }),
    f("size", "ขนาดตัวอักษร", "number", { default: 40, min: 8, numMax: 240, showIf: typed, hint: "ขนาดตอนจอกว้าง 1200 (จอเล็กย่อตาม)" }),
    f("weight", "ความหนา", "select", { default: "500", options: CANVAS_WEIGHTS, showIf: typed }),
    f("spacing", "ระยะห่างตัวอักษร", "number", { default: 0, min: -10, numMax: 60, showIf: typed }),
    f("uppercase", "ตัวพิมพ์ใหญ่ทั้งหมด (อังกฤษ)", "toggle", { default: false, showIf: typed }),
    f("italic", "ตัวเอียง", "toggle", { default: false, showIf: isText }),
    f("lineHeight", "ระยะบรรทัด (%)", "number", { default: 130, min: 70, numMax: 300, step: 5, showIf: isText }),
    f("align", "จัดข้อความ", "select", {
      default: "left",
      options: [
        { v: "left", l: "ชิดซ้าย" },
        { v: "center", l: "กึ่งกลาง" },
        { v: "right", l: "ชิดขวา" },
      ],
      showIf: isText,
    }),
    /* สี (ข้อความ / ปุ่ม / ของตกแต่ง) */
    f("color", "สี", "select", { default: "ink", options: CANVAS_COLORS, showIf: colored, hint: "สีตามธีม = เปลี่ยนธีมแล้วเปลี่ยนตาม" }),
    f("colorHex", "สีเอง", "color", { default: "", showIf: [colored, { key: "color", eq: "custom" }] }),
    f("bg", "พื้นหลังข้อความ (แถบ)", "select", { default: "none", options: CANVAS_TEXT_BGS, showIf: isText }),
    f("bgHex", "พื้นหลังสีเอง", "color", { default: "", showIf: [isText, { key: "bg", eq: "custom" }] }),
    /* สีไล่ (ข้อความ/ของตกแต่ง): ทิศ + สีที่ 2 (สีแรก = ช่อง "สี") */
    f("grad", "ไล่สี", "select", { default: "", options: [{ v: "", l: "ไม่ไล่ (สีเดียว)" }, ...GRAD_DIRS], showIf: { key: "kind", eq: ["text", "shape"] } }),
    f("color2", "สีปลาย (ไล่สี)", "select", { default: "brandSoft", options: CANVAS_COLORS, showIf: [{ key: "kind", eq: ["text", "shape"] }, { key: "grad", eq: GRAD_DIRS.map((d) => d.v) }] }),
    f("color2Hex", "สีปลายเอง", "color", { default: "", showIf: [{ key: "kind", eq: ["text", "shape"] }, { key: "color2", eq: "custom" }] }),

    /* รูป */
    image("imageKey", "รูป", { showIf: isImage, hint: "PNG พื้นใสก็ได้ (เช่น สติกเกอร์/โลโก้)" }),
    text("alt", "คำบรรยายรูป (Alt)", { group: "media", default: "", max: 200, showIf: isImage, hint: "มีผลกับ SEO" }),
    /* 🎬 วิดีโอ (เล่นวนแบบเงียบ · ปกก่อนเล่น) */
    f("videoKey", "คลิป", "videoFile", { default: null, wide: true, showIf: isVideo, hint: "MP4 / WebM / MOV ถึง 200 MB · เล่นเองแบบเงียบ วนซ้ำ · เลือกจากคลังวิดีโอได้" }),
    image("posterKey", "รูปปกคลิป (ก่อนเล่น)", { showIf: isVideo, hint: "ว่าง = ภาพแรกของคลิป" }),
    f("frame", "ทรงรูป", "select", { group: "media", default: "rect", options: CANVAS_FRAMES, showIf: isMedia }),
    image("overlayKey", "กรอบจากรูป (PNG พื้นใส วางทับรูป)", { showIf: isImage, hint: "อัปโหลดกรอบของร้านเองได้ (เช่น กรอบวินเทจจาก Canva) — ว่าง = ไม่มี" }),
    f("overlayInset", "รูปห่างขอบกรอบ (%)", "range", { group: "media", default: 12, min: 0, numMax: 40, showIf: isImage }),
    f("fit", "การจัดรูปในกรอบ", "select", {
      group: "media",
      default: "cover",
      options: [
        { v: "cover", l: "เต็มกรอบ (อาจตัดขอบ)" },
        { v: "contain", l: "ทั้งรูป (ไม่ตัด)" },
      ],
      showIf: isMedia,
    }),
    f("border", "เส้นกรอบรอบรูป", "select", { group: "media", default: "none", options: CANVAS_BORDERS, showIf: isImage }),
    f("borderColor", "สีกรอบ", "select", { group: "media", default: "brand", options: CANVAS_COLORS, showIf: framed }),
    f("borderHex", "สีกรอบเอง", "color", { group: "media", default: "", showIf: [...framed, { key: "borderColor", eq: "custom" }] }),
    f("borderWidth", "ความหนาเส้นกรอบ", "number", { group: "media", default: 2, min: 1, numMax: 16, showIf: framed }),
    f("borderGap", "ระยะห่างกรอบกับรูป", "number", { group: "media", default: 12, min: 0, numMax: 80, showIf: framed }),
    /* ครอป = ซูม + เลื่อนจุดที่เห็นในกรอบ (ลากในพรีวิวโหมดครอปได้) · พลิก */
    f("cropZoom", "ซูมรูปในกรอบ (%)", "range", { group: "media", default: 100, min: 100, numMax: 400, step: 5, showIf: isImage }),
    f("cropX", "จุดที่เห็น แนวนอน (%)", "range", { group: "media", default: 50, min: 0, numMax: 100, showIf: isImage }),
    f("cropY", "จุดที่เห็น แนวตั้ง (%)", "range", { group: "media", default: 50, min: 0, numMax: 100, showIf: isImage }),
    f("flipH", "พลิกซ้าย-ขวา", "toggle", { group: "media", default: false, showIf: { key: "kind", eq: ["image", "shape", "video"] } }),
    f("flipV", "พลิกบน-ล่าง", "toggle", { group: "media", default: false, showIf: { key: "kind", eq: ["image", "shape", "video"] } }),

    /* ของตกแต่ง */
    f("shape", "ลาย", "select", { default: "bow", options: CANVAS_SHAPES, showIf: isShape }),
    f("outline", "แบบเส้น (ไม่ทึบ)", "toggle", { default: false, showIf: isShape }),
    f("strokeWidth", "ความหนาเส้น", "number", { default: 2, min: 1, numMax: 24, showIf: isShape }),

    /* 🛍 สินค้าในรูป/คลิป (2026-10-21 · ลุคบุ๊กแบบวางอิสระ) — กดชิ้นบนเว็บ = การ์ดสินค้าเด้ง (ชนะ "กดแล้วไปที่") */
    f("products", "สินค้าในรูปนี้ (กดรูปแล้วการ์ดสินค้าเด้ง)", "products", { group: "action", max: CANVAS_SHOP_MAX, wide: true, showIf: isMedia, hint: "หลายตัว = การ์ดเลื่อนดูได้ ‹ 1/3 › · มีสินค้า = กดรูปแล้วการ์ดเด้ง (ไม่ไปลิงก์)" }),
    f("shopIcon", "ไอคอน 🛍 มุมรูป (บอกว่ากดซื้อได้)", "toggle", { group: "action", default: true, showIf: isMedia }),
    /* ลิงก์ (ทุกชนิด) */
    f("href", "กดแล้วไปที่", "target", { group: "action", default: "", wide: true }),
    f("newTab", "เปิดในแท็บใหม่", "toggle", { group: "action", default: false }),

    /* ตำแหน่ง/ขนาด — ลากในพรีวิวแทนได้ */
    f("x", "ซ้าย (X)", "number", { group: "layout", default: 100, min: -1200, numMax: 2400 }),
    f("y", "บน (Y)", "number", { group: "layout", default: 100, min: -600, numMax: 4800 }),
    f("w", "กว้าง", "number", { group: "layout", default: 400, min: 4, numMax: 2400 }),
    f("h", "สูง", "number", { group: "layout", default: 80, min: 4, numMax: 4800, showIf: { key: "kind", eq: ["image", "button", "shape", "video"] } }),
    f("rotate", "หมุน (องศา)", "range", { group: "layout", default: 0, min: -180, numMax: 180 }),
    f("opacity", "ความทึบ (%)", "range", { group: "layout", default: 100, min: 5, numMax: 100, step: 5 }),
    f("hideMobile", "ซ่อนบนมือถือ", "toggle", { group: "layout", default: false }),
    f("locked", "ล็อกตำแหน่ง (ลากไม่ได้)", "toggle", { group: "layout", default: false }),
    /* การเคลื่อนไหว (CSS ของกลางที่เว็บร้าน: [data-motion] โผล่ตอนเลื่อนมาเจอ · [data-loop] ขยับตลอด) */
    f("anim", "โผล่ตอนเลื่อนมาเจอ", "select", { group: "layout", default: "", options: CANVAS_ENTRANCES }),
    f("animDelay", "หน่วงเวลาก่อนโผล่ (มิลลิวินาที)", "number", { group: "layout", default: 0, min: 0, numMax: 3000, step: 100, showIf: { key: "anim", eq: CANVAS_ENTRANCES.map((o) => o.v).filter(Boolean) } }),
    f("animSpeed", "ความเร็วตอนโผล่", "select", { group: "layout", default: "normal", options: CANVAS_SPEEDS, showIf: { key: "anim", eq: CANVAS_ENTRANCES.map((o) => o.v).filter(Boolean) } }),
    f("loop", "ขยับตลอดเวลา", "select", { group: "layout", default: "", options: CANVAS_LOOPS }),
    f("loopSpeed", "ความเร็วการขยับ", "select", { group: "layout", default: "normal", options: CANVAS_SPEEDS, showIf: { key: "loop", eq: CANVAS_LOOPS.map((o) => o.v).filter(Boolean) } }),
    f("hover", "ตอนเอาเมาส์ชี้ (คอม)", "select", { group: "layout", default: "", options: CANVAS_HOVERS, hint: "มือถือไม่มีเมาส์ จะไม่เห็นเอฟเฟกต์นี้" }),
    f("bleed", "ยืดเต็มความกว้างจอ", "toggle", { group: "layout", default: false, showIf: { key: "kind", eq: ["image", "shape", "video"] }, hint: "ซ้ายสุด–ขวาสุดของจอ ใช้แค่ตำแหน่งแนวตั้ง" }),
    text("group", "กลุ่ม (รหัส)", { group: "layout", default: "", max: 40, i18n: false, hint: "ชิ้นที่รหัสเดียวกัน = เลือก/ย้ายไปด้วยกัน (จับกลุ่มในพรีวิวแทนได้)" }),

    /* มือถือแบบจัดเอง (Section ตั้ง "มือถือ: จัดเอง") — ผืนมือถือกว้าง 400 · กว้าง 0 = ยังไม่ได้จัด (ใช้ค่าย่อจากคอม) */
    f("mx", "มือถือ: ซ้าย (X)", "number", { group: "layout", default: 0, min: -400, numMax: 800 }),
    f("my", "มือถือ: บน (Y)", "number", { group: "layout", default: 0, min: -200, numMax: 8000 }),
    f("mw", "มือถือ: กว้าง", "number", { group: "layout", default: 0, min: 0, numMax: 800 }),
    f("mh", "มือถือ: สูง", "number", { group: "layout", default: 0, min: 0, numMax: 8000 }),
    f("msize", "มือถือ: ขนาดตัวอักษร", "number", { group: "layout", default: 0, min: 0, numMax: 160, showIf: typed }),
    f("malign", "มือถือ: จัดข้อความ", "select", {
      group: "layout",
      default: "",
      options: [
        { v: "", l: "เหมือนคอม" },
        { v: "left", l: "ชิดซ้าย" },
        { v: "center", l: "กึ่งกลาง" },
        { v: "right", l: "ชิดขวา" },
      ],
      showIf: isText,
    }),
  ];
}

/**
 * 📍 ตำแหน่งปุ่มบนแบนเนอร์หลัก — 9 จุดบนแบนเนอร์ (ปุ่มรูปย่อ 3×3 · sketch "pos-*" ใน components/website-schema-form)
 * + "flow" = ใต้ข้อความ (แบบเดิม) · เว็บร้าน src/components/home/Hero.tsx ต้องรู้จักค่าเดียวกัน
 */
const HERO_BTN_GRID: FieldOption[] = [
  { v: "top-left", l: "บนซ้าย", sketch: "pos-top-left" },
  { v: "top-center", l: "บนกลาง", sketch: "pos-top-center" },
  { v: "top-right", l: "บนขวา", sketch: "pos-top-right" },
  { v: "middle-left", l: "กลางซ้าย", sketch: "pos-middle-left" },
  { v: "center", l: "กึ่งกลาง", sketch: "pos-center" },
  { v: "middle-right", l: "กลางขวา", sketch: "pos-middle-right" },
  { v: "bottom-left", l: "ล่างซ้าย", sketch: "pos-bottom-left" },
  { v: "bottom-center", l: "ล่างกลาง", sketch: "pos-bottom-center" },
  { v: "bottom-right", l: "ล่างขวา", sketch: "pos-bottom-right" },
];
const HERO_BTN_FLOW: FieldOption = { v: "flow", l: "ใต้ข้อความ (แบบเดิม)", sketch: "pos-flow" };

/** 🎞️ รูปทรงสไลด์ (ปุ่มรูปย่อ ss-*) — "height" = ความสูงเตี้ย/กลาง/สูง แบบเดิม · ตัวเลข = สัดส่วน กว้าง:สูง (กรอบครอปในชิ้นสไลด์ตามนี้) */
const SLIDE_SHAPES: FieldOption[] = [
  { v: "height", l: "ตามความสูง (แบบเดิม)", sketch: "ss-height", hint: "เตี้ย / กลาง / สูง" },
  { v: "21:9", l: "กว้างพิเศษ 21:9", sketch: "ss-21-9" },
  { v: "16:9", l: "แนวนอน 16:9", sketch: "ss-16-9" },
  { v: "3:2", l: "แนวนอน 3:2", sketch: "ss-3-2" },
  { v: "1:1", l: "จัตุรัส 1:1", sketch: "ss-1-1" },
  { v: "4:5", l: "แนวตั้ง 4:5", sketch: "ss-4-5" },
  { v: "full", l: "เต็มจอ", sketch: "ss-full", hint: "สูงเท่าหน้าจอ" },
];

/* ─────────── SECTION LIBRARY ─────────── */

export const SECTION_SCHEMAS: Record<string, SectionSchema> = {
  /* ── พื้นฐาน ── */
  announcement: {
    type: "announcement",
    meta: { label: "แถบประกาศ", icon: "🎗️", hint: "ข้อความเลื่อนบนสุดของเว็บ", group: "พื้นฐาน" },
    fields: [
      f("messages", "ข้อความประกาศ (สลับวนทีละข้อความ)", "list", {
        default: ["ข้อความประกาศของร้าน"],
        max: 10,
        wide: true,
        placeholder: "เช่น ส่งฟรีเมื่อสั่งครบ ฿1,500",
        required: true,
        requiredMessage: "ยังไม่มีข้อความ",
      }),
      f("marquee", "ให้ข้อความวิ่งต่อเนื่อง (แทนการสลับทีละข้อความ)", "toggle", { group: "layout", default: false }),
    ],
    summary: (b) => (b.messages as string[])?.filter(Boolean).join(" · ").slice(0, 70) || "ยังไม่มีข้อความ",
  },

  hero: {
    type: "hero",
    meta: { label: "แบนเนอร์หลัก (Hero)", icon: "🖼️", hint: "หัวเรื่องใหญ่ + รูปพื้นหลัง + ปุ่ม", group: "พื้นฐาน" },
    fields: [
      text("eyebrow", "คำโปรยเล็กด้านบน", { default: "", max: 120, placeholder: "เช่น ชื่อแบรนด์ · since 1996" }),
      text("title", "หัวเรื่องบรรทัดแรก", { default: "ยินดีต้อนรับ", max: 120, required: true, requiredMessage: "ยังไม่ได้ใส่หัวเรื่อง" }),
      text("titleAccent", "หัวเรื่องบรรทัดสอง (สีแบรนด์)", { default: "", max: 120 }),
      area("subtitle", "คำอธิบาย", { default: "", max: 600 }),
      link("primary", "ปุ่มหลัก", "ดูสินค้าทั้งหมด", "/shop"),
      link("secondary", "ปุ่มรอง", "", ""),
      // 📍 ตำแหน่งปุ่มบนแบนเนอร์ (เว็บร้าน src/components/home/Hero.tsx) — ไม่ตั้ง = ใต้ข้อความเหมือนเดิม
      f("btnPos", "ตำแหน่งปุ่ม (คอม)", "select", {
        group: "action",
        default: "flow",
        display: "tiles",
        options: [...HERO_BTN_GRID, HERO_BTN_FLOW, { v: "custom", l: "กำหนดเอง (เลื่อนเอง)", sketch: "pos-custom" }],
        hint: "กดจุดบนแบนเนอร์ที่อยากวางปุ่ม · ดูผลในพรีวิวได้ทันที",
      }),
      f("btnX", "ปุ่ม: ซ้าย → ขวา (%)", "range", { group: "action", default: 50, min: 0, numMax: 100, step: 1, showIf: { key: "btnPos", eq: "custom" } }),
      f("btnY", "ปุ่ม: บน → ล่าง (%)", "range", { group: "action", default: 80, min: 0, numMax: 100, step: 1, showIf: { key: "btnPos", eq: "custom" } }),
      f("btnPosMobile", "ตำแหน่งปุ่ม (มือถือ)", "select", {
        group: "action",
        default: "same",
        display: "tiles",
        options: [...HERO_BTN_GRID, HERO_BTN_FLOW, { v: "same", l: "เหมือนคอม", sketch: "same" }],
        hint: "รูปมือถือมักจัดคนละแบบ → เลือกแยกได้",
      }),
      image("imageKey", "รูปพื้นหลัง", { hint: "แนะนำกว้าง 2400px+ (เต็มจอคมชัด) · ไม่ใส่ = พื้นหลังไล่สีจากธีม", minPx: 2400 }),
      image("mobileImageKey", "รูปพื้นหลัง (มือถือ)", { hint: "ไม่ใส่ = ใช้รูปเดียวกับคอม · จอมือถือแคบ รูปแนวนอนจะโดนตัดข้าง แนะนำรูปแนวตั้ง 1080×1350+", minPx: 1080 }),
      f("crop", "รูปพื้นหลัง: ส่วนที่เห็น / ซูม", "crop", { group: "media", default: { x: 50, y: 50, zoom: 100 }, wide: true, cropImage: "imageKey", cropBox: "16:7", hint: "กรอบ ≈ แบนเนอร์บนจอคอม (สูงจริงตามความสูงที่ตั้ง)" }),
      text("imageAlt", "คำบรรยายรูป (Alt)", { group: "media", default: "", max: 200, hint: "มีผลกับ SEO" }),
      f("overlay", "ความทึบของสีทับรูป (%)", "range", { group: "media", default: 45, min: 0, numMax: 90, step: 5 }),
      // 🎬 วิดีโอพื้นหลัง: อัปโหลด / เลือกจากคลัง (ช่องคลิปกลาง videoFile ตัวเดียวกับ Section วิดีโอ) · ลิงก์เดิมยังใช้ได้
      f("videoFile", "🖥 วิดีโอพื้นหลัง — คอม (อัปโหลด / เลือกจากคลัง)", "videoFile", {
        group: "media",
        default: null,
        wide: true,
        hint: "เล่นวนเงียบ ๆ แทนรูป (รูปพื้นหลังโชว์ระหว่างโหลด) · อัปได้ถึง 200 MB หรือกด 📁 เลือกคลิปเดิมจากคลัง · แนะนำ MP4 แนวนอน 16:9 · 6–10 วินาที ≤ 15 MB ไม่มีเสียง",
      }),
      f("videoFileMobile", "📱 วิดีโอพื้นหลัง — มือถือ", "videoFile", {
        group: "media",
        default: null,
        wide: true,
        hint: "ไม่ใส่ = มือถือใช้คลิปคอม · ใส่แค่ช่องนี้ = มือถือเล่นคลิป คอมโชว์รูปพื้นหลัง · แนะนำคลิปแนวตั้ง 4:5 / 9:16",
      }),
      f("videoUrl", "หรือ ลิงก์วิดีโอ (.mp4 / .webm)", "href", {
        group: "media",
        default: "",
        wide: true,
        placeholder: "https://…/clip.mp4",
        hint: "ใช้เมื่อคลิปอยู่ที่อื่น · มีคลิปที่อัปไว้ด้านบน = ใช้คลิปนั้นก่อน",
      }),
      f("parallax", "พื้นหลังเลื่อนช้ากว่าเนื้อหา (Parallax)", "toggle", { group: "layout", default: false }),
      f("height", "ความสูง", "select", {
        group: "layout",
        default: "auto",
        options: [
          { v: "auto", l: "พอดีเนื้อหา" },
          { v: "tall", l: "สูง (70% ของจอ)" },
          { v: "full", l: "เต็มจอ" },
        ],
      }),
    ],
    children: {
      key: "features",
      label: "จุดเด่นใต้แบนเนอร์",
      itemLabel: "จุดเด่น",
      icon: "✨",
      max: 6,
      fields: [text("title", "หัวข้อสั้น", { default: "", max: 60 }), text("desc", "คำอธิบาย", { default: "", max: 120 })],
      summary: (it) => s(it.title) || "จุดเด่น",
    },
    summary: (b) => `${s(b.title)} ${s(b.titleAccent)}`.trim() || "ยังไม่ตั้งหัวเรื่อง",
    validate: (b, label) => {
      const out: Omit<ValidationIssue, "blockId">[] = [];
      if (b.imageKey && !s(b.imageAlt)) out.push({ level: "warning", message: `${label}: รูปพื้นหลังยังไม่มีคำบรรยาย (Alt) — มีผลกับ SEO` });
      const p = (b.primary ?? {}) as { text?: string; href?: string };
      if (s(p.text) && !s(p.href)) out.push({ level: "error", message: `${label}: ปุ่มหลักยังไม่มีลิงก์` });
      return out;
    },
  },

  /* ผืนผ้าใบอิสระ — ค่าตัวเลือก/สรุป/ตรวจ อยู่ที่ lib/website-canvas.ts · ตัววาดอยู่ที่เว็บร้าน CanvasSection */
  canvas: {
    type: "canvas",
    meta: {
      label: "ผืนผ้าใบอิสระ",
      icon: "🎨",
      hint: "วางรูป ข้อความ ปุ่ม ของตกแต่ง ตรงไหนก็ได้ — ลาก/ย่อ/หมุนในพรีวิว",
      group: "พื้นฐาน",
      beta: "beta_canvas",
    },
    fields: [
      f("height", "ความสูงผืน", "number", {
        group: "layout",
        default: 560,
        min: 120,
        numMax: 2400,
        step: 10,
        hint: "หน่วยเดียวกับตำแหน่งชิ้น (ผืนกว้าง 1200) · ลากแถบใต้ผืนในพรีวิวก็ได้",
      }),
      image("bgImageKey", "รูปพื้นหลังผืน", { hint: "เต็มความกว้างจอ · ไม่ใส่ = ใช้สีพื้นจากแท็บรูปลักษณ์" }),
      f("bgFit", "รูปพื้นหลัง: การวาง", "select", {
        group: "media",
        default: "cover",
        options: [
          { v: "cover", l: "เต็มผืน (ตัดส่วนที่เกิน)" },
          { v: "contain", l: "เห็นทั้งรูป (เหลือขอบเป็นสีพื้น)" },
        ],
        hint: "ใช้เมื่อมีรูปพื้นหลัง · ลากกรอบเลือกส่วนที่เห็นได้ในแผงตั้งค่าของผืน",
      }),
      f("bgX", "รูปพื้นหลัง: ซ้าย ↔ ขวา (%)", "range", { group: "media", default: 50, min: 0, numMax: 100, step: 1 }),
      f("bgY", "รูปพื้นหลัง: บน ↕ ล่าง (%)", "range", { group: "media", default: 50, min: 0, numMax: 100, step: 1 }),
      f("bgZoom", "รูปพื้นหลัง: ซูม (%)", "range", { group: "media", default: 100, min: 100, numMax: 300, step: 5, showIf: { key: "bgFit", eq: "cover" } }),
      f("bgMCustom", "มือถือ: ปรับรูปพื้นหลังแยก", "toggle", { group: "media", default: false, hint: "ปิด = มือถือใช้ตำแหน่ง/ซูมเดียวกับคอม · ปรับได้ในหน้าแก้เต็มจอ → 📲 มือถือ" }),
      f("bgMFit", "มือถือ: รูปพื้นหลัง การวาง", "select", {
        group: "media",
        default: "cover",
        options: [
          { v: "cover", l: "เต็มผืน (ตัดส่วนที่เกิน)" },
          { v: "contain", l: "เห็นทั้งรูป" },
        ],
        showIf: { key: "bgMCustom", eq: true },
      }),
      f("bgMX", "มือถือ: ซ้าย ↔ ขวา (%)", "range", { group: "media", default: 50, min: 0, numMax: 100, step: 1, showIf: { key: "bgMCustom", eq: true } }),
      f("bgMY", "มือถือ: บน ↕ ล่าง (%)", "range", { group: "media", default: 50, min: 0, numMax: 100, step: 1, showIf: { key: "bgMCustom", eq: true } }),
      f("bgMZoom", "มือถือ: ซูม (%)", "range", { group: "media", default: 100, min: 100, numMax: 300, step: 5, showIf: [{ key: "bgMCustom", eq: true }, { key: "bgMFit", eq: "cover" }] }),
      f("mobileMode", "มือถือ: วิธีจัด", "select", {
        group: "layout",
        default: "auto",
        options: [
          { v: "auto", l: "เรียงลงมาให้อัตโนมัติ" },
          { v: "custom", l: "จัดเอง (ผืนมือถือแยก)" },
        ],
        hint: "จัดเอง = ลากวางบนจอมือถือได้เหมือนคอม (กด 📲 มือถือ ในหน้าแก้เต็มจอ)",
      }),
      f("mobileAlign", "มือถือ: จัดชิ้นส่วน", "select", {
        group: "layout",
        default: "center",
        options: [
          { v: "center", l: "กึ่งกลาง" },
          { v: "left", l: "ชิดซ้าย" },
        ],
        hint: "แบบเรียงอัตโนมัติ: เรียงชิ้นลงมาตามตำแหน่ง บน→ล่าง",
        showIf: { key: "mobileMode", eq: "auto" },
      }),
      f("mobileHeight", "มือถือ: ความสูงผืน", "number", {
        group: "layout",
        default: 800,
        min: 120,
        numMax: 8000,
        step: 10,
        hint: "หน่วยผืนมือถือ (กว้าง 400) · ลากแถบใต้ผืนในพรีวิวมือถือก็ได้",
        showIf: { key: "mobileMode", eq: "custom" },
      }),
    ],
    children: {
      key: "items",
      label: "ชิ้นส่วนบนผืน (บน = อยู่หลังสุด)",
      itemLabel: "ชิ้น",
      icon: "🧩",
      max: 60,
      blank: () => canvasItemPreset("text"),
      summary: canvasItemSummary,
      fields: canvasItemFields(),
    },
    summary: (b) => `${arr(b.items).length} ชิ้น · สูง ${Number(b.height) || 0}`,
    validate: (b, label) => validateCanvas(b, label),
  },

  "rich-text": {
    type: "rich-text",
    meta: { label: "ข้อความอิสระ", icon: "📝", hint: "หัวข้อ + ย่อหน้าอิสระ", group: "พื้นฐาน" },
    fields: [
      text("eyebrow", "คำโปรยเหนือหัวข้อ", { default: "", max: 120 }),
      text("title", "หัวข้อ", { default: "หัวข้อ", max: 160, wide: true }),
      area("body", "เนื้อหา", { default: "เนื้อหา", max: 3000, hint: "ขึ้นบรรทัดใหม่ได้ตามที่พิมพ์" }),
    ],
    summary: (b) => s(b.title) || s(b.body).slice(0, 60) || "ยังไม่มีเนื้อหา",
    validate: (b, label) => (!s(b.title) && !s(b.body) ? [{ level: "warning", message: `${label}: ยังไม่มีเนื้อหา` }] : []),
  },

  /* ── 🧭 ศูนย์ช่วยเหลือ (2026-10-19) — ใช้ในหน้า Privacy / Terms / จัดส่ง-คืน / ติดตาม / ติดต่อ (แม่แบบ lib/website-help-center.ts) ── */
  doc: {
    type: "doc",
    meta: { label: "เอกสาร / นโยบาย", icon: "📜", hint: "ข้อความยาวแบ่งเป็นหัวข้อ เช่น นโยบายความเป็นส่วนตัว ข้อกำหนด การจัดส่ง-คืนสินค้า", group: "เนื้อหา" },
    fields: [
      text("title", "หัวข้อเอกสาร", { default: "", max: 160, wide: true, hint: "ว่าง = ไม่โชว์ (หน้าในศูนย์ช่วยเหลือมีชื่อหน้าอยู่แล้ว)" }),
      text("updated", "บรรทัดวันที่อัปเดต", { default: "", max: 80, placeholder: "อัปเดตล่าสุด 19 ตุลาคม 2569" }),
      area("intro", "ย่อหน้าเปิด", { default: "", max: 3000, hint: "ใส่ {shop} {email} {phone} {line} {address} ได้ — ระบบแทนด้วยข้อมูลร้านให้เอง" }),
      f("numbered", "ใส่เลขหน้าหัวข้อ (1. 2. 3.)", "toggle", { group: "layout", default: true }),
      f("width", "ความกว้าง", "select", {
        group: "layout",
        default: "normal",
        options: [
          { v: "narrow", l: "แคบ (อ่านง่าย)" },
          { v: "normal", l: "ปกติ" },
          { v: "wide", l: "กว้าง" },
        ],
      }),
    ],
    children: {
      key: "sections",
      label: "หัวข้อในเอกสาร",
      itemLabel: "หัวข้อ",
      icon: "§",
      min: 1,
      max: 40,
      fields: [
        text("title", "หัวข้อ", { default: "หัวข้อ", max: 160, wide: true }),
        area("body", "เนื้อหา", {
          default: "",
          max: 6000,
          hint: "ขึ้นบรรทัดใหม่ได้ · บรรทัดว่าง = ย่อหน้าใหม่ · ขึ้นต้นด้วย - = ข้อย่อย · [ข้อความ](/contact) = ลิงก์ · ใส่ {shop} {email} {phone} {line} {address} {free_shipping} {shipping_fee} ได้ (ข้อมูลร้านว่าง = บรรทัดนั้นไม่โชว์)",
        }),
      ],
      summary: (it) => s(it.title) || s(it.body).slice(0, 40) || "หัวข้อ",
    },
    summary: (b) => s(b.title) || `${arr(b.sections).length} หัวข้อ`,
    validate: (b, label) => (!arr(b.sections).some((x) => s(x.title) || s(x.body)) && !s(b.intro) ? [{ level: "warning", message: `${label}: ยังไม่มีเนื้อหา` }] : []),
  },

  "order-track": {
    type: "order-track",
    meta: { label: "ติดตามคำสั่งซื้อ", icon: "🚚", hint: "ลูกค้ากรอกเลขที่ + เบอร์ ดูสถานะ/เลขพัสดุ · สมาชิกที่ล็อกอินเห็นคำสั่งซื้อของตัวเองทันที", group: "เนื้อหา" },
    fields: [
      text("title", "หัวข้อ", { default: "", max: 120, wide: true, hint: "ว่าง = ไม่โชว์" }),
      area("intro", "คำอธิบาย", { default: "กรอกเลขที่คำสั่งซื้อและเบอร์โทรที่ใช้สั่ง เพื่อดูสถานะและเลขพัสดุ", max: 400 }),
      f("showMemberOrders", "สมาชิกที่ล็อกอินอยู่ เห็นรายการคำสั่งซื้อของตัวเอง", "toggle", { default: true }),
      area("helpText", "ข้อความใต้ฟอร์ม", { default: "", max: 300, placeholder: "เช่น ไม่พบคำสั่งซื้อ? ทักเราทาง LINE" }),
    ],
    summary: (b) => s(b.title) || "ฟอร์มติดตามคำสั่งซื้อ",
  },

  "contact-form": {
    type: "contact-form",
    meta: { label: "ฟอร์มติดต่อ", icon: "✉️", hint: "ลูกค้ากรอกชื่อ/อีเมล/ข้อความ → เข้ากล่องข้อความใน ERP (แท็บ 🏪 ข้อมูลร้าน)", group: "เนื้อหา" },
    fields: [
      text("title", "หัวข้อ", { default: "", max: 120, wide: true, hint: "ว่าง = ไม่โชว์" }),
      area("intro", "คำอธิบาย", { default: "ส่งข้อความถึงเรา ทีมงานจะตอบกลับภายใน 1 วันทำการ", max: 400 }),
      area("topics", "หัวข้อให้ลูกค้าเลือก (บรรทัดละ 1)", { default: "สอบถามสินค้า\nคำสั่งซื้อ / การจัดส่ง\nเปลี่ยน / คืนสินค้า\nอื่น ๆ", max: 600, hint: "ว่าง = ไม่มีช่องเลือกหัวข้อ" }),
      f("askPhone", "มีช่องเบอร์โทร", "toggle", { default: true }),
      f("phoneRequired", "เบอร์โทรต้องกรอก", "toggle", { default: false, showIf: { key: "askPhone", eq: true } }),
      f("showChannels", "โชว์ช่องทางติดต่ออื่น (โทร / LINE / อีเมล) ด้านข้าง", "toggle", { group: "layout", default: true }),
      text("buttonText", "ข้อความปุ่ม", { group: "action", default: "ส่งข้อความ", max: 40 }),
      area("successText", "ข้อความเมื่อส่งสำเร็จ", { default: "ได้รับข้อความแล้ว ขอบคุณที่ติดต่อเรา เราจะตอบกลับโดยเร็วที่สุด", max: 300 }),
    ],
    summary: (b) => s(b.title) || "ฟอร์มติดต่อ",
  },

  image: {
    type: "image",
    meta: { label: "รูปภาพ / แบนเนอร์รูป", icon: "🏞️", hint: "รูปเดี่ยว + คำบรรยาย + ลิงก์", group: "พื้นฐาน" },
    fields: [
      image("imageKey", "รูปภาพ", { hint: "แนะนำกว้าง 1200px+", required: true, requiredMessage: "ยังไม่ได้เลือกรูป" }),
      image("mobileImageKey", "รูปภาพ (มือถือ)", { hint: "ไม่ใส่ = ใช้รูปเดียวกับคอม · ใส่เมื่ออยากให้จอมือถือเห็นรูปคนละแนว เช่น แนวตั้ง" }),
      text("alt", "คำบรรยายรูป (Alt) — มีผลกับ SEO", { group: "media", default: "", max: 200, placeholder: "อธิบายว่าในรูปคืออะไร" }),
      text("caption", "ข้อความใต้รูป", { default: "", max: 300 }),
      f("href", "ลิงก์เมื่อคลิกรูป", "target", { group: "action", default: "", wide: true, hint: "ไม่มีลิงก์ = คลิกไม่ได้" }),
      f("width", "ความกว้าง", "select", {
        group: "layout",
        default: "wide",
        options: [
          { v: "narrow", l: "แคบ (อ่านง่าย)" },
          { v: "wide", l: "กว้าง (แนะนำ)" },
          { v: "full", l: "เต็มจอ" },
        ],
      }),
      ...imageLookFields({ ratio: "auto", allowAuto: true, frame: "auto", autoFrame: "อัตโนมัติ (เต็มจอ = เหลี่ยม · อื่น = มุมมน)", ratioHint: "ตามรูปจริง = ไม่ตัด · เลือกสัดส่วน = ตัด + เลือกส่วนที่เห็นได้" }),
      f("crop", "ส่วนที่เห็น / ซูม", "crop", { group: "media", default: { x: 50, y: 50, zoom: 100 }, wide: true, cropImage: "imageKey", cropRatio: "ratio" }),
    ],
    summary: (b) => (b.imageKey ? s(b.caption) || s(b.alt) || "รูปภาพ" : "ยังไม่ได้เลือกรูป"),
    validate: (b, label) => (b.imageKey && !s(b.alt) ? [{ level: "warning", message: `${label}: ยังไม่มีคำบรรยายรูป (Alt)` }] : []),
  },

  gallery: {
    type: "gallery",
    meta: { label: "แกลเลอรีรูป", icon: "🖼️", hint: "หลายรูปเรียงเป็นตาราง", group: "พื้นฐาน" },
    fields: [
      ...headFields({ title: "แกลเลอรี" }),
      f("columns", "จำนวนคอลัมน์ (จอคอม)", "number", { group: "layout", default: 3, min: 1, numMax: 6 }),
      ...imageLookFields({ ratio: "1:1", allowAuto: true, ratioHint: "ตัดรูปเป็นสัดส่วนนี้ — เลือกส่วนที่เห็น/ซูมได้ทีละรูป (กดที่รูปในพรีวิว/ต้นไม้)" }),
      f("gap", "ระยะห่างระหว่างรูป", "select", {
        group: "layout",
        default: "md",
        options: [
          { v: "none", l: "ชิดกัน" },
          { v: "sm", l: "น้อย" },
          { v: "md", l: "กลาง" },
          { v: "lg", l: "มาก" },
        ],
      }),
      f("fullBleed", "รูปเต็มความกว้างจอ", "toggle", { group: "layout", default: false, hint: "ตารางรูปยืดเต็มจอ (หัวข้อยังอยู่ในกรอบปกติ)" }),
      f("hoverZoom", "ชี้แล้วรูปขยายนิด ๆ", "toggle", { group: "layout", default: true }),
      ...imageCaptionFields(),
    ],
    children: {
      key: "items",
      label: "รูปในแกลเลอรี",
      itemLabel: "รูป",
      icon: "🏞️",
      max: 24,
      fields: [
        image("imageKey", "รูป"),
        f("crop", "ส่วนที่เห็น / ซูม", "crop", { group: "media", default: { x: 50, y: 50, zoom: 100 }, wide: true, cropImage: "imageKey", cropRatio: "ratio" }),
        text("alt", "คำบรรยายรูป (Alt)", { default: "", max: 200 }),
        text("title", "หัวข้อใต้รูป", { default: "", max: 120, wide: true, hint: "หน้าตา/ตำแหน่ง ตั้งที่ Section แกลเลอรี → ข้อความประกอบรูป" }),
        area("caption", "คำอธิบายใต้รูป", { default: "", max: 300 }),
        f("href", "กดรูปแล้วไปที่", "target", { group: "action", default: "", hint: "ว่าง = กดไม่ได้" }),
        text("linkText", "ข้อความลิงก์ใต้รูป", { group: "action", default: "", max: 40, placeholder: "เช่น ดูสินค้า →", hint: "โชว์เมื่อตั้ง \"กดรูปแล้วไปที่\" แล้ว · ว่าง = ไม่มีลิงก์ใต้รูป" }),
      ],
      summary: (it) => (it.imageKey ? s(it.title) || s(it.caption) || s(it.alt) || "รูป" : "ยังไม่เลือกรูป"),
    },
    summary: (b) => count(arr(b.items).length, "รูป"),
    validate: (b, label) => {
      const withImg = arr(b.items).filter((i) => i.imageKey);
      if (!withImg.length) return [{ level: "error", message: `${label}: ยังไม่มีรูปในแกลเลอรี` }];
      return withImg.some((i) => !s(i.alt)) ? [{ level: "warning", message: `${label}: บางรูปยังไม่มีคำบรรยาย (Alt)` }] : [];
    },
  },

  button: {
    type: "button",
    meta: { label: "ปุ่ม", icon: "🔘", hint: "ปุ่มเดี่ยว วางคั่นตรงไหนก็ได้", group: "พื้นฐาน" },
    fields: [
      text("text", "ข้อความบนปุ่ม", { default: "ดูสินค้าทั้งหมด", max: 60, required: true, requiredMessage: "ยังไม่ได้ใส่ข้อความบนปุ่ม" }),
      f("href", "ลิงก์ปลายทาง", "target", { default: "/shop", wide: true, required: true, requiredMessage: "ยังไม่ได้ใส่ลิงก์ปลายทาง" }),
      f("variant", "รูปแบบ", "select", {
        group: "layout",
        default: "brand",
        options: [
          { v: "brand", l: "ทึบสีแบรนด์" },
          { v: "outline", l: "ขอบบาง" },
        ],
      }),
    ],
    summary: (b) => (s(b.text) ? `${s(b.text)} → ${s(b.href) || "ยังไม่มีลิงก์"}` : "ยังไม่ได้ตั้งปุ่ม"),
  },

  divider: {
    type: "divider",
    meta: { label: "เส้นคั่น / เว้นระยะ", icon: "➖", hint: "แบ่งช่วงเนื้อหาให้อ่านง่าย", group: "พื้นฐาน" },
    fields: [
      f("variant", "รูปแบบ", "select", {
        default: "line",
        options: [
          { v: "line", l: "เส้นบาง" },
          { v: "dots", l: "จุดไข่ปลา" },
          { v: "space", l: "เว้นว่าง" },
        ],
      }),
    ],
    summary: (b) => ({ line: "เส้นบาง", dots: "จุดไข่ปลา", space: "เว้นว่าง" } as Record<string, string>)[s(b.variant)] ?? "เส้นคั่น",
  },

  // 🎬 วิดีโอ (2026-10-19 ขยาย): ลิงก์ YouTube/Vimeo หรืออัปโหลดเอง · 4 แบบแสดง · ตั้งการเล่น/สัดส่วน/กรอบ/ข้อความทับได้
  //   บล็อกเก่า (มีแค่ url/title/caption) = ปกติ + ลิงก์ + กว้างพอดีอ่าน 16:9 → หน้าตาเดิม · เว็บร้านวาดที่ src/components/home/VideoSection.tsx
  video: {
    type: "video",
    meta: { label: "วิดีโอ", icon: "🎬", hint: "คลิป YouTube/Vimeo หรืออัปโหลดเอง — ปกติ · พื้นหลัง+ข้อความทับ · คู่ข้อความ · กดเล่นในป๊อป", group: "พื้นฐาน" },
    fields: [
      f("layout", "แบบแสดง", "select", {
        group: "layout",
        default: "standard",
        wide: true,
        options: [
          { v: "standard", l: "ปกติ — หัวข้อ + คลิป" },
          { v: "background", l: "วิดีโอพื้นหลัง + ข้อความ/ปุ่มทับ (เล่นเอง เงียบ วนซ้ำ)" },
          { v: "split", l: "คลิปคู่ข้อความ (ซ้าย / ขวา)" },
          { v: "popup", l: "รูปปก + ▶ กดแล้วเล่นในป๊อปพร้อมเสียง" },
        ],
      }),
      f("source", "คลิปจาก", "select", {
        group: "media",
        default: "link",
        wide: true,
        options: [
          { v: "link", l: "ลิงก์ YouTube / Vimeo" },
          { v: "upload", l: "อัปโหลดไฟล์เอง (MP4 / WebM / MOV)" },
        ],
      }),
      f("url", "ลิงก์คลิป", "video", {
        group: "media",
        default: "",
        wide: true,
        placeholder: "https://www.youtube.com/watch?v=…",
        hint: "รับเฉพาะ YouTube และ Vimeo",
        required: true,
        requiredMessage: "ยังไม่มีลิงก์คลิป (รับเฉพาะ YouTube และ Vimeo)",
        showIf: VIDEO_LINK,
      }),
      f("file", "🖥 คลิปสำหรับคอม (คลิปหลัก)", "videoFile", {
        group: "media",
        default: null,
        wide: true,
        hint: "อัปไฟล์ได้ถึง 200 MB (เข้าคลังให้เอง) หรือกด 📁 เลือกคลิปเดิมจากคลัง · แนะนำ MP4 (H.264) 1080p",
        required: true,
        requiredOr: "fileMobile",
        requiredMessage: "ยังไม่ได้อัปโหลดคลิป (ใส่คลิปคอมหรือมือถืออย่างน้อย 1 คลิป)",
        showIf: VIDEO_UPLOAD,
      }),
      f("fileMobile", "📱 คลิปสำหรับมือถือ", "videoFile", {
        group: "media",
        default: null,
        wide: true,
        hint: "ไม่ใส่ = มือถือใช้คลิปคอม · ใส่แค่ช่องนี้ = คอมก็เล่นคลิปนี้ · เช่น คลิปแนวตั้ง 9:16 ให้เต็มจอมือถือ",
        showIf: VIDEO_UPLOAD,
      }),
      image("poster", "รูปปก (ก่อนเล่น / ระหว่างโหลด)", { hint: "ไม่ใส่: YouTube ใช้รูปปกของคลิป · ไฟล์ที่อัปโหลดใช้ภาพแรกของคลิป" }),
      // ▶ การเล่น
      f("autoplay", "เล่นเองเมื่อเลื่อนมาถึง", "toggle", { group: "media", default: false, hint: "เล่นเอง = เริ่มแบบเงียบเสมอ (เบราว์เซอร์บังคับ)", showIf: { key: "layout", eq: ["standard", "split"] } }),
      f("muted", "ปิดเสียงไว้ก่อน", "toggle", { group: "media", default: false, showIf: { key: "layout", eq: ["standard", "split"] } }),
      f("loop", "เล่นวนซ้ำ", "toggle", { group: "media", default: false, showIf: { key: "layout", eq: ["standard", "split", "popup"] } }),
      f("controls", "โชว์ปุ่มควบคุม (เล่น/หยุด/เสียง)", "toggle", { group: "media", default: true, showIf: { key: "layout", eq: ["standard", "split", "popup"] } }),
      f("start", "เริ่มที่วินาที", "number", { group: "media", default: 0, min: 0, numMax: 36000, hint: "0 = ต้นคลิป" }),
      f("end", "จบที่วินาที", "number", { group: "media", default: 0, min: 0, numMax: 36000, hint: "0 = จนจบคลิป · Vimeo ตั้งได้แค่จุดเริ่ม" }),
      // ✍️ ข้อความ
      text("eyebrow", "คำโปรยเหนือหัวข้อ", { default: "", max: 80 }),
      text("title", "หัวข้อ", { default: "", max: 160 }),
      f("caption", "คำอธิบาย", "textarea", { group: "content", default: "", max: 400 }),
      link("button", "ปุ่ม", "", "", { hint: "ว่าง = ไม่มีปุ่ม", showIf: { key: "layout", eq: ["standard", "background", "split"] } }),
      // 📐 หน้าตา
      f("ratio", "สัดส่วนคลิป", "select", { group: "layout", default: "16:9", options: VIDEO_RATIOS }),
      f("mobileRatio", "สัดส่วนบนมือถือ", "select", { group: "layout", default: "same", options: [{ v: "same", l: "เหมือนจอคอม" }, ...VIDEO_RATIOS] }),
      f("bgHeight", "ความสูงพื้นหลัง", "select", {
        group: "layout",
        default: "ratio",
        options: [
          { v: "ratio", l: "ตามสัดส่วนคลิป" },
          { v: "60", l: "60% ของความสูงจอ" },
          { v: "80", l: "80% ของความสูงจอ" },
          { v: "100", l: "เต็มจอ" },
        ],
        showIf: { key: "layout", eq: "background" },
      }),
      f("width", "ความกว้าง", "select", {
        group: "layout",
        default: "content",
        options: [
          { v: "content", l: "พอดีอ่าน (แบบเดิม)" },
          { v: "wide", l: "กว้างเท่าเนื้อหาเว็บ" },
          { v: "full", l: "เต็มจอ ชิดขอบ" },
        ],
      }),
      // กรอบ (ของกลาง imageLookFields — ไม่เอาสัดส่วนของชุดรูป ใช้สัดส่วนคลิปด้านบนแทน)
      ...imageLookFields({ ratio: "16:9" }).filter((fd) => fd.key !== "ratio"),
      f("side", "ตำแหน่งคลิป", "select", {
        group: "layout",
        default: "left",
        options: [
          { v: "left", l: "คลิปซ้าย · ข้อความขวา" },
          { v: "right", l: "ข้อความซ้าย · คลิปขวา" },
        ],
        showIf: { key: "layout", eq: "split" },
      }),
      f("textPos", "ตำแหน่งข้อความบนคลิป", "select", { group: "layout", default: "bottom-left", options: VIDEO_TEXT_POS, showIf: { key: "layout", eq: "background" } }),
      f("textColor", "สีข้อความบนคลิป", "select", {
        group: "layout",
        default: "light",
        options: [
          { v: "light", l: "ขาว (คลิปโทนเข้ม)" },
          { v: "dark", l: "เข้ม (คลิปโทนอ่อน)" },
        ],
        showIf: { key: "layout", eq: "background" },
      }),
      f("shade", "ความมืดทับคลิป (%)", "range", { group: "layout", default: 30, min: 0, numMax: 80, step: 5, hint: "ให้อ่านข้อความง่ายขึ้น · 0 = ไม่มี", showIf: { key: "layout", eq: "background" } }),
    ],
    summary: (b) => {
      const up = s(b.source) === "upload";
      const has = up ? !!b.file : !!s(b.url);
      return has ? s(b.title) || (up ? "คลิปที่อัปโหลด" : s(b.url)) : up ? "ยังไม่ได้อัปโหลดคลิป" : "ยังไม่มีลิงก์คลิป";
    },
  },

  /* ── เนื้อหา ── */
  "image-text": {
    type: "image-text",
    meta: { label: "รูปคู่ข้อความ", icon: "🖼️", hint: "รูปด้านหนึ่ง ข้อความ+ปุ่มอีกด้าน", group: "เนื้อหา" },
    fields: [
      image("imageKey", "รูปภาพ", { hint: "ตั้งสัดส่วน/กรอบ/ขนาด/ส่วนที่เห็นได้ด้านล่าง", required: true, requiredMessage: "ยังไม่ได้เลือกรูป" }),
      f("crop", "ส่วนที่เห็น / ซูม", "crop", { group: "media", default: { x: 50, y: 50, zoom: 100 }, wide: true, cropImage: "imageKey", cropRatio: "ratio" }),
      f("imgSize", "ขนาดรูป (%)", "range", { group: "media", default: 100, min: 40, numMax: 100, step: 5, hint: "ความกว้างของรูปในฝั่งของรูป (100 = เต็มฝั่ง)" }),
      text("imageAlt", "คำบรรยายรูป (Alt)", { group: "media", default: "", max: 200 }),
      ...headFields({ subtitle: false }),
      area("body", "เนื้อหา", { default: "", max: 1500 }),
      link("primary", "ปุ่มหลัก", "", ""),
      link("secondary", "ปุ่มรอง", "", ""),
      f("imagePosition", "ตำแหน่งรูป", "select", {
        group: "layout",
        default: "left",
        options: [
          { v: "left", l: "รูปซ้าย ข้อความขวา" },
          { v: "right", l: "รูปขวา ข้อความซ้าย" },
        ],
      }),
      ...imageLookFields({ ratio: "4:3" }),
    ],
    summary: (b) => s(b.title) || "รูปคู่ข้อความ",
  },

  multicolumn: {
    type: "multicolumn",
    meta: { label: "หลายคอลัมน์", icon: "▦", hint: "ไอคอน/รูป + หัวข้อ + ข้อความ เรียง 2–4 คอลัมน์", group: "เนื้อหา" },
    fields: [
      ...headFields({ subtitle: true }),
      f("columns", "จำนวนคอลัมน์ (บนคอม)", "number", { group: "layout", default: 3, min: 2, numMax: 4 }),
      f("cardStyle", "รูปแบบการ์ด", "select", {
        group: "layout",
        default: "card",
        options: [
          { v: "card", l: "มีกรอบการ์ด" },
          { v: "plain", l: "ไม่มีกรอบ" },
        ],
      }),
      ...imageLookFields({ ratio: "4:3", ratioHint: "รูปของทุกคอลัมน์ — เลือกส่วนที่เห็น/ซูมได้ทีละคอลัมน์" }),
    ],
    children: {
      key: "items",
      label: "คอลัมน์",
      itemLabel: "คอลัมน์",
      icon: "▮",
      min: 1,
      max: 8,
      fields: [
        f("emoji", "ไอคอน (อีโมจิ)", "emoji", { default: "✨" }),
        image("imageKey", "รูป (ถ้ามี จะใช้แทนไอคอน)"),
        f("crop", "ส่วนที่เห็น / ซูม", "crop", { group: "media", default: { x: 50, y: 50, zoom: 100 }, wide: true, cropImage: "imageKey", cropRatio: "ratio" }),
        text("title", "หัวข้อ", { default: "หัวข้อ", max: 80 }),
        area("text", "ข้อความ", { default: "", max: 400 }),
        link("link", "ลิงก์ (ถ้ามี)", "", ""),
      ],
      summary: (it) => s(it.title) || "คอลัมน์",
      blank: () => ({ emoji: "✨", imageKey: null, title: "หัวข้อ", text: "", link: { text: "", href: "" } }),
    },
    summary: (b) => `${count(arr(b.items).length, "คอลัมน์")}${s(b.title) ? ` · ${s(b.title)}` : ""}`,
    validate: (b, label) => (!arr(b.items).length ? [{ level: "warning", message: `${label}: ยังไม่มีคอลัมน์` }] : []),
  },

  slideshow: {
    type: "slideshow",
    meta: { label: "สไลด์โชว์", icon: "🎞️", hint: "รูปหลายใบเลื่อนสลับ + ข้อความบนรูป", group: "เนื้อหา" },
    // เว็บร้าน: src/components/home/Slideshow.tsx · ค่าเริ่มทุกช่อง = หน้าตาเดิม (สไลด์ที่จัดไว้แล้วไม่เปลี่ยน)
    fields: [
      f("shape", "รูปทรงสไลด์ (คอม)", "select", { group: "layout", default: "height", wide: true, display: "tiles", options: SLIDE_SHAPES, hint: "กรอบ \"ส่วนที่เห็น / ซูม\" ในแต่ละสไลด์เปลี่ยนตาม" }),
      f("height", "ความสูง", "select", {
        group: "layout",
        default: "medium",
        options: [
          { v: "short", l: "เตี้ย" },
          { v: "medium", l: "กลาง" },
          { v: "tall", l: "สูง" },
        ],
        showIf: { key: "shape", eq: "height" },
      }),
      f("shapeMobile", "รูปทรงบนมือถือ", "select", {
        group: "layout",
        default: "same",
        wide: true,
        display: "tiles",
        hint: "มือถือจอแคบ — แนวตั้ง 4:5 มักสวยกว่า (ใส่ \"รูปสไลด์ (มือถือ)\" แยกได้ในแต่ละสไลด์)",
        options: [{ v: "same", l: "เหมือนคอม", sketch: "same" }, ...SLIDE_SHAPES.filter((o) => o.v !== "21:9"), { v: "3:4", l: "แนวตั้ง 3:4", sketch: "ss-3-4" }],
      }),
      f("width", "ความกว้าง", "select", {
        group: "layout",
        default: "full",
        options: [
          { v: "full", l: "เต็มความกว้างจอ (แบบเดิม)" },
          { v: "contained", l: "อยู่ในกรอบ มุมมน" },
        ],
      }),
      f("transition", "แบบเปลี่ยนสไลด์", "select", {
        group: "layout",
        default: "fade",
        options: [
          { v: "fade", l: "จางเข้า (แบบเดิม)" },
          { v: "slide", l: "เลื่อนข้าง" },
          { v: "zoom", l: "จาง + ซูมช้า ๆ" },
          { v: "peek", l: "เลื่อนข้าง เห็นขอบสไลด์ข้าง ๆ" },
        ],
      }),
      f("autoplay", "เลื่อนเองอัตโนมัติ", "toggle", { group: "layout", default: true, hint: "เอาเมาส์ชี้ = หยุด" }),
      f("interval", "เวลาต่อสไลด์ (วินาที)", "number", { group: "layout", default: 5, min: 2, numMax: 20, showIf: { key: "autoplay", eq: true } }),
      f("arrows", "ปุ่มเลื่อน ‹ ›", "select", {
        group: "layout",
        default: "always",
        options: [
          { v: "always", l: "โชว์ตลอด (แบบเดิม)" },
          { v: "hover", l: "โผล่ตอนชี้เมาส์" },
          { v: "none", l: "ไม่มี (ปัดนิ้ว / กดตัวบอก)" },
        ],
      }),
      f("indicator", "ตัวบอกตำแหน่ง", "select", {
        group: "layout",
        default: "dots",
        options: [
          { v: "dots", l: "จุด (แบบเดิม)" },
          { v: "lines", l: "ขีด" },
          { v: "number", l: "ตัวเลข 1 / 5" },
          { v: "progress", l: "แถบเวลา" },
          { v: "none", l: "ไม่มี" },
        ],
      }),
      f("navColor", "สีปุ่ม / ตัวบอก", "select", {
        group: "layout",
        default: "light",
        options: [
          { v: "light", l: "ขาว (แบบเดิม)" },
          { v: "dark", l: "ดำ" },
        ],
        // มีปุ่มเลื่อน หรือ มีตัวบอกตำแหน่ง (ค่าของ 2 ช่องไม่ซ้ำกัน ยกเว้น none)
        showIf: { key: "arrows", eq: ["always", "hover", "dots", "lines", "number", "progress"], orKey: "indicator" },
      }),
      f("titleSize", "ขนาดหัวข้อบนรูป", "select", {
        group: "caption",
        default: "m",
        options: [
          { v: "s", l: "เล็ก" },
          { v: "m", l: "กลาง (แบบเดิม)" },
          { v: "l", l: "ใหญ่" },
          { v: "xl", l: "ใหญ่มาก" },
        ],
      }),
      f("textColor", "สีตัวอักษร", "select", {
        group: "caption",
        default: "light",
        options: [
          { v: "light", l: "ขาว + สีทับดำ (แบบเดิม)" },
          { v: "dark", l: "ดำ + สีทับขาว (รูปสว่าง)" },
        ],
      }),
    ],
    children: {
      key: "slides",
      label: "สไลด์",
      itemLabel: "สไลด์",
      icon: "🖼️",
      min: 1,
      max: 10,
      fields: [
        image("imageKey", "รูปสไลด์", { hint: "แนะนำกว้าง 2400px+ (เต็มจอคมชัด)", minPx: 2400 }),
        image("mobileImageKey", "รูปสไลด์ (มือถือ)", { hint: "ไม่ใส่ = ใช้รูปเดียวกับคอม · แนะนำแนวตั้ง 1080×1350+", minPx: 1080 }),
        f("crop", "ส่วนที่เห็น / ซูม", "crop", { group: "media", default: { x: 50, y: 50, zoom: 100 }, wide: true, cropImage: "imageKey", cropRatio: "shape", cropBox: "16:7", hint: "กรอบ = รูปทรงสไลด์บนจอคอม (ตามความสูง / เต็มจอ ≈ 16:7)" }),
        text("alt", "คำบรรยายรูป (Alt)", { group: "media", default: "", max: 200 }),
        text("eyebrow", "คำโปรยเล็ก", { default: "", max: 80 }),
        text("title", "หัวข้อบนรูป", { default: "", max: 120, wide: true }),
        text("subtitle", "คำอธิบาย", { default: "", max: 300, wide: true }),
        link("link", "ปุ่ม", "", ""),
        f("wholeLink", "กดตรงไหนของสไลด์ก็ไปลิงก์ของปุ่ม", "toggle", { group: "action", default: false, hint: "ต้องใส่ปลายทางของปุ่ม" }),
        // 📍 ตำแหน่งข้อความ 3×3 (ปุ่มรูปย่อ pos-* ของกลาง) · "auto" = ตาม "จัดข้อความ" ซ้าย/กลาง แบบเดิม
        f("textPos", "ตำแหน่งข้อความ", "select", { group: "layout", default: "auto", wide: true, display: "tiles", options: [{ v: "auto", l: "แบบเดิม (ตามจัดข้อความ)" }, ...HERO_BTN_GRID] }),
        f("align", "จัดข้อความ", "select", {
          group: "layout",
          default: "left",
          options: [
            { v: "left", l: "ซ้าย" },
            { v: "center", l: "กลาง" },
          ],
          showIf: { key: "textPos", eq: "auto" },
        }),
        f("overlay", "ความทึบของสีทับรูป (%)", "range", { group: "media", default: 35, min: 0, numMax: 90, step: 5 }),
        f("overlayStyle", "แบบสีทับ", "select", {
          group: "media",
          default: "solid",
          options: [
            { v: "solid", l: "ทับทั้งรูป (แบบเดิม)" },
            { v: "gradient", l: "ไล่สี เข้มด้านข้อความ" },
          ],
        }),
      ],
      summary: (it) => s(it.title) || (it.imageKey ? "สไลด์" : "ยังไม่เลือกรูป"),
    },
    summary: (b) => count(arr(b.slides).length, "สไลด์"),
    validate: (b, label) => (!arr(b.slides).some((sl) => sl.imageKey) ? [{ level: "error", message: `${label}: ยังไม่มีรูปในสไลด์` }] : []),
  },

  "two-tracks": {
    type: "two-tracks",
    meta: { label: "สองบริการ", icon: "⚖️", hint: "การ์ดเปรียบเทียบ 2 บริการ", group: "เนื้อหา" },
    fields: headFields({ eyebrow: "บริการของเรา", title: "สองบริการหลัก", subtitle: true }),
    children: {
      key: "cards",
      label: "การ์ดบริการ",
      itemLabel: "การ์ด",
      icon: "🗂️",
      max: 2,
      fields: [
        f("emoji", "ไอคอน (อีโมจิ)", "emoji", { default: "📦" }),
        text("title", "ชื่อบริการ", { default: "", max: 80 }),
        area("desc", "คำอธิบาย", { default: "", max: 400 }),
        f("bullets", "จุดเด่น (รายการ)", "list", { default: [], max: 8, wide: true }),
        link("primary", "ปุ่มหลัก", "", ""),
        link("secondary", "ปุ่มรอง", "", ""),
        f("dark", "การ์ดพื้นเข้ม", "toggle", { group: "layout", default: false }),
      ],
      summary: (it) => s(it.title) || "การ์ด",
      blank: () => ({ emoji: "📦", title: "", desc: "", bullets: [], primary: { text: "", href: "" }, secondary: { text: "", href: "" }, dark: false }),
    },
    summary: (b) =>
      arr(b.cards)
        .map((c) => s(c.title))
        .filter(Boolean)
        .join(" / ") || "2 การ์ด",
  },

  // 🕰 ไทม์ไลน์ / เรื่องราวแบรนด์ (2026-10-15) — เว็บร้าน: src/components/home/TimelineSection.tsx
  timeline: {
    type: "timeline",
    meta: { label: "ไทม์ไลน์ / เรื่องราวแบรนด์", icon: "🕰", hint: "ปี + เรื่องราว + รูป ตามลำดับเวลา", group: "เนื้อหา" },
    fields: [
      ...headFields({ eyebrow: "เรื่องราวของเรา", title: "จากวันแรก ถึงวันนี้", subtitle: true }),
      f("layout", "รูปแบบ", "select", {
        group: "layout",
        default: "line",
        options: [
          { v: "line", l: "แนวนอน (เส้นเวลา)" },
          { v: "zigzag", l: "แนวตั้งสลับซ้าย-ขวา (มีรูป)" },
          { v: "cards", l: "การ์ดเลื่อนข้าง" },
        ],
      }),
      f("imageRatio", "สัดส่วนรูป", "select", {
        group: "layout",
        default: "4:3",
        options: [
          { v: "1:1", l: "จัตุรัส 1:1" },
          { v: "4:3", l: "แนวนอน 4:3" },
          { v: "3:4", l: "แนวตั้ง 3:4" },
          { v: "16:9", l: "แนวนอนกว้าง 16:9" },
        ],
        showIf: { key: "layout", eq: ["zigzag", "cards"] },
      }),
    ],
    children: {
      key: "items",
      label: "ช่วงเวลา",
      itemLabel: "ช่วง",
      icon: "📍",
      max: 20,
      fields: [
        text("year", "ปี / ช่วงเวลา", { default: "1996", max: 30, placeholder: "เช่น 1996 หรือ 2010–2015" }),
        text("title", "หัวข้อ", { default: "", max: 120, wide: true }),
        area("text", "เรื่องราว", { default: "", max: 600 }),
        image("imageKey", "รูป (ถ้ามี)"),
      ],
      summary: (it) => [s(it.year), s(it.title)].filter(Boolean).join(" · ") || "ช่วงเวลา",
    },
    summary: (b) => count(arr(b.items).length, "ช่วง"),
    validate: (b, label) => (!arr(b.items).some((i) => s(i.year) || s(i.title)) ? [{ level: "warning", message: `${label}: ยังไม่มีช่วงเวลา` }] : []),
  },

  // ⏳ นับถอยหลังแคมเปญ (2026-10-15) — เว็บร้าน: src/components/home/CountdownSection.tsx (นับในเบราว์เซอร์ · เวลาไทย)
  countdown: {
    type: "countdown",
    meta: { label: "นับถอยหลังแคมเปญ", icon: "⏳", hint: "เปิดตัวคอลเลกชัน / Flash sale", group: "เนื้อหา" },
    fields: [
      text("eyebrow", "คำโปรยเหนือหัวข้อ", { default: "NEW COLLECTION", max: 80 }),
      text("title", "หัวข้อ", { default: "คอลเลกชันใหม่ เปิดตัวใน", max: 160, wide: true }),
      area("subtitle", "คำอธิบาย", { default: "", max: 300 }),
      f("endAt", "นับถอยหลังถึง (เวลาไทย)", "datetime", { default: "", wide: true, required: true, requiredMessage: "ยังไม่ได้ตั้งเวลาที่นับถอยหลังถึง" }),
      link("cta", "ปุ่ม", "ดูคอลเลกชัน", "/shop"),
      f("afterEnd", "ครบเวลาแล้ว", "select", {
        group: "layout",
        default: "message",
        options: [
          { v: "message", l: "เปลี่ยนเป็นข้อความ" },
          { v: "hide", l: "ซ่อนทั้งแถบ" },
        ],
      }),
      text("endedTitle", "ข้อความหลังครบเวลา", { default: "เปิดตัวแล้ว! ช้อปได้เลย", max: 160, wide: true, showIf: { key: "afterEnd", eq: "message" } }),
      f("layout", "รูปแบบ", "select", {
        group: "layout",
        default: "bar",
        options: [
          { v: "bar", l: "แถบ (หัวข้อซ้าย · เวลาขวา)" },
          { v: "center", l: "กึ่งกลาง ตัวเลขใหญ่" },
        ],
      }),
      f("tone", "โทนสี", "select", {
        group: "layout",
        default: "dark",
        options: [
          { v: "dark", l: "เข้ม (ตัวหนังสือขาว)" },
          { v: "light", l: "อ่อน" },
          { v: "brand", l: "สีแบรนด์" },
        ],
      }),
      f("showDays", "โชว์ช่อง วัน", "toggle", { group: "layout", default: true }),
    ],
    summary: (b) => (s(b.endAt) ? `ถึง ${s(b.endAt).replace("T", " ")}` : "ยังไม่ตั้งเวลา"),
  },

  // 🆕 ชุดมาใหม่ (2026-10-19) — แบนเนอร์ชุด · นับถอยหลัง (ก่อนเปิด) · สินค้าในชุด = โครงตั้งต้นของหน้า /new/<ชุด>
  //   (ERP แท็บ 🆕 มาใหม่ → 🧱 จัดหน้าชุดนี้ · lib/website-drop-page) · วางหน้าอื่นได้ด้วย ("ชุดของหน้านี้" นอกหน้าชุด = ชุดล่าสุด)
  //   เว็บร้านวาดฝั่งเซิร์ฟเวอร์ (ดึงชุด + สินค้า): src/components/new/DropBlockView.tsx
  drop: {
    type: "drop",
    meta: { label: "ชุดมาใหม่", icon: "🆕", hint: "แบนเนอร์ชุด · นับถอยหลัง · สินค้าในชุด (แท็บ 🆕 มาใหม่)", group: "สินค้า" },
    fields: [
      f("which", "ชุดไหน", "select", {
        default: "this",
        wide: true,
        options: [
          { v: "this", l: "ชุดของหน้านี้ (หน้า /new/<ชุด> · หน้าอื่น = ชุดล่าสุด)" },
          { v: "latest", l: "ชุดล่าสุดที่เปิดแล้ว (ยังไม่มี = ชุดที่ใกล้เปิด)" },
          { v: "soon", l: "ชุดที่กำลังจะเปิดทั้งหมด (นับถอยหลัง)" },
        ],
      }),
      f("banner", "แบนเนอร์ชุด", "select", {
        group: "layout",
        default: "big",
        options: [
          { v: "big", l: "รูปปกใหญ่ + ชื่อชุด" },
          { v: "small", l: "หัวข้อเล็ก (ไม่มีรูปใหญ่)" },
          { v: "none", l: "ไม่โชว์ (เฉพาะสินค้า)" },
        ],
      }),
      f("showProducts", "โชว์สินค้าในชุด (เมื่อเปิดแล้ว)", "toggle", { group: "layout", default: true }),
    ],
    summary: (b) => ({ this: "ชุดของหน้านี้", latest: "ชุดล่าสุดที่เปิด", soon: "ชุดที่กำลังจะเปิด" } as Record<string, string>)[s(b.which)] ?? "ชุดของหน้านี้",
  },

  // 📖 คอลเลกชัน (2026-10-15) — การ์ดคอลเลกชันที่เปิดหน้าไว้ (แท็บ 🎞 คอลเลกชัน · เรียงตามที่ลากไว้) → /collection/<ลิงก์>
  //    เว็บร้าน: src/components/home/CollectionsBody.tsx (วาดสดในพรีวิวด้วยข้อมูลคอลเลกชัน)
  collections: {
    type: "collections",
    meta: { label: "คอลเลกชัน", icon: "📖", hint: "การ์ดคอลเลกชัน กดแล้วไปหน้าคอลเลกชัน", group: "สินค้า" },
    fields: [
      ...headFields({ eyebrow: "Collections", title: "คอลเลกชันของเรา", subtitle: true }),
      f("layout", "รูปแบบ", "select", {
        group: "layout",
        default: "grid",
        options: [
          { v: "grid", l: "การ์ดรูปเรียงเป็นตาราง" },
          { v: "rows", l: "แถวใหญ่ รูป + เรื่องราว สลับซ้ายขวา" },
          { v: "carousel", l: "การ์ดเลื่อนข้าง" },
        ],
      }),
      f("columns", "คอลัมน์ (คอม)", "number", { group: "layout", default: 3, min: 2, numMax: 4, showIf: { key: "layout", eq: "grid" } }),
      f("ratio", "สัดส่วนรูป", "select", {
        group: "layout",
        default: "4:5",
        options: [
          { v: "3:4", l: "แนวตั้ง 3:4" },
          { v: "4:5", l: "แนวตั้ง 4:5" },
          { v: "1:1", l: "จัตุรัส 1:1" },
          { v: "16:9", l: "แนวนอน 16:9" },
        ],
      }),
      f("textPos", "ชื่อคอลเลกชัน", "select", {
        group: "layout",
        default: "on",
        options: [
          { v: "on", l: "บนรูป (มุมล่าง)" },
          { v: "below", l: "ใต้รูป" },
        ],
        showIf: { key: "layout", eq: ["grid", "carousel"] },
      }),
      f("showCount", "โชว์จำนวนสินค้า", "toggle", { group: "layout", default: true }),
      f("limit", "จำนวนสูงสุด", "number", { group: "layout", default: 6, min: 1, numMax: 24 }),
    ],
    summary: (b) => ({ grid: "ตาราง", rows: "แถวใหญ่", carousel: "เลื่อนข้าง" } as Record<string, string>)[s(b.layout)] ?? "คอลเลกชัน",
  },

  // 📐 เช็คขนาด (2026-10-15) — ลูกค้าเลือกตุ๊กตา/ของ หรือพิมพ์ขนาดเอง → รุ่นที่ใส่ได้ + ใส่ได้ประมาณกี่ตัว
  //    ข้อมูล: ช่องใส่ของของแต่ละรุ่น + ทะเบียน "ใส่อะไรได้บ้าง" (กฎ lib/fit-check) · ร้านต้องเปิด "เช็คขนาด" ในข้อมูลร้าน
  //    เว็บร้าน: src/components/fit/FitCheckBody.tsx (วาดสดในพรีวิวด้วยข้อมูลสินค้า)
  fitcheck: {
    type: "fitcheck",
    meta: { label: "เช็คขนาด (ใส่ตุ๊กตาได้ไหม)", icon: "📐", hint: "เลือกตุ๊กตา → เห็นกระเป๋าที่ใส่ได้", group: "สินค้า" },
    fields: [
      ...headFields({ eyebrow: "Size check", title: "ตุ๊กตาของคุณใส่ใบไหนได้บ้าง?", subtitle: true }),
      f("showCustom", "ให้ลูกค้าพิมพ์ขนาดเอง", "toggle", { group: "layout", default: true, hint: "กว้าง × สูง × หนา (ซม.) สำหรับตุ๊กตาที่ไม่มีในรายการ" }),
      f("showSnug", "โชว์รุ่นที่ใส่ได้แบบพอดี (แน่น)", "toggle", { group: "layout", default: true }),
      f("columns", "คอลัมน์ (คอม)", "number", { group: "layout", default: 4, min: 2, numMax: 5 }),
      f("limit", "จำนวนรุ่นสูงสุด", "number", { group: "layout", default: 12, min: 1, numMax: 48 }),
    ],
    summary: () => "เลือกตุ๊กตา → รุ่นที่ใส่ได้",
  },

  // 🧵 ออกแบบเข็มขัด (2026-10-16) — ลูกค้าเลือกสายหนัง/หัว/หู + สลักชื่อ + ไซซ์ → พรีวิวรูปซ้อนชั้น + ราคา
  //    ข้อมูล: /admin/belt-builder (belt_parts/belt_size_rules) + ข้อมูลร้าน กลุ่ม 🧵 (ราคาฐาน/ค่าสลัก) · เว็บร้าน: src/components/belt/BeltBuilderBody.tsx
  beltbuilder: {
    type: "beltbuilder",
    meta: { label: "ออกแบบเข็มขัด (Belt Builder)", icon: "🧵", hint: "ลูกค้าประกอบเข็มขัดเอง เห็นพรีวิว + ราคา", group: "สินค้า",
      manage: { label: "จัดการชิ้นส่วน →", href: "/admin/belt-builder", hint: "สตูดิโอ: อัปโหลดรูปสาย/หัว/หู · ตั้งราคาฐาน · จัดตำแหน่งบนพรีวิว" } },
    fields: [
      ...headFields({ eyebrow: "Personalize", title: "ออกแบบเข็มขัดในแบบของคุณ", subtitle: true }),
      f("showPrice", "โชว์ราคา", "toggle", { group: "layout", default: true, hint: "ปิด = โชว์เฉพาะพรีวิว (เหมาะตอนยังไม่ตั้งราคาฐาน)" }),
      f("showSizeGuide", "โชว์คู่มือวัดไซซ์", "toggle", { group: "layout", default: true, hint: "ช่วงเอวชาย/หญิง + ความยาวหนังที่ตัด" }),
      text("ctaLabel", "ข้อความปุ่มบันทึกแบบ", { group: "layout", default: "บันทึกแบบนี้", max: 40 }),
    ],
    summary: () => "เลือกสาย/หัว/หู → พรีวิว + ราคา",
  },

  // 🛍 ลุคบุ๊กกดซื้อได้ (2026-10-15) — เว็บร้าน: src/components/home/LookbookBody.tsx (วาดสดในพรีวิวด้วยข้อมูลสินค้า)
  lookbook: {
    type: "lookbook",
    meta: { label: "ลุคบุ๊กกดซื้อได้", icon: "🛍", hint: "รูปนายแบบ + จุดกดดูสินค้า", group: "สินค้า" },
    fields: [
      ...headFields({ eyebrow: "Shop the look", title: "", subtitle: true }),
      f("mode", "จำนวนลุค", "select", {
        group: "media",
        default: "single",
        wide: true,
        options: [
          { v: "single", l: "ลุคเดียว (แบบเดิม)" },
          { v: "slides", l: "หลายลุค — เลื่อนเป็นสไลด์" },
          { v: "grid", l: "หลายลุค — วางเรียงกัน 2–3 คอลัมน์" },
        ],
        hint: "หลายลุค = ใส่รูปลุค 2–6 แล้วเลือกว่าแต่ละจุดอยู่ลุคไหน · เรียงกัน = เห็นทุกลุคพร้อมกัน (กดจุด = การ์ดเด้งบนรูป) · อยากแยกกล่องทีละลุคก็ได้: ติ๊ก \"ต่อเป็นสไลด์กับลุคบุ๊กก่อนหน้า\" ที่กล่องถัดไป",
      }),
      image("imageKey", "รูปลุค", { required: true, requiredMessage: "ยังไม่ได้เลือกรูปลุค", hint: "รูปนายแบบ/ไลฟ์สไตล์ · โชว์เต็มรูปไม่ตัด · วางจุดในแต่ละ \"จุดบนรูป\" ด้านล่าง (หลายลุค = รูปลุค 1)" }),
      ...[2, 3, 4, 5, 6].map((n) => image(`imageKey${n}`, `รูปลุค ${n}`, { showIf: { key: "mode", eq: ["slides", "grid"] }, hint: n === 2 ? "ว่าง = ไม่มีลุคนี้ (ข้ามไป)" : undefined })),
      f("lookNames", "ชื่อลุค (บรรทัดละลุค เรียงตามลุค 1, 2, 3 …)", "list", { group: "media", max: 6, default: [], showIf: { key: "mode", eq: ["slides", "grid"] }, hint: "โชว์ใต้สไลด์ / ใต้รูปแต่ละลุค · ว่าง = ไม่มีชื่อ" }),
      // 🧱 หลายลุควางเรียงกัน (2026-10-21 · เจ้าของขอ "แบบ 2-3 column · 3 รูปต่อกัน")
      f("gridCols", "เรียงกัน: จำนวนคอลัมน์ (จอคอม)", "select", {
        group: "layout",
        default: "3",
        options: [
          { v: "2", l: "2 คอลัมน์" },
          { v: "3", l: "3 คอลัมน์" },
        ],
        showIf: { key: "mode", eq: "grid" },
        hint: "ลุคเกินจำนวนคอลัมน์ = ขึ้นแถวใหม่ · รูปสัดส่วนเดียวกันเรียงสวยสุด",
      }),
      f("gridGap", "เรียงกัน: ช่องว่างระหว่างรูป", "select", {
        group: "layout",
        default: "s",
        options: [
          { v: "none", l: "ชิดกัน (รูปต่อกันพอดี)" },
          { v: "s", l: "ห่างนิด" },
          { v: "m", l: "ห่างปกติ" },
          { v: "l", l: "ห่างมาก" },
        ],
        showIf: { key: "mode", eq: "grid" },
      }),
      f("gridMobile", "เรียงกัน: บนมือถือ", "select", {
        group: "layout",
        default: "swipe",
        options: [
          { v: "swipe", l: "ปัดดูทีละลุค (เห็นลุคถัดไปนิด ๆ)" },
          { v: "stack", l: "เรียงลงทีละลุค" },
          { v: "two", l: "2 คอลัมน์" },
        ],
        showIf: { key: "mode", eq: "grid" },
      }),
      f("imgFrame", "มุมรูปลุค", "select", {
        group: "media",
        default: "rounded",
        options: [
          { v: "rounded", l: "มุมมน (ตามธีม)" },
          { v: "rect", l: "เหลี่ยม" },
        ],
      }),
      f("layout", "รูปแบบ", "select", { group: "layout", default: "side", wide: true, display: "tiles", options: LOOKBOOK_LAYOUTS, showIf: { key: "mode", eq: ["single", "slides"] } }),
      f("side", "รูปอยู่ด้าน", "select", {
        group: "layout",
        default: "left",
        options: [
          { v: "left", l: "ซ้าย" },
          { v: "right", l: "ขวา" },
        ],
        showIf: [{ key: "layout", eq: "side" }, { key: "mode", eq: ["single", "slides"] }],
      }),
      f("joinPrev", "ต่อเป็นสไลด์กับลุคบุ๊กก่อนหน้า", "toggle", {
        group: "layout",
        default: false,
        hint: "กล่องลุคบุ๊กที่ติดกันรวมเป็นสไลด์ชุดเดียวบนเว็บ (หัวข้อ/ปุ่มเลื่อน ใช้ของกล่องแรก) · แก้ลุคนี้ที่ต้นไม้ด้านซ้าย",
      }),
      f("slideNav", "สไลด์: ปุ่มเลื่อน", "select", {
        group: "layout",
        default: "both",
        options: [
          { v: "both", l: "ลูกศร ‹ › + จุด" },
          { v: "arrows", l: "ลูกศรอย่างเดียว" },
          { v: "dots", l: "จุดอย่างเดียว" },
        ],
        showIf: { key: "mode", eq: ["slides", true], orKey: "joinPrev" },
        hint: "มือถือปัดซ้าย-ขวาได้เสมอ",
      }),
      f("slideEffect", "สไลด์: แบบเปลี่ยน", "select", {
        group: "layout",
        default: "slide",
        options: [
          { v: "slide", l: "เลื่อน" },
          { v: "fade", l: "จางเปลี่ยน" },
        ],
        showIf: { key: "mode", eq: ["slides", true], orKey: "joinPrev" },
      }),
      f("slideAuto", "สไลด์: เลื่อนเอง", "toggle", { group: "layout", default: false, showIf: { key: "mode", eq: ["slides", true], orKey: "joinPrev" }, hint: "หยุดเมื่อลูกค้าชี้/แตะ" }),
      f("slideSec", "เลื่อนทุก (วินาที)", "number", { group: "layout", default: 6, min: 3, numMax: 20, showIf: [{ key: "mode", eq: ["slides", true], orKey: "joinPrev" }, { key: "slideAuto", eq: true }] }),
      f("sideMode", "แผงข้างรูป", "select", {
        group: "layout",
        default: "card",
        options: [
          { v: "card", l: "การ์ดสินค้าตัวที่กดจุด (แบบเดิม)" },
          { v: "list", l: "รายการสินค้าทั้งลุค" },
        ],
        wide: true,
        showIf: [{ key: "layout", eq: "side" }, { key: "mode", eq: ["single", "slides"] }],
        hint: "รายการ = เห็นทุกชิ้นในลุค (รวมสินค้าเพิ่มเติม) · กดจุดแล้วแถวนั้นไฮไลต์",
      }),
      f("imgWidth", "ความกว้างรูป : แผง", "select", {
        group: "layout",
        default: "58",
        options: [
          { v: "50", l: "ครึ่ง-ครึ่ง" },
          { v: "58", l: "รูปใหญ่กว่านิด (แบบเดิม)" },
          { v: "65", l: "รูปใหญ่" },
          { v: "70", l: "รูปใหญ่มาก" },
        ],
        showIf: [{ key: "layout", eq: "side" }, { key: "mode", eq: ["single", "slides"] }],
      }),
      f("dot", "หน้าตาจุด", "select", {
        group: "layout",
        default: "dot",
        options: [
          { v: "dot", l: "วงกลม" },
          { v: "plus", l: "เครื่องหมาย +" },
          { v: "num", l: "ตัวเลข 1 2 3" },
        ],
      }),
      f("dotColor", "สีจุด", "select", {
        group: "layout",
        default: "white",
        options: [
          { v: "white", l: "ขาว (แบบเดิม)" },
          { v: "ink", l: "สีตัวอักษรหลัก" },
          { v: "brand", l: "สีแบรนด์" },
          { v: "brandDeep", l: "สีแบรนด์เข้ม" },
          { v: "custom", l: "สีเอง…" },
        ],
      }),
      f("dotHex", "สีจุด (เลือกเอง)", "color", { group: "layout", default: "", showIf: { key: "dotColor", eq: "custom" } }),
      f("dotSize", "ขนาดจุด", "select", {
        group: "layout",
        default: "m",
        options: [
          { v: "s", l: "เล็ก" },
          { v: "m", l: "กลาง (แบบเดิม)" },
          { v: "l", l: "ใหญ่" },
        ],
      }),
      f("dotPulse", "จุดกะพริบ", "select", {
        group: "layout",
        default: "auto",
        options: [
          { v: "auto", l: "แบบเดิม (เฉพาะวงกลม)" },
          { v: "on", l: "กะพริบทุกแบบ" },
          { v: "off", l: "ไม่กะพริบ" },
        ],
      }),
      f("dotLabel", "ป้ายชื่อสินค้าข้างจุด", "toggle", { group: "layout", default: false, hint: "ตั้งข้อความเองได้ที่แต่ละจุด" }),
      f("showList", "รายการสินค้าใต้รูป", "toggle", { group: "layout", default: false, hint: "เรียงสินค้าทั้งลุค (ทุกจุด + สินค้าเพิ่มเติม) ไว้ใต้รูป" }),
      text("listTitle", "หัวข้อรายการใต้รูป", { group: "layout", default: "", max: 80, placeholder: "เช่น สินค้าในลุคนี้", showIf: { key: "showList", eq: true }, hint: "ว่าง = ไม่มีหัวข้อ" }),
      f("listStyle", "รายการใต้รูปแบบ", "select", {
        group: "layout",
        default: "grid",
        options: [
          { v: "grid", l: "ตาราง (แบบเดิม)" },
          { v: "carousel", l: "เลื่อนข้าง" },
        ],
        showIf: { key: "showList", eq: true },
      }),
      f("listCols", "คอลัมน์ (จอคอม)", "select", {
        group: "layout",
        default: "auto",
        options: [{ v: "auto", l: "ตามธีม (แบบเดิม)" }, ...["2", "3", "4", "5", "6"].map((v) => ({ v, l: `${v} คอลัมน์` }))],
        showIf: [{ key: "showList", eq: true }, { key: "listStyle", eq: "grid" }],
      }),
      f("mobileLayout", "มือถือ", "select", {
        group: "layout",
        default: "same",
        options: [
          { v: "same", l: "เหมือนคอม (แบบเดิม)" },
          { v: "list", l: "รูป + รายการสินค้าใต้รูป" },
        ],
        wide: true,
        hint: "จอมือถือแคบ ป๊อปบนรูปอาจบังรูป — เลือก \"รายการ\" ให้กดง่ายขึ้น",
      }),
      f("more", "สินค้าเพิ่มเติมในลุค (ไม่ต้องวางจุด)", "products", { group: "products", max: 12, wide: true, hint: "โชว์ในรายการทั้งลุค (แผงข้างรูปแบบรายการ / รายการใต้รูป / มือถือแบบรายการ)" }),
      // 🃏 การ์ดสินค้าที่เด้ง/อยู่ข้างรูป — เลือกว่าจะโชว์อะไร
      f("cardSize", "ขนาดการ์ดป๊อป", "select", {
        group: "products",
        default: "m",
        options: [
          { v: "s", l: "เล็ก" },
          { v: "m", l: "กลาง" },
          { v: "l", l: "ใหญ่" },
        ],
        showIf: { key: "layout", eq: ["pop", "grid"], orKey: "mode" },
      }),
      f("cardRatio", "สัดส่วนรูปในการ์ด", "select", {
        group: "products",
        default: "auto",
        options: [
          { v: "auto", l: "อัตโนมัติ (ข้างรูป 4:5 · ป๊อป 1:1)" },
          { v: "1:1", l: "จัตุรัส 1:1" },
          { v: "4:5", l: "แนวตั้ง 4:5" },
          { v: "3:4", l: "แนวตั้ง 3:4" },
        ],
      }),
      f("cardBg", "พื้นการ์ด / แผง", "select", {
        group: "products",
        default: "auto",
        options: [
          { v: "auto", l: "แบบเดิม" },
          { v: "page", l: "สีพื้นเว็บ" },
          { v: "surface", l: "สีพื้นการ์ด" },
          { v: "white", l: "ขาว" },
          { v: "brandSoft", l: "สีแบรนด์จาง" },
          { v: "custom", l: "สีเอง…" },
        ],
        hint: "แบบเดิม = ป๊อปสีพื้นเว็บ · ข้างรูปไม่มีพื้น",
      }),
      f("cardHex", "พื้นการ์ด (เลือกเอง)", "color", { group: "products", default: "", showIf: { key: "cardBg", eq: "custom" } }),
      f("cardAlign", "จัดข้อความในการ์ด", "select", {
        group: "products",
        default: "left",
        options: [
          { v: "left", l: "ชิดซ้าย" },
          { v: "center", l: "กึ่งกลาง" },
        ],
      }),
      f("showImage", "รูปสินค้า", "toggle", { group: "products", default: true }),
      f("showName", "ชื่อสินค้า", "toggle", { group: "products", default: true }),
      f("showPrice", "ราคา", "toggle", { group: "products", default: true }),
      f("showSwatches", "จุดสี (กดแล้วรูปเปลี่ยนเป็นสีนั้น)", "toggle", { group: "products", default: false }),
      f("showDesc", "คำอธิบายย่อ (2 บรรทัด)", "toggle", { group: "products", default: false }),
      f("showAdd", "ปุ่มใส่ตะกร้า", "toggle", { group: "products", default: true }),
      text("addText", "ข้อความปุ่มใส่ตะกร้า", { group: "products", default: "ใส่ตะกร้า", max: 30, showIf: { key: "showAdd", eq: true } }),
      f("addStyle", "หน้าตาปุ่มใส่ตะกร้า", "select", {
        group: "products",
        default: "brand",
        options: [
          { v: "brand", l: "ทึบสีแบรนด์ (แบบเดิม)" },
          { v: "dark", l: "ทึบสีเข้ม" },
          { v: "outline", l: "ขอบบาง" },
        ],
        showIf: { key: "showAdd", eq: true },
      }),
      f("showView", "ปุ่มดูสินค้า", "toggle", { group: "products", default: true }),
      text("viewText", "ข้อความปุ่มดูสินค้า", { group: "products", default: "ดูสินค้า", max: 30, showIf: { key: "showView", eq: true } }),
      f("viewStyle", "หน้าตาปุ่มดูสินค้า", "select", {
        group: "products",
        default: "outline",
        options: [
          { v: "outline", l: "ขอบบาง (แบบเดิม)" },
          { v: "brand", l: "ทึบสีแบรนด์" },
          { v: "dark", l: "ทึบสีเข้ม" },
          { v: "link", l: "ข้อความขีดเส้นใต้" },
        ],
        showIf: { key: "showView", eq: true },
      }),
      f("showTotal", "ราคารวมทั้งลุค", "toggle", { group: "products", default: true, hint: "โชว์ท้ายรายการทั้งลุค (แผงข้างรูปแบบรายการ / มือถือแบบรายการ)" }),
      text("totalText", "ข้อความราคารวม", { group: "products", default: "รวมทั้งลุค", max: 40, showIf: { key: "showTotal", eq: true } }),
    ],
    children: {
      key: "spots",
      label: "จุดบนรูป",
      itemLabel: "จุด",
      icon: "📍",
      max: 12,
      fields: [
        f("code", "สินค้าของจุดนี้ (เลือกได้หลายตัว)", "products", { max: 6, wide: true, hint: "ตัวแรก = ตัวหลัก · มากกว่า 1 ตัว = การ์ดเลื่อนดูได้ (‹ 1/3 ›)" }),
        text("label", "ป้ายข้างจุด", { default: "", max: 40, placeholder: "ว่าง = ชื่อสินค้าตัวแรก", hint: "โชว์เมื่อเปิด \"ป้ายชื่อสินค้าข้างจุด\"" }),
        f("look", "อยู่ลุคที่", "select", {
          default: "1",
          options: ["1", "2", "3", "4", "5", "6"].map((v) => ({ v, l: `ลุค ${v}` })),
          showIfParent: { key: "mode", eq: ["slides", "grid"] },
          hint: "จุดนี้อยู่บนรูปลุคไหน (ตั้งรูปลุคไว้ด้านบน)",
        }),
        f("pos", "ตำแหน่งบนรูป", "point", { pointImage: "imageKey", pointLook: "look", wide: true }),
        f("popSide", "การ์ดเด้งด้านไหนของจุด", "select", {
          default: "auto",
          options: [
            { v: "auto", l: "อัตโนมัติ (หลบขอบรูปให้เอง)" },
            { v: "right", l: "ขวาของจุด" },
            { v: "left", l: "ซ้ายของจุด" },
            { v: "top", l: "เหนือจุด" },
            { v: "bottom", l: "ใต้จุด" },
          ],
          hint: "ใช้กับรูปแบบ \"รูปเต็ม + ป๊อปที่จุด\"",
        }),
        text("note", "ข้อความเพิ่มในการ์ด (ถ้ามี)", { default: "", max: 120, wide: true, placeholder: "เช่น สี Cherry Red · ขายดีอันดับ 1" }),
      ],
      summary: (it) => (Array.isArray(it.code) && it.code.length ? `${it.code[0]}${it.code.length > 1 ? ` +${it.code.length - 1}` : ""}` : "ยังไม่เลือกสินค้า"),
    },
    summary: (b) =>
      `${b.mode === "slides" || b.mode === "grid" ? `${[1, 2, 3, 4, 5, 6].filter((n) => (n === 1 ? b.imageKey : b[`imageKey${n}`])).length} ลุค${b.mode === "grid" ? " เรียงกัน" : ""} · ` : ""}${b.joinPrev ? "ต่อสไลด์ · " : ""}${count(arr(b.spots).length, "จุด")}${Array.isArray(b.more) && b.more.length ? ` · +${b.more.length} สินค้าเพิ่มเติม` : ""}`,
    validate: (b, label) => {
      const out: Omit<ValidationIssue, "blockId">[] = [];
      if (arr(b.spots).some((x) => !(Array.isArray(x.code) && x.code.length))) out.push({ level: "warning", message: `${label}: บางจุดยังไม่เลือกสินค้า` });
      // หลายลุค: จุดที่อยู่ลุคซึ่งยังไม่มีรูป = ลูกค้าไม่เห็น
      if (b.mode === "slides" || b.mode === "grid") {
        const miss = [...new Set(arr(b.spots).map((x) => String(x.look ?? "1")).filter((n) => n !== "1" && !b[`imageKey${n}`]))];
        if (miss.length) out.push({ level: "warning", message: `${label}: มีจุดอยู่ลุค ${miss.join(", ")} แต่ยังไม่ได้ใส่รูปลุคนั้น` });
      }
      return out;
    },
  },

  // 📰 โลโก้สื่อ / พาร์ตเนอร์ (2026-10-15) — เว็บร้าน: src/components/home/LogosSection.tsx
  logos: {
    type: "logos",
    meta: { label: "โลโก้สื่อ / พาร์ตเนอร์", icon: "📰", hint: "As seen in · ร้านค้าที่ขาย · พาร์ตเนอร์", group: "เนื้อหา" },
    fields: [
      text("eyebrow", "คำโปรยเหนือหัวข้อ", { default: "", max: 80 }),
      text("title", "หัวข้อ", { default: "As seen in", max: 120, wide: true }),
      f("layout", "รูปแบบ", "select", {
        group: "layout",
        default: "row",
        options: [
          { v: "row", l: "แถวเรียงกลาง" },
          { v: "marquee", l: "เลื่อนวนไม่หยุด" },
        ],
      }),
      f("size", "ขนาดโลโก้", "select", {
        group: "layout",
        default: "m",
        options: [
          { v: "s", l: "เล็ก" },
          { v: "m", l: "กลาง" },
          { v: "l", l: "ใหญ่" },
        ],
      }),
      f("speed", "ความเร็วเลื่อน", "select", {
        group: "layout",
        default: "normal",
        options: [
          { v: "slow", l: "ช้า" },
          { v: "normal", l: "ปกติ" },
          { v: "fast", l: "เร็ว" },
        ],
        showIf: { key: "layout", eq: "marquee" },
      }),
      f("mono", "โลโก้สีเทา (ชี้แล้วเป็นสีจริง)", "toggle", { group: "layout", default: true }),
    ],
    children: {
      key: "items",
      label: "โลโก้",
      itemLabel: "โลโก้",
      icon: "🏷",
      max: 24,
      fields: [
        image("imageKey", "รูปโลโก้", { hint: "PNG พื้นใส / SVG แนะนำ" }),
        text("name", "ชื่อ (ใช้แทนเมื่อไม่มีรูป)", { default: "", max: 60, i18n: false }),
        f("href", "กดแล้วไปที่", "target", { default: "" }),
      ],
      summary: (it) => s(it.name) || (it.imageKey ? "โลโก้" : "ยังไม่มีรูป"),
    },
    summary: (b) => count(arr(b.items).length, "โลโก้"),
  },

  // ❓ ปรับละเอียด (2026-10-15): รูปแบบ 4 แบบ · หน้าตาแต่ละข้อ · ไอคอน · เลขข้อ · กางตอนเปิดหน้า · หลายข้อพร้อมกัน · ขนาดคำถาม
  //    · ปุ่มติดต่อ (แก้ได้) · ช่องค้นหา · หมวดต่อคำถาม (แบบแท็บ) · ข้อมูลให้ Google (FAQPage) — เว็บร้าน: src/components/home/FaqSection.tsx
  //    ค่าเริ่มต้น = หน้าตาเดิมทุกอย่าง (ร้านที่วางไว้แล้วไม่เปลี่ยน)
  faq: {
    type: "faq",
    meta: { label: "คำถามที่พบบ่อย", icon: "❓", hint: "รายการถาม-ตอบแบบพับได้", group: "เนื้อหา" },
    fields: [
      ...headFields({ eyebrow: "คำถามที่พบบ่อย", title: "เรื่องที่ลูกค้าถามบ่อย", subtitle: true }),
      f("showContact", "ปุ่มใต้หัวข้อ", "toggle", { group: "action", default: true, hint: "เช่น ติดต่อเรา / ทักแชท" }),
      link("contact", "ข้อความ + ลิงก์ปุ่ม", "ติดต่อเรา", "/contact", { showIf: { key: "showContact", eq: true } }),
      f("layout", "รูปแบบ", "select", { group: "layout", default: "side", wide: true, display: "tiles", options: FAQ_LAYOUTS }),
      f("itemStyle", "หน้าตาแต่ละข้อ", "select", {
        group: "layout",
        default: "line",
        options: [
          { v: "line", l: "เส้นคั่น" },
          { v: "card", l: "กล่องการ์ด" },
          { v: "fill", l: "พื้นสีอ่อน" },
        ],
      }),
      f("icon", "ไอคอนกาง/พับ", "select", {
        group: "layout",
        default: "plus",
        options: [
          { v: "plus", l: "+ หมุนเป็น ×" },
          { v: "chev", l: "ลูกศร ▾" },
          { v: "pm", l: "+ / −" },
          { v: "none", l: "ไม่มี" },
        ],
      }),
      f("iconSide", "ไอคอนอยู่ด้าน", "select", {
        group: "layout",
        default: "right",
        options: [
          { v: "right", l: "ขวา" },
          { v: "left", l: "ซ้าย" },
        ],
        showIf: { key: "icon", eq: ["plus", "chev", "pm"] },
      }),
      f("numbering", "เลขข้อ", "select", {
        group: "layout",
        default: "none",
        options: [
          { v: "none", l: "ไม่มี" },
          { v: "num", l: "01 02 03" },
          { v: "q", l: "Q." },
        ],
      }),
      f("qSize", "ขนาดคำถาม", "select", {
        group: "layout",
        default: "md",
        options: [
          { v: "sm", l: "เล็ก" },
          { v: "md", l: "กลาง" },
          { v: "lg", l: "ใหญ่" },
        ],
      }),
      f("openMode", "เปิดหน้ามา", "select", {
        group: "layout",
        default: "first",
        options: [
          { v: "first", l: "กางข้อแรกไว้" },
          { v: "none", l: "พับทั้งหมด" },
          { v: "all", l: "กางทั้งหมด" },
        ],
      }),
      f("multi", "กางหลายข้อพร้อมกันได้", "toggle", { group: "layout", default: false, hint: "ปิด = กางข้อใหม่แล้วข้อเดิมพับเอง" }),
      f("search", "ช่องค้นหาคำถาม", "toggle", { group: "layout", default: false, hint: "เหมาะเมื่อมีคำถามเยอะ" }),
      f("seo", "ส่งคำถาม-คำตอบให้ Google", "toggle", {
        group: "content",
        default: true,
        hint: "ใส่ข้อมูล FAQ แบบที่ Google/AI อ่านเข้าใจ (ไม่เห็นบนหน้าเว็บ) · Google เลือกเองว่าจะโชว์เป็นกล่องพิเศษหรือไม่",
      }),
    ],
    children: {
      key: "items",
      label: "คำถาม-คำตอบ",
      itemLabel: "คำถาม",
      icon: "❔",
      max: 30,
      fields: [
        text("q", "คำถาม", { default: "คำถาม", max: 200, wide: true }),
        area("a", "คำตอบ", { default: "คำตอบ", max: 1500 }),
        text("cat", "หมวด (ใช้กับรูปแบบแท็บ)", { default: "", max: 40, placeholder: "เช่น การสั่งซื้อ · จัดส่ง · ชำระเงิน", hint: "พิมพ์ชื่อหมวดเหมือนกัน = อยู่แท็บเดียวกัน · ว่าง = อยู่แท็บ ทั้งหมด อย่างเดียว" }),
      ],
      summary: (it) => (s(it.cat) ? `[${s(it.cat)}] ` : "") + (s(it.q) || "คำถาม"),
    },
    summary: (b) => count(arr(b.items).length, "คำถาม") + (FAQ_LAYOUTS.find((o) => o.v === b.layout && o.v !== "side")?.l ? ` · ${FAQ_LAYOUTS.find((o) => o.v === b.layout)?.l}` : ""),
    validate: (b, label) => (!arr(b.items).length ? [{ level: "warning", message: `${label}: ยังไม่มีคำถาม` }] : []),
  },

  steps: {
    type: "steps",
    meta: { label: "ขั้นตอนการทำงาน", icon: "🪜", hint: "อธิบายเป็นสเต็ป 1-2-3", group: "เนื้อหา" },
    fields: headFields({ eyebrow: "ขั้นตอน", title: "สั่งซื้อกับเรา ทำยังไง", subtitle: true, subtitleMax: 300 }),
    children: {
      key: "items",
      label: "ขั้นตอน",
      itemLabel: "ขั้นตอน",
      icon: "1️⃣",
      max: 12,
      fields: [text("title", "หัวข้อขั้นตอน", { default: "", max: 120, wide: true }), area("desc", "คำอธิบาย", { default: "", max: 400 })],
      summary: (it) => s(it.title) || "ขั้นตอน",
    },
    summary: (b) => count(arr(b.items).length, "ขั้นตอน"),
    validate: (b, label) => (!arr(b.items).some((i) => s(i.title)) ? [{ level: "warning", message: `${label}: ยังไม่ได้ใส่ขั้นตอน` }] : []),
  },

  reviews: {
    type: "reviews",
    meta: { label: "รีวิวลูกค้า", icon: "💬", hint: "คำชมจากลูกค้าจริง สร้างความเชื่อมั่น", group: "เนื้อหา" },
    fields: [
      ...headFields({ eyebrow: "ลูกค้าของเรา", title: "เสียงจากลูกค้า" }),
      f("showStars", "แสดงดาว ★", "toggle", { group: "layout", default: false, hint: "ตั้งจำนวนดาวได้ทีละรีวิว (ค่าเริ่ม 5 ดาว)" }),
      f("columns", "จำนวนคอลัมน์ (จอคอม)", "number", { group: "layout", default: 3, min: 1, numMax: 4 }),
      ...imageLookFields({ ratio: "1:1", ratioHint: "รูปจากลูกค้า (ถ้าใส่) ทุกรีวิว — เลือกส่วนที่เห็นได้ทีละรีวิว" }),
    ],
    children: {
      key: "items",
      label: "รีวิว",
      itemLabel: "รีวิว",
      icon: "⭐",
      max: 12,
      fields: [
        area("text", "คำรีวิว", { default: "", max: 600 }),
        text("name", "ชื่อลูกค้า", { default: "", max: 80 }),
        text("role", "รายละเอียดเพิ่ม เช่น จังหวัด/อาชีพ", { default: "", max: 80 }),
        f("rating", "จำนวนดาว", "select", {
          default: "5",
          options: [
            { v: "5", l: "★★★★★ 5" },
            { v: "4", l: "★★★★ 4" },
            { v: "3", l: "★★★ 3" },
            { v: "2", l: "★★ 2" },
            { v: "1", l: "★ 1" },
          ],
          hint: "โชว์เมื่อเปิด \"แสดงดาว\" ที่ Section",
        }),
        image("imageKey", "รูปจากลูกค้า (ถ้ามี)"),
        f("crop", "ส่วนที่เห็น / ซูม", "crop", { group: "media", default: { x: 50, y: 50, zoom: 100 }, wide: true, cropImage: "imageKey", cropRatio: "ratio" }),
      ],
      summary: (it) => s(it.name) || s(it.text).slice(0, 30) || "รีวิว",
    },
    summary: (b) => count(arr(b.items).length, "รีวิว"),
    validate: (b, label) => (!arr(b.items).some((i) => s(i.text)) ? [{ level: "warning", message: `${label}: ยังไม่ได้ใส่รีวิว` }] : []),
  },

  instagram: {
    type: "instagram",
    meta: { label: "ฟีด Instagram", icon: "📸", hint: "ตารางรูปสี่เหลี่ยมแบบ IG + ปุ่มติดตาม (เลือกรูปเอง ไม่ดึงจาก IG อัตโนมัติ)", group: "เนื้อหา" },
    fields: [
      ...headFields({ eyebrow: "Instagram", title: "ติดตามเรา" }),
      text("handle", "ชื่อบัญชี", { default: "", max: 60, i18n: false, placeholder: "@yourshop" }),
      f("profileUrl", "ลิงก์โปรไฟล์ Instagram", "href", { default: "", placeholder: "https://instagram.com/yourshop" }),
      text("buttonText", "ข้อความปุ่ม", { default: "ติดตามบน Instagram", max: 40 }),
      f("columns", "จำนวนคอลัมน์ (จอคอม)", "number", { group: "layout", default: 4, min: 2, numMax: 6 }),
      f("mobileColumns", "จำนวนคอลัมน์ (มือถือ)", "select", {
        group: "layout",
        default: "3",
        options: [
          { v: "2", l: "2 คอลัมน์" },
          { v: "3", l: "3 คอลัมน์" },
        ],
      }),
      f("gap", "ระยะห่างระหว่างรูป", "select", {
        group: "layout",
        default: "sm",
        options: [
          { v: "none", l: "ชิดกัน" },
          { v: "sm", l: "น้อย" },
          { v: "md", l: "กลาง" },
        ],
      }),
      ...imageLookFields({ ratio: "1:1", frame: "rect", ratioHint: "IG ใช้จัตุรัส 1:1 หรือแนวตั้ง 4:5" }),
    ],
    children: {
      key: "items",
      label: "รูปโพสต์",
      itemLabel: "รูป",
      icon: "🖼️",
      max: 24,
      fields: [
        image("imageKey", "รูป"),
        f("crop", "ส่วนที่เห็น / ซูม", "crop", { group: "media", default: { x: 50, y: 50, zoom: 100 }, wide: true, cropImage: "imageKey", cropRatio: "ratio" }),
        text("alt", "คำบรรยายรูป (Alt)", { default: "", max: 200 }),
        f("href", "กดรูปแล้วไปที่ (ว่าง = โปรไฟล์ IG)", "href", { default: "", placeholder: "https://instagram.com/p/..." }),
      ],
      summary: (it) => (it.imageKey ? s(it.alt) || "รูป" : "ยังไม่เลือกรูป"),
    },
    summary: (b) => [count(arr(b.items).filter((i) => i.imageKey).length, "รูป"), s(b.handle)].filter(Boolean).join(" · "),
    validate: (b, label) => {
      const out: Omit<ValidationIssue, "blockId">[] = [];
      if (!arr(b.items).some((i) => i.imageKey)) out.push({ level: "error", message: `${label}: ยังไม่มีรูป` });
      if (!s(b.profileUrl)) out.push({ level: "warning", message: `${label}: ยังไม่ได้ใส่ลิงก์โปรไฟล์ Instagram (ปุ่มติดตามจะไม่ขึ้น)` });
      return out;
    },
  },

  cta: {
    type: "cta",
    meta: { label: "แถบชวนติดต่อ", icon: "📣", hint: "กล่องสีเน้น + ปุ่ม", group: "เนื้อหา" },
    fields: [
      text("title", "หัวข้อ", { default: "มีคำถามก่อนสั่งซื้อ?", max: 160, wide: true }),
      area("subtitle", "คำอธิบาย", { default: "", max: 400 }),
      link("primary", "ปุ่มหลัก", "ติดต่อเรา", "/contact"),
      link("secondary", "ปุ่มรอง", "ดูสินค้าทั้งหมด", "/shop"),
    ],
    summary: (b) => s(b.title) || "แถบชวนติดต่อ",
    validate: (b, label) => {
      const out: Omit<ValidationIssue, "blockId">[] = [];
      const p = (b.primary ?? {}) as { text?: string; href?: string };
      if (s(p.text) && !s(p.href)) out.push({ level: "error", message: `${label}: ปุ่มหลักยังไม่มีลิงก์` });
      if (!s(b.title)) out.push({ level: "warning", message: `${label}: ยังไม่มีหัวข้อ` });
      return out;
    },
  },

  newsletter: {
    type: "newsletter",
    meta: { label: "สมัครรับข่าวสาร", icon: "📬", hint: "ช่องกรอกอีเมล เก็บรายชื่อไว้ใน ERP", group: "เนื้อหา" },
    fields: [
      text("title", "หัวข้อ", { default: "รับข่าวสาร & โปรโมชัน", max: 120, wide: true }),
      area("subtitle", "คำอธิบาย", { default: "สินค้าใหม่และส่วนลด ส่งตรงถึงอีเมลคุณ", max: 300 }),
      text("buttonText", "ข้อความปุ่ม", { group: "action", default: "สมัคร", max: 40 }),
      text("successText", "ข้อความเมื่อสมัครสำเร็จ", { default: "ขอบคุณ! เราจะส่งข่าวดีให้ก่อนใคร", max: 160, wide: true }),
    ],
    summary: (b) => s(b.title) || "สมัครรับข่าวสาร",
  },

  "custom-html": {
    type: "custom-html",
    meta: { label: "Custom HTML", icon: "🧩", hint: "วาง HTML + CSS ที่ให้ AI ทำมา (ไม่รัน JavaScript)", group: "ขั้นสูง" },
    fields: [
      f("html", "HTML + CSS", "code", {
        default: "",
        wide: true,
        max: 40000,
        required: true,
        requiredMessage: "ยังไม่ได้วางโค้ด",
        hint: "ใช้ <style> ธรรมดาได้ CSS จะมีผลเฉพาะใน Section นี้ · ห้าม <script> · ห้าม Tailwind class · ใช้สีร้านได้ด้วย var(--color-brand) ฯลฯ",
      }),
      text("note", "บันทึกช่วยจำ (ไม่แสดงบนเว็บ)", { default: "", max: 120, i18n: false, wide: true, placeholder: "เช่น แบนเนอร์โปรปีใหม่ จาก ChatGPT" }),
    ],
    summary: (b) => s(b.note) || (s(b.html) ? `${s(b.html).length.toLocaleString()} ตัวอักษร` : "ยังไม่ได้วางโค้ด"),
  },

  spotlight: {
    type: "spotlight",
    meta: { label: "โชว์สินค้าเด่น (Spotlight)", icon: "💎", hint: "รูปสินค้าใหญ่ + ตัวอักษรยักษ์ด้านหลัง + จุดสี กดสลับสินค้าได้", group: "สินค้า" },
    fields: [
      text("eyebrow", "คำโปรยเล็ก", { default: "คอลเลกชันเด่น", max: 80 }),
      text("bigText", "ตัวอักษรยักษ์ด้านหลัง", { default: "", max: 24, placeholder: "ว่าง = ใช้ชื่อรุ่น", hint: "สั้น ๆ 1–2 คำ จะดูดีที่สุด" }),
      f("codes", "สินค้าที่จะโชว์ (สลับได้)", "products", { group: "products", default: [], max: 6, wide: true, required: true, requiredMessage: "ยังไม่ได้เลือกสินค้า" }),
      f("showColors", "โชว์ตัวเลือกสี/แบบ ให้กดสลับรูป", "toggle", { group: "products", default: true }),
      f("showPrice", "โชว์ราคา", "toggle", { group: "products", default: true }),
      link("primary", "ปุ่มหลัก", "ดูรายละเอียด", "", { hint: "เว้นลิงก์ว่าง = ไปหน้าสินค้ารุ่นที่กำลังโชว์" }),
      f("bgMode", "พื้นหลัง", "select", {
        group: "layout",
        default: "tint",
        options: [
          { v: "tint", l: "พาสเทลจากสีแบรนด์" },
          { v: "surface", l: "ขาว/พื้นการ์ด" },
          { v: "custom", l: "เลือกสีเอง" },
        ],
      }),
      f("bgColor", "สีพื้นหลัง", "color", { group: "layout", default: "", showIf: { key: "bgMode", eq: "custom" } }),
      f("autoplay", "สลับสินค้าอัตโนมัติ", "toggle", { group: "layout", default: true }),
      f("interval", "เวลาต่อสินค้า (วินาที)", "number", { group: "layout", default: 6, min: 3, numMax: 30 }),
      /* ── โชว์/ซ่อน แต่ละส่วน ── */
      f("showName", "โชว์ชื่อสินค้า", "toggle", { group: "content", default: true }),
      f("showCategory", "โชว์ชื่อหมวด", "toggle", { group: "content", default: true }),
      f("showBigText", "โชว์ตัวอักษรยักษ์ด้านหลัง", "toggle", { group: "content", default: true }),
      f("showNav", "โชว์ปุ่มเลื่อน/จุด", "toggle", { group: "content", default: true }),
      /* ── การจัดวาง ── */
      f("layout", "การจัดวาง", "select", {
        group: "layout",
        default: "center",
        wide: true,
        options: [
          { v: "center", l: "ข้อความซ้าย · รูปกลาง · ตัวเลือกขวา (แบบเดิม)" },
          { v: "image-left", l: "รูปซ้าย · ข้อความ+ตัวเลือกขวา" },
          { v: "image-right", l: "ข้อความ+ตัวเลือกซ้าย · รูปขวา" },
          { v: "stack", l: "รูปบน · ข้อความกลางด้านล่าง" },
        ],
      }),
      f("textAlign", "จัดข้อความ", "select", {
        group: "layout",
        default: "left",
        options: [
          { v: "left", l: "ชิดซ้าย" },
          { v: "center", l: "กึ่งกลาง" },
        ],
      }),
      /* ── รูปสินค้า ── */
      f("imageFit", "การแสดงรูป", "select", {
        group: "media",
        default: "contain",
        options: [
          { v: "contain", l: "ตามรูป (เห็นทั้งรูป)" },
          { v: "cover", l: "เต็มกล่อง (ตัดขอบที่เกิน)" },
        ],
      }),
      f("imageRatio", "สัดส่วนกล่องรูป", "select", {
        group: "media",
        default: "1:1",
        options: [
          { v: "1:1", l: "จัตุรัส 1:1" },
          { v: "4:5", l: "แนวตั้ง 4:5" },
          { v: "3:4", l: "แนวตั้ง 3:4" },
          { v: "4:3", l: "แนวนอน 4:3" },
        ],
      }),
      f("imageSize", "ขนาดรูป (%)", "range", { group: "media", default: 100, min: 60, numMax: 140, step: 5, hint: "100 = ปกติ (กว้างสุด 420px)" }),
      f("imageFrame", "กรอบรูป", "select", {
        group: "media",
        default: "none",
        options: [
          { v: "none", l: "ไม่มี (ลอยบนพื้น)" },
          { v: "rounded", l: "มุมมน" },
          { v: "circle", l: "วงกลม" },
          { v: "arch", l: "โค้งประตู" },
        ],
      }),
      f("imageBg", "พื้นหลังรูป", "select", {
        group: "media",
        default: "none",
        options: [
          { v: "none", l: "โปร่ง" },
          { v: "white", l: "ขาว" },
          { v: "surface", l: "พื้นการ์ด" },
          { v: "soft", l: "สีแบรนด์จาง" },
        ],
      }),
      f("imageShadow", "เงาใต้รูป", "toggle", { group: "media", default: true }),
      /* ── ตัวอักษร / สี ── */
      f("nameFont", "ฟอนต์ชื่อสินค้า", "select", { group: "layout", default: "display", options: CANVAS_FONTS, display: "font" }),
      f("nameSize", "ขนาดชื่อสินค้า (px)", "range", { group: "layout", default: 30, min: 16, numMax: 64, step: 1 }),
      f("nameColor", "สีชื่อสินค้า", "color", { group: "layout", default: "", hint: "ว่าง = ตามธีม" }),
      f("priceColor", "สีราคา", "color", { group: "layout", default: "", hint: "ว่าง = สีแบรนด์" }),
      f("bigTextFont", "ฟอนต์ตัวอักษรยักษ์", "select", { group: "layout", default: "display", options: CANVAS_FONTS, display: "font", showIf: { key: "showBigText", eq: true } }),
      f("bigTextColor", "สีตัวอักษรยักษ์", "color", { group: "layout", default: "", hint: "ว่าง = สีแบรนด์", showIf: { key: "showBigText", eq: true } }),
      f("bigTextOpacity", "ความเข้มตัวอักษรยักษ์ (%)", "range", { group: "layout", default: 14, min: 4, numMax: 60, step: 1, showIf: { key: "showBigText", eq: true } }),
    ],
    summary: (b) => `${count((b.codes as unknown[])?.length ?? 0, "รุ่น")}${s(b.bigText) ? ` · ${s(b.bigText)}` : ""}`,
  },

  personalize: {
    type: "personalize",
    meta: { label: "ปั๊มชื่อ (Personalize)", icon: "🔤", hint: "ลูกค้าเลือกสินค้าที่ปั๊มได้ พิมพ์ข้อความ เลือกแบบ/ตำแหน่ง เห็นรูปสด แล้วใส่ตะกร้า", group: "สินค้า" },
    fields: [
      ...headFields({ eyebrow: "Personalize", title: "ปั๊มชื่อของคุณ", subtitle: true }),
      f("source", "สินค้าที่ให้เลือก", "select", {
        group: "products",
        default: "all",
        wide: true,
        options: [
          { v: "all", l: "ทุกรุ่นที่เปิดปั๊มชื่อไว้ (ตั้งในแท็บเว็บไซต์ของ Parent SKU)" },
          { v: "manual", l: "เลือกเองทีละรุ่น (เฉพาะรุ่นที่เปิดปั๊มชื่อ)" },
        ],
      }),
      f("codes", "เลือกสินค้า", "products", { group: "products", default: [], max: 24, wide: true, showIf: { key: "source", eq: "manual" } }),
      f("buttonText", "ข้อความปุ่ม", "text", { group: "products", default: "ใส่ตะกร้า", max: 40 }),
    ],
    summary: (b) => (s(b.source) === "manual" ? count((b.codes as unknown[])?.length ?? 0, "รุ่นที่เลือก") : "ทุกรุ่นที่เปิดปั๊มชื่อ"),
    validate: (b, label) => (s(b.source) === "manual" && !(b.codes as unknown[])?.length ? [{ level: "error", message: `${label}: ยังไม่ได้เลือกสินค้า` }] : []),
  },

  stats: {
    type: "stats",
    meta: { label: "ตัวเลขเด่น", icon: "🔢", hint: "ตัวเลขนับขึ้นตอนเลื่อนถึง เช่น ขายแล้ว 10,000 ใบ", group: "เนื้อหา" },
    fields: headFields({ eyebrow: "", title: "" }),
    children: {
      key: "items",
      label: "ตัวเลข",
      itemLabel: "ตัวเลข",
      icon: "🔢",
      min: 1,
      max: 6,
      fields: [
        f("value", "ตัวเลข", "number", { default: 100, min: 0, numMax: 999999999 }),
        text("prefix", "ข้อความหน้าตัวเลข", { default: "", max: 10, placeholder: "เช่น ฿ หรือ +" }),
        text("suffix", "ข้อความหลังตัวเลข", { default: "", max: 10, placeholder: "เช่น ใบ, ปี, %" }),
        text("label", "คำอธิบาย", { default: "", max: 60, wide: true, placeholder: "เช่น ลูกค้าที่ไว้ใจเรา" }),
      ],
      summary: (it) => `${s(it.prefix)}${Number(it.value ?? 0).toLocaleString()}${s(it.suffix)} ${s(it.label)}`.trim() || "ตัวเลข",
      blank: () => ({ value: 100, prefix: "", suffix: "", label: "" }),
    },
    summary: (b) => count(arr(b.items).length, "ตัวเลข"),
    validate: (b, label) => (!arr(b.items).some((i) => s(i.label)) ? [{ level: "warning", message: `${label}: ยังไม่ได้ใส่คำอธิบายตัวเลข` }] : []),
  },

  map: {
    type: "map",
    meta: { label: "แผนที่ร้าน", icon: "📍", hint: "ฝังแผนที่ Google Maps + ที่อยู่", group: "เนื้อหา" },
    fields: [
      text("title", "หัวข้อ", { default: "แผนที่ร้าน", max: 160, wide: true }),
      area("address", "ที่อยู่", { default: "", max: 300 }),
      f("embedUrl", "ลิงก์ฝังแผนที่", "map", {
        default: "",
        wide: true,
        hint: 'ใน Google Maps กด "แชร์" → "ฝังแผนที่" แล้วเอาลิงก์ใน src มาวาง',
        required: true,
        requiredMessage: 'ยังไม่มีลิงก์แผนที่ — ใน Google Maps กด "แชร์" → "ฝังแผนที่" แล้วเอาลิงก์ใน src มาวาง',
      }),
    ],
    summary: (b) => (s(b.embedUrl) ? s(b.address) || s(b.title) || "แผนที่" : "ยังไม่มีลิงก์แผนที่"),
  },

  /* ── สินค้า ── */
  categories: {
    type: "categories",
    meta: { label: "หมวดสินค้า", icon: "📂", hint: "ปุ่มลัดไปแต่ละหมวด — รูปใหญ่ / รูปเล็ก / ตัวอักษร (หมวด+รูป ตั้งที่แท็บ 📂 หมวดหมู่)", group: "สินค้า" },
    fields: [
      ...headFields({ eyebrow: "เลือกตามหมวด", title: "เลือกซื้อตามหมวด" }),
      f("layout", "แบบแสดง", "select", {
        group: "layout",
        default: "icon",
        wide: true,
        options: [
          { v: "icon", l: "การ์ดไอคอน + คำอธิบาย (แบบเดิม)" },
          { v: "tile", l: "🖼 การ์ดรูปใหญ่ (ชื่อทับบนรูป)" },
          { v: "row", l: "รูปเล็ก + ชื่อ (เรียงแถว มีเส้นคั่น)" },
          { v: "text", l: "ตัวอักษรอย่างเดียว" },
        ],
        hint: "รูปของแต่ละหมวดตั้งที่แท็บ 📂 หมวดหมู่ (ไม่มีรูป = ใช้ไอคอน)",
      }),
      f("cats", "หมวดที่โชว์", "categories", { group: "content", wide: true, hint: "ไม่เลือก = ทุกหมวดหลัก ตามลำดับในแท็บ 📂 หมวดหมู่ · ลาก ⠿ เรียงลำดับ · 🖼 = ตั้งรูปบนการ์ดเฉพาะ Section นี้ (ไม่ตั้ง = รูปหมวดจากแท็บ 📂)" }),
      // รูปแทนรายหมวด (แก้ในช่อง "หมวดที่โชว์" ด้านบน) — หน้าร้านใช้แทน imageKey ของหมวด
      f("catImg", "รูปบนการ์ดรายหมวด", "categoryImages", { group: "content", hidden: true, default: {} }),
      f("subs", "หมวดย่อยใต้การ์ด", "select", {
        group: "content",
        default: "none",
        options: [
          { v: "none", l: "ไม่โชว์" },
          { v: "links", l: "📂 โชว์หมวดย่อยเป็นลิงก์ใต้การ์ดหมวดแม่" },
        ],
        hint: "เฉพาะหมวดที่มีหมวดย่อย (ตั้งที่แท็บ 📂 หมวดหมู่ → ➕ หมวดย่อย) · โชว์ได้ 6 หมวดย่อยต่อการ์ด เกินนั้นเป็น +N",
      }),
      f("columns", "จำนวนคอลัมน์ (จอคอม)", "select", {
        group: "layout",
        default: "4",
        options: ["2", "3", "4", "5", "6"].map((v) => ({ v, l: `${v} คอลัมน์` })),
        showIf: { key: "layout", eq: ["icon", "tile"] },
      }),
      // 🖼 การ์ดรูปใหญ่: ชุดหน้าตารูปของกลาง (สัดส่วน · ทรงกรอบ · เส้นกรอบ + สี) — key ratio เดิม · ทรงเริ่ม "มุมมน" = หน้าตาเดิม
      ...imageLookFields({ ratio: "4:5" }).map((fd) => ({
        ...fd,
        ...(fd.key === "frame" ? { hint: "ทรงโค้ง (วงกลม / โค้งประตู / หัวใจ) = ชื่อหมวดจัดกึ่งกลางให้เอง ไม่โดนตัดมุม" } : null),
        showIf: fd.showIf ? [TILE_ONLY, ...(Array.isArray(fd.showIf) ? fd.showIf : [fd.showIf])] : TILE_ONLY,
      })),
      f("tileBg", "สีพื้นหลังการ์ด", "select", {
        group: "layout",
        default: "auto",
        options: [{ v: "auto", l: "อัตโนมัติ (มีรูป = โปร่ง · ไม่มีรูป = สีแบรนด์จาง)" }, ...CANVAS_COLORS],
        hint: "สีรอบรูป (เวลาย่อรูป/เห็นทั้งรูป) และการ์ดหมวดที่ไม่มีรูป — ให้ทุกการ์ดดูเป็นชุดเดียวกัน",
        showIf: TILE_ONLY,
      }),
      f("tileBgHex", "สีพื้นหลังการ์ด (เลือกเอง)", "color", { group: "layout", default: "", showIf: [TILE_ONLY, { key: "tileBg", eq: "custom" }] }),
      f("imgFit", "การวางรูปในการ์ด", "select", {
        group: "layout",
        default: "cover",
        options: [
          { v: "cover", l: "เต็มการ์ด (ตัดขอบที่เกิน)" },
          { v: "contain", l: "เห็นทั้งรูป (ไม่ตัด)" },
        ],
        showIf: { key: "layout", eq: "tile" },
      }),
      f("imgSize", "ขนาดรูป (%)", "range", {
        group: "layout",
        default: 100,
        min: 40,
        numMax: 200,
        step: 5,
        hint: "100 = ปกติ · น้อยกว่า = รูปเล็กลง · มากกว่า = ขยาย",
        showIf: { key: "layout", eq: ["tile", "row", "icon"] },
      }),
      f("textPos", "ตำแหน่งชื่อบนรูป", "select", {
        group: "layout",
        default: "top-left",
        options: [
          { v: "top-left", l: "บนซ้าย" },
          { v: "center", l: "กลางรูป" },
          { v: "bottom-left", l: "ล่างซ้าย" },
        ],
        showIf: { key: "layout", eq: "tile" },
      }),
      f("cta", "ข้อความเล็กบนการ์ด", "text", { group: "content", default: "SHOP NOW", max: 30, hint: "ว่าง = ไม่มี", showIf: { key: "layout", eq: "tile" } }),
      f("tileText", "สีตัวอักษรบนรูป", "select", {
        group: "layout",
        default: "dark",
        options: [
          { v: "dark", l: "เข้ม (รูปโทนอ่อน)" },
          { v: "light", l: "ขาว + เงาไล่ (รูปโทนเข้ม)" },
        ],
        showIf: { key: "layout", eq: "tile" },
      }),
      f("textStyle", "แบบตัวอักษร", "select", {
        group: "layout",
        default: "pill",
        options: [
          { v: "pill", l: "ปุ่มมน" },
          { v: "plain", l: "ข้อความ + เส้นคั่น" },
        ],
        showIf: { key: "layout", eq: "text" },
      }),
      f("upper", "ชื่อหมวดตัวพิมพ์ใหญ่ (อังกฤษ)", "toggle", { group: "layout", default: false }),
      f("showAll", "ปุ่ม \"ดูทั้งหมด\"", "toggle", { group: "action", default: true }),
      f("allText", "ข้อความปุ่มดูทั้งหมด", "text", { group: "action", default: "ดูทั้งหมด →", max: 40, showIf: { key: "showAll", eq: true } }),
    ],
    summary: (b) => `${s(b.title) || "หมวดสินค้า"} · ${{ icon: "การ์ดไอคอน", tile: "รูปใหญ่", row: "รูปเล็ก", text: "ตัวอักษร" }[s(b.layout) || "icon"] ?? "การ์ดไอคอน"}`,
  },

  featured: {
    type: "featured",
    meta: { label: "สินค้าแนะนำ", icon: "⭐", hint: "ดึงสินค้าที่ติ๊ก ★ แนะนำ มาแสดง", group: "สินค้า" },
    fields: [
      ...headFields({ eyebrow: "ขายดี", title: "สินค้าแนะนำ" }),
      f("limit", "จำนวนสินค้า", "number", { group: "products", default: 4, min: 2, numMax: 12 }),
    ],
    summary: (b) => `${s(b.title)} · ${Number(b.limit) || 4} ชิ้น`,
  },

  products: {
    type: "products",
    meta: { label: "ตารางสินค้า / คอลเลกชัน", icon: "🛍️", hint: "เลือกเองทีละรุ่น หรือดึงทั้งหมวด · เรียงเป็นตารางหรือเลื่อนข้าง", group: "สินค้า" },
    fields: [
      ...headFields({ eyebrow: "", title: "สินค้า" }),
      f("source", "ดึงสินค้าจาก", "select", {
        group: "products",
        hint: "ไม่มีสินค้าเข้าเงื่อนไข (เช่น ยังไม่มีสินค้าลดราคา) = Section นี้ซ่อนเอง",
        default: "manual",
        wide: true,
        options: [
          { v: "manual", l: "เลือกเองทีละรุ่น" },
          { v: "category", l: "ทั้งหมวด" },
          { v: "featured", l: "ที่ติ๊ก ★ แนะนำ" },
          { v: "new", l: "สินค้าใหม่ (ขึ้นร้านล่าสุดก่อน)" },
          { v: "newdrop", l: "🆕 ชุดมาใหม่ที่เปิดอยู่ (แท็บ 🆕 มาใหม่)" },
          { v: "best", l: "ขายดี (ยอดขายบนเว็บ)" },
          { v: "sale", l: "กำลังลดราคา (มีราคาขีดฆ่า)" },
          { v: "all", l: "สินค้าทั้งหมด (ตามลำดับร้าน)" },
          { v: "skus", l: "เลือก SKU เองทีละตัว (รุ่น + สี)" },
        ],
      }),
      f("codes", "เลือกสินค้า", "products", { group: "products", default: [], max: 24, wide: true, showIf: { key: "source", eq: "manual" } }),
      f("skus", "เลือก SKU (1 การ์ด / SKU · เรียงตามที่เลือก)", "skus", { group: "products", default: [], max: 24, wide: true, showIf: { key: "source", eq: "skus" } }),
      // 🎨 แยกการ์ดตาม SKU (สี) — เว็บร้าน: src/lib/sku-cards.ts
      f("cardMode", "การ์ดสินค้า", "select", {
        group: "products",
        default: "parent",
        wide: true,
        hint: "แยกตาม SKU = แต่ละสีเป็นการ์ดของตัวเอง (รูปของสีนั้น · ชื่อรุ่น + สี · กดแล้วเลือกสีนั้นให้) · \"จำนวนสูงสุด\" นับเป็นการ์ด",
        options: [
          { v: "parent", l: "1 การ์ด / รุ่น (เดิม · มีจุดสี)" },
          { v: "sku", l: "1 การ์ด / SKU (แยกทุกสี)" },
        ],
        showIf: { key: "source", eq: ["manual", "category", "featured", "new", "newdrop", "best", "sale", "all"] },
      }),
      f("skuOrder", "เรียงการ์ด SKU", "select", {
        group: "products",
        default: "mix",
        options: [
          { v: "mix", l: "สลับรุ่น (สีแรกของทุกรุ่นก่อน)" },
          { v: "group", l: "เรียงต่อกันทีละรุ่น" },
        ],
        showIf: [{ key: "source", eq: ["manual", "category", "featured", "new", "newdrop", "best", "sale", "all"] }, { key: "cardMode", eq: "sku" }],
      }),
      f("category", "หมวด", "category", { group: "products", default: "", showIf: { key: "source", eq: "category" } }),
      f("sort", "เรียงลำดับ", "select", {
        group: "products",
        default: "default",
        options: [
          { v: "default", l: "ตามแหล่ง / ที่เลือกไว้" },
          { v: "price-asc", l: "ราคา ถูก → แพง" },
          { v: "price-desc", l: "ราคา แพง → ถูก" },
          { v: "newest", l: "ใหม่ล่าสุดก่อน" },
        ],
      }),
      f("limit", "จำนวนสูงสุด", "number", { group: "products", default: 8, min: 1, numMax: 24 }),
      // 🎛️ รูปแบบการโชว์ 9 แบบ (ปุ่มรูปย่อ) + แยกแบบของมือถือได้ — เว็บร้าน: src/components/home/ProductsBlock.tsx
      f("layout", "รูปแบบการโชว์ (คอม)", "select", { group: "layout", default: "grid", wide: true, display: "tiles", options: PRODUCT_LAYOUTS }),
      f("layoutMobile", "รูปแบบบนมือถือ", "select", {
        group: "layout",
        default: "same",
        wide: true,
        display: "tiles",
        hint: "บางแบบสวยบนจอใหญ่แต่ยาวเกินบนมือถือ — เลือกแบบอื่นให้มือถือได้ (เช่น เลื่อนข้าง)",
        options: [{ v: "same", l: "เหมือนคอม", sketch: "same", hint: "ใช้แบบเดียวกัน" }, ...PRODUCT_LAYOUTS],
      }),
      // ▶ เลื่อนเองอัตโนมัติ — ใช้กับแบบ เลื่อนข้าง / สปอตไลต์ (คอมหรือมือถือ)
      f("autoplay", "เลื่อนเองอัตโนมัติ", "toggle", {
        group: "layout",
        default: false,
        hint: "เอาเมาส์ชี้/แตะค้าง = หยุด",
        showIf: { key: "layout", eq: ["carousel", "spotlight"], orKey: "layoutMobile" },
      }),
      f("autoplaySec", "เลื่อนทุก (วินาที)", "number", {
        group: "layout",
        default: 5,
        min: 2,
        numMax: 15,
        showIf: [
          { key: "layout", eq: ["carousel", "spotlight"], orKey: "layoutMobile" },
          { key: "autoplay", eq: true },
        ],
      }),
      f("columns", "คอลัมน์ (ตารางบนคอม)", "number", { group: "layout", default: 4, min: 2, numMax: 5, showIf: { key: "layout", eq: ["grid", "rank", "tabs"] } }),
      f("side", "ตัวเด่น / แบนเนอร์ อยู่ด้าน", "select", {
        group: "layout",
        default: "left",
        options: [
          { v: "left", l: "ซ้าย" },
          { v: "right", l: "ขวา" },
        ],
        showIf: { key: "layout", eq: ["feature", "banner"], orKey: "layoutMobile" },
      }),
      f("lookCols", "จำนวนรูปต่อแถว (จอคอม)", "select", {
        group: "layout",
        default: "2",
        options: [
          { v: "2", l: "2 รูป" },
          { v: "3", l: "3 รูป" },
        ],
        showIf: { key: "layout", eq: "lookbook", orKey: "layoutMobile" },
      }),
      f("rankBy", "เรียงอันดับจาก", "select", {
        group: "layout",
        default: "sales",
        options: [
          { v: "sales", l: "ยอดขายบนเว็บจริง (ยังไม่มียอด = ตามลำดับที่ดึงมา)" },
          { v: "order", l: "ตามลำดับที่ดึงมา / ที่เลือก" },
        ],
        wide: true,
        showIf: { key: "layout", eq: "rank", orKey: "layoutMobile" },
      }),
      f("tabCats", "หมวดที่เป็นแท็บ", "categories", { group: "layout", default: [], max: 8, wide: true, hint: "ว่าง = ทุกหมวดที่มีสินค้า", showIf: { key: "layout", eq: "tabs", orKey: "layoutMobile" } }),
      f("tabAll", "มีแท็บ \"ทั้งหมด\" เป็นแท็บแรก", "toggle", { group: "layout", default: true, hint: "ใช้สินค้าตาม \"ดึงสินค้าจาก\"", showIf: { key: "layout", eq: "tabs", orKey: "layoutMobile" } }),
      f("bannerImage", "รูปแบนเนอร์", "image", { group: "layout", default: null, hint: "แนะนำแนวตั้ง 4:5 · ว่าง = ใช้รูปสินค้าตัวแรก", showIf: { key: "layout", eq: "banner", orKey: "layoutMobile" } }),
      f("bannerEyebrow", "คำโปรยบนแบนเนอร์", "text", { group: "layout", default: "คอลเลกชันใหม่", max: 60, showIf: { key: "layout", eq: "banner", orKey: "layoutMobile" } }),
      f("bannerTitle", "หัวข้อบนแบนเนอร์", "text", { group: "layout", default: "", max: 80, showIf: { key: "layout", eq: "banner", orKey: "layoutMobile" } }),
      f("bannerText", "ข้อความบนแบนเนอร์", "textarea", { group: "layout", default: "", max: 300, showIf: { key: "layout", eq: "banner", orKey: "layoutMobile" } }),
      link("bannerCta", "ปุ่มบนแบนเนอร์", "ดูคอลเลกชัน", "/shop", { group: "layout", showIf: { key: "layout", eq: "banner", orKey: "layoutMobile" } }),
      link("more", "ปุ่ม \"ดูทั้งหมด\"", "ดูทั้งหมด", "/shop"),
      ...PRODUCT_CARD_FIELDS,
    ],
    summary: (b) => {
      const src = s(b.source);
      if (src === "manual") return count((b.codes as unknown[])?.length ?? 0, "รุ่นที่เลือก");
      if (src === "category") return `หมวด ${s(b.category) || "(ยังไม่เลือก)"}`;
      if (src === "featured") return "สินค้าที่ติ๊กแนะนำ";
      if (src === "new") return "สินค้าใหม่";
      if (src === "newdrop") return "ชุดมาใหม่ที่เปิดอยู่";
      if (src === "best") return "ขายดี";
      if (src === "sale") return "กำลังลดราคา";
      if (src === "skus") return count((b.skus as unknown[])?.length ?? 0, "SKU ที่เลือก");
      return "สินค้าทั้งหมด";
    },
    validate: (b, label) => {
      if (s(b.source) === "manual" && !(b.codes as unknown[])?.length) return [{ level: "error", message: `${label}: ยังไม่ได้เลือกสินค้า` }];
      if (s(b.source) === "skus" && !(b.skus as unknown[])?.length) return [{ level: "error", message: `${label}: ยังไม่ได้เลือก SKU` }];
      if (s(b.source) === "category" && !s(b.category)) return [{ level: "error", message: `${label}: ยังไม่ได้เลือกหมวด` }];
      return [];
    },
  },
};

export const SECTION_TYPES = Object.keys(SECTION_SCHEMAS);

/**
 * Section นี้มี "หัวข้อ" ที่แผง 🔤 ตัวอักษร ปรับได้ไหม (มีช่อง title ที่ตัว Section หรือชิ้นย่อย)
 * ผืนผ้าใบ / โชว์สินค้าเด่น มีตัวตั้งตัวอักษรของตัวเองครบแล้ว → ไม่โชว์ (กันตั้งสองที่ชนกัน)
 */
export function sectionHasHeading(type: string): boolean {
  if (type === "canvas" || type === "spotlight") return false;
  const sc = SECTION_SCHEMAS[type];
  if (!sc) return false;
  return sc.fields.some((f) => f.key === "title") || !!sc.children?.fields.some((f) => f.key === "title");
}

/** ลำดับกลุ่มในคลัง Section */
export const SECTION_GROUP_ORDER = ["พื้นฐาน", "สินค้า", "เนื้อหา", "ขั้นสูง"];

/** ชิ้นย่อยเปล่าตาม schema (ใช้ตอนกด "+ เพิ่ม" ในต้นไม้) */
export function blankChild(spec: ChildSpec): Record<string, unknown> {
  const base: Record<string, unknown> = spec.blank ? spec.blank() : {};
  for (const fd of spec.fields) if (!(fd.key in base)) base[fd.key] = structuredCloneSafe(fd.default ?? defaultForType(fd.type));
  return base;
}

export function defaultForType(t: FieldType): unknown {
  switch (t) {
    case "number":
    case "range":
      return 0;
    case "toggle":
      return false;
    case "image":
    case "videoFile":
      return null;
    case "link":
      return { text: "", href: "" };
    case "list":
    case "products":
    case "skus":
    case "categories":
      return [];
    case "categoryImages":
      return {};
    case "crop":
      return { x: 50, y: 50, zoom: 100 };
    case "point":
      return { x: 50, y: 50 };
    default:
      return "";
  }
}

export function structuredCloneSafe<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** รหัสชิ้นย่อยใหม่ (ไม่ซ้ำพอสำหรับในหน้าเดียวกัน) */
export const newChildId = (key: string) => `${key}-${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 1000)}`;
