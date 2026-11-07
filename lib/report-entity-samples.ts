/**
 * 📄 ชุด field + ข้อมูลตัวอย่าง ของเอกสารที่มีแม่แบบใช้จริง (เสริม REPORT_ENTITY_DEFS ใน lib/report-designer)
 * ใช้แค่ในหน้าออกแบบ: ปุ่ม "ใส่ข้อมูล" + พรีวิวด้วยข้อมูลตัวอย่าง — ไม่กระทบหน้าพิมพ์จริง
 * ชื่อตัวแปรดึงมาจากแม่แบบจริงใน DB (erp_report_templates) ณ 2026-11-06 — หน้าพิมพ์เพิ่มตัวแปรใหม่ → เพิ่มที่นี่ด้วย
 * ข้อมูลทั้งหมดเป็นของสมมุติ (ไม่ใช่ลูกค้า/ร้านจริง)
 */
import type { ReportEntityDef, ReportFieldDef, ReportTableColumnDef } from "@/lib/report-designer";
import { defaultPrefs, renderDocTable } from "@/lib/doc-print-prefs";

type F = [key: string, label: string, sample: string];

/** สร้าง fields + ค่าตัวอย่างพร้อมกัน จากรายการแบ่งกลุ่ม */
function build(groups: Record<string, F[]>): { fields: ReportFieldDef[]; data: Record<string, unknown> } {
  const fields: ReportFieldDef[] = [];
  const data: Record<string, unknown> = {};
  for (const [group, list] of Object.entries(groups)) {
    for (const [key, label, sample] of list) {
      fields.push({ key, label, group, sample });
      data[key] = sample;
    }
  }
  return { fields, data };
}

const col = (key: string, label: string, sample: string, align?: "left" | "center" | "right", width?: number): ReportTableColumnDef =>
  ({ key, label, sample, align, width });

const COMPANY: F[] = [
  ["company_name_th", "ชื่อบริษัท (ไทย)", "บริษัท ตัวอย่าง เทรดดิ้ง จำกัด"],
  ["company_name_en", "ชื่อบริษัท (อังกฤษ)", "Sample Trading Co., Ltd."],
  ["company_address", "ที่อยู่บริษัท", "99/9 ถนนตัวอย่าง แขวงบางแค เขตบางแค กรุงเทพฯ 10160"],
  ["company_tax_id", "เลขผู้เสียภาษีบริษัท", "0105500000000"],
];
const CUSTOMER: F[] = [
  ["customer_name", "ชื่อลูกค้า", "ร้านตัวอย่าง จำกัด"],
  ["customer_address", "ที่อยู่ลูกค้า", "12 ถนนสุขุมวิท กรุงเทพฯ 10110"],
  ["customer_tax_id", "เลขผู้เสียภาษีลูกค้า", "0105560000001"],
  ["customer_phone", "เบอร์โทรลูกค้า", "02-000-0000"],
];

/* ── ใบวางบิล ── */
const bn = build({
  "หัวเอกสาร": [["bill_number", "เลขที่ใบวางบิล", "BN-2569-11-0001"], ["bill_date", "วันที่วางบิล", "6 พ.ย. 2569"], ["due_date", "วันครบกำหนด", "6 ธ.ค. 2569"]],
  "ลูกค้า": CUSTOMER.filter(f => f[0] !== "customer_phone"),
  "ยอดเงิน": [["subtotal", "รวมก่อน VAT", "42,803.74"], ["total_vat", "VAT รวม", "2,996.26"], ["total_wht", "หัก ณ ที่จ่าย", "0.00"], ["grand_total", "รวมทั้งสิ้น", "45,800.00"], ["net_amount_due", "ยอดที่ต้องชำระ", "45,800.00"]],
  "หมายเหตุ": [["note", "หมายเหตุ", "โอนเข้าบัญชีบริษัทภายในวันครบกำหนด"]],
});
const bnLines = [
  { idx: 1, so_number: "SO-2569-10-0112", bill_date: "12 ต.ค. 2569", due_date: "11 พ.ย. 2569", amount: "18,691.59", vat_amount: "1,308.41", total_amount: "20,000.00", note: "" },
  { idx: 2, so_number: "SO-2569-10-0131", bill_date: "20 ต.ค. 2569", due_date: "19 พ.ย. 2569", amount: "24,112.15", vat_amount: "1,687.85", total_amount: "25,800.00", note: "" },
];

