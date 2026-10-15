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
import { normalizeWebCollections, type WebCollection } from "@/lib/website-collections";

import { PRODUCT_SPEC_FIELDS } from "@/lib/website-theme";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

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
/** รูปสินค้าบนเว็บมาจากไหน: parent = หน้าปก Parent SKU · skus = รูปของ SKU ลูกแต่ละสี (หลายรูป + สลับตามสี) · both = Parent ก่อนแล้วตามด้วย SKU */
export type ImageSource = "parent" | "skus" | "both";
/**
 * หมวดสินค้าบนเว็บ — เป็น "รหัสอะไรก็ได้" ที่เจ้าของตั้งเอง ไม่ใช่รายการตายตัวอีกแล้ว
 * รายการหมวดของแต่ละร้านเก็บใน field_map.categories
 */
export type WebCategory = string;

/**
 * หมวดตั้งต้นของร้านวัสดุ — ร้านเก่าที่ยังไม่เคยตั้งจะได้ชุดนี้ หน้าเว็บจึงเหมือนเดิม
 * ⚠️ ไอคอน/คำโปรยต้องตรงกับที่หน้าเว็บ IG เคยฝังไว้ในโค้ด ไม่งั้นการ์ดหมวดหน้าแรกจะเปลี่ยนหน้าตา
 */
export const DEFAULT_WEB_CATEGORIES: WebCategoryDef[] = [
  { key: "leather", label: "หนัง", icon: "🐄", blurb: "หนังวัว แพะ ฟอกฝาด Pull-up" },
  { key: "fabric", label: "ผ้า", icon: "🧵", blurb: "ผ้าซับใน แคนวาสกันน้ำ" },
  { key: "hardware", label: "อะไหล่", icon: "⚙️", blurb: "หัวเข็มขัด ซิป หมุด ห่วง" },
  { key: "edge-paint", label: "สีทาขอบ", icon: "🎨", blurb: "สีทาขอบ น้ำยาเคลือบขอบ" },
];

export interface WebCategoryDef {
  /** รหัสที่ใช้ในลิงก์หน้าหมวด /c/<key> (ลิงก์เก่า /shop?cat=<key> ยังใช้ได้) — a-z 0-9 - เท่านั้น */
  key: string;
  label: string;
  icon: string;
  /** คำโปรยสั้น ๆ ใต้ชื่อหมวดบนการ์ดหน้าแรก / คำอธิบายบนหน้าหมวด — เว้นว่างได้ */
  blurb: string;
  /** 🖼 รูปหมวด (r2 key) — การ์ด/แถบหมวดบนหน้าแรก (Section หมวดสินค้าแบบรูปใหญ่/รูปเล็ก) · ไม่มี = ใช้ไอคอน */
  imageKey?: string | null;
  /** 🖼 แบนเนอร์หัวหน้าหมวด (r2 key) — โชว์บนหน้าร้านตอนเลือกหมวดนี้ · ไม่มี = หัวข้อธรรมดา */
  bannerKey?: string | null;
  /** ↕ ลำดับสินค้าในหมวดนี้ (รหัสรุ่น) — ลากเรียงในแท็บหมวดหมู่ · ตัวที่ไม่อยู่ในรายการต่อท้ายตามลำดับรวมของร้าน */
  order?: string[];
  /** 🔎 ชื่อหน้าหมวดใน Google (≤ 70 ตัว) — ว่าง = "<ชื่อหมวด> | <ชื่อร้าน>" */
  seoTitle?: string;
  /** 🔎 คำอธิบายใต้ชื่อใน Google (≤ 170 ตัว) — ว่าง = คำอธิบายหมวด (blurb) */
  seoDescription?: string;
}

/** r2 key ของรูปหมวด — ตัวอักษรที่ปลอดภัยเท่านั้น (ไม่ผ่าน = ไม่มีรูป) */
const catImgKey = (v: unknown): string | null => (typeof v === "string" && /^[\w\-./%()]{1,300}$/.test(v.trim()) ? v.trim() : null);

/**
 * กฎประกอบชื่อบนเว็บ (ต่อร้าน) — ตัดส่วนที่ไม่อยากโชว์ออกจากชื่อใน ERP อัตโนมัติ
 * เช่น ร้านแบรนด์ตัวเองไม่ต้องมีชื่อแบรนด์/รหัสรุ่นซ้ำในชื่อ
 */
