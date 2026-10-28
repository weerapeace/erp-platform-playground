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
  /** 🎨 ปรับละเอียดทีละชิ้น (ck.*) */
  parts: PartStyles;
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
/** 📄 ชุด 4 — หน้าพิเศษ (ทุกตัวค่าเริ่ม = หน้าตาเดิม · ข้อความว่าง = ข้อความตั้งต้น · แปลอังกฤษได้ <key>_en) */
export interface NotFoundLook {
  /** 🎨 ปรับละเอียดทีละชิ้น (nf.*) */
  parts: PartStyles;
  /** plain = ไอคอน + ข้อความ (เดิม) · image = รูปใหญ่ + ข้อความ · big = ตัวเลข 404 ใหญ่แบบแบรนด์ */
  style: "plain" | "image" | "big";
  imageKey: string | null;
  title: string;
  text: string;
  search: boolean;
  /** สินค้าแนะนำ 4 ชิ้น (แนะนำของร้าน → ขายดี → มาใหม่) */
  products: boolean;
}
export interface ThanksLook {
  /** 🎨 ปรับละเอียดทีละชิ้น (th.*) */
  parts: PartStyles;
  /** emoji = 🎉 (เดิม) · image = รูปแบนเนอร์ · none = ไม่มี */
  top: "emoji" | "image" | "none";
  imageKey: string | null;
  /** รูปแบนเนอร์จอมือถือ (ไม่ใส่ = ใช้รูปคอม) */
  mobileImageKey: string | null;
  /** กดแบนเนอร์แล้วไปที่ (/หน้าในเว็บ หรือ https:// · ว่าง = กดไม่ได้) — ผูกชุดรูปที่ตั้งลิงก์ = ใช้ลิงก์ของชุด */
  link: string;
  /** โค้ดคูปองครั้งหน้า (จากแท็บคูปอง) — ERP ตรวจว่ายังใช้ได้ก่อนส่งให้เว็บ (หมดอายุ/ปิด = ไม่โชว์) */
  coupon: string;
  /** ปุ่มโซเชียลของร้าน (จากข้อมูลร้าน) */
  follow: boolean;
  products: boolean;
}
export interface PopupLook {
  /** 🎨 ปรับละเอียดทีละชิ้น (pp.*) */
  parts: PartStyles;
  layout: "center" | "split" | "sheet" | "corner";
  imageKey: string | null;
  /** delay = หลังเข้าเว็บ X วิ (เดิม · ตั้งวินาทีที่ข้อมูลร้าน) · scroll = เลื่อนถึงครึ่งหน้า · exit = เมาส์ออกนอกหน้า (คอม · มือถือใช้ scroll แทน) */
  trigger: "delay" | "scroll" | "exit";
  /** once = ครั้งเดียว (เดิม) · 7d = ซ้ำทุก 7 วันถ้ายังไม่ได้รับโค้ด */
  again: "once" | "7d";
}
export interface ShareLook {
  /** photo = รูปสินค้ารูปแรก (เดิม) · card = รูป + ชื่อ + ราคา + โลโก้ · frame = รูป + แถบโลโก้ล่าง (เว็บร้าน /api/og/product) */
  style: "photo" | "card" | "frame";
  bg: "paper" | "brand" | "ink";
}
export interface LoginLook {
  layout: "center" | "split" | "cover";
  imageKey: string | null;
  title: string;
  text: string;
  /** 🎨 ป๊อป/หน้าเข้าสู่ระบบ + ปุ่มสมัครบนหัวเว็บ (ชุดปรับหน้าตาชิ้นส่วน · 2026-10-28) — ค่าเริ่ม = หน้าตาเดิม */
  /** หัวป๊อป ("" = "สมาชิก") · ข้อความปุ่มสมัครบนหัวเว็บ ("" = "สมัครสมาชิก") — มีช่อง _en */
  popupTitle: string;
  signupLabel: string;
  /** กล่องข้อดีของสมาชิกในแท็บสมัคร · ข้อความเอง (ว่าง = ข้อความตั้งต้น · สูงสุด 6 บรรทัด) */
  perksOn: boolean;
  perks: string[];
  /** ลิงก์ "สั่งซื้อได้เลยโดยไม่ต้องสมัคร" */
  guestLink: boolean;
  /** สีปุ่ม Google/LINE/Facebook: brand = สีของแต่ละเจ้า (เดิม) · mono = สีเข้มของร้านทุกปุ่ม · outline = ขอบเส้น */
  providerStyle: "brand" | "mono" | "outline";
  parts: PartStyles;
}

