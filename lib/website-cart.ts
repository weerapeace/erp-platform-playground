/**
 * 🛒 ดีไซน์ตะกร้า (theme.cart) — ตั้งในแท็บดีไซน์ → 🛒 ตะกร้า · pure · ไม่มี import
 *   ⚠️ มิเรอร์ทั้งไฟล์ไป storefront src/lib/cart-config.ts — แก้ที่นี่แล้วคัดลอก
 * เว็บร้านวาดที่ components/cart/* (ลิ้นชัก + หน้า /cart ใช้ตัววาดเดียวกัน)
 * ค่าเริ่มต้น = หน้าตาเดิมของตะกร้า (ลิ้นชักขวา · ปุ่มดำเนินการสั่งซื้อ · แถบส่งฟรี · ล้างตะกร้า) — ฟังก์ชันใหม่ปิดไว้
 */
export type CartStyle = "drawer-right" | "drawer-left" | "modal";
/**
 * auto อัตโนมัติ · featured ที่ติ๊กแนะนำ · manual เลือกเอง · category สินค้าในหมวดที่เลือก (cats)
 * recent ดูล่าสุด (เครื่องลูกค้า) · wishlist รายการโปรด (สมาชิก) · bought ซื้อคู่กันบ่อย (จากออเดอร์จริง)
 */
