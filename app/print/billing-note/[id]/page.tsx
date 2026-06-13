"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import { thaiBahtText } from "@/lib/quotation-print";
import type { BillingNoteDetail } from "@/app/api/billing-notes/route";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

type BillingNoteExt = BillingNoteDetail & {
  customer_address?: string;
  customer_phone?:   string;
  customer_tax_id?:  string;
};

const baht = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const thaiShort = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const be2 = String((d.getFullYear() + 543) % 100).padStart(2, "0");
  return `${String(d.getDate()).padStart(2, "0")}-${TH_MON[d.getMonth()]}-${be2}`;
};

function buildData(b: BillingNoteExt): Record<string, unknown> {
  return {
    bill_number:      b.bill_number ?? "(ยังไม่ออกเลข)",
    bill_date:        thaiShort(b.bill_date),
    due_date:         thaiShort(b.due_date),
    customer_name:    b.customer_name ?? "—",
    customer_address: b.customer_address ?? "",
    customer_tax_id:  b.customer_tax_id ?? "",
    subtotal:         baht(b.subtotal),
    total_vat:        baht(b.total_vat),
    total_wht:        baht(b.total_wht),
    has_wht:          b.total_wht > 0 ? "1" : "",
    grand_total:      baht(b.grand_total),
    amount_due:       baht(b.amount_due),
    amount_in_words:  thaiBahtText(b.amount_due),
    lines: b.lines.map((l, i) => ({
      idx:          i + 1,
      so_number:    l.so_number ?? "",
      bill_date:    thaiShort(l.bill_date),
      due_date:     thaiShort(l.due_date),
      amount:       baht(l.amount),
      vat_amount:   baht(l.vat_amount),
      total_amount: baht(l.total_amount),
      note:         l.note ?? "",
    })),
  };
}

export default function PrintBillingNotePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [doc,      setDoc]      = useState<BillingNoteExt | null>(null);
  const [template, setTemplate] = useState<ReportTemplateRow | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/billing-notes/${id}`).then(r => r.json()),
      apiFetch("/api/admin/report-templates?entity_type=billing_note").then(r => r.json()),
    ])
      .then(([docRes, tplRes]) => {
        if (docRes.error) throw new Error(docRes.error);
        setDoc(docRes.data as BillingNoteExt);
        const tpls = (tplRes as ReportTemplatesResponse).data?.filter(t => t.active) ?? [];
        setTemplate(tpls.find(t => t.is_default) ?? tpls[0] ?? null);
      })
      .catch(e => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  const html = useMemo(() => {
    if (!doc || !template) return "";
    return buildReportHtml(
      { paper_size: template.paper_size, orientation: template.orientation,
        header_html: template.header_html, body_html: template.body_html,
        footer_html: template.footer_html, custom_css: template.custom_css },
      buildData(doc),
    );
  }, [doc, template]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} />
      <div className="py-6 px-4">
        {loading ? (
          <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
        ) : error || !doc ? (
          <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบเอกสาร"}</div>
        ) : !template ? (
          <div className="text-center py-20 text-amber-600">
            ⚠️ ยังไม่มี template สำหรับใบวางบิล — สร้างที่ <a href="/admin/report-templates" className="underline">Admin · Report Templates</a>
          </div>
        ) : (
          <PrintFrame html={html} />
        )}
      </div>
    </div>
  );
}
