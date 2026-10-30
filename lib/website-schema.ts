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
  canvasShapeHasLine,
  CANVAS_SPEEDS,
  CANVAS_TEXT_BGS,
  CANVAS_WEIGHTS,
  CANVAS_EXPANDS,
  CANVAS_MAX_HEIGHT,
  CANVAS_WIDTHS,
  CANVAS_SFX_FADES,
  CANVAS_SFX_ZOOMS,
  CANVAS_SCENE_INS,
  CANVAS_SCENE_OUTS,
  CANVAS_SCRUB_MAX_FRAMES,
  canvasItemPreset,
  canvasItemSummary,
  validateCanvas,
  validateCanvasFolders,
  folderCanvasStarter,
} from "@/lib/website-canvas";
import { GRAD_DIRS } from "@/lib/website-gradient";
import { CARD_LOOKS, cardLookToSection } from "@/lib/website-card-looks";

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
  | "categoryNames" // ชื่อแทนรายหมวด { รหัสหมวด: ชื่อ } — ตั้งในช่อง categories ของ Section เดียวกัน (✏️ ที่แถว · ต้อง hidden)
  | "productImages" // รูปรายรุ่น { รหัสรุ่น: r2 key } — ตั้งที่แถวของช่อง products ที่มี rowImages (ไม่วาดช่องแยก · ต้อง hidden)
  | "categoryImageLists" // รูปวนรายหมวด { รหัสหมวด: r2 key[] } — ตั้งในช่อง categories ของ Section เดียวกัน (🔁 ที่แถว · ต้อง hidden)
  | "crop" // ส่วนที่เห็นของรูปในกรอบ { x, y, zoom } — ลากกรอบ/ซูม (ImageCropBox) · ต้องตั้ง cropImage (+ cropRatio)
  | "code" // HTML+CSS ที่วางเอง (ล้างด้วย lib/website-html.ts)
  | "datetime" // วันเวลา (เวลาไทย) เก็บ "YYYY-MM-DDTHH:mm" — ช่องกลาง ERPDateTime24
  | "point" // จุดบนรูป { x, y } เป็น % — คลิกบนรูปเพื่อวาง · ต้องตั้ง pointImage
  | "frameShape" // 🖼 ทรงกรอบที่อัปเอง { vb, parts } (เส้นทาง SVG ที่ผ่านตัวกรอง · lib/website-frames) — ตั้งผ่านตัวสร้างกรอบ (hidden)
  | "shopPattern" // 🎨 ลายของร้าน { name, vb, parts+สี } (จาก SVG ที่อัป · lib/website-frames normalizeShopPattern) — ตั้งผ่านคลังของตกแต่ง (hidden)
  | "patternSlots"; // 🎨 สีใหม่ของแต่ละสีในไฟล์ ["" | สีธีม | #rrggbb] (โหมดแยกตามสี · hidden — แผงลายของร้านตั้งให้)

export type FieldGroup = "content" | "media" | "action" | "layout" | "products" | "grid" | "caption" | "fx" | "card";

/** 🎨 ลายของร้าน: เปลี่ยนสีแบบไหน (⚠️ ตรงกับ SHOP_PATTERN_MODES ใน lib/website-frames) */
export const PATTERN_MODE_OPTIONS: FieldOption[] = [
  { v: "orig", l: "สีเดิมของไฟล์" },
  { v: "one", l: "สีเดียวทั้งลาย" },
  { v: "slot", l: "แยกตามสีในไฟล์" },
];

export const FIELD_GROUP_LABEL: Record<FieldGroup, string> = {
  content: "เนื้อหา",
  media: "รูป / สื่อ",
  action: "ปุ่ม / ลิงก์",
  layout: "การจัดวาง",
  products: "สินค้า",
  grid: "🗂 ตารางสินค้าด้านบน",
  caption: "ข้อความประกอบรูป",
  fx: "เอฟเฟกต์ / การเคลื่อนไหว",
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
  /** select: "tiles" = แสดงเป็นปุ่มรูปย่อให้กดเลือก (แทน dropdown) · "font" = ตัวเลือกฟอนต์เห็นหน้าตาจริง (FontSelect · options = CANVAS_FONTS)
   *  · "seg" = ปุ่มเรียงแถว (ตัวเลือกน้อย) · "pos9" = ตาราง 3×3 เลือกตำแหน่ง (options = POS9_OPTIONS เรียงแถวบน→ล่าง ซ้าย→ขวา) */
  display?: "tiles" | "font" | "seg" | "pos9";
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
  /** ตัวเลข/แถบเลื่อน: ทศนิยมกี่ตำแหน่ง (ไม่ตั้ง = จำนวนเต็ม) เช่น วินาที 0.3 */
  decimals?: number;
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
  /** ช่องชนิด image: มีปุ่ม ✂️ ตัดพื้นด้วย AI ในเบราว์เซอร์ (lib/remove-bg · รูปคน) */
  removeBg?: boolean;
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
  /**
   * ช่อง products: 🖼 ตั้งรูปรายรุ่นที่แถว (รูป SKU / อัปโหลด / คลัง / ↺ รูปปก) — images = ช่อง productImages (รูปอัปโหลด/คลัง)
   * · skus = ช่อง skus (เลือกรูปจาก SKU ของรุ่น · รุ่นละ 1) · เอารุ่นออก = ล้างรูปของรุ่นนั้นทั้ง 2 ช่อง
   */
  rowImages?: { images: string; skus: string };
  /** ช่อง select แบบ "ปุ่มชุดสำเร็จรูป": เลือกค่าไหน = ตั้งหลายช่องตาม presets[ค่า] แล้วช่องนี้กลับเป็นค่าเริ่ม (ไม่จำว่าเลือกชุดไหน) */
  presets?: Record<string, Record<string, unknown>>;
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

/** ช่องนี้ "แก้จากค่าเริ่มแล้ว" ไหม (จุดส้มในหน้าใหญ่ · คืนค่าเริ่มต้นรายหมวด)
 *  ยังไม่เคยตั้ง (undefined) = ค่าเริ่ม · ค่าว่าง/false/[] เทียบเท่ากัน */
export function fieldChanged(fd: FieldDef, value: Record<string, unknown>): boolean {
  const v = value[fd.key];
  if (v === undefined) return false;
  const norm = (x: unknown) => (x == null || x === "" || x === false || (Array.isArray(x) && !x.length) ? null : x);
  return JSON.stringify(norm(v)) !== JSON.stringify(norm(fd.default));
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
  /** ชิ้นตั้งต้นตอนวาง Section ใหม่ (แต่ละชิ้นต่างกันได้ · ทับค่าของ blank) — ไม่ใส่ = ชิ้นเปล่าเท่า min */
  starter?: () => Record<string, unknown>[];
  /** ➕ ปุ่มเพิ่มแบบอื่นข้างปุ่ม "+ เพิ่ม<itemLabel>" (เช่น ＋ เพิ่มกรอบ) — preset ทับค่าของ blank · ใช้ ChildAddOption */
  addOptions?: ChildAddOption[];
  /** ป้ายต่อชิ้นตามชนิดของชิ้น (หัวแผงตั้งค่า "<ป้าย>: <สรุป>") — ไม่ใส่ = itemLabel ทุกชิ้น */
  itemLabelOf?: (item: Record<string, unknown>) => string;
}

/** ปุ่มเพิ่มชิ้นย่อยอีกแบบ — label = ชื่อสิ่งที่เพิ่ม (ปุ่มโชว์ "+ เพิ่ม<label>") · preset = ค่าที่ทับชิ้นเปล่า */
export interface ChildAddOption {
  label: string;
  icon?: string;
  preset: () => Record<string, unknown>;
}

/** ชิ้นใหม่ตอนกดปุ่มเพิ่ม: ชิ้นเปล่าตาม schema + preset ของปุ่ม (ถ้ามี) */
export function newChildValues(spec: ChildSpec, option?: ChildAddOption): Record<string, unknown> {
  return { ...blankChild(spec), ...(option ? option.preset() : {}) };
}

/**
 * ⬚ ค่าตำแหน่ง/ขนาดที่ลากมาจากพรีวิว (storefront-child-place {x,y,w,h} = % ของ Section) → ค่าที่ใส่ลงชิ้นได้จริง
 * รับเฉพาะช่องที่ชิ้นชนิดนั้นมี · บีบตามช่วง min/numMax ของช่อง · ปัด 1 ตำแหน่ง · ค่าที่ไม่ใช่ตัวเลข = ไม่แตะ
 */
export function childPlacePatch(spec: ChildSpec, p: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of ["x", "y", "w", "h"]) {
    const fd = spec.fields.find((x) => x.key === k);
    const raw = p[k];
    const v = Number(raw);
    if (fd && raw != null && raw !== "" && Number.isFinite(v)) out[k] = Math.max(fd.min ?? 0, Math.min(fd.numMax ?? 100, Math.round(v * 10) / 10));
  }
  return out;
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
  // 🃏 ชุดหน้าตาสำเร็จรูป (ปุ่มกดทีเดียว) — ค่าชุดเดียวกับ ดีไซน์ → การ์ดสินค้า (lib/website-card-looks) · เลือกแล้วตั้งช่องด้านล่าง + กลับเป็น "—"
  f("cardLook", "ชุดหน้าตาสำเร็จรูป", "select", {
    group: "card",
    default: "",
    wide: true,
    hint: "เลือกแล้วตั้งการ์ดของ Section นี้ให้ทีเดียว (ปรับต่อทีละช่องได้)",
    options: [{ v: "", l: "— เลือกชุด —" }, ...CARD_LOOKS.map((l) => ({ v: l.key, l: l.label }))],
    presets: Object.fromEntries(CARD_LOOKS.map((l) => [l.key, cardLookToSection(l.card)])),
  }),
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
      cardInfo: c.infoLayout === "split" ? "split" : "stack",
      cardSwatchPos: c.swatchPos === "name" ? "name" : "below",
      cardSwatchShape: ["square", "rounded"].includes(String(c.swatchShape)) ? String(c.swatchShape) : "circle",
      cardPriceWeight: ["400", "500", "600", "700"].includes(String(c.priceWeight)) ? String(c.priceWeight) : "600",
      cardNameUpper: c.nameUpper === true,
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
  f("cardInfo", "ชื่อ-ราคา", "select", {
    group: "card",
    default: "stack",
    showIf: [cardOn, fullCard],
    options: [
      { v: "stack", l: "ราคาใต้ชื่อ (แบบเดิม)" },
      { v: "split", l: "ชื่อซ้าย · ราคาขวา บรรทัดเดียว" },
    ],
  }),
  f("cardPriceWeight", "ความหนาราคา", "select", {
    group: "card",
    default: "600",
    showIf: [cardOn, fullCard],
    options: [
      { v: "400", l: "บาง" },
      { v: "500", l: "กลาง" },
      { v: "600", l: "หนา (แบบเดิม)" },
      { v: "700", l: "หนามาก" },
    ],
  }),
  f("cardSwatchPos", "ตำแหน่งจุดสี", "select", {
    group: "card",
    default: "below",
    showIf: [cardOn, fullCard, { key: "cardSwatches", eq: true }],
    options: [
      { v: "below", l: "ใต้ราคา (แบบเดิม)" },
      { v: "name", l: "ขวาของชื่อ (1 ช่อง + จำนวนที่เหลือ)" },
    ],
  }),
  f("cardSwatchShape", "ทรงจุดสี", "select", {
    group: "card",
    default: "circle",
    showIf: [cardOn, fullCard, { key: "cardSwatches", eq: true }],
    options: [
      { v: "circle", l: "วงกลม (แบบเดิม)" },
      { v: "square", l: "สี่เหลี่ยม" },
      { v: "rounded", l: "มุมมน" },
    ],
  }),
  cardToggle("cardNameUpper", "ชื่อตัวพิมพ์ใหญ่ (ชื่ออังกฤษ)", false, undefined, true),
];
/** 🃏 การ์ดในส่วนนี้ ของ Section ที่เป็นตารางการ์ดเต็มอย่างเดียว (ชุดมาใหม่) — ไม่มีช่อง layout → ตัดเงื่อนไข "แบบการ์ดเต็ม" ออก */
const GRID_CARD_FIELDS: FieldDef[] = PRODUCT_CARD_FIELDS.map((fd) => {
  if (fd.showIf === fullCard) return { ...fd, showIf: undefined };
  if (Array.isArray(fd.showIf)) {
    const rest = fd.showIf.filter((c) => c !== fullCard);
    return { ...fd, showIf: rest.length === 1 ? rest[0] : rest };
  }
  return fd;
});
const text =(key: string, label: string, extra: Partial<FieldDef> = {}) => f(key, label, "text", { max: 160, ...extra });
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
  { v: "tabs", l: "แท็บ (หมวด / รุ่น)", sketch: "tabs", hint: "กดแท็บสลับหมวด หรือรุ่นสินค้า" },
  { v: "banner", l: "แบนเนอร์ + สินค้า", sketch: "banner", hint: "รูปแคมเปญ + สินค้าข้างกัน" },
];

/** รูปแบบ "แท็บ" ใช้บนคอมหรือมือถือ (ช่องตั้งค่าแท็บโชว์เมื่อแบบใดแบบหนึ่งเป็นแท็บ) */
const TABS_LAYOUT: ShowIf = { key: "layout", eq: "tabs", orKey: "layoutMobile" };
/** แท็บรุ่นที่มีรูป (รูป+ชื่อ / รูปอย่างเดียว) → ช่องตั้งรูปบนแท็บ */
const TAB_PIC: ShowIf[] = [TABS_LAYOUT, { key: "tabBy", eq: "parent" }, { key: "tabStyle", eq: ["both", "img"] }];

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
/** 📍 ตำแหน่ง 9 จุด (บน/กลาง/ล่าง × ซ้าย/กลาง/ขวา) สำหรับ display "pos9" — "center" = กลางรูป (ค่าเดิม) · ⚠️ ลำดับ = ตาราง 3×3 */
export const POS9_OPTIONS: FieldOption[] = [
  { v: "top-left", l: "บนซ้าย" },
  { v: "top-center", l: "บนกลาง" },
  { v: "top-right", l: "บนขวา" },
  { v: "middle-left", l: "กลางซ้าย" },
  { v: "center", l: "กลางรูป" },
  { v: "middle-right", l: "กลางขวา" },
  { v: "bottom-left", l: "ล่างซ้าย" },
  { v: "bottom-center", l: "ล่างกลาง" },
  { v: "bottom-right", l: "ล่างขวา" },
];
/** 📂 หมวดสินค้า (การ์ดรูปใหญ่): ชื่ออยู่บนรูป / นอกรูป */
const NAME_ON: ShowIf = { key: "namePlace", eq: "on" };
const NAME_OUT: ShowIf = { key: "namePlace", eq: ["above", "below"] };
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
const imageCaptionFields = (opts: { showIf?: ShowIf } = {}): FieldDef[] => {
  const on = { key: "capShow", eq: true };
  const g = { group: "caption" as FieldGroup };
  // เงื่อนไขเพิ่มของทั้งชุด (เช่น แกลเลอรีแบบตารางเท่านั้น — แบบแถวรูปมีชุดข้อความของตัวเอง)
  const extra = opts.showIf;
  const withExtra = (fd: FieldDef): FieldDef => (extra ? { ...fd, showIf: fd.showIf ? [extra, ...(Array.isArray(fd.showIf) ? fd.showIf : [fd.showIf])] : extra } : fd);
  return ([
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
  ] as FieldDef[]).map(withExtra);
};

/**
 * 🖼️ แกลเลอรีแบบ "แถวรูปลุคบุ๊ก" (layout strip) — รูปเล็กเรียงแถว ชี้/แตะรูปไหน รูปนั้นขยาย + เลข (01) + ข้อความ · กดไปลิงก์
 * เว็บร้านวาดที่ src/components/home/GalleryStrip.tsx · ข้อความรายรูปใช้ title / caption / linkText เดียวกับแบบตาราง
 * ข้อความมีชุดตั้งค่าของตัวเอง (strip*) ค่าเริ่ม = ตัวเล็กแบบพิมพ์ดีด ตัวพิมพ์ใหญ่ (แบบรูปอ้างอิง) — ชุด cap* ใช้กับแบบตารางเท่านั้น
 */