/* ── ใบสั่งขาย / ใบกำกับภาษี / ใบส่งสินค้า (ใช้ตัวแปรชุดเดียวกัน) ── */
const so = build({
  "หัวเอกสาร": [
    ["doc_title_th", "ชื่อเอกสาร (ไทย)", "ใบเสร็จรับเงิน / ใบกำกับภาษี"], ["doc_title_en", "ชื่อเอกสาร (อังกฤษ)", "RECEIPT / TAX INVOICE"],
    ["so_number", "เลขที่ใบสั่งขาย", "SO-2569-11-0042"], ["tax_invoice_no", "เลขที่ใบกำกับภาษี", "IV-2569-11-0042"],
    ["order_date_th", "วันที่", "6 พ.ย. 2569"], ["ship_date_th", "วันที่ส่ง", "8 พ.ย. 2569"], ["status_label", "สถานะ", "ยืนยันแล้ว"],
    ["reference", "อ้างอิง", "PO ลูกค้า 7781"], ["customer_po_no", "เลขที่ PO ลูกค้า", "7781"], ["page_label", "หน้า", "1/1"],
    ["credit_label", "เครดิต", "30 วัน"], ["payment_terms", "เงื่อนไขชำระ", "โอนภายใน 30 วัน"], ["sale_person_name", "พนักงานขาย", "พนักงานขาย ตัวอย่าง"],
  ],
  "บริษัท": [...COMPANY, ["company_tel_line", "บรรทัดเบอร์โทรบริษัท", "โทร. 02-111-1111"]],
  "ลูกค้า": [...CUSTOMER, ["customer_code", "รหัสลูกค้า", "CUS-0007"]],
  "ยอดเงิน": [
    ["subtotal", "รวมเงิน", "4,600.00"], ["discount_amount", "ส่วนลด", "0.00"], ["taxable", "มูลค่าก่อนภาษี", "4,299.07"],
    ["vat_rate", "VAT %", "7"], ["vat_rate_label", "ป้าย VAT", "7%"], ["total_vat", "ภาษีมูลค่าเพิ่ม", "300.93"], ["total_wht", "หัก ณ ที่จ่าย", "0.00"],
    ["grand_total", "รวมทั้งสิ้น", "4,600.00"], ["amount_due", "ยอดชำระ", "4,600.00"], ["amount_in_words", "จำนวนเงินตัวอักษร", "สี่พันหกร้อยบาทถ้วน"], ["total_qty", "จำนวนรวม", "20"],
  ],
  "หมายเหตุ": [["note", "หมายเหตุ", "ส่งพร้อมใบกำกับภาษี"]],
});
const soLine = (idx: number, sku: string, name: string, qty: number, price: number) => ({
  idx, sku, product_name: name, desc2: "สีดำ / ไซส์ M", qty: String(qty), unit: "ชิ้น",
  unit_price: price.toFixed(2), price_plain: price.toFixed(2), discount_text: "", discount_plain: "", vat_text: "7%", vat_pct: "7",
  line_total: (qty * price).toLocaleString("en-US", { minimumFractionDigits: 2 }), net_plain: (qty * price).toFixed(2),
});

