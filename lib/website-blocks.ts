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
  newChildId,
  structuredCloneSafe,
  type ChildSpec,
  type FieldDef,
  type SectionMeta,
  type ValidationIssue,
} from "@/lib/website-schema";
import { sanitizeCustomHtml } from "@/lib/website-html";

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
  | "map"
  | "custom-html"
  | "spotlight"
  | "stats";

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

/** ค่าที่ตั้งทับเฉพาะมือถือ — "auto" = ใช้ค่าเดียวกับคอม */
export interface BlockStyleMobile {
  padTop: BlockSpacing;
  padBottom: BlockSpacing;
  align: BlockAlign;
}

/** ลูกเล่น — โผล่ตอนเลื่อนถึง / ตอนชี้เมาส์ · "none" = ไม่มี (ค่าเริ่มต้น หน้าเว็บเหมือนเดิม) */
export type MotionEntrance = "none" | "fade-up" | "fade-in" | "slide-left" | "slide-right" | "zoom";
export type MotionHover = "none" | "lift" | "zoom" | "glow";
export type MotionSpeed = "normal" | "slow" | "fast";
export const MOTION_ENTRANCES: readonly MotionEntrance[] = ["none", "fade-up", "fade-in", "slide-left", "slide-right", "zoom"];
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
  width: BlockWidth;
  align: BlockAlign;
  /** ตั้งทับเฉพาะจอมือถือ (< 768px) */
  mobile: BlockStyleMobile;
  /** ลูกเล่น (แผง "✨ ลูกเล่น") */
  motion: BlockMotion;
}

export const DEFAULT_BLOCK_STYLE: BlockStyle = {
  padTop: "auto",
  padBottom: "auto",
  bg: "auto",
  bgColor: "",
  width: "auto",
  align: "auto",
  mobile: { padTop: "auto", padBottom: "auto", align: "auto" },
  motion: { ...DEFAULT_MOTION },
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
  source: "manual" | "category" | "featured" | "all";
  /** รหัสรุ่น (parent code) ที่เลือกเอง */
  codes: string[];
  category: string;
  limit: number;
  layout: "grid" | "carousel";
  columns: number;
  more: CtaLink;
}

export interface FaqBlock extends BlockBase {
  type: "faq";
  eyebrow: string;
  title: string;
  subtitle: string;
  items: (ChildBase & { q: string; a: string })[];
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
  slides: (ChildBase & {
    imageKey: string | null;
    alt: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    link: CtaLink;
    align: "left" | "center";
    overlay: number;
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
  items: (ChildBase & { imageKey: string | null; alt: string; caption: string })[];
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
  | StatsBlock;

/** ชื่อ/ไอคอน/คำอธิบาย/กลุ่ม ของทุกชนิด — มาจาก schema */
export const BLOCK_META: Record<BlockType, SectionMeta> = Object.fromEntries(
  SECTION_TYPES.map((t) => [t, SECTION_SCHEMAS[t].meta])
) as Record<BlockType, SectionMeta>;

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

/** รหัสหมวด/รหัสสินค้า — ตัวอักษร ตัวเลข ขีด จุด เท่านั้น */
const codeStr = (v: unknown, max = 60) => String(v ?? "").trim().replace(/[^A-Za-z0-9._-]/g, "").slice(0, max);

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
    case "number":
    case "range":
      return num(v, fb as number, fd.min ?? 0, fd.numMax ?? 999999);
    case "select":
      return pickOne(v, (fd.options ?? []).map((o) => o.v), fb as string);
    case "toggle":
      return typeof v === "boolean" ? v : Boolean(fb);
    case "image":
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
    return out;
  });
}

/** หน้าตาของบล็อก — บล็อกเก่าที่ยังไม่มี style จะได้ค่าเริ่มต้นเสมอ (เว็บแสดงผลเหมือนเดิม) */
export function sanitizeStyle(v: unknown): BlockStyle {
  const o = (v ?? {}) as Record<string, unknown>;
  const d = DEFAULT_BLOCK_STYLE;
  const bgColor = typeof o.bgColor === "string" && HEX6.test(o.bgColor.trim()) ? o.bgColor.trim().toLowerCase() : "";
  const bg = pickOne(o.bg, BLOCK_BGS, d.bg);
  const m = (o.mobile ?? {}) as Record<string, unknown>;
  const mo = (o.motion ?? {}) as Record<string, unknown>;
  return {
    padTop: pickOne(o.padTop, BLOCK_SPACINGS, d.padTop),
    padBottom: pickOne(o.padBottom, BLOCK_SPACINGS, d.padBottom),
    // เลือก "สีเอง" แต่ยังไม่ได้ใส่สี → ถือว่าไม่ได้ตั้ง กันบล็อกกลายเป็นพื้นโปร่งแปลก ๆ
    bg: bg === "custom" && !bgColor ? d.bg : bg,
    bgColor,
    width: pickOne(o.width, BLOCK_WIDTHS, d.width),
    align: pickOne(o.align, BLOCK_ALIGNS, d.align),
    mobile: {
      padTop: pickOne(m.padTop, BLOCK_SPACINGS, "auto"),
      padBottom: pickOne(m.padBottom, BLOCK_SPACINGS, "auto"),
      align: pickOne(m.align, BLOCK_ALIGNS, "auto"),
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
    if (schema.children) block[schema.children.key] = sanitizeChildren(schema.children, b[schema.children.key], id);
    out.push(block as unknown as Block);
  });

  return out;
}

/* ─────────── ตรวจก่อนเผยแพร่ ─────────── */

const isEmptyValue = (fd: FieldDef, v: unknown): boolean => {
  if (fd.type === "list" || fd.type === "products") return !Array.isArray(v) || !v.filter((x) => (typeof x === "string" ? x.trim() : x)).length;
  if (fd.type === "image") return !v;
  if (fd.type === "link") return !String((v as CtaLink | undefined)?.text ?? "").trim();
  return !String(v ?? "").trim();
};

/** ตรวจปัญหาที่พบบ่อยก่อนเผยแพร่ (ไม่บังคับ — แค่เตือน) */
export function validateBlocks(blocks: Block[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const active = blocks.filter((b) => b.enabled);

  if (!active.length) issues.push({ blockId: null, level: "error", message: "ยังไม่มีบล็อกที่เปิดใช้งาน — หน้าจะว่างเปล่า" });

  const heroes = active.filter((b) => b.type === "hero");
  if (heroes.length === 0) issues.push({ blockId: null, level: "warning", message: "ไม่มีแบนเนอร์หลัก (Hero) — หน้าอาจดูไม่มีหัวเรื่อง" });
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
      if (fd.showIf && rec[fd.showIf.key] !== fd.showIf.eq) continue;
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
