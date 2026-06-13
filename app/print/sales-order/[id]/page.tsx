"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import { thaiBahtText } from "@/lib/quotation-print";
import type { SODetail } from "@/app/api/sales-orders/route";

type SODetailExt = SODetail & {
  subtotal?:         number;
  customer_address?: string;
  customer_phone?:   string;
  customer_tax_id?:  string;
  payment_terms?:    string;
  customer_po_no?:   string;
};
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

const STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง", confirmed: "ยืนยันแล้ว", in_production: "กำลังผลิต",
  ready: "พร้อมส่ง", shipped: "จัดส่งแล้ว", completed: "เสร็จสิ้น", cancelled: "ยกเลิก",
};

const baht = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";

function buildSoData(so: SODetailExt): Record<string, unknown> {
  const isoDate = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : "—");
  return {
    so_number:        so.so_number ?? "(ยังไม่ออกเลข)",
    status_label:     STATUS_LABELS[so.status] ?? so.status,
    customer_name:    so.customer_name ?? "—",
    customer_code:    so.customer_code ?? "",
    customer_address: so.customer_address ?? "",
    customer_phone:   so.customer_phone ?? "",
    customer_tax_id:  so.customer_tax_id ?? "",
    sale_person_name: so.sale_person_name ?? "—",
    order_date_th:    thaiDate(so.order_date),
    order_date_iso:   isoDate(so.order_date),
    ship_date_th:     thaiDate(so.expected_ship_date),
    note:             so.note ?? "",
    payment_terms:    so.payment_terms ?? "",
    customer_po_no:   so.customer_po_no ?? "",
    vat_rate:         so.vat_rate,
    vat_rate_label:   so.vat_included ? `${so.vat_rate}% รวมแล้ว` : `${so.vat_rate}%`,
    subtotal:         baht(so.subtotal ?? so.taxable),
    taxable:          baht(so.taxable),
    total_vat:        baht(so.total_vat),
    total_wht:        baht(so.total_wht),
    has_wht:          so.total_wht > 0 ? "1" : "",
    grand_total:      baht(so.grand_total),
    amount_due:       baht(so.amount_due),
    amount_in_words:  thaiBahtText(so.grand_total),
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
          <PrintFrame html={html} />
        )}
      </div>
    </div>
  );
}
