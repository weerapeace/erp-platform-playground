/**
 * ทะเบียน "ประวัติเกิดที่ไหน" (ของกลาง · pure ใช้ได้ทั้งหน้าจอและ API)
 *
 * แถวประวัติ (audit_logs) เก็บแค่ entity_type เช่น `purchase_requests_v2` · ไฟล์นี้แปลเป็นภาษาคน:
 *   - โมดูล (หมวดใหญ่) เช่น "จัดซื้อ"  → ใช้กรองในหน้าประวัติ
 *   - หน้า/ชนิดเอกสาร เช่น "ใบขอซื้อ" + ลิงก์เปิดรายการนั้น (ถ้าหน้านั้นรองรับ ?open=)
 *
 * วิธีจัดโมดูล = ดู ENTITY_INFO ก่อน (กำหนดเอง) → ไม่มีค่อยเดาจากชื่อด้วย MODULE_RULES (เรียงลำดับ ตัวแรกที่เข้า = ใช่)
 * ฝั่ง API กรองด้วยกติกาเดียวกัน (moduleFilterOr) → ตัวเลขในหน้า = ผลที่กดกรอง ไม่หลุดกัน
 *
 * เพิ่มชนิดเอกสารใหม่ที่อยากให้ชื่อสวย/กดเปิดได้ = เพิ่ม 1 แถวใน ENTITY_INFO
 * เอกสาร: docs/audit-log.md
 */

export type AuditModuleKey =
  | "purchasing" | "sales" | "stock" | "production" | "design" | "products" | "creative"
  | "marketing" | "website" | "hr" | "finance" | "files" | "settings" | "other";

export const AUDIT_MODULES: { key: AuditModuleKey; label: string }[] = [
  { key: "purchasing", label: "จัดซื้อ" },
  { key: "sales",      label: "ขาย / เอกสารขาย" },
  { key: "stock",      label: "คลังสินค้า" },
  { key: "production", label: "ผลิต / QC" },
  { key: "design",     label: "ออกแบบ" },
  { key: "products",   label: "สินค้า / ข้อมูลหลัก" },
  { key: "creative",   label: "งาน / ครีเอทีฟ" },
  { key: "marketing",  label: "การตลาด" },
  { key: "website",    label: "เว็บร้าน / แพลตฟอร์ม" },
  { key: "hr",         label: "บุคคล / เงินเดือน" },
  { key: "finance",    label: "การเงิน / โอนเงิน" },
  { key: "files",      label: "ไฟล์ / คลังรูป" },
  { key: "settings",   label: "ตั้งค่าระบบ / สิทธิ์" },
  { key: "other",      label: "อื่น ๆ" },
];

const MODULE_LABEL = Object.fromEntries(AUDIT_MODULES.map((m) => [m.key, m.label])) as Record<AuditModuleKey, string>;
export const auditModuleLabel = (k: AuditModuleKey): string => MODULE_LABEL[k] ?? "อื่น ๆ";

/**
 * เดาโมดูลจากชื่อ entity_type (เรียงลำดับ — ตัวแรกที่เข้าคือคำตอบ)
 * ⚠️ regex ต้องใช้ได้ทั้ง JS และ Postgres (~) → ใช้แค่ ^ $ | ( ) [ ] \d . ห้าม lookahead / \b
 */
export const MODULE_RULES: { module: Exclude<AuditModuleKey, "other">; re: string }[] = [
  { module: "hr",         re: "(payroll|employee|attendance|overtime|leave_entries|department|daily_rates|payment_batch|holiday)" },
  { module: "finance",    re: "(loan|^od_|cash|bank|^china_|^ctw_|subscription|paid_service)" },
  { module: "purchasing", re: "(purchase|goods_receipt|supplier|taobao|piecework_from_po|purchasing)" },
  { module: "sales",      re: "(^erp_playground_(so|quote|billing|delivery|credit|sales)|^so_|sales_order|offer_sheet|platform_order|store_order|store_customer)" },
  { module: "stock",      re: "(stock|warehouse|stock_location|freight)" },
  { module: "production", re: "(^mo$|^mo_|manufacturing_order|^bom|work_order|^wo_|work_board|piecework|cutting|^qc_|defect|carton|^belt|pattern_ticket|nesting|material_slot|routing|production)" },
  { module: "design",     re: "(design_sheet|design_price|canvas_sketch|canvassketch|configurator)" },
  { module: "creative",   re: "(creative|^content_|caption|subtask|record_task|hashtag)" },
  { module: "marketing",  re: "(marketing)" },
  { module: "website",    re: "(^store_|shop|storefront|website|platform|listing|^collections$|brand_theme|special_descriptions|marketplace)" },
  { module: "files",      re: "(^file$|^assets?$|^asset_|record_file|test_upload|^test\\d*$)" },
  { module: "products",   re: "(sku|parent|product|brand|uom|color|material|partner|attribute|size_template|variant|swatch|tag|famil|fit_items|highlight|categor)" },
  { module: "settings",   re: "(^erp_|^user|role|perm|menu|app_settings|app_api|ui_config|settings|line_config|email_report|notification|companies|gmail|discord|sync_jobs|report_layout|email_contact|lookup)" },
];

