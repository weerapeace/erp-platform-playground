/**
 * 🧱 ฐานหน้าตาทั้งเว็บ (แท็บดีไซน์ ชุด 1 · 2026-10-22) — ค่าที่ทุกหน้า/ทุก Section ใช้ร่วมกัน
 * ⚠️ มิเรอร์: ERP lib/website-site-design.ts ↔ เว็บร้าน src/lib/site-design.ts (แก้ฝั่งหนึ่งแล้วคัดลอกทั้งไฟล์ทับอีกฝั่ง)
 * ค่าเริ่มต้นทุกตัว = หน้าตาเดิมก่อนมีระบบนี้ · ตัววาด CSS อยู่ที่เว็บร้าน src/lib/site-design-css.ts
 *
 * ที่เก็บในธีม: theme.page (ความโปร่ง/ความกว้าง/ผิวพื้น/มือถือ/รูปแบบราคา + ✨ การเคลื่อนไหวชุด 2) · theme.shape (ปุ่ม/ลิงก์/ช่องกรอก)
 *               theme.header.iconStyle (ชุดไอคอนหัวเว็บ) · theme.card.autoBadges.shape (ทรงป้ายบนการ์ด)
 */

export type SiteDensity = "normal" | "dense" | "airy";
export type SiteWidth = "normal" | "narrow" | "wide" | "full";
export type SiteTexture = "none" | "paper" | "grain";
export type PriceFormat = "baht" | "word" | "dash" | "thb";
export type ButtonKind = "fill" | "outline" | "under";
export type ButtonHover = "auto" | "fill" | "arrow" | "lift";
export type LinkHover = "auto" | "color" | "run" | "fade" | "always";
export type InputStyle = "box" | "under" | "filled";
export type HeaderIconStyle = "regular" | "thin" | "bold" | "circle" | "text";
export type BadgeShape = "pill" | "square" | "ribbon" | "corner" | "text";
/** ✨ ชุด 2 — Section โผล่ตอนเลื่อนถึง (ค่าทั้งเว็บ · ชื่อเดียวกับ data-motion ของ Section) */
export type SectionEntrance = "none" | "fade-up" | "fade-in" | "zoom" | "blur";
export type MotionSpeed = "normal" | "slow" | "fast";
/** เปลี่ยนหน้า: fade/rise/zoom = View Transitions · curtain/logo = แผ่นปิดจอ (PageMotion) */
export type PageTransition = "fade" | "rise" | "curtain" | "logo" | "zoom" | "none";
export type IntroStyle = "off" | "logo" | "line" | "curtain";
export type CursorStyle = "off" | "ring" | "dot" | "view";
export type BackToTop = "off" | "circle" | "ring";

/** ส่วนที่อยู่ใน theme.page (รวมกับ transition / smoothScroll เดิม) */
export interface SitePageDesign {
  /** ระยะห่างบน-ล่างของ Section ที่ใช้ระยะตามเดิม (Section ที่ตั้งระยะเองคงค่าที่ตั้ง) */
  density: SiteDensity;
  /** ความกว้างสูงสุดของเนื้อหา (กล่อง container ทั้งเว็บ) */
  width: SiteWidth;
  /** ผิวกระดาษ = ลายจางบนพื้นหลัง · เกรนฟิล์ม = เม็ดฟิล์มบาง ๆ ทับทั้งจอ */
  texture: SiteTexture;
  /** ความเข้มของลาย (10–100) */
  textureStrength: number;
  /** % ขนาดตัวอักษรบนมือถือทั้งเว็บ (85–125 · 100 = เดิม) */
  mobileScale: number;
  /** มือถือ: ปุ่ม/ช่องกรอกสูงอย่างน้อย 48px ให้นิ้วกดง่าย */
  bigTap: boolean;
  priceFormat: PriceFormat;
  /** ✨ Section ที่ยังไม่ได้ตั้งลูกเล่นเอง โผล่แบบนี้ (Section แรกของหน้าโผล่ทันทีเสมอ) */
  sectionMotion: SectionEntrance;
  sectionSpeed: MotionSpeed;
  /** การ์ด/ชิ้นย่อยทยอยโผล่ทีละใบ */
  sectionStagger: boolean;
  /** 🎬 หน้าโหลดแรก (ครั้งแรกที่เข้าเว็บในรอบนั้น · ไม่ขึ้นในพรีวิว/บอท/เครื่องที่ตั้งลดการเคลื่อนไหว) */
  intro: IntroStyle;
  /** 🖱 เคอร์เซอร์พิเศษ (คอมที่ใช้เมาส์เท่านั้น) */
  cursor: CursorStyle;
  /** แถบบาง ๆ บนสุดบอกว่าเลื่อนอ่านถึงไหน */
  readProgress: boolean;
  /** ⬆ ปุ่มกลับขึ้นบน (โผล่เมื่อเลื่อนลงเกินเกือบ 1 จอ) */
  backToTop: BackToTop;
  backToTopSide: "right" | "left";
}

