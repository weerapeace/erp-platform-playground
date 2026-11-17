/**
 * 🗂 ทะเบียนช่องของ "สินค้าบนเว็บ" (store_listings) — ของกลาง pure ใช้ได้ทั้ง client/server
 *
 * บอกว่ามีช่องอะไร · ชนิดอะไร · แก้หลายรายการได้ไหม → ป๊อป ✏️ แก้หลายรายการ วาดจากทะเบียนนี้ทั้งหมด (ห้ามฝังช่องในหน้าจอ)
 * เพิ่มช่องใหม่ = เพิ่มที่นี่ + รองรับใน listingPatchToRow (lib/website-listing-patch) → ป๊อปขึ้นเอง · API กรองตาม BULK_PATCH_KEYS
 *
 * ไม่เปิดแก้หลายรายการ (เป็นของเฉพาะรุ่น): รูป · รูปรายสี · แบนเนอร์ · ปั๊มชื่อ · รายละเอียดเฉพาะรุ่น · สีบนการ์ด · รูปเปิด
 * ชื่อ/คำอธิบาย: แก้หลายรายการได้แค่ "ล้างกลับเป็นอัตโนมัติ" (แต่ละรุ่นไม่ควรมีค่าเดียวกัน)
 */
import type { ListingPatch } from "@/lib/website-listing-patch";
import { tr } from "@/lib/lang";

export const STOCK_STATUS_OPTIONS = [
  { value: "in", get label() { return tr("พร้อมส่ง", "In stock"); } },
  { value: "low", get label() { return tr("เหลือน้อย", "Low stock"); } },
  { value: "preorder", get label() { return tr("สั่งจอง", "Pre-order"); } },
  // 🚫 สินค้าหมด: เว็บโชว์ป้าย "สินค้าหมด" + กดซื้อไม่ได้ + ออเดอร์ถูกปฏิเสธที่เซิร์ฟเวอร์ · หน้ารายการ: ไปท้าย/ซ่อน ตามที่ตั้ง (theme.listing.soldOut)
  { value: "out", get label() { return tr("สินค้าหมด", "Sold out"); } },
];

export type ListingFieldKind = "choice" | "price" | "categories" | "badge" | "text" | "clear";
export type ListingFieldKey = "published" | "featured" | "price" | "categories" | "badge" | "stockStatus" | "unit" | "name" | "description";

export interface ListingFieldDef {
  key: ListingFieldKey;
  label: string;
  kind: ListingFieldKind;
  choices?: { value: string; label: string }[];
  hint?: string;
  /** แก้หลายรายการได้ไหม */
  bulk: boolean;
}

export const LISTING_FIELDS: ListingFieldDef[] = [
  { key: "published", get label() { return tr("ขึ้นเว็บ", "Live"); }, kind: "choice", bulk: true, choices: [{ value: "on", get label() { return tr("ขึ้นเว็บ", "Live"); } }, { value: "off", get label() { return tr("ซ่อน", "Hidden"); } }] },
  { key: "featured", get label() { return tr("สินค้าแนะนำ", "Featured"); }, kind: "choice", bulk: true, choices: [{ value: "on", get label() { return tr("ตั้งแนะนำ", "Set featured"); } }, { value: "off", get label() { return tr("เลิกแนะนำ", "Unset featured"); } }] },
  { key: "price", get label() { return tr("ราคาเว็บ", "Web price"); }, kind: "price", bulk: true, get hint() { return tr("ล้าง = กลับไปใช้ราคาจาก ERP", "Clear = go back to the ERP price"); } },
  { key: "categories", get label() { return tr("หมวดบนเว็บ", "Web categories"); }, kind: "categories", bulk: true, get hint() { return tr("เพิ่ม / เอาออก / แทนทั้งชุด / ย้ายหมวด", "Add / remove / replace all / move category"); } },
  { key: "badge", get label() { return tr("ป้ายบนการ์ด", "Card badge"); }, kind: "badge", bulk: true },
  { key: "stockStatus", get label() { return tr("สถานะสต๊อก", "Stock status"); }, kind: "choice", bulk: true, choices: STOCK_STATUS_OPTIONS },
  { key: "unit", get label() { return tr("หน่วยขาย", "Sales unit"); }, kind: "text", bulk: true, get hint() { return tr("ว่าง = ใช้หน่วยจาก ERP", "Empty = use the ERP unit"); } },
  { key: "name", get label() { return tr("ชื่อบนเว็บ", "Web name"); }, kind: "clear", bulk: true, get hint() { return tr("ล้างกลับเป็นชื่ออัตโนมัติ (ตามกฎชื่อร้าน)", "Reset to the automatic name (shop naming rule)"); } },
  { key: "description", get label() { return tr("คำอธิบายบนเว็บ", "Web description"); }, kind: "clear", bulk: true, get hint() { return tr("ล้างกลับเป็นคำอธิบายจาก ERP", "Reset to the ERP description"); } },
];
export const BULK_FIELDS = LISTING_FIELDS.filter((f) => f.bulk);

