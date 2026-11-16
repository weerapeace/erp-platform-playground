/**
 * 📤 ส่งออกรายละเอียดสินค้า (หลายรุ่น → Excel) — กฎกลาง (ไม่มี UI / ไม่แตะฐานข้อมูล · เทสต์ได้)
 *
 *   หน้าใช้: app/master/parent-skus/export (ส่งออกรายละเอียด) · API: /api/parent-skus/spec-export
 *   คู่มือ: docs/spec-export.md
 *
 *   1) buildSpecCatalog — ทะเบียนฟิลด์กลาง (erp_module_fields ของ parent_skus_v2 + skus_v2) → รายการช่องให้เลือก
 *      - ทุกฟิลด์ในทะเบียน (ยกเว้น id/ระบบ/ข้อมูลดิบที่อ่านไม่รู้เรื่อง) · จัดหมวดตามงาน (ข้อมูลหลัก/รายละเอียด Platform/ขนาด/…)
 *      - คู่ภาษา TH↔EN อ่านจาก ui_style.lang_en ของทะเบียน (ตัวเดียวกับปุ่ม TH/EN ในป๊อป Parent SKU) → รวมเป็นช่องเดียว
 *      - ช่องที่ทะเบียนติ๊ก is_sensitive → ต้องมีสิทธิ์ sensitive_permission (ราคา/ต้นทุน = products.cost.view)
 *   2) buildSheetPlan — ข้อมูลสินค้า + ช่องที่เลือก + ภาษา + แบบแสดง → ตาราง (หัว 1-2 ชั้น · แถว · ช่องรวม · ช่องที่ยังไม่แปล)
 *      แบบแสดง: "parent" 1 รุ่น = 1 แถว · "summary" + ช่องสรุปสี · "kids" แยกแถวตาม SKU ลูก (ช่องของรุ่นรวมเป็นช่องเดียว/ซ้ำทุกแถว)
 */

/** ส่งรายการรุ่นจากหน้า Parent SKUs (ติ๊กหลายแถว → "ส่งออกรายละเอียด") มาหน้าส่งออก ผ่าน sessionStorage */
export const SPEC_EXPORT_IDS_KEY = "spec-export-ids";
export const SPEC_EXPORT_PATH = "/master/parent-skus/export";

export type SpecLevel = "parent" | "sku";
export type SpecLang = "th" | "en" | "both";
export type SpecMode = "parent" | "summary" | "kids";
export type SpecKind = "text" | "number" | "image" | "relation" | "related" | "computed" | "json" | "bool" | "date";

export interface SpecField {
  /** คีย์ไม่ซ้ำ: "p:<field_key>" (รุ่น) · "s:<field_key>" (SKU ลูก) */
  key: string;
  level: SpecLevel;
  fieldKey: string;
  /** ช่องฝั่งไทย (หรือช่องเดียวถ้าไม่มีคู่ภาษา) */
  column: string;
  /** ช่องฝั่งอังกฤษ (มีคู่ภาษา) */
  enColumn?: string;
  label: string;
  labelEn: string;
  cat: string;
  kind: SpecKind;
  /** สิทธิ์ที่ต้องมีจึงเห็นช่องนี้ */
  perm?: string;
  /** ช่องผูก (เก็บ id) → ตาราง + ช่องชื่อ */
  relation?: { table: string; labelField: string };
  /** ดึงค่าจากตารางอื่นผ่าน <via> */
  related?: { via: string; table: string; field: string };
  /** ข้อความคำนวณ (lib/computed-text) */
  compute?: { name: string; cfg?: Record<string, unknown> | null; enName?: string; enCfg?: Record<string, unknown> | null };
}

export const SPEC_CATS: { key: string; label: string; labelEn: string }[] = [
  { key: "main", label: "ข้อมูลหลัก", labelEn: "Main" },
  { key: "plat", label: "รายละเอียด Platform", labelEn: "Platform details" },
  { key: "size", label: "ขนาด / น้ำหนัก", labelEn: "Size / weight" },
  { key: "mat", label: "วัสดุ", labelEn: "Materials" },
  { key: "price", label: "ราคา (ต้องมีสิทธิ์)", labelEn: "Price" },
  { key: "cost", label: "ต้นทุน (ต้องมีสิทธิ์)", labelEn: "Cost" },
  { key: "link", label: "ลิงก์ร้านค้า", labelEn: "Links" },
  { key: "img", label: "รูป", labelEn: "Images" },
  { key: "other", label: "อื่น ๆ", labelEn: "Other" },
  { key: "sku", label: "SKU ลูก (สี)", labelEn: "SKU (colour)" },
  { key: "sku_buy", label: "SKU ลูก — จัดซื้อ", labelEn: "SKU purchasing" },
];
export const SPEC_CAT_LABEL: Record<string, string> = Object.fromEntries(SPEC_CATS.map((c) => [c.key, c.label]));