/* ── ใบลดหนี้ ── */
const cn = build({
  "หัวเอกสาร": [["cn_number", "เลขที่ใบลดหนี้", "CN-2569-11-0003"], ["cn_date_th", "วันที่", "6 พ.ย. 2569"], ["status_label", "สถานะ", "อนุมัติแล้ว"], ["ref_invoice_no", "อ้างถึงใบกำกับเลขที่", "IV-2569-10-0090"], ["ref_invoice_date", "วันที่ใบกำกับเดิม", "28 ต.ค. 2569"], ["reason", "เหตุผล", "สินค้าชำรุด คืน 2 ชิ้น"]],
  "บริษัท": [...COMPANY, ["company_phone", "เบอร์โทรบริษัท", "02-111-1111"]],
  "ลูกค้า": CUSTOMER,
  "ยอดเงิน": [["original_amount", "มูลค่าตามเอกสารเดิม", "4,672.90"], ["correct_amount", "มูลค่าที่ถูกต้อง", "4,252.34"], ["diff_amount", "ผลต่าง", "420.56"], ["vat_rate", "VAT %", "7"], ["vat_amount", "VAT", "29.44"], ["grand_total", "รวมทั้งสิ้น", "450.00"], ["amount_in_words", "จำนวนเงินตัวอักษร", "สี่ร้อยห้าสิบบาทถ้วน"]],
  "หมายเหตุ": [["note", "หมายเหตุ", ""]],
});

/* ── ใบสั่งซื้อ ── */
const po = build({
  "หัวเอกสาร": [["po_number", "เลขที่ใบสั่งซื้อ", "PO-2569-11-0015"], ["order_date_th", "วันที่สั่ง", "6 พ.ย. 2569"], ["arrival_date_th", "กำหนดรับของ", "20 พ.ย. 2569"], ["payment_terms", "เงื่อนไขชำระ", "เครดิต 30 วัน"]],
  "ผู้ขาย": [["supplier_name", "ชื่อผู้ขาย", "ร้านวัสดุ ตัวอย่าง"], ["supplier_address", "ที่อยู่ผู้ขาย", "88 ถนนเพชรเกษม กรุงเทพฯ"], ["supplier_tax_id", "เลขผู้เสียภาษีผู้ขาย", "0105570000002"], ["supplier_phone", "เบอร์โทรผู้ขาย", "081-000-0000"]],
  "ยอดเงิน": [["currency_code", "สกุลเงิน", "THB"], ["currency_symbol", "สัญลักษณ์เงิน", "฿"], ["subtotal", "รวมเงิน", "12,000.00"], ["vat_rate_label", "ป้าย VAT", "7%"], ["total_vat", "VAT", "840.00"], ["total_wht", "หัก ณ ที่จ่าย", "0.00"], ["grand_total", "รวมทั้งสิ้น", "12,840.00"], ["amount_in_words", "จำนวนเงินตัวอักษร", "หนึ่งหมื่นสองพันแปดร้อยสี่สิบบาทถ้วน"]],
  "หมายเหตุ": [["note", "หมายเหตุ", "ส่งของพร้อมใบส่งของ"]],
});

