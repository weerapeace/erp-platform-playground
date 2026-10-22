/**
 * 🧱 ฐานหน้าตาทั้งเว็บ (แท็บดีไซน์ ชุด 1 · 2026-10-22) — ค่าที่ทุกหน้า/ทุก Section ใช้ร่วมกัน
 * ⚠️ มิเรอร์: ERP lib/website-site-design.ts ↔ เว็บร้าน src/lib/site-design.ts (แก้ฝั่งหนึ่งแล้วคัดลอกทั้งไฟล์ทับอีกฝั่ง)
 * ค่าเริ่มต้นทุกตัว = หน้าตาเดิมก่อนมีระบบนี้ · ตัววาด CSS อยู่ที่เว็บร้าน src/lib/site-design-css.ts
 *
 * ที่เก็บในธีม: theme.page (ความโปร่ง/ความกว้าง/ผิวพื้น/มือถือ/รูปแบบราคา + ✨ การเคลื่อนไหวชุด 2 + 📱 มือถือและช่วยขายชุด 3) · theme.shape (ปุ่ม/ลิงก์/ช่องกรอก)
 *               theme.footer.paymentStyle / shipping (โลโก้ท้ายเว็บ · normalizeFooter ของแต่ละ repo เรียก normalizePayStyle/normalizeShipIcons)
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
/** 📱 ชุด 3 — แถบเมนูล่างแบบแอป (มือถือ) */
export type MobileNavStyle = "off" | "label" | "icon";
export type MobileNavItem = "home" | "shop" | "categories" | "search" | "wishlist" | "cart" | "account" | "chat";
export interface MobileNavConfig {
  style: MobileNavStyle;
  /** 2–5 ปุ่ม เรียงตามนี้ · ถูกใจ/บัญชี โชว์เมื่อเปิดระบบสมาชิก · แชท โชว์เมื่อเปิดปุ่มแชท */
  items: MobileNavItem[];
  /** เลื่อนลงซ่อน เลื่อนขึ้นโผล่ */
  hideOnScroll: boolean;
}
export type ChatColor = "brand" | "line" | "ink" | "white";
/** 💬 หน้าตาปุ่มแชทลอย (ช่องทางแชทตั้งที่ ERP ข้อมูลร้าน › 💬) */
export interface ChatLook {
  color: ChatColor;
  shape: "pill" | "round";
  where: "all" | "mobile" | "desktop";
}
/** 🔍 ค้นหาเต็มจอตอนยังไม่พิมพ์: หมวด (เดิม) / + คำยอดนิยม / + คำยอดนิยม + สินค้าแนะนำ */
export type SearchEmpty = "cats" | "terms" | "prods";
export type CookieLayout = "card" | "bar" | "center";
/** 🍪 แถบขอความยินยอมคุกกี้ — ปุ่ม "เฉพาะที่จำเป็น" อยู่ข้างปุ่มยอมรับเสมอ (PDPA: ปฏิเสธต้องง่ายเท่ายอมรับ) */
export interface CookieLook {
  layout: CookieLayout;
  /** การ์ด: มุมซ้าย/ขวา (จอคอม) */
  side: "left" | "right";
  icon: boolean;
  /** ว่าง = ข้อความตั้งต้น · แปลอังกฤษได้ (<key>_en) */
  title: string;
  text: string;
}
/** 💳 โลโก้ท้ายเว็บ: ป้ายตัวหนังสือ (เดิม) / โลโก้สี / โลโก้ขาวดำ */
export type PayLogoStyle = "text" | "color" | "mono";
export type ShipIcon = "thaipost" | "kerry" | "flash" | "jt" | "ninja" | "dhl";

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
  /** 📱 ชุด 3 */
  mobileNav: MobileNavConfig;
  chat: ChatLook;
  searchEmpty: SearchEmpty;
  cookie: CookieLook;
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
  mobileNav: { style: "off", items: ["home", "shop", "search", "wishlist", "cart"], hideOnScroll: false },
  chat: { color: "brand", shape: "pill", where: "all" },
  searchEmpty: "cats",
  cookie: { layout: "card", side: "left", icon: true, title: "", text: "" },
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
export const MOBILE_NAV_STYLES: MobileNavStyle[] = ["off", "label", "icon"];
export const MOBILE_NAV_ITEMS: MobileNavItem[] = ["home", "shop", "categories", "search", "wishlist", "cart", "account", "chat"];
export const MOBILE_NAV_MAX = 5;
export const CHAT_COLORS: ChatColor[] = ["brand", "line", "ink", "white"];
export const SEARCH_EMPTIES: SearchEmpty[] = ["cats", "terms", "prods"];
export const COOKIE_LAYOUTS: CookieLayout[] = ["card", "bar", "center"];
export const PAY_LOGO_STYLES: PayLogoStyle[] = ["text", "color", "mono"];
export const SHIP_ICONS: ShipIcon[] = ["thaipost", "kerry", "flash", "jt", "ninja", "dhl"];

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
    mobileNav: normalizeMobileNav(r.mobileNav),
    chat: normalizeChatLook(r.chat),
    searchEmpty: oneOf(r.searchEmpty, SEARCH_EMPTIES, d.searchEmpty),
    cookie: normalizeCookieLook(r.cookie),
  };
}

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function normalizeMobileNav(raw: unknown): MobileNavConfig {
  const r = obj(raw);
  const d = DEFAULT_SITE_PAGE.mobileNav;
  const items = Array.isArray(r.items) ? [...new Set(r.items.filter((x): x is MobileNavItem => (MOBILE_NAV_ITEMS as readonly unknown[]).includes(x)))].slice(0, MOBILE_NAV_MAX) : [];
  return { style: oneOf(r.style, MOBILE_NAV_STYLES, d.style), items: items.length >= 2 ? items : [...d.items], hideOnScroll: r.hideOnScroll === true };
}

export function normalizeChatLook(raw: unknown): ChatLook {
  const r = obj(raw);
  return { color: oneOf(r.color, CHAT_COLORS, "brand"), shape: r.shape === "round" ? "round" : "pill", where: r.where === "mobile" || r.where === "desktop" ? r.where : "all" };
}

export function normalizeCookieLook(raw: unknown): CookieLook {
  const r = obj(raw);
  // ⚠️ คงช่องแปล <key>_en ไว้ (ระบบแปลธีมทับทีหลัง) — เก็บเฉพาะ title_en / text_en
  const out: CookieLook & Record<string, unknown> = { layout: oneOf(r.layout, COOKIE_LAYOUTS, "card"), side: r.side === "right" ? "right" : "left", icon: r.icon !== false, title: txt(r.title, 60), text: txt(r.text, 400) };
  if (typeof r.title_en === "string" && r.title_en.trim()) out.title_en = txt(r.title_en, 60);
  if (typeof r.text_en === "string" && r.text_en.trim()) out.text_en = txt(r.text_en, 400);
  return out;
}

export const normalizePayStyle = (v: unknown): PayLogoStyle => oneOf(v, PAY_LOGO_STYLES, "text");
export const normalizeShipIcons = (v: unknown): ShipIcon[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is ShipIcon => (SHIP_ICONS as readonly unknown[]).includes(x)))] : []);

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
