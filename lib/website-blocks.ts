/**
 * ของกลาง — นิยาม "บล็อก" ของหน้าเว็บร้าน (เก็บที่ shops.home_layout / store_pages.layout)
 *
 * โครงเดิมในระบบเป็น array ของ { type, ...props } อยู่แล้ว (ร้าน Pixiedustie ใช้ hero/product-grid)
 * ไฟล์นี้เพิ่มชนิดบล็อกสำหรับเว็บร้านวัสดุ โดย "ไม่แตะ" ชนิดเดิมของร้านอื่น
 *
 * ใช้ที่: /api/website/layout · /api/website/pages · /api/public/storefront/* · UI ตัวจัดหน้า
 */

export type BlockType =
  | "announcement"
  | "hero"
  | "two-tracks"
  | "categories"
  | "featured"
  | "faq"
  | "cta"
  | "rich-text"
  | "image"
  | "gallery";

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
export type BlockBg = "auto" | "page" | "surface" | "brand" | "ink" | "custom";

export const BLOCK_SPACINGS: readonly BlockSpacing[] = ["auto", "none", "sm", "md", "lg"];
export const BLOCK_WIDTHS: readonly BlockWidth[] = ["auto", "narrow", "full"];
export const BLOCK_ALIGNS: readonly BlockAlign[] = ["auto", "left", "center", "right"];
export const BLOCK_BGS: readonly BlockBg[] = ["auto", "page", "surface", "brand", "ink", "custom"];

/** หน้าตาของบล็อก — แยกจาก "เนื้อหา" ทุกชนิดบล็อกมีชุดนี้เหมือนกัน */
export interface BlockStyle {
  padTop: BlockSpacing;
  padBottom: BlockSpacing;
  bg: BlockBg;
  /** ใช้เมื่อ bg = "custom" เท่านั้น (#rrggbb) */
  bgColor: string;
  width: BlockWidth;
  align: BlockAlign;
}

export const DEFAULT_BLOCK_STYLE: BlockStyle = {
  padTop: "auto",
  padBottom: "auto",
  bg: "auto",
  bgColor: "",
  width: "auto",
  align: "auto",
};

export interface BlockBase {
  id: string;
  type: BlockType;
  /** ปิดชั่วคราวโดยไม่ต้องลบ (ปิดแล้วไม่แสดงทุกอุปกรณ์) */
  enabled: boolean;
  visibility: Visibility;
  style: BlockStyle;
}

export interface CtaLink {
  text: string;
  href: string;
}

export interface AnnouncementBlock extends BlockBase {
  type: "announcement";
  messages: string[];
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
  features: { title: string; desc: string }[];
  /** รูปพื้นหลัง (r2 key) — ว่าง = ใช้พื้นหลังไล่สีเดิม */
  imageKey: string | null;
  imageAlt: string;
  /** ความทึบของสีดำที่ทับรูป 0–90 (%) */
  overlay: number;
  height: HeroHeight;
}