export type AuditEntityInfo = {
  module: AuditModuleKey;
  /** ชื่อหน้า/ชนิดเอกสาร เช่น "ใบขอซื้อ" */
  page: string;
  /** ลิงก์เปิดรายการนั้น (ไม่มี = หน้านั้นยังเปิดตรงไม่ได้ → กดแล้วดูประวัติอย่างเดียว) */
  href?: (id: string) => string;
};

const E = (module: AuditModuleKey, page: string, href?: (id: string) => string): AuditEntityInfo => ({ module, page, href });

/** ชนิดเอกสารที่ตั้งชื่อ/ลิงก์ไว้เอง (เรียงตามจำนวนประวัติจริง มาก → น้อย) */
export const ENTITY_INFO: Record<string, AuditEntityInfo> = {
  creative_campaign:             E("creative", "แคมเปญ", (id) => `/tasks/campaigns/${id}`),
  file:                          E("files", "ไฟล์ที่อัปโหลด"),
  platform_email:                E("sales", "อีเมลยอดขายแพลตฟอร์ม"),
  erp_playground_stock_movement: E("stock", "ความเคลื่อนไหวสต็อก"),
  creative_task:                 E("creative", "งาน", (id) => `/tasks?task=${id}`),
  skus_v2:                       E("products", "SKU", (id) => `/master/skus?open=${id}`),
  parent_skus_v2:                E("products", "Parent SKU", (id) => `/master/parent-skus?open=${id}`),
  purchase_requests_v2:          E("purchasing", "ใบขอซื้อ"),
  design_sheet:                  E("design", "ใบออกแบบ", (id) => `/master/design-sheets?open=${id}`),
  mo:                            E("production", "ใบสั่งผลิต (MO)", (id) => `/master/work-board?mo=${id}`),
  brand:                         E("products", "แบรนด์"),
  supplier_items:                E("purchasing", "ราคาซัพพลายเออร์", (id) => `/master/supplier-items?open=${id}`),
  asset:                         E("files", "คลังรูป"),
  bom_labor_rate:                E("production", "ค่าแรงใน BOM"),
  marketing_skus:                E("marketing", "สินค้าการตลาด"),
  bom:                           E("production", "BOM (สูตรผลิต)"),
  mo_material:                   E("production", "วัสดุของใบสั่งผลิต"),
  bom_piecework:                 E("production", "ค่าเหมาใน BOM"),
  erp_playground_so:             E("sales", "ใบขาย (SO)", (id) => `/sales-orders?open=${id}`),
  marketing_work_jobs:           E("marketing", "งานการตลาด"),
  product_highlight_items:       E("products", "รายละเอียดเพิ่ม (ติ๊ก)", (id) => `/master/product_highlight_items?open=${id}`),
  mo_work_order:                 E("production", "ใบงานผลิต"),
  payroll_periods:               E("hr", "งวดเงินเดือน", (id) => `/payroll/manual-input?period_id=${id}`),
  attendance_import_batches:     E("hr", "นำเข้าเวลาเข้างาน"),
  creative_content:              E("creative", "คอนเทนต์"),
  purchase_orders_v2:            E("purchasing", "ใบสั่งซื้อ (PO)", (id) => `/purchasing/po-list?open=${id}`),
  store_listing:                 E("website", "สินค้าบนเว็บร้าน"),
  parent_sku:                    E("products", "Parent SKU (เดิม)"),
  payroll_adjustments:           E("hr", "รายการปรับเงินเดือน"),
  carton_labels:                 E("production", "ใบปะหน้ากล่อง"),
  sku:                           E("products", "SKU (วัสดุ)"),
  china_bills:                   E("finance", "บิลร้านจีน", (id) => `/app/china-pay?bill=${id}`),
  qc_warehouse_items:            E("production", "ของในโกดัง QC"),
  wo_submissions:                E("production", "ส่งงานผลิต"),
  erp_role_permission:           E("settings", "สิทธิ์ตามบทบาท"),
  employees:                     E("hr", "พนักงาน", (id) => `/payroll/employees/${id}`),
  color_dictionary:              E("products", "พจนานุกรมสี"),
  erp_playground_quote:          E("sales", "ใบเสนอราคา"),
  subscriptions:                 E("finance", "App Subscription", (id) => `/subscriptions?open=${id}`),
  manufacturing_orders:          E("production", "ใบสั่งผลิต (MO)", (id) => `/master/work-board?mo=${id}`),
  partners_v2:                   E("products", "คู่ค้า (ลูกค้า/ซัพพลายเออร์)", (id) => `/master/partners?open=${id}`),
  employee_contracts:            E("hr", "สัญญาจ้าง", (id) => `/payroll/contracts?open=${id}`),
  china_transfers:               E("finance", "ใบโอนเงินจีน", (id) => `/app/china-pay?transfer=${id}`),
  erp_playground_billing_note:   E("sales", "ใบวางบิล", (id) => `/billing-notes?open=${id}`),
  erp_playground_delivery_note:  E("sales", "ใบส่งของ", (id) => `/delivery-notes?id=${id}`),
  erp_playground_credit_note:    E("sales", "ใบลดหนี้", (id) => `/credit-notes?open=${id}`),
  erp_playground_pr:             E("purchasing", "ใบขอซื้อ (แบบเดิม)"),
  erp_playground_product:        E("products", "สินค้า (ทดลอง)"),
  purchase_vouchers_v2:          E("purchasing", "ใบสำคัญจ่าย", (id) => `/purchasing/vouchers/${id}`),
  goods_receipts_v2:             E("purchasing", "ใบรับของ"),
  pattern_tickets:               E("production", "ใบงานแพทเทิร์น"),
  work_board:                    E("production", "กระดานงานผลิต"),
  paid_service_settings:         E("settings", "บริการที่มีค่าใช้จ่าย (AI/API)"),
  user:                          E("settings", "ผู้ใช้"),
  user_profiles:                 E("settings", "ผู้ใช้"),
  user_profile:                  E("settings", "ผู้ใช้"),
};

