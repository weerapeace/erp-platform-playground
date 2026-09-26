import type { ReportTemplateRow } from "@/app/api/admin/report-templates/route";

export type ReportFieldDef = {
  key: string;
  label: string;
  group: string;
  sample: string;
};

export type ReportTableColumnDef = {
  key: string;
  label: string;
  sample: string;
  align?: "left" | "center" | "right";
  width?: number;
};

export type ReportTableDef = {
  key: string;
  label: string;
  itemLabel: string;
  columns: ReportTableColumnDef[];
};

export type ReportEntityDef = {
  key: string;
  label: string;
  fields: ReportFieldDef[];
  tables: ReportTableDef[];
  sampleData: Record<string, unknown>;
};

export type TemplateStatus = "draft" | "published" | "archived";

export type ReportDesignerMeta = {
  status: TemplateStatus;
  version: number;
  base_template_id?: string | null;
  updated_by?: string | null;
};

const META_PREFIX = "__designer:";
const META_SUFFIX = "__";

export function parseDesignerDescription(description: string | null | undefined): {
  meta: ReportDesignerMeta;
  note: string;
} {
  const fallback: ReportDesignerMeta = { status: "draft", version: 1 };
  if (!description?.startsWith(META_PREFIX)) return { meta: fallback, note: description ?? "" };

  const suffixIndex = description.indexOf(META_SUFFIX, META_PREFIX.length);
  if (suffixIndex < 0) return { meta: fallback, note: description };

  const raw = description.slice(META_PREFIX.length, suffixIndex);
  const note = description.slice(suffixIndex + META_SUFFIX.length).replace(/^\n/, "");
  try {
    const parsed = JSON.parse(raw) as Partial<ReportDesignerMeta>;
    const status = parsed.status === "published" || parsed.status === "archived" || parsed.status === "draft"
      ? parsed.status
      : fallback.status;
    return {
      meta: {
        status,
        version: Number(parsed.version || 1),
        base_template_id: parsed.base_template_id ?? null,
        updated_by: parsed.updated_by ?? null,
      },
      note,
    };
  } catch {
    return { meta: fallback, note: description };
  }
}

export function buildDesignerDescription(meta: ReportDesignerMeta, note = ""): string {
  return `${META_PREFIX}${JSON.stringify(meta)}${META_SUFFIX}${note ? `\n${note}` : ""}`;
}

export function inferTemplateStatus(row: ReportTemplateRow): TemplateStatus {
  const parsed = parseDesignerDescription(row.description);
  if (parsed.meta.status !== "draft") return parsed.meta.status;
  if (row.is_default && row.active) return "published";
  if (!row.active) return "draft";
  return "draft";
}

export function statusLabel(status: TemplateStatus): string {
  if (status === "published") return "Published";
  if (status === "archived") return "Archived";
  return "Draft";
}

export function statusClass(status: TemplateStatus): string {
  if (status === "published") return "bg-emerald-100 text-emerald-700";
  if (status === "archived") return "bg-slate-200 text-slate-500";
  return "bg-amber-100 text-amber-700";
}

const quoteFields: ReportFieldDef[] = [
  { key: "quote_number", label: "เลขที่ใบเสนอราคา", group: "หัวเอกสาร", sample: "QT-202606-0001" },
  { key: "quote_date_th", label: "วันที่เสนอราคา", group: "หัวเอกสาร", sample: "7 มิ.ย. 2569" },
  { key: "valid_until_th", label: "ยืนราคาถึง", group: "หัวเอกสาร", sample: "7 ก.ค. 2569" },
  { key: "customer_name", label: "ชื่อลูกค้า", group: "ลูกค้า", sample: "บริษัท ตัวอย่าง จำกัด" },
  { key: "customer_code", label: "รหัสลูกค้า", group: "ลูกค้า", sample: "CUS-001" },
  { key: "customer_address", label: "ที่อยู่ลูกค้า", group: "ลูกค้า", sample: "กรุงเทพฯ" },
  { key: "customer_phone", label: "เบอร์โทรลูกค้า", group: "ลูกค้า", sample: "02-000-0000" },
  { key: "sale_person_name", label: "เซลส์", group: "ผู้รับผิดชอบ", sample: "Gogo" },
  { key: "note", label: "หมายเหตุ", group: "หมายเหตุ", sample: "ส่งภายใน 30 วัน" },
  { key: "subtotal", label: "รวมเงิน", group: "ยอดเงิน", sample: "156,000.00" },
  { key: "vat_rate", label: "VAT %", group: "ยอดเงิน", sample: "7" },
  { key: "total_vat", label: "ภาษีมูลค่าเพิ่ม", group: "ยอดเงิน", sample: "10,920.00" },
  { key: "grand_total", label: "จำนวนเงินทั้งสิ้น", group: "ยอดเงิน", sample: "166,920.00" },
  { key: "grand_total_text", label: "จำนวนเงินตัวอักษร", group: "ยอดเงิน", sample: "หนึ่งแสนหกหมื่นหกพันเก้าร้อยยี่สิบบาทถ้วน" },
];

