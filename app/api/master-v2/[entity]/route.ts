/**
 * Master Data v2 — Generic CRUD API (list + create)
 *
 * GET  /api/master-v2/<entity>?search=&include_inactive=true&limit=200
 * POST /api/master-v2/<entity>     body = { ...fields, actor }
 *
 * รองรับ:
 *   parent-skus → parent_skus_v2 (join brands + collections)
 *   skus        → skus_v2        (join parent_skus_v2)
 *   partners    → partners_v2
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardApi } from "@/lib/api-auth";
import { timeRoute } from "@/lib/api-timing";
import { getFieldAccess, stripHidden, stripReadonly } from "@/lib/field-permissions";

// อ่าน/เขียนสดเสมอ — ข้อมูล master + module config เปลี่ยน runtime, ห้าม cache
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---- Entity config ----

type EntityConfig = {
  table:         string;
  /** Columns ใช้กับ detail/POST/PATCH — '*' ทุก field (รวม html/jsonb ใหญ่) */
  selectColumns: string;
  /**
   * F10a: Columns สำหรับ list view — เล็ก ไม่มี html/text ใหญ่
   * ถ้าไม่ระบุ → fallback ใช้ selectColumns
   * ใช้กับ GET list เพื่อกัน JSON truncate (Workers payload limit)
   */
  listColumns?:  string;
  searchColumns: string[];
  /** ค่า default ตอน insert ที่ไม่ได้รับจาก body */
  defaults?:     Record<string, unknown>;
  /** field ที่ใช้เป็น soft-delete (set false = archived) */
  softDeleteColumn?: string;
  /** map response row → flat ตามที่ frontend คาดหวัง (resolve nested join) */
  postProcess?:  (row: Record<string, unknown>) => Record<string, unknown>;
  /**
   * Generic relation resolve — สำหรับโมดูลที่ไม่ได้ hardcode join
   * อ่านจาก Field Registry (ui_field_type=relation) แล้วแปลง FK id → ชื่อ ตอน GET
   * โดยดึงเฉพาะ id ที่อยู่ในหน้านั้น (.in) → scale ได้แม้ตารางปลายทางใหญ่
   */
  relationResolves?: RelationResolve[];
  /**
   * คอลัมน์ที่ใช้เรียงลำดับเริ่มต้น (ตอนไม่มี sort_by)
   * generic module จะตรวจอัตโนมัติว่ามี updated_at / created_at ไหม ไม่งั้น fallback 'id'
   * → กัน query error เมื่อตารางไม่มี updated_at
   */
  orderColumn?: string;
};

type RelationResolve = {
  column:       string;        // FK column บนตารางนี้ เช่น item_sku_id
  targetTable:  string;        // ตารางปลายทาง เช่น skus_v2
  labelField:   string;        // field หลักที่จะโชว์ เช่น code
  secondaryField: string | null; // field รองโชว์ตัวเล็ก เช่น name_th
  labelKey:     string;        // key ผลลัพธ์ เช่น item_sku_label
  secondaryKey: string;        // เช่น item_sku_secondary
};

const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/i;

/** แปลง error จากฐานข้อมูลให้เป็นภาษาคน (ของกลาง — ใช้ทั้ง update/delete/import) */
export function friendlyDbError(msg: string): string {
  if (/partners_v2_at_least_one_role/i.test(msg))
    return "คู่ค้าต้องเป็น 'ลูกค้า' หรือ 'ผู้จำหน่าย' อย่างน้อย 1 อย่าง — ปิดทั้งสองพร้อมกันไม่ได้";
  if (/foreign key|violates foreign key|still referenced|23503/i.test(msg))
    return "ทำรายการไม่ได้ เพราะมีข้อมูลอื่นอ้างถึงรายการนี้อยู่ (เช่น ถูกใช้ในเอกสาร)";
  if (/duplicate key|unique constraint|23505/i.test(msg))
    return "ข้อมูลซ้ำ — มีค่าที่ต้องไม่ซ้ำกันอยู่แล้วในระบบ";
  if (/not-null|null value in column|23502/i.test(msg))
    return "มีช่องที่จำเป็นถูกเว้นว่าง — กรุณากรอกให้ครบ";
  if (/check constraint/i.test(msg))
    return "ค่าที่กรอกไม่ผ่านเงื่อนไขของระบบ (ละเมิดกฎข้อมูล) — กรุณาตรวจสอบค่าอีกครั้ง";
  return msg;
}

