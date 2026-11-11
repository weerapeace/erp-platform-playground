"use client";

/**
 * DesignSheetMobileView — หน้ารายละเอียดใบงานออกแบบ "แบบหน้าเต็ม" สำหรับมือถือ/แท็บเล็ต (ของกลาง)
 *
 * ทำไมไม่ใช้ป๊อปอัปเดิม: ป๊อปอัป design-sheet-detail ออกแบบไว้สำหรับจอคอม (2 คอลัมน์ + 4 แท็บ + ตารางตีราคา)
 * บนมือถือต้องซูม/เลื่อนหาปุ่ม → หน้านี้จัดใหม่เป็นแอปมือถือ: รูปใหญ่ปัดดูได้ · สถานะ/กำหนดส่ง/โน้ตแก้ได้ทันที
 * · Comment ลูกค้าเป็นไทม์ไลน์ + พิมพ์เพิ่มได้ · งานหนัก (ตีราคา/เสนอราคา/Parent SKU) ส่งต่อไปป๊อปอัปเต็มด้วยปุ่ม "แก้ไขเต็ม"
 *
 * ใช้ API เดิมทั้งหมด (ไม่มี query ใหม่): /api/design-sheets/[id] (+ /images /comments /cost-lines /quotes) และ /statuses
 * มือถือ = คอลัมน์เดียว · แท็บเล็ต/จอคอม = รูปซ้าย เนื้อหาขวา (ตัดสินด้วย layout ของ device-view ให้พรีวิวตรง)
 */
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { copyText } from "@/components/copy-button";
import type { DesignSheetImage } from "@/app/api/design-sheets/[id]/images/route";
import type { DesignSheetComment } from "@/app/api/design-sheets/[id]/comments/route";
import type { DesignSheetQuote } from "@/app/api/design-sheets/[id]/quotes/route";
import type { CostLine } from "@/app/api/design-sheets/[id]/cost-lines/route";
import { apiFetch } from "@/lib/api";
import { buildStatusMeta, isOwnBrandJob, nextOpenStatus, QUOTE_STATUS, QUOTE_STATUS_OPTS, type WfStatusRow } from "@/lib/design-sheets-meta";
import { withImageWidth } from "@/lib/r2-image";
import { usePermission } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ImageLightbox } from "@/components/image-lightbox";
import { useViewportLayout, useDeviceMode, DevicePreviewFrame, DEVICE_PARAM } from "@/components/device-view";
import { QuoteRounds } from "@/components/design-sheet-detail/quote-rounds";
import { SheetQuotations } from "@/components/design-sheet-detail/sheet-quotations";
import { RecordChecklist } from "@/components/record-tasks";
import { DesignStatusSheet } from "./status-sheet";
import { Icon } from "@/components/icon";
import { ScrollTabs } from "@/components/scroll-tabs";
import { BottomSheet } from "@/components/modal";
import { BlockLayoutEditor, BlockLayoutRows, useBlockLayout, type BlockDef } from "@/components/block-layout";
import { askConfirm } from "@/components/modal/ask-dialog";
import { DriveUploadBox } from "@/components/drive-upload-box";
import { fetchSheetDriveFolder, startSheetDriveUpload } from "@/lib/design-sheet-drive-client";
import { DESIGN_WAITING } from "@/lib/design-sheet-waiting";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { costTabLabel, generalLabelOf } from "@/lib/design-sheet-cost-labels";
import { useT } from "@/components/i18n";
import { tr, getLang } from "@/lib/lang";
import { usePageOwnsBottomBar } from "@/lib/app-shell-bar";

// ป๊อปอัปเต็ม (ของกลางเดิม) โหลดเฉพาะตอนกด "แก้ไขเต็ม"
const DesignSheetDetail = dynamic(() => import("@/components/design-sheet-detail").then((m) => m.DesignSheetsDetail), { ssr: false });
// drawer ดู SKU / Parent SKU (ของกลาง master-crud) โหลดเฉพาะตอนแตะ
const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });
// 🧮 แท็บตีราคาแบบมือถือ (แก้ได้) — โหลดเฉพาะตอนเปิดแท็บ
const MobileCostTab = dynamic(() => import("./cost-tab").then((m) => m.MobileCostTab), { ssr: false });
// แผงใบนำเสนอ A4 (มือถือ = เต็มจอ)
const DesignSheetPresentPanel = dynamic(() => import("@/components/design-sheet-present").then((m) => m.DesignSheetPresentPanel), { ssr: false });

type CostExtra = { label: string; amount: number };
// ค่าใช้จ่ายเพิ่ม (ค่าแรง/โสหุ้ย) เก็บได้ 2 แบบ: array (เดิม = ทั่วไป) หรือ object แยกตาม Parent — แปลงเป็น map เหมือนป๊อปอัปเต็ม
function parseCostExtra(raw: unknown): Record<string, CostExtra[]> {
  const norm = (a: unknown): CostExtra[] => (Array.isArray(a) ? a : []).map((c) => ({ label: String((c as CostExtra)?.label ?? ""), amount: Number((c as CostExtra)?.amount) || 0 }));
  if (raw && !Array.isArray(raw) && typeof raw === "object") {
    const out: Record<string, CostExtra[]> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = norm(v);
    return out;
  }
  return { "": norm(raw) };
}

type Sheet = {
  id: string; code: string; name: string; status: string;
  brand_id: string | null; brand: { name: string; color: string | null; is_customer_job?: boolean | null } | null;
  order_date: string | null; deadline: string | null; appointment_date: string | null;
  waiting_for?: string | null;   // ⏳ รออะไรอยู่ (พิมพ์เอง)
  drive_link: string | null; note: string | null; detail: string | null;
  parent_sku_refs: { code: string; id: string }[]; parent_sku_drafts?: string[] | null;
  linked_skus: { id: string; code: string; name_th: string | null; color: string | null; image_key: string | null; is_active: boolean; parent_code: string | null; from_sheet: boolean }[];
  updated_at: string;
  cost_extra?: unknown;   // ค่าใช้จ่ายเพิ่ม (ค่าแรง/โสหุ้ย) — array หรือ map ต่อ Parent
  cost_general_label?: string | null;   // ชื่อแท็บตีราคา "ทั่วไป" ที่ตั้งเอง
  cost_restricted?: boolean;   // API บอก: คนนี้ไม่มีสิทธิ์เห็นต้นทุน → ไม่มีแท็บตีราคา
};
type SheetTab = "overview" | "cost" | "quote" | "chat" | "files";

