/**
 * ตัวแปลประวัติการใช้งาน (audit log) เป็นภาษาคน — ของกลาง · pure ใช้ได้ทั้งหน้าจอและ API
 *
 * ปัญหาเดิม: แต่ละ API จด metadata คนละแบบ (changes เป็นรายการ/เป็นก้อน, before/after, from/to,
 *   changed_fields, fields ฯลฯ) หน้าประวัติเลยอ่านได้แค่แบบเดียว → ขึ้นแค่ "เพิ่ม · โดย ลำปาง"
 * ไฟล์นี้อ่าน "ทุกแบบที่มีอยู่จริง" แล้วคืนก้อนเดียวกัน (AuditView):
 *   ทำอะไร (กลุ่ม + คำกริยา) · รายการไหน (เลขเอกสาร/ชื่อ) · เปลี่ยนจากอะไรเป็นอะไร · ช่องที่แก้ (ถ้าไม่ได้จดค่า) · รายละเอียดอื่น
 *
 * กลุ่มการกระทำ (ACTION_GROUPS) ใช้กติกาเดียวกับตัวกรองฝั่ง API (actionGroupFilter) → ตัวเลขกับผลกรองตรงกัน
 * เอกสาร: docs/audit-log.md
 */
import { auditEntityInfo, auditModuleLabel, type AuditModuleKey } from "@/lib/audit-entities";
import { getStatusStyle } from "@/lib/status-config";

// ── กลุ่มการกระทำ ─────────────────────────────────────────────────────────────

export type AuditActionGroup = "create" | "update" | "status" | "delete" | "output";

export type AuditGroupDef = {
  key: AuditActionGroup;
  label: string;
  /** ชื่อไอคอนในทะเบียนกลาง (<Icon name=…>) */
  icon: string;
  tone: "success" | "accent" | "warning" | "danger" | "neutral";
  /** คำในชื่อ action (ตัวเล็ก) — ห้ามมี _ % (เป็นตัวพิเศษของ LIKE) */
  words: string[];
};

/** เรียงตามลำดับตัดสิน: ตัวแรกที่มีคำตรง = กลุ่มนั้น · ไม่เข้าเลย = แก้ไข */
export const ACTION_GROUPS: AuditGroupDef[] = [
  { key: "delete", label: "ลบ",            icon: "delete", tone: "danger",  words: ["delete", "remove", "purge", "trash", "archive", "unlink", "detach"] },
  { key: "output", label: "พิมพ์/ส่งออก",   icon: "print",  tone: "neutral", words: ["print", "export", "pdf", "download"] },
  { key: "status", label: "อนุมัติ/สถานะ",  icon: "done",   tone: "warning", words: ["approve", "reject", "revise", "status", "submit", "confirm", "cancel", "close", "reopen", "restore", "issue", "receive", "ship", "send", "skip", "claim", "publish", "enable", "disable", "complete"] },
  { key: "create", label: "เพิ่ม",          icon: "add",    tone: "success", words: ["create", "add", "insert", "import", "copy", "duplicate", "upload", "attach", "clone"] },
  { key: "update", label: "แก้ไข",          icon: "edit",   tone: "accent",  words: [] },
];

export const ACTION_GROUP_BY_KEY = Object.fromEntries(ACTION_GROUPS.map((g) => [g.key, g])) as Record<AuditActionGroup, AuditGroupDef>;

export function auditActionGroup(action: string): AuditActionGroup {
  const a = action.toLowerCase();
  for (const g of ACTION_GROUPS) if (g.words.some((w) => a.includes(w))) return g.key;
  return "update";
}

/**
 * เงื่อนไขกรองกลุ่มเดียวฝั่ง API: { or: "action.ilike.*w*,..." (ถ้ามี), not: ["*w*", ...] คำของกลุ่มก่อนหน้า }
 * ใช้: q = q.or(f.or) แล้ว f.not.forEach(p => q = q.not("action", "ilike", p))
 */
export function actionGroupFilter(g: AuditActionGroup): { or: string | null; not: string[] } {
  const idx = ACTION_GROUPS.findIndex((x) => x.key === g);
  const own = ACTION_GROUPS[idx]?.words ?? [];
  const earlier = ACTION_GROUPS.slice(0, Math.max(0, idx)).flatMap((x) => x.words);
  return { or: own.length ? own.map((w) => `action.ilike.*${w}*`).join(",") : null, not: earlier.map((w) => `*${w}*`) };
}