export type ColFilter =
  | { type: "text"; value: string }
  | { type: "number"; min: string; max: string }
  | { type: "select"; selected: string[] }
  | { type: "boolean"; value: "true" | "false" };

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ใส่เงื่อนไข soft-delete + ค้นหาหลายคำ + column filters ลงใน query
 * ของกลาง — ใช้ทั้ง list GET และ bulk-update เพื่อให้ "แถวที่กระทบ" ตรงกับที่แสดงเป๊ะ
 */
export function applyListFilters(q: any, opts: {
  searchColumns: string[];
  search: string;
  colFilters: Record<string, ColFilter>;
  softDeleteColumn?: string;
  includeInactive: boolean;
}): any {
  if (opts.softDeleteColumn && !opts.includeInactive) q = q.eq(opts.softDeleteColumn, true);
  const search = (opts.search ?? "").trim();
  if (search && opts.searchColumns.length > 0) {
    const tokens = search.split(/\s+/).map((t) => t.replace(/[,()*]/g, "").trim()).filter(Boolean).slice(0, 6);
    if (tokens.length === 0) q = q.or(opts.searchColumns.map((c) => `${c}.ilike.%${search}%`).join(","));
    else for (const tok of tokens) q = q.or(opts.searchColumns.map((c) => `${c}.ilike.%${tok}%`).join(","));
  }
  for (const [col, f] of Object.entries(opts.colFilters)) {
    if (!SAFE_IDENT.test(col)) continue;
    if (f.type === "text" && f.value) {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(f.value)) q = q.eq(col, f.value);
      else q = q.ilike(col, `%${f.value}%`);
    } else if (f.type === "number") {
      if (f.min !== "" && f.min != null) q = q.gte(col, Number(f.min));
      if (f.max !== "" && f.max != null) q = q.lte(col, Number(f.max));
    } else if (f.type === "select" && Array.isArray(f.selected) && f.selected.length > 0) {
      q = q.in(col, f.selected);
    } else if (f.type === "boolean" && (f.value === "true" || f.value === "false")) {
      q = q.eq(col, f.value === "true");
    }
  }
  return q;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * แปลง FK id → ชื่อ สำหรับ relation fields (ของกลาง) — ใช้ทั้ง list + detail
 * ดึงเฉพาะ id ที่ปรากฏใน rows (distinct) จึงเบาแม้ตารางปลายทางมีหลายหมื่นแถว
 */
export async function resolveRelationLabels(
  supabase: ReturnType<typeof supabaseFromRequest>,
  cfg: EntityConfig,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  if (!cfg.relationResolves?.length || rows.length === 0) return rows;
  const valid = cfg.relationResolves.filter(
    (rr) => SAFE_IDENT.test(rr.targetTable) && SAFE_IDENT.test(rr.labelField) && (!rr.secondaryField || SAFE_IDENT.test(rr.secondaryField)),
  );
  if (valid.length === 0) return rows;

  // ดึง label ของทุก relation พร้อมกัน (parallel) — ลด wall-clock เมื่อมีหลาย relation
  // เก็บเฉพาะ id ของแถวที่ "ยังไม่มี label" (เคารพ postProcess ที่ resolve ไว้แล้ว เช่น parent/partner/uom)
  const maps = await Promise.all(valid.map(async (rr) => {
    const ids = [...new Set(rows.filter((r) => r[rr.column] != null && r[rr.labelKey] == null).map((r) => String(r[rr.column])))];
    if (ids.length === 0) return { rr, map: null as Map<string, Record<string, unknown>> | null };
    const sel = rr.secondaryField ? `id, ${rr.labelField}, ${rr.secondaryField}` : `id, ${rr.labelField}`;
    const { data: td } = await supabase.from(rr.targetTable).select(sel).in("id", ids);
    const map = new Map<string, Record<string, unknown>>();
    (td ?? []).forEach((t) => { const o = t as unknown as Record<string, unknown>; map.set(String(o.id), o); });
    return { rr, map };
  }));

  // เติม label ในรอบเดียว (one pass)
  return rows.map((r) => {
    let o = r;
    for (const { rr, map } of maps) {
      if (!map) continue;
      const id = r[rr.column];
      if (id == null) continue;
      const t = map.get(String(id));
      if (!t) continue;
      o = { ...o, [rr.labelKey]: t[rr.labelField], ...(rr.secondaryField ? { [rr.secondaryKey]: t[rr.secondaryField] } : {}) };
    }
    return o;
  });
}

/**
 * Helper: flatten Supabase nested join (returns array or object) → single value
 */
const pickField = (k: string) => (j: unknown): string | null => {
  if (!j) return null;
  const obj = (Array.isArray(j) ? j[0] : j) as Record<string, unknown> | undefined;
  return (obj?.[k] as string) ?? null;
};

/**
 * Generic helper: สำหรับแต่ละ relation_join key ใน config — flatten เป็น `${base}_label`
 */
