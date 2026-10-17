/**
 * 💾 ธีมที่บันทึกไว้ (ตาราง website_saved_themes) — ของกลาง ฟังก์ชันล้วน ใช้ได้ทั้ง API และหน้าจอ
 *
 * บันทึกได้ 2 แบบ:
 *   colors = เฉพาะสี (สีหลัก 6 ตัว + สีละเอียด + สีป้ายลดราคา)
 *   full   = ทั้งชุดหน้าตา: สี · ฟอนต์ · ตัวอักษรรายบทบาท · ความมน/รูปทรง · การ์ดสินค้า · หัวเว็บ (เฉพาะหน้าตา) · การเปลี่ยนหน้า
 *            · หน้าตาหน้าสินค้า (เลย์เอาต์/รูป/ฟอนต์) · สีตอนรอรูปโหลด
 * ไม่เก็บ/ไม่แตะ "เนื้อหาของร้าน": โลโก้ เมนู ท้ายเว็บ ปุ่ม+ชิ้นส่วนบนหัวเว็บ ชุดรายละเอียด/ส่วนประกอบหน้าสินค้า หน้ารายการสินค้า
 *   → ใช้ข้ามร้านได้ (แบบเดียวกับ applyFullPreset ของธีมสำเร็จรูป)
 * ใช้แล้ว = แทนค่าในร่าง (ยังไม่ขึ้นเว็บจนกดเผยแพร่ · ↶ ย้อนได้)
 */
import { normalizeTheme, type SiteTheme } from "@/lib/website-theme";

export type SavedThemeScope = "colors" | "full";

export const SAVED_THEME_SCOPES: { value: SavedThemeScope; label: string; hint: string }[] = [
  { value: "full", label: "ทั้งชุดหน้าตา", hint: "สี ฟอนต์ ตัวอักษร ปุ่ม/รูปทรง การ์ดสินค้า หัวเว็บ หน้าตาหน้าสินค้า" },
  { value: "colors", label: "เฉพาะสี", hint: "สีหลัก + สีละเอียด (ปุ่ม เส้นขอบ ลิงก์ ราคา สต๊อก) + สีป้ายลดราคา" },
];

export interface SavedTheme {
  id: string;
  shopId: string | null;
  shopName: string | null;
  name: string;
  scope: SavedThemeScope;
  /** เฉพาะส่วนหน้าตา (ผลของ themeLookOf) */
  theme: Record<string, unknown>;
  createdByName: string | null;
  updatedAt: string;
}

export const cleanSavedThemeName = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
export const cleanSavedThemeScope = (v: unknown): SavedThemeScope | null => (v === "colors" || v === "full" ? v : null);

/** หน้าตาของหัวเว็บ (ไม่รวม zones = ชิ้นส่วนบนหัวเว็บ และ button = ข้อความ/ลิงก์ปุ่ม ที่เป็นของร้าน) */
const HEADER_LOOK = ["height", "sticky", "bg", "menuAlign", "showCart", "border", "bgKind", "bgColor", "textColor", "overHero", "overPages", "hideOnScroll", "mobileMenuSide", "cart", "search"] as const;
/** หน้าตาหน้าสินค้า (ไม่รวม ชุดรายละเอียด/ลำดับ-ซ่อนส่วน/ส่วนประกอบ/กรอบส่วน/ค่ามือถือ ที่ผูกกับสินค้า-หมวดของร้าน) */
const PRODUCT_LOOK = ["layout", "titleStyle", "imageBg", "imageBgKey", "imageBgKind", "imageBgColor", "imageBgGradient", "imageEffect", "imageFit", "imageSize", "showTabs", "galleryStyle", "detailsStyle", "detailsOpen", "fonts"] as const;

const pickKeys = <T extends object, K extends keyof T>(o: T, keys: readonly K[]) => {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = o[k];
  return out;
};

/** ธีมปัจจุบัน → ก้อนที่เก็บลงตาราง (ผ่าน normalizeTheme ก่อน กันค่าแปลก) */
export function themeLookOf(raw: unknown, scope: SavedThemeScope): Record<string, unknown> {
  const t = normalizeTheme(raw);
  const saleColor = { autoBadges: { saleColor: t.card.autoBadges.saleColor } };
  if (scope === "colors") return { colors: { ...t.colors }, card: saleColor };
  return {
    colors: { ...t.colors },
    fonts: { ...t.fonts },
    radius: t.radius,
    typography: t.typography,
    shape: { ...t.shape },
    card: t.card,
    header: pickKeys(t.header, HEADER_LOOK),
    page: { ...t.page },
    product: pickKeys(t.product, PRODUCT_LOOK),
    logo: { placeholder: t.logo.placeholder },
  };
}

/** ธีมแบบที่หน้าจอถือ (หน้าดีไซน์มี type ของตัวเอง — ต้องมีอย่างน้อยส่วนเหล่านี้) */
type Themeish = Pick<SiteTheme, "colors" | "fonts" | "radius" | "typography" | "shape" | "card" | "header" | "page"> & { product: object; logo: object };

/** ใส่ธีมที่บันทึกไว้ลงธีมปัจจุบัน — แทนเฉพาะส่วนหน้าตาตาม scope · เนื้อหาร้านคงเดิม */
export function applySavedTheme<T extends Themeish>(cur: T, saved: { scope: SavedThemeScope; theme: unknown }): T {
  const look = (saved.theme ?? {}) as Record<string, unknown>;
  // เติมค่าที่ขาดด้วยค่าเริ่มต้น (ธีมเก่าที่บันทึกก่อนมีช่องใหม่)
  const s = normalizeTheme(look);
  const autoBadges = { ...cur.card.autoBadges, saleColor: s.card.autoBadges.saleColor };
  if (saved.scope === "colors") return { ...cur, colors: { ...s.colors }, card: { ...cur.card, autoBadges } } as T;
  return {
    ...cur,
    colors: { ...s.colors },
    fonts: { ...s.fonts },
    radius: s.radius,
    typography: s.typography,
    shape: { ...s.shape },
    card: { ...s.card },
    header: { ...cur.header, ...pickKeys(s.header, HEADER_LOOK) },
    page: { ...s.page },
    product: { ...cur.product, ...pickKeys(s.product, PRODUCT_LOOK) },
    logo: { ...cur.logo, placeholder: s.logo.placeholder },
  } as T;
}

/** สีตัวอย่างบนการ์ดในรายการ (หยิบจากก้อนที่บันทึก) */
export function savedThemeSwatch(theme: unknown): { brand: string; ink: string; page: string; surface: string; display: string; body: string } {
  const t = normalizeTheme(theme);
  return { brand: t.colors.brand, ink: t.colors.ink, page: t.colors.page, surface: t.colors.surface, display: t.fonts.display, body: t.fonts.body };
}
