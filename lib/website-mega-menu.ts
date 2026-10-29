/**
 * 🧭 แผงเมนูใหญ่ (Mega menu) ของเว็บร้าน — ของกลาง ฟังก์ชันล้วน ไม่มี import (คัดลอกไปเว็บร้านได้ทั้งไฟล์)
 *   ⚠️ มิเรอร์: storefront src/lib/mega-menu.ts — แก้ที่นี่แล้วคัดลอกไปทั้งไฟล์
 *
 * เมนูบนสุดแต่ละอัน (MenuItem.panel) เลือกหน้าตาแผงได้ 3 แบบ (ตั้งต้นจากแม่แบบ แล้วแก้ต่อได้ทุกอย่าง):
 *   A = รายการลิงก์ + การ์ดสินค้า + รูปเด่น      (คอลัมน์)
 *   B = คอลัมน์หัวข้อ + ไอคอน/จุดสี + คำอธิบาย    (คอลัมน์)
 *   C = แท็บด้านบน + การ์ดคอลเลกชัน               (แท็บ)
 * แบบคอลัมน์ = กล่อง (block) เรียงซ้าย→ขวา 5 ชนิด: รายการลิงก์ · กลุ่มหัวข้อย่อย · การ์ดสินค้า · รูปเด่น · การ์ดรูป
 * มือถือ: เว็บร้านแสดงเป็นชั้นพับ-กาง (หัวคอลัมน์ → รายการ) · การ์ด/รูปเลื่อนแนวนอน
 * การ์ดสินค้า: อัตโนมัติจากหมวด (มาใหม่/ขายดี) หรือเลือกเอง (รหัสรุ่น) — คัดด้วย pickMegaProducts (ใช้ทั้งเซิร์ฟเวอร์และหน้าเว็บ)
 * ไอคอน: ชุดไอคอนกลางของเว็บร้าน (ERP lib/website-icons ↔ เว็บร้าน site-icons) ค่า "i:<key>" / อีโมจิ · หรืออัปโหลดรูปเอง (iconKey)
 * รอบ 2: รูปเปลี่ยนตามลิงก์ที่ชี้ (hoverImageKey → กล่องรูปเด่น) · รายการอัตโนมัติ (หมวด/คอลเลกชัน/สี — autoMegaLinks)
 *        ลิงก์ตัวหนา/สี · จำนวนสินค้า · แบ่งคอลัมน์ย่อย · หัวคอลัมน์กดได้ + "ดูทั้งหมด" · การ์ดสินค้า เรียง/เฉพาะลด/สลับรูป/สัดส่วน/ป้าย
 *        หน้าตาแผง (เต็มจอ/กล่องลอย · สีพื้น · เส้นคั่น · แถบข้อความโปร · ซ่อนรูปบนมือถือ) · ตั้งเวลาแสดง (inShowWindow)
 *        พฤติกรรมเมนูทั้งชุด MenuBehavior (ชี้/กดเปิด · หน่วงเวลา · พื้นหลังมืด · มือถือพับ-กาง/เลื่อนเข้าหน้าถัดไป · รูปหมวดวงกลม)
 *        ตอนจัด: ตรวจลิงก์เสีย (megaLinkIssue) · ทำซ้ำคอลัมน์ (cloneMegaBlock)
 */

export type MegaTemplate = "A" | "B" | "C";
export type MegaLayout = "columns" | "tabs";
export type MegaBlockKind = "links" | "groups" | "products" | "feature" | "cards";
export type MegaLinkStyle = "plain" | "icon" | "dot" | "thumb";
/** ชนิดแถวในรายการลิงก์: ลิงก์ (เดิม) · หัวข้อ (ตัวหนังสือ กดไม่ได้) · เส้นคั่น · เว้นบรรทัด — ข้อมูลเก่าไม่มี = ลิงก์ */
export type MegaLinkKind = "link" | "heading" | "divider" | "space";
export const MEGA_LINK_KINDS: { value: Exclude<MegaLinkKind, "link">; label: string; hint: string }[] = [
  { value: "heading", label: "🔤 หัวข้อ", hint: "ตัวหนังสือหัวกลุ่ม กดไม่ได้ เช่น NEW ARRIVAL" },
  { value: "divider", label: "➖ เส้นคั่น", hint: "เส้นบาง ๆ คั่นระหว่างลิงก์" },
  { value: "space", label: "↕ เว้นบรรทัด", hint: "ช่องว่างหนึ่งบรรทัด" },
];
export type MegaRatio = "1:1" | "3:4" | "4:5" | "4:3" | "16:9";
export type MegaSort = "new" | "best" | "price-asc" | "price-desc" | "discount" | "random";
/** รายการลิงก์อัตโนมัติ: "" = ใส่เอง · หมวด/คอลเลกชัน/สี = ดึงจากข้อมูลร้าน (เพิ่มใหม่แล้วขึ้นเอง) */
export type MegaAuto = "" | "categories" | "collections" | "colors";