const GAL_GRID: ShowIf = { key: "layout", eq: ["grid", "", undefined] };
const GAL_STRIP: ShowIf = { key: "layout", eq: "strip" };
/** แบบที่ชิ้นเป็นวิดีโอได้ (ตาราง + แถบวิดีโอ) */
const GAL_MEDIA: ShowIf = { key: "layout", eq: ["grid", "", undefined, "tabs"] };
const galleryStripFields = (): FieldDef[] => {
  const st = { showIf: GAL_STRIP };
  const cap = { group: "caption" as FieldGroup };
  const capOn: ShowIf[] = [GAL_STRIP, { key: "stripCap", eq: ["top", "bottom", "on"] }];
  return [
    f("stripEffect", "ลักษณะตอนขยาย", "select", {
      group: "layout",
      default: "soft",
      options: [
        { v: "soft", l: "นุ่ม" },
        { v: "bounce", l: "เด้ง" },
        { v: "bend", l: "บิดโค้งนิด ๆ (รูปข้าง ๆ เอียงรับ)" },
        { v: "lens", l: "แว่นขยาย (รูปข้าง ๆ ใหญ่ตามนิดหน่อย)" },
      ],
      ...st,
    }),
    f("stripW", "ขนาดรูปปกติ — จอคอม (px)", "range", { group: "layout", default: 120, min: 60, numMax: 260, step: 10, ...st, hint: "ความกว้างของรูปเล็กแต่ละรูป" }),
    f("stripWMobile", "ขนาดรูปปกติ — มือถือ (px)", "range", { group: "layout", default: 72, min: 40, numMax: 160, step: 4, ...st }),
    f("stripZoom", "ตอนขยาย ใหญ่ขึ้น (%)", "range", { group: "layout", default: 240, min: 130, numMax: 400, step: 10, ...st, hint: "200 = ใหญ่เป็น 2 เท่าของรูปปกติ" }),
    f("stripGap", "ระยะห่างระหว่างรูป (px)", "range", { group: "layout", default: 10, min: 0, numMax: 40, step: 2, ...st }),
    f("stripSpeed", "ความไวตอนขยาย", "select", {
      group: "layout",
      default: "normal",
      options: [
        { v: "fast", l: "เร็ว" },
        { v: "normal", l: "ปกติ" },
        { v: "slow", l: "ช้า นุ่มนวล" },
        { v: "slower", l: "ช้ามาก" },
      ],
      ...st,
    }),
    f("stripStart", "ตอนยังไม่มีใครชี้", "select", {
      group: "layout",
      default: "middle",
      options: [
        { v: "middle", l: "รูปกลางแถวขยายรอไว้ (แบบรูปอ้างอิง)" },
        { v: "first", l: "รูปแรกขยายรอไว้" },
        { v: "none", l: "ทุกรูปเล็กเท่ากัน" },
      ],
      ...st,
      hint: "ขยายรอไว้ = ลูกค้าเห็นข้อความทันที และรู้ว่าชี้/แตะรูปได้ · แบบเลื่อนเอง = ไม่ขยายรอ",
    }),
    // ▶ ขยายเองวน: ไม่มีใครชี้ → รูปถัดไปขยายเองทุก N วินาที (ไม่ใช้กับแบบเลื่อนเอง — แถววิ่งอยู่แล้ว)
    f("stripCycle", "ขยายเองทีละรูป วนไปเรื่อย ๆ (ตอนไม่มีใครชี้)", "toggle", {
      group: "layout",
      default: false,
      wide: true,
      showIf: [GAL_STRIP, { key: "stripMove", eq: ["still", "drag"] }],
      hint: "ชี้/แตะรูป = หยุดวน รูปที่ชี้ขยายแทน · เอาเมาส์ออกแล้ววนต่อจากรูปนั้น · เลื่อนพ้นจอ = หยุด · ลูกค้าที่ตั้งเครื่องให้ลดการเคลื่อนไหว = ไม่วน",
    }),
    f("stripCycleSec", "เปลี่ยนรูปทุก", "select", {
      group: "layout",
      default: "3",
      options: [
        { v: "2", l: "2 วินาที" },
        { v: "3", l: "3 วินาที" },
        { v: "4", l: "4 วินาที" },
        { v: "6", l: "6 วินาที" },
      ],
      showIf: [GAL_STRIP, { key: "stripMove", eq: ["still", "drag"] }, { key: "stripCycle", eq: true }],
    }),
    f("stripFade", "ขอบซ้าย-ขวาค่อย ๆ จางหาย", "toggle", { group: "layout", default: true, ...st }),
    f("stripDim", "รูปอื่นตอนมีรูปขยาย", "select", {
      group: "layout",
      default: "none",
      options: [
        { v: "none", l: "เหมือนเดิม" },
        { v: "fade", l: "จางลง" },
        { v: "gray", l: "ขาวดำ + จางลง" },
      ],
      ...st,
    }),
    f("stripMove", "การเลื่อนแถว", "select", {
      group: "layout",
      default: "still",
      options: [
        { v: "still", l: "อยู่กับที่ (รูปเกินจอ = เลื่อนข้างได้)" },
        { v: "drag", l: "ลากเลื่อนด้วยเมาส์ได้" },
        { v: "auto", l: "เลื่อนเองช้า ๆ วนไม่จบ (หยุดเมื่อชี้)" },
      ],
      wide: true,
      ...st,
      hint: "มือถือปัดเลื่อนได้ทุกแบบ · ลูกค้าที่ตั้งเครื่องให้ลดการเคลื่อนไหว = ไม่เลื่อนเอง",
    }),
    f("stripAutoSpeed", "เลื่อนเองเร็วแค่ไหน", "select", {
      group: "layout",
      default: "normal",
      options: [
        { v: "slow", l: "ช้า" },
        { v: "normal", l: "ปกติ" },
        { v: "fast", l: "เร็ว" },
      ],
      showIf: [GAL_STRIP, { key: "stripMove", eq: "auto" }],
    }),
    f("stripMobile", "มือถือ (ไม่มีเมาส์)", "select", {
      group: "layout",
      default: "tap",
      options: [
        { v: "tap", l: "แตะ 1 ครั้ง = ขยาย · แตะซ้ำ = ไปลิงก์" },
        { v: "center", l: "ปัดแล้วรูปกลางจอขยายเอง · แตะ = ไปลิงก์" },
      ],
      wide: true,
      ...st,
      hint: "แบบรูปกลางจอ ไม่เลื่อนเอง (ลูกค้าปัดเอง)",
    }),
    // ✍️ ข้อความ (เลข + หัวข้อ + คำอธิบาย + ลิงก์ ของรูปที่ขยาย)
    f("stripCap", "ข้อความของรูปที่ขยาย อยู่ตรงไหน", "select", {
      ...cap,
      default: "top",
      options: [
        { v: "top", l: "เหนือรูป (แบบรูปอ้างอิง)" },
        { v: "bottom", l: "ใต้รูป" },
        { v: "on", l: "บนรูป (แถบมืดด้านล่าง)" },
        { v: "none", l: "ไม่มีข้อความ" },
      ],
      ...st,
      hint: "หัวข้อ / คำอธิบาย / ข้อความลิงก์ ใส่ทีละรูป · รูปจากสินค้า = ใช้ชื่อสินค้าถ้าไม่ได้ใส่หัวข้อ",
    }),
    f("stripNum", "เลขลำดับ", "select", {
      ...cap,
      default: "paren",
      options: [
        { v: "paren", l: "(01)" },
        { v: "plain", l: "01" },
        { v: "of", l: "01 / 09" },
        { v: "none", l: "ไม่มีเลข" },
      ],
      showIf: capOn,
    }),
    f("stripAlign", "จัดข้อความ", "select", {
      ...cap,
      default: "left",
      options: [
        { v: "left", l: "ชิดซ้ายของรูป" },
        { v: "center", l: "กึ่งกลางรูป" },
      ],
      showIf: capOn,
    }),
    f("stripFont", "ฟอนต์ข้อความ", "select", {
      ...cap,
      default: "mono",
      options: [{ v: "mono", l: "ตัวพิมพ์ดีด (mono) — แบบรูปอ้างอิง" }, ...CANVAS_FONTS],
      display: "font",
      showIf: capOn,
    }),
    f("stripTextSize", "ขนาดข้อความ", "select", {
      ...cap,
      default: "xs",
      options: [
        { v: "xs", l: "เล็กมาก (แบบรูปอ้างอิง)" },
        { v: "s", l: "เล็ก" },
        { v: "m", l: "กลาง" },
        { v: "l", l: "ใหญ่" },
      ],
      showIf: capOn,
    }),
    f("stripUpper", "ตัวพิมพ์ใหญ่ทั้งหมด (อังกฤษ)", "toggle", { ...cap, default: true, showIf: capOn }),
    f("stripColor", "สีข้อความ", "select", { ...cap, default: "auto", options: [{ v: "auto", l: "อัตโนมัติ (บนรูป = ขาว)" }, ...CANVAS_COLORS], showIf: capOn }),
    f("stripHex", "สีข้อความ (เลือกเอง)", "color", { ...cap, default: "", showIf: [...capOn, { key: "stripColor", eq: "custom" }] }),
    f("stripPrice", "โชว์ราคา (รูปที่เลือกจากสินค้า)", "toggle", { ...cap, default: false, showIf: capOn }),
  ];
};

/**
 * 🎬 แกลเลอรีแบบ "แถบวิดีโอ" (layout tabs · 2026-10-23 · อ้างอิงหน้า Featured work ที่ช่องเรียงเป็นแถบ ชี้ช่องไหนช่องนั้นขยาย)
 *   ช่องที่ขยาย = กว้าง tabsActive% เล่นคลิป (ชิ้นที่ตั้งเป็นวิดีโอ) / โชว์รูป · ที่เหลือแบ่งกันเป็นแถบบาง (ภาพแตกพิกเซล/เบลอ/มืด)
 *   ข้อความ = หัวข้อ/คำอธิบาย/ข้อความลิงก์ ของรูปนั้น (ตัวอักษรสลับวิ่งก่อนขึ้น) + ตัวนับ 01 / 07 · ป้ายติดเมาส์ "[ VIEW FULLSCREEN ]"
 *   มือถือ: แตะแถบ = ขยาย · แตะช่องที่ขยายอยู่ = เปิดเต็มจอ / ไปลิงก์ · เว็บร้าน src/components/home/GalleryTabs.tsx
 */
const GAL_TABS: ShowIf = { key: "layout", eq: "tabs" };
/** 🗂 หน้าตาแฟ้มเอกสาร (tabsLook folder) · แบบเดิม = plain */
const TABS_PLAIN: ShowIf = { key: "tabsLook", eq: ["plain", "", undefined] };
const TABS_FOLDER: ShowIf = { key: "tabsLook", eq: "folder" };
/** ช่องเรียงเป็นแถบข้างกัน = แบบเดิม หรือ แฟ้มแนวตั้ง (แฟ้มแนวนอนกางลงมาแทน ไม่ใช้ช่องพวกนี้) */
const TABS_STRIP: ShowIf = { key: "tabsLook", eq: ["plain", "", undefined, "v"], orKey: "folderDir" };
/** ชุดสีแฟ้ม (เว็บร้าน GalleryTabs FOLDER_PALETTES มิเรอร์) */
export const FOLDER_PALETTES: FieldOption[] = [
  { v: "pastel", l: "พาสเทล 3 สี (ครีม/ชมพู/ฟ้า)" },
  { v: "pink", l: "ชมพูล้วน" },
  { v: "mono", l: "ขาวเทา" },
  { v: "brand", l: "ตามสีแบรนด์ (อ่อน)" },
  { v: "custom", l: "สีเอง…" },
];
/** 🗂 ผืนผ้าใบโหมดแฟ้มซ้อน */
const FOLDER_ON: ShowIf = { key: "folderMode", eq: true };
const FOLDER_COUNTS: FieldOption[] = ["2", "3", "4", "5", "6"].map((v) => ({ v, l: `${v} แฟ้ม` }));
const FOLDER_NUMS: FieldOption[] = ["1", "2", "3", "4", "5", "6"].map((v) => ({ v, l: `แฟ้ม ${v}` }));

/**
 * 🗂 ช่องหน้าตาแฟ้ม (ของกลาง) — แกลเลอรีแถบวิดีโอแบบแฟ้ม + ผืนผ้าใบโหมดแฟ้มซ้อน (แฟ้มวางอิสระ) ใช้ชุดเดียวกัน (คีย์ folder* / cover*)
 * เว็บร้านวาดด้วย CSS ชุดเดียว (.gt[data-look=folder] ใน globals.css)
 */