export type CartRecsSource = "auto" | "featured" | "manual" | "category" | "recent" | "wishlist" | "bought";
/** ตำแหน่งสินค้าแนะนำ: บนสุด · ต่อจากรายการสินค้า · ท้ายรายการ (เดิม) · ติดเหนือยอดรวม (เห็นตลอด) */
export type CartRecsPos = "top" | "afterItems" | "bottom" | "footer";
/** หน้าตาสินค้าแนะนำ: row เลื่อนข้าง · grid ตาราง · list แถวรายการ · addon ติ๊กเพิ่ม */
export type CartRecsLayout = "row" | "grid" | "list" | "addon";
/** ตำแหน่งของชุดสินค้าแนะนำ = CartRecsPos (บนสุด · ต่อจากรายการ · ท้ายรายการ เดิม · ติดเหนือยอดรวม) */
export type CartRecsPlace = CartRecsPos;
/** โชว์เมื่อ: always ทุกครั้ง (เดิม) · items เฉพาะมีของในตะกร้า · empty เฉพาะตะกร้าว่าง */
export type CartRecsWhen = "always" | "items" | "empty";
/** 🛍 สินค้าแนะนำ 1 ชุด (ตั้งได้สูงสุด 3 ชุด · แต่ละชุดตั้งที่มา/หัวข้อ/หน้าตา/ตำแหน่งเอง) */
export interface CartRecsSet {
  id: string;
  on: boolean;
  title: string;
  source: CartRecsSource;
  codes: string[];
  /** source = category: หมวดที่ดึงสินค้ามาแนะนำ (รหัสหมวดเว็บ) */
  cats: string[];
  /** 🎯 โชว์ชุดนี้เฉพาะเมื่อในตะกร้ามีสินค้าในหมวดเหล่านี้ (ว่าง = ไม่มีเงื่อนไข) — เช่น มีกระเป๋า → แนะนำของแต่งกระเป๋า */
  ifCats: string[];
  /** 🗂 แท็บเพิ่ม (ที่มาอื่นในชุดเดียวกัน) — มี = โชว์แท็บสลับ [source, ...tabs] · แท็บที่ไม่มีของ (เช่น ยังไม่เคยดู) ซ่อนเอง */
  tabs: CartRecsSource[];
  limit: number;
  /** ยอดยังไม่ถึงส่งฟรี → ดันสินค้าที่ราคาพอดีขึ้นก่อน */
  freeShip: boolean;
  /** หน้าตาในลิ้นชัก/หน้าต่าง */
  layout: CartRecsLayout;
  /** หน้าตาในหน้า /cart */
  pageLayout: CartRecsLayout;
  place: CartRecsPlace;
  when: CartRecsWhen;
  /** คอลัมน์ตาราง (หน้า /cart บนคอม) · 0 = อัตโนมัติ 2/4/6 ตามจอ (เดิม) */
  cols: number;
  imageSize: "sm" | "md" | "lg";
  imageShape: "rounded" | "square" | "circle";
  showName: boolean;
  showPrice: boolean;
  showCompare: boolean;
  /** ข้อความปุ่ม ("" = "+ ใส่ตะกร้า") */
  btnText: string;
  /** outline ขอบมน (เดิม) · brand ทึบสีแบรนด์ · text ข้อความ */
  btnStyle: "outline" | "brand" | "text";
}
/** ✨ ไอคอนของตัวเลือกในตะกร้า (อีโมจิ · "" = ไม่มีไอคอน) */
export interface CartIcons {
  coupon: string;
  gift: string;
  card: string;
  note: string;
  points: string;
  eta: string;
}
/** ✨ ข้อความของตัวเลือกในตะกร้า ("" = ข้อความเริ่มต้น / ชื่อบริการในข้อมูลร้าน) */
export interface CartLabels {
  gift: string;
  card: string;
  note: string;
}
export interface CartTrustItem {
  icon: string;
  text: string;
}
/** 🎀 ห่อของขวัญ/การ์ด: order = ทั้งออเดอร์ (เดิม) · item = เลือกรายชิ้นในตะกร้า (ค่าห่อ × จำนวนชิ้น · การ์ด 1 ใบ/รายการ) */
export type CartGiftMode = "order" | "item";
/** หน้า /cart: classic = แบบเดิม · split = แยกรายการ (ป้ายหมวด · ไอคอนท้ายแถว) + กล่องสรุปขวาแบบตาราง */
export type CartPageLayout = "classic" | "split";
/** ปุ่มไปหน้า /cart ในลิ้นชัก: auto = ลิงก์เล็กเฉพาะตอนตั้งกดไอคอนแล้วไปหน้าเต็ม (เดิม) · button ปุ่มเต็ม · link ลิงก์เล็กเสมอ · none ไม่มี */
export type CartPageBtn = "auto" | "button" | "link" | "none";
export interface CartConfig {
  /* ── หน้าตา ── */
  /** ลิ้นชักขวา (เดิม) · ลิ้นชักซ้าย · หน้าต่างกลางจอ */
  style: CartStyle;
  /** ความกว้างลิ้นชัก/หน้าต่าง */
  width: "sm" | "md" | "lg";
  title: string;
  /** กดไอคอนตะกร้าที่หัวเว็บ: เปิดลิ้นชัก (เดิม) / ไปหน้า /cart */
  openMode: "drawer" | "page";
  /* ── 🧾 หน้าตะกร้าเต็มหน้า (/cart) ── */
  pageLayout: CartPageLayout;
  /** ปุ่มในลิ้นชักพาไปหน้า /cart */
  pageBtn: CartPageBtn;
  /** ข้อความปุ่ม ("" = "ดูตะกร้าเต็มหน้า") */
  pageBtnText: string;
  /** ☑ ติ๊กเลือกชิ้นที่จะชำระ (ไม่ติ๊ก = ยังอยู่ในตะกร้า ไม่ไปหน้าชำระเงิน) */
  select: boolean;
  /** ป้ายหมวดเล็กเหนือชื่อสินค้า */
  showCategory: boolean;
  /** เปลี่ยนสี/ไซส์ในตะกร้าได้ (dropdown) */
  changeOption: boolean;
  /** 🔤 สลักชื่อในตะกร้า (เฉพาะรุ่นที่เปิดปั๊มชื่อไว้) */
  personalize: boolean;
  /** ปุ่ม "เข้าสู่ระบบสมาชิก" ใต้ปุ่มสั่งซื้อ (ต้องเปิดระบบสมาชิก · ยังไม่เข้าสู่ระบบเท่านั้น) */
  memberBtn: boolean;
  /** 🎀 ห่อของขวัญ/การ์ด ทั้งออเดอร์ / รายชิ้น */
  giftMode: CartGiftMode;
  /** 🔗 "เข้าชุดกับชิ้นนี้" ใต้แต่ละรายการ (สินค้าเกี่ยวข้องที่ตั้งรายรุ่น → กฎหน้าสินค้า) */
  lineRelated: boolean;
  /** จำนวนต่อรายการ 1–4 */
  lineRelatedCount: number;
  /** หัวข้อ ("" = "เข้าชุดกับชิ้นนี้") */
  lineRelatedTitle: string;
  /** โชว์ในลิ้นชักด้วย (ปิด = หน้า /cart อย่างเดียว) */
  lineRelatedDrawer: boolean;
  /** 🏷 ป้าย "ซื้อคู่ลดเพิ่ม ฿X" บนการ์ดสินค้าแนะนำ (ใส่ชิ้นนี้แล้วโปรที่ตั้งไว้ลดเพิ่ม) */
  recsPromoBadge: boolean;
  /* ── รายการสินค้า ── */
  imageSize: "sm" | "md" | "lg";
  imageShape: "rounded" | "square" | "circle";
  imageFit: "cover" | "contain";
  showOptions: boolean;
  /** ราคาต่อชิ้น (ใต้ชื่อ) */
  showUnitPrice: boolean;
  /** ราคาเต็มขีดฆ่า + "ประหยัด ฿X" */
  showCompare: boolean;
  /** ♡ ย้ายไปรายการโปรด (เอาออกจากตะกร้า + เก็บในรายการโปรด) */
  wishlist: boolean;
  /* ── ตอนว่าง ── */
  emptyText: string;
  emptyButton: string;
  /* ── ท้ายตะกร้า ── */
  checkoutText: string;
  /** ปุ่ม "เลือกซื้อต่อ" ("" = ไม่โชว์) */
  continueText: string;
  showClear: boolean;
  noteText: string;
  freeShip: boolean;
  /** {amount} = ยอดที่ขาด */
  freeShipText: string;
  freeShipDone: string;
  /* ── 🛍 สินค้าแนะนำ ── */
  /** ชุดสินค้าแนะนำ (≤ 3) — ตัวจริงที่เว็บร้านใช้ · ช่อง recs* ข้างล่าง = สำเนาของชุดแรก (ให้เว็บรุ่นเก่ายังอ่านได้) */
  recsSets: CartRecsSet[];
  recs: boolean;
  recsTitle: string;
  /** auto = หมวดเดียวกับในตะกร้า + แนะนำ/ขายดี · featured = เฉพาะที่ติ๊กแนะนำ · manual = เลือกเอง (codes) */
  recsSource: CartRecsSource;
  recsCodes: string[];
  recsLimit: number;
  /** ยอดยังไม่ถึงส่งฟรี → ดันสินค้าที่ราคาพอดีให้ถึงส่งฟรีขึ้นก่อน */
  recsFreeShip: boolean;
  /** อยู่ตรงไหนในตะกร้า (ลิ้นชัก + หน้า /cart) */
  recsPos: CartRecsPos;
  /* ── ฟังก์ชันเพิ่ม ── */
  /** ช่องโค้ดส่วนลด (จำไปใช้ตอนชำระเงิน) */
  coupon: boolean;
  /** สมาชิก: "จะได้ N แต้ม" */
  points: boolean;
  /** 🎀 ห่อของขวัญ (ต้องเปิดห่อของขวัญในข้อมูลร้านด้วย) */
  gift: boolean;
  /** 📝 หมายเหตุถึงร้าน (ไปต่อหน้าชำระเงิน) */
  note: boolean;
  /** 💌 เขียนการ์ดในตะกร้า (ต้องเปิด "ขายการ์ดอวยพรแยก" ในข้อมูลร้าน) */
  card: boolean;
  icons: CartIcons;
  labels: CartLabels;
  /** แถบความมั่นใจใต้ปุ่มสั่งซื้อ */
  trust: boolean;
  trustItems: CartTrustItem[];
  /** 🚚 วันที่คาดว่าได้รับ (นับวันทำการ จ.–ศ.) */
  eta: boolean;
  etaMin: number;
  etaMax: number;
  /** {from} {to} = วันที่ */
  etaText: string;
}

