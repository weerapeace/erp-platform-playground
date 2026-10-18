/**
 * ของกลาง — ธีมเว็บร้านออนไลน์ (เก็บที่ shops.theme)
 *
 * ⚠️ ร้าน Pixiedustie มีค่าเดิมอยู่แล้ว (`vars`, `colors.panel` ฯลฯ ที่เว็บของเขาใช้)
 *    ทุกฟังก์ชันในไฟล์นี้จึง "merge" เท่านั้น — ไม่ลบคีย์ที่เราไม่รู้จัก
 *
 * ใช้ที่: /api/website/theme (ตั้งค่า) · /api/public/storefront/site (ส่งให้เว็บ) · UI แท็บดีไซน์
 */

import { normalizeListing, DEFAULT_LISTING, type ListingConfig } from "@/lib/website-listing";
import { normalizeCart, DEFAULT_CART, type CartConfig } from "@/lib/website-cart";
import { isGradStop } from "@/lib/website-gradient";
import { DEFAULT_HEADER_CART, DEFAULT_HEADER_SEARCH, normalizeHeaderCart, normalizeHeaderSearch, type HeaderCart, type HeaderSearch } from "@/lib/website-header-els";
import { DEFAULT_MENU_BEHAVIOR, normalizeMegaPanel, normalizeMenuBehavior, type MegaPanel, type MenuBehavior } from "@/lib/website-mega-menu";
import { carryTranslations } from "@/lib/content-i18n";
import { newDropHref } from "@/lib/website-links";
import { normalizeContentSources, type ContentSource } from "@/lib/website-content-sources";
import { defaultOverPages, normalizeOverPages, type OverPages } from "@/lib/website-header-over";
export type LogoMode = "icon-text" | "image" | "text" | "icon";
export type HeaderBg = "surface" | "page" | "ink" | "brand" | "transparent";
export type MenuAlign = "left" | "center" | "right";
export type CardPreset = "flat" | "border" | "shadow" | "floating" | "minimal";
export type ImageRatio = "1:1" | "4:3" | "4:5" | "3:4" | "16:9";
/** slide = เลื่อนรูปบนการ์ด (คอม: ลูกศร‹ › ตอนชี้ · มือถือ: ปัดนิ้ว) */
/** 🏷 ป้ายอัตโนมัติบนการ์ด — {pct} ในข้อความลด = เปอร์เซ็นต์ที่ลด (จากราคาขีดฆ่า) */
export interface CardAutoBadges {
  sale: boolean; saleText: string; saleMin: number; saleColor: string;
  new: boolean; newText: string; newDays: number; newColor: string;
  best: boolean; bestText: string; bestTop: number; bestColor: string;
  pos: "top-left" | "top-right";
  shape: "pill" | "square";
}
export const DEFAULT_AUTO_BADGES: CardAutoBadges = {
  sale: false, saleText: "ลด {pct}%", saleMin: 5, saleColor: "#C62828",
  new: false, newText: "ใหม่", newDays: 30, newColor: "#141517",
  best: false, bestText: "ขายดี", bestTop: 5, bestColor: "#B7791F",
  pos: "top-left", shape: "pill",
};
export function normalizeAutoBadges(raw: unknown): CardAutoBadges {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_AUTO_BADGES;
  const txt = (v: unknown, fb: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 24) : fb);
  const hex = (v: unknown, fb: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fb);
  const n = (v: unknown, fb: number, lo: number, hi: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : fb; };
  return {
    sale: r.sale === true, saleText: txt(r.saleText, d.saleText), saleMin: n(r.saleMin, d.saleMin, 1, 90), saleColor: hex(r.saleColor, d.saleColor),
    new: r.new === true, newText: txt(r.newText, d.newText), newDays: n(r.newDays, d.newDays, 1, 365), newColor: hex(r.newColor, d.newColor),
    best: r.best === true, bestText: txt(r.bestText, d.bestText), bestTop: n(r.bestTop, d.bestTop, 1, 50), bestColor: hex(r.bestColor, d.bestColor),
    pos: r.pos === "top-right" ? "top-right" : "top-left",
    shape: r.shape === "square" ? "square" : "pill",
  };
}
export type CardHover = "none" | "lift" | "zoom" | "swap" | "lift-swap" | "slide";
/** 🖼 ระหว่างรอรูปโหลด: logo = โลโก้จาง ๆ กลางกรอบ · none = พื้นเปล่า */
export type ImagePlaceholderMode = "logo" | "none";
export interface ImagePlaceholder {
  mode: ImagePlaceholderMode;
  /** รูปโลโก้สำหรับจุดนี้ (r2 key) — ว่าง = ใช้โลโก้หลัก */
  imageKey: string | null;
  /** ความจาง % (4–40) */
  opacity: number;
  /** ขนาด % ของกรอบ (20–70) */
  size: number;
  /**
   * สีพื้นตอนรอ (หายไปเมื่อรูปจริงขึ้น) — ว่าง = ตามพื้นหลังรูปเดิม · ชื่อสีธีม (เปลี่ยนธีมแล้วตาม) หรือ #rrggbb
   * ตรวจด้วยของกลาง isGradStop (lib/website-gradient.ts) ชุดเดียวกับจุดสีของสีไล่
   */
  bg: string;
}
export const DEFAULT_IMAGE_PLACEHOLDER: ImagePlaceholder = { mode: "logo", imageKey: null, opacity: 12, size: 36, bg: "" };
export type CardQuickAdd = "hover" | "always" | "none";
export type CardAlign = "left" | "center";
export type CardGap = "sm" | "md" | "lg";
export type CardImageFit = "cover" | "contain";
/** จำนวนคอลัมน์ของกริดการ์ดต่อจอ */
export interface CardColumns { desktop: number; tablet: number; mobile: number }
/** แบบหน้าสินค้า (Style) — เก็บในธีม สลับกลับได้ ทุกแบรนด์ใช้ร่วมกัน */
export type ProductLayout = "classic" | "showcase";
export type ProductTitleStyle = "serif" | "display";
export type ProductImageBg = "tint" | "surface" | "none";
/** พื้นหลังหลังรูปสินค้า: preset = สีตามตัวเลือก (imageBg) · color = สีเดียวที่เลือกเอง · gradient = ไล่สี 2 สี · image = รูป (imageBgKey) */
export type ProductImageBgKind = "preset" | "color" | "gradient" | "image";
export interface ProductGradient { from: string; to: string; angle: number }
/** เอฟเฟกต์รูปสินค้า: shadow เงานุ่ม (เดิม) · none ไม่มี · border กรอบบาง · rounded มุมมน · rounded-shadow มุมมน+เงา */
export type ProductImageEffect = "shadow" | "none" | "border" | "rounded" | "rounded-shadow";
export const PRODUCT_IMAGE_EFFECTS: { value: ProductImageEffect; label: string }[] = [
  { value: "shadow", label: "เงานุ่มใต้รูป" },
  { value: "none", label: "ไม่มีเอฟเฟกต์" },
  { value: "border", label: "กรอบเส้นบาง" },
  { value: "rounded", label: "มุมมน" },
  { value: "rounded-shadow", label: "มุมมน + เงา" },
];
/** ขนาดรูปในกรอบ: cover = เต็มกรอบ (ตัดขอบ) · contain = ย่อให้พอดี ตาม imageSize % ของกรอบ */
/** auto = ทีละรูป: รูปที่สัดส่วนใกล้กรอบ (ตัดไม่เกิน ~30% เช่น รูปนายแบบ/รูปจัตุรัส) = เต็มกรอบ · รูปที่ต้องตัดเยอะ = ย่อพอดีตาม imageSize */
export type ProductImageFit = "contain" | "cover" | "auto";
export const PRODUCT_IMAGE_SIZES: { value: string; label: string }[] = [
  { value: "auto", label: "อัตโนมัติตามรูป (รูปนายแบบเต็มกรอบ · รูปที่ต้องตัดเยอะย่อพอดี)" },
  { value: "cover", label: "เต็มกรอบ (ตัดขอบให้เต็ม)" },
  { value: "100", label: "100% พอดีกรอบ" },
  { value: "90", label: "90%" },
  { value: "86", label: "86% (ปกติ)" },
  { value: "75", label: "75%" },
  { value: "60", label: "60%" },
  { value: "50", label: "50%" },
];
export const GRADIENT_ANGLES: { value: number; label: string }[] = [
  { value: 180, label: "บน → ล่าง" },
  { value: 0, label: "ล่าง → บน" },
  { value: 90, label: "ซ้าย → ขวา" },
  { value: 270, label: "ขวา → ซ้าย" },
  { value: 135, label: "เฉียง ↘" },
  { value: 45, label: "เฉียง ↗" },
];
/** แกลเลอรีรูปของแบบโชว์เคส: editorial = เลื่อนซ้าย-ขวาเต็มจอ+ซูม (แบบ gucci) · spotlight = รูปเดียวบนวงกลม */
export type ProductGalleryStyle = "editorial" | "spotlight";
/** 🧵 กดชื่อวัสดุในรายละเอียดสินค้า → page หน้าเต็ม · drawer แผงจากขวา · modal ป๊อปกลางจอ (เว็บร้าน components/materials/MaterialViewer) */
export type ProductMaterialView = "page" | "drawer" | "modal";
export const MATERIAL_VIEWS: { value: ProductMaterialView; label: string; hint: string }[] = [
  { value: "drawer", label: "แผงเลื่อนจากขวา", hint: "แนะนำ · ลูกค้าอยู่หน้าสินค้าต่อ · มือถือเลื่อนขึ้นจากล่าง" },
  { value: "modal", label: "ป๊อปกลางจอ แบบนิตยสาร", hint: "รูปผิววัสดุซ้าย ข้อความขวา · เด่นสุดเมื่อมีรูปวัสดุ" },
  { value: "page", label: "ไปหน้าวัสดุเต็ม", hint: "เปิดหน้าใหม่ /materials/… รูปเต็มจอ + เรื่องราว (ค่าเดิม)" },
];
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
/** second/last = รูปสินค้า · nth = รูปที่ N ของสินค้า · parent = รูปที่ N ของแกลเลอรี Parent SKU · field = ฟิลด์รูปของ Parent SKU · fixed = อัปโหลดรูปกลาง */
export type BannerImageSource = "second" | "last" | "nth" | "parent" | "field" | "fixed";
/** สัดส่วนรูปแบนเนอร์ — auto = ตามเดิม (ครึ่งจอ 16:10 · เต็มจอ 21:9 · มือถือ 4:3) */
export type BannerRatio = "auto" | "1:1" | "4:5" | "3:4" | "4:3" | "16:10" | "16:9" | "21:9" | "3:1";
/** ความกว้างแบนเนอร์: narrow = แคบกลางจอ · container = เท่าเนื้อหา · full = เต็มขอบจอ */
export type BannerWidth = "narrow" | "container" | "full";
export type BannerTitleSource = "subtitle" | "category" | "name" | "text" | "none";
export type BannerTextSource = "description" | "introduction" | "english_description" | "text" | "none";
export type BuyNoteSource = "wholesale" | "shipping" | "text" | "none";
export type RelatedSource = "category" | "collection" | "featured" | "bestseller" | "manual" | "random";
/**
 * 🧩 ชิ้นส่วนในส่วน "ราคา · ตัวเลือก · ใส่ตะกร้า" — จัดลำดับ/คอลัมน์/จัดชิด/ขนาด/สี/ระยะห่าง ได้ต่อชิ้น (⚙️ ในแท็บหน้าสินค้า)
 * ชิ้นมาตรฐานมีอย่างละ 1 (price/desc/stock/qty/options/button/note) · "text" = ข้อความอิสระ เพิ่มได้หลายชิ้น
 */