export interface MegaLink {
  id: string;
  /** ➖ ชนิดแถว: link = ลิงก์ · heading = หัวข้อกดไม่ได้ (ใช้ label) · divider/space = ตัวคั่น (ไม่มีชื่อ/ลิงก์) */
  kind: MegaLinkKind;
  label: string;
  href: string;
  /** คำอธิบายบรรทัดล่าง (แบบไอคอน/จุดสี/รูปเล็ก) */
  desc: string;
  /** "i:<key>" ไอคอนชุดกลาง · อีโมจิ · "" = ไม่มี (ข้อมูลเก่าเก็บชื่อเปล่า เช่น "belt" → อ่านเป็น i:belt) */
  icon: string;
  /** รูปไอคอนที่อัปโหลดเอง (มี = ใช้แทน icon) */
  iconKey: string | null;
  /** สีจุด (แบบจุดสี) */
  color: string;
  /** รูปเล็ก (แบบรูปเล็ก) */
  imageKey: string | null;
  badge: string;
  /** ชี้ที่ลิงก์นี้ → กล่องรูปเด่นในแผงเปลี่ยนเป็นรูปนี้ */
  hoverImageKey: string | null;
  /** ตัวหนา */
  bold: boolean;
  /** สีตัวอักษร ("" = ปกติ) เช่น แดงสำหรับ SALE */
  textColor: string;
  /** ตั้งเวลาแสดง (เวลาไทย "YYYY-MM-DD" หรือ "YYYY-MM-DDTHH:mm" · ว่าง = ไม่จำกัด) */
  showFrom: string;
  showUntil: string;
  /** คอลัมน์ย่อยที่ลิงก์นี้อยู่ เมื่อแบ่งคอลัมน์ (1-3) · 0 = อัตโนมัติ (ลงคอลัมน์ที่สั้นกว่า) */
  col: number;
}
export interface MegaGroup {
  id: string;
  label: string;
  href: string;
  links: MegaLink[];
}
export interface MegaCard {
  id: string;
  title: string;
  desc: string;
  href: string;
  imageKey: string | null;
}
export interface MegaBlock {
  id: string;
  kind: MegaBlockKind;
  /** หัวคอลัมน์ ("" = ไม่มี) */
  title: string;
  /** กว้างกี่ส่วน (1-3) */
  span: number;
  /** หัวคอลัมน์กดได้ → ลิงก์นี้ · และใช้กับ "ดูทั้งหมด" ท้ายคอลัมน์ */
  titleHref: string;
  /** ข้อความลิงก์ท้ายคอลัมน์ เช่น "ดูทั้งหมด →" ("" = ไม่โชว์) */
  moreLabel: string;
  /* รายการลิงก์ */
  style: MegaLinkStyle;
  links: MegaLink[];
  /** รายการอัตโนมัติ (ต่อท้ายรายการที่ใส่เอง) */
  auto: MegaAuto;
  /** อัตโนมัติ: สูงสุดกี่รายการ */
  autoMax: number;
  /** แบ่งรายการเป็นกี่คอลัมน์ย่อย (1-3) */
  cols: number;
  /** โชว์จำนวนสินค้าท้ายลิงก์หมวด/คอลเลกชัน */
  showCount: boolean;
  /* กลุ่มหัวข้อย่อย */
  groups: MegaGroup[];
  /* การ์ดสินค้า */
  source: "auto" | "pick";
  /** หมวด (อัตโนมัติ) "" = ทุกหมวด */
  category: string;
  sort: MegaSort;
  count: number;
  /** รหัสรุ่นที่เลือกเอง (เรียงตามลำดับที่เลือก) */
  codes: string[];
  perRow: number;
  showPrice: boolean;
  /** เฉพาะสินค้าที่ลดราคา (มีราคาเต็มขีดฆ่า) */
  onSale: boolean;
  /** ชี้แล้วสลับเป็นรูปที่ 2 */
  hoverSwap: boolean;
  /** 🖼 รูปบนการ์ดรายรุ่น (เลือกเอง): อัปโหลด/คลังรูป { รหัสรุ่น: r2 key } — ชนะรูป SKU */
  images: Record<string, string>;
  /** 🖼 รูปบนการ์ดจากรูป SKU (สี) "รหัสรุ่น:sku-xxxxxxxx" — กดการ์ดแล้วเปิดหน้าสินค้าที่สีนั้น */
  skuImages: string[];
  /** โชว์ป้ายบนการ์ด (ป้ายของสินค้า) */
  showBadge: boolean;
  /* รูปเด่น */
  imageKey: string | null;
  caption: string;
  href: string;
  /** สัดส่วนรูป (รูปเด่น / การ์ดสินค้า) */
  ratio: MegaRatio;
  /** รูปเด่น: เปลี่ยนรูปตามลิงก์ที่ชี้ (ลิงก์ที่มีรูปตอนชี้ / หมวดที่มีรูป) */
  swapOnHover: boolean;
  /* การ์ดรูป */
  cards: MegaCard[];
}
export interface MegaTab {
  id: string;
  label: string;
  href: string;
  cards: MegaCard[];
}
export interface MegaPanel {
  /** แม่แบบที่ใช้ตั้งต้น (ไว้โชว์ป้าย) */
  template: MegaTemplate;
  layout: MegaLayout;
  blocks: MegaBlock[];
  tabs: MegaTab[];
  /** แบบแท็บ: การ์ดต่อแถว (0 = อัตโนมัติ — เต็มแถวตามจำนวนการ์ดของแท็บนั้น · สูงสุด 6) */
  cardsPerRow: number;
  /** ลิงก์ "ดูทั้งหมด" ท้ายแผง ("" = ไม่โชว์) */
  viewAllLabel: string;
  /** แบบแท็บ: การ์ด "ดูทั้งหมด" ต่อท้ายการ์ดของทุกแท็บ (ไปที่ลิงก์ของแท็บนั้น) */
  viewAllCard: boolean;
  /** ข้อความบนการ์ดดูทั้งหมด ("" = "ดูทั้งหมด") */
  viewAllCardLabel: string;
  /** รูปพื้นการ์ดดูทั้งหมด (ไม่ใส่ = พื้นสีอ่อนของธีม + ลูกศร) */
  viewAllCardImageKey: string | null;
  /** ขนาดแผง: เต็มความกว้างจอ / กล่องลอยใต้เมนู */
  width: "full" | "box";
  /** สีพื้นแผง ("" = สีพื้นการ์ดของธีม) */
  bg: string;
  /** เส้นคั่นแนวตั้งระหว่างคอลัมน์ */
  divider: boolean;
  /** แถบข้อความใต้แผง เช่น "ส่งฟรีเมื่อครบ ฿1,500" ("" = ไม่มี) */
  promo: string;
  promoHref: string;
  /** มือถือ: ซ่อนการ์ดสินค้า/รูปเด่น/การ์ดรูป (เหลือแต่ลิงก์ · โหลดเร็ว) */
  mobileHideMedia: boolean;
}