const quoteLineColumns: ReportTableColumnDef[] = [
  { key: "idx", label: "ลำดับ", sample: "1", align: "center", width: 6 },
  { key: "sku", label: "รหัสสินค้า", sample: "CTLSB24-10-01", align: "center", width: 14 },
  { key: "product_name", label: "รายการ", sample: "กระเป๋าสาน", width: 30 },
  { key: "image_html", label: "ภาพ", sample: "รูปสินค้า", align: "center", width: 16 },
  { key: "qty", label: "จำนวน", sample: "100.00", align: "right", width: 9 },
  { key: "unit", label: "หน่วย", sample: "pcs.", align: "center", width: 7 },
  { key: "unit_price", label: "ราคาต่อหน่วย", sample: "520.00", align: "right", width: 9 },
  { key: "line_total", label: "จำนวนเงิน", sample: "52,000.00", align: "right", width: 11 },
];

const woFields: ReportFieldDef[] = [
  { key: "mo_number", label: "เลขที่ใบสั่งผลิต", group: "หัวเอกสาร", sample: "MO-2026-0001" },
  { key: "status_label", label: "สถานะ", group: "หัวเอกสาร", sample: "ร่าง" },
  { key: "created_at_th", label: "วันที่สั่ง", group: "หัวเอกสาร", sample: "1 มิ.ย. 2569" },
  { key: "due_date_th", label: "กำหนดส่ง", group: "หัวเอกสาร", sample: "15 มิ.ย. 2569" },
  { key: "product_sku", label: "รหัสสินค้า", group: "สินค้า", sample: "BBP13-02" },
  { key: "product_name", label: "ชื่อสินค้า", group: "สินค้า", sample: "กระเป๋าเป้สะพายหลัง BBP13" },
  { key: "product_variant", label: "ตัวเลือก (สี/แบบ)", group: "สินค้า", sample: "สีส้ม" },
  { key: "qty", label: "จำนวนผลิต", group: "สินค้า", sample: "50" },
  { key: "bom_version", label: "เวอร์ชันสูตร", group: "สินค้า", sample: "v1" },
  { key: "note", label: "หมายเหตุ", group: "หมายเหตุ", sample: "—" },
];
const woLineColumns: ReportTableColumnDef[] = [
  { key: "idx", label: "ลำดับ", sample: "1", align: "center", width: 6 },
  { key: "component_name", label: "วัตถุดิบ", sample: "ผ้าซับในทอ Louis Montini", width: 28 },
  { key: "material_type", label: "ชนิด", sample: "ผ้า", align: "center", width: 9 },
  { key: "cut_block_code", label: "บล็อกตัด", sample: "C1-1-78", align: "center", width: 12 },
  { key: "cut_size", label: "กว้าง×ยาว", sample: "8.6×23.4", align: "center", width: 12 },
  { key: "pieces", label: "ชิ้น/ตัว", sample: "2", align: "right", width: 8 },
  { key: "total_pieces", label: "ยอดรวมชิ้น", sample: "100", align: "right", width: 10 },
  { key: "required", label: "รวมต้องใช้", sample: "1.86", align: "right", width: 8 },
  { key: "uom", label: "หน่วย", sample: "หลา", align: "center", width: 7 },
];