/** 🧱 กล่องในแท็บภาพรวม (ลำดับ = ค่าเริ่มต้น) — ทีม/แต่ละคนจัดลำดับ · เปิด/ปิด · เต็ม/ครึ่ง เองได้ (ของกลาง components/block-layout · เจ้าของสั่ง 2026-11-11)
 *  ครึ่ง 2 กล่องติดกัน = วางคู่ในแถวเดียว · เพิ่มกล่องใหม่ = เพิ่มที่นี่ + ใน renderBlock (คนที่จัดไว้แล้วจะเห็นกล่องใหม่ต่อท้าย) */
const DS_BLOCKS = (): BlockDef[] => [
  { key: "gallery", label: tr("รูปงาน", "Job images"), icon: "image", hint: tr("แท็บเล็ต = อยู่คอลัมน์ซ้าย", "Tablet: left column") },
  { key: "status", label: tr("สถานะ + กำหนดส่ง", "Status + deadline"), icon: "flag" },
  { key: "waiting", label: tr("รออะไรอยู่", "Waiting for"), icon: "waiting" },
  { key: "cost", label: tr("ต้นทุน/ใบ", "Cost/unit"), icon: "calc", sizes: ["half", "full"] },
  { key: "quote", label: tr("เสนอราคา", "Quote"), icon: "receipt", sizes: ["half", "full"] },
  { key: "note", label: tr("โน้ต", "Note"), icon: "note" },
  { key: "detail", label: tr("รายละเอียดงาน", "Job details"), icon: "document" },
  { key: "sku", label: "SKU", icon: "tag", sizes: ["half", "full"], hint: tr("แตะ = กางดู SKU", "Tap to view SKUs") },
  { key: "dates", label: tr("วันที่สั่ง / นัดลูกค้า", "Order / appointment"), icon: "calendar", sizes: ["half", "full"] },
  { key: "links", label: tr("Parent SKU + ไฟล์ Drive", "Parent SKU + Drive"), icon: "link" },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const money = (n: number | null | undefined) => (n == null ? "—" : `฿${Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`);
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const t = new Date(`${d}T00:00:00`);
  return Number.isNaN(t.getTime()) ? d : new Intl.DateTimeFormat(getLang() === "en" ? "en-GB" : "th-TH", { day: "numeric", month: "short", year: "2-digit" }).format(t);
};
function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
function deadlineChip(deadline: string | null, finished: boolean): { text: string; cls: string } {
  if (finished) return { text: tr("ปิดงานแล้ว", "Closed"), cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  const d = daysUntil(deadline);
  if (d === null) return { text: tr("ยังไม่กำหนดส่ง", "No deadline"), cls: "bg-slate-50 text-slate-500 border-slate-200" };
  if (d < 0) return { text: tr(`เกินกำหนด ${Math.abs(d)} วัน`, `${Math.abs(d)}d overdue`), cls: "bg-rose-50 text-rose-700 border-rose-200" };
  if (d === 0) return { text: tr("ส่งวันนี้", "Due today"), cls: "bg-rose-50 text-rose-700 border-rose-200" };
  if (d <= 2) return { text: d === 1 ? tr("ส่งพรุ่งนี้", "Due tomorrow") : tr(`อีก ${d} วัน`, `In ${d} days`), cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { text: tr(`อีก ${d} วัน`, `In ${d} days`), cls: "bg-slate-50 text-slate-600 border-slate-200" };
}

async function readJson<T>(r: Response, fallback: string): Promise<T> {
  const j = await r.json() as T & { error?: string | null };
  if (!r.ok || j.error) throw new Error(j.error || fallback);
  return j;
}

export function DesignSheetMobileView({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const viewport = useViewportLayout();
  const { mode, layout } = useDeviceMode(viewport);
  const isPhone = layout === "phone";
  usePageOwnsBottomBar(isPhone);   // มือถือมีแถบล่างของตัวเอง → เชลล์แอปเดี่ยวซ่อนแถบเมนูแอป (lib/app-shell-bar)

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [statusRows, setStatusRows] = useState<WfStatusRow[]>([]);
  const [images, setImages] = useState<DesignSheetImage[]>([]);
  const [comments, setComments] = useState<DesignSheetComment[]>([]);
  const [costLines, setCostLines] = useState<CostLine[]>([]);
  const [quotes, setQuotes] = useState<DesignSheetQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [imgIdx, setImgIdx] = useState(0);           // รูปที่ปัดถึง (นับ 1/N)
  const [lightbox, setLightbox] = useState(-1);      // -1 = ปิด
  const [statusSheet, setStatusSheet] = useState(false);   // แผ่นเลือกสถานะ (เลื่อนขึ้นจากล่าง)
  const [saving, setSaving] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);     // รายละเอียดงานยาว → กางดูทั้งหมด
  const [newComment, setNewComment] = useState("");
  const [commentDate, setCommentDate] = useState(todayStr());
  const [editOpen, setEditOpen] = useState(false);         // ป๊อปอัปเต็ม
  const [presentOpen, setPresentOpen] = useState(false);   // แผงใบนำเสนอ A4
  const stripRef = useRef<HTMLDivElement>(null);
  const [skuDrawer, setSkuDrawer] = useState<{ moduleKey: string; id: string } | null>(null);   // drawer ดู SKU/Parent
  // แท็บของหน้า · ตีราคาคงไว้หลังเปิดครั้งแรก (มีแก้ค้าง = ถามก่อนออก) · SKU กางในภาพรวม
  const [tab, setTab] = useState<SheetTab>("overview");
  const [costMounted, setCostMounted] = useState(false);
  const [costDirty, setCostDirty] = useState(false);
  const [skuOpen, setSkuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);       // เมนู ⋯ (ปุ่มรองบนหัว ย้ายมารวมที่นี่)
  const [layoutOpen, setLayoutOpen] = useState(false);   // แผ่น "จัดหน้า" (ของกลาง block-layout)
  const lang = getLang();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const blockDefs = useMemo(() => DS_BLOCKS(), [lang]);
  const blockLayout = useBlockLayout("design_sheet_mobile", blockDefs);
  useEffect(() => { if (tab === "cost") setCostMounted(true); }, [tab]);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  // 📁 โฟลเดอร์ Drive ของใบ — หาเมื่อเปิดแท็บไฟล์ครั้งแรก (ไม่เจอ = สร้างตอนอัปไฟล์แรก)
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null);
  const driveAsked = useRef<string | null>(null);
  useEffect(() => {
    if (tab !== "files" || !sheet?.id || driveAsked.current === sheet.id) return;
    driveAsked.current = sheet.id;
    let alive = true;
    void fetchSheetDriveFolder(sheet.id).then((u) => { if (alive) setDriveFolderUrl(u); });
    return () => { alive = false; };
  }, [tab, sheet?.id]);
  /** ออกจากตีราคาที่แก้ค้าง (ย้อนกลับ / เปิดหน้าเต็ม) = ถามก่อน */
  const confirmLeaveCost = async () => !costDirty || askConfirm({
    title: t("ตีราคายังไม่ได้บันทึก", "Costing isn't saved"), message: t("ออกตอนนี้ ที่แก้ไว้จะหาย", "If you leave now, your changes are lost"),
    variant: "danger", confirmText: t("ออกโดยไม่บันทึก", "Leave without saving"), cancelText: t("อยู่ต่อ", "Stay"),
  });
  const openFull = async () => { if (await confirmLeaveCost()) { setCostDirty(false); setEditOpen(true); } };

  // โหลดข้อมูล: ชุดหลักก่อน (ใบงาน+สถานะ+รูป) แล้วค่อยชุดรอง (comment/ตีราคา/เสนอราคา) — ไม่ยิงพร้อมกัน 6 เส้น
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true); setError(null);
    (async () => {
      const [s, st, im] = await Promise.all([
        apiFetch(`/api/design-sheets/${encodeURIComponent(id)}`).then((r) => readJson<{ data: Sheet }>(r, tr("โหลดใบงานไม่สำเร็จ", "Failed to load design sheet"))),
        apiFetch("/api/design-sheets/statuses").then((r) => readJson<{ data: WfStatusRow[] }>(r, tr("โหลดสถานะไม่สำเร็จ", "Failed to load statuses"))),
        apiFetch(`/api/design-sheets/${encodeURIComponent(id)}/images`).then((r) => r.ok ? r.json() as Promise<{ data: DesignSheetImage[] }> : { data: [] }).catch(() => ({ data: [] })),
      ]);
      if (!alive) return;
      setSheet(s.data); setStatusRows(st.data); setImages(Array.isArray(im.data) ? im.data : []); setNote(s.data.note ?? "");
      setLoading(false);
      const [cm, cl, qt] = await Promise.all([
        apiFetch(`/api/design-sheets/${encodeURIComponent(id)}/comments`).then((r) => r.ok ? r.json() as Promise<{ data: DesignSheetComment[] }> : { data: [] }).catch(() => ({ data: [] })),
        apiFetch(`/api/design-sheets/${encodeURIComponent(id)}/cost-lines`).then((r) => r.ok ? r.json() as Promise<{ data: CostLine[] }> : { data: [] }).catch(() => ({ data: [] })),
        apiFetch(`/api/design-sheets/${encodeURIComponent(id)}/quotes`).then((r) => r.ok ? r.json() as Promise<{ data: DesignSheetQuote[] }> : { data: [] }).catch(() => ({ data: [] })),
      ]);
      if (!alive) return;
      setComments(Array.isArray(cm.data) ? cm.data : []); setCostLines(Array.isArray(cl.data) ? cl.data : []); setQuotes(Array.isArray(qt.data) ? qt.data : []);
    })().catch((e) => { if (alive) { setError(e instanceof Error ? e.message : tr("โหลดไม่สำเร็จ", "Failed to load")); setLoading(false); } });
    return () => { alive = false; };
  }, [id, reloadKey]);

  const statusMeta = useMemo(() => buildStatusMeta(statusRows), [statusRows]);
  const finished = sheet ? statusMeta.finished.has(sheet.status) : false;
  const statusColor = sheet ? (statusMeta.colorHex[sheet.status] ?? "#94a3b8") : "#94a3b8";
  const statusLabel = sheet ? (statusMeta.map[sheet.status]?.label ?? sheet.status) : "";
  const brandColor = sheet?.brand?.color && /^#[0-9a-fA-F]{6}$/.test(sheet.brand.color) ? sheet.brand.color : "#94a3b8";
  const latestQuote = quotes.length ? quotes[quotes.length - 1] : null;
  const lightboxImages = images.map((im) => ({ url: im.url, label: im.source_label }));

  // บันทึกฟิลด์เดี่ยว (สถานะ / กำหนดส่ง / โน้ต) — optimistic + toast
  async function patchField(patch: Record<string, unknown>, label: string, opts: { silent?: boolean } = {}): Promise<boolean> {
    if (!sheet || !canEdit) return false;
    const prev = sheet;
    setSaving(label);
    setSheet({ ...sheet, ...patch } as Sheet);
    try {
      const r = await apiFetch(`/api/design-sheets/${encodeURIComponent(sheet.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const j = await r.json() as { error?: string | null };
      if (!r.ok || j.error) throw new Error(j.error || tr(`บันทึก${label}ไม่สำเร็จ`, `Failed to save ${label.toLowerCase()}`));
      if (!opts.silent) toast.success(tr(`บันทึก${label}แล้ว`, `${label} saved`));
      return true;
    } catch (e) {
      setSheet(prev);
      toast.error(e instanceof Error ? e.message : tr(`บันทึก${label}ไม่สำเร็จ`, `Failed to save ${label.toLowerCase()}`));
      return false;
    } finally { setSaving(null); }
  }

  // ปุ่ม "ส่งต่อ" (แถบล่าง): ขั้นถัดไปตาม workflow ที่ยังเปิดอยู่ — ไม่แนะนำสถานะปิดงาน (กฎกลาง nextOpenStatus)
  //   กดพลาด = "ย้อนกลับ" ในแถบแจ้ง 10 วิ · ปิดงาน/ข้ามขั้น = เลือกเองในแผ่นเปลี่ยนสถานะ
  const nextStatus = sheet ? nextOpenStatus(statusMeta, isOwnBrandJob(sheet.brand), sheet.status) : null;
  async function advance() {
    if (!sheet || !nextStatus) return;
    const from = sheet.status, fromLabel = statusLabel;
    const ok = await patchField({ status: nextStatus[0] }, t("สถานะ", "Status"), { silent: true });
    if (ok) toast.action(t(`ย้ายไป "${nextStatus[1]}" แล้ว`, `Moved to "${nextStatus[1]}"`), t("ย้อนกลับ", "Undo"),
      // ย้อนไม่สำเร็จ = โหลดใบใหม่ (ปุ่มนี้ถือข้อมูลใบตอนก่อนกด — ไม่ให้จอโชว์สถานะไม่ตรงกับที่บันทึกจริง)
      () => void patchField({ status: from }, t("สถานะ", "Status"), { silent: true }).then((back) => {
        if (back) toast.info(t(`กลับเป็น "${fromLabel}" แล้ว`, `Back to "${fromLabel}"`)); else setReloadKey((k) => k + 1);
      }));
  }

  async function sendComment() {
    const text = newComment.trim();
    if (!sheet || !text) return;
    setSaving("comment");
    try {
      const r = await apiFetch(`/api/design-sheets/${encodeURIComponent(sheet.id)}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text, comment_date: commentDate }) });
      const j = await r.json() as { error?: string | null };
      if (!r.ok || j.error) throw new Error(j.error || tr("บันทึก comment ไม่สำเร็จ", "Failed to save comment"));
      setNewComment("");
      const cm = await apiFetch(`/api/design-sheets/${encodeURIComponent(sheet.id)}/comments`).then((x) => x.json() as Promise<{ data: DesignSheetComment[] }>);
      setComments(Array.isArray(cm.data) ? cm.data : []);
      toast.success(tr("เพิ่ม comment แล้ว", "Comment added"));
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("บันทึก comment ไม่สำเร็จ", "Failed to save comment")); }
    finally { setSaving(null); }
  }

  async function reloadQuotes() {
    if (!sheet) return;
    const qt = await apiFetch(`/api/design-sheets/${encodeURIComponent(sheet.id)}/quotes`).then((x) => x.json() as Promise<{ data: DesignSheetQuote[] }>);
    setQuotes(Array.isArray(qt.data) ? qt.data : []);
  }

  const goBack = async () => {
    if (!(await confirmLeaveCost())) return;
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(`/master/design-dashboard${mode === "auto" ? "" : `?${DEVICE_PARAM}=${mode}`}`);
  };
  const onStripScroll = () => {
    const el = stripRef.current; if (!el || el.clientWidth === 0) return;
    setImgIdx(Math.round(el.scrollLeft / el.clientWidth));
  };

  // ── ส่วนรูป (ปัดดู + นับ 1/N + แตะดูเต็มจอ) ──
  const hero = (
    <div className="relative overflow-hidden bg-slate-100">
      {images.length === 0 ? (
        <div className="flex aspect-square w-full items-center justify-center text-sm text-slate-400">{t("ยังไม่มีรูปงาน", "No job images yet")}</div>
      ) : (
        <div ref={stripRef} onScroll={onStripScroll} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]">
          {images.map((im, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={im.key} src={withImageWidth(im.url, 900) ?? im.url} alt={im.source_label} loading={i === 0 ? "eager" : "lazy"}
              onClick={() => setLightbox(i)}
              className="aspect-square w-full shrink-0 snap-center cursor-zoom-in object-contain" />
          ))}
        </div>
      )}
      {images.length > 1 && (
        <>
          <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">{imgIdx + 1} / {images.length}</span>
          <div className="pointer-events-none absolute bottom-3 left-0 right-0 flex justify-center gap-1">
            {images.map((im, i) => <span key={im.key} className={`h-1.5 rounded-full transition-all ${i === imgIdx ? "w-4 bg-white" : "w-1.5 bg-white/60"}`} />)}
          </div>
        </>
      )}
      {images[imgIdx] && <span className="absolute left-2 top-2 rounded-md bg-white/85 px-1.5 py-0.5 text-[10px] text-slate-600">{images[imgIdx].source_label}</span>}
    </div>
  );

  const sectionCls = "rounded-2xl border border-slate-200 bg-white p-3";
  const dl = sheet ? deadlineChip(sheet.deadline, finished) : null;

  // ── ตีราคา: แท็บของตัวเอง (MobileCostTab — แก้บนมือถือได้) · ตรงนี้เก็บเฉพาะที่ภาพรวม/เสนอราคาใช้ ──
  const costExtraMap = useMemo(() => parseCostExtra(sheet?.cost_extra), [sheet?.cost_extra]);
  const costParents = useMemo(() => {   // แท็บ Parent ที่มีข้อมูล ("" = ทั่วไป มาก่อน)
    const s = new Set<string>([""]);
    for (const l of costLines) s.add(l.parent_code ?? "");
    for (const k of Object.keys(costExtraMap)) s.add(k);
    return Array.from(s);
  }, [costLines, costExtraMap]);
  const editFullBtn = (label: string) => (
    <button type="button" onClick={() => void openFull()} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700"><Icon name="edit" /> {label}</button>
  );

  // ── เสนอราคา: การ์ดต่อครั้ง (ไซส์ × ขั้นจำนวน) ชุดเดียวกับหน้าเต็ม — components/design-sheet-detail/quote-rounds.tsx ──
  // ตีราคาปัจจุบันของไซส์ (วัสดุ + ค่าใช้จ่ายเพิ่ม) — ให้การ์ดเทียบ "ตีราคา → ปัจจุบัน"
  const costTotalFor = (key: string) =>
    costLines.filter((l) => (l.parent_code ?? "") === key).reduce((n, l) => n + (Number(l.amount) || 0), 0)
    + (costExtraMap[key] ?? []).reduce((n, c) => n + (Number(c.amount) || 0), 0);
  const quoteSection = (
    <div className="space-y-2">
      {/* ใบเสนอราคาของงานนี้ (ดูอย่างเดียวบนมือถือ — กดไม่ผ่าน/เปิดใบใหม่ที่หน้าเต็ม) */}
      {sheet && <SheetQuotations sheetId={sheet.id} canEdit={false} cartId={null} onUseAsCart={() => {}} compact />}
      {sheet && (
        <QuoteRounds sheetId={sheet.id} quotes={quotes} compact
          sizes={costParents.map((k) => ({ key: k, label: costTabLabel(k, generalLabelOf(sheet?.cost_general_label)) }))} sizeLabel={(c) => (c == null ? "—" : costTabLabel(c, generalLabelOf(sheet?.cost_general_label)))}
          currentCost={costTotalFor} canEdit={canEdit} costDirty={false} saveCost={async () => true} onReload={reloadQuotes} />
      )}
    </div>
  );

  // ── SKU ที่เชื่อม: Parent เป็นชิป (แตะดู) · SKU เป็นการ์ดรูป 2 ต่อแถว (แตะดูใน drawer กลาง) ──
  const skuSection = sheet && (
    <div className={sectionCls}>
      {sheet.parent_sku_refs.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {sheet.parent_sku_refs.map((p) => (
            <button key={p.id} type="button" onClick={() => setSkuDrawer({ moduleKey: "parent-skus-v2", id: p.id })}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 font-mono text-[11px] font-medium text-emerald-700">📦 {p.code}</button>
          ))}
        </div>
      )}
      {sheet.linked_skus.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400">{t("ยังไม่มี SKU จากใบงานนี้", "No SKUs from this design sheet yet")}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {sheet.linked_skus.map((s) => (
            <button key={s.id} type="button" onClick={() => setSkuDrawer({ moduleKey: "skus-v2", id: s.id })}
              className={`overflow-hidden rounded-lg border bg-white text-left ${s.from_sheet ? "border-slate-200" : "border-slate-100 opacity-70"}`}>
              {s.image_key ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={withImageWidth(`/api/r2-image?key=${encodeURIComponent(s.image_key)}`, 300) ?? ""} alt={s.code} loading="lazy" className="aspect-square w-full bg-slate-50 object-contain" />
              ) : <div className="flex aspect-square w-full items-center justify-center bg-slate-50 text-2xl">🏷️</div>}
              <div className="p-2">
                <div className="truncate font-mono text-[11px] text-slate-500">{s.code}</div>
                <div className="line-clamp-2 text-xs font-medium text-slate-800">{s.name_th ?? "—"}</div>
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                  {s.color && <span className="truncate">{s.color}</span>}
                  {!s.is_active && <span className="rounded bg-slate-100 px-1 text-slate-500">{t("ปิดใช้", "Inactive")}</span>}
                  {!s.from_sheet && <span className="rounded bg-slate-100 px-1 text-slate-500">{t("ของเดิม", "Existing")}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {canEdit && editFullBtn(t("ตั้ง Parent / สร้าง SKU (หน้าเต็ม)", "Set Parent / create SKU (full view)"))}
    </div>
  );

  // ── แท็บของหน้า (มือถือ: แท็บแทนการเลื่อนยาว · เจ้าของขอ 2026-11-10) ──
  const costAllowed = !!sheet && !sheet.cost_restricted;   // ไม่มีสิทธิ์เห็นต้นทุน = ไม่มีแท็บตีราคา
  const tabs: { key: SheetTab; label: string }[] = [
    { key: "overview", label: t("ภาพรวม", "Overview") },
    ...(costAllowed ? [{ key: "cost" as const, label: t("ตีราคา", "Costing") }] : []),
    { key: "quote", label: t("เสนอราคา", "Quote") },
    { key: "chat", label: comments.length ? t(`คุยลูกค้า ${comments.length}`, `Customer ${comments.length}`) : t("คุยลูกค้า", "Customer") },
    { key: "files", label: t("ไฟล์", "Files") },
  ];
  // แถบแท็บติดใต้หัวทุกจอ (2026-11-11 ย้ายขึ้นมาจากใต้การ์ดชื่อ) — ของกลาง ScrollTabs: เลื่อนได้ · กดแล้วเลื่อนให้อยู่กลาง · ปุ่ม ‹ › เมื่อเลยขอบ
  const tabBar = (
    <div role="tablist" className="sticky top-12 z-10 border-b border-slate-200 bg-white px-2 py-1.5">
      <ScrollTabs activeKey={tab}>
        {tabs.map((x) => (
          <button key={x.key} type="button" role="tab" data-tab-key={x.key} onClick={() => setTab(x.key)} aria-selected={tab === x.key}
            className={`h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium ${tab === x.key ? "bg-slate-900 text-white" : "text-slate-600 active:bg-slate-100"}`}>{x.label}{x.key === "cost" && costDirty ? " •" : ""}</button>
        ))}
      </ScrollTabs>
    </div>
  );
  // กล่องทางลัด (ครึ่งจอได้): ตีราคา / เสนอราคา → ไปแท็บนั้น · SKU → กางดู
  const tileCls = "flex h-full w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center active:bg-slate-50";
  const costTile = sheet && costAllowed && (
    <button type="button" onClick={() => setTab("cost")} className={tileCls}>
      <Icon name="calc" className={costLines.length ? "text-emerald-600" : "text-slate-400"} />
      <span className="w-full truncate text-base font-semibold tabular-nums text-slate-800">{costLines.length ? money(costTotalFor("")) : t("ยังไม่ตี", "Not yet")}</span>
      <span className="text-[11px] text-slate-400">{t("ต้นทุน/ใบ", "Cost/unit")}</span>
    </button>
  );
  const quoteTile = sheet && (
    <button type="button" onClick={() => setTab("quote")} className={tileCls}>
      <Icon name="receipt" className={latestQuote ? "text-blue-600" : "text-slate-400"} />
      <span className="w-full truncate text-base font-semibold text-slate-800">{latestQuote ? t(`รอบ ${latestQuote.batch ?? latestQuote.round}`, `Round ${latestQuote.batch ?? latestQuote.round}`) : t("ยังไม่เสนอ", "Not yet")}</span>
      <span className="w-full truncate text-[11px] text-slate-400">{latestQuote ? (QUOTE_STATUS[latestQuote.status]?.label ?? latestQuote.status) : t("เสนอราคา", "Quote")}</span>
    </button>
  );
  const skuTile = sheet && (
    <button type="button" onClick={() => setSkuOpen((o) => !o)} aria-expanded={skuOpen} className={tileCls}>
      <Icon name="tag" className={sheet.linked_skus.length ? "text-slate-600" : "text-slate-400"} />
      <span className="w-full truncate text-base font-semibold text-slate-800">{sheet.linked_skus.length} SKU</span>
      <span className="text-[11px] text-slate-400">{skuOpen ? t("แตะเพื่อพับ", "Tap to hide") : t("แตะดู", "Tap to view")}</span>
    </button>
  );
  const filesSection = sheet && (
    <div className={`${sectionCls} space-y-2`}>
      {sheet.drive_link && (
        <a href={sheet.drive_link} target="_blank" rel="noreferrer" className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700">
          <Icon name="folder-open" /> {t("เปิดลิงก์ไฟล์งานใน Drive", "Open the work-file link in Drive")}
        </a>
      )}
      {/* โยนไฟล์ AI / PSD / PDF ขึ้นโฟลเดอร์ Drive ของใบ (ของกลาง DriveUploadBox — ตัวเดียวกับหน้าคอม) */}
      <DriveUploadBox key={sheet.id} folderUrl={driveFolderUrl} canUpload={canEdit}
        title={t("ไฟล์งานใน Drive", "Work files in Drive")}
        hint={t("AI · PSD · PDF ฯลฯ ได้ถึง 5GB", "AI · PSD · PDF etc. up to 5GB")}
        startUpload={(file) => startSheetDriveUpload(sheet.id, file)}
        onUploaded={({ folderUrl }) => { setDriveFolderUrl(folderUrl); if (!sheet.drive_link) setSheet((s) => (s ? { ...s, drive_link: folderUrl } : s)); }} />
    </div>
  );

  // ── กล่องในแท็บภาพรวม (วางตามที่ทีม/คนนั้นจัด — BlockLayoutRows) · คืน null = ใบนี้ไม่มีข้อมูลกล่องนั้น (ข้าม) ──
  const noDeadline = !!sheet && !sheet.deadline && !finished;
  const linksOk = !!sheet && (sheet.parent_sku_refs.length > 0 || !!sheet.parent_sku_drafts?.length || !!sheet.drive_link);
  const missingBlocks = new Set<string>([...(costAllowed ? [] : ["cost"]), ...(sheet?.detail ? [] : ["detail"]), ...(linksOk ? [] : ["links"])]);
  const galleryOn = blockLayout.blocks.find((b) => b.key === "gallery")?.on !== false;
  const renderBlock = (key: string): ReactNode => {
    if (!sheet || missingBlocks.has(key)) return null;
    switch (key) {
      // แท็บเล็ต/จอคอม: รูปอยู่คอลัมน์ซ้ายแยกต่างหาก
      case "gallery": return isPhone ? <div className="overflow-hidden rounded-2xl border border-slate-200">{hero}</div> : null;
      case "status": return (
        <div className={sectionCls}>
          <div className="flex flex-wrap items-center gap-2">
            {/* สถานะ: แตะเพื่อเปลี่ยน (แผ่นเลือกจากล่าง) */}
            <button type="button" onClick={() => canEdit && setStatusSheet(true)} disabled={!canEdit || saving === t("สถานะ", "Status")}
              className="inline-flex h-9 max-w-full items-center gap-2 rounded-full px-3 text-sm font-semibold text-white disabled:opacity-70"
              style={{ backgroundColor: statusColor }}>
              <span className="h-2 w-2 shrink-0 rounded-full bg-white/80" /><span className="truncate">{statusLabel}</span>{canEdit && <Icon value="i:chevron-down" />}
            </button>
            {dl && (
              <label className={`relative inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${noDeadline && canEdit ? "border-amber-200 bg-amber-50 text-amber-800" : dl.cls}`}>
                <Icon name="calendar" /> {dl.text}{sheet.deadline && <span className="text-xs opacity-70">· {fmtDate(sheet.deadline)}</span>}
                {noDeadline && canEdit && <span className="text-xs font-semibold underline">{t("ตั้งวัน", "Set")}</span>}
                {canEdit && <input type="date" value={sheet.deadline ?? ""} onChange={(e) => void patchField({ deadline: e.target.value || null }, t("กำหนดส่ง", "Deadline"))}
                  className="absolute inset-0 cursor-pointer opacity-0" aria-label={t("เปลี่ยนวันกำหนดส่ง", "Change deadline")} />}
              </label>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: brandColor }} />{sheet.brand?.name ?? t("ไม่ระบุแบรนด์", "No brand")}
          </div>
        </div>
      );
      // รออะไรอยู่ = เช็กลิสต์กลาง ชุดเดียวกับหน้าคอม (บันทึกทีละข้อทันที)
      case "waiting": return (
        <div className={sectionCls}>
          <RecordChecklist moduleKey={DESIGN_WAITING.moduleKey} recordType={DESIGN_WAITING.recordType} recordId={sheet.id} canEdit={canEdit}
            presetType={DESIGN_WAITING.presetType} autoNew label={t("รออะไรอยู่", "Waiting for")} />
        </div>
      );
      case "cost": return costTile;
      case "quote": return quoteTile;
      case "sku": return skuOpen ? <div className="space-y-2">{skuTile}{skuSection}</div> : skuTile;
      case "dates": return (
        <div className={`${sectionCls} h-full text-sm`}>
          <div className="text-[11px] text-slate-400">{t("วันที่สั่ง", "Order date")}</div><div className="text-slate-800">{fmtDate(sheet.order_date)}</div>
          <div className="mt-1.5 text-[11px] text-slate-400">{t("นัดลูกค้า", "Customer appointment")}</div><div className="text-slate-800">{fmtDate(sheet.appointment_date)}</div>
        </div>
      );
      // โน้ต — แก้ได้ทันที
      case "note": return (
        <div className={sectionCls}>
          <div className="mb-1 flex items-center justify-between"><span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600"><Icon name="note" /> {t("โน้ต", "Note")}</span>
            {canEdit && note !== (sheet.note ?? "") && (
              <button type="button" onClick={() => void patchField({ note: note.trim() || null }, t("โน้ต", "Note"))} disabled={saving === t("โน้ต", "Note")}
                className="h-7 rounded-md bg-slate-900 px-3 text-xs font-medium text-white disabled:opacity-50">{saving === t("โน้ต", "Note") ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
            )}
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={!canEdit} rows={2} placeholder={t("พิมพ์โน้ตสั้น ๆ ที่ทีมต้องรู้…", "Type a short note the team needs to know…")}
            className="w-full resize-none rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-70" />
        </div>
      );
      // รายละเอียดงาน (อ่านอย่างเดียว — แก้ในป๊อปอัปเต็ม)
      case "detail": return (
        <div className={sectionCls}>
          <div className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-600"><Icon name="document" /> {t("รายละเอียดงาน", "Job details")}</div>
          <div className={`prose prose-sm max-w-none text-sm text-slate-700 [&_img]:max-w-full [&_img]:rounded-md ${detailOpen ? "" : "max-h-40 overflow-hidden"}`}
            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(sheet.detail ?? "") }} />
          <button type="button" onClick={() => setDetailOpen((o) => !o)} className="mt-1 text-xs font-medium text-blue-600">{detailOpen ? t("ย่อ ▲", "Collapse ▲") : t("ดูทั้งหมด ▼", "Show all ▼")}</button>
        </div>
      );
      case "links": return (
        <div className={`${sectionCls} space-y-2 text-sm`}>
          {(sheet.parent_sku_refs.length > 0 || !!sheet.parent_sku_drafts?.length) && (
            <div>
              <div className="text-[11px] text-slate-400">Parent SKU</div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {sheet.parent_sku_refs.map((p) => <a key={p.id} href={`/master/skus?open=${encodeURIComponent(p.id)}`} className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs text-emerald-700">{p.code}</a>)}
                {(sheet.parent_sku_drafts ?? []).map((d) => <span key={d} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{t("ร่าง:", "Draft:")} {d}</span>)}
              </div>
            </div>
          )}
          {sheet.drive_link && (
            <a href={sheet.drive_link} target="_blank" rel="noreferrer" className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700"><Icon name="folder-open" /> {t("เปิดไฟล์งาน (Drive)", "Open work files (Drive)")}</a>
          )}
        </div>
      );
      default: return null;
    }
  };

  const content = sheet && (
    <div className="space-y-3">
      {/* ภาพรวม = กล่องตามที่จัด (ของกลาง block-layout · แผ่น "จัดหน้า") */}
      <div className={tab === "overview" ? "" : "hidden"}>
        <BlockLayoutRows blocks={blockLayout.blocks} render={renderBlock} sizeOverride={skuOpen ? { sku: "full" } : undefined} />
        <button type="button" onClick={() => setLayoutOpen(true)}
          className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 text-xs text-slate-500 active:bg-slate-100">
          <Icon value="i:layout-grid" /> {t("จัดหน้านี้ — ลากสลับ · ซ่อน · ขนาด", "Arrange this page — reorder · hide · size")}
        </button>
      </div>

      {/* ตีราคา — คงไว้หลังเปิดครั้งแรก (สลับแท็บแล้วที่แก้ค้างไม่หาย) */}
      {costAllowed && costMounted && (
        <div className={tab === "cost" ? "" : "hidden"}>
          <MobileCostTab sheetId={sheet.id} lines={costLines} costExtraRaw={sheet.cost_extra} generalLabel={sheet.cost_general_label}
            tabCodes={[...sheet.parent_sku_refs.map((p) => p.code), ...(sheet.parent_sku_drafts ?? [])]}
            canEdit={canEdit} onDirtyChange={setCostDirty} onOpenFull={() => void openFull()}
            onSaved={(ls, ex) => { setCostLines(ls); setSheet((s) => (s ? { ...s, cost_extra: ex } : s)); }}
            onReload={() => { setCostDirty(false); setReloadKey((k) => k + 1); }} />
        </div>
      )}

      {tab === "quote" && quoteSection}

      {tab === "chat" && (<>
      {/* Comment ลูกค้า — ไทม์ไลน์ + พิมพ์เพิ่ม */}
      <div className={sectionCls}>
        <div className="mb-2 text-xs font-semibold text-slate-600">{t(`💬 Comment ลูกค้า (${comments.length})`, `💬 Customer comments (${comments.length})`)}</div>
        {comments.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">{t("ยังไม่มี comment", "No comments yet")}</div> : (
          <div className="space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="rounded-lg bg-slate-50 px-2.5 py-2">
                <div className="text-[10px] text-slate-400">{fmtDate(c.comment_date)}</div>
                <div className="whitespace-pre-wrap text-sm text-slate-700">{c.body}</div>
                {c.images.length > 0 && (
                  <div className="mt-1.5 flex gap-1.5 overflow-x-auto">
                    {c.images.map((u) => {
                      const gi = images.findIndex((im) => im.url === u);
                      // eslint-disable-next-line @next/next/no-img-element
                      return <img key={u} src={withImageWidth(u, 200) ?? u} alt="" loading="lazy" onClick={() => gi >= 0 && setLightbox(gi)}
                        className="h-16 w-16 shrink-0 rounded-md border border-slate-200 object-cover" />;
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="mt-2 space-y-1.5">
            <textarea ref={commentRef} value={newComment} onChange={(e) => setNewComment(e.target.value)} rows={2} placeholder={t("พิมพ์ comment จากลูกค้า…", "Type the customer's comment…")}
              className="w-full resize-none rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <div className="flex items-center gap-2">
              <input type="date" value={commentDate} onChange={(e) => setCommentDate(e.target.value)} className="h-8 flex-1 rounded-md border border-slate-200 px-2 text-xs text-slate-600" />
              <button type="button" onClick={() => void sendComment()} disabled={!newComment.trim() || saving === "comment"}
                className="h-8 rounded-md bg-blue-600 px-4 text-xs font-medium text-white disabled:opacity-40">{saving === "comment" ? t("กำลังส่ง…", "Sending…") : t("ส่ง", "Send")}</button>
            </div>
          </div>
        )}
      </div>
      </>)}

      {tab === "files" && filesSection}
      <div className="h-2" />
    </div>
  );

  const page = (
    <div className="min-h-[100dvh] bg-slate-50">
      {/* แถบบน: ย้อนกลับ · ชื่อ+รหัส · เมนู ⋯ (2026-11-11: ใบนำเสนอ A4 / หน้าเต็ม / คัดลอกลิงก์ / จัดหน้า ย้ายเข้าเมนู — หัวไม่แน่น) */}
      <div className="sticky top-0 z-20 flex h-12 items-center gap-1 border-b border-slate-100 bg-white px-1.5">
        <button type="button" onClick={() => void goBack()} aria-label={t("ย้อนกลับ", "Back")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100"><Icon value="i:arrow-left" size={20} /></button>
        <div className="min-w-0 flex-1" title={sheet?.name}>
          <div className="truncate text-[15px] font-semibold leading-tight text-slate-900">{sheet?.name ?? (loading ? t("กำลังโหลด…", "Loading…") : "")}</div>
          <div className="truncate font-mono text-[11px] leading-tight text-slate-400">{sheet?.code ?? "…"}</div>
        </div>
        {sheet && (
          <button type="button" onClick={() => setMenuOpen(true)} aria-label={t("เมนูเพิ่มเติม", "More")} title={t("ใบนำเสนอ A4 · หน้าเต็ม · คัดลอกลิงก์ · จัดหน้า", "A4 · full view · copy link · arrange")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 active:bg-slate-100"><Icon value="i:dots-vertical" size={20} /></button>
        )}
      </div>
      {sheet && !loading && !error && tabBar}

      {loading ? (
        <div className="space-y-3 p-3">
          <div className="aspect-square w-full animate-pulse rounded-xl bg-slate-200" />
          <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-32 animate-pulse rounded-xl bg-slate-200" />
        </div>
      ) : error || !sheet ? (
        <div className="m-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {t("โหลดใบงานไม่สำเร็จ:", "Failed to load design sheet:")} {error ?? t("ไม่พบใบงาน", "Design sheet not found")}
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="ml-2 underline">{t("ลองใหม่", "Retry")}</button>
        </div>
      ) : isPhone ? (
        // มือถือ: รูปงาน = กล่องหนึ่งในภาพรวม (จัดตำแหน่ง/ซ่อนได้) · แท็บอื่นเห็นเนื้อหาทันที
        <div className="p-3 pb-24">{content}</div>
      ) : (
        /* แท็บเล็ต/จอคอม: รูปซ้าย (ติดขอบบนตอนเลื่อน — ซ่อนได้ในจัดหน้า) · เนื้อหาขวา */
        <div className={`mx-auto grid max-w-5xl gap-4 p-4 ${galleryOn ? "grid-cols-[minmax(280px,42%)_1fr]" : "grid-cols-1"}`}>
          {galleryOn && <div className="sticky top-28 self-start overflow-hidden rounded-xl border border-slate-200">{hero}</div>}
          <div>{content}</div>
        </div>
      )}

      {/* มือถือ: แถบปุ่มล่างติดจอ (ใกล้นิ้วโป้ง) — คุยลูกค้า · ไฟล์ · ปุ่มหลัก "ส่งต่อ: <ขั้นถัดไป>" (ไม่มีขั้นถัดไปที่ยังเปิด = เปลี่ยนสถานะ)
          แท็บตีราคามีแถบของตัวเอง (เพิ่มวัสดุ / บันทึก) */}
      {isPhone && sheet && canEdit && !(tab === "cost" && costAllowed) && (
        <div className="sticky bottom-0 z-20 flex gap-2 border-t border-slate-200 bg-white/95 p-2 backdrop-blur" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          <button type="button" onClick={() => { setTab("chat"); window.setTimeout(() => commentRef.current?.focus(), 80); }} aria-label={t("คุยลูกค้า / Comment", "Customer chat")}
            className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg text-slate-700 active:bg-slate-50">
            <Icon name="chat" />
            {comments.length > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-slate-800 px-1 text-[10px] font-semibold leading-[18px] text-white">{comments.length}</span>}
          </button>
          <button type="button" onClick={() => setTab("files")} aria-label={t("ไฟล์", "Files")}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg text-slate-700 active:bg-slate-50"><Icon name="attach" /></button>
          {nextStatus ? (
            <button type="button" onClick={() => void advance()} disabled={saving === t("สถานะ", "Status")}
              className="inline-flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-white active:bg-blue-700 disabled:opacity-60">
              {/* 2 บรรทัด: ชื่อสถานะยาว (เช่น "กำลังทำตัวอย่าง/แก้ไขตาม Comment") ยังอ่านได้ */}
              <span className="flex min-w-0 flex-1 flex-col items-start text-left leading-tight">
                <span className="text-[11px] opacity-85">{t("ส่งต่อไป", "Move to")}</span>
                <span className="w-full truncate text-sm font-semibold">{nextStatus[1]}</span>
              </span>
              <span aria-hidden className="text-lg">→</span>
            </button>
          ) : (
            <button type="button" onClick={() => setStatusSheet(true)}
              className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white active:bg-blue-700"><Icon name="shuffle" /> {t("เปลี่ยนสถานะ", "Change status")}</button>
          )}
        </div>
      )}

      {/* แผ่นเลือกสถานะ — ของกลาง DesignStatusSheet (ตัวเดียวกับ Design Dashboard มือถือ) */}
      {sheet && (
        <DesignStatusSheet open={statusSheet} onClose={() => setStatusSheet(false)} statusMeta={statusMeta} own={isOwnBrandJob(sheet.brand)} current={sheet.status}
          subtitle={`${sheet.code} · ${sheet.name}`} onPick={(key) => void patchField({ status: key }, t("สถานะ", "Status"))} />
      )}

      {/* เมนู ⋯ — ปุ่มรองที่เคยอยู่บนหัว · เปิดแผ่นถัดไปหลังเมนูปิดสนิท (ปุ่ม back ของสองแผ่นไม่ชนกัน) */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={sheet?.name} subtitle={sheet?.code} backKey="ds-menu" maxHeight="75dvh">
        <div className="space-y-0.5">
          {[
            ...(canEdit ? [{ icon: "shuffle", label: t("เปลี่ยนสถานะ", "Change status"), go: () => setStatusSheet(true) }] : []),
            { icon: "grid-view", label: t("จัดหน้านี้", "Arrange this page"), hint: t("ลากสลับ · ซ่อน · ขนาดกล่อง", "Reorder · hide · block size"), go: () => setLayoutOpen(true) },
            { icon: "document", label: t("ใบนำเสนอ A4", "A4 presentation"), go: () => setPresentOpen(true) },
            ...(canEdit ? [{ icon: "computer", label: t("เปิดแบบจอคอม (แก้ไขเต็ม)", "Open full desktop view"), go: () => void openFull() }] : []),
            { icon: "link", label: t("คัดลอกลิงก์ใบงาน", "Copy link"), go: () => void copyText(window.location.href).then((ok) => (ok ? toast.success(t("คัดลอกลิงก์แล้ว", "Link copied")) : toast.error(t("คัดลอกไม่สำเร็จ", "Couldn't copy")))) },
          ].map((m: { icon: string; label: string; hint?: string; go: () => void }) => (
            <button key={m.label} type="button" onClick={() => { setMenuOpen(false); window.setTimeout(m.go, 320); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-800 active:bg-slate-50">
              <span className="text-lg text-slate-500"><Icon name={m.icon} /></span>
              <span className="min-w-0 flex-1">{m.label}{m.hint && <span className="block text-[11px] text-slate-400">{m.hint}</span>}</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* จัดหน้า (ของกลาง block-layout): ของฉัน = จำเองทุกเครื่อง · ทั้งทีม = แอดมินบันทึกเป็นแบบมาตรฐาน */}
      <BottomSheet open={layoutOpen} onClose={() => setLayoutOpen(false)} title={t("จัดหน้า ภาพรวม", "Arrange overview")} backKey="ds-layout" maxHeight="88dvh">
        <BlockLayoutEditor layout={blockLayout} missing={missingBlocks} />
      </BottomSheet>

      <ImageLightbox images={lightboxImages} index={lightbox} onClose={() => setLightbox(-1)} onIndex={setLightbox} />

      {presentOpen && sheet && <DesignSheetPresentPanel sheetId={sheet.id} open={presentOpen} onClose={() => setPresentOpen(false)} />}

      {/* drawer ดู SKU / Parent SKU (ของกลาง) */}
      {skuDrawer && <MasterRecordDrawer moduleKey={skuDrawer.moduleKey} recordId={skuDrawer.id} onClose={() => setSkuDrawer(null)} />}

      {/* ป๊อปอัปเต็ม (ของกลางเดิม) — ปิดแล้วโหลดหน้าใหม่ให้เห็นค่าที่แก้ */}
      {editOpen && sheet && (
        <DesignSheetDetail detailOnly openId={sheet.id} onDetailClose={() => { setEditOpen(false); setReloadKey((k) => k + 1); }} />
      )}
    </div>
  );

  // "กลับมุมมองจอคอม" (ปุ่มข้าง QR ตอนพรีวิว) = กลับไปบอร์ดแล้วเปิดใบนี้เป็นป๊อปอัปแบบจอคอม
  const exitPreview = () => router.push(`/master/design-dashboard?open=${encodeURIComponent(id)}`);
  return <DevicePreviewFrame layout={layout} viewport={viewport} onExitPreview={exitPreview}>{page}</DevicePreviewFrame>;
}
