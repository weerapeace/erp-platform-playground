"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintFrame, printReportFrameOrWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { parseDesignerDescription } from "@/lib/report-designer";
import { buildReportHtml } from "@/lib/template";
import { WORKORDER_PRINT_TEMPLATE, woScalars, woTableRows, buildWoHtmlData, woQrHtml, type MoDetail, type ProductSpec } from "@/lib/work-order-print";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";
import type { Font, Plugins, Schema, Template } from "@pdfme/common";

const DEFAULT_ID = "__default__";
const FONT_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sarabun/Sarabun-Regular.ttf";

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
  const [qrHtml, setQrHtml] = useState("");

  useEffect(() => {
    if (!mo) { setQrHtml(""); return; }
    let on = true;
    void woQrHtml(`${window.location.origin}/print/work-order/${mo.id}`).then((h) => { if (on) setQrHtml(h); });
    return () => { on = false; };
  }, [mo]);

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
    }, { ...buildWoHtmlData(mo, spec), qr_html: qrHtml });
  }, [mo, spec, selectedRow, pdfmeTemplate, qrHtml]);

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