/** แถวทะเบียนฟิลด์ (เฉพาะคอลัมน์ที่ใช้) */
export interface RegistryFieldRow {
  field_key: string;
  column_name: string | null;
  field_label: string | null;
  field_label_en?: string | null;
  ui_field_type: string | null;
  data_type?: string | null;
  group_key?: string | null;
  is_active?: boolean | null;
  is_sensitive?: boolean | null;
  sensitive_permission?: string | null;
  relation_config?: Record<string, unknown> | null;
  ui_style?: Record<string, unknown> | null;
  display_order?: number | null;
}

/** คู่ภาษาที่ทะเบียนยังไม่ได้ตั้ง (ui_style.lang_en) — ใช้เมื่อทะเบียนไม่มี */
const FALLBACK_PAIRS: Record<SpecLevel, Record<string, string>> = {
  parent: { name_th: "name_en", introduction: "introduction_en", description: "english_description", name_platform: "name_platform_en", platform_description: "platform_description_en" },
  sku: { name_th: "name_en", color_platform_th: "color_platform_en" },
};

/** ไม่ให้เลือกเลย: id/ระบบ/คีย์ภายใน */
const SKIP_KEY = /^(id|parent_sku_id|odoo_form_details|odoo_form_synced_at|attribute_values|color_index|other_cost_detail_html)$/;
const SKIP_UI = new Set(["one2many", "many2many", "file", "button"]);

const PARENT_CAT: [RegExp, string][] = [
  [/cost|^costs$/, "cost"],
  [/price/, "price"],
  [/^(code|sku_name|brand_id|category_id|collection_id|platform_category_id|product_family|warranty|is_active)$/, "main"],
  [/^(name_|introduction|description|english_description|platform_description|highlights|fits|compartments|special_description|size_description|how_to_size|brand_name)/, "plat"],
  [/^(size_|handle_drop|strap_drop|custom_size|weight_g|show_weight|parcel_size)/, "size"],
  [/^(materials|zipper|logo|spares|lining|strap|thread|belt_hole)$/, "mat"],
  [/_url$|^file_location$/, "link"],
];
const SKU_CAT: [RegExp, string][] = [
  [/^(standard_price|rmb_cost|moq|seller_partner_id|purchase_link|links|purchase_uom|purchase_description|alt_|supplier_sku_code|name_cn|purchase_ok)/, "sku_buy"],
];