export interface TwoTracksBlock extends BlockBase {
  type: "two-tracks";
  eyebrow: string;
  title: string;
  subtitle: string;
  cards: {
    emoji: string;
    title: string;
    desc: string;
    bullets: string[];
    primary: CtaLink;
    secondary: CtaLink;
    dark: boolean;
  }[];
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

export interface FaqBlock extends BlockBase {
  type: "faq";
  eyebrow: string;
  title: string;
  subtitle: string;
  items: { q: string; a: string }[];
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
  alt: string;
  caption: string;
  width: ImageWidth;
  /** ลิงก์เมื่อคลิกรูป (ไม่ใส่ = ไม่คลิก) */
  href: string;
}

export interface GalleryBlock extends BlockBase {
  type: "gallery";
  eyebrow: string;
  title: string;
  columns: number;
  items: { imageKey: string | null; alt: string; caption: string }[];
}

export type Block =
  | AnnouncementBlock
  | HeroBlock
  | TwoTracksBlock
  | CategoriesBlock
  | FeaturedBlock
  | FaqBlock
  | CtaBlock
  | RichTextBlock
  | ImageBlock
  | GalleryBlock;

export const BLOCK_META: Record<BlockType, { label: string; icon: string; hint: string; group: string }> = {
  announcement: { label: "แถบประกาศ", icon: "🎗️", hint: "ข้อความเลื่อนบนสุดของเว็บ", group: "พื้นฐาน" },
  hero: { label: "แบนเนอร์หลัก (Hero)", icon: "🖼️", hint: "หัวเรื่องใหญ่ + รูปพื้นหลัง + ปุ่ม", group: "พื้นฐาน" },
  "rich-text": { label: "ข้อความอิสระ", icon: "📝", hint: "หัวข้อ + ย่อหน้าอิสระ", group: "พื้นฐาน" },
  image: { label: "รูปภาพ", icon: "🏞️", hint: "รูปเดี่ยว + คำบรรยาย", group: "พื้นฐาน" },
  gallery: { label: "แกลเลอรีรูป", icon: "🖼️", hint: "หลายรูปเรียงเป็นตาราง", group: "พื้นฐาน" },
  "two-tracks": { label: "สองบริการ", icon: "⚖️", hint: "การ์ดเปรียบเทียบ 2 บริการ", group: "เนื้อหา" },
  categories: { label: "หมวดสินค้า", icon: "📂", hint: "ปุ่มลัดไปแต่ละหมวด", group: "สินค้า" },
  featured: { label: "สินค้าแนะนำ", icon: "⭐", hint: "ดึงสินค้าที่ติ๊กแนะนำมาแสดง", group: "สินค้า" },
  faq: { label: "คำถามที่พบบ่อย", icon: "❓", hint: "รายการถาม-ตอบแบบพับได้", group: "เนื้อหา" },
  cta: { label: "แถบชวนติดต่อ", icon: "📣", hint: "กล่องสีเน้น + ปุ่ม", group: "เนื้อหา" },
};

const uid = (t: string, n: number) => `${t}-${n}`;
const ALL_VISIBLE: Visibility = { desktop: true, tablet: true, mobile: true };

/** บล็อกเปล่าเมื่อกด "เพิ่มบล็อก" */
export function newBlock(type: BlockType, seq: number): Block {
  const base = { id: uid(type, seq), type, enabled: true, visibility: { ...ALL_VISIBLE }, style: { ...DEFAULT_BLOCK_STYLE } };
  switch (type) {
    case "announcement":
      return { ...base, type, messages: ["ข้อความประกาศของร้าน"] };
    case "hero":
      return {
        ...base,
        type,
        eyebrow: "รับผลิตเครื่องหนัง & วัสดุงานหนัง",
        title: "งานหนังคุณภาพ",
        titleAccent: "ครบ จบ ที่เดียว",
        subtitle: "รับผลิตกระเป๋าและเข็มขัดหนังแท้สำหรับแบรนด์ของคุณ พร้อมจำหน่ายวัสดุงานหนังครบวงจร",
        primary: { text: "ขอใบเสนอราคา", href: "/quote" },
        secondary: { text: "เข้าร้านวัสดุ", href: "/shop" },
        features: [
          { title: "หนังแท้", desc: "คัดเกรดทุกผืน" },
          { title: "งานเย็บมือ", desc: "ประณีตทุกตะเข็บ" },
        ],
        imageKey: null,
        imageAlt: "",
        overlay: 45,
        height: "auto",
      };
    case "two-tracks":
      return {
        ...base,
        type,
        eyebrow: "บริการของเรา",
        title: "สองบริการหลัก",
        subtitle: "",
        cards: [
          { emoji: "🏭", title: "รับผลิต (OEM)", desc: "", bullets: [], primary: { text: "ขอใบเสนอราคา", href: "/quote" }, secondary: { text: "ดูผลงาน", href: "/gallery" }, dark: true },
          { emoji: "🛒", title: "ร้านวัสดุ", desc: "", bullets: [], primary: { text: "เข้าร้าน", href: "/shop" }, secondary: { text: "", href: "" }, dark: false },
        ],
      };
    case "categories":
      return { ...base, type, eyebrow: "ร้านวัสดุ", title: "เลือกซื้อตามหมวด" };
    case "featured":
      return { ...base, type, eyebrow: "ขายดี", title: "วัสดุแนะนำ", limit: 4 };
    case "faq":
      return { ...base, type, eyebrow: "คำถามที่พบบ่อย", title: "เรื่องที่ลูกค้าถามบ่อย", subtitle: "", items: [{ q: "คำถาม", a: "คำตอบ" }] };
    case "cta":
      return { ...base, type, title: "มีแบบในใจแล้ว?", subtitle: "", primary: { text: "ขอใบเสนอราคา", href: "/quote" }, secondary: { text: "ติดต่อเรา", href: "/contact" } };
    case "rich-text":
      return { ...base, type, eyebrow: "", title: "หัวข้อ", body: "เนื้อหา" };
    case "image":
      return { ...base, type, imageKey: null, alt: "", caption: "", width: "wide", href: "" };
    case "gallery":
      return { ...base, type, eyebrow: "", title: "แกลเลอรี", columns: 3, items: [] };
  }
}

/** โครงหน้าแรกเริ่มต้น (ตรงกับหน้าเว็บปัจจุบัน) */
export function defaultLayout(): Block[] {
  return [
    newBlock("announcement", 1),
    newBlock("hero", 2),
    newBlock("two-tracks", 3),
    newBlock("categories", 4),
    newBlock("featured", 5),
    newBlock("faq", 6),
    newBlock("cta", 7),
  ];
}

const R2_KEY = /^[a-zA-Z0-9._/-]+$/;
const str = (v: unknown, fb = "", max = 2000) => (typeof v === "string" ? v.slice(0, max) : fb);
const strArr = (v: unknown, max = 20) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, max).map((s) => (s as string).slice(0, 300)) : [];
const imgKey = (v: unknown): string | null =>
  typeof v === "string" && v.trim() && R2_KEY.test(v.trim()) ? v.trim().slice(0, 300) : null;
