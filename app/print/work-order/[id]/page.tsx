"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintFrame, printReportFrameOrWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { parseDesignerDescription } from "@/lib/report-designer";
import { buildReportHtml, type ReportTemplate } from "@/lib/template";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";
import type { Font, Plugins, Schema, Template } from "@pdfme/common";

const DEFAULT_ID = "__default__";
const FONT_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sarabun/Sarabun-Regular.ttf";
const STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  confirmed: "ยืนยันแล้ว",
  in_progress: "กำลังผลิต",
  done: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

const WORKORDER_PRINT_TEMPLATE: ReportTemplate = {
  paper_size: "A4",
  orientation: "portrait",
  header_html: `<div class="doc-header">
  <div class="company-name">หจก.ไอ.เอส.จี. เทรดดิ้ง</div>
</div>
<div class="doc-title">ใบสั่งงานผลิต</div>
<section class="wo-hero">
  <div class="wo-photo">{{{product_image_html}}}</div>
  <div class="wo-product">
    <div class="muted">สินค้า</div>
    <div class="product-name">{{product_name}}</div>
    <div class="product-code">{{product_sku}}</div>
    <div class="product-size">{{product_size}}</div>
  </div>
  <div class="wo-qty">
    <div class="muted">จำนวนผลิต</div>
    <div class="qty-big">{{qty}}</div>
    <div>ชิ้น · สูตร {{bom_version}}</div>
  </div>
  <div class="wo-meta">
    <div><span class="label">เลขที่:</span> {{mo_number}}</div>
    <div><span class="label">วันที่สั่ง:</span> {{created_at_th}}</div>
    <div><span class="label">กำหนดส่ง:</span> {{due_date_th}}</div>
    <div><span class="label">สถานะ:</span> {{status_label}}</div>
  </div>
</section>`,
  body_html: `<section class="summary-section">
  <div class="section-title">สรุปวัตถุดิบที่ต้องใช้</div>
  <table class="summary-table">
    <thead>
      <tr>
        <th>ชนิด</th>
        <th>วัตถุดิบ</th>
        <th class="text-right">รวมต้องใช้</th>
        <th>หน่วย</th>
      </tr>
    </thead>
    <tbody>
      {{#material_summary}}
      <tr>
        <td>{{material_type}}</td>
        <td>{{component_name}}</td>
        <td class="text-right">{{required}}</td>
        <td class="text-center">{{uom}}</td>
      </tr>
      {{/material_summary}}
    </tbody>
  </table>
</section>

<section>
  <div class="section-title">รายการวัตถุดิบ / บล็อกตัด</div>
  <table class="doc-table">
    <thead>
      <tr>
        <th style="width:7%">ลำดับ</th>
        <th style="width:30%">วัตถุดิบ</th>
        <th style="width:10%">ชนิด</th>
        <th style="width:12%">บล็อกตัด</th>
        <th style="width:13%">กว้าง x ยาว</th>
        <th style="width:12%">ยอดรวมชิ้น</th>
        <th style="width:11%">รวมต้องใช้</th>
        <th style="width:5%">หน่วย</th>
      </tr>
    </thead>
    <tbody>
      {{#lines}}
      <tr>
        <td class="text-center">{{idx}}</td>
        <td>{{component_name}}</td>
        <td class="text-center">{{material_type}}</td>
        <td class="text-center">{{cut_block_code}}</td>
        <td class="text-center">{{cut_size}}</td>
        <td class="text-right">{{total_pieces}}</td>
        <td class="text-right">{{required}}</td>
        <td class="text-center">{{uom}}</td>
      </tr>
      {{/lines}}
    </tbody>
  </table>
</section>

<section class="product-detail">
  <div class="detail-photo">{{{product_image_html}}}</div>
  <div class="detail-main">
    <div class="detail-title">{{product_name}}</div>
    <div class="detail-sub">ขนาด: {{product_size}}</div>
    <table class="detail-table">
      {{#product_spec_rows}}
      <tr>
        <td class="detail-label">{{label}}</td>
        <td>{{value}}</td>
      </tr>
      {{/product_spec_rows}}
    </table>
    <div class="note-box"><span class="label">วิธีทำ / หมายเหตุ:</span> {{note}}</div>
  </div>
</section>`,
  footer_html: `<section class="signatures">
  <div class="signature">ผู้สั่งผลิต</div>
  <div class="signature">ผู้รับงานผลิต</div>
</section>`,
  custom_css: `
.doc { font-size: 10.5px; color: #111827; }
.doc-header { text-align: center; line-height: 1.2; margin-bottom: 4mm; }
.company-name { font-size: 16px; font-weight: 700; }
.doc-title { text-align: center; font-size: 24px; font-weight: 800; margin: 3mm 0 5mm; }
.muted { color: #64748b; font-size: 10px; }
.label { font-weight: 700; }
.wo-hero { display: grid; grid-template-columns: 26mm 1.5fr 36mm 43mm; gap: 3mm; border: 1px solid #111; padding: 3mm; margin-bottom: 4mm; align-items: center; }
.wo-photo, .detail-photo { border: 1px solid #cbd5e1; background: #f8fafc; display: grid; place-items: center; overflow: hidden; }
.wo-photo { width: 26mm; height: 24mm; }
.wo-photo img, .detail-photo img { width: 100%; height: 100%; object-fit: contain; }
.photo-empty { color: #94a3b8; font-size: 10px; text-align: center; }
.product-name { font-size: 15px; font-weight: 800; line-height: 1.25; }
.product-code { margin-top: 1mm; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; color: #475569; }
.product-size { margin-top: 1mm; color: #334155; }
.wo-qty { text-align: center; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; padding: 1mm 2mm; }
.qty-big { font-size: 30px; font-weight: 900; line-height: 1; }
.wo-meta { line-height: 1.55; }
.section-title { font-size: 12px; font-weight: 800; margin: 3mm 0 1.5mm; }
.summary-section { page-break-inside: avoid; break-inside: avoid; }
.summary-table, .doc-table, .detail-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.summary-table th, .summary-table td, .doc-table th, .doc-table td { border: 1px solid #111; padding: 1.5mm 1.4mm; vertical-align: middle; }
.summary-table th, .doc-table th { text-align: center; font-weight: 800; background: #f1f5f9; }
.summary-table { margin-bottom: 3mm; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.product-detail { margin-top: 5mm; display: grid; grid-template-columns: 28mm 1fr; gap: 3mm; border-top: 1px solid #cbd5e1; padding-top: 3mm; page-break-inside: avoid; break-inside: avoid; }
.detail-photo { width: 28mm; height: 24mm; }
.detail-title { font-size: 12px; font-weight: 800; margin-bottom: 1mm; }
.detail-sub { color: #64748b; margin-bottom: 1.5mm; }
.detail-table td { border: 0; border-bottom: 1px solid #e2e8f0; padding: 1mm 0; vertical-align: top; }
.detail-label { width: 28mm; color: #64748b; font-weight: 700; }
.note-box { margin-top: 2mm; min-height: 10mm; }
.signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 36mm; margin-top: 18mm; padding: 0 18mm; page-break-inside: avoid; break-inside: avoid; }
.signature { text-align: center; border-top: 1px solid #111; padding-top: 2mm; font-weight: 700; }
@media print {
  .doc { padding: 8mm 9mm !important; font-size: 9.2px; }
  .doc-header { margin-bottom: 1.5mm; }
  .company-name { font-size: 13px; }
  .doc-title { font-size: 20px; margin: 1.5mm 0 2.5mm; }
  .wo-hero { grid-template-columns: 20mm 1.7fr 26mm 35mm; gap: 2mm; padding: 2mm; margin-bottom: 2mm; }
  .wo-photo { width: 20mm; height: 18mm; }
  .product-name { font-size: 12px; }
  .product-code, .product-size { margin-top: 0.5mm; }
  .qty-big { font-size: 22px; }
  .section-title { font-size: 10px; margin: 1.5mm 0 1mm; }
  .summary-table th, .summary-table td, .doc-table th, .doc-table td { padding: 0.75mm 1mm; }
  .summary-table { margin-bottom: 1.5mm; }
  .product-detail { margin-top: 2mm; gap: 2mm; grid-template-columns: 22mm 1fr; padding-top: 2mm; }
  .detail-photo { width: 22mm; height: 17mm; }
  .detail-title { font-size: 10px; margin-bottom: 0.5mm; }
  .detail-sub { margin-bottom: 0.5mm; }
  .detail-table td { padding: 0.35mm 0; line-height: 1.25; }
  .detail-label { width: 24mm; }
  .note-box { margin-top: 0.8mm; min-height: 0; }
  .signatures { margin-top: 7mm; padding: 0 22mm; gap: 28mm; }
  .signature { padding-top: 1mm; }
}
`,
};