function flattenRelations(
  r: Record<string, unknown>,
  joins: Array<{ alias: string; labelField: string; resultKey: string; secondaryField?: string; secondaryKey?: string }>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...r };
  for (const j of joins) {
    out[j.resultKey] = pickField(j.labelField)(r[j.alias]);
    if (j.secondaryField && j.secondaryKey) {
      out[j.secondaryKey] = pickField(j.secondaryField)(r[j.alias]);
    }
    out[j.alias] = undefined;  // clean up nested
  }
  return out;
}

export const ENTITIES: Record<string, EntityConfig> = {
  "parent-skus": {
    // ใช้ * เพื่อให้ get ทุก column (รวม field ใหม่ที่ admin sync มา) + JOIN labels
    table: "parent_skus_v2",
    selectColumns: `*,
                    brands ( name ),
                    collections ( name ),
                    product_categories ( name ),
                    parcel_sizes ( name, size_text ),
                    special_descriptions ( name ),
                    size_descriptions ( name ),
                    platform_categories ( name )`,
    // F19: list view — ตัด JOIN เหลือแค่ brands + collections (2 ตัวที่โชว์จริง)
    // relation อื่น (category/parcel/special/size/platform) แสดงเป็น id ใน list อยู่แล้ว
    // → label ครบเฉพาะตอนเปิด detail drawer (GET /[id] ใช้ selectColumns เต็ม)
    // ตัด 5 JOINs = Supabase query เบาลงมาก + parse เร็วขึ้น → กัน Worker 1102
    listColumns: `id, code, name_th, name_en, sku_name, product_family,
                  brand_id, collection_id, category_id, parcel_size_id,
                  special_description_id, size_description_id, platform_category_id,
                  cover_image_r2_key, is_active,
                  brands ( name ), collections ( name ), product_categories ( name )`,
    searchColumns: ["code", "name_th", "name_en", "sku_name"],
    softDeleteColumn: "is_active",
    defaults: { product_family: "general", is_active: true, attribute_values: {} },
    postProcess: (r) => flattenRelations(r, [
      { alias: "brands",               labelField: "name", resultKey: "brand_label" },
      { alias: "collections",          labelField: "name", resultKey: "collection_label" },
      { alias: "product_categories",   labelField: "name", resultKey: "category_label" },
      { alias: "parcel_sizes",         labelField: "name", resultKey: "parcel_size_label", secondaryField: "size_text", secondaryKey: "parcel_size_size_text" },
      { alias: "special_descriptions", labelField: "name", resultKey: "special_description_label" },
      { alias: "size_descriptions",    labelField: "name", resultKey: "size_description_label" },
      { alias: "platform_categories",  labelField: "name", resultKey: "platform_category_label" },
    ]),
  },
  skus: {
    table: "skus_v2",
    selectColumns: `*,
                    parent_skus_v2 ( code, name_th ),
                    partners_v2!seller_partner_id ( name_th, code ),
                    uom:uoms!uom_id ( name ),
                    purchase_uom:uoms!purchase_uom_id ( name )`,
    listColumns: `id, code, name_th, barcode, parent_sku_id, seller_partner_id,
                  uom_id, purchase_uom_id, list_price, standard_price, fake_price, rmb_cost,
                  is_active, sale_ok, purchase_ok, color, cover_image_r2_key, product_group,
                  parent_skus_v2 ( code, name_th ),
                  partners_v2!seller_partner_id ( name_th, code ),
                  uom:uoms!uom_id ( name ),
                  purchase_uom:uoms!purchase_uom_id ( name )`,
    searchColumns: ["code", "name_th", "barcode"],
    softDeleteColumn: "is_active",
    defaults: { is_active: true, sale_ok: true, purchase_ok: true, attribute_values: {} },
    postProcess: (r) => flattenRelations(r, [
      { alias: "parent_skus_v2", labelField: "code", resultKey: "parent_sku_label", secondaryField: "name_th", secondaryKey: "parent_sku_name_th" },
      { alias: "partners_v2",    labelField: "name_th", resultKey: "seller_partner_label", secondaryField: "code", secondaryKey: "seller_partner_code" },
      { alias: "uom",            labelField: "name", resultKey: "uom_label" },
      { alias: "purchase_uom",   labelField: "name", resultKey: "purchase_uom_label" },
    ]),
  },
  partners: {
    table: "partners_v2",
    selectColumns: `*`,
    // F29: ลบ listColumns เก่า (ตัด field) → ใช้ * (partners เล็ก 262 rows) → ได้ครบทุก field
    searchColumns: ["code", "name_th", "name_en", "phone", "email", "tax_id"],
    softDeleteColumn: "is_active",
    defaults: { is_active: true, is_company: true, country: "TH", tax_branch: "00000" },
  },
  // LR3: Logic Registry — ทะเบียนกฎธุรกิจ (จาก LOGIC_MEMORY_SIMPLE.md, 146 rules)
  logic: {
    table: "erp_logic_registry",
    selectColumns: `*`,
    searchColumns: ["logic_id", "short_name", "plain_language", "related_modules"],
    softDeleteColumn: "is_active",
    defaults: { logic_status: "approved", impl_status: "not_started", is_active: true },
  },
  // Phase 2: Material/UoM foundation (ของกลางสำหรับ BOM)
  "material-slots": {
    table: "material_slots",
    selectColumns: `*`,
    searchColumns: ["slot_code", "name_th", "name_en"],
    softDeleteColumn: "is_active",
    defaults: { resolve_method: "manual_select", sort_order: 100, is_active: true },
  },
  "material-families": {
    table: "material_families",
    selectColumns: `*`,
    searchColumns: ["family_code", "name_th", "name_en", "material_type"],
    softDeleteColumn: "is_active",
    defaults: { is_active: true },
  },
  "uom-conversions": {
    table: "uom_conversions",
    selectColumns: `*`,
    searchColumns: ["from_uom", "to_uom"],
    softDeleteColumn: "is_active",
    defaults: { factor: 1, is_active: true },
  },
  // หมายเหตุ: entity "uoms" มีอยู่แล้วด้านบน (บรรทัด ~161)

  // ===== Phase 2–9 skeleton (big-picture) — generic master tables =====
  "supplier-items":        { table: "supplier_items",          selectColumns: `*`, searchColumns: ["supplier_partner","item_sku","supplier_sku"], softDeleteColumn: "is_active", defaults: { is_active: true } },
  "customer-products":     { table: "customer_products",       selectColumns: `*`, searchColumns: ["customer_partner","internal_sku","customer_sku","product_name"], softDeleteColumn: "is_active", defaults: { is_active: true } },
  "marketplace-skus":      { table: "marketplace_sku_mappings",selectColumns: `*`, searchColumns: ["marketplace_sku","internal_sku","listing_name"], softDeleteColumn: "is_active", defaults: { is_active: true } },
  "stock-locations":       { table: "stock_locations",         selectColumns: `*`, searchColumns: ["code","name","warehouse"], softDeleteColumn: "is_active", defaults: { is_active: true } },
  "stock-lots":            { table: "stock_lots",              selectColumns: `*`, searchColumns: ["lot_code","item_sku","supplier"], softDeleteColumn: "is_active", defaults: { is_active: true } },
  "stock-lpns":            { table: "stock_lpns",              selectColumns: `*`, searchColumns: ["lpn_code","item_sku","lot_code","location_code"], softDeleteColumn: "is_active", defaults: { is_active: true } },
  "stock-counts":          { table: "stock_count_sessions",    selectColumns: `*`, searchColumns: ["session_code","warehouse"], softDeleteColumn: "is_active", defaults: { is_active: true } },
  "stock-adjustments":     { table: "stock_adjustments",       selectColumns: `*`, searchColumns: ["adj_code","item_sku","reason"], softDeleteColumn: "is_active", defaults: { is_active: true } },
  "bom-headers":           { table: "bom_headers",             selectColumns: `*`, searchColumns: ["bom_code","product_sku"], softDeleteColumn: "is_active", defaults: { is_active: true, status: "draft" } },
  "bom-lines":             { table: "bom_lines",               selectColumns: `*`, searchColumns: ["bom_code","slot_code","component_sku"], softDeleteColumn: "is_active", defaults: { is_active: true } },
  "quotations":            { table: "quotations",              selectColumns: `*`, searchColumns: ["quote_no","customer"], softDeleteColumn: "is_active", defaults: { is_active: true, status: "draft" } },
  "sales-orders-v2":       { table: "sales_orders",            selectColumns: `*`, searchColumns: ["so_no","customer"], softDeleteColumn: "is_active", defaults: { is_active: true, status: "draft" } },
  "goods-receipts":        { table: "goods_receipts",          selectColumns: `*`, searchColumns: ["gr_no","supplier","po_no"], softDeleteColumn: "is_active", defaults: { is_active: true, status: "draft" } },
  "deliveries":            { table: "deliveries",              selectColumns: `*`, searchColumns: ["do_no","customer","so_no"], softDeleteColumn: "is_active", defaults: { is_active: true, status: "draft" } },
  "material-requirements": { table: "material_requirements",   selectColumns: `*`, searchColumns: ["item_sku","source_doc"], softDeleteColumn: "is_active", defaults: { is_active: true, status: "open" } },
  "manufacturing-orders":  { table: "manufacturing_orders",    selectColumns: `*`, searchColumns: ["mo_no","product_sku"], softDeleteColumn: "is_active", defaults: { is_active: true, status: "draft" } },
  "work-centers":          { table: "work_centers",            selectColumns: `*`, searchColumns: ["code","name"], softDeleteColumn: "is_active", defaults: { is_active: true } },
  "routings":              { table: "routings",                selectColumns: `*`, searchColumns: ["routing_code","product_sku"], softDeleteColumn: "is_active", defaults: { is_active: true, status: "draft" } },
  "production-jobs":       { table: "production_jobs",         selectColumns: `*`, searchColumns: ["job_code","mo_no","assigned_to"], softDeleteColumn: "is_active", defaults: { is_active: true, status: "pending" } },
  "pattern-versions":      { table: "pattern_versions",        selectColumns: `*`, searchColumns: ["pattern_code","product_sku"], softDeleteColumn: "is_active", defaults: { is_active: true, status: "draft" } },
  "cutting-jobs":          { table: "cutting_jobs",            selectColumns: `*`, searchColumns: ["cut_job_no","mo_no","material_sku"], softDeleteColumn: "is_active", defaults: { is_active: true, status: "pending" } },
  "qc-inspections":        { table: "qc_inspections",          selectColumns: `*`, searchColumns: ["qc_no","source_doc","inspector"], softDeleteColumn: "is_active", defaults: { is_active: true } },
  "defect-logs":           { table: "defect_logs",             selectColumns: `*`, searchColumns: ["defect_no","source_job","defect_type"], softDeleteColumn: "is_active", defaults: { is_active: true } },
  "rework-jobs":           { table: "rework_jobs",             selectColumns: `*`, searchColumns: ["rework_no","source_defect","assigned_to"], softDeleteColumn: "is_active", defaults: { is_active: true, status: "pending" } },
  "task-templates":        { table: "task_templates",          selectColumns: `*`, searchColumns: ["task_code","name","applies_to"], softDeleteColumn: "is_active", defaults: { is_active: true } },
  // china-pay: ตารางตั้งค่า (menu_roles, line_config) — ไม่มีคอลัมน์ is_active
  "china-app-settings":    { table: "china_app_settings",       selectColumns: `*`, searchColumns: ["skey"], defaults: {} },
  brands: {
    table: "brands",
    selectColumns: `*, parent_brand:brands!parent_brand_id ( name )`,
    searchColumns: ["name", "slug"],
    softDeleteColumn: "is_active",
    defaults: { is_active: true },
    postProcess: (r) => flattenRelations(r, [
      { alias: "parent_brand", labelField: "name", resultKey: "parent_brand_label" },
    ]),
  },
  collections: {
    table: "collections",
    selectColumns: `*, brands ( name )`,
    searchColumns: ["name", "slug"],
    softDeleteColumn: "is_active",
    defaults: { is_active: true },
    postProcess: (r) => flattenRelations(r, [
      { alias: "brands", labelField: "name", resultKey: "brand_label" },
    ]),
  },

  // F10c: lookup tables (สำหรับ RelationPicker "+ create new")
  product_categories: {
    table: "product_categories",
    selectColumns: "*",
    searchColumns: ["name", "display_name"],
  },
  // กลุ่มแท็ก (Product Family Groups) — รองรับกลุ่มย่อยผ่าน parent_group_id
  // หมายเหตุ: ไม่ embed parent แบบ self-join (PostgREST ตีความ self-FK สลับข้าง) —
  // หน้าเพจประกอบ tree จาก parent_group_id ดิบเอง
  product_family_groups: {
    table: "product_family_groups",
    selectColumns: `*`,
    searchColumns: ["name"],
    softDeleteColumn: "is_active",
    defaults: { is_active: true, single_select: false, sort_order: 100 },
    orderColumn: "sort_order",
  },
  platform_categories: {
    table: "platform_categories",
    selectColumns: "*",
    searchColumns: ["name"],
    softDeleteColumn: "active",
    defaults: { active: true },
  },
  parcel_sizes: {
    table: "parcel_sizes",
    selectColumns: "*",
    searchColumns: ["name", "size_text"],
  },
  special_descriptions: {
    table: "special_descriptions",
    selectColumns: "*",
    searchColumns: ["name", "description"],
  },
  size_descriptions: {
    table: "size_descriptions",
    selectColumns: "*",
    searchColumns: ["name", "description"],
  },
  uoms: {
    table: "uoms",
    selectColumns: "*",
    searchColumns: ["name", "display_name"],
    softDeleteColumn: "active",
    defaults: { active: true },
  },
};

