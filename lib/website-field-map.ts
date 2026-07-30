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
/**
 * ตัวเลือกกลุ่มที่ 2 — มาจาก `skus_v2.attribute_values.variant_option`
 * ซึ่งเป็นช่องที่ระบบสร้าง SKU แบบเมทริกซ์ (/api/skus/variant-matrix) ใช้เก็บ "มิติที่ 2" อยู่แล้ว
 * เช่น เครื่องมือเจาะหนัง PI338 = จำนวนรู (สี) × ขนาดรู (variant_option)
 */
export type Option2Source = "variant_option" | "none";
/**
 * หมวดสินค้าบนเว็บ — เป็น "รหัสอะไรก็ได้" ที่เจ้าของตั้งเอง ไม่ใช่รายการตายตัวอีกแล้ว
 * รายการหมวดของแต่ละร้านเก็บใน field_map.categories
 */
export type WebCategory = string;

/** หมวดตั้งต้นของร้านวัสดุ — ร้านเก่าที่ยังไม่เคยตั้งจะได้ชุดนี้ หน้าเว็บจึงเหมือนเดิม */
export const DEFAULT_WEB_CATEGORIES: WebCategoryDef[] = [
  { key: "leather", label: "หนัง", icon: "🟫" },
  { key: "fabric", label: "ผ้า", icon: "🧵" },
  { key: "hardware", label: "อะไหล่", icon: "⚙️" },
  { key: "edge-paint", label: "สีทาขอบ", icon: "🎨" },
];

export interface WebCategoryDef {
  /** รหัสที่ใช้ในลิงก์ /shop?cat=<key> — a-z 0-9 - เท่านั้น */
  key: string;
  label: string;
  icon: string;
}

export interface FieldMap {
  name: { source: NameSource; stripPrefix?: string };
  price: { source: PriceSource };
  description: { source: DescSource };
  unit: { default: string };
  options: { source: OptionSource; label: string };
  /** เว้น source เป็น "none" = สินค้านั้นมีตัวเลือกชั้นเดียว (ค่าเริ่มต้น ไม่กระทบของเดิม) */
  options2: { source: Option2Source; label: string };
  category: { default: WebCategory; rules: Record<string, WebCategory> };
  /** รายการหมวดของร้านนี้ — เจ้าของเพิ่ม/แก้/ลบเองได้ในแท็บจับคู่ฟิลด์ */
  categories: WebCategoryDef[];
  image: { useCover: boolean };
}

export const DEFAULT_FIELD_MAP: FieldMap = {
  name: { source: "name_th", stripPrefix: "" },
  price: { source: "sku_max" },
  description: { source: "platform_description" },
  unit: { default: "ชิ้น" },
  options: { source: "sku_color", label: "แบบ/สี" },
  options2: { source: "none", label: "ตัวเลือกที่ 2" },
  category: { default: "hardware", rules: {} },
  categories: DEFAULT_WEB_CATEGORIES,
  image: { useCover: true },
};

const NAME_SOURCES: NameSource[] = ["name_th", "name_platform", "name_en", "sku_name", "code"];
const PRICE_SOURCES: PriceSource[] = ["sku_max", "sku_min", "final_price", "sale_price", "fake_price"];
const DESC_SOURCES: DescSource[] = ["platform_description", "introduction", "description", "english_description", "none"];
/** รหัสหมวดต้องปลอดภัยกับ URL (/shop?cat=<key>) — ตัวเล็ก ตัวเลข ขีดกลาง เท่านั้น */
export const cleanCategoryKey = (v: unknown): string =>
  String(v ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);