export const REPORT_ENTITY_DEFS: Record<string, ReportEntityDef> = {
  qt: {
    key: "qt",
    label: "ใบเสนอราคา",
    fields: quoteFields,
    tables: [{ key: "lines", label: "รายการสินค้า", itemLabel: "สินค้า", columns: quoteLineColumns }],
    sampleData: {
      quote_number: "QT-202606-0001",
      quote_date_th: "7 มิ.ย. 2569",
      valid_until_th: "7 ก.ค. 2569",
      customer_name: "บริษัท ตัวอย่าง จำกัด",
      customer_code: "CUS-001",
      customer_address: "กรุงเทพฯ",
      customer_phone: "02-000-0000",
      sale_person_name: "Gogo",
      note: "ส่งภายใน 30 วัน",
      subtotal: "156,000.00",
      vat_rate: "7",
      total_vat: "10,920.00",
      grand_total: "166,920.00",
      grand_total_text: "หนึ่งแสนหกหมื่นหกพันเก้าร้อยยี่สิบบาทถ้วน",
      lines: [
        { idx: 1, sku: "CTLSB24-10-01", product_name: "กระเป๋าสาน", image_html: "<div class=\"sample-photo\">รูป</div>", qty: "100.00", unit: "pcs.", unit_price: "520.00", line_total: "52,000.00" },
        { idx: 2, sku: "CTLSB24-10-02", product_name: "กระเป๋าสาน สีเหลือง", image_html: "<div class=\"sample-photo\">รูป</div>", qty: "100.00", unit: "pcs.", unit_price: "520.00", line_total: "52,000.00" },
      ],
    },
  },
  pr: {
    key: "pr",
    label: "ใบขอซื้อ",
    fields: [
      { key: "pr_number", label: "เลขที่ PR", group: "หัวเอกสาร", sample: "PR-2026-00042" },
      { key: "title", label: "หัวข้อ", group: "หัวเอกสาร", sample: "ของใช้สำนักงาน" },
      { key: "requester_name", label: "ผู้ขอ", group: "ผู้รับผิดชอบ", sample: "สมชาย ใจดี" },
      { key: "department", label: "แผนก", group: "ผู้รับผิดชอบ", sample: "จัดซื้อ" },
      { key: "created_at_th", label: "วันที่", group: "หัวเอกสาร", sample: "30 พ.ค. 2569" },
      { key: "note", label: "หมายเหตุ", group: "หมายเหตุ", sample: "ส่งก่อนสิ้นเดือน" },
      { key: "total_amount", label: "ยอดรวม", group: "ยอดเงิน", sample: "12,540.00" },
    ],
    tables: [{
      key: "lines",
      label: "รายการขอซื้อ",
      itemLabel: "สินค้า",
      columns: [
        { key: "idx", label: "ลำดับ", sample: "1", align: "center", width: 8 },
        { key: "sku", label: "SKU", sample: "SKU-001", width: 16 },
        { key: "product_name", label: "สินค้า", sample: "กระดาษ A4", width: 40 },
        { key: "qty", label: "จำนวน", sample: "5", align: "right", width: 12 },
        { key: "unit", label: "หน่วย", sample: "รีม", align: "center", width: 10 },
        { key: "line_total", label: "รวม", sample: "600.00", align: "right", width: 14 },
      ],
    }],
    sampleData: {
      pr_number: "PR-2026-00042",
      title: "ของใช้สำนักงาน",
      requester_name: "สมชาย ใจดี",
      department: "จัดซื้อ",
      created_at_th: "30 พ.ค. 2569",
      note: "ส่งก่อนสิ้นเดือน",
      total_amount: "12,540.00",
      lines: [
        { idx: 1, sku: "SKU-001", product_name: "กระดาษ A4 80gsm", qty: 5, unit: "รีม", line_total: "600.00" },
        { idx: 2, sku: "SKU-002", product_name: "ปากกาลูกลื่น", qty: 12, unit: "กล่อง", line_total: "1,020.00" },
      ],
    },
  },
  wo: {
    key: "wo",
    label: "ใบสั่งงานผลิต",
    fields: woFields,
    tables: [{ key: "lines", label: "รายการวัตถุดิบ / บล็อกตัด", itemLabel: "วัตถุดิบ", columns: woLineColumns }],
    sampleData: {
      mo_number: "MO-2026-0001",
      status_label: "ร่าง",
      created_at_th: "1 มิ.ย. 2569",
      due_date_th: "15 มิ.ย. 2569",
      product_sku: "BBP13-02",
      product_name: "กระเป๋าเป้สะพายหลัง ผ้าไนล่อน Unisex Backpack BBP13",
      product_variant: "สีส้ม",
      qty: "50",
      bom_version: "v1",
      note: "ตัดผ้าตามบล็อก ตรวจสีก่อนเย็บ",
      lines: [
        { idx: 1, component_name: "ผ้าไนลอนแผง 372", material_type: "ผ้า", cut_block_code: "C1-1-78", cut_size: "8.6×23.4", pieces: "2", total_pieces: "100", required: "1.86", uom: "หลา" },
        { idx: 2, component_name: "ผ้าซับในทอ Louis Montini สีครีม", material_type: "ผ้า", cut_block_code: "C1-1-74", cut_size: "8.8×10.6", pieces: "1", total_pieces: "50", required: "0.43", uom: "หลา" },
        { idx: 3, component_name: "ซิปไนลอน #5 D502", material_type: "ซิป", cut_block_code: "—", cut_size: "—", pieces: "1", total_pieces: "50", required: "50", uom: "เส้น" },
      ],
    },
  },
  // ใบรับ (Goods Receipt) — คนรับของพิมพ์ให้คลัง/แนบบิล · ไม่มีเงิน
  gr: {
    key: "gr",
    label: "ใบรับสินค้า",
    fields: [
      { key: "gr_number", label: "เลขที่ใบรับ", group: "หัวเอกสาร", sample: "GR-2026-00012" },
      { key: "po_number", label: "เลขที่ใบสั่งซื้อ", group: "หัวเอกสาร", sample: "PO-2026-00113" },
      { key: "supplier_name", label: "ร้าน / ผู้ขาย", group: "หัวเอกสาร", sample: "ร้านอี้หลงเจียห่าว" },
      { key: "receive_date_th", label: "วันที่รับ", group: "หัวเอกสาร", sample: "26 ก.ย. 2569" },
      { key: "receiver_name", label: "ผู้รับของ", group: "ผู้รับผิดชอบ", sample: "สมชาย ใจดี" },
      { key: "pv_number", label: "เลขที่ใบสำคัญรับ (ถ้ามี)", group: "หัวเอกสาร", sample: "PV-2026-00003" },
      { key: "note", label: "หมายเหตุ", group: "หมายเหตุ", sample: "ของครบ กล่องบุบ 1" },
      { key: "line_count", label: "จำนวนรายการ", group: "ยอด", sample: "7" },
      { key: "total_received", label: "จำนวนรับรวม", group: "ยอด", sample: "440" },
    ],
    tables: [{
      key: "lines",
      label: "รายการที่รับ",
      itemLabel: "สินค้า",
      columns: [
        { key: "idx", label: "ลำดับ", sample: "1", align: "center", width: 6 },
        { key: "image_html", label: "รูป", sample: "<div class=\"sample-photo\">รูป</div>", align: "center", width: 12 },
        { key: "sku", label: "รหัส", sample: "D1.0*3MM", width: 14 },
        { key: "product_name", label: "สินค้า", sample: "ตัวดี 1 cm. สีรมดำ", width: 32 },
        { key: "qty_ordered", label: "สั่ง", sample: "500", align: "right", width: 9 },
        { key: "qty_received", label: "รับ", sample: "440", align: "right", width: 9 },
        { key: "qty_defective", label: "เสีย", sample: "0", align: "right", width: 8 },
        { key: "unit", label: "หน่วย", sample: "Units", align: "center", width: 10 },
      ],
    }],
    sampleData: {
      gr_number: "GR-2026-00012", po_number: "PO-2026-00113", supplier_name: "ร้านอี้หลงเจียห่าว", receive_date_th: "26 ก.ย. 2569",
      receiver_name: "สมชาย ใจดี", pv_number: "", note: "", line_count: "2", total_received: "640",
      lines: [
        { idx: 1, image_html: "<div class=\"sample-photo\">รูป</div>", sku: "D1.0*3MM", product_name: "ตัวดี 1 cm. สีรมดำ", qty_ordered: "500", qty_received: "440", qty_defective: "0", unit: "Units" },
        { idx: 2, image_html: "<div class=\"sample-photo\">รูป</div>", sku: "MN18/18MM", product_name: "แม่เหล็กแบบซ่อน 18 mm.", qty_ordered: "200", qty_received: "200", qty_defective: "0", unit: "Units" },
      ],
    },
  },
  // ใบสำคัญรับ / ใบซื้อ (Purchase Voucher) — จัดซื้อออกหลังรับของ มีราคา ¥/฿ + ค่าส่ง (แยกบรรทัด ไม่รวมในราคาสินค้า)
  pv: {
    key: "pv",
    label: "ใบสำคัญรับ (ใบซื้อ)",
    fields: [
      { key: "pv_number", label: "เลขที่ใบสำคัญ", group: "หัวเอกสาร", sample: "PV-2026-00003" },
      { key: "voucher_date_th", label: "วันที่", group: "หัวเอกสาร", sample: "26 ก.ย. 2569" },
      { key: "supplier_name", label: "ร้าน / ผู้ขาย", group: "หัวเอกสาร", sample: "ร้านอี้หลงเจียห่าว" },
      { key: "gr_numbers", label: "เลขใบรับ (ทั้งหมด)", group: "หัวเอกสาร", sample: "GR-2026-00012, GR-2026-00013" },
      { key: "po_numbers", label: "เลขใบสั่งซื้อ (ทั้งหมด)", group: "หัวเอกสาร", sample: "PO-2026-00113" },
      { key: "currency_code", label: "สกุลเงิน", group: "ยอดเงิน", sample: "RMB" },
      { key: "currency_symbol", label: "สัญลักษณ์สกุล", group: "ยอดเงิน", sample: "¥" },
      { key: "fx_rate", label: "เรท ฿ ต่อ 1 หน่วย", group: "ยอดเงิน", sample: "5.18" },
      { key: "subtotal_foreign", label: "ค่าสินค้า (สกุลใบ)", group: "ยอดเงิน", sample: "3,500.00" },
      { key: "subtotal_thb", label: "ค่าสินค้า (บาท)", group: "ยอดเงิน", sample: "18,130.00" },
      { key: "ship_method_label", label: "วิธีคิดค่าส่ง", group: "ค่าส่ง", sample: "ตามคิว (CBM)" },
      { key: "ship_basis_label", label: "ปริมาณรวม (คิว/กก.)", group: "ค่าส่ง", sample: "2.52 คิว" },
      { key: "ship_rate", label: "เรทค่าส่ง", group: "ค่าส่ง", sample: "3,500.00" },
      { key: "ship_total_thb", label: "ค่าส่งรวม (บาท)", group: "ค่าส่ง", sample: "8,820.00" },
      { key: "grand_total_thb", label: "รวมทั้งสิ้น (บาท)", group: "ยอดเงิน", sample: "26,950.00" },
      { key: "grand_total_text", label: "ยอดรวมตัวอักษร", group: "ยอดเงิน", sample: "สองหมื่นหกพันเก้าร้อยห้าสิบบาทถ้วน" },
      { key: "note", label: "หมายเหตุ", group: "หมายเหตุ", sample: "บิลขนส่ง #A123" },
      { key: "confirmed_by", label: "ผู้ยืนยัน", group: "ผู้รับผิดชอบ", sample: "จัดซื้อ" },
    ],
    tables: [{
      key: "lines",
      label: "รายการสินค้า",
      itemLabel: "สินค้า",
      columns: [
        { key: "idx", label: "ลำดับ", sample: "1", align: "center", width: 5 },
        { key: "sku", label: "รหัส", sample: "D1.0*3MM", width: 12 },
        { key: "product_name", label: "สินค้า", sample: "ตัวดี 1 cm. สีรมดำ", width: 24 },
        { key: "gr_number", label: "ใบรับ", sample: "GR-2026-00012", width: 11 },
        { key: "qty", label: "จำนวน", sample: "440", align: "right", width: 8 },
        { key: "unit", label: "หน่วย", sample: "Units", align: "center", width: 7 },
        { key: "unit_price", label: "ราคา/หน่วย", sample: "¥3.50", align: "right", width: 9 },
        { key: "unit_price_thb", label: "ราคา ฿", sample: "18.13", align: "right", width: 9 },
        { key: "line_total_thb", label: "ค่าสินค้า ฿", sample: "7,977.20", align: "right", width: 11 },
        { key: "ship_alloc_thb", label: "ค่าส่ง ฿", sample: "3,880.80", align: "right", width: 10 },
        { key: "landed_unit_thb", label: "ถึงมือ/ชิ้น ฿", sample: "26.95", align: "right", width: 10 },
      ],
    }],
    sampleData: {
      pv_number: "PV-2026-00003", voucher_date_th: "26 ก.ย. 2569", supplier_name: "ร้านอี้หลงเจียห่าว", gr_numbers: "GR-2026-00012", po_numbers: "PO-2026-00113",
      currency_code: "RMB", currency_symbol: "¥", fx_rate: "5.18", subtotal_foreign: "3,500.00", subtotal_thb: "18,130.00",
      ship_method_label: "ตามคิว (CBM)", ship_basis_label: "2.52 คิว", ship_rate: "3,500.00", ship_total_thb: "8,820.00", grand_total_thb: "26,950.00",
      grand_total_text: "สองหมื่นหกพันเก้าร้อยห้าสิบบาทถ้วน", note: "", confirmed_by: "จัดซื้อ", is_foreign: "1", has_shipping: "1",
      lines: [
        { idx: 1, sku: "D1.0*3MM", product_name: "ตัวดี 1 cm. สีรมดำ", gr_number: "GR-2026-00012", qty: "440", unit: "Units", unit_price: "¥3.50", unit_price_thb: "18.13", line_total_thb: "7,977.20", ship_alloc_thb: "3,880.80", landed_unit_thb: "26.95" },
        { idx: 2, sku: "MN18/18MM", product_name: "แม่เหล็กแบบซ่อน 18 mm.", gr_number: "GR-2026-00012", qty: "200", unit: "Units", unit_price: "¥5.00", unit_price_thb: "25.90", line_total_thb: "5,180.00", ship_alloc_thb: "4,939.20", landed_unit_thb: "50.60" },
      ],
    },
  },
};