/** 🎄 ของตกแต่งเทศกาล (ชุด 5) — โปรยลงมา หรือ ห้อยใต้หัวเว็บ (lantern/flags) · none = ไม่มี (เดิม) */
export type FestiveKind = "none" | "snow" | "petals" | "confetti" | "hearts" | "water" | "leaves" | "stars" | "lantern" | "flags";
export const FESTIVE_KINDS: FestiveKind[] = ["none", "snow", "petals", "confetti", "hearts", "water", "leaves", "stars", "lantern", "flags"];
/** แบบห้อยใต้หัวเว็บ (ไม่โปรย) */
export const FESTIVE_HANGING: FestiveKind[] = ["lantern", "flags"];
export interface FestiveLook {
  kind: FestiveKind;
  amount: "few" | "some" | "many";
  /** home = หน้าแรกเท่านั้น · all = ทุกหน้า (ยกเว้นตะกร้า/ชำระเงิน เสมอ) */
  where: "home" | "all";
  /** โชว์บนมือถือด้วย */
  mobile: boolean;
}

/** 👀 ป้ายคนดู / 🔥 ขายแล้ว (ชุด 5) — ตัวเลขจริงจาก ERP เท่านั้น · ต่ำกว่าขั้นต่ำ = ซ่อน */
export interface ProofLook {
  /** "วันนี้มี N คนดูสินค้านี้" (นับเครื่องไม่ซ้ำต่อวัน) */
  viewers: boolean;
  viewersMin: number;
  /** "ขายแล้ว N ชิ้น" */
  sold: boolean;
  soldMin: number;
  /** web = ออเดอร์บนเว็บ · all = เว็บ + ใบสั่งขาย ERP (ยืนยันแล้ว) */
  soldSource: "web" | "all";
  soldPeriod: "30d" | "all";
  /** โชว์บนการ์ดสินค้าด้วย (ปกติ = หน้าสินค้าอย่างเดียว) */
  onCard: boolean;
}

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
  /** 📄 ชุด 4 */
  notFound: NotFoundLook;
  thanks: ThanksLook;
  popup: PopupLook;
  share: ShareLook;
  login: LoginLook;
  /** 👤 หน้าบัญชีของฉัน (ชุดปรับหน้าตาละเอียด) */
  account: AccountLook;
  /** 🎪 ชุด 5 */
  festive: FestiveLook;
  proof: ProofLook;
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

/* ───────────── 🎨 ชุดปรับหน้าตาชิ้นส่วน (ของกลาง · 2026-10-28) ─────────────
 * ใช้กับทุกหน้าในแท็บดีไซน์ (เริ่มที่หน้าบัญชีของฉัน) — ERP ประกาศชิ้นส่วนของแต่ละหน้าที่ lib/website-page-parts · เว็บร้านติด data-part="<คีย์>"
 * ค่า = { [คีย์ชิ้น]: { all?: ทุกจอ, mobile?: ทับเฉพาะมือถือ < 768px } } · ไม่ตั้ง = ตามดีไซน์กลางของร้าน (หน้าตาเดิม)
 * สี = ชื่อสีของร้าน (PART_COLOR_TOKENS — เปลี่ยนสีร้านแล้วตามเอง) หรือ #hex · "none" = โปร่ง
 * ฟอนต์ = "display"/"body" (ฟอนต์หัวข้อ/เนื้อหาของร้าน) หรือชื่อฟอนต์ Google · ตัววาด CSS อยู่เว็บร้าน src/lib/part-style-css.ts
 */