/** ⚙️ พฤติกรรมเมนูทั้งชุด (theme.menu.behavior) — ใช้กับทุกเมนูที่มีเมนูย่อย/แผง */
export interface MenuBehavior {
  /** ชี้แล้วเปิด / ต้องกดก่อน */
  open: "hover" | "click";
  /** หน่วงก่อนเปิด (มิลลิวินาที · กันแผงเด้งตอนเลื่อนเมาส์ผ่าน) */
  delay: number;
  /** ฉากหลังมืดลงตอนแผงเปิด */
  dim: boolean;
  /** มือถือ: พับ-กาง / เลื่อนเข้าหน้าถัดไป (แบบแอป) */
  mobileStyle: "accordion" | "drill";
  /** มือถือ: แถบรูปหมวดวงกลมเลื่อนแนวนอนบนสุดของเมนู */
  mobileCats: boolean;
  /** ✨ ตอนชี้ลิงก์เมนูด้านบน: จางลง (เดิม) / เปลี่ยนสี / เส้นใต้ (+เปลี่ยนสี) / ขยายนิดหน่อย */
  navHover: "fade" | "color" | "underline" | "grow";
  /** ✨ ตอนชี้ลิงก์เมนูย่อย/แผงเมนู: เปลี่ยนสี (เดิม) / เส้นใต้ (+เปลี่ยนสี) / ขยายนิดหน่อย / ไม่มี */
  subHover: "color" | "underline" | "grow" | "none";
  /** สีตอนชี้ ("" = สีลิงก์ของธีม) */
  hoverColor: string;
  /** ☰ จอคอม: คำเมนูเรียงในแถบ (เดิม) / ปุ่ม ☰ อย่างเดียว / ☰ + คำ — กดแล้วเปิดลิ้นชักตัวเดียวกับมือถือ · เมนูที่ติ๊ก "ติดหัวเว็บ" (MenuItem.pin) ยังโชว์ข้างปุ่ม */
  desktopStyle: "links" | "burger" | "burger-text";
  /** คำข้างปุ่ม ☰ (แบบ burger-text · "" = MENU) */
  burgerLabel: string;
}
export const DESKTOP_MENU_STYLES: { value: MenuBehavior["desktopStyle"]; label: string }[] = [
  { value: "links", label: "คำเมนูเรียงในแถบ (เดิม)" },
  { value: "burger", label: "☰ อย่างเดียว" },
  { value: "burger-text", label: "☰ + คำว่า MENU" },
];
export const NAV_HOVERS: { value: MenuBehavior["navHover"]; label: string }[] = [
  { value: "fade", label: "จางลง (เดิม)" },
  { value: "color", label: "เปลี่ยนสี" },
  { value: "underline", label: "เส้นใต้" },
  { value: "grow", label: "ขยายนิดหน่อย" },
];
export const SUB_HOVERS: { value: MenuBehavior["subHover"]; label: string }[] = [
  { value: "color", label: "เปลี่ยนสี (เดิม)" },
  { value: "underline", label: "เส้นใต้" },
  { value: "grow", label: "ขยายนิดหน่อย" },
  { value: "none", label: "ไม่มี" },
];
/** 🔠 ฟอนต์/สี/ขนาด/ตัวพิมพ์ใหญ่ของเมนู = theme.typography.nav (เมนูด้านบน) + .menu (เมนูย่อย/แผงเมนู) — ไม่เก็บซ้ำที่นี่ */
export const DEFAULT_MENU_BEHAVIOR: MenuBehavior = { open: "hover", delay: 0, dim: false, mobileStyle: "accordion", mobileCats: false, navHover: "fade", subHover: "color", hoverColor: "", desktopStyle: "links", burgerLabel: "" };
export const MENU_DELAYS = [0, 100, 150, 200, 300, 400, 600] as const;

/** แม่แบบแผงเมนูที่บันทึกไว้ (ตาราง website_menu_templates · /api/website/menu-templates) */
export interface MenuTemplate {
  id: string;
  shopId: string | null;
  shopName: string | null;
  name: string;
  template: MegaTemplate;
  panel: MegaPanel;
  createdByName: string | null;
  updatedAt: string;
}

export const MEGA_LIMITS = { blocks: 6, links: 30, groups: 10, groupLinks: 12, cards: 12, tabs: 8, codes: 24, count: [1, 12], span: [1, 3], perRow: [1, 4], cardsPerRow: [2, 6] } as const;

export const MEGA_TEMPLATES: { value: MegaTemplate; label: string; hint: string }[] = [
  { value: "A", label: "รายการ + การ์ดสินค้า + รูปเด่น", hint: "ลิงก์หมวดด้านซ้าย · การ์ดสินค้าตรงกลาง · รูปใหญ่ด้านขวา" },
  { value: "B", label: "คอลัมน์ + ไอคอน/จุดสี + คำอธิบาย", hint: "เลือกช้อปตามประเภท / สไตล์ / วัสดุ" },
  { value: "C", label: "แท็บ + การ์ดคอลเลกชัน", hint: "แท็บด้านบน · การ์ดรูปพร้อมคำอธิบาย" },
];

export const MEGA_BLOCK_KINDS: { value: MegaBlockKind; label: string; hint: string }[] = [
  { value: "links", label: "รายการลิงก์", hint: "ข้อความ / ไอคอน / จุดสี / รูปเล็ก + คำอธิบาย" },
  { value: "groups", label: "กลุ่มหัวข้อย่อย", hint: "หัวข้อ แล้วมีลิงก์ย่อยใต้แต่ละหัวข้อ" },
  { value: "products", label: "การ์ดสินค้า", hint: "อัตโนมัติจากหมวด หรือเลือกเอง" },
  { value: "feature", label: "รูปเด่น", hint: "รูปใหญ่ + ข้อความ + ลิงก์" },
  { value: "cards", label: "การ์ดรูป", hint: "รูป + ชื่อ + คำอธิบาย (เช่น คอลเลกชัน)" },
];

export const MEGA_LINK_STYLES: { value: MegaLinkStyle; label: string }[] = [
  { value: "plain", label: "ข้อความ" },
  { value: "icon", label: "ไอคอน + คำอธิบาย" },
  { value: "dot", label: "จุดสี + คำอธิบาย" },
  { value: "thumb", label: "รูปเล็ก + คำอธิบาย" },
];

export const MEGA_SORTS: { value: MegaSort; label: string }[] = [
  { value: "new", label: "มาใหม่" },
  { value: "best", label: "ขายดี" },
  { value: "discount", label: "ลดมากสุด" },
  { value: "price-asc", label: "ราคาต่ำ → สูง" },
  { value: "price-desc", label: "ราคาสูง → ต่ำ" },
  { value: "random", label: "สุ่ม (เปลี่ยนทุกวัน)" },
];
export const MEGA_AUTOS: { value: MegaAuto; label: string; hint: string }[] = [
  { value: "", label: "ใส่เอง", hint: "พิมพ์/เลือกลิงก์เองทีละอัน" },
  { value: "categories", label: "หมวดทั้งหมด", hint: "ทุกหมวดของร้าน — เพิ่มหมวดใหม่แล้วขึ้นเอง (รูปหมวด = รูปตอนชี้)" },
  { value: "collections", label: "คอลเลกชันทั้งหมด", hint: "ทุกคอลเลกชันที่มีหน้าเว็บ (แบนเนอร์ = รูปตอนชี้)" },
  { value: "colors", label: "สีทั้งหมด", hint: "โทนสีของตัวกรองร้าน → ลิงก์ไปหน้าสินค้ากรองสีนั้น" },
];