/**
 * บันทึกอัตโนมัติที่ไม่ได้บอกว่า "คนทำอะไร" — หน้ารวมซ่อนไว้ก่อน (ติ๊กแสดงได้)
 *   กระดานเซฟเอง (canvas_update) · อัปโหลดไฟล์ดิบ (file/upload) · สคริปต์นำเข้าอีเมลยอดขาย (platform_email)
 * ⚠️ แก้ตรงนี้ต้องแก้ตัวกรอง hideNoise ใน app/api/audit-logs/route.ts ให้ตรงกัน
 */
export const AUDIT_NOISE_ENTITY_TYPES = ["platform_email"];
export function isAuditNoise(action: string, entityType: string): boolean {
  return action === "canvas_update" || (entityType === "file" && action === "upload") || AUDIT_NOISE_ENTITY_TYPES.includes(entityType);
}

// ── คำกริยา (ชื่อ action → ภาษาไทย) ─────────────────────────────────────────

const VERBS: Record<string, string> = {
  create: "เพิ่ม", add: "เพิ่ม", insert: "เพิ่ม", update: "แก้ไข", edit: "แก้ไข", delete: "ลบ", remove: "เอาออก",
  delete_permanent: "ลบถาวร", archive: "เก็บเข้าคลัง (ซ่อน)", restore: "กู้คืน", purge: "ล้างข้อมูล",
  approve: "อนุมัติ", reject: "ไม่อนุมัติ", revise: "ขอแก้", submit: "ส่งขออนุมัติ", confirm: "ยืนยัน",
  cancel: "ยกเลิก", close: "ปิดงาน", reopen: "เปิดงานคืน", issue: "ออกเอกสาร", receive: "รับของ", ship: "ส่งออกจากคลัง",
  send: "ส่ง", print: "พิมพ์", export: "ส่งออกไฟล์", import: "นำเข้า", upload: "อัปโหลดไฟล์", attach: "แนบไฟล์",
  detach: "เอาไฟล์ออก", copy: "คัดลอก", duplicate: "ทำสำเนา", merge: "รวมรายการ", tag: "ติดแท็ก", untag: "เอาแท็กออก",
  comment: "แสดงความคิดเห็น", comment_add: "แสดงความคิดเห็น", transfer: "โอนย้าย", in: "รับเข้า", out: "จ่ายออก",
  adjust: "ปรับยอด", grant: "ให้สิทธิ์", revoke: "ถอนสิทธิ์", enable: "เปิดใช้", disable: "ปิดใช้",
  skip_stage: "ข้ามขั้น", unskip_stage: "เอาคืนขั้น", version_restore: "ย้อนเวอร์ชัน", canvas_update: "กระดานบันทึกอัตโนมัติ",
  bulk_update: "แก้หลายรายการ", bulk_edit: "แก้หลายรายการ", bulk_delete: "ลบหลายรายการ", bulk_move: "ย้ายหลายรายการ",
  renumber: "เปลี่ยนเลขเอกสาร", convert_to_so: "แปลงเป็นใบขาย", to_quotation: "ทำใบเสนอราคา", status_change: "เปลี่ยนสถานะ",
  status: "เปลี่ยนสถานะ", increase_qty: "เพิ่มจำนวน", reduce_qty: "ลดจำนวน", reprocess: "ประมวลผลใหม่",
  move: "ย้าย", reorder: "จัดลำดับ", calculate: "คำนวณ", generate_payslips: "สร้างสลิปเงินเดือน", print_payslips: "พิมพ์สลิปเงินเดือน",
  disable_field: "ปิดช่อง", self_join: "รับงานเอง", self_leave: "ถอนตัวจากงาน", sync: "ซิงก์", publish: "เผยแพร่",
  task_approve: "อนุมัติงาน", task_revise: "ขอแก้งาน", claim: "รับงาน", done: "เสร็จ", step: "เลื่อนขั้นตอน",
};

const NAMESPACE: Record<string, string> = {
  subtask: "งานย่อย", attachment: "ไฟล์แนบ", master: "", mo: "ใบสั่งผลิต", qc: "QC", wo: "ใบงาน",
  marketing: "", work: "", sku: "", variant: "ตัวเลือก", schema: "ช่องข้อมูล", menu: "เมนู", menu_app: "แอป",
  website: "เว็บร้าน", pattern: "", product: "", payroll: "", storage: "ที่เก็บไฟล์", module: "โมดูล",
};