export const PART_COLOR_TOKENS = ["brand", "brandDeep", "brandSoft", "tint", "ink", "inkSoft", "slate", "muted", "line", "surface", "paper", "onBrand", "white", "black"] as const;
export type PartColorToken = (typeof PART_COLOR_TOKENS)[number];
export type PartAlign = "left" | "center" | "right";
export interface PartStyleValue {
  /** 🔤 ตัวอักษร */
  font?: string;
  size?: number;
  weight?: number;
  color?: string;
  /** ระยะตัวอักษร (1/100 em) · ระยะบรรทัด (×100) */
  ls?: number;
  lh?: number;
  align?: PartAlign;
  upper?: boolean;
  italic?: boolean;
  /** ▭ กล่อง · radius 999 = เม็ดยา · shadow 0–3 */
  bg?: string;
  radius?: number;
  padY?: number;
  padX?: number;
  border?: number;
  borderColor?: string;
  shadow?: number;
  /** 📐 ตำแหน่ง · ระยะห่างระหว่างชิ้นข้างใน · ระยะด้านบน · ความกว้างสูงสุด (0 = ไม่จำกัด) · ขนาดสี่เหลี่ยม (รูปโปรไฟล์) */
  gap?: number;
  mt?: number;
  maxW?: number;
  dim?: number;
  hidden?: boolean;
  /** 🔣 ไอคอนในชิ้นนี้ */
  iconSize?: number;
  iconColor?: string;
  /** ✅ ตอนถูกเลือก (ปุ่มเมนู) */
  activeBg?: string;
  activeColor?: string;
  activeBorder?: string;
}
export interface PartStyleEntry {
  all?: PartStyleValue;
  mobile?: PartStyleValue;
}
export type PartStyles = Record<string, PartStyleEntry>;

/** ช่วงค่าที่ตั้งได้ (ERP ทำแถบเลื่อน · normalize บีบค่า) */
export const PART_RANGES = {
  size: [8, 120],
  weight: [100, 900],
  ls: [-10, 60],
  lh: [90, 240],
  radius: [0, 999],
  padY: [0, 160],
  padX: [0, 160],
  border: [0, 8],
  shadow: [0, 3],
  gap: [0, 160],
  mt: [-80, 200],
  maxW: [0, 1800],
  dim: [16, 240],
  iconSize: [8, 72],
} as const;
export type PartNumKey = keyof typeof PART_RANGES;
export const PART_NUM_KEYS = Object.keys(PART_RANGES) as PartNumKey[];
export const PART_COLOR_KEYS = ["color", "bg", "borderColor", "iconColor", "activeBg", "activeColor", "activeBorder"] as const;
export const PART_KEY_RE = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+){0,3}$/;
export const PART_STYLES_MAX = 80;
const PART_HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const PART_FONT_RE = /^[A-Za-z0-9 ]{2,48}$/;

export const partColorOk = (v: unknown): v is string => typeof v === "string" && (v === "none" || PART_HEX_RE.test(v) || (PART_COLOR_TOKENS as readonly string[]).includes(v));

export function normalizePartValue(raw: unknown): PartStyleValue | undefined {
  const r = obj(raw);
  const out: PartStyleValue = {};
  for (const k of PART_NUM_KEYS) {
    const v = r[k];
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    const [lo, hi] = PART_RANGES[k];
    out[k] = Math.min(hi, Math.max(lo, Math.round(n)));
  }
  for (const k of PART_COLOR_KEYS) if (partColorOk(r[k])) out[k] = r[k] as string;
  if (typeof r.font === "string" && (r.font === "display" || r.font === "body" || PART_FONT_RE.test(r.font))) out.font = r.font;
  if (r.align === "left" || r.align === "center" || r.align === "right") out.align = r.align;
  for (const k of ["upper", "italic", "hidden"] as const) if (typeof r[k] === "boolean") out[k] = r[k] as boolean;
  return Object.keys(out).length ? out : undefined;
}

export function normalizePartStyles(raw: unknown): PartStyles {
  const r = obj(raw);
  const out: PartStyles = {};
  for (const key of Object.keys(r).slice(0, PART_STYLES_MAX)) {
    if (!PART_KEY_RE.test(key)) continue;
    const e = obj(r[key]);
    const all = normalizePartValue(e.all);
    const mobile = normalizePartValue(e.mobile);
    if (all || mobile) out[key] = { ...(all ? { all } : {}), ...(mobile ? { mobile } : {}) };
  }
  return out;
}