/* ── ใบงานออกแบบ (ใช้หัวชุดเดียวกัน 4 แบบ) ── */
const DS_HEAD: F[] = [
  ["code", "เลขใบงาน", "DS-2026-0042"], ["name", "ชื่องาน", "กระเป๋าผ้าแคนวาส"], ["brand_name", "แบรนด์", "แบรนด์ตัวอย่าง"],
  ["order_date_th", "วันที่สั่ง", "1 พ.ย. 2569"], ["deadline_th", "กำหนดส่ง", "15 พ.ย. 2569"], ["print_date_th", "วันที่พิมพ์", "6 พ.ย. 2569"],
];
const ds = build({ "ใบงาน": [...DS_HEAD, ["status_label", "สถานะ", "กำลังทำตัวอย่าง"], ["date_th", "วันที่", "6 พ.ย. 2569"], ["note", "หมายเหตุ", "ใช้ผ้าซับในสีครีม"]] });
const dsCost = build({
  "ใบงาน": [...DS_HEAD, ["note", "หมายเหตุ", ""]],
  "ยอดเงิน": [["material_total_th", "รวมค่าวัตถุดิบ", "142.50"], ["grand_total_th", "ต้นทุนรวม/ชิ้น", "185.00"], ["qty", "จำนวนผลิต", "100"]],
});
const dsQuote = build({ "ใบงาน": [...DS_HEAD, ["status_label", "สถานะ", "รอลูกค้าตอบ"], ["date_th", "วันที่", "6 พ.ย. 2569"], ["note", "หมายเหตุ", "ราคานี้ยืนได้ 30 วัน"]] });
const dsSup = build({
  "ใบงาน": [["code", "เลขใบงาน", "DS-2026-0042"], ["name", "ชื่องาน", "กระเป๋าผ้าแคนวาส"], ["brand_name", "แบรนด์", "แบรนด์ตัวอย่าง"], ["print_date_th", "วันที่พิมพ์", "6 พ.ย. 2569"], ["size_label", "ไซส์", "M"]],
  "สรุปยอด": [
    ["total_qty", "จำนวนรวม", "100"], ["total_cost", "ต้นทุนรวม", "15,800"], ["total_freight", "ค่าขนส่งรวม", "1,200"], ["total_sale", "ยอดขายรวม", "25,500"],
    ["total_profit", "กำไรรวม", "8,500"], ["total_split", "ส่วนแบ่งรวม", "1,700"], ["net_profit", "กำไรสุทธิ", "6,800"], ["total_cbm", "ปริมาตรรวม (คิว)", "0.42"], ["counted_note", "หมายเหตุการนับ", "นับเฉพาะรายการที่มีราคา"],
  ],
});

