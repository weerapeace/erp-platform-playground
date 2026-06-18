"use client";

/**
 * พิมพ์ "รายการขอซื้อ/เตรียมวัตถุดิบ" — /print/purchase-needs[?types=ผ้า,หนัง]
 * worksheet ไปโกดัง/ผู้ขาย: รหัส/วัตถุดิบ/ต้องซื้อ/หน่วย/ใบสั่งผลิต + ช่องเช็ค ☐ ซื้อแล้ว ☐ เตรียมแล้ว
 * จัดกลุ่มตามประเภท · รองรับเลือกพิมพ์เฉพาะบางประเภท (param types) สำหรับ "พิมพ์แยก group"
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PrintFrame, printReportFrameOrWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import type { PurchaseNeedRow } from "@/app/api/mo/purchase-needs/route";

const fmt = (n: number) => (Math.round(n * 10000) / 10000).toLocaleString("th-TH");

const TEMPLATE: ReportTemplate = {
  paper_size: "A4", orientation: "portrait",
  header_html: `<div class="doc-header"><div class="company-name">หจก.ไอ.เอส.จี. เทรดดิ้ง</div></div>
<div class="doc-title">รายการขอซื้อ / เตรียมวัตถุดิบ</div>
<div class="doc-sub">พิมพ์เมื่อ {{printed_at}} · รวม {{total}} รายการ</div>`,
  body_html: `{{#groups}}
<section class="grp">
  <div class="grp-title">{{type}} <span class="grp-count">({{count}})</span></div>
  <table class="doc-table">
    <thead><tr>
      <th style="width:5%">ลำดับ</th>
      <th style="width:15%">รหัส</th>
      <th style="width:30%">วัตถุดิบ</th>
      <th style="width:10%" class="text-right">ต้องซื้อ</th>
      <th style="width:7%">หน่วย</th>
      <th style="width:17%">ใบสั่งผลิต</th>
      <th style="width:8%" class="text-center">ซื้อแล้ว</th>
      <th style="width:8%" class="text-center">เตรียมแล้ว</th>
    </tr></thead>
    <tbody>
      {{#rows}}
      <tr>
        <td class="text-center">{{idx}}</td>
        <td class="code-cell">{{code}}</td>
        <td>{{name}}</td>
        <td class="text-right">{{qty}}</td>
        <td class="text-center">{{uom}}</td>
        <td class="mos">{{mos_text}}</td>
        <td class="text-center"><span class="chk"></span></td>
        <td class="text-center"><span class="chk"></span></td>
      </tr>
      {{/rows}}
    </tbody>
  </table>
</section>
{{/groups}}`,
  footer_html: "",
  custom_css: `
.doc { font-size: 10.5px; color: #111827; }
.doc-header { text-align: center; }
.company-name { font-size: 11px; font-weight: 700; color: #475569; }
.doc-title { text-align: center; font-size: 20px; font-weight: 800; margin: 2mm 0 1mm; }
.doc-sub { text-align: center; font-size: 10px; color: #64748b; margin-bottom: 4mm; }
.grp { margin-bottom: 4mm; page-break-inside: auto; }
.grp-title { font-size: 12px; font-weight: 800; background: #f1f5f9; padding: 1.2mm 2mm; border: 1px solid #cbd5e1; }
.grp-count { color: #64748b; font-weight: 500; }
.doc-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.doc-table th, .doc-table td { border: 1px solid #94a3b8; padding: 1mm 1.2mm; vertical-align: middle; word-break: break-word; }
.doc-table th { background: #f8fafc; font-weight: 700; font-size: 10px; }
.doc-table tr { page-break-inside: avoid; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.code-cell { font-family: ui-monospace, Consolas, monospace; font-size: 8.5px; word-break: break-all; color: #334155; }
.mos { font-size: 8.5px; color: #475569; }
.chk { display: inline-block; width: 4mm; height: 4mm; border: 1.2px solid #334155; border-radius: 1px; }
@media print { .doc { padding: 10mm 9mm !important; } .doc-title { font-size: 17px; } }`,
};

function PurchaseNeedsPrintInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const typesFilter = useMemo(() => (sp.get("types") ?? "").split(",").map((s) => s.trim()).filter(Boolean), [sp]);

  const [rows, setRows] = useState<PurchaseNeedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/mo/purchase-needs").then((r) => r.json())
      .then((j) => { if (j.error) throw new Error(j.error); setRows((j.data ?? []) as PurchaseNeedRow[]); })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
  }, []);

  const html = useMemo(() => {
    if (!rows) return "";
    const filtered = typesFilter.length ? rows.filter((r) => typesFilter.includes(r.material_type || "ไม่ระบุประเภท")) : rows;
    const byType = new Map<string, PurchaseNeedRow[]>();
    for (const r of filtered) { const t = r.material_type || "ไม่ระบุประเภท"; (byType.get(t) ?? byType.set(t, []).get(t)!).push(r); }
    const groups = [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0], "th")).map(([type, rs]) => ({
      type, count: rs.length,
      rows: rs.sort((a, b) => (a.component_name ?? "").localeCompare(b.component_name ?? "", "th")).map((r, i) => ({
        idx: i + 1, code: r.component_sku || "-", name: r.component_name ?? "", qty: fmt(r.total_remaining), uom: r.uom ?? "",
        mos_text: r.mos.map((m) => `${m.product_label || m.mo_no} (${fmt(m.needed)})`).join(", "),
      })),
    }));
    return buildReportHtml(TEMPLATE, { printed_at: new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }), total: filtered.length, groups });
  }, [rows, typesFilter]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => router.back()} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="text-sm text-slate-600">🖨️ พิมพ์รายการขอซื้อ/เตรียม{typesFilter.length ? ` · ${typesFilter.join(", ")}` : ""}</span>
        <div className="flex-1" />
        <button onClick={printReportFrameOrWindow} disabled={!html} className="h-9 rounded-lg bg-rose-600 px-5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">พิมพ์ / บันทึก PDF</button>
      </div>
      <div className="px-4 py-6">
        {error ? <div className="py-20 text-center text-red-500">⚠ {error}</div>
          : rows === null ? <div className="py-20 text-center text-slate-400">กำลังโหลด…</div>
          : <PrintFrame html={html} />}
      </div>
    </div>
  );
}

export default function PurchaseNeedsPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><PurchaseNeedsPrintInner /></Suspense>;
}