export const MEGA_RATIOS: { value: MegaRatio; label: string }[] = [
  { value: "3:4", label: "แนวตั้ง 3:4" },
  { value: "4:5", label: "แนวตั้ง 4:5" },
  { value: "1:1", label: "จัตุรัส 1:1" },
  { value: "4:3", label: "แนวนอน 4:3" },
  { value: "16:9", label: "แนวนอน 16:9" },
];
export const megaRatioCss = (r: MegaRatio) => r.replace(":", " / ");

/** ไอคอนลิงก์ — กฎเดียวกับ cleanSiteIcon (lib/website-icons · ไฟล์นี้ห้าม import): i:<key> · อีโมจิ ≤ 8 ตัว
 *  ข้อมูลเก่า (ชุด MEGA_ICONS เดิม 20 ตัว — อยู่ในชุดกลางครบแล้ว) เก็บชื่อเปล่า "belt" → i:belt · รูปอัปโหลดอยู่ที่ iconKey */
const megaIconOf = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : "";
  if (/^[a-z0-9-]{1,40}$/.test(s)) return `i:${s}`;
  if (/^i:[a-z0-9-]{1,40}$/.test(s)) return s;
  return s.startsWith("i:") || s.startsWith("img:") ? "" : s.slice(0, 8);
};

/* ───────── ตัวสร้างค่าใหม่ ───────── */
const rid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const newMegaLink = (label = "ลิงก์ใหม่", href = "", kind: MegaLinkKind = "link"): MegaLink => ({ id: rid("l"), kind, label, href, desc: "", icon: "", iconKey: null, color: "", imageKey: null, badge: "", hoverImageKey: null, bold: false, textColor: "", showFrom: "", showUntil: "", col: 0 });
/** ➖ แถวตัวคั่น (เส้น/เว้นบรรทัด) — ข้อมูลที่ยังไม่ผ่าน normalize อาจไม่มี kind = ลิงก์ */
export const megaIsSep = (l: { kind?: MegaLinkKind }) => l.kind === "divider" || l.kind === "space";
/** แถวตัวคั่น/หัวข้อใหม่ (ปุ่มข้าง "＋ เพิ่มลิงก์") — หัวข้อตั้งต้นเป็นตัวหนา */
export const newMegaRow = (kind: Exclude<MegaLinkKind, "link">): MegaLink => ({ ...newMegaLink(kind === "heading" ? "หัวข้อ" : "", "", kind), bold: kind === "heading" });
export const newMegaGroup = (label = "หัวข้อใหม่"): MegaGroup => ({ id: rid("g"), label, href: "", links: [] });
export const newMegaCard = (title = "การ์ดใหม่", href = "", imageKey: string | null = null): MegaCard => ({ id: rid("c"), title, desc: "", href, imageKey });
export const newMegaTab = (label = "แท็บใหม่", href = ""): MegaTab => ({ id: rid("t"), label, href, cards: [] });
export function newMegaBlock(kind: MegaBlockKind, title = ""): MegaBlock {
  return {
    id: rid("b"),
    kind,
    title,
    span: kind === "products" ? 2 : 1,
    titleHref: "",
    moreLabel: "",
    style: "plain",
    links: [],
    auto: "",
    autoMax: 12,
    cols: 1,
    showCount: false,
    groups: [],
    source: "auto",
    category: "",
    sort: "new",
    count: 6,
    codes: [],
    perRow: 3,
    showPrice: false,
    onSale: false,
    hoverSwap: false,
    images: {},
    skuImages: [],
    showBadge: false,
    imageKey: null,
    caption: "",
    href: "",
    ratio: kind === "products" ? "1:1" : "3:4",
    swapOnHover: true,
    cards: [],
  };
}

/** ทำซ้ำคอลัมน์ — id ใหม่ทั้งกล่องและรายการข้างใน (วางซ้ำในแผงเดียวกัน/เมนูอื่นได้ไม่ชนกัน) */
export function cloneMegaBlock(b: MegaBlock): MegaBlock {
  const c = JSON.parse(JSON.stringify(b)) as MegaBlock;
  c.id = rid("b");
  c.links = c.links.map((l) => ({ ...l, id: rid("l") }));
  c.groups = c.groups.map((g) => ({ ...g, id: rid("g"), links: g.links.map((l) => ({ ...l, id: rid("l") })) }));
  c.cards = c.cards.map((x) => ({ ...x, id: rid("c") }));
  return c;
}

/** ลิงก์หมวด (ตรงกับเว็บร้าน /c/<key>) */
export const megaCategoryHref = (key: string) => (key ? `/c/${encodeURIComponent(key)}` : "/shop");

/** แบบแท็บ: จำนวนคอลัมน์การ์ดของแท็บที่มี n ใบ (รวมการ์ดดูทั้งหมด) — อัตโนมัติ (0) = เต็มแถวพอดีจำนวนการ์ด สูงสุด 6 */
export function megaTabCols(cardsPerRow: number, n: number): number {
  return cardsPerRow > 0 ? cardsPerRow : Math.max(1, Math.min(6, n));
}

/** การ์ด "ดูทั้งหมด" ท้ายแท็บ (ไปลิงก์ของแท็บ · แท็บไม่มีลิงก์ = ลิงก์ของเมนู) — ปิด/ไม่มีลิงก์ = null */
export function megaViewAllCard(p: Pick<MegaPanel, "viewAllCard" | "viewAllCardLabel" | "viewAllCardImageKey">, tabHref: string, itemHref = ""): MegaCard | null {
  const href = tabHref || itemHref;
  if (!p.viewAllCard || !href) return null;
  return { id: "view-all", title: p.viewAllCardLabel || "ดูทั้งหมด", desc: "", href, imageKey: p.viewAllCardImageKey };
}

