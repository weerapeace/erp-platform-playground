"use client";

/**
 * พิมพ์ใบสั่งงานผลิต (MO) → PDF
 * - ถ้ามีเทมเพลต pdfme (ลากวาง, published) → สร้าง PDF ในเบราว์เซอร์ + เติมข้อมูล MO จริง (ฟอนต์ไทย)
 * - ถ้าไม่มี → ใช้เทมเพลต HTML (report_templates) · ไม่มีอีก → เทมเพลตเริ่มต้น
 * ออกแบบเทมเพลต: ลากวาง /admin/report-builder · HTML /admin/report-templates
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import { DEFAULT_WORKORDER_TEMPLATE } from "@/lib/report-designer";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";
import type { Template, Font, Plugins, Schema } from "@pdfme/common";

const FONT_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sarabun/Sarabun-Regular.ttf";
const STATUS_LABELS: Record<string, string> = { draft: "ร่าง", confirmed: "ยืนยันแล้ว", in_progress: "กำลังผลิต", done: "เสร็จสิ้น", cancelled: "ยกเลิก" };
const thaiDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—");
const r2 = (n: number) => Math.round(n * 100) / 100;
const numTh = (n: number) => Number(n || 0).toLocaleString("th-TH");

type MoMat = { component_name?: string; material_type?: string; cut_block_code?: string | null; cut_width?: number | null; cut_length?: number | null; pieces?: number | null; qty_per?: number | null; uom?: string | null };
type MoDetail = { id: string; mo_no: string; product_sku?: string; product_name?: string; qty?: number; due_date?: string | null; status?: string; bom_version?: string | null; note?: string | null; created_at?: string; materials?: MoMat[] };

function isPdfmeJson(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.trim(); if (!t.startsWith("{")) return false;
  try { const o = JSON.parse(t) as Record<string, unknown>; return !!o && typeof o === "object" && "schemas" in o; } catch { return false; }
}

/** ข้อมูล scalar สำหรับเติมช่อง (จับคู่ตามชื่อช่อง) */
function woScalars(mo: MoDetail): Record<string, string> {
  return {
    mo_number: mo.mo_no,
    status_label: STATUS_LABELS[mo.status ?? ""] ?? (mo.status ?? ""),
    created_at_th: thaiDate(mo.created_at),
    due_date_th: thaiDate(mo.due_date),
    product_sku: mo.product_sku ?? "",
    product_name: mo.product_name ?? mo.product_sku ?? "",
    qty: numTh(Number(mo.qty) || 0),
    bom_version: mo.bom_version ?? "—",
    note: mo.note || "—",
  };
}
/** แถววัตถุดิบ (เรียงคอลัมน์: ลำดับ, วัตถุดิบ, ชนิด, บล็อกตัด, กว้าง×ยาว, ชิ้น, ยอดรวมชิ้น, รวมต้องใช้, หน่วย) */
function woTableRows(mo: MoDetail): string[][] {
  const qty = Number(mo.qty) || 0;
  return (mo.materials ?? []).map((m, i) => {
    const w = Number(m.cut_width) || 0, l = Number(m.cut_length) || 0, pcs = Number(m.pieces) || 0;
    return [
      String(i + 1), m.component_name ?? "", m.material_type ?? "", m.cut_block_code || "—",
      w && l ? `${w}×${l}` : "—", pcs ? numTh(pcs) : "—", pcs ? numTh(pcs * qty) : "—",
      numTh(r2((Number(m.qty_per) || 0) * qty)), m.uom ?? "",
    ];
  });
}
/** ข้อมูลสำหรับเทมเพลต HTML (Mustache) */
function buildWoHtmlData(mo: MoDetail): Record<string, unknown> {
  const rows = woTableRows(mo);
  return {
    ...woScalars(mo),
    lines: rows.map((r) => ({ idx: r[0], component_name: r[1], material_type: r[2], cut_block_code: r[3], cut_size: r[4], pieces: r[5], total_pieces: r[6], required: r[7], uom: r[8] })),
  };
}

