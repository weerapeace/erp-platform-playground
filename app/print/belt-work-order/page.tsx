"use client";

/**
 * พิมพ์ "ใบงานเข็มขัด" — /print/belt-work-order?mos=MO-2026-00069,MO-2026-00070
 * รวมหลายใบสั่งผลิต (MO) รุ่นเดียวกัน → ตารางไซส์รวม + สเปก (ดึงจาก product-spec)
 * ของกลาง: ระบบพิมพ์ (buildReportHtml + PrintFrame) · A4 แนวตั้ง
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import type { BeltWorkOrder } from "@/app/api/mo/belt-work-order/route";
import type { ProductSpec } from "@/app/api/product-spec/route";
import { buildBeltDiagramSvg } from "@/lib/belt-diagram";

const TEMPLATE: ReportTemplate = {
  paper_size: "A4",
  orientation: "portrait",
  header_html: `<div class="bw-head">
    <div>
      <div class="bw-title">ใบงานผลิตเข็มขัด</div>
      <div class="bw-sub">รวมใบสั่งผลิต {{mo_count}} ใบ (สเปกเดียวกัน)</div>
    </div>
    <div class="bw-no">
      <div><span class="k">ใบงานที่</span> {{mos_text}}</div>
      <div class="bw-sub">พิมพ์ {{printed_at}}</div>
    </div>
  </div>`,
  body_html: `<table class="bw-meta">
    <tr><td class="k">แบรนด์</td><td class="v">{{brand}}</td><td class="k">วันที่สั่ง</td><td class="v">{{order_date}}</td></tr>
    <tr><td class="k">รุ่น</td><td class="v">{{model}}</td><td class="k">กำหนดส่ง</td><td class="v">{{due_text}}</td></tr>
    {{#detail}}<tr><td class="k">รายละเอียด</td><td class="v" colspan="3">{{detail}}</td></tr>{{/detail}}
  </table>
  {{#warnings}}<div class="bw-warn">⚠ {{value}}</div>{{/warnings}}
  <div class="bw-section">จำนวนต่อไซส์</div>
  <table class="bw-size">
    <thead><tr><th class="lcol">หนัง / สี</th>{{#sizes}}<th>{{label}}</th>{{/sizes}}<th class="sum">รวม</th></tr></thead>
    <tbody>
      {{#rows}}<tr><td class="lcol">{{label}} <span class="mo">· {{mo_short}}</span></td>{{#cells}}<td>{{v}}</td>{{/cells}}<td class="sum">{{total}}</td></tr>{{/rows}}
      <tr class="trow"><td class="lcol">รวมทุก MO</td>{{#total_cells}}<td>{{v}}</td>{{/total_cells}}<td class="sum">{{grand}}</td></tr>
    </tbody>
  </table>
  {{#has_spec}}<div class="bw-section">สเปก</div>
  <table class="bw-spec">{{#specs}}<tr><td class="k">{{label}}</td><td class="v">{{value}}</td></tr>{{/specs}}</table>{{/has_spec}}
  <div class="bw-section">รูปประกอบ (จากสเปก)</div>
  <div class="bw-belt">{{{belt_svg}}}</div>`,
  footer_html: "",
  custom_css: `
.doc { font-size: 11px; color: #111827; }
.bw-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 3mm; margin-bottom: 3mm; }
.bw-title { font-size: 18px; font-weight: 800; }
.bw-sub { font-size: 10px; color: #6b7280; }
.bw-no { text-align: right; font-size: 11px; }
.k { color: #6b7280; }
.bw-meta { width: 100%; border-collapse: collapse; margin-bottom: 3mm; }
.bw-meta td { padding: 1mm 2mm; vertical-align: top; }
.bw-meta td.k { width: 18mm; white-space: nowrap; }
.bw-meta td.v { font-weight: 600; }
.bw-warn { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; font-size: 10px; padding: 1.5mm 2mm; border-radius: 2px; margin-bottom: 2mm; }
.bw-section { font-size: 12px; font-weight: 800; margin: 3mm 0 1.5mm; }
.bw-size { width: 100%; border-collapse: collapse; text-align: center; margin-bottom: 4mm; }
.bw-size th, .bw-size td { border: 1px solid #94a3b8; padding: 1.2mm; font-size: 10.5px; }
.bw-size th { background: #f1f5f9; font-weight: 700; }
.bw-size .lcol { text-align: left; }
.bw-size .sum { background: #f8fafc; font-weight: 700; }
.bw-size .trow td { background: #eef2ff; font-weight: 800; }
.bw-size .mo { color: #94a3b8; font-size: 9px; }
.bw-spec { width: 100%; border-collapse: collapse; }
.bw-spec td { padding: 1mm 2mm; border-bottom: 1px solid #e5e7eb; }
.bw-spec td.k { width: 35mm; white-space: nowrap; }
.bw-belt { margin-top: 2mm; border: 1px solid #e5e7eb; border-radius: 4px; padding: 3mm; }
.bw-belt svg { width: 100%; height: auto; }
@media print { .doc { padding: 12mm 12mm !important; } }`,
};

const FMT_OPT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };
const fmtDate = (d: string) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString("th-TH", FMT_OPT); };

function BeltWorkOrderInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const mos = useMemo(() => (sp.get("mos") ?? "").split(",").map((s) => s.trim()).filter(Boolean), [sp]);

  const [bw, setBw] = useState<BeltWorkOrder | null>(null);
  const [spec, setSpec] = useState<ProductSpec | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mos.length) { setError("ไม่ได้เลือกใบสั่งผลิต"); return; }
    let on = true;
    apiFetch(`/api/mo/belt-work-order?mos=${encodeURIComponent(mos.join(","))}`)
      .then((r) => r.json())
      .then(async (data: BeltWorkOrder) => {
        if (!on) return;
        if (data.error) throw new Error(data.error);
        setBw(data);
        const firstSku = data.rows[0]?.product_sku;
        if (firstSku) {
          const s = await apiFetch(`/api/product-spec?sku=${encodeURIComponent(firstSku)}`).then((r) => r.json()).catch(() => null);
          if (on && s && !s.error) setSpec(s as ProductSpec);
        }
      })
      .catch((e) => { if (on) setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); });
    return () => { on = false; };
  }, [mos]);

  const html = useMemo(() => {
    if (!bw) return "";
    const sizes = bw.sizes;
    const specFields = spec ? [...spec.model_attrs, ...spec.legacy] : [];
    const detail = spec?.parent?.work_instruction_notes || spec?.parent?.size_summary || "";
    const data = {
      mo_count: bw.mos.length,
      mos_text: bw.mos.join(", "),
      printed_at: new Date().toLocaleDateString("th-TH", FMT_OPT),
      order_date: new Date().toLocaleDateString("th-TH", FMT_OPT),
      brand: bw.brand || "—",
      model: bw.parent_name || bw.parent_code || "—",
      due_text: bw.due_dates.length ? bw.due_dates.map(fmtDate).join(", ") : "—",
      detail,
      warnings: bw.warnings,
      sizes: sizes.map((label) => ({ label })),
      rows: bw.rows.map((r) => ({
        label: r.label,
        mo_short: r.mo_no.split("-").pop() || r.mo_no,
        total: r.total,
        cells: sizes.map((s) => ({ v: r.by_size[s] || "" })),
      })),
      total_cells: sizes.map((s) => ({ v: bw.totals_by_size[s] || 0 })),
      grand: bw.grand_total,
      has_spec: specFields.length > 0,
      specs: specFields.map((f) => ({ label: f.label, value: f.value })),
      // เฟส 3a: รูปวาดจากพารามิเตอร์ (ค่า default มาตรฐาน + แบรนด์) — เฟส 3b จะป้อนตัวเลขจริงจากช่องสเปก
      belt_svg: buildBeltDiagramSvg({ brandText: bw.brand || bw.parent_name || bw.parent_code || "", tailShape: "duckbill" }),
    };
    return buildReportHtml(TEMPLATE, data);
  }, [bw, spec]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => router.back()} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="text-sm text-slate-600">🖨️ ใบงานเข็มขัด · {mos.length} ใบสั่งผลิต</span>
        <div className="flex-1" />
        <button onClick={() => printReportHtmlInNewWindow(html)} disabled={!html} className="h-9 rounded-lg bg-amber-600 px-5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">พิมพ์ / บันทึก PDF</button>
      </div>
      <div className="px-4 py-6">
        {error ? <div className="py-20 text-center text-red-500">⚠ {error}</div>
          : !bw ? <div className="py-20 text-center text-slate-400">กำลังโหลด…</div>
          : <PrintFrame html={html} />}
      </div>
    </div>
  );
}

export default function BeltWorkOrderPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><BeltWorkOrderInner /></Suspense>;
}
