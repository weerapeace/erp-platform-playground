"use client";

/**
 * พิมพ์ใบสั่งงานผลิต (MO) → PDF ผ่าน browser print
 * ใช้ระบบเทมเพลตกลาง (report_templates entity_type="wo") · ถ้ายังไม่มีในฐานข้อมูล → ใช้เทมเพลตเริ่มต้น
 * ออกแบบเทมเพลตเองได้ที่ /admin/report-templates
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import { DEFAULT_WORKORDER_TEMPLATE } from "@/lib/report-designer";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

const STATUS_LABELS: Record<string, string> = { draft: "ร่าง", confirmed: "ยืนยันแล้ว", in_progress: "กำลังผลิต", done: "เสร็จสิ้น", cancelled: "ยกเลิก" };
const thaiDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—");
const r2 = (n: number) => Math.round(n * 100) / 100;
const numTh = (n: number) => Number(n || 0).toLocaleString("th-TH");

type MoMat = { component_name?: string; material_type?: string; cut_block_code?: string | null; cut_width?: number | null; cut_length?: number | null; pieces?: number | null; qty_per?: number | null; uom?: string | null };
type MoDetail = { id: string; mo_no: string; product_sku?: string; product_name?: string; qty?: number; due_date?: string | null; status?: string; bom_version?: string | null; note?: string | null; created_at?: string; materials?: MoMat[] };

function buildWoData(mo: MoDetail): Record<string, unknown> {
  const qty = Number(mo.qty) || 0;
  return {
    mo_number: mo.mo_no,
    status_label: STATUS_LABELS[mo.status ?? ""] ?? (mo.status ?? ""),
    created_at_th: thaiDate(mo.created_at),
    due_date_th: thaiDate(mo.due_date),
    product_sku: mo.product_sku ?? "",
    product_name: mo.product_name ?? mo.product_sku ?? "",
    qty: numTh(qty),
    bom_version: mo.bom_version ?? "—",
    note: mo.note || "—",
    lines: (mo.materials ?? []).map((m, i) => {
      const w = Number(m.cut_width) || 0, l = Number(m.cut_length) || 0, pcs = Number(m.pieces) || 0;
      return {
        idx: i + 1,
        component_name: m.component_name ?? "",
        material_type: m.material_type ?? "",
        cut_block_code: m.cut_block_code || "—",
        cut_size: w && l ? `${w}×${l}` : "—",
        pieces: pcs ? numTh(pcs) : "—",
        total_pieces: pcs ? numTh(pcs * qty) : "—",
        required: numTh(r2((Number(m.qty_per) || 0) * qty)),
        uom: m.uom ?? "",
      };
    }),
  };
}

export default function PrintWorkOrderPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [mo, setMo] = useState<MoDetail | null>(null);
  const [template, setTemplate] = useState<ReportTemplateRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/mo/${id}`).then((r) => r.json()),
      apiFetch("/api/admin/report-templates?entity_type=wo").then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([moRes, tplRes]) => {
        if (moRes.error) throw new Error(moRes.error);
        setMo(moRes.data as MoDetail);
        const tpls = (tplRes as ReportTemplatesResponse).data?.filter((t) => t.active) ?? [];
        setTemplate(tpls.find((t) => t.is_default) ?? tpls[0] ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  const html = useMemo(() => {
    if (!mo) return "";
    const t = template ?? DEFAULT_WORKORDER_TEMPLATE;
    return buildReportHtml({
      paper_size: template?.paper_size ?? "A4", orientation: template?.orientation ?? "portrait",
      header_html: t.header_html, body_html: t.body_html, footer_html: t.footer_html, custom_css: t.custom_css,
    }, buildWoData(mo));
  }, [mo, template]);

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