/** รหัสหมวดจากลิงก์หมวด (/c/<รหัส> หรือ /shop?cat=<รหัส>) — ไม่ใช่ลิงก์หมวด = null */
export function megaCategoryKeyOf(href: string): string | null {
  const m = /^\/c\/([^/?#]+)\/?(?:[?#].*)?$/.exec(href) ?? /^\/shop\?(?:.*&)?cat=([^&#]+)/.exec(href);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * 🔗 ชื่อที่โชว์ของลิงก์ — ลิงก์หมวดที่ "ไม่ได้ตั้งชื่อเอง" (ชื่อว่าง) = ชื่อหมวดปัจจุบัน
 * เปลี่ยนชื่อหมวดในแท็บ 📂 หมวดหมู่ แล้วเมนูเปลี่ยนตามเอง · หน้า /en ได้ชื่ออังกฤษของหมวด (labels มาตามภาษาของหน้า)
 * ตั้งชื่อเอง = ใช้ชื่อนั้น (อังกฤษตั้งแยกได้ที่ label_en) · ไม่รู้ชื่อหมวด = รหัสหมวด
 */
export function megaLinkLabel(l: Pick<MegaLink, "label" | "href">, labels?: Record<string, string> | null): string {
  if (l.label.trim()) return l.label;
  const k = megaCategoryKeyOf(l.href);
  return k ? labels?.[k] || k : l.label;
}

/** แผงตั้งต้นจากแม่แบบ — เติมหมวดของร้านให้เลย (แก้ต่อได้ทุกอย่าง) */
export function megaPreset(template: MegaTemplate, ctx: { categories: { key: string; label: string; imageKey?: string | null }[] }): MegaPanel {
  const cats = ctx.categories.slice(0, 8);
  const base: MegaPanel = {
    template,
    layout: template === "C" ? "tabs" : "columns",
    blocks: [],
    tabs: [],
    cardsPerRow: 4,
    viewAllLabel: "",
    viewAllCard: false,
    viewAllCardLabel: "",
    viewAllCardImageKey: null,
    width: "full",
    bg: "",
    divider: false,
    promo: "",
    promoHref: "",
    mobileHideMedia: false,
  };
  if (template === "A") {
    const list = newMegaBlock("links", "");
    list.links = [newMegaLink("ดูทั้งหมด", "/shop"), newMegaLink("มาใหม่", "/new"), ...cats.map((c) => newMegaLink("", megaCategoryHref(c.key)))];
    const prods = newMegaBlock("products", "");
    prods.span = 2;
    prods.count = 6;
    prods.perRow = 3;
    const feat = newMegaBlock("feature", "");
    feat.caption = "ดูคอลเลกชันใหม่";
    feat.href = "/shop";
    return { ...base, blocks: [list, prods, feat] };
  }
  if (template === "B") {
    const byType = newMegaBlock("links", "เลือกช้อปตามประเภท");
    byType.style = "icon";
    byType.links = cats.slice(0, 6).map((c, i) => ({ ...newMegaLink("", megaCategoryHref(c.key)), icon: `i:${["handbag", "backpack", "briefcase", "luggage", "clutch", "wallet"][i % 6]}` }));
    const byStyle = newMegaBlock("groups", "เลือกช้อปตามสไตล์");
    byStyle.groups = [
      { ...newMegaGroup("สำหรับผู้หญิง"), links: [newMegaLink("ใบเล็ก", "/shop"), newMegaLink("ถือ/สะพาย", "/shop")] },
      { ...newMegaGroup("สำหรับผู้ชาย"), links: [newMegaLink("ทำงาน", "/shop"), newMegaLink("เดินทาง", "/shop")] },
    ];
    const byMat = newMegaBlock("links", "เลือกช้อปตามวัสดุ");
    byMat.style = "dot";
    byMat.links = [
      { ...newMegaLink("หนังแท้", "/shop"), color: "#3B2A20", desc: "ทนทาน ยิ่งใช้ยิ่งสวย" },
      { ...newMegaLink("ผ้าไนลอน", "/shop"), color: "#2B2F36", desc: "เบา กันน้ำ" },
      { ...newMegaLink("ผ้าแคนวาส", "/shop"), color: "#C9B79C", desc: "ลำลอง ใช้ได้ทุกวัน" },
    ];
    return { ...base, blocks: [byType, byStyle, byMat] };
  }
  const tabs = (cats.length ? cats.slice(0, 5) : [{ key: "", label: "ทั้งหมด", imageKey: null }]).map((c) => ({
    ...newMegaTab(c.label, megaCategoryHref(c.key)),
    cards: [newMegaCard(c.label, megaCategoryHref(c.key), c.imageKey ?? null)],
  }));
  return { ...base, tabs };
}

/* ───────── ตัวกรองค่า (กันข้อมูลเก่า/ค่าแปลก) ───────── */
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const key = (v: unknown): string | null => (typeof v === "string" && /^[\w./-]{1,300}$/.test(v.trim()) ? v.trim() : null);
const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) ? v.trim() : "");
const int = (v: unknown, fb: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fb;
};
const oneOf = <T extends string>(v: unknown, all: readonly T[], fb: T): T => (typeof v === "string" && (all as readonly string[]).includes(v) ? (v as T) : fb);
const id = (v: unknown, p: string, i: number) => (typeof v === "string" && /^[\w-]{1,40}$/.test(v) ? v : `${p}${i}`);
/** ลิงก์: ห้าม javascript: · ยาวไม่เกิน 500 */
export const cleanHref = (v: unknown) => {
  const s = str(v, 500);
  return /^\s*(javascript|data|vbscript):/i.test(s) ? "" : s;
};
/** เวลาแสดง: "YYYY-MM-DD" หรือ "YYYY-MM-DDTHH:mm" (เวลาไทย) · อื่น ๆ = ว่าง */
const when = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v.trim()) ? v.trim() : "");
const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object").slice(0, max) : []) as Record<string, unknown>[];