/** ส่วนที่อยู่ใน theme.shape (รวมกับรูปทรงปุ่ม/ขนาด/ขอบเดิม) */
export interface SiteShapeDesign {
  /** หน้าตาปุ่มหลักใน Section (หน้าแรก/หน้าเว็บ) — ปุ่มซื้อ/ตะกร้า/ชำระเงินคงแบบทึบเสมอ */
  buttonKind: ButtonKind;
  /** ลูกเล่นตอนชี้ปุ่ม (ทุกปุ่มทั้งเว็บ · ลูกศรเฉพาะปุ่มใน Section) · auto = แบบเดิม (เข้มขึ้นนิด) */
  buttonHover: ButtonHover;
  /** ลิงก์ตัวหนังสือตอนชี้ (ลิงก์ในเนื้อหา/ท้ายเว็บ — เมนูด้านบนตั้งแยกที่แท็บเมนู) · auto = แบบเดิมของแต่ละที่ */
  linkHover: LinkHover;
  /** ช่องกรอกทั้งเว็บ (ชำระเงิน สมัครสมาชิก ติดต่อ รับข่าวสาร) */
  inputStyle: InputStyle;
}

export const DEFAULT_SITE_PAGE: SitePageDesign = {
  density: "normal", width: "normal", texture: "none", textureStrength: 40, mobileScale: 100, bigTap: false, priceFormat: "baht",
  sectionMotion: "none", sectionSpeed: "normal", sectionStagger: false, intro: "off", cursor: "off", readProgress: false, backToTop: "off", backToTopSide: "right",
};
export const DEFAULT_SITE_SHAPE: SiteShapeDesign = { buttonKind: "fill", buttonHover: "auto", linkHover: "auto", inputStyle: "box" };
export const DEFAULT_HEADER_ICON_STYLE: HeaderIconStyle = "regular";

/** ตัวคูณระยะห่างบน-ล่างของ Section */
export const SITE_DENSITY_K: Record<SiteDensity, number> = { dense: 0.6, normal: 1, airy: 1.45 };
/** ความกว้างสูงสุดของเนื้อหา (เดิม 1240px) */
export const SITE_MAX_W: Record<SiteWidth, string> = { narrow: "1080px", normal: "1240px", wide: "1440px", full: "none" };
export const MOBILE_SCALE_RANGE = { min: 85, max: 125 };
export const TEXTURE_STRENGTH_RANGE = { min: 10, max: 100 };

export const DENSITIES: SiteDensity[] = ["normal", "dense", "airy"];
export const SITE_WIDTHS: SiteWidth[] = ["normal", "narrow", "wide", "full"];
export const TEXTURES: SiteTexture[] = ["none", "paper", "grain"];
export const PRICE_FORMATS: PriceFormat[] = ["baht", "word", "dash", "thb"];
export const BUTTON_KINDS: ButtonKind[] = ["fill", "outline", "under"];
export const BUTTON_HOVERS: ButtonHover[] = ["auto", "fill", "arrow", "lift"];
export const LINK_HOVERS: LinkHover[] = ["auto", "color", "run", "fade", "always"];
export const INPUT_STYLES: InputStyle[] = ["box", "under", "filled"];
export const HEADER_ICON_STYLES: HeaderIconStyle[] = ["regular", "thin", "bold", "circle", "text"];
export const BADGE_SHAPES: BadgeShape[] = ["pill", "square", "ribbon", "corner", "text"];
export const SECTION_ENTRANCES: SectionEntrance[] = ["none", "fade-up", "fade-in", "zoom", "blur"];
export const MOTION_SPEEDS: MotionSpeed[] = ["normal", "slow", "fast"];
export const PAGE_TRANSITIONS: PageTransition[] = ["fade", "rise", "curtain", "logo", "zoom", "none"];
export const INTRO_STYLES: IntroStyle[] = ["off", "logo", "line", "curtain"];
export const CURSOR_STYLES: CursorStyle[] = ["off", "ring", "dot", "view"];
export const BACK_TO_TOPS: BackToTop[] = ["off", "circle", "ring"];

