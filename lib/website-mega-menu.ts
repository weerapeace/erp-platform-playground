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
 * ไอคอน: ชุดเส้นในตัว MEGA_ICONS (รูปทรงอ้างอิง Tabler Icons · MIT) หรืออัปโหลดรูปเอง (iconKey)
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
export type MegaRatio = "1:1" | "3:4" | "4:5" | "4:3" | "16:9";
export type MegaSort = "new" | "best" | "price-asc" | "price-desc" | "discount" | "random";
/** รายการลิงก์อัตโนมัติ: "" = ใส่เอง · หมวด/คอลเลกชัน/สี = ดึงจากข้อมูลร้าน (เพิ่มใหม่แล้วขึ้นเอง) */
export type MegaAuto = "" | "categories" | "collections" | "colors";

export interface MegaLink {
  id: string;
  label: string;
  href: string;
  /** คำอธิบายบรรทัดล่าง (แบบไอคอน/จุดสี/รูปเล็ก) */
  desc: string;
  /** ชื่อไอคอนในชุด MEGA_ICONS ("" = ไม่มี) */
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
  /** แบบแท็บ: การ์ดต่อแถว */
  cardsPerRow: number;
  /** ลิงก์ "ดูทั้งหมด" ท้ายแผง ("" = ไม่โชว์) */
  viewAllLabel: string;
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
}
export const DEFAULT_MENU_BEHAVIOR: MenuBehavior = { open: "hover", delay: 0, dim: false, mobileStyle: "accordion", mobileCats: false };
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