/** ป้ายไทยของช่องที่ทะเบียนยังเป็นชื่ออัตโนมัติ (เช่น "Brand Id") */
const LABEL_TH: Record<string, string> = {
  code: "รหัส", brand_id: "แบรนด์", category_id: "หมวดหมู่", collection_id: "คอลเลกชัน", sku_name: "ชื่อ SKU",
  name_th: "ชื่อสินค้า", name_en: "ชื่อสินค้า (EN)", name_platform: "Name Platform", introduction: "Introduction", description: "Description",
  english_description: "Description (EN)", platform_description: "Platform description", size_summary: "สรุปขนาด", custom_size: "ขนาดเพิ่มเติม",
  weight_g: "น้ำหนัก (ก.)", warranty: "การรับประกัน", parcel_size_id: "ขนาดกล่องพัสดุ", size_description_id: "คำอธิบายขนาด",
  special_description_id: "คำอธิบายพิเศษ", shopee_url: "ลิงก์ Shopee", lazada_url: "ลิงก์ Lazada", tiktok_url: "ลิงก์ TikTok",
  file_location: "ที่เก็บไฟล์", materials: "วัสดุ", zipper: "ซิป", logo: "โลโก้", spares: "อะไหล่", lining: "ซับใน", strap: "สาย", thread: "ด้าย",
  hardware: "อะไหล่โลหะ", additional: "อื่น ๆ", sale_price: "ราคาขาย", final_price: "ราคาสุดท้าย", fake_price: "ราคาก่อนลด", list_price: "ราคาขาย",
  standard_price: "ต้นทุน", rmb_cost: "ต้นทุน (หยวน)", costs: "ต้นทุนรวม", product_cost: "ต้นทุนสินค้า", cover_image_r2_key: "รูปหลัก",
  barcode: "บาร์โค้ด", color: "สี (EN)", color_th: "สี", color_platform_th: "สีสำหรับลงขาย", uom_id: "หน่วย", purchase_uom_id: "หน่วยซื้อ",
  seller_partner_id: "ร้านที่ซื้อ", moq: "สั่งขั้นต่ำ", work_instruction_notes: "โน้ตการผลิต", created_at: "วันที่สร้าง", updated_at: "แก้ไขล่าสุด",
  is_active: "ใช้งานอยู่", sale_ok: "ขายได้", product_type: "ชนิดสินค้า", product_group: "กลุ่มสินค้า",
};
/** หัวคอลัมน์ภาษาอังกฤษ (ใช้เมื่อเลือกภาษา English) — ทะเบียนมี field_label_en ใช้ของทะเบียนก่อน */
const LABEL_EN: Record<string, string> = {
  code: "Code", brand_id: "Brand", category_id: "Category", collection_id: "Collection", name_th: "Product name", name_platform: "Platform name",
  introduction: "Introduction", description: "Description", platform_description: "Platform description", size_length_cm: "Width (cm)",
  size_height_cm: "Height (cm)", size_thickness_cm: "Depth (cm)", handle_drop_cm: "Handle drop (cm)", strap_drop_cm: "Strap drop (cm)",
  strap_drop_max_cm: "Max strap drop (cm)", size_summary: "Size", weight_g: "Weight (g)", materials: "Material", zipper: "Zipper", lining: "Lining",
  strap: "Strap", thread: "Thread", logo: "Logo", warranty: "Warranty", highlights: "Highlights", fits: "Fits", compartments: "Compartments",
  cover_image_r2_key: "Image", png_image_r2_key: "Cut-out image (PNG)", sale_price: "Price", list_price: "Price", fake_price: "Compare-at price",
  barcode: "Barcode", color_th: "Colour", color_platform_th: "Colour", parcel_size_id: "Parcel size",
};

const autoLabel = (key: string) => key.split("_").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : "")).join(" ");
const isAuto = (key: string, label: string) => {
  const l = label.trim().toLowerCase().replace(/\s*\[(en|th)\]$/, "");
  return !l || l === autoLabel(key).toLowerCase() || l === autoLabel(key.replace(/_(en|th)$/, "")).toLowerCase() || l === key.toLowerCase();
};
function thLabel(key: string, reg: string | null | undefined): string {
  const r = (reg ?? "").trim();
  // ป้ายทะเบียนเป็นอังกฤษล้วน (เช่น "Sale Price") แต่มีป้ายไทยสำรอง → ใช้ไทย
  if (r && !isAuto(key, r) && !(LABEL_TH[key] && /^[\x20-\x7e]+$/.test(r))) return r;
  return LABEL_TH[key] ?? (r || autoLabel(key));
}
function enLabel(key: string, reg: string | null | undefined, regLabel: string | null | undefined): string {
  const r = (reg ?? "").trim();
  if (r) return r;
  if (LABEL_EN[key]) return LABEL_EN[key];
  const th = (regLabel ?? "").trim();
  return th && /^[\x20-\x7e]+$/.test(th) ? th.replace(/\s*\[(en|th)\]$/i, "") : autoLabel(key.replace(/_id$/, ""));
}

function kindOf(r: RegistryFieldRow): SpecKind {
  const ui = r.ui_field_type ?? "text";
  if (ui === "image") return "image";
  if (ui === "relation") return "relation";
  if (ui === "related") return "related";
  if (ui === "computed") return "computed";
  if (ui === "json") return "json";
  if (ui === "boolean") return "bool";
  if (ui === "date" || ui === "datetime") return "date";
  if (ui === "number" || ui === "currency") return "number";
  return "text";
}

