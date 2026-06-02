/**
 * Relation Mapping Service กลาง — แหล่งความจริงเดียว (single source of truth)
 *
 * **Rule**: ทุกอย่างที่เกี่ยวกับ "field เชื่อมโยง" (FK เช่น supplier_id, category_id)
 * ต้องใช้ type + helper จากไฟล์นี้ — ห้ามนิยาม RelationConfig ซ้ำในที่อื่น
 *
 * แก้ปัญหาเดิม:
 *   - มี RelationConfig หลายเวอร์ชัน (packages กับ component ไม่ตรงกัน)
 *   - แต่ละหน้าต้อง map FK → ชื่อ เอง (copy-paste)
 *   - ไม่มี batch resolver (โหลดทีละ id)
 *   - ไม่มี dependent dropdown (เลือกหมวด → กรองสินค้า)
 *
 * แนวคิด:
 *   FK field ชื่อ `supplier_id` → คู่ label คือ `supplier_label` (convention `_id` → `_label`)
 *   ตารางส่งข้อมูล denormalized มาให้ ({base}_label) → อ่านตรงๆ ไม่ต้อง fetch
 *   ถ้าไม่มี _label → ใช้ resolveRelationLabels() ดึงทีเดียวหลาย id
 */

// ============================================================
// Canonical RelationConfig type
// ============================================================

/**
 * config ของ relation field — ใช้โดย RelationPicker, DataTable, Form, master-crud
 *
 * naming ใช้ snake_case `target_*` ตามที่ DB / API ใช้จริง
 * (เลิกใช้ displayField/searchFields แบบเก่าที่ packages เคยนิยามผิด)
 */
export type RelationConfig = {
  /** module key สำหรับสร้างใหม่ผ่าน /api/master-v2/{key} (ถ้ามี → ปุ่ม + สร้างใหม่) */
  target_module_key?:     string;
  /** ตารางปลายทางที่ FK ชี้ไป เช่น "suppliers" */
  target_table:           string;
  /** field ที่ใช้แสดงชื่อ เช่น "name" */
  target_label_field:     string;
  /** fields ที่ค้นหาได้ (default = [target_label_field]) */
  target_search_fields?:  string[];
  /** field รอง แสดงใต้ชื่อ เช่น "code" */
  secondary_label_field?: string;
  /** ถ้า true + target_module_key มีค่า → แสดงปุ่มสร้างใหม่ */
  allow_create?:          boolean;
  /**
   * ถ้าระบุ → ดึงจาก erp_lookups (generic lookup) แทน table จริง
   * เช่น "product_category" / "uom"
   */
  lookup_type?:           string;
  /** กรองตายตัว (static) ตามคอลัมน์ของ target_table เช่น { column:"country", value:"จีน" } */
  filter?:                RelationFilter;
  /**
   * Dependent / cascading dropdown — กรองตามค่าใน field อื่นของฟอร์มเดียวกัน
   * เช่น location_id ขึ้นกับ warehouse_id:
   *   { parent_field: "warehouse_id", filter_column: "warehouse_id" }
   * แปลว่า "โชว์เฉพาะ location ที่ warehouse_id = ค่าที่เลือกในช่อง warehouse_id"
   */
  depends_on?:            RelationDependency;
};

export type RelationFilter = {
  column: string;
  value:  string;
};

export type RelationDependency = {
  /** ชื่อ field พ่อในฟอร์มเดียวกัน ที่เป็นตัวกำหนดการกรอง */
  parent_field:  string;
  /** คอลัมน์ใน target_table ที่จะกรองด้วยค่าของ parent_field */
  filter_column: string;
};

/** option ที่ resolver / picker ส่งกลับ */
export type RelationOption = {
  id:         string;
  label:      string;
  secondary?: string;
  active?:    boolean;
};

// ============================================================
// Label key convention — `xxx_id` ↔ `xxx_label`
// ============================================================

/**
 * คืน key ของคอลัมน์ label ที่คู่กับ FK field
 *   "supplier_id"  → "supplier_label"
 *   "category_id"  → "category_label"
 *   "owner"        → null (ไม่ลงท้าย _id)
 */
export function relationLabelKey(fieldKey: string): string | null {
  if (!fieldKey.endsWith("_id")) return null;
  return fieldKey.slice(0, -3) + "_label";
}

/**
 * อ่าน label ของ relation จาก row ที่ denormalized มาแล้ว
 * ลองตามลำดับ: `{base}_label` → `{base}_name` → null
 */