export const REPORT_ENTITY_OPTIONS = Object.values(REPORT_ENTITY_DEFS).map(entity => ({
  value: entity.key,
  label: entity.label,
}));

export function getReportEntityDef(entityType: string): ReportEntityDef {
  return REPORT_ENTITY_DEFS[entityType] ?? REPORT_ENTITY_DEFS.qt;
}

export function fieldToken(fieldKey: string): string {
  return `{{${fieldKey}}}`;
}

export function buildTableHtml(table: ReportTableDef, selectedKeys: string[]): string {
  const selected = selectedKeys
    .map(key => table.columns.find(col => col.key === key))
    .filter(Boolean) as ReportTableColumnDef[];
  const columns = selected.length > 0 ? selected : table.columns;
  const totalWidth = columns.reduce((sum, col) => sum + (col.width ?? 10), 0);

  return `<table class="doc-table">
  <colgroup>
${columns.map(col => `    <col style="width:${(((col.width ?? 10) / totalWidth) * 100).toFixed(2)}%">`).join("\n")}
  </colgroup>
  <thead>
    <tr>
${columns.map(col => `      <th>${col.label}</th>`).join("\n")}
    </tr>
  </thead>
  <tbody>
    {{#${table.key}}}
    <tr>
${columns.map(col => `      <td class="${col.align ? `text-${col.align}` : ""}">${col.key.endsWith("_html") ? `{{{${col.key}}}}` : `{{${col.key}}}`}</td>`).join("\n")}
    </tr>
    {{/${table.key}}}
  </tbody>
</table>`;
}

