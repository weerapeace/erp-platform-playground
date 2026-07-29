"use client";

/**
 * พิมพ์ใบสั่งตัวอย่าง (Design Sheet) — รายละเอียดงาน + รูป + comment ลูกค้า
 * ใช้ระบบ template กลาง (erp_report_templates entity_type='design_sheet') — แก้หน้าตาใบได้ที่ /admin/report-templates
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { docFileName } from "@/lib/print-filename";
import { apiFetch } from "@/lib/api";
import { buildReportHtml, buildReportImageGridHtml } from "@/lib/template";
import { withImageWidth } from "@/lib/r2-image";
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
  const imgTags = buildReportImageGridHtml(
    images
      .filter((a) => (a.content_type ?? "").startsWith("image/"))
      .map((a) => ({
        src: absUrl(a.public_url, origin),
        alt: String(a.file_name ?? sheet.name ?? "design image"),
      })),
    { columns: 2, maxHeightMm: 58 },
  );
  return {
    code:          sheet.code ?? "",
    name:          sheet.name ?? "",
    brand_name:    brand?.name ?? "—",
    status_label:  statusMeta.map[String(sheet.status ?? "")]?.label ?? String(sheet.status ?? "—"),
    order_date_th: thaiDate(sheet.order_date as string | null),
    deadline_th:   thaiDate(sheet.deadline as string | null),
    note:          sheet.note ?? "",
    detail_html:   canvasImg || detail ? `${canvasImg}${detail}` : "",   // detail = HTML จาก RichTextEditor → ใส่ดิบ
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

const MAX_PRINT_IMAGES = 4;

// แถบเลือกรูปที่จะพิมพ์ (screen-only, .no-print → ไม่ติดไปกับกระดาษ)
function ImagePicker({ images, selected, onToggle, max }: {
  images: Attachment[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  max: number;
}) {
  const count = selected.size;
  // ลำดับที่จะเรียงในใบพิมพ์ = ตามลำดับรูปในคลังเฉพาะตัวที่ถูกเลือก
  const orderOf = (id: string) => {
    let n = 0;
    for (const a of images) { if (selected.has(a.id)) { n++; if (a.id === id) return n; } }
    return 0;
  };
  return (
    <div className="no-print mx-auto mb-4 max-w-[840px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-sm font-medium text-slate-700">🖼 เลือกรูปที่จะพิมพ์ในใบสั่งตัวอย่าง</div>
        <div className={`text-xs ${count >= max ? "text-amber-600" : "text-slate-500"}`}>เลือกแล้ว {count}/{max} รูป</div>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {images.map((a) => {
          const sel = selected.has(a.id);
          const disabled = !sel && count >= max;
          const ord = sel ? orderOf(a.id) : 0;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onToggle(a.id)}
              disabled={disabled}
              title={disabled ? `เลือกได้สูงสุด ${max} รูป — เอารูปอื่นออกก่อน` : sel ? "เอารูปนี้ออก" : "เลือกพิมพ์รูปนี้"}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 transition ${
                sel
                  ? "border-emerald-500 ring-1 ring-emerald-200"
                  : disabled
                  ? "border-slate-100 opacity-40 cursor-not-allowed"
                  : "border-slate-200 hover:border-emerald-300"
              }`}
            >
              <img
                src={withImageWidth(a.public_url, 160) ?? a.public_url}
                alt={a.file_name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {a.is_primary && (
                <span className="absolute top-0.5 left-0.5 text-[9px] leading-none px-1 py-0.5 rounded bg-pink-500 text-white">ปก</span>
              )}
              {sel && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">{ord}</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">ตัวเลขบนรูป = ลำดับที่จะเรียงในใบพิมพ์ · ถ้าไม่เลือกรูปไหนเลย ใบจะไม่มีรูป</p>
    </div>
  );
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
  const [selImageIds, setSelImageIds] = useState<Set<string> | null>(null); // null = ยังไม่ตั้งค่าเริ่มต้น

  // เฉพาะไฟล์รูป (เอาไปให้เลือกพิมพ์)
  const imageAtts = useMemo(
    () => images.filter((a) => (a.content_type ?? "").startsWith("image/")),
    [images],
  );

  // ตั้งค่าเริ่มต้น (ทำครั้งเดียว): เลือกรูปปกก่อน แล้วเติมรูปแรก ๆ จนครบ 4
  useEffect(() => {
    if (selImageIds !== null || imageAtts.length === 0) return;
    const ordered = [...imageAtts].sort((x, y) => Number(y.is_primary) - Number(x.is_primary));
    setSelImageIds(new Set(ordered.slice(0, MAX_PRINT_IMAGES).map((a) => a.id)));
  }, [imageAtts, selImageIds]);

  // รูปที่จะพิมพ์จริง — เรียงตามลำดับในคลัง เฉพาะตัวที่ถูกเลือก
  const selectedImages = useMemo(
    () => (selImageIds ? imageAtts.filter((a) => selImageIds.has(a.id)) : []),
    [imageAtts, selImageIds],
  );

  const toggleImage = (id: string) =>
    setSelImageIds((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_PRINT_IMAGES) next.add(id);
      return next;
    });

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
      buildData(sheet, comments, selectedImages, origin, statusMeta, canvasUrl),
    );
  }, [sheet, comments, selectedImages, template, statusMeta, canvasUrl]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} fileName={docFileName("ใบสั่งตัวอย่าง", sheet ? String(sheet.code ?? "") : null)} />
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
          <>
            {imageAtts.length > 0 && (
              <ImagePicker images={imageAtts} selected={selImageIds ?? new Set()} onToggle={toggleImage} max={MAX_PRINT_IMAGES} />
            )}
            <PrintFrame html={html} fileName={docFileName("ใบสั่งตัวอย่าง", sheet ? String(sheet.code ?? "") : null)} />
          </>
        )}
      </div>
    </div>
  );
}