export const DEFAULT_TRUST_ITEMS: CartTrustItem[] = [
  { icon: "🔒", text: "ชำระเงินปลอดภัย" },
  { icon: "🚚", text: "จัดส่งไว" },
  { icon: "↩️", text: "เปลี่ยนสินค้าได้" },
];

export const DEFAULT_CART_ICONS: CartIcons = { coupon: "🎟️", gift: "🎀", card: "💌", note: "📝", points: "⭐", eta: "🚚" };
export const DEFAULT_CART_LABELS: CartLabels = { gift: "", card: "", note: "" };
/** ชุดแนะนำเริ่มต้น = หน้าตาเดิม (ลิ้นชักเลื่อนข้าง · หน้า /cart ตาราง · ใต้รายการ · ทุกครั้ง) */
export const DEFAULT_RECS_SET: CartRecsSet = {
  id: "s1",
  on: false,
  title: "คุณอาจชอบ",
  source: "auto",
  codes: [],
  cats: [],
  ifCats: [],
  tabs: [],
  limit: 6,
  freeShip: true,
  layout: "row",
  pageLayout: "grid",
  place: "bottom",
  when: "always",
  cols: 0,
  imageSize: "md",
  imageShape: "rounded",
  showName: true,
  showPrice: true,
  showCompare: true,
  btnText: "",
  btnStyle: "outline",
};
export const MAX_RECS_SETS = 3;