function catOf(level: SpecLevel, key: string, group: string | null | undefined, kind: SpecKind): string {
  if (kind === "image") return level === "sku" ? "sku" : "img";
  if (level === "sku") {
    for (const [re, c] of SKU_CAT) if (re.test(key)) return c;
    return "sku";
  }
  for (const [re, c] of PARENT_CAT) if (re.test(key)) return c;
  return group === "media" ? "img" : "other";
}

/**
 * ทะเบียนฟิลด์ → รายการช่องให้เลือก (เรียงตามทะเบียน · คู่ภาษา TH/EN รวมเป็นช่องเดียว)
 * can = สิทธิ์ของผู้ใช้ · ช่องที่ไม่มีสิทธิ์ตัดทิ้ง (ฝั่ง server ตัดซ้ำอีกชั้น)
 */
export function buildSpecCatalog(
  parentRows: RegistryFieldRow[],
  skuRows: RegistryFieldRow[],
  can: (perm: string) => boolean = () => true,
): SpecField[] {
  const out: SpecField[] = [];
  const build = (rows: RegistryFieldRow[], level: SpecLevel) => {
    const active = rows.filter((r) => r.is_active !== false && r.field_key);
    const byKey = new Map(active.map((r) => [r.field_key, r]));
    // ช่องที่เป็นฝั่งอังกฤษของช่องอื่น (ไม่โชว์แยก)
    const enOf = new Map<string, string>();
    const pairOf = (r: RegistryFieldRow): string => {
      const en = r.ui_style?.lang_en;
      if (typeof en === "string" && en) return en;
      return FALLBACK_PAIRS[level][r.field_key] ?? "";
    };
    for (const r of active) {
      const en = pairOf(r);
      if (typeof en === "string" && en && byKey.has(en) && en !== r.field_key) enOf.set(en, r.field_key);
    }
    const sorted = [...active].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    for (const r of sorted) {
      const key = r.field_key;
      if (enOf.has(key) || SKIP_KEY.test(key)) continue;
      const ui = r.ui_field_type ?? "text";
      if (SKIP_UI.has(ui)) continue;
      const kind = kindOf(r);
      if (kind !== "related" && kind !== "computed" && !r.column_name) continue;
      if (!/^[a-z0-9_]+$/.test(key)) continue;
      const perm = r.is_sensitive ? (r.sensitive_permission || "products.cost.view") : undefined;
      if (perm && !can(perm)) continue;
      const enKey = pairOf(r);
      const enRow = enKey ? byKey.get(enKey) : undefined;
      const rc = (r.relation_config ?? {}) as Record<string, unknown>;
      const f: SpecField = {
        key: `${level === "parent" ? "p" : "s"}:${key}`,
        level, fieldKey: key,
        column: r.column_name || key,
        label: thLabel(key, r.field_label),
        labelEn: enLabel(key, r.field_label_en, r.field_label),
        cat: catOf(level, key, r.group_key, kind),
        kind,
      };
      if (enRow && (enRow.column_name || kindOf(enRow) === "computed")) f.enColumn = enRow.column_name || enRow.field_key;
      if (perm) f.perm = perm;
      if (kind === "relation") {
        const table = String(rc.target_table ?? rc.table ?? "");
        const labelField = String(rc.target_label_field ?? rc.label_field ?? "name");
        if (!/^[a-z0-9_]+$/.test(table) || !/^[a-z0-9_]+$/.test(labelField)) continue;
        f.relation = { table, labelField };
      }
      if (kind === "related") {
        const via = String(rc.via_column ?? rc.via_field ?? ""), table = String(rc.target_table ?? ""), field = String(rc.target_field ?? "");
        if (rc.resolve_table) continue;   // ดึงต่อ 2 ทอด (เช่น แบรนด์ของ SKU ผ่านรุ่น) — ใช้ช่องของรุ่นแทน
        if (!/^[a-z0-9_]+$/.test(via) || !/^[a-z0-9_]+$/.test(table) || !/^[a-z0-9_]+$/.test(field)) continue;
        f.related = { via, table, field };
      }
      if (kind === "computed") {
        const name = typeof rc.text_compute === "string" ? rc.text_compute : "";
        if (!name) continue;   // computed ตัวเลข (สูตร) ไม่รองรับในการส่งออก
        f.compute = { name, cfg: rc };
        if (enRow) {
          const erc = (enRow.relation_config ?? {}) as Record<string, unknown>;
          if (typeof erc.text_compute === "string") f.compute.enName = erc.text_compute, f.compute.enCfg = erc;
        }
      }
      // ช่องคู่ภาษาที่ป้ายไทยมี "(EN)" ติด → ตัดออก (ช่องนี้ออกตามภาษาที่เลือก)
      f.label = f.label.replace(/\s*\((TH|EN)\)$/i, "");
      out.push(f);
    }
  };
  build(parentRows, "parent");
  build(skuRows, "sku");
  return out;
}