/** "subtask:approve" → "อนุมัติงานย่อย" · "status:a→b" → "เปลี่ยนสถานะ" · ไม่รู้จัก = คำเดิมแบบอ่านง่าย */
export function auditVerb(action: string): string {
  if (action.startsWith("status:")) return "เปลี่ยนสถานะ";
  if (VERBS[action]) return VERBS[action];
  const parts = action.split(/[:.]/).filter(Boolean);
  const last = parts[parts.length - 1] ?? action;
  const ns = parts.slice(0, -1).map((p) => NAMESPACE[p] ?? "").filter(Boolean).join(" ");
  const verb = VERBS[last];
  if (verb) return ns ? `${verb}${ns}` : verb;
  return action.replace(/[_:.]+/g, " ").trim();
}

// ── ป้ายช่อง + การแสดงค่า ────────────────────────────────────────────────────

/** ชื่อช่องที่พบบ่อย (ทะเบียน field กลางมีชื่อจริงกว่า — API ส่งมาเป็น ctx.fieldLabels) */
export const COMMON_FIELD_LABELS: Record<string, string> = {
  sku: "SKU", code: "รหัส", name: "ชื่อ", name_th: "ชื่อ (ไทย)", name_en: "ชื่อ (อังกฤษ)", title: "หัวข้อ",
  description: "คำอธิบาย", status: "สถานะ", approval_status: "สถานะอนุมัติ", qty: "จำนวน", quantity: "จำนวน",
  price: "ราคา", list_price: "ราคาขาย", standard_price: "ราคาทุน", cost_price: "ราคาทุน", rmb_cost: "ต้นทุนหยวน",
  amount: "ยอดเงิน", total: "ยอดรวม", currency: "สกุลเงิน", note: "หมายเหตุ", notes: "หมายเหตุ", reason: "เหตุผล",
  is_active: "ใช้งานอยู่", active: "ใช้งานอยู่", cover_image_r2_key: "รูปปก", brand_id: "แบรนด์", brands: "แบรนด์",
  category_id: "หมวดหมู่", uom_id: "หน่วย", purchase_uom_id: "หน่วยซื้อ", assignee_id: "ผู้รับผิดชอบ",
  due_date: "กำหนดส่ง", deadline: "กำหนดส่ง", order_date: "วันที่สั่ง", purchase_url: "ลิงก์สั่งซื้อ",
  purchase_link: "ลิงก์สั่งซื้อ", progress_percent: "ความคืบหน้า (%)", completed_at: "เสร็จเมื่อ",
  color: "สี", color_th: "สี (ไทย)", barcode: "บาร์โค้ด", parent_sku_id: "Parent SKU", seller_partner_id: "ผู้ขาย",
  partner_id: "คู่ค้า", sku_id: "SKU", moq: "สั่งขั้นต่ำ", fake_price: "ราคาก่อนลด", sale_price: "ราคาขาย",
  location: "ที่เก็บ", from_to: "ย้าย", value: "ค่า", count: "จำนวน", affected: "จำนวนที่กระทบ",
  line_count: "จำนวนบรรทัด", item_name: "รายการ", kind: "ชนิด", mode: "วิธี", via: "ผ่าน", source: "ที่มา",
  stage_label: "ขั้น", period_name: "งวด", printed_count: "พิมพ์", selected_count: "เลือก",
  reference_images: "รูปอ้างอิง", image_sync_targets: "ปลายทางรูป", config: "การตั้งค่า", body_html: "เนื้อหา",
  detail: "รายละเอียด", drive_link: "ลิงก์ Drive", appointment_date: "วันนัด", parent_sku_codes: "Parent SKU",
  sales_credit_term: "เครดิตลูกค้า", enabled: "เปิดใช้", label_id: "ป้าย", checklist: "เช็กลิสต์", icon_url: "ไอคอน",
  asset_type: "ชนิดไฟล์", size_bytes: "ขนาดไฟล์ (ไบต์)", received: "รับเข้า", orders_created: "สร้างออเดอร์", ignored: "ข้าม",
  done: "เสร็จ", stage: "ขั้น", step: "ขั้นตอน", type: "ประเภท", price_type: "ประเภทราคา", warehouse: "คลัง",
  key: "รหัสตั้งค่า", model: "โมเดล",
  // งาน / คอนเทนต์
  reviewer_id: "ผู้ตรวจ", approver_id: "ผู้อนุมัติ", assigned_by_id: "ผู้มอบหมาย", assignee_ids: "ผู้รับผิดชอบ",
  start_date: "วันเริ่ม", priority: "ความสำคัญ", task_type: "ชนิดงาน", campaign_id: "แคมเปญ", product_name: "ชื่อสินค้า",
  platforms: "แพลตฟอร์ม", drive_folder_url: "โฟลเดอร์ Drive", final_asset_url: "ลิงก์งานจริง", published_url: "ลิงก์โพสต์",
  blocker_reason: "เหตุติดขัด", asset_status: "สถานะไฟล์งาน", reference_html: "บรีฟ", captions: "แคปชัน",
  post_status: "สถานะโพสต์", post_type: "ชนิดโพสต์", scheduled_at: "เวลาโพสต์", product_links: "ลิงก์สินค้า",
  ref_links: "ลิงก์อ้างอิง", products: "สินค้า", title_en: "หัวข้อ (อังกฤษ)", required_before_next: "ต้องเสร็จก่อนขั้นถัดไป",
  sort_order: "ลำดับ", published_at: "เผยแพร่เมื่อ", resolved_at: "เสร็จเมื่อ", resolved_by: "ปิดโดย", assigned_to: "มอบให้",
  due_at: "กำหนด", discount_value: "ส่วนลด", discount_is_percent: "ส่วนลดเป็น %",
  // ผลิต / สูตร
  product_sku: "SKU สินค้า", bom_code: "รหัสสูตร", bom_version: "เวอร์ชันสูตร", size_breakdown: "จำนวนตามไซส์",
  fabric_calc_mode: "วิธีคิดผ้า", on_hand_qty: "มีอยู่", to_purchase_qty: "ต้องซื้อ", is_ready: "เตรียมแล้ว",
  cut_done: "ตัดแล้ว", cut_done_at: "ตัดเมื่อ", version: "เวอร์ชัน", bom_type: "ชนิดสูตร", effective_from: "ใช้ตั้งแต่",
  // บุคคล
  department_id: "แผนก", company_id: "บริษัท", supplier_id: "ผู้ขาย", employment_status: "สถานะพนักงาน",
  base_salary: "เงินเดือน", end_date: "วันสิ้นสุด", nickname: "ชื่อเล่น", first_name: "ชื่อ", last_name: "นามสกุล",
  phone: "เบอร์โทร", parent_brand_id: "แบรนด์แม่",
  // แบรนด์ / อื่น ๆ
  default_customer_id: "ลูกค้าหลัก", default_customer_ids: "ลูกค้าประจำแบรนด์", logo_url: "โลโก้", is_customer_job: "งานลูกค้า", hide_in_artwork: "ซ่อนในงานอาร์ตเวิร์ก",
  pricing_mode: "วิธีคิดราคา", reexploded: "คำนวณวัตถุดิบใหม่", links: "ลิงก์", mo_nos: "ใบสั่งผลิต", component: "วัตถุดิบ",
  component_sku: "รหัสวัตถุดิบ",
  // ใบออกแบบ
  cost_total: "ยอดต้นทุนรวม", cost_extra: "ค่าใช้จ่ายเพิ่ม", profit_splits: "แบ่งกำไร", offered_price: "ราคาเสนอลูกค้า",
  quote_date: "วันที่เสนอราคา", waiting_for: "รออะไร", cost_general_label: "ชื่อค่าใช้จ่ายทั่วไป", parent_sku_drafts: "ร่าง Parent",
  parent_sku_code: "Parent SKU", img_cols: "จำนวนคอลัมน์รูป", calc: "ตารางคำนวณ", show: "การแสดงผล", images: "รูป",
  comment_date: "วันที่คอมเมนต์", body: "ข้อความ", round: "รอบ", batch: "ครั้งที่", parent_code: "Parent", cells: "จำนวนช่อง",
  lines: "จำนวนบรรทัด", sheet_ids: "ใบออกแบบ", sheet_id: "ใบออกแบบ", columns: "คอลัมน์", audience: "ผู้รับ", items: "จำนวนรายการ",
};

