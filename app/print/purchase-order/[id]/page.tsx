"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import type { PODetail } from "@/app/api/purchase-orders/route";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

const STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง", confirmed: "ยืนยันแล้ว", received: "รับของแล้ว",
  completed: "เสร็จสิ้น", cancelled: "ยกเลิก",
};

const baht = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";

function buildPoData(po: PODetail): Record<string, unknown> {
  return {
    po_number:        po.po_number ?? "(ยังไม่ออกเลข)",
    status_label:     STATUS_LABELS[po.status] ?? po.status,
    supplier_name:    po.supplier_name ?? "—",
    supplier_code:    po.supplier_code ?? "",
    warehouse_name:   po.to_warehouse_name ?? "—",
    warehouse_code:   po.to_warehouse_code ?? "",
    buyer_name:       po.buyer_name ?? "—",
    order_date_th:    thaiDate(po.order_date),
    arrival_date_th:  thaiDate(po.expected_arrival_date),
    note:             po.note ?? "",
    vat_rate_label:   po.vat_included ? `${po.vat_rate}% รวมแล้ว` : `${po.vat_rate}%`,
    taxable:          baht(po.taxable),
    total_vat:        baht(po.total_vat),
    total_wht:        baht(po.total_wht),
    has_wht:          po.total_wht > 0 ? "1" : "",
    grand_total:      baht(po.grand_total),
    amount_due:       baht(po.amount_due),
    lines: po.lines.map((l, i) => ({
      idx:          i + 1,
      sku:          l.sku ?? "",
      product_name: l.product_name,
      qty:          Number(l.qty).toLocaleString("th-TH"),
      unit:         l.unit,
      unit_price:   baht(l.unit_price),
      line_total:   baht(l.line_total ?? 0),
    })),
  };
}

export default function PrintPOPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [po, setPo] = useState<PODetail | null>(null);
  const [template, setTemplate] = useState<ReportTemplateRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/purchase-orders/${id}`).then(r => r.json()),
      apiFetch("/api/admin/report-templates?entity_type=po").then(r => r.json()),
    ])
      .then(([poRes, tplRes]) => {
        if (poRes.error) throw new Error(poRes.error);
        setPo(poRes.data as PODetail);
        const tpls = (tplRes as ReportTemplatesResponse).data?.filter(t => t.active) ?? [];
        setTemplate(tpls.find(t => t.is_default) ?? tpls[0] ?? null);
      })
      .catch(e => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  const html = useMemo(() => {
    if (!po || !template) return "";
    return buildReportHtml({
      paper_size: template.paper_size, orientation: template.orientation,
      header_html: template.header_html, body_html: template.body_html,
      footer_html: template.footer_html, custom_css: template.custom_css,
    }, buildPoData(po));
  }, [po, template]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} />
      <div className="py-6 px-4">
        {loading ? <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
         : error || !po ? <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบเอกสาร"}</div>
         : !template ? <div className="text-center py-20 text-amber-600">⚠️ ยังไม่มี template สำหรับ PO</div>
         : (
          <div className="max-w-[840px] mx-auto bg-white shadow-lg">
            <iframe srcDoc={html} className="w-full bg-white border-0" style={{ minHeight: "1180px" }} title="Print preview" />
          </div>
        )}
      </div>
    </div>
  );
}