/** ค่าเริ่มต้นของชุดช่อง (ยังไม่มีชุดที่บันทึก) — ตามตัวอย่างที่เจ้าของเลือก */
export const DEFAULT_SPEC_KEYS = [
  "p:code", "p:name_th", "p:introduction", "p:description", "p:size_length_cm", "p:size_height_cm", "p:size_thickness_cm",
  "p:materials", "p:cover_image_r2_key", "s:code", "s:color_platform_th", "s:list_price", "s:cover_image_r2_key",
];

// ─────────────────────────────────────────────────────────────────────────
// ข้อมูลสินค้าที่ API ส่งมา (ค่าพร้อมโชว์แล้ว)
// ─────────────────────────────────────────────────────────────────────────
export type SpecValue = string | number | null;
export interface SpecKid { id: string; code: string; active: boolean; values: Record<string, SpecValue> }
export interface SpecProduct { id: string; code: string; name?: string | null; image?: string | null; values: Record<string, SpecValue>; kids: SpecKid[] }

/** "ข้อความว่าง" (ข้อมูลเก่ากรอกขีดไว้ ถือว่าว่าง) */
/** มีอักษรไทยปน (ใช้เช็กช่องอังกฤษที่ยังไม่ได้แปลจริง) */
export const hasThai = (v: SpecValue | undefined): boolean => typeof v === "string" && /[฀-๿]/.test(v);
export const isBlank = (v: SpecValue | undefined): boolean => v == null || (typeof v === "string" && /^\s*([-–—._/]+)?\s*$/.test(v));

export interface PlanColumn {
  key: string;
  header: string;
  level: SpecLevel;
  kind: SpecKind;
  /** ภาษาของคอลัมน์นี้ (ช่องคู่ภาษา) */
  lang?: "th" | "en";
  width: number;
}
export interface PlanCell { v: SpecValue; image?: boolean; missing?: boolean }
export interface PlanMerge { r1: number; c1: number; r2: number; c2: number }
export interface SheetPlan {
  columns: PlanColumn[];
  /** หัวชั้นบน (2 ชั้น) — ช่วงคอลัมน์ต่อกลุ่ม */
  bands: { label: string; c1: number; c2: number; level: SpecLevel | "extra" }[];
  rows: PlanCell[][];
  /** ช่องรวม (เฉพาะส่วนข้อมูล — แถว 0 = แถวข้อมูลแรก ไม่นับหัว) */
  merges: PlanMerge[];
  /** แถวแรกของแต่ละรุ่น (index ในแถวข้อมูล) */
  productStarts: number[];
  /** ช่องที่ฝั่งไทยมี แต่ฝั่งอังกฤษว่าง (แปลได้) */
  missing: { productId: string; productCode: string; level: SpecLevel; rowId: string; column: string; enColumn: string; fieldLabel: string }[];
  /** ช่องที่ว่างทั้งสองภาษา / ว่าง */
  emptyCount: number;
}

export interface PlanOptions {
  fields: SpecField[];
  lang: SpecLang;
  mode: SpecMode;
  /** แบบ kids: ช่องของรุ่นรวมเป็นช่องเดียว (true) / ซ้ำทุกแถว (false) */
  merge: boolean;
  products: SpecProduct[];
  /** SKU ลูกที่ไม่เอา (ติ๊กออก) */
  excludeKids?: Set<string>;
  /** ซ่อนสีที่เลิกขาย (is_active = false) */
  hideInactiveKids?: boolean;
}

function colWidth(f: SpecField): number {
  if (f.kind === "image") return 14;
  if (/description|introduction|highlights|fits|compartments/.test(f.fieldKey)) return 48;
  if (/name/.test(f.fieldKey)) return 34;
  if (f.kind === "number" || f.kind === "bool") return 12;
  return 18;
}