const STATUS_FIELDS = new Set(["status", "approval_status", "post_status", "status_from", "status_to"]);
/** ป้ายสถานะที่ทะเบียนกลาง (lib/status-config) ยังไม่มี — ใช้เฉพาะในประวัติ */
const STATUS_TH: Record<string, string> = {
  todo: "ยังไม่เริ่ม", in_progress: "กำลังทำ", doing: "กำลังทำ", need_review: "รอตรวจ", submitted: "ส่งตรวจแล้ว",
  revision: "ขอแก้", revision_requested: "ขอแก้", approved: "อนุมัติแล้ว", done: "เสร็จ", cancelled: "ยกเลิก", canceled: "ยกเลิก",
  backlog: "รอคิว", ready: "พร้อม", published: "เผยแพร่แล้ว", posted: "โพสต์แล้ว", skip: "ข้าม", new: "ใหม่", pending: "รอดำเนินการ",
  rejected: "ไม่อนุมัติ", closed: "ปิดแล้ว", ordered: "สั่งแล้ว", received: "รับแล้ว", paid: "จ่ายแล้ว", open: "เปิดอยู่",
};
function statusLabel(code: string): string {
  const l = getStatusStyle(code).label;
  return l && l !== code ? l : STATUS_TH[code] ?? code;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const stripHtml = (s: string) => (/<[a-z][\s\S]*>/i.test(s) ? s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() : s);

/** ค่าที่โชว์ในตาราง "จาก → เป็น" (สั้น อ่านง่าย ไม่ใช่ JSON ดิบ) */
export function fmtAuditValue(v: unknown, field?: string, valueLabels?: Record<string, string>): string {
  if (v === null || v === undefined || v === "") return "ว่าง";
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่ใช่";
  if (typeof v === "number") return v.toLocaleString("th-TH", { maximumFractionDigits: 4 });
  if (Array.isArray(v)) {
    if (v.length === 0) return "ว่าง";
    const xs = v.slice(0, 5).map((x) => fmtAuditValue(x, undefined, valueLabels));
    return `${xs.join(", ")}${v.length > 5 ? ` …(+${v.length - 5})` : ""}`;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("count" in o && "total" in o) return `${o.count} รายการ · ฿${Number(o.total).toLocaleString("th-TH")}`;
    if ("count" in o && Object.keys(o).length === 1) return `${o.count} รายการ`;
    if (typeof o.preview === "string") return clip(o.preview, 120);   // ค่ายาวที่ auditDiff ตัดไว้
    if (typeof o.name === "string") return o.name;
    if (typeof o.label === "string") return o.label;
    // ก้อนเล็ก ๆ ค่าเดี่ยว เช่น สถานะโพสต์รายแพลตฟอร์ม {facebook:"posted"} → "facebook: โพสต์แล้ว"
    const entries = Object.entries(o);
    if (entries.length === 0) return "ว่าง";
    if (entries.length <= 6 && entries.every(([, x]) => x === null || ["string", "number", "boolean"].includes(typeof x))) {
      return clip(entries.map(([k, x]) => `${k}: ${typeof x === "string" ? statusLabel(x) : fmtAuditValue(x)}`).join(", "), 140);
    }
    return clip(JSON.stringify(o), 80);
  }
  const s = String(v);
  if (field && STATUS_FIELDS.has(field)) return statusLabel(s);
  if (UUID_RE.test(s)) return valueLabels?.[s.toLowerCase()] ?? `รหัส …${s.slice(-4)}`;
  if (ISO_RE.test(s)) {
    const d = new Date(s.length === 10 ? `${s}T00:00:00+07:00` : s);
    if (!isNaN(d.getTime())) {
      return s.length === 10
        ? d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" })
        : d.toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
    }
  }
  return clip(stripHtml(s), 140);
}

// ── ผลการแปล ────────────────────────────────────────────────────────────────

export type AuditChange = {
  field: string;
  label: string;
  /** มีค่าเดิมจดไว้ไหม (ข้อมูลเก่าบางแบบจดแค่ค่าใหม่) */
  hasOld: boolean;
  old?: string;
  new?: string;
  /** ซ่อนค่าเพราะผู้ดูไม่มีสิทธิ์ (API ตั้งให้) */
  hidden?: boolean;
};

export type AuditView = {
  group: AuditActionGroup;
  verb: string;
  module: AuditModuleKey;
  moduleLabel: string;
  page: string;
  /** เลขเอกสาร/รหัส เช่น PR-2026-00872 */
  recordCode: string | null;
  /** ชื่อรายการ เช่น หัวซิปฟันเหล็ก#5 */
  recordName: string | null;
  href: string | null;
  changes: AuditChange[];
  /** รู้แค่ว่าแก้ช่องไหน (ระบบเดิมไม่ได้จดค่า) */
  fieldsOnly: string[];
  /** ช่องก้อนข้อมูลภายในที่แก้ (ตั้งค่า/รูป/ลิงก์ชุด) — จดแค่ว่าแก้ ไม่จดค่า (ตั้งใจ) */
  detailFields: string[];
  /** รายละเอียดอื่นที่จดไว้ เช่น จำนวน 940 · เหตุผล เปิดซ้ำ */
  extras: { label: string; value: string; hidden?: boolean }[];
  noise: boolean;
};

export type AuditRowLike = {
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
};

export type AuditFormatCtx = {
  /** ชื่อช่องจากทะเบียน field กลาง: field → ป้าย */
  fieldLabels?: Record<string, string>;
  /** ช่องที่ผู้ดูไม่มีสิทธิ์เห็นค่า (API คำนวณ) */
  hiddenFields?: Set<string>;
  /** ชื่อของรหัสอ้างอิง (uuid ตัวเล็ก → ชื่อ) เช่น รหัสแบรนด์ → "Louis Montini" — API หาให้จากทะเบียน field */
  valueLabels?: Record<string, string>;
};

/** คีย์เลขเอกสาร/รหัส (ตัวแรกที่มีค่า = ใช้) */
const CODE_KEYS = ["pr_no", "po_no", "pv_no", "so_number", "so_no", "mo_no", "wo_no", "task_no", "content_no", "ticket_no", "doc_no", "number", "run_no",
  "movement_number", "bom_code", "code", "sku", "loan_code", "contract_no", "transfer_no", "invoice_no", "period_name"];
/** คีย์ชื่อรายการ */
const NAME_KEYS = ["item_name", "name", "name_th", "title", "subtask_title", "job_name", "label", "loan_name", "file_name", "sku_name", "product", "product_name"];

/** คีย์ที่ช่องค้นหาในหน้าประวัติค้น (เลขเอกสาร + ชื่อ) */
export const AUDIT_SEARCH_KEYS: string[] = [...CODE_KEYS, ...NAME_KEYS.filter((k) => k !== "product")];

/** คีย์ระบบ/ภายใน ไม่โชว์เป็นรายละเอียด */
const SKIP_EXTRA = new Set([
  "actor", "actor_name", "entity", "changes", "changed_fields", "changed_detail", "changed", "fields", "before", "after", "from", "to",
  "status_from", "status_to", "old_status", "new_status", "old", "new", "field", "id", "ids", "item_ids", "r2_key",
  "content_type", "size", "has_preview", "rev", "system", "reference", "created_at", "updated_at", "via",
  "skipped_no_permission", "groups", "parent_sku_ids", "subtask_id", "shopId", "shop_id", "_i18n", "what",
  ...CODE_KEYS, ...NAME_KEYS,
]);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** แปลง 1 แถวประวัติ → ก้อนพร้อมแสดง */
export function describeAudit(row: AuditRowLike, ctx: AuditFormatCtx = {}): AuditView {
  const m: Record<string, unknown> = isObj(row.metadata) ? row.metadata : {};
  const info = auditEntityInfo(row.entity_type);
  if (row.action.startsWith("file_sort.")) return describeFileSort(row, m, info);
  const hidden = ctx.hiddenFields ?? new Set<string>();
  const labelOf = (f: string) => ctx.fieldLabels?.[f] || COMMON_FIELD_LABELS[f] || f;

  const changes: AuditChange[] = [];
  const seen = new Set<string>();
  const push = (field: string, hasOld: boolean, oldV: unknown, newV: unknown, label?: string) => {
    if (!field || seen.has(field)) return;
    seen.add(field);
    const isHidden = hidden.has(field);
    changes.push({
      field, label: label || labelOf(field), hasOld,
      ...(isHidden ? { hidden: true } : { old: hasOld ? fmtAuditValue(oldV, field, ctx.valueLabels) : undefined, new: fmtAuditValue(newV, field, ctx.valueLabels) }),
    });
  };

  // 1) changes: [{field,label,old,new}] หรือ [{field,from,to}]
  const ch = m.changes;
  if (Array.isArray(ch)) {
    for (const c of ch) {
      if (!isObj(c)) continue;
      const f = str(c.field) ?? str(c.key);
      if (!f) continue;
      const hasOld = "old" in c || "from" in c;
      push(f, hasOld, "old" in c ? c.old : c.from, "new" in c ? c.new : c.to, str(c.label) ?? undefined);
    }
  } else if (isObj(ch)) {
    // 2) changes: {field: {from,to}} หรือ {field: {old,new}} หรือ {field: ค่าใหม่}
    for (const [f, v] of Object.entries(ch)) {
      if (isObj(v) && ("from" in v || "to" in v || "old" in v || "new" in v)) {
        push(f, "from" in v || "old" in v, "old" in v ? v.old : v.from, "new" in v ? v.new : v.to);
      } else push(f, false, undefined, v);
    }
  }
  // 3) before / after
  if (isObj(m.before) && isObj(m.after)) {
    const b = m.before, a = m.after;
    for (const k of Object.keys(a)) {
      if (k === "updated_at" || k === "created_at" || k === "id") continue;
      if (JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null)) push(k, true, b[k], a[k]);
    }
  }
  // 4) สถานะ: status_from/status_to · old_status/new_status · action "status:a→b"
  if (m.status_from !== undefined || m.status_to !== undefined) push("status", m.status_from !== undefined, m.status_from, m.status_to);
  else if (m.old_status !== undefined || m.new_status !== undefined) push("status", m.old_status !== undefined, m.old_status, m.new_status);
  else if (row.action.startsWith("status:") && row.action.includes("→")) {
    const [a, b] = row.action.slice(7).split("→");
    push("status", true, a, b);
  }
  // 5) from/to บนสุด (ย้ายคลัง/ย้ายแผนก/เปลี่ยนสถานะใบงาน) — มี field บอกชื่อช่องก็ใช้
  if ((m.from !== undefined || m.to !== undefined) && !isObj(m.from) && !isObj(m.to)) {
    const f = str(m.field) ?? (/(status|claim|cancel|done|step)/i.test(row.action) ? "status" : "from_to");
    push(f, true, m.from, m.to);
  }
  // 6) old/new บนสุด (เช่น ตั้งหมวดสินค้าเว็บร้าน)
  if (("old" in m || "new" in m) && !Array.isArray(ch)) push(str(m.kind) ?? str(m.field) ?? "value", "old" in m, m.old, m.new);

  // ช่องที่รู้แค่ชื่อ (ไม่ได้จดค่า)
  const names = new Set<string>();
  for (const key of ["changed_fields", "fields", "changed", "changes"] as const) {
    const v = m[key];
    if (Array.isArray(v)) for (const x of v) if (typeof x === "string" && !seen.has(x) && x !== "updated_at") names.add(x);
  }
  const fieldsOnly = [...names].map(labelOf);
  const detailFields = Array.isArray(m.changed_detail)
    ? (m.changed_detail as unknown[]).filter((x): x is string => typeof x === "string" && !seen.has(x)).map(labelOf)
    : [];

  // เลขเอกสาร + ชื่อ
  let recordCode: string | null = null;
  for (const k of CODE_KEYS) { const v = str(m[k]); if (v) { recordCode = v; break; } }
  let recordName: string | null = null;
  for (const k of NAME_KEYS) { const v = str(m[k]); if (v && v !== recordCode) { recordName = clip(stripHtml(v), 120); break; } }
  if (!recordName && isObj(m.after)) recordName = str(m.after.name) ?? str(m.after.name_th);

  // รายละเอียดอื่น (ค่าเดี่ยว ๆ ที่จดไว้) — ไม่เกิน 6 ช่อง
  const extras: AuditView["extras"] = [];
  for (const [k, v] of Object.entries(m)) {
    if (extras.length >= 6) break;
    if (SKIP_EXTRA.has(k) || seen.has(k) || names.has(k)) continue;
    if (v === null || v === undefined || v === "" || isObj(v)) continue;
    if (Array.isArray(v) && (v.length === 0 || v.some((x) => isObj(x)))) continue;
    if (typeof v === "string" && UUID_RE.test(v)) continue;
    extras.push(hidden.has(k) ? { label: labelOf(k), value: "", hidden: true } : { label: labelOf(k), value: fmtAuditValue(v, k) });
  }

  return {
    group: auditActionGroup(row.action),
    verb: auditVerb(row.action),
    module: info.module,
    moduleLabel: auditModuleLabel(info.module),
    page: info.page,
    recordCode,
    recordName,
    href: row.entity_id && info.href ? info.href(row.entity_id) : null,
    changes,
    fieldsOnly,
    detailFields,
    extras,
    noise: isAuditNoise(row.action, row.entity_type),
  };
}

