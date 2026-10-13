/**
 * ของกลาง — ธีมเว็บร้านออนไลน์ (เก็บที่ shops.theme)
 *
 * ⚠️ ร้าน Pixiedustie มีค่าเดิมอยู่แล้ว (`vars`, `colors.panel` ฯลฯ ที่เว็บของเขาใช้)
 *    ทุกฟังก์ชันในไฟล์นี้จึง "merge" เท่านั้น — ไม่ลบคีย์ที่เราไม่รู้จัก
 *
 * ใช้ที่: /api/website/theme (ตั้งค่า) · /api/public/storefront/site (ส่งให้เว็บ) · UI แท็บดีไซน์
 */

export type LogoMode = "icon-text" | "image" | "text" | "icon";
export type HeaderBg = "surface" | "page" | "ink" | "brand" | "transparent";
export type MenuAlign = "left" | "center" | "right";
export type CardPreset = "flat" | "border" | "shadow" | "floating" | "minimal";
export type ImageRatio = "1:1" | "4:3" | "4:5" | "3:4" | "16:9";
export type CardHover = "none" | "lift" | "zoom";
/** แบบหน้าสินค้า (Style) — เก็บในธีม สลับกลับได้ ทุกแบรนด์ใช้ร่วมกัน */
export type ProductLayout = "classic" | "showcase";
export type ProductTitleStyle = "serif" | "display";
export type ProductImageBg = "tint" | "surface" | "none";
/** แกลเลอรีรูปของแบบโชว์เคส: editorial = เลื่อนซ้าย-ขวาเต็มจอ+ซูม (แบบ gucci) · spotlight = รูปเดียวบนวงกลม */
export type ProductGalleryStyle = "editorial" | "spotlight";
/** รายละเอียดสินค้า: accordion = พับเก็บ · tabs = แท็บ · plain = เรียงต่อกัน */
export type ProductDetailsStyle = "accordion" | "tabs" | "plain";
/** หัวข้อพับเก็บเริ่มต้นเป็นอย่างไร: first = เปิดหัวข้อแรก · closed = พับหมด · all = ขยายหมด */
export type ProductDetailsOpen = "first" | "closed" | "all";

/**
 * ⚙️ ตั้งค่าต่อส่วนประกอบของหน้าสินค้าแบบโชว์เคส — แต่ละส่วนเลือกได้ว่า "จับคู่กับข้อมูลไหน"
 * (ปุ่ม ⚙️ ในรายการลำดับส่วนประกอบ แท็บดีไซน์ → หน้าสินค้า) · storefront มิเรอร์ใน src/lib/site-config.ts
 */
