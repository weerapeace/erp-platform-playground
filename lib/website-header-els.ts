/**
 * 🧩 ตั้งค่าชิ้นส่วนหัวเว็บ (⚙ ในแท็บ Header → ตำแหน่งชิ้นส่วน) — ตะกร้า · ค้นหา
 *   ⚠️ ไฟล์ไม่มี import → มิเรอร์ทั้งไฟล์ไป storefront src/lib/header-els.ts (แก้ที่นี่แล้วคัดลอก)
 * ค่าเริ่มต้น = หน้าตาเดิมของเว็บ (ไอคอนรถเข็น + ตัวเลขจำนวนชิ้น · ไอคอนแว่นขยาย)
 * โลโก้ใช้ค่าในแท็บโลโก้เดิม (theme.logo) · เมนูใช้ theme.menu
 */

export type CartIcon = "cart" | "bag" | "basket" | "tote";
export type CartBadge = "count" | "dot" | "none";
export interface HeaderCart {
  icon: CartIcon;
  /** คำข้างไอคอน เช่น "ตะกร้า" ("" = ไม่มี · ซ่อนบนมือถือ) */
  label: string;
  /** ป้ายบนไอคอน: ตัวเลขจำนวนชิ้น / จุด / ไม่มี */
  badge: CartBadge;
  /** สีป้าย ("" = สีหลักของธีม) */
  badgeColor: string;
  /** ขนาดไอคอน (px) */
  size: number;
}
export type SearchStyle = "icon" | "iconText" | "box";
export interface HeaderSearch {
  style: SearchStyle;
  /** คำข้างไอคอน (แบบไอคอน + คำ) */
  label: string;
  /** ข้อความในช่อง (แบบช่องค้นหา) */
  placeholder: string;
  /** ความกว้างช่อง (แบบช่องค้นหา) */
  width: "sm" | "md" | "lg";
  size: number;
}

export const DEFAULT_HEADER_CART: HeaderCart = { icon: "cart", label: "", badge: "count", badgeColor: "", size: 21 };
export const DEFAULT_HEADER_SEARCH: HeaderSearch = { style: "icon", label: "ค้นหา", placeholder: "ค้นหาสินค้า…", width: "md", size: 20 };

export const CART_ICONS: { value: CartIcon; label: string }[] = [
  { value: "cart", label: "รถเข็น" },
  { value: "bag", label: "ถุงช้อปปิ้ง" },
  { value: "basket", label: "ตะกร้า" },
  { value: "tote", label: "กระเป๋า" },
];
export const CART_BADGES: { value: CartBadge; label: string }[] = [
  { value: "count", label: "ตัวเลขจำนวนชิ้น" },
  { value: "dot", label: "จุดเล็ก" },
  { value: "none", label: "ไม่มี" },
];
export const SEARCH_STYLES: { value: SearchStyle; label: string }[] = [
  { value: "icon", label: "ไอคอน" },
  { value: "iconText", label: "ไอคอน + คำ" },
  { value: "box", label: "ช่องค้นหาในแถบ" },
];
export const SEARCH_WIDTHS: { value: HeaderSearch["width"]; label: string; px: number }[] = [
  { value: "sm", label: "แคบ", px: 160 },
  { value: "md", label: "กลาง", px: 220 },
  { value: "lg", label: "กว้าง", px: 300 },
];
export const ICON_SIZES = [16, 18, 20, 21, 22, 24, 26, 28] as const;

/** เส้นไอคอน 24×24 (stroke) — วาดเหมือนกันทั้ง ERP และเว็บร้าน */
export const HEADER_ICON_PATHS: Record<CartIcon | "search", string[]> = {
  cart: ["M8 21a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M19 21a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"],
  bag: ["M6.331 8h11.339a2 2 0 0 1 1.977 2.304l-1.255 8.152a3 3 0 0 1 -2.966 2.544h-6.852a3 3 0 0 1 -2.965 -2.544l-1.255 -8.152a2 2 0 0 1 1.977 -2.304z", "M9 11v-5a3 3 0 0 1 6 0v5"],
  basket: ["M10 14a2 2 0 1 0 4 0a2 2 0 0 0 -4 0", "M5.001 8h13.999a2 2 0 0 1 1.977 2.304l-1.255 7.152a3 3 0 0 1 -2.966 2.544h-9.512a3 3 0 0 1 -2.965 -2.544l-1.255 -7.152a2 2 0 0 1 1.977 -2.304z", "M17 10l-2 -6", "M7 10l2 -6"],
  tote: ["M5 10h14l-1.2 9a2 2 0 0 1 -2 1.7h-7.6a2 2 0 0 1 -2 -1.7z", "M8.5 10v-1.5a3.5 3.5 0 0 1 7 0v1.5"],
  search: ["M4 11a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "M20 20l-3.5 -3.5"],
};

const oneOf = <T extends string>(v: unknown, all: readonly T[], fb: T): T => (typeof v === "string" && (all as readonly string[]).includes(v) ? (v as T) : fb);
const str = (v: unknown, fb: string, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : fb);
const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) ? v.trim() : "");
const size = (v: unknown, fb: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(14, Math.min(32, Math.round(n))) : fb;
};

export function normalizeHeaderCart(raw: unknown): HeaderCart {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_HEADER_CART;
  return {
    icon: oneOf(r.icon, CART_ICONS.map((x) => x.value), d.icon),
    label: str(r.label, d.label, 20),
    badge: oneOf(r.badge, CART_BADGES.map((x) => x.value), d.badge),
    badgeColor: hex(r.badgeColor),
    size: size(r.size, d.size),
  };
}
export function normalizeHeaderSearch(raw: unknown): HeaderSearch {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_HEADER_SEARCH;
  return {
    style: oneOf(r.style, SEARCH_STYLES.map((x) => x.value), d.style),
    label: str(r.label, d.label, 20) || d.label,
    placeholder: str(r.placeholder, d.placeholder, 40) || d.placeholder,
    width: oneOf(r.width, ["sm", "md", "lg"] as const, d.width),
    size: size(r.size, d.size),
  };
}
