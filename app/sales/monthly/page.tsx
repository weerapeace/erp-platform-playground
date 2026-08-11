"use client";

/**
 * สรุปยอดขายรายเดือน — /sales/monthly
 *   เลือกเดือน → เห็นยอดขายทั้งเดือน · แยกตามลูกค้า / พนักงานขาย / สถานะ / สินค้าขายดี
 *   + รายการใบขายทุกใบในเดือน · พิมพ์เป็น A4 / PDF ได้ · ดาวน์โหลด Excel ได้
 *
 * ของกลางที่ใช้: PlaygroundShell · permission (so.view) · ระบบพิมพ์กลาง (buildReportHtml + printReportHtmlInNewWindow)
 *                Export กลาง (lib/export — มี audit log ให้อัตโนมัติ) · สถานะ SO กลาง (lib/so-status)
 * กราฟวาดเอง (CSS) — โปรเจกต์ไม่มี chart library เพื่อไม่ให้ bundle บวม (แบบเดียวกับแดชบอร์ดขาย/จัดซื้อ)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { exportTable } from "@/lib/export";
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import { printReportHtmlInNewWindow } from "@/components/report";
import { soStatusLabel, soStatusColor } from "@/lib/so-status";
import type { SalesMonthlyReport, SalesMonthlyRow } from "@/app/api/sales/monthly-report/route";

// ---- helpers ----
const baht = (n: number) => Math.round(n || 0).toLocaleString("th-TH");
const bahtShort = (n: number) => {
  const v = Math.round(n || 0);
  if (v >= 1_000_000) return "฿" + (v / 1_000_000).toFixed(2) + "M";
  if (v >= 100_000) return "฿" + Math.round(v / 1000) + "k";
  return "฿" + v.toLocaleString("th-TH");
};
const TH_MONTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const monthLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${TH_MONTH[(m || 1) - 1]} ${(y || 0) + 543}`; };
const dmy = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const thisMonth = () => new Date().toISOString().slice(0, 7);
const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

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
    <div>
      <div class="sec">แยกตามลูกค้า</div>
      {{#has_cust}}<table class="t">
        <thead><tr><th>ลูกค้า</th><th class="r">ใบ</th><th class="r">ยอด (บาท)</th></tr></thead>
        <tbody>{{#customers}}<tr><td>{{name}}</td><td class="r">{{n}}</td><td class="r">{{amt}}</td></tr>{{/customers}}</tbody>
        <tfoot><tr><td>รวม</td><td class="r">{{n}}</td><td class="r">{{amt}}</td></tr></tfoot>
      </table>{{/has_cust}}
      {{^has_cust}}<div class="empty">— ไม่มีรายการ —</div>{{/has_cust}}
    </div>
    <div>
      <div class="sec">แยกตามพนักงานขาย</div>
      {{#has_sales}}<table class="t">
        <thead><tr><th>พนักงานขาย</th><th class="r">ใบ</th><th class="r">ยอด (บาท)</th></tr></thead>
        <tbody>{{#sales}}<tr><td>{{name}}</td><td class="r">{{n}}</td><td class="r">{{amt}}</td></tr>{{/sales}}</tbody>
      </table>{{/has_sales}}
      {{^has_sales}}<div class="empty">— ไม่มีรายการ —</div>{{/has_sales}}

      <div class="sec">สถานะเอกสาร</div>
      {{#has_status}}<table class="t">
        <thead><tr><th>สถานะ</th><th class="r">ใบ</th><th class="r">ยอด (บาท)</th></tr></thead>
        <tbody>{{#statuses}}<tr><td>{{label}}</td><td class="r">{{n}}</td><td class="r">{{amt}}</td></tr>{{/statuses}}</tbody>
      </table>{{/has_status}}
    </div>
  </div>

  {{#has_prod}}<div class="sec">สินค้าขายดี (10 อันดับแรก)</div>
  <table class="t">
    <thead><tr><th>รหัส</th><th>สินค้า</th><th class="r">จำนวน</th><th class="r">ยอด (บาท)</th></tr></thead>
    <tbody>{{#products}}<tr><td class="mono">{{sku}}</td><td>{{name}}</td><td class="r">{{qty}}</td><td class="r">{{amt}}</td></tr>{{/products}}</tbody>
  </table>{{/has_prod}}

  {{#has_rows}}<div class="sec">รายการใบขายทั้งเดือน</div>
  <table class="t">
    <thead><tr><th>วันที่</th><th>เลขที่</th><th>ลูกค้า</th><th>เซลส์</th><th>สถานะ</th><th class="r">ก่อนภาษี</th><th class="r">ยอดรวม</th><th>วางบิล</th></tr></thead>
    <tbody>{{#rows}}<tr>
      <td class="mono">{{date}}</td><td class="mono">{{so_number}}</td><td>{{customer}}</td><td>{{sales}}</td>
      <td>{{status}}</td><td class="r">{{taxable}}</td><td class="r">{{{total_cell}}}</td><td>{{{billed_cell}}}</td>
    </tr>{{/rows}}</tbody>
    <tfoot><tr><td colspan="6">รวม (ไม่รวมใบยกเลิก)</td><td class="r">{{amt}}</td><td></td></tr></tfoot>
  </table>{{/has_rows}}
  {{^has_rows}}<div class="empty">— เดือนนี้ยังไม่มีใบขาย —</div>{{/has_rows}}`,
  footer_html: `<div style="font-size:9px;color:#94a3b8;text-align:center;">รายงานสรุปยอดขายรายเดือน · ระบบ ERP</div>`,
  custom_css: CSS,
};

// ============================================================
// ชิ้นส่วนหน้าจอ
// ============================================================
function Card({ title, right, children, className = "" }: {
  title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-4 ${className}`}>
      {(title || right) && (
        <div className="flex items-baseline justify-between mb-3 gap-2">
          {title && <h2 className="text-sm font-semibold text-slate-700">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function Kpi({ label, value, sub, tone = "slate", icon }: {
  label: string; value: string; sub?: React.ReactNode; tone?: "slate" | "blue" | "amber" | "green"; icon: string;
}) {
  const tones: Record<string, string> = {
    slate: "from-slate-50 to-white border-slate-200 text-slate-800",
    blue:  "from-blue-50 to-white border-blue-200 text-blue-700",
    amber: "from-amber-50 to-white border-amber-200 text-amber-700",
    green: "from-emerald-50 to-white border-emerald-200 text-emerald-700",
  };
  return (
    <div className={`h-full bg-gradient-to-br ${tones[tone]} border rounded-xl p-4`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-80">{icon} {label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums font-mono leading-tight">{value}</div>
      {sub && <div className="mt-1 text-[11px] opacity-70">{sub}</div>}
    </div>
  );
}

/** ตารางแยกกลุ่ม + แถบสัดส่วน (ใช้ทั้งลูกค้า / พนักงานขาย / สินค้า) */
function RankRows({ items, total, unit = "ใบ", color = "emerald" }: {
  items: { name: string; sub?: string | null; n: number; amt: number; unit?: string | null }[];
  total: number; unit?: string; color?: "emerald" | "blue" | "violet";
}) {
  const bars: Record<string, string> = {
    emerald: "from-emerald-500 to-emerald-400", blue: "from-blue-500 to-blue-400", violet: "from-violet-500 to-violet-400",
  };
  const max = Math.max(1, ...items.map(i => i.amt));
  if (!items.length) return <div className="py-6 text-center text-sm text-slate-400">— ไม่มีรายการ —</div>;
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-48 shrink-0 truncate text-xs text-slate-600" title={it.name}>
            {it.name}{it.sub && <span className="text-slate-400"> · {it.sub}</span>}
          </div>
          <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden">
            <div className={`h-full rounded-md bg-gradient-to-r ${bars[color]}`} style={{ width: `${(it.amt / max) * 100}%` }} />
          </div>
          <div className="w-24 shrink-0 text-right text-xs font-mono tabular-nums text-slate-700">{bahtShort(it.amt)}</div>
          <div className="w-20 shrink-0 text-right text-[11px] text-slate-400 truncate">{it.n.toLocaleString("th-TH")} {it.unit ?? unit}</div>
          <div className="w-10 shrink-0 text-right text-[11px] text-slate-400">{total ? Math.round((it.amt / total) * 100) : 0}%</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Page
// ============================================================
export default function SalesMonthlyReportPage() {
  const canView = usePermission("so.view");
  const { can } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [rep, setRep] = useState<SalesMonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!canView) return;
    setLoading(true); setError(null);
    apiFetch(`/api/sales/monthly-report?month=${encodeURIComponent(month)}`).then(r => r.json())
      .then(j => { if (j.error) throw new Error(j.error); setRep(j.data as SalesMonthlyReport); })
      .catch(e => { setRep(null); setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); })
      .finally(() => setLoading(false));
  }, [canView, month]);

  // ---- HTML สำหรับพิมพ์ ----
  const printHtml = useMemo(() => {
    if (!rep) return "";
    const s = rep.summary;
    const prevAmt = rep.prev?.amt ?? 0;
    const pct = prevAmt > 0 ? Math.round(((s.amt - prevAmt) / prevAmt) * 100) : null;
    const trend = pct == null
      ? `เดือนก่อน ฿${baht(prevAmt)}`
      : `<span style="color:${pct >= 0 ? "#047857" : "#be123c"}">${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}%</span> จากเดือนก่อน (฿${baht(prevAmt)})`;
    return buildReportHtml(TEMPLATE, {
      month_label: monthLabel(rep.month),
      printed_at: new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }),
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
      })),
    });
  }, [rep]);

  const doExport = useCallback(async (format: "csv" | "excel") => {
    if (!rep) return;
    try {
      await exportTable({
        format, filename: `sales-monthly-${rep.month}`,
        rows: rep.rows as unknown as Record<string, unknown>[],
        columns: [
          { key: "order_date", header: "วันที่", format: v => dmy(v as string) },
          { key: "so_number", header: "เลขที่ SO" },
          { key: "customer_code", header: "รหัสลูกค้า" },
          { key: "customer_name", header: "ลูกค้า" },
          { key: "sale_person_name", header: "พนักงานขาย" },
          { key: "status", header: "สถานะ", format: v => soStatusLabel(v as string) },
          { key: "lines", header: "จำนวนรายการ" },
          { key: "taxable", header: "ยอดก่อนภาษี" },
          { key: "vat", header: "VAT" },
          { key: "wht", header: "หัก ณ ที่จ่าย" },
          { key: "grand_total", header: "ยอดรวม" },
          { key: "billed", header: "วางบิลแล้ว" },
        ],
        context: { entityType: "erp_playground_so", mode: "filtered_all", totalRows: rep.rows.length, filterDesc: `เดือน ${rep.month}` },
        // can() ของ useAuth รับ Permission (union) — คอลัมน์รายงานนี้ไม่ได้ล็อกสิทธิ์รายฟิลด์ จึงห่อเป็น (string)=>boolean
        can: (perm: string) => can(perm as Parameters<typeof can>[0]),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
    }
  }, [rep, can]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  const s = rep?.summary;
  const prevAmt = rep?.prev?.amt ?? 0;
  const growth = s && prevAmt > 0 ? Math.round(((s.amt - prevAmt) / prevAmt) * 100) : null;
  const maxDaily = rep ? Math.max(1, ...rep.daily.map(d => d.amt)) : 1;
  const visibleRows: SalesMonthlyRow[] = rep ? (showAll ? rep.rows : rep.rows.slice(0, 25)) : [];

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* ===== หัวเรื่อง + เลือกเดือน ===== */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">📈 สรุปยอดขายรายเดือน</h1>
            <p className="text-sm text-slate-500">ยอดขายทั้งเดือน · แยกตามลูกค้า / พนักงานขาย / สินค้า · พิมพ์เป็น A4 ได้</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
              <button onClick={() => setMonth(m => shiftMonth(m, -1))} className="h-9 px-2.5 text-slate-500 hover:bg-slate-50" title="เดือนก่อน">◀</button>
              <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)}
                className="h-9 px-2 text-sm border-x border-slate-200 outline-none" />
              <button onClick={() => setMonth(m => shiftMonth(m, 1))} className="h-9 px-2.5 text-slate-500 hover:bg-slate-50" title="เดือนถัดไป">▶</button>
            </div>
            {month !== thisMonth() && (
              <button onClick={() => setMonth(thisMonth())} className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">เดือนนี้</button>
            )}
            <button onClick={() => printHtml && printReportHtmlInNewWindow(printHtml)} disabled={!printHtml}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">🖨 พิมพ์ / PDF</button>
            <button onClick={() => doExport("excel")} disabled={!rep?.rows.length}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50">⬇ Excel</button>
            <Link href="/sales/dashboard" className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">📊 แดชบอร์ด</Link>
            <Link href="/sales-orders" className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">🧾 ใบขาย</Link>
          </div>
        </div>

        <div className="text-sm text-slate-500">เดือน <span className="font-semibold text-slate-700">{monthLabel(month)}</span></div>

        {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        {loading || !rep || !s ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : s.n === 0 && s.cancelled_n === 0 ? (
          <Card>
            <div className="py-16 text-center">
              <div className="text-3xl mb-2">🗓️</div>
              <div className="text-slate-600 font-medium">เดือน {monthLabel(month)} ยังไม่มีใบขาย</div>
              <div className="text-sm text-slate-400 mt-1">ลองเลือกเดือนอื่น หรือไปสร้างใบขายใหม่ที่หน้าใบขาย</div>
            </div>
          </Card>
        ) : (
          <>
            {/* ===== KPI ===== */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icon="💰" tone="blue" label="ยอดขายรวม (ไม่รวมยกเลิก)" value={bahtShort(s.amt)}
                sub={<>{s.n} ใบ · เฉลี่ย {bahtShort(s.avg)}/ใบ {growth !== null && (
                  <span className={growth >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                    · {growth >= 0 ? "▲" : "▼"} {Math.abs(growth)}% จากเดือนก่อน
                  </span>)}</>} />
              <Kpi icon="✅" tone="green" label="ยืนยันแล้ว (ขายจริง)" value={bahtShort(s.confirmed_amt)}
                sub={`${s.confirmed_n} ใบ · ร่างอีก ${s.draft_n} ใบ (${bahtShort(s.draft_amt)})`} />
              <Kpi icon="🧮" tone="slate" label="ยอดก่อนภาษี / VAT" value={bahtShort(s.taxable)}
                sub={<>VAT {bahtShort(s.vat)}{s.wht > 0 && <> · หัก ณ ที่จ่าย {bahtShort(s.wht)}</>}</>} />
              <Kpi icon="⏳" tone="amber" label="ยังไม่ได้วางบิล" value={bahtShort(s.unbilled_amt)}
                sub={`${s.unbilled_n} ใบ · วางบิลแล้ว ${s.billed_n} ใบ (${bahtShort(s.billed_amt)})`} />
            </div>

            {/* ===== ยอดขายรายวัน ===== */}
            <Card title="ยอดขายรายวัน" right={
              <span className="text-xs text-slate-400">
                ลูกค้า {s.customers} ราย · สินค้า {s.skus} รายการ · จำนวนรวม {s.qty.toLocaleString("th-TH")} ชิ้น
              </span>}>
              <div className="flex items-end gap-[3px] h-40">
                {rep.daily.map(d => (
                  <div key={d.d} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div className="w-full rounded-t bg-gradient-to-t from-blue-600 to-blue-400 transition-all min-h-[2px]"
                      style={{ height: `${d.amt > 0 ? Math.max(3, (d.amt / maxDaily) * 100) : 0}%` }} />
                    {d.amt > 0 && (
                      <div className="absolute bottom-full mb-1 hidden group-hover:block whitespace-nowrap bg-slate-800 text-white text-[10px] px-2 py-1 rounded z-10">
                        {d.d} {TH_MONTH[Number(month.slice(5, 7)) - 1]} · ฿{baht(d.amt)} · {d.n} ใบ
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-1.5 text-[10px] text-slate-400">
                {rep.daily.filter(d => d.d === 1 || d.d % 5 === 0).map(d => <span key={d.d}>{d.d}</span>)}
              </div>
            </Card>

            {/* ===== ลูกค้า / พนักงานขาย ===== */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card title="แยกตามลูกค้า" right={<span className="text-xs text-slate-400">{rep.by_customer.length} ราย</span>}>
                <RankRows items={rep.by_customer.slice(0, 10).map(c => ({ name: c.name, sub: c.code, n: c.n, amt: c.amt }))} total={s.amt} color="emerald" />
              </Card>
              <Card title="แยกตามพนักงานขาย" right={<span className="text-xs text-slate-400">{rep.by_sales.length} คน</span>}>
                <RankRows items={rep.by_sales.map(c => ({ name: c.name, n: c.n, amt: c.amt }))} total={s.amt} color="blue" />
              </Card>
            </div>

            {/* ===== สถานะ / สินค้าขายดี ===== */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <Card title="สถานะเอกสาร">
                <div className="space-y-2">
                  {rep.by_status.map(st => (
                    <div key={st.status} className="flex items-center gap-2 text-sm">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: soStatusColor(st.status) }} />
                      <span className="text-slate-600 flex-1">{soStatusLabel(st.status)}</span>
                      <span className="text-slate-400 text-xs">{st.n} ใบ</span>
                      <span className="w-24 text-right font-mono tabular-nums text-xs text-slate-700">{bahtShort(st.amt)}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="สินค้าขายดี (10 อันดับ)" className="xl:col-span-2">
                <RankRows
                  items={rep.top_products.slice(0, 10).map(p => ({
                    name: p.name, sub: p.sku, n: Math.round(p.qty), amt: p.amt, unit: p.unit ?? "ชิ้น",
                  }))}
                  total={rep.top_products.reduce((a, p) => a + p.amt, 0)} unit="ชิ้น" color="violet" />
              </Card>
            </div>

            {/* ===== รายการใบขายทั้งเดือน ===== */}
            <Card title={`รายการใบขายทั้งเดือน (${rep.rows.length} ใบ)`} right={
              <button onClick={() => doExport("csv")} className="text-xs text-blue-600 hover:underline">⬇ CSV</button>}>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="px-2 py-2 text-left font-semibold">วันที่</th>
                      <th className="px-2 py-2 text-left font-semibold">เลขที่</th>
                      <th className="px-2 py-2 text-left font-semibold">ลูกค้า</th>
                      <th className="px-2 py-2 text-left font-semibold">เซลส์</th>
                      <th className="px-2 py-2 text-left font-semibold">สถานะ</th>
                      <th className="px-2 py-2 text-right font-semibold">ก่อนภาษี</th>
                      <th className="px-2 py-2 text-right font-semibold">VAT</th>
                      <th className="px-2 py-2 text-right font-semibold">ยอดรวม</th>
                      <th className="px-2 py-2 text-center font-semibold">วางบิล</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRows.map(r => (
                      <tr key={r.id} className={`hover:bg-slate-50 ${r.status === "cancelled" ? "opacity-50" : ""}`}>
                        <td className="px-2 py-1.5 text-xs text-slate-500 whitespace-nowrap">{dmy(r.order_date)}</td>
                        <td className="px-2 py-1.5"><code className="font-mono text-[11px] text-slate-600">{r.so_number ?? "(ร่าง)"}</code></td>
                        <td className="px-2 py-1.5 max-w-[240px] truncate text-slate-700" title={r.customer_name ?? ""}>{r.customer_name ?? "—"}</td>
                        <td className="px-2 py-1.5 text-xs text-slate-500">{r.sale_person_name ?? "—"}</td>
                        <td className="px-2 py-1.5">
                          <span className="text-[11px] px-2 py-0.5 rounded-full text-white" style={{ background: soStatusColor(r.status) }}>
                            {soStatusLabel(r.status)}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums text-xs text-slate-500">{baht(r.taxable)}</td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums text-xs text-slate-500">{baht(r.vat)}</td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-800">{baht(r.grand_total)}</td>
                        <td className="px-2 py-1.5 text-center text-[11px]">
                          {r.status === "cancelled" ? <span className="text-slate-300">—</span>
                            : r.billed ? <span className="text-emerald-600">✓</span>
                            : <span className="text-amber-600">รอ</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold">
                      <td className="px-2 py-2 text-xs text-slate-600" colSpan={5}>รวม (ไม่รวมใบยกเลิก) · {s.n} ใบ</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums text-xs text-slate-600">{baht(s.taxable)}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums text-xs text-slate-600">{baht(s.vat)}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums text-slate-800">{baht(s.amt)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {rep.rows.length > 25 && (
                <button onClick={() => setShowAll(v => !v)} className="mt-3 text-xs text-blue-600 hover:underline">
                  {showAll ? "ย่อรายการ" : `ดูทั้งหมด ${rep.rows.length} ใบ`}
                </button>
              )}
            </Card>
          </>
        )}
      </div>
    </PlaygroundShell>
  );
}