export interface NameRule {
  source: NameSource;
  /** ตัดคำนำหน้าชื่อ (ข้อความตายตัว) */
  stripPrefix?: string;
  /** ลบชื่อแบรนด์ของสินค้า (brands.name) ออกจากชื่อ */
  removeBrand?: boolean;
  /** ลบชื่อคอลเลกชันของสินค้า (collections.name) ออกจากชื่อ */
  removeCollection?: boolean;
  /** ลบรหัสสินค้า (code ของ Parent SKU) ออกจากชื่อ */
  removeCode?: boolean;
  /** ลบข้อความในวงเล็บ (...) [...] ออกจากชื่อ */
  removeParens?: boolean;
  /** ลบแค่เครื่องหมายวงเล็บ ( ) [ ] — เก็บข้อความข้างในไว้ เช่น "(Rise & Go) กระเป๋า" → "Rise & Go กระเป๋า" (คู่กับ removeParens เปิดได้ทีละอัน) */
  removeParenMarks?: boolean;
}

/** กฎชื่อแบบเปิด/ปิด — ใช้ร่วมกันระหว่าง normalize, API และหน้าจอ */
export const NAME_RULE_FLAGS = ["removeBrand", "removeCollection", "removeCode", "removeParens", "removeParenMarks"] as const;
/** กฎที่เปิดพร้อมกันไม่ได้ (เปิดอันหนึ่ง = ปิดอีกอัน) */
export const NAME_RULE_EXCLUSIVE: Partial<Record<NameRuleFlag, NameRuleFlag>> = { removeParens: "removeParenMarks", removeParenMarks: "removeParens" };
export type NameRuleFlag = (typeof NAME_RULE_FLAGS)[number];

export interface FieldMap {
  name: NameRule;
  price: { source: PriceSource };
  description: { source: DescSource };
  unit: { default: string };
  options: { source: OptionSource; label: string };
  /** เว้น source เป็น "none" = สินค้านั้นมีตัวเลือกชั้นเดียว (ค่าเริ่มต้น ไม่กระทบของเดิม) */
  options2: { source: Option2Source; label: string };
  category: { default: WebCategory; rules: Record<string, WebCategory> };
  /** รายการหมวดของร้านนี้ — เจ้าของเพิ่ม/แก้/ลบเองได้ในแท็บจับคู่ฟิลด์ */
  categories: WebCategoryDef[];
  image: { useCover: boolean; source: ImageSource };
  /** 📖 หน้าคอลเลกชันบนเว็บร้านนี้ (แท็บ 🎞 คอลเลกชัน · lib/website-collections) */
  collections: WebCollection[];
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
  image: { useCover: true, source: "parent" },
  collections: [],
};

const NAME_SOURCES: NameSource[] = ["name_th", "name_platform", "name_en", "sku_name", "code"];
const PRICE_SOURCES: PriceSource[] = ["sku_max", "sku_min", "final_price", "sale_price", "fake_price"];
const DESC_SOURCES: DescSource[] = ["platform_description", "introduction", "description", "english_description", "none"];
/** รหัสหมวดต้องปลอดภัยกับ URL (/c/<key>) — ตัวเล็ก ตัวเลข ขีดกลาง เท่านั้น */
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
      return {
        key: cleanCategoryKey(o.key),
        label: str(o.label).slice(0, 60),
        icon: str(o.icon).slice(0, 8),
        blurb: str(o.blurb).slice(0, 240),
        imageKey: catImgKey(o.imageKey),
        bannerKey: catImgKey(o.bannerKey),
        order: Array.isArray(o.order)
          ? [...new Set((o.order as unknown[]).map((c) => String(c ?? "").trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "")).filter(Boolean))].slice(0, 500)
          : [],
        seoTitle: str(o.seoTitle).replace(/\s+/g, " ").trim().slice(0, 70),
        seoDescription: str(o.seoDescription).replace(/\s+/g, " ").trim().slice(0, 170),
      };
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
      ...Object.fromEntries(NAME_RULE_FLAGS.map((f) => [f, g("name")[f] === true])),
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
    collections: normalizeWebCollections(r.collections),
    image: {
      useCover: g("image").useCover !== false,
      source: (["parent", "skus", "both"] as const).includes(g("image").source as ImageSource) ? (g("image").source as ImageSource) : "parent",
    },
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
  /** คอลเลกชัน (ใช้จับกลุ่ม "คุณอาจชอบ: คอลเลกชันเดียวกัน") */
  collection_id?: string | null;
  brand_id?: string | null;
  /** ชื่อแบรนด์/คอลเลกชัน — เติมด้วย attachNameRefs() เมื่อกฎชื่อของร้านต้องใช้ (ลบแบรนด์/คอลเลกชันออกจากชื่อ) */
  brand_name?: string | null;
  collection_name?: string | null;
  // ฟิลด์สเปก (optional — บางที่ select ไม่ครบ)
  materials?: string | null;
  size_summary?: string | null;
  custom_size?: string | null;
  size_length_cm?: number | string | null;
  size_height_cm?: number | string | null;
  size_thickness_cm?: number | string | null;
  weight_g?: number | string | null;
  lining?: string | null;
  strap?: string | null;
  zipper?: string | null;
  spares?: string | null;
  logo?: string | null;
  thread?: string | null;
  warranty?: string | null;
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
  /** รูปเว็บรายสี { [skuId]: string[] } (ค่าเก่าเป็น string เดี่ยว) — ตั้งในแท็บ 🛍 เว็บไซต์ ของ Parent SKU */
  web_sku_images?: unknown;
  web_unit?: string | null;
  web_category?: string | null;
  /** หมวดบนเว็บหลายหมวด — null = ใช้แบบเดิม (web_category / กฎ / หมวดตั้งต้น) · array = จัดเองแล้ว (ตัวแรก = หมวดหลัก) */
  web_categories?: unknown;
  web_options?: unknown;
  web_badge?: string | null;
  web_stock_status?: string | null;
  web_swatch?: string | null;
}

