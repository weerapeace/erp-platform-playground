/**
 * สร้าง HTML "รายงานภาษีขาย" สำหรับพิมพ์ (A4 แนวนอน) — ใช้ระบบพิมพ์กลาง (buildReportHtml)
 *
 * รูปแบบตามแบบรายงานภาษีขายของกรมสรรพากร: หัวรายงานบอกผู้ประกอบการ/เลขผู้เสียภาษี/สถานประกอบการ/เดือนภาษี
 * ตาราง 9 ช่อง (ลำดับ · วันที่ · เลขที่ใบกำกับ · ผู้ซื้อ · เลขผู้เสียภาษี · สาขา · มูลค่า · VAT · หมายเหตุ)
 * ท้ายตาราง: รวมใบกำกับ − ใบลดหนี้ = ยอดสุทธิ (ตัวเลขที่เอาไปกรอก ภ.พ.30)
 * คำเตือนเรื่องเลขขาด/ซ้ำ/ใบร่าง อยู่บนจอเท่านั้น — ไม่พิมพ์ลงเอกสารที่ส่งสรรพากร
 */
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import { monthLabelTh } from "@/lib/month";
import { branchLabel, type SalesTaxReport } from "@/lib/sales-tax-report";

const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 0 → ช่องว่างขีด (ใบยกเลิก) เพื่อไม่ให้ตาราง "0.00" รกและสับสนกับยอดจริง */
const cell = (n: number) => (n === 0 ? "-" : money(n));
const dmyBE = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const CSS = `
.doc { font-size: 11px; color: #111827; }
.h { text-align:center; margin-bottom: 3mm; }
.h-title { font-size: 18px; font-weight: 800; letter-spacing: .3px; }
.h-sub { font-size: 12px; margin-top: 0.5mm; }
.who { width:100%; border-collapse:collapse; margin-bottom: 3mm; }
.who th, .who td { border:1px solid #94a3b8; padding:1.3mm 2mm; font-size:10.5px; vertical-align:top; }
.who th { text-align:left; font-weight:600; background:#f8fafc; width:34mm; white-space:nowrap; }
.who td.mono { font-family: ui-monospace, monospace; }
.t { width:100%; border-collapse:collapse; }
.t th, .t td { border:1px solid #94a3b8; padding:1.2mm 1.6mm; font-size:10px; vertical-align:top; }
.t th { background:#f1f5f9; font-weight:700; text-align:center; }
.t td.r, .t th.r { text-align:right; white-space:nowrap; }
.t td.c { text-align:center; }
.t .mono { font-family: ui-monospace, monospace; white-space:nowrap; }
.t tr.cxl td { color:#6b7280; }
.t tr.cn td { background:#fff7ed; }
.t tfoot td { font-weight:700; background:#f8fafc; }
.t tfoot tr.net td { font-weight:800; font-size:11px; border-top:2px solid #111827; }
.empty { text-align:center; color:#6b7280; padding:10mm 0; font-size:12px; }
.sig { display:flex; justify-content:flex-end; gap:16mm; margin-top:10mm; }
.sig-box { width:60mm; text-align:center; font-size:10px; }
.sig-line { border-top:1px solid #111827; margin:12mm 4mm 1.5mm; }
@media print { .doc { padding: 8mm 10mm !important; } }`;

