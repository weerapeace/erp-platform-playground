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
  | "category" // หมวดสินค้าบนเว็บของร้าน (key)
  | "categories" // หลายหมวด เรียงตามที่เลือก (key[]) — ว่าง = ทุกหมวด
  | "crop" // ส่วนที่เห็นของรูปในกรอบ { x, y, zoom } — ลากกรอบ/ซูม (ImageCropBox) · ต้องตั้ง cropImage (+ cropRatio)
  | "code"; // HTML+CSS ที่วางเอง (ล้างด้วย lib/website-html.ts)

export type FieldGroup = "content" | "media" | "action" | "layout" | "products";

export const FIELD_GROUP_LABEL: Record<FieldGroup, string> = {
  content: "เนื้อหา",
  media: "รูป / สื่อ",
  action: "ปุ่ม / ลิงก์",
  layout: "การจัดวาง",
  products: "สินค้า",
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
  /** select: "tiles" = แสดงเป็นปุ่มรูปย่อให้กดเลือก (แทน dropdown) */
  display?: "tiles";
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
  /**
   * โชว์เฉพาะเมื่อช่องอื่นมีค่าตามนี้ เช่น { key: "source", eq: "manual" }
   * eq เป็น array = ค่าใดค่าหนึ่งในรายการ · ใส่หลายเงื่อนไขเป็น array = ต้องตรงทุกข้อ
   */
  showIf?: ShowIf | ShowIf[];
  /** ช่องชนิด crop: key ของรูปในชิ้นเดียวกัน (เช่น "imageKey") */
  cropImage?: string;
  /** ช่องชนิด crop: key ของสัดส่วนกรอบใน Section แม่ (ค่าแบบ "4:5" · "auto" = ตามรูป ไม่ต้องครอป) */
  cropRatio?: string;
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
}

