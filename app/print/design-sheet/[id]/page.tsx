"use client";

/**
 * พิมพ์ใบสั่งตัวอย่าง (Design Sheet) — รายละเอียดงาน + รูป + comment ลูกค้า
 * ใช้ระบบ template กลาง (erp_report_templates entity_type='design_sheet') — แก้หน้าตาใบได้ที่ /admin/report-templates
 * 2 รูปแบบ (สลับก่อนพิมพ์ · จำต่อคนใน user_ui_prefs):
 *   • แบบปกติ = เทมเพลตใน DB ตรง ๆ (รูปหลักใหญ่ · ตาราง comment รูปจิ๋ว)
 *   • เน้น Comment ลูกค้า = รูปหลักย่อเล็ก · comment เป็นการ์ด + ติ๊กเลือกรูปแนบที่จะพิมพ์ใหญ่ (lib/design-sheet-print)
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { docFileName } from "@/lib/print-filename";
import { apiFetch } from "@/lib/api";
import { buildReportHtml, buildReportImageGridHtml } from "@/lib/template";
import { withImageWidth } from "@/lib/r2-image";
import { useViewPref } from "@/lib/use-view-pref";
import { buildStatusMeta, type StatusMeta, type WfStatusRow } from "@/lib/design-sheets-meta";
import {
  DS_PRINT_MODES, DS_COMMENT_COLS, DS_COMMENT_FOCUS_BODY, DS_COMMENT_FOCUS_TEMPLATE_KEY,
  buildCommentCardsHtml, buildMainThumbsHtml, commentImageKey, selectCommentsForPrint,
  type DsPrintMode, type DsCommentCols,
} from "@/lib/design-sheet-print";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";
import type { DesignSheetComment } from "@/app/api/design-sheets/[id]/comments/route";
import type { Attachment } from "@/app/api/attachments/route";
import { sanitizeRichHtml } from "@/lib/sanitize-html";

const thaiDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const absUrl = (u: string, origin: string) =>
  /^(https?:|data:|blob:)/i.test(u) ? u : `${origin}${u.startsWith("/") ? u : `/${u}`}`;

type Sheet = Record<string, unknown> & { brand?: { name?: string } | Array<{ name?: string }> | null };

type PickedComment = ReturnType<typeof selectCommentsForPrint<DesignSheetComment>>[number];
type CommentFocus = { picked: PickedComment[]; cols: DsCommentCols };

function buildData(sheet: Sheet, comments: DesignSheetComment[], images: Attachment[], origin: string, statusMeta: StatusMeta, canvasUrl: string | null, focus: CommentFocus | null): Record<string, unknown> {
  const brand = (Array.isArray(sheet.brand) ? sheet.brand[0] : sheet.brand) as { name?: string } | null;
  const detail = sanitizeRichHtml(String(sheet.detail ?? "").trim());   // HTML จากผู้ใช้ → ล้างสคริปต์ก่อนใส่ใบพิมพ์ (ใบพิมพ์รันในหน้าเว็บเรา)
  // ภาพถ่ายกระดานวาด (CanvasSketch) — แปะไว้ในบล็อก "รายละเอียดงาน" (โหมดเน้น comment ย่อให้เตี้ยลง)
  const canvasImg = canvasUrl
    ? `<img src="${esc(absUrl(canvasUrl, origin))}" style="max-width:100%;max-height:${focus ? 180 : 320}px;object-fit:contain;border:1px solid #e2e8f0;border-radius:6px;display:block;margin-bottom:6px;" />`
    : "";
  const imageItems = images
    .filter((a) => (a.content_type ?? "").startsWith("image/"))
    .map((a) => ({
      src: absUrl(a.public_url, origin),
      alt: String(a.file_name ?? sheet.name ?? "design image"),
    }));
  return {
    code:          sheet.code ?? "",
    name:          sheet.name ?? "",
    brand_name:    brand?.name ?? "—",
    status_label:  statusMeta.map[String(sheet.status ?? "")]?.label ?? String(sheet.status ?? "—"),
    order_date_th: thaiDate(sheet.order_date as string | null),
    deadline_th:   thaiDate(sheet.deadline as string | null),
    note:          sheet.note ?? "",
    detail_html:   canvasImg || detail ? `${canvasImg}${detail}` : "",   // detail = HTML จาก RichTextEditor → ใส่ดิบ
    images_html:   buildReportImageGridHtml(imageItems, { columns: 2, maxHeightMm: 58 }),
    comments: comments.map((c, i) => ({
      idx: i + 1,
      date_th: thaiDate(c.comment_date),
      body: c.body,
      images_html: c.images.map((u) =>
        `<img src="${esc(absUrl(u, origin))}" style="height:44px;max-width:64px;object-fit:contain;border:1px solid #e2e8f0;border-radius:3px;margin:0 2px 2px 0;" />`).join(""),
    })),
    no_comments: comments.length === 0,
    // โหมดเน้น Comment ลูกค้า
    ...(focus ? {
      main_thumbs_html: buildMainThumbsHtml(imageItems),
      comment_cards_html: buildCommentCardsHtml(focus.picked.map((p) => ({
        idx: p.idx,
        date_th: thaiDate(p.comment.comment_date),
        body: p.comment.body,
        images: p.images.map((u) => absUrl(u, origin)),
      })), focus.cols),
    } : {}),
  };
}

const MAX_PRINT_IMAGES = 4;

// ช่องรูป 1 ช่องในแถบเลือก (ใช้ทั้งรูปหลักและรูปแนบ comment)
function PickTile({ src, alt, selected, disabled, order, cover, title, onClick }: {
  src: string;
  alt: string;
  selected: boolean;
  disabled?: boolean;
  order?: number;
  cover?: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition ${
        selected
          ? "border-emerald-500 ring-1 ring-emerald-200"
          : disabled
          ? "border-slate-100 opacity-40 cursor-not-allowed"
          : "border-slate-200 hover:border-emerald-300"
      }`}
    >
      <img src={withImageWidth(src, 160) ?? src} alt={alt} className="w-full h-full object-cover" loading="lazy" />
      {cover && (
        <span className="absolute top-0.5 left-0.5 text-[9px] leading-none px-1 py-0.5 rounded bg-pink-500 text-white">ปก</span>
      )}
      {selected && (
        <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">{order ?? "✓"}</span>
      )}
    </button>
  );
}

// แถบเลือกรูปที่จะพิมพ์ (screen-only, .no-print → ไม่ติดไปกับกระดาษ)
function ImagePicker({ images, selected, onToggle, max, small }: {
  images: Attachment[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  max: number;
  small?: boolean;   // โหมดเน้น comment → รูปหลักพิมพ์เป็นรูปเล็ก
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
        <div className="text-sm font-medium text-slate-700">
          🖼 {small ? "รูปหลัก (โหมดนี้พิมพ์เป็นรูปเล็กข้างรายละเอียดงาน)" : "เลือกรูปที่จะพิมพ์ในใบสั่งตัวอย่าง"}
        </div>
        <div className={`text-xs ${count >= max ? "text-amber-600" : "text-slate-500"}`}>เลือกแล้ว {count}/{max} รูป</div>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {images.map((a) => {
          const sel = selected.has(a.id);
          const disabled = !sel && count >= max;
          return (
            <PickTile
              key={a.id}
              src={a.public_url}
              alt={a.file_name}
              selected={sel}
              disabled={disabled}
              order={sel ? orderOf(a.id) : undefined}
              cover={a.is_primary}
              title={disabled ? `เลือกได้สูงสุด ${max} รูป — เอารูปอื่นออกก่อน` : sel ? "เอารูปนี้ออก" : "เลือกพิมพ์รูปนี้"}
              onClick={() => onToggle(a.id)}
            />
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">ตัวเลขบนรูป = ลำดับที่จะเรียงในใบพิมพ์ · ถ้าไม่เลือกรูปไหนเลย ใบจะไม่มีรูป</p>
    </div>
  );
}

// ปุ่มเลือกแบบแบ่งช่อง (ใช้ในแถบรูปแบบใบ)
function Seg<T extends string>({ value, options, onChange }: {
  value: T;
  options: ReadonlyArray<{ v: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`h-7 px-3 text-xs rounded-md transition ${value === o.v ? "bg-white text-slate-900 font-medium shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const MODE_OPTIONS = [
  { v: "standard", label: "📄 แบบปกติ" },
  { v: "comments", label: "💬 เน้น Comment ลูกค้า" },
] as const;
const COLS_OPTIONS = [
  { v: "1", label: "ใหญ่ (1 รูป/แถว)" },
  { v: "2", label: "กลาง (2 รูป/แถว)" },
  { v: "3", label: "เล็ก (3 รูป/แถว)" },
] as const;

// แผงเลือก comment + รูปแนบที่จะพิมพ์ (screen-only)
function CommentPicker({ comments, skipComments, skipImages, onToggleComment, onToggleImage, onSetCommentImages }: {
  comments: DesignSheetComment[];
  skipComments: Set<string>;
  skipImages: Set<string>;
  onToggleComment: (id: string) => void;
  onToggleImage: (key: string) => void;
  onSetCommentImages: (c: DesignSheetComment, on: boolean) => void;
}) {
  const included = comments.filter((c) => !skipComments.has(c.id));
  const imgTotal = included.reduce((n, c) => n + c.images.filter((u) => !skipImages.has(commentImageKey(c.id, u))).length, 0);
  return (
    <div className="no-print mx-auto mb-4 max-w-[840px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-sm font-medium text-slate-700">💬 เลือก Comment และรูปแนบที่จะพิมพ์</div>
        <div className="text-xs text-slate-500">พิมพ์ {included.length}/{comments.length} comment · รูปแนบ {imgTotal} รูป</div>
      </div>
      {comments.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">ใบงานนี้ยังไม่มี comment ลูกค้า — เพิ่มได้ในป๊อปใบงาน แท็บ Comment</p>
      ) : (
        <div className="space-y-2">
          {comments.map((c, i) => {
            const on = !skipComments.has(c.id);
            const selCount = c.images.filter((u) => !skipImages.has(commentImageKey(c.id, u))).length;
            return (
              <div key={c.id} className={`rounded-lg border p-2 ${on ? "border-slate-200" : "border-dashed border-slate-200 bg-slate-50"}`}>
                <div className="flex items-start gap-2">
                  <label className="flex items-start gap-2 min-w-0 flex-1 cursor-pointer">
                    <input type="checkbox" checked={on} onChange={() => onToggleComment(c.id)} className="mt-0.5 accent-emerald-600" />
                    <span className={`text-xs min-w-0 ${on ? "text-slate-700" : "text-slate-400 line-through"}`}>
                      <b>#{i + 1}</b> · {thaiDate(c.comment_date)}
                      <span className="block line-clamp-2 whitespace-pre-line">{c.body || "(ไม่มีข้อความ)"}</span>
                    </span>
                  </label>
                  {on && c.images.length > 0 && (
                    <div className="shrink-0 flex items-center gap-1.5 text-[11px]">
                      <span className="text-slate-400">รูป {selCount}/{c.images.length}</span>
                      <button type="button" onClick={() => onSetCommentImages(c, true)} className="px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">ทุกรูป</button>
                      <button type="button" onClick={() => onSetCommentImages(c, false)} className="px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">ไม่เอารูป</button>
                    </div>
                  )}
                </div>
                {on && c.images.length > 0 && (
                  <div className="mt-2 grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
                    {c.images.map((u, j) => {
                      const key = commentImageKey(c.id, u);
                      const sel = !skipImages.has(key);
                      return (
                        <PickTile
                          key={key}
                          src={u}
                          alt={`รูปแนบ comment ${i + 1} รูปที่ ${j + 1}`}
                          selected={sel}
                          title={sel ? "เอารูปนี้ออกจากใบพิมพ์" : "พิมพ์รูปนี้"}
                          onClick={() => onToggleImage(key)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-2">ติ๊กออก = ไม่พิมพ์ comment นั้น · กดที่รูป = เลือก/เอาออกทีละรูป (รูปที่มี ✓ จะพิมพ์ขนาดใหญ่ใต้ข้อความ)</p>
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
  const [focusTemplate, setFocusTemplate] = useState<ReportTemplateRow | null>(null);   // เทมเพลตโหมดเน้น comment ใน DB (ถ้ามี)
  const [statusMeta, setStatusMeta] = useState<StatusMeta>(() => buildStatusMeta(null));
  const [canvasUrl, setCanvasUrl]   = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [selImageIds, setSelImageIds] = useState<Set<string> | null>(null); // null = ยังไม่ตั้งค่าเริ่มต้น
  // โหมดเน้น comment: เก็บแบบ "ตัดออก" → ค่าเริ่มต้น = พิมพ์ครบทุก comment ทุกรูป
  const [skipComments, setSkipComments] = useState<Set<string>>(() => new Set());
  const [skipCommentImages, setSkipCommentImages] = useState<Set<string>>(() => new Set());

  // รูปแบบใบ + ขนาดรูปใน comment — จำต่อคน (ใช้ครั้งไหนจำครั้งนั้น)
  const modePref = useViewPref<DsPrintMode>("ds_print_mode", DS_PRINT_MODES, "standard");
  const colsPref = useViewPref<DsCommentCols>("ds_print_comment_cols", DS_COMMENT_COLS, "2");
  const mode = modePref.view;
  const cols = colsPref.view;
  const changeMode = (v: DsPrintMode) => { modePref.setView(v); void modePref.saveDefault(v); };
  const changeCols = (v: DsCommentCols) => { colsPref.setView(v); void colsPref.saveDefault(v); };

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

  const toggleIn = (set: (fn: (prev: Set<string>) => Set<string>) => void) => (key: string) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const toggleComment = toggleIn(setSkipComments);
  const toggleCommentImage = toggleIn(setSkipCommentImages);
  const setCommentImages = (c: DesignSheetComment, on: boolean) =>
    setSkipCommentImages((prev) => {
      const next = new Set(prev);
      for (const u of c.images) {
        const key = commentImageKey(c.id, u);
        if (on) next.delete(key); else next.add(key);
      }
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
        const active = ((tRes as ReportTemplatesResponse).data ?? []).filter((t) => t.active);
        const tpls = active.filter((t) => t.template_key !== DS_COMMENT_FOCUS_TEMPLATE_KEY);
        setTemplate(tpls.find((t) => t.is_default) ?? tpls[0] ?? null);
        setFocusTemplate(active.find((t) => t.template_key === DS_COMMENT_FOCUS_TEMPLATE_KEY) ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  const focus = useMemo<CommentFocus | null>(
    () => (mode === "comments" ? { picked: selectCommentsForPrint(comments, skipComments, skipCommentImages), cols } : null),
    [mode, comments, skipComments, skipCommentImages, cols],
  );

  const html = useMemo(() => {
    if (!sheet || !template) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    // โหมดเน้น comment: ใช้เทมเพลต comment_focus ใน DB ถ้ามี ไม่งั้นยืมหัว/ท้ายใบ + CSS ของตัวหลัก แล้วเปลี่ยนแค่เนื้อกลาง
    const tpl = focus ? (focusTemplate ?? { ...template, body_html: DS_COMMENT_FOCUS_BODY }) : template;
    return buildReportHtml(
      { paper_size: tpl.paper_size, orientation: tpl.orientation,
        header_html: tpl.header_html, body_html: tpl.body_html,
        footer_html: tpl.footer_html, custom_css: tpl.custom_css },
      buildData(sheet, comments, selectedImages, origin, statusMeta, canvasUrl, focus),
    );
  }, [sheet, comments, selectedImages, template, focusTemplate, statusMeta, canvasUrl, focus]);

  const fileName = docFileName("ใบสั่งตัวอย่าง", sheet ? String(sheet.code ?? "") : null);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} fileName={fileName} />
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
            <div className="no-print mx-auto mb-4 max-w-[840px] flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">รูปแบบใบ</span>
                <Seg value={mode} options={MODE_OPTIONS} onChange={changeMode} />
              </div>
              {mode === "comments" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">ขนาดรูปใน Comment</span>
                  <Seg value={cols} options={COLS_OPTIONS} onChange={changeCols} />
                </div>
              )}
            </div>
            {imageAtts.length > 0 && (
              <ImagePicker images={imageAtts} selected={selImageIds ?? new Set()} onToggle={toggleImage} max={MAX_PRINT_IMAGES} small={mode === "comments"} />
            )}
            {mode === "comments" && (
              <CommentPicker
                comments={comments}
                skipComments={skipComments}
                skipImages={skipCommentImages}
                onToggleComment={toggleComment}
                onToggleImage={toggleCommentImage}
                onSetCommentImages={setCommentImages}
              />
            )}
            <PrintFrame html={html} fileName={fileName} />
          </>
        )}
      </div>
    </div>
  );
}