type MoMat = {
  component_sku?: string | null;
  component_name?: string | null;
  material_type?: string | null;
  cut_block_code?: string | null;
  cut_width?: number | null;
  cut_length?: number | null;
  pieces?: number | null;
  qty_per?: number | null;
  uom?: string | null;
};
type MoSummary = {
  component_sku?: string | null;
  component_name?: string | null;
  material_type?: string | null;
  qty_per?: number | null;
  uom?: string | null;
};
type ProductSpecRow = { key: string; label: string; value: string; order?: number };
type ProductSpecGroup = { label: string; items: { code: string; name: string; count: number }[] };
type ProductSpec = {
  parent?: {
    name?: string | null;
    family?: string | null;
    size_summary?: string | null;
    work_instruction_notes?: string | null;
    image_url?: string | null;
  } | null;
  legacy?: ProductSpecRow[];
  model_attrs?: ProductSpecRow[];
  sku_attrs?: ProductSpecRow[];
  bom_materials?: ProductSpecGroup[];
};
type MoDetail = {
  id: string;
  mo_no: string;
  product_sku?: string | null;
  product_name?: string | null;
  qty?: number | null;
  due_date?: string | null;
  status?: string | null;
  bom_version?: string | null;
  note?: string | null;
  created_at?: string | null;
  materials?: MoMat[];
  summary?: MoSummary[];
};

