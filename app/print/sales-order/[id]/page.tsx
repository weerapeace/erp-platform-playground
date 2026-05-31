"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import type { SODetail } from "@/app/api/sales-orders/route";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

const STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง", confirmed: "ยืนยันแล้ว", in_production: "กำลังผลิต",
  ready: "พร้อมส่ง", shipped: "จัดส่งแล้ว", completed: "เสร็จสิ้น", cancelled: "ยกเลิก",
};

const baht = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";

function buildSoData(so: SODetail): Record<string, unknown> {
  return {
    so_number:        so.so_number ?? "(ยังไม่ออกเลข)",
    status_label:     STATUS_LABELS[so.status] ?? so.status,
    customer_name:    so.customer_name ?? "—",
    customer_code:    so.customer_code ?? "",
    sale_person_name: so.sale_person_name ?? "—",
    order_date_th:    thaiDate(so.order_date),
    ship_date_th:     thaiDate(so.expected_ship_date),
    note:             so.note ?? "",
    vat_rate_label:   so.vat_included ? `${so.vat_rate}% รวมแล้ว` : `${so.vat_rate}%`,
    taxable:          baht(so.taxable),
    total_vat:        baht(so.total_vat),
    total_wht:        baht(so.total_wht),
    has_wht:          so.total_wht > 0 ? "1" : "",
    grand_total:      baht(so.grand_total),
    amount_due:       baht(so.amount_due),
    lines: so.lines.map((l, i) => ({
      idx:             i + 1,
      sku:             l.sku ?? "",
      product_name:    l.product_name,
      qty:             Number(l.qty).toLocaleString("th-TH"),
      unit:            l.unit,
      unit_price:      baht(l.unit_price),
      discount_amount: baht(l.discount_amount ?? 0),
      line_total:      baht(l.line_total ?? 0),
    })),
  };
}

export default function PrintSOPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [so,       setSo]       = useState<SODetail | null>(null);
  const [template, setTemplate] = useState<ReportTemplateRow | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/sales-orders/${id}`).then(r => r.json()),
      apiFetch("/api/admin/report-templates?entity_type=so").then(r => r.json()),
    ])
      .then(([soRes, tplRes]) => {
        if (soRes.error) throw new Error(soRes.error);
        setSo(soRes.data as SODetail);
        const tpls = (tplRes as ReportTemplatesResponse).data?.filter(t => t.active) ?? [];
        setTemplate(tpls.find(t => t.is_default) ?? tpls[0] ?? null);
      })
      .catch(e => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  const html = useMemo(() => {
    if (!so || !template) return "";
    return buildReportHtml(
      {
        paper_size:  template.paper_size,
        orientation: template.orientation,
        header_html: template.header_html,
        body_html:   template.body_html,
        footer_html: template.footer_html,
        custom_css:  template.custom_css,
      },
      buildSoData(so),
    );
  }, [so, template]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} />
      <div className="py-6 px-4">
        {loading ? (
          <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
        ) : error || !so ? (
          <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบเอกสาร"}</div>
        ) : !template ? (
          <div className="text-center py-20 text-amber-600">
            ⚠️ ยังไม่มี template สำหรับ SO — สร้างที่ <a href="/admin/report-templates" className="underline">Admin · Report Templates</a>
          </div>
        ) : (
          <div className="max-w-[840px] mx-auto bg-white shadow-lg">
            <iframe srcDoc={html} className="w-full bg-white border-0" style={{ minHeight: "1180px" }} title="Print preview" />
          </div>
        )}
      </div>
    </div>
  );
}