function cleanLink(r: Record<string, unknown>, i: number): MegaLink | null {
  const kind = oneOf(r.kind, ["link", "heading", "divider", "space"] as const, "link");
  // ➖ ตัวคั่น: ไม่มีชื่อ/ลิงก์ — เก็บแค่คอลัมน์ + เวลาแสดง
  if (kind === "divider" || kind === "space")
    return { ...newMegaLink("", "", kind), id: id(r.id, "l", i), showFrom: when(r.showFrom), showUntil: when(r.showUntil), col: int(r.col, 0, 0, 3) };
  const label = str(r.label, 60);
  // 🔤 หัวข้อ = ตัวหนังสือกดไม่ได้ (ไม่เก็บลิงก์)
  const href = kind === "heading" ? "" : cleanHref(r.href);
  // ชื่อว่าง = ทิ้ง · ยกเว้นลิงก์หมวด (ชื่อว่าง = ใช้ชื่อหมวดปัจจุบัน — megaLinkLabel)
  if (!label && !megaCategoryKeyOf(href)) return null;
  return {
    id: id(r.id, "l", i),
    kind,
    label,
    href,
    desc: str(r.desc, 120),
    icon: megaIconOf(r.icon),
    iconKey: key(r.iconKey),
    color: hex(r.color),
    imageKey: key(r.imageKey),
    badge: str(r.badge, 20),
    hoverImageKey: key(r.hoverImageKey),
    bold: r.bold === true,
    textColor: hex(r.textColor),
    showFrom: when(r.showFrom),
    showUntil: when(r.showUntil),
    col: int(r.col, 0, 0, 3),
  };
}
const cleanLinks = (v: unknown, max: number) => arr(v, max).map(cleanLink).filter((x): x is MegaLink => !!x);
function cleanCard(r: Record<string, unknown>, i: number): MegaCard | null {
  const title = str(r.title, 60);
  const imageKey = key(r.imageKey);
  if (!title && !imageKey) return null;
  return { id: id(r.id, "c", i), title, desc: str(r.desc, 160), href: cleanHref(r.href), imageKey };
}
const cleanCards = (v: unknown) => arr(v, MEGA_LIMITS.cards).map(cleanCard).filter((x): x is MegaCard => !!x);

const BLOCK_KINDS = MEGA_BLOCK_KINDS.map((k) => k.value);
const LINK_STYLES = MEGA_LINK_STYLES.map((k) => k.value);
const RATIOS = MEGA_RATIOS.map((k) => k.value);
const SORTS = MEGA_SORTS.map((k) => k.value);
const AUTOS = MEGA_AUTOS.map((k) => k.value);

export function normalizeMegaBlock(r: Record<string, unknown>, i: number): MegaBlock {
  const kind = oneOf(r.kind, BLOCK_KINDS, "links");
  const d = newMegaBlock(kind);
  return {
    id: id(r.id, "b", i),
    kind,
    title: str(r.title, 60),
    span: int(r.span, d.span, MEGA_LIMITS.span[0], MEGA_LIMITS.span[1]),
    titleHref: cleanHref(r.titleHref),
    moreLabel: str(r.moreLabel, 40),
    style: oneOf(r.style, LINK_STYLES, "plain"),
    links: cleanLinks(r.links, MEGA_LIMITS.links),
    auto: oneOf(r.auto, AUTOS, ""),
    autoMax: int(r.autoMax, d.autoMax, 1, MEGA_LIMITS.links),
    cols: int(r.cols, 1, 1, 3),
    showCount: r.showCount === true,
    groups: arr(r.groups, MEGA_LIMITS.groups)
      .map((g, gi) => ({ id: id(g.id, "g", gi), label: str(g.label, 60), href: cleanHref(g.href), links: cleanLinks(g.links, MEGA_LIMITS.groupLinks) }))
      .filter((g) => g.label),
    source: oneOf(r.source, ["auto", "pick"] as const, "auto"),
    category: str(r.category, 80),
    sort: oneOf(r.sort, SORTS, "new"),
    count: int(r.count, d.count, MEGA_LIMITS.count[0], MEGA_LIMITS.count[1]),
    codes: Array.isArray(r.codes) ? Array.from(new Set(r.codes.filter((c): c is string => typeof c === "string" && /^[\w.-]{1,60}$/.test(c)))).slice(0, MEGA_LIMITS.codes) : [],
    perRow: int(r.perRow, d.perRow, MEGA_LIMITS.perRow[0], MEGA_LIMITS.perRow[1]),
    showPrice: r.showPrice === true,
    onSale: r.onSale === true,
    hoverSwap: r.hoverSwap === true,
    images:
      r.images && typeof r.images === "object" && !Array.isArray(r.images)
        ? Object.fromEntries(
            Object.entries(r.images as Record<string, unknown>)
              .filter(([c, k]) => /^[\w.-]{1,60}$/.test(c) && typeof k === "string" && /^[\w\-./%()]{1,300}$/.test(k))
              .slice(0, MEGA_LIMITS.codes),
          ) as Record<string, string>
        : {},
    skuImages: Array.isArray(r.skuImages) ? r.skuImages.filter((x): x is string => typeof x === "string" && /^[\w.-]{1,60}:[\w-]{1,64}$/.test(x)).slice(0, MEGA_LIMITS.codes) : [],
    showBadge: r.showBadge === true,
    imageKey: key(r.imageKey),
    caption: str(r.caption, 120),
    href: cleanHref(r.href),
    ratio: oneOf(r.ratio, RATIOS, d.ratio),
    swapOnHover: r.swapOnHover !== false,
    cards: cleanCards(r.cards),
  };
}

/** ค่าที่เก็บใน DB → แผงที่ครบถ้วน · ไม่มี/ผิดรูป = null (เมนูนั้นไม่มีแผงใหญ่) */
export function normalizeMegaPanel(raw: unknown): MegaPanel | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const template = oneOf(r.template, ["A", "B", "C"] as const, "A");
  const layout = oneOf(r.layout, ["columns", "tabs"] as const, template === "C" ? "tabs" : "columns");
  return {
    template,
    layout,
    blocks: arr(r.blocks, MEGA_LIMITS.blocks).map(normalizeMegaBlock),
    tabs: arr(r.tabs, MEGA_LIMITS.tabs)
      .map((t, ti) => ({ id: id(t.id, "t", ti), label: str(t.label, 40), href: cleanHref(t.href), cards: cleanCards(t.cards) }))
      .filter((t) => t.label),
    cardsPerRow: r.cardsPerRow === 0 || r.cardsPerRow === "0" ? 0 : int(r.cardsPerRow, 4, MEGA_LIMITS.cardsPerRow[0], MEGA_LIMITS.cardsPerRow[1]),
    viewAllLabel: str(r.viewAllLabel, 40),
    viewAllCard: r.viewAllCard === true,
    viewAllCardLabel: str(r.viewAllCardLabel, 40),
    viewAllCardImageKey: key(r.viewAllCardImageKey),
    width: oneOf(r.width, ["full", "box"] as const, "full"),
    bg: hex(r.bg),
    divider: r.divider === true,
    promo: str(r.promo, 120),
    promoHref: cleanHref(r.promoHref),
    mobileHideMedia: r.mobileHideMedia === true,
  };
}

