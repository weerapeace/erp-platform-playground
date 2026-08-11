/**
 * สร้าง HTML "รายงานสรุปยอดขายรายเดือน" สำหรับพิมพ์ (A4) — แยกจากหน้าเว็บเพื่อให้เทสต์/พรีวิวได้
 *
 * ใช้ระบบพิมพ์กลาง (buildReportHtml) · หน้า /sales/monthly เรียกตัวนี้แล้วส่งให้ printReportHtmlInNewWindow
 * `show` = ส่วนที่ผู้ใช้ติ๊กเลือกไว้ (จาก components/report-sections) — ปิดส่วนไหน ใบพิมพ์ก็ไม่มีส่วนนั้น
 */
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import { soStatusLabel } from "@/lib/so-status";
import type { SalesMonthlyReport } from "@/app/api/sales/monthly-report/route";

const baht = (n: number) => Math.round(n || 0).toLocaleString("th-TH");
const TH_MONTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const monthLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${TH_MONTH[(m || 1) - 1]} ${(y || 0) + 543}`; };
const dmy = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

// ============================================================
// เทมเพลตพิมพ์ (A4) — ใช้ระบบพิมพ์กลาง
// ============================================================
const CSS = `
.doc { font-size: 11px; color: #111827; }
.h { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111827; padding-bottom:3mm; margin-bottom:3mm; }
.h-title { font-size:18px; font-weight:800; }
.h-sub { font-size:10px; color:#6b7280; margin-top:1mm; }
.h-r { text-align:right; font-size:10px; color:#6b7280; }
.kpi { display:flex; gap:3mm; margin-bottom:4mm; }
.kpi-box { flex:1; border:1px solid #cbd5e1; border-radius:3px; padding:2mm 2.5mm; }
.kpi-l { font-size:9.5px; color:#6b7280; }
.kpi-v { font-size:14px; font-weight:800; margin-top:0.5mm; }
.kpi-s { font-size:9px; color:#94a3b8; }
.sec { font-size:12px; font-weight:800; margin:4mm 0 1.5mm; }
.two { display:flex; gap:4mm; align-items:flex-start; }
.two > div { flex:1; }
.t { width:100%; border-collapse:collapse; }
.t th, .t td { border:1px solid #cbd5e1; padding:1.4mm 2mm; font-size:10.5px; }
.t th { background:#f1f5f9; font-weight:700; text-align:left; }
.t td.r, .t th.r { text-align:right; white-space:nowrap; }
.t .mono { font-family: ui-monospace, monospace; color:#475569; white-space:nowrap; }
.t tfoot td { background:#f8fafc; font-weight:800; }
.ok { color:#047857; font-weight:700; }
.wait { color:#b45309; font-weight:700; }
.cxl { color:#9ca3af; text-decoration:line-through; }
.t tr.ln td { background:#f8fafc; color:#475569; font-size:9.5px; padding-top:0.9mm; padding-bottom:0.9mm; }
.empty { text-align:center; color:#94a3b8; padding:12mm 0; font-size:12px; }
@media print { .doc { padding: 10mm 10mm !important; } }`;

const TEMPLATE: ReportTemplate = {
  paper_size: "A4", orientation: "portrait",
  header_html: `<div class="h">
    <div><div class="h-title">รายงานสรุปยอดขายรายเดือน</div><div class="h-sub">เดือน {{month_label}} · {{n}} ใบขาย</div></div>
    <div class="h-r">พิมพ์ {{printed_at}}</div>
  </div>`,
  body_html: `
  <div class="kpi">
    <div class="kpi-box"><div class="kpi-l">ยอดขายรวม (ไม่รวมยกเลิก)</div><div class="kpi-v">฿{{amt}}</div><div class="kpi-s">{{n}} ใบ · {{{trend}}}</div></div>
    <div class="kpi-box"><div class="kpi-l">ยืนยันแล้ว</div><div class="kpi-v ok">฿{{confirmed_amt}}</div><div class="kpi-s">{{confirmed_n}} ใบ · ร่างอีก {{draft_n}} ใบ (฿{{draft_amt}})</div></div>
    <div class="kpi-box"><div class="kpi-l">ก่อนภาษี / VAT</div><div class="kpi-v">฿{{taxable}}</div><div class="kpi-s">VAT ฿{{vat}}{{{wht_note}}}</div></div>
    <div class="kpi-box"><div class="kpi-l">ยังไม่ได้วางบิล</div><div class="kpi-v wait">฿{{unbilled_amt}}</div><div class="kpi-s">{{unbilled_n}} ใบ · วางบิลแล้ว {{billed_n}} ใบ</div></div>
  </div>

  <div class="two">
    {{#show_by_customer}}<div>
      <div class="sec">แยกตามลูกค้า</div>
      {{#has_cust}}<table class="t">
        <thead><tr><th>ลูกค้า</th><th class="r">ใบ</th><th class="r">ยอด (บาท)</th></tr></thead>
        <tbody>{{#customers}}<tr><td>{{name}}</td><td class="r">{{n}}</td><td class="r">{{amt}}</td></tr>{{/customers}}</tbody>
        <tfoot><tr><td>รวม</td><td class="r">{{n}}</td><td class="r">{{amt}}</td></tr></tfoot>
      </table>{{/has_cust}}
      {{^has_cust}}<div class="empty">— ไม่มีรายการ —</div>{{/has_cust}}
    </div>{{/show_by_customer}}
    <div>
      {{#show_by_sales}}<div class="sec">แยกตามพนักงานขาย</div>
      {{#has_sales}}<table class="t">
        <thead><tr><th>พนักงานขาย</th><th class="r">ใบ</th><th class="r">ยอด (บาท)</th></tr></thead>
        <tbody>{{#sales}}<tr><td>{{name}}</td><td class="r">{{n}}</td><td class="r">{{amt}}</td></tr>{{/sales}}</tbody>
      </table>{{/has_sales}}
      {{^has_sales}}<div class="empty">— ไม่มีรายการ —</div>{{/has_sales}}{{/show_by_sales}}

      {{#show_by_status}}<div class="sec">สถานะเอกสาร</div>
      {{#has_status}}<table class="t">
        <thead><tr><th>สถานะ</th><th class="r">ใบ</th><th class="r">ยอด (บาท)</th></tr></thead>
        <tbody>{{#statuses}}<tr><td>{{label}}</td><td class="r">{{n}}</td><td class="r">{{amt}}</td></tr>{{/statuses}}</tbody>
      </table>{{/has_status}}{{/show_by_status}}
    </div>
  </div>

  {{#show_top_products}}{{#has_prod}}<div class="sec">สินค้าขายดี (10 อันดับแรก)</div>
  <table class="t">
    <thead><tr><th>รหัส</th><th>สินค้า</th><th class="r">จำนวน</th><th class="r">ยอด (บาท)</th></tr></thead>
    <tbody>{{#products}}<tr><td class="mono">{{sku}}</td><td>{{name}}</td><td class="r">{{qty}}</td><td class="r">{{amt}}</td></tr>{{/products}}</tbody>
  </table>{{/has_prod}}{{/show_top_products}}

  {{#show_rows}}{{#has_rows}}<div class="sec">รายการใบขายทั้งเดือน{{#show_items}} (พร้อมรายการสินค้า){{/show_items}}</div>
  <table class="t">
    <thead><tr><th>วันที่</th><th>เลขที่</th><th>ลูกค้า</th><th>เซลส์</th><th>สถานะ</th><th class="r">ก่อนภาษี</th><th class="r">ยอดรวม</th><th>วางบิล</th></tr></thead>
    <tbody>{{#rows}}<tr>
      <td class="mono">{{date}}</td><td class="mono">{{so_number}}</td><td>{{customer}}</td><td>{{sales}}</td>
      <td>{{status}}</td><td class="r">{{taxable}}</td><td class="r">{{{total_cell}}}</td><td>{{{billed_cell}}}</td>
    </tr>{{#show_items}}{{#items}}<tr class="ln">
      <td></td><td colspan="3">↳ <span class="mono">{{sku}}</span> {{name}}</td>
      <td class="r">{{qty}}</td><td class="r">{{price}}</td><td class="r">{{amount}}</td><td></td>
    </tr>{{/items}}{{/show_items}}{{/rows}}</tbody>
    <tfoot><tr><td colspan="6">รวม (ไม่รวมใบยกเลิก)</td><td class="r">{{amt}}</td><td></td></tr></tfoot>
  </table>{{/has_rows}}
  {{^has_rows}}<div class="empty">— เดือนนี้ยังไม่มีใบขาย —</div>{{/has_rows}}{{/show_rows}}`,
  footer_html: `<div style="font-size:9px;color:#94a3b8;text-align:center;">รายงานสรุปยอดขายรายเดือน · ระบบ ERP</div>`,
  custom_css: CSS,
};

/** สร้าง HTML ใบพิมพ์จากข้อมูลรายงาน + ส่วนที่เลือกแสดง */
export function buildSalesMonthlyReportHtml(
  rep: SalesMonthlyReport,
  show: Record<string, boolean>,
  printedAt = new Date(),
): string {
  const s = rep.summary;
  const prevAmt = rep.prev?.amt ?? 0;
  const pct = prevAmt > 0 ? Math.round(((s.amt - prevAmt) / prevAmt) * 100) : null;
  const trend = pct == null
    ? `เดือนก่อน ฿${baht(prevAmt)}`
    : `<span style="color:${pct >= 0 ? "#047857" : "#be123c"}">${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}%</span> จากเดือนก่อน (฿${baht(prevAmt)})`;
  return buildReportHtml(TEMPLATE, {
    month_label: monthLabel(rep.month),
    printed_at: printedAt.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }),
    trend,
    wht_note: s.wht > 0 ? ` · หัก ณ ที่จ่าย ฿${baht(s.wht)}` : "",
    n: s.n, amt: baht(s.amt),
    confirmed_n: s.confirmed_n, confirmed_amt: baht(s.confirmed_amt),
    draft_n: s.draft_n, draft_amt: baht(s.draft_amt),
    taxable: baht(s.taxable), vat: baht(s.vat),
    unbilled_n: s.unbilled_n, unbilled_amt: baht(s.unbilled_amt), billed_n: s.billed_n,
    has_cust: rep.by_customer.length > 0,
    customers: rep.by_customer.map(c => ({ name: c.name, n: c.n, amt: baht(c.amt) })),
    has_sales: rep.by_sales.length > 0,
    sales: rep.by_sales.map(c => ({ name: c.name, n: c.n, amt: baht(c.amt) })),
    has_status: rep.by_status.length > 0,
    statuses: rep.by_status.map(c => ({ label: soStatusLabel(c.status), n: c.n, amt: baht(c.amt) })),
    has_prod: rep.top_products.length > 0,
    products: rep.top_products.slice(0, 10).map(p => ({
      sku: p.sku ?? "—", name: p.name, qty: `${p.qty.toLocaleString("th-TH")}${p.unit ? " " + p.unit : ""}`, amt: baht(p.amt),
    })),
    has_rows: rep.rows.length > 0,
    rows: rep.rows.map(r => ({
      date: dmy(r.order_date), so_number: r.so_number ?? "(ร่าง)",
      customer: r.customer_name ?? "—", sales: r.sale_person_name ?? "—",
      status: soStatusLabel(r.status),
      taxable: baht(r.taxable),
      total_cell: r.status === "cancelled" ? `<span class="cxl">${baht(r.grand_total)}</span>` : baht(r.grand_total),
      billed_cell: r.status === "cancelled" ? "—" : (r.billed ? `<span class="ok">วางบิลแล้ว</span>` : `<span class="wait">ยัง</span>`),
      items: r.items.map(it => ({
        sku: it.sku ?? "", name: it.name,
        qty: `${it.qty.toLocaleString("th-TH")}${it.unit ? " " + it.unit : ""}`,
        price: baht(it.unit_price), amount: baht(it.amount),
      })),
    })),
    // ส่วนที่ผู้ใช้ติ๊กเลือกให้แสดง (ห่อ section ในเทมเพลตด้วย {{#show_xxx}})
    show_by_customer: show.by_customer, show_by_sales: show.by_sales, show_by_status: show.by_status,
    show_top_products: show.top_products, show_rows: show.rows, show_items: show.rows && show.items,
  });
}