export const DEFAULT_CART: CartConfig = {
  style: "drawer-right",
  width: "md",
  title: "ตะกร้า",
  openMode: "drawer",
  pageLayout: "classic",
  pageBtn: "auto",
  pageBtnText: "",
  select: false,
  showCategory: false,
  changeOption: false,
  personalize: false,
  memberBtn: false,
  giftMode: "order",
  lineRelated: false,
  lineRelatedCount: 3,
  lineRelatedTitle: "",
  lineRelatedDrawer: false,
  recsPromoBadge: false,
  imageSize: "md",
  imageShape: "rounded",
  imageFit: "cover",
  showOptions: true,
  showUnitPrice: false,
  showCompare: false,
  wishlist: false,
  emptyText: "ยังไม่มีสินค้าในตะกร้า",
  emptyButton: "",
  checkoutText: "ดำเนินการสั่งซื้อ",
  continueText: "",
  showClear: true,
  noteText: "ยังไม่รวมค่าจัดส่ง · คำนวณตอนชำระเงิน",
  freeShip: true,
  freeShipText: "อีก {amount} ส่งฟรี",
  freeShipDone: "🎉 ได้ส่งฟรีแล้ว",
  recsSets: [{ ...DEFAULT_RECS_SET }],
  recs: false,
  recsTitle: "คุณอาจชอบ",
  recsSource: "auto",
  recsCodes: [],
  recsLimit: 6,
  recsFreeShip: true,
  recsPos: "bottom",
  coupon: false,
  points: false,
  gift: false,
  note: false,
  card: false,
  icons: { ...DEFAULT_CART_ICONS },
  labels: { ...DEFAULT_CART_LABELS },
  trust: false,
  trustItems: DEFAULT_TRUST_ITEMS,
  eta: false,
  etaMin: 2,
  etaMax: 4,
  etaText: "ได้รับประมาณ {from} – {to}",
};

export const CART_STYLES: { value: CartStyle; label: string }[] = [
  { value: "drawer-right", label: "ลิ้นชักขวา (เดิม)" },
  { value: "drawer-left", label: "ลิ้นชักซ้าย" },
  { value: "modal", label: "หน้าต่างกลางจอ" },
];
export const CART_WIDTHS: { value: CartConfig["width"]; label: string; px: number }[] = [
  { value: "sm", label: "แคบ", px: 380 },
  { value: "md", label: "กลาง (เดิม)", px: 448 },
  { value: "lg", label: "กว้าง", px: 560 },
];
export const CART_IMAGE_SIZES: { value: CartConfig["imageSize"]; label: string; px: number }[] = [
  { value: "sm", label: "เล็ก", px: 52 },
  { value: "md", label: "กลาง (เดิม)", px: 64 },
  { value: "lg", label: "ใหญ่", px: 88 },
];
export const CART_RECS_POSITIONS: { value: CartRecsPos; label: string; hint: string }[] = [
  { value: "top", label: "บนสุด", hint: "เห็นก่อนรายการสินค้า — ตะกร้าว่างก็ขึ้นบนสุด" },
  { value: "afterItems", label: "ต่อจากรายการสินค้า", hint: "อยู่ก่อนโค้ดส่วนลด / หมายเหตุ / ห่อของขวัญ" },
  { value: "bottom", label: "ท้ายรายการ (แบบเดิม)", hint: "ต่อจากโค้ดส่วนลด / หมายเหตุ — ต้องเลื่อนลงถึงจะเห็น" },
  { value: "footer", label: "ติดเหนือยอดรวม", hint: "เห็นตลอดไม่ต้องเลื่อน (การ์ดเล็กลง) · หน้า /cart = ใต้กล่องยอดรวม" },
];
export const CART_RECS_LAYOUTS: { value: CartRecsLayout; label: string; hint: string }[] = [
  { value: "row", label: "เลื่อนข้าง", hint: "การ์ดรูปเรียงแถวเดียว ปัดดูได้" },
  { value: "grid", label: "ตาราง", hint: "การ์ดรูปหลายคอลัมน์" },
  { value: "list", label: "แถวรายการ", hint: "รูปเล็ก + ชื่อ + ราคา + ปุ่ม เรียงลงมา" },
  { value: "addon", label: "ติ๊กเพิ่ม", hint: "ช่องติ๊ก \"เพิ่ม +฿X\" — เหมาะกับของซื้อคู่ (ติ๊ก = ใส่ตะกร้า · เอาติ๊กออก = เอาออก)" },
];
export const CART_RECS_WHENS: { value: CartRecsWhen; label: string }[] = [
  { value: "always", label: "ทุกครั้ง (เดิม)" },
  { value: "items", label: "เฉพาะมีของในตะกร้า" },
  { value: "empty", label: "เฉพาะตะกร้าว่าง" },
];