export function readRelationLabel(
  row: Record<string, unknown>,
  fieldKey: string,
): string | null {
  if (!fieldKey.endsWith("_id")) return null;
  const base = fieldKey.slice(0, -3);
  const label = row[`${base}_label`] ?? row[`${base}_name`];
  if (label == null || label === "") return null;
  return String(label);
}

/**
 * row นี้มี label denormalized มาให้แล้วหรือยัง (true = ไม่ต้อง fetch)
 */
export function hasRelationLabel(row: Record<string, unknown>, fieldKey: string): boolean {
  return readRelationLabel(row, fieldKey) != null;
}

// ============================================================
// Dependent dropdown — คำนวณ filter ที่มีผลจริง
// ============================================================

/**
 * รวม filter ตายตัว (static) + dependent (dynamic) → filter เดียวที่ส่งให้ API
 *
 * ลำดับความสำคัญ: depends_on (dynamic) มาก่อน static filter
 * (เพราะ API /api/admin/picker รองรับ filter เดียว)
 *
 * @param config        RelationConfig
 * @param siblingValues ค่าปัจจุบันของ field อื่นในฟอร์ม { warehouse_id: "uuid", ... }
 * @returns filter ที่ใช้จริง หรือ undefined ถ้าไม่มี
 *          ถ้า depends_on ต้องการ parent แต่ parent ยังว่าง → คืน { blocked: true }
 *          เพื่อบอกว่า "ยังเลือกไม่ได้จนกว่าจะเลือกพ่อก่อน"
 */
export function buildRelationFilter(
  config: RelationConfig,
  siblingValues: Record<string, unknown> = {},
): { column: string; value: string } | { blocked: true } | undefined {
  const dep = config.depends_on;
  if (dep) {
    const parentValue = siblingValues[dep.parent_field];
    if (parentValue == null || parentValue === "") {
      // พ่อยังไม่เลือก → ลูกยังกรองไม่ได้ → บล็อก
      return { blocked: true };
    }
    return { column: dep.filter_column, value: String(parentValue) };
  }
  if (config.filter?.column) {
    return { column: config.filter.column, value: config.filter.value };
  }
  return undefined;
}

/** true ถ้า config เป็น dependent dropdown (มี depends_on) */
export function isDependentRelation(config: RelationConfig): boolean {
  return !!config.depends_on;
}

// ============================================================
// Batch resolver — map หลาย id → label ในการเรียกครั้งเดียว
// ============================================================

/** ตัว fetch ที่ inject ได้ (เพื่อ test) — default = apiFetch ของระบบ */
export type RelationFetcher = (url: string) => Promise<Response>;

/**
 * แปลงหลาย id → Map<id, RelationOption> โดยเรียก /api/admin/picker ครั้งเดียว
 * (ใช้ include_ids ที่ endpoint รองรับอยู่แล้ว — ไม่ต้อง fetch ทีละ id)
 *
 * @example
 *   const labels = await resolveRelationLabels(apiFetch, supplierConfig, ["a","b","c"])
 *   labels.get("a")?.label  // "ACME Co"
 */
export async function resolveRelationLabels(
  fetcher: RelationFetcher,
  config: RelationConfig,
  ids: string[],
): Promise<Map<string, RelationOption>> {
  const result = new Map<string, RelationOption>();
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return result;

  const url = buildResolverUrl(config, uniqueIds);
  const res = await fetcher(url);
  const json = (await res.json()) as { data?: unknown };
  const rows = (json.data ?? []) as Array<Record<string, unknown>>;

  for (const r of rows) {
    const id = String(r.id ?? "");
    if (!id) continue;
    result.set(id, {
      id,
      label:     String((config.lookup_type ? r.name : r[config.target_label_field]) ?? r.label ?? ""),
      secondary: config.secondary_label_field && r[config.secondary_label_field] != null
        ? String(r[config.secondary_label_field])
        : (r.secondary != null ? String(r.secondary) : undefined),
      active:    typeof r.is_active === "boolean" ? r.is_active
                : typeof r.active === "boolean"   ? r.active
                : undefined,
    });
  }
  return result;
}

/** สร้าง URL ของ resolver — แยกเป็น export เพื่อ test ได้ */
export function buildResolverUrl(config: RelationConfig, ids: string[]): string {
  const include = ids.join(",");
  if (config.lookup_type) {
    return `/api/lookups?type=${encodeURIComponent(config.lookup_type)}&include_ids=${encodeURIComponent(include)}&limit=${ids.length}`;
  }
  const params = new URLSearchParams({
    table: config.target_table,
    label: config.target_label_field,
    include_ids: include,
    limit: String(Math.max(ids.length, 1)),
  });
  if (config.secondary_label_field) params.set("secondary", config.secondary_label_field);
  return `/api/admin/picker?${params.toString()}`;
}
