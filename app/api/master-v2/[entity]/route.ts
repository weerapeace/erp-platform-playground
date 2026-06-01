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
};

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
                  brands ( name ), collections ( name )`,
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
                  uom_id, purchase_uom_id, list_price, standard_price, fake_price,
                  is_active, sale_ok, purchase_ok, color, cover_image_r2_key,
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
export async function resolveEntity(entity: string): Promise<EntityConfig | null> {
  if (ENTITIES[entity]) return ENTITIES[entity];
  const admin = supabaseAdmin();
  const { data: mod } = await admin.from("erp_modules").select("id, table_name").eq("module_key", entity).maybeSingle();
  if (!mod) return null;
  const { data: flds } = await admin.from("erp_module_fields")
    .select("column_name, is_searchable").eq("module_id", mod.id).eq("is_active", true);
  const searchColumns = (flds ?? [])
    .filter((f) => f.is_searchable && f.column_name)
    .map((f) => f.column_name as string);
  return {
    table: mod.table_name as string,
    selectColumns: "*",
    searchColumns: searchColumns.length ? searchColumns : ["name"],
    softDeleteColumn: "is_active",
    defaults: { is_active: true },
  };
}

// ---- GET — list ----

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
): Promise<NextResponse> {
  const { entity } = await params;
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
  type ColFilter =
    | { type: "text"; value: string }
    | { type: "number"; min: string; max: string }
    | { type: "select"; selected: string[] }
    | { type: "boolean"; value: "true" | "false" };
  let colFilters: Record<string, ColFilter> = {};
  try {
    const raw = searchParams.get("filters");
    if (raw) colFilters = JSON.parse(raw) as Record<string, ColFilter>;
  } catch { /* ignore malformed */ }

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

    // F27: sort — ใช้ sort_by ถ้า valid column ไม่งั้น updated_at desc
    const orderCol = sortBy && SAFE_COL.test(sortBy) ? sortBy : "updated_at";
    const orderAsc = sortBy ? sortDir : false;

    let q = supabase
      .from(cfg.table)
      .select(selectCols, { count: cursor === offset ? "exact" : undefined })
      .order(orderCol, { ascending: orderAsc })
      .range(cursor, batchEnd);

    if (cfg.softDeleteColumn && !includeInactive) {
      q = q.eq(cfg.softDeleteColumn, true);
    }
    if (search && cfg.searchColumns.length > 0) {
      const orFilter = cfg.searchColumns.map((c) => `${c}.ilike.%${search}%`).join(",");
      q = q.or(orFilter);
    }
    // F27: column filters → Supabase query (เฉพาะ column จริงในตาราง)
    for (const [col, f] of Object.entries(colFilters)) {
      if (!SAFE_COL.test(col)) continue;   // กัน injection + ข้าม relation alias
      if (f.type === "text" && f.value) {
        q = q.ilike(col, `%${f.value}%`);
      } else if (f.type === "number") {
        if (f.min !== "" && f.min != null) q = q.gte(col, Number(f.min));
        if (f.max !== "" && f.max != null) q = q.lte(col, Number(f.max));
      } else if (f.type === "select" && Array.isArray(f.selected) && f.selected.length > 0) {
        q = q.in(col, f.selected);
      } else if (f.type === "boolean" && (f.value === "true" || f.value === "false")) {
        q = q.eq(col, f.value === "true");
      }
    }

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

  const rows = cfg.postProcess ? allRows.map(cfg.postProcess) : allRows;
  return NextResponse.json({ data: rows, total: totalCount || rows.length, error: null });
}

// ---- POST — create ----

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
): Promise<NextResponse> {
  const { entity } = await params;
  const cfg = await resolveEntity(entity);
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });

  // ตรวจ user login (authenticated role)
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // strip 'actor' (used for audit log, not a column)
  const { actor: _actor, ...fields } = body;
  void _actor;

  // merge with defaults; drop undefined
  const payload: Record<string, unknown> = { ...cfg.defaults };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) payload[k] = v;
  }

  // ใช้ supabaseAdmin (service-role bypass RLS) — sprint 8 จะใส่ erp_can() check
  const { data, error } = await supabaseAdmin()
    .from(cfg.table)
    .insert(payload)
    .select(cfg.selectColumns)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = cfg.postProcess ? cfg.postProcess(data as unknown as Record<string, unknown>) : data;
  return NextResponse.json({ data: row, error: null });
}