// ── ตัวแยกไฟล์ ERP (file_sort.upload / file_sort.undo · โปรแกรมบนเครื่องจดผ่าน /api/file-sort/log) ──
//   1 แถว = 1 ครั้งที่ใช้: รุ่น/งาน · ชนิดงาน · ลงกี่รูป · ย้ายอะไรจากไหนไปไหน (moves) · ย้ายกลับแล้ว (undone_at / undone_by — /api/file-sort/history แนบให้)
const FS_KIND: Record<string, string> = { new: "สินค้าใหม่", color: "เพิ่มสี", edit: "แก้สี", content: "Content", artwork: "โลโก้ / Artwork" };
const FS_WHAT: Record<string, string> = { raw: "Rawfiles", images: "Images", collection: "ทั้งโฟลเดอร์ → Collection" };
const FS_HOW: Record<string, string> = { merge: " · รวมเข้าของเดิม ไม่ทับ", copy: " · ก๊อปจากเครื่อง", "copy+trash": " · ก๊อปแล้วต้นฉบับลงถังขยะ" };
const FS_STATUS: Record<string, string> = { done: "ครบ", partial: "ได้บางส่วน", failed: "ไม่สำเร็จ" };

/** ชนิดงานของตัวแยกไฟล์เป็นภาษาคน (สินค้าใหม่ / เพิ่มสี / แก้สี / Content / โลโก้) */
export function fileSortKindLabel(m: Record<string, unknown>): string {
  return m.profile === "product" ? FS_KIND[String(m.variant ?? "new")] ?? "งานสินค้า" : FS_KIND[String(m.profile ?? "artwork")] ?? "งาน";
}