export interface ValidationIssue {
  blockId: string | null;
  level: "error" | "warning";
  message: string;
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

/** หัวข้อมาตรฐานของ Section ส่วนใหญ่: คำโปรยเล็ก + หัวข้อ (+ คำอธิบาย) */
/**
 * ของกลาง: ชุดตั้งค่าหน้าตารูป (สัดส่วน · ทรงกรอบ · เส้นกรอบ + สี) — ใช้ร่วมทุก Section ที่มีรูป (แกลเลอรี · รูปคู่ข้อความ …)
 * key คงที่ ratio / frame / border / borderColor · เว็บร้านวาดด้วยตัวกลาง FramedImage (src/components/home/FramedImage.tsx)
 * คู่กับช่อง crop (ส่วนที่เห็น/ซูม — cropRatio: "ratio") ได้
 */
const LINE_FRAME_KEYS = ["rounded", "rect", "circle", "arch"];
const imageLookFields = (opts: { ratio: string; frame?: string; allowAuto?: boolean; ratioHint?: string }): FieldDef[] => [
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
    showIf: { key: "frame", eq: LINE_FRAME_KEYS },
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
    showIf: [{ key: "frame", eq: LINE_FRAME_KEYS }, { key: "border", eq: ["line", "double", "dotted"] }],
  }),
];

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
    f("font", "ฟอนต์", "select", { default: "display", options: CANVAS_FONTS, showIf: typed }),
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
    f("frame", "ทรงรูป", "select", { group: "media", default: "rect", options: CANVAS_FRAMES, showIf: isImage }),
    image("overlayKey", "กรอบจากรูป (PNG พื้นใส วางทับรูป)", { showIf: isImage, hint: "อัปโหลดกรอบของร้านเองได้ (เช่น กรอบวินเทจจาก Canva) — ว่าง = ไม่มี" }),
    f("overlayInset", "รูปห่างขอบกรอบ (%)", "range", { group: "media", default: 12, min: 0, numMax: 40, showIf: isImage }),
    f("fit", "การจัดรูปในกรอบ", "select", {
      group: "media",
      default: "cover",
      options: [
        { v: "cover", l: "เต็มกรอบ (อาจตัดขอบ)" },
        { v: "contain", l: "ทั้งรูป (ไม่ตัด)" },
      ],
      showIf: isImage,
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
    f("flipH", "พลิกซ้าย-ขวา", "toggle", { group: "media", default: false, showIf: { key: "kind", eq: ["image", "shape"] } }),
    f("flipV", "พลิกบน-ล่าง", "toggle", { group: "media", default: false, showIf: { key: "kind", eq: ["image", "shape"] } }),

    /* ของตกแต่ง */
    f("shape", "ลาย", "select", { default: "bow", options: CANVAS_SHAPES, showIf: isShape }),
    f("outline", "แบบเส้น (ไม่ทึบ)", "toggle", { default: false, showIf: isShape }),
    f("strokeWidth", "ความหนาเส้น", "number", { default: 2, min: 1, numMax: 24, showIf: isShape }),

    /* ลิงก์ (ทุกชนิด) */
    f("href", "กดแล้วไปที่", "target", { group: "action", default: "", wide: true }),
    f("newTab", "เปิดในแท็บใหม่", "toggle", { group: "action", default: false }),

    /* ตำแหน่ง/ขนาด — ลากในพรีวิวแทนได้ */
    f("x", "ซ้าย (X)", "number", { group: "layout", default: 100, min: -1200, numMax: 2400 }),
    f("y", "บน (Y)", "number", { group: "layout", default: 100, min: -600, numMax: 4800 }),
    f("w", "กว้าง", "number", { group: "layout", default: 400, min: 4, numMax: 2400 }),
    f("h", "สูง", "number", { group: "layout", default: 80, min: 4, numMax: 4800, showIf: { key: "kind", eq: ["image", "button", "shape"] } }),
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
    f("bleed", "ยืดเต็มความกว้างจอ", "toggle", { group: "layout", default: false, showIf: { key: "kind", eq: ["image", "shape"] }, hint: "ซ้ายสุด–ขวาสุดของจอ ใช้แค่ตำแหน่งแนวตั้ง" }),
    text("group", "กลุ่ม (รหัส)", { group: "layout", default: "", max: 40, hint: "ชิ้นที่รหัสเดียวกัน = เลือก/ย้ายไปด้วยกัน (จับกลุ่มในพรีวิวแทนได้)" }),

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
      image("imageKey", "รูปพื้นหลัง", { hint: "แนะนำกว้าง 1600px+ · ไม่ใส่ = พื้นหลังไล่สีจากธีม" }),
      image("mobileImageKey", "รูปพื้นหลัง (มือถือ)", { hint: "ไม่ใส่ = ใช้รูปเดียวกับคอม · จอมือถือแคบ รูปแนวนอนจะโดนตัดข้าง แนะนำรูปแนวตั้ง 1080×1350+" }),
      text("imageAlt", "คำบรรยายรูป (Alt)", { group: "media", default: "", max: 200, hint: "มีผลกับ SEO" }),
      f("overlay", "ความทึบของสีทับรูป (%)", "range", { group: "media", default: 45, min: 0, numMax: 90, step: 5 }),
      f("videoUrl", "วิดีโอพื้นหลัง (ลิงก์ .mp4 / .webm)", "href", {
        group: "media",
        default: "",
        wide: true,
        placeholder: "https://…/clip.mp4",
        hint: "ใส่แล้วจะเล่นวนเงียบ ๆ แทนรูป (รูปใช้โชว์ระหว่างโหลด) · แนะนำไม่เกิน 5 MB",
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

  image: {
    type: "image",
    meta: { label: "รูปภาพ / แบนเนอร์รูป", icon: "🏞️", hint: "รูปเดี่ยว + คำบรรยาย + ลิงก์", group: "พื้นฐาน" },
    fields: [
      image("imageKey", "รูปภาพ", { hint: "แนะนำกว้าง 1200px+", required: true, requiredMessage: "ยังไม่ได้เลือกรูป" }),
      image("mobileImageKey", "รูปภาพ (มือถือ)", { hint: "ไม่ใส่ = ใช้รูปเดียวกับคอม · ใส่เมื่ออยากให้จอมือถือเห็นรูปคนละแนว เช่น แนวตั้ง" }),
      text("alt", "คำบรรยายรูป (Alt) — มีผลกับ SEO", { group: "media", default: "", max: 200, placeholder: "อธิบายว่าในรูปคืออะไร" }),
      text("caption", "ข้อความใต้รูป", { default: "", max: 300 }),
      f("href", "ลิงก์เมื่อคลิกรูป", "href", { group: "action", default: "", placeholder: "/shop", hint: "ไม่ใส่ = คลิกไม่ได้" }),
      f("width", "ความกว้าง", "select", {
        group: "layout",
        default: "wide",
        options: [
          { v: "narrow", l: "แคบ (อ่านง่าย)" },
          { v: "wide", l: "กว้าง (แนะนำ)" },
          { v: "full", l: "เต็มจอ" },
        ],
      }),
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
        text("caption", "ข้อความใต้รูป", { default: "", max: 200 }),
        f("href", "กดรูปแล้วไปที่", "target", { group: "action", default: "", hint: "ว่าง = กดไม่ได้" }),
      ],
      summary: (it) => (it.imageKey ? s(it.caption) || s(it.alt) || "รูป" : "ยังไม่เลือกรูป"),
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
      f("href", "ลิงก์ปลายทาง", "href", { default: "/shop", required: true, requiredMessage: "ยังไม่ได้ใส่ลิงก์ปลายทาง" }),
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

  video: {
    type: "video",
    meta: { label: "วิดีโอ", icon: "🎬", hint: "ฝังคลิปจาก YouTube หรือ Vimeo", group: "พื้นฐาน" },
    fields: [
      f("url", "ลิงก์คลิป", "video", {
        default: "",
        wide: true,
        placeholder: "https://www.youtube.com/watch?v=…",
        hint: "รับเฉพาะ YouTube และ Vimeo",
        required: true,
        requiredMessage: "ยังไม่มีลิงก์คลิป (รับเฉพาะ YouTube และ Vimeo)",
      }),
      text("title", "หัวข้อ", { default: "", max: 160 }),
      text("caption", "คำอธิบายใต้คลิป", { default: "", max: 300 }),
    ],
    summary: (b) => (s(b.url) ? s(b.title) || s(b.url) : "ยังไม่มีลิงก์คลิป"),
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
    fields: [
      f("autoplay", "เลื่อนอัตโนมัติ", "toggle", { group: "layout", default: true }),
      f("interval", "เวลาต่อสไลด์ (วินาที)", "number", { group: "layout", default: 5, min: 2, numMax: 20 }),
      f("height", "ความสูง", "select", {
        group: "layout",
        default: "medium",
        options: [
          { v: "short", l: "เตี้ย" },
          { v: "medium", l: "กลาง" },
          { v: "tall", l: "สูง" },
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
        image("imageKey", "รูปสไลด์", { hint: "แนะนำกว้าง 1600px+" }),
        image("mobileImageKey", "รูปสไลด์ (มือถือ)", { hint: "ไม่ใส่ = ใช้รูปเดียวกับคอม · แนะนำแนวตั้ง" }),
        text("alt", "คำบรรยายรูป (Alt)", { group: "media", default: "", max: 200 }),
        text("eyebrow", "คำโปรยเล็ก", { default: "", max: 80 }),
        text("title", "หัวข้อบนรูป", { default: "", max: 120, wide: true }),
        text("subtitle", "คำอธิบาย", { default: "", max: 300, wide: true }),
        link("link", "ปุ่ม", "", ""),
        f("align", "จัดข้อความ", "select", {
          group: "layout",
          default: "left",
          options: [
            { v: "left", l: "ซ้าย" },
            { v: "center", l: "กลาง" },
          ],
        }),
        f("overlay", "ความทึบของสีทับรูป (%)", "range", { group: "media", default: 35, min: 0, numMax: 90, step: 5 }),
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

  faq: {
    type: "faq",
    meta: { label: "คำถามที่พบบ่อย", icon: "❓", hint: "รายการถาม-ตอบแบบพับได้", group: "เนื้อหา" },
    fields: headFields({ eyebrow: "คำถามที่พบบ่อย", title: "เรื่องที่ลูกค้าถามบ่อย", subtitle: true }),
    children: {
      key: "items",
      label: "คำถาม-คำตอบ",
      itemLabel: "คำถาม",
      icon: "❔",
      max: 20,
      fields: [text("q", "คำถาม", { default: "คำถาม", max: 200, wide: true }), area("a", "คำตอบ", { default: "คำตอบ", max: 1500 })],
      summary: (it) => s(it.q) || "คำถาม",
    },
    summary: (b) => count(arr(b.items).length, "คำถาม"),
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
    fields: headFields({ eyebrow: "ลูกค้าของเรา", title: "เสียงจากลูกค้า" }),
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
      ],
      summary: (it) => s(it.name) || s(it.text).slice(0, 30) || "รีวิว",
    },
    summary: (b) => count(arr(b.items).length, "รีวิว"),
    validate: (b, label) => (!arr(b.items).some((i) => s(i.text)) ? [{ level: "warning", message: `${label}: ยังไม่ได้ใส่รีวิว` }] : []),
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
      text("note", "บันทึกช่วยจำ (ไม่แสดงบนเว็บ)", { default: "", max: 120, wide: true, placeholder: "เช่น แบนเนอร์โปรปีใหม่ จาก ChatGPT" }),
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
      f("nameFont", "ฟอนต์ชื่อสินค้า", "select", { group: "layout", default: "display", options: CANVAS_FONTS }),
      f("nameSize", "ขนาดชื่อสินค้า (px)", "range", { group: "layout", default: 30, min: 16, numMax: 64, step: 1 }),
      f("nameColor", "สีชื่อสินค้า", "color", { group: "layout", default: "", hint: "ว่าง = ตามธีม" }),
      f("priceColor", "สีราคา", "color", { group: "layout", default: "", hint: "ว่าง = สีแบรนด์" }),
      f("bigTextFont", "ฟอนต์ตัวอักษรยักษ์", "select", { group: "layout", default: "display", options: CANVAS_FONTS, showIf: { key: "showBigText", eq: true } }),
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
      f("cats", "หมวดที่โชว์ (เรียงตามที่เลือก)", "categories", { group: "content", hint: "ไม่เลือก = ทุกหมวด ตามลำดับในแท็บ 📂 หมวดหมู่" }),
      f("columns", "จำนวนคอลัมน์ (จอคอม)", "select", {
        group: "layout",
        default: "4",
        options: ["2", "3", "4", "5", "6"].map((v) => ({ v, l: `${v} คอลัมน์` })),
        showIf: { key: "layout", eq: ["icon", "tile"] },
      }),
      f("ratio", "สัดส่วนรูป", "select", {
        group: "layout",
        default: "4:5",
        options: [
          { v: "1:1", l: "จัตุรัส 1:1" },
          { v: "4:5", l: "แนวตั้ง 4:5" },
          { v: "3:4", l: "แนวตั้ง 3:4" },
          { v: "4:3", l: "แนวนอน 4:3" },
          { v: "16:9", l: "แนวนอนกว้าง 16:9" },
        ],
        showIf: { key: "layout", eq: "tile" },
      }),
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
          { v: "best", l: "ขายดี (ยอดขายบนเว็บ)" },
          { v: "sale", l: "กำลังลดราคา (มีราคาขีดฆ่า)" },
          { v: "all", l: "สินค้าทั้งหมด (ตามลำดับร้าน)" },
        ],
      }),
      f("codes", "เลือกสินค้า", "products", { group: "products", default: [], max: 24, wide: true, showIf: { key: "source", eq: "manual" } }),
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
    ],
    summary: (b) => {
      const src = s(b.source);
      if (src === "manual") return count((b.codes as unknown[])?.length ?? 0, "รุ่นที่เลือก");
      if (src === "category") return `หมวด ${s(b.category) || "(ยังไม่เลือก)"}`;
      if (src === "featured") return "สินค้าที่ติ๊กแนะนำ";
      if (src === "new") return "สินค้าใหม่";
      if (src === "best") return "ขายดี";
      if (src === "sale") return "กำลังลดราคา";
      return "สินค้าทั้งหมด";
    },
    validate: (b, label) => {
      if (s(b.source) === "manual" && !(b.codes as unknown[])?.length) return [{ level: "error", message: `${label}: ยังไม่ได้เลือกสินค้า` }];
      if (s(b.source) === "category" && !s(b.category)) return [{ level: "error", message: `${label}: ยังไม่ได้เลือกหมวด` }];
      return [];
    },
  },
};

export const SECTION_TYPES = Object.keys(SECTION_SCHEMAS);

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
      return null;
    case "link":
      return { text: "", href: "" };
    case "list":
    case "products":
    case "categories":
      return [];
    case "crop":
      return { x: 50, y: 50, zoom: 100 };
    default:
      return "";
  }
}

export function structuredCloneSafe<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** รหัสชิ้นย่อยใหม่ (ไม่ซ้ำพอสำหรับในหน้าเดียวกัน) */
export const newChildId = (key: string) => `${key}-${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 1000)}`;