/** ช่องของ ListingPatch ที่ API ยอมให้แก้หลายรายการ (ชื่อ/คำอธิบาย = ล้างเท่านั้น) */
export const BULK_PATCH_KEYS = ["isPublished", "featured", "webPrice", "webBadge", "webStockStatus", "webUnit", "webName", "webDescription"] as const;

/** move = ย้ายจากหมวด from → หมวด keys[0] (แทนที่ตำแหน่งเดิม · หมวดหลักยังเป็นหมวดหลัก · รุ่นที่ไม่ได้อยู่หมวด from ไม่เปลี่ยน) */
export type CategoriesOp = { mode: "add" | "remove" | "replace" | "move"; keys: string[]; from?: string };
export type PriceOp = { mode: "set" | "clear"; value?: number };
/** ค่าที่ป๊อปส่งมา (เฉพาะช่องที่ติ๊ก) */
export type MassEditValues = Partial<{
  published: string;
  featured: string;
  price: PriceOp;
  categories: CategoriesOp;
  badge: string;
  stockStatus: string;
  unit: string;
  name: true;
  description: true;
}>;

/** ค่าในป๊อป → patch เดียวกันทุกรุ่น + คำสั่งหมวด (คิดต่อรุ่น) · ผิด = บอกว่าต้องแก้อะไร */
export function massEditPlan(v: MassEditValues): { ok: true; patch: ListingPatch; categories: CategoriesOp | null } | { ok: false; error: string } {
  const patch: ListingPatch = {};
  if (v.published !== undefined) {
    if (v.published !== "on" && v.published !== "off") return { ok: false, error: tr("เลือกว่าจะขึ้นเว็บหรือซ่อน", "Choose Live or Hidden") };
    patch.isPublished = v.published === "on";
  }
  if (v.featured !== undefined) {
    if (v.featured !== "on" && v.featured !== "off") return { ok: false, error: tr("เลือกว่าจะตั้งหรือเลิกแนะนำ", "Choose set or unset featured") };
    patch.featured = v.featured === "on";
  }
  if (v.price) {
    if (v.price.mode === "clear") patch.webPrice = null;
    else {
      const n = Number(v.price.value);
      if (!(n > 0)) return { ok: false, error: tr("ใส่ราคาเว็บให้มากกว่า 0 (หรือเลือก 'ล้าง')", "Enter a web price above 0 (or choose 'Clear')") };
      patch.webPrice = Math.round(n * 100) / 100;
    }
  }
  if (v.badge !== undefined) patch.webBadge = String(v.badge).trim().slice(0, 40);
  if (v.stockStatus !== undefined) {
    if (!STOCK_STATUS_OPTIONS.some((o) => o.value === v.stockStatus)) return { ok: false, error: tr("เลือกสถานะสต๊อก", "Choose a stock status") };
    patch.webStockStatus = v.stockStatus;
  }
  if (v.unit !== undefined) patch.webUnit = String(v.unit).trim().slice(0, 40);
  if (v.name) patch.webName = "";
  if (v.description) patch.webDescription = "";
  let categories: CategoriesOp | null = null;
  if (v.categories) {
    const keys = [...new Set((v.categories.keys ?? []).filter((k) => typeof k === "string" && k))];
    if (!["add", "remove", "replace", "move"].includes(v.categories.mode)) return { ok: false, error: tr("เลือกว่าจะเพิ่ม/เอาออก/แทน/ย้ายหมวด", "Choose add / remove / replace / move category") };
    if (v.categories.mode === "move") {
      const from = typeof v.categories.from === "string" ? v.categories.from : "";
      if (!from) return { ok: false, error: tr("เลือกหมวดต้นทาง (ย้ายจากหมวดไหน)", "Pick the source category (move from which one)") };
      if (keys.length !== 1) return { ok: false, error: tr("เลือกหมวดปลายทาง 1 หมวด", "Pick 1 target category") };
      if (keys[0] === from) return { ok: false, error: tr("หมวดต้นทางกับปลายทางต้องไม่ใช่หมวดเดียวกัน", "Source and target categories must be different") };
      categories = { mode: "move", keys, from };
    } else {
      if (v.categories.mode !== "replace" && !keys.length) return { ok: false, error: tr("เลือกหมวดที่จะเพิ่ม/เอาออกก่อน", "Pick the categories to add / remove first") };
      categories = { mode: v.categories.mode, keys };
    }
  }
  if (!Object.keys(patch).length && !categories) return { ok: false, error: tr("ติ๊กช่องที่จะแก้อย่างน้อย 1 ช่อง", "Tick at least 1 field to edit") };
  return { ok: true, patch, categories };
}