const TEMPLATE: ReportTemplate = {
  paper_size: "A4", orientation: "landscape",
  header_html: `<div class="h">
    <div class="h-title">รายงานภาษีขาย</div>
    <div class="h-sub">เดือนภาษี <b>{{month_label}}</b></div>
  </div>
  <table class="who">
    <tr><th>ชื่อผู้ประกอบการ</th><td>{{company_name}}</td><th>เลขประจำตัวผู้เสียภาษีอากร</th><td class="mono">{{company_tax_id}}</td></tr>
    <tr><th>ชื่อสถานประกอบการ</th><td>{{company_name}}</td><th>สถานประกอบการ</th><td>{{company_branch}}</td></tr>
    <tr><th>ที่อยู่</th><td colspan="3">{{company_address}}</td></tr>
  </table>`,
  body_html: `
  {{#has_rows}}<table class="t">
    <thead><tr>
      <th style="width:9mm">ลำดับ</th><th style="width:20mm">วัน/เดือน/ปี</th><th style="width:30mm">เลขที่ใบกำกับภาษี</th>
      <th>ชื่อผู้ซื้อสินค้า / ผู้รับบริการ</th><th style="width:30mm">เลขประจำตัวผู้เสียภาษี</th><th style="width:24mm">สถานประกอบการ</th>
      <th class="r" style="width:26mm">มูลค่าสินค้า/บริการ</th><th class="r" style="width:22mm">ภาษีมูลค่าเพิ่ม</th><th style="width:40mm">หมายเหตุ</th>
    </tr></thead>
    <tbody>{{#rows}}<tr class="{{cls}}">
      <td class="c">{{idx}}</td><td class="c mono">{{date}}</td><td class="mono">{{doc_no}}</td>
      <td>{{customer}}</td><td class="mono">{{tax_id}}</td><td class="c">{{branch}}</td>
      <td class="r">{{taxable}}</td><td class="r">{{vat}}</td><td>{{remark}}</td>
    </tr>{{/rows}}</tbody>
    <tfoot>
      <tr><td colspan="6">รวมใบกำกับภาษี ({{invoice_n}} ใบ{{#cancelled_n}} · ยกเลิก {{cancelled_n}} ใบ{{/cancelled_n}})</td><td class="r">{{invoice_taxable}}</td><td class="r">{{invoice_vat}}</td><td></td></tr>
      {{#has_cn}}<tr><td colspan="6">หัก ใบลดหนี้ ({{cn_n}} ใบ)</td><td class="r">-{{cn_taxable}}</td><td class="r">-{{cn_vat}}</td><td></td></tr>{{/has_cn}}
      <tr class="net"><td colspan="6">ยอดสุทธิ (นำไปกรอก ภ.พ.30)</td><td class="r">{{net_taxable}}</td><td class="r">{{net_vat}}</td><td></td></tr>
    </tfoot>
  </table>{{/has_rows}}
  {{^has_rows}}<div class="empty">— เดือนนี้ไม่มีใบกำกับภาษี —</div>{{/has_rows}}

  <div class="sig">
    <div class="sig-box"><div class="sig-line"></div>ผู้จัดทำ</div>
    <div class="sig-box"><div class="sig-line"></div>ผู้มีอำนาจลงนาม</div>
  </div>`,
  footer_html: `<div style="font-size:9px;color:#6b7280;text-align:center;">รายงานภาษีขาย {{company_code}} · เดือน {{month_label}} · พิมพ์ {{printed_at}}</div>`,
  custom_css: CSS,
};

/** สร้าง HTML ใบพิมพ์รายงานภาษีขาย */
export function buildSalesTaxReportHtml(rep: SalesTaxReport, printedAt = new Date()): string {
  const s = rep.summary;
  const co = rep.company;
  return buildReportHtml(TEMPLATE, {
    month_label: monthLabelTh(rep.month),
    printed_at: printedAt.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }),
    company_code: co?.code ?? "",
    company_name: co?.name_th ?? "—",
    company_tax_id: co?.tax_id ?? "—",
    company_branch: branchLabel(co?.tax_branch, !!co?.tax_id) || "สำนักงานใหญ่",
    company_address: co?.address ?? "",
    has_rows: rep.rows.length > 0,
    rows: rep.rows.map((r, i) => ({
      idx: i + 1,
      cls: r.cancelled ? "cxl" : r.kind === "credit_note" ? "cn" : "",
      date: dmyBE(r.doc_date),
      doc_no: r.doc_no,
      customer: r.customer_name,
      tax_id: r.customer_tax_id || "-",
      branch: r.customer_branch || "-",
      taxable: cell(r.taxable),
      vat: cell(r.vat),
      remark: r.remark,
    })),
    invoice_n: s.invoice_n, cancelled_n: s.cancelled_n,
    invoice_taxable: money(s.invoice_taxable), invoice_vat: money(s.invoice_vat),
    has_cn: s.cn_n > 0, cn_n: s.cn_n, cn_taxable: money(s.cn_taxable), cn_vat: money(s.cn_vat),
    net_taxable: money(s.net_taxable), net_vat: money(s.net_vat),
  });
}
