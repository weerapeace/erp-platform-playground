"use client";

/**
 * พิมพ์ "รายการขอซื้อ/เตรียมวัตถุดิบ" — /print/purchase-needs
 *   ?types=ผ้า,หนัง                         → จัดกลุ่มตามประเภทอย่างเดียว (1 ชั้น)
 *   ?mode=group[&groups=กลุ่มA,กลุ่มB]       → จัดกลุ่มตามกลุ่ม MO แล้วแยกประเภทในกลุ่ม (2 ชั้น)
 * worksheet ไปโกดัง/ผู้ขาย: รหัส/วัตถุดิบ/ต้องซื้อ/หน่วย/ใบสั่งผลิต + ช่องเช็ค ☐ ซื้อแล้ว ☐ เตรียมแล้ว
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PrintFrame, printReportFrameOrWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import type { PurchaseNeedRow } from "@/app/api/mo/purchase-needs/route";

const fmt = (n: number) => (Math.round(n * 10000) / 10000).toLocaleString("th-TH");
const r4 = (n: number) => Math.round(n * 10000) / 10000;

const TABLE_HTML = `<table class="doc-table">
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
  </table>`;

const SHARED_CSS = `
.doc { font-size: 10.5px; color: #111827; }
.doc-header { text-align: center; }
.company-name { font-size: 11px; font-weight: 700; color: #475569; }
.doc-title { text-align: center; font-size: 20px; font-weight: 800; margin: 2mm 0 1mm; }
.doc-sub { text-align: center; font-size: 10px; color: #64748b; margin-bottom: 4mm; }
.grp { margin-bottom: 4mm; page-break-inside: auto; }
.grp-title { font-size: 12px; font-weight: 800; background: #f1f5f9; padding: 1.2mm 2mm; border: 1px solid #cbd5e1; break-after: avoid; page-break-after: avoid; }
.grp-count { color: #64748b; font-weight: 500; }
.bucket-title { font-size: 13px; font-weight: 800; color: #5b21b6; background: #f5f3ff; padding: 1.5mm 2mm; border: 1px solid #c4b5fd; margin: 2mm 0 1.5mm; break-after: avoid; page-break-after: avoid; }
.bucket { margin-bottom: 5mm; }
.doc-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 2mm; }
.doc-table th, .doc-table td { border: 1px solid #94a3b8; padding: 1mm 1.2mm; vertical-align: middle; word-break: break-word; }
.doc-table th { background: #f8fafc; font-weight: 700; font-size: 10px; }
.doc-table tr { page-break-inside: avoid; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.code-cell { font-family: ui-monospace, Consolas, monospace; font-size: 8.5px; word-break: break-all; color: #334155; }
.mos { font-size: 8.5px; color: #475569; }
.chk { display: inline-block; width: 4mm; height: 4mm; border: 1.2px solid #334155; border-radius: 1px; }
@media print { .doc { padding: 10mm 9mm !important; } .doc-title { font-size: 17px; } }`;

// โหมดตามประเภท (1 ชั้น)
const TEMPLATE: ReportTemplate = {
  paper_size: "A4", orientation: "portrait",
  header_html: `<div class="doc-header"><div class="company-name">หจก.ไอ.เอส.จี. เทรดดิ้ง</div></div>
<div class="doc-title">รายการขอซื้อ / เตรียมวัตถุดิบ</div>
<div class="doc-sub">พิมพ์เมื่อ {{printed_at}} · รวม {{total}} รายการ</div>`,
  body_html: `{{#groups}}
<section class="grp">
  <div class="grp-title">{{type}} <span class="grp-count">({{count}})</span></div>
  ${TABLE_HTML}
</section>
{{/groups}}`,
  footer_html: "",
  custom_css: SHARED_CSS,
};

// โหมดตามกลุ่ม (2 ชั้น): กลุ่ม MO → ประเภท → รายการ
const TEMPLATE_GROUP: ReportTemplate = {
  paper_size: "A4", orientation: "portrait",
  header_html: `<div class="doc-header"><div class="company-name">หจก.ไอ.เอส.จี. เทรดดิ้ง</div></div>
<div class="doc-title">รายการขอซื้อ / เตรียมวัตถุดิบ (ตามกลุ่ม)</div>
<div class="doc-sub">พิมพ์เมื่อ {{printed_at}} · รวม {{total}} รายการ</div>`,
  body_html: `{{#buckets}}
<section class="bucket">
  <div class="bucket-title">🗂 {{name}} <span class="grp-count">({{mo_count}} ใบสั่งผลิต)</span></div>
  {{#types}}
  <div class="grp">
    <div class="grp-title">{{type}} <span class="grp-count">({{count}})</span></div>
    ${TABLE_HTML}
  </div>
  {{/types}}
</section>
{{/buckets}}`,
  footer_html: "",
  custom_css: SHARED_CSS,
};

type GroupDef = { name: string; mo_nos: string[] };

// แปลง row → record สำหรับเทมเพลต
const rowRecord = (r: PurchaseNeedRow, i: number) => ({
  idx: i + 1, code: r.component_sku || "-", name: r.component_name ?? "", qty: fmt(r.total_remaining), uom: r.uom ?? "",
  mos_text: r.mos.map((m) => `${m.product_label || m.mo_no} (${fmt(m.needed)})`).join(", "),
});

// จัดกลุ่มชุด row ตามประเภท → [{ type, count, rows }]
const groupByType = (rs: PurchaseNeedRow[]) => {
  const byType = new Map<string, PurchaseNeedRow[]>();
  for (const r of rs) { const t = r.material_type || "ไม่ระบุประเภท"; (byType.get(t) ?? byType.set(t, []).get(t)!).push(r); }
  return [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0], "th")).map(([type, list]) => ({
    type, count: list.length,
    rows: list.sort((a, b) => (a.component_name ?? "").localeCompare(b.component_name ?? "", "th")).map(rowRecord),
  }));
};

function PurchaseNeedsPrintInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const isGroupMode = sp.get("mode") === "group";
  const typesFilter = useMemo(() => (sp.get("types") ?? "").split(",").map((s) => s.trim()).filter(Boolean), [sp]);
  const groupsFilter = useMemo(() => (sp.get("groups") ?? "").split(",").map((s) => s.trim()).filter(Boolean), [sp]);

  const [rows, setRows] = useState<PurchaseNeedRow[] | null>(null);
  const [moGroups, setMoGroups] = useState<GroupDef[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/mo/purchase-needs").then((r) => r.json()),
      isGroupMode ? apiFetch("/api/mo/groups").then((r) => r.json()).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    ])
      .then(([jr, jg]) => {
        if (jr.error) throw new Error(jr.error);
        setRows((jr.data ?? []) as PurchaseNeedRow[]);
        setMoGroups(((jg.data ?? []) as { name: string; mo_nos: unknown }[]).map((g) => ({ name: g.name, mo_nos: (Array.isArray(g.mo_nos) ? g.mo_nos : []) as string[] })));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
  }, [isGroupMode]);

  const html = useMemo(() => {
    if (!rows) return "";
    const printed_at = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

    if (isGroupMode) {
      const nameOf = (moNo: string) => moGroups.find((g) => g.mo_nos.includes(moNo))?.name ?? "— ยังไม่จับกลุ่ม —";
      // ถัง: ชื่อกลุ่ม → set ของ mo_no ที่โผล่ในข้อมูลจริง
      const allMoNos = new Set<string>();
      for (const r of rows) for (const m of r.mos) allMoNos.add(m.mo_no);
      const bucketMos = new Map<string, Set<string>>();
      for (const mo of allMoNos) { const n = nameOf(mo); (bucketMos.get(n) ?? bucketMos.set(n, new Set()).get(n)!).add(mo); }
      let entries = [...bucketMos.entries()];
      if (groupsFilter.length) entries = entries.filter(([n]) => groupsFilter.includes(n));
      entries.sort((a, b) => a[0].localeCompare(b[0], "th"));

      let total = 0;
      const buckets = entries.map(([name, moSet]) => {
        const grows = rows.map((r) => {
          const mos = r.mos.filter((m) => moSet.has(m.mo_no));
          if (mos.length === 0) return null;
          return { ...r, mos, total_remaining: r4(mos.reduce((n, m) => n + m.needed, 0)) };
        }).filter((x): x is PurchaseNeedRow => x !== null);
        const types = groupByType(grows);
        total += grows.length;
        return { name, mo_count: moSet.size, types };
      });
      return buildReportHtml(TEMPLATE_GROUP, { printed_at, total, buckets });
    }

    const filtered = typesFilter.length ? rows.filter((r) => typesFilter.includes(r.material_type || "ไม่ระบุประเภท")) : rows;
    return buildReportHtml(TEMPLATE, { printed_at, total: filtered.length, groups: groupByType(filtered) });
  }, [rows, moGroups, isGroupMode, typesFilter, groupsFilter]);

  const subtitle = isGroupMode
    ? `ตามกลุ่ม${groupsFilter.length ? ` · ${groupsFilter.join(", ")}` : " · ทุกกลุ่ม"}`
    : typesFilter.length ? ` · ${typesFilter.join(", ")}` : "";

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => router.back()} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="text-sm text-slate-600">🖨️ พิมพ์รายการขอซื้อ/เตรียม{subtitle ? ` · ${subtitle}` : ""}</span>
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