/** หมวดใหม่ของ 1 รุ่น (คงลำดับเดิม · ตัวแรก = หมวดหลัก) */
export function applyCategoriesOp(current: string[], op: CategoriesOp): string[] {
  if (op.mode === "replace") return [...op.keys];
  if (op.mode === "add") return [...current, ...op.keys.filter((k) => !current.includes(k))];
  if (op.mode === "move") {
    if (!op.from || !current.includes(op.from) || !op.keys[0]) return current;
    return [...new Set(current.map((k) => (k === op.from ? op.keys[0] : k)))];
  }
  return current.filter((k) => !op.keys.includes(k));
}

/** กรอง patch ที่ API รับจากแก้หลายรายการ (ช่องอื่นทิ้ง · ชื่อ/คำอธิบายรับแค่ค่าว่าง) */
export function sanitizeBulkPatch(p: ListingPatch): ListingPatch {
  const out: Record<string, unknown> = {};
  for (const k of BULK_PATCH_KEYS) {
    if (p[k] === undefined) continue;
    if ((k === "webName" || k === "webDescription") && String(p[k] ?? "").trim()) continue;
    out[k] = p[k];
  }
  return out as ListingPatch;
}

// ───────────── ▦ แก้ไขแบบตาราง — ทุกช่องของ "สินค้าบนเว็บร้านนี้" (ทีละรุ่น · ค่าต่างกันได้ทุกแถว) ─────────────
// ตาราง (components/website-listings-grid-edit) วาดคอลัมน์ฝั่งเว็บจากรายการนี้ · ฝั่ง ERP (Parent SKU / SKU) อ่านจากทะเบียนฟิลด์กลาง
// เพิ่มช่องเว็บใหม่ = เพิ่มที่นี่ + listingPatchToRow + WEB_GRID_COLUMNS → ตารางขึ้นเอง · API (/api/website/listings/grid) รับเฉพาะ WEB_GRID_PATCH_KEYS

export type WebGridKind = "bool" | "text" | "textarea" | "money" | "stock" | "categories" | "badge" | "sizeGuide" | "codes";
export type WebGridValue = string | boolean | string[];