export const CART_RECS_SOURCES: { value: CartRecsSource; label: string; hint: string }[] = [
  { value: "auto", label: "อัตโนมัติ", hint: "หมวดเดียวกับของในตะกร้า + ที่ติ๊กแนะนำ/ขายดี (ไม่ซ้ำของในตะกร้า)" },
  { value: "featured", label: "เฉพาะที่ติ๊กแนะนำ", hint: "สินค้าที่ติ๊ก ⭐ แนะนำในหน้าสินค้าบนเว็บ" },
  { value: "manual", label: "เลือกเอง", hint: "เลือกรุ่นที่จะโชว์ (เรียงตามที่เลือก)" },
  { value: "category", label: "ตามหมวด", hint: "สินค้าในหมวดที่เลือก (เช่น ของแต่งกระเป๋า) — แนะนำ/ขายดีขึ้นก่อน" },
  { value: "recent", label: "ดูล่าสุด", hint: "สินค้าที่ลูกค้าคนนั้นเปิดดูแล้วยังไม่ได้ซื้อ (จำในเครื่องลูกค้า · ยังไม่เคยดู = ไม่โชว์)" },
  { value: "wishlist", label: "รายการโปรด", hint: "สินค้าที่สมาชิกกด ♡ ไว้ (ต้องเปิดระบบสมาชิก · ยังไม่เข้าสู่ระบบ = ไม่โชว์)" },
  { value: "bought", label: "ซื้อคู่กันบ่อย", hint: "จากออเดอร์จริงที่มีของในตะกร้า (ออเดอร์ยังน้อย = อาจว่าง)" },
];
/** ชื่อแท็บเริ่มต้นของแต่ละที่มา (ไทย/อังกฤษ) */
export const CART_TAB_LABELS: Record<CartRecsSource, [string, string]> = {
  auto: ["แนะนำ", "For you"],
  featured: ["แนะนำ", "Featured"],
  manual: ["คัดมาให้", "Picks"],
  category: ["ของเข้าชุด", "Add-ons"],
  recent: ["ดูล่าสุด", "Recently viewed"],
  wishlist: ["รายการโปรด", "Wishlist"],
  bought: ["ซื้อคู่กันบ่อย", "Bought together"],
};
export const CART_PAGE_LAYOUTS: { value: CartPageLayout; label: string; hint: string }[] = [
  { value: "classic", label: "แบบเดิม", hint: "รายการซ้าย · ยอดรวมขวา" },
  { value: "split", label: "แยกรายการ + สรุปขวา", hint: "ป้ายหมวด · ราคาชิดขวา · ไอคอนโปรด/ลบท้ายแถว · กล่องสรุปแบบตาราง" },
];
export const CART_PAGE_BTNS: { value: CartPageBtn; label: string }[] = [
  { value: "auto", label: "อัตโนมัติ (เดิม)" },
  { value: "button", label: "ปุ่มเต็ม" },
  { value: "link", label: "ลิงก์เล็ก" },
  { value: "none", label: "ไม่มี" },
];

const one = <T extends string>(v: unknown, all: readonly T[], fb: T): T => (typeof v === "string" && (all as readonly string[]).includes(v) ? (v as T) : fb);
const str = (v: unknown, fb: string, max: number) => (typeof v === "string" ? v.slice(0, max) : fb);
const bool = (v: unknown, fb: boolean) => (typeof v === "boolean" ? v : fb);
const int = (v: unknown, fb: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fb;
};

const codesOf = (v: unknown) =>
  Array.isArray(v) ? [...new Set((v as unknown[]).map((c) => String(c ?? "").trim().toUpperCase()).filter((c) => /^[A-Z0-9._-]{1,40}$/.test(c)))].slice(0, 24) : [];
const iconOf = (v: unknown, fb: string) => (typeof v === "string" ? v.trim().slice(0, 8) : fb);
/** รหัสหมวดเว็บ (ตัวเล็ก ตัวเลข ขีด) ≤ 20 หมวด */
const catsOf = (v: unknown) =>
  Array.isArray(v) ? [...new Set((v as unknown[]).map((c) => String(c ?? "").trim().toLowerCase()).filter((c) => /^[a-z0-9-]{1,40}$/.test(c)))].slice(0, 20) : [];

const SOURCES = ["auto", "featured", "manual", "category", "recent", "wishlist", "bought"] as const;