/**
 * C2: resolve entity config — ถ้าไม่อยู่ใน ENTITIES (hardcode) ให้หาจาก erp_modules
 * → table ใหม่ที่สร้างจากเว็บใช้ API นี้ได้ทันทีโดยไม่ต้องแก้โค้ด
 */
// cache config ของ generic module ต่อ instance (ลดการยิง DB 2 ครั้ง/คำขอ → กิน CPU/เวลาน้อยลง = กัน 1102)
// TTL สั้น 20s — ถ้า admin เพิ่ม/แก้ field ใหม่ จะเห็นภายใน 20 วิ
const _entityCache = new Map<string, { cfg: EntityConfig; at: number }>();
const ENTITY_TTL = 20_000;

/** เลือกคอลัมน์เรียงลำดับที่ "มีจริง" ในตาราง — กัน query error เมื่อไม่มี updated_at */
async function pickOrderColumn(admin: ReturnType<typeof supabaseAdmin>, table: string): Promise<string> {
  for (const col of ["updated_at", "created_at"]) {
    const { error } = await admin.from(table).select(col).limit(1);
    if (!error) return col;
  }
  return "id"; // ทุกตารางมี id เสมอ
}

// อ่าน relation fields ของ "โมดูล" จากทะเบียน → RelationResolve[] (ของกลาง ใช้ได้ทั้ง hardcode + generic)
type FieldRow = { column_name: string | null; ui_field_type: string; relation_config: unknown };
function buildRelationResolves(flds: FieldRow[]): RelationResolve[] {
  return flds
    .filter((f) => f.ui_field_type === "relation" && f.column_name && (f.relation_config as Record<string, unknown>)?.target_table)
    .map((f) => {
      const rc = f.relation_config as Record<string, unknown>;
      const col = f.column_name as string;
      const base = col.endsWith("_id") ? col.slice(0, -3) : col;
      return {
        column: col,
        targetTable: String(rc.target_table),
        labelField: String(rc.target_label_field ?? "name"),
        secondaryField: rc.secondary_label_field ? String(rc.secondary_label_field) : null,
        labelKey: `${base}_label`,
        secondaryKey: `${base}_secondary`,
      };
    });
}