export const DEFAULT_REPORT_CSS = `
.doc { font-size: 11px; color: #000; }
.doc-header { text-align: center; line-height: 1.25; margin-bottom: 14px; }
.company-name { font-size: 15px; font-weight: 700; }
.company-address { font-size: 10px; }
.doc-title { text-align: center; font-size: 22px; font-weight: 700; margin: 12px 0 20px; }
.info-grid { display: grid; grid-template-columns: 1.4fr 1fr; border: 1px solid #000; margin-bottom: 2mm; }
.info-box { padding: 10px; min-height: 82px; }
.info-box + .info-box { border-left: 1px solid #000; text-align: right; }
.label { font-weight: 700; }
.doc-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.doc-table th, .doc-table td { border: 1px solid #000; padding: 6px 5px; vertical-align: middle; }
.doc-table th { text-align: center; font-weight: 700; }
.doc-table img { max-width: 100%; height: 82px; object-fit: contain; display: block; margin: 0 auto; }
.sample-photo { height: 72px; border: 1px solid #bbb; display: grid; place-items: center; color: #777; }
.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.totals { margin-left: auto; width: 38%; border-collapse: collapse; }
.totals td { border: 1px solid #000; padding: 6px; }
.amount-text { text-align: center; font-weight: 700; margin-top: 10px; }
.signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; margin-top: 70px; padding: 0 60px; }
.signature { text-align: center; border-top: 1px solid #000; padding-top: 6px; font-weight: 700; }
`;