/** คอลัมน์ที่ต้อง select จาก parent_skus_v2 ให้ resolver ทำงานได้ครบ */
// ⚠️ ต้องเป็น string literal ก้อนเดียว (ห้าม + ต่อ) ไม่งั้น type ของ supabase .select() พัง (GenericStringError)
// ท้ายรายการ = ฟิลด์สเปกสำหรับ "ชุดรายละเอียดสินค้า" บนเว็บ (lib/website-theme.ts PRODUCT_SPEC_FIELDS) — ไม่มีต้นทุน/ข้อมูลภายใน
export const PARENT_SELECT =
  "id, code, name_th, name_en, sku_name, name_platform, introduction, description, platform_description, english_description, sale_price, final_price, fake_price, cover_image_r2_key, category_id, collection_id, brand_id, materials, size_summary, custom_size, size_length_cm, size_height_cm, size_thickness_cm, weight_g, lining, strap, zipper, spares, logo, thread, warranty";

/** ค่าฟิลด์สเปกของ Parent SKU ที่ไม่ว่าง (key → ข้อความพร้อมหน่วย) ส่งให้เว็บร้านโชว์ในหัวข้อ "ฟิลด์จาก Parent SKU" */
export function productSpecAttrs(p: ParentRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of PRODUCT_SPEC_FIELDS) {
    const v = (p as unknown as Record<string, unknown>)[f.key];
    if (v == null) continue;
    const str = typeof v === "number" ? (v > 0 ? String(v) : "") : String(v).trim();
    // ช่องที่กรอกขีด/ไม่มี ("-", "—", "n/a", "ไม่มี") = ไม่มีข้อมูล ไม่ต้องโชว์
    if (!str || /^[-–—._/]+$|^(n\/a|na|none|ไม่มี|ไม่ระบุ)$/i.test(str)) continue;
    // ข้อความยาว (คำแนะนำ/คำอธิบาย EN) ให้พอสำหรับแบนเนอร์ด้วย
    out[f.key] = f.unit ? `${str} ${f.unit}` : str.slice(0, 4000);
  }
  return out;
}

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

const escRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** ลบคำ/วลีออกจากชื่อ (ไม่สนตัวพิมพ์เล็ก/ใหญ่) — ไม่ตัดกลางคำอังกฤษ/ตัวเลข เช่น ลบ "BBP03" ไม่กิน "BBP031" */
function removeTerm(text: string, term: string): string {
  const t = clean(term);
  if (!t) return text;
  return text.replace(new RegExp(`(?<![A-Za-z0-9])${escRe(t)}(?![A-Za-z0-9])`, "gi"), " ");
}