/** ชุดสินค้าแนะนำ 1 ชุด — ค่าแปลก/ไม่ได้ตั้ง = ค่าเริ่ม (หน้าตาเดิม) */
export function normalizeRecsSet(raw: unknown, i = 0): CartRecsSet {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_RECS_SET;
  const L = ["row", "grid", "list", "addon"] as const;
  const id = typeof r.id === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(r.id) ? r.id : `s${i + 1}`;
  return {
    id,
    on: bool(r.on, d.on),
    title: str(r.title, d.title, 40).trim(),
    source: one(r.source, SOURCES, d.source),
    codes: codesOf(r.codes),
    cats: catsOf(r.cats),
    ifCats: catsOf(r.ifCats),
    tabs: Array.isArray(r.tabs) ? [...new Set((r.tabs as unknown[]).filter((x): x is CartRecsSource => (SOURCES as readonly unknown[]).includes(x)))].filter((x) => x !== r.source).slice(0, 3) : [],
    limit: int(r.limit, d.limit, 1, 12),
    freeShip: bool(r.freeShip, d.freeShip),
    layout: one(r.layout, L, d.layout),
    pageLayout: one(r.pageLayout, L, d.pageLayout),
    place: one(r.place, ["top", "afterItems", "bottom", "footer"] as const, d.place),
    when: one(r.when, ["always", "items", "empty"] as const, d.when),
    cols: [0, 2, 3, 4, 5, 6].includes(Number(r.cols)) ? Number(r.cols) : d.cols,
    imageSize: one(r.imageSize, ["sm", "md", "lg"] as const, d.imageSize),
    imageShape: one(r.imageShape, ["rounded", "square", "circle"] as const, d.imageShape),
    showName: bool(r.showName, d.showName),
    showPrice: bool(r.showPrice, d.showPrice),
    showCompare: bool(r.showCompare, d.showCompare),
    btnText: str(r.btnText, d.btnText, 30).trim(),
    btnStyle: one(r.btnStyle, ["outline", "brand", "text"] as const, d.btnStyle),
  };
}

export function normalizeCart(raw: unknown): CartConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CART;
  // 🛍 ชุดสินค้าแนะนำ — ข้อมูลเก่า (ยังไม่มี recsSets) = ชุดเดียวจากช่อง recs* เดิม
  const setsRaw = Array.isArray(r.recsSets) ? (r.recsSets as unknown[]) : null;
  const recsSets = setsRaw
    ? setsRaw.slice(0, MAX_RECS_SETS).map((x, i) => normalizeRecsSet(x, i))
    : [
        normalizeRecsSet({
          on: r.recs,
          title: typeof r.recsTitle === "string" && r.recsTitle.trim() ? r.recsTitle : d.recsTitle,
          source: r.recsSource,
          codes: r.recsCodes,
          limit: r.recsLimit,
          freeShip: r.recsFreeShip,
          place: r.recsPos,
        }),
      ];
  // id ซ้ำ (ก๊อปมา) → เติมเลข
  const seen = new Set<string>();
  for (const [i, x] of recsSets.entries()) {
    if (seen.has(x.id)) x.id = `s${i + 1}x`;
    seen.add(x.id);
  }
  const first = recsSets[0];
  const ic = (r.icons && typeof r.icons === "object" ? r.icons : {}) as Record<string, unknown>;
  const lb = (r.labels && typeof r.labels === "object" ? r.labels : {}) as Record<string, unknown>;
  const etaMin = int(r.etaMin, d.etaMin, 0, 60);
  const trustRaw = Array.isArray(r.trustItems) ? (r.trustItems as unknown[]) : null;
  const trustItems = trustRaw
    ? trustRaw
        .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
        .map((x) => ({ icon: str(x.icon, "", 8).trim(), text: str(x.text, "", 60).trim() }))
        .filter((x) => x.text)
        .slice(0, 4)
    : d.trustItems.map((x) => ({ ...x }));
  return {
    style: one(r.style, ["drawer-right", "drawer-left", "modal"] as const, d.style),
    width: one(r.width, ["sm", "md", "lg"] as const, d.width),
    title: str(r.title, d.title, 40).trim() || d.title,
    openMode: one(r.openMode, ["drawer", "page"] as const, d.openMode),
    pageLayout: one(r.pageLayout, ["classic", "split"] as const, d.pageLayout),
    pageBtn: one(r.pageBtn, ["auto", "button", "link", "none"] as const, d.pageBtn),
    pageBtnText: str(r.pageBtnText, d.pageBtnText, 40).trim(),
    select: bool(r.select, d.select),
    showCategory: bool(r.showCategory, d.showCategory),
    changeOption: bool(r.changeOption, d.changeOption),
    personalize: bool(r.personalize, d.personalize),
    memberBtn: bool(r.memberBtn, d.memberBtn),
    giftMode: one(r.giftMode, ["order", "item"] as const, d.giftMode),
    lineRelated: bool(r.lineRelated, d.lineRelated),
    lineRelatedCount: int(r.lineRelatedCount, d.lineRelatedCount, 1, 4),
    lineRelatedTitle: str(r.lineRelatedTitle, d.lineRelatedTitle, 40).trim(),
    lineRelatedDrawer: bool(r.lineRelatedDrawer, d.lineRelatedDrawer),
    recsPromoBadge: bool(r.recsPromoBadge, d.recsPromoBadge),
    imageSize: one(r.imageSize, ["sm", "md", "lg"] as const, d.imageSize),
    imageShape: one(r.imageShape, ["rounded", "square", "circle"] as const, d.imageShape),
    imageFit: one(r.imageFit, ["cover", "contain"] as const, d.imageFit),
    showOptions: bool(r.showOptions, d.showOptions),
    showUnitPrice: bool(r.showUnitPrice, d.showUnitPrice),
    showCompare: bool(r.showCompare, d.showCompare),
    wishlist: bool(r.wishlist, d.wishlist),
    emptyText: str(r.emptyText, d.emptyText, 120).trim() || d.emptyText,
    emptyButton: str(r.emptyButton, d.emptyButton, 40).trim(),
    checkoutText: str(r.checkoutText, d.checkoutText, 40).trim() || d.checkoutText,
    continueText: str(r.continueText, d.continueText, 40).trim(),
    showClear: bool(r.showClear, d.showClear),
    noteText: str(r.noteText, d.noteText, 120),
    freeShip: bool(r.freeShip, d.freeShip),
    freeShipText: str(r.freeShipText, d.freeShipText, 80).trim() || d.freeShipText,
    freeShipDone: str(r.freeShipDone, d.freeShipDone, 80).trim() || d.freeShipDone,
    recsSets,
    // สำเนาชุดแรก (เว็บร้านรุ่นเก่าอ่านช่องพวกนี้)
    recs: first ? first.on : false,
    recsTitle: first?.title || d.recsTitle,
    recsSource: first?.source ?? d.recsSource,
    recsCodes: first?.codes ?? [],
    recsLimit: first?.limit ?? d.recsLimit,
    recsFreeShip: first?.freeShip ?? d.recsFreeShip,
    recsPos: first?.place ?? d.recsPos,
    coupon: bool(r.coupon, d.coupon),
    points: bool(r.points, d.points),
    gift: bool(r.gift, d.gift),
    note: bool(r.note, d.note),
    card: bool(r.card, d.card),
    icons: {
      coupon: iconOf(ic.coupon, d.icons.coupon),
      gift: iconOf(ic.gift, d.icons.gift),
      card: iconOf(ic.card, d.icons.card),
      note: iconOf(ic.note, d.icons.note),
      points: iconOf(ic.points, d.icons.points),
      eta: iconOf(ic.eta, d.icons.eta),
    },
    labels: { gift: str(lb.gift, "", 60).trim(), card: str(lb.card, "", 60).trim(), note: str(lb.note, "", 60).trim() },
    trust: bool(r.trust, d.trust),
    trustItems,
    eta: bool(r.eta, d.eta),
    etaMin,
    etaMax: Math.max(etaMin, int(r.etaMax, d.etaMax, 0, 90)),
    etaText: str(r.etaText, d.etaText, 80).trim() || d.etaText,
  };
}

