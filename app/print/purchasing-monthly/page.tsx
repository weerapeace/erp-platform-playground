"use client";

/**
 * รายงานจัดซื้อรายเดือน (พิมพ์ได้) — /print/purchasing-monthly?month=YYYY-MM
 *   สรุปยอดซื้อ · จ่ายแล้ว/ยังไม่จ่าย · รับเข้าแล้ว/ยังไม่รับเข้า · แยกตามร้าน · รายการใบสั่งซื้อทั้งเดือน
 * ของกลาง: ระบบพิมพ์ (buildReportHtml + PrintFrame) — เหมือนรายงานอื่นในระบบ
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import type { MonthlyReport } from "@/app/api/purchasing/monthly-report/route";

const baht = (n: number) => Math.round(n || 0).toLocaleString("th-TH");
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthLabel = (m: string) => { const [y, mm] = m.split("-").map(Number); return `${TH_MONTH[(mm || 1) - 1]} ${String((y || 0) + 543).slice(2)}`; };
const dmy = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

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
.t { width:100%; border-collapse:collapse; }
.t th, .t td { border:1px solid #cbd5e1; padding:1.4mm 2mm; font-size:10.5px; }
.t th { background:#f1f5f9; font-weight:700; text-align:left; }
.t td.r, .t th.r { text-align:right; white-space:nowrap; }
.t .mono { font-family: ui-monospace, monospace; color:#475569; white-space:nowrap; }
.t tfoot td { background:#f8fafc; font-weight:800; }
.paid { color:#047857; font-weight:700; }
.unpaid { color:#be123c; font-weight:700; }
.empty { text-align:center; color:#94a3b8; padding:12mm 0; font-size:12px; }
@media print { .doc { padding: 12mm 12mm !important; } }`;

const TEMPLATE: ReportTemplate = {
  paper_size: "A4", orientation: "portrait",
  header_html: `<div class="h">
    <div><div class="h-title">รายงานจัดซื้อรายเดือน</div><div class="h-sub">เดือน {{month_label}} · {{po_count}} ใบสั่งซื้อ</div></div>
    <div class="h-r">พิมพ์ {{printed_at}}</div>
  </div>`,
  body_html: `
  <div class="kpi">
    <div class="kpi-box"><div class="kpi-l">ยอดซื้อรวม</div><div class="kpi-v">฿{{total_thb}}</div><div class="kpi-s">{{po_count}} ใบ · {{{trend}}}</div></div>
    <div class="kpi-box"><div class="kpi-l">จ่ายแล้ว</div><div class="kpi-v paid">฿{{paid_thb}}</div><div class="kpi-s">{{paid_count}} ใบ{{{diff_note}}}</div></div>
    <div class="kpi-box"><div class="kpi-l">ยังไม่จ่าย</div><div class="kpi-v unpaid">฿{{unpaid_thb}}</div><div class="kpi-s">{{unpaid_count}} ใบ</div></div>
    <div class="kpi-box"><div class="kpi-l">รับเข้าแล้ว / ยังไม่รับ</div><div class="kpi-v">{{received_lines}} / {{pending_lines}}</div><div class="kpi-s">รายการสินค้า</div></div>
  </div>

  <div class="sec">สรุปตามร้านค้า</div>
  {{#has_sellers}}<table class="t">
    <thead><tr><th>ร้านค้า</th><th class="r">จำนวนใบ</th><th class="r">ยอดซื้อ (บาท)</th></tr></thead>
    <tbody>{{#sellers}}<tr><td>{{name}}</td><td class="r">{{po_count}}</td><td class="r">{{thb}}</td></tr>{{/sellers}}</tbody>
    <tfoot><tr><td>รวม</td><td class="r">{{po_count}}</td><td class="r">{{total_thb}}</td></tr></tfoot>
  </table>{{/has_sellers}}
  {{^has_sellers}}<div class="empty">— ไม่มีรายการในเดือนนี้ —</div>{{/has_sellers}}

  {{#has_pos}}<div class="sec">รายการใบสั่งซื้อ</div>
  <table class="t">
    <thead><tr><th>วันที่</th><th>เลขที่</th><th>ร้านค้า</th><th class="r">ยอด (บาท)</th><th>การจ่าย</th><th class="r">รับเข้า</th></tr></thead>
    <tbody>{{#pos}}<tr>
      <td class="mono">{{date}}</td><td class="mono">{{po_no}}</td><td>{{seller}}</td>
      <td class="r">{{amount}}</td><td>{{{pay_cell}}}</td><td class="r">{{recv}}</td>
    </tr>{{/pos}}</tbody>
  </table>{{/has_pos}}`,
  footer_html: `<div style="font-size:9px;color:#94a3b8;text-align:center;">รายงานจัดซื้อรายเดือน · ระบบ ERP</div>`,
  custom_css: CSS,
};

function Inner() {
  const sp = useSearchParams();
  const month = sp.get("month") || new Date().toISOString().slice(0, 7);
  const [rep, setRep] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/purchasing/monthly-report?month=${encodeURIComponent(month)}`).then((r) => r.json())
      .then((j) => setRep((j.data ?? null) as MonthlyReport | null))
      .catch(() => setRep(null)).finally(() => setLoading(false));
  }, [month]);

  const html = useMemo(() => {
    if (!rep) return "";
    const s = rep.summary;
    // เทียบเดือนก่อน: +/-% ยอดซื้อ
    const prevTotal = rep.prev?.total_thb ?? 0;
    const pct = prevTotal > 0 ? Math.round(((s.total_thb - prevTotal) / prevTotal) * 100) : null;
    const trend = rep.prev
      ? (pct == null
          ? `เดือนก่อน ฿${baht(prevTotal)}`
          : `<span style="color:${pct >= 0 ? "#be123c" : "#047857"}">${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}%</span> จากเดือนก่อน (฿${baht(prevTotal)})`)
      : "—";
    // ส่วนต่าง: ยอดจ่ายจริง vs ยอดตามใบ (ของใบที่จ่ายแล้ว)
    const diff = s.paid_thb - s.paid_invoiced_thb;
    const diffNote = s.paid_count === 0 || Math.abs(diff) < 1 ? ""
      : ` · <span style="color:${diff > 0 ? "#be123c" : "#047857"}">${diff > 0 ? "จ่ายเกินใบ" : "จ่ายต่ำกว่าใบ"} ฿${baht(Math.abs(diff))}</span>`;
    return buildReportHtml(TEMPLATE, {
      trend, diff_note: diffNote,
      month_label: monthLabel(rep.month),
      printed_at: new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }),
      po_count: s.po_count, total_thb: baht(s.total_thb),
      paid_thb: baht(s.paid_thb), paid_count: s.paid_count,
      unpaid_thb: baht(s.unpaid_thb), unpaid_count: s.unpaid_count,
      received_lines: s.received_lines, pending_lines: s.pending_receive_lines,
      has_sellers: rep.by_seller.length > 0,
      sellers: rep.by_seller.map((x) => ({ name: x.name, po_count: x.po_count, thb: baht(x.thb) })),
      has_pos: rep.pos.length > 0,
      pos: rep.pos.map((p) => ({
        date: dmy(p.order_date), po_no: p.po_no, seller: p.seller || "—",
        amount: baht(p.amount_thb),
        pay_cell: p.payment_status === "paid"
          ? `<span class="paid">จ่ายแล้ว${p.paid_date ? ` ${dmy(p.paid_date)}` : ""}${p.paid_amount_thb ? ` (฿${baht(p.paid_amount_thb)})` : ""}</span>`
          : `<span class="unpaid">ยังไม่จ่าย</span>`,
        recv: `${p.received_lines}/${p.lines}`,
      })),
    });
  }, [rep]);

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="mx-auto max-w-[860px] px-4">
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-slate-800">🖨 รายงานจัดซื้อรายเดือน</h1>
            <p className="text-xs text-slate-500">เดือน {monthLabel(month)}</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="month" value={month}
              onChange={(e) => { const u = new URL(window.location.href); u.searchParams.set("month", e.target.value); window.location.href = u.toString(); }}
              className="h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white" />
            <button onClick={() => printReportHtmlInNewWindow(html)} disabled={!html}
              className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">พิมพ์ / บันทึก PDF</button>
          </div>
        </div>
        {loading ? <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>
          : <PrintFrame html={html} onPrint={() => html && printReportHtmlInNewWindow(html)} />}
      </div>
    </div>
  );
}

export default function PurchasingMonthlyReportPage() {
  return <Suspense fallback={<div className="p-10 text-center text-slate-400">กำลังโหลด…</div>}><Inner /></Suspense>;
}