export const DEFAULT_QUOTATION_TEMPLATE = {
  header_html: `<div class="doc-header">
  <div class="company-name">หจก.ไอ.เอส.จี. เทรดดิ้ง (สำนักงานใหญ่)</div>
  <div class="company-address">41/243, 41/244 ถนนกัลปพฤกษ์ แขวงบางแค เขตบางแค กรุงเทพฯ 10160</div>
</div>
<div class="doc-title">ใบเสนอราคา</div>
<section class="info-grid">
  <div class="info-box">
    <div class="label">ลูกค้า / Customer</div>
    <div><span class="label">ชื่อ:</span> {{customer_name}}</div>
    <div><span class="label">ที่อยู่:</span> {{customer_address}}</div>
    <div><span class="label">เบอร์โทร:</span> {{customer_phone}}</div>
  </div>
  <div class="info-box">
    <div><span class="label">วันที่:</span> {{quote_date_th}}</div>
    <div><span class="label">เลขที่ใบเสนอราคา:</span> {{quote_number}}</div>
    <div><span class="label">ผู้รับผิดชอบ:</span> {{sale_person_name}}</div>
  </div>
</section>`,
  body_html: `${buildTableHtml(REPORT_ENTITY_DEFS.qt.tables[0], ["idx", "sku", "product_name", "image_html", "qty", "unit", "unit_price", "line_total"])}
<table class="totals">
  <tr><td class="label">รวมเงิน</td><td class="text-right">{{subtotal}}</td></tr>
  <tr><td class="label">ภาษีมูลค่าเพิ่ม {{vat_rate}}%</td><td class="text-right">{{total_vat}}</td></tr>
  <tr><td class="label">จำนวนเงินทั้งสิ้น</td><td class="text-right">{{grand_total}}</td></tr>
</table>
<div class="amount-text">({{grand_total_text}})</div>`,
  footer_html: `<section class="signatures">
  <div class="signature">ลูกค้าอนุมัติ</div>
  <div class="signature">ลายเซ็นผู้มีอำนาจ</div>
</section>`,
  custom_css: DEFAULT_REPORT_CSS,
};

