"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import type { PRDetail } from "@/app/api/purchase-requests/route";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";

const STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง", submitted: "รออนุมัติ", approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ", cancelled: "ยกเลิก",
};

const baht = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

// ---- ปั้นข้อมูลให้ token match กับ template ----
function buildPrData(pr: PRDetail): Record<string, unknown> {
  return {
    pr_number:      pr.pr_number ?? "(ยังไม่ออกเลข)",
    title:          pr.title,
    requester_name: pr.requester_name ?? "—",
    department:     pr.department ?? "—",
    note:           pr.note ?? "",
    status_label:   STATUS_LABELS[pr.status] ?? pr.status,
    approver_name:  pr.approver_name ?? "—",
    created_at_th:  pr.created_at ? new Date(pr.created_at).toLocaleDateString("th-TH",
      { day:"numeric", month:"short", year:"numeric" }) : "—",
    submitted_at_th: pr.submitted_at ? new Date(pr.submitted_at).toLocaleDateString("th-TH",
      { day:"numeric", month:"short", year:"numeric" }) : "—",
    approved_at_th: pr.approved_at ? new Date(pr.approved_at).toLocaleDateString("th-TH",
      { day:"numeric", month:"short", year:"numeric" }) : "—",
    total_amount:   baht(pr.total_amount),
    lines: pr.lines.map((l, i) => ({
      idx: i + 1,
      sku: l.sku ?? "",
      product_name: l.product_name,
      qty: Number(l.qty).toLocaleString("th-TH"),
      unit: l.unit,
      unit_price: baht(l.unit_price),
      line_total: baht(l.line_total ?? 0),
      note: l.note ?? "",
    })),
  };
}

export default function PrintPRPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [pr,       setPr]       = useState<PRDetail | null>(null);
  const [template, setTemplate] = useState<ReportTemplateRow | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/purchase-requests/${id}`).then(r => r.json()),
      apiFetch("/api/admin/report-templates?entity_type=pr").then(r => r.json()),
    ])
      .then(([prRes, tplRes]) => {
        if (prRes.error) throw new Error(prRes.error);
        setPr(prRes.data as PRDetail);
        const tpls = (tplRes as ReportTemplatesResponse).data?.filter(t => t.active) ?? [];
        const def = tpls.find(t => t.is_default) ?? tpls[0] ?? null;
        setTemplate(def);
      })
      .catch(e => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  const html = useMemo(() => {
    if (!pr || !template) return "";
    return buildReportHtml(
      {
        paper_size:  template.paper_size,
        orientation: template.orientation,
        header_html: template.header_html,
        body_html:   template.body_html,
        footer_html: template.footer_html,
        custom_css:  template.custom_css,
      },
      buildPrData(pr),
    );
  }, [pr, template]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} />
      <div className="py-6 px-4">
        {loading ? (
          <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
        ) : error || !pr ? (
          <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบเอกสาร"}</div>
        ) : !template ? (
          <div className="text-center py-20 text-amber-600">
            ⚠️ ยังไม่มี template สำหรับ PR — สร้างที่ <a href="/admin/report-templates" className="underline">Admin · Report Templates</a>
          </div>
        ) : (
          <div className="max-w-[840px] mx-auto bg-white shadow-lg">
            <iframe
              srcDoc={html}
              className="w-full bg-white border-0"
              style={{ minHeight: "1180px" }}
              title="Print preview"
            />
          </div>
        )}
      </div>
    </div>
  );
}