export async function resolveEntity(entity: string): Promise<EntityConfig | null> {
  const cached = _entityCache.get(entity);
  if (cached && Date.now() - cached.at < ENTITY_TTL) return cached.cfg;
  const admin = supabaseAdmin();

  // กัน key ใช้ขีดล่าง/ขีดกลางไม่ตรงกับที่ลงทะเบียน (เช่น task_templates ↔ task-templates)
  const alt = entity.includes("_") ? entity.replace(/_/g, "-") : entity.replace(/-/g, "_");

  // ---- hardcode entity: augment ด้วย relationResolves จากทะเบียน (universal) ----
  const hardKey = ENTITIES[entity] ? entity : (alt !== entity && ENTITIES[alt] ? alt : null);
  if (hardKey) {
    const base = ENTITIES[hardKey];
    const { data: mod } = await admin.from("erp_modules").select("id").eq("table_name", base.table).maybeSingle();
    let relationResolves: RelationResolve[] = [];
    if (mod) {
      const { data: flds } = await admin.from("erp_module_fields")
        .select("column_name, ui_field_type, relation_config").eq("module_id", mod.id).eq("is_active", true);
      relationResolves = buildRelationResolves((flds ?? []) as FieldRow[]);
    }
    const cfg: EntityConfig = { ...base, relationResolves };
    _entityCache.set(entity, { cfg, at: Date.now() });
    return cfg;
  }

  // ---- generic entity: สร้าง config จาก erp_modules (รองรับ key ขีดล่าง/ขีดกลาง) ----
  let { data: mod } = await admin.from("erp_modules").select("id, table_name").eq("module_key", entity).maybeSingle();
  if (!mod && alt !== entity) ({ data: mod } = await admin.from("erp_modules").select("id, table_name").eq("module_key", alt).maybeSingle());
  if (!mod) return null;
  const { data: flds } = await admin.from("erp_module_fields")
    .select("column_name, is_searchable, ui_field_type, relation_config").eq("module_id", mod.id).eq("is_active", true);
  const searchColumns = (flds ?? [])
    .filter((f) => f.is_searchable && f.column_name)
    .map((f) => f.column_name as string);
  const relationResolves = buildRelationResolves((flds ?? []) as FieldRow[]);
  const tableName = mod.table_name as string;
  const orderColumn = await pickOrderColumn(admin, tableName);
  const cfg: EntityConfig = {
    table: tableName,
    selectColumns: "*",
    searchColumns: searchColumns.length ? searchColumns : ["name"],
    softDeleteColumn: "is_active",
    defaults: { is_active: true },
    relationResolves,
    orderColumn,
  };
  _entityCache.set(entity, { cfg, at: Date.now() });
  return cfg;
}