/** ช่องที่เลือก → คอลัมน์จริง (ช่องคู่ภาษา + "ทั้งคู่" = 2 คอลัมน์) */
export function planColumns(fields: SpecField[], lang: SpecLang, mode: SpecMode): PlanColumn[] {
  const cols: PlanColumn[] = [];
  for (const f of fields) {
    if (f.level === "sku" && mode !== "kids") continue;
    const head = lang === "en" ? f.labelEn : f.label;
    const w = colWidth(f);
    if (f.enColumn) {
      if (lang === "both") {
        cols.push({ key: f.key, header: `${f.label} (TH)`, level: f.level, kind: f.kind, lang: "th", width: w });
        cols.push({ key: f.key, header: `${f.labelEn} (EN)`, level: f.level, kind: f.kind, lang: "en", width: w });
      } else cols.push({ key: f.key, header: head, level: f.level, kind: f.kind, lang, width: w });
    } else cols.push({ key: f.key, header: head, level: f.level, kind: f.kind, width: w });
  }
  if (mode === "summary") cols.push({ key: "__colors", header: lang === "en" ? "Colours" : "สีที่มี", level: "parent", kind: "text", width: 30 });
  // หัวซ้ำกัน (เช่น "รหัส" ของรุ่น + ของ SKU ลูก) → ต่อท้ายฝั่ง SKU ลูก ให้อ่านแยกได้แม้หัวชั้นเดียว
  const parentHeads = new Set(cols.filter((c) => c.level === "parent").map((c) => c.header));
  for (const c of cols) if (c.level === "sku" && parentHeads.has(c.header)) c.header = `${c.header} (${lang === "en" ? "SKU" : "SKU ลูก"})`;
  return cols;
}

/** หาช่องสีของ SKU ลูก (ใช้กับช่องสรุปสี) */
const COLOR_KEYS = ["color_platform_th", "color_th", "color"];

