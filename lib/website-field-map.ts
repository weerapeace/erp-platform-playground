/**
 * ของกลาง — "จับคู่ฟิลด์" เว็บร้านออนไลน์ ↔ Parent SKU (เก็บที่ shops.field_map)
 *
 * ใช้ร่วมกัน 3 ที่:
 *   - /api/website/field-map      (อ่าน/บันทึกการตั้งค่า)
 *   - /api/website/listings       (แสดงค่าที่จะได้ ให้เห็นเป็นตัวอย่างในหน้าจัดการ)
 *   - /api/public/storefront/*    (ส่งค่าจริงให้เว็บภายนอก)
 *
 * หลักการ: ถ้า store_listings กรอกทับไว้ → ใช้ค่าที่กรอก
 *          ถ้าเว้นว่าง → คำนวณจาก field_map (ดึงจาก Parent SKU / SKU ลูก)
 */

export type NameSource = "name_th" | "name_platform" | "name_en" | "sku_name" | "code";
export type PriceSource = "sku_max" | "sku_min" | "final_price" | "sale_price" | "fake_price";
export type DescSource = "platform_description" | "introduction" | "description" | "english_description" | "none";
export type OptionSource = "sku_color" | "none";
export type WebCategory = "leather" | "fabric" | "hardware" | "edge-paint" | "";

export interface FieldMap {
  name: { source: NameSource; stripPrefix?: string };
  price: { source: PriceSource };
  description: { source: DescSource };
  unit: { default: string };
  options: { source: OptionSource; label: string };
  category: { default: WebCategory; rules: Record<string, WebCategory> };
  image: { useCover: boolean };
}

export const DEFAULT_FIELD_MAP: FieldMap = {
  name: { source: "name_th", stripPrefix: "" },
  price: { source: "sku_max" },
  description: { source: "platform_description" },
  unit: { default: "ชิ้น" },
  options: { source: "sku_color", label: "แบบ/สี" },
  category: { default: "hardware", rules: {} },
  image: { useCover: true },
};

const NAME_SOURCES: NameSource[] = ["name_th", "name_platform", "name_en", "sku_name", "code"];
const PRICE_SOURCES: PriceSource[] = ["sku_max", "sku_min", "final_price", "sale_price", "fake_price"];
const DESC_SOURCES: DescSource[] = ["platform_description", "introduction", "description", "english_description", "none"];
const WEB_CATEGORIES: WebCategory[] = ["leather", "fabric", "hardware", "edge-paint", ""];

