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
