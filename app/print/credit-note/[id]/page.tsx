"use client";

/**
 * พิมพ์ใบลดหนี้ — /print/credit-note/[id]
 * ใช้ระบบพิมพ์กลาง: แม่แบบเก็บใน erp_report_templates (entity_type='cn') แก้หน้าตาเองได้ที่ /admin/report-templates
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { docFileName } from "@/lib/print-filename";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import { thaiBahtText } from "@/lib/quotation-print";
import type { CreditNoteDetail } from "@/app/api/credit-notes/route";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

const baht = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";

const qty = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** แปลงข้อมูลใบลดหนี้ → token ให้แม่แบบ */
function buildCreditNoteData(cn: CreditNoteDetail): Record<string, unknown> {
  return {
    cn_number:        cn.cn_number ?? "(ยังไม่ออกเลข)",
    cn_date_th:       thaiDate(cn.cn_date),
    status_label:     cn.status === "cancelled" ? "ยกเลิก" : cn.status === "issued" ? "" : "ร่าง (ยังไม่ออกเลข)",
    is_cancelled:     cn.status === "cancelled" ? "1" : "",
    ref_invoice_no:   cn.ref_invoice_no ?? "—",
    ref_invoice_date: thaiDate(cn.ref_invoice_date),
    reason:           cn.reason ?? "—",
    note:             cn.note ?? "",
    // ผู้ขาย
    company_name_th:  cn.company_name_th ?? "",
    company_name_en:  cn.company_name_en ?? "",
    company_address:  cn.company_address ?? "",
    company_phone:    cn.company_phone ?? "",
    company_tax_id:   cn.company_tax_id ?? "",
    // ลูกค้า
    customer_name:    cn.customer_name ?? "—",
    customer_code:    cn.customer_code ?? "",
    customer_address: cn.customer_address ?? "",
    customer_phone:   cn.customer_phone ?? "",
    customer_tax_id:  cn.customer_tax_id ?? "",
    // ยอด (ก่อน VAT ทั้งหมด ยกเว้น vat_amount / grand_total)
    original_amount:  baht(cn.original_amount),
    correct_amount:   baht(cn.correct_amount),
    diff_amount:      baht(cn.diff_amount),
    vat_rate:         String(cn.vat_rate ?? 7),
    vat_amount:       baht(cn.vat_amount),
    grand_total:      baht(cn.grand_total),
    amount_in_words:  thaiBahtText(cn.grand_total),
    lines: cn.lines.map((l, i) => ({
      idx:          i + 1,
      sku:          l.sku ?? "",
      product_name: l.product_name,
      desc2:        l.note ?? "",
      unit:         l.unit ?? "",
      unit_price:   baht(l.unit_price),
      qty_original: qty(l.qty_original),
      qty_correct:  qty(l.qty_correct),
      amount_diff:  baht(l.amount_diff),
    })),
  };
}

export default function PrintCreditNotePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [cn, setCn] = useState<CreditNoteDetail | null>(null);
  const [templates, setTemplates] = useState<ReportTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/credit-notes/${id}`).then(r => r.json()),
      apiFetch("/api/admin/report-templates?entity_type=cn").then(r => r.json()),
    ])
      .then(([cnRes, tplRes]) => {
        if (cnRes.error) throw new Error(cnRes.error);
        setCn(cnRes.data as CreditNoteDetail);
        setTemplates((tplRes as ReportTemplatesResponse).data?.filter(t => t.active) ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  const template = useMemo(
    () => templates.find(t => t.is_default) ?? templates[0] ?? null,
    [templates],
  );

  const html = useMemo(() => {
    if (!cn || !template) return "";
    return buildReportHtml(
      {
        paper_size: template.paper_size, orientation: template.orientation,
        header_html: template.header_html, body_html: template.body_html,
        footer_html: template.footer_html, custom_css: template.custom_css,
      },
      buildCreditNoteData(cn),
    );
  }, [cn, template]);

  const fileName = docFileName("ใบลดหนี้", cn?.cn_number || cn?.ref_invoice_no);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} fileName={fileName} />
      <div className="py-6 px-4">
        {loading ? (
          <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
        ) : error || !cn ? (
          <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบเอกสาร"}</div>
        ) : !template ? (
          <div className="text-center py-20 text-amber-600">
            ⚠️ ยังไม่มีแม่แบบใบลดหนี้ — สร้างที่ <a href="/admin/report-templates" className="underline">ตั้งค่า · แม่แบบเอกสาร</a>
          </div>
        ) : (
          <PrintFrame html={html} fileName={fileName} />
        )}
      </div>
    </div>
  );
}