const num = (v: unknown, fb: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fb;
};
const link = (v: unknown, fbText = "", fbHref = "/"): CtaLink => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { text: str(o.text, fbText, 60), href: str(o.href, fbHref, 200) };
};
const vis = (v: unknown): Visibility => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { desktop: o.desktop !== false, tablet: o.tablet !== false, mobile: o.mobile !== false };
};

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const pickOne = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fb;

/** หน้าตาของบล็อก — บล็อกเก่าที่ยังไม่มี style จะได้ค่าเริ่มต้นเสมอ (เว็บแสดงผลเหมือนเดิม) */
const sty = (v: unknown): BlockStyle => {
  const o = (v ?? {}) as Record<string, unknown>;
  const d = DEFAULT_BLOCK_STYLE;
  const bgColor = typeof o.bgColor === "string" && HEX6.test(o.bgColor.trim()) ? o.bgColor.trim().toLowerCase() : "";
  const bg = pickOne(o.bg, BLOCK_BGS, d.bg);
  return {
    padTop: pickOne(o.padTop, BLOCK_SPACINGS, d.padTop),
    padBottom: pickOne(o.padBottom, BLOCK_SPACINGS, d.padBottom),
    // เลือก "สีเอง" แต่ยังไม่ได้ใส่สี → ถือว่าไม่ได้ตั้ง กันบล็อกกลายเป็นพื้นโปร่งแปลก ๆ
    bg: bg === "custom" && !bgColor ? d.bg : bg,
    bgColor,
    width: pickOne(o.width, BLOCK_WIDTHS, d.width),
    align: pickOne(o.align, BLOCK_ALIGNS, d.align),
  };
};

/**
 * ทำให้ข้อมูลที่มาจาก DB/ฟอร์มปลอดภัยและครบเสมอ
 * บล็อกชนิดที่ไม่รู้จัก (เช่นของร้านอื่น) จะถูกข้ามไป ไม่แก้ไข
 */