/** เลือกสีแล้วแกลเลอรีทำอะไร: set = โชว์เฉพาะชุดรูปของสีนั้น · jump = รูปทั้งหมด แล้วเลื่อนไปรูปของสี */
export type GalleryColorMode = "set" | "jump";
/** จอคอมโชว์กี่รูปพร้อมกันในแกลเลอรีเลื่อนซ้าย-ขวา: 1 = ทีละรูป · 2 = สองรูปคู่กัน (แบบ Gucci) — มือถือทีละรูปเสมอ */
export type GalleryPerView = 1 | 2;
export type BannerImageSource = "second" | "last" | "parent" | "fixed";
export type BannerTitleSource = "subtitle" | "category" | "name" | "text" | "none";
export type BannerTextSource = "description" | "introduction" | "english_description" | "text" | "none";
export type BuyNoteSource = "wholesale" | "shipping" | "text" | "none";
export type RelatedSource = "category" | "collection" | "featured" | "bestseller" | "manual" | "random";
export interface ProductParts {
  gallery: { showBreadcrumb: boolean; showSubtitle: boolean; colorMode: GalleryColorMode; perView: GalleryPerView };
  buy: { showUnit: boolean; showBadge: boolean; showStock: boolean; showShortDesc: boolean; noteSource: BuyNoteSource; noteText: string };
  banner: { imageSource: BannerImageSource; imageKey: string | null; titleSource: BannerTitleSource; titleText: string; textSource: BannerTextSource; text: string };
  /** codes = รหัส Parent SKU (ตัวพิมพ์ใหญ่) เมื่อ source=manual · count 2–8 · title ว่าง = ใช้ข้อความเดิมของเว็บ */
  related: { source: RelatedSource; codes: string[]; count: number; title: string };
}
export const DEFAULT_PARTS: ProductParts = {
  gallery: { showBreadcrumb: true, showSubtitle: true, colorMode: "set", perView: 1 },
  buy: { showUnit: true, showBadge: true, showStock: true, showShortDesc: true, noteSource: "wholesale", noteText: "" },
  banner: { imageSource: "second", imageKey: null, titleSource: "subtitle", titleText: "", textSource: "description", text: "" },
  related: { source: "category", codes: [], count: 4, title: "" },
};
const PART_KEY_RE = /^[\w\-./%()]+$/;
export function normalizeParts(raw: unknown): ProductParts {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const g = r.gallery ?? {};
  const b = r.buy ?? {};
  const bn = r.banner ?? {};
  const rl = r.related ?? {};
  const d = DEFAULT_PARTS;
  const one = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fb);
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const n = Number(rl.count);
  return {
    gallery: {
      showBreadcrumb: g.showBreadcrumb !== false,
      showSubtitle: g.showSubtitle !== false,
      colorMode: one(g.colorMode, ["set", "jump"] as const, d.gallery.colorMode),
      perView: Number(g.perView) === 2 ? 2 : 1,
    },
    buy: {
      showUnit: b.showUnit !== false,
      showBadge: b.showBadge !== false,
      showStock: b.showStock !== false,
      showShortDesc: b.showShortDesc !== false,
      noteSource: one(b.noteSource, ["wholesale", "shipping", "text", "none"] as const, d.buy.noteSource),
      noteText: text(b.noteText, 300),
    },
    banner: {
      imageSource: one(bn.imageSource, ["second", "last", "parent", "fixed"] as const, d.banner.imageSource),
      imageKey: typeof bn.imageKey === "string" && PART_KEY_RE.test(bn.imageKey) ? bn.imageKey : null,
      titleSource: one(bn.titleSource, ["subtitle", "category", "name", "text", "none"] as const, d.banner.titleSource),
      titleText: text(bn.titleText, 120),
      textSource: one(bn.textSource, ["description", "introduction", "english_description", "text", "none"] as const, d.banner.textSource),
      text: text(bn.text, 2000),
    },
    related: {
      source: one(rl.source, ["category", "collection", "featured", "bestseller", "manual", "random"] as const, d.related.source),
      codes: (Array.isArray(rl.codes) ? rl.codes : []).filter((c): c is string => typeof c === "string" && c.trim().length > 0).map((c) => c.trim().toUpperCase()).slice(0, 24),
      count: Number.isFinite(n) ? Math.min(8, Math.max(2, Math.round(n))) : d.related.count,
      title: text(rl.title, 80),
    },
  };
}
/** ตัวเลือกสำหรับ ⚙️ แต่ละส่วน (ป้ายภาษาคน) — ใช้ในแท็บดีไซน์ */
export const PART_CHOICES = {
  perViews: [
    { value: 1, label: "ทีละ 1 รูป เต็มความกว้าง" },
    { value: 2, label: "2 รูปคู่กัน เลื่อนทีละรูป (แบบ Gucci) — มือถือยังทีละรูป" },
  ] as { value: GalleryPerView; label: string }[],
  colorModes: [
    { value: "set", label: "โชว์เฉพาะชุดรูปของสีนั้น", hint: "ตั้งรูปรายสีไว้ในแท็บ 🛍 เว็บไซต์ ของ Parent SKU (ไม่ได้ตั้ง = รูปปก SKU)" },
    { value: "jump", label: "รูปทั้งหมด แล้วเลื่อนไปรูปของสี", hint: "ลูกค้ายังเห็นรูปทุกสี แค่กระโดดไปรูปสีที่เลือก" },
  ] as { value: GalleryColorMode; label: string; hint: string }[],
  bannerImages: [
    { value: "second", label: "รูปที่ 2 ของสินค้า" },
    { value: "last", label: "รูปสุดท้ายของสินค้า" },
    { value: "parent", label: "รูปจากแกลเลอรี Parent SKU (รูปที่ 2 ถ้ามี)" },
    { value: "fixed", label: "อัปโหลดรูปกลาง 1 รูป ใช้ทุกสินค้า" },
  ] as { value: BannerImageSource; label: string }[],
  bannerTitles: [
    { value: "subtitle", label: "ชื่อรอง (ข้อความหลังขีดในชื่อรุ่น) หรือชื่อหมวด" },
    { value: "category", label: "ชื่อหมวด" },
    { value: "name", label: "ชื่อสินค้าเต็ม" },
    { value: "text", label: "ข้อความตายตัว" },
    { value: "none", label: "ไม่มีหัวข้อ" },
  ] as { value: BannerTitleSource; label: string }[],
  bannerTexts: [
    { value: "description", label: "คำอธิบายสินค้า (ตามที่จับคู่ฟิลด์)" },
    { value: "introduction", label: "ฟิลด์ \"คำแนะนำสินค้า\" ของ Parent SKU" },
    { value: "english_description", label: "ฟิลด์ \"คำอธิบาย EN\" ของ Parent SKU" },
    { value: "text", label: "ข้อความตายตัว" },
    { value: "none", label: "ไม่มีข้อความ" },
  ] as { value: BannerTextSource; label: string }[],
  buyNotes: [
    { value: "wholesale", label: "ลิงก์ \"สั่งจำนวนมาก / ขายส่ง? ติดต่อเรา\"" },
    { value: "shipping", label: "เงื่อนไขค่าส่งจากแท็บข้อมูลร้าน (เช่น ส่งฟรีเมื่อครบ ฿1,500)" },
    { value: "text", label: "ข้อความตายตัว" },
    { value: "none", label: "ไม่มี" },
  ] as { value: BuyNoteSource; label: string }[],
  relatedSources: [
    { value: "category", label: "หมวดเดียวกัน" },
    { value: "collection", label: "คอลเลกชันเดียวกัน (ฟิลด์ collection ใน Parent SKU)" },
    { value: "featured", label: "สินค้าที่ติ๊ก ★ แนะนำ" },
    { value: "bestseller", label: "ขายดี (จากยอดสั่งซื้อบนเว็บ)" },
    { value: "manual", label: "เลือกเอง (ระบุรุ่น)" },
    { value: "random", label: "สุ่ม" },
  ] as { value: RelatedSource; label: string }[],
};