/* ───────────── 👤 หน้าบัญชีของฉัน (theme.page.account · 2026-10-28) ─────────────
 * ค่าเริ่ม = หน้าตาเดิมทุกอย่าง · เว็บร้าน components/account/AccountClient · ERP components/website-account-design
 */
export type AccountTabKey = "orders" | "points" | "coupons" | "wishlist" | "addresses" | "profile";
export const ACCOUNT_TABS: AccountTabKey[] = ["orders", "points", "coupons", "wishlist", "addresses", "profile"];
/** ชื่อ/ไอคอนตั้งต้นของแต่ละแท็บ (ชื่อว่าง/ไอคอนว่าง = ใช้ค่านี้) · ไอคอนเส้นใช้ชุดไอคอนกลาง (i:<key>) */
export const ACCOUNT_TAB_DEFAULTS: Record<AccountTabKey, { label: string; emoji: string; line: string }> = {
  orders: { label: "ออเดอร์ของฉัน", emoji: "📦", line: "i:package" },
  points: { label: "แต้ม", emoji: "⭐", line: "i:star" },
  coupons: { label: "คูปอง", emoji: "🎟️", line: "i:tag" },
  wishlist: { label: "รายการโปรด", emoji: "❤️", line: "i:heart" },
  addresses: { label: "ที่อยู่", emoji: "📍", line: "i:map-pin" },
  profile: { label: "โปรไฟล์", emoji: "👤", line: "i:user" },
};
export interface AccountTabSetting {
  key: AccountTabKey;
  label: string;
  hidden: boolean;
  /** ไอคอนเฉพาะแท็บนี้ (ค่าแบบ SiteIcon: อีโมจิ / i:<key> / img:<key>) · ว่าง = ตามแบบไอคอนของเมนู */
  icon: string;
}
export interface AccountEmptyText {
  text: string;
  button: string;
  href: string;
}
export type AccountEmptyKey = "orders" | "wishlist" | "addresses";
/** ส่วนในหน้าบัญชีที่เรียงลำดับได้ (body = เมนู + เนื้อหา) */
export type AccountBlock = "notice" | "header" | "body" | "help" | "reco";
export const ACCOUNT_BLOCKS: AccountBlock[] = ["notice", "header", "body", "help", "reco"];
/** กล่องข้างขวา (แบบเมนูด้านซ้าย/หน้าต่างแอป · จอกว้าง) เช่น คู่มือ/โปรโมชันสมาชิก */
export interface AccountAside {
  on: boolean;
  icon: string;
  title: string;
  text: string;
  href: string;
}
export interface AccountLook {
  header: "simple" | "center" | "banner" | "card";
  imageKey: string | null;
  /** ข้อความเล็กเหนือชื่อ ({ชื่อ} = ชื่อสมาชิก) · ว่าง = "บัญชีของฉัน" */
  greeting: string;
  subtext: string;
  showEmail: boolean;
  showTier: boolean;
  showPoints: boolean;
  showSince: boolean;
  /** panel = หน้าต่างแอป (กรอบมนใหญ่ · เมนูข้างในกรอบ · หัวข้อหน้า · รูปโปรไฟล์มุมขวาบน) */
  nav: "pills" | "under" | "side" | "tiles" | "panel";
  /** หัวเมนูข้าง (หน้าต่างแอป · ว่าง = "บัญชีของฉัน") · เมนูอยู่ซ้าย/ขวา */
  panelTitle: string;
  navSide: "left" | "right";
  navIcons: "emoji" | "line" | "none";
  showCounts: boolean;
  tabs: AccountTabSetting[];
  firstTab: AccountTabKey;
  cards: "card" | "line" | "flat";
  claim: "box" | "link" | "hide";
  empty: Record<AccountEmptyKey, AccountEmptyText>;
  notice: { on: boolean; text: string; tone: "soft" | "brand" };
  recommend: boolean;
  help: boolean;
  width: "site" | "narrow";
  /** แท็บโปรไฟล์: ฟอร์ม (เดิม) หรือ แถวข้อมูลกดแก้ (แบบหน้าตั้งค่าแอป) */
  profileStyle: "form" | "rows";
  aside: AccountAside;
  /** ลำดับส่วนในหน้า */
  order: AccountBlock[];
  /** ✨ ลูกเล่น — พื้นหลัง (วงกลมเบลอ/ไล่สีจาง) · กล่องกระจกฝ้า · ทักทายตามเวลา · ตัวเลขแต้มวิ่ง · เปลี่ยนแท็บแบบนุ่ม · บัตรสมาชิกเอียงตามเมาส์ */
  decor: "none" | "blobs" | "wash";
  glass: boolean;
  timeGreeting: boolean;
  countUp: boolean;
  tabAnim: "none" | "fade" | "slide";
  tilt: boolean;
  parts: PartStyles;
}
const EMPTY_TEXT: AccountEmptyText = { text: "", button: "", href: "" };
export const DEFAULT_ACCOUNT_LOOK: AccountLook = {
  header: "simple",
  imageKey: null,
  greeting: "",
  subtext: "",
  showEmail: true,
  showTier: true,
  showPoints: false,
  showSince: false,
  nav: "pills",
  panelTitle: "",
  navSide: "left",
  navIcons: "emoji",
  showCounts: true,
  tabs: ACCOUNT_TABS.map((key) => ({ key, label: "", hidden: false, icon: "" })),
  firstTab: "orders",
  cards: "card",
  claim: "box",
  empty: { orders: { ...EMPTY_TEXT }, wishlist: { ...EMPTY_TEXT }, addresses: { ...EMPTY_TEXT } },
  notice: { on: false, text: "", tone: "soft" },
  recommend: false,
  help: false,
  width: "site",
  profileStyle: "form",
  aside: { on: false, icon: "", title: "", text: "", href: "" },
  order: [...ACCOUNT_BLOCKS],
  decor: "none",
  glass: false,
  timeGreeting: false,
  countUp: false,
  tabAnim: "none",
  tilt: false,
  parts: {},
};