/** โมดูลของ entity_type (ทะเบียนก่อน → เดาจากชื่อ → อื่น ๆ) */
export function auditModuleOf(entityType: string): AuditModuleKey {
  const info = ENTITY_INFO[entityType];
  if (info) return info.module;
  for (const r of MODULE_RULES) if (new RegExp(r.re).test(entityType)) return r.module;
  return "other";
}

/** ชื่อหน้า/เอกสาร + ลิงก์ (ไม่มีในทะเบียน = แปลงชื่อ entity_type ให้อ่านง่ายพอเดาได้) */
export function auditEntityInfo(entityType: string): AuditEntityInfo {
  const info = ENTITY_INFO[entityType];
  if (info) return info;
  const page = entityType.replace(/^erp_playground_/, "").replace(/_v2$/, "").replace(/[_.]+/g, " ").trim() || entityType;
  return { module: auditModuleOf(entityType), page };
}

// ── ตัวกรองฝั่ง API (PostgREST .or()) — ต้องให้ผลตรงกับ auditModuleOf ทุกชนิด ─────────────────────

const explicitOf = (m: AuditModuleKey) => Object.keys(ENTITY_INFO).filter((k) => ENTITY_INFO[k].module === m);
const ALL_EXPLICIT = Object.keys(ENTITY_INFO);
/** ค่าในวงเล็บ in.(...) — ชื่อตารางเป็น a-z0-9_ อยู่แล้ว ไม่ต้อง quote */
const inList = (xs: string[]) => `(${xs.join(",")})`;
/** ค่า regex ใน PostgREST ต้องครอบ "..." เพราะมี ( ) | , */
const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * เงื่อนไข `.or(...)` สำหรับกรองโมดูลเดียว:
 *   (อยู่ในทะเบียนของโมดูลนี้) หรือ (ไม่อยู่ในทะเบียนเลย และชื่อเข้า regex ของโมดูลนี้ และไม่เข้า regex ของโมดูลก่อนหน้า)
 */
export function moduleFilterOr(m: AuditModuleKey): string {
  const own = explicitOf(m);
  const idx = MODULE_RULES.findIndex((r) => r.module === m);
  const notEarlier = (idx < 0 ? MODULE_RULES : MODULE_RULES.slice(0, idx)).map((r) => `entity_type.not.match.${q(r.re)}`);
  const parts: string[] = [];
  if (own.length) parts.push(`entity_type.in.${inList(own)}`);
  const guess = [`entity_type.not.in.${inList(ALL_EXPLICIT)}`, ...notEarlier];
  if (idx >= 0) guess.unshift(`entity_type.match.${q(MODULE_RULES[idx].re)}`);
  parts.push(`and(${guess.join(",")})`);
  return parts.join(",");
}

/** ตัวประเมินเงื่อนไขเดียวกับ moduleFilterOr ใน JS — ไว้ทดสอบว่ากรองตรงกับ auditModuleOf */
export function moduleFilterMatches(m: AuditModuleKey, entityType: string): boolean {
  if (explicitOf(m).includes(entityType)) return true;
  if (ALL_EXPLICIT.includes(entityType)) return false;
  const idx = MODULE_RULES.findIndex((r) => r.module === m);
  const earlier = idx < 0 ? MODULE_RULES : MODULE_RULES.slice(0, idx);
  if (earlier.some((r) => new RegExp(r.re).test(entityType))) return false;
  return idx < 0 ? true : new RegExp(MODULE_RULES[idx].re).test(entityType);
}