/** ชุดสินค้าแนะนำที่ต้องวาดตรงตำแหน่งนี้ (เปิดอยู่ · ตรงตำแหน่ง · ตรงสถานะตะกร้า) */
export function recsAt(cfg: Pick<CartConfig, "recsSets">, place: CartRecsPlace, hasItems: boolean, cartCats?: string[]): CartRecsSet[] {
  // ตะกร้าว่าง: ไม่มีรายการ/ยอดรวม → "ต่อจากรายการ" กับ "ติดเหนือยอดรวม" ไปอยู่ท้ายรายการ
  const at = (x: CartRecsSet) => (!hasItems && (x.place === "afterItems" || x.place === "footer") ? "bottom" : x.place);
  return cfg.recsSets.filter((x) => x.on && at(x) === place && (x.when === "always" || (x.when === "items" ? hasItems : !hasItems)) && recsSetFits(x, cartCats));
}

/** 🎯 ชุดนี้เข้าเงื่อนไข "ในตะกร้ามีหมวด…" ไหม (ไม่ตั้งเงื่อนไข = ผ่าน · ไม่ส่งหมวดในตะกร้ามา = ผ่าน) — cartCats ควรรวมหมวดแม่แล้ว */
export function recsSetFits(set: Pick<CartRecsSet, "ifCats">, cartCats?: string[]): boolean {
  if (!set.ifCats.length || !cartCats) return true;
  return set.ifCats.some((c) => cartCats.includes(c));
}

/** ข้อความส่งฟรี: แทน {amount} */
export const freeShipLine = (tpl: string, amount: string) => tpl.split("{amount}").join(amount);

/** บวกวันทำการ (ข้ามเสาร์-อาทิตย์) */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d;
}
/** "ได้รับประมาณ 20 ต.ค. – 22 ต.ค." */
export function etaLine(cfg: Pick<CartConfig, "etaMin" | "etaMax" | "etaText">, now = new Date()): string {
  const fmt = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  return cfg.etaText.split("{from}").join(fmt(addBusinessDays(now, cfg.etaMin))).split("{to}").join(fmt(addBusinessDays(now, cfg.etaMax)));
}