/**
 * "ชุดรายละเอียดสินค้า" — หัวข้อ (พับเก็บ/แท็บ) ตั้งที่เดียว ใช้ทุกสินค้า
 * แต่ละหัวข้อเลือกได้ว่าเอาข้อมูลจากไหน และใช้กับรุ่นไหน (ทุกตัว / เฉพาะหมวด / เลือกเป็นรายตัว)
 * สินค้าที่ไม่มีข้อมูลในหัวข้อนั้น → หัวข้อหายไปเอง (เว็บร้านเป็นคนตัด)
 */
export type DetailSource = "description" | "fields" | "details" | "text" | "shipping";
export type DetailApply = "all" | "categories" | "products";
/** หัวข้อนี้เริ่มต้นพับหรือเปิด: auto = ตามค่ารวม (detailsOpen) · open = เปิดไว้ · closed = พับไว้ */
export type DetailOpen = "auto" | "open" | "closed";
export interface ProductDetailItem {
  id: string;
  label: string;
  source: DetailSource;
  /** source=fields: ฟิลด์ของ Parent SKU ที่จะโชว์ (ดู PRODUCT_SPEC_FIELDS) */
  fields: string[];
  /** source=text: ข้อความตายตัว */
  text: string;
  applyTo: DetailApply;
  /** applyTo=categories: รหัสหมวดเว็บ */
  categories: string[];
  /** applyTo=products: รหัส Parent SKU */
  products: string[];
  enabled: boolean;
  defaultOpen: DetailOpen;
}
/** ฟิลด์ของ Parent SKU ที่ให้เลือกโชว์บนเว็บ (API สาธารณะส่งเฉพาะชุดนี้ — ไม่มีต้นทุน/ข้อมูลภายใน) */
export const PRODUCT_SPEC_FIELDS: { key: string; label: string; unit?: string }[] = [
  { key: "materials", label: "วัสดุ" },
  { key: "size_summary", label: "ขนาด" },
  { key: "custom_size", label: "ขนาด (ระบุเอง)" },
  { key: "size_length_cm", label: "ความยาว", unit: "ซม." },
  { key: "size_height_cm", label: "ความสูง", unit: "ซม." },
  { key: "size_thickness_cm", label: "ความหนา", unit: "ซม." },
  { key: "weight_g", label: "น้ำหนัก", unit: "กรัม" },
  { key: "lining", label: "ซับใน" },
  { key: "strap", label: "สายสะพาย" },
  { key: "zipper", label: "ซิป" },
  { key: "spares", label: "อะไหล่" },
  { key: "logo", label: "โลโก้" },
  { key: "thread", label: "ด้าย" },
  { key: "warranty", label: "การรับประกัน" },
  { key: "introduction", label: "คำแนะนำสินค้า" },
  { key: "english_description", label: "คำอธิบาย (EN)" },
];
export const DETAIL_SOURCES: { value: DetailSource; label: string; hint: string }[] = [
  { value: "description", label: "คำอธิบายสินค้า", hint: "ตามที่จับคู่ฟิลด์ไว้ / ที่กรอกทับในสินค้าบนเว็บ" },
  { value: "fields", label: "ฟิลด์จาก Parent SKU", hint: "เลือกได้หลายช่อง โชว์เป็นตาราง เช่น วัสดุ · ขนาด · น้ำหนัก" },
  { value: "details", label: "จุดเด่น (รายการติ๊ก)", hint: "รายการย่อยของสินค้า (ถ้ามี)" },
  { value: "text", label: "ข้อความตายตัว", hint: "พิมพ์ครั้งเดียว ใช้หลายรุ่น เช่น ประกัน/วิธีดูแล" },
  { value: "shipping", label: "การจัดส่ง & ชำระเงิน", hint: "ดึงจากแท็บข้อมูลร้าน (ค่าส่ง/ส่งฟรี/ช่องทางจ่าย)" },
];
export const DEFAULT_DETAIL_ITEMS: ProductDetailItem[] = [
  { id: "desc", label: "รายละเอียดสินค้า", source: "description", fields: [], text: "", applyTo: "all", categories: [], products: [], enabled: true, defaultOpen: "auto" },
  { id: "spec", label: "วัสดุและขนาด", source: "fields", fields: ["materials", "size_summary", "weight_g", "lining", "strap"], text: "", applyTo: "all", categories: [], products: [], enabled: true, defaultOpen: "auto" },
  { id: "details", label: "จุดเด่น", source: "details", fields: [], text: "", applyTo: "all", categories: [], products: [], enabled: true, defaultOpen: "auto" },
  { id: "shipping", label: "การจัดส่งและชำระเงิน", source: "shipping", fields: [], text: "", applyTo: "all", categories: [], products: [], enabled: true, defaultOpen: "auto" },
];
const strList = (v: unknown, max: number, upper = false): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => String(x ?? "").trim().slice(0, 80))
    .map((x) => (upper ? x.toUpperCase() : x))
    .filter(Boolean)
    .slice(0, max);