export type BuyItemKey = "price" | "desc" | "stock" | "qty" | "options" | "options2" | "personalize" | "button" | "note" | "text";
export type BuyCol = "left" | "right";
export type BuyAlign = "left" | "center" | "right";
export type BuyGap = "sm" | "md" | "lg";
export interface BuyItem {
  id: string;
  key: BuyItemKey;
  enabled: boolean;
  col: BuyCol;
  align: BuyAlign;
  /** ขนาด % ของปกติ (60–200) */
  size: number;
  /** สีตัวอักษร (hex) — null = ตามธีม */
  color: string | null;
  /** ระยะห่างจากชิ้นก่อนหน้า */
  gap: BuyGap;
  // ── เฉพาะชนิด ──
  /** price */
  showUnit: boolean;
  showBadge: boolean;
  /** price: ราคาเต็มขีดฆ่า (จาก fake_price ใน ERP เมื่อสูงกว่าราคาขาย) */
  showCompare: boolean;
  /** desc: ตัดกี่บรรทัด (1–10) */
  lines: number;
  /** qty/options: ป้ายกำกับ · button: ข้อความบนปุ่ม (ว่าง = "ใส่ตะกร้า · ราคา") */
  label: string;
  /** stock: text|badge · options: pills|swatches|dropdown · button: fill|outline */
  style: string;
  /** button: สีพื้นปุ่ม (hex) — null = สีแบรนด์ */
  bg: string | null;
  /** button: เต็มความกว้างคอลัมน์ */
  fullWidth: boolean;
  /** text: ตัวหนา */
  bold: boolean;
  /** text: เนื้อหา (ขึ้นบรรทัดใหม่ได้) */
  text: string;
  /** desc: ดึงข้อความจากฟิลด์ Parent SKU ไหน (key ในทะเบียนฟิลด์) — ว่าง = คำอธิบายตามที่จับคู่ฟิลด์ */
  field: string;
  /** desc: ปุ่ม "ดูเพิ่มเติม" เมื่อข้อความยาวเกินจำนวนบรรทัด */
  more: boolean;
  /** options2: ลิงก์ 📏 ตารางไซส์ · ช่วงใต้ปุ่มไซส์ (เช่น 28–32″) · ตัวช่วย "กรอกรอบเอว → แนะนำไซส์" */
  showGuide: boolean;
  showFit: boolean;
  showHelper: boolean;
}
export const BUY_ITEM_DEFS: Record<BuyItemKey, { label: string; hint: string; styles?: { value: string; label: string }[] }> = {
  price: { label: "ราคา", hint: "ราคา + หน่วย + ป้าย + ราคาเต็มขีดฆ่า" },
  desc: { label: "คำอธิบายย่อ", hint: "ตัดกี่บรรทัดตั้งได้ (ฉบับเต็มอยู่ในรายละเอียด)" },
  stock: { label: "สถานะสต๊อก", hint: "● พร้อมส่ง / เหลือน้อย / สั่งจอง", styles: [{ value: "text", label: "ข้อความ" }, { value: "badge", label: "ป้ายสี" }] },
  qty: { label: "จำนวน", hint: "ปุ่ม − 1 +" },
  options: { label: "ตัวเลือก (สี/แบบ)", hint: "ตัวเลือกสี · ปิดแถว ตัวเลือกที่ 2 = ไซส์มาอยู่ใต้สีแบบเดิม", styles: [{ value: "pills", label: "เม็ดยา (ชื่อ)" }, { value: "swatches", label: "วงกลมสี" }, { value: "tiles", label: "รูปสินค้า (ชี้แล้วโชว์ชื่อสี)" }, { value: "dropdown", label: "ดรอปดาวน์" }] },
  options2: { label: "ตัวเลือกที่ 2 (ไซส์)", hint: "ไซส์/แบบ จากปุ่มตัวเลือกที่ 2 · ลิงก์ตารางไซส์ · ช่วงใต้ปุ่ม · ตัวช่วยแนะนำไซส์ (ปิดแถวนี้ = ไปอยู่ใต้ตัวเลือกสี)", styles: [{ value: "pills", label: "เม็ดยา" }, { value: "boxes", label: "ปุ่มเหลี่ยม" }, { value: "dropdown", label: "ดรอปดาวน์" }] },
  personalize: { label: "ปั๊มชื่อ (Personalize)", hint: "โชว์เฉพาะรุ่นที่เปิดปั๊มชื่อไว้ · พิมพ์ข้อความ + เลือกแบบ/ตำแหน่ง + รูปสด" },
  button: { label: "ปุ่มใส่ตะกร้า", hint: "ข้อความ / ทึบ-ขอบ / สีพื้น / เต็มความกว้าง", styles: [{ value: "fill", label: "ทึบ" }, { value: "outline", label: "ขอบ" }] },
  note: { label: "ข้อความใต้ปุ่ม", hint: "ขายส่ง / ค่าส่งจากข้อมูลร้าน / ข้อความ" },
  text: { label: "ข้อความอิสระ", hint: "เช่น ✓ ส่งฟรี · ประกัน 6 เดือน" },
};
const BUY_DEFAULT_ORDER: { key: BuyItemKey; col: BuyCol }[] = [
  { key: "price", col: "left" },
  { key: "desc", col: "left" },
  { key: "stock", col: "left" },
  { key: "qty", col: "right" },
  { key: "options", col: "right" },
  { key: "options2", col: "right" },
  { key: "personalize", col: "right" },
  { key: "button", col: "right" },
  { key: "note", col: "right" },
];
export function defaultBuyItem(key: BuyItemKey, col: BuyCol = "left", id?: string): BuyItem {
  return {
    id: id ?? (key === "text" ? `t${Date.now().toString(36).slice(-5)}` : key),
    key, enabled: true, col, align: "left", size: 100, color: null, gap: key === "price" ? "sm" : "md",
    showUnit: true, showBadge: true, showCompare: true, lines: 4, label: "",
    style: key === "stock" ? "text" : key === "options" || key === "options2" ? "pills" : key === "button" ? "fill" : "", bg: null, fullWidth: true, bold: false, text: "", field: "", more: true,
    showGuide: true, showFit: true, showHelper: true,
  };
}
export const DEFAULT_BUY_ITEMS = (): BuyItem[] => BUY_DEFAULT_ORDER.map((d) => defaultBuyItem(d.key, d.col));
const BUY_KEYS: BuyItemKey[] = ["price", "desc", "stock", "qty", "options", "options2", "personalize", "button", "note", "text"];
/** อ่านรายการชิ้นส่วนจาก DB — ไม่มี (ค่าเก่า) = ชุดมาตรฐานโดยใช้สวิตช์เดิม (showUnit/showBadge/showStock/showShortDesc) */
export function normalizeBuyItems(raw: unknown, legacy: { showUnit: boolean; showBadge: boolean; showStock: boolean; showShortDesc: boolean }): BuyItem[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_BUY_ITEMS().map((it) => {
      if (it.key === "price") return { ...it, showUnit: legacy.showUnit, showBadge: legacy.showBadge };
      if (it.key === "stock") return { ...it, enabled: legacy.showStock };
      if (it.key === "desc") return { ...it, enabled: legacy.showShortDesc };
      return it;
    });
  }
  const out: BuyItem[] = [];
  const seen = new Set<string>();
  const hex = (v: unknown): string | null => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : null);
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fb);
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const key = pick(r.key, BUY_KEYS, "text");
    let id = key === "text" ? String(r.id ?? "").replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || `t${out.length}` : key;
    if (key !== "text" && seen.has(id)) continue;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    const d = defaultBuyItem(key, pick(r.col, ["left", "right"] as const, "left"), id);
    const n = (v: unknown, fb: number, lo: number, hi: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : fb; };
    out.push({
      ...d,
      enabled: r.enabled !== false,
      align: pick(r.align, ["left", "center", "right"] as const, "left"),
      size: n(r.size, 100, 60, 200),
      color: hex(r.color),
      gap: pick(r.gap, ["sm", "md", "lg"] as const, d.gap),
      showUnit: r.showUnit !== false,
      showBadge: r.showBadge !== false,
      showCompare: r.showCompare !== false,
      lines: n(r.lines, 4, 1, 10),
      label: typeof r.label === "string" ? r.label.trim().slice(0, 80) : "",
      style: typeof r.style === "string" ? r.style.slice(0, 20) : d.style,
      bg: hex(r.bg),
      fullWidth: r.fullWidth !== false,
      bold: r.bold === true,
      text: typeof r.text === "string" ? r.text.slice(0, 500) : "",
      field: typeof r.field === "string" && /^[a-z0-9_]{0,60}$/i.test(r.field) ? r.field : "",
      more: r.more !== false,
      showGuide: r.showGuide !== false,
      showFit: r.showFit !== false,
      showHelper: r.showHelper !== false,
    });
    if (out.length >= 20) break;
  }
  // 📐 ตัวเลือกที่ 2 (ไซส์) เป็นแถวใหม่ — ค่าที่บันทึกไว้ก่อนมีแถวนี้: แทรกต่อจาก "ตัวเลือก (สี/แบบ)" + ก๊อปคอลัมน์/จัดชิด/ขนาด/สี/ระยะ/เปิดปิด → หน้าตาเหมือนเดิม (เดิมไซส์อยู่ใต้สีในแถวเดียวกัน)
  if (!seen.has("options2")) {
    const i = out.findIndex((x) => x.key === "options");
    if (i >= 0) {
      const o = out[i];
      out.splice(i + 1, 0, { ...defaultBuyItem("options2", o.col), enabled: o.enabled, align: o.align, size: o.size, color: o.color, gap: o.gap, style: o.style === "dropdown" ? "dropdown" : "pills" });
      seen.add("options2");
    }
  }
  // ชิ้นมาตรฐานที่หายไป (เช่น เพิ่มชนิดใหม่ทีหลัง) ต่อท้ายให้ครบ
  for (const d of BUY_DEFAULT_ORDER) if (!seen.has(d.key)) out.push(defaultBuyItem(d.key, d.col));
  return out;
}