export function normalizeBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];

  raw.slice(0, 60).forEach((item, i) => {
    const b = (item ?? {}) as Record<string, unknown>;
    const type = str(b.type) as BlockType;
    if (!BLOCK_META[type]) return;

    const base = {
      id: str(b.id, uid(type, i + 1), 60),
      type,
      enabled: b.enabled !== false,
      visibility: vis(b.visibility),
      style: sty(b.style),
    };

    switch (type) {
      case "announcement":
        out.push({ ...base, type, messages: strArr(b.messages, 10) });
        break;
      case "hero":
        out.push({
          ...base,
          type,
          eyebrow: str(b.eyebrow, "", 120),
          title: str(b.title, "", 120),
          titleAccent: str(b.titleAccent, "", 120),
          subtitle: str(b.subtitle, "", 600),
          primary: link(b.primary, "ขอใบเสนอราคา", "/quote"),
          secondary: link(b.secondary, "เข้าร้านวัสดุ", "/shop"),
          features: Array.isArray(b.features)
            ? (b.features as Record<string, unknown>[]).slice(0, 6).map((f) => ({ title: str(f?.title, "", 60), desc: str(f?.desc, "", 120) }))
            : [],
          imageKey: imgKey(b.imageKey),
          imageAlt: str(b.imageAlt, "", 200),
          overlay: num(b.overlay, 45, 0, 90),
          height: (["auto", "tall", "full"] as const).includes(b.height as HeroHeight) ? (b.height as HeroHeight) : "auto",
        });
        break;
      case "two-tracks":
        out.push({
          ...base,
          type,
          eyebrow: str(b.eyebrow, "", 120),
          title: str(b.title, "", 120),
          subtitle: str(b.subtitle, "", 400),
          cards: Array.isArray(b.cards)
            ? (b.cards as Record<string, unknown>[]).slice(0, 2).map((c) => ({
                emoji: str(c?.emoji, "📦", 4),
                title: str(c?.title, "", 80),
                desc: str(c?.desc, "", 400),
                bullets: strArr(c?.bullets, 8),
                primary: link(c?.primary),
                secondary: link(c?.secondary),
                dark: Boolean(c?.dark),
              }))
            : [],
        });
        break;
      case "categories":
        out.push({ ...base, type, eyebrow: str(b.eyebrow, "", 120), title: str(b.title, "", 120) });
        break;
      case "featured":
        out.push({ ...base, type, eyebrow: str(b.eyebrow, "", 120), title: str(b.title, "", 120), limit: num(b.limit, 4, 2, 12) });
        break;
      case "faq":
        out.push({
          ...base,
          type,
          eyebrow: str(b.eyebrow, "", 120),
          title: str(b.title, "", 120),
          subtitle: str(b.subtitle, "", 400),
          items: Array.isArray(b.items)
            ? (b.items as Record<string, unknown>[]).slice(0, 20).map((it) => ({ q: str(it?.q, "", 200), a: str(it?.a, "", 1500) })).filter((it) => it.q)
            : [],
        });
        break;
      case "cta":
        out.push({
          ...base,
          type,
          title: str(b.title, "", 160),
          subtitle: str(b.subtitle, "", 400),
          primary: link(b.primary),
          secondary: link(b.secondary),
        });
        break;
      case "rich-text":
        out.push({ ...base, type, eyebrow: str(b.eyebrow, "", 120), title: str(b.title, "", 160), body: str(b.body, "", 3000) });
        break;
      case "image":
        out.push({
          ...base,
          type,
          imageKey: imgKey(b.imageKey),
          alt: str(b.alt, "", 200),
          caption: str(b.caption, "", 300),
          width: (["full", "wide", "narrow"] as const).includes(b.width as ImageWidth) ? (b.width as ImageWidth) : "wide",
          href: str(b.href, "", 200),
        });
        break;
      case "gallery":
        out.push({
          ...base,
          type,
          eyebrow: str(b.eyebrow, "", 120),
          title: str(b.title, "", 160),
          columns: num(b.columns, 3, 2, 4),
          items: Array.isArray(b.items)
            ? (b.items as Record<string, unknown>[]).slice(0, 24).map((it) => ({
                imageKey: imgKey(it?.imageKey),
                alt: str(it?.alt, "", 200),
                caption: str(it?.caption, "", 200),
              }))
            : [],
        });
        break;
    }
  });

  return out;
}