const accHref = (v: unknown) => {
  const s = txt(v, 300);
  return /^(\/(?!\/)|https:\/\/)/.test(s) && !/[\s<>"'\\]/.test(s) ? s : "";
};

export function normalizeAccount(raw: unknown): AccountLook {
  const r = obj(raw);
  const d = DEFAULT_ACCOUNT_LOOK;
  const seen = new Set<AccountTabKey>();
  const tabs: AccountTabSetting[] = [];
  for (const t of Array.isArray(r.tabs) ? r.tabs : []) {
    const o = obj(t);
    const key = o.key as AccountTabKey;
    if (!ACCOUNT_TABS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    tabs.push({ key, label: txt(o.label, 40), hidden: key !== "profile" && o.hidden === true, icon: txt(o.icon, 300) });
  }
  for (const key of ACCOUNT_TABS) if (!seen.has(key)) tabs.push({ key, label: "", hidden: false, icon: "" });
  const firstTab = oneOf(r.firstTab, ACCOUNT_TABS, d.firstTab);
  const em = obj(r.empty);
  const empty = {} as Record<AccountEmptyKey, AccountEmptyText>;
  for (const k of ["orders", "wishlist", "addresses"] as AccountEmptyKey[]) {
    const e = obj(em[k]);
    empty[k] = { text: txt(e.text, 200), button: txt(e.button, 40), href: accHref(e.href) };
  }
  const n = obj(r.notice);
  const a = obj(r.aside);
  const order = Array.isArray(r.order) ? [...new Set(r.order.filter((x): x is AccountBlock => (ACCOUNT_BLOCKS as readonly unknown[]).includes(x)))] : [];
  for (const b of ACCOUNT_BLOCKS) if (!order.includes(b)) order.push(b);
  return {
    header: oneOf(r.header, ["simple", "center", "banner", "card"] as const, d.header),
    imageKey: typeof r.imageKey === "string" && r.imageKey.trim() ? r.imageKey.trim().slice(0, 300) : null,
    greeting: txt(r.greeting, 80),
    subtext: txt(r.subtext, 160),
    showEmail: r.showEmail !== false,
    showTier: r.showTier !== false,
    showPoints: r.showPoints === true,
    showSince: r.showSince === true,
    nav: oneOf(r.nav, ["pills", "under", "side", "tiles", "panel"] as const, d.nav),
    panelTitle: txt(r.panelTitle, 40),
    navSide: r.navSide === "right" ? "right" : "left",
    navIcons: oneOf(r.navIcons, ["emoji", "line", "none"] as const, d.navIcons),
    showCounts: r.showCounts !== false,
    tabs,
    firstTab: tabs.some((t) => t.key === firstTab && !t.hidden) ? firstTab : "orders",
    cards: oneOf(r.cards, ["card", "line", "flat"] as const, d.cards),
    claim: oneOf(r.claim, ["box", "link", "hide"] as const, d.claim),
    empty,
    notice: { on: n.on === true, text: txt(n.text, 200), tone: n.tone === "brand" ? "brand" : "soft" },
    recommend: r.recommend === true,
    help: r.help === true,
    width: r.width === "narrow" ? "narrow" : "site",
    profileStyle: r.profileStyle === "rows" ? "rows" : "form",
    aside: { on: a.on === true, icon: txt(a.icon, 300), title: txt(a.title, 60), text: txt(a.text, 200), href: accHref(a.href) },
    order,
    decor: oneOf(r.decor, ["none", "blobs", "wash"] as const, d.decor),
    glass: r.glass === true,
    timeGreeting: r.timeGreeting === true,
    countUp: r.countUp === true,
    tabAnim: oneOf(r.tabAnim, ["none", "fade", "slide"] as const, d.tabAnim),
    tilt: r.tilt === true,
    parts: normalizePartStyles(r.parts),
  };
}

export const DEFAULT_SITE_PAGE: SitePageDesign = {
  density: "normal", width: "normal", texture: "none", textureStrength: 40, mobileScale: 100, bigTap: false, priceFormat: "baht",
  sectionMotion: "none", sectionSpeed: "normal", sectionStagger: false, intro: "off", cursor: "off", readProgress: false, backToTop: "off", backToTopSide: "right",
  mobileNav: { style: "off", items: ["home", "shop", "search", "wishlist", "cart"], hideOnScroll: false },
  chat: { color: "brand", shape: "pill", where: "all" },
  searchEmpty: "cats",
  cookie: { layout: "card", side: "left", icon: true, title: "", text: "", parts: {} },
  notFound: { style: "plain", imageKey: null, title: "", text: "", search: false, products: false, parts: {} },
  thanks: { top: "emoji", imageKey: null, mobileImageKey: null, link: "", coupon: "", follow: false, products: false, parts: {} },
  popup: { layout: "center", imageKey: null, trigger: "delay", again: "once", parts: {} },
  share: { style: "photo", bg: "paper" },
  login: { layout: "center", imageKey: null, title: "", text: "", popupTitle: "", signupLabel: "", perksOn: true, perks: [], guestLink: true, providerStyle: "brand", parts: {} },
  account: DEFAULT_ACCOUNT_LOOK,
  festive: { kind: "none", amount: "some", where: "home", mobile: true },
  proof: { viewers: false, viewersMin: 5, sold: false, soldMin: 10, soldSource: "web", soldPeriod: "30d", onCard: false },
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
    notFound: normalizeNotFound(r.notFound),
    thanks: normalizeThanks(r.thanks),
    popup: normalizePopup(r.popup),
    share: normalizeShare(r.share),
    login: normalizeLogin(r.login),
    account: normalizeAccount(r.account),
    festive: normalizeFestive(r.festive),
    proof: normalizeProof(r.proof),
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
  const out: CookieLook & Record<string, unknown> = { layout: oneOf(r.layout, COOKIE_LAYOUTS, "card"), side: r.side === "right" ? "right" : "left", icon: r.icon !== false, title: txt(r.title, 60), text: txt(r.text, 400), parts: normalizePartStyles(r.parts) };
  if (typeof r.title_en === "string" && r.title_en.trim()) out.title_en = txt(r.title_en, 60);
  if (typeof r.text_en === "string" && r.text_en.trim()) out.text_en = txt(r.text_en, 400);
  return out;
}

export const normalizePayStyle = (v: unknown): PayLogoStyle => oneOf(v, PAY_LOGO_STYLES, "text");

/** คีย์รูปใน R2 (เช่น website/abc.jpg) · อย่างอื่น = ไม่มีรูป */
const imgKey = (v: unknown): string | null => (typeof v === "string" && /^[\w\-./]{3,300}$/.test(v) && !v.includes("..") ? v : null);
/** คงคำแปลอังกฤษ <key>_en ของช่องข้อความ */
function keepEn<T extends object>(out: T, r: Record<string, unknown>, keys: string[], max: number): T {
  for (const k of keys) if (typeof r[`${k}_en`] === "string" && (r[`${k}_en`] as string).trim()) (out as Record<string, unknown>)[`${k}_en`] = txt(r[`${k}_en`], max);
  return out;
}

export function normalizeNotFound(raw: unknown): NotFoundLook {
  const r = obj(raw);
  const s = r.style === "image" || r.style === "big" ? r.style : "plain";
  return keepEn({ style: s, imageKey: imgKey(r.imageKey), title: txt(r.title, 80), text: txt(r.text, 240), search: r.search === true, products: r.products === true, parts: normalizePartStyles(r.parts) }, r, ["title", "text"], 240);
}
export function normalizeThanks(raw: unknown): ThanksLook {
  const r = obj(raw);
  const top = r.top === "image" || r.top === "none" ? r.top : "emoji";
  const coupon = typeof r.coupon === "string" ? r.coupon.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32) : "";
  const link = typeof r.link === "string" ? r.link.trim().slice(0, 500) : "";
  return { top, imageKey: imgKey(r.imageKey), mobileImageKey: imgKey(r.mobileImageKey), link: /^(\/(?!\/)|https?:\/\/)/i.test(link) ? link : "", coupon, follow: r.follow === true, products: r.products === true, parts: normalizePartStyles(r.parts) };
}
export function normalizePopup(raw: unknown): PopupLook {
  const r = obj(raw);
  return {
    layout: r.layout === "split" || r.layout === "sheet" || r.layout === "corner" ? r.layout : "center",
    imageKey: imgKey(r.imageKey),
    trigger: r.trigger === "scroll" || r.trigger === "exit" ? r.trigger : "delay",
    again: r.again === "7d" ? "7d" : "once",
    parts: normalizePartStyles(r.parts),
  };
}
export function normalizeShare(raw: unknown): ShareLook {
  const r = obj(raw);
  return { style: r.style === "card" || r.style === "frame" ? r.style : "photo", bg: r.bg === "brand" || r.bg === "ink" ? r.bg : "paper" };
}
export function normalizeLogin(raw: unknown): LoginLook {
  const r = obj(raw);
  const layout = r.layout === "split" || r.layout === "cover" ? r.layout : "center";
  const perks = Array.isArray(r.perks) ? r.perks.map((x) => txt(x, 80)).filter(Boolean).slice(0, 6) : [];
  const providerStyle = r.providerStyle === "mono" || r.providerStyle === "outline" ? r.providerStyle : "brand";
  return keepEn(
    { layout, imageKey: imgKey(r.imageKey), title: txt(r.title, 80), text: txt(r.text, 240), popupTitle: txt(r.popupTitle, 40), signupLabel: txt(r.signupLabel, 30), perksOn: r.perksOn !== false, perks, guestLink: r.guestLink !== false, providerStyle, parts: normalizePartStyles(r.parts) },
    r,
    ["title", "text", "popupTitle", "signupLabel"],
    240
  );
}
export function normalizeFestive(raw: unknown): FestiveLook {
  const r = obj(raw);
  return {
    kind: oneOf(r.kind, FESTIVE_KINDS, "none"),
    amount: r.amount === "few" || r.amount === "many" ? r.amount : "some",
    where: r.where === "all" ? "all" : "home",
    mobile: r.mobile !== false,
  };
}
export function normalizeProof(raw: unknown): ProofLook {
  const r = obj(raw);
  return {
    viewers: r.viewers === true,
    viewersMin: clampInt(r.viewersMin, 1, 100, 5),
    sold: r.sold === true,
    soldMin: clampInt(r.soldMin, 1, 1000, 10),
    soldSource: r.soldSource === "all" ? "all" : "web",
    soldPeriod: r.soldPeriod === "all" ? "all" : "30d",
    onCard: r.onCard === true,
  };
}
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