const folderLookFields = (fo: ShowIf[], opts: { peekIf?: ShowIf[]; labelAuto: string }): FieldDef[] => {
  const cover: ShowIf[] = [...fo, { key: "folderCover", eq: true }];
  return [
    f("folderShape", "ทรงหูแฟ้ม", "select", {
      group: "layout",
      default: "real",
      options: [
        { v: "real", l: "แฟ้มจริง (โค้งเว้า)" },
        { v: "round", l: "มน" },
        { v: "slant", l: "เฉียง" },
        { v: "square", l: "เหลี่ยม" },
      ],
      showIf: fo,
    }),
    f("folderPos", "ตำแหน่งหูแฟ้ม", "select", {
      group: "layout",
      default: "alt",
      options: [
        { v: "alt", l: "สลับซ้ายขวา" },
        { v: "stair", l: "ขั้นบันได" },
        { v: "left", l: "ชิดด้านเดียวกัน" },
      ],
      showIf: fo,
    }),
    f("folderTex", "ลายกระดาษ", "select", {
      group: "layout",
      default: "lines",
      options: [
        { v: "none", l: "ไม่มี (เรียบ)" },
        { v: "lines", l: "เส้นบาง ๆ (แบบตัวอย่าง)" },
        { v: "dots", l: "จุด" },
        { v: "grid", l: "ตาราง" },
        { v: "diag", l: "เส้นเฉียง" },
      ],
      showIf: fo,
    }),
    f("folderShadow", "เงาของแฟ้ม", "range", { group: "layout", default: 2, min: 0, numMax: 3, step: 1, showIf: fo, hint: "0 = ไม่มีเงา · 3 = เงาเข้ม" }),
    f("folderRadius", "มุมมนของแฟ้ม (px)", "range", { group: "layout", default: 14, min: 0, numMax: 28, step: 2, showIf: fo }),
    f("folderPal", "สีแฟ้ม", "select", { group: "layout", default: "pastel", options: FOLDER_PALETTES, showIf: fo, hint: "ตั้งสีแยกทีละแฟ้มได้ (ช่องสีของแฟ้มนั้น)" }),
    f("folderHex", "สีแฟ้ม (เลือกเอง)", "color", { group: "layout", default: "", showIf: [...fo, { key: "folderPal", eq: "custom" }] }),
    f("folderLabel", "ป้ายบนหูแฟ้ม", "select", {
      group: "layout",
      default: "auto",
      options: [
        { v: "auto", l: opts.labelAuto },
        { v: "sticker", l: "สติกเกอร์ขาว" },
        { v: "plain", l: "ตัวหนังสือบนหู" },
      ],
      showIf: fo,
    }),
    f("folderPeek", "ขอบแฟ้มที่หุบอยู่ (px)", "range", { group: "layout", default: 56, min: 32, numMax: 120, step: 4, showIf: opts.peekIf ?? fo, hint: "ความสูงของแฟ้มที่ยังไม่กาง" }),
    f("folderLift", "ดึงแฟ้มขึ้นนิดหนึ่งตอนชี้", "toggle", { group: "layout", default: true, showIf: fo }),
    // 📕 แฟ้มปก — แฟ้มแรกไม่มีของ มีชื่อใหญ่ 2 บรรทัด (ฟอนต์ตรง + ลายมือ) + โลโก้
    f("folderCover", "แฟ้มปก (ชื่อใหญ่ + โลโก้ ก่อนแฟ้มแรก)", "toggle", { group: "content", default: false, wide: true, showIf: fo }),
    text("coverTitle", "แฟ้มปก: ชื่อบรรทัด 1", { default: "", max: 40, placeholder: "เช่น social media", showIf: cover }),
    text("coverTitle2", "แฟ้มปก: คำต่อท้าย (ฟอนต์ที่ 2)", { default: "", max: 40, placeholder: "เช่น designs", showIf: cover }),
    f("coverFont", "แฟ้มปก: ฟอนต์บรรทัด 1", "select", { group: "content", default: "display", options: CANVAS_FONTS, display: "font", showIf: cover }),
    f("coverFont2", "แฟ้มปก: ฟอนต์คำต่อท้าย", "select", { group: "content", default: "Great Vibes", options: CANVAS_FONTS, display: "font", showIf: cover }),
    f("coverSize", "แฟ้มปก: ขนาดชื่อ (px)", "range", { group: "content", default: 56, min: 24, numMax: 120, step: 4, showIf: cover }),
    image("coverLogo", "แฟ้มปก: โลโก้ (ไม่ใส่ก็ได้)", { showIf: cover }),
  ];
};
const galleryTabsFields = (): FieldDef[] => {
  const st = { showIf: GAL_TABS };
  const cap = { group: "caption" as FieldGroup };
  const capOn: ShowIf[] = [GAL_TABS, { key: "tabsCap", eq: ["scramble", "plain"] }];
  const fo: ShowIf[] = [GAL_TABS, TABS_FOLDER];
  return [
    // 🗂 หน้าตา: แบบเดิม (แถบ) / แฟ้มเอกสาร (2026-10-23) — ค่าเริ่ม = แบบเดิม (Section เก่าหน้าตาไม่เปลี่ยน)
    f("tabsLook", "หน้าตา", "select", {
      group: "layout",
      default: "plain",
      wide: true,
      options: [
        { v: "plain", l: "แบบเดิม — แถบเรียงกัน" },
        { v: "folder", l: "🗂 แฟ้มเอกสาร — ขอบแฟ้ม + หูแฟ้มมีป้าย" },
      ],
      ...st,
    }),
    f("folderDir", "ทิศของแฟ้ม", "select", {
      group: "layout",
      default: "h",
      options: [
        { v: "h", l: "แนวนอน — แฟ้มซ้อนลงมา ชี้แล้วกางออก" },
        { v: "v", l: "แนวตั้ง — แฟ้มเรียงข้างกัน ชี้แล้วขยาย" },
      ],
      showIf: fo,
      hint: "แนวนอนเหมาะกับมือถือที่สุด",
    }),
    f("folderMedia", "รูป/คลิปในแฟ้ม", "select", {
      group: "layout",
      default: "pol",
      options: [
        { v: "pol", l: "โพลารอยด์ (กรอบขาวเอียง) + ข้อความ" },
        { v: "full", l: "เต็มแฟ้ม" },
      ],
      showIf: fo,
    }),
    ...folderLookFields(fo, { peekIf: [...fo, { key: "folderDir", eq: "h" }], labelAuto: "อัตโนมัติ (แนวตั้ง = สติกเกอร์ขาว · แนวนอน = ตัวหนังสือบนหู)" }),
    f("tabsH", "ความสูง — จอคอม (px)", "range", { group: "layout", default: 560, min: 280, numMax: 900, step: 20, ...st, hint: "แฟ้มแนวนอน = ความสูงของแฟ้มที่กางอยู่" }),
    f("tabsHMobile", "ความสูง — มือถือ (px)", "range", { group: "layout", default: 420, min: 240, numMax: 720, step: 20, ...st }),
    f("tabsActive", "ช่องที่ขยาย กว้าง (%)", "range", { group: "layout", default: 64, min: 40, numMax: 86, step: 2, showIf: [GAL_TABS, TABS_STRIP], hint: "ที่เหลือแบ่งกันเป็นแถบบาง ๆ" }),
    f("tabsGap", "ระยะห่างระหว่างช่อง (px)", "range", { group: "layout", default: 6, min: 0, numMax: 24, step: 2, showIf: [GAL_TABS, TABS_PLAIN] }),
    f("tabsRadius", "มุมมน (px)", "range", { group: "layout", default: 4, min: 0, numMax: 32, step: 2, showIf: [GAL_TABS, TABS_PLAIN] }),
    f("tabsSliver", "แถบบางที่ยังไม่ถูกชี้", "select", {
      group: "layout",
      default: "pixel",
      options: [
        { v: "pixel", l: "ภาพแตกเป็นพิกเซล (แบบตัวอย่าง)" },
        { v: "blur", l: "เบลอ" },
        { v: "dim", l: "มืดลง" },
        { v: "normal", l: "ภาพปกติ" },
      ],
      showIf: [GAL_TABS, TABS_STRIP],
    }),
    f("tabsSpeed", "ความไวตอนขยาย", "select", {
      group: "layout",
      default: "normal",
      options: [
        { v: "fast", l: "เร็ว" },
        { v: "normal", l: "ปกติ" },
        { v: "slow", l: "ช้า นุ่มนวล" },
      ],
      ...st,
    }),
    f("tabsStart", "ตอนยังไม่มีใครชี้ ขยายช่องไหนรอไว้", "select", {
      group: "layout",
      default: "first",
      options: [
        { v: "first", l: "ช่องแรก" },
        { v: "middle", l: "ช่องกลาง" },
      ],
      ...st,
    }),
    f("tabsCycle", "เปลี่ยนช่องเองวนไปเรื่อย ๆ (ตอนไม่มีใครชี้)", "toggle", {
      group: "layout",
      default: true,
      wide: true,
      ...st,
      hint: "ชี้/แตะ = หยุดวน · เลื่อนพ้นจอ = หยุด · ลูกค้าที่ตั้งเครื่องให้ลดการเคลื่อนไหว = ไม่วน",
    }),
    f("tabsCycleSec", "เปลี่ยนช่องทุก", "select", {
      group: "layout",
      default: "6",
      options: [
        { v: "4", l: "4 วินาที" },
        { v: "6", l: "6 วินาที" },
        { v: "8", l: "8 วินาที" },
        { v: "10", l: "10 วินาที" },
      ],
      showIf: [GAL_TABS, { key: "tabsCycle", eq: true }],
    }),
    f("tabsMobile", "มือถือ เรียงแบบไหน", "select", {
      group: "layout",
      default: "row",
      options: [
        { v: "row", l: "แถวนอนเหมือนจอคอม (แตะแถบ = ขยาย)" },
        { v: "column", l: "เรียงแนวตั้ง — ช่องที่ขยายสูง ที่เหลือเป็นแถบเตี้ย" },
      ],
      wide: true,
      showIf: [GAL_TABS, TABS_PLAIN],
    }),
    f("tabsClick", "กดช่องที่ขยายอยู่", "select", {
      group: "action",
      default: "auto",
      options: [
        { v: "auto", l: "มีลิงก์ = ไปลิงก์ · ไม่มี = เปิดดูเต็มจอ" },
        { v: "full", l: "เปิดดูเต็มจอเสมอ" },
        { v: "link", l: "ไปลิงก์เท่านั้น (ไม่มีลิงก์ = กดไม่ได้)" },
      ],
      wide: true,
      ...st,
      hint: "ลิงก์ = ช่อง \"กดรูปแล้วไปที่\" ของแต่ละรูป · มือถือ: แตะแถบ = ขยายก่อน แตะซ้ำ = ทำตามนี้",
    }),
    text("tabsCursor", "ป้ายที่ติดเมาส์", { group: "action", default: "[ VIEW FULLSCREEN ]", max: 30, ...st, hint: "ว่าง = ไม่มีป้าย · ช่องที่ไปลิงก์ = ใช้ \"ข้อความลิงก์\" ของรูปนั้นแทน (ถ้าใส่ไว้)" }),
    f("tabsCap", "ข้อความของช่องที่ขยาย", "select", {
      ...cap,
      default: "scramble",
      options: [
        { v: "scramble", l: "ตัวอักษรสลับวิ่งก่อนขึ้น (แบบตัวอย่าง)" },
        { v: "plain", l: "ขึ้นธรรมดา" },
        { v: "none", l: "ไม่มีข้อความ" },
      ],
      ...st,
      hint: "หัวข้อ / คำอธิบาย ใส่ทีละรูป · รูปจากสินค้า = ใช้ชื่อสินค้าถ้าไม่ได้ใส่หัวข้อ",
    }),
    f("tabsCapPos", "ข้อความอยู่ตรงไหน", "select", {
      ...cap,
      default: "below",
      options: [
        { v: "below", l: "ใต้แถบ (แบบตัวอย่าง)" },
        { v: "on", l: "บนช่องที่ขยาย (แถบมืดด้านล่าง)" },
      ],
      showIf: [...capOn, TABS_STRIP],
    }),
    f("tabsNum", "ตัวนับ 01 / 07", "toggle", { ...cap, default: true, showIf: [GAL_TABS, TABS_STRIP] }),
    f("tabsFont", "ฟอนต์ข้อความ", "select", {
      ...cap,
      default: "mono",
      options: [{ v: "mono", l: "ตัวพิมพ์ดีด (mono) — แบบตัวอย่าง" }, ...CANVAS_FONTS],
      display: "font",
      ...st,
    }),
    f("tabsUpper", "ตัวพิมพ์ใหญ่ทั้งหมด (อังกฤษ)", "toggle", { ...cap, default: true, ...st }),
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
  /** ของตกแต่งที่เป็นลายในตัว (ไม่ใช่ 🎨 ลายของร้าน — ลายของร้านตั้งสี/เส้นที่แผงลายของร้านแทน) */
  const noPattern = { key: "pattern", eq: [null, undefined] };
  const framed = [isImage, { key: "border", eq: CANVAS_BORDERS_ON }];
  return [
    f("kind", "ชนิดชิ้น", "select", { default: "text", options: CANVAS_KINDS }),
    f("folder", "อยู่แฟ้มที่", "select", { default: "1", options: FOLDER_NUMS, showIfParent: FOLDER_ON, hint: "ผืนแบบแฟ้มซ้อน: ย้ายชิ้นไปแฟ้มอื่นได้ที่นี่" }),

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
    f("color", "สี", "select", { default: "ink", options: CANVAS_COLORS, showIf: [colored, noPattern], hint: "สีตามธีม = เปลี่ยนธีมแล้วเปลี่ยนตาม" }),
    f("colorHex", "สีเอง", "color", { default: "", showIf: [colored, noPattern, { key: "color", eq: "custom" }] }),
    f("bg", "พื้นหลังข้อความ (แถบ)", "select", { default: "none", options: CANVAS_TEXT_BGS, showIf: isText }),
    f("bgHex", "พื้นหลังสีเอง", "color", { default: "", showIf: [isText, { key: "bg", eq: "custom" }] }),
    /* สีไล่ (ข้อความ/ของตกแต่ง): ทิศ + สีที่ 2 (สีแรก = ช่อง "สี") */
    f("grad", "ไล่สี", "select", { default: "", options: [{ v: "", l: "ไม่ไล่ (สีเดียว)" }, ...GRAD_DIRS], showIf: [{ key: "kind", eq: ["text", "shape"] }, noPattern] }),
    f("color2", "สีปลาย (ไล่สี)", "select", { default: "brandSoft", options: CANVAS_COLORS, showIf: [{ key: "kind", eq: ["text", "shape"] }, noPattern, { key: "grad", eq: GRAD_DIRS.map((d) => d.v) }] }),
    f("color2Hex", "สีปลายเอง", "color", { default: "", showIf: [{ key: "kind", eq: ["text", "shape"] }, noPattern, { key: "color2", eq: "custom" }] }),

    /* รูป */
    image("imageKey", "รูป", { showIf: isImage, hint: "PNG พื้นใสก็ได้ (เช่น สติกเกอร์/โลโก้)" }),
    text("alt", "คำบรรยายรูป (Alt)", { group: "media", default: "", max: 200, showIf: isImage, hint: "มีผลกับ SEO" }),
    /* 🎬 วิดีโอ (เล่นวนแบบเงียบ · ปกก่อนเล่น) */
    f("videoKey", "คลิป", "videoFile", { default: null, wide: true, showIf: isVideo, hint: "MP4 / WebM / MOV ถึง 200 MB · เล่นเองแบบเงียบ วนซ้ำ · เลือกจากคลังวิดีโอได้" }),
    image("posterKey", "รูปปกคลิป (ก่อนเล่น)", { showIf: isVideo, hint: "ว่าง = ภาพแรกของคลิป" }),
    f("frame", "ทรงรูป", "select", { group: "media", default: "rect", options: CANVAS_FRAMES, showIf: isMedia }),
    /* 🖼 ทรงที่สร้างเอง (frame = "custom") — ตั้งผ่านตัวสร้างกรอบในแผงขวา ไม่วาดช่องในฟอร์ม */
    f("frameShape", "ทรงกรอบที่อัปเอง", "frameShape", { group: "media", default: null, hidden: true }),
    image("maskKey", "ทรงกรอบจากรูป PNG", { hidden: true }),
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
    f("shape", "ลาย", "select", { default: "bow", options: CANVAS_SHAPES, showIf: [isShape, noPattern] }),
    f("outline", "แบบเส้น (ไม่ทึบ)", "toggle", { default: false, showIf: [isShape, noPattern] }),
    f("strokeWidth", "ความหนาเส้น", "number", { default: 2, min: 1, numMax: 24, showIf: [isShape, noPattern] }),
    /* 🎨 ลายของร้าน (SVG ที่อัป · คัดลอกลายมาที่ชิ้น) — ตั้งสี/เส้นที่แผงลายของร้าน (components/website-shop-pattern) จึงซ่อนในฟอร์ม
       สีพื้น = ช่อง color/colorHex · ไม่เติมพื้น = outline · ความหนาเส้น = strokeWidth (หน่วยผืน) */
    f("pattern", "ลายของร้าน", "shopPattern", { default: null, hidden: true }),
    f("patMode", "สีของลาย", "select", { default: "orig", options: PATTERN_MODE_OPTIONS, hidden: true }),
    // สีเส้นแยก — ลายของร้านตั้งที่แผงลายของร้าน (ซ่อน) · ลายในตัวที่มีพื้น (canvasShapeHasLine) ตั้งที่ฟอร์มนี้ได้ด้วย (2026-10-24)
    f("lineColor", "สีเส้น", "select", { default: "none", options: [{ v: "none", l: "ไม่มีเส้น" }, ...CANVAS_COLORS], showIf: [isShape, noPattern, { key: "shape", eq: CANVAS_SHAPES.map((o) => o.v).filter(canvasShapeHasLine) }] }),
    f("lineColorHex", "สีเส้นเอง", "color", { default: "", showIf: [isShape, noPattern, { key: "lineColor", eq: "custom" }] }),
    f("patSlots", "สีแยกตามสีในไฟล์", "patternSlots", { default: [], hidden: true }),

    /* 🛍 สินค้าในรูป/คลิป (2026-10-21 · ลุคบุ๊กแบบวางอิสระ) — กดชิ้นบนเว็บ = การ์ดสินค้าเด้ง (ชนะ "กดแล้วไปที่") */
    f("products", "สินค้าในรูปนี้ (กดรูปแล้วการ์ดสินค้าเด้ง)", "products", { group: "action", max: CANVAS_SHOP_MAX, wide: true, showIf: isMedia, hint: "หลายตัว = การ์ดเลื่อนดูได้ ‹ 1/3 › · มีสินค้า = กดรูปแล้วการ์ดเด้ง (ไม่ไปลิงก์)" }),
    f("shopIcon", "ไอคอน 🛍 มุมรูป (บอกว่ากดซื้อได้)", "toggle", { group: "action", default: true, showIf: isMedia }),
    /* 🔍 กดรูป/คลิปแล้วขยาย (2026-10-21 · เว็บร้าน CanvasStory / lib/canvas-expand) — ชนะการ์ดสินค้าและลิงก์ธรรมดา */
    f("expand", "กดแล้วขยาย", "select", {
      group: "action",
      default: "",
      options: CANVAS_EXPANDS,
      showIf: isMedia,
      hint: "เต็มจอ = รูปขยายเต็มจอแล้วเปลี่ยนไปหน้าที่ตั้งใน \"กดแล้วไปที่\" · ครึ่งจอ = รูปขยายครึ่งซ้าย เนื้อหา/สินค้าในรูปขึ้นฝั่งขวา",
    }),
    text("expTitle", "เรื่องราว: หัวข้อ", { group: "action", default: "", max: 120, showIf: [isMedia, { key: "expand", eq: "story" }], hint: "ว่าง = ใช้คำบรรยายรูป (Alt)" }),
    area("expText", "เรื่องราว: ข้อความ", { group: "action", default: "", max: 1500, showIf: [isMedia, { key: "expand", eq: "story" }] }),
    text("expCta", "เรื่องราว: ข้อความบนปุ่ม", { group: "action", default: "", max: 40, showIf: [isMedia, { key: "expand", eq: "story" }], hint: "ปุ่มพาไปที่ \"กดแล้วไปที่\" (ไม่ตั้งลิงก์ = ไม่มีปุ่ม) · ว่าง = ดูเพิ่มเติม" }),
    /* ลิงก์ (ทุกชนิด) */
    f("href", "กดแล้วไปที่", "target", { group: "action", default: "", wide: true }),
    f("newTab", "เปิดในแท็บใหม่", "toggle", { group: "action", default: false }),

    /* ตำแหน่ง/ขนาด — ลากในพรีวิวแทนได้ */
    f("x", "ซ้าย (X)", "number", { group: "layout", default: 100, min: -1200, numMax: 2400 }),
    f("y", "บน (Y)", "number", { group: "layout", default: 100, min: -600, numMax: CANVAS_MAX_HEIGHT + 1200 }),
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
    /* 🌀 ขยับตามการเลื่อนจอ (เว็บร้าน src/lib/canvas-scroll.ts) — มือถือขยับครึ่งเดียว · พรีวิวไม่ขยับจนกด "🌀 ลองเลื่อนดู" ในหน้าแก้เต็มจอ */
    f("sfxSpeed", "ตอนเลื่อนจอ: ความเร็ว (ลบ = ช้ากว่า ลอยค้าง · บวก = เร็วกว่า)", "range", { group: "layout", default: 0, min: -100, numMax: 100, step: 5, hint: "0 = เลื่อนไปพร้อมหน้าเว็บตามปกติ" }),
    f("sfxFade", "ตอนเลื่อนจอ: จาง", "select", { group: "layout", default: "", options: CANVAS_SFX_FADES }),
    f("sfxZoom", "ตอนเลื่อนจอ: ซูม", "select", { group: "layout", default: "", options: CANVAS_SFX_ZOOMS }),
    f("sfxRotate", "ตอนเลื่อนจอ: หมุน (องศาต่อการเลื่อน 1 จอ)", "range", { group: "layout", default: 0, min: -90, numMax: 90, step: 5 }),
    f("sfxPin", "ตอนเลื่อนจอ: ค้างอยู่กับที่จนเลื่อนพ้นผืน", "toggle", { group: "layout", default: false, hint: "เหมาะกับหัวข้อตัวใหญ่ด้านหลัง · มือถือแบบเรียงอัตโนมัติจะไม่ค้าง" }),
    /* 🎬 ในฉากค้าง (ผืนเปิด "ฉากค้าง") — ช่วงเป็น % ของฉาก · ภาพทีละเฟรมตั้งจากปุ่ม "เตรียมคลิปให้เลื่อนลื่น" (ไม่ต้องกรอก) */
    f("scIn", "ในฉากค้าง: ท่าเข้า", "select", { group: "layout", default: "", options: CANVAS_SCENE_INS, hint: "สว่างทีละคำ = ข้อความ · ขยายเต็มจอ = รูป/คลิป · เล่นตามการเลื่อน = คลิป" }),
    f("scFrom", "ในฉากค้าง: เข้าเริ่มที่ (%)", "range", { group: "layout", default: 0, min: 0, numMax: 99, showIf: { key: "scIn", eq: CANVAS_SCENE_INS.map((o) => o.v).filter(Boolean) } }),
    f("scTo", "ในฉากค้าง: เข้าเสร็จที่ (%)", "range", { group: "layout", default: 30, min: 1, numMax: 100, showIf: { key: "scIn", eq: CANVAS_SCENE_INS.map((o) => o.v).filter(Boolean) } }),
    f("scOut", "ในฉากค้าง: ท่าออก", "select", { group: "layout", default: "", options: CANVAS_SCENE_OUTS }),
    f("scOutFrom", "ในฉากค้าง: ออกเริ่มที่ (%)", "range", { group: "layout", default: 85, min: 0, numMax: 99, showIf: { key: "scOut", eq: CANVAS_SCENE_OUTS.map((o) => o.v).filter(Boolean) } }),
    f("scOutTo", "ในฉากค้าง: ออกหมดที่ (%)", "range", { group: "layout", default: 100, min: 1, numMax: 100, showIf: { key: "scOut", eq: CANVAS_SCENE_OUTS.map((o) => o.v).filter(Boolean) } }),
    text("scrubKey", "ภาพทีละเฟรม (ระบบตั้งให้)", { group: "layout", default: "", max: 120, i18n: false, hidden: true }),
    f("scrubCount", "จำนวนเฟรม (ระบบตั้งให้)", "number", { group: "layout", default: 0, min: 0, numMax: CANVAS_SCRUB_MAX_FRAMES, hidden: true }),
    f("scrubExt", "ชนิดภาพเฟรม (ระบบตั้งให้)", "select", { group: "layout", default: "webp", options: [{ v: "webp", l: "webp" }, { v: "jpg", l: "jpg" }], hidden: true }),
    text("scrubFor", "เตรียมเฟรมจากคลิป (ระบบตั้งให้)", { group: "layout", default: "", max: 300, i18n: false, hidden: true }),
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

/** ✨ สไลด์โชว์ — ชุดเอฟเฟกต์สำเร็จรูป (กดทีเดียวตั้ง การเปลี่ยน/ซูม/ข้อความ/ปุ่ม/ตัวบอก · ไม่แตะรูป ข้อความ รูปทรง เวลาต่อสไลด์ สี) */
const SLIDE_FX_BASE: Record<string, unknown> = { transition: "fade", speed: "normal", kenBurns: "off", vignette: false, grain: false, textReveal: "together", drag: false, arrows: "always", arrowStyle: "circle", indicator: "dots" };
export const SLIDE_FX_PRESETS: { v: string; l: string; hint: string; set: Record<string, unknown> }[] = [
  { v: "orig", l: "แบบเดิม", hint: "จางเข้า · ปุ่มวงกลม · จุด", set: SLIDE_FX_BASE },
  { v: "luxe", l: "หรูเงียบ", hint: "จาง + ซูมออกช้า · รูปซูมเข้าช้า ๆ · ขอบมืด · ข้อความไล่โผล่ · ลูกศรเส้นบาง · ขีดนับเวลา", set: { ...SLIDE_FX_BASE, transition: "fadezoom", speed: "slow", kenBurns: "in", vignette: true, textReveal: "stagger", drag: true, arrows: "hover", arrowStyle: "thin", indicator: "stories" } },
  { v: "edit", l: "แฟชั่นจัด", hint: "ม่านเปิด · ซูม/แพนสลับ · เกรนฟิล์ม · เคอร์เซอร์ตามเมาส์ · เลข 01/05", set: { ...SLIDE_FX_BASE, transition: "curtain", kenBurns: "mix", grain: true, textReveal: "stagger", drag: true, arrows: "cursor", indicator: "counter" } },
  { v: "mag", l: "นิตยสาร", hint: "เลื่อนซ้อนชั้นช้า ๆ · แพนข้าง · ลูกศรเส้นบาง · เลข 01/05", set: { ...SLIDE_FX_BASE, transition: "parallax", speed: "slow", kenBurns: "pan", textReveal: "stagger", drag: true, arrowStyle: "thin", indicator: "counter" } },
  { v: "mini", l: "มินิมอล", hint: "เบลอเปลี่ยน · ลูกศรเส้นบางตอนชี้ · รูปย่อใต้สไลด์", set: { ...SLIDE_FX_BASE, transition: "blur", textReveal: "stagger", drag: true, arrows: "hover", arrowStyle: "thin", indicator: "thumbs" } },
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
      // 🎨 สีแถบ + ⏳ นับถอยหลัง (ชุด 3 · เว็บร้าน AnnouncementBar) — ค่าเริ่ม = แถบเข้ม ไม่นับถอยหลัง (เหมือนเดิม)
      f("bg", "สีแถบ", "select", {
        group: "layout",
        default: "ink",
        options: [
          { v: "ink", l: "เข้ม (แบบเดิม)" },
          { v: "brand", l: "สีหลักของร้าน" },
          { v: "sale", l: "แดงโปร (สีราคาลด)" },
          { v: "custom", l: "เลือกสีเอง" },
        ],
      }),
      f("bgColor", "สีแถบ (เลือกเอง)", "color", { group: "layout", default: "", showIf: { key: "bg", eq: "custom" } }),
      f("countdown", "⏳ นับถอยหลังในแถบ (แทนข้อความประกาศจนกว่าจะครบเวลา)", "toggle", { default: false, wide: true }),
      f("countdownAt", "นับถอยหลังถึง (เวลาไทย)", "datetime", { default: "", wide: true, showIf: { key: "countdown", eq: true } }),
      text("countdownText", "ข้อความตอนนับ ({time} = เวลาที่เหลือ)", { default: "Flash Sale ลด 30% · จบใน {time}", max: 120, wide: true, showIf: { key: "countdown", eq: true }, placeholder: "เช่น โปร 11.11 จบใน {time}" }),
      f("afterEnd", "ครบเวลาแล้ว", "select", {
        default: "hide",
        showIf: { key: "countdown", eq: true },
        options: [
          { v: "hide", l: "ซ่อนแถบ" },
          { v: "text", l: "เปลี่ยนเป็นข้อความอื่น" },
        ],
      }),
      text("afterText", "ข้อความหลังครบเวลา (ว่าง = กลับไปข้อความประกาศ)", { default: "", max: 120, wide: true, showIf: [{ key: "countdown", eq: true }, { key: "afterEnd", eq: "text" }] }),
    ],
    summary: (b) => String(b.countdown ? "⏳ " + String(b.countdownText ?? "").replace("{time}", "…") : ((b.messages as string[]) ?? []).filter(Boolean).join(" · ")).slice(0, 70) || "ยังไม่มีข้อความ",
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
        numMax: CANVAS_MAX_HEIGHT,
        step: 10,
        hint: "หน่วยเดียวกับตำแหน่งชิ้น (ผืนกว้าง 1200) · ลากแถบใต้ผืนในพรีวิวก็ได้",
      }),
      f("width", "ความกว้างผืน (คอม)", "select", {
        group: "layout",
        default: "normal",
        options: CANVAS_WIDTHS.map(({ v, l }) => ({ v, l })),
        hint: "กว้างขึ้น = ทุกชิ้นขยายตามจอ (ตำแหน่งที่จัดไว้ไม่เพี้ยน · จอใหญ่ตัวหนังสือใหญ่ตาม) · มือถือไม่มีผล",
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
      /* 🗂 แฟ้มซ้อน (แฟ้มวางอิสระ · 2026-10-23) — ผืนแบ่งเป็นแฟ้มซ้อนกัน แต่ละแฟ้มมีชิ้นของตัวเอง (ช่อง "อยู่แฟ้มที่" ของชิ้น)
         เว็บร้าน src/components/home/CanvasFolders.tsx · หน้าตาแฟ้ม = ชุดเดียวกับแกลเลอรีแบบแฟ้ม (folderLookFields) · คลังมีการ์ด "🗂 แฟ้มวางอิสระ" (SECTION_PRESETS) */
      f("folderMode", "🗂 แฟ้มซ้อน — แบ่งเป็นแฟ้ม แต่ละแฟ้มวางของอิสระ", "toggle", {
        group: "layout",
        default: false,
        wide: true,
        hint: "แฟ้มซ้อนกันลงมา ชี้/แตะแฟ้มไหน แฟ้มนั้นกางออก · ชิ้นอยู่แฟ้มไหน = ช่อง \"อยู่แฟ้มที่\" ของชิ้น (ชิ้นใหม่ลงแฟ้มที่เปิดอยู่ในพรีวิว) · ความสูงผืน = ความสูงแฟ้มที่กาง",
      }),
      f("folderCount", "จำนวนแฟ้ม", "select", { group: "layout", default: "3", options: FOLDER_COUNTS, showIf: FOLDER_ON }),
      f("folderOpen", "เปิดแฟ้มเมื่อ", "select", {
        group: "layout",
        default: "hover",
        options: [
          { v: "hover", l: "ชี้เมาส์ (มือถือแตะ)" },
          { v: "click", l: "กดหูแฟ้ม" },
        ],
        showIf: FOLDER_ON,
        hint: "ตัวจัดหน้า: กดหูแฟ้มเพื่อสลับแฟ้มเสมอ",
      }),
      f("folderStart", "แฟ้มที่กางรอไว้", "select", { group: "layout", default: "1", options: FOLDER_NUMS, showIf: FOLDER_ON }),
      ...([1, 2, 3, 4, 5, 6] as const).flatMap((n) => {
        const on: ShowIf[] = [FOLDER_ON, { key: "folderCount", eq: FOLDER_COUNTS.map((o) => o.v).filter((v) => Number(v) >= n) }];
        return [
          text(`folder${n}Label`, `แฟ้ม ${n}: ป้ายบนหู`, { group: "layout", default: "", max: 30, placeholder: "เช่น TO DO LIST · ว่าง = เลขแฟ้ม", showIf: on }),
          f(`folder${n}Color`, `แฟ้ม ${n}: สี`, "color", { group: "layout", default: "", showIf: on, hint: "ว่าง = ใช้ชุดสี" }),
        ];
      }),
      ...folderLookFields([FOLDER_ON], { labelAuto: "อัตโนมัติ (ตัวหนังสือบนหู)" }),
      /* 🎬 ฉากค้าง (แบบเว็บ Apple · เว็บร้าน src/lib/canvas-scene.ts) — ท่าต่อชิ้นอยู่ที่ช่อง sc* ของชิ้น */
      f("scene", "🎬 ฉากค้าง (แบบ Apple)", "toggle", {
        group: "layout",
        default: false,
        hint: "ผืนค้างบนจอระหว่างเลื่อน แล้วชิ้นเล่นท่าทีละจังหวะ · มือถือแบบเรียงอัตโนมัติ = ไม่ค้าง (เลือกจัดเองบนมือถือถ้าอยากให้ค้าง) · ตั้งท่าต่อชิ้นในหน้าแก้เต็มจอ",
      }),
      f("sceneLen", "ความยาวฉาก (% ของความสูงจอ)", "range", {
        group: "layout",
        default: 200,
        min: 50,
        numMax: 800,
        step: 10,
        hint: "ต้องเลื่อนเท่านี้ฉากถึงจบ (200 = เลื่อน 2 จอ) · ยาว = ท่าช้าลง",
        showIf: { key: "scene", eq: true },
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
    validate: (b, label) => [...validateCanvas(b, label), ...validateCanvasFolders(b, label)],
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

  // 🖼️ แกลเลอรีรูป — 2 แบบ: ตาราง (แบบเดิม) · แถวรูปชี้แล้วขยาย (ลุคบุ๊ก 2026-10-21 · อ้างอิง RUE STUDIO "Explore FF24")
  //   เว็บร้าน: GalleryBlockView.tsx (ตาราง) · GalleryStrip.tsx (แถวรูป) · รายรูปเลือกสินค้าได้ (code) = ใช้รูปแรก/ชื่อ/ลิงก์ของสินค้า
  gallery: {
    type: "gallery",
    meta: { label: "แกลเลอรีรูป", icon: "🖼️", hint: "หลายรูปเรียงเป็นตาราง · หรือแถวรูปลุคบุ๊ก ชี้แล้วรูปขยาย กดไปลิงก์", group: "พื้นฐาน" },
    fields: [
      ...headFields({ title: "แกลเลอรี" }),
      f("layout", "รูปแบบ", "select", {
        group: "layout",
        default: "grid",
        wide: true,
        options: [
          { v: "grid", l: "ตารางรูป (แบบเดิม)" },
          { v: "strip", l: "แถวรูปลุคบุ๊ก — ชี้แล้วรูปขยาย + ข้อความ" },
          { v: "tabs", l: "แถบวิดีโอ — ช่องที่ชี้ขยายใหญ่ (เล่นคลิป) ที่เหลือเป็นแถบบาง" },
        ],
        hint: "แถวรูป = รูปเล็กเรียงแถวกลางจอ ชี้/แตะรูปไหน รูปนั้นขยายพร้อมเลข (01) + ข้อความ กดแล้วไปลิงก์ · แนะนำสัดส่วนรูปแนวตั้ง 3:4 หรือ 2:3 · แถบวิดีโอ = ใส่ชิ้นเป็น 🎬 วิดีโอ (ใส่รูปปกด้วย = แถบบางคมสวย) 4–8 ช่องกำลังดี",
      }),
      f("columns", "จำนวนคอลัมน์ (จอคอม)", "number", { group: "layout", default: 3, min: 1, numMax: 6, showIf: GAL_GRID }),
      ...imageLookFields({ ratio: "1:1", allowAuto: true, ratioHint: "ตัดรูปเป็นสัดส่วนนี้ — เลือกส่วนที่เห็น/ซูมได้ทีละรูป (กดที่รูปในพรีวิว/ต้นไม้) · แถวรูป: ตามรูปจริง = 3:4" }),
      f("gap", "ระยะห่างระหว่างรูป", "select", {
        group: "layout",
        default: "md",
        options: [
          { v: "none", l: "ชิดกัน" },
          { v: "sm", l: "น้อย" },
          { v: "md", l: "กลาง" },
          { v: "lg", l: "มาก" },
        ],
        showIf: GAL_GRID,
      }),
      f("fullBleed", "รูปเต็มความกว้างจอ", "toggle", { group: "layout", default: false, hint: "รูปยืดเต็มจอ (หัวข้อยังอยู่ในกรอบปกติ)" }),
      f("hoverZoom", "ชี้แล้วรูปขยายนิด ๆ", "toggle", { group: "layout", default: true, showIf: GAL_GRID }),
      // 🔁 รูปมากกว่าจำนวนคอลัมน์ → โชว์แถวเดียว แล้วเปลี่ยนรูปเองทุก x วิ (เว็บร้าน GalleryRotator) · หยุดตอนชี้/เลื่อนพ้นจอ
      f("rotate", "เปลี่ยนรูปเอง (รูปมากกว่าจำนวนคอลัมน์)", "select", {
        group: "layout",
        default: "off",
        options: [
          { v: "off", l: "ไม่เปลี่ยน — โชว์ทุกรูปเรียงหลายแถว (แบบเดิม)" },
          { v: "slide", l: "เลื่อนเป็นสไลด์ — ไปทีละรูป วนต่อเนื่อง" },
          { v: "one", l: "ทีละช่อง สลับกัน" },
          { v: "all", l: "ทั้งแถวพร้อมกัน" },
        ],
        showIf: GAL_GRID,
        hint: "โชว์แถวเดียว ที่เหลือหมุนเวียนเข้ามาเอง · ชี้เมาส์ค้าง/เลื่อนพ้นจอ = หยุด",
      }),
      f("rotateFx", "ท่าเปลี่ยนรูป", "select", {
        group: "layout",
        default: "fade",
        options: [
          { v: "fade", l: "จางเข้า" },
          { v: "up", l: "เลื่อนขึ้น" },
          { v: "zoom", l: "ซูมเข้า" },
        ],
        showIf: [GAL_GRID, { key: "rotate", eq: ["one", "all"] }],
      }),
      f("rotateSec", "เปลี่ยนทุก (วินาที)", "number", { group: "layout", default: 3, min: 2, numMax: 15, showIf: [GAL_GRID, { key: "rotate", eq: ["slide", "one", "all"] }] }),
      ...galleryStripFields(),
      ...galleryTabsFields(),
      ...imageCaptionFields({ showIf: GAL_GRID }),
    ],
    children: {
      key: "items",
      label: "รูปในแกลเลอรี",
      itemLabel: "รูป",
      icon: "🏞️",
      max: 24,
      fields: [
        f("code", "ใช้รูปจากสินค้า (ไม่บังคับ)", "products", {
          group: "media",
          max: 1,
          wide: true,
          hint: "เลือกสินค้า = ใช้รูปแรก + ชื่อ + ลิงก์ไปหน้าสินค้าให้เอง · ใส่รูป/หัวข้อ/ลิงก์ด้านล่างเอง = ใช้ของที่ใส่แทน",
        }),
        // 🎬 รูป หรือ วิดีโอ (แบบตาราง + แถบวิดีโอ) — วิดีโอเล่นวนเงียบ ๆ เฉพาะตอนเห็นบนจอ · รูปด้านล่าง = รูปปกตอนคลิปยังไม่เล่น
        f("media", "ชนิด", "select", {
          group: "media",
          default: "image",
          options: [
            { v: "image", l: "🖼 รูป" },
            { v: "video", l: "🎬 วิดีโอ" },
          ],
          showIfParent: GAL_MEDIA,
        }),
        f("videoKey", "คลิปวิดีโอ", "videoFile", { group: "media", default: null, showIf: { key: "media", eq: "video" }, showIfParent: GAL_MEDIA, hint: "เล่นวนเงียบ ๆ เฉพาะตอนเห็นบนจอ · แบบตาราง = MP4 แนวเดียวกับสัดส่วนรูปของ Section · แถบวิดีโอ = คลิปแนวนอน/แนวตั้งก็ได้ (ครอปให้เต็มช่อง)" }),
        image("imageKey", "รูป", { hint: "ถ้าเป็นวิดีโอ = รูปปกตอนคลิปยังไม่เล่น (ไม่ใส่ก็ได้)" }),
        f("crop", "ส่วนที่เห็น / ซูม", "crop", { group: "media", default: { x: 50, y: 50, zoom: 100 }, wide: true, cropImage: "imageKey", cropRatio: "ratio", showIf: { key: "media", eq: ["image", "", undefined] } }),
        text("alt", "คำบรรยายรูป (Alt)", { default: "", max: 200 }),
        text("title", "หัวข้อใต้รูป", { default: "", max: 120, wide: true, hint: "หน้าตา/ตำแหน่ง ตั้งที่ Section แกลเลอรี → ข้อความประกอบรูป" }),
        area("caption", "คำอธิบายใต้รูป", { default: "", max: 300 }),
        f("href", "กดรูปแล้วไปที่", "target", { group: "action", default: "", hint: "ว่าง = กดไม่ได้" }),
        text("linkText", "ข้อความลิงก์ใต้รูป", { group: "action", default: "", max: 40, placeholder: "เช่น ดูสินค้า →", hint: "โชว์เมื่อตั้ง \"กดรูปแล้วไปที่\" แล้ว · ว่าง = ไม่มีลิงก์ใต้รูป" }),
        // 🗂 แฟ้มเอกสาร (แถบวิดีโอ หน้าตาแฟ้ม): ป้ายบนหูแฟ้มแยกจากหัวข้อ + สีแฟ้มรายช่อง
        text("tabLabel", "ป้ายบนหูแฟ้ม", { default: "", max: 30, placeholder: "ว่าง = ใช้หัวข้อ", showIfParent: [GAL_TABS, TABS_FOLDER] }),
        f("folderColor", "สีแฟ้มช่องนี้", "color", { group: "layout", default: "", showIfParent: [GAL_TABS, TABS_FOLDER], hint: "ว่าง = ใช้ชุดสีของ Section" }),
      ],
      summary: (it) => {
        const code = Array.isArray(it.code) && it.code.length ? String(it.code[0]) : "";
        const video = it.media === "video";
        if (video && !it.videoKey) return "🎬 ยังไม่ใส่คลิป";
        if (!video && !it.imageKey && !code) return "ยังไม่เลือกรูป";
        return `${video ? "🎬 " : ""}${s(it.title) || s(it.caption) || s(it.alt) || (code ? `🛍 ${code}` : video ? "วิดีโอ" : "รูป")}`;
      },
    },
    summary: (b) =>
      `${b.layout === "strip" ? "แถวรูปลุคบุ๊ก · " : b.layout === "tabs" ? "🎬 แถบวิดีโอ · " : b.rotate && b.rotate !== "off" ? `🔁 ทุก ${Number(b.rotateSec) || 3} วิ · ` : ""}${count(arr(b.items).length, "รูป")}`,
    validate: (b, label) => {
      const hasCode = (i: Record<string, unknown>) => Array.isArray(i.code) && i.code.length > 0;
      const withImg = arr(b.items).filter((i) => i.imageKey || hasCode(i) || (i.media === "video" && i.videoKey));
      if (!withImg.length) return [{ level: "error", message: `${label}: ยังไม่มีรูปในแกลเลอรี` }];
      const out: Omit<ValidationIssue, "blockId">[] = [];
      if (b.layout === "tabs" && withImg.length < 2) out.push({ level: "warning", message: `${label}: แถบวิดีโอต้องมีอย่างน้อย 2 ช่อง (ตอนนี้ ${withImg.length})` });
      // เปลี่ยนรูปเอง แต่รูปไม่เกินจำนวนคอลัมน์ = ไม่มีรูปให้หมุนเวียน (แบบตารางเท่านั้น)
      if (b.layout !== "strip" && b.layout !== "tabs" && b.rotate && b.rotate !== "off" && withImg.length <= (Number(b.columns) || 3))
        out.push({ level: "warning", message: `${label}: ตั้งเปลี่ยนรูปเองไว้ แต่มีรูปไม่เกินจำนวนคอลัมน์ (${withImg.length} รูป) — เพิ่มรูปอีกถึงจะหมุนเวียน` });
      // รูปจากสินค้า = ใช้ชื่อสินค้าเป็นคำบรรยายให้เอง
      if (withImg.some((i) => !hasCode(i) && !s(i.alt))) out.push({ level: "warning", message: `${label}: บางรูปยังไม่มีคำบรรยาย (Alt)` });
      return out;
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
      f("autoplay", "เลื่อนเองอัตโนมัติ", "toggle", { group: "layout", default: true, hint: "เอาเมาส์ชี้ / เลื่อนพ้นจอ = หยุด" }),
      f("interval", "เวลาต่อสไลด์ (วินาที)", "number", { group: "layout", default: 5, min: 2, numMax: 20, showIf: { key: "autoplay", eq: true } }),
      f("arrows", "ปุ่มเลื่อน ‹ ›", "select", {
        group: "layout",
        default: "always",
        options: [
          { v: "always", l: "โชว์ตลอด (แบบเดิม)" },
          { v: "hover", l: "โผล่ตอนชี้เมาส์" },
          { v: "cursor", l: "เคอร์เซอร์วงกลมตามเมาส์ (คอม)" },
          { v: "none", l: "ไม่มี (ปัดนิ้ว / กดตัวบอก)" },
        ],
      }),
      f("arrowStyle", "หน้าตาปุ่มเลื่อน", "select", {
        group: "layout",
        default: "circle",
        options: [
          { v: "circle", l: "วงกลม ‹ › (แบบเดิม)" },
          { v: "thin", l: "ลูกศรเส้นบาง ขยับตอนชี้" },
        ],
        showIf: { key: "arrows", eq: ["always", "hover"] },
      }),
      f("indicator", "ตัวบอกตำแหน่ง", "select", {
        group: "layout",
        default: "dots",
        options: [
          { v: "dots", l: "จุด (แบบเดิม)" },
          { v: "lines", l: "ขีด" },
          { v: "number", l: "ตัวเลข 1 / 5" },
          { v: "progress", l: "แถบเวลา" },
          { v: "stories", l: "ขีดนับเวลา (แบบสตอรี่)" },
          { v: "counter", l: "เลข 01 / 05 + เส้นเวลา" },
          { v: "thumbs", l: "รูปย่อใต้สไลด์" },
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
        // มีปุ่มเลื่อน หรือ มีตัวบอกบนรูป (ค่าของ 2 ช่องไม่ซ้ำกัน ยกเว้น none · รูปย่ออยู่ใต้สไลด์ ไม่ใช้สีนี้)
        showIf: { key: "arrows", eq: ["always", "hover", "cursor", "dots", "lines", "number", "progress", "stories", "counter"], orKey: "indicator" },
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
      // ✨ เอฟเฟกต์ / การเคลื่อนไหว (2026-10-29) — เว็บร้าน .ss-lay / .ss-kb-* / .ss-rise ฯลฯ ใน globals.css · ค่าเริ่ม = หน้าตาเดิม
      f("fxPreset", "ชุดสำเร็จรูป", "select", {
        group: "fx",
        default: "",
        wide: true,
        display: "seg",
        hint: "กดแล้วตั้งช่องข้างล่าง + ปุ่ม/ตัวบอก ให้ทีเดียว (ไม่แตะรูป ข้อความ รูปทรง เวลา สี) · ปรับต่อทีละช่องได้",
        options: SLIDE_FX_PRESETS.map((p) => ({ v: p.v, l: p.l, hint: p.hint })),
        presets: Object.fromEntries(SLIDE_FX_PRESETS.map((p) => [p.v, p.set])),
      }),
      f("transition", "แบบเปลี่ยนสไลด์", "select", {
        group: "fx",
        default: "fade",
        options: [
          { v: "fade", l: "จางเข้า (แบบเดิม)" },
          { v: "slide", l: "เลื่อนข้าง" },
          { v: "zoom", l: "จาง + ซูมช้า ๆ" },
          { v: "peek", l: "เลื่อนข้าง เห็นขอบสไลด์ข้าง ๆ" },
          { v: "fadezoom", l: "จาง + ซูมออกนุ่ม" },
          { v: "curtain", l: "ม่านเปิด" },
          { v: "circle", l: "วงกลมขยาย" },
          { v: "parallax", l: "เลื่อนซ้อนชั้น" },
          { v: "blur", l: "เบลอเปลี่ยน" },
        ],
      }),
      f("speed", "ความเร็วตอนเปลี่ยน", "select", {
        group: "fx",
        default: "normal",
        display: "seg",
        options: [
          { v: "fast", l: "เร็ว" },
          { v: "normal", l: "ปกติ (แบบเดิม)" },
          { v: "slow", l: "ช้า" },
          { v: "slower", l: "ช้ามาก" },
        ],
      }),
      f("kenBurns", "ตอนอยู่นิ่ง: รูปซูม/แพนช้า ๆ", "select", {
        group: "fx",
        default: "off",
        options: [
          { v: "off", l: "ไม่มี (แบบเดิม)" },
          { v: "in", l: "ซูมเข้าช้า ๆ" },
          { v: "out", l: "ซูมออกช้า ๆ" },
          { v: "pan", l: "แพนข้าง" },
          { v: "mix", l: "สลับทุกสไลด์" },
        ],
        hint: "ใช้ได้กับทุกแบบเปลี่ยน · \"จาง + ซูมช้า ๆ\" มีซูมเข้าในตัวอยู่แล้ว",
      }),
      f("textReveal", "ข้อความบนรูป", "select", {
        group: "fx",
        default: "together",
        options: [
          { v: "together", l: "โผล่พร้อมกัน (แบบเดิม)" },
          { v: "stagger", l: "ไล่โผล่ทีละบรรทัด" },
        ],
      }),
      f("vignette", "ขอบมืดนุ่ม (vignette)", "toggle", { group: "fx", default: false }),
      f("grain", "เกรนฟิล์มจาง ๆ", "toggle", { group: "fx", default: false }),
      f("drag", "ลากแล้วรูปขยับตามมือ", "toggle", { group: "fx", default: false, wide: true, hint: "เมาส์ + นิ้ว · ปิด = ปัดนิ้วแบบเดิม · ลูกค้าที่ตั้ง \"ลดการเคลื่อนไหว\" จะไม่เห็นเอฟเฟกต์ (พรีวิวในตัวจัดหน้ายังเห็น)" }),
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
        // 🎬 คลิปวนเงียบแทนรูป (ช่องคลิปกลาง videoFile ตัวเดียวกับแบนเนอร์หลัก) — เว็บร้านเล่นเฉพาะสไลด์ที่โชว์ + อยู่บนจอ
        f("videoKey", "คลิปวนเงียบแทนรูป (คอม)", "videoFile", { group: "media", default: null, wide: true, hint: "เล่นวนเงียบ ๆ ตอนสไลด์นี้โชว์ · ใส่รูปสไลด์ด้วย = ภาพระหว่างโหลด · MP4 แนวเดียวกับรูปทรงสไลด์" }),
        f("mobileVideoKey", "คลิปวนเงียบ (มือถือ)", "videoFile", { group: "media", default: null, wide: true, hint: "ไม่ใส่ = ใช้คลิปคอม · ใส่แค่คลิปมือถือ = คอมโชว์รูป" }),
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
      summary: (it) => s(it.title) || (it.imageKey ? "สไลด์" : it.videoKey ? "สไลด์คลิป" : "ยังไม่เลือกรูป"),
    },
    summary: (b) => count(arr(b.slides).length, "สไลด์"),
    validate: (b, label) => (!arr(b.slides).some((sl) => sl.imageKey || sl.videoKey) ? [{ level: "error", message: `${label}: ยังไม่มีรูป/คลิปในสไลด์` }] : []),
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

  // 🚪 หน้าเปิดแบ่งช่อง (2026-10-29) — แบ่งจอ 1–3 ช่อง รูป/คลิปเต็มช่อง กดแล้วเข้าแต่ละส่วนของเว็บ (เช่น รับผลิต | ขายอะไหล่)
  //   ชี้แล้วช่องขยาย (คอม) · มือถือเรียงบน-ล่าง · Section แรกของหน้า = Header โปร่งใสทับได้ · เว็บร้าน: src/components/home/SplitEntry.tsx
  "split-entry": {
    type: "split-entry",
    meta: { label: "หน้าเปิดแบ่งช่อง", icon: "🚪", hint: "แบ่งจอ 1–3 ช่อง รูป/คลิปเต็มช่อง กดแล้วเข้าแต่ละส่วนของเว็บ", group: "พื้นฐาน" },
    fields: [
      f("cut", "เส้นแบ่งช่อง", "select", {
        group: "layout",
        default: "straight",
        display: "seg",
        options: [
          { v: "straight", l: "ตรง" },
          { v: "gap", l: "มีช่องไฟ" },
          { v: "diag", l: "เฉียง" },
        ],
      }),
      f("gapSize", "ช่องไฟ (px)", "range", { group: "layout", default: 8, min: 2, numMax: 32, step: 1, showIf: { key: "cut", eq: "gap" } }),
      f("radius", "มุมโค้งของช่อง (px)", "range", { group: "layout", default: 12, min: 0, numMax: 40, step: 1, showIf: { key: "cut", eq: "gap" } }),
      f("height", "ความสูง", "select", {
        group: "layout",
        default: "full",
        options: [
          { v: "full", l: "เต็มจอ" },
          { v: "tall", l: "สูง (75% ของจอ)" },
          { v: "medium", l: "กลาง (55% ของจอ)" },
        ],
        hint: "เต็มจอพอดีเมื่อหัวเว็บลอยทับ (ดีไซน์ › หัวเว็บ → โปร่งใสตอนอยู่บนสุด) · ไม่ลอย = เลื่อนเกินจอเท่าความสูงหัวเว็บ",
      }),
      f("grow", "ชี้แล้วช่องขยาย (คอม)", "select", {
        group: "layout",
        default: "medium",
        display: "seg",
        options: [
          { v: "off", l: "ไม่ขยาย" },
          { v: "small", l: "นิดหน่อย" },
          { v: "medium", l: "กลาง" },
          { v: "large", l: "มาก" },
        ],
        hint: "ชี้เมาส์ช่องไหน ช่องนั้นกว้างขึ้น · มือถือไม่มีการชี้ จึงไม่ขยาย",
      }),
      f("textPos", "ตำแหน่งข้อความ", "select", {
        group: "layout",
        default: "bottom-left",
        display: "seg",
        options: [
          { v: "bottom-left", l: "ล่างซ้าย" },
          { v: "bottom", l: "ล่างกลาง" },
          { v: "center", l: "กลางช่อง" },
        ],
      }),
      f("mobileHeight", "มือถือ: ความสูงแต่ละช่อง", "select", {
        group: "layout",
        default: "split",
        options: [
          { v: "split", l: "แบ่งความสูงเท่า ๆ กัน (เห็นครบทุกช่อง)" },
          { v: "tall", l: "ช่องละ 70% ของจอ (เลื่อนลงดูช่องถัดไป)" },
        ],
        hint: "มือถือเรียงช่องบน-ล่างเสมอ",
      }),
      f("overlay", "ความทึบสีทับรูป (%)", "range", { group: "media", default: 35, min: 0, numMax: 80, step: 5, hint: "เพิ่มถ้ารูปสว่างจนอ่านตัวหนังสือไม่ออก" }),
      // 🎬 ช่องที่มีคลิป: ค่าเริ่ม = ชี้แล้วเล่น (เจ้าของขอ 2026-10-30: เปิดมาเป็นภาพนิ่ง ชี้แล้วเล่น เอาออกหยุดกลับเป็นปก)
      f("videoPlay", "ช่องที่มีคลิป: เล่นเมื่อไหร่", "select", {
        group: "media",
        default: "hover",
        display: "seg",
        options: [
          { v: "hover", l: "ชี้แล้วเล่น (ปกเป็นรูป)" },
          { v: "auto", l: "เล่นวนตลอด" },
        ],
        hint: "ชี้แล้วเล่น = เปิดหน้ามาเห็นรูปของช่องเป็นปก · ชี้เมาส์ที่ช่องคลิปเล่น เอาเมาส์ออกหยุดกลับเป็นปก · มือถือ (ชี้ไม่ได้) เล่นเองตอนเห็นบนจอ",
      }),
    ],
    children: {
      key: "panels",
      label: "ช่อง",
      itemLabel: "ช่อง",
      icon: "🚪",
      min: 1,
      max: 3,
      fields: [
        text("eyebrow", "คำโปรยเล็กด้านบน", { default: "", max: 60 }),
        text("title", "หัวข้อ", { default: "", max: 80, required: true, requiredMessage: "ช่องนี้ยังไม่ได้ใส่หัวข้อ" }),
        area("desc", "คำอธิบายสั้น", { default: "", max: 200 }),
        link("primary", "ปุ่มหลัก — กดตรงไหนของช่องก็ไปลิงก์นี้", "เข้าชม", ""),
        link("secondary", "ปุ่มรอง (ไม่บังคับ)", "", "", { hint: "เหมาะกับแบบช่องเดียวที่มี 2 ทางเลือก" }),
        image("imageKey", "รูป (ช่องที่มีคลิป = รูปปก)", { hint: "แนะนำรูปแนวตั้งหรือจัตุรัส กว้าง 1600px+ (ช่องแคบกว่าจอ รูปจะถูกครอปให้เต็มช่อง) · ใส่คลิปด้วย = รูปนี้เป็นปกตอนคลิปยังไม่เล่น", minPx: 1600 }),
        image("mobileImageKey", "รูป (มือถือ)", { hint: "ไม่ใส่ = ใช้รูปเดียวกับคอม · ใส่ไว้ = มือถือโชว์รูปนี้แทนคลิป (ประหยัดเน็ตลูกค้า) · มือถือช่องเป็นแนวนอน แนะนำ 1200×900" }),
        text("imageAlt", "คำบรรยายรูป (Alt)", { group: "media", default: "", max: 200, hint: "มีผลกับ SEO" }),
        f("videoFile", "🎬 คลิปวนเล่น (แทนรูป)", "videoFile", {
          group: "media",
          default: null,
          wide: true,
          hint: "เล่นวนเงียบ ๆ เฉพาะตอนเห็นบนจอ · รูปโชว์ระหว่างโหลด · แนะนำ MP4 สั้น 6–15 วินาที",
        }),
        f("bg", "สีพื้นช่อง (ตอนยังไม่มีรูป)", "color", { group: "media", default: "" }),
      ],
      summary: (it) => s(it.title) || "ช่อง",
      starter: () => [{ title: "ช่องที่ 1" }, { title: "ช่องที่ 2" }],
    },
    summary: (b) => {
      const ps = arr(b.panels).filter((p) => p.enabled !== false);
      return ps.length ? `${count(ps.length, "ช่อง")}: ${ps.map((p) => s(p.title) || "ช่อง").join(" | ")}` : "ยังไม่มีช่อง";
    },
    validate: (b, label) => {
      const out: Omit<ValidationIssue, "blockId">[] = [];
      const ps = arr(b.panels).filter((p) => p.enabled !== false);
      if (!ps.length) out.push({ level: "error", message: `${label}: ยังไม่มีช่อง — เพิ่มอย่างน้อย 1 ช่อง` });
      ps.forEach((p, i) => {
        const name = `ช่อง "${s(p.title) || i + 1}"`;
        const pr = (p.primary ?? {}) as { text?: string; href?: string };
        const se = (p.secondary ?? {}) as { text?: string; href?: string };
        if (!s(pr.href)) out.push({ level: "error", message: `${label}: ${name} ยังไม่ได้เลือกว่ากดแล้วไปหน้าไหน (ปุ่มหลัก)` });
        if (s(se.text) && !s(se.href)) out.push({ level: "error", message: `${label}: ${name} ปุ่มรองยังไม่มีลิงก์` });
        if (!p.imageKey && !p.videoFile) out.push({ level: "warning", message: `${label}: ${name} ยังไม่มีรูปหรือคลิป (ลูกค้าจะเห็นเป็นสีพื้น)` });
      });
      return out;
    },
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
      // 🏷 หัวชุด (2026-10-22) — ค่าเริ่ม = โชว์ทั้งหมด (หน้าตาเดิม)
      f("showDate", "โชว์วันเวลาเปิดชุด", "toggle", { group: "layout", default: true, showIf: { key: "banner", eq: ["big", "small"] }, hint: "โชว์ข้างชื่อชุด (แบบหัวข้อเล็ก หรือชุดที่ไม่มีรูปปก)" }),
      f("showSub", "โชว์คำโปรยใต้ชื่อชุด", "toggle", { group: "layout", default: true, showIf: { key: "banner", eq: ["big", "small"] }, hint: "คำโปรยตั้งที่แท็บ 🆕 มาใหม่ (รายชุด)" }),
      f("backLink", "ลิงก์ \"← มาใหม่ทั้งหมด\" บนหน้าชุด", "toggle", { group: "layout", default: true, hint: "เฉพาะหน้า /new/<ชุด> ที่จัดหน้าเอง" }),
      f("showProducts", "โชว์สินค้าในชุด (เมื่อเปิดแล้ว)", "toggle", { group: "layout", default: true }),
      // 🛍 ตารางสินค้าของชุด — คอลัมน์ · เรียง (ค่าเริ่ม = ตามการ์ดของร้าน / ตามที่เลือกในชุด = หน้าตาเดิม)
      f("columns", "จำนวนคอลัมน์ (จอคอม)", "select", {
        group: "layout",
        default: "auto",
        options: [{ v: "auto", l: "ตามการ์ดของร้าน" }, ...["2", "3", "4", "5", "6"].map((v) => ({ v, l: `${v} คอลัมน์` }))],
        showIf: { key: "showProducts", eq: true },
      }),
      f("columnsMobile", "จำนวนคอลัมน์ (มือถือ)", "select", {
        group: "layout",
        default: "auto",
        options: [{ v: "auto", l: "ตามการ์ดของร้าน" }, { v: "1", l: "1 คอลัมน์" }, { v: "2", l: "2 คอลัมน์" }, { v: "3", l: "3 คอลัมน์" }],
        showIf: { key: "showProducts", eq: true },
      }),
      f("sort", "เรียงสินค้า", "select", {
        group: "layout",
        default: "default",
        options: [
          { v: "default", l: "ตามที่เลือกในชุด (เรียงที่แท็บ 🆕)" },
          { v: "price-asc", l: "ราคาถูก → แพง" },
          { v: "price-desc", l: "ราคาแพง → ถูก" },
        ],
        showIf: { key: "showProducts", eq: true },
      }),
      f("soldOutLast", "ของหมดไว้ท้ายสุด", "toggle", { group: "layout", default: false, showIf: { key: "showProducts", eq: true } }),
      ...GRID_CARD_FIELDS,
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

  // 👜 ตัวประกอบสินค้า (2026-10-30) — ข้อมูลจาก /admin/product-configurator · เว็บร้าน: src/components/configurator/*
  configurator: {
    type: "configurator",
    meta: { label: "ตัวประกอบสินค้า (ออกแบบเอง)", icon: "👜", hint: "ลูกค้าเลือกวัสดุ สี อะไหล่ ทีละขั้น เห็นรูปที่ประกอบ + ราคา", group: "สินค้า",
      manage: { label: "จัดการทรงและรูป →", href: "/admin/product-configurator", hint: "สตูดิโอ: ช่องตัวเลือก ราคา ชั้นรูป แม่แบบถ่ายรูป · ต้องเปิดทรงก่อนลูกค้าจะเห็น (พรีวิวเห็นทรงที่ปิดอยู่ได้)" } },
    fields: [
      ...headFields({ eyebrow: "Made for you", title: "ออกแบบในแบบของคุณ", subtitle: true }),
      text("model", "รหัสทรงที่จะโชว์", { group: "layout", default: "", max: 40, placeholder: "เช่น TOTE · ว่าง = ทรงแรกที่เปิดอยู่", hint: "ดูรหัสทรงได้ที่หน้าตัวประกอบสินค้า (แท็บข้อมูลทรง)" }),
      f("showModelPicker", "ให้ลูกค้าสลับทรงได้", "toggle", { group: "layout", default: true, hint: "เปิดอยู่หลายทรง = โชว์ปุ่มเลือกทรงด้านบน" }),
      f("showPrice", "โชว์ราคา", "toggle", { group: "layout", default: true, hint: "ปิด = โชว์เฉพาะรูป (เหมาะตอนยังไม่ตั้งราคา)" }),
      f("imageSide", "รูปอยู่ด้าน", "select", { group: "layout", default: "left", display: "seg", options: [{ v: "left", l: "ซ้าย" }, { v: "right", l: "ขวา" }] }),
      text("ctaLabel", "ข้อความปุ่มบันทึกแบบ", { group: "layout", default: "บันทึกแบบนี้", max: 40 }),
    ],
    summary: (b) => (s(b.model) ? `ทรง ${s(b.model)} → รูปซ้อนชั้น + ราคา` : "ทรงแรกที่เปิดอยู่ → รูปซ้อนชั้น + ราคา"),
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

  // 🚶 รันเวย์ลุค (2026-10-21 · อ้างอิง Marc Jacobs "Runway Experience") — เว็บร้าน: src/components/home/RunwayBody.tsx
  //   ลุคปัจจุบันชัดใหญ่ด้านหน้า · ลุคถัดไปเรียงแถวด้านหลัง (เล็กลง + จาง/เบลอ) · การ์ดสินค้าของลุคข้าง ๆ (♡ + ใส่ตะกร้า)
  runway: {
    type: "runway",
    meta: { label: "รันเวย์ลุค (เดินแบบทีละลุค)", icon: "🚶", hint: "ลุคปัจจุบันชัดด้านหน้า ลุคถัดไปเรียงแถวด้านหลัง · การ์ดสินค้าของลุคข้าง ๆ", group: "สินค้า" },
    fields: [
      ...headFields({ eyebrow: "", title: "Spring Summer 2026", subtitle: true }),
      text("lookLabel", "คำหน้าเลขลุค", { default: "LOOK", max: 20, placeholder: "LOOK / ลุคที่", hint: "โชว์มุมล่าง เช่น LOOK 03" }),
      text("shopAllText", "ปุ่มดูสินค้าทั้งลุค", { default: "Shop the look", max: 40, hint: "ว่าง = ไม่มีปุ่ม" }),
      // ตัวหนังสือใหญ่จาง ๆ หลังนางแบบ (ชื่อคอลเลกชัน)
      text("bigText", "ตัวหนังสือใหญ่ด้านหลัง", { default: "", max: 24, placeholder: "เช่น SS26", hint: "อยู่หลังนางแบบ · ว่าง = ไม่มี" }),
      f("bigTextColor", "สีตัวหนังสือใหญ่", "color", { default: "", hint: "ว่าง = สีตัวหนังสือแบบจาง ๆ" }),
      f("bigTextPos", "ตัวหนังสือใหญ่อยู่", "select", {
        default: "middle",
        options: [
          { v: "top", l: "ด้านบน" },
          { v: "middle", l: "กลางเวที" },
          { v: "bottom", l: "ด้านล่าง" },
        ],
      }),
      // 🎨 พื้นหลังเวที — คลุมทั้งเวที + แผงการ์ด (การ์ดอยู่บนพื้นเดียวกัน) · ลุคตั้งสีพื้นเองได้ (สีค่อย ๆ เปลี่ยนตามลุค)
      f("bg", "พื้นหลังเวที", "select", {
        group: "media",
        default: "solid",
        options: [
          { v: "solid", l: "สีเดียว" },
          { v: "floor", l: "ผนัง + พื้น (แบบรันเวย์)" },
          { v: "image", l: "รูปภาพ" },
        ],
      }),
      f("bgColor", "สีพื้นหลัง", "color", { group: "media", default: "", hint: "ว่าง = สีพื้นการ์ดของธีม · ลุคตั้งสีของตัวเองได้" }),
      f("floorColor", "สีพื้นเวที", "color", { group: "media", default: "", showIf: { key: "bg", eq: "floor" }, hint: "ว่าง = เข้มกว่าผนังนิดหน่อย" }),
      f("floorHeight", "ความสูงพื้น (%)", "range", { group: "media", default: 24, min: 8, numMax: 50, showIf: { key: "bg", eq: "floor" } }),
      image("bgImage", "รูปพื้นหลัง", { showIf: { key: "bg", eq: "image" }, hint: "รูปสตูดิโอ/รันเวย์แนวนอน" }),
      f("bgDim", "ทำให้รูปพื้นหลังจางลง (%)", "range", { group: "media", default: 30, min: 0, numMax: 90, step: 5, showIf: { key: "bg", eq: "image" }, hint: "จางด้วยสีพื้นหลัง · นางแบบเด่นขึ้น" }),
      // 🧍 รูปนางแบบ (PNG) — ขนาด/ยกขึ้นทั้ง Section · ลุคปรับเพิ่ม/ลดเองได้
      f("figSize", "ขนาดคนในเวที (%)", "range", { group: "layout", default: 88, min: 50, numMax: 100, hint: "% ของความสูงเวที · ลุคไหนสูงไม่เท่าเพื่อน ปรับที่ลุคนั้น" }),
      f("figLift", "ยกคนขึ้นจากขอบล่าง (%)", "range", { group: "layout", default: 0, min: 0, numMax: 30 }),
      f("shadow", "เงาใต้เท้า", "select", {
        group: "layout",
        default: "soft",
        options: [
          { v: "soft", l: "จาง ๆ" },
          { v: "strong", l: "ชัด" },
          { v: "none", l: "ไม่มี" },
        ],
        hint: "รูป PNG ตัดพื้นจะดูยืนบนพื้นจริง ไม่ลอย",
      }),
      f("zoom", "กดนางแบบตัวหน้า = ขยายดูรูปเต็ม", "toggle", { group: "layout", default: true, hint: "แตะซ้ำเพื่อซูมดูรายละเอียดกระเป๋า" }),
      f("depth", "ลุคถัดไปที่เห็นด้านหลัง", "select", {
        group: "layout",
        default: "3",
        options: [
          { v: "2", l: "2 ลุค" },
          { v: "3", l: "3 ลุค" },
          { v: "4", l: "4 ลุค" },
        ],
      }),
      f("queueSide", "แถวลุคด้านหลังอยู่", "select", {
        group: "layout",
        default: "left",
        options: [
          { v: "left", l: "ซ้าย (แบบรูปอ้างอิง)" },
          { v: "right", l: "ขวา" },
        ],
      }),
      f("blur", "ลุคด้านหลัง", "select", {
        group: "layout",
        default: "soft",
        options: [
          { v: "soft", l: "เบลอนิด + จาง (แบบรูปอ้างอิง)" },
          { v: "strong", l: "เบลอมาก + จาง" },
          { v: "none", l: "ไม่เบลอ (จางอย่างเดียว)" },
        ],
      }),
      f("height", "ความสูงเวที", "select", {
        group: "layout",
        default: "tall",
        options: [
          { v: "md", l: "ปกติ" },
          { v: "tall", l: "สูง" },
          { v: "screen", l: "เต็มจอ" },
        ],
      }),
      f("panel", "การ์ดสินค้าของลุค", "select", {
        group: "layout",
        default: "right",
        options: [
          { v: "right", l: "แผงขวา (แบบรูปอ้างอิง)" },
          { v: "left", l: "แผงซ้าย" },
          { v: "none", l: "ไม่มีแผง (กดปุ่มดูสินค้าทั้งลุค)" },
        ],
        hint: "มือถือ: การ์ดเลื่อนข้างอยู่ใต้เวทีเสมอ",
      }),
      f("showPrice", "โชว์ราคาในการ์ด", "toggle", { group: "layout", default: true }),
      f("showHeart", "ปุ่ม ♡ ถูกใจ", "toggle", { group: "layout", default: true, hint: "ใช้รายการโปรดของเว็บ (ร้านต้องเปิดรายการโปรดไว้)" }),
      // เลื่อนจอแล้วลุคเดิน (แบบเว็บอ้างอิง) — เวทีค้างบนจอ เลื่อนลง = ลุคถัดไป · เปิดแล้วไม่ใช้ "เดินลุคเอง" (สองอย่างแย่งกันเปลี่ยนลุค)
      f("scroll", "เลื่อนหน้าจอแล้วลุคเดิน", "toggle", { group: "layout", default: false, hint: "ลูกค้าเลื่อนลง = ลุคถัดไป · เวทีค้างบนจอจนครบทุกลุค แล้วหน้าเว็บค่อยเลื่อนต่อ" }),
      f("scrollPace", "เลื่อนนานแค่ไหนต่อ 1 ลุค", "select", {
        group: "layout",
        default: "md",
        options: [
          { v: "sm", l: "สั้น (ลุคเปลี่ยนไว)" },
          { v: "md", l: "ปกติ" },
          { v: "lg", l: "ยาว (ลุคเปลี่ยนช้า)" },
        ],
        showIf: { key: "scroll", eq: true },
      }),
      f("auto", "เดินลุคเอง", "toggle", { group: "layout", default: false, hint: "หยุดเมื่อลูกค้าชี้/แตะ", showIf: { key: "scroll", eq: false } }),
      f("autoSec", "เปลี่ยนลุคทุก (วินาที)", "number", { group: "layout", default: 5, min: 3, numMax: 20, showIf: [{ key: "scroll", eq: false }, { key: "auto", eq: true }] }),
    ],
    children: {
      key: "looks",
      label: "ลุค",
      itemLabel: "ลุค",
      icon: "🚶",
      max: 30,
      fields: [
        image("imageKey", "รูปลุค (เต็มตัว)", {
          required: true,
          requiredMessage: "ยังไม่ได้ใส่รูปลุค",
          removeBg: true,
          hint: "รูปมีพื้นหลัง → กด ✂️ ตัดพื้น (AI) ได้เลย · ถ่ายเต็มตัว มุมเดียวกัน แถวด้านหลังจะเรียงสวย",
        }),
        text("name", "ชื่อลุค (ถ้ามี)", { default: "", max: 60, placeholder: "เช่น Pink Metallic" }),
        f("products", "สินค้าในลุคนี้", "products", { max: 6, wide: true, hint: "โชว์ในแผงการ์ดข้างเวที · ♡ + ใส่ตะกร้าได้" }),
        // PNG แต่ละรูปขอบเหลือไม่เท่ากัน → ปรับรายลุคให้คนสูง/ยืนพื้นเท่ากัน (คูณกับค่าทั้ง Section)
        f("size", "ขนาดคน ลุคนี้ (%)", "range", { default: 100, min: 50, numMax: 150, step: 5, hint: "คนดูเล็ก/ใหญ่กว่าลุคอื่น ปรับตรงนี้" }),
        f("lift", "ยกขึ้น / ลดลง ลุคนี้ (%)", "range", { default: 0, min: -20, numMax: 30, hint: "+ ยกขึ้น · − ลดลง (ขอบล่างของ PNG เหลือเยอะ เท้าลอย)" }),
        f("bgColor", "สีพื้นหลังตอนโชว์ลุคนี้", "color", { default: "", hint: "ว่าง = สีพื้นหลังของ Section · เปลี่ยนลุคแล้วสีค่อย ๆ เปลี่ยน" }),
        // 📍 จุดกดบนตัวนางแบบ (ชี้ที่กระเป๋า → การ์ดเด้ง) — คลิกบนรูปลุคนี้เพื่อวางจุด
        f("spots", "จุดกดบนตัวนางแบบ", "select", {
          default: "0",
          options: [
            { v: "0", l: "ไม่มี" },
            { v: "1", l: "1 จุด" },
            { v: "2", l: "2 จุด" },
            { v: "3", l: "3 จุด" },
          ],
          hint: "ลูกค้ากดจุด = การ์ดสินค้าเด้ง",
        }),
        f("spot1", "จุดที่ 1 — ตำแหน่ง", "point", { pointImage: "imageKey", wide: true, showIf: { key: "spots", eq: ["1", "2", "3"] } }),
        f("spot1Products", "จุดที่ 1 — สินค้า", "products", { max: 2, wide: true, showIf: { key: "spots", eq: ["1", "2", "3"] } }),
        f("spot2", "จุดที่ 2 — ตำแหน่ง", "point", { pointImage: "imageKey", wide: true, showIf: { key: "spots", eq: ["2", "3"] } }),
        f("spot2Products", "จุดที่ 2 — สินค้า", "products", { max: 2, wide: true, showIf: { key: "spots", eq: ["2", "3"] } }),
        f("spot3", "จุดที่ 3 — ตำแหน่ง", "point", { pointImage: "imageKey", wide: true, showIf: { key: "spots", eq: "3" } }),
        f("spot3Products", "จุดที่ 3 — สินค้า", "products", { max: 2, wide: true, showIf: { key: "spots", eq: "3" } }),
      ],
      summary: (it) => `${s(it.name) || (it.imageKey ? "ลุค" : "(ยังไม่ใส่รูป)")}${Array.isArray(it.products) && it.products.length ? ` · 🛍 ${it.products.length}` : ""}${Number(it.spots) > 0 ? ` · 📍 ${it.spots}` : ""}`,
    },
    summary: (b) => `${count(arr(b.looks).length, "ลุค")} · แถว${b.queueSide === "right" ? "ขวา" : "ซ้าย"} ${s(b.depth) || "3"}${b.scroll === true ? " · เลื่อนจอ" : ""}`,
    validate: (b, label) => {
      const out: Omit<ValidationIssue, "blockId">[] = [];
      const looks = arr(b.looks).filter((x) => x.enabled !== false);
      if (looks.length < 2) out.push({ level: "warning", message: `${label}: ควรมีอย่างน้อย 2 ลุค (ลุคเดียวจะไม่มีแถวด้านหลัง)` });
      const noImg = looks.filter((x) => !x.imageKey).length;
      if (noImg) out.push({ level: "warning", message: `${label}: ${noImg} ลุคยังไม่ได้ใส่รูป` });
      const noProd = looks.filter((x) => !(Array.isArray(x.products) && x.products.length)).length;
      if (noProd && b.panel !== "none") out.push({ level: "warning", message: `${label}: ${noProd} ลุคยังไม่ได้เลือกสินค้า (แผงการ์ดจะว่าง)` });
      // จุดกดที่ยังไม่ผูกสินค้า = ลูกค้าไม่เห็นจุดนั้น
      const emptySpots = looks.reduce((n, x) => n + [1, 2, 3].filter((i) => i <= Number(x.spots || 0) && !(Array.isArray(x[`spot${i}Products`]) && (x[`spot${i}Products`] as unknown[]).length)).length, 0);
      if (emptySpots) out.push({ level: "warning", message: `${label}: ${emptySpots} จุดกดยังไม่ได้เลือกสินค้า (จุดนั้นจะไม่โชว์)` });
      if (b.bg === "image" && !b.bgImage) out.push({ level: "warning", message: `${label}: เลือกพื้นหลังแบบรูปภาพ แต่ยังไม่ได้ใส่รูป` });
      return out;
    },
  },

  // 🎞️ การ์ดบนฉาก (2026-10-22) — เว็บร้าน: src/components/home/SceneBody.tsx · กฎเลือกสินค้าของแท็บ lib/website-scene (มิเรอร์)
  //   รูปการ์ด = PNG ของรุ่น (ไม่มี = ไม่โชว์ · เจ้าของขอไม่ตัดพื้นเอง) · แผงใส่ PNG รายสินค้า = components/website-scene-png-board (ตัวจัดหน้า)
  //   พื้นหลังเต็มจอ (รูป/วิดีโอ) + แถวการ์ดสินค้ากระจกเลื่อนข้าง · แท็บด้านบน (สูงสุด 3) แต่ละแท็บมีสินค้า + ฉากของตัวเอง
  //   ฉาก = ชิ้นย่อย: อยู่แท็บไหน + เริ่มที่สินค้าชิ้นที่ → เลื่อนการ์ดถึงชิ้นนั้น พื้นหลังค่อย ๆ เปลี่ยน
  scene: {
    type: "scene",
    meta: { label: "การ์ดบนฉาก (พื้นหลังรูป/วิดีโอ + การ์ดเลื่อน)", icon: "🎞️", hint: "พื้นหลังเต็มจอ + การ์ดสินค้ากระจกเลื่อนข้าง · เลื่อนถึงชิ้นที่ตั้งไว้ = เปลี่ยนฉาก", group: "สินค้า" },
    fields: [
      text("title", "หัวข้อ (ไม่ใส่ก็ได้)", { default: "", max: 80, placeholder: "เช่น Fall Edit", hint: "โชว์เหนือแท็บ" }),
      f("tabs", "จำนวนแท็บด้านบน", "select", {
        group: "products",
        default: "2",
        options: [
          { v: "1", l: "1 (ไม่โชว์แท็บ)" },
          { v: "2", l: "2 แท็บ" },
          { v: "3", l: "3 แท็บ" },
        ],
        hint: "แต่ละแท็บมีสินค้าและฉากของตัวเอง (ฉาก → ช่อง \"อยู่แท็บ\")",
      }),
      ...([1, 2, 3] as const).flatMap((n) => {
        const on: ShowIf = { key: "tabs", eq: n === 1 ? ["1", "2", "3"] : n === 2 ? ["2", "3"] : ["3"] };
        return [
          text(`tab${n}Label`, `แท็บ ${n}: ชื่อ`, { group: "products", default: n === 1 ? "มาใหม่" : n === 2 ? "ขายดี" : "เลือกเอง", max: 30, showIf: on }),
          f(`tab${n}Source`, `แท็บ ${n}: สินค้า`, "select", {
            group: "products",
            default: n === 1 ? "new" : n === 2 ? "best" : "pick",
            options: [
              { v: "new", l: "มาใหม่ (ขึ้นร้านล่าสุด)" },
              { v: "best", l: "ขายดี (อันดับขาย)" },
              { v: "pick", l: "เลือกเอง" },
            ],
            showIf: on,
          }),
          f(`tab${n}Products`, `แท็บ ${n}: เลือกสินค้า`, "products", { group: "products", max: 24, wide: true, showIf: [on, { key: `tab${n}Source`, eq: "pick" }] }),
          f(`tab${n}Count`, `แท็บ ${n}: จำนวนสินค้า`, "number", { group: "products", default: 12, min: 3, numMax: 24, showIf: [on, { key: `tab${n}Source`, eq: ["new", "best"] }] }),
        ];
      }),
      // 🃏 การ์ดสินค้า
      f("card", "แบบการ์ด", "select", {
        group: "card",
        default: "frost",
        options: [
          { v: "frost", l: "กระจกฝ้า" },
          { v: "liquid", l: "Liquid Glass (กระจกใสมีประกาย)" },
          { v: "solid", l: "ทึบ" },
        ],
      }),
      f("cardTint", "สีกระจก", "select", {
        group: "card",
        default: "light",
        options: [
          { v: "light", l: "ขาว (ตัวหนังสือขาว · บนฉากเข้ม)" },
          { v: "dark", l: "ดำ (ตัวหนังสือขาว)" },
          { v: "white", l: "ขาวขุ่น (ตัวหนังสือดำ · บนฉากสว่าง)" },
        ],
      }),
      f("cardOpacity", "ความขุ่นของการ์ด (%)", "range", { group: "card", default: 22, min: 0, numMax: 90, step: 2 }),
      f("cardBlur", "ความเบลอหลังการ์ด", "range", { group: "card", default: 16, min: 0, numMax: 40, showIf: { key: "card", eq: ["frost", "liquid"] } }),
      f("cardBorder", "เส้นขอบการ์ด", "toggle", { group: "card", default: true }),
      f("cardRadius", "มุมการ์ด (มน)", "range", { group: "card", default: 8, min: 0, numMax: 32 }),
      f("cardSize", "ขนาดการ์ด", "select", {
        group: "card",
        default: "m",
        options: [
          { v: "s", l: "เล็ก" },
          { v: "m", l: "กลาง" },
          { v: "l", l: "ใหญ่" },
        ],
      }),
      f("imgMode", "รูปสินค้าบนการ์ด", "select", {
        group: "card",
        default: "png",
        options: [
          { v: "png", l: "รูป PNG พื้นใส — สินค้าที่ไม่มี PNG ไม่โชว์" },
          { v: "original", l: "รูปเดิมทุกตัว (มีพื้นหลัง)" },
        ],
        hint: "ใส่ PNG ที่แผง \"🖼 รูป PNG ของสินค้า\" ด้านบน หรือช่อง \"รูปตัดพื้น (PNG)\" ใน Parent SKU (ที่เดียวกัน)",
      }),
      f("showMeta", "โชว์ยี่ห้อ/หมวด", "toggle", { group: "card", default: true }),
      f("showPrice", "โชว์ราคา", "toggle", { group: "card", default: true }),
      f("showHeart", "ปุ่ม ♡ ถูกใจ", "toggle", { group: "card", default: true }),
      // 🖼 เวที
      f("height", "ความสูงเวที", "select", {
        group: "layout",
        default: "tall",
        options: [
          { v: "md", l: "ปกติ" },
          { v: "tall", l: "สูง" },
          { v: "screen", l: "เต็มจอ" },
        ],
      }),
      f("dim", "ทำพื้นหลังมืดลง (%)", "range", { group: "layout", default: 12, min: 0, numMax: 70, step: 2, hint: "การ์ด/ตัวหนังสืออ่านง่ายขึ้น" }),
    ],
    children: {
      key: "scenes",
      label: "ฉากพื้นหลัง",
      itemLabel: "ฉาก",
      icon: "🎞️",
      max: 12,
      fields: [
        f("tab", "อยู่แท็บ", "select", {
          default: "1",
          options: [
            { v: "1", l: "แท็บ 1" },
            { v: "2", l: "แท็บ 2" },
            { v: "3", l: "แท็บ 3" },
          ],
          showIfParent: { key: "tabs", eq: ["2", "3"] },
        }),
        f("from", "เริ่มที่สินค้าชิ้นที่", "number", { default: 1, min: 1, numMax: 24, hint: "เลื่อนการ์ดถึงชิ้นนี้ = เปลี่ยนเป็นฉากนี้ · ฉากแรกของแท็บ = 1" }),
        f("kind", "พื้นหลังเป็น", "select", {
          default: "image",
          options: [
            { v: "image", l: "🖼 รูป" },
            { v: "video", l: "🎬 วิดีโอ" },
          ],
        }),
        f("videoKey", "คลิปวิดีโอ", "videoFile", { default: null, showIf: { key: "kind", eq: "video" }, hint: "เล่นวนเงียบ ๆ · แนวนอน 16:9" }),
        image("imageKey", "รูป", { hint: "รูปฉาก (แนวนอน กว้าง ≥ 1920px) · วิดีโอ = รูปปกตอนคลิปยังโหลด" }),
        f("pos", "ให้เห็นส่วนไหนของภาพ", "select", {
          default: "center",
          options: [
            { v: "top", l: "บน" },
            { v: "center", l: "กลาง" },
            { v: "bottom", l: "ล่าง" },
          ],
        }),
      ],
      summary: (it) => `${it.kind === "video" ? "🎬" : "🖼"} แท็บ ${s(it.tab) || "1"} · ตั้งแต่ชิ้นที่ ${Number(it.from) || 1}${it.kind === "video" ? (it.videoKey ? "" : " · ยังไม่ใส่คลิป") : it.imageKey ? "" : " · ยังไม่ใส่รูป"}`,
    },
    summary: (b) => `${Number(b.tabs) > 1 ? `${b.tabs} แท็บ · ` : ""}${count(arr(b.scenes).length, "ฉาก")} · ${b.card === "liquid" ? "Liquid Glass" : b.card === "solid" ? "การ์ดทึบ" : "กระจกฝ้า"}`,
    validate: (b, label) => {
      const out: Omit<ValidationIssue, "blockId">[] = [];
      const tabs = Number(b.tabs) || 1;
      const scenes = arr(b.scenes).filter((x) => x.enabled !== false);
      if (!scenes.length) out.push({ level: "warning", message: `${label}: ยังไม่มีฉากพื้นหลัง (เพิ่ม "ฉาก" ใส่รูปหรือวิดีโอ)` });
      const noMedia = scenes.filter((x) => (x.kind === "video" ? !x.videoKey : !x.imageKey)).length;
      if (noMedia) out.push({ level: "warning", message: `${label}: ${noMedia} ฉากยังไม่ได้ใส่รูป/คลิป` });
      for (let n = 1; n <= tabs; n++) {
        if (b[`tab${n}Source`] === "pick" && !(Array.isArray(b[`tab${n}Products`]) && (b[`tab${n}Products`] as unknown[]).length))
          out.push({ level: "warning", message: `${label}: แท็บ ${n} ตั้ง "เลือกเอง" แต่ยังไม่ได้เลือกสินค้า` });
        if (tabs > 1 && !scenes.some((x) => Number(x.tab || 1) === n)) out.push({ level: "warning", message: `${label}: แท็บ ${n} ยังไม่มีฉาก (จะใช้ฉากของแท็บ 1)` });
      }
      return out;
    },
  },

  // 🖱️ ข้อความใหญ่ + รูปตามเมาส์ (2026-10-23 · อ้างอิงหน้าเว็บแบรนด์ Gen Z ที่คำใหญ่ ชี้คำแล้วรูปลอยตามเมาส์)
  //   เว็บร้าน: src/components/home/HoverReveal.tsx · คำ = ชิ้นย่อย (ข้อความ + รูป + ลิงก์) · รูปผูกชุดรูปได้ (ช่องรูปกลาง)
  //   คอม: ชี้คำ → รูปของคำนั้นลอยตามเมาส์ (นุ่ม/ติดเมาส์/กลางจอ + เอียงตามทิศ) · คำอื่นจาง/เหลือแค่เส้นขอบ · กด = ไปลิงก์
  //   มือถือ: แตะคำ = รูปขึ้น (ยังไม่ไปไหน) · แตะคำเดิมซ้ำ = ไปลิงก์ · แตะที่อื่น = รูปหาย
  "hover-reveal": {
    type: "hover-reveal",
    meta: { label: "ข้อความใหญ่ + รูปตามเมาส์", icon: "🖱️", hint: "คำใหญ่หลายบรรทัด ชี้คำไหน รูปของคำนั้นลอยตามเมาส์ · มือถือแตะ = รูปขึ้น แตะซ้ำ = ไปลิงก์", group: "เนื้อหา" },
    fields: [
      text("eyebrow", "คำโปรยเล็กด้านบน", { default: "", max: 80, placeholder: "เช่น (EXPLORE)" }),
      area("note", "ข้อความเล็กใต้คำ", { default: "", max: 300 }),
      f("align", "จัดคำ", "select", {
        group: "layout",
        default: "center",
        options: [
          { v: "left", l: "ชิดซ้าย" },
          { v: "center", l: "กึ่งกลาง" },
          { v: "right", l: "ชิดขวา" },
        ],
      }),
      f("font", "ฟอนต์คำ", "select", { group: "layout", default: "display", options: CANVAS_FONTS, display: "font" }),
      f("weight", "ความหนา", "select", { group: "layout", default: "700", options: CANVAS_WEIGHTS }),
      f("size", "ขนาดคำ — จอคอม (px)", "range", { group: "layout", default: 128, min: 40, numMax: 260, step: 4, hint: "จอเล็กลงย่อตามเอง ไม่ล้นจอ" }),
      f("sizeMobile", "ขนาดคำ — มือถือ (px)", "range", { group: "layout", default: 52, min: 24, numMax: 120, step: 2 }),
      f("upper", "ตัวพิมพ์ใหญ่ทั้งหมด (อังกฤษ)", "toggle", { group: "layout", default: true }),
      f("lineGap", "ระยะบรรทัด", "select", {
        group: "layout",
        default: "tight",
        options: [
          { v: "tight", l: "ชิด (แบบตัวอย่าง)" },
          { v: "normal", l: "ปกติ" },
          { v: "loose", l: "ห่าง" },
        ],
      }),
      f("color", "สีคำ", "select", { group: "layout", default: "ink", options: CANVAS_COLORS }),
      f("hex", "สีคำ (เลือกเอง)", "color", { group: "layout", default: "", showIf: { key: "color", eq: "custom" } }),
      f("others", "คำอื่นตอนชี้คำหนึ่ง", "select", {
        group: "layout",
        default: "fade",
        options: [
          { v: "fade", l: "จางลง (เด่นแค่คำที่ชี้)" },
          { v: "outline", l: "เหลือแค่เส้นขอบตัวอักษร" },
          { v: "none", l: "เหมือนเดิม" },
        ],
      }),
      f("imgW", "ขนาดรูป — จอคอม (px)", "range", { group: "media", default: 320, min: 160, numMax: 600, step: 20, hint: "ความกว้างของรูปที่ลอยขึ้น" }),
      f("imgWMobile", "ขนาดรูป — มือถือ (px)", "range", { group: "media", default: 200, min: 120, numMax: 320, step: 10 }),
      f("ratio", "สัดส่วนรูป", "select", {
        group: "media",
        default: "3:4",
        options: [
          { v: "3:4", l: "3:4 แนวตั้ง" },
          { v: "4:5", l: "4:5 แนวตั้งนิด ๆ" },
          { v: "2:3", l: "2:3 แนวตั้งสูง" },
          { v: "1:1", l: "1:1 จัตุรัส" },
          { v: "4:3", l: "4:3 แนวนอน" },
          { v: "16:9", l: "16:9 แนวนอนกว้าง" },
        ],
      }),
      f("radius", "มุมมนของรูป (px)", "range", { group: "media", default: 6, min: 0, numMax: 40, step: 2 }),
      f("follow", "รูปตามเมาส์แบบไหน", "select", {
        group: "media",
        default: "smooth",
        options: [
          { v: "smooth", l: "ลอยตามนุ่ม ๆ (แบบตัวอย่าง)" },
          { v: "snap", l: "ติดเมาส์ทันที" },
          { v: "fixed", l: "ขึ้นกลางจอ ไม่ตามเมาส์" },
        ],
      }),
      f("tilt", "รูปเอียงตามทิศที่เลื่อนเมาส์", "toggle", { group: "media", default: true, showIf: { key: "follow", eq: ["smooth", "snap"] } }),
      f("imgFx", "ท่าที่รูปโผล่", "select", {
        group: "media",
        default: "pop",
        options: [
          { v: "pop", l: "ขยายจากเล็ก" },
          { v: "fade", l: "จางเข้า" },
          { v: "clip", l: "เผยจากล่างขึ้นบน" },
        ],
      }),
      f("layer", "รูปอยู่หน้าหรือหลังตัวหนังสือ", "select", {
        group: "media",
        default: "front",
        options: [
          { v: "front", l: "หน้าตัวหนังสือ (แบบตัวอย่าง)" },
          { v: "back", l: "หลังตัวหนังสือ (ตัวหนังสือทับรูป)" },
        ],
      }),
      // 🖼 รูปตอนชี้พื้นหลัง (ที่ว่างที่ไม่ใช่คำ/กรอบ) — ไม่ใส่ = ชี้ที่ว่างแล้วไม่มีรูป (แบบเดิม)
      image("bgImageKey", "รูปตอนชี้พื้นหลัง (ที่ว่าง)", { hint: "เมาส์อยู่ในที่ว่างของ Section (ไม่ได้ชี้คำ/ไม่อยู่ในกรอบ) = รูปนี้ลอยตาม · มือถือแตะที่ว่าง = รูปขึ้น · ผูก 🔗 ชุดรูปได้" }),
      f("bgHref", "กดพื้นที่ว่างแล้วไปที่", "target", { group: "action", default: "", wide: true, hint: "ว่าง = กดไม่ได้ · มือถือ: แตะแรก = รูปขึ้น แตะซ้ำ = ไปลิงก์" }),
    ],
    children: {
      key: "items",
      label: "คำ / กรอบล่องหน",
      itemLabel: "คำ",
      icon: "🔤",
      min: 1,
      max: 16,
      fields: [
        // ⬚ กรอบล่องหน (kind zone) — มองไม่เห็นบนเว็บจริง · เมาส์อยู่ในกรอบ = รูปของกรอบลอยตาม · ลาก/ย่อขยายในพรีวิวได้ (ส่ง storefront-child-place)
        f("kind", "ชนิด", "select", {
          default: "word",
          options: [
            { v: "word", l: "🔤 คำ / บรรทัด" },
            { v: "zone", l: "⬚ กรอบล่องหน (วางตรงไหนก็ได้)" },
          ],
          hint: "กรอบล่องหน = ลูกค้ามองไม่เห็นกรอบ ชี้เข้าไปในกรอบแล้วรูปขึ้น · ในพรีวิวเห็นเส้นประ ลากย้าย/ลากมุมขวาล่างย่อขยายได้",
        }),
        text("text", "ข้อความ (1 บรรทัด)", { default: "", max: 60, wide: true, placeholder: "เช่น NEW ARRIVAL", showIf: { key: "kind", eq: ["word", "", undefined] } }),
        text("tag", "ป้ายเล็กข้างคำ", { default: "", max: 20, placeholder: "เช่น (12) หรือ NEW", showIf: { key: "kind", eq: ["word", "", undefined] } }),
        f("x", "กรอบ: ห่างจากซ้าย (%)", "range", { group: "layout", default: 4, min: 0, numMax: 95, step: 0.5, showIf: { key: "kind", eq: "zone" }, hint: "ลากกรอบในพรีวิวแทนได้" }),
        f("y", "กรอบ: ห่างจากบน (%)", "range", { group: "layout", default: 8, min: 0, numMax: 95, step: 0.5, showIf: { key: "kind", eq: "zone" } }),
        f("w", "กรอบ: กว้าง (%)", "range", { group: "layout", default: 24, min: 3, numMax: 100, step: 0.5, showIf: { key: "kind", eq: "zone" } }),
        f("h", "กรอบ: สูง (%)", "range", { group: "layout", default: 30, min: 3, numMax: 100, step: 0.5, showIf: { key: "kind", eq: "zone" } }),
        image("imageKey", "รูปที่ลอยขึ้นตอนชี้", { hint: "ผูก 🔗 ชุดรูปได้ — เปลี่ยนรูปที่แท็บชุดรูปแล้วที่นี่เปลี่ยนตาม" }),
        text("alt", "คำบรรยายรูป (Alt)", { default: "", max: 200, placeholder: "ว่าง = ใช้ข้อความของคำ" }),
        f("href", "กดแล้วไปที่", "target", { group: "action", default: "", wide: true, hint: "ว่าง = กดไม่ได้ (ชี้แล้วรูปขึ้นอย่างเดียว)" }),
      ],
      summary: (it) => `${it.kind === "zone" ? `⬚ ${s(it.alt) || "กรอบล่องหน"}` : s(it.text) || "คำ"}${it.imageKey ? "" : " · ยังไม่มีรูป"}`,
      blank: () => ({ kind: "word", text: "NEW WORD", tag: "", imageKey: null, alt: "", href: "" }),
      // ＋ เพิ่มกรอบ = กรอบล่องหนกลาง Section (เห็นทันทีในพรีวิว แล้วลากไปวาง) — ปุ่มหลัก "+ เพิ่มคำ" ยังเพิ่มคำเหมือนเดิม
      addOptions: [{ label: "กรอบล่องหน", icon: "⬚", preset: () => ({ kind: "zone", text: "", x: 38, y: 35, w: 24, h: 30 }) }],
      itemLabelOf: (it) => (it.kind === "zone" ? "กรอบล่องหน" : "คำ"),
      starter: () => [
        { text: "NEW ARRIVAL", href: "/shop" },
        { text: "BEST SELLER", href: "/shop" },
        { text: "OUR STORY", href: "" },
      ],
    },
    summary: (b) => {
      const live = arr(b.items).filter((i) => i.enabled !== false);
      const words = live.filter((i) => i.kind !== "zone" && s(i.text));
      const zones = live.filter((i) => i.kind === "zone").length;
      const parts = [words.length ? `${words.length} คำ · ${words.map((i) => s(i.text)).slice(0, 3).join(" / ")}` : "", zones ? `${zones} กรอบ` : "", b.bgImageKey ? "รูปพื้นหลัง" : ""].filter(Boolean);
      return parts.length ? parts.join(" · ") : "ยังไม่มีคำ";
    },
    validate: (b, label) => {
      const live = arr(b.items).filter((i) => i.enabled !== false);
      const words = live.filter((i) => i.kind !== "zone" && s(i.text));
      const zones = live.filter((i) => i.kind === "zone");
      if (!words.length && !zones.length) return [{ level: "error", message: `${label}: ยังไม่ได้ใส่คำหรือกรอบ` }];
      const out: Omit<ValidationIssue, "blockId">[] = [];
      const noImg = words.filter((i) => !i.imageKey).length;
      if (noImg) out.push({ level: "warning", message: `${label}: ${noImg} คำยังไม่มีรูป (ชี้แล้วจะไม่มีรูปขึ้น)` });
      const zoneNoImg = zones.filter((i) => !i.imageKey).length;
      if (zoneNoImg) out.push({ level: "warning", message: `${label}: ${zoneNoImg} กรอบยังไม่มีรูป (ชี้แล้วจะไม่มีรูปขึ้น)` });
      if (b.bgHref && !b.bgImageKey) out.push({ level: "warning", message: `${label}: ตั้งลิงก์พื้นที่ว่างแล้ว แต่ยังไม่มีรูปพื้นหลัง (มือถือแตะครั้งเดียวไปลิงก์เลย)` });
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
        showIf: { key: "pickerStyle", eq: ["auto", "cards", "rows", "pills", "strip", "", undefined] },
      }),
      f("codes", "เลือกสินค้า", "products", { group: "products", default: [], max: 24, wide: true, showIf: [{ key: "source", eq: "manual" }, { key: "pickerStyle", eq: ["auto", "cards", "rows", "pills", "strip", "", undefined] }] }),
      f("buttonText", "ข้อความปุ่ม", "text", { group: "products", default: "ใส่ตะกร้า", max: 40 }),
      // 🧭 ตัวเลือกรุ่น (มีตั้งแต่ 2 รุ่น) — เว็บร้าน components/home/PersonalizeLooks PzProducts
      f("pickerStyle", "หน้าตาตัวเลือกรุ่น", "select", {
        group: "products",
        default: "auto",
        wide: true,
        options: [
          { v: "auto", l: "ตามหน้าตา Section (A = การ์ด · B = ปุ่ม · แบบเดิม = ตารางรูปเดิม)" },
          { v: "cards", l: "A · การ์ดคอลเลกชัน — รูปใหญ่ ชื่อเด่น" },
          { v: "rows", l: "B · แถวรายการ — มีวงกลมเลือก ราคาชิดขวา" },
          { v: "pills", l: "C · ปุ่มเม็ดยา — กะทัดรัด" },
          { v: "strip", l: "D · แถบเลื่อน — ปัดซ้าย-ขวา (หลายรุ่น)" },
          { v: "grid", l: "🗂 ตารางสินค้าด้านบน — ตั้งค่าเหมือน Section ตารางสินค้าทุกช่อง · กดการ์ด = เลือกรุ่นแล้วเลื่อนลงมาปั๊ม" },
        ],
        hint: "แบบ A–D โชว์เมื่อมีสินค้าตั้งแต่ 2 รุ่น · ตารางสินค้า: ตั้งต่อในหมวด 🗂 ตารางสินค้าด้านบน (สินค้าที่ปั๊มชื่อไม่ได้จะไม่ขึ้น)",
      }),
      f("pickerName", "ชื่อรุ่นที่แสดง", "select", {
        group: "products",
        default: "collection",
        showIf: { key: "pickerStyle", eq: ["auto", "cards", "rows", "pills", "strip", "", undefined] },
        options: [
          { v: "collection", l: "ชื่อคอลเลกชัน (ไม่มี = ชื่อสินค้า)" },
          { v: "code", l: "รหัสรุ่น" },
          { v: "name", l: "ชื่อสินค้า" },
        ],
      }),
      f("pickerPrice", "ตัวเลือกรุ่น: ราคา", "toggle", { group: "products", default: true, showIf: { key: "pickerStyle", eq: ["auto", "cards", "rows", "pills", "strip", "", undefined] } }),
      f("pickerCode", "ตัวเลือกรุ่น: รหัสรุ่นตัวเล็ก", "toggle", { group: "products", default: true, showIf: { key: "pickerStyle", eq: ["auto", "cards", "rows", "pills", "strip", "", undefined] } }),
      f("pickerDots", "ตัวเลือกรุ่น: จุดสีที่มี", "toggle", { group: "products", default: true, showIf: { key: "pickerStyle", eq: ["auto", "cards", "rows", "pills", "strip", "", undefined] } }),
      f("pickerTagline", "ตัวเลือกรุ่น: คำโปรยสั้น", "toggle", { group: "products", default: true, showIf: { key: "pickerStyle", eq: ["auto", "cards", "rows", "pills", "strip", "", undefined] }, hint: "ข้อความในเครื่องหมายคำพูด “…” ช่วงต้นของคำอธิบายสินค้า (ไม่มี = บรรทัดแรก)" }),
      // 🎨 หน้าตา 3 แบบ (เว็บร้าน components/home/PersonalizeBlockClient) — ข้อมูลปั๊มชื่อชุดเดียวกัน
      f("look", "หน้าตา", "select", {
        group: "layout",
        default: "classic",
        wide: true,
        options: [
          { v: "classic", l: "แบบเดิม — เลือกสินค้าซ้าย · รูป + ตัวเลือกขวา" },
          { v: "studio", l: "A · สตูดิโอ — รูปใหญ่ หัวข้อ 1–5 เรียงข้างรูป (ปรับละเอียดได้)" },
          { v: "showcase", l: "B · โชว์เคสกลาง — รูปเด่นกลาง พิมพ์ใต้รูป แถบตัวเลือกเดียว" },
        ],
        hint: "ทุกแบบใช้รูป/ตำแหน่ง/แบบปั๊ม/ตัวที่ปั๊มได้ ที่ตั้งไว้รายรุ่น (แท็บ 🛍 ของรุ่น → ปั๊มชื่อ) — สลับแบบได้ตลอด",
      }),
      // ── A สตูดิโอ: ปรับละเอียด ──
      f("imgSide", "รูปอยู่ฝั่ง", "select", { group: "layout", default: "left", options: [{ v: "left", l: "ซ้าย" }, { v: "right", l: "ขวา" }], showIf: { key: "look", eq: "studio" } }),
      f("imgWidth", "ความกว้างรูป — จอคอม (%)", "range", { group: "layout", default: 55, min: 35, numMax: 70, step: 1, showIf: { key: "look", eq: "studio" }, hint: "มือถือ: รูปเต็มจออยู่บน ตัวเลือกอยู่ล่าง" }),
      f("panelGap", "ระยะห่างระหว่างหัวข้อ (px)", "range", { group: "layout", default: 20, min: 8, numMax: 48, step: 2, showIf: { key: "look", eq: "studio" } }),
      f("inputStyle", "ช่องพิมพ์ชื่อ", "select", { group: "layout", default: "line", options: [{ v: "line", l: "เส้นใต้ ตัวใหญ่" }, { v: "box", l: "กล่อง" }], showIf: { key: "look", eq: "studio" } }),
      f("btnWidth", "ปุ่มใส่ตะกร้า", "select", { group: "layout", default: "full", options: [{ v: "full", l: "เต็มแถว" }, { v: "auto", l: "พอดีคำ" }], showIf: { key: "look", eq: "studio" } }),
      f("stepNums", "เลขหน้าหัวข้อ (1 · 2 · 3)", "toggle", { group: "layout", default: true, showIf: { key: "look", eq: "studio" } }),
      f("liveBadge", "ป้าย ✨ พรีวิวสด บนรูป", "toggle", { group: "layout", default: true, showIf: { key: "look", eq: "studio" } }),
      f("stickyImg", "รูปค้างไว้ตอนเลื่อนจอ (จอคอม)", "toggle", { group: "layout", default: true, showIf: { key: "look", eq: "studio" } }),
      text("labelColor", "ชื่อหัวข้อ สี", { group: "layout", default: "", max: 30, showIf: { key: "look", eq: "studio" }, hint: "ว่าง = ใช้ชื่อตามรุ่น (เช่น สี)" }),
      text("labelName", "ชื่อหัวข้อ ช่องพิมพ์ชื่อ", { group: "layout", default: "", max: 30, showIf: { key: "look", eq: "studio" }, hint: "ว่าง = ชื่อของคุณ" }),
      text("labelFinish", "ชื่อหัวข้อ แบบปั๊ม", { group: "layout", default: "", max: 30, showIf: { key: "look", eq: "studio" }, hint: "ว่าง = แบบปั๊ม" }),
      text("labelPosition", "ชื่อหัวข้อ ตำแหน่ง", { group: "layout", default: "", max: 30, showIf: { key: "look", eq: "studio" }, hint: "ว่าง = ตำแหน่ง" }),
      f("showCount", "ตัวนับตัวอักษร (เช่น 5/10)", "toggle", { group: "layout", default: false }),
      f("showFree", "ข้อความใต้ปุ่ม", "toggle", { group: "layout", default: false, hint: "เช่น ปั๊มฟรี · ทำเสร็จใน 2–3 วันทำการ" }),
      text("freeNote", "ข้อความใต้ปุ่ม", { group: "layout", default: "ปั๊มฟรี · ทำเสร็จใน 2–3 วันทำการ", max: 80, wide: true, showIf: { key: "showFree", eq: true } }),
      f("showIdeas", "ไอเดียชื่อ (กดแล้วเติมให้)", "toggle", { group: "layout", default: false }),
      f("ideas", "ไอเดียชื่อ (บรรทัดละ 1)", "list", { group: "layout", default: ["LOVE", "MOM", "A.K."], max: 8, showIf: { key: "showIdeas", eq: true }, hint: "ตัวอักษรที่ปั๊มไม่ได้ (เช่น ภาษาไทย) จะถูกตัดออก · ยาวเกินที่รุ่นนั้นรับ = ไม่โชว์" }),
      f("showGallery", "แกลเลอรีรูปใต้พรีวิว", "toggle", { group: "layout", default: true, hint: "รูปอื่นของสีที่เลือก (เหมือนหน้าสินค้า) + ฉากพรีวิวมุมอื่นที่ตั้งไว้ในแท็บเว็บไซต์ของรุ่น" }),
      f("zoomMode", "การซูมรูป", "select", {
        group: "layout",
        default: "off",
        options: [
          { v: "off", l: "ปิด" },
          { v: "hover", l: "ชี้แล้วซูม (มือถือ: แตะเพื่อซูม)" },
          { v: "circle", l: "วงซูมตรงจุดปั๊ม (มุมล่างขวาของรูป)" },
        ],
      }),
    ],
    summary: (b) => `${({ studio: "A สตูดิโอ", showcase: "B โชว์เคส" } as Record<string, string>)[s(b.look)] ?? "แบบเดิม"} · ${s(b.source) === "manual" ? count((b.codes as unknown[])?.length ?? 0, "รุ่นที่เลือก") : "ทุกรุ่นที่เปิดปั๊มชื่อ"}`,
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
      f("cats", "หมวดที่โชว์", "categories", { group: "content", wide: true, hint: "ไม่เลือก = ทุกหมวดหลัก ตามลำดับในแท็บ 📂 หมวดหมู่ · ลาก ⠿ เรียงลำดับ · ✏️ = แก้ชื่อที่โชว์ · 🖼 = ตั้งรูปบนการ์ด + รูปที่วนเมื่อเอาเมาส์วาง (เฉพาะ Section นี้ · ไม่ตั้ง = ตามแท็บ 📂)" }),
      // รูปแทนรายหมวด (แก้ในช่อง "หมวดที่โชว์" ด้านบน) — หน้าร้านใช้แทน imageKey ของหมวด
      f("catImg", "รูปบนการ์ดรายหมวด", "categoryImages", { group: "content", hidden: true, default: {} }),
      // ชื่อแทนรายหมวด (✏️ ในช่อง "หมวดที่โชว์") — หน้าร้านใช้แทนชื่อหมวด (ทั้ง 2 ภาษา) · ไม่ตั้ง = ชื่อจากแท็บ 📂
      f("catName", "ชื่อบนการ์ดรายหมวด", "categoryNames", { group: "content", hidden: true, default: {} }),
      // 🔁 รูปที่วนเมื่อเอาเมาส์วาง รายหมวด (🖼 ในช่อง "หมวดที่โชว์" · เปิด "เปลี่ยนรูปเมื่อเอาเมาส์วาง" ก่อน) — ไม่ตั้ง = รูปสินค้าในหมวด
      f("cycleImg", "รูปวนรายหมวด", "categoryImageLists", { group: "content", hidden: true, default: {} }),
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
      // 🔁 การ์ดรูปใหญ่: เอาเมาส์วางแล้วรูปเปลี่ยนไปเรื่อย ๆ (เจ้าของขอ 2026-10-24 · ดู widget แล้วเลือก ซูมเข้า 0.3 วิ)
      //   รูปวนรายหมวด = cycleImg (🔁 ในช่อง "หมวดที่โชว์") · ไม่ตั้ง = รูปสินค้าในหมวด 4 รูปแรก · เว็บร้าน: CatCycle
      f("cycle", "🔁 เปลี่ยนรูปเมื่อเอาเมาส์วาง", "toggle", {
        group: "layout",
        default: false,
        showIf: TILE_ONLY,
        hint: "รูปที่วนของแต่ละหมวด ตั้งที่ 🖼 ในช่อง \"หมวดที่โชว์\" · ไม่ตั้ง = รูปสินค้าในหมวด 4 รูปแรก",
      }),
      f("cycleFx", "เอฟเฟกต์ตอนเปลี่ยนรูป", "select", {
        group: "layout",
        default: "in",
        display: "seg",
        options: [
          { v: "in", l: "ซูมเข้า" },
          { v: "out", l: "ซูมออก" },
          { v: "fade", l: "จางเฉย ๆ" },
          { v: "slide", l: "เลื่อน" },
        ],
        hint: "ซูมต่อเนื่องตลอดที่เอาเมาส์วาง (รูปใหม่ซูมต่อจากรูปก่อน ไม่สะดุด)",
        showIf: [TILE_ONLY, { key: "cycle", eq: true }],
      }),
      f("cycleSec", "เปลี่ยนรูปทุก (วินาที)", "range", { group: "layout", default: 0.3, min: 0.2, numMax: 4, step: 0.1, decimals: 1, showIf: [TILE_ONLY, { key: "cycle", eq: true }] }),
      f("cycleReset", "เอาเมาส์ออก = กลับรูปแรก", "toggle", { group: "layout", default: true, hint: "ปิด = ค้างรูปล่าสุดไว้", showIf: [TILE_ONLY, { key: "cycle", eq: true }] }),
      f("cycleMobile", "บนมือถือ (ไม่มีเมาส์)", "select", {
        group: "layout",
        default: "off",
        options: [
          { v: "off", l: "ไม่วน (รูปเดียว)" },
          { v: "view", l: "วนเองตอนการ์ดอยู่บนจอ" },
        ],
        hint: "มือถือวนช้าสุด 1 วิ/รูป (เร็วกว่านี้ลายตา)",
        showIf: [TILE_ONLY, { key: "cycle", eq: true }],
      }),
      // 📍 ชื่อหมวด: บนรูป (9 จุด + เลื่อนละเอียด) หรือ นอกรูป เหนือ/ใต้ (จัดซ้าย/กลาง/ขวา + ระยะห่าง) — ค่าเดิม = บนรูป บนซ้าย
      f("namePlace", "ชื่อหมวดอยู่ที่ไหน", "select", {
        group: "layout",
        default: "on",
        display: "seg",
        options: [
          { v: "on", l: "บนรูป" },
          { v: "above", l: "เหนือรูป" },
          { v: "below", l: "ใต้รูป" },
        ],
        hint: "เหนือ/ใต้รูป = ชื่อ (+ ข้อความเล็ก) อยู่นอกรูป ไม่บังรูป",
        showIf: TILE_ONLY,
      }),
      f("textPos", "ตำแหน่งชื่อบนรูป", "select", {
        group: "layout",
        default: "top-left",
        display: "pos9",
        options: POS9_OPTIONS,
        hint: "แถวบน = ข้อความเล็ก (SHOP NOW) อยู่ขอบล่างการ์ด · แถวกลาง/ล่าง = อยู่ติดใต้ชื่อ · ทรงโค้ง = จัดกึ่งกลางให้เอง",
        showIf: [TILE_ONLY, NAME_ON],
      }),
      f("nameDx", "เลื่อนชื่อ ซ้าย ↔ ขวา (%)", "range", { group: "layout", default: 0, min: -30, numMax: 30, step: 1, hint: "0 = ตรงตำแหน่งที่เลือก · ติดลบ = ไปซ้าย", showIf: [TILE_ONLY, NAME_ON] }),
      f("nameDy", "เลื่อนชื่อ บน ↕ ล่าง (%)", "range", { group: "layout", default: 0, min: -30, numMax: 30, step: 1, hint: "ติดลบ = ขึ้น · บวก = ลง", showIf: [TILE_ONLY, NAME_ON] }),
      f("nameAlign", "จัดชื่อ (นอกรูป)", "select", {
        group: "layout",
        default: "left",
        display: "seg",
        options: [
          { v: "left", l: "ซ้าย" },
          { v: "center", l: "กลาง" },
          { v: "right", l: "ขวา" },
        ],
        showIf: [TILE_ONLY, NAME_OUT],
      }),
      f("nameGap", "ระยะห่างชื่อกับรูป (px)", "range", { group: "layout", default: 10, min: 0, numMax: 40, step: 2, showIf: [TILE_ONLY, NAME_OUT] }),
      f("cta", "ข้อความเล็กบนการ์ด", "text", { group: "content", default: "SHOP NOW", max: 30, hint: "ว่าง = ไม่มี", showIf: { key: "layout", eq: "tile" } }),
      f("tileText", "สีตัวอักษรบนรูป", "select", {
        group: "layout",
        default: "dark",
        options: [
          { v: "dark", l: "เข้ม (รูปโทนอ่อน)" },
          { v: "light", l: "ขาว + เงาไล่ (รูปโทนเข้ม)" },
        ],
        showIf: [TILE_ONLY, NAME_ON],
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
      // 🔤 หน้าตาชื่อหมวด (ทุกแบบแสดง) — ค่าเริ่ม = ฟอนต์หัวข้อธีม · 100% · สีเดิม = หน้าตาเดิม
      f("nameFont", "ฟอนต์ชื่อหมวด", "select", { group: "layout", default: "display", options: CANVAS_FONTS, display: "font" }),
      f("nameSize", "ขนาดชื่อหมวด (%)", "range", { group: "layout", default: 100, min: 60, numMax: 250, step: 5, hint: "100 = ปกติ · มือถือย่อตามสัดส่วนเดิม" }),
      f("nameColor", "สีชื่อหมวด", "select", { group: "layout", default: "auto", options: [{ v: "auto", l: "ตามเดิม (การ์ดรูปใหญ่ = ตาม \"สีตัวอักษรบนรูป\")" }, ...CANVAS_COLORS] }),
      f("nameColorHex", "สีชื่อหมวด (เลือกเอง)", "color", { group: "layout", default: "", showIf: { key: "nameColor", eq: "custom" } }),
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
      // 🎬 เลื่อนลงแล้วการ์ดวิ่งข้าง (แบบเว็บ Apple · เว็บร้าน RowScrollPin) — ใช้กับแบบเลื่อนข้าง
      f("scrollRow", "🎬 เลื่อนลงแล้วการ์ดวิ่งข้าง (แบบ Apple)", "toggle", {
        group: "layout",
        default: false,
        hint: "Section ค้างบนจอ แล้วการเลื่อนลงพาการ์ดวิ่งไปทางข้างจนสุดแถว ค่อยเลื่อนต่อ (เลื่อนย้อน = วิ่งกลับ) · เปิดแล้วไม่เลื่อนเอง · ลูกค้าที่ตั้งลดการเคลื่อนไหว = เลื่อนข้างแบบปกติ",
        showIf: { key: "layout", eq: ["carousel"], orKey: "layoutMobile" },
      }),
      f("columns", "คอลัมน์ (ตารางบนคอม)", "number", { group: "layout", default: 4, min: 2, numMax: 5, hint: "แบบแท็บ: = การ์ดต่อแถวบนคอม ทั้งตารางและเลื่อนข้าง", showIf: { key: "layout", eq: ["grid", "rank", "tabs"] } }),
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
      // 🗂 แท็บ: แบ่งตามหมวด (เดิม) หรือรุ่นสินค้า (Parent SKU — กดแท็บแล้วโชว์ SKU ของรุ่นนั้น) · เว็บร้าน src/components/home/ProductsTabs.tsx + src/lib/product-tabs.ts
      f("tabBy", "แบ่งแท็บตาม", "select", {
        group: "layout",
        default: "cat",
        wide: true,
        options: [
          { v: "cat", l: "หมวด (แบบเดิม)" },
          { v: "parent", l: "รุ่นสินค้า (Parent SKU) — กดแท็บแล้วโชว์ SKU ของรุ่นนั้น" },
        ],
        showIf: TABS_LAYOUT,
      }),
      f("tabCats", "หมวดที่เป็นแท็บ", "categories", { group: "layout", default: [], max: 8, wide: true, hint: "ว่าง = ทุกหมวดที่มีสินค้า", showIf: [TABS_LAYOUT, { key: "tabBy", eq: "cat" }] }),
      f("tabParents", "รุ่นที่เป็นแท็บ (เรียงตามที่เลือก)", "products", {
        group: "layout",
        default: [],
        max: 12,
        wide: true,
        hint: "ว่าง = รุ่นของสินค้าใน Section นี้ (เรียงตามลำดับ) · กดแท็บ = SKU ของรุ่นนั้นที่ Section นี้เลือกไว้ (ไม่ได้เลือกไว้ = ทุกสีของรุ่น) · 🖼 ที่แถว = เลือกรูปบนแท็บ (รูป SKU / อัปโหลด / คลัง)",
        rowImages: { images: "tabImages", skus: "tabThumbs" },
        showIf: [TABS_LAYOUT, { key: "tabBy", eq: "parent" }],
      }),
      // 🖼 รูปบนแท็บที่อัปโหลด/เลือกจากคลัง { รหัสรุ่น: r2 key } — ตั้งที่แถวของ "รุ่นที่เป็นแท็บ" (มาก่อนรูป SKU)
      f("tabImages", "รูปบนแท็บรายรุ่น", "productImages", { group: "layout", hidden: true, default: {} }),
      f("tabStyle", "หน้าตาแท็บ", "select", {
        group: "layout",
        default: "both",
        options: [
          { v: "both", l: "รูป + ชื่อ" },
          { v: "img", l: "รูปอย่างเดียว (วงกลม · ชี้ดูชื่อ)" },
          { v: "txt", l: "ชื่ออย่างเดียว" },
        ],
        hint: "ชื่อบนแท็บตัดคำที่ทุกแท็บมีเหมือนกันออกเอง (เช่น ชื่อคอลเลกชัน)",
        showIf: [TABS_LAYOUT, { key: "tabBy", eq: "parent" }],
      }),
      f("tabThumbs", "รูปบนแท็บ (เลือก SKU ต่อรุ่น)", "skus", {
        group: "layout",
        default: [],
        max: 12,
        wide: true,
        // ตั้งที่แถวของ "รุ่นที่เป็นแท็บ" (🖼) แทนแล้ว — ซ่อนช่องนี้ ข้อมูลเดิมยังใช้ได้
        hidden: true,
        hint: "แท็บใช้รูปของสีที่เลือก · รุ่นที่ไม่ได้เลือก = รูปปก Parent · เลือกได้รุ่นละ 1 SKU (ซ้ำ = ใช้ตัวแรก)",
        showIf: TAB_PIC,
      }),
      f("tabThumbShape", "ทรงรูปบนแท็บ", "select", {
        group: "layout",
        default: "circle",
        options: [
          { v: "circle", l: "วงกลม (เดิม)" },
          { v: "rounded", l: "สี่เหลี่ยมมุมมน" },
          { v: "square", l: "สี่เหลี่ยม" },
        ],
        showIf: TAB_PIC,
      }),
      f("tabThumbSize", "ขนาดรูปบนแท็บ (คอม · px)", "range", { group: "layout", default: 0, min: 0, numMax: 120, step: 2, hint: "0 = อัตโนมัติ (รูป+ชื่อ 30 · รูปอย่างเดียว 52)", showIf: TAB_PIC }),
      f("tabThumbSizeM", "ขนาดรูปบนแท็บ (มือถือ · px)", "range", { group: "layout", default: 0, min: 0, numMax: 120, step: 2, hint: "0 = 80% ของขนาดบนคอม", showIf: TAB_PIC }),
      f("tabRest", "ต่อท้ายด้วย SKU รุ่นอื่น", "toggle", {
        group: "layout",
        default: false,
        hint: "กดแท็บรุ่นแล้ว โชว์ SKU ของรุ่นนั้นก่อน ตามด้วย SKU อื่นใน Section นี้",
        wide: true,
        showIf: [TABS_LAYOUT, { key: "tabBy", eq: "parent" }],
      }),
      f("tabRestSep", "คั่นด้วยคำว่า \"รุ่นอื่น\"", "toggle", { group: "layout", default: true, wide: true, showIf: [TABS_LAYOUT, { key: "tabBy", eq: "parent" }, { key: "tabRest", eq: true }] }),
      f("tabAll", "มีแท็บ \"ทั้งหมด\" เป็นแท็บแรก", "toggle", { group: "layout", default: true, hint: "ใช้สินค้าตาม \"ดึงสินค้าจาก\"", showIf: TABS_LAYOUT }),
      f("tabBody", "ใต้แท็บโชว์แบบ", "select", {
        group: "layout",
        default: "grid",
        options: [
          { v: "grid", l: "ตาราง (แบบเดิม)" },
          { v: "carousel", l: "เลื่อนข้าง" },
        ],
        hint: "การ์ดต่อแถวบนคอม = ช่อง \"คอลัมน์\" (ใช้ทั้งตารางและเลื่อนข้าง)",
        showIf: TABS_LAYOUT,
      }),
      f("tabColsM", "การ์ดต่อแถวบนมือถือ", "select", {
        group: "layout",
        default: "auto",
        options: [
          { v: "auto", l: "อัตโนมัติ (แบบเดิม)" },
          { v: "1", l: "1 ใบ" },
          { v: "2", l: "2 ใบ" },
          { v: "3", l: "3 ใบ" },
        ],
        hint: "เลื่อนข้าง = เห็นเต็ม N ใบ + ขอบใบถัดไป",
        showIf: TABS_LAYOUT,
      }),
      f("tabNav", "แถบแท็บ", "select", {
        group: "layout",
        default: "scroll",
        options: [
          { v: "scroll", l: "เลื่อนด้วยนิ้ว/เมาส์ (แบบเดิม)" },
          { v: "arrows", l: "มีปุ่มลูกศร ◀ ▶ (โผล่เมื่อแท็บล้นจอ)" },
        ],
        showIf: TABS_LAYOUT,
      }),
      f("tabMax", "จำนวนแท็บที่โชว์", "number", { group: "layout", default: 0, min: 0, numMax: 30, hint: "0 = ทุกแท็บ · ตั้งไว้ = ที่เกินรวมเป็นปุ่ม \"+N\" กดแล้วกางออก (นับรวมแท็บทั้งหมด)", showIf: TABS_LAYOUT }),
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

/* ── 🗂 Section ปั๊มชื่อ → ตารางสินค้าด้านบน ──
 * ช่องตั้งค่า = ชุดเดียวกับ Section ตารางสินค้า (ไม่รวมหัวข้อ/ปุ่มดูทั้งหมด) สร้างอัตโนมัติ คีย์ขึ้นต้น "pg_"
 * → ตารางสินค้าได้ตัวเลือกใหม่เมื่อไหร่ Section ปั๊มชื่อได้ตามเอง · โชว์เมื่อ pickerStyle = grid
 * แหล่ง "✦ ทุกรุ่นที่ปั๊มชื่อได้" (ค่าเริ่ม) · แหล่งอื่น = ตัดรุ่นที่ปั๊มชื่อไม่ได้ทิ้งเอง (เว็บร้าน personalize-look pzGridBlockOf) */
export const PZ_GRID_PREFIX = "pg_";
const PZ_GRID_ON: ShowIf = { key: "pickerStyle", eq: "grid" };
const pzKey = (k: string) => PZ_GRID_PREFIX + k;
const pzUnprefix = (b: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(b).filter(([k]) => k.startsWith(PZ_GRID_PREFIX)).map(([k, v]) => [k.slice(PZ_GRID_PREFIX.length), v]));
function pzGridField(fd: FieldDef, defaults: Map<string, unknown>): FieldDef {
  const cond = (c: ShowIf): ShowIf => {
    // เงื่อนไขที่อ้างแหล่งสินค้าแบบรายการ (เช่น การ์ดแยก SKU) → แหล่งใหม่ "personalize" ใช้ได้ด้วย
    let eq: unknown = c.key === "source" && Array.isArray(c.eq) && (c.eq as unknown[]).includes("all") ? [...(c.eq as unknown[]), "personalize"] : c.eq;
    // เพิ่งสลับมาใช้ตาราง = ช่อง pg_ ยังไม่มีค่า → ถือเป็นค่าเริ่มของช่องนั้น (ไม่งั้นช่องที่ควรโชว์จะซ่อนจนกว่าจะเลือกเอง)
    const d = defaults.get(c.key);
    if (d !== undefined && (Array.isArray(eq) ? (eq as unknown[]).includes(d) : eq === d)) eq = [...(Array.isArray(eq) ? (eq as unknown[]) : [eq]), undefined];
    return { key: pzKey(c.key), eq, ...(c.orKey ? { orKey: pzKey(c.orKey) } : {}) };
  };
  const own = fd.showIf ? (Array.isArray(fd.showIf) ? fd.showIf : [fd.showIf]).map(cond) : [];
  const out: FieldDef = { ...fd, key: pzKey(fd.key), group: fd.group === "card" ? "card" : "grid", showIf: [PZ_GRID_ON, ...own] };
  if (fd.rowImages) out.rowImages = { images: pzKey(fd.rowImages.images), skus: pzKey(fd.rowImages.skus) };
  if (fd.presets) out.presets = Object.fromEntries(Object.entries(fd.presets).map(([v, patch]) => [v, Object.fromEntries(Object.entries(patch).map(([k, x]) => [pzKey(k), x]))]));
  if (fd.copyShopCard) {
    const copy = fd.copyShopCard;
    out.copyShopCard = (card, item) => Object.fromEntries(Object.entries(copy(card, pzUnprefix(item))).map(([k, x]) => [pzKey(k), x]));
  }
  if (fd.key === "source") {
    out.default = "personalize";
    out.label = "ดึงสินค้าจาก";
    out.hint = "แหล่งอื่น = ขึ้นเฉพาะรุ่นที่เปิดปั๊มชื่อไว้ (รุ่นที่ปั๊มไม่ได้ตัดทิ้งเอง)";
    out.options = [{ v: "personalize", l: "✦ ทุกรุ่นที่ปั๊มชื่อได้" }, ...(fd.options ?? [])];
  }
  return out;
}
{
  const head = new Set([...headFields({ eyebrow: "", title: "", subtitle: true }).map((x) => x.key), "more"]);
  const pz = SECTION_SCHEMAS.personalize;
  const products = SECTION_SCHEMAS.products;
  const defaults = new Map<string, unknown>([...products.fields.map((fd) => [fd.key, fd.default] as const), ["source", "personalize"]]);
  pz.fields.push(...products.fields.filter((fd) => !head.has(fd.key)).map((fd) => pzGridField(fd, defaults)));
  const own = pz.validate;
  pz.validate = (b, label) => [...(own ? own(b, label) : []), ...(s(b.pickerStyle) === "grid" && products.validate ? products.validate(pzUnprefix(b), `${label} › ตารางสินค้า`) : [])];
}

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

/**
 * ⭐ การ์ดสำเร็จรูปในคลัง Section (ของกลาง) — สร้างจากชนิดที่มีอยู่ + ค่าตั้งต้น (ไม่ใช่ชนิดใหม่ → เครื่องมือของชนิดนั้นใช้ได้ครบ)
 * ตัวจัดหน้าโชว์ในกลุ่มเดียวกับชนิดนั้น เมื่อร้านใช้ชนิดนั้นได้ (เช่น ผืนผ้าใบ = เปิดสวิตช์ทดลองแล้ว)
 */
export interface SectionPreset {
  id: string;
  type: string;
  label: string;
  icon: string;
  hint: string;
  group: string;
  /** ค่าที่ทับ Section ใหม่ (รวมชิ้นย่อย) — ผ่านตัวทำความสะอาดอีกชั้นตอนใส่ */
  values: () => Record<string, unknown>;
}
export const SECTION_PRESETS: SectionPreset[] = [
  {
    id: "canvas-folders",
    type: "canvas",
    label: "แฟ้มวางอิสระ",
    icon: "🗂",
    hint: "แฟ้มซ้อนกัน แต่ละแฟ้มวางรูป วิดีโอ ข้อความ ของตกแต่งได้อิสระ — ลาก/ย่อ/หมุนในพรีวิว",
    group: "พื้นฐาน",
    values: folderCanvasStarter,
  },
];

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
    case "frameShape":
    case "shopPattern":
      return null;
    case "patternSlots":
      return [];
    case "link":
      return { text: "", href: "" };
    case "list":
    case "products":
    case "skus":
    case "categories":
      return [];
    case "categoryImages":
    case "categoryNames":
    case "categoryImageLists":
    case "productImages":
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