const thaiDate = (iso: string | null | undefined) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const numTh = (n: number) => Number(n || 0).toLocaleString("th-TH");
const text = (value: unknown) => String(value ?? "").trim();
const dash = (value: unknown) => text(value) || "-";
const esc = (value: unknown) => text(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function photoHtml(url?: string | null) {
  return url
    ? `<img src="${esc(url)}" alt="รูปสินค้า" />`
    : `<div class="photo-empty">ไม่มีรูป</div>`;
}

function isPdfmeJson(value: string | null | undefined): boolean {
  if (!value) return false;
  const raw = value.trim();
  if (!raw.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return !!parsed && typeof parsed === "object" && "schemas" in parsed;
  } catch {
    return false;
  }
}

function specLabel(key: string, fallback: string) {
  const labels: Record<string, string> = {
    materials: "วัตถุดิบ",
    lining: "ซับใน",
    zipper: "ซิป",
    strap: "สาย",
    thread: "ด้าย",
    spares: "อะไหล่",
    logo: "โลโก้/พิมพ์",
  };
  return labels[key] ?? fallback;
}

function woScalars(mo: MoDetail, spec: ProductSpec | null): Record<string, string> {
  const size = spec?.parent?.size_summary || "-";
  const note = mo.note || spec?.parent?.work_instruction_notes || "-";
  return {
    mo_number: mo.mo_no,
    status_label: STATUS_LABELS[mo.status ?? ""] ?? (mo.status ?? "-"),
    created_at_th: thaiDate(mo.created_at),
    due_date_th: thaiDate(mo.due_date),
    product_sku: mo.product_sku ?? "",
    product_name: spec?.parent?.name || mo.product_name || mo.product_sku || "",
    product_size: size,
    qty: numTh(Number(mo.qty) || 0),
    bom_version: mo.bom_version || "-",
    note,
  };
}

function woTableRows(mo: MoDetail): string[][] {
  const qty = Number(mo.qty) || 0;
  const sortedMaterials = [...(mo.materials ?? [])].sort((a, b) => {
    const byType = dash(a.material_type).localeCompare(dash(b.material_type), "th");
    if (byType !== 0) return byType;
    const byName = dash(a.component_name ?? a.component_sku).localeCompare(dash(b.component_name ?? b.component_sku), "th");
    if (byName !== 0) return byName;
    return dash(a.cut_block_code).localeCompare(dash(b.cut_block_code), "th", { numeric: true });
  });
  return sortedMaterials.map((mat, index) => {
    const width = Number(mat.cut_width) || 0;
    const length = Number(mat.cut_length) || 0;
    const pieces = Number(mat.pieces) || 0;
    const qtyPer = Number(mat.qty_per) || 0;
    return [
      String(index + 1),
      mat.component_name ?? "",
      mat.material_type ?? "",
      mat.cut_block_code || "-",
      width && length ? `${width} x ${length}` : "-",
      pieces ? numTh(pieces * qty) : "-",
      numTh(r2(qtyPer * qty)),
      mat.uom ?? "",
    ];
  });
}

function materialSummaryRows(mo: MoDetail) {
  const qty = Number(mo.qty) || 0;
  const source = (mo.summary?.length ? mo.summary : mo.materials) ?? [];
  const grouped = new Map<string, { material_type: string; component_name: string; required: number; uom: string }>();
  source.forEach((row) => {
    const materialType = dash(row.material_type);
    const componentName = dash(row.component_name ?? row.component_sku);
    const uom = dash(row.uom);
    const key = `${materialType}|${componentName}|${uom}`;
    const prev = grouped.get(key) ?? { material_type: materialType, component_name: componentName, required: 0, uom };
    prev.required += (Number(row.qty_per) || 0) * qty;
    grouped.set(key, prev);
  });
  return [...grouped.values()]
    .sort((a, b) => `${a.material_type}${a.component_name}`.localeCompare(`${b.material_type}${b.component_name}`, "th"))
    .map((row) => ({ ...row, required: numTh(r2(row.required)) }));
}

function productSpecRows(spec: ProductSpec | null) {
  const rows: { label: string; value: string; order: number }[] = [];
  (spec?.legacy ?? []).forEach((row, index) => {
    const value = text(row.value);
    if (value && value !== "-") rows.push({ label: specLabel(row.key, row.label), value, order: row.order ?? index });
  });
  (spec?.model_attrs ?? []).forEach((row, index) => {
    const value = text(row.value);
    if (value && value !== "-") rows.push({ label: row.label, value, order: 100 + (row.order ?? index) });
  });
  (spec?.sku_attrs ?? []).forEach((row, index) => {
    const value = text(row.value);
    if (value && value !== "-") rows.push({ label: row.label, value, order: 200 + (row.order ?? index) });
  });
  (spec?.bom_materials ?? []).forEach((group, index) => {
    const value = group.items.map((item) => `${item.name}${item.count > 1 ? ` (${item.count} บล็อก)` : ""}`).join(", ");
    if (value) rows.push({ label: group.label, value, order: 300 + index });
  });
  return rows.sort((a, b) => a.order - b.order).slice(0, 12);
}

function buildWoHtmlData(mo: MoDetail, spec: ProductSpec | null): Record<string, unknown> {
  const lines = woTableRows(mo).map((row) => ({
    idx: row[0],
    component_name: row[1],
    material_type: row[2],
    cut_block_code: row[3],
    cut_size: row[4],
    total_pieces: row[5],
    required: row[6],
    uom: row[7],
  }));
  return {
    ...woScalars(mo, spec),
    product_image_html: photoHtml(spec?.parent?.image_url),
    material_summary: materialSummaryRows(mo),
    product_spec_rows: productSpecRows(spec),
    lines,
  };
}

function tplOptionLabel(template: ReportTemplateRow): string {
  const version = parseDesignerDescription(template.description).meta.version || 1;
  const kind = isPdfmeJson(template.body_html) ? "ลากวาง" : "HTML";
  return `${template.label} · v${version} · ${kind}${template.active ? "" : " (ร่าง)"}`;
}

export default function PrintWorkOrderPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [mo, setMo] = useState<MoDetail | null>(null);
  const [spec, setSpec] = useState<ProductSpec | null>(null);
  const [templates, setTemplates] = useState<ReportTemplateRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_ID);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/mo/${id}`).then((res) => res.json()),
      apiFetch("/api/admin/report-templates?entity_type=wo").then((res) => res.json()).catch(() => ({ data: [] })),
    ])
      .then(async ([moRes, tplRes]) => {
        if (moRes.error) throw new Error(moRes.error);
        const nextMo = moRes.data as MoDetail;
        setMo(nextMo);
        setSelectedId(DEFAULT_ID);
        const all = ((tplRes as ReportTemplatesResponse).data ?? []).slice().sort((a, b) => Number(b.active) - Number(a.active));
        setTemplates(all);
        if (nextMo.product_sku) {
          const specRes = await apiFetch(`/api/product-spec?sku=${encodeURIComponent(nextMo.product_sku)}`).then((res) => res.json()).catch(() => null);
          if (specRes && !specRes.error) setSpec(specRes as ProductSpec);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดใบสั่งงานไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  const selectedRow = useMemo(() => templates.find((template) => template.id === selectedId) ?? null, [templates, selectedId]);
  const pdfmeTemplate = useMemo<Template | null>(() => {
    if (selectedRow && isPdfmeJson(selectedRow.body_html)) {
      try {
        return JSON.parse(selectedRow.body_html) as Template;
      } catch {
        return null;
      }
    }
    return null;
  }, [selectedRow]);

  useEffect(() => {
    if (!pdfmeTemplate || !mo) {
      setPdfUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      setGenMsg("กำลังสร้าง PDF...");
      setPdfUrl(null);
      try {
        const [{ generate }, schemas, common] = await Promise.all([import("@pdfme/generator"), import("@pdfme/schemas"), import("@pdfme/common")]);
        const fontData = await fetch(FONT_URL).then((res) => res.arrayBuffer());
        const font: Font = { Sarabun: { data: new Uint8Array(fontData), fallback: true } };
        const plugins: Plugins = { Text: schemas.text, Table: schemas.table, Image: schemas.image, Line: schemas.line, Box: schemas.rectangle };
        const scalars = woScalars(mo, spec);
        const tableJson = JSON.stringify(woTableRows(mo));
        const inputs = common.getInputFromTemplate(pdfmeTemplate);
        const row: Record<string, string> = { ...(inputs[0] ?? {}) };
        for (const page of pdfmeTemplate.schemas) {
          for (const schema of page as Schema[]) {
            if (schema.type === "table") row[schema.name] = tableJson;
            else if (schema.name in scalars) row[schema.name] = scalars[schema.name];
          }
        }
        const pdf = await generate({ template: pdfmeTemplate, inputs: [row], options: { font }, plugins });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }));
        setPdfUrl(objectUrl);
        setGenMsg(null);
      } catch (err) {
        if (!cancelled) setGenMsg(err instanceof Error ? `สร้าง PDF ไม่สำเร็จ: ${err.message}` : "สร้าง PDF ไม่สำเร็จ");
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdfmeTemplate, mo, spec]);

  const html = useMemo(() => {
    if (!mo || pdfmeTemplate) return "";
    const template = selectedRow ?? WORKORDER_PRINT_TEMPLATE;
    return buildReportHtml({
      paper_size: selectedRow?.paper_size ?? WORKORDER_PRINT_TEMPLATE.paper_size,
      orientation: selectedRow?.orientation ?? WORKORDER_PRINT_TEMPLATE.orientation,
      header_html: template.header_html,
      body_html: template.body_html,
      footer_html: template.footer_html,
      custom_css: template.custom_css,
    }, buildWoHtmlData(mo, spec));
  }, [mo, spec, selectedRow, pdfmeTemplate]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => router.back()} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span className="text-slate-400">เทมเพลต/เวอร์ชัน:</span>
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="h-9 max-w-[360px] rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={DEFAULT_ID}>ค่าเริ่มต้นใหม่ (ใบสั่งงานผลิต)</option>
            {templates.map((template) => <option key={template.id} value={template.id}>{tplOptionLabel(template)}</option>)}
          </select>
        </label>
        <div className="flex-1" />
        {pdfmeTemplate ? (
          <button
            onClick={() => pdfUrl && window.open(pdfUrl, "_blank")}
            disabled={!pdfUrl}
            className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            เปิด PDF (พิมพ์/บันทึก)
          </button>
        ) : (
          <button onClick={printReportFrameOrWindow} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">
            พิมพ์ / บันทึก PDF
          </button>
        )}
      </div>

      <div className="px-4 py-6">
        {loading ? (
          <div className="py-20 text-center text-slate-400">กำลังโหลด...</div>
        ) : error || !mo ? (
          <div className="py-20 text-center text-red-500">⚠ {error ?? "ไม่พบเอกสาร"}</div>
        ) : pdfmeTemplate ? (
          genMsg ? (
            <div className="py-20 text-center text-slate-400">{genMsg}</div>
          ) : pdfUrl ? (
            <div className="mx-auto max-w-[900px] bg-white shadow-lg"><iframe src={pdfUrl} className="w-full border-0" style={{ height: "85vh" }} title="PDF preview" /></div>
          ) : (
            <div className="py-20 text-center text-slate-400">กำลังเตรียม...</div>
          )
        ) : (
          <PrintFrame html={html} />
        )}
      </div>
    </div>
  );
}