/**
 * 🛍 เลือกสินค้าแนะนำในตะกร้า (pure — เว็บร้านเรียกฝั่งเซิร์ฟเวอร์)
 *   ไม่ซ้ำของในตะกร้า · ข้ามสินค้าหมด/ไม่มีราคา · recsFreeShip: ยอดยังไม่ถึงส่งฟรี → ตัวที่ราคา ≥ ยอดที่ขาด (ใกล้สุด) ขึ้นก่อน
 *   remain = ยอดที่ขาดถึงส่งฟรี (หน่วยเดียวกับ price — เว็บร้านเป็นสตางค์)
 */
export interface RecProduct {
  id: string;
  code?: string;
  slug?: string;
  /** รหัสรุ่นที่ซื้อคู่กันบ่อย (ERP นับจากออเดอร์จริง) */
  boughtWith?: string[];
  price: number;
  category?: string;
  categories?: string[];
  featured?: boolean;
  salesRank?: number | null;
  stock?: string;
}
export function pickCartRecs<P extends RecProduct>(
  all: P[],
  inCart: string[],
  cfg: Pick<CartConfig, "recsSource" | "recsCodes" | "recsLimit" | "recsFreeShip"> & {
    recsCats?: string[];
    /** ดูล่าสุด / รายการโปรด: id หรือ slug ตามลำดับที่ส่งมา (เครื่องลูกค้าส่งมาเอง) */
    recsPick?: string[];
  },
  remain = 0
): P[] {
  const cartSet = new Set(inCart);
  const pool = all.filter((p) => !cartSet.has(p.id) && p.price > 0 && p.stock !== "out");
  let list: P[];
  if (cfg.recsSource === "manual") {
    const byCode = new Map(pool.map((p) => [String(p.code ?? "").toUpperCase(), p]));
    list = cfg.recsCodes.map((c) => byCode.get(c)).filter((p): p is P => !!p);
  } else if (cfg.recsSource === "featured") {
    list = pool.filter((p) => p.featured);
  } else if (cfg.recsSource === "recent" || cfg.recsSource === "wishlist") {
    const byKey = new Map<string, P>();
    for (const p of pool) {
      byKey.set(p.id, p);
      if (p.slug) byKey.set(p.slug, p);
    }
    list = [...new Set((cfg.recsPick ?? []).map((k) => byKey.get(k)).filter((p): p is P => !!p))];
  } else if (cfg.recsSource === "bought") {
    // ซื้อคู่กันบ่อย: รวมจากทุกชิ้นในตะกร้า — อยู่ต้นรายการของชิ้นไหน = คะแนนมาก
    const score = new Map<string, number>();
    for (const p of all) {
      if (!cartSet.has(p.id)) continue;
      (p.boughtWith ?? []).forEach((c, i) => score.set(c.toUpperCase(), (score.get(c.toUpperCase()) ?? 0) + Math.max(1, 12 - i)));
    }
    const sc = (p: P) => score.get(String(p.code ?? "").toUpperCase()) ?? 0;
    list = pool.filter((p) => sc(p) > 0).sort((a, b) => sc(b) - sc(a));
  } else if (cfg.recsSource === "category") {
    // ตามหมวด: แนะนำ/ขายดีขึ้นก่อน ที่เหลือลำดับเดิมของร้าน
    const want = new Set(cfg.recsCats ?? []);
    const score = (p: P) => (p.featured ? 2 : 0) + (p.salesRank != null ? 1 + 1 / (1 + p.salesRank) : 0);
    list = pool
      .filter((p) => (p.categories ?? [p.category ?? ""]).some((c) => want.has(c)))
      .map((p, i) => ({ p, i, s: score(p) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.p);
  } else {
    const cartCats = new Set(all.filter((p) => cartSet.has(p.id)).flatMap((p) => [p.category ?? "", ...(p.categories ?? [])]).filter(Boolean));
    const score = (p: P) =>
      ((p.categories ?? [p.category ?? ""]).some((c) => cartCats.has(c)) ? 3 : 0) + (p.featured ? 2 : 0) + (p.salesRank != null ? 1 + 1 / (1 + p.salesRank) : 0);
    list = pool
      .map((p, i) => ({ p, i, s: score(p) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.p);
  }
  if (cfg.recsFreeShip && remain > 0) {
    // ราคาพอดีให้ถึงส่งฟรี (≥ ที่ขาด) ใกล้สุดขึ้นก่อน — ที่เหลือคงลำดับเดิม
    const hit = list.filter((p) => p.price >= remain).sort((a, b) => a.price - b.price);
    const rest = list.filter((p) => p.price < remain);
    list = [...hit, ...rest];
  }
  return list.slice(0, cfg.recsLimit);
}
