"use client";

/**
 * รายงานภาษีขาย — /sales/tax-report
 *   เลือกบริษัท (หัวบิล) + เดือน → ใบกำกับภาษีทุกใบของเดือน เรียงตามเลขที่ (รวมใบยกเลิก ยอด 0)
 *   + ใบลดหนี้เป็นบรรทัดติดลบ · ยอดสุทธิสำหรับกรอก ภ.พ.30 · พิมพ์ A4 แนวนอน / Excel
 *   + ตรวจให้: เลขใบกำกับขาด/ซ้ำ · ใบร่างที่มีเลขแล้ว · ลูกค้าไม่มีเลขผู้เสียภาษี
 *
 * ของกลางที่ใช้: PlaygroundShell · permission (so.view) · MonthNav (components/month-nav) · MiniTable
 *                ระบบพิมพ์กลาง (lib/sales-tax-report-print → buildReportHtml) · Export กลาง (lib/export — audit ให้อัตโนมัติ)
 *                ตรรกะคิดเลขอยู่ lib/sales-tax-report.ts (API/หน้าจอ/พิมพ์ ใช้ชุดเดียวกัน)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { exportTable } from "@/lib/export";
import { printReportHtmlInNewWindow } from "@/components/report";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { MonthNav } from "@/components/month-nav";
import { monthLabelTh, thisMonth } from "@/lib/month";
import { buildSalesTaxReportHtml } from "@/lib/sales-tax-report-print";
import { branchLabel, type SalesTaxReport, type SalesTaxRow } from "@/lib/sales-tax-report";

const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

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

function Kpi({ label, value, sub, tone = "slate" }: {
  label: string; value: string; sub?: React.ReactNode; tone?: "slate" | "blue" | "amber" | "green" | "rose";
}) {
  const tones: Record<string, string> = {
    slate: "from-slate-50 to-white border-slate-200 text-slate-800",
    blue:  "from-blue-50 to-white border-blue-200 text-blue-700",
    amber: "from-amber-50 to-white border-amber-200 text-amber-700",
    green: "from-emerald-50 to-white border-emerald-200 text-emerald-700",
    rose:  "from-rose-50 to-white border-rose-200 text-rose-700",
  };
  return (
    <div className={`bg-gradient-to-br border rounded-xl p-4 ${tones[tone]}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-bold mt-1 font-mono tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function SalesTaxReportPage() {
  const canView = usePermission("so.view");
  const { can } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [companyId, setCompanyId] = useState<string | null>(null);   // null = ให้ API เลือกบริษัทตั้งต้น
  const [rep, setRep] = useState<SalesTaxReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) return;
    setLoading(true); setError(null);
    const q = new URLSearchParams({ month });
    if (companyId) q.set("company", companyId);
    apiFetch(`/api/sales/tax-report?${q.toString()}`).then(r => r.json())
      .then(j => {
        if (j.error) throw new Error(j.error);
        const data = j.data as SalesTaxReport;
        setRep(data);
        if (!companyId && data.company) setCompanyId(data.company.id);
      })
      .catch(e => { setRep(null); setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); })
      .finally(() => setLoading(false));
  }, [canView, month, companyId]);

  const printHtml = useMemo(() => (rep ? buildSalesTaxReportHtml(rep) : ""), [rep]);

  const doExport = useCallback(async () => {
    if (!rep) return;
    try {
      const rows = rep.rows.map((r, i) => ({ ...r, idx: i + 1 }));
      await exportTable({
        format: "excel", filename: `sales-tax-report-${rep.company?.code ?? "all"}-${rep.month}`,
        rows: rows as unknown as Record<string, unknown>[],
        columns: [
          { key: "idx", header: "ลำดับ" },
          { key: "doc_date", header: "วันที่", format: v => dmy(v as string) },
          { key: "doc_no", header: "เลขที่ใบกำกับภาษี / ใบลดหนี้" },
          { key: "ref_no", header: "อ้างอิง", format: v => (v ? String(v) : "") },
          { key: "customer_name", header: "ชื่อผู้ซื้อ" },
          { key: "customer_tax_id", header: "เลขประจำตัวผู้เสียภาษี" },
          { key: "customer_branch", header: "สถานประกอบการ" },
          { key: "taxable", header: "มูลค่าก่อน VAT" },
          { key: "vat", header: "ภาษีมูลค่าเพิ่ม" },
          { key: "total", header: "รวม" },
          { key: "remark", header: "หมายเหตุ" },
        ],
        context: { entityType: "erp_playground_so", mode: "filtered_all", totalRows: rows.length, filterDesc: `รายงานภาษีขาย ${rep.company?.code ?? ""} ${rep.month}` },
        // can() ของ useAuth รับ Permission (union) — คอลัมน์รายงานนี้ไม่ได้ล็อกสิทธิ์รายฟิลด์ จึงห่อเป็น (string)=>boolean
        can: (perm: string) => can(perm as Parameters<typeof can>[0]),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
    }
  }, [rep, can]);

  const columns = useMemo<MiniColumn<SalesTaxRow & { idx: number }>[]>(() => [
    { key: "idx", header: "#", width: "3rem", align: "center", cell: r => <span className="text-xs text-slate-400">{r.idx}</span> },
    { key: "date", header: "วันที่", width: "5.5rem", sortValue: r => r.doc_date ?? "", cell: r => <span className="text-xs text-slate-500 whitespace-nowrap">{dmy(r.doc_date)}</span> },
    { key: "doc_no", header: "เลขที่ใบกำกับ", width: "9.5rem", sortValue: r => r.doc_no, cell: r => (
      <div>
        <code className={`font-mono text-[11px] ${r.cancelled ? "text-slate-400 line-through" : r.kind === "credit_note" ? "text-orange-700" : "text-slate-700"}`}>{r.doc_no}</code>
        {r.ref_no && <div className="text-[10px] text-slate-400">{r.kind === "credit_note" ? "อ้าง " : "SO "}{r.ref_no}</div>}
      </div>
    ) },
    { key: "customer", header: "ผู้ซื้อ", width: "1.6fr", sortValue: r => r.customer_name, cell: r => (
      <span className={`text-slate-700 ${r.cancelled ? "opacity-50" : ""}`} title={r.customer_name}>{r.customer_name}</span>
    ) },
    { key: "tax_id", header: "เลขผู้เสียภาษี", width: "8.5rem", cell: r => (
      r.customer_tax_id
        ? <code className="font-mono text-[11px] text-slate-600">{r.customer_tax_id}</code>
        : r.cancelled ? <span className="text-slate-300">—</span> : <span className="text-[11px] text-amber-600">⚠ ไม่มีในทะเบียน</span>
    ) },
    { key: "branch", header: "สถานประกอบการ", width: "7.5rem", cell: r => <span className="text-xs text-slate-500">{r.customer_branch || "—"}</span> },
    { key: "taxable", header: "มูลค่าก่อน VAT", width: "7.5rem", align: "right", sortValue: r => r.taxable, cell: r => (
      <span className={`font-mono tabular-nums ${r.cancelled ? "text-slate-300" : r.taxable < 0 ? "text-orange-700" : "text-slate-800"}`}>{r.cancelled ? "-" : money(r.taxable)}</span>
    ) },
    { key: "vat", header: "VAT", width: "6rem", align: "right", sortValue: r => r.vat, cell: r => (
      <span className={`font-mono tabular-nums text-xs ${r.cancelled ? "text-slate-300" : r.vat < 0 ? "text-orange-700" : "text-slate-600"}`}>{r.cancelled ? "-" : money(r.vat)}</span>
    ) },
    { key: "remark", header: "หมายเหตุ", width: "1.2fr", cell: r => (
      <span className={`text-xs ${r.cancelled ? "text-slate-400" : r.draft ? "text-amber-600 font-medium" : "text-slate-500"}`}>{r.remark}</span>
    ) },
  ], []);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  const s = rep?.summary;
  const co = rep?.company;
  const issues = rep?.issues;
  const warnings: React.ReactNode[] = [];
  if (issues?.duplicates.length) warnings.push(<>เลขใบกำกับ<b>ซ้ำ</b>: {issues.duplicates.join(", ")} — ต้องแก้ให้ไม่ซ้ำก่อนยื่น (ปุ่ม 🔢 แก้เลขที่ในหน้าใบขาย)</>);
  if (issues?.gaps.length) warnings.push(<>เลขใบกำกับ<b>ขาดหาย</b>: {issues.gaps.join(", ")} — ตรวจว่ามีใบไหนลงวันที่ผิดเดือน หรือถูกลบไป</>);
  if (s?.draft_n) warnings.push(<>มี<b>ใบร่าง {s.draft_n} ใบ</b>ที่มีเลขใบกำกับแล้ว (มูลค่า {money(s.draft_taxable)} · VAT {money(s.draft_vat)}) — นับรวมในยอดอยู่ ควรกด "ยืนยัน" หรือ "ยกเลิก" ก่อนยื่นภาษี</>);
  if (s?.missing_tax_id_n) warnings.push(<>ลูกค้า<b>ไม่มีเลขผู้เสียภาษีในทะเบียน</b> {s.missing_tax_id_n} ใบ — ไปเติมที่ ลูกค้า (Customers) แล้วกลับมาโหลดใหม่</>);
  const tableRows = (rep?.rows ?? []).map((r, i) => ({ ...r, idx: i + 1 }));

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* ===== หัวเรื่อง + ตัวเลือก ===== */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">🧾 รายงานภาษีขาย</h1>
            <p className="text-sm text-slate-500">ใบกำกับภาษีทุกใบของเดือน เรียงตามเลขที่ + หักใบลดหนี้ · ยอดสุทธิสำหรับกรอก ภ.พ.30 · พิมพ์ A4 / Excel ส่งบัญชี</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {rep && rep.companies.length > 1 && (
              <select value={companyId ?? ""} onChange={e => setCompanyId(e.target.value || null)}
                className="h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white" aria-label="บริษัทผู้ออกใบกำกับ">
                {rep.companies.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name_th}</option>)}
              </select>
            )}
            <MonthNav value={month} onChange={setMonth} />
            <button onClick={() => printHtml && printReportHtmlInNewWindow(printHtml)} disabled={!printHtml}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">🖨 พิมพ์ / PDF</button>
            <button onClick={doExport} disabled={!rep?.rows.length}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50">⬇ Excel</button>
            <Link href="/sales/monthly" className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">📈 สรุปรายเดือน</Link>
            <Link href="/credit-notes" className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">🧾➖ ใบลดหนี้</Link>
          </div>
        </div>

        {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        {loading || !rep || !s ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : !co ? (
          <Card>
            <div className="py-16 text-center">
              <div className="text-3xl mb-2">🏢</div>
              <div className="text-slate-600 font-medium">ยังไม่มีทะเบียนบริษัท (หัวบิล)</div>
              <div className="text-sm text-slate-400 mt-1">ไปเพิ่มที่ <Link href="/admin/companies" className="underline">ตั้งค่า · ทะเบียนบริษัท</Link> ก่อน</div>
            </div>
          </Card>
        ) : (
          <>
            {/* ===== ผู้ประกอบการ + เดือนภาษี ===== */}
            <Card>
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div><span className="text-slate-400 text-xs block">ผู้ประกอบการ</span><span className="font-semibold text-slate-800">{co.name_th}</span></div>
                <div><span className="text-slate-400 text-xs block">เลขประจำตัวผู้เสียภาษี</span><code className="font-mono text-slate-700">{co.tax_id || "—"}</code></div>
                <div><span className="text-slate-400 text-xs block">สถานประกอบการ</span><span className="text-slate-700">{branchLabel(co.tax_branch, !!co.tax_id) || "สำนักงานใหญ่"}</span></div>
                <div><span className="text-slate-400 text-xs block">เดือนภาษี</span><span className="font-semibold text-slate-800">{monthLabelTh(month)}</span></div>
              </div>
            </Card>

            {/* ===== KPI ===== */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi tone="blue" label="ใบกำกับภาษี (ไม่รวมยกเลิก)" value={`${s.invoice_n} ใบ`}
                sub={<>{s.cancelled_n > 0 && <>ยกเลิก {s.cancelled_n} ใบ · </>}{s.draft_n > 0 && <span className="text-amber-600">ร่าง {s.draft_n} ใบ · </span>}{s.no_vat_n > 0 && <>บิลไม่มี VAT {s.no_vat_n} ใบ (ไม่อยู่ในรายงาน)</>}</>} />
              <Kpi tone="slate" label="มูลค่าสินค้า/บริการ (ก่อน VAT)" value={`฿${money(s.invoice_taxable)}`}
                sub={s.cn_n > 0 ? <>หักใบลดหนี้ {s.cn_n} ใบ −฿{money(s.cn_taxable)}</> : "ไม่มีใบลดหนี้"} />
              <Kpi tone="amber" label="ภาษีขาย (VAT)" value={`฿${money(s.invoice_vat)}`}
                sub={s.cn_n > 0 ? <>หักใบลดหนี้ −฿{money(s.cn_vat)}</> : undefined} />
              <Kpi tone="green" label="ยอดสุทธิ (กรอก ภ.พ.30)" value={`฿${money(s.net_vat)}`}
                sub={<>มูลค่าสุทธิ ฿{money(s.net_taxable)} · รวม ฿{money(s.net_total)}</>} />
            </div>

            {/* ===== คำเตือนก่อนยื่น (บนจอเท่านั้น ไม่ติดไปตอนพิมพ์) ===== */}
            {warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 space-y-1">
                <div className="font-semibold">⚠️ ตรวจก่อนยื่นภาษี</div>
                <ul className="list-disc pl-5 space-y-0.5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}

            {/* ===== ตารางรายงาน ===== */}
            {rep.rows.length === 0 ? (
              <Card>
                <div className="py-16 text-center">
                  <div className="text-3xl mb-2">🗓️</div>
                  <div className="text-slate-600 font-medium">เดือน {monthLabelTh(month)} ยังไม่มีใบกำกับภาษีของ {co.code}</div>
                  <div className="text-sm text-slate-400 mt-1">ลองเลือกเดือนอื่น หรือเปลี่ยนบริษัท{s.no_vat_n > 0 && <> · เดือนนี้มีบิลไม่มี VAT {s.no_vat_n} ใบ ซึ่งไม่อยู่ในรายงานภาษีขาย</>}</div>
                </div>
              </Card>
            ) : (
              <MiniTable
                title={`รายการใบกำกับภาษี · ${co.code} · ${monthLabelTh(month)}`}
                rows={tableRows}
                columns={columns}
                rowKey={r => r.id}
                countUnit="รายการ"
                searchText={r => `${r.doc_no} ${r.ref_no ?? ""} ${r.customer_name} ${r.customer_tax_id}`}
                searchPlaceholder="ค้นเลขที่ / ชื่อลูกค้า / เลขผู้เสียภาษี"
                dense
                footnote={
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                    <div className="flex justify-between bg-slate-50 rounded-lg px-3 py-2">
                      <span className="text-slate-500">รวมใบกำกับ ({s.invoice_n} ใบ)</span>
                      <span className="font-mono tabular-nums">{money(s.invoice_taxable)} <span className="text-slate-400">/ VAT</span> {money(s.invoice_vat)}</span>
                    </div>
                    <div className="flex justify-between bg-orange-50 rounded-lg px-3 py-2">
                      <span className="text-slate-500">หัก ใบลดหนี้ ({s.cn_n} ใบ)</span>
                      <span className="font-mono tabular-nums text-orange-700">−{money(s.cn_taxable)} <span className="text-slate-400">/ VAT</span> −{money(s.cn_vat)}</span>
                    </div>
                    <div className="flex justify-between bg-emerald-50 rounded-lg px-3 py-2 font-semibold">
                      <span className="text-slate-700">ยอดสุทธิ</span>
                      <span className="font-mono tabular-nums text-emerald-800">{money(s.net_taxable)} <span className="text-slate-400 font-normal">/ VAT</span> {money(s.net_vat)}</span>
                    </div>
                  </div>
                }
              />
            )}
          </>
        )}
      </div>
    </PlaygroundShell>
  );
}