/* ─────────── ตรวจก่อนเผยแพร่ ─────────── */

export interface ValidationIssue {
  blockId: string | null;
  level: "error" | "warning";
  message: string;
}

/** ตรวจปัญหาที่พบบ่อยก่อนเผยแพร่ (ไม่บังคับ — แค่เตือน) */
export function validateBlocks(blocks: Block[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const active = blocks.filter((b) => b.enabled);

  if (!active.length) issues.push({ blockId: null, level: "error", message: "ยังไม่มีบล็อกที่เปิดใช้งาน — หน้าจะว่างเปล่า" });

  const heroes = active.filter((b) => b.type === "hero");
  if (heroes.length === 0) issues.push({ blockId: null, level: "warning", message: "ไม่มีแบนเนอร์หลัก (Hero) — หน้าอาจดูไม่มีหัวเรื่อง" });
  if (heroes.length > 1) issues.push({ blockId: null, level: "warning", message: `มีแบนเนอร์หลัก ${heroes.length} อัน — ควรมีอันเดียวเพื่อ SEO` });

  for (const b of active) {
    const label = BLOCK_META[b.type].label;

    if (!b.visibility.desktop && !b.visibility.tablet && !b.visibility.mobile)
      issues.push({ blockId: b.id, level: "warning", message: `${label}: ซ่อนทุกอุปกรณ์ — จะไม่แสดงที่ไหนเลย` });

    if (b.type === "hero") {
      if (!b.title.trim()) issues.push({ blockId: b.id, level: "error", message: `${label}: ยังไม่ได้ใส่หัวเรื่อง` });
      if (b.imageKey && !b.imageAlt.trim())
        issues.push({ blockId: b.id, level: "warning", message: `${label}: รูปพื้นหลังยังไม่มีคำบรรยาย (Alt) — มีผลกับ SEO` });
      if (b.primary.text.trim() && !b.primary.href.trim())
        issues.push({ blockId: b.id, level: "error", message: `${label}: ปุ่มหลักยังไม่มีลิงก์` });
    }

    if (b.type === "image") {
      if (!b.imageKey) issues.push({ blockId: b.id, level: "error", message: `${label}: ยังไม่ได้เลือกรูป` });
      else if (!b.alt.trim()) issues.push({ blockId: b.id, level: "warning", message: `${label}: ยังไม่มีคำบรรยายรูป (Alt)` });
    }

    if (b.type === "gallery") {
      const withImg = b.items.filter((i) => i.imageKey);
      if (!withImg.length) issues.push({ blockId: b.id, level: "error", message: `${label}: ยังไม่มีรูปในแกลเลอรี` });
      else if (withImg.some((i) => !i.alt.trim()))
        issues.push({ blockId: b.id, level: "warning", message: `${label}: บางรูปยังไม่มีคำบรรยาย (Alt)` });
    }

    if (b.type === "announcement" && !b.messages.filter((m) => m.trim()).length)
      issues.push({ blockId: b.id, level: "error", message: `${label}: ยังไม่มีข้อความ` });

    if (b.type === "faq" && !b.items.length)
      issues.push({ blockId: b.id, level: "warning", message: `${label}: ยังไม่มีคำถาม` });

    if (b.type === "cta") {
      if (b.primary.text.trim() && !b.primary.href.trim())
        issues.push({ blockId: b.id, level: "error", message: `${label}: ปุ่มหลักยังไม่มีลิงก์` });
      if (!b.title.trim()) issues.push({ blockId: b.id, level: "warning", message: `${label}: ยังไม่มีหัวข้อ` });
    }

    if (b.type === "rich-text" && !b.title.trim() && !b.body.trim())
      issues.push({ blockId: b.id, level: "warning", message: `${label}: ยังไม่มีเนื้อหา` });
  }

  return issues;
}