export const DEFAULT_WORKORDER_TEMPLATE = {
  header_html: `<div class="doc-header">
  <div class="company-name">หจก.ไอ.เอส.จี. เทรดดิ้ง (สำนักงานใหญ่)</div>
  <div class="company-address">41/243, 41/244 ถนนกัลปพฤกษ์ แขวงบางแค เขตบางแค กรุงเทพฯ 10160</div>
</div>
<div class="doc-title">ใบสั่งงานผลิต</div>
<section class="info-grid">
  <div class="info-box">
    <div><span class="label">สินค้า:</span> {{product_name}}</div>
    <div><span class="label">รหัส:</span> {{product_sku}}</div>
    <div><span class="label">จำนวนผลิต:</span> {{qty}} &nbsp;·&nbsp; <span class="label">สูตร:</span> {{bom_version}}</div>
  </div>
  <div class="info-box">
    <div><span class="label">เลขที่:</span> {{mo_number}}</div>
    <div><span class="label">วันที่สั่ง:</span> {{created_at_th}}</div>
    <div><span class="label">กำหนดส่ง:</span> {{due_date_th}} &nbsp;·&nbsp; {{status_label}}</div>
  </div>
</section>`,
  body_html: `${buildTableHtml(REPORT_ENTITY_DEFS.wo.tables[0], ["idx", "component_name", "material_type", "cut_block_code", "cut_size", "pieces", "total_pieces", "required", "uom"])}
<div class="wo-note"><span class="label">หมายเหตุ / วิธีทำ:</span> {{note}}</div>`,
  footer_html: `<section class="signatures">
  <div class="signature">ผู้สั่งผลิต</div>
  <div class="signature">ผู้รับงานผลิต</div>
</section>`,
  custom_css: `${DEFAULT_REPORT_CSS}
.wo-note { margin-top: 10px; font-size: 11px; min-height: 2.4em; }`,
};