/** อ่านค่าที่เก็บใน DB ให้เป็น FieldMap ที่ครบถ้วนเสมอ (กันข้อมูลเก่า/ไม่ครบ) */
export function normalizeFieldMap(raw: unknown): FieldMap {
  const r = (raw ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const d = DEFAULT_FIELD_MAP;
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

  const rulesRaw = (r.category?.rules ?? {}) as Record<string, unknown>;
  const rules: Record<string, WebCategory> = {};
  for (const [k, v] of Object.entries(rulesRaw).slice(0, 300)) {
    if (typeof v === "string" && (WEB_CATEGORIES as string[]).includes(v)) rules[k] = v as WebCategory;
  }

  const pick = <T extends string>(v: unknown, allowed: T[], fallback: T): T =>
    typeof v === "string" && (allowed as string[]).includes(v) ? (v as T) : fallback;

  return {
    name: {
      source: pick(r.name?.source, NAME_SOURCES, d.name.source),
      stripPrefix: str(r.name?.stripPrefix).slice(0, 60),
    },
    price: { source: pick(r.price?.source, PRICE_SOURCES, d.price.source) },
    description: { source: pick(r.description?.source, DESC_SOURCES, d.description.source) },
    unit: { default: str(r.unit?.default, d.unit.default).slice(0, 40) },
    options: {
      source: pick(r.options?.source, ["sku_color", "none"] as OptionSource[], d.options.source),
      label: str(r.options?.label, d.options.label).slice(0, 60),
    },
    category: {
      default: pick(r.category?.default, WEB_CATEGORIES, d.category.default),
      rules,
    },
    image: { useCover: r.image?.useCover !== false },
  };
}

// ─── ข้อมูลดิบที่ resolver ต้องใช้ ───

export interface ParentRow {
  id: string;
  code: string | null;
  name_th: string | null;
  name_en: string | null;
  sku_name: string | null;
  name_platform: string | null;
  introduction: string | null;
  description: string | null;
  platform_description: string | null;
  english_description: string | null;
  sale_price: number | string | null;
  final_price: number | string | null;
  fake_price: number | string | null;
  cover_image_r2_key: string | null;
  category_id: string | null;
}

export interface ChildSku {
  id: string;
  code: string | null;
  color: string | null;
  list_price: number | string | null;
  cover_image_r2_key: string | null;
}

export interface ListingRow {
  web_name?: string | null;
  web_price?: number | string | null;
  web_description?: string | null;
  web_images?: unknown;
  web_unit?: string | null;
  web_category?: string | null;
  web_options?: unknown;
  web_badge?: string | null;
  web_stock_status?: string | null;
  web_swatch?: string | null;
}

/** คอลัมน์ที่ต้อง select จาก parent_skus_v2 ให้ resolver ทำงานได้ครบ */
export const PARENT_SELECT =
  "id, code, name_th, name_en, sku_name, name_platform, introduction, description, platform_description, english_description, sale_price, final_price, fake_price, cover_image_r2_key, category_id";

export const CHILD_SELECT = "id, code, color, list_price, cover_image_r2_key, parent_sku_id";

const num = (v: unknown) => Number(v) || 0;
const clean = (v: unknown) => String(v ?? "").trim();

/** ราคาที่ควรโชว์บนเว็บ ตามแหล่งที่เลือก */
function resolvePrice(map: FieldMap, parent: ParentRow, kids: ChildSku[]): number {
  const prices = kids.map((k) => num(k.list_price)).filter((n) => n > 0);
  switch (map.price.source) {
    case "sku_max":
      return prices.length ? Math.max(...prices) : num(parent.final_price) || num(parent.sale_price);
    case "sku_min":
      return prices.length ? Math.min(...prices) : num(parent.final_price) || num(parent.sale_price);
    case "final_price":
      return num(parent.final_price);
    case "sale_price":
      return num(parent.sale_price);
    case "fake_price":
      return num(parent.fake_price);
    default:
      return 0;
  }
}

function resolveName(map: FieldMap, parent: ParentRow): string {
  const raw =
    clean(parent[map.name.source as keyof ParentRow]) ||
    clean(parent.name_th) ||
    clean(parent.name_platform) ||
    clean(parent.code);
  const prefix = clean(map.name.stripPrefix);
  if (!prefix) return raw;
  // ตัดคำนำหน้าออก (ไม่สนตัวพิมพ์เล็ก/ใหญ่) เช่น "IG International อะไหล่..." → "อะไหล่..."
  const lower = raw.toLowerCase();
  const p = prefix.toLowerCase();
  return lower.startsWith(p) ? raw.slice(prefix.length).replace(/^[\s\-–—:·]+/, "").trim() || raw : raw;
}

function resolveDescription(map: FieldMap, parent: ParentRow): string {
  if (map.description.source === "none") return "";
  return (
    clean(parent[map.description.source as keyof ParentRow]) ||
    clean(parent.platform_description) ||
    clean(parent.introduction) ||
    clean(parent.description)
  );
}

/** สร้างตัวเลือกจากสีของ SKU ลูก (ตัดสีซ้ำ) */
function resolveOptions(map: FieldMap, kids: ChildSku[]): { label: string; items: { id: string; label: string }[] } | null {
  if (map.options.source !== "sku_color") return null;
  const seen = new Set<string>();
  const items: { id: string; label: string }[] = [];
  for (const k of kids) {
    const label = clean(k.color);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    items.push({ id: `sku-${k.id.slice(0, 8)}`, label });
    if (items.length >= 24) break;
  }
  return items.length ? { label: map.options.label || "แบบ/สี", items } : null;
}

export interface ResolvedProduct {
  name: string;
  price: number;
  description: string;
  unit: string;
  category: string;
  images: string[];
  options: { label: string; items: { id: string; label: string; swatch?: string | null }[] } | null;
}

/**
 * ค่าที่จะแสดงบนเว็บจริง — listing ที่กรอกทับชนะเสมอ ที่เหลือคำนวณจาก field_map
 * @param categoryName ชื่อหมวดใน ERP (จาก product_categories) ใช้จับคู่เป็นหมวดเว็บ
 */
export function resolveProduct(
  map: FieldMap,
  parent: ParentRow,
  kids: ChildSku[],
  listing: ListingRow | null,
  categoryName: string | null
): ResolvedProduct {
  const l = listing ?? {};

  const mappedImages = map.image.useCover && parent.cover_image_r2_key ? [parent.cover_image_r2_key] : [];
  const listingImages = Array.isArray(l.web_images) ? (l.web_images as string[]).filter(Boolean) : [];

  const mappedOptions = resolveOptions(map, kids);
  const listingOptions =
    l.web_options && typeof l.web_options === "object"
      ? (l.web_options as { label: string; items: { id: string; label: string; swatch?: string | null }[] })
      : null;

  const rule = categoryName ? map.category.rules[categoryName] : undefined;

  return {
    name: clean(l.web_name) || resolveName(map, parent),
    price: l.web_price != null && num(l.web_price) > 0 ? num(l.web_price) : resolvePrice(map, parent, kids),
    description: clean(l.web_description) || resolveDescription(map, parent),
    unit: clean(l.web_unit) || map.unit.default,
    category: clean(l.web_category) || rule || map.category.default,
    images: listingImages.length ? listingImages : mappedImages,
    options: listingOptions?.items?.length ? listingOptions : mappedOptions,
  };
}
