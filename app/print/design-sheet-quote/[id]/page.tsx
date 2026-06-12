"use client";

/**
 * พิมพ์ใบเสนอราคา (งานออกแบบ) — ข้อมูลใบงาน + ประวัติรอบเสนอราคา + ราคาล่าสุด
 * ใช้ระบบ template กลาง (erp_report_templates entity_type='design_sheet_quote')
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import { QUOTE_STATUS } from "@/lib/design-sheets-meta";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";
import type { DesignSheetQuote } from "@/app/api/design-sheets/[id]/quotes/route";
import type { Attachment } from "@/app/api/attachments/route";

const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";

const baht = (n: number | null | undefined) =>
  n != null ? Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "—";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const absUrl = (u: string, origin: string) =>
  /^(https?:|data:|blob:)/i.test(u) ? u : `${origin}${u.startsWith("/") ? u : `/${u}`}`;

type Sheet = Record<string, unknown> & { brand?: { name?: string } | Array<{ name?: string }> | null };

function buildData(sheet: Sheet, quotes: DesignSheetQuote[], cover: Attachment | null, origin: string): Record<string, unknown> {
  const brand = (Array.isArray(sheet.brand) ? sheet.brand[0] : sheet.brand) as { name?: string } | null;
  const qRow = (q: DesignSheetQuote) => ({
    // ราคาที่พิมพ์ = ราคาที่เสนอจริง (offered_price) ถ้าไม่มีใช้ราคาจากตีราคา
    round: q.round, date_th: thaiDate(q.quote_date), price_th: baht(q.offered_price ?? q.price),
    status_label: QUOTE_STATUS[q.status]?.label ?? q.status, note: q.note ?? "",
  });
  const latest = quotes.length > 0 ? quotes[quotes.length - 1] : null;
  return {
    code:          sheet.code ?? "",
    name:          sheet.name ?? "",
    brand_name:    brand?.name ?? "—",
    order_date_th: thaiDate(sheet.order_date as string | null),
    deadline_th:   thaiDate(sheet.deadline as string | null),
    print_date_th: thaiDate(new Date().toISOString()),
    cover_html: cover
      ? `<img src="${esc(absUrl(cover.public_url, origin))}" style="height:130px;max-width:200px;object-fit:contain;border:1px solid #e2e8f0;border-radius:4px;" />`
      : "",
    quotes: quotes.map(qRow),
    latest: latest ? qRow(latest) : null,
  };
}

export default function PrintDesignSheetQuotePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [sheet, setSheet]       = useState<Sheet | null>(null);
  const [quotes, setQuotes]     = useState<DesignSheetQuote[]>([]);
  const [cover, setCover]       = useState<Attachment | null>(null);
  const [template, setTemplate] = useState<ReportTemplateRow | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/design-sheets/${id}`).then((r) => r.json()),
      apiFetch(`/api/design-sheets/${id}/quotes`).then((r) => r.json()),
      apiFetch(`/api/attachments?entity_type=design_sheet&entity_id=${encodeURIComponent(id)}`).then((r) => r.json()),
      apiFetch("/api/admin/report-templates?entity_type=design_sheet_quote").then((r) => r.json()),
    ])
      .then(([sRes, qRes, aRes, tRes]) => {
        if (sRes.error) throw new Error(sRes.error);
        setSheet(sRes.data as Sheet);
        if (!qRes.error) setQuotes((qRes.data ?? []) as DesignSheetQuote[]);
        if (!aRes.error) {
          const imgs = ((aRes.data ?? []) as Attachment[]).filter((a) => (a.content_type ?? "").startsWith("image/"));
          setCover(imgs.find((a) => a.is_primary) ?? imgs[0] ?? null);
        }
        const tpls = ((tRes as ReportTemplatesResponse).data ?? []).filter((t) => t.active);
        setTemplate(tpls.find((t) => t.is_default) ?? tpls[0] ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  const html = useMemo(() => {
    if (!sheet || !template) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return buildReportHtml(
      { paper_size: template.paper_size, orientation: template.orientation,
        header_html: template.header_html, body_html: template.body_html,
        footer_html: template.footer_html, custom_css: template.custom_css },
      buildData(sheet, quotes, cover, origin),
    );
  }, [sheet, quotes, cover, template]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} />
      <div className="py-6 px-4">
        {loading ? (
          <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
        ) : error || !sheet ? (
          <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบใบงาน"}</div>
        ) : !template ? (
          <div className="text-center py-20 text-amber-600">
            ⚠️ ยังไม่มี template ใบเสนอราคา (งานออกแบบ) — สร้างที่ <a href="/admin/report-templates" className="underline">Admin · Report Templates</a>
          </div>
        ) : (
          <PrintFrame html={html} />
        )}
      </div>
    </div>
  );
}