function describeFileSort(row: AuditRowLike, m: Record<string, unknown>, info: ReturnType<typeof auditEntityInfo>): AuditView {
  const undo = row.action === "file_sort.undo";
  const raw = undo ? m.undone : m.moves;
  const changes: AuditChange[] = [];
  (Array.isArray(raw) ? raw : []).forEach((x, i) => {
    if (!isObj(x)) return;
    const from = str(x.from), to = str(x.to);
    if (!from && !to) return;
    const files = typeof x.files === "number" && x.files > 0 ? ` ${x.files} ไฟล์` : "";
    const label = `${FS_WHAT[str(x.what) ?? ""] ?? "โฟลเดอร์"}${files}${FS_HOW[str(x.how) ?? ""] ?? ""}`;
    // ลงไฟล์: ที่เดิม → ที่ใหม่ · ย้ายกลับ: ที่ที่เคยย้ายไป → กลับที่เดิม
    const a = undo ? to : from, b = undo ? from : to;
    changes.push({ field: `move${i}`, label, hasOld: !!a, old: a ?? undefined, new: b ?? "" });
  });
  const c = isObj(m.counts) ? m.counts : {};
  const n = (k: string) => (typeof c[k] === "number" ? (c[k] as number) : 0);
  const extras: AuditView["extras"] = [];
  if (!undo) {
    if (n("erp")) extras.push({ label: "ลงระบบ", value: `${n("erp")} รูป` });
    if (n("album")) extras.push({ label: "ลงอัลบั้ม", value: `${n("album")} ไฟล์` });
    if (n("drive")) extras.push({ label: "ขึ้น Drive", value: `${n("drive")} ไฟล์` });
    if (n("nas")) extras.push({ label: "ก๊อปลง Z:", value: `${n("nas")} ไฟล์` });
    if (n("failed")) extras.push({ label: "พลาด", value: String(n("failed")) });
    const st = FS_STATUS[str(m.status) ?? ""];
    if (st) extras.push({ label: "ผล", value: st });
    const at = str(m.undone_at);
    if (at) {
      const when = new Date(at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
      extras.push({ label: "ย้ายกลับแล้ว", value: `${when}${str(m.undone_by) ? ` · ${str(m.undone_by)}` : ""}` });
    }
  } else if (Array.isArray(m.errors) && m.errors.length) extras.push({ label: "ย้ายกลับไม่ได้", value: `${m.errors.length} อย่าง` });
  return {
    group: undo ? "status" : "create", verb: undo ? "ย้ายกลับ" : "ลงไฟล์",
    module: info.module, moduleLabel: "ตัวแยกไฟล์", page: fileSortKindLabel(m),
    recordCode: str(m.model) ?? str(m.name), recordName: null, href: null,
    changes, fieldsOnly: [], detailFields: [], extras, noise: false,
  };
}
