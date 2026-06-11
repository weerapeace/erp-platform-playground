"use client";

/**
 * พิมพ์ใบสั่งตัวอย่าง (Design Sheet) — รายละเอียดงาน + รูป + comment ลูกค้า
 * ใช้ระบบ template กลาง (erp_report_templates entity_type='design_sheet') — แก้หน้าตาใบได้ที่ /admin/report-templates
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import { buildStatusMeta, type StatusMeta, type WfStatusRow } from "@/lib/design-sheets-meta";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";
import type { DesignSheetComment } from "@/app/api/design-sheets/[id]/comments/route";
import type { Attachment } from "@/app/api/attachments/route";

const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const absUrl = (u: string, origin: string) =>
  /^(https?:|data:|blob:)/i.test(u) ? u : `${origin}${u.startsWith("/") ? u : `/${u}`}`;

type Sheet = Record<string, unknown> & { brand?: { name?: string } | Array<{ name?: string }> | null };

function buildData(sheet: Sheet, comments: DesignSheetComment[], images: Attachment[], origin: string, statusMeta: StatusMeta, canvasUrl: string | null): Record<string, unknown> {
  const brand = (Array.isArray(sheet.brand) ? sheet.brand[0] : sheet.brand) as { name?: string } | null;
  const detail = String(sheet.detail ?? "").trim();
  // ภาพถ่ายกระดานวาด (CanvasSketch) — แปะไว้ในบล็อก "รายละเอียดงาน"
  const canvasImg = canvasUrl
    ? `<img src="${esc(absUrl(canvasUrl, origin))}" style="max-width:100%;max-height:320px;object-fit:contain;border:1px solid #e2e8f0;border-radius:6px;display:block;margin-bottom:6px;" />`
    : "";
  const imgTags = images
    .filter((a) => (a.content_type ?? "").startsWith("image/"))
    .map((a) => `<img src="${esc(absUrl(a.public_url, origin))}" style="height:110px;max-width:160px;object-fit:contain;border:1px solid #e2e8f0;border-radius:4px;margin:0 4px 4px 0;" />`)
    .join("");
  return {
    code:          sheet.code ?? "",
    name:          sheet.name ?? "",
    brand_name:    brand?.name ?? "—",
    status_label:  statusMeta.map[String(sheet.status ?? "")]?.label ?? String(sheet.status ?? "—"),
    order_date_th: thaiDate(sheet.order_date as string | null),
    deadline_th:   thaiDate(sheet.deadline as string | null),
    note:          sheet.note ?? "",
    detail_html:   canvasImg || detail ? `${canvasImg}${detail ? esc(detail).replace(/\n/g, "<br/>") : ""}` : "",
    images_html:   imgTags,
    comments: comments.map((c, i) => ({
      idx: i + 1,
      date_th: thaiDate(c.comment_date),
      body: c.body,
      images_html: c.images.map((u) =>
        `<img src="${esc(absUrl(u, origin))}" style="height:44px;max-width:64px;object-fit:contain;border:1px solid #e2e8f0;border-radius:3px;margin:0 2px 2px 0;" />`).join(""),
    })),
    no_comments: comments.length === 0,
  };
}

export default function PrintDesignSheetPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [sheet, setSheet]       = useState<Sheet | null>(null);
  const [comments, setComments] = useState<DesignSheetComment[]>([]);
  const [images, setImages]     = useState<Attachment[]>([]);
  const [template, setTemplate] = useState<ReportTemplateRow | null>(null);
  const [statusMeta, setStatusMeta] = useState<StatusMeta>(() => buildStatusMeta(null));
  const [canvasUrl, setCanvasUrl]   = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/design-sheets/${id}`).then((r) => r.json()),
      apiFetch(`/api/design-sheets/${id}/comments`).then((r) => r.json()),
      apiFetch(`/api/attachments?entity_type=design_sheet&entity_id=${encodeURIComponent(id)}`).then((r) => r.json()),
      apiFetch("/api/admin/report-templates?entity_type=design_sheet").then((r) => r.json()),
      apiFetch("/api/design-sheets/statuses").then((r) => r.json()),
      apiFetch(`/api/canvas-sketch?entity_type=design_sheet&entity_id=${encodeURIComponent(id)}`).then((r) => r.json()),
    ])
      .then(([sRes, cRes, aRes, tRes, stRes, cvRes]) => {
        if (sRes.error) throw new Error(sRes.error);
        setSheet(sRes.data as Sheet);
        if (!cRes.error) setComments((cRes.data ?? []) as DesignSheetComment[]);
        if (!aRes.error) setImages((aRes.data ?? []) as Attachment[]);
        if (!stRes.error) setStatusMeta(buildStatusMeta(stRes.data as WfStatusRow[]));
        if (!cvRes.error) setCanvasUrl((cvRes.data?.preview_url as string) ?? null);
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
      buildData(sheet, comments, images, origin, statusMeta, canvasUrl),
    );
  }, [sheet, comments, images, template, statusMeta, canvasUrl]);

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
            ⚠️ ยังไม่มี template ใบสั่งตัวอย่าง — สร้างที่ <a href="/admin/report-templates" className="underline">Admin · Report Templates</a>
          </div>
        ) : (
          <PrintFrame html={html} />
        )}
      </div>
    </div>
  );
}