export interface ProductParts {
  /** width: container = ในกรอบเนื้อหา · full = เต็มขอบจอ · height: md = ปกติ · tall = 80% จอ · screen = เต็มจอ (หักแถบเมนู)
   *  showTitle = ชื่อรุ่นตัวใหญ่เหนือรูป · bar = แถบลอยล่างรูป (ชื่อ · สี · ราคา · ใส่ตะกร้า — จอคอม) หายเมื่อเลื่อนลง */
  gallery: { showBreadcrumb: boolean; showSubtitle: boolean; colorMode: GalleryColorMode; perView: GalleryPerView; width: "container" | "full"; height: "md" | "tall" | "screen"; showTitle: boolean; bar: boolean };
  /** สวิตช์เดิม (showUnit…) ยังเก็บไว้ให้ค่ามือถือทับได้ · ของจริงอยู่ใน items */
  buy: { showUnit: boolean; showBadge: boolean; showStock: boolean; showShortDesc: boolean; noteSource: BuyNoteSource; noteText: string; columns: 1 | 2; items: BuyItem[] };
  /** layout/textPos/fields = ค่ากลางสำหรับสินค้าที่ยังไม่ตั้งแบนเนอร์เอง (ค่าในหน้า Parent SKU ทับได้ต่อรุ่น) */
  banner: BannerPart;
  /** ➕ แบนเนอร์เพิ่ม (ปุ่ม "เพิ่มแบนเนอร์" ใต้ลำดับส่วนประกอบ) — อยู่ในลำดับเป็น `banner:<id>` · ไม่ถูกแบนเนอร์รายรุ่นทับ */
  extraBanners: ExtraBanner[];
  /** codes = รหัส Parent SKU (ตัวพิมพ์ใหญ่) เมื่อ source=manual · count 2–8 · title ว่าง = ใช้ข้อความเดิมของเว็บ */
  related: { source: RelatedSource; codes: string[]; count: number; title: string };
}
export interface BannerPart {
  imageSource: BannerImageSource;
  imageKey: string | null;
  /** รูปที่เท่าไหร่ (1 = รูปแรก) — ใช้กับ nth / parent */
  imageIndex: number;
  /** key ของฟิลด์รูปใน Parent SKU — ใช้กับ field */
  imageField: string;
  titleSource: BannerTitleSource;
  titleText: string;
  textSource: BannerTextSource;
  text: string;
  layout: "half" | "full";
  textPos: "left" | "right" | "over-left" | "over-center" | "over-right" | "below";
  fields: string[];
  /** 📐 ขนาด: สัดส่วนรูป (คอม / มือถือ — same = เท่าคอม) + ความกว้าง */
  ratio: BannerRatio;
  ratioMobile: BannerRatio | "same";
  width: BannerWidth;
}
export interface ExtraBanner extends BannerPart {
  id: string;
  /** ชื่อในรายการลำดับส่วนประกอบ (ลูกค้าไม่เห็น) */
  name: string;
}
export const MAX_EXTRA_BANNERS = 6;
const DEFAULT_BANNER: BannerPart = { imageSource: "second", imageKey: null, imageIndex: 2, imageField: "", titleSource: "subtitle", titleText: "", textSource: "description", text: "", layout: "half", textPos: "left", fields: [], ratio: "auto", ratioMobile: "same", width: "container" };
export const DEFAULT_PARTS: ProductParts = {
  gallery: { showBreadcrumb: true, showSubtitle: true, colorMode: "set", perView: 1, width: "container", height: "md", showTitle: true, bar: false },
  buy: { showUnit: true, showBadge: true, showStock: true, showShortDesc: true, noteSource: "wholesale", noteText: "", columns: 2, items: DEFAULT_BUY_ITEMS() },
  banner: { ...DEFAULT_BANNER },
  extraBanners: [],
  related: { source: "category", codes: [], count: 4, title: "" },
};
/** แบนเนอร์เพิ่มตัวใหม่ — ค่าเริ่มต้นใช้รูปที่ 3 ของสินค้า (รูปที่ 2 แบนเนอร์หลักใช้ไปแล้ว) */
export const newExtraBanner = (n: number): ExtraBanner => ({
  ...DEFAULT_BANNER,
  imageSource: "nth",
  imageIndex: 3,
  layout: "full",
  textPos: "over-left",
  id: `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
  name: `แบนเนอร์ ${n}`,
});
/** id ส่วนประกอบของแบนเนอร์เพิ่ม ↔ id แบนเนอร์ */
export const extraBannerSection = (id: string) => `banner:${id}` as const;
export const extraBannerId = (section: string): string | null => (section.startsWith("banner:") ? section.slice(7) : null);
const PART_KEY_RE = /^[\w\-./%()]+$/;
const BANNER_RATIOS = ["auto", "1:1", "4:5", "3:4", "4:3", "16:10", "16:9", "21:9", "3:1"] as const;
/** ตัวกรองค่าแบนเนอร์ 1 ชิ้น (ใช้ทั้งแบนเนอร์หลักและแบนเนอร์เพิ่ม) */
function normalizeBannerPart(raw: unknown): BannerPart {
  const bn = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_BANNER;
  const one = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fb);
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const idx = Number(bn.imageIndex);
  return {
    imageSource: one(bn.imageSource, ["second", "last", "nth", "parent", "field", "fixed"] as const, d.imageSource),
    imageKey: typeof bn.imageKey === "string" && PART_KEY_RE.test(bn.imageKey) ? bn.imageKey : null,
    imageIndex: Number.isFinite(idx) ? Math.min(20, Math.max(1, Math.round(idx))) : d.imageIndex,
    imageField: typeof bn.imageField === "string" && /^[a-z0-9_]+$/.test(bn.imageField) ? bn.imageField : "",
    titleSource: one(bn.titleSource, ["subtitle", "category", "name", "text", "none"] as const, d.titleSource),
    titleText: text(bn.titleText, 120),
    textSource: one(bn.textSource, ["description", "introduction", "english_description", "text", "none"] as const, d.textSource),
    text: text(bn.text, 2000),
    layout: one(bn.layout, ["half", "full"] as const, d.layout),
    textPos: one(bn.textPos, ["left", "right", "over-left", "over-center", "over-right", "below"] as const, d.textPos),
    fields: (Array.isArray(bn.fields) ? bn.fields : []).filter((f): f is string => typeof f === "string" && /^[a-z0-9_]+$/.test(f)).slice(0, 12),
    ratio: one(bn.ratio, BANNER_RATIOS, d.ratio),
    ratioMobile: one(bn.ratioMobile, [...BANNER_RATIOS, "same"] as const, d.ratioMobile),
    width: one(bn.width, ["narrow", "container", "full"] as const, d.width),
  };
}
export function normalizeParts(raw: unknown): ProductParts {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const g = r.gallery ?? {};
  const b = r.buy ?? {};
  const rl = r.related ?? {};
  const seenX = new Set<string>();
  const extraBanners: ExtraBanner[] = [];
  for (const x of Array.isArray(r.extraBanners) ? (r.extraBanners as unknown as unknown[]) : []) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.id === "string" && /^[\w-]{1,40}$/.test(o.id) ? o.id : null;
    if (!id || seenX.has(id)) continue;
    seenX.add(id);
    const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 60) : `แบนเนอร์ ${extraBanners.length + 2}`;
    extraBanners.push({ ...normalizeBannerPart(o), id, name });
    if (extraBanners.length >= MAX_EXTRA_BANNERS) break;
  }
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
      width: one(g.width, ["container", "full"] as const, d.gallery.width),
      height: one(g.height, ["md", "tall", "screen"] as const, d.gallery.height),
      showTitle: g.showTitle !== false,
      bar: g.bar === true,
    },
    buy: {
      showUnit: b.showUnit !== false,
      showBadge: b.showBadge !== false,
      showStock: b.showStock !== false,
      showShortDesc: b.showShortDesc !== false,
      noteSource: one(b.noteSource, ["wholesale", "shipping", "text", "none"] as const, d.buy.noteSource),
      noteText: text(b.noteText, 300),
      columns: Number(b.columns) === 1 ? 1 : 2,
      items: normalizeBuyItems(b.items, { showUnit: b.showUnit !== false, showBadge: b.showBadge !== false, showStock: b.showStock !== false, showShortDesc: b.showShortDesc !== false }),
    },
    banner: normalizeBannerPart(r.banner),
    extraBanners,
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
  galleryWidths: [
    { value: "container", label: "ในกรอบเนื้อหา (มีขอบมน)" },
    { value: "full", label: "เต็มขอบจอ (แบบ Gucci)" },
  ] as { value: ProductParts["gallery"]["width"]; label: string }[],
  galleryHeights: [
    { value: "md", label: "ปกติ (ประมาณ 60% ของจอ)" },
    { value: "tall", label: "สูง (80% ของจอ)" },
    { value: "screen", label: "เต็มจอ (หักแถบเมนูด้านบน)" },
  ] as { value: ProductParts["gallery"]["height"]; label: string }[],
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
    { value: "nth", label: "รูปที่ … ของสินค้า (เลือกเลขรูป)" },
    { value: "last", label: "รูปสุดท้ายของสินค้า" },
    { value: "parent", label: "รูปที่ … จากแกลเลอรี Parent SKU" },
    { value: "field", label: "ฟิลด์รูปของ Parent SKU (อัปโหลดต่อรุ่น)" },
    { value: "fixed", label: "อัปโหลดรูปกลาง 1 รูป ใช้ทุกสินค้า" },
  ] as { value: BannerImageSource; label: string }[],
  bannerRatios: [
    { value: "auto", label: "อัตโนมัติ (ครึ่งจอ 16:10 · เต็มจอ 21:9)" },
    { value: "3:1", label: "3:1 แถบยาวเตี้ย" },
    { value: "21:9", label: "21:9 กว้างพิเศษ" },
    { value: "16:9", label: "16:9 จอกว้าง" },
    { value: "16:10", label: "16:10" },
    { value: "4:3", label: "4:3" },
    { value: "1:1", label: "1:1 จัตุรัส" },
    { value: "4:5", label: "4:5 แนวตั้ง" },
    { value: "3:4", label: "3:4 แนวตั้งสูง" },
  ] as { value: BannerRatio; label: string }[],
  bannerWidths: [
    { value: "narrow", label: "แคบ (กลางจอ)" },
    { value: "container", label: "ปกติ (เท่าเนื้อหา)" },
    { value: "full", label: "เต็มขอบจอ" },
  ] as { value: BannerWidth; label: string }[],
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
/** custom = แหล่งที่ร้านเพิ่มเองในคลังแหล่งข้อมูล (sourceId → theme.product.contentSources · lib/website-content-sources) */
export type DetailSource = "description" | "fields" | "details" | "text" | "shipping" | "dimensions" | "custom";
const DETAIL_SOURCE_KEYS: DetailSource[] = ["description", "fields", "details", "text", "shipping", "dimensions", "custom"];
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
  /** source=dimensions: ต่อท้ายเป็นนิ้วด้วย (23 ซม. | 9.1") · ไม่ตั้ง = โชว์ */
  showInch?: boolean;
  /** source=dimensions: ปุ่ม 📏 เทียบขนาด · ไม่ตั้ง = โชว์ */
  sizeCompare?: boolean;
  /** source=custom: id ของแหล่งใน theme.product.contentSources */
  sourceId?: string;
}
/** ฟิลด์ของ Parent SKU ที่ให้เลือกโชว์บนเว็บ (API สาธารณะส่งเฉพาะชุดนี้ — ไม่มีต้นทุน/ข้อมูลภายใน) */
export const PRODUCT_SPEC_FIELDS: { key: string; label: string; unit?: string }[] = [
  { key: "materials", label: "วัสดุ" },
  { key: "size_summary", label: "ขนาด" },
  { key: "custom_size", label: "ขนาด (ระบุเอง)" },
  { key: "size_length_cm", label: "กว้าง", unit: "ซม." },
  { key: "size_height_cm", label: "สูง", unit: "ซม." },
  { key: "size_thickness_cm", label: "หนา", unit: "ซม." },
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
  { value: "dimensions", label: "📏 ขนาด (ใส่ได้ + กว้าง/สูง/หนา/หูหิ้ว/สาย)", hint: "ประกอบเป็นรายการจุดให้อัตโนมัติจากช่องขนาดใน Parent SKU · ช่องที่ว่างจะไม่โชว์" },
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
    const source = DETAIL_SOURCE_KEYS.includes(r.source as DetailSource) ? (r.source as DetailSource) : "text";
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
      ...(source === "dimensions" ? { showInch: r.showInch !== false, sizeCompare: r.sizeCompare !== false } : {}),
      ...(source === "fields" ? { sizeCompare: r.sizeCompare !== false } : {}),
      ...(source === "custom" ? { sourceId: String(r.sourceId ?? "").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) } : {}),
    });
    if (out.length >= 20) break;
  }
  return out;
}
/** ส่วนประกอบของหน้าสินค้าแบบโชว์เคส — ลากจัดลำดับ/ซ่อนได้ในแท็บหน้าสินค้า */
export type ProductSection = "gallery" | "buy" | "details" | "banner" | "related" | `banner:${string}`;

/**
 * 📐 กรอบของแต่ละส่วนประกอบหน้าสินค้า (ของกลาง ใช้ได้ทุกส่วน) — ความกว้าง + ระยะห่างด้านบน
 *   auto = ตามเดิมของส่วนนั้น · ตั้งแล้วเว็บร้านปิดระยะเดิมของส่วนนั้นแล้วใช้ค่านี้แทน (ไม่บวกกัน)
 *   รูปใหญ่/แบนเนอร์ มีความกว้างของตัวเองอยู่แล้ว → ตั้งได้แค่ระยะห่าง (PART_BOX_NO_WIDTH)
 *   มือถือ: ระยะห่างย่อลงให้เองตามจอ
 */
export type PartWidth = "auto" | "narrow" | "full";
export type PartSpace = "auto" | "none" | "sm" | "md" | "lg" | "xl";
export interface PartBox {
  width: PartWidth;
  spaceTop: PartSpace;
}
export const PART_WIDTH_OPTIONS: { value: PartWidth; label: string }[] = [
  { value: "auto", label: "ตามเดิม (กว้างเท่าเนื้อหาเว็บ)" },
  { value: "narrow", label: "แคบ (อ่านง่าย ตรงกลาง)" },
  { value: "full", label: "เต็มความกว้างจอ" },
];
export const PART_SPACE_OPTIONS: { value: PartSpace; label: string }[] = [
  { value: "auto", label: "ตามเดิม" },
  { value: "none", label: "ไม่มี (ชิดส่วนบน)" },
  { value: "sm", label: "เล็ก" },
  { value: "md", label: "กลาง" },
  { value: "lg", label: "ใหญ่" },
  { value: "xl", label: "ใหญ่มาก" },
];
export const partHasWidth = (k: string) => k !== "gallery" && !k.startsWith("banner");
export function normalizePartBox(raw: unknown): Record<string, PartBox> {
  const out: Record<string, PartBox> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^(gallery|buy|details|banner|related|banner:[\w-]{1,40})$/.test(k) || !v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const width = PART_WIDTH_OPTIONS.some((x) => x.value === o.width) ? (o.width as PartWidth) : "auto";
    const spaceTop = PART_SPACE_OPTIONS.some((x) => x.value === o.spaceTop) ? (o.spaceTop as PartSpace) : "auto";
    if (width === "auto" && spaceTop === "auto") continue;
    out[k] = { width: partHasWidth(k) ? width : "auto", spaceTop };
  }
  return out;
}
export const PRODUCT_SECTION_ORDER: ProductSection[] = ["gallery", "buy", "details", "banner", "related"];


/**
 * 📱 ค่าที่ตั้ง "แยกสำหรับมือถือ" (จอ < 768px) ของหน้าสินค้า — null/ไม่มี = ตามคอม
 * เว็บร้านเลือกใช้เองตามขนาดจอ (ThemeProvider → resolveMobileProduct) · แท็บดีไซน์มีสวิตช์ 🖥 คอม / 📱 มือถือ
 * รองรับ: วิธีโชว์รายละเอียด + ค่าเริ่มต้นพับ/เปิด (รวม/ต่อหัวข้อ) · ลำดับ/ซ่อนส่วนประกอบ · โชว์-ซ่อนรายละเอียดย่อยในส่วนรูปใหญ่/ราคา-ตะกร้า
 */
/** 🔠 ขนาดตัวอักษรหน้าสินค้า (% ของขนาดปกติ = 100) — title ชื่อรุ่น · price ราคา · heading หัวข้อรายละเอียด/แบนเนอร์/คุณอาจชอบ · body เนื้อหา */
export interface ProductFonts { title: number; price: number; heading: number; body: number }
export const DEFAULT_FONTS: ProductFonts = { title: 100, price: 100, heading: 100, body: 100 };
export const FONT_KEYS: (keyof ProductFonts)[] = ["title", "price", "heading", "body"];
const fontPct = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 60 && n <= 180 ? Math.round(n) : undefined;
};
export function normalizeFonts(raw: unknown): ProductFonts {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { title: fontPct(r.title) ?? 100, price: fontPct(r.price) ?? 100, heading: fontPct(r.heading) ?? 100, body: fontPct(r.body) ?? 100 };
}
function partialFonts(raw: unknown): Partial<ProductFonts> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Partial<ProductFonts> = {};
  for (const k of FONT_KEYS) {
    const n = fontPct(r[k]);
    if (n !== undefined) out[k] = n;
  }
  return out;
}

export interface ProductMobile {
  detailsStyle: ProductDetailsStyle | null;
  detailsOpen: ProductDetailsOpen | null;
  /** ต่อหัวข้อ (id → open|closed) — ไม่มี key = ตามคอม */
  itemsOpen: Record<string, DetailOpen>;
  sections: ProductSection[] | null;
  hidden: ProductSection[] | null;
  gallery: Partial<ProductParts["gallery"]>;
  /** สวิตช์เดิม (ค่าเก่า) — ถ้าตั้ง buyItems แล้วจะใช้ชุดนั้นแทน */
  buy: Partial<Pick<ProductParts["buy"], "showUnit" | "showBadge" | "showStock" | "showShortDesc" | "noteSource" | "noteText">>;
  /** ส่วนราคา-ตะกร้า ตั้งแยกทั้งชุดสำหรับมือถือ (null = ตามคอม) */
  buyItems: BuyItem[] | null;
  buyColumns: 1 | 2 | null;
  banner: Partial<ProductParts["banner"]>;
  related: Partial<ProductParts["related"]>;
  imageEffect: ProductImageEffect | null;
  imageFit: ProductImageFit | null;
  imageSize: number | null;
  /** ขนาดตัวอักษรเฉพาะมือถือ (เฉพาะช่องที่ตั้ง) */
  fonts: Partial<ProductFonts>;
}
/** @param extraIds id ของแบนเนอร์เพิ่มที่มีอยู่ (ให้ลำดับ/ซ่อนของมือถือรู้จัก banner:<id>) */
export function normalizeMobile(raw: unknown, extraIds: string[] = []): ProductMobile {
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
  // เอาเฉพาะคีย์ที่ตั้งไว้ แต่ค่าผ่านตัวกรองเดียวกับของคอม (normalizeParts)
  const partial = <K extends keyof ProductParts>(k: K, rawPart: unknown): Partial<ProductParts[K]> => {
    const src = (rawPart && typeof rawPart === "object" ? rawPart : {}) as Record<string, unknown>;
    // ไม่มีช่องตั้งไว้ = {} ทันที (ไม่เรียกตัวกรองของคอมตอนโหลดโมดูล — กัน TDZ เมื่อ DEFAULT_THEME ใช้ normalizeMobile(null))
    if (!Object.keys(src).length) return {};
    const norm = normalizeParts({ [k]: src })[k] as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src)) if (key in norm) out[key] = norm[key];
    return out as Partial<ProductParts[K]>;
  };
  const gallery = partial("gallery", g);
  const banner = partial("banner", r.banner);
  const related = partial("related", r.related);
  const buyItems = Array.isArray(r.buyItems) ? normalizeBuyItems(r.buyItems, { showUnit: true, showBadge: true, showStock: true, showShortDesc: true }) : null;
  const buyColumns = Number(r.buyColumns) === 1 ? 1 : Number(r.buyColumns) === 2 ? 2 : null;
  const sizeN = Number(r.imageSize);
  const buy: ProductMobile["buy"] = {};
  for (const k of ["showUnit", "showBadge", "showStock", "showShortDesc"] as const) if (bool(b[k]) !== undefined) buy[k] = b[k] as boolean;
  const ns = pick(b.noteSource, ["wholesale", "shipping", "text", "none"] as const);
  if (ns) buy.noteSource = ns;
  if (typeof b.noteText === "string" && b.noteText.trim()) buy.noteText = b.noteText.trim().slice(0, 300);
  return {
    detailsStyle: pick(r.detailsStyle, ["accordion", "tabs", "plain"] as const),
    detailsOpen: pick(r.detailsOpen, ["first", "closed", "all"] as const),
    itemsOpen,
    sections: Array.isArray(r.sections) ? normalizeProductSections(r.sections, extraIds) : null,
    hidden: Array.isArray(r.hidden) ? normalizeHiddenSections(r.hidden, extraIds) : null,
    gallery,
    buy,
    buyItems,
    buyColumns,
    banner,
    related,
    imageEffect: pick(r.imageEffect, ["shadow", "none", "border", "rounded", "rounded-shadow"] as const),
    imageFit: pick(r.imageFit, ["contain", "cover", "auto"] as const),
    imageSize: Number.isFinite(sizeN) && sizeN >= 50 && sizeN <= 100 ? Math.round(sizeN) : null,
    fonts: partialFonts(r.fonts),
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
    imageEffect: m.imageEffect ?? p.imageEffect,
    imageFit: m.imageFit ?? p.imageFit,
    imageSize: m.imageSize ?? p.imageSize,
    parts: {
      ...p.parts,
      gallery: { ...p.parts.gallery, ...m.gallery },
      banner: { ...p.parts.banner, ...m.banner },
      related: { ...p.parts.related, ...m.related },
      buy: {
        ...p.parts.buy,
        ...m.buy,
        columns: m.buyColumns ?? p.parts.buy.columns,
        // ตั้งแยกทั้งชุด (buyItems) ชนะ · ไม่งั้นสวิตช์เดิมทับลงชิ้นส่วนของคอม
        items:
          m.buyItems ??
          p.parts.buy.items.map((it) => {
            if (it.key === "price") return { ...it, showUnit: m.buy.showUnit ?? it.showUnit, showBadge: m.buy.showBadge ?? it.showBadge };
            if (it.key === "stock" && m.buy.showStock !== undefined) return { ...it, enabled: m.buy.showStock };
            if (it.key === "desc" && m.buy.showShortDesc !== undefined) return { ...it, enabled: m.buy.showShortDesc };
            return it;
          }),
      },
    },
    fonts: { ...p.fonts, ...m.fonts },
  };
}
/** มีค่าที่ตั้งแยกสำหรับมือถืออยู่ไหม (ไว้โชว์ป้ายในแท็บดีไซน์) */
export function mobileOverrideCount(m: ProductMobile): number {
  return (m.detailsStyle ? 1 : 0) + (m.detailsOpen ? 1 : 0) + Object.keys(m.itemsOpen).length + (m.sections ? 1 : 0) + (m.hidden ? 1 : 0) + Object.keys(m.gallery).length + Object.keys(m.buy).length + Object.keys(m.fonts).length + (m.buyItems ? 1 : 0) + (m.buyColumns ? 1 : 0) + Object.keys(m.banner).length + Object.keys(m.related).length + (m.imageEffect ? 1 : 0) + (m.imageFit ? 1 : 0) + (m.imageSize ? 1 : 0);
}

/**
 * 🎨 สีละเอียด (แท็บ "สี" → ปรับละเอียด) — ค่าเริ่มต้น = หน้าตาเดิมของเว็บทุกอย่าง (ไม่ตั้ง = ไม่เปลี่ยน)
 *   onBrand  ตัวอักษรบนพื้นสีหลัก (ปุ่ม/ป้าย) · "auto" = ขาว/ดำ ตามที่อ่านง่ายกว่า
 *   line     เส้นขอบ/เส้นคั่น ทั้งเว็บ
 *   link     ลิงก์ในข้อความ + สีตอนชี้ลิงก์ตัวหนังสือ · "" = สีหลัก
 *   price    ราคา (การ์ด + หน้าสินค้า) · "" = ตามเดิม (การ์ด/หน้าสินค้าแบบใหม่ = สีตัวอักษรหลัก · หน้าสินค้าแบบคลาสสิก = สีหลัก)
 *   sale     ราคาตอนลดราคา (มีราคาเต็มขีดฆ่า) · "" = เท่าราคาปกติ
 *   stockIn / stockLow  จุด+ข้อความ "พร้อมส่ง" / "เหลือน้อย"
 *   softPct  ความเข้มของ "สีหลักอ่อน" (พื้นป้าย/กล่องเน้น) 4-40% · พื้นจางมาก (tint) คิดตามสัดส่วน
 * ป้ายลดราคาใช้สีจาก การ์ดสินค้า → ป้ายอัตโนมัติ (card.autoBadges.saleColor) ที่เดียว
 * เว็บร้านมิเรอร์ใน storefront src/lib/site-config.ts (themeToCss → --color-on-brand / -line / -link / -price / -sale / -stock-*)
 */
export const FINE_COLOR_DEFAULTS = {
  onBrand: "#FFFFFF",
  line: "#ECECEA",
  link: "",
  price: "",
  sale: "",
  stockIn: "#1F9254",
  stockLow: "#C77A0A",
  softPct: 14,
} as const;
export const SOFT_PCT_RANGE = { min: 4, max: 40 } as const;
/** สีจางมาก (tint) ตามความเข้มสีอ่อน — ค่าเดิม 14% → 5% */
export const tintPctOf = (softPct: number) => Math.max(2, Math.round((softPct * 5) / 14));
/** ตัวอักษรเข้มที่ใช้เมื่อ "อัตโนมัติ" เลือกดำ */
export const ON_BRAND_DARK = "#111111";
const relLum = (hex: string) => {
  const h = hex.replace("#", "");
  const f = h.length === 3 || h.length === 4 ? h.slice(0, 3).split("").map((c) => c + c).join("") : h.slice(0, 6);
  const ch = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
/** สีตัวอักษรบนพื้นสีหลักที่ใช้จริง — "auto" = ขาวหรือดำ แล้วแต่อันไหนอ่านง่ายกว่า (มิเรอร์ storefront site-config) */
export function resolveOnBrand(c: { brand: string; onBrand: string }): string {
  if (c.onBrand !== "auto") return c.onBrand;
  const L = relLum(c.brand);
  if (!Number.isFinite(L)) return "#FFFFFF";
  return 1.05 / (L + 0.05) >= (L + 0.05) / (relLum(ON_BRAND_DARK) + 0.05) ? "#FFFFFF" : ON_BRAND_DARK;
}

export interface SiteTheme {
  colors: {
    brand: string;
    brandDeep: string;
    ink: string;
    page: string;
    surface: string;
    muted: string;
    /** ตัวอักษรบนพื้นสีหลัก · "auto" = ขาว/ดำ ตามความอ่านง่าย */
    onBrand: string;
    line: string;
    /** "" = สีหลัก */
    link: string;
    /** "" = ตามเดิมของแต่ละหน้า */
    price: string;
    /** "" = เท่าราคาปกติ */
    sale: string;
    stockIn: string;
    stockLow: string;
    softPct: number;
  };
  fonts: { display: string; body: string };
  radius: "sharp" | "soft" | "round";
  /** ตัวอักษร 6 บทบาท (แท็บ "ตัวอักษร") */
  typography: Typography;
  /** รูปทรงปุ่ม/การ์ด/ช่องกรอก/เงา (แท็บ "รูปทรง") */
  shape: Shape;
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
    /** 🖼 โลโก้จาง ๆ ระหว่างรอรูปสินค้าโหลด (การ์ด + หน้าสินค้า) */
    placeholder: ImagePlaceholder;
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
    /** สีเอง: bgKind=custom ใช้ bgColor · textColor "" = อัตโนมัติ (ขาว/ดำตามพื้น) */
    bgKind: "preset" | "custom";
    bgColor: string;
    textColor: string;
    /** ตำแหน่งชิ้นส่วน ซ้าย/กลาง/ขวา */
    zones: HeaderZones;
    /** โปร่งใสทับบล็อกแรกของหน้าแรก (ค่าเก่า) — ตอนนี้ = overPages.home.on (เขียนคู่ไว้ให้เว็บรุ่นเก่าอ่าน) */
    overHero: boolean;
    /** 🪟 โปร่งใสตอนอยู่บนสุด รายประเภทหน้า + สีตัวหนังสือ (lib/website-header-over) */
    overPages: OverPages;
    /** เลื่อนลงซ่อน เลื่อนขึ้นโผล่ */
    hideOnScroll: boolean;
    mobileMenuSide: "left" | "right" | "top";
    button: { text: string; href: string };
    /** 🛒 ⚙ ตะกร้า (lib/website-header-els) */
    cart: HeaderCart;
    /** 🔍 ⚙ ค้นหา */
    search: HeaderSearch;
  };
  menu: MenuConfig;
  footer: FooterConfig;
  /** 🖼 หน้ารายการสินค้า: รูปแทรกในกริด (ดู lib/website-listing.ts) */
  listing: ListingConfig;
  /** 🛒 ดีไซน์ตะกร้า (ลิ้นชัก + หน้า /cart · lib/website-cart.ts) */
  cart: CartConfig;
  /** ✨ การเคลื่อนไหวทั้งเว็บ: เปลี่ยนหน้า (จาง/เลื่อนขึ้น) + เลื่อนจอนุ่ม (ปิดเป็นค่าเริ่ม) — เว็บร้าน: app/template.tsx + SmoothScroll */
  page: { transition: "none" | "fade" | "rise"; smoothScroll: boolean };
  card: {
    preset: CardPreset;
    imageRatio: ImageRatio;
    /** จำนวนบรรทัดของชื่อสินค้า */
    titleLines: number;
    showBadge: boolean;
    showStock: boolean;
    hover: CardHover;
    /** ราคาเต็มขีดฆ่า (fake_price) · จุดสีตัวเลือก · หน่วย · ชื่อหมวดเหนือชื่อ */
    showCompare: boolean;
    showSwatches: boolean;
    /** จุดสีสูงสุดกี่จุด (ที่เกินโชว์ +N) */
    swatchMax: number;
    /** ชี้ (คอม) / แตะ (มือถือ) จุดสีแล้วรูปการ์ดเปลี่ยนเป็นสีนั้น */
    swatchSwap: boolean;
    /** โชว์จำนวนสี เช่น "4 สี" ใต้ชื่อ */
    showColorCount: boolean;
    /** 🏷 ป้ายอัตโนมัติ (ลด % / ใหม่ / ขายดี) — ซ้อนกับป้ายที่ตั้งเองรายรุ่น */
    autoBadges: CardAutoBadges;
    /** 🖼 สีพื้นหลังหลังรูป ('' = ตามสินค้า) · ระยะขอบรูป % (null = อัตโนมัติ: ย่อพอดี 12px · เต็มกรอบ 0) */
    imageBg: string;
    imagePad: number | null;
    /** 🔤 ชื่อสินค้า: ตัวพิมพ์ใหญ่ · ความหนา · ระยะห่างตัวอักษร (1/100 em) */
    nameUpper: boolean;
    nameWeight: 400 | 500 | 600 | 700;
    nameTracking: number;
    /** ราคา "เริ่มต้น ฿…" เมื่อแต่ละตัวเลือกราคาไม่เท่ากัน · ชื่อหมวดอยู่เหนือชื่อ/ใต้ราคา */
    priceFrom: boolean;
    categoryPos: "above" | "below";
    /** 👁 ดูด่วน: none · button = ปุ่มตามุมรูป · replace = ปุ่มบนรูปเปิดดูด่วนแทนใส่ตะกร้าทันที */
    quickView: "none" | "button" | "replace";
    showUnit: boolean;
    showCategory: boolean;
    /** ปุ่ม "เพิ่มลงตะกร้า" บนรูป: โผล่ตอนชี้ / โชว์ตลอด / ไม่มี */
    quickAdd: CardQuickAdd;
    align: CardAlign;
    columns: CardColumns;
    gap: CardGap;
    /** ขนาดชื่อ/ราคา % ของปกติ */
    nameSize: number;
    priceSize: number;
    imageFit: CardImageFit;
  };
  /** หน้าสินค้า: classic = รูปซ้าย ข้อมูลขวา · showcase = ชื่อรุ่นใหญ่ + รูปกลางจอ (ดู storefront ProductShowcase) */
  product: {
    layout: ProductLayout;
    /** ชื่อรุ่นตัวเอียงแบบนิตยสาร (เฉพาะชื่ออังกฤษ) หรือฟอนต์หัวเรื่องของธีม */
    titleStyle: ProductTitleStyle;
    /** พื้นหลังหลังรูป (สี) */
    imageBg: ProductImageBg;
    /** รูปพื้นหลังหลังรูปสินค้า (r2 key) — ใช้เมื่อ imageBgKind = image */
    imageBgKey: string | null;
    /** แบบพื้นหลัง (ค่าเก่าที่ไม่มีช่องนี้: มีรูป = image · ไม่มี = preset) */
    imageBgKind: ProductImageBgKind;
    /** สีเดียว (hex) เมื่อ imageBgKind = color */
    imageBgColor: string;
    /** ไล่สี เมื่อ imageBgKind = gradient */
    imageBgGradient: ProductGradient;
    /** เอฟเฟกต์รูปสินค้า (เงา/กรอบ/มุมมน) */
    imageEffect: ProductImageEffect;
    /** รูปเต็มกรอบ หรือย่อให้พอดี */
    imageFit: ProductImageFit;
    /** % ของกรอบเมื่อ imageFit = contain (50–100) */
    imageSize: number;
    /** (เก่า) แยกเป็นแท็บ — ใช้ detailsStyle แทน เก็บไว้ให้ค่าที่บันทึกก่อนหน้ายังอ่านได้ */
    showTabs: boolean;
    galleryStyle: ProductGalleryStyle;
    /** 🧵 กดชื่อวัสดุ → เปิดแบบไหน (ค่าเริ่ม page = ไปหน้าเต็มเหมือนเดิม) */
    materialView: ProductMaterialView;
    detailsStyle: ProductDetailsStyle;
    detailsOpen: ProductDetailsOpen;
    /** ชุดรายละเอียดสินค้า (หัวข้อพับเก็บ/แท็บ) */
    detailItems: ProductDetailItem[];
    /** 📚 คลังแหล่งข้อมูล "ข้อความของร้าน" (การจัดส่ง + ที่ร้านเพิ่มเอง) — lib/website-content-sources */
    contentSources: ContentSource[];
    /** ลำดับส่วนประกอบ (ครบทุกตัวเสมอ) */
    sections: ProductSection[];
    /** ส่วนที่ซ่อน (ซ่อนได้เฉพาะ details/banner/related) */
    hidden: ProductSection[];
    /** ⚙️ ตั้งค่าต่อส่วนประกอบ (จับคู่ข้อมูล / โชว์-ซ่อนรายละเอียดย่อย) */
    parts: ProductParts;
    /** 📐 ความกว้าง + ระยะห่างด้านบน ต่อส่วนประกอบ (ไม่มี = ตามเดิม) */
    partBox: Record<string, PartBox>;
    /** 📱 ค่าที่ตั้งแยกสำหรับมือถือ (ตามคอมถ้าไม่ตั้ง) */
    mobile: ProductMobile;
    /** 🔠 ขนาดตัวอักษร (% ของปกติ) */
    fonts: ProductFonts;
  };
}

/* ───────── ตัวอักษร 7 บทบาท (แท็บ "ตัวอักษร" · เมนูด้านบน/เมนูย่อย ตั้งจากแท็บ "เมนู" ได้ด้วย = ค่าเดียวกัน) ─────────
   แต่ละบทบาทตั้ง ฟอนต์/น้ำหนัก/เอียง/ขนาด %/ระยะห่าง/ตัวพิมพ์ใหญ่/สี/พื้นหลัง แยกกัน
   เว็บร้านแปลงเป็น CSS ใน site-config.themeToCss (zoom = ขนาด %) */
export type TextRoleKey = "hero" | "heading" | "eyebrow" | "body" | "button" | "nav" | "menu";
export interface TextRole {
  /** ชื่อฟอนต์จาก GOOGLE_FONTS · "" = ตามฟอนต์หัวข้อ/เนื้อหา */
  font: string;
  weight: number;
  italic: boolean;
  /** % ของขนาดปกติ (คอม) */
  size: number;
  /** % บนมือถือ · 0 = เท่าคอม */
  sizeMobile: number;
  /** ระยะห่างตัวอักษร หน่วย 1/100 em (14 = 0.14em) */
  spacing: number;
  uppercase: boolean;
  /** "" = ตามสีธีม */
  color: string;
  /** สีพื้นหลังไฮไลต์ · "" = ไม่มี */
  bg: string;
}
export const TEXT_ROLE_DEFS: { key: TextRoleKey; label: string; hint: string; base: "display" | "body"; sample: string; px: number }[] = [
  { key: "hero", label: "หัวข้อใหญ่ (Hero / สไลด์)", hint: "ข้อความใหญ่สุดบนแบนเนอร์หน้าแรก", base: "display", sample: "กระเป๋าดีไซน์ดี ใช้ได้ทุกวัน", px: 26 },
  { key: "heading", label: "หัวข้อส่วน", hint: "ชื่อหัวข้อของแต่ละส่วนในหน้า (ไม่รวมชื่อสินค้าในหน้าสินค้า)", base: "display", sample: "สินค้าแนะนำ", px: 18 },
  { key: "eyebrow", label: "ป้ายเล็กเหนือหัวข้อ", hint: "ตัวเล็ก ๆ เหนือหัวข้อ และชื่อหมวดบนการ์ด", base: "body", sample: "NEW ARRIVAL", px: 11 },
  { key: "body", label: "เนื้อหา (ฐานทั้งเว็บ)", hint: "ข้อความทั่วไป — ขนาดนี้คือฐาน ทุกอย่างบนเว็บขยายตาม", base: "body", sample: "หนังวัวแท้ฟอกฝาด ผิวเรียบเนียน ทนทาน ใช้ได้นานหลายปี", px: 14 },
  { key: "button", label: "ปุ่ม", hint: "ปุ่มทุกปุ่มบนเว็บ (สีปุ่มมาจากแท็บสี)", base: "body", sample: "เพิ่มลงตะกร้า", px: 12 },
  { key: "nav", label: "เมนูด้านบน", hint: "ลิงก์เมนูใน Header + รายการในเมนูมือถือ (สีมีผลเฉพาะแถบเมนูบนคอม)", base: "body", sample: "สินค้า   เกี่ยวกับเรา   ติดต่อ", px: 11 },
  { key: "menu", label: "เมนูย่อย / แผงเมนู", hint: "ลิงก์ในเมนูเลื่อนลง + แผงเมนูใหญ่ (ลิงก์ หัวข้อย่อย แท็บ ชื่อการ์ด) · ตัวพิมพ์ใหญ่รวมหัวคอลัมน์ด้วย · ไม่ตั้ง = หน้าตาเดิม", base: "body", sample: "กระเป๋าเป้   กระเป๋าถือ   ดูทั้งหมด", px: 13 },
];
const ROLE_DEFAULTS: Record<TextRoleKey, Partial<TextRole>> = {
  hero: { weight: 600, spacing: -1 },
  heading: { weight: 700, spacing: 0 },
  eyebrow: { weight: 600, spacing: 22, uppercase: true },
  body: { weight: 400, spacing: 0 },
  button: { weight: 600, spacing: 8, uppercase: true },
  nav: { weight: 600, spacing: 14, uppercase: true },
  menu: { weight: 500, spacing: 0 },
};
export const defaultTextRole = (k: TextRoleKey): TextRole => ({ font: "", weight: 500, italic: false, size: 100, sizeMobile: 0, spacing: 0, uppercase: false, color: "", bg: "", ...ROLE_DEFAULTS[k] });
export type Typography = Record<TextRoleKey, TextRole>;
export const DEFAULT_TYPOGRAPHY = (): Typography => Object.fromEntries(TEXT_ROLE_DEFS.map((d) => [d.key, defaultTextRole(d.key)])) as Typography;
const hexOrEmpty = (v: unknown) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : "");
export function normalizeTypography(raw: unknown): Typography {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = DEFAULT_TYPOGRAPHY();
  for (const d of TEXT_ROLE_DEFS) {
    const x = (r[d.key] && typeof r[d.key] === "object" ? r[d.key] : {}) as Record<string, unknown>;
    const def = out[d.key];
    const n = (v: unknown, fb: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fb);
    out[d.key] = {
      font: typeof x.font === "string" && FONT_NAMES.includes(x.font) ? x.font : "",
      weight: n(x.weight, def.weight, 100, 900),
      italic: x.italic === true,
      size: n(x.size, 100, 50, 250),
      sizeMobile: n(x.sizeMobile, 0, 0, 250),
      spacing: n(x.spacing, def.spacing, -10, 40),
      uppercase: typeof x.uppercase === "boolean" ? x.uppercase : def.uppercase,
      color: hexOrEmpty(x.color),
      bg: hexOrEmpty(x.bg),
    };
  }
  return out;
}
/** ชื่อฟอนต์ทั้งหมดที่ธีมใช้ (ฟอนต์หัวข้อ/เนื้อหา + ที่ตั้งเฉพาะบทบาท) → ไว้โหลด Google Fonts */
export function themeFontNames(t: { fonts: { display: string; body: string }; typography: Typography }): string[] {
  return [...new Set([t.fonts.display, t.fonts.body, ...Object.values(t.typography).map((r) => r.font)].filter(Boolean))];
}

/* ───────── รูปทรง (แท็บ "รูปทรง") ───────── */
export type ButtonShape = "pill" | "rounded" | "square";
export type ButtonSize = "sm" | "md" | "lg";
export type ShadowLevel = "none" | "soft" | "strong";
export interface Shape {
  button: ButtonShape;
  buttonSize: ButtonSize;
  /** px · null = ตามความมนรวม */
  cardRadius: number | null;
  imageRadius: number | null;
  inputRadius: number | null;
  borderWidth: 1 | 2;
  shadow: ShadowLevel;
}
export const DEFAULT_SHAPE: Shape = { button: "pill", buttonSize: "md", cardRadius: null, imageRadius: null, inputRadius: null, borderWidth: 1, shadow: "soft" };
export const BUTTON_SHAPES: { value: ButtonShape; label: string }[] = [
  { value: "pill", label: "แคปซูล (มนสุด)" },
  { value: "rounded", label: "มนเล็กน้อย" },
  { value: "square", label: "เหลี่ยม" },
];
export const BUTTON_SIZES: { value: ButtonSize; label: string }[] = [
  { value: "sm", label: "เล็ก" },
  { value: "md", label: "ปกติ" },
  { value: "lg", label: "ใหญ่" },
];
export const SHADOW_LEVELS: { value: ShadowLevel; label: string }[] = [
  { value: "none", label: "ไม่มีเงา" },
  { value: "soft", label: "เงาบาง" },
  { value: "strong", label: "เงาชัด" },
];
export const RADIUS_PX_CHOICES = [0, 4, 8, 12, 16, 20, 24, 32];
export function normalizeShape(raw: unknown): Shape {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SHAPE;
  const px = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.min(48, Math.max(0, Math.round(v))) : null);
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fb);
  return {
    button: oneOf(r.button, ["pill", "rounded", "square"] as const, d.button),
    buttonSize: oneOf(r.buttonSize, ["sm", "md", "lg"] as const, d.buttonSize),
    cardRadius: px(r.cardRadius),
    imageRadius: px(r.imageRadius),
    inputRadius: px(r.inputRadius),
    borderWidth: r.borderWidth === 2 ? 2 : 1,
    shadow: oneOf(r.shadow, ["none", "soft", "strong"] as const, d.shadow),
  };
}

/* ───────── Header: ชิ้นส่วน 3 โซน + เมนู (แท็บ "Header" / "เมนู") ───────── */
export type HeaderEl = "logo" | "menu" | "search" | "cart" | "account" | "social" | "button";
/** v = รุ่นของชุดชิ้นส่วน (2 = มีชิ้น "บัญชีสมาชิก" แยกจากตะกร้าแล้ว) — ธีมเก่าไม่มี v จะได้ "account" เติมหน้าตะกร้าให้ครั้งเดียว */
export interface HeaderZones { left: HeaderEl[]; center: HeaderEl[]; right: HeaderEl[]; v?: number }
export const HEADER_EL_DEFS: { key: HeaderEl; label: string; hint: string }[] = [
  { key: "logo", label: "โลโก้", hint: "โลโก้/ชื่อร้าน (แท็บโลโก้)" },
  { key: "menu", label: "เมนู", hint: "ลิงก์เมนูหลัก (แท็บเมนู) — บนมือถือเป็นปุ่ม ☰" },
  { key: "search", label: "ค้นหา", hint: "ไอคอนแว่นขยาย กดแล้วพิมพ์ค้นหาสินค้า" },
  { key: "cart", label: "ตะกร้า", hint: "ไอคอนตะกร้า + จำนวนชิ้น" },
  { key: "account", label: "บัญชีสมาชิก", hint: "ไอคอนคน → เข้าสู่ระบบ / บัญชีของฉัน (โชว์เมื่อเว็บเปิดระบบสมาชิกแล้ว = ตั้งช่องทางเข้าสู่ระบบ Google/LINE/อีเมล)" },
  { key: "social", label: "โซเชียล", hint: "ไอคอน Facebook/IG/TikTok จากแท็บข้อมูลร้าน (ซ่อนบนมือถือ)" },
  { key: "button", label: "ปุ่ม", hint: "ปุ่มสีแบรนด์ เช่น \"ช้อปเลย\" (ตั้งข้อความ/ลิงก์ด้านล่าง · ซ่อนบนมือถือ)" },
];
const HEADER_EL_KEYS = HEADER_EL_DEFS.map((d) => d.key);
export function normalizeZones(raw: unknown, legacy?: { menuAlign: MenuAlign; showCart: boolean }): HeaderZones {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!r) {
    // ไม่เคยตั้ง → สร้างจากค่าเดิม (ตำแหน่งเมนู + แสดงตะกร้า)
    const a = legacy?.menuAlign ?? "center";
    const cart: HeaderEl[] = legacy?.showCart === false ? ["account"] : ["account", "cart"];
    return a === "left" ? { left: ["logo", "menu"], center: [], right: cart, v: 2 } : a === "right" ? { left: ["logo"], center: [], right: ["menu", ...cart], v: 2 } : { left: ["logo"], center: ["menu"], right: cart, v: 2 };
  }
  const seen = new Set<HeaderEl>();
  const zone = (v: unknown): HeaderEl[] => {
    const out: HeaderEl[] = [];
    for (const x of Array.isArray(v) ? v : []) {
      if (typeof x === "string" && (HEADER_EL_KEYS as string[]).includes(x) && !seen.has(x as HeaderEl)) {
        seen.add(x as HeaderEl);
        out.push(x as HeaderEl);
      }
    }
    return out;
  };
  const z: HeaderZones = { left: zone(r.left), center: zone(r.center), right: zone(r.right), v: 2 };
  // ธีมก่อนมีชิ้น "บัญชีสมาชิก" (ไอคอนเคยติดอยู่กับตะกร้า) → วางไว้หน้าตะกร้าให้ครั้งเดียว · หลังจากนี้เอาออกได้ตามใจ
  if (r.v !== 2 && !seen.has("account")) {
    for (const k of ["left", "center", "right"] as const) {
      const i = z[k].indexOf("cart");
      if (i >= 0) z[k].splice(i, 0, "account");
    }
  }
  return z;
}

/** new = 🆕 หน้ามาใหม่ — value ดู NEW_DROP_LINKS (lib/website-links) · เว็บร้านต้องรู้จัก kind นี้ (storefront site-config) */
export type MenuKind = "home" | "shop" | "category" | "categories" | "product" | "page" | "contact" | "new" | "url";
export interface MenuItem {
  id: string;
  label: string;
  kind: MenuKind;
  /** category = key หมวด · product = รหัส Parent SKU · page = slug หน้า · url = ลิงก์ */
  value: string;
  /** ป้ายเล็กท้ายชื่อ เช่น "ใหม่" "ลด" */
  badge: string;
  /** รายการย่อยแบบ Mega (แผงกว้างมีรูป) แทน dropdown */
  mega: boolean;
  /** รูปประกอบ (ใช้เมื่อเป็นรายการย่อยในแผง Mega) */
  imageKey: string | null;
  children: MenuItem[];
  /** 🧭 แผงเมนูใหญ่ (แบบ A/B/C · lib/website-mega-menu) — มี = ใช้แทนเมนูย่อย · เฉพาะเมนูบนสุด */
  panel: MegaPanel | null;
  /** ⏰ ตั้งเวลาแสดง (เวลาไทย "YYYY-MM-DD" / "YYYY-MM-DDTHH:mm" · ว่าง = ไม่จำกัด · inShowWindow) */
  showFrom: string;
  showUntil: string;
}
export interface MenuConfig {
  /** null = อัตโนมัติ (สินค้าทั้งหมด + หน้าที่สร้าง + ติดต่อ) */
  items: MenuItem[] | null;
  /** null = ใช้ชุดเดียวกับคอม */
  mobileItems: MenuItem[] | null;
  /** ⚙️ พฤติกรรมเมนู (ชี้/กดเปิด · หน่วงเวลา · พื้นหลังมืด · มือถือ) */
  behavior: MenuBehavior;
}
export const MENU_KINDS: { value: MenuKind; label: string; hint: string }[] = [
  { value: "home", label: "หน้าแรก", hint: "/" },
  { value: "shop", label: "สินค้าทั้งหมด", hint: "/shop" },
  { value: "new", label: "🆕 หน้ามาใหม่", hint: "/new · เลือกทุกชุด / ชุดล่าสุด / ชุดที่กำลังจะเปิด / ชุดที่ต้องการ" },
  { value: "category", label: "หมวดสินค้า", hint: "/c/…" },
  { value: "categories", label: "📂 หมวดทั้งหมด (อัตโนมัติ)", hint: "/shop + เมนูย่อย = ทุกหมวดในแท็บหมวดหมู่ (เพิ่มหมวดแล้วขึ้นเอง)" },
  { value: "product", label: "สินค้า 1 ตัว", hint: "/product/…" },
  { value: "page", label: "หน้าที่สร้างเอง", hint: "/<slug>" },
  { value: "contact", label: "ติดต่อ", hint: "/contact" },
  { value: "url", label: "ลิงก์อื่น", hint: "URL ภายนอก/ภายใน" },
];
export const newMenuItem = (label = "เมนูใหม่", kind: MenuKind = "shop", value = ""): MenuItem => ({ id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, label, kind, value, badge: "", mega: false, imageKey: null, children: [], panel: null, showFrom: "", showUntil: "" });
function normalizeMenuItems(raw: unknown, depth: number): MenuItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MenuItem[] = [];
  raw.forEach((x, i) => {
    if (!x || typeof x !== "object") return;
    const r = x as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 60) : "";
    if (!label) return;
    const kind = typeof r.kind === "string" && MENU_KINDS.some((k) => k.value === r.kind) ? (r.kind as MenuKind) : "url";
    out.push({
      id: typeof r.id === "string" && r.id ? r.id.slice(0, 40) : `m${depth}${i}`,
      label,
      kind,
      value: typeof r.value === "string" ? r.value.trim().slice(0, 500) : "",
      badge: typeof r.badge === "string" ? r.badge.trim().slice(0, 20) : "",
      mega: r.mega === true,
      imageKey: typeof r.imageKey === "string" && /^[\w./-]+$/.test(r.imageKey) ? r.imageKey : null,
      children: depth < 1 ? normalizeMenuItems(r.children, depth + 1) : [],
      panel: depth === 0 ? normalizeMegaPanel(r.panel) : null,
      showFrom: typeof r.showFrom === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(r.showFrom) ? r.showFrom : "",
      showUntil: typeof r.showUntil === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(r.showUntil) ? r.showUntil : "",
    });
  });
  return out.slice(0, 40);
}
export function normalizeMenu(raw: unknown): MenuConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { items: Array.isArray(r.items) ? normalizeMenuItems(r.items, 0) : null, mobileItems: Array.isArray(r.mobileItems) ? normalizeMenuItems(r.mobileItems, 0) : null, behavior: normalizeMenuBehavior(r.behavior) };
}
/** ลิงก์ของรายการเมนู (ตรงกับฝั่งเว็บร้าน) */
export function menuItemHref(it: { kind: MenuKind; value: string }): string {
  switch (it.kind) {
    case "home": return "/";
    case "shop": return "/shop";
    case "categories": return "/shop";
    case "category": return it.value ? `/c/${encodeURIComponent(it.value)}` : "/shop";
    case "product": return it.value ? `/product/${it.value.toLowerCase()}` : "/shop";
    case "page": return it.value ? `/${it.value}` : "/";
    case "contact": return "/contact";
    case "new": return newDropHref(it.value);
    default: return it.value || "/";
  }
}

/* ───────── Footer (แท็บ "Footer") ───────── */
export type FooterColKind = "about" | "links" | "contact" | "social" | "newsletter" | "text";
export interface FooterColumn {
  id: string;
  kind: FooterColKind;
  /** หัวคอลัมน์ ("" = ค่าเริ่มต้นตามชนิด) */
  title: string;
  /** ข้อความ (ชนิด text / newsletter / about = ทับคำอธิบายร้าน) */
  text: string;
  /** ลิงก์ (ชนิด links) · ว่าง = อัตโนมัติ (สินค้าทั้งหมด + หน้าที่สร้าง + ตามสถานะ) */
  links: MenuItem[];
  /** กว้าง 1 หรือ 2 ช่อง */
  width: 1 | 2;
}
export type FooterBg = "ink" | "surface" | "brand" | "custom";
export type PaymentIcon = "visa" | "mastercard" | "promptpay" | "cod" | "truemoney" | "shopee" | "lazada" | "line";
export interface FooterConfig {
  bg: FooterBg;
  bgColor: string;
  /** "" = อัตโนมัติ (ขาว/ดำตามพื้น) */
  textColor: string;
  /** null = จัดอัตโนมัติ (โลโก้+คำอธิบาย · เมนู · ติดต่อ) */
  columns: FooterColumn[] | null;
  /** แถวล่าง */
  showCopyright: boolean;
  payments: PaymentIcon[];
  bottomLinks: MenuItem[];
  align: "left" | "center";
}
export const FOOTER_COL_DEFS: { key: FooterColKind; label: string; hint: string; defaultTitle: string }[] = [
  { key: "about", label: "เกี่ยวกับร้าน", hint: "โลโก้ + คำอธิบายร้าน (จากแท็บข้อมูลร้าน หรือพิมพ์ทับ)", defaultTitle: "" },
  { key: "links", label: "ลิงก์", hint: "รายการลิงก์ — ว่างไว้ = อัตโนมัติ (สินค้าทั้งหมด + หน้าที่สร้าง + ตามสถานะ)", defaultTitle: "เมนู" },
  { key: "contact", label: "ติดต่อ", hint: "โทร / LINE / อีเมล / ที่อยู่ / เวลาทำการ จากแท็บข้อมูลร้าน", defaultTitle: "ติดต่อ" },
  { key: "social", label: "โซเชียล", hint: "ปุ่ม Facebook / IG / TikTok / Shopee / Lazada ที่กรอกไว้", defaultTitle: "ติดตามเรา" },
  { key: "newsletter", label: "รับข่าวสาร", hint: "ช่องกรอกอีเมล (ตอนนี้ยังเป็นตัวอย่าง ไม่ได้เก็บอีเมลจริง)", defaultTitle: "รับข่าวสาร & โปรโมชัน" },
  { key: "text", label: "ข้อความอิสระ", hint: "หัวข้อ + ข้อความหลายบรรทัด เช่น นโยบาย / เวลาจัดส่ง", defaultTitle: "" },
];
export const FOOTER_BGS: { value: FooterBg; label: string }[] = [
  { value: "ink", label: "สีเข้ม" },
  { value: "surface", label: "สีขาว/พื้นการ์ด" },
  { value: "brand", label: "สีแบรนด์" },
  { value: "custom", label: "กำหนดสีเอง" },
];
export const PAYMENT_ICONS: { value: PaymentIcon; label: string }[] = [
  { value: "visa", label: "VISA" },
  { value: "mastercard", label: "Mastercard" },
  { value: "promptpay", label: "PromptPay" },
  { value: "cod", label: "เก็บเงินปลายทาง" },
  { value: "truemoney", label: "TrueMoney" },
  { value: "line", label: "LINE Pay" },
  { value: "shopee", label: "Shopee" },
  { value: "lazada", label: "Lazada" },
];
export const newFooterColumn = (kind: FooterColKind = "links"): FooterColumn => ({ id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind, title: "", text: "", links: [], width: kind === "about" ? 2 : 1 });
export const DEFAULT_FOOTER: FooterConfig = { bg: "ink", bgColor: "#141517", textColor: "", columns: null, showCopyright: true, payments: [], bottomLinks: [], align: "left" };
export function normalizeFooter(raw: unknown): FooterConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_FOOTER;
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fb);
  const cols = Array.isArray(r.columns)
    ? (r.columns as unknown[])
        .map((x, i) => {
          if (!x || typeof x !== "object") return null;
          const c = x as Record<string, unknown>;
          const kind = oneOf(c.kind, FOOTER_COL_DEFS.map((k) => k.key), "links");
          return {
            id: typeof c.id === "string" && c.id ? c.id.slice(0, 40) : `f${i}`,
            kind,
            title: typeof c.title === "string" ? c.title.trim().slice(0, 60) : "",
            text: typeof c.text === "string" ? c.text.slice(0, 2000) : "",
            links: normalizeMenu({ items: c.links }).items ?? [],
            width: c.width === 2 ? 2 : 1,
          } as FooterColumn;
        })
        .filter((c): c is FooterColumn => !!c)
        .slice(0, 6)
    : null;
  return {
    bg: oneOf(r.bg, ["ink", "surface", "brand", "custom"] as const, d.bg),
    bgColor: typeof r.bgColor === "string" && /^#[0-9a-fA-F]{6}$/.test(r.bgColor) ? r.bgColor : d.bgColor,
    textColor: typeof r.textColor === "string" && /^#[0-9a-fA-F]{6}$/.test(r.textColor) ? r.textColor : "",
    columns: cols,
    showCopyright: r.showCopyright !== false,
    payments: Array.isArray(r.payments) ? (r.payments.filter((v) => PAYMENT_ICONS.some((p) => p.value === v)) as PaymentIcon[]) : [],
    bottomLinks: normalizeMenu({ items: r.bottomLinks }).items ?? [],
    align: oneOf(r.align, ["left", "center"] as const, d.align),
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
    ...FINE_COLOR_DEFAULTS,
  },
  fonts: { display: "Kanit", body: "Noto Sans Thai" },
  radius: "soft",
  typography: DEFAULT_TYPOGRAPHY(),
  shape: { ...DEFAULT_SHAPE },
  logo: {
    mark: "IG",
    text: "International",
    mode: "icon-text",
    imageKey: null,
    imageDarkKey: null,
    faviconKey: null,
    height: 34,
    placeholder: { ...DEFAULT_IMAGE_PLACEHOLDER },
  },
  header: { height: 72, sticky: true, bg: "page", menuAlign: "center", showCart: true, border: true, bgKind: "preset", bgColor: "#FFFFFF", textColor: "", zones: { left: ["logo"], center: ["menu"], right: ["account", "cart"], v: 2 }, overHero: false, overPages: defaultOverPages(false), hideOnScroll: false, mobileMenuSide: "top", button: { text: "", href: "/shop" }, cart: { ...DEFAULT_HEADER_CART }, search: { ...DEFAULT_HEADER_SEARCH } },
  menu: { items: null, mobileItems: null, behavior: { ...DEFAULT_MENU_BEHAVIOR } },
  footer: { ...DEFAULT_FOOTER },
  listing: { ...DEFAULT_LISTING },
  cart: { ...DEFAULT_CART },
  page: { transition: "fade", smoothScroll: false },
  card: { preset: "flat", imageRatio: "4:5", titleLines: 2, showBadge: true, showStock: true, hover: "lift", showCompare: true, showSwatches: false, swatchMax: 5, swatchSwap: true, showColorCount: false, autoBadges: { ...DEFAULT_AUTO_BADGES }, imageBg: "", imagePad: null, nameUpper: false, nameWeight: 500, nameTracking: 0, priceFrom: false, categoryPos: "above", quickView: "none", showUnit: true, showCategory: true, quickAdd: "hover", align: "left", columns: { desktop: 4, tablet: 3, mobile: 2 }, gap: "md", nameSize: 100, priceSize: 100, imageFit: "cover" },
  product: { layout: "classic", titleStyle: "serif", imageBg: "tint", imageBgKey: null, imageBgKind: "preset", imageBgColor: "#F3F4F6", imageBgGradient: { from: "#FFFFFF", to: "#E5E7EB", angle: 180 }, imageEffect: "shadow", imageFit: "contain", imageSize: 86, showTabs: true, galleryStyle: "editorial", materialView: "page", detailsStyle: "accordion", detailsOpen: "first", detailItems: DEFAULT_DETAIL_ITEMS.map((d) => ({ ...d, fields: [...d.fields] })), contentSources: [], sections: [...PRODUCT_SECTION_ORDER], hidden: [], parts: normalizeParts(DEFAULT_PARTS), partBox: {}, mobile: normalizeMobile(null), fonts: { ...DEFAULT_FONTS } },
};

/** อ่านลำดับส่วนประกอบจาก DB ให้ครบทุกตัว ไม่ซ้ำ (ตัวที่หายไปต่อท้ายตามลำดับเริ่มต้น) */
export function normalizeProductSections(raw: unknown, extraIds: string[] = []): ProductSection[] {
  const extras = extraIds.map(extraBannerSection) as ProductSection[];
  const valid = new Set<string>([...PRODUCT_SECTION_ORDER, ...extras]);
  const seen = new Set<ProductSection>();
  const out: ProductSection[] = [];
  for (const v of Array.isArray(raw) ? raw : []) {
    if (typeof v === "string" && valid.has(v) && !seen.has(v as ProductSection)) {
      seen.add(v as ProductSection);
      out.push(v as ProductSection);
    }
  }
  for (const k of PRODUCT_SECTION_ORDER) if (!seen.has(k)) out.push(k);
  // แบนเนอร์เพิ่มที่ยังไม่อยู่ในลำดับ (เช่น ลำดับมือถือที่ตั้งไว้ก่อนเพิ่มแบนเนอร์) → ต่อหลังแบนเนอร์หลัก
  for (const k of extras) if (!seen.has(k)) out.splice(out.indexOf("banner") + 1, 0, k);
  return out;
}
const HIDEABLE: ProductSection[] = ["details", "banner", "related"];
export function normalizeHiddenSections(raw: unknown, extraIds: string[] = []): ProductSection[] {
  const ok = new Set<string>([...HIDEABLE, ...extraIds.map(extraBannerSection)]);
  return (Array.isArray(raw) ? raw : []).filter((v): v is ProductSection => typeof v === "string" && ok.has(v));
}

/** แคตตาล็อกฟอนต์ Google ที่เลือกได้ (thai=false → ฟอนต์อังกฤษ ตัวไทยจะใช้ฟอนต์สำรอง) · weights = น้ำหนักที่มีจริง (ใช้สร้างลิงก์โหลด) */
export const GOOGLE_FONTS: { name: string; thai: boolean; weights: number[] }[] = [
  { name: "Kanit", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Noto Sans Thai", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Prompt", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Sarabun", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "IBM Plex Sans Thai", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Anuphan", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Athiti", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Bai Jamjuree", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Chakra Petch", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "K2D", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Krub", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Maitree", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Mali", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Mitr", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Niramit", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Noto Serif Thai", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Pridi", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Taviraj", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Trirong", thai: true, weights: [300, 400, 500, 600, 700] },
  { name: "Charm", thai: true, weights: [400, 700] },
  { name: "Itim", thai: true, weights: [400] },
  { name: "Sriracha", thai: true, weights: [400] },
  { name: "Pattaya", thai: true, weights: [400] },
  { name: "Thasadith", thai: true, weights: [400, 700] },
  { name: "Srisakdi", thai: true, weights: [400, 700] },
  { name: "Playfair Display", thai: false, weights: [400, 500, 600, 700] },
  { name: "Cormorant Garamond", thai: false, weights: [300, 400, 500, 600, 700] },
  { name: "Lora", thai: false, weights: [400, 500, 600, 700] },
  { name: "Inter", thai: false, weights: [300, 400, 500, 600, 700] },
  { name: "Montserrat", thai: false, weights: [300, 400, 500, 600, 700] },
  { name: "Poppins", thai: false, weights: [300, 400, 500, 600, 700] },
  { name: "Raleway", thai: false, weights: [300, 400, 500, 600, 700] },
  { name: "Oswald", thai: false, weights: [300, 400, 500, 600, 700] },
  { name: "DM Sans", thai: false, weights: [300, 400, 500, 600, 700] },
  { name: "Lato", thai: false, weights: [300, 400, 700] },
];
export const FONT_NAMES = GOOGLE_FONTS.map((f) => f.name);
export const FONT_CHOICES = FONT_NAMES;
/** ลิงก์ Google Fonts สำหรับชื่อฟอนต์ที่ให้มา (ERP ใช้พรีวิว · เว็บร้านโหลดเฉพาะที่ไม่ได้ฝังมากับ build) */
export function googleFontsHref(names: string[], exclude: string[] = []): string | null {
  const fams = [...new Set(names)].filter((n) => n && !exclude.includes(n)).map((n) => GOOGLE_FONTS.find((f) => f.name === n)).filter((f): f is (typeof GOOGLE_FONTS)[number] => !!f);
  if (!fams.length) return null;
  return "https://fonts.googleapis.com/css2?" + fams.map((f) => `family=${f.name.replace(/ /g, "+")}:wght@${f.weights.join(";")}`).join("&") + "&display=swap";
}

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
  { value: "banner", label: "แบนเนอร์หลัก", hint: "รูปตามที่ตั้งใน ⚙️ · รุ่นที่ตั้งแบนเนอร์เองใช้ของรุ่นนั้น", hideable: true },
  { value: "related", label: "สินค้าที่เกี่ยวข้อง (คุณอาจชอบ)", hint: "เลือกแหล่ง/จำนวน/หัวข้อใน ⚙️ · ต่อด้วย สินค้าที่ดูล่าสุด", hideable: true },
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
  { value: "swap", label: "สลับเป็นรูปที่ 2" },
  { value: "lift-swap", label: "ยกขึ้น + สลับเป็นรูปที่ 2" },
  { value: "slide", label: "สไลด์รูป (ลูกศรตอนชี้ · มือถือปัดนิ้ว)" },
];
export const CARD_QUICK_ADDS: { value: CardQuickAdd; label: string }[] = [
  { value: "hover", label: "โผล่ตอนชี้เมาส์ (มือถือไม่มี)" },
  { value: "always", label: "โชว์ตลอด" },
  { value: "none", label: "ไม่มีปุ่ม" },
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
/**
 * 🌐 ช่องข้อความในธีมที่มีภาษาอังกฤษคู่ (`<key>_en`) — เมนู/ท้ายเว็บ/แผงเมนูใหญ่/หัวเว็บ/หน้าสินค้า/การ์ด/ตะกร้า
 * เพิ่มช่องข้อความใหม่ในธีม = เพิ่มชื่อที่นี่ (ตารางคำแปล + ตัวทำความสะอาดใช้รายการนี้ร่วมกัน)
 */
export const THEME_TEXT_KEYS = [
  "label", "badge", "title", "desc", "text", "caption", "moreLabel", "viewAllLabel", "promo", "placeholder",
  "titleText", "noteText", "saleText", "newText", "bestText", "recsTitle", "freeShipText", "freeShipDone", "etaText",
  "emptyText", "checkoutText", "heading", "subtitle",
] as const;

/** ป้ายตำแหน่ง (ภาษาคน) ในตารางคำแปลของธีม */
const THEME_CRUMB: Record<string, string> = {
  menu: "เมนู", items: "เมนูคอม", mobileItems: "เมนูมือถือ", children: "เมนูย่อย", panel: "แผงเมนูใหญ่", blocks: "กล่อง",
  links: "ลิงก์", groups: "กลุ่ม", cards: "การ์ด", tabs: "แท็บ", footer: "ท้ายเว็บ", columns: "คอลัมน์", bottomLinks: "ลิงก์แถวล่าง",
  header: "หัวเว็บ", button: "ปุ่ม", cart: "ตะกร้า", search: "ค้นหา", logo: "โลโก้", product: "หน้าสินค้า",
  detailItems: "หัวข้อรายละเอียด", contentSources: "แหล่งข้อมูล", lines: "บรรทัด", parts: "ส่วนประกอบ", buy: "ส่วนซื้อ", banner: "แบนเนอร์", related: "สินค้าที่เกี่ยวข้อง",
  card: "การ์ดสินค้า", autoBadges: "ป้ายอัตโนมัติ", listing: "หน้ารายการสินค้า",
  label: "ชื่อ", badge: "ป้าย", title: "หัวข้อ", desc: "คำอธิบาย", text: "ข้อความ", caption: "คำบรรยาย", moreLabel: "ลิงก์ท้าย",
  viewAllLabel: "ดูทั้งหมด", promo: "แถบโปร", placeholder: "ข้อความในช่อง", titleText: "หัวข้อ", noteText: "หมายเหตุ",
  saleText: "ป้ายลดราคา", newText: "ป้ายสินค้าใหม่", bestText: "ป้ายขายดี", recsTitle: "หัวข้อสินค้าแนะนำ",
  freeShipText: "ข้อความส่งฟรี", freeShipDone: "ข้อความถึงยอดส่งฟรี", etaText: "ข้อความเวลาส่ง", emptyText: "ข้อความว่าง",
  checkoutText: "ปุ่มชำระเงิน", heading: "หัวข้อ", subtitle: "คำอธิบาย",
};
export const themeCrumb = (field: string): string | null => THEME_CRUMB[field] ?? null;

/** ทำความสะอาดธีม + เก็บคำแปลภาษาอังกฤษทุกชั้น (ตัวทำความสะอาดย่อยเก็บเฉพาะช่องที่รู้จัก) */
export function normalizeTheme(raw: unknown): SiteTheme {
  return carryTranslations(raw, normalizeThemeBase(raw), THEME_TEXT_KEYS);
}

function normalizeThemeBase(raw: unknown): SiteTheme {
  const r = (raw ?? {}) as Record<string, unknown>;
  const c = (r.colors ?? {}) as Record<string, unknown>;
  const f = (r.fonts ?? {}) as Record<string, unknown>;
  const l = (r.logo ?? {}) as Record<string, unknown>;
  const h = (r.header ?? {}) as Record<string, unknown>;
  const cd = (r.card ?? {}) as Record<string, unknown>;
  const pd = (r.product ?? {}) as Record<string, unknown>;
  // ส่วนประกอบก่อน — ลำดับ/ซ่อน (คอม+มือถือ) ต้องรู้ id ของแบนเนอร์เพิ่ม
  const parts = normalizeParts(pd.parts);
  const xIds = parts.extraBanners.map((x) => x.id);
  const d = DEFAULT_THEME;

  return {
    colors: {
      brand: color(c.brand, d.colors.brand),
      brandDeep: color(c.brandDeep, d.colors.brandDeep),
      ink: color(c.ink, d.colors.ink),
      page: color(c.page, d.colors.page),
      surface: color(c.surface, d.colors.surface),
      muted: color(c.muted, d.colors.muted),
      onBrand: c.onBrand === "auto" ? "auto" : color(c.onBrand, d.colors.onBrand),
      line: color(c.line, d.colors.line),
      link: color(c.link, ""),
      price: color(c.price, ""),
      sale: color(c.sale, ""),
      stockIn: color(c.stockIn, d.colors.stockIn),
      stockLow: color(c.stockLow, d.colors.stockLow),
      softPct: num(c.softPct, d.colors.softPct, SOFT_PCT_RANGE.min, SOFT_PCT_RANGE.max),
    },
    fonts: {
      display: text(f.display, d.fonts.display),
      body: text(f.body, d.fonts.body),
    },
    radius: pick(r.radius, ["sharp", "soft", "round"] as const, d.radius),
    typography: normalizeTypography(r.typography),
    shape: normalizeShape(r.shape),
    logo: {
      mark: text(l.mark, d.logo.mark, 4),
      text: text(l.text, d.logo.text, 40),
      mode: pick(l.mode, ["icon-text", "image", "text", "icon"] as const, d.logo.mode),
      imageKey: key(l.imageKey),
      imageDarkKey: key(l.imageDarkKey),
      faviconKey: key(l.faviconKey),
      height: num(l.height, d.logo.height, 16, 200),
      placeholder: (() => {
        const p = (l.placeholder && typeof l.placeholder === "object" ? l.placeholder : {}) as Record<string, unknown>;
        const dp = DEFAULT_IMAGE_PLACEHOLDER;
        const bg = typeof p.bg === "string" ? p.bg.trim() : "";
        return {
          mode: pick(p.mode, ["logo", "none"] as const, dp.mode),
          imageKey: key(p.imageKey),
          opacity: num(p.opacity, dp.opacity, 4, 40),
          size: num(p.size, dp.size, 20, 70),
          bg: isGradStop(bg) ? (bg.startsWith("#") ? bg.toLowerCase() : bg) : "",
        };
      })(),
    },
    header: {
      height: num(h.height, d.header.height, 48, 240),
      sticky: h.sticky !== false,
      bg: pick(h.bg, ["surface", "page", "ink", "brand", "transparent"] as const, d.header.bg),
      menuAlign: pick(h.menuAlign, ["left", "center", "right"] as const, d.header.menuAlign),
      showCart: h.showCart !== false,
      border: h.border !== false,
      bgKind: pick(h.bgKind, ["preset", "custom"] as const, "preset"),
      bgColor: color(h.bgColor, d.header.bgColor),
      textColor: typeof h.textColor === "string" && /^#[0-9a-fA-F]{6}$/.test(h.textColor) ? h.textColor : "",
      zones: normalizeZones(h.zones, { menuAlign: pick(h.menuAlign, ["left", "center", "right"] as const, d.header.menuAlign), showCart: h.showCart !== false }),
      ...(() => {
        const overPages = normalizeOverPages(h.overPages, h.overHero === true);
        return { overHero: overPages.home.on, overPages };
      })(),
      hideOnScroll: h.hideOnScroll === true,
      mobileMenuSide: pick(h.mobileMenuSide, ["left", "right", "top"] as const, "top"),
      button: (() => {
        const b = (h.button && typeof h.button === "object" ? h.button : {}) as Record<string, unknown>;
        return { text: typeof b.text === "string" ? b.text.trim().slice(0, 30) : "", href: typeof b.href === "string" && b.href.trim() ? b.href.trim().slice(0, 500) : "/shop" };
      })(),
      cart: normalizeHeaderCart(h.cart),
      search: normalizeHeaderSearch(h.search),
    },
    menu: normalizeMenu(r.menu),
    footer: normalizeFooter(r.footer),
    listing: normalizeListing(r.listing),
    cart: normalizeCart(r.cart),
    page: (() => {
      const pg = (r.page ?? {}) as Record<string, unknown>;
      return { transition: pick(pg.transition, ["none", "fade", "rise"] as const, "fade"), smoothScroll: pg.smoothScroll === true };
    })(),
    card: {
      preset: pick(cd.preset, ["flat", "border", "shadow", "floating", "minimal"] as const, d.card.preset),
      imageRatio: pick(cd.imageRatio, ["1:1", "4:3", "4:5", "3:4", "16:9"] as const, d.card.imageRatio),
      titleLines: num(cd.titleLines, d.card.titleLines, 1, 3),
      showBadge: cd.showBadge !== false,
      showStock: cd.showStock !== false,
      hover: pick(cd.hover, ["none", "lift", "zoom", "swap", "lift-swap", "slide"] as const, d.card.hover),
      showCompare: cd.showCompare !== false,
      showSwatches: cd.showSwatches === true,
      swatchMax: num(cd.swatchMax, d.card.swatchMax, 3, 12),
      swatchSwap: cd.swatchSwap !== false,
      showColorCount: cd.showColorCount === true,
      autoBadges: normalizeAutoBadges(cd.autoBadges),
      imageBg: typeof cd.imageBg === "string" && /^#[0-9a-f]{6}$/i.test(cd.imageBg) ? cd.imageBg : "",
      imagePad: typeof cd.imagePad === "number" && Number.isFinite(cd.imagePad) ? Math.min(20, Math.max(0, Math.round(cd.imagePad))) : null,
      nameUpper: cd.nameUpper === true,
      nameWeight: ([400, 500, 600, 700] as const).includes(Number(cd.nameWeight) as 400) ? (Number(cd.nameWeight) as 400 | 500 | 600 | 700) : 500,
      nameTracking: num(cd.nameTracking, 0, 0, 20),
      priceFrom: cd.priceFrom === true,
      categoryPos: pick(cd.categoryPos, ["above", "below"] as const, "above"),
      quickView: pick(cd.quickView, ["none", "button", "replace"] as const, "none"),
      showUnit: cd.showUnit !== false,
      showCategory: cd.showCategory !== false,
      quickAdd: pick(cd.quickAdd, ["hover", "always", "none"] as const, d.card.quickAdd),
      align: pick(cd.align, ["left", "center"] as const, d.card.align),
      columns: (() => {
        const c = (cd.columns && typeof cd.columns === "object" ? cd.columns : {}) as Record<string, unknown>;
        return { desktop: num(c.desktop, d.card.columns.desktop, 2, 6), tablet: num(c.tablet, d.card.columns.tablet, 1, 4), mobile: num(c.mobile, d.card.columns.mobile, 1, 3) };
      })(),
      gap: pick(cd.gap, ["sm", "md", "lg"] as const, d.card.gap),
      nameSize: num(cd.nameSize, d.card.nameSize, 60, 180),
      priceSize: num(cd.priceSize, d.card.priceSize, 60, 180),
      imageFit: pick(cd.imageFit, ["cover", "contain"] as const, d.card.imageFit),
    },
    product: {
      layout: pick(pd.layout, ["classic", "showcase"] as const, d.product.layout),
      titleStyle: pick(pd.titleStyle, ["serif", "display"] as const, d.product.titleStyle),
      imageBg: pick(pd.imageBg, ["tint", "surface", "none"] as const, d.product.imageBg),
      imageBgKey: key(pd.imageBgKey),
      imageBgKind: pick(pd.imageBgKind, ["preset", "color", "gradient", "image"] as const, key(pd.imageBgKey) ? "image" : "preset"),
      imageEffect: pick(pd.imageEffect, ["shadow", "none", "border", "rounded", "rounded-shadow"] as const, d.product.imageEffect),
      imageFit: pick(pd.imageFit, ["contain", "cover", "auto"] as const, d.product.imageFit),
      imageSize: num(pd.imageSize, d.product.imageSize, 50, 100),
      imageBgColor: color(pd.imageBgColor, d.product.imageBgColor),
      imageBgGradient: (() => {
        const g = (pd.imageBgGradient && typeof pd.imageBgGradient === "object" ? pd.imageBgGradient : {}) as Record<string, unknown>;
        const a = Number(g.angle);
        return { from: color(g.from, d.product.imageBgGradient.from), to: color(g.to, d.product.imageBgGradient.to), angle: Number.isFinite(a) ? ((Math.round(a) % 360) + 360) % 360 : d.product.imageBgGradient.angle };
      })(),
      showTabs: pd.showTabs !== false,
      galleryStyle: pick(pd.galleryStyle, ["editorial", "spotlight"] as const, d.product.galleryStyle),
      materialView: pick(pd.materialView, ["page", "drawer", "modal"] as const, d.product.materialView),
      // ค่าที่บันทึกก่อนมี detailsStyle: showTabs=false เคยหมายถึง "เรียงต่อกัน"
      detailsStyle: pick(pd.detailsStyle, ["accordion", "tabs", "plain"] as const, pd.showTabs === false ? "plain" : d.product.detailsStyle),
      detailsOpen: pick(pd.detailsOpen, ["first", "closed", "all"] as const, d.product.detailsOpen),
      detailItems: normalizeDetailItems(pd.detailItems),
      contentSources: normalizeContentSources(pd.contentSources),
      sections: normalizeProductSections(pd.sections, xIds),
      hidden: normalizeHiddenSections(pd.hidden, xIds),
      parts,
      partBox: normalizePartBox(pd.partBox),
      mobile: normalizeMobile(pd.mobile, xIds),
      fonts: normalizeFonts(pd.fonts),
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
    typography: t.typography,
    shape: t.shape,
    logo: t.logo,
    header: t.header,
    menu: t.menu,
    footer: t.footer,
    card: t.card,
    product: t.product,
    listing: t.listing,
    cart: t.cart,
    // การเคลื่อนไหวทั้งเว็บ (เปลี่ยนหน้า/เลื่อนจอนุ่ม) — เดิมตกหล่น → บันทึกไม่ติด
    page: t.page,
  };
}
