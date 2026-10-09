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
  | "color" // สี #rrggbb
  | "list" // รายการข้อความ string[]
  | "emoji" // ไอคอนอีโมจิ (สั้น ๆ)
  | "video" // ลิงก์ YouTube/Vimeo (กรองโฮสต์)
  | "map" // ลิงก์ฝัง Google Maps (กรองโฮสต์)
  | "products" // เลือกสินค้าหลายตัว (เก็บรหัสรุ่น code[])
  | "category" // หมวดสินค้าบนเว็บของร้าน (key)
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
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
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
  /** โชว์เฉพาะเมื่อช่องอื่นมีค่าตามนี้ เช่น { key: "source", eq: "manual" } */
  showIf?: { key: string; eq: unknown };
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

/** หัวข้อมาตรฐานของ Section ส่วนใหญ่: คำโปรยเล็ก + หัวข้อ (+ คำอธิบาย) */
const headFields = (opts: { eyebrow?: string; title?: string; subtitle?: boolean; subtitleMax?: number } = {}): FieldDef[] => [
  text("eyebrow", "คำโปรยเหนือหัวข้อ", { default: opts.eyebrow ?? "", max: 120, placeholder: "เช่น ขายดี" }),
  text("title", "หัวข้อ", { default: opts.title ?? "", max: 160, wide: true }),
  ...(opts.subtitle ? [area("subtitle", "คำอธิบายใต้หัวข้อ", { default: "", max: opts.subtitleMax ?? 400 })] : []),
];

const count = (n: number, unit: string) => `${n} ${unit}`;
const s = (v: unknown) => String(v ?? "").trim();
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

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
      f("columns", "จำนวนคอลัมน์", "number", { group: "layout", default: 3, min: 2, numMax: 4 }),
    ],
    children: {
      key: "items",
      label: "รูปในแกลเลอรี",
      itemLabel: "รูป",
      icon: "🏞️",
      max: 24,
      fields: [image("imageKey", "รูป"), text("alt", "คำบรรยายรูป (Alt)", { default: "", max: 200 }), text("caption", "ข้อความใต้รูป", { default: "", max: 200 })],
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
      image("imageKey", "รูปภาพ", { hint: "แนะนำสัดส่วน 4:3 หรือ 1:1", required: true, requiredMessage: "ยังไม่ได้เลือกรูป" }),
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
    ],
    summary: (b) => `${count((b.codes as unknown[])?.length ?? 0, "รุ่น")}${s(b.bigText) ? ` · ${s(b.bigText)}` : ""}`,
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
    meta: { label: "หมวดสินค้า", icon: "📂", hint: "ปุ่มลัดไปแต่ละหมวด (รายการหมวดตั้งที่แท็บจับคู่ฟิลด์)", group: "สินค้า" },
    fields: headFields({ eyebrow: "เลือกตามหมวด", title: "เลือกซื้อตามหมวด" }),
    summary: (b) => s(b.title) || "หมวดสินค้า",
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
        default: "manual",
        wide: true,
        options: [
          { v: "manual", l: "เลือกเองทีละรุ่น" },
          { v: "category", l: "ทั้งหมวด" },
          { v: "featured", l: "ที่ติ๊ก ★ แนะนำ" },
          { v: "all", l: "สินค้าทั้งหมด (ล่าสุดก่อน)" },
        ],
      }),
      f("codes", "เลือกสินค้า", "products", { group: "products", default: [], max: 24, wide: true, showIf: { key: "source", eq: "manual" } }),
      f("category", "หมวด", "category", { group: "products", default: "", showIf: { key: "source", eq: "category" } }),
      f("limit", "จำนวนสูงสุด", "number", { group: "products", default: 8, min: 1, numMax: 24 }),
      f("layout", "รูปแบบ", "select", {
        group: "layout",
        default: "grid",
        options: [
          { v: "grid", l: "ตาราง" },
          { v: "carousel", l: "เลื่อนข้าง (Carousel)" },
        ],
      }),
      f("columns", "คอลัมน์ (ตารางบนคอม)", "number", { group: "layout", default: 4, min: 2, numMax: 5 }),
      link("more", "ปุ่ม \"ดูทั้งหมด\"", "ดูทั้งหมด", "/shop"),
    ],
    summary: (b) => {
      const src = s(b.source);
      if (src === "manual") return count((b.codes as unknown[])?.length ?? 0, "รุ่นที่เลือก");
      if (src === "category") return `หมวด ${s(b.category) || "(ยังไม่เลือก)"}`;
      if (src === "featured") return "สินค้าที่ติ๊กแนะนำ";
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
      return [];
    default:
      return "";
  }
}

export function structuredCloneSafe<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** รหัสชิ้นย่อยใหม่ (ไม่ซ้ำพอสำหรับในหน้าเดียวกัน) */
export const newChildId = (key: string) => `${key}-${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 1000)}`;
