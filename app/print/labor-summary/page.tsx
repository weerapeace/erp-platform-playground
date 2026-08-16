"use client";

/**
 * พิมพ์สรุปค่าแรงรายเดือน แยกตามช่าง — /print/labor-summary?ym=YYYY-MM
 * ข้อมูลชุดเดียวกับมุมมอง "💰 ค่าแรงรายเดือน" ในบอร์ดจ่ายงาน (/api/mo/labor-summary)
 * ของกลาง: ระบบพิมพ์ (buildReportHtml + PrintFrame)
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml, type ReportTemplate } from "@/lib/template";

type Person = {
  name: string; dept: string | null; sub_count: number; qty: number;
  prod_wage: number; piece_count: number; piece_wage: number; total: number; pending: number;
};
type Totals = { qty: number; prod_wage: number; piece_wage: number; total: number; pending: number; sub_count: number };

const num = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const money = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });

const CSS = `
.doc { font-size: 11px; color: #111827; }
.hd { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 3mm; margin-bottom: 3mm; }
.t1 { font-size: 18px; font-weight: 800; }
.t2 { font-size: 10px; color: #6b7280; margin-top: 1mm; }
.no { text-align: right; font-size: 10px; color: #6b7280; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #cbd5e1; padding: 1.6mm 2mm; font-size: 10.5px; }
th { background: #f1f5f9; font-weight: 700; text-align: left; }
td.r, th.r { text-align: right; white-space: nowrap; }
tfoot td { background: #f8fafc; font-weight: 800; }
.warn { color: #b45309; }
.sign { margin-top: 10mm; display: flex; gap: 12mm; }
.sign div { flex: 1; text-align: center; font-size: 10px; color: #6b7280; }
.sign .line { border-top: 1px solid #94a3b8; margin-bottom: 1.5mm; padding-top: 10mm; }
.note { font-size: 9.5px; color: #94a3b8; margin-top: 2mm; }
.empty { text-align: center; color: #94a3b8; padding: 14mm 0; font-size: 12px; }`;

const TEMPLATE: ReportTemplate = {
  paper_size: "A4", orientation: "portrait",
  header_html: `<div class="hd">
    <div><div class="t1">สรุปค่าแรงรายเดือน — แยกตามช่าง</div><div class="t2">เดือน {{ym_label}} · {{people_count}} คน · {{total_qty}} ชิ้น</div></div>
    <div class="no">บอร์ดจ่ายงาน<br/>พิมพ์ {{printed_at}}</div>
  </div>`,
  body_html: `{{#has_rows}}<table>
    <thead><tr><th>ช่าง</th><th>แผนก</th><th class="r">ใบส่งงาน</th><th class="r">ชิ้น</th><th class="r">ค่าแรงผลิต</th><th class="r">งานเหมา</th><th class="r">รวม</th><th class="r">ค้างใส่ค่าแรง</th></tr></thead>
    <tbody>{{#rows}}<tr><td>{{name}}</td><td>{{dept}}</td><td class="r">{{sub_count}}</td><td class="r">{{qty}}</td><td class="r">{{prod_wage}}</td><td class="r">{{piece_wage}}</td><td class="r">{{total}}</td><td class="r warn">{{pending}}</td></tr>{{/rows}}</tbody>
    <tfoot><tr><td colspan="2">รวมทั้งเดือน</td><td class="r">{{t_subs}}</td><td class="r">{{total_qty}}</td><td class="r">{{t_prod}}</td><td class="r">{{t_piece}}</td><td class="r">{{t_total}}</td><td class="r warn">{{t_pending}}</td></tr></tfoot>
  </table>
  <div class="note">ค่าแรงผลิต = ใบส่งงานที่ส่งในเดือนนี้ · งานเหมา = งานเหมาที่กดเสร็จในเดือนนี้ · ช่อง “ค้างใส่ค่าแรง” = ใบที่ยังไม่ลงค่าแรง (ยอดเงินยังไม่รวม)</div>
  <div class="sign"><div><div class="line"></div>ผู้จัดทำ</div><div><div class="line"></div>ผู้ตรวจสอบ</div><div><div class="line"></div>ผู้อนุมัติจ่าย</div></div>{{/has_rows}}
  {{^has_rows}}<div class="empty">เดือนนี้ยังไม่มีใบส่งงาน</div>{{/has_rows}}`,
  footer_html: "", custom_css: CSS,
};

function Inner() {
  const sp = useSearchParams(); const router = useRouter();
  const ym = (sp.get("ym") ?? "").slice(0, 7) || new Date().toISOString().slice(0, 7);
  const [people, setPeople] = useState<Person[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch(`/api/mo/labor-summary?ym=${encodeURIComponent(ym)}`);
        const j = await r.json();
        if (!j.error) { setPeople((j.people ?? []) as Person[]); setTotals((j.totals ?? null) as Totals | null); }
      } catch { /* หน้าพิมพ์ — ไม่มีข้อมูลก็ขึ้นว่าไม่มีรายการ */ }
    })();
  }, [ym]);

  const html = useMemo(() => {
    const [y, m] = ym.split("-").map(Number);
    const ymLabel = new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" });
    return buildReportHtml(TEMPLATE, {
      ym_label: ymLabel, printed_at: new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }),
      people_count: people.length, has_rows: people.length > 0,
      rows: people.map((p) => ({
        name: p.name, dept: p.dept ?? "—", sub_count: num(p.sub_count), qty: num(p.qty),
        prod_wage: money(p.prod_wage), piece_wage: p.piece_wage > 0 ? money(p.piece_wage) : "—",
        total: money(p.total), pending: p.pending > 0 ? `${num(p.pending)} ใบ` : "—",
      })),
      total_qty: num(totals?.qty ?? 0), t_subs: num(totals?.sub_count ?? 0),
      t_prod: money(totals?.prod_wage ?? 0), t_piece: money(totals?.piece_wage ?? 0),
      t_total: money(totals?.total ?? 0), t_pending: (totals?.pending ?? 0) > 0 ? `${num(totals?.pending ?? 0)} ใบ` : "—",
    });
  }, [people, totals, ym]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) { e.preventDefault(); if (html) printReportHtmlInNewWindow(html); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [html]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => router.back()} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="text-sm text-slate-600">🖨️ สรุปค่าแรงรายเดือน · {ym}</span>
        <div className="flex-1" />
        <button onClick={() => printReportHtmlInNewWindow(html)} disabled={!html}
          className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">พิมพ์ / บันทึก PDF</button>
      </div>
      <PrintFrame html={html} />
    </div>
  );
}

export default function LaborSummaryPrintPage() {
  return <Suspense fallback={<div className="p-8 text-slate-400">กำลังโหลด…</div>}><Inner /></Suspense>;
}