/** อ่านค่าที่เก็บใน DB ให้เป็น FieldMap ที่ครบถ้วนเสมอ (กันข้อมูลเก่า/ไม่ครบ) */
export function normalizeFieldMap(raw: unknown): FieldMap {
  const r = (raw ?? {}) as Record<string, unknown>;
  const d = DEFAULT_FIELD_MAP;
  const g = (k: string) => (r[k] ?? {}) as Record<string, unknown>;
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

  // รายการหมวดของร้าน — ไม่เคยตั้ง = ใช้ชุดตั้งต้น (ร้านเดิมหน้าเว็บไม่เปลี่ยน)
  const catsRaw = Array.isArray(r.categories) ? (r.categories as unknown[]) : null;
  const seenKey = new Set<string>();
  const categories: WebCategoryDef[] = (catsRaw ?? [])
    .slice(0, 40)
    .map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return { key: cleanCategoryKey(o.key), label: str(o.label).slice(0, 60), icon: str(o.icon).slice(0, 8) };
    })
    .filter((c) => c.key && c.label && !seenKey.has(c.key) && seenKey.add(c.key) !== undefined);
  const cats = catsRaw ? categories : d.categories;
  const catKeys = cats.map((c) => c.key);

  // กฎจับหมวด: เก็บเฉพาะที่ชี้ไปหมวดที่ยังมีอยู่จริง (ลบหมวดแล้วกฎเก่าต้องไม่ค้าง)
  const rulesRaw = (g("category").rules ?? {}) as Record<string, unknown>;
  const rules: Record<string, WebCategory> = {};
  for (const [k, v] of Object.entries(rulesRaw).slice(0, 300)) {
    if (typeof v === "string" && catKeys.includes(v)) rules[k] = v;
  }

  const pick = <T extends string>(v: unknown, allowed: T[], fallback: T): T =>
    typeof v === "string" && (allowed as string[]).includes(v) ? (v as T) : fallback;

  // หมวดตั้งต้นต้องเป็นหมวดที่มีอยู่จริง ไม่งั้นสินค้าจะไปกองในหมวดที่ไม่มีในเมนู
  const defRaw = cleanCategoryKey(g("category").default);
  const defaultCat = catKeys.includes(defRaw) ? defRaw : catKeys[0] ?? "";

  return {
    name: {
      source: pick(g("name").source, NAME_SOURCES, d.name.source),
      stripPrefix: str(g("name").stripPrefix).slice(0, 60),
    },
    price: { source: pick(g("price").source, PRICE_SOURCES, d.price.source) },
    description: { source: pick(g("description").source, DESC_SOURCES, d.description.source) },
    unit: { default: str(g("unit").default, d.unit.default).slice(0, 40) },
    options: {
      source: pick(g("options").source, ["sku_color", "none"] as OptionSource[], d.options.source),
      label: str(g("options").label, d.options.label).slice(0, 60),
    },
    options2: {
      source: pick(g("options2").source, ["variant_option", "none"] as Option2Source[], d.options2.source),
      label: str(g("options2").label, d.options2.label).slice(0, 60),
    },
    category: { default: defaultCat, rules },
    categories: cats,
    image: { useCover: g("image").useCover !== false },
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
  /** ลำดับที่อยากให้ตัวเลือกเรียง (น้อยไปมาก) — ไม่ตั้งไว้ = เรียงตามที่ DB คืนมา */
  color_index?: number | null;
  list_price: number | string | null;
  cover_image_r2_key: string | null;
  /** มิติที่ 2 อยู่ใน attribute_values.variant_option = { name, value, code } */
  attribute_values?: Record<string, unknown> | null;
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

export const CHILD_SELECT =
  "id, code, color, color_index, list_price, cover_image_r2_key, parent_sku_id, attribute_values";

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

/** เรียง SKU ลูกตาม color_index ถ้ามี — ไม่งั้นตัวเลือกบนเว็บจะสลับไปมาตามที่ DB คืนมา */
const sortKids = (kids: ChildSku[]): ChildSku[] =>
  [...kids].sort((a, b) => {
    const ai = a.color_index ?? Number.MAX_SAFE_INTEGER;
    const bi = b.color_index ?? Number.MAX_SAFE_INTEGER;
    return ai !== bi ? ai - bi : clean(a.code).localeCompare(clean(b.code), "th");
  });

/** สร้างตัวเลือกจากสีของ SKU ลูก (ตัดสีซ้ำ) */
function resolveOptions(map: FieldMap, kids: ChildSku[]): { label: string; items: { id: string; label: string }[] } | null {
  if (map.options.source !== "sku_color") return null;
  const seen = new Set<string>();
  const items: { id: string; label: string }[] = [];
  for (const k of sortKids(kids)) {
    const label = clean(k.color);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    items.push({ id: `sku-${k.id.slice(0, 8)}`, label });
    if (items.length >= 24) break;
  }
  return items.length ? { label: map.options.label || "แบบ/สี", items } : null;
}

/**
 * ตัวเลือกกลุ่มที่ 2 — อ่านจาก attribute_values.variant_option
 * สินค้าที่มี 2 มิติจริง ๆ (เช่น ขนาดรู × จำนวนรู) จะเลือกได้ครบ ไม่ต้องยัดรวมเป็นลิสต์เดียว
 */
function resolveOptions2(map: FieldMap, kids: ChildSku[]): { label: string; items: { id: string; label: string }[] } | null {
  if (map.options2.source !== "variant_option") return null;
  const seen = new Set<string>();
  const items: { id: string; label: string }[] = [];
  let groupName = "";
  for (const k of sortKids(kids)) {
    const vo = (k.attribute_values as { variant_option?: { name?: unknown; value?: unknown } } | null)?.variant_option;
    const label = clean(vo?.value);
    if (!label || seen.has(label)) continue;
    if (!groupName) groupName = clean(vo?.name);
    seen.add(label);
    items.push({ id: `opt2-${k.id.slice(0, 8)}`, label });
    if (items.length >= 24) break;
  }
  // ชื่อกลุ่มที่ตั้งไว้ใน ERP ชนะ ถ้าไม่ได้ตั้งค่อยใช้ชื่อที่ติดมากับ SKU
  return items.length ? { label: map.options2.label || groupName || "ตัวเลือกที่ 2", items } : null;
}

export interface ResolvedProduct {
  name: string;
  price: number;
  description: string;
  unit: string;
  category: string;
  images: string[];
  options: { label: string; items: { id: string; label: string; swatch?: string | null }[] } | null;
  /** null = สินค้าชิ้นนี้มีตัวเลือกชั้นเดียว */
  options2: { label: string; items: { id: string; label: string }[] } | null;
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
    // กรอกทับตัวเลือกเองในหน้าจัดการ = ตั้งใจคุมเอง → ไม่ยัดกลุ่ม 2 ตามไปด้วย จะกลายเป็นเลือกไม่ตรงของ
    options2: listingOptions?.items?.length ? null : resolveOptions2(map, kids),
  };
}