export function buildSheetPlan(opts: PlanOptions): SheetPlan {
  const { fields, lang, mode, merge, products } = opts;
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const columns = planColumns(fields, lang, mode);
  const rows: PlanCell[][] = [];
  const merges: PlanMerge[] = [];
  const productStarts: number[] = [];
  const missing: SheetPlan["missing"] = [];
  let emptyCount = 0;

  const kidsOf = (p: SpecProduct) => p.kids.filter((k) => !opts.excludeKids?.has(k.id) && !(opts.hideInactiveKids && !k.active));
  const cellFor = (f: SpecField, col: PlanColumn, values: Record<string, SpecValue>, owner: { pid: string; pcode: string; rowId: string }, count: boolean): PlanCell => {
    if (f.kind === "image") {
      const v = values[f.column] ?? null;
      if (count && isBlank(v)) emptyCount++;
      return { v: isBlank(v) ? null : v, image: true };
    }
    if (f.enColumn && col.lang === "en") {
      const en = values[f.enColumn] ?? null;
      const th = values[f.column] ?? null;
      const note = () => { if (count) missing.push({ productId: owner.pid, productCode: owner.pcode, level: f.level, rowId: owner.rowId, column: f.column, enColumn: f.enColumn!, fieldLabel: f.label }); };
      if (isBlank(en)) {
        if (!isBlank(th)) { note(); return { v: null, missing: true }; }
        if (count) emptyCount++;
        return { v: null };
      }
      // ช่องอังกฤษที่ยังเป็นภาษาไทย (ข้อมูลจริงหลายตัวคัดลอกสีไทยมาใส่ เช่น "แทน (03)") = ยังไม่แปล · โชว์ค่าเดิมแต่ติดสีเหลือง
      if (hasThai(en)) { note(); return { v: en, missing: true }; }
      return { v: en };
    }
    const v = values[f.column] ?? null;
    if (count && isBlank(v)) emptyCount++;
    return { v: isBlank(v) ? null : v };
  };

  for (const p of products) {
    const owner = { pid: p.id, pcode: p.code, rowId: p.id };
    const kids = mode === "kids" ? kidsOf(p) : [];
    const block = mode === "kids" ? Math.max(1, kids.length) : 1;
    const start = rows.length;
    productStarts.push(start);
    for (let i = 0; i < block; i++) {
      const kid = kids[i];
      const row: PlanCell[] = [];
      columns.forEach((col) => {
        if (col.key === "__colors") {
          const names = kidsOf(p).map((k) => {
            if (lang !== "th") {
              const en = k.values.color_platform_en ?? k.values.color ?? null;
              if (!isBlank(en)) return String(en);
            }
            for (const c of COLOR_KEYS) if (!isBlank(k.values[c])) return String(k.values[c]);
            return k.code;
          });
          row.push({ v: names.length ? names.join(", ") : null });
          return;
        }
        const f = byKey.get(col.key)!;
        if (f.level === "sku") {
          row.push(kid ? cellFor(f, col, kid.values, { pid: p.id, pcode: p.code, rowId: kid.id }, true) : { v: null });
          return;
        }
        // ช่องของรุ่น: แถวแรกนับว่าง/ยังไม่แปล · แถวถัดไป = ซ้ำ (หรือว่างถ้ารวมช่อง)
        if (i > 0 && merge) { row.push({ v: null }); return; }
        row.push(cellFor(f, col, p.values, owner, i === 0));
      });
      rows.push(row);
    }
    if (mode === "kids" && merge && block > 1) {
      columns.forEach((col, c) => {
        if (col.level === "parent" && col.key !== "__colors") merges.push({ r1: start, c1: c, r2: start + block - 1, c2: c });
      });
    }
  }

  // หัว 2 ชั้น: ช่วงคอลัมน์ต่อเนื่องที่ระดับเดียวกัน
  const bands: SheetPlan["bands"] = [];
  columns.forEach((col, c) => {
    const level: SpecLevel | "extra" = col.key === "__colors" ? "extra" : col.level;
    const label = level === "sku" ? (lang === "en" ? "SKU (colour)" : "ข้อมูลสี (SKU ลูก)") : (lang === "en" ? "Product" : "ข้อมูลรุ่น");
    const last = bands[bands.length - 1];
    const sameLevel = last && (last.level === level || (last.level !== "sku" && level !== "sku"));
    if (sameLevel) last.c2 = c;
    else bands.push({ label, c1: c, c2: c, level });
  });

  return { columns, bands, rows, merges, productStarts, missing, emptyCount };
}

/** ชื่อไฟล์ เช่น สินค้า_EN_2026-11-16 (วันที่เวลาไทย) */
export function specFileName(lang: SpecLang, now: Date = new Date()): string {
  const th = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  return `รายละเอียดสินค้า_${lang === "both" ? "TH-EN" : lang.toUpperCase()}_${th}`;
}

// ─────────────────────────────────────────────────────────────────────────
// ชุดช่องที่บันทึกไว้ (ใช้ร่วมกันทั้งทีม)
// ─────────────────────────────────────────────────────────────────────────
export interface SpecPresetConfig {
  fields: string[];
  lang: SpecLang;
  mode: SpecMode;
  merge: boolean;
  images: "embed" | "link" | "none";
  twoTier: boolean;
  hideInactiveKids: boolean;
}
export const DEFAULT_PRESET_CONFIG: SpecPresetConfig = {
  fields: DEFAULT_SPEC_KEYS, lang: "en", mode: "kids", merge: true, images: "embed", twoTier: true, hideInactiveKids: true,
};

/** ทำความสะอาดค่าชุดช่องที่ส่งมา (กันข้อมูลแปลก ๆ เข้าฐานข้อมูล) */
export function cleanPresetConfig(raw: unknown): SpecPresetConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fields = Array.isArray(r.fields) ? r.fields.filter((k): k is string => typeof k === "string" && /^[ps]:[a-z0-9_]+$/.test(k)).slice(0, 200) : DEFAULT_SPEC_KEYS;
  const lang: SpecLang = r.lang === "th" || r.lang === "both" ? r.lang : "en";
  const mode: SpecMode = r.mode === "parent" || r.mode === "summary" ? r.mode : "kids";
  const images = r.images === "link" || r.images === "none" ? r.images : "embed";
  return {
    fields: [...new Set(fields)], lang, mode, merge: r.merge !== false, images,
    twoTier: r.twoTier !== false, hideInactiveKids: r.hideInactiveKids !== false,
  };
}