/** แถว store_listings ดิบ (เฉพาะคอลัมน์ที่ตารางใช้) */
export interface WebGridRow {
  parent_sku_id: string;
  is_published: boolean | null;
  featured: boolean | null;
  web_name: string | null;
  web_price: number | string | null;
  web_description: string | null;
  web_unit: string | null;
  web_categories: string[] | null;
  web_badge: string | null;
  web_stock_status: string | null;
  web_swatch: string | null;
  web_size_guide: string | null;
  web_seo: unknown;
  web_related: string[] | null;
}
export const WEB_GRID_COLUMNS =
  "parent_sku_id, is_published, featured, web_name, web_price, web_description, web_unit, web_categories, web_badge, web_stock_status, web_swatch, web_size_guide, web_seo, web_related";

export interface WebGridField {
  key: string;
  label: string;
  kind: WebGridKind;
  hint?: string;
  read: (r: WebGridRow) => WebGridValue;
}

const s = (v: unknown) => (v == null ? "" : String(v));
const seoOf = (r: WebGridRow) => (r.web_seo && typeof r.web_seo === "object" ? (r.web_seo as Record<string, unknown>) : {});

export const WEB_GRID_FIELDS: WebGridField[] = [
  { key: "published", get label() { return tr("ขึ้นเว็บ", "Live"); }, kind: "bool", read: (r) => !!r.is_published },
  { key: "featured", get label() { return tr("สินค้าแนะนำ", "Featured"); }, kind: "bool", read: (r) => !!r.featured },
  { key: "webName", get label() { return tr("ชื่อบนเว็บ", "Web name"); }, kind: "text", get hint() { return tr("ว่าง = ชื่ออัตโนมัติตามกฎชื่อร้าน", "Empty = automatic name from the shop naming rule"); }, read: (r) => s(r.web_name) },
  { key: "webPrice", get label() { return tr("ราคาเว็บ", "Web price"); }, kind: "money", get hint() { return tr("ว่าง = ราคาจาก ERP", "Empty = ERP price"); }, read: (r) => (Number(r.web_price) > 0 ? String(Number(r.web_price)) : "") },
  { key: "webDescription", get label() { return tr("คำอธิบายบนเว็บ", "Web description"); }, kind: "textarea", get hint() { return tr("ว่าง = คำอธิบายจาก ERP", "Empty = ERP description"); }, read: (r) => s(r.web_description) },
  { key: "webUnit", get label() { return tr("หน่วยขาย", "Sales unit"); }, kind: "text", get hint() { return tr("ว่าง = หน่วยจาก ERP", "Empty = ERP unit"); }, read: (r) => s(r.web_unit) },
  { key: "webCategories", get label() { return tr("หมวดบนเว็บ", "Web categories"); }, kind: "categories", get hint() { return tr("ตัวแรก = หมวดหลัก", "First = main category"); }, read: (r) => (Array.isArray(r.web_categories) ? r.web_categories : []) },
  { key: "webBadge", get label() { return tr("ป้ายบนการ์ด", "Card badge"); }, kind: "badge", read: (r) => s(r.web_badge) },
  { key: "webStockStatus", get label() { return tr("สถานะสต๊อก", "Stock status"); }, kind: "stock", read: (r) => s(r.web_stock_status) || "in" },
  { key: "webSwatch", get label() { return tr("จุดสีการ์ด", "Card color dot"); }, kind: "text", get hint() { return tr("สี CSS เช่น #222 (ว่าง = ตามสี SKU)", "CSS color, e.g. #222 (empty = follow the SKU color)"); }, read: (r) => s(r.web_swatch) },
  { key: "webSizeGuide", get label() { return tr("ตารางไซส์", "Size guide"); }, kind: "sizeGuide", get hint() { return tr("ว่าง = อัตโนมัติตามหมวด", "Empty = automatic by category"); }, read: (r) => s(r.web_size_guide) },
  { key: "seo.title", get label() { return tr("SEO ชื่อ", "SEO title"); }, kind: "text", read: (r) => s(seoOf(r).title) },
  { key: "seo.description", get label() { return tr("SEO คำอธิบาย", "SEO description"); }, kind: "textarea", read: (r) => s(seoOf(r).description) },
  { key: "seo.title_en", get label() { return tr("SEO ชื่อ (EN)", "SEO title (EN)"); }, kind: "text", read: (r) => s(seoOf(r).title_en) },
  { key: "seo.description_en", get label() { return tr("SEO คำอธิบาย (EN)", "SEO description (EN)"); }, kind: "textarea", read: (r) => s(seoOf(r).description_en) },
  { key: "webRelated", get label() { return tr("สินค้าที่เกี่ยวข้อง (รหัส)", "Related products (codes)"); }, kind: "codes", get hint() { return tr("รหัส Parent SKU คั่นด้วย , · ว่าง = ตามกฎกลางของธีม", "Parent SKU codes separated by , · empty = theme's default rule"); }, read: (r) => (Array.isArray(r.web_related) ? r.web_related.join(", ") : "") },
];