/** เก็บกวาดหลังลบคำ: วงเล็บ/เครื่องหมายคำพูดที่ว่างเปล่า · ช่องว่างซ้อน · ขีด/จุดที่ค้างหัว-ท้าย */
function tidyName(text: string): string {
  return text
    .replace(/[([]\s*[)\]]/g, " ")
    .replace(/(['"])\s*\1|‘\s*’|“\s*”/g, " ")
    .replace(/\s+([,·|])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—:·|,/]+|[\s\-–—:·|,/]+$/g, "")
    .trim();
}

/**
 * ชื่อบนเว็บตามกฎของร้าน (ของกลาง — เว็บจริง, ออเดอร์, หน้าจัดการ, แท็บ 🛍 เว็บไซต์ ใน Parent SKU ใช้ตัวเดียวกัน)
 * ลำดับ: เลือกแหล่งชื่อ → ตัดคำนำหน้า → ลบวงเล็บ/แบรนด์/คอลเลกชัน/รหัส → เก็บกวาด · ลบจนว่าง = ใช้ชื่อเดิม
 * ⚠️ ลบแบรนด์/คอลเลกชันต้องเติม brand_name/collection_name ก่อน (attachNameRefs)
 */
export function resolveName(map: FieldMap, parent: ParentRow): string {
  const raw =
    clean(parent[map.name.source as keyof ParentRow]) ||
    clean(parent.name_th) ||
    clean(parent.name_platform) ||
    clean(parent.code);
  let name = raw;
  const prefix = clean(map.name.stripPrefix);
  // ตัดคำนำหน้าออก (ไม่สนตัวพิมพ์เล็ก/ใหญ่) เช่น "IG International อะไหล่..." → "อะไหล่..."
  if (prefix && name.toLowerCase().startsWith(prefix.toLowerCase())) {
    name = name.slice(prefix.length).replace(/^[\s\-–—:·]+/, "").trim() || name;
  }
  const r = map.name;
  if (r.removeParens) name = name.replace(/\([^()]*\)|\[[^[\]]*\]/g, " ");
  else if (r.removeParenMarks) name = name.replace(/[()[\]]/g, " ");
  if (r.removeBrand && parent.brand_name) name = removeTerm(name, parent.brand_name);
  if (r.removeCollection && parent.collection_name) name = removeTerm(name, parent.collection_name);
  if (r.removeCode && parent.code) name = removeTerm(name, parent.code);
  if (NAME_RULE_FLAGS.some((f) => r[f])) name = tidyName(name);
  return name || raw;
}

/** กฎชื่อของร้านต้องรู้ชื่อแบรนด์/คอลเลกชันไหม (ไม่ต้อง = ข้าม query) */
export const nameRuleNeedsRefs = (map: FieldMap) => !!(map.name.removeBrand || map.name.removeCollection);

/** เติม brand_name / collection_name ให้ Parent SKU (แก้ในตัว) — เรียกก่อน resolveProduct/resolveName */
export async function attachNameRefs(sb: Admin, parents: ParentRow[]): Promise<void> {
  const brandIds = [...new Set(parents.map((p) => p.brand_id).filter(Boolean))] as string[];
  const collIds = [...new Set(parents.map((p) => p.collection_id).filter(Boolean))] as string[];
  const [b, c] = await Promise.all([
    brandIds.length ? sb.from("brands").select("id, name").in("id", brandIds) : { data: [] },
    collIds.length ? sb.from("collections").select("id, name").in("id", collIds) : { data: [] },
  ]);
  const bn = new Map(((b.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
  const cn = new Map(((c.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
  for (const p of parents) {
    p.brand_name = p.brand_id ? bn.get(p.brand_id) ?? null : null;
    p.collection_name = p.collection_id ? cn.get(p.collection_id) ?? null : null;
  }
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

/** รูปเว็บรายสีจาก listing: { [skuId]: string[] } — รองรับค่าเก่าที่เป็น string เดี่ยว */
export function skuImageOverrides(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [skuId, v] of Object.entries(raw as Record<string, unknown>)) {
    const arr = typeof v === "string" ? [v] : Array.isArray(v) ? v : [];
    const keys = [...new Set(arr.filter((k): k is string => typeof k === "string" && k.trim().length > 0))];
    if (keys.length) out[skuId] = keys;
  }
  return out;
}

/** รูปที่จะโชว์ของ SKU ลูกตัวหนึ่ง: รูปเว็บที่เลือกไว้รายสี ชนะรูปปก */
const kidImages = (k: ChildSku, overrides: Record<string, string[]>): string[] =>
  overrides[k.id]?.length ? overrides[k.id] : k.cover_image_r2_key ? [k.cover_image_r2_key] : [];

/** สร้างตัวเลือกจากสีของ SKU ลูก (ตัดสีซ้ำ) */
function resolveOptions(
  map: FieldMap,
  kids: ChildSku[],
  overrides: Record<string, string[]>
): { label: string; items: { id: string; label: string; image?: string | null; images?: string[] }[] } | null {
  if (map.options.source !== "sku_color") return null;
  const seen = new Set<string>();
  const items: { id: string; label: string; image?: string | null; images?: string[] }[] = [];
  for (const k of sortKids(kids)) {
    const label = clean(k.color);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    // รูปของสีนั้น (r2 key) — เว็บร้านใช้สลับแกลเลอรีตอนกดเลือกสี (image = รูปแรก, images = ทั้งชุด)
    const imgs = kidImages(k, overrides);
    items.push({ id: `sku-${k.id.slice(0, 8)}`, label, image: imgs[0] ?? null, images: imgs.length ? imgs : undefined });
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

/**
 * หมวดของสินค้าบนเว็บ (หลายหมวดได้)
 * จัดเองแล้ว (web_categories เป็น array แม้ว่าง) = ใช้ตามนั้น เฉพาะหมวดที่ร้านยังมีอยู่ · ยังไม่เคยจัด (null) = หมวดเดียวแบบเดิม (legacy)
 */
export function resolveCategories(map: Pick<FieldMap, "categories">, webCategories: unknown, legacy: string): string[] {
  const keys = new Set(map.categories.map((c) => c.key));
  if (Array.isArray(webCategories)) return [...new Set(webCategories.map(cleanCategoryKey).filter((k) => keys.has(k)))];
  // แบบเดิม: หมวดเดียว (คงพฤติกรรมเดิมทุกอย่าง แม้รหัสจะไม่อยู่ในรายการหมวด)
  return legacy ? [legacy] : [];
}

export interface ResolvedProduct {
  name: string;
  price: number;
  description: string;
  unit: string;
  /** หมวดหลัก (ตัวแรกของ categories · ว่าง = ไม่อยู่หมวดไหน) */
  category: string;
  /** ทุกหมวดที่สินค้านี้อยู่ (หน้าร้านกรองหมวดด้วยรายการนี้) */
  categories: string[];
  images: string[];
  options: { label: string; items: { id: string; label: string; swatch?: string | null; image?: string | null; images?: string[] }[] } | null;
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

  const parentImages = map.image.useCover && parent.cover_image_r2_key ? [parent.cover_image_r2_key] : [];
  // รูปจาก SKU ลูก (เรียงตามสี ไม่ซ้ำ) — รูปเว็บรายสีที่เลือกไว้ชนะรูปปก · ได้หลายรูป + เว็บสลับชุดรูปตามสีที่เลือกได้
  const skuOverrides = skuImageOverrides(l.web_sku_images);
  const kidImgs = [...new Set(sortKids(kids).flatMap((k) => kidImages(k, skuOverrides)))];
  const mappedImages =
    map.image.source === "skus" ? (kidImgs.length ? kidImgs : parentImages) : map.image.source === "both" ? [...new Set([...parentImages, ...kidImgs])] : parentImages;
  const listingImages = Array.isArray(l.web_images) ? (l.web_images as string[]).filter(Boolean) : [];

  const mappedOptions = resolveOptions(map, kids, skuOverrides);
  const listingOptions =
    l.web_options && typeof l.web_options === "object"
      ? (l.web_options as { label: string; items: { id: string; label: string; swatch?: string | null }[] })
      : null;

  const rule = categoryName ? map.category.rules[categoryName] : undefined;
  const categories = resolveCategories(map, l.web_categories, clean(l.web_category) || rule || map.category.default);

  return {
    name: clean(l.web_name) || resolveName(map, parent),
    price: l.web_price != null && num(l.web_price) > 0 ? num(l.web_price) : resolvePrice(map, parent, kids),
    description: clean(l.web_description) || resolveDescription(map, parent),
    unit: clean(l.web_unit) || map.unit.default,
    category: categories[0] ?? "",
    categories,
    images: listingImages.length ? listingImages : mappedImages,
    options: listingOptions?.items?.length ? listingOptions : mappedOptions,
    // กรอกทับตัวเลือกเองในหน้าจัดการ = ตั้งใจคุมเอง → ไม่ยัดกลุ่ม 2 ตามไปด้วย จะกลายเป็นเลือกไม่ตรงของ
    options2: listingOptions?.items?.length ? null : resolveOptions2(map, kids),
  };
}