export function normalizeDetailItems(raw: unknown): ProductDetailItem[] {
  if (!Array.isArray(raw)) return DEFAULT_DETAIL_ITEMS.map((d) => ({ ...d, fields: [...d.fields] }));
  const out: ProductDetailItem[] = [];
  const seen = new Set<string>();
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    let id = String(r.id ?? "").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || `d${out.length + 1}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    const source = (["description", "fields", "details", "text", "shipping"] as const).includes(r.source as DetailSource) ? (r.source as DetailSource) : "text";
    out.push({
      id,
      label: String(r.label ?? "").trim().slice(0, 60) || "หัวข้อ",
      source,
      // ฟิลด์มาจากทะเบียนฟิลด์กลาง (lib/website-parent-fields.ts) ไม่ใช่แค่ 15 ช่องเดิม — รับทุก key ที่เป็นชื่อคอลัมน์
      fields: strList(r.fields, 40).filter((k) => /^[a-z0-9_]+$/i.test(k)),
      text: String(r.text ?? "").slice(0, 4000),
      applyTo: (["all", "categories", "products"] as const).includes(r.applyTo as DetailApply) ? (r.applyTo as DetailApply) : "all",
      categories: strList(r.categories, 50),
      products: strList(r.products, 500, true),
      enabled: r.enabled !== false,
      defaultOpen: (["auto", "open", "closed"] as const).includes(r.defaultOpen as DetailOpen) ? (r.defaultOpen as DetailOpen) : "auto",
    });
    if (out.length >= 20) break;
  }
  return out;
}
/** ส่วนประกอบของหน้าสินค้าแบบโชว์เคส — ลากจัดลำดับ/ซ่อนได้ในแท็บหน้าสินค้า */
export type ProductSection = "gallery" | "buy" | "details" | "banner" | "related";
export const PRODUCT_SECTION_ORDER: ProductSection[] = ["gallery", "buy", "details", "banner", "related"];


/**
 * 📱 ค่าที่ตั้ง "แยกสำหรับมือถือ" (จอ < 768px) ของหน้าสินค้า — null/ไม่มี = ตามคอม
 * เว็บร้านเลือกใช้เองตามขนาดจอ (ThemeProvider → resolveMobileProduct) · แท็บดีไซน์มีสวิตช์ 🖥 คอม / 📱 มือถือ
 * รองรับ: วิธีโชว์รายละเอียด + ค่าเริ่มต้นพับ/เปิด (รวม/ต่อหัวข้อ) · ลำดับ/ซ่อนส่วนประกอบ · โชว์-ซ่อนรายละเอียดย่อยในส่วนรูปใหญ่/ราคา-ตะกร้า
 */
export interface ProductMobile {
  detailsStyle: ProductDetailsStyle | null;
  detailsOpen: ProductDetailsOpen | null;
  /** ต่อหัวข้อ (id → open|closed) — ไม่มี key = ตามคอม */
  itemsOpen: Record<string, DetailOpen>;
  sections: ProductSection[] | null;
  hidden: ProductSection[] | null;
  gallery: Partial<Pick<ProductParts["gallery"], "showBreadcrumb" | "showSubtitle">>;
  buy: Partial<ProductParts["buy"]>;
}
export function normalizeMobile(raw: unknown): ProductMobile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null);
  const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
  const itemsOpen: Record<string, DetailOpen> = {};
  if (r.itemsOpen && typeof r.itemsOpen === "object") {
    for (const [k, v] of Object.entries(r.itemsOpen as Record<string, unknown>).slice(0, 40)) {
      const o = pick(v, ["open", "closed"] as const);
      if (o && /^[a-z0-9_-]+$/i.test(k)) itemsOpen[k] = o;
    }
  }
  const g = (r.gallery && typeof r.gallery === "object" ? r.gallery : {}) as Record<string, unknown>;
  const b = (r.buy && typeof r.buy === "object" ? r.buy : {}) as Record<string, unknown>;
  const gallery: ProductMobile["gallery"] = {};
  if (bool(g.showBreadcrumb) !== undefined) gallery.showBreadcrumb = g.showBreadcrumb as boolean;
  if (bool(g.showSubtitle) !== undefined) gallery.showSubtitle = g.showSubtitle as boolean;
  const buy: ProductMobile["buy"] = {};
  for (const k of ["showUnit", "showBadge", "showStock", "showShortDesc"] as const) if (bool(b[k]) !== undefined) buy[k] = b[k] as boolean;
  const ns = pick(b.noteSource, ["wholesale", "shipping", "text", "none"] as const);
  if (ns) buy.noteSource = ns;
  if (typeof b.noteText === "string" && b.noteText.trim()) buy.noteText = b.noteText.trim().slice(0, 300);
  return {
    detailsStyle: pick(r.detailsStyle, ["accordion", "tabs", "plain"] as const),
    detailsOpen: pick(r.detailsOpen, ["first", "closed", "all"] as const),
    itemsOpen,
    sections: Array.isArray(r.sections) ? normalizeProductSections(r.sections) : null,
    hidden: Array.isArray(r.hidden) ? normalizeHiddenSections(r.hidden) : null,
    gallery,
    buy,
  };
}
/** ค่าหน้าสินค้าที่ "มือถือ" ใช้จริง = ค่าคอม แล้วทับด้วยที่ตั้งแยกไว้ */
export function resolveMobileProduct<P extends SiteTheme["product"]>(p: P): P {
  const m = p.mobile;
  return {
    ...p,
    detailsStyle: m.detailsStyle ?? p.detailsStyle,
    detailsOpen: m.detailsOpen ?? p.detailsOpen,
    sections: m.sections ?? p.sections,
    hidden: m.hidden ?? p.hidden,
    detailItems: p.detailItems.map((it) => (m.itemsOpen[it.id] ? { ...it, defaultOpen: m.itemsOpen[it.id] } : it)),
    parts: { ...p.parts, gallery: { ...p.parts.gallery, ...m.gallery }, buy: { ...p.parts.buy, ...m.buy } },
  };
}
/** มีค่าที่ตั้งแยกสำหรับมือถืออยู่ไหม (ไว้โชว์ป้ายในแท็บดีไซน์) */
export function mobileOverrideCount(m: ProductMobile): number {
  return (m.detailsStyle ? 1 : 0) + (m.detailsOpen ? 1 : 0) + Object.keys(m.itemsOpen).length + (m.sections ? 1 : 0) + (m.hidden ? 1 : 0) + Object.keys(m.gallery).length + Object.keys(m.buy).length;
}

export interface SiteTheme {
  colors: {
    brand: string;
    brandDeep: string;
    ink: string;
    page: string;
    surface: string;
    muted: string;
  };
  fonts: { display: string; body: string };
  radius: "sharp" | "soft" | "round";
  logo: {
    /** ตัวอักษรในกล่องโลโก้ เช่น "IG" */
    mark: string;
    /** ข้อความต่อท้าย เช่น "International" */
    text: string;
    /** รูปแบบการแสดง */
    mode: LogoMode;
    /** ไฟล์โลโก้ (r2 key) — ใช้เมื่อ mode = image */
    imageKey: string | null;
    /** โลโก้สำหรับพื้นหลังเข้ม (เช่น footer) */
    imageDarkKey: string | null;
    /** ไอคอนบนแท็บเบราว์เซอร์ */
    faviconKey: string | null;
    /** ความสูงโลโก้ (px) */
    height: number;
  };
  header: {
    /** ความสูงแถบเมนู (px) */
    height: number;
    /** ตรึงแถบเมนูไว้ด้านบนเมื่อเลื่อน */
    sticky: boolean;
    bg: HeaderBg;
    menuAlign: MenuAlign;
    showCart: boolean;
    /** เส้นคั่นใต้แถบเมนู */
    border: boolean;
  };
  card: {
    preset: CardPreset;
    imageRatio: ImageRatio;
    /** จำนวนบรรทัดของชื่อสินค้า */
    titleLines: number;
    showBadge: boolean;
    showStock: boolean;
    hover: CardHover;
  };
  /** หน้าสินค้า: classic = รูปซ้าย ข้อมูลขวา · showcase = ชื่อรุ่นใหญ่ + รูปกลางจอ (ดู storefront ProductShowcase) */
  product: {
    layout: ProductLayout;
    /** ชื่อรุ่นตัวเอียงแบบนิตยสาร (เฉพาะชื่ออังกฤษ) หรือฟอนต์หัวเรื่องของธีม */
    titleStyle: ProductTitleStyle;
    /** พื้นหลังหลังรูป (สี) */
    imageBg: ProductImageBg;
    /** รูปพื้นหลังหลังรูปสินค้า (r2 key) — ใส่แล้วใช้แทนสี */
    imageBgKey: string | null;
    /** (เก่า) แยกเป็นแท็บ — ใช้ detailsStyle แทน เก็บไว้ให้ค่าที่บันทึกก่อนหน้ายังอ่านได้ */
    showTabs: boolean;
    galleryStyle: ProductGalleryStyle;
    detailsStyle: ProductDetailsStyle;
    detailsOpen: ProductDetailsOpen;
    /** ชุดรายละเอียดสินค้า (หัวข้อพับเก็บ/แท็บ) */
    detailItems: ProductDetailItem[];
    /** ลำดับส่วนประกอบ (ครบทุกตัวเสมอ) */
    sections: ProductSection[];
    /** ส่วนที่ซ่อน (ซ่อนได้เฉพาะ details/banner/related) */
    hidden: ProductSection[];
    /** ⚙️ ตั้งค่าต่อส่วนประกอบ (จับคู่ข้อมูล / โชว์-ซ่อนรายละเอียดย่อย) */
    parts: ProductParts;
    /** 📱 ค่าที่ตั้งแยกสำหรับมือถือ (ตามคอมถ้าไม่ตั้ง) */
    mobile: ProductMobile;
  };
}

export const DEFAULT_THEME: SiteTheme = {
  colors: {
    brand: "#E2540F",
    brandDeep: "#B8420A",
    ink: "#141517",
    page: "#FAFAF9",
    surface: "#FFFFFF",
    muted: "#9BA1A9",
  },
  fonts: { display: "Kanit", body: "Noto Sans Thai" },
  radius: "soft",
  logo: {
    mark: "IG",
    text: "International",
    mode: "icon-text",
    imageKey: null,
    imageDarkKey: null,
    faviconKey: null,
    height: 34,
  },
  header: { height: 72, sticky: true, bg: "page", menuAlign: "center", showCart: true, border: true },
  card: { preset: "flat", imageRatio: "4:5", titleLines: 2, showBadge: true, showStock: true, hover: "lift" },
  product: { layout: "classic", titleStyle: "serif", imageBg: "tint", imageBgKey: null, showTabs: true, galleryStyle: "editorial", detailsStyle: "accordion", detailsOpen: "first", detailItems: DEFAULT_DETAIL_ITEMS.map((d) => ({ ...d, fields: [...d.fields] })), sections: [...PRODUCT_SECTION_ORDER], hidden: [], parts: normalizeParts(DEFAULT_PARTS), mobile: normalizeMobile(null) },
};

/** อ่านลำดับส่วนประกอบจาก DB ให้ครบทุกตัว ไม่ซ้ำ (ตัวที่หายไปต่อท้ายตามลำดับเริ่มต้น) */
export function normalizeProductSections(raw: unknown): ProductSection[] {
  const seen = new Set<ProductSection>();
  const out: ProductSection[] = [];
  for (const v of Array.isArray(raw) ? raw : []) {
    if (typeof v === "string" && (PRODUCT_SECTION_ORDER as string[]).includes(v) && !seen.has(v as ProductSection)) {
      seen.add(v as ProductSection);
      out.push(v as ProductSection);
    }
  }
  for (const k of PRODUCT_SECTION_ORDER) if (!seen.has(k)) out.push(k);
  return out;
}
const HIDEABLE: ProductSection[] = ["details", "banner", "related"];
export function normalizeHiddenSections(raw: unknown): ProductSection[] {
  return (Array.isArray(raw) ? raw : []).filter((v): v is ProductSection => typeof v === "string" && (HIDEABLE as string[]).includes(v));
}

export const FONT_CHOICES = ["Kanit", "Noto Sans Thai", "Prompt", "Sarabun", "IBM Plex Sans Thai"];

export const RADIUS_CHOICES: { value: SiteTheme["radius"]; label: string }[] = [
  { value: "sharp", label: "เหลี่ยม (คม)" },
  { value: "soft", label: "มนเล็กน้อย" },
  { value: "round", label: "มนมาก" },
];

export const LOGO_MODES: { value: LogoMode; label: string }[] = [
  { value: "icon-text", label: "กล่องอักษร + ชื่อ" },
  { value: "image", label: "รูปโลโก้" },
  { value: "text", label: "ชื่อร้านอย่างเดียว" },
  { value: "icon", label: "กล่องอักษรอย่างเดียว" },
];

export const HEADER_BG: { value: HeaderBg; label: string }[] = [
  { value: "page", label: "สีพื้นหลังเว็บ" },
  { value: "surface", label: "สีพื้นการ์ด (ขาว)" },
  { value: "ink", label: "สีเข้ม" },
  { value: "brand", label: "สีแบรนด์" },
  { value: "transparent", label: "โปร่งใส" },
];

export const MENU_ALIGNS: { value: MenuAlign; label: string }[] = [
  { value: "left", label: "ชิดซ้าย" },
  { value: "center", label: "กึ่งกลาง" },
  { value: "right", label: "ชิดขวา" },
];

export const CARD_PRESETS: { value: CardPreset; label: string; hint: string }[] = [
  { value: "flat", label: "เรียบ", hint: "ไม่มีกรอบ ไม่มีเงา" },
  { value: "border", label: "มีกรอบ", hint: "เส้นขอบบาง" },
  { value: "shadow", label: "เงานุ่ม", hint: "เงาอ่อน ๆ" },
  { value: "floating", label: "ลอย", hint: "เงาชัด ดูเด่น" },
  { value: "minimal", label: "มินิมอล", hint: "เฉพาะรูป+ข้อความ" },
];

export const PRODUCT_LAYOUTS: { value: ProductLayout; label: string; hint: string }[] = [
  { value: "classic", label: "คลาสสิก", hint: "รูปซ้าย ข้อมูลขวา — แบบร้านค้าทั่วไป อ่านง่าย" },
  { value: "showcase", label: "โชว์เคส", hint: "ชื่อรุ่นตัวใหญ่ + รูปใหญ่กลางจอ ราคาซ้าย ตัวเลือกขวา — แบบแบรนด์บิวตี้/แฟชั่น" },
];
export const PRODUCT_TITLE_STYLES: { value: ProductTitleStyle; label: string }[] = [
  { value: "serif", label: "ตัวเอียงแบบนิตยสาร (ชื่ออังกฤษ)" },
  { value: "display", label: "ฟอนต์หัวเรื่องของธีม" },
];
export const PRODUCT_GALLERY_STYLES: { value: ProductGalleryStyle; label: string; hint: string }[] = [
  { value: "editorial", label: "เลื่อนซ้าย-ขวา เต็มจอ (แบบ Gucci)", hint: "รูปเต็มความกว้าง ลูกศร/รูปย่อ/ตัวนับ คลิกซูม ปัดนิ้วได้" },
  { value: "spotlight", label: "รูปเดียวบนวงกลม", hint: "รูปใหญ่กลางจอบนพื้นวงกลม จุดเลื่อนรูป" },
];
export const PRODUCT_DETAILS_STYLES: { value: ProductDetailsStyle; label: string }[] = [
  { value: "accordion", label: "พับเก็บ กดเปิดทีละหัวข้อ (แบบ Gucci)" },
  { value: "tabs", label: "แท็บ" },
  { value: "plain", label: "เรียงต่อกัน ไม่พับ" },
];

export const PRODUCT_DETAILS_OPEN: { value: ProductDetailsOpen; label: string }[] = [
  { value: "first", label: "เปิดหัวข้อแรกไว้ ที่เหลือพับ" },
  { value: "closed", label: "พับทั้งหมด" },
  { value: "all", label: "ขยายทั้งหมด (พับได้)" },
];

export const PRODUCT_SECTIONS: { value: ProductSection; label: string; hint: string; hideable: boolean }[] = [
  { value: "gallery", label: "ชื่อรุ่น + รูปใหญ่", hint: "หัวเรื่อง รูปกลางจอ จุดเลื่อนรูป", hideable: false },
  { value: "buy", label: "ราคา · ตัวเลือก · ใส่ตะกร้า", hint: "ราคา/คำอธิบายสั้น ซ้าย · จำนวน/สี/ปุ่ม ขวา", hideable: false },
  { value: "details", label: "รายละเอียด / จุดเด่น", hint: "แท็บหรือเรียงต่อกัน ตามตัวเลือกด้านบน", hideable: true },
  { value: "banner", label: "แบนเนอร์รูปที่ 2", hint: "โชว์เมื่อสินค้ามีรูปมากกว่า 1 รูป", hideable: true },
  { value: "related", label: "คุณอาจชอบ", hint: "สินค้าหมวดเดียวกัน 4 รายการ", hideable: true },
];

export const PRODUCT_IMAGE_BGS: { value: ProductImageBg; label: string }[] = [
  { value: "tint", label: "วงกลมสีแบรนด์จาง ๆ" },
  { value: "surface", label: "วงกลมสีพื้นการ์ด" },
  { value: "none", label: "ไม่มีพื้นหลัง" },
];

export const IMAGE_RATIOS: { value: ImageRatio; label: string }[] = [
  { value: "1:1", label: "จัตุรัส 1:1" },
  { value: "4:3", label: "แนวนอน 4:3" },
  { value: "4:5", label: "แนวตั้ง 4:5" },
  { value: "3:4", label: "แนวตั้ง 3:4" },
  { value: "16:9", label: "กว้าง 16:9" },
];

export const CARD_HOVERS: { value: CardHover; label: string }[] = [
  { value: "none", label: "ไม่มี" },
  { value: "lift", label: "ยกขึ้นเล็กน้อย" },
  { value: "zoom", label: "ซูมรูป" },
];

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const R2_KEY = /^[a-zA-Z0-9._/-]+$/;

const color = (v: unknown, fallback: string) =>
  typeof v === "string" && HEX.test(v.trim()) ? v.trim() : fallback;
const text = (v: unknown, fallback: string, max = 40) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;
const key = (v: unknown): string | null =>
  typeof v === "string" && v.trim() && R2_KEY.test(v.trim()) ? v.trim().slice(0, 300) : null;
const num = (v: unknown, fb: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fb;
};
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/** อ่านค่าที่เก็บใน DB ให้เป็น SiteTheme ที่ครบถ้วนเสมอ (กันข้อมูลเก่า/ไม่ครบ) */
export function normalizeTheme(raw: unknown): SiteTheme {
  const r = (raw ?? {}) as Record<string, unknown>;
  const c = (r.colors ?? {}) as Record<string, unknown>;
  const f = (r.fonts ?? {}) as Record<string, unknown>;
  const l = (r.logo ?? {}) as Record<string, unknown>;
  const h = (r.header ?? {}) as Record<string, unknown>;
  const cd = (r.card ?? {}) as Record<string, unknown>;
  const pd = (r.product ?? {}) as Record<string, unknown>;
  const d = DEFAULT_THEME;

  return {
    colors: {
      brand: color(c.brand, d.colors.brand),
      brandDeep: color(c.brandDeep, d.colors.brandDeep),
      ink: color(c.ink, d.colors.ink),
      page: color(c.page, d.colors.page),
      surface: color(c.surface, d.colors.surface),
      muted: color(c.muted, d.colors.muted),
    },
    fonts: {
      display: text(f.display, d.fonts.display),
      body: text(f.body, d.fonts.body),
    },
    radius: pick(r.radius, ["sharp", "soft", "round"] as const, d.radius),
    logo: {
      mark: text(l.mark, d.logo.mark, 4),
      text: text(l.text, d.logo.text, 40),
      mode: pick(l.mode, ["icon-text", "image", "text", "icon"] as const, d.logo.mode),
      imageKey: key(l.imageKey),
      imageDarkKey: key(l.imageDarkKey),
      faviconKey: key(l.faviconKey),
      height: num(l.height, d.logo.height, 20, 80),
    },
    header: {
      height: num(h.height, d.header.height, 48, 120),
      sticky: h.sticky !== false,
      bg: pick(h.bg, ["surface", "page", "ink", "brand", "transparent"] as const, d.header.bg),
      menuAlign: pick(h.menuAlign, ["left", "center", "right"] as const, d.header.menuAlign),
      showCart: h.showCart !== false,
      border: h.border !== false,
    },
    card: {
      preset: pick(cd.preset, ["flat", "border", "shadow", "floating", "minimal"] as const, d.card.preset),
      imageRatio: pick(cd.imageRatio, ["1:1", "4:3", "4:5", "3:4", "16:9"] as const, d.card.imageRatio),
      titleLines: num(cd.titleLines, d.card.titleLines, 1, 3),
      showBadge: cd.showBadge !== false,
      showStock: cd.showStock !== false,
      hover: pick(cd.hover, ["none", "lift", "zoom"] as const, d.card.hover),
    },
    product: {
      layout: pick(pd.layout, ["classic", "showcase"] as const, d.product.layout),
      titleStyle: pick(pd.titleStyle, ["serif", "display"] as const, d.product.titleStyle),
      imageBg: pick(pd.imageBg, ["tint", "surface", "none"] as const, d.product.imageBg),
      imageBgKey: key(pd.imageBgKey),
      showTabs: pd.showTabs !== false,
      galleryStyle: pick(pd.galleryStyle, ["editorial", "spotlight"] as const, d.product.galleryStyle),
      // ค่าที่บันทึกก่อนมี detailsStyle: showTabs=false เคยหมายถึง "เรียงต่อกัน"
      detailsStyle: pick(pd.detailsStyle, ["accordion", "tabs", "plain"] as const, pd.showTabs === false ? "plain" : d.product.detailsStyle),
      detailsOpen: pick(pd.detailsOpen, ["first", "closed", "all"] as const, d.product.detailsOpen),
      detailItems: normalizeDetailItems(pd.detailItems),
      sections: normalizeProductSections(pd.sections),
      hidden: normalizeHiddenSections(pd.hidden),
      parts: normalizeParts(pd.parts),
      mobile: normalizeMobile(pd.mobile),
    },
  };
}

/**
 * รวมธีมใหม่เข้ากับค่าเดิมใน DB โดยไม่ลบคีย์ที่เราไม่รู้จัก
 * (สำคัญกับ Pixiedustie ที่มี vars/colors.panel ของตัวเอง)
 */
export function mergeTheme(existing: unknown, incoming: unknown): Record<string, unknown> {
  const base = (existing ?? {}) as Record<string, unknown>;
  const baseColors = (base.colors ?? {}) as Record<string, unknown>;
  const t = normalizeTheme(incoming);

  return {
    ...base,
    colors: { ...baseColors, ...t.colors },
    fonts: t.fonts,
    radius: t.radius,
    logo: t.logo,
    header: t.header,
    card: t.card,
    product: t.product,
  };
}
