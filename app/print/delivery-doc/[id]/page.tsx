"use client";

// พิมพ์ใบส่งสินค้า (โมดูล delivery-notes) — ใช้แม่แบบ so/delivery-note (ไม่มีราคา)
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { docFileName } from "@/lib/print-filename";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import type { DeliveryNoteDetail } from "@/app/api/delivery-notes/route";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

function buildData(dn: DeliveryNoteDetail): Record<string, unknown> {
  return {
    so_number:        dn.dn_number ?? "(ยังไม่ออกเลข)",   // ช่อง "เลขที่ใบส่ง" ในแม่แบบใช้ token so_number
    customer_name:    dn.customer_name ?? "—",
    customer_code:    dn.customer_code ?? "",
    customer_address: dn.customer_address ?? "",
    customer_phone:   dn.customer_phone ?? "",
    customer_tax_id:  dn.customer_tax_id ?? "",
    order_date_iso:   dn.delivery_date ? String(dn.delivery_date).slice(0, 10) : "—",
    customer_po_no:   (dn.so_numbers ?? []).join(", "),   // อ้างอิงใบขายที่มา
    note:             dn.note ?? "",
    total_qty:        Number(dn.total_qty ?? 0).toLocaleString("th-TH"),
    lines: dn.lines.map((l, i) => ({
      idx: i + 1, sku: l.sku ?? "", product_name: l.product_name,
      qty: Number(l.qty).toLocaleString("th-TH"), unit: l.unit ?? "",
    })),
  };
}

export default function PrintDeliveryDocPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [dn,       setDn]       = useState<DeliveryNoteDetail | null>(null);
  const [template, setTemplate] = useState<ReportTemplateRow | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/delivery-notes/${id}`).then(r => r.json()),
      apiFetch("/api/admin/report-templates?entity_type=so").then(r => r.json()),
    ])
      .then(([dnRes, tplRes]) => {
        if (dnRes.error) throw new Error(dnRes.error);
        setDn(dnRes.data as DeliveryNoteDetail);
        const tpls = (tplRes as ReportTemplatesResponse).data?.filter(t => t.active) ?? [];
        setTemplate(tpls.find(t => t.template_key === "delivery-note") ?? null);
      })
      .catch(e => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  const html = useMemo(() => {
    if (!dn || !template) return "";
    return buildReportHtml(
      { paper_size: template.paper_size, orientation: template.orientation,
        header_html: template.header_html, body_html: template.body_html,
        footer_html: template.footer_html, custom_css: template.custom_css },
      buildData(dn),
    );
  }, [dn, template]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} fileName={docFileName("ใบส่งของ", dn?.dn_number)} />
      <div className="py-6 px-4">
        {loading ? (
          <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
        ) : error || !dn ? (
          <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบเอกสาร"}</div>
        ) : !template ? (
          <div className="text-center py-20 text-amber-600">⚠️ ยังไม่มีแม่แบบใบส่งสินค้า</div>
        ) : (
          <PrintFrame html={html} fileName={docFileName("ใบส่งของ", dn?.dn_number)} />
        )}
      </div>
    </div>
  );
}
