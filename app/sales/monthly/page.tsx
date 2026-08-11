"use client";

/**
 * สรุปยอดขายรายเดือน — /sales/monthly
 *   เลือกเดือน → เห็นยอดขายทั้งเดือน · แยกตามลูกค้า / พนักงานขาย / สถานะ / สินค้าขายดี
 *   + รายการใบขายทุกใบในเดือน · พิมพ์เป็น A4 / PDF ได้ · ดาวน์โหลด Excel ได้
 *
 * ของกลางที่ใช้: PlaygroundShell · permission (so.view) · ระบบพิมพ์กลาง (lib/sales-monthly-print → buildReportHtml)
 *                Export กลาง (lib/export — มี audit log ให้อัตโนมัติ) · สถานะ SO กลาง (lib/so-status)
 *                ตัวเลือก "แสดงอะไรบ้าง" กลาง (components/report-sections — จำรายคน)
 * กราฟวาดเอง (CSS) — โปรเจกต์ไม่มี chart library เพื่อไม่ให้ bundle บวม (แบบเดียวกับแดชบอร์ดขาย/จัดซื้อ)
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { exportTable } from "@/lib/export";
import { buildSalesMonthlyReportHtml } from "@/lib/sales-monthly-print";
import { printReportHtmlInNewWindow } from "@/components/report";
import { useReportSections, ReportSectionPicker, type ReportSection } from "@/components/report-sections";
import { soStatusLabel, soStatusColor } from "@/lib/so-status";
import type { SalesMonthlyReport, SalesMonthlyRow } from "@/app/api/sales/monthly-report/route";

/** ส่วนต่าง ๆ ของรายงาน — ผู้ใช้ติ๊กเลือกได้ว่าจะโชว์อะไร (มีผลทั้งบนจอและตอนพิมพ์) */
const SECTIONS: readonly ReportSection[] = [
  { key: "kpi",          label: "การ์ดสรุปยอด",          locked: true },
  { key: "daily",        label: "กราฟยอดขายรายวัน",     hint: "เฉพาะบนจอ ไม่ติดไปตอนพิมพ์" },
  { key: "by_customer",  label: "แยกตามลูกค้า" },
  { key: "by_sales",     label: "แยกตามพนักงานขาย" },
  { key: "by_status",    label: "สถานะเอกสาร" },
  { key: "top_products", label: "สินค้าขายดี 10 อันดับ" },
  { key: "rows",         label: "รายการใบขายทั้งเดือน" },
  { key: "items",        label: "รายการสินค้าในแต่ละใบ", on: false, hint: "แตกบรรทัดสินค้าใต้ใบขายแต่ละใบ (ใบยาวขึ้น)" },
];

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
  const { on, toggle, reset } = useReportSections("sales_monthly_sections", SECTIONS);

  useEffect(() => {
    if (!canView) return;
    setLoading(true); setError(null);
    apiFetch(`/api/sales/monthly-report?month=${encodeURIComponent(month)}`).then(r => r.json())
      .then(j => { if (j.error) throw new Error(j.error); setRep(j.data as SalesMonthlyReport); })
      .catch(e => { setRep(null); setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); })
      .finally(() => setLoading(false));
  }, [canView, month]);

  // ---- HTML สำหรับพิมพ์ (สร้างจาก lib/sales-monthly-print) ----
  const printHtml = useMemo(() => (rep ? buildSalesMonthlyReportHtml(rep, on) : ""), [rep, on]);

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
            <ReportSectionPicker sections={SECTIONS} on={on} onToggle={toggle} onReset={reset} />
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
            {on.daily && <Card title="ยอดขายรายวัน" right={
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
            </Card>}

            {/* ===== ลูกค้า / พนักงานขาย ===== */}
            {(on.by_customer || on.by_sales) && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {on.by_customer && (
                  <Card title="แยกตามลูกค้า" right={<span className="text-xs text-slate-400">{rep.by_customer.length} ราย</span>}>
                    <RankRows items={rep.by_customer.slice(0, 10).map(c => ({ name: c.name, sub: c.code, n: c.n, amt: c.amt }))} total={s.amt} color="emerald" />
                  </Card>
                )}
                {on.by_sales && (
                  <Card title="แยกตามพนักงานขาย" right={<span className="text-xs text-slate-400">{rep.by_sales.length} คน</span>}>
                    <RankRows items={rep.by_sales.map(c => ({ name: c.name, n: c.n, amt: c.amt }))} total={s.amt} color="blue" />
                  </Card>
                )}
              </div>
            )}

            {/* ===== สถานะ / สินค้าขายดี ===== */}
            {(on.by_status || on.top_products) && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                {on.by_status && (
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
                )}
                {on.top_products && (
                  <Card title="สินค้าขายดี (10 อันดับ)" className={on.by_status ? "xl:col-span-2" : "xl:col-span-3"}>
                    <RankRows
                      items={rep.top_products.slice(0, 10).map(p => ({
                        name: p.name, sub: p.sku, n: Math.round(p.qty), amt: p.amt, unit: p.unit ?? "ชิ้น",
                      }))}
                      total={rep.top_products.reduce((a, p) => a + p.amt, 0)} unit="ชิ้น" color="violet" />
                  </Card>
                )}
              </div>
            )}

            {/* ===== รายการใบขายทั้งเดือน ===== */}
            {on.rows && <Card title={`รายการใบขายทั้งเดือน (${rep.rows.length} ใบ)`} right={
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
                      <Fragment key={r.id}>
                      <tr className={`hover:bg-slate-50 ${r.status === "cancelled" ? "opacity-50" : ""}`}>
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
                      {/* บรรทัดสินค้าในใบนี้ (เปิด/ปิดได้ที่ปุ่ม "เลือกสิ่งที่จะแสดง") */}
                      {on.items && r.items.map((it, i) => (
                        <tr key={`${r.id}-${i}`} className="bg-slate-50/60">
                          <td />
                          <td colSpan={3} className="px-2 py-1 text-xs text-slate-500">
                            <span className="text-slate-300 mr-1">↳</span>
                            {it.sku && <code className="font-mono text-[11px] text-slate-500 mr-1.5">{it.sku}</code>}
                            {it.name}
                          </td>
                          <td className="px-2 py-1 text-xs text-slate-500 whitespace-nowrap">
                            {it.qty.toLocaleString("th-TH")}{it.unit ? ` ${it.unit}` : ""}
                          </td>
                          <td className="px-2 py-1 text-right font-mono tabular-nums text-[11px] text-slate-400">×{baht(it.unit_price)}</td>
                          <td className="px-2 py-1 text-right font-mono tabular-nums text-[11px] text-slate-500">{baht(it.amount)}</td>
                          <td colSpan={2} />
                        </tr>
                      ))}
                      </Fragment>
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
            </Card>}
          </>
        )}
      </div>
    </PlaygroundShell>
  );
}