const oneOf = <T extends string>(v: unknown, ok: readonly T[], fb: T): T => (typeof v === "string" && (ok as readonly string[]).includes(v) ? (v as T) : fb);
const clampInt = (v: unknown, lo: number, hi: number, fb: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && v !== null && v !== "" ? Math.min(hi, Math.max(lo, n)) : fb;
};

export function normalizeSitePage(raw: unknown): SitePageDesign {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SITE_PAGE;
  return {
    density: oneOf(r.density, DENSITIES, d.density),
    width: oneOf(r.width, SITE_WIDTHS, d.width),
    texture: oneOf(r.texture, TEXTURES, d.texture),
    textureStrength: clampInt(r.textureStrength, TEXTURE_STRENGTH_RANGE.min, TEXTURE_STRENGTH_RANGE.max, d.textureStrength),
    mobileScale: clampInt(r.mobileScale, MOBILE_SCALE_RANGE.min, MOBILE_SCALE_RANGE.max, d.mobileScale),
    bigTap: r.bigTap === true,
    priceFormat: oneOf(r.priceFormat, PRICE_FORMATS, d.priceFormat),
    sectionMotion: oneOf(r.sectionMotion, SECTION_ENTRANCES, d.sectionMotion),
    sectionSpeed: oneOf(r.sectionSpeed, MOTION_SPEEDS, d.sectionSpeed),
    sectionStagger: r.sectionStagger === true,
    intro: oneOf(r.intro, INTRO_STYLES, d.intro),
    cursor: oneOf(r.cursor, CURSOR_STYLES, d.cursor),
    readProgress: r.readProgress === true,
    backToTop: oneOf(r.backToTop, BACK_TO_TOPS, d.backToTop),
    backToTopSide: r.backToTopSide === "left" ? "left" : "right",
  };
}

/** ค่าเก่ามีแค่ none/fade/rise · ค่าแปลก = จาง (แบบเดิม) */
export const normalizePageTransition = (v: unknown): PageTransition => oneOf(v, PAGE_TRANSITIONS, "fade");

/** ค่าเริ่มต้นการโผล่ของ Section ที่ไม่ได้ตั้งเอง — null = ไม่ขยับ (แบบเดิม) */
export function sectionMotionOf(p: Pick<SitePageDesign, "sectionMotion" | "sectionSpeed" | "sectionStagger">): { entrance: SectionEntrance; speed: MotionSpeed; stagger: boolean } | null {
  return p.sectionMotion === "none" ? null : { entrance: p.sectionMotion, speed: p.sectionSpeed, stagger: p.sectionStagger };
}

export function normalizeSiteShape(raw: unknown): SiteShapeDesign {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SITE_SHAPE;
  return {
    buttonKind: oneOf(r.buttonKind, BUTTON_KINDS, d.buttonKind),
    buttonHover: oneOf(r.buttonHover, BUTTON_HOVERS, d.buttonHover),
    linkHover: oneOf(r.linkHover, LINK_HOVERS, d.linkHover),
    inputStyle: oneOf(r.inputStyle, INPUT_STYLES, d.inputStyle),
  };
}

export const normalizeHeaderIconStyle = (v: unknown): HeaderIconStyle => oneOf(v, HEADER_ICON_STYLES, DEFAULT_HEADER_ICON_STYLE);
/** ค่าเก่ามีแค่ pill / square — ค่าอื่น = pill เหมือนเดิม */
export const normalizeBadgeShape = (v: unknown): BadgeShape => oneOf(v, BADGE_SHAPES, "pill");

/**
 * 💰 จัดรูปแบบเงินบาทตามที่ร้านเลือก — ทศนิยมโชว์เฉพาะเมื่อมีเศษสตางค์ (สูงสุด 2 ตำแหน่ง)
 * word: หน้าไทย "1,090 บาท" · หน้าอังกฤษ "1,090 THB"
 */
export function formatMoneyAs(baht: number, fmt: PriceFormat, lang: "th" | "en" = "th"): string {
  const n = Number(baht) || 0;
  const neg = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n * 100) / 100);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(abs) ? 0 : 2, maximumFractionDigits: 2 });
  switch (fmt) {
    case "word":
      return `${neg}${s} ${lang === "en" ? "THB" : "บาท"}`;
    case "dash":
      return `${neg}${s}.-`;
    case "thb":
      return `${neg}THB ${s}`;
    default:
      return `${neg}฿${s}`;
  }
}