/** พฤติกรรมเมนูทั้งชุด (theme.menu.behavior) */
export function normalizeMenuBehavior(raw: unknown): MenuBehavior {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_MENU_BEHAVIOR;
  const delay = Number(r.delay);
  return {
    open: oneOf(r.open, ["hover", "click"] as const, d.open),
    delay: (MENU_DELAYS as readonly number[]).includes(delay) ? delay : d.delay,
    dim: r.dim === true,
    mobileStyle: oneOf(r.mobileStyle, ["accordion", "drill"] as const, d.mobileStyle),
    mobileCats: r.mobileCats === true,
    navHover: oneOf(r.navHover, ["fade", "color", "underline", "grow"] as const, d.navHover),
    subHover: oneOf(r.subHover, ["color", "underline", "grow", "none"] as const, d.subHover),
    hoverColor: hex(r.hoverColor),
    desktopStyle: oneOf(r.desktopStyle, ["links", "burger", "burger-text"] as const, d.desktopStyle),
    burgerLabel: str(r.burgerLabel, 20).trim(),
  };
}

/** ⏰ อยู่ในช่วงเวลาแสดงไหม (เวลาไทย UTC+7 · ว่าง = ไม่จำกัด · วันสิ้นสุดแบบไม่ใส่เวลา = ถึงสิ้นวัน) */
export function inShowWindow(from: string | undefined, until: string | undefined, now = Date.now()): boolean {
  const at = (v: string, end: boolean) => Date.parse(`${v.length === 10 ? `${v}T${end ? "23:59:59" : "00:00:00"}` : `${v}:00`}+07:00`);
  if (from) {
    const t = at(from, false);
    if (Number.isFinite(t) && now < t) return false;
  }
  if (until) {
    const t = at(until, true);
    if (Number.isFinite(t) && now > t) return false;
  }
  return true;
}

/** แผงนี้มีอะไรให้โชว์ไหม (ว่าง = เว็บร้านไม่เปิดแผง) */
export function megaHasContent(p: MegaPanel | null | undefined): boolean {
  if (!p) return false;
  if (p.layout === "tabs") return p.tabs.some((t) => t.cards.length > 0);
  return p.blocks.some((b) => (b.kind === "links" ? b.links.some((l) => !megaIsSep(l)) : b.kind === "groups" ? b.groups.length > 0 : b.kind === "cards" ? b.cards.length > 0 : b.kind === "feature" ? !!b.imageKey || !!b.caption : true));
}

/** ข้อมูลสินค้าขั้นต่ำที่ใช้คัด (เว็บร้านส่ง Product มาได้เลย) */
export interface MegaProductLike {
  code?: string;
  category?: string;
  categories?: string[];
  listedAt?: string | null;
  salesRank?: number | null;
  price?: number;
  comparePrice?: number | null;
}

