"use client";

// ใบส่งสินค้า (Delivery Note) — ใช้ข้อมูล SO ชุดเดียวกับใบกำกับภาษี แต่คนละแม่แบบ (ไม่มีราคา)
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import { buildSoData, type SODetailExt } from "@/app/print/sales-order/[id]/page";
import type { SODetail } from "@/app/api/sales-orders/route";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

export default function PrintDeliveryNotePage() {
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
        // เลือกแม่แบบ "ใบส่งสินค้า" (template_key = delivery-note)
        setTemplate(tpls.find(t => t.template_key === "delivery-note") ?? null);
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
      buildSoData(so as SODetailExt),
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
            ⚠️ ยังไม่มีแม่แบบใบส่งสินค้า — สร้างที่ <a href="/admin/report-templates" className="underline">Admin · Report Templates</a>
          </div>
        ) : (
          <PrintFrame html={html} />
        )}
      </div>
    </div>
  );
}