// ใบรับสินค้า — ค่าเริ่มต้น (หน้าพิมพ์ใช้เมื่อยังไม่มีเทมเพลตใน DB · แก้เองได้ที่ /admin/report-templates entity "gr")
export const DEFAULT_GR_TEMPLATE = {
  header_html: `<div class="doc-header">
  <div class="company-name">หจก.ไอ.เอส.จี. เทรดดิ้ง (สำนักงานใหญ่)</div>
  <div class="company-address">41/243, 41/244 ถนนกัลปพฤกษ์ แขวงบางแค เขตบางแค กรุงเทพฯ 10160</div>
</div>
<div class="doc-title">ใบรับสินค้า</div>
<section class="info-grid">
  <div class="info-box">
    <div><span class="label">ร้าน / ผู้ขาย:</span> {{supplier_name}}</div>
    <div><span class="label">อ้างอิงใบสั่งซื้อ:</span> {{po_number}}</div>
    <div><span class="label">ผู้รับของ:</span> {{receiver_name}}</div>
  </div>
  <div class="info-box">
    <div><span class="label">เลขที่ใบรับ:</span> {{gr_number}}</div>
    <div><span class="label">วันที่รับ:</span> {{receive_date_th}}</div>
    <div>{{#pv_number}}<span class="label">ใบสำคัญรับ:</span> {{pv_number}}{{/pv_number}}</div>
  </div>
</section>`,
  body_html: `${buildTableHtml(REPORT_ENTITY_DEFS.gr.tables[0], ["idx", "image_html", "sku", "product_name", "qty_ordered", "qty_received", "qty_defective", "unit"])}
<div class="gr-summary">รวม {{line_count}} รายการ · รับทั้งหมด {{total_received}}</div>
{{#note}}<div class="gr-note"><span class="label">หมายเหตุ:</span> {{note}}</div>{{/note}}`,
  footer_html: `<section class="signatures">
  <div class="signature">ผู้รับของ</div>
  <div class="signature">ผู้ตรวจนับ</div>
</section>`,
  custom_css: `${DEFAULT_REPORT_CSS}
.gr-summary { margin-top: 8px; text-align: right; font-weight: 700; }
.gr-note { margin-top: 8px; font-size: 11px; }
.doc-table img { height: 56px; }`,
};

// ใบสำคัญรับ / ใบซื้อ — ค่าเริ่มต้น: ราคา ¥ และ ฿ · ค่าส่งแยกบรรทัด (ไม่รวมในราคาสินค้า) · แก้เองได้ที่ /admin/report-templates entity "pv"
export const DEFAULT_PV_TEMPLATE = {
  header_html: `<div class="doc-header">
  <div class="company-name">หจก.ไอ.เอส.จี. เทรดดิ้ง (สำนักงานใหญ่)</div>
  <div class="company-address">41/243, 41/244 ถนนกัลปพฤกษ์ แขวงบางแค เขตบางแค กรุงเทพฯ 10160</div>
</div>
<div class="doc-title">ใบสำคัญรับ (ใบซื้อ)</div>
<section class="info-grid">
  <div class="info-box">
    <div><span class="label">ร้าน / ผู้ขาย:</span> {{supplier_name}}</div>
    <div><span class="label">อ้างอิงใบรับ:</span> {{gr_numbers}}</div>
    <div><span class="label">อ้างอิงใบสั่งซื้อ:</span> {{po_numbers}}</div>
  </div>
  <div class="info-box">
    <div><span class="label">เลขที่:</span> {{pv_number}}</div>
    <div><span class="label">วันที่:</span> {{voucher_date_th}}</div>
    <div><span class="label">สกุลเงิน:</span> {{currency_code}}{{#is_foreign}} &nbsp;·&nbsp; <span class="label">เรท:</span> {{fx_rate}} ฿/{{currency_symbol}}{{/is_foreign}}</div>
  </div>
</section>`,
  body_html: `${buildTableHtml(REPORT_ENTITY_DEFS.pv.tables[0], ["idx", "sku", "product_name", "gr_number", "qty", "unit", "unit_price", "unit_price_thb", "line_total_thb", "ship_alloc_thb", "landed_unit_thb"])}
<table class="totals">
  {{#is_foreign}}<tr><td class="label">ค่าสินค้า ({{currency_code}})</td><td class="text-right">{{currency_symbol}}{{subtotal_foreign}}</td></tr>{{/is_foreign}}
  <tr><td class="label">ค่าสินค้า (บาท)</td><td class="text-right">{{subtotal_thb}}</td></tr>
  {{#has_shipping}}<tr><td class="label">ค่าส่ง — {{ship_method_label}} {{ship_basis_label}} × {{ship_rate}}</td><td class="text-right">{{ship_total_thb}}</td></tr>{{/has_shipping}}
  <tr><td class="label">รวมทั้งสิ้น (บาท)</td><td class="text-right"><b>{{grand_total_thb}}</b></td></tr>
</table>
<div class="amount-text">({{grand_total_text}})</div>
{{#note}}<div class="pv-note"><span class="label">หมายเหตุ:</span> {{note}}</div>{{/note}}`,
  footer_html: `<section class="signatures">
  <div class="signature">ผู้จัดทำ (จัดซื้อ) {{confirmed_by}}</div>
  <div class="signature">ผู้อนุมัติ</div>
</section>`,
  custom_css: `${DEFAULT_REPORT_CSS}
.pv-note { margin-top: 8px; font-size: 11px; }
.totals { width: 52%; }
.doc-table th, .doc-table td { font-size: 10.5px; padding: 4px 3px; }`,
};