export const EXTRA_REPORT_ENTITY_DEFS: Record<string, ReportEntityDef> = {
  billing_note: {
    key: "billing_note", label: "ใบวางบิล", fields: [...bn.fields, { key: "lines_table", label: "ตารางรายการ (ตั้งค่าคอลัมน์ในหน้าพิมพ์)", group: "ตาราง", sample: "" }],
    tables: [{ key: "lines", label: "รายการใบสั่งขาย", itemLabel: "ใบสั่งขาย", columns: [
      col("idx", "ลำดับ", "1", "center", 6), col("so_number", "เลขที่เอกสาร", "SO-2569-10-0112", "left", 22), col("bill_date", "วันที่", "12 ต.ค. 2569", "center", 14),
      col("due_date", "ครบกำหนด", "11 พ.ย. 2569", "center", 14), col("amount", "มูลค่า", "18,691.59", "right", 14), col("vat_amount", "VAT", "1,308.41", "right", 12), col("total_amount", "รวม", "20,000.00", "right", 14),
    ] }],
    sampleData: { ...bn.data, lines: bnLines, lines_table: renderDocTable("billing_note", defaultPrefs("billing_note"), bnLines, { filler: true }) },
  },
  so: {
    key: "so", label: "ใบสั่งขาย / ใบกำกับภาษี", fields: so.fields,
    tables: [{ key: "lines", label: "รายการสินค้า", itemLabel: "สินค้า", columns: [
      col("idx", "ลำดับ", "1", "center", 6), col("sku", "รหัสสินค้า", "BAG-001", "left", 14), col("product_name", "รายการ", "กระเป๋าผ้า", "left", 36),
      col("qty", "จำนวน", "10", "right", 9), col("unit", "หน่วย", "ชิ้น", "center", 8), col("unit_price", "ราคา/หน่วย", "250.00", "right", 12), col("line_total", "จำนวนเงิน", "2,500.00", "right", 15),
    ] }],
    sampleData: {
      ...so.data, has_vat: true, has_wht: false, desc2: true,
      col_idx: true, col_sku: true, col_qty: true, col_unit: true, col_unit_price: true, col_discount: false, col_vat: false,
      lines: [soLine(1, "BAG-001", "กระเป๋าผ้าแคนวาส", 10, 250), soLine(2, "BAG-014", "กระเป๋าสะพายข้าง", 10, 210)],
      order_date_iso: "2026-11-06", due_date_iso: "2026-12-06",
    },
  },
  cn: {
    key: "cn", label: "ใบลดหนี้", fields: cn.fields,
    tables: [{ key: "lines", label: "รายการที่ลดหนี้", itemLabel: "สินค้า", columns: [
      col("idx", "ลำดับ", "1", "center", 6), col("sku", "รหัสสินค้า", "BAG-001", "left", 16), col("product_name", "รายการ", "กระเป๋าผ้า", "left", 40),
      col("qty_diff", "จำนวน", "2", "right", 10), col("unit_price", "ราคา/หน่วย", "210.28", "right", 13), col("amount_diff", "จำนวนเงิน", "420.56", "right", 15),
    ] }],
    sampleData: { ...cn.data, desc2: false, lines: [{ idx: 1, sku: "BAG-001", product_name: "กระเป๋าผ้าแคนวาส", desc2: "สีดำ", qty_diff: "2", unit_price: "210.28", amount_diff: "420.56" }] },
  },
  po: {
    key: "po", label: "ใบสั่งซื้อ", fields: po.fields,
    tables: [{ key: "lines", label: "รายการสั่งซื้อ", itemLabel: "สินค้า", columns: [
      col("idx", "ลำดับ", "1", "center", 6), col("sku", "รหัสสินค้า", "MAT-010", "left", 16), col("product_name", "รายการ", "ผ้าแคนวาส 12oz", "left", 38),
      col("qty", "จำนวน", "100", "right", 10), col("unit", "หน่วย", "หลา", "center", 8), col("unit_price", "ราคา/หน่วย", "120.00", "right", 10), col("line_total", "จำนวนเงิน", "12,000.00", "right", 12),
    ] }],
    sampleData: {
      ...po.data, has_wht: false, is_foreign: false, show_payment_terms: true, qr_html: "", stamps_html: "",
      lines: [{ idx: 1, sku: "MAT-010", product_name: "ผ้าแคนวาส 12oz สีครีม", qty: "100", unit: "หลา", unit_price: "120.00", line_total: "12,000.00" }],
    },
  },
  design_sheet: {
    key: "design_sheet", label: "ใบสั่งตัวอย่าง (ใบงานออกแบบ)", fields: [...ds.fields, { key: "detail_html", label: "รายละเอียด (HTML)", group: "ใบงาน", sample: "" }, { key: "images_html", label: "รูปงานออกแบบ (HTML)", group: "ใบงาน", sample: "" }],
    tables: [{ key: "comments", label: "ความเห็น", itemLabel: "ความเห็น", columns: [col("idx", "ลำดับ", "1", "center", 8), col("date_th", "วันที่", "5 พ.ย. 2569", "center", 18), col("body", "ข้อความ", "ขอปรับสายให้ยาวขึ้น 5 ซม.", "left", 74)] }],
    sampleData: {
      ...ds.data, detail_html: "<p>ผ้าแคนวาส 12oz สีครีม · ซับในผ้าดิบ · สายยาว 60 ซม.</p>", images_html: "",
      comments: [{ idx: 1, date_th: "5 พ.ย. 2569", body: "ขอปรับสายให้ยาวขึ้น 5 ซม." }, { idx: 2, date_th: "6 พ.ย. 2569", body: "เปลี่ยนสีด้ายเป็นสีน้ำตาล" }], no_comments: false,
    },
  },
  design_sheet_cost: {
    key: "design_sheet_cost", label: "ใบตีราคาต้นทุน (ใบงานออกแบบ)", fields: dsCost.fields,
    tables: [{ key: "lines", label: "รายการวัตถุดิบ", itemLabel: "วัตถุดิบ", columns: [
      col("item_name", "รายการ", "ผ้าแคนวาส", "left", 30), col("dims", "ขนาด", "40×35 ซม.", "center", 12), col("pieces", "ชิ้น", "2", "right", 7), col("waste", "เผื่อ", "5%", "right", 7),
      col("per_yard_th", "ต่อหลา", "0.42", "right", 9), col("qty", "ใช้", "0.44", "right", 8), col("uom", "หน่วย", "หลา", "center", 7), col("unit_price_th", "ราคา", "120.00", "right", 10), col("amount_th", "รวม", "52.80", "right", 10),
    ] }],
    sampleData: (() => {
      const lines = [
        { item_name: "ผ้าแคนวาส 12oz", dims: "40×35 ซม.", pieces: "2", waste: "5%", per_yard_th: "0.42", per_piece_th: "52.80", qty: "0.44", uom: "หลา", unit_price_th: "120.00", amount_th: "52.80" },
        { item_name: "ซิปไนลอน #5", dims: "30 ซม.", pieces: "1", waste: "-", per_yard_th: "-", per_piece_th: "8.00", qty: "1", uom: "เส้น", unit_price_th: "8.00", amount_th: "8.00" },
      ];
      return {
        ...dsCost.data, lines, no_lines: false,
        groups: [{ group_name: "ผ้า", subtotal_th: "52.80", lines: [lines[0]] }, { group_name: "อุปกรณ์", subtotal_th: "8.00", lines: [lines[1]] }],
        cost_groups: [{ label: "วัตถุดิบ", subtotal_th: "142.50" }, { label: "ค่าแรง", subtotal_th: "35.00" }],
        extras: [{ label: "ค่าบรรจุภัณฑ์", amount_th: "7.50" }],
      };
    })(),
  },
  design_sheet_quote: {
    key: "design_sheet_quote", label: "ใบเสนอราคา (ใบงานออกแบบ)", fields: [...dsQuote.fields, { key: "cover_html", label: "รูปปก (HTML)", group: "ใบงาน", sample: "" }],
    tables: [{ key: "quotes", label: "ประวัติการเสนอราคา", itemLabel: "ครั้ง", columns: [col("round", "ครั้งที่", "1", "center", 12), col("date_th", "วันที่", "1 พ.ย. 2569", "center", 22), col("price_th", "ราคา", "255", "right", 20), col("status_label", "สถานะ", "รอตอบ", "center", 20), col("note", "หมายเหตุ", "", "left", 26)] }],
    sampleData: {
      ...dsQuote.data, cover_html: "",
      quotes: [{ round: 1, date_th: "1 พ.ย. 2569", price_th: "280", status_label: "ลูกค้าต่อราคา", note: "" }, { round: 2, date_th: "5 พ.ย. 2569", price_th: "255", status_label: "รอลูกค้าตอบ", note: "สั่ง 100 ใบขึ้นไป" }],
      latest: { round: 2, price_th: "255", status_label: "รอลูกค้าตอบ" },
    },
  },
  design_sheet_supplier: {
    key: "design_sheet_supplier", label: "ใบตีราคาสั่งจากร้าน", fields: dsSup.fields,
    tables: [{ key: "lines", label: "รายการสั่งจากร้าน", itemLabel: "รายการ", columns: [
      col("item_name", "รายการ", "กระเป๋าสำเร็จ", "left", 22), col("supplier_name", "ร้าน", "ร้านตัวอย่าง", "left", 14), col("price_src", "ราคาร้าน", "¥18", "right", 9), col("price_baht", "= บาท", "93.24", "right", 9),
      col("freight_pc", "ค่าส่ง/ชิ้น", "12.00", "right", 9), col("cost_pc", "ทุน/ชิ้น", "105.24", "right", 9), col("qty", "จำนวน", "100", "right", 8), col("offer", "ราคาขาย", "255", "right", 9), col("margin_pc", "กำไร%", "58%", "right", 8),
    ] }],
    sampleData: {
      ...dsSup.data, has_splits: true, no_lines: false,
      lines: [{ item_name: "กระเป๋าผ้าแคนวาส", supplier_name: "ร้านตัวอย่าง", price_src: "¥18.00", price_baht: "93.24", freight_pc: "12.00", cost_pc: "105.24", qty: "100", amount: "10,524", offer: "255", sale_total: "25,500", profit_total: "14,976", margin_pc: "58%", margin_cls: "ok" }],
      splits: [{ name: "ทีมออกแบบ", basis: "10% ของกำไร", amount: "1,500" }],
    },
  },
};