/** สุ่มแบบคงที่ทั้งวัน (เซิร์ฟเวอร์กับหน้าเว็บได้ลำดับเดียวกัน · เปลี่ยนวันละครั้ง) */
function dayHash(seed: string, now: number): (s: string) => number {
  const day = new Date(now + 7 * 3600e3).toISOString().slice(0, 10);
  return (s: string) => {
    let h = 2166136261;
    for (const ch of `${seed}|${day}|${s}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
  };
}

/** คัดสินค้าของกล่องการ์ดสินค้า — อัตโนมัติ: หมวด → เรียงมาใหม่/ขายดี → N ตัว · เลือกเอง: ตามลำดับรหัสที่เลือก (ไม่มีในร้าน = ข้าม) */
const onSaleP = (p: MegaProductLike) => p.comparePrice != null && p.price != null && p.comparePrice > p.price;
/** 🖼 รูปที่เลือกให้การ์ดสินค้ารุ่นนี้: อัปโหลด/คลัง (key) ชนะ → รูป SKU (optionId) → null = รูปแรกของสินค้า (เดิม) */
export function megaCardPick(b: Pick<MegaBlock, "images" | "skuImages">, code: string | null | undefined): { key?: string; optionId?: string } | null {
  if (!code) return null;
  const up = code.toUpperCase();
  const key = Object.entries(b.images ?? {}).find(([c]) => c.toUpperCase() === up)?.[1];
  if (key) return { key };
  const ref = (b.skuImages ?? []).find((r) => r.split(":")[0].toUpperCase() === up);
  return ref ? { optionId: ref.slice(ref.indexOf(":") + 1) } : null;
}

export function pickMegaProducts<T extends MegaProductLike>(b: Pick<MegaBlock, "source" | "category" | "sort" | "count" | "codes"> & { id?: string; onSale?: boolean }, products: T[], now = Date.now()): T[] {
  const sale = (list: T[]) => (b.onSale ? list.filter(onSaleP) : list);
  if (b.source === "pick") {
    const byCode = new Map(products.filter((p) => p.code).map((p) => [String(p.code).toLowerCase(), p]));
    return sale(b.codes.map((c) => byCode.get(c.toLowerCase())).filter((p): p is T => !!p));
  }
  const inCat = sale(b.category ? products.filter((p) => p.category === b.category || (p.categories ?? []).includes(b.category)) : products.slice());
  const time = (p: T) => (p.listedAt ? Date.parse(p.listedAt) || 0 : 0);
  const rank = (p: T) => (p.salesRank != null ? p.salesRank : Number.MAX_SAFE_INTEGER);
  const price = (p: T) => p.price ?? 0;
  const off = (p: T) => (onSaleP(p) ? 1 - price(p) / (p.comparePrice as number) : 0);
  const hash = dayHash(b.id ?? "", now);
  const key = (p: T) => String(p.code ?? "");
  const cmp: Record<MegaSort, (a: T, c: T) => number> = {
    new: (a, c) => time(c) - time(a) || rank(a) - rank(c),
    best: (a, c) => rank(a) - rank(c) || time(c) - time(a),
    "price-asc": (a, c) => price(a) - price(c),
    "price-desc": (a, c) => price(c) - price(a),
    discount: (a, c) => off(c) - off(a) || time(c) - time(a),
    random: (a, c) => hash(key(a)) - hash(key(c)),
  };
  inCat.sort(cmp[b.sort] ?? cmp.new);
  return inCat.slice(0, b.count);
}

/** ข้อมูลร้านสำหรับรายการอัตโนมัติ (เว็บร้าน: layout.tsx · ERP: พรีวิวจำนวน) */
export interface MegaAutoData {
  categories: { key: string; label: string; imageKey?: string | null; count?: number }[];
  /** ชื่อทุกหมวด (รวมหมวดย่อย) รหัส → ชื่อ ตามภาษาของหน้า — ลิงก์หมวดที่ไม่ได้ตั้งชื่อเองใช้ชื่อนี้ (megaLinkLabel) */
  labels?: Record<string, string>;
  collections: { slug: string; label: string; imageKey?: string | null; count?: number }[];
  tones: { key: string; name: string; hex: string }[];
}
/** รายการลิงก์ของกล่อง = ที่ใส่เอง (ตามเวลาแสดง) + อัตโนมัติต่อท้าย · count = จำนวนสินค้า (ถ้ารู้) */
/**
 * แบ่งลิงก์เป็นคอลัมน์ย่อยตามที่เลือก (ช่อง "คอลัมน์" ของแต่ละลิงก์)
 *   ลิงก์ที่เลือกคอลัมน์ = อยู่คอลัมน์นั้น (เกินจำนวนคอลัมน์ = คอลัมน์สุดท้าย) · อัตโนมัติ (0) = ลงคอลัมน์ที่สั้นสุดตอนนั้น
 *   ในแต่ละคอลัมน์เรียงตามลำดับเดิมของรายการ
 * ไม่มีลิงก์ไหนเลือกคอลัมน์เลย = null → ใช้แบบเดิม (ไหลต่อกันเป็นคอลัมน์อัตโนมัติ)
 */
export function megaSplitColumns<T extends { col?: number }>(links: T[], cols: number): T[][] | null {
  if (cols < 2 || !links.some((l) => (l.col ?? 0) > 0)) return null;
  const size = Array.from({ length: cols }, () => 0);
  for (const l of links) if ((l.col ?? 0) > 0) size[Math.min(cols, l.col ?? 1) - 1]++;
  const at = links.map((l) => {
    if ((l.col ?? 0) > 0) return Math.min(cols, l.col ?? 1) - 1;
    const c = size.indexOf(Math.min(...size));
    size[c]++;
    return c;
  });
  return size.map((_, c) => links.filter((_, i) => at[i] === c));
}

export function megaBlockLinks(b: Pick<MegaBlock, "links" | "auto" | "autoMax">, data: MegaAutoData | null, now = Date.now()): (MegaLink & { count?: number })[] {
  const manual = b.links.filter((l) => inShowWindow(l.showFrom, l.showUntil, now)).map((l) => ({ ...l, label: megaLinkLabel(l, data?.labels) }));
  if (!b.auto || !data) return manual;
  const mk = (idv: string, label: string, href: string, extra: Partial<MegaLink> & { count?: number }) => ({ ...newMegaLinkFixed(idv, label, href), ...extra });
  const auto =
    b.auto === "categories"
      ? data.categories.map((c) => mk(`a-c-${c.key}`, c.label, megaCategoryHref(c.key), { hoverImageKey: c.imageKey ?? null, imageKey: c.imageKey ?? null, count: c.count }))
      : b.auto === "collections"
        ? data.collections.map((c) => mk(`a-k-${c.slug}`, c.label, `/collection/${encodeURIComponent(c.slug)}`, { hoverImageKey: c.imageKey ?? null, imageKey: c.imageKey ?? null, count: c.count }))
        : data.tones.map((t) => mk(`a-t-${t.key}`, t.name, `/shop?tone=${encodeURIComponent(t.key)}`, { color: t.hex }));
  return [...manual, ...auto.slice(0, b.autoMax)];
}
/** ลิงก์ที่ id คงที่ (รายการอัตโนมัติ — กัน React key เปลี่ยนทุกครั้งที่วาด) */
const newMegaLinkFixed = (idv: string, label: string, href: string): MegaLink => ({ ...newMegaLink(label, href), id: idv });

/** 🔎 ตรวจลิงก์เสีย (ตอนจัดใน ERP) — คืนข้อความเตือน หรือ null */
export function megaLinkIssue(href: string, ctx: { categories: Set<string>; products: Set<string>; pages: Set<string>; collections?: Set<string> }): string | null {
  const h = href.trim();
  if (!h) return "ยังไม่ได้ใส่ลิงก์";
  const cat = /^\/c\/([^/?#]+)/.exec(h);
  if (cat) {
    if (!ctx.categories.has(decodeURIComponent(cat[1]))) return "หมวดนี้ไม่มีแล้ว";
    // ต้องอยู่ทั้ง 2 หมวด (?also=<หมวด>) — หมวดที่ 2 หายไปแล้ว = เตือน
    const also = /[?&]also=([^&#]+)/.exec(h);
    return also && !decodeURIComponent(also[1]).split(",").every((k) => ctx.categories.has(k)) ? "หมวดที่ 2 ไม่มีแล้ว" : null;
  }
  const prod = /^\/product\/([^/?#]+)/.exec(h);
  if (prod) return ctx.products.has(decodeURIComponent(prod[1]).toLowerCase()) ? null : "สินค้านี้ไม่ได้อยู่บนเว็บแล้ว";
  const col = /^\/collection\/([^/?#]+)/.exec(h);
  if (col && ctx.collections) return ctx.collections.has(decodeURIComponent(col[1])) ? null : "คอลเลกชันนี้ไม่มีแล้ว";
  const page = /^\/([a-z0-9-]+)$/i.exec(h);
  if (page && !["shop", "new", "cart", "contact", "about", "oem", "quote", "track", "account", "checkout", "gallery", "privacy"].includes(page[1].toLowerCase())) return ctx.pages.has(page[1]) ? null : "หน้านี้ไม่มีแล้ว";
  return null;
}