export default function PrintWorkOrderPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [mo, setMo] = useState<MoDetail | null>(null);
  const [htmlTemplate, setHtmlTemplate] = useState<ReportTemplateRow | null>(null);
  const [pdfmeTemplate, setPdfmeTemplate] = useState<Template | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/mo/${id}`).then((r) => r.json()),
      apiFetch("/api/admin/report-templates?entity_type=wo").then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([moRes, tplRes]) => {
        if (moRes.error) throw new Error(moRes.error);
        setMo(moRes.data as MoDetail);
        const all = (tplRes as ReportTemplatesResponse).data ?? [];
        const active = all.filter((t) => t.active);
        const pool = active.length ? active : all;
        const pdfmeRow = pool.find((t) => t.is_default && isPdfmeJson(t.body_html)) ?? pool.find((t) => isPdfmeJson(t.body_html));
        if (pdfmeRow) { try { setPdfmeTemplate(JSON.parse(pdfmeRow.body_html) as Template); } catch { /* ใช้ HTML แทน */ } }
        else { setHtmlTemplate(pool.find((t) => t.is_default) ?? pool[0] ?? null); }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  // สร้าง PDF จากเทมเพลต pdfme + ข้อมูล MO จริง
  useEffect(() => {
    if (!pdfmeTemplate || !mo) return;
    let url: string | null = null; let cancelled = false;
    (async () => {
      setGenMsg("กำลังสร้าง PDF…");
      try {
        const [{ generate }, schemas, common] = await Promise.all([import("@pdfme/generator"), import("@pdfme/schemas"), import("@pdfme/common")]);
        const fontData = await fetch(FONT_URL).then((r) => r.arrayBuffer());
        const font: Font = { Sarabun: { data: new Uint8Array(fontData), fallback: true } };
        const plugins: Plugins = { Text: schemas.text, Table: schemas.table, Image: schemas.image, Line: schemas.line, Box: schemas.rectangle };
        const scalars = woScalars(mo);
        const tableJson = JSON.stringify(woTableRows(mo));
        const inputs = common.getInputFromTemplate(pdfmeTemplate);
        const row: Record<string, string> = { ...(inputs[0] ?? {}) };
        for (const page of pdfmeTemplate.schemas) for (const sc of page as Schema[]) {
          if (sc.type === "table") row[sc.name] = tableJson;
          else if (sc.name in scalars) row[sc.name] = scalars[sc.name];
        }
        const pdf = await generate({ template: pdfmeTemplate, inputs: [row], options: { font }, plugins });
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }));
        setPdfUrl(url); setGenMsg(null);
      } catch (e) { if (!cancelled) setGenMsg(e instanceof Error ? `สร้าง PDF ไม่สำเร็จ: ${e.message}` : "สร้าง PDF ไม่สำเร็จ"); }
    })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [pdfmeTemplate, mo]);

  const html = useMemo(() => {
    if (!mo || pdfmeTemplate) return "";
    const t = htmlTemplate ?? DEFAULT_WORKORDER_TEMPLATE;
    return buildReportHtml({
      paper_size: htmlTemplate?.paper_size ?? "A4", orientation: htmlTemplate?.orientation ?? "portrait",
      header_html: t.header_html, body_html: t.body_html, footer_html: t.footer_html, custom_css: t.custom_css,
    }, buildWoHtmlData(mo));
  }, [mo, htmlTemplate, pdfmeTemplate]);

  // ---- โหมด pdfme (ลากวาง) ----
  if (pdfmeTemplate) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
          <button onClick={() => router.back()} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50">← กลับ</button>
          <span className="text-xs text-slate-400">เทมเพลตลากวาง (pdfme)</span>
          <div className="flex-1" />
          <button onClick={() => pdfUrl && window.open(pdfUrl, "_blank")} disabled={!pdfUrl}
            className="h-9 px-5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">🖨️ เปิด PDF (พิมพ์/บันทึก)</button>
        </div>
        <div className="py-6 px-4">
          {error ? <div className="text-center py-20 text-red-500">⚠️ {error}</div>
            : genMsg ? <div className="text-center py-20 text-slate-400">{genMsg}</div>
              : pdfUrl ? <div className="max-w-[900px] mx-auto bg-white shadow-lg"><iframe src={pdfUrl} className="w-full border-0" style={{ height: "85vh" }} title="PDF preview" /></div>
                : <div className="text-center py-20 text-slate-400">กำลังเตรียม…</div>}
        </div>
      </div>
    );
  }

  // ---- โหมด HTML (เดิม) ----
  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} />
      <div className="py-6 px-4">
        {loading ? <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
          : error || !mo ? <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบเอกสาร"}</div>
            : (
              <div className="max-w-[840px] mx-auto bg-white shadow-lg">
                <iframe srcDoc={html} className="w-full bg-white border-0" style={{ minHeight: "1180px" }} title="Print preview" />
              </div>
            )}
      </div>
    </div>
  );
}