/** ช่องของ ListingPatch ที่ API ตารางรับ */
export const WEB_GRID_PATCH_KEYS = [
  "isPublished",
  "featured",
  "webName",
  "webPrice",
  "webDescription",
  "webUnit",
  "webCategories",
  "webBadge",
  "webStockStatus",
  "webSwatch",
  "webSizeGuide",
  "webSeo",
  "webRelated",
] as const;

/** ตรวจค่าก่อนบันทึก — คืนข้อความภาษาคน (null = ผ่าน) */
export function webGridValidate(key: string, v: WebGridValue): string | null {
  const f = WEB_GRID_FIELDS.find((x) => x.key === key);
  if (!f) return tr("ไม่รู้จักช่องนี้", "Unknown field");
  if (f.kind === "money" && String(v).trim() !== "" && !(Number(String(v).replace(/,/g, "")) > 0)) return tr("ราคาต้องเป็นตัวเลขมากกว่า 0 (หรือเว้นว่าง)", "Price must be a number above 0 (or empty)");
  if (f.kind === "stock" && !STOCK_STATUS_OPTIONS.some((o) => o.value === v)) return tr("เลือกสถานะสต๊อก", "Choose a stock status");
  return null;
}

/** ค่าที่เปลี่ยนในตาราง (key → ค่าใหม่) → ListingPatch · SEO รวมกับค่าเดิมของแถว (4 ช่องเก็บก้อนเดียว) */
export function webGridPatch(row: WebGridRow, changes: Record<string, WebGridValue>): ListingPatch {
  const p: ListingPatch = {};
  const seo: Record<string, string> = {};
  for (const [k, v] of Object.entries(changes)) {
    switch (k) {
      case "published": p.isPublished = v === true; break;
      case "featured": p.featured = v === true; break;
      case "webName": p.webName = String(v); break;
      case "webPrice": {
        const n = Number(String(v).replace(/,/g, ""));
        p.webPrice = String(v).trim() === "" || !(n > 0) ? null : Math.round(n * 100) / 100;
        break;
      }
      case "webDescription": p.webDescription = String(v); break;
      case "webUnit": p.webUnit = String(v); break;
      case "webCategories": p.webCategories = Array.isArray(v) ? v : []; break;
      case "webBadge": p.webBadge = String(v); break;
      case "webStockStatus": p.webStockStatus = String(v); break;
      case "webSwatch": p.webSwatch = String(v); break;
      case "webSizeGuide": p.webSizeGuide = String(v); break;
      case "webRelated": p.webRelated = String(v).split(/[\s,]+/).filter(Boolean); break;
      default:
        if (k.startsWith("seo.")) seo[k.slice(4)] = String(v);
    }
  }
  if (Object.keys(seo).length) {
    const cur = seoOf(row);
    p.webSeo = {
      title: s(cur.title),
      description: s(cur.description),
      title_en: s(cur.title_en),
      description_en: s(cur.description_en),
      ...seo,
    };
  }
  return p;
}

/** กรอง patch ที่ API ตารางรับ (ช่องอื่นทิ้ง) */
export function sanitizeGridPatch(p: ListingPatch): ListingPatch {
  const out: Record<string, unknown> = {};
  for (const k of WEB_GRID_PATCH_KEYS) if (p[k] !== undefined) out[k] = p[k];
  return out as ListingPatch;
}