/** ไอคอนเส้น 24×24 (stroke) — d ของ <path> */
export const MEGA_ICONS: { key: string; label: string; d: string[] }[] = [
  { key: "bag", label: "ถุงช้อปปิ้ง", d: ["M6.331 8h11.339a2 2 0 0 1 1.977 2.304l-1.255 8.152a3 3 0 0 1 -2.966 2.544h-6.852a3 3 0 0 1 -2.965 -2.544l-1.255 -8.152a2 2 0 0 1 1.977 -2.304z", "M9 11v-5a3 3 0 0 1 6 0v5"] },
  { key: "handbag", label: "กระเป๋าถือ", d: ["M5 10h14l-1.2 9a2 2 0 0 1 -2 1.7h-7.6a2 2 0 0 1 -2 -1.7z", "M8.5 10v-1.5a3.5 3.5 0 0 1 7 0v1.5"] },
  { key: "briefcase", label: "กระเป๋าเอกสาร", d: ["M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z", "M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2", "M12 12v.01", "M3 13a20 20 0 0 0 18 0"] },
  { key: "backpack", label: "กระเป๋าเป้", d: ["M5 18v-6a6 6 0 0 1 6 -6h2a6 6 0 0 1 6 6v6a3 3 0 0 1 -3 3h-8a3 3 0 0 1 -3 -3z", "M10 6v-1a2 2 0 1 1 4 0v1", "M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4", "M11 10h2"] },
  { key: "luggage", label: "กระเป๋าเดินทาง", d: ["M6 8a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z", "M9 6v-1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v1", "M6 10h12", "M6 16h12", "M9 20v1", "M15 20v1"] },
  { key: "clutch", label: "คลัตช์/ซอง", d: ["M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z", "M3 7l9 6l9 -6"] },
  { key: "wallet", label: "กระเป๋าสตางค์", d: ["M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12", "M20 12v4h-4a2 2 0 0 1 0 -4h4"] },
  { key: "belt", label: "เข็มขัด", d: ["M2 10h20v4h-20z", "M13 8.5h5v7h-5z", "M15.5 12h4"] },
  { key: "laptop", label: "แล็ปท็อป", d: ["M3 19h18", "M5 7a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1z"] },
  { key: "world", label: "เดินทาง/ทั่วโลก", d: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M3.6 9h16.8", "M3.6 15h16.8", "M11.5 3a17 17 0 0 0 0 18", "M12.5 3a17 17 0 0 1 0 18"] },
  { key: "user", label: "คน/ผู้ใช้", d: ["M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0", "M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"] },
  { key: "shirt", label: "เสื้อผ้า", d: ["M15 4l6 2v5h-3v8a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1v-8h-3v-5l6 -2a3 3 0 0 0 6 0"] },
  { key: "gift", label: "ของขวัญ", d: ["M3 9a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1z", "M12 8v13", "M19 12v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-7", "M7.5 8a2.5 2.5 0 0 1 0 -5a4.8 8 0 0 1 4.5 5a4.8 8 0 0 1 4.5 -5a2.5 2.5 0 0 1 0 5"] },
  { key: "star", label: "ดาว/แนะนำ", d: ["M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z"] },
  { key: "heart", label: "หัวใจ", d: ["M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"] },
  { key: "tag", label: "ป้าย/ลดราคา", d: ["M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3z"] },
  { key: "diamond", label: "เพชร/พรีเมียม", d: ["M6 5h12l3 5l-8.5 9.5a.7 .7 0 0 1 -1 0l-8.5 -9.5l3 -5", "M10 12l-2 -2.2l.6 -1"] },
  { key: "leaf", label: "ใบไม้/วัสดุธรรมชาติ", d: ["M5 21c.5 -4.5 2.5 -8 7 -10", "M9 18c6.218 0 10.5 -3.288 11 -12v-2h-4.014c-9 0 -11.986 4 -12 9c0 1 0 3 2 5h3z"] },
  { key: "droplet", label: "หยดน้ำ/กันน้ำ", d: ["M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546z"] },
  { key: "sparkles", label: "ใหม่/วิบวับ", d: ["M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z"] },
];
const ICON_KEYS = new Set(MEGA_ICONS.map((i) => i.key));

/* ───────── ตัวสร้างค่าใหม่ ───────── */
const rid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const newMegaLink = (label = "ลิงก์ใหม่", href = ""): MegaLink => ({ id: rid("l"), label, href, desc: "", icon: "", iconKey: null, color: "", imageKey: null, badge: "", hoverImageKey: null, bold: false, textColor: "", showFrom: "", showUntil: "" });
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

/** แผงตั้งต้นจากแม่แบบ — เติมหมวดของร้านให้เลย (แก้ต่อได้ทุกอย่าง) */
export function megaPreset(template: MegaTemplate, ctx: { categories: { key: string; label: string; imageKey?: string | null }[] }): MegaPanel {
  const cats = ctx.categories.slice(0, 8);
  const base: MegaPanel = { template, layout: template === "C" ? "tabs" : "columns", blocks: [], tabs: [], cardsPerRow: 4, viewAllLabel: "", width: "full", bg: "", divider: false, promo: "", promoHref: "", mobileHideMedia: false };
  if (template === "A") {
    const list = newMegaBlock("links", "");
    list.links = [newMegaLink("ดูทั้งหมด", "/shop"), newMegaLink("มาใหม่", "/shop?sort=new"), ...cats.map((c) => newMegaLink(c.label, megaCategoryHref(c.key)))];
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
    byType.links = cats.slice(0, 6).map((c, i) => ({ ...newMegaLink(c.label, megaCategoryHref(c.key)), icon: ["handbag", "backpack", "briefcase", "luggage", "clutch", "wallet"][i % 6] }));
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
  const label = str(r.label, 60);
  if (!label) return null;
  return {
    id: id(r.id, "l", i),
    label,
    href: cleanHref(r.href),
    desc: str(r.desc, 120),
    icon: typeof r.icon === "string" && ICON_KEYS.has(r.icon) ? r.icon : "",
    iconKey: key(r.iconKey),
    color: hex(r.color),
    imageKey: key(r.imageKey),
    badge: str(r.badge, 20),
    hoverImageKey: key(r.hoverImageKey),
    bold: r.bold === true,
    textColor: hex(r.textColor),
    showFrom: when(r.showFrom),
    showUntil: when(r.showUntil),
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
    cardsPerRow: int(r.cardsPerRow, 4, MEGA_LIMITS.cardsPerRow[0], MEGA_LIMITS.cardsPerRow[1]),
    viewAllLabel: str(r.viewAllLabel, 40),
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
  return p.blocks.some((b) => (b.kind === "links" ? b.links.length > 0 : b.kind === "groups" ? b.groups.length > 0 : b.kind === "cards" ? b.cards.length > 0 : b.kind === "feature" ? !!b.imageKey || !!b.caption : true));
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
  collections: { slug: string; label: string; imageKey?: string | null; count?: number }[];
  tones: { key: string; name: string; hex: string }[];
}
/** รายการลิงก์ของกล่อง = ที่ใส่เอง (ตามเวลาแสดง) + อัตโนมัติต่อท้าย · count = จำนวนสินค้า (ถ้ารู้) */
export function megaBlockLinks(b: Pick<MegaBlock, "links" | "auto" | "autoMax">, data: MegaAutoData | null, now = Date.now()): (MegaLink & { count?: number })[] {
  const manual = b.links.filter((l) => inShowWindow(l.showFrom, l.showUntil, now));
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
  if (cat) return ctx.categories.has(decodeURIComponent(cat[1])) ? null : "หมวดนี้ไม่มีแล้ว";
  const prod = /^\/product\/([^/?#]+)/.exec(h);
  if (prod) return ctx.products.has(decodeURIComponent(prod[1]).toLowerCase()) ? null : "สินค้านี้ไม่ได้อยู่บนเว็บแล้ว";
  const col = /^\/collection\/([^/?#]+)/.exec(h);
  if (col && ctx.collections) return ctx.collections.has(decodeURIComponent(col[1])) ? null : "คอลเลกชันนี้ไม่มีแล้ว";
  const page = /^\/([a-z0-9-]+)$/i.exec(h);
  if (page && !["shop", "contact", "about", "oem", "quote", "track", "account", "checkout", "gallery", "privacy"].includes(page[1].toLowerCase())) return ctx.pages.has(page[1]) ? null : "หน้านี้ไม่มีแล้ว";
  return null;
}