// ---- GET — list ----

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
): Promise<NextResponse> {
  const { entity } = await params;
  // ตรวจสิทธิ์ก่อน — กันข้อมูล master หลุดให้คนที่ไม่ได้ล็อกอิน (เรียก URL ตรง ๆ)
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const cfg = await resolveEntity(entity);
  if (!cfg) return NextResponse.json({ data: [], error: "entity ไม่รองรับ" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  // F19: default 200 (server mode) — client mode ส่ง limit=2000 (เห็นครบ)
  // F28: cap 1000→2000 (parent-skus 1,471 client mode ต้องเห็นครบ)
  const limit  = Math.min(2000, Math.max(1, parseInt(searchParams.get("limit") ?? "200", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
  const includeInactive = searchParams.get("include_inactive") === "true";

  // F27: server-side sort + column filters
  const sortBy  = searchParams.get("sort_by");
  const sortDir = searchParams.get("sort_dir") === "desc" ? false : true;  // asc=true
  const SAFE_COL = /^[a-z_][a-z0-9_]*$/i;
  let colFilters: Record<string, ColFilter> = {};
  try {
    const raw = searchParams.get("filters");
    if (raw) colFilters = JSON.parse(raw) as Record<string, ColFilter>;
  } catch { /* ignore malformed */ }

  // ── กรองแถวตามแท็กใน junction (ของกลาง) ───────────────────────────────
  // excl_junction/excl_tgt_ids = "ซ่อน" แถวที่ผูกแท็กพวกนี้ (เช่นกฎ "ห้ามขอซื้อ")
  // incl_junction/incl_tgt_ids = "โชว์เฉพาะ" แถวที่ผูกแท็กพวกนี้
  // วิธี: หา src_id (เช่น sku) ที่ผูกแท็ก แล้ว NOT IN (ซ่อน) / IN (โชว์เฉพาะ)
  // หมายเหตุ: คาดว่าจำนวนไม่มาก — cap 2000 กัน URL ยาวเกิน
  const JUNC_RE = /^[a-z][a-z0-9_]+_m2m$/;
  const resolveSrcIds = async (junction: string, tgtIds: string[]): Promise<string[]> => {
    const admin = supabaseAdmin();
    const set = new Set<string>();
    for (let i = 0; i < tgtIds.length && set.size <= 2000; i += 200) {
      const chunk = tgtIds.slice(i, i + 200);
      const { data: jr } = await admin.from(junction).select("src_id").in("tgt_id", chunk);
      for (const r of (jr ?? []) as { src_id: string }[]) if (r.src_id) set.add(String(r.src_id));
    }
    if (set.size > 2000) console.warn(`[master-v2] tag filter list capped at 2000 (junction=${junction}, found=${set.size})`);
    return [...set].slice(0, 2000);
  };
  const exclJunction = searchParams.get("excl_junction") ?? "";
  const exclTgtIds = (searchParams.get("excl_tgt_ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let excludeIds: string[] = [];
  if (JUNC_RE.test(exclJunction) && exclTgtIds.length > 0) excludeIds = await resolveSrcIds(exclJunction, exclTgtIds);

  const inclJunction = searchParams.get("incl_junction") ?? "";
  const inclTgtIds = (searchParams.get("incl_tgt_ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let includeIds: string[] | null = null;
  if (JUNC_RE.test(inclJunction) && inclTgtIds.length > 0) {
    includeIds = await resolveSrcIds(inclJunction, inclTgtIds);
    // ขอ "โชว์เฉพาะ" แต่ไม่มีสินค้าผูกเลย → ต้องได้ 0 แถว (ใส่ id ที่ไม่มีจริง)
    if (includeIds.length === 0) includeIds = ["00000000-0000-0000-0000-000000000000"];
  }

  // F10a: ใช้ listColumns ถ้ามี (เล็กกว่า, กัน JSON truncate)
  // F12b: Supabase PostgREST hard-caps ที่ db.max_rows (default 1000)
  //       → loop fetch batch ละ 1000 จน reach limit หรือหมด
  const selectCols = cfg.listColumns ?? cfg.selectColumns;
  const supabase = supabaseFromRequest(request);

  const BATCH = 1000;
  const allRows: Record<string, unknown>[] = [];
  let totalCount = 0;
  let cursor = offset;
  const stopAt = offset + limit;

  while (allRows.length < limit) {
    const batchEnd = Math.min(cursor + BATCH - 1, stopAt - 1);

    // F27: sort — ใช้ sort_by ถ้า valid column ไม่งั้นใช้คอลัมน์ default ที่มีจริง (กัน error)
    const orderCol = sortBy && SAFE_COL.test(sortBy) ? sortBy : (cfg.orderColumn ?? "updated_at");
    const orderAsc = sortBy ? sortDir : false;

    let q = supabase
      .from(cfg.table)
      .select(selectCols, { count: cursor === offset ? "exact" : undefined })
      .order(orderCol, { ascending: orderAsc })
      .range(cursor, batchEnd);

    q = applyListFilters(q, {
      searchColumns: cfg.searchColumns, search, colFilters,
      softDeleteColumn: cfg.softDeleteColumn, includeInactive,
    });
    if (excludeIds.length) q = q.not("id", "in", `(${excludeIds.join(",")})`);
    if (includeIds) q = q.in("id", includeIds);

    const { data, error, count } = await q;
    if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

    const batchRows = (data ?? []) as unknown as Record<string, unknown>[];
    allRows.push(...batchRows);
    if (cursor === offset && count != null) totalCount = count;

    // หยุดถ้า batch สั้นกว่า BATCH (หมดข้อมูล) หรือถึง limit
    if (batchRows.length < BATCH) break;
    cursor += BATCH;
    if (cursor >= stopAt) break;
  }

  const processed = cfg.postProcess ? allRows.map(cfg.postProcess) : allRows;
  const rows = await resolveRelationLabels(supabase, cfg, processed);
  // สิทธิ์ระดับฟิลด์ (ของกลาง) — ตัดคอลัมน์ที่ role นี้ไม่มีสิทธิ์เห็นออกจาก response
  const { hiddenCols } = await getFieldAccess(request, supabaseAdmin(), cfg.table);
  return NextResponse.json({ data: stripHidden(rows, hiddenCols), total: totalCount || rows.length, error: null }, { headers: { "x-row-count": String(rows.length) } });
}

// ---- POST — create ----

async function _POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
): Promise<NextResponse> {
  const { entity } = await params;
  // ตรวจสิทธิ์สร้างข้อมูล master ก่อน (ไม่ล็อกอิน/ไม่มีสิทธิ์ → 401)
  const denied = await guardApi(request, "products.create"); if (denied) return denied;
  const cfg = await resolveEntity(entity);
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });

  // ดึง user object ไว้ใช้ทำ audit (สิทธิ์ตรวจแล้วด้านบน)
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // strip 'actor' (used for audit log, not a column)
  const { actor: _actor, ...fields } = body;
  const actorName = typeof _actor === "string" ? _actor : (user.email ?? null);

  // merge with defaults; ตัดค่าว่าง (undefined/null/"") ออก → ให้ DB ใช้ default ของคอลัมน์
  // (กันเคส NOT NULL DEFAULT เช่น tags text[] ที่ส่ง null ไปทับ default แล้วพัง)
  const payload: Record<string, unknown> = { ...cfg.defaults };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null && v !== "") payload[k] = v;
  }

  // ใช้ supabaseAdmin (service-role bypass RLS) — sprint 8 จะใส่ erp_can() check
  const admin = supabaseAdmin();

  // สิทธิ์ระดับฟิลด์ (ของกลาง) — ตัดคอลัมน์ที่ role นี้แก้ไม่ได้ออกก่อนเขียน
  const access = await getFieldAccess(request, admin, cfg.table);
  const { clean: cleanPayload } = stripReadonly(payload, access.readonlyCols);

  const { data, error } = await admin
    .from(cfg.table)
    .insert(cleanPayload)
    .select(cfg.selectColumns)
    .single();

  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  // audit (ของกลาง — ลง audit_logs, ไม่ throw)
  const newId = (data as unknown as Record<string, unknown> | null)?.id;
  await writeAudit(admin, {
    action: "create", entityType: cfg.table,
    entityId: typeof newId === "string" ? newId : null,
    actorId: user.id, actorName,
    metadata: { entity },
  });

  const row = cfg.postProcess ? cfg.postProcess(data as unknown as Record<string, unknown>) : (data as unknown as Record<string, unknown>);
  const [safeRow] = stripHidden([row as Record<string, unknown>], access.hiddenCols);
  return NextResponse.json({ data: safeRow, error: null });
}

// Phase 0 — ครอบ timing log (ดูเวลาแต่ละ request ใน Cloudflare logs เมื่อ >500ms)
/* eslint-disable @typescript-eslint/no-explicit-any */
export const GET = timeRoute("master-v2:list", _GET as any) as any;
export const POST = timeRoute("master-v2:create", _POST as any) as any;
