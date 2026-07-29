"use client";

// ============================================================
// Creative Content / Social — จัดการโพสต์ + caption หลายแพลตฟอร์ม + ปฏิทิน
// ของกลาง: StandaloneShell, ERPModal, ConfirmDialog, ERPForm*, ProductPicker
// ข้อมูลจาก /api/creative-content + /api/creative-hashtags (ดู app/tasks/data.ts)
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSWRLite } from "@/lib/swr-lite";
import { renderCaption, computeRealPrice, CAPTION_VARS, type ShopChannel } from "@/lib/caption-template";
import { StandaloneShell } from "@/components/standalone-shell";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ERPInput, ERPTextarea } from "@/components/form";
import { SkuPicker, ParentSkuPicker, UserPicker } from "@/components/pickers";
import type { SkuPickerValue, ParentSkuPickerValue, UserPickerValue } from "@/components/pickers";
import { ImageAttach } from "@/components/image-attach";
import { ImageLightbox } from "@/components/image-lightbox";
import { r2ImageUrl } from "@/lib/r2-image";
import {
  CONTENT_STATUS_META, contentStatusLabel, postTypeLabel,
  listContent, listContentTemplates, getContent, createContent, updateContent, deleteContent, bulkDeleteContent,
  listCampaigns, listBrands, listHashtags, createHashtag, deleteHashtag, getTask, listSubtasks,
  getCaptionTemplates, saveCaptionTemplates, getParentSkuColors, getParentSkuChildren, type ParentSkuChild,
  getRecommendedTimes, saveRecommendedTimes, type RecommendedTimes,
  listContentAttachments, addContentAttachment, deleteContentAttachment,
  getPlatformSettings, savePlatformSettings, getLinkPreview,
  getMetaStatus, publishToPlatform, igFinalize, type MetaConnStatus, type PostMediaRef,
  getCaptionConfig, saveCaptionConfig, defaultHashtags, resolvePrompt, resolveBrandFromProduct,
  type ContentItem, type ContentDetail, type ContentCaption, type ContentStatus,
  type BrandOption, type Hashtag, type CaptionTemplate, type CaptionConfig,
  type ContentAttachment, type PlatformSettings, type PlatformSetting, type LinkPreview,
} from "../data";
import { useCreativeOptions, platformLabel } from "../use-options";
import { PlatformChip } from "../platform-chip";
import { PostConfirmModal, type PostImage } from "./post-confirm-modal";
import { ContentCreateModal } from "./content-create-modal";
import { MultiUserPicker } from "../multi-user-picker";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useMediaQuery } from "@/lib/use-media-query";
import { useDrawerTheme, DrawerThemeButton, drawerZoom, isHidden, densityCls, densityPad, densityGap, drawerBgStyle, orderedKeys, accentCss, btnBg, isCollapsed, toggleCollapsedList } from "../drawer-theme";
import dynamic from "next/dynamic";
import { useT } from "@/components/i18n";

// drawer สินค้ากลาง (ของกลาง) — เปิดดู Parent SKU จากในคอนเทนต์ · dynamic กัน import วน
const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

type Toast = { id: number; type: "success" | "error" | "info"; message: string };

function StatusBadge({ status }: { status: ContentStatus }) {
  useT();   // subscribe ภาษา
  const m = CONTENT_STATUS_META[status] ?? CONTENT_STATUS_META.draft;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{contentStatusLabel(status)}</span>;
}

const TEMPLATE_ICONS = ["🧩", "📢", "🖼️", "✨", "🎬", "🛍️", "🔥", "💡", "🏷️", "🎁", "📸", "🎥", "⭐", "💥", "📝", "🛒", "💬", "🎨", "👗", "👜", "💄", "🌸", "🎀", "📦", "🚀", "❤️", "🏆", "🎯", "📱", "🎉"];

export function ContentPageView() {
  const t = useT();
  const { platforms } = useCreativeOptions();
  const { can } = useAuth();
  const canAiCaption = can("ai.caption");   // สิทธิ์สั่ง AI เขียนแคปชั่น (มีค่าใช้จ่าย)
  const [view, setView] = useState<"list" | "table" | "calendar" | "templates">(() => {
    if (typeof window === "undefined") return "table";
    const v = new URLSearchParams(window.location.search).get("view");
    return v === "templates" || v === "calendar" || v === "list" ? v : "table";   // default = ตาราง
  });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<ContentItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());   // เลือกหลายรายการ (table view)
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkAi, setBulkAi] = useState(false);       // ป๊อป "AI เขียนแคปชั่น" ของรายการที่เลือก
  const [bulkAiBusy, setBulkAiBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // create modal (ฟอร์ม/logic ย้ายไปของกลาง ContentCreateModal แล้ว)
  const [open, setOpen] = useState(false);
  const [iconEditId, setIconEditId] = useState<string | null>(null);   // แม่แบบที่กำลังเปลี่ยนไอคอน

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  // SWR (stale-while-revalidate) — กลับเข้าหน้านี้ใหม่เห็นทันที + ใช้ brands/campaigns ร่วมกับหน้าอื่น
  const itemsSWR = useSWRLite("creative:content", () => listContent());
  const templatesSWR = useSWRLite("creative:content-templates", () => listContentTemplates());
  const brandsSWR = useSWRLite("creative:brands", () => listBrands());
  const campaignsSWR = useSWRLite("creative:campaigns", () => listCampaigns());
  const items = itemsSWR.data ?? [];
  const templates = templatesSWR.data ?? [];
  const brands = brandsSWR.data ?? [];
  const campaigns = campaignsSWR.data ?? [];
  const loading = itemsSWR.loading;
  const loadError = !!itemsSWR.error && items.length === 0;   // โหลดพลาด + ไม่มีข้อมูลเก่า → โชว์หน้าผิดพลาด (ไม่ใช่ "ว่าง")
  const load = useCallback(async () => { await itemsSWR.revalidate(true); }, [itemsSWR]);
  const reloadTemplates = useCallback(async () => { await templatesSWR.revalidate(true); }, [templatesSWR]);
  // เปิด drawer คอนเทนต์อัตโนมัติจากลิงก์ /tasks/content?content=<id> (กดมาจากการ์ดบน Canvas)
  useEffect(() => { const cid = new URLSearchParams(window.location.search).get("content"); if (cid) setDetailId(cid); }, []);

  const openCreate = () => setOpen(true);

  const onDelete = async () => { if (!delTarget) return; try { await deleteContent(delTarget.id); pushToast("info", t("ลบแล้ว", "Deleted")); if (detailId === delTarget.id) setDetailId(null); await load(); await reloadTemplates(); } catch (e) { pushToast("error", (e as Error).message); } finally { setDelTarget(null); } };
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulkDelete = async () => {
    setBulkBusy(true);
    try {
      const ids = [...selected];
      const r = await bulkDeleteContent(ids);   // ลบทีเดียวหลายรายการ (คำขอเดียว) + รายงานผล
      pushToast(r.failed > 0 ? "error" : "info", r.failed > 0 ? t(`ลบสำเร็จ ${r.success} · ล้มเหลว ${r.failed}`, `Deleted ${r.success} · failed ${r.failed}`) : t(`ลบ ${r.success} รายการแล้ว`, `Deleted ${r.success}`));
      setSelected(new Set()); if (detailId && selected.has(detailId)) setDetailId(null); await load();
    }
    catch (e) { pushToast("error", (e as Error).message); } finally { setBulkBusy(false); setBulkConfirm(false); }
  };
  // ✨ สั่ง AI เขียนแคปชั่นหลายคอนเทนต์รวบเดียว (จากรายการที่ติ๊กไว้) — บันทึกให้เลย เพราะไม่มีฟอร์มให้กดบันทึก
  // ทำทีละคอนเทนต์ (ฝั่ง server ยิง OpenAI ครั้งเดียวต่อคอนเทนต์อยู่แล้ว) เพื่อไม่ให้ timeout และรายงานได้ละเอียด
  const bulkAiWrite = async (extra: string, overwrite: boolean) => {
    const ids = [...selected];
    setBulkAiBusy(true);
    let okCount = 0, savedTotal = 0, callTotal = 0, imgTotal = 0, failed = 0;
    try {
      for (const id of ids) {
        try {
          const r = await apiFetch("/api/ai/caption-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content_id: id, overwrite, extra, apply: true }) });
          const j = await r.json();
          if (j.error) { failed++; continue; }
          okCount += ((j.results ?? []) as unknown[]).length;
          savedTotal += Number(j.saved ?? 0); callTotal += Number(j.calls ?? 0); imgTotal += Number(j.images_used ?? 0);
        } catch { failed++; }
      }
      pushToast(failed ? "error" : "success", t(
        `เขียน+บันทึกแล้ว ${savedTotal} ช่อง จาก ${ids.length} คอนเทนต์ (ยิง AI ${callTotal} ครั้ง · อ่าน ${imgTotal} รูป)${failed ? ` · ล้มเหลว ${failed} คอนเทนต์` : ""}`,
        `Wrote & saved ${savedTotal} caption(s) across ${ids.length} content(s) in ${callTotal} call(s), ${imgTotal} image(s)${failed ? `, ${failed} failed` : ""}`));
      if (okCount > savedTotal) pushToast("info", t("บางช่องเขียนได้แต่บันทึกไม่สำเร็จ — ลองเปิดดูรายตัว", "Some captions were written but not saved"));
      setBulkAi(false); setSelected(new Set()); await load();
    } finally { setBulkAiBusy(false); }
  };

  // สร้างแม่แบบคอนเทนต์เปล่า → เปิด drawer ให้กรอกแคปชั่น/แพลตฟอร์ม
  const createTpl = async () => {
    const name = window.prompt(t("ชื่อแม่แบบคอนเทนต์", "Content template name"));
    if (!name?.trim()) return;
    try { const { id } = await createContent({ title: name.trim(), is_template: true }); await reloadTemplates(); setDetailId(id); pushToast("success", t("สร้างแม่แบบแล้ว", "Template created")); }
    catch (e) { pushToast("error", (e as Error).message); }
  };
  // เปลี่ยนไอคอนแม่แบบ (emoji) — บันทึกทันที
  const setTemplateIcon = async (id: string, icon: string | null) => {
    try { await updateContent(id, { template_icon: icon }); await reloadTemplates(); setIconEditId(null); pushToast("success", t("เปลี่ยนไอคอนแล้ว", "Icon updated")); }
    catch (e) { pushToast("error", (e as Error).message); }
  };

  return (
    <StandaloneShell title={t("คอนเทนต์ Social", "Social Content")} icon="📱" accent="violet">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("คอนเทนต์ Social", "Social Content")}</h1>
            <p className="text-slate-500 mt-1">{t("โพสต์โซเชียล · เขียน caption ได้หลายแพลตฟอร์มต่อ 1 คอนเทนต์ · คลัง hashtag · ปฏิทิน", "Social posts · Write captions per platform per content · Hashtag library · Calendar")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href="/tasks" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">← {t("งาน", "Tasks")}</a>
            <a href="/tasks/content-calendar" className="h-10 px-4 inline-flex items-center text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">🗓️ {t("ปฏิทิน", "Calendar")}</a>
            <button onClick={openCreate} className="h-10 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {t("สร้างคอนเทนต์", "Create Content")}</button>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit mt-4">
          <button onClick={() => setView("list")} className={`h-8 px-3 rounded-md text-sm font-medium ${view === "list" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>📋 {t("รายการ", "List")}</button>
          <button onClick={() => setView("table")} className={`h-8 px-3 rounded-md text-sm font-medium ${view === "table" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>📊 {t("ตาราง", "Table")}</button>
          <button onClick={() => setView("calendar")} className={`h-8 px-3 rounded-md text-sm font-medium ${view === "calendar" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>🗓️ {t("ปฏิทิน", "Calendar")}</button>
          <button onClick={() => setView("templates")} className={`h-8 px-3 rounded-md text-sm font-medium ${view === "templates" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>🧩 {t("แม่แบบ", "Templates")}</button>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-6">
        {loading ? <div className="py-20 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>
          : loadError ? (
            <div className="bg-white rounded-xl border border-red-200 p-12 text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <p className="text-slate-700 font-medium">{t("โหลดข้อมูลไม่สำเร็จ", "Failed to load")}</p>
              <p className="text-slate-400 text-sm mt-1">{t("เชื่อมต่อไม่ได้หรือเครือข่ายมีปัญหา", "Connection or network problem")}</p>
              <button onClick={() => void load()} className="mt-4 h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">↻ {t("ลองใหม่", "Retry")}</button>
            </div>
          )
          : view === "templates" ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-500">{t("แม่แบบคอนเทนต์ — ตั้งแคปชั่น/แพลตฟอร์มไว้ล่วงหน้า เลือกใช้ตอนสร้างคอนเทนต์ได้", "Content templates — preset captions/platforms, pick when creating content")}</p>
                <button onClick={createTpl} className="h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {t("สร้างแม่แบบ", "New Template")}</button>
              </div>
              {templates.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                  <div className="text-4xl mb-3">🧩</div>
                  <p className="text-slate-600 font-medium">{t("ยังไม่มีแม่แบบคอนเทนต์", "No content templates yet")}</p>
                  <p className="text-slate-400 text-sm mt-1">{t('สร้างใหม่ หรือกด "บันทึกเป็นเทมเพลต" จากคอนเทนต์ที่มีอยู่', 'Create one, or click "Save as Template" from existing content')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((c) => (
                    <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-violet-300 hover:shadow transition-colors">
                      <div className="flex items-start gap-2.5">
                        <button onClick={() => setIconEditId(c.id)} title={t("เปลี่ยนไอคอน", "Change icon")}
                          className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-2xl hover:border-violet-300 hover:bg-violet-50">{c.template_icon || "🧩"}</button>
                        <button onClick={() => setDetailId(c.id)} className="min-w-0 text-left flex-1">
                          <span className="text-[10px] text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">{t("แม่แบบ", "Template")}</span>
                          <p className="text-base font-semibold text-slate-800 leading-snug line-clamp-2 mt-1.5">{c.title}</p>
                          <div className="flex flex-wrap gap-1 mt-2">{(c.platforms ?? []).map((p) => <span key={p} className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{platformLabel(p)}</span>)}</div>
                        </button>
                        <button onClick={() => setDelTarget(c)} title={t("ลบแม่แบบ", "Delete template")} className="text-slate-300 hover:text-red-500 shrink-0">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
          : view === "calendar" ? <MonthCalendar items={items} onOpen={(id) => setDetailId(id)} />
          : items.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <div className="text-4xl mb-3">📱</div>
              <p className="text-slate-600 font-medium">{t("ยังไม่มีคอนเทนต์", "No content yet")}</p>
              <button onClick={openCreate} className="mt-4 h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {t("สร้างคอนเทนต์", "Create Content")}</button>
            </div>
          ) : view === "table" ? (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {selected.size > 0 && (
                <div className="flex items-center justify-between gap-2 px-4 py-2 bg-violet-50 border-b border-violet-100">
                  <span className="text-sm text-violet-800 font-medium">{t("เลือก", "Selected")} {selected.size}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelected(new Set())} className="text-xs text-slate-500 hover:underline">{t("ล้าง", "Clear")}</button>
                    {canAiCaption && <button onClick={() => setBulkAi(true)} className="h-8 px-3 text-xs font-medium text-white bg-fuchsia-600 rounded-lg hover:bg-fuchsia-700">✨ {t("AI เขียนแคปชั่น", "AI write captions")}</button>}
                    <button onClick={() => setBulkConfirm(true)} className="h-8 px-3 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">🗑 {t("ลบที่เลือก", "Delete selected")}</button>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr>
                      <th className="w-10 px-3 py-2"><input type="checkbox" checked={items.length > 0 && selected.size === items.length} onChange={(e) => setSelected(e.target.checked ? new Set(items.map((c) => c.id)) : new Set())} /></th>
                      <th className="text-left px-3 py-2 font-medium">{t("สถานะ", "Status")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("เลขที่", "No.")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("ชื่อ", "Title")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("งาน", "Task")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("แบรนด์", "Brand")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("ประเภท", "Type")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("แพลตฟอร์ม", "Platforms")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("ผู้รับผิดชอบ", "Assignees")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("ตั้งเวลา", "Schedule")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => (
                      <tr key={c.id} onClick={() => setDetailId(c.id)} className={`border-t border-slate-100 hover:bg-slate-50 cursor-pointer ${selected.has(c.id) ? "bg-violet-50/50" : ""}`}>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSel(c.id)} /></td>
                        <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-400 whitespace-nowrap">{c.content_no}</td>
                        <td className="px-3 py-2 font-medium text-slate-800 max-w-[220px] truncate">{c.title}</td>
                        {/* ผูกกับงานไหน — กดชื่องานไปดูงานได้เลย (แท็บใหม่ ไม่เปิด drawer คอนเทนต์) */}
                        <td className="px-3 py-2 text-slate-500 max-w-[170px] truncate" onClick={(e) => c.task_id && e.stopPropagation()}>
                          {c.task_label
                            ? (c.task_id
                              ? <a href={`/tasks?task=${c.task_id}`} target="_blank" rel="noreferrer" title={t("เปิดงานนี้ (แท็บใหม่)", "Open task (new tab)")} className="inline-flex items-center gap-1 hover:text-violet-700 hover:underline">📋 {c.task_label} ↗</a>
                              : <span className="inline-flex items-center gap-1" title={c.task_no ?? undefined}>📋 {c.task_label}</span>)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{c.brand_label ? <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c.brand_color || "#cbd5e1" }} />{c.brand_label}</span> : "—"}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{c.post_type ? postTypeLabel(c.post_type) : "—"}</td>
                        <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{(c.platforms ?? []).map((p) => <span key={p} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{platformLabel(p)}</span>)}</div></td>
                        <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{c.assignees?.length ? c.assignees.map((a) => a.name).filter(Boolean).join(", ") : (c.assignee_label ?? "—")}</td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap text-xs">{c.scheduled_at ? c.scheduled_at.slice(0, 16).replace("T", " ") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((c) => (
                <div key={c.id} onClick={() => setDetailId(c.id)} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-violet-300 hover:shadow cursor-pointer transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <StatusBadge status={c.status} />
                    <span className="font-mono text-[10px] text-slate-400">{c.content_no}</span>
                  </div>
                  <p className="text-base font-semibold text-slate-800 leading-snug line-clamp-2">{c.title}</p>
                  <div className="flex flex-wrap gap-1 mt-2">{(c.platforms ?? []).map((p) => <span key={p} className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{platformLabel(p)}</span>)}</div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-2 flex-wrap">
                    {c.brand_label && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c.brand_color || "#cbd5e1" }} />{c.brand_label}</span>}
                    {c.post_type && <span>· {postTypeLabel(c.post_type)}</span>}
                    {(c.assignees?.length ? c.assignees.map((a) => a.name).filter(Boolean).join(", ") : c.assignee_label) && <span>· 🙋 {c.assignees?.length ? c.assignees.map((a) => a.name).filter(Boolean).join(", ") : c.assignee_label}</span>}
                    {c.scheduled_at && <span>· 🗓 {c.scheduled_at.slice(0, 16).replace("T", " ")}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      <ContentCreateModal open={open} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); load(); }}
        brands={brands} campaigns={campaigns} templates={templates} pushToast={pushToast} />

      <ERPModal open={!!iconEditId} onClose={() => setIconEditId(null)} title={t("เลือกไอคอนแม่แบบ", "Pick template icon")} size="sm"
        footer={<button onClick={() => setIconEditId(null)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>}>
        <div className="grid grid-cols-6 gap-2">
          {TEMPLATE_ICONS.map((e) => <button key={e} onClick={() => iconEditId && setTemplateIcon(iconEditId, e)} className="h-11 rounded-lg border border-slate-200 text-2xl hover:border-violet-400 hover:bg-violet-50">{e}</button>)}
        </div>
        <button onClick={() => iconEditId && setTemplateIcon(iconEditId, null)} className="mt-3 text-sm text-slate-500 hover:underline">{t("ใช้ค่าเริ่มต้น (🧩)", "Use default (🧩)")}</button>
      </ERPModal>

      {detailId && <ContentDrawer contentId={detailId} brands={brands} onClose={() => setDetailId(null)} onChanged={() => { load(); reloadTemplates(); }} onDelete={(c) => setDelTarget(c)} pushToast={pushToast} />}

      <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={onDelete}
        title={t("ลบคอนเทนต์", "Delete Content")} message={<span>{t("ต้องการลบ", "Delete")} <span className="font-semibold">{delTarget?.title}</span> {t("ใช่ไหม?", "?")}</span>} confirmText={t("ลบ", "Delete")} variant="danger" />

      <ConfirmDialog open={bulkConfirm} onClose={() => setBulkConfirm(false)} onConfirm={bulkDelete}
        title={t("ลบคอนเทนต์ที่เลือก", "Delete selected content")} message={<span>{t("ต้องการลบ", "Delete")} <span className="font-semibold">{selected.size}</span> {t("รายการใช่ไหม?", "items?")}</span>} confirmText={bulkBusy ? "..." : t("ลบทั้งหมด", "Delete all")} variant="danger" />

      {/* ✨ AI เขียนแคปชั่นให้รายการที่เลือก (บันทึกให้เลย) */}
      {bulkAi && (
        <AiCaptionModal platformLabels={[]} filledCount={0} contentCount={selected.size} busy={bulkAiBusy}
          onClose={() => setBulkAi(false)} onRun={(extra, overwrite) => bulkAiWrite(extra, overwrite)} />
      )}

      <div className="fixed bottom-6 right-6 z-[70] flex flex-col gap-2">
        {toasts.map((t) => <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${t.type === "success" ? "bg-emerald-600" : t.type === "error" ? "bg-red-600" : "bg-slate-800"}`}>{t.message}</div>)}
      </div>
    </StandaloneShell>
  );
}

// ============================================================
// Month calendar (เดือนปัจจุบัน + เลื่อนเดือน) — แสดงคอนเทนต์ตามวันตั้งเวลา
// ============================================================
function MonthCalendar({ items, onOpen }: { items: ContentItem[]; onOpen: (id: string) => void }) {
  const t = useT();
  const [offset, setOffset] = useState(0);
  const base = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + offset, 1); }, [offset]);
  const year = base.getFullYear(), month = base.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const byDay = useMemo(() => {
    const map: Record<string, ContentItem[]> = {};
    for (const c of items) { if (!c.scheduled_at) continue; const d = c.scheduled_at.slice(0, 10); (map[d] ??= []).push(c); }
    return map;
  }, [items]);
  const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthName = base.toLocaleDateString("th-TH", { month: "long", year: "numeric" });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setOffset((o) => o - 1)} className="h-8 w-8 rounded-md hover:bg-slate-100 text-slate-500">‹</button>
        <h2 className="font-semibold text-slate-800">{monthName}</h2>
        <button onClick={() => setOffset((o) => o + 1)} className="h-8 w-8 rounded-md hover:bg-slate-100 text-slate-500">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400 mb-1">{[t("อา","Sun"), t("จ","Mon"), t("อ","Tue"), t("พ","Wed"), t("พฤ","Thu"), t("ศ","Fri"), t("ส","Sat")].map((d) => <div key={d} className="py-1">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const day = i + 1;
          const key = `${ym}-${String(day).padStart(2, "0")}`;
          const list = byDay[key] ?? [];
          return (
            <div key={day} className="min-h-[84px] border border-slate-100 rounded-lg p-1.5 align-top">
              <div className="text-xs text-slate-400 mb-1">{day}</div>
              <div className="space-y-1">
                {list.slice(0, 3).map((c) => { const m = CONTENT_STATUS_META[c.status] ?? CONTENT_STATUS_META.draft; return (
                  <button key={c.id} onClick={() => onOpen(c.id)} className={`w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded border ${m.cls} truncate`} title={c.title}>{c.title}</button>
                ); })}
                {list.length > 3 && <div className="text-[10px] text-slate-400">+{list.length - 3} {t("อื่น ๆ", "more")}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Content detail drawer — caption หลายแพลตฟอร์ม + คลัง hashtag + ลิงก์
// ============================================================
// หมายเหตุ: export ไว้เพราะ tasks/campaigns ฝังใช้ (.next/types route-export warning 1 จุด — ไม่กระทบ build)
export function ContentDrawer({ contentId, brands, onClose, onChanged, onDelete, onDeleted, pushToast }: {
  contentId: string; brands: BrandOption[];
  onClose: () => void; onChanged: () => void; onDelete?: (c: ContentItem) => void;
  onDeleted?: (contentId: string) => void;   // ลบสำเร็จแล้ว → ให้ผู้เรียกจัดการต่อ (เช่น เอาการ์ดออกจากกระดาน)
  pushToast: (type: Toast["type"], m: string) => void;
}) {
  const t = useT();
  const { platforms } = useCreativeOptions();
  const [d, setD] = useState<ContentDetail | null>(null);
  const [titleEdit, setTitleEdit] = useState<string | null>(null);   // ดับเบิลคลิกหัว drawer = แก้ชื่อ (null = ไม่ได้แก้อยู่)
  const { can } = useAuth();
  const canAiCaption = can("ai.caption");   // สิทธิ์กดปุ่มให้ AI เขียนแคปชั่น (มีค่าใช้จ่าย)
  const [caps, setCaps] = useState<ContentCaption[]>([]);
  const [touchedCaps, setTouchedCaps] = useState<Set<string>>(new Set());   // ช่องที่ผู้ใช้ "แก้เอง" (platform|caption / platform|hashtags)
  const [applyFrom, setApplyFrom] = useState<string | null>(null);          // ป๊อป "ใช้ทั้งหมด" — แพลตฟอร์มต้นทาง
  const [links, setLinks] = useState<{ platform: string; url: string }[]>([]);
  const [status, setStatus] = useState<ContentStatus>("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  // สถานะ/ลิงก์การโพสต์ต่อแพลตฟอร์ม (บันทึกทันทีที่กด — ไม่ต้องรอปุ่มบันทึก)
  const [postStatus, setPostStatus] = useState<Record<string, string>>({});   // platform → 'posted' | 'skip' (ไม่มี = ยังไม่โพสต์)
  const [postedLinks, setPostedLinks] = useState<Record<string, string>>({});   // platform → ลิงก์โพสต์ที่ลงแล้ว
  const [platformFormats, setPlatformFormats] = useState<Record<string, string>>({});   // platform → รูปแบบโพสต์ (โพสต์เดี่ยว/อัลบั้ม/Reels/Story)
  const [platformImages, setPlatformImages] = useState<Record<string, string[]>>({});   // platform → รูป(r2 key)ที่เลือกไว้ต่อแพลตฟอร์ม (โชว์บนการ์ดย่อย + default ตอนโพสต์)
  const [metaStatus, setMetaStatus] = useState<MetaConnStatus>({});   // เชื่อมต่อ Facebook/IG ของแบรนด์นี้แล้วหรือยัง (กด "โพสต์เลย" ยิงจริงได้ไหม)
  const [posting, setPosting] = useState<string | null>(null);   // แพลตฟอร์มที่กำลังยิงโพสต์จริง
  const [postModal, setPostModal] = useState<{ platform: string; captionText: string } | null>(null);   // ป๊อปอัปยืนยันก่อนโพสต์
  const [assignees, setAssignees] = useState<UserPickerValue[]>([]);   // ผู้รับผิดชอบคอนเทนต์ (หลายคน m2m)
  const [saving, setSaving] = useState(false);
  // แม่แบบ + ส่วนลด
  const [templates, setTemplates] = useState<CaptionTemplate[]>([]);
  const [shopChannels, setShopChannels] = useState<ShopChannel[]>([]);
  const [discountValue, setDiscountValue] = useState<string>("");
  const [discountPct, setDiscountPct] = useState(false);
  const [tplSettingsOpen, setTplSettingsOpen] = useState(false);
  // แพลตฟอร์มที่กางอยู่ (แบบพับเก็บ) — เริ่มต้นกางตัวแรกที่ยังไม่ได้โพสต์
  const [aiAllBusy, setAiAllBusy] = useState(false);   // กำลังให้ AI เขียนทุกแพลตฟอร์ม
  const [aiModal, setAiModal] = useState<{ platforms: string[] } | null>(null);
  // ปุ่มบนหัวคอลัมน์แคปชั่นที่ "โชว์" (สูงสุด 3) — จำรายคนที่ user_ui_prefs
  const [pinnedTools, setPinnedTools] = useState<string[]>(["ai", "expand", "copy_prompt"]);
  useEffect(() => {
    apiFetch("/api/user-prefs?key=content_caption_toolbar").then((r) => r.json()).then((j) => {
      const v = (j?.value as { pinned?: unknown } | undefined)?.pinned;
      if (Array.isArray(v) && v.length) setPinnedTools(v.filter((x): x is string => typeof x === "string").slice(0, 3));
    }).catch(() => { /* ไม่ขึ้นก็ใช้ค่าเริ่มต้น */ });
  }, []);
  const savePinnedTools = (keys: string[]) => {
    setPinnedTools(keys);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "content_caption_toolbar", value: { pinned: keys } }) }).catch(() => { /* ไม่เป็นไร */ });
  };   // ป๊อป AI (ทั้งหมด / ช่องเดียว)
  const [openPlats, setOpenPlats] = useState<Set<string>>(new Set());
  const [openInit, setOpenInit] = useState(false);
  useEffect(() => {
    if (openInit || caps.length === 0) return;
    const first = caps.find((c) => !["posted", "skip", "scheduled"].includes(postStatus[c.platform] ?? "todo")) ?? caps[0];
    setOpenPlats(new Set(first ? [first.platform] : []));
    setOpenInit(true);
  }, [caps, postStatus, openInit]);
  const togglePlat = (k: string) => setOpenPlats((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const [psOpen, setPsOpen] = useState(false);   // โมดอลตั้งค่าแพลตฟอร์ม
  const [capCfg, setCapCfg] = useState<CaptionConfig>({});   // พรอมต์ + แฮชแท็กเริ่มต้น
  const [cfgOpen, setCfgOpen] = useState(false);   // โมดอลตั้งค่าพรอมต์/แฮชแท็ก
  const [hashOpen, setHashOpen] = useState(false);   // โมดอลจัดการคลังแฮชแท็ก
  // แบรนด์ของคอนเทนต์ — ดึงจากสินค้าอัตโนมัติ (เมื่อยังว่าง) แต่แก้เองได้
  const [brandId, setBrandId] = useState<string | null>(null);
  const [brandTouched, setBrandTouched] = useState(false);   // ผู้ใช้เลือกแบรนด์เอง → ไม่ให้ auto-fill ทับ
  // สินค้า: SKU เดี่ยว + Parent SKU + สีที่มี
  const [sku, setSku] = useState<SkuPickerValue | null>(null);
  const [parent, setParent] = useState<ParentSkuPickerValue | null>(null);
  const [children, setChildren] = useState<ParentSkuChild[]>([]);   // ลูก SKU ของ Parent (สี 2 ภาษา + ราคา)
  const [colorSource, setColorSource] = useState<"th" | "en">("th");   // {color} ใช้ไทย/อังกฤษ (จำต่อคอนเทนต์)
  const [priceSkuId, setPriceSkuId] = useState<string>("");   // เลือกราคาจาก SKU ลูกตัวไหน (Parent)
  const [recTimes, setRecTimes] = useState<RecommendedTimes>({});   // เวลาแนะนำการโพสต์ต่อวัน (จันทร์-อาทิตย์)
  const [recOpen, setRecOpen] = useState(false);   // โมดอลตั้งเวลาแนะนำ
  const [pullBusy, setPullBusy] = useState(false);
  const [openParentId, setOpenParentId] = useState<string | null>(null);   // เปิด drawer Parent SKU
  // แนบงาน (รูป/วิดีโอ/ลิงก์) + ตั้งค่าแพลตฟอร์มกลาง
  const [attachments, setAttachments] = useState<ContentAttachment[]>([]);
  const [pset, setPset] = useState<PlatformSettings>({});
  // รูป/ลิงก์ที่ "ส่งมาแล้ว" จากงานย่อยที่อนุมัติแล้ว (ของงานที่ผูกไว้) — ไว้หยิบไปโพสต์
  const [taskMedia, setTaskMedia] = useState<{ images: { key: string; label: string | null; status: string }[]; links: { label: string | null; url: string | null }[] }>({ images: [], links: [] });
  const [tmLb, setTmLb] = useState(-1);   // ดูรูปจากงานเต็มจอ
  // แบ่ง 2 ฝั่ง ปรับขนาดได้ (ลากเส้นกลาง) — จำสัดส่วนใน localStorage
  const isWide = useMediaQuery("(min-width: 1024px)");   // จอกว้าง → 2 ฝั่ง · มือถือ/แท็บเล็ตแคบ → เรียงบน-ล่าง
  const { theme: dth, update: dthUpdate } = useDrawerTheme("content");   // ธีม drawer คอนเทนต์ (ต่อคน)
  const CONTENT_SECTIONS = [
    { key: "task_media", label: t("รูปจากงาน", "From task") }, { key: "product", label: t("สินค้า", "Product") },
    { key: "price", label: t("ราคา/ส่วนลด", "Price") }, { key: "attach", label: t("แนบเพิ่มเอง", "Attach") },
    { key: "links", label: t("ลิงก์สินค้า", "Links") }, { key: "platform_notes", label: t("หมายเหตุแพลตฟอร์ม", "Platform notes") },
  ];
  const cSecOrder = orderedKeys(dth, CONTENT_SECTIONS.map((s) => s.key));
  const cOrderOf = (k: string) => cSecOrder.indexOf(k);   // ลำดับส่วน (CSS order) ตามที่ผู้ใช้จัด
  const cLabelOf = (k: string) => CONTENT_SECTIONS.find((s) => s.key === k)?.label ?? k;
  const coll = (k: string) => isCollapsed(dth, k);
  const toggleColl = (k: string) => dthUpdate({ collapsed: toggleCollapsedList(dth, k) });
  const tmBadge = (s: string) => s === "approved" ? { label: t("อนุมัติ", "OK"), cls: "bg-emerald-500" }
    : s === "submitted" ? { label: t("รออนุมัติ", "Pending"), cls: "bg-amber-500" }
    : s === "revision_requested" ? { label: t("ตีกลับ", "Revise"), cls: "bg-orange-500" }
    : { label: t("ร่าง", "Draft"), cls: "bg-slate-400" };
  const bodyRef = useRef<HTMLDivElement>(null);
  const leftPctRef = useRef(46);
  const [leftPct, setLeftPctState] = useState(46);
  const setLeftPct = useCallback((v: number) => { leftPctRef.current = v; setLeftPctState(v); }, []);
  const draggingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const detail = await getContent(contentId);
      setD(detail); setStatus(detail.status); setScheduledAt(detail.scheduled_at ? detail.scheduled_at.slice(0, 16) : ""); setPublishedUrl(detail.published_url ?? "");
      setPostStatus(detail.post_status ?? {}); setPostedLinks(detail.posted_links ?? {}); setPlatformImages(detail.platform_images ?? {}); setPlatformFormats(detail.platform_formats ?? {});
      setAssignees((detail.assignees && detail.assignees.length ? detail.assignees : (detail.assignee_id ? [{ id: detail.assignee_id, name: detail.assignee_label ?? "" }] : [])).map((a) => ({ id: a.id, name: a.name } as UserPickerValue)));
      setLinks(Array.isArray(detail.product_links) ? detail.product_links : []);
      setDiscountValue(detail.discount_value != null ? String(detail.discount_value) : "");
      setDiscountPct(!!detail.discount_is_percent);
      setSku(detail.sku_id ? { id: detail.sku_id, code: detail.sku_code ?? "", name: detail.sku_name ?? detail.product_name ?? "", color: detail.sku_color, list_price: detail.sku_price, fake_price: detail.sku_fake_price ?? null } : null);
      setParent(detail.parent_sku_id ? { id: detail.parent_sku_id, code: detail.parent_sku_code ?? "", name: detail.parent_sku_name ?? "" } : null);
      setBrandId(detail.brand_id ?? null); setBrandTouched(false);
      setColorSource(detail.color_source === "en" ? "en" : "th");
      // เตรียม caption ให้ครบทุกแพลตฟอร์มของคอนเทนต์ — แพลตฟอร์มที่ยังไม่มีแคปชั่น เติมแฮชแท็กเริ่มต้นให้
      const cfg = await getCaptionConfig().catch(() => ({} as CaptionConfig));
      setCapCfg(cfg);
      const platforms = detail.platforms ?? [];
      const byPlat = new Map(detail.captions.map((c) => [c.platform, c]));
      setCaps(platforms.map((p) => byPlat.get(p) ?? { platform: p, caption: "", hashtags: defaultHashtags(cfg, detail.brand_id, p) }));
    } catch (e) { pushToast("error", (e as Error).message); }
  }, [contentId, pushToast]);
  useEffect(() => { load(); }, [load]);

  // โหลดไฟล์แนบ + ตั้งค่าแพลตฟอร์มกลาง
  const loadAttachments = useCallback(async () => { try { setAttachments(await listContentAttachments(contentId)); } catch { /* ว่าง */ } }, [contentId]);
  useEffect(() => { loadAttachments(); }, [loadAttachments]);
  const loadPset = useCallback(async () => { try { setPset(await getPlatformSettings()); } catch { /* ว่าง */ } }, []);
  useEffect(() => { loadPset(); }, [loadPset]);
  // เชื่อมต่อ Meta ของแบรนด์นี้ (รู้ว่าปุ่ม "โพสต์เลย" ยิง Facebook จริงได้ไหม)
  useEffect(() => { const b = brandId; if (!b) { setMetaStatus({}); return; } let live = true; getMetaStatus(b).then((s) => { if (live) setMetaStatus(s); }); return () => { live = false; }; }, [brandId]);

  // ดึงรูป/ลิงก์จากงานย่อยของงานที่ผูกไว้ — โชว์ทั้งที่ยังไม่อนุมัติ (มีป้ายสถานะกำกับ), ตัดซ้ำ
  const loadTaskMedia = useCallback(async () => {
    if (!d?.task_id) { setTaskMedia({ images: [], links: [] }); return; }
    try {
      const subs = await listSubtasks(d.task_id);
      const seen = new Set<string>();
      const images: { key: string; label: string | null; status: string }[] = [];
      const links: { label: string | null; url: string | null }[] = [];
      // เรียงให้ "อนุมัติแล้ว" ขึ้นก่อน แล้วค่อยที่เหลือ
      const ordered = [...subs].sort((a, b) => (a.status === "approved" ? 0 : 1) - (b.status === "approved" ? 0 : 1));
      for (const s of ordered) {
        for (const a of (s.attachments ?? [])) {
          if (a.kind === "image" && a.r2_key) { if (!seen.has(a.r2_key)) { seen.add(a.r2_key); images.push({ key: a.r2_key, label: s.title, status: s.status }); } }
          else if (a.kind !== "image" && a.url) { links.push({ label: a.label ?? s.title, url: a.url }); }
        }
        for (const arr of Object.values(s.image_sync_targets?.sku_images ?? {})) for (const k of (arr as string[])) { if (k && !seen.has(k)) { seen.add(k); images.push({ key: k, label: s.title, status: s.status }); } }
      }
      setTaskMedia({ images, links });
    } catch { /* ว่าง */ }
  }, [d?.task_id]);
  useEffect(() => { loadTaskMedia(); }, [loadTaskMedia]);

  // ก๊อปลิงก์รูป (URL เต็ม) ไปใช้ลงโพสต์
  const copyImageUrl = async (key: string) => {
    const rel = r2ImageUrl(key); if (!rel) return;
    const abs = typeof window !== "undefined" ? window.location.origin + rel : rel;
    try { await navigator.clipboard.writeText(abs); pushToast("success", t("ก๊อปลิงก์รูปแล้ว", "Image link copied")); }
    catch { pushToast("error", t("ก๊อปไม่สำเร็จ", "Copy failed")); }
  };

  // ปรับสัดส่วน 2 ฝั่งด้วยการลากเส้นแบ่ง
  useEffect(() => {
    try { const s = Number(localStorage.getItem("content_drawer_left_pct")); if (s >= 30 && s <= 68) setLeftPct(s); } catch { /* ไม่มีค่าเก็บไว้ */ }
    const move = (e: MouseEvent) => {
      if (!draggingRef.current || !bodyRef.current) return;
      const rect = bodyRef.current.getBoundingClientRect();
      const pct = Math.max(30, Math.min(68, ((e.clientX - rect.left) / rect.width) * 100));
      setLeftPct(pct);
    };
    const up = () => { if (!draggingRef.current) return; draggingRef.current = false; document.body.style.userSelect = ""; try { localStorage.setItem("content_drawer_left_pct", String(Math.round(leftPctRef.current))); } catch { /* noop */ } };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [setLeftPct]);
  const startDrag = (e: React.MouseEvent) => { draggingRef.current = true; document.body.style.userSelect = "none"; e.preventDefault(); };

  // โหลดแม่แบบ + ช่องทางร้านของแบรนด์คอนเทนต์
  const loadTemplates = useCallback(async () => {
    try { const r = await getCaptionTemplates(brandId); setTemplates(r.templates); setShopChannels(r.shop_channels); } catch { /* ใช้ค่าว่าง */ }
  }, [brandId]);
  useEffect(() => { if (d) loadTemplates(); }, [d, loadTemplates]);

  const setCap = (platform: string, patch: Partial<ContentCaption>) => setCaps((cs) => cs.map((c) => c.platform === platform ? { ...c, ...patch } : c));
  // สถานะโพสต์ต่อแพลตฟอร์ม — เปลี่ยนแล้วบันทึกทันที (partial PATCH ไม่แตะแคปชั่น/ฟิลด์อื่น)
  const setPlatStatus = (platform: string, s: string) => {
    const next = { ...postStatus }; if (s === "todo") delete next[platform]; else next[platform] = s;
    setPostStatus(next);
    void updateContent(contentId, { post_status: next }).catch((e) => pushToast("error", (e as Error).message));
  };
  const setPlatPostedUrl = (platform: string, url: string) =>
    setPostedLinks((prev) => { const n = { ...prev }; if (url.trim()) n[platform] = url; else delete n[platform]; return n; });
  const persistPostedLinks = () => void updateContent(contentId, { posted_links: postedLinks }).catch((e) => pushToast("error", (e as Error).message));
  // เลือก/ยกเลิกรูปต่อแพลตฟอร์ม — เปลี่ยนแล้วบันทึกทันที (ไม่แตะแคปชั่น) · รูปที่เลือกไปโชว์บนการ์ดย่อย + เป็น default ตอนโพสต์
  const togglePlatformImage = (platform: string, key: string) => {
    setPlatformImages((prev) => {
      const cur = prev[platform] ?? [];
      const arr = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      const next = { ...prev }; if (arr.length) next[platform] = arr; else delete next[platform];
      void updateContent(contentId, { platform_images: next }).catch((e) => pushToast("error", (e as Error).message));
      return next;
    });
  };
  // ตั้งรูปที่เลือกให้เป็น "รูปใหญ่" (ย้ายไปหน้าสุด · [0]=รูปใหญ่บนการ์ดย่อย) — บันทึกทันที
  const setPlatformMainImage = (platform: string, key: string) => {
    setPlatformImages((prev) => {
      const cur = prev[platform] ?? []; if (!cur.includes(key) || cur[0] === key) return prev;
      const next = { ...prev, [platform]: [key, ...cur.filter((k) => k !== key)] };
      void updateContent(contentId, { platform_images: next }).catch((e) => pushToast("error", (e as Error).message));
      return next;
    });
  };
  // media ที่เลือกลงโพสต์ได้ (รูป/วิดีโอแนบ + รูปจากงาน · ตัดซ้ำ) + ชนิดต่อ key
  const postImages: PostImage[] = (() => {
    const seen = new Set<string>(); const out: PostImage[] = [];
    for (const a of attachments) if ((a.kind === "image" || a.kind === "video") && a.r2_key && !seen.has(a.r2_key)) { seen.add(a.r2_key); out.push({ key: a.r2_key, label: a.label ?? a.file_name ?? null, type: a.kind === "video" ? "video" : "image" }); }
    // วิดีโอที่อยู่บน Google Drive (ไม่มีไฟล์ในระบบ) — คีย์เป็น drive:<fileId>
    for (const a of attachments) if (a.kind === "video" && !a.r2_key && (a.url ?? "").startsWith("drive:") && !seen.has(a.url as string)) { seen.add(a.url as string); out.push({ key: a.url as string, label: a.label ?? a.file_name ?? null, type: "video" }); }
    for (const im of taskMedia.images) if (im.key && !seen.has(im.key)) { seen.add(im.key); out.push({ key: im.key, label: im.label ?? null, type: "image" }); }
    return out;
  })();
  const mediaTypeOf = (k: string): "image" | "video" => postImages.find((m) => m.key === k)?.type ?? "image";
  const contentImageKeys = attachments.filter((a) => a.kind === "image" && a.r2_key).map((a) => a.r2_key as string);

  // ยิงโพสต์จริง (Facebook/Instagram) จากป๊อปยืนยัน · รูป/วิดีโอ/อัลบั้ม + ตั้งเวลา(FB) · IG Reels = ตามเช็กสถานะ
  const runPublish = async (platform: string, captionText: string, selectedKeys: string[], scheduledUnix: number | null, fmtOverride?: string) => {
    const label = platform === "facebook" ? "Facebook" : "Instagram";
    // เลือกวิดีโอ → โพสต์เป็นวิดีโอ (ตัวแรก) · ไม่งั้น = รูปทั้งหมด
    const videoKey = selectedKeys.find((k) => mediaTypeOf(k) === "video");
    const media: PostMediaRef[] = videoKey ? [{ key: videoKey, type: "video" }] : selectedKeys.map((k) => ({ key: k, type: "image" as const }));
    setPosting(platform);
    try {
      const res = await publishToPlatform(contentId, platform, captionText, media, scheduledUnix ?? undefined, fmtOverride ?? platformFormats[platform]);
      setPostModal(null);
      if (res.processing && res.creationId) {
        // IG Reels: ตามเช็กสถานะจนพร้อม (สูงสุด ~2.5 นาที)
        const cid = res.creationId;
        pushToast("info", t("Instagram กำลังประมวลผลวิดีโอ… รอสักครู่", "Instagram is processing the video…"));
        let done = false;
        for (let i = 0; i < 30 && !done; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          const f = await igFinalize(contentId, cid);
          if (f.url) { setPostStatus((p) => ({ ...p, [platform]: "posted" })); setPostedLinks((p) => ({ ...p, [platform]: f.url as string })); pushToast("success", t("โพสต์ Reels ขึ้น Instagram แล้ว 🎉", "Reel posted to Instagram 🎉")); done = true; }
        }
        if (!done) pushToast("info", t("วิดีโอยังประมวลผลอยู่ — IG จะโพสต์ให้เมื่อพร้อม (เช็กที่ IG ภายหลัง)", "Still processing — IG will post it once ready"));
      } else {
        setPostStatus((prev) => ({ ...prev, [platform]: res.scheduled ? "scheduled" : "posted" }));
        setPostedLinks((prev) => ({ ...prev, [platform]: res.url }));
        pushToast("success", res.scheduled ? t(`ตั้งเวลาโพสต์บน ${label} แล้ว ⏰`, `Scheduled on ${label} ⏰`) : t(`โพสต์ขึ้น ${label} แล้ว 🎉`, `Posted to ${label} 🎉`));
      }
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setPosting(null); }
  };
  // โหมดมือ (ยังไม่เชื่อม): คัดลอกแคปชั่น + เปิดหน้าโพสต์ให้
  // X (Twitter): ใช้ web intent เติมข้อความให้เลย (ฟรี ไม่ใช้ API) → พี่แค่แนบรูป+โพสต์
  const manualPost = (platform: string, captionText: string) => {
    navigator.clipboard.writeText(captionText).catch(() => {});
    if (platform === "x") {
      window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(captionText)}`, "_blank", "noopener,noreferrer");
      pushToast("success", t("เปิด X พร้อมเติมข้อความแล้ว — แนบรูปแล้วโพสต์ได้เลย", "Opened X with text prefilled — attach images & post"));
      setPostModal(null); return;
    }
    const u = (pset[platform]?.post_url ?? "").trim();
    if (u) { window.open(u, "_blank", "noopener,noreferrer"); pushToast("success", t("คัดลอกแคปชั่น + เปิดหน้าโพสต์แล้ว", "Caption copied + post page opened")); }
    else pushToast("info", t("คัดลอกแคปชั่นแล้ว · ยังไม่ได้ตั้งลิงก์หน้าโพสต์ (⚙️ ตั้งค่าแพลตฟอร์ม)", "Caption copied · no post link set (⚙️ Platform settings)"));
    setPostModal(null);
  };
  // "ใช้ทั้งหมด": เปิดป๊อปให้เลือกโหมด (ถ้าช่องต้นทางยังว่างก็ไม่ต้องเปิด)
  const openApplyAll = (fromPlatform: string) => {
    const src = caps.find((c) => c.platform === fromPlatform);
    if (!src || (!src.caption?.trim() && !src.hashtags?.trim())) { pushToast("info", t("ช่องนี้ยังว่าง — กรอกก่อนแล้วค่อยกด", "This field is empty — fill it first")); return; }
    setApplyFrom(fromPlatform);
  };
  // เอา caption/hashtags ของช่องต้นทางไปแพลตฟอร์มอื่นตามโหมด: empty=เฉพาะช่องว่าง · except_edited=ทุกอันยกเว้นที่แก้เอง · all=ทับหมด
  const applyCapToAll = (fromPlatform: string, mode: "empty" | "except_edited" | "all") => {
    const src = caps.find((c) => c.platform === fromPlatform);
    if (!src) return;
    setCaps((cs) => cs.map((c) => {
      if (c.platform === fromPlatform) return c;
      const next = { ...c };
      if (src.caption?.trim()) {
        const keep = mode === "empty" ? !!c.caption?.trim() : mode === "except_edited" ? touchedCaps.has(`${c.platform}|caption`) : false;
        if (!keep) next.caption = src.caption;
      }
      if (src.hashtags?.trim()) {
        const keep = mode === "empty" ? !!c.hashtags?.trim() : mode === "except_edited" ? touchedCaps.has(`${c.platform}|hashtags`) : false;
        if (!keep) next.hashtags = src.hashtags;
      }
      return next;
    }));
    pushToast("success", t("ใช้กับแพลตฟอร์มอื่นแล้ว", "Applied to other platforms"));
    setApplyFrom(null);
  };

  // เลือก Parent SKU → ดึงสีของ SKU ลูกทั้งหมดมารวม
  useEffect(() => { if (!parent?.id) { setChildren([]); return; } let live = true; getParentSkuChildren(parent.id).then((cs) => { if (live) { setChildren(cs); setPriceSkuId((prev) => prev || cs[0]?.id || ""); } }).catch(() => {}); return () => { live = false; }; }, [parent?.id]);

  // เลือกสินค้า → เดาแบรนด์ให้อัตโนมัติ (เฉพาะตอนยังไม่มีแบรนด์ + ผู้ใช้ยังไม่ได้เลือกเอง)
  useEffect(() => {
    if (brandTouched || brandId) return;
    const pid = parent?.id ?? null; const sid = sku?.id ?? null;
    if (!pid && !sid) return;
    let live = true;
    resolveBrandFromProduct({ parentSkuId: pid, skuId: sid }).then((bid) => { if (live && bid) setBrandId(bid); });
    return () => { live = false; };
  }, [parent?.id, sku?.id, brandTouched, brandId]);
  useEffect(() => { getRecommendedTimes().then(setRecTimes).catch(() => {}); }, []);

  // ดึงสินค้า (SKU/Parent) จากงานที่ผูกไว้
  const pullFromTask = async () => {
    if (!d?.task_id) return;
    setPullBusy(true);
    try {
      const task = await getTask(d.task_id);
      const s = task.skus?.[0]; const p = task.parent_skus?.[0];
      if (s) setSku({ id: s.id, code: s.code ?? "", name: s.name ?? "", color: s.color ?? null, list_price: s.price ?? null });
      if (p) setParent({ id: p.id, code: p.code ?? "", name: p.name ?? "" });
      pushToast(s || p ? "success" : "info", s || p ? t("ดึงสินค้าจากงานแล้ว", "Pulled product from task") : t("งานนี้ยังไม่ได้ผูกสินค้า", "This task has no linked product"));
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setPullBusy(false); }
  };

  // ไฟล์แนบ: รูป (ย่อก่อนอัป) / วิดีโอสั้น (อัปตรง) / ลิงก์ (พรีวิว OG)
  const onAttachImage = async (r: { r2_key: string; file_name: string; content_type: string; size_bytes: number }) => { await addContentAttachment(contentId, { kind: "image", r2_key: r.r2_key, file_name: r.file_name, content_type: r.content_type, size_bytes: r.size_bytes }); await loadAttachments(); };
  const onDelAttachment = async (id: string) => { await deleteContentAttachment(contentId, id); await loadAttachments(); };
  const onUploadVideo = async (file: File) => {
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "creative-content");
    const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({ error: "อัปโหลดไม่สำเร็จ" }));
    if (j.error) { pushToast("error", j.error as string); return; }
    await addContentAttachment(contentId, { kind: "video", r2_key: j.r2_key as string, file_name: file.name, content_type: j.content_type as string, size_bytes: j.size as number });
    await loadAttachments();
  };
  const onAddLink = async (url: string) => {
    const pv = await getLinkPreview(url);
    await addContentAttachment(contentId, { kind: "link", url: pv.url, label: pv.title, file_name: pv.image });
    await loadAttachments();
  };
  // 🎬 วิดีโอที่อยู่บน Google Drive — เก็บแค่ลิงก์ ไม่ก็อปไฟล์ลง R2 (คลิปใหญ่อยู่ที่ Drive ที่เดียว)
  const onAddDriveVideo = async (link: string) => {
    try {
      const j = await apiFetch("/api/drive-video/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      await addContentAttachment(contentId, { kind: "video", url: `drive:${j.file_id}`, label: j.name || "Google Drive", file_name: j.name ?? null, content_type: j.mime_type ?? null, size_bytes: j.size ?? null });
      await loadAttachments();
      pushToast("success", t("เพิ่มวิดีโอจาก Drive แล้ว (ไม่ได้ก็อปไฟล์ลงระบบ)", "Added Drive video (no copy stored)"));
    } catch (e) { pushToast("error", (e as Error).message); }
  };

  // โน้ตต่อแพลตฟอร์ม (แก้ในตัว) — บันทึกตอนเลิกโฟกัส
  const setPlatNote = (platform: string, note: string) => setPset((ps) => ({ ...ps, [platform]: { ...ps[platform], note } }));
  const persistPset = async () => { try { await savePlatformSettings(pset); } catch (e) { pushToast("error", (e as Error).message); } };

  // ราคาเต็ม = ราคา SKU ที่เลือก · ราคาขาย = ราคา − ส่วนลด · สี = SKU เดี่ยว หรือ รวมสีลูกของ Parent
  // สี: Parent → รวมสีลูก (เลือกภาษาไทย/อังกฤษได้) · SKU เดี่ยว → สีของตัวเอง (ตามภาษาที่มี)
  const childColors = [...new Set(children.map((c) => ((colorSource === "en" ? c.color_en : c.color_th) ?? "").trim()).filter(Boolean))];
  const singleColor = colorSource === "en" ? (d?.sku_color_en ?? sku?.color ?? null) : (d?.sku_color_th ?? sku?.color ?? null);
  const colorText = childColors.length ? childColors.join(", ") : (sku ? singleColor : null);
  // ราคา: SKU เดี่ยว → ราคาตัวเอง · Parent → ราคาจาก SKU ลูกที่เลือก (default ตัวแรก)
  const priceChild = children.find((c) => c.id === priceSkuId) ?? children[0] ?? null;
  const realSelling = sku?.list_price ?? priceChild?.list_price ?? null;   // ราคาขายจริง (list_price)
  const fakeVal = sku?.fake_price ?? priceChild?.fake_price ?? null;        // ราคาปลอม (fake_price — ราคาขีดฆ่าให้ดูลดเยอะ)
  const discountAmt = (fakeVal != null && realSelling != null && fakeVal > realSelling) ? fakeVal - realSelling : null;  // ส่วนลด = ปลอม − จริง
  // เวลาแนะนำของวันที่เลือกโพสต์ (โชว์ปุ่มให้กดใช้ — มีได้หลายเวลา ตัดอันที่ตรงกับที่เลือกอยู่)
  const schedRec = useMemo(() => {
    const dpart = scheduledAt.slice(0, 10);
    if (dpart.length < 10) return null;
    const day = new Date(`${dpart}T00:00:00`).getDay();
    const cur = scheduledAt.slice(11, 16);
    const items = (recTimes[String(day)] ?? []).filter((it) => it.time && it.time !== cur);
    if (!items.length) return null;
    return { items, label: t(["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."][day], ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]) };
  }, [scheduledAt, recTimes, t]);
  const applyRecommendedTime = (tm: string) => setScheduledAt(`${scheduledAt.slice(0, 10)}T${tm}`);
  // ตัวแปรสินค้าที่ใช้ร่วมทุก caption (ไม่รวม caption/hashtags ที่ต่างกันต่อแพลตฟอร์ม)
  const sharedVars = useMemo(() => ({
    shop: shopChannels, fake_price: fakeVal, real_price: realSelling,
    price: realSelling, color: colorText, sku: sku?.code ?? null, product: sku?.name ?? d?.product_name ?? null,
    // {link} = ลิงก์สินค้าทุกแพลตฟอร์มเป็นบล็อก (เช่น "Shopee: TEST1\nLazada: TEST2")
    link: links.filter((l) => l.url.trim()).map((l) => `${platformLabel(l.platform)}: ${l.url.trim()}`).join("\n") || null,
  }), [shopChannels, fakeVal, realSelling, colorText, sku?.code, sku?.name, d?.product_name, links]);

  // คัดลอกพรอมต์ตั้งต้น (เติมตัวแปรสินค้าให้แล้ว) ไปวางใน AI เขียนแคปชั่นต่อ
  const copyPrompt = async () => {
    const raw = resolvePrompt(capCfg, brandId);
    if (!raw.trim()) { pushToast("info", t("ยังไม่ได้ตั้งพรอมต์ — กด ✍️ ตั้งค่า", "No prompt set — click ✍️ Config")); setCfgOpen(true); return; }
    const text = renderCaption(raw, { caption: "", hashtags: "", ...sharedVars });
    try { await navigator.clipboard.writeText(text); pushToast("success", t("คัดลอกพรอมต์แล้ว", "Prompt copied")); }
    catch { pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")); }
  };

  // ✨ ให้ AI เขียนแคปชั่นทุกแพลตฟอร์มรอบเดียว — ประหยัด token เพราะอ่านรูปครั้งเดียวต่อชุดรูป
  // (ฝั่ง server จับกลุ่มแพลตฟอร์มที่ใช้รูปชุดเดียวกัน แล้วยิง OpenAI ครั้งเดียวต่อกลุ่ม)
  const aiWriteAll = async (platforms: string[], extra: string, overwrite: boolean) => {
    if (!contentId) { pushToast("error", t("บันทึกคอนเทนต์ก่อน แล้วค่อยให้ AI เขียน", "Save the content first")); return; }
    if (platforms.length === 0) { pushToast("info", t("ไม่มีแพลตฟอร์มที่เปิดใช้แคปชั่น", "No platform has captions enabled")); return; }
    setAiAllBusy(true);
    try {
      const r = await apiFetch("/api/ai/caption-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content_id: contentId, platforms, overwrite, extra }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      const results = (j.results ?? []) as { platform: string; caption: string; hashtags: string[] }[];
      for (const res of results) {
        const cur = caps.find((c) => c.platform === res.platform);
        const old = (cur?.hashtags ?? "").trim();
        const have = new Set(old.split(/\s+/).filter(Boolean).map((x) => x.toLowerCase()));
        const add = (res.hashtags ?? []).filter((h) => !have.has(h.toLowerCase()));
        setCap(res.platform, { caption: res.caption, ...(add.length ? { hashtags: [old, ...add].filter(Boolean).join(" ") } : {}) });
        setTouchedCaps((s) => { const n = new Set(s); n.add(`${res.platform}|caption`); if (add.length) n.add(`${res.platform}|hashtags`); return n; });
      }
      const skip = ((j.skipped ?? []) as { platform: string; reason: string }[]).length;
      pushToast(results.length ? "success" : "info", t(
        `AI เขียนให้ ${results.length} แพลตฟอร์ม (ยิง AI ${j.calls} ครั้ง · อ่าน ${j.images_used ?? 0} รูป)${skip ? ` · ข้าม ${skip}` : ""} — กด “บันทึก” เพื่อเก็บ`,
        `AI wrote ${results.length} platform(s) in ${j.calls} call(s), ${j.images_used ?? 0} image(s)${skip ? `, skipped ${skip}` : ""} — press Save to keep`));
      if (j.warning) pushToast("error", String(j.warning));
      setAiModal(null);
    } catch (e) { pushToast("error", (e as Error).message); } finally { setAiAllBusy(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateContent(contentId, {
        status, scheduled_at: scheduledAt || null, published_url: publishedUrl.trim() || null, assignee_ids: assignees.map((a) => a.id), color_source: colorSource,
        post_status: postStatus, posted_links: postedLinks, platform_images: platformImages, platform_formats: platformFormats,
        brand_id: brandId || null, sku_id: sku?.id ?? null, parent_sku_id: parent?.id ?? null, product_name: sku?.name ?? d?.product_name ?? null,
        discount_value: discountValue === "" ? null : Number(discountValue), discount_is_percent: discountPct,
        product_links: links.filter((l) => l.url.trim()), captions: caps.map((c) => ({ platform: c.platform, caption: c.caption, hashtags: c.hashtags, caption_type: c.caption_type ?? "short" })),
      });
      pushToast("success", t("บันทึกแล้ว", "Saved")); await load(); onChanged();
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };

  const saveAsTemplate = async () => {
    if (!d) return;
    try {
      await createContent({ is_template: true, title: `${d.title} (เทมเพลต)`, post_type: d.post_type, platforms: d.platforms ?? [], brand_id: brandId, captions: caps.map((c) => ({ platform: c.platform, caption: c.caption, hashtags: c.hashtags, caption_type: c.caption_type ?? "short" })) });
      pushToast("success", t("บันทึกเป็นเทมเพลตแล้ว ✓ (เลือกใช้ได้ตอนสร้างคอนเทนต์)", "Saved as template ✓ (available when creating content)")); onChanged();
    } catch (e) { pushToast("error", (e as Error).message); }
  };
  // ลบคอนเทนต์นี้ (มีปุ่มใน footer เมื่อไม่ได้ส่ง onDelete มาจากหน้า list) — ยืนยันก่อนลบเสมอ
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const doDelete = async () => {
    setDeleting(true);
    try { await deleteContent(contentId); pushToast("success", t("ลบคอนเทนต์แล้ว", "Content deleted")); onDeleted?.(contentId); onChanged(); onClose(); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setDeleting(false); setConfirmDel(false); }
  };

  if (!d) return (<><div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} /><div className="fixed right-0 top-0 h-full w-[1180px] max-w-[98vw] bg-white shadow-2xl z-50 flex items-center justify-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div></>);

  const contentPlatforms = d.platforms ?? [];
  const brandLabel = brands.find((b) => b.id === brandId)?.name ?? null;   // ชื่อแบรนด์ที่เลือกสด ๆ (ให้โมดอลตั้งค่าแคปชั่น/แฮชแท็กตามแบรนด์นี้)
  // จอกว้าง → แยก "รูปจากงาน" เป็นคอลัมน์ซ้ายสุด (3 คอลัมน์: รูป | ข้อมูล | แคปชั่น) · มือถือ = เป็น section ในสแต็ก
  const imagesInLeftPane = isWide && !!d.task_id && !isHidden(dth, "task_media");
  const taskImagesGallery = (cols: string) => (
    taskMedia.images.length === 0 && taskMedia.links.length === 0 ? (
      <p className="text-xs text-slate-400 italic">{t("ยังไม่มีรูป/ลิงก์จากงานย่อย", "No media from subtasks yet")}</p>
    ) : (
      <>
        {taskMedia.images.length > 0 && (
          <div className={`grid ${cols} gap-2`}>
            {taskMedia.images.map((im, i) => { const bd = tmBadge(im.status); return (
              <div key={im.key} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r2ImageUrl(im.key, 320) ?? ""} alt={im.label ?? ""} onClick={() => setTmLb(i)} title={`${im.label ?? ""} · ${bd.label}`} className="w-full h-20 object-cover rounded-lg border border-slate-200 cursor-zoom-in" />
                <span className={`absolute top-0.5 left-0.5 text-[8px] text-white px-1 py-px rounded ${bd.cls}`}>{bd.label}</span>
                <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100">
                  <button onClick={() => copyImageUrl(im.key)} title={t("ก๊อปลิงก์รูป", "Copy image link")} className="h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-slate-600 text-[10px] shadow hover:text-violet-700">🔗</button>
                  <a href={r2ImageUrl(im.key) ?? "#"} download target="_blank" rel="noreferrer" title={t("ดาวน์โหลด", "Download")} className="h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-slate-600 text-[10px] shadow hover:text-violet-700">⬇</a>
                </div>
              </div>
            ); })}
          </div>
        )}
        {taskMedia.links.length > 0 && (
          <div className="mt-2 space-y-1">
            {taskMedia.links.map((l, i) => <a key={i} href={l.url ?? "#"} target="_blank" rel="noreferrer" className="block text-xs text-violet-700 hover:underline truncate">🔗 {l.label || l.url}</a>)}
          </div>
        )}
      </>
    )
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[1180px] max-w-[98vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        <div className="h-1 shrink-0" style={{ background: accentCss(dth) }} />
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            {/* ดับเบิลคลิกชื่อ = แก้ชื่อได้ทันที (Enter/คลิกนอกช่อง = บันทึก · Esc = ยกเลิก) */}
            {titleEdit === null ? (
              <h3 onDoubleClick={() => setTitleEdit(d.title ?? "")} title={t("ดับเบิลคลิกเพื่อแก้ชื่อ", "Double-click to rename")}
                className="text-base font-semibold text-slate-900 truncate cursor-text hover:bg-slate-50 rounded px-1 -mx-1">{d.title}</h3>
            ) : (
              <input autoFocus value={titleEdit} onChange={(e) => setTitleEdit(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } if (e.key === "Escape") { e.preventDefault(); setTitleEdit(null); } }}
                onBlur={async () => {
                  const v = (titleEdit ?? "").trim();
                  setTitleEdit(null);
                  if (!v || v === d.title) return;
                  setD((x) => (x ? { ...x, title: v } : x));   // optimistic
                  try { await updateContent(contentId, { title: v }); pushToast("success", t("เปลี่ยนชื่อแล้ว", "Renamed")); onChanged?.(); }
                  catch (e) { pushToast("error", (e as Error).message); setD((x) => (x ? { ...x, title: d.title } : x)); }
                }}
                className="text-base font-semibold text-slate-900 border-b-2 border-violet-400 outline-none bg-transparent w-full px-1 -mx-1" />
            )}
            <span className="font-mono text-xs text-slate-500">{d.content_no}</span>
            {/* ผูกกับงานอยู่ → กดไปดูงานนั้นได้เลย (เปิดแท็บใหม่ ไม่หลุดจากคอนเทนต์ที่กำลังแก้) */}
            {d.task_id && (
              <a href={`/tasks?task=${d.task_id}`} target="_blank" rel="noreferrer"
                title={t("เปิดงานที่ผูกกับคอนเทนต์นี้ (แท็บใหม่)", "Open the linked task (new tab)")}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5 hover:bg-violet-100 whitespace-nowrap">
                👁 {t("ดูงาน", "View task")} ↗
              </a>
            )}
          </div>
          <div className="flex items-center gap-1">
            <DrawerThemeButton theme={dth} update={dthUpdate} sections={CONTENT_SECTIONS} />
            {onDelete && <button onClick={() => onDelete(d)} className="h-8 px-2 text-xs text-red-500 hover:bg-red-50 rounded-md">{t("ลบ", "Delete")}</button>}
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
          </div>
        </div>

        {/* ===== จอกว้าง: 3 คอลัมน์ (รูปจากงาน | ข้อมูล | แคปชั่น) ปรับขนาดได้ · มือถือ: เรียงบน-ล่าง ===== */}
        <div className={isWide ? "flex-1 flex min-h-0" : "flex-1 overflow-y-auto"} style={{ ...drawerBgStyle(dth), zoom: drawerZoom(dth.size) }}>
          {/* ───── คอลัมน์ซ้ายสุด: รูปจากงาน (เฉพาะจอกว้าง) ───── */}
          {imagesInLeftPane && (
            <div className="w-[210px] shrink-0 overflow-y-auto px-3 py-3 bg-slate-50/40 border-r border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-slate-500 tracking-wide">🖼️ {cLabelOf("task_media")}</p>
                <span className="text-[10px] text-slate-400 bg-white border border-slate-200 rounded-full px-1.5">{taskMedia.images.length}</span>
              </div>
              {taskImagesGallery("grid-cols-2")}
              <p className="text-[10px] text-slate-300 mt-2 leading-tight">{t("กดรูป=ดูเต็มจอ · ⬇ ดาวน์โหลดไปโพสต์", "Click=view · ⬇ download to post")}</p>
            </div>
          )}
          {/* กลุ่ม ข้อมูล | เส้นแบ่ง | แคปชั่น — ตัวลากปรับขนาดทำงานในนี้ (รูปอยู่นอกกลุ่ม จะได้ลากแม่น) */}
          <div ref={bodyRef} className={isWide ? "flex-1 flex min-h-0 min-w-0" : "contents"} style={isWide && dth.swap ? { flexDirection: "row-reverse" } : undefined}>
          {/* ───── ฝั่งกลาง: ข้อมูล + แนบงาน ───── */}
          <div className={`flex flex-col ${densityPad(dth.density)} ${densityGap(dth.density)} ${isWide ? "overflow-y-auto min-w-0" : ""}`} style={isWide ? { flexBasis: `${leftPct}%`, flexGrow: 0, flexShrink: 0 } : undefined}>
            {/* status + schedule + assignee — ปักไว้บนสุดเสมอ */}
            {/* ตั้งเวลาโพสต์ — เด่น ปักบนสุด · (สถานะ/ผู้รับผิดชอบ ย้ายไปจัดการที่งานย่อยแทน) */}
            <div style={{ order: -1 }} className="bg-violet-50 border border-violet-200 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-violet-800 flex items-center gap-1.5">🗓 {t("ตั้งเวลาโพสต์", "Schedule Post")}</label>
                <button type="button" onClick={() => setRecOpen(true)} className="text-[11px] text-violet-700 hover:underline">⚙️ {t("เวลาแนะนำ", "Suggested times")}</button>
              </div>
              <div className="mt-1.5"><ERPInput type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
              {schedRec && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-violet-400">💡 {t("เวลาแนะนำ", "Suggested")} ({schedRec.label}):</span>
                  {schedRec.items.map((it) => (
                    <button key={it.time} type="button" onClick={() => applyRecommendedTime(it.time)} title={it.note || t("เวลาแนะนำ", "Suggested time")} className="inline-flex items-center gap-0.5 text-[11px] text-violet-700 bg-white border border-violet-200 rounded-full px-2.5 py-1 hover:bg-violet-100">{it.time}{it.note ? <span className="text-violet-300">ⓘ</span> : null}</button>
                  ))}
                </div>
              )}
            </div>

            {/* สินค้า: SKU เดี่ยว + Parent SKU + สีที่มี + ดึงจากงาน */}
            {!isHidden(dth, "product") && (
            <CSection title={cLabelOf("product")} order={cOrderOf("product")} collapsed={coll("product")} onToggle={() => toggleColl("product")}
              right={d.task_id ? <button onClick={(e) => { e.stopPropagation(); pullFromTask(); }} disabled={pullBusy} className="text-xs text-violet-700 hover:underline disabled:opacity-50">{pullBusy ? t("กำลังดึง…", "Pulling…") : t("⬇ ดึงสินค้าจากงาน", "⬇ Pull from task")}</button> : undefined}>
              {/* แบรนด์ — ดึงจากสินค้าอัตโนมัติ (เมื่อยังว่าง) แก้เองได้ */}
              <div className="mb-3">
                <label className="text-xs text-slate-400">{t("แบรนด์", "Brand")}</label>
                <div className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border border-slate-200 shrink-0" style={{ background: (brands.find((b) => b.id === brandId)?.color) || "#e2e8f0" }} />
                  <select value={brandId ?? ""} onChange={(e) => { setBrandTouched(true); setBrandId(e.target.value || null); }} className="flex-1 h-9 border border-slate-200 rounded-lg px-2 text-sm bg-white">
                    <option value="">{t("— เดาจากสินค้าอัตโนมัติ —", "— Auto from product —")}</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <p className="text-[11px] text-slate-300 mt-1">{t("เลือก SKU/Parent SKU แล้วระบบเติมแบรนด์ให้ · แก้เองได้", "Pick a SKU/Parent SKU and the brand fills in · editable")}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 items-start">
                <div>
                  <div className="flex items-center justify-between h-5"><label className="text-xs text-slate-400">SKU ({t("สีเดี่ยว", "single color")})</label></div>
                  <SkuPicker value={sku} onChange={setSku} />
                </div>
                <div>
                  <div className="flex items-center justify-between h-5">
                    <label className="text-xs text-slate-400">Parent SKU ({t("ทุกสี", "all colors")})</label>
                    {parent?.id && <button onClick={() => setOpenParentId(parent.id)} className="text-[11px] text-violet-700 hover:underline">↗ {t("เปิดดูสินค้า", "Open")}</button>}
                  </div>
                  <ParentSkuPicker value={parent} onChange={setParent} />
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-center justify-between h-5">
                  <label className="text-xs text-slate-400">{t("สีที่มี", "Available Colors")} ({"{color}"})</label>
                  <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px]" title={t("เลือกภาษาที่ใช้แสดงสีใน {color}", "Language for {color}")}>
                    <button type="button" onClick={() => setColorSource("th")} className={`px-2 h-6 ${colorSource === "th" ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{t("ไทย", "TH")}</button>
                    <button type="button" onClick={() => setColorSource("en")} className={`px-2 h-6 border-l border-slate-200 ${colorSource === "en" ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Eng</button>
                  </div>
                </div>
                <div className="min-h-9 px-3 py-1.5 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg">{colorText || <span className="text-slate-400">{t("— เลือก SKU (ได้สีเดียว) หรือ Parent SKU (รวมทุกสีลูก)", "— Select SKU (single color) or Parent SKU (all child colors)")}</span>}</div>
              </div>
            </CSection>)}

            {/* ราคา / ส่วนลด — ซ่อนถ้ายังไม่เลือก SKU/Parent SKU */}
            {!isHidden(dth, "price") && (sku || parent) && (
            <CSection title={cLabelOf("price")} order={cOrderOf("price")} collapsed={coll("price")} onToggle={() => toggleColl("price")}>
              <div className="flex items-end gap-2 flex-wrap">
                {!sku && children.length > 0 && (
                  <div><label className="text-xs text-slate-400">{t("ราคาจาก SKU", "Price from SKU")}</label>
                    <select value={priceSkuId} onChange={(e) => setPriceSkuId(e.target.value)} className="h-9 border border-slate-200 rounded-lg px-2 text-sm bg-white max-w-[190px]">
                      {children.map((c) => <option key={c.id} value={c.id}>{c.code}{c.list_price != null ? ` · ${Number(c.list_price).toLocaleString("th-TH")}฿` : ""}</option>)}
                    </select>
                  </div>
                )}
                <div><label className="text-xs text-slate-400">{t("ราคาปลอม (จาก SKU)", "Fake price (from SKU)")}</label><div className="h-9 px-3 flex items-center text-sm text-slate-500 line-through bg-slate-50 border border-slate-200 rounded-lg min-w-24">{fakeVal != null ? `${Number(fakeVal).toLocaleString("th-TH")} ฿` : "—"}</div></div>
                <div><label className="text-xs text-slate-400">{t("ราคาขายจริง (จาก SKU)", "Selling price (from SKU)")}</label><div className="h-9 px-3 flex items-center text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg min-w-24">{realSelling != null ? `${Number(realSelling).toLocaleString("th-TH")} ฿` : t("— (ไม่มี SKU)", "— (no SKU)")}</div></div>
                <div><label className="text-xs text-slate-400">{t("ส่วนลด (ปลอม−จริง)", "Discount (fake−real)")}</label><div className="h-9 px-3 flex items-center text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg min-w-24">{discountAmt != null ? `${Number(discountAmt).toLocaleString("th-TH")} ฿` : "—"}</div></div>
              </div>
            </CSection>)}

            {/* รูป/ลิงก์จากงาน — มือถือ/จอแคบ: เป็น section ในสแต็ก (จอกว้างแยกเป็นคอลัมน์ซ้ายสุด) */}
            {!imagesInLeftPane && d.task_id && !isHidden(dth, "task_media") && (
              <CSection title={cLabelOf("task_media")} order={cOrderOf("task_media")} collapsed={coll("task_media")} onToggle={() => toggleColl("task_media")}
                right={<span className="text-[11px] text-slate-400">{taskMedia.images.length} {t("รูป", "img")}</span>}>
                {taskImagesGallery("grid-cols-4")}
                <p className="text-[11px] text-slate-300 mt-1">{t("รูปจากงานย่อย (ป้ายบอกสถานะ) · กดรูป=ดูเต็มจอ · 🔗 ก๊อปลิงก์ · ⬇ ดาวน์โหลด", "Subtask images (status badge) · click=view · 🔗 copy · ⬇ download")}</p>
              </CSection>
            )}


            {/* ลิงก์สินค้า (ปลายทางขาย) */}
            {!isHidden(dth, "links") && (
            <CSection title={cLabelOf("links")} order={cOrderOf("links")} collapsed={coll("links")} onToggle={() => toggleColl("links")}>
              <div className="space-y-2">
                {links.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <select value={l.platform} onChange={(e) => setLinks((ls) => ls.map((x, j) => j === i ? { ...x, platform: e.target.value } : x))} className="h-9 border border-slate-200 rounded-lg px-2 text-sm w-32">
                      {platforms.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <ERPInput value={l.url} onChange={(e) => setLinks((ls) => ls.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} placeholder="https://..." />
                    <button onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))} className="h-9 px-2 text-slate-400 hover:text-red-500">✕</button>
                  </div>
                ))}
                <button onClick={() => setLinks((ls) => [...ls, { platform: "shopee", url: "" }])} className="text-sm text-violet-700 hover:underline">＋ {t("เพิ่มลิงก์", "Add Link")}</button>
              </div>
            </CSection>)}

            {/* แนบเพิ่มเอง: รูป/วิดีโอ/ลิงก์ ของคอนเทนต์เอง (แยกจาก "รูปจากงาน") — รูปที่แนบจะขึ้นบนการ์ดกระดานด้วย */}
            {!isHidden(dth, "attach") && (
            <CSection title={cLabelOf("attach")} order={cOrderOf("attach")} collapsed={coll("attach")} onToggle={() => toggleColl("attach")}
              right={<span className="text-[11px] text-slate-400">{attachments.length} {t("ไฟล์", "files")}</span>}>
              <ContentAttachments attachments={attachments} onAttachImage={onAttachImage} onUploadVideo={onUploadVideo} onAddLink={onAddLink} onAddDriveVideo={onAddDriveVideo} onDelete={onDelAttachment} pushToast={pushToast} />
            </CSection>)}


            {/* published url — ปักไว้ล่างสุดเสมอ */}
            {(status === "published") && <div style={{ order: 999 }}><label className="text-xs text-slate-400">{t("ลิงก์โพสต์ที่เผยแพร่", "Published Post URL")}</label><ERPInput value={publishedUrl} onChange={(e) => setPublishedUrl(e.target.value)} placeholder="https://..." /></div>}
          </div>

          {/* ───── เส้นแบ่งลากได้ (เฉพาะจอกว้าง) ───── */}
          {isWide && (
            <div onMouseDown={startDrag} title={t("ลากเพื่อปรับขนาด", "Drag to resize")} className="w-1.5 shrink-0 cursor-col-resize bg-slate-100 hover:bg-violet-300 active:bg-violet-400 transition-colors relative">
              <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
            </div>
          )}

          {/* ───── ฝั่งขวา: แคปชั่นแยกแพลตฟอร์ม ───── */}
          <div className={isWide ? `flex-1 overflow-y-auto ${densityCls(dth.density)} min-w-0 bg-slate-50/40` : `${densityCls(dth.density)} bg-slate-50/40 border-t border-slate-200`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t("Caption แยกตามแพลตฟอร์ม", "Caption per Platform")}</p>
              <CaptionToolbar pinned={pinnedTools} onSavePinned={savePinnedTools} actions={[
                ...(canAiCaption && caps.length > 0 ? [{
                  key: "ai", primary: true,
                  label: aiAllBusy ? t("✨ กำลังเขียน...", "✨ Writing...") : t("✨ AI เขียนทั้งหมด", "✨ AI write all"),
                  onClick: () => setAiModal({ platforms: caps.filter((c) => pset[c.platform]?.use_caption !== false && (postStatus[c.platform] ?? "todo") !== "skip").map((c) => c.platform) }),
                }] : []),
                ...(caps.length > 1 ? [{
                  key: "expand",
                  label: openPlats.size === caps.length ? t("⊟ พับทั้งหมด", "⊟ Collapse all") : t("⊞ กางทั้งหมด", "⊞ Expand all"),
                  onClick: () => setOpenPlats(openPlats.size === caps.length ? new Set() : new Set(caps.map((c) => c.platform))),
                }] : []),
                { key: "copy_prompt", label: `📋 ${t("คัดลอกพรอมต์", "Copy prompt")}`, onClick: copyPrompt },
                { key: "prompt_cfg", label: `✍️ ${t("พรอมต์/แฮชแท็ก", "Prompt/Hashtags")}`, onClick: () => setCfgOpen(true) },
                { key: "platform_cfg", label: `⚙️ ${t("ตั้งค่าแพลตฟอร์ม", "Platform settings")}`, onClick: () => setPsOpen(true) },
                { key: "templates", label: `📝 ${t("แม่แบบ", "Templates")}`, onClick: () => setTplSettingsOpen(true) },
                { key: "hashtags", label: `🏷 ${t("คลังแฮชแท็ก", "Hashtag library")}`, onClick: () => setHashOpen(true) },
              ]} />
            </div>
            {caps.length === 0 ? <p className="text-sm text-slate-400 italic">{t("ยังไม่ได้เลือกแพลตฟอร์ม (แก้ที่ตอนสร้าง)", "No platforms selected (edit at creation time)")}</p> : (
              <div className="space-y-1.5">
                {caps.map((c) => <CaptionCard key={c.platform} open={openPlats.has(c.platform)} onToggle={() => togglePlat(c.platform)} contentId={contentId} canAi={canAiCaption} aiBusy={aiAllBusy} onAiWrite={() => setAiModal({ platforms: [c.platform] })} format={platformFormats[c.platform]} onSetFormat={(v) => setPlatformFormats((m) => { const n = { ...m }; if (v) n[c.platform] = v; else delete n[c.platform]; return n; })} cap={c} templates={templates} sharedVars={sharedVars} brandId={brandId} setting={pset[c.platform]} onChange={(patch) => { setCap(c.platform, patch); setTouchedCaps((s) => { const n = new Set(s); if ("caption" in patch) n.add(`${c.platform}|caption`); if ("hashtags" in patch) n.add(`${c.platform}|hashtags`); return n; }); }} onOpenSettings={() => setPsOpen(true)} onApplyAll={caps.length > 1 ? openApplyAll : undefined} postStatus={postStatus[c.platform] ?? "todo"} postedUrl={postedLinks[c.platform] ?? ""} onSetStatus={(s) => setPlatStatus(c.platform, s)} onSetPostedUrl={(url) => setPlatPostedUrl(c.platform, url)} onCommitPostedUrl={persistPostedLinks} onRequestPost={(text) => setPostModal({ platform: c.platform, captionText: text })} canAuto={(c.platform === "facebook" && !!metaStatus.facebook?.connected) || (c.platform === "instagram" && !!metaStatus.instagram?.connected)} autoLabel={c.platform === "facebook" ? "Facebook" : c.platform === "instagram" ? "Instagram" : undefined} postImages={postImages} selectedImages={platformImages[c.platform] ?? []} onToggleImage={(key) => togglePlatformImage(c.platform, key)} onSetMain={(key) => setPlatformMainImage(c.platform, key)} pushToast={pushToast} />)}
              </div>
            )}
          </div>
          </div>
        </div>

        <div className="border-t border-slate-200 px-6 py-4 shrink-0 flex items-center gap-2">
          {!onDelete && <button onClick={() => setConfirmDel(true)} disabled={deleting} className="h-9 px-3 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">🗑 {t("ลบ", "Delete")}</button>}
          {!d.is_template && <button onClick={saveAsTemplate} className="h-9 px-3 text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">💾 {t("บันทึกเป็นเทมเพลต", "Save as Template")}</button>}
          <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 ml-auto">{t("ปิด", "Close")}</button>
          <button onClick={save} disabled={saving} style={{ background: btnBg(dth) }} className="h-9 px-5 text-sm font-medium text-white rounded-lg disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button>
        </div>
      </div>

      {cfgOpen && <CaptionConfigModal cfg={capCfg} brandId={brandId} brandLabel={brandLabel} platforms={platforms} onClose={() => setCfgOpen(false)} onSaved={(v) => { setCapCfg(v); setCfgOpen(false); }} pushToast={pushToast} />}
      {tplSettingsOpen && <CaptionTemplateSettings brandId={brandId} brandLabel={brandLabel} onClose={() => setTplSettingsOpen(false)} onSaved={() => { setTplSettingsOpen(false); loadTemplates(); }} pushToast={pushToast} />}
      {psOpen && <PlatformSettingsModal platforms={platforms} templates={templates} settings={pset} onClose={() => setPsOpen(false)} onSaved={(v) => { setPset(v); setPsOpen(false); }} pushToast={pushToast} />}
      {recOpen && <RecommendedTimesModal initial={recTimes} onClose={() => setRecOpen(false)} onSaved={(v) => { setRecTimes(v); setRecOpen(false); }} pushToast={pushToast} />}
      {hashOpen && <HashtagLibraryModal brandId={brandId} onClose={() => setHashOpen(false)} pushToast={pushToast} />}
      {/* ป๊อป AI เขียนแคปชั่น (ใส่คำสั่งเพิ่มได้) — เปิดจากปุ่มหัวคอลัมน์ หรือปุ่ม ✨ ของช่องใดช่องหนึ่ง */}
      {aiModal && (
        <AiCaptionModal
          platformLabels={aiModal.platforms.map((p) => platformLabel(p))}
          filledCount={aiModal.platforms.filter((p) => (caps.find((c) => c.platform === p)?.caption ?? "").trim()).length}
          busy={aiAllBusy}
          onClose={() => setAiModal(null)}
          onRun={(extra, overwrite) => aiWriteAll(aiModal.platforms, extra, overwrite)} />
      )}
      {postModal && (
        <PostConfirmModal
          platform={postModal.platform}
          connected={(postModal.platform === "facebook" && !!metaStatus.facebook?.connected) || (postModal.platform === "instagram" && !!metaStatus.instagram?.connected)}
          allowSchedule={postModal.platform === "facebook"}
          pageName={metaStatus.facebook?.page_name}
          captionText={postModal.captionText}
          images={postImages}
          defaultSelected={platformImages[postModal.platform]?.length ? platformImages[postModal.platform] : contentImageKeys}
          scheduledAtLocal={scheduledAt}
          format={platformFormats[postModal.platform]}
          busy={posting === postModal.platform}
          onClose={() => setPostModal(null)}
          onPublish={(keys, sched, fmt) => { setPlatformFormats((m) => { const n = { ...m }; if (fmt) n[postModal.platform] = fmt; else delete n[postModal.platform]; return n; }); runPublish(postModal.platform, postModal.captionText, keys, sched, fmt); }}
          onManual={() => manualPost(postModal.platform, postModal.captionText)}
        />
      )}
      {applyFrom && (
        <ERPModal open onClose={() => setApplyFrom(null)} size="sm" title={t("ใช้แคปชั่น/แฮชแท็กนี้กับแพลตฟอร์มอื่น", "Apply to other platforms")}>
          <div className="space-y-2">
            <p className="text-[11px] text-slate-400">{t("คัดลอกจาก", "Copy from")} <span className="font-medium text-slate-600">{platformLabel(applyFrom)}</span></p>
            <button onClick={() => applyCapToAll(applyFrom, "empty")} className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:bg-violet-50 hover:border-violet-300 text-sm">✅ {t("แทนแค่ช่องที่ยังว่าง", "Only empty fields")}<span className="block text-[11px] text-slate-400">{t("ปลอดภัยสุด — ไม่ทับที่มีข้อความแล้ว", "Safest — won't touch filled fields")}</span></button>
            <button onClick={() => applyCapToAll(applyFrom, "except_edited")} className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:bg-violet-50 hover:border-violet-300 text-sm">✍️ {t("แทนทุกอัน ยกเว้นอันที่แก้เอง", "All except manually edited")}<span className="block text-[11px] text-slate-400">{t("ทับค่าจากแม่แบบ/อัตโนมัติ แต่เก็บที่พิมพ์เอง", "Overwrite auto/template values, keep your edits")}</span></button>
            <button onClick={() => applyCapToAll(applyFrom, "all")} className="w-full text-left px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-sm">⚠️ {t("แทนทุกอัน", "Replace all")}<span className="block text-[11px] text-red-400">{t("ทับทุกช่อง รวมที่กรอกไว้แล้ว", "Overwrites everything, including filled")}</span></button>
            <div className="flex justify-end pt-1"><button onClick={() => setApplyFrom(null)} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button></div>
          </div>
        </ERPModal>
      )}
      <ImageLightbox images={taskMedia.images.map((im) => ({ url: r2ImageUrl(im.key, 1600) ?? "", label: im.label }))} index={tmLb} onClose={() => setTmLb(-1)} onIndex={setTmLb} />
      {openParentId && <MasterRecordDrawer moduleKey="parent-skus-v2" apiPath="parent-skus" recordId={openParentId} onClose={() => setOpenParentId(null)} onChanged={() => {}} />}
      <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={doDelete}
        title={t("ลบคอนเทนต์", "Delete Content")} message={<span>{t("ต้องการลบ", "Delete")} <span className="font-semibold">{d.title}</span> {t("ใช่ไหม? (ลบแล้วกู้คืนไม่ได้)", "? (cannot be undone)")}</span>} confirmText={deleting ? "..." : t("ลบ", "Delete")} variant="danger" />
    </>
  );
}

type SharedVars = { shop: ShopChannel[]; fake_price: number | null; real_price: number | null; price: number | null; color: string | null; sku: string | null; product: string | null; link: string | null };

// ============================================================
// ไฟล์แนบของคอนเทนต์: รูป (ย่อก่อนอัป) / วิดีโอสั้น / ลิงก์ (พรีวิว OG เต็ม)
// ============================================================
function ContentAttachments({ attachments, onAttachImage, onUploadVideo, onAddLink, onAddDriveVideo, onDelete, pushToast }: {
  attachments: ContentAttachment[];
  onAttachImage: (r: { r2_key: string; file_name: string; content_type: string; size_bytes: number }) => Promise<void>;
  onUploadVideo: (f: File) => Promise<void>;
  onAddLink: (url: string) => Promise<void>;
  onAddDriveVideo: (link: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  pushToast: (type: Toast["type"], m: string) => void;
}) {
  const t = useT();
  const [linkUrl, setLinkUrl] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [vidBusy, setVidBusy] = useState(false);
  const vidRef = useRef<HTMLInputElement>(null);
  const images = attachments.filter((a) => a.kind === "image");
  const videos = attachments.filter((a) => a.kind === "video");
  const [driveLink, setDriveLink] = useState("");
  const [driveBusy, setDriveBusy] = useState(false);
  const linkAtts = attachments.filter((a) => a.kind === "link");

  const addLink = async () => {
    const u = linkUrl.trim(); if (!u) return;
    setLinkBusy(true);
    try { await onAddLink(u); setLinkUrl(""); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setLinkBusy(false); }
  };
  const pickVideo = async (f: File) => { setVidBusy(true); try { await onUploadVideo(f); } finally { setVidBusy(false); } };

  return (
    <div className="space-y-3">
      {/* รูปภาพ */}
      <div>
        <p className="text-xs text-slate-500 mb-1">🖼 {t("รูปภาพ", "Images")}</p>
        <ImageAttach images={images.map((a) => ({ id: a.id, r2_key: a.r2_key, file_name: a.file_name }))} onAttach={onAttachImage} onDelete={onDelete} pushToast={pushToast} />
      </div>
      {/* วิดีโอ */}
      <div>
        <p className="text-xs text-slate-500 mb-1">🎬 {t("วิดีโอ", "Video")}</p>
        <input ref={vidRef} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickVideo(f); e.target.value = ""; }} />
        <button onClick={() => vidRef.current?.click()} disabled={vidBusy} className="h-8 px-3 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">{vidBusy ? t("⏳ กำลังอัป…", "⏳ Uploading…") : t("⬆ อัปวิดีโอสั้น (≤25MB)", "⬆ Upload short video (≤25MB)")}</button>
        <span className="text-[11px] text-slate-400 ml-2">{t("คลิปใหญ่ → ใช้ Google Drive ด้านล่าง", "Big clips → use Google Drive below")}</span>
        {/* คลิปใหญ่: วางลิงก์ Google Drive — ระบบไม่ก็อปไฟล์ลงระบบ ดึงจาก Drive ตอนใช้งาน */}
        <div className="flex gap-1.5 mt-2">
          <input value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder={t("วางลิงก์วิดีโอจาก Google Drive...", "Paste a Google Drive video link...")}
            className="flex-1 min-w-0 h-8 border border-slate-200 rounded-md px-2 text-xs" />
          <button onClick={async () => { const l = driveLink.trim(); if (!l) return; setDriveBusy(true); await onAddDriveVideo(l); setDriveBusy(false); setDriveLink(""); }}
            disabled={driveBusy || !driveLink.trim()} className="h-8 px-3 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 shrink-0">
            {driveBusy ? t("⏳ ตรวจไฟล์…", "⏳ Checking…") : t("＋ เพิ่มจาก Drive", "＋ Add from Drive")}
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-0.5">{t("ไฟล์อยู่ที่ Drive ที่เดียว (ไม่กินพื้นที่ระบบ) · ต้องแชร์ไฟล์ให้บัญชีระบบก่อน", "Stays on Drive only — share the file with the system account first")}</p>
        {videos.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            {videos.map((v) => {
              const isDrive = (v.url ?? "").startsWith("drive:");
              const src = isDrive ? `/api/drive-video/${(v.url as string).slice(6)}` : (r2ImageUrl(v.r2_key) ?? undefined);
              return (
              <div key={v.id} className="relative group">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={src} controls preload="metadata" className="w-full h-28 object-cover rounded-lg border border-slate-200 bg-black" />
                {isDrive && <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-black/70 text-white px-1 rounded">Drive</span>}
                <button onClick={() => void onDelete(v.id)} title={t("ลบ", "Delete")} className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-red-500 text-xs opacity-0 group-hover:opacity-100 shadow">✕</button>
              </div>
              ); })}
          </div>
        )}
      </div>
      {/* ลิงก์ (พรีวิวเต็ม) */}
      <div>
        <p className="text-xs text-slate-500 mb-1">🔗 {t("ลิงก์ (มีพรีวิว)", "Links (with preview)")}</p>
        <div className="flex gap-1.5">
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addLink(); }} placeholder="https://..." className="flex-1 h-8 border border-slate-200 rounded-md px-2 text-sm" />
          <button onClick={addLink} disabled={linkBusy} className="h-8 px-3 text-xs font-medium text-violet-700 border border-violet-200 rounded-md hover:bg-violet-50 disabled:opacity-50">{linkBusy ? t("⏳", "⏳") : t("＋ พรีวิว", "＋ Preview")}</button>
        </div>
        {linkAtts.length > 0 && <div className="space-y-2 mt-2">{linkAtts.map((l) => <LinkPreviewCard key={l.id} att={l} onDelete={() => void onDelete(l.id)} />)}</div>}
      </div>
    </div>
  );
}

// การ์ดพรีวิวลิงก์ (รูป OG + หัวข้อ + โดเมน)
function LinkPreviewCard({ att, onDelete }: { att: ContentAttachment; onDelete: () => void }) {
  const host = (() => { try { return new URL(att.url ?? "").hostname.replace(/^www\./, ""); } catch { return att.url ?? ""; } })();
  return (
    <div className="relative group flex gap-2 border border-slate-200 rounded-lg overflow-hidden bg-white">
      {att.file_name
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={att.file_name} alt="" className="w-20 h-20 object-cover bg-slate-100 shrink-0" />
        : <div className="w-20 h-20 bg-slate-100 flex items-center justify-center text-2xl shrink-0">🔗</div>}
      <a href={att.url ?? "#"} target="_blank" rel="noreferrer" className="min-w-0 py-1.5 pr-6 flex-1">
        <p className="text-sm font-medium text-slate-700 line-clamp-2">{att.label || host}</p>
        <p className="text-[11px] text-slate-400 truncate mt-0.5">{host}</p>
      </a>
      <button onClick={onDelete} title="ลบ" className="absolute top-1 right-1 h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-red-500 text-xs opacity-0 group-hover:opacity-100 shadow">✕</button>
    </div>
  );
}

// ช่องกรอก hashtag พร้อม typeahead (กรองจากคลัง + เพิ่มใหม่เข้าคลังได้)
function HashtagInput({ value, onChange, brandId, platform, pushToast }: { value: string | null; onChange: (v: string) => void; brandId: string | null; platform: string; pushToast: (type: Toast["type"], m: string) => void }) {
  const t = useT();
  const [tags, setTags] = useState<Hashtag[]>([]);
  const [focus, setFocus] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);   // ไฮไลต์รายการในดรอปดาวน์ด้วยคีย์บอร์ด (↓/↑/Enter)
  // คลังแฮชแท็กใช้ร่วมทุกแพลตฟอร์ม — กรองแค่ "แบรนด์นี้ + ของกลาง" (ไม่ผูกแพลตฟอร์ม) · โหลดใหม่ทุกครั้งที่โฟกัส (เห็นตัวที่เพิ่งเพิ่ม)
  const loadTags = useCallback(async () => { try { setTags(await listHashtags({ brand_id: brandId || undefined })); } catch { /* ว่าง */ } }, [brandId]);
  useEffect(() => { if (focus) loadTags(); }, [focus, loadTags]);

  const tokens = (value ?? "").split(/\s+/).filter(Boolean);
  const lastTok = (value ?? "").split(/\s+/).pop() ?? "";
  const q = lastTok.replace(/^#/, "").toLowerCase();
  const suggestions = tags
    .filter((h) => { const txt = h.text.toLowerCase().replace(/^#/, ""); return q ? txt.includes(q) : true; })
    .filter((h) => !tokens.includes(h.text))
    .slice(0, 12);
  const exists = tags.some((h) => h.text.toLowerCase().replace(/^#/, "") === q);
  const showAdd = !!q && !exists;
  const itemCount = suggestions.length + (showAdd ? 1 : 0);
  useEffect(() => { setActiveIdx(-1); }, [q, focus]);   // รีเซ็ตไฮไลต์เมื่อคำค้น/โฟกัสเปลี่ยน

  const applyTag = (text: string) => {
    const parts = (value ?? "").split(/\s+/);
    if (parts.length === 0) { onChange(text + " "); return; }
    parts[parts.length - 1] = text;   // แทนที่ token ที่กำลังพิมพ์
    onChange(parts.join(" ") + " ");
  };
  const addNew = async () => {
    const raw = q.trim(); if (!raw) return;
    const text = "#" + raw.replace(/^#/, "");
    try { const h = await createHashtag({ text, brand_id: brandId || null }); applyTag(h.text); await loadTags(); }
    catch (e) { pushToast("error", (e as Error).message); }
  };

  return (
    <div className="relative">
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
        onKeyDown={(e) => {
          if (!focus || itemCount === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => (i + 1) % itemCount); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => (i - 1 + itemCount) % itemCount); }
          else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); if (activeIdx < suggestions.length) applyTag(suggestions[activeIdx].text); else void addNew(); }
          else if (e.key === "Escape") { setActiveIdx(-1); e.currentTarget.blur(); }
        }}
        placeholder={t("#hashtag คั่นด้วยเว้นวรรค (พิมพ์เพื่อค้นหาจากคลัง)", "#hashtag (type to search library)")} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm" />
      {focus && itemCount > 0 && (
        <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto p-1">
          {suggestions.map((h, idx) => (
            <button key={h.id} onMouseDown={(e) => { e.preventDefault(); applyTag(h.text); }} onMouseEnter={() => setActiveIdx(idx)}
              className={`flex w-full items-center justify-between gap-2 text-left px-2 py-1 text-sm rounded text-slate-700 ${activeIdx === idx ? "bg-violet-100" : "hover:bg-violet-50"}`}>
              <span className="truncate">{h.text}</span><span className="text-[10px] text-slate-300 shrink-0">{h.usage_count}</span>
            </button>
          ))}
          {showAdd && <button onMouseDown={(e) => { e.preventDefault(); void addNew(); }} onMouseEnter={() => setActiveIdx(suggestions.length)}
            className={`block w-full text-left px-2 py-1 text-sm rounded text-emerald-700 ${activeIdx === suggestions.length ? "bg-emerald-100" : "hover:bg-emerald-50"}`}>＋ {t("เพิ่ม", "Add")} “#{q}” {t("เข้าคลัง", "to library")}</button>}
        </div>
      )}
    </div>
  );
}

// แถบปุ่มหัวคอลัมน์แคปชั่น — โชว์แค่ 3 ปุ่มที่ปักไว้ ที่เหลือซ่อนใน ⋯ (เลือกได้เองว่าจะโชว์อะไร)
// จำเป็นรายคนที่ user_ui_prefs (key: content_caption_toolbar) → ใช้เครื่องอื่นก็ได้ค่าเดิม
type ToolAction = { key: string; label: string; onClick: () => void; primary?: boolean };
const MAX_PINNED = 3;

function CaptionToolbar({ actions, pinned, onSavePinned }: {
  actions: ToolAction[];
  pinned: string[];
  onSavePinned: (keys: string[]) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setOpen(false); setCfg(false); } };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [open]);

  const shown = pinned.map((k) => actions.find((a) => a.key === k)).filter((a): a is ToolAction => !!a).slice(0, MAX_PINNED);
  const rest = actions.filter((a) => !shown.some((s) => s.key === a.key));
  const togglePin = (k: string) => {
    const has = pinned.includes(k);
    if (has) onSavePinned(pinned.filter((x) => x !== k));
    else if (pinned.length >= MAX_PINNED) onSavePinned([...pinned.slice(1), k]);   // เต็ม 3 → ดันตัวเก่าสุดออก
    else onSavePinned([...pinned, k]);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {shown.map((a) => (
        <button key={a.key} onClick={a.onClick}
          className={a.primary
            ? "text-xs font-medium text-white bg-fuchsia-600 hover:bg-fuchsia-700 rounded-md px-2 py-1"
            : "text-xs text-violet-700 hover:underline"}>{a.label}</button>
      ))}
      <div ref={boxRef} className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)} title={t("เมนูเพิ่มเติม", "More")}
          className="text-slate-400 hover:text-violet-700 leading-none text-base px-1">⋯</button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-30 min-w-[230px] bg-white border border-slate-200 rounded-lg shadow-lg py-1">
            {rest.map((a) => (
              <button key={a.key} type="button" onClick={() => { setOpen(false); a.onClick(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">{a.label}</button>
            ))}
            <div className="border-t border-slate-100 mt-1 pt-1">
              <button type="button" onClick={() => setCfg((c) => !c)} className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50">
                ⚙️ {t("เลือกปุ่มที่โชว์ (3 ปุ่ม)", "Choose visible buttons (3)")}
              </button>
              {cfg && (
                <div className="px-3 py-1.5 space-y-1">
                  {actions.map((a) => (
                    <label key={a.key} className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={pinned.includes(a.key)} onChange={() => togglePin(a.key)} />
                      <span className="truncate">{a.label}</span>
                    </label>
                  ))}
                  <p className="text-[10px] text-slate-400">{t("ติ๊กได้ 3 ปุ่ม — ถ้าครบแล้วติ๊กเพิ่ม ตัวเก่าสุดจะถูกเอาออก", "Up to 3 — adding a 4th drops the oldest")}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// รูปแบบโพสต์ที่แต่ละแพลตฟอร์มมีให้เลือก (ไม่เลือก = ให้ระบบเดาจากสื่อที่เลือก: วิดีโอ→วิดีโอ, หลายรูป→อัลบั้ม)
// ใช้ทั้งบอกคนโพสต์มือ และคุมตอนยิงอัตโนมัติ (Story ยังต้องโพสต์มือ)
const POST_FORMATS: Record<string, { key: string; th: string; en: string }[]> = {
  instagram: [
    { key: "single", th: "โพสต์รูปเดียว", en: "Single post" },
    { key: "carousel", th: "อัลบั้มหลายรูป", en: "Carousel" },
    { key: "reels", th: "Reels (วิดีโอ)", en: "Reels" },
    { key: "story", th: "Story (24 ชม.)", en: "Story" },
  ],
  facebook: [
    { key: "single", th: "โพสต์รูปเดียว", en: "Single post" },
    { key: "carousel", th: "อัลบั้มหลายรูป", en: "Album" },
    { key: "video", th: "วิดีโอ", en: "Video" },
    { key: "story", th: "Story (24 ชม.)", en: "Story" },
  ],
  tiktok: [{ key: "video", th: "วิดีโอ", en: "Video" }, { key: "carousel", th: "โพสต์รูปภาพ", en: "Photo post" }],
  youtube: [{ key: "video", th: "วิดีโอปกติ", en: "Video" }, { key: "reels", th: "Shorts", en: "Shorts" }],
};
export function postFormatLabel(platform: string, key: string | undefined, t: (th: string, en: string) => string): string {
  const f = (POST_FORMATS[platform] ?? []).find((x) => x.key === key);
  return f ? t(f.th, f.en) : "";
}
// caption ต่อ 1 แพลตฟอร์ม: แม่แบบ + แคปชั่น + hashtag typeahead + พรีวิว + ปุ่มไปโพสต์/คัดลอก
// เคารพตั้งค่าแพลตฟอร์ม: แม่แบบเริ่มต้น / ปิดแคปชั่น-แฮชแท็ก / ลิงก์ไปโพสต์
function CaptionCard({ open = true, onToggle, contentId, canAi = false, aiBusy = false, onAiWrite, format, onSetFormat, cap, templates, sharedVars, brandId, setting, onChange, onOpenSettings, onApplyAll, postStatus = "todo", postedUrl = "", onSetStatus, onSetPostedUrl, onCommitPostedUrl, onRequestPost, canAuto = false, autoLabel, postImages = [], selectedImages = [], onToggleImage, onSetMain, pushToast }: { open?: boolean; onToggle?: () => void; contentId?: string; canAi?: boolean; aiBusy?: boolean; onAiWrite?: () => void; format?: string; onSetFormat?: (v: string) => void; cap: ContentCaption; templates: CaptionTemplate[]; sharedVars: SharedVars; brandId: string | null; setting?: PlatformSetting; onChange: (p: Partial<ContentCaption>) => void; onOpenSettings?: () => void; onApplyAll?: (platform: string) => void; postStatus?: string; postedUrl?: string; onSetStatus?: (s: string) => void; onSetPostedUrl?: (url: string) => void; onCommitPostedUrl?: () => void; onRequestPost?: (captionText: string) => void; canAuto?: boolean; autoLabel?: string; postImages?: PostImage[]; selectedImages?: string[]; onToggleImage?: (key: string) => void; onSetMain?: (key: string) => void; pushToast: (type: Toast["type"], m: string) => void }) {
  const t = useT();
  const [imgEdit, setImgEdit] = useState(false);   // โหมดเลือกรูป (ปกติโชว์เฉพาะรูปที่เลือก · กดแล้วกางเลือก)
  // ปุ่ม ✨ ของช่องนี้ = เปิดป๊อป "AI เขียนแคปชั่น" ของ drawer (ใส่คำสั่งเพิ่มได้) — ใช้เส้นทางเดียวกับปุ่มเขียนทั้งหมด
  const useCaption = setting?.use_caption !== false;
  const useHashtags = setting?.use_hashtags !== false;
  const postUrl = (setting?.post_url ?? "").trim();

  const typeKey = cap.caption_type ?? setting?.template_key ?? templates[0]?.key ?? "short";
  const tpl = templates.find((x) => x.key === typeKey) ?? templates[0];
  // ประกอบ preview จากแม่แบบ + ตัวแปร (ตัด caption/hashtags ออกถ้าปิดไว้)
  const preview = tpl
    ? renderCaption(tpl.body, { caption: useCaption ? cap.caption : "", hashtags: useHashtags ? cap.hashtags : "", ...sharedVars })
    : `${useCaption ? (cap.caption ?? "") : ""}\n\n${useHashtags ? (cap.hashtags ?? "") : ""}`.trim();
  const copy = async () => { try { await navigator.clipboard.writeText(preview); pushToast("success", t(`คัดลอก ${platformLabel(cap.platform)} แล้ว`, `Copied ${platformLabel(cap.platform)}`)); } catch { pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")); } };
  // แถบสถานะโพสต์ต่อแพลตฟอร์ม (เฟส 1 = โพสต์มือ) · ยังไม่โพสต์ / โพสต์แล้ว / ข้าม
  const POST_STATES: { key: string; label: string; onCls: string }[] = [
    { key: "todo", label: t("ยังไม่โพสต์", "Not posted"), onCls: "bg-slate-200 text-slate-700 border-slate-300" },
    { key: "posted", label: `✅ ${t("โพสต์แล้ว", "Posted")}`, onCls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
    { key: "skip", label: `⊘ ${t("ข้าม", "Skip")}`, onCls: "bg-rose-50 text-rose-700 border-rose-300" },
  ];
  // "โพสต์เลย" (มือ) — คัดลอกแคปชั่น + เปิดหน้าโพสต์ของแพลตฟอร์มให้ในคลิกเดียว แล้วให้ผู้ใช้มากด ✅

  // ตัวอย่างที่ประกอบจากแม่แบบ — โชว์เฉพาะตอนแม่แบบ "เติมข้อความเพิ่ม" จริง ๆ
  // (ถ้าแม่แบบมีแค่ {caption}/{hashtags} ก็ไม่ต้องโชว์ เพราะซ้ำกับช่องด้านบน = ต้นตอความรกเดิม)
  const tplAddsText = !!tpl && renderCaption(tpl.body, { caption: "", hashtags: "", ...sharedVars }).replace(/\s+/g, "").length > 0;
  const snippet = (cap.caption ?? "").split("\n").map((x) => x.trim()).find(Boolean) ?? "";
  const stBadge = postStatus === "posted" ? { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: `✅ ${t("โพสต์แล้ว", "Posted")}` }
    : postStatus === "scheduled" ? { cls: "bg-blue-50 text-blue-700 border-blue-200", label: `⏰ ${t("ตั้งเวลาแล้ว", "Scheduled")}` }
    : postStatus === "skip" ? { cls: "bg-rose-50 text-rose-700 border-rose-300", label: `⊘ ${t("ข้าม", "Skip")}` }
    : { cls: "bg-white text-slate-400 border-slate-200", label: t("ยังไม่โพสต์", "Not posted") };
  // เมนู ⋯ = ของที่ไม่ได้ใช้ทุกครั้ง (ยุบออกจากหัวการ์ดเพื่อลดความรก)
  const menuItems: { label: string; onClick: () => void }[] = [];
  if (postUrl) menuItems.push({ label: `↗ ${t("ไปหน้าโพสต์", "Open post page")}`, onClick: () => window.open(postUrl, "_blank", "noopener") });
  else if (onOpenSettings) menuItems.push({ label: `🔗 ${t("ตั้งลิงก์ไปหน้าโพสต์", "Set post link")}`, onClick: onOpenSettings });
  if (onApplyAll) menuItems.push({ label: `⇊ ${t("ใช้แคปชั่นนี้กับแพลตฟอร์มอื่น", "Apply to other platforms")}`, onClick: () => onApplyAll(cap.platform) });
  if (onOpenSettings) menuItems.push({ label: `⚙️ ${t("ตั้งค่าแพลตฟอร์มนี้", "Platform settings")}`, onClick: onOpenSettings });

  return (
    <div className={`border rounded-lg bg-white ${open ? "border-violet-200 shadow-sm" : "border-slate-200"}`}>
      {/* ── หัวแถว: กดเพื่อกาง/พับ · ตอนพับเห็นครบว่าเขียนแล้วยัง มีรูปกี่รูป โพสต์แล้วยัง ── */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          <span className="text-[10px] text-slate-400 w-3 shrink-0">{open ? "▲" : "▼"}</span>
          <PlatformChip code={cap.platform} />
          {!open && (
            <>
              <span className={`text-xs truncate min-w-0 flex-1 ${snippet ? "text-slate-600" : "text-slate-300 italic"}`}>
                {snippet || (useCaption ? t("ยังไม่เขียน", "Not written") : t("ปิดแคปชั่นแพลตฟอร์มนี้", "Caption off"))}
              </span>
              {format && <span className="text-[10px] text-slate-500 bg-slate-100 rounded-full px-1.5 shrink-0" title={t("รูปแบบโพสต์", "Post format")}>{postFormatLabel(cap.platform, format, t)}</span>}
              {selectedImages.length > 0 && <span className="text-[11px] text-slate-400 shrink-0" title={t("รูปที่เลือกไว้", "Selected images")}>🖼 {selectedImages.length}</span>}
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full border shrink-0 ${stBadge.cls}`}>{stBadge.label}</span>
            </>
          )}
        </button>
        {open && (
          <div className="flex items-center gap-2 shrink-0">
            {canAi && useCaption && contentId && (
              <button onClick={onAiWrite} disabled={aiBusy} title={t("ให้ AI อ่านรูปที่แนบ + แฮชแท็ก แล้วเขียนแคปชั่นให้", "Let AI read the attached images + hashtags and write the caption")}
                className="text-xs font-medium text-fuchsia-700 hover:underline disabled:opacity-50">{aiBusy ? t("✨ กำลังเขียน...", "✨ Writing...") : t("✨ AI เขียนให้", "✨ AI write")}</button>
            )}
            <button onClick={copy} className="text-xs text-violet-700 hover:underline">📋 {t("คัดลอก", "Copy")}</button>
            {menuItems.length > 0 && <RowMenu items={menuItems} />}
          </div>
        )}
      </div>

      {open && (
        <div className="px-2.5 pb-2.5 space-y-2">
          {/* แม่แบบ — เปลี่ยนเป็นช่องเลือกเล็ก ๆ (เดิมเป็นชิปกางเต็มแถว) */}
          {(POST_FORMATS[cap.platform] ?? []).length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 shrink-0">🎬 {t("ลงเป็น", "Post as")}</span>
              <select value={format ?? ""} onChange={(e) => onSetFormat?.(e.target.value)} className="h-7 text-xs border border-slate-200 rounded-md px-1.5 bg-white">
                <option value="">{t("อัตโนมัติ (ดูจากสื่อที่เลือก)", "Auto (from media)")}</option>
                {(POST_FORMATS[cap.platform] ?? []).map((f) => <option key={f.key} value={f.key}>{t(f.th, f.en)}</option>)}
              </select>
              {format === "story" && (cap.platform === "facebook"
                ? <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5" title={t("กดโพสต์เลย = ขึ้น Story ของเพจอัตโนมัติ (ตั้งเวลาล่วงหน้าไม่ได้)", "Auto-posts to the Page story")}>{t("ยิง Story ได้", "Auto story")}</span>
                : cap.platform === "instagram"
                  ? <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5" title={t("IG Story ต้องรอ Meta อนุมัติสิทธิ์ (App Review) — ระหว่างนี้โพสต์มือ", "IG story needs Meta App Review")}>{t("IG Story รอสิทธิ์", "IG story pending")}</span>
                  : <span className="text-[10px] text-slate-500 bg-slate-100 rounded-full px-1.5">{t("โพสต์มือ", "Manual")}</span>)}
            </div>
          )}
          {useCaption && templates.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 shrink-0">📑 {t("แม่แบบ", "Template")}</span>
              <select value={typeKey} onChange={(e) => onChange({ caption_type: e.target.value })} className="h-7 text-xs border border-slate-200 rounded-md px-1.5 bg-white max-w-[60%]">
                {templates.map((tp) => <option key={tp.key} value={tp.key}>{tp.label}</option>)}
              </select>
            </div>
          )}
          {useCaption
            ? <ERPTextarea value={cap.caption ?? ""} rows={3} onChange={(e) => onChange({ caption: e.target.value })} placeholder={t(`เขียน caption สำหรับ ${platformLabel(cap.platform)}...`, `Write caption for ${platformLabel(cap.platform)}...`)} />
            : <p className="text-[11px] text-slate-400 italic bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2">{t("ปิดแคปชั่นสำหรับแพลตฟอร์มนี้ (เปิดได้ที่ ⚙️ ตั้งค่าแพลตฟอร์ม)", "Caption off for this platform (toggle in ⚙️ Platform settings)")}</p>}
          {useHashtags && <HashtagInput value={cap.hashtags} onChange={(v) => onChange({ hashtags: v })} brandId={brandId} platform={cap.platform} pushToast={pushToast} />}
          {/* ตัวอย่างจริง — เฉพาะเมื่อแม่แบบเติมข้อความเพิ่ม (ไม่งั้นซ้ำกับช่องบน) */}
          {useCaption && tplAddsText && (cap.caption ?? "").trim() && (
            <details className="group">
              <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-violet-700 list-none">👁 {t("ดูตัวอย่างที่จะโพสต์ (ประกอบจากแม่แบบ)", "Preview (assembled from template)")}</summary>
              <pre className="mt-1 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2.5 whitespace-pre-wrap font-sans leading-relaxed">{preview || "—"}</pre>
            </details>
          )}

          {/* ── รูป + สถานะโพสต์ รวมอยู่ท้ายเดียว (เดิมแยก 2 บล็อกมีเส้นคั่น 2 เส้น) ── */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-start gap-2 flex-wrap">
              <span className="text-[11px] text-slate-400 mt-1 shrink-0">🖼 {t("รูป", "Images")}</span>
              {postImages.length === 0
                ? <span className="text-[11px] text-slate-300 italic mt-1">{t("ยังไม่มีรูป — แนบที่ส่วน “แนบเพิ่มเอง” หรือผูกงานก่อน", "No media yet — attach in “Attach” section or link a task first")}</span>
                : imgEdit
                  ? (   // โหมดเลือก: โชว์รูปทั้งหมดให้ติ๊ก
                    <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                      {postImages.map((im) => { const on = selectedImages.includes(im.key); return (
                        <button key={im.key} type="button" onClick={() => onToggleImage?.(im.key)} title={im.label ?? ""} className={`relative h-12 w-12 rounded-md overflow-hidden border-2 transition-all ${on ? "border-violet-500 ring-1 ring-violet-300" : "border-slate-200 opacity-60 hover:opacity-100"}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r2ImageUrl(im.key, 120) ?? ""} alt="" className="w-full h-full object-cover" />
                          {im.type === "video" && <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-black/60 text-white px-1 rounded">🎬</span>}
                          {on && <span className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-violet-600 text-white text-[10px] flex items-center justify-center shadow">✓</span>}
                        </button>
                      ); })}
                    </div>
                  )
                  : selectedImages.length === 0
                    ? <span className="text-[11px] text-slate-300 italic mt-1">{t("ยังไม่เลือกรูป", "No image selected")}</span>
                    : (   // ปกติ: เฉพาะรูปที่เลือก · รูปแรก = รูปใหญ่
                      <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                        {selectedImages.map((key, idx) => { const im = postImages.find((p) => p.key === key); if (!im) return null; const isMain = idx === 0; return (
                          <div key={key} className={`group/mi relative h-12 w-12 rounded-md overflow-hidden border-2 ${isMain ? "border-violet-500" : "border-slate-200"}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r2ImageUrl(key, 140) ?? ""} alt="" className="w-full h-full object-cover" />
                            {im.type === "video" && <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-black/60 text-white px-1 rounded">🎬</span>}
                            {isMain
                              ? <span className="absolute top-0.5 left-0.5 text-[8px] bg-violet-600 text-white px-1 rounded shadow" title={t("รูปใหญ่", "Main")}>⭐</span>
                              : onSetMain && <button type="button" onClick={() => onSetMain(key)} title={t("ตั้งเป็นรูปใหญ่", "Set as main")} className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-[9px] font-medium opacity-0 group-hover/mi:opacity-100 transition-opacity">⭐</button>}
                          </div>
                        ); })}
                      </div>
                    )}
              {postImages.length > 0 && (
                <button type="button" onClick={() => setImgEdit((v) => !v)} className="text-[11px] font-medium text-violet-700 hover:underline mt-1 shrink-0 ml-auto">
                  {imgEdit ? `✓ ${t("เสร็จ", "Done")}` : `✏️ ${t("เลือก/แก้รูป", "Choose")}`}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {POST_STATES.map((st) => { const on = postStatus === st.key; return (
                <button key={st.key} onClick={() => onSetStatus?.(st.key)} className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${on ? st.onCls : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>{st.label}</button>
              ); })}
              {postStatus === "scheduled" && <span className="text-[11px] px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-300">⏰ {t("ตั้งเวลาแล้ว", "Scheduled")}</span>}
              <button onClick={() => onRequestPost?.(preview)} title={canAuto ? t(`โพสต์ขึ้น ${autoLabel} จริง`, `Publish to ${autoLabel}`) : t("คัดลอกแคปชั่น + เปิดหน้าโพสต์", "Copy caption + open post page")} className={`ml-auto inline-flex items-center gap-1 text-xs font-medium text-white rounded-md px-2.5 py-1 ${canAuto ? "bg-blue-600 hover:bg-blue-700" : "bg-violet-600 hover:bg-violet-700"}`}>{canAuto ? `🚀 ${t("โพสต์ขึ้น", "Post to")} ${autoLabel}` : `📤 ${t("โพสต์เลย", "Post now")}`}</button>
            </div>
            {(postStatus === "posted" || postStatus === "scheduled") && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400 shrink-0">{t("ลิงก์ที่ลง", "Posted link")}</span>
                <input value={postedUrl} onChange={(e) => onSetPostedUrl?.(e.target.value)} onBlur={() => onCommitPostedUrl?.()} placeholder="https://..." className="flex-1 min-w-0 h-7 border border-slate-200 rounded-md px-2 text-xs" />
                {postedUrl.trim() && <a href={postedUrl} target="_blank" rel="noreferrer" title={t("เปิดโพสต์", "Open post")} className="text-xs text-violet-700 hover:underline shrink-0">↗</a>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ป๊อปอัปกลาง "ให้ AI เขียนแคปชั่น" — ใช้ทั้งปุ่มเขียนทั้งหมด / ปุ่ม ✨ ของแต่ละช่อง / สั่งรวบจากหน้ารายการ
// ใส่คำสั่งเพิ่มครั้งนี้ได้ (ไม่กระทบ prompt ที่ตั้งไว้) · เลือกได้ว่าทับของเดิมหรือเขียนเฉพาะช่องว่าง
// บอกค่าใช้จ่ายคร่าว ๆ ก่อนกด เพราะกดแล้วมีค่าใช้จ่ายจริง
function AiCaptionModal({ platformLabels, filledCount, contentCount = 1, busy, onClose, onRun }: {
  platformLabels: string[];
  filledCount: number;                 // จำนวนช่องที่มีข้อความอยู่แล้ว
  contentCount?: number;               // จำนวนคอนเทนต์ (สั่งรวบจากหน้ารายการ)
  busy: boolean;
  onClose: () => void;
  onRun: (extra: string, overwrite: boolean) => void;
}) {
  const t = useT();
  const [extra, setExtra] = useState("");
  // ตั้งต้นแบบปลอดภัย/ประหยัด: ถ้ามีของเดิมอยู่ หรือสั่งหลายคอนเทนต์ → ไม่ทับ
  const [overwrite, setOverwrite] = useState(filledCount === 0 && contentCount === 1);
  // ประมาณค่าใช้จ่าย: ยิง 1 ครั้งต่อคอนเทนต์ · รูป ≤7 ใบ ≈ 2,800 token/ใบ + ข้อความ ~600 (gpt-4o-mini, 36 บาท/USD)
  const estBaht = Math.max(0.01, contentCount * ((7 * 2800 + 600) * 0.15 / 1e6 + (platformLabels.length * 350) * 0.6 / 1e6) * 36);
  return (
    <ERPModal open onClose={busy ? () => {} : onClose} size="md" title={t("✨ ให้ AI เขียนแคปชั่น", "✨ AI write captions")}
      description={contentCount > 1
        ? t(`${contentCount} คอนเทนต์ที่เลือก — ใช้ prompt ที่ตั้งไว้ของแต่ละแพลตฟอร์ม และบันทึกให้เลย`, `${contentCount} selected — uses each platform's prompt and saves automatically`)
        : t("ใช้ prompt ที่ตั้งไว้ของแต่ละแพลตฟอร์ม + อ่านรูปที่แนบ", "Uses each platform's prompt + reads attached images")}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">{t("ค่าใช้จ่ายประมาณ", "Approx. cost")} ~{estBaht < 0.1 ? estBaht.toFixed(2) : estBaht.toFixed(1)} {t("บาท", "THB")}</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">{t("ยกเลิก", "Cancel")}</button>
            <button onClick={() => onRun(extra, overwrite)} disabled={busy} className="h-9 px-4 text-sm font-medium text-white bg-fuchsia-600 rounded-lg hover:bg-fuchsia-700 disabled:opacity-50">
              {busy ? t("กำลังเขียน...", "Writing...") : t("✨ เขียนเลย", "✨ Write")}
            </button>
          </div>
        </div>}>
      <div className="space-y-3">
        {contentCount === 1 && (
          <div className="flex flex-wrap gap-1.5">
            {platformLabels.map((p) => <span key={p} className="text-[11px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{p}</span>)}
          </div>
        )}
        <label className="block">
          <span className="text-xs font-medium text-slate-600">{t("คำสั่งเพิ่มครั้งนี้ (ไม่ใส่ก็ได้)", "Extra instruction for this run (optional)")}</span>
          <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={3} disabled={busy}
            placeholder={t("เช่น เน้นโปรลด 20% ถึงสิ้นเดือน / ใช้คำสุภาพ ไม่ต้องมีอีโมจิ", "e.g. push the 20% promo, no emojis")}
            className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-fuchsia-300" />
          <span className="text-[11px] text-slate-400">{t("ใช้แค่ครั้งนี้ ไม่ทับ prompt ที่ตั้งไว้ในตั้งค่า", "Applies to this run only — your saved prompt is unchanged")}</span>
        </label>
        {(filledCount > 0 || contentCount > 1) && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-600">{filledCount > 0
              ? t(`มี ${filledCount} ช่องที่เขียนไว้แล้ว`, `${filledCount} already written`)
              : t("ช่องที่เขียนไว้แล้ว", "Captions that already exist")}</span>
            {([[false, t("เขียนเฉพาะช่องที่ยังว่าง (ประหยัดกว่า)", "Only fill empty ones (cheaper)")], [true, t("เขียนใหม่ทับทั้งหมด", "Rewrite everything")]] as [boolean, string][]).map(([v, lb]) => (
              <label key={String(v)} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" checked={overwrite === v} onChange={() => setOverwrite(v)} disabled={busy} />{lb}
              </label>
            ))}
          </div>
        )}
      </div>
    </ERPModal>
  );
}

// เมนู ⋯ เล็ก ๆ ท้ายหัวการ์ด (ของที่ไม่ได้ใช้ทุกครั้ง) · กดที่อื่นแล้วปิดเอง
function RowMenu({ items }: { items: { label: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [open]);
  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} title="เพิ่มเติม" className="text-slate-400 hover:text-violet-700 px-1 leading-none text-base">⋯</button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[200px] bg-white border border-slate-200 rounded-lg shadow-lg py-1">
          {items.map((it) => (
            <button key={it.label} type="button" onClick={() => { setOpen(false); it.onClick(); }} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ตั้งค่าต่อแพลตฟอร์ม (ค่ากลาง): แม่แบบเริ่มต้น / ปิดแคปชั่น-แฮชแท็ก / ลิงก์ไปโพสต์ / โน้ตบอกคนทำงาน
// โมดอลจัดการ "คลังแฮชแท็ก" — ดู/เพิ่ม/ลบ/ค้นหา · แฮชแท็กในคลังจะขึ้น typeahead ในช่อง #hashtag
function HashtagLibraryModal({ brandId, onClose, pushToast }: { brandId: string | null; onClose: () => void; pushToast: (type: Toast["type"], m: string) => void }) {
  const t = useT();
  const [tags, setTags] = useState<Hashtag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newText, setNewText] = useState("");
  const [scope, setScope] = useState<"brand" | "all">("all");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setTags(await listHashtags({ search: search.trim() || undefined, brand_id: scope === "brand" && brandId ? brandId : undefined })); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setLoading(false); }
  }, [search, scope, brandId, pushToast]);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    const raw = newText.trim().replace(/^#/, ""); if (!raw) return;
    setBusy(true);
    try { await createHashtag({ text: "#" + raw, brand_id: scope === "brand" ? brandId : null }); setNewText(""); await load(); pushToast("success", t("เพิ่มเข้าคลังแล้ว", "Added to library")); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };
  const remove = async (h: Hashtag) => { if (!window.confirm(`${t("ลบ", "Delete")} ${h.text}?`)) return; try { await deleteHashtag(h.id); await load(); } catch (e) { pushToast("error", (e as Error).message); } };
  return (
    <ERPModal open onClose={onClose} size="md" title={t("คลังแฮชแท็ก", "Hashtag library")}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("เพิ่มแฮชแท็กใหม่ เช่น LouisMontini", "New hashtag e.g. LouisMontini")} className="flex-1 h-9 border border-slate-200 rounded-lg px-3 text-sm" />
          <button onClick={add} disabled={busy} className="h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 shrink-0">＋ {t("เพิ่ม", "Add")}</button>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("ค้นหาในคลัง...", "Search library...")} className="flex-1 h-9 border border-slate-200 rounded-lg px-3 text-sm" />
          {brandId && (
            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px] shrink-0">
              <button onClick={() => setScope("all")} className={`px-2.5 h-9 ${scope === "all" ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{t("ทั้งหมด", "All")}</button>
              <button onClick={() => setScope("brand")} className={`px-2.5 h-9 border-l border-slate-200 ${scope === "brand" ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{t("แบรนด์นี้", "This brand")}</button>
            </div>
          )}
        </div>
        {loading ? <p className="text-sm text-slate-400 py-6 text-center">{t("กำลังโหลด...", "Loading...")}</p>
          : tags.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center italic">{t("ยังไม่มีแฮชแท็กในคลัง — พิมพ์เพิ่มด้านบน", "No hashtags yet — add above")}</p>
          : (
            <div className="flex flex-wrap gap-1.5 max-h-72 overflow-y-auto">
              {tags.map((h) => (
                <span key={h.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 rounded-full pl-2.5 pr-1 py-1">
                  {h.text}<span className="text-[10px] text-slate-400">·{h.usage_count}</span>
                  <button onClick={() => remove(h)} title={t("ลบ", "Delete")} className="text-slate-300 hover:text-red-500 w-4 h-4 flex items-center justify-center">✕</button>
                </span>
              ))}
            </div>
          )}
        <p className="text-[11px] text-slate-400">{t("แฮชแท็กในคลังจะขึ้นให้เลือกอัตโนมัติเมื่อพิมพ์ในช่อง #hashtag ของแต่ละแพลตฟอร์ม", "Library hashtags autocomplete in each platform's #hashtag field")}</p>
        <div className="flex justify-end"><button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button></div>
      </div>
    </ERPModal>
  );
}

// โมดอลตั้ง "เวลาแนะนำการโพสต์" ต่อวัน (จันทร์-อาทิตย์) — เก็บค่ากลาง ใช้เตือนตอนเลือกวันโพสต์
function RecommendedTimesModal({ initial, onClose, onSaved, pushToast }: { initial: RecommendedTimes; onClose: () => void; onSaved: (v: RecommendedTimes) => void; pushToast: (type: Toast["type"], m: string) => void }) {
  const t = useT();
  const [times, setTimes] = useState<RecommendedTimes>(() => { const o: RecommendedTimes = {}; for (const [k, v] of Object.entries(initial)) o[k] = v.map((it) => ({ ...it })); return o; });
  const [busy, setBusy] = useState(false);
  const days: [string, string, string][] = [["1", "จันทร์", "Mon"], ["2", "อังคาร", "Tue"], ["3", "พุธ", "Wed"], ["4", "พฤหัสบดี", "Thu"], ["5", "ศุกร์", "Fri"], ["6", "เสาร์", "Sat"], ["0", "อาทิตย์", "Sun"]];
  const addTime = (k: string) => setTimes((x) => ({ ...x, [k]: [...(x[k] ?? []), { time: "" }] }));
  const patchTime = (k: string, i: number, patch: Partial<{ time: string; note: string }>) => setTimes((x) => ({ ...x, [k]: (x[k] ?? []).map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const removeTime = (k: string, i: number) => setTimes((x) => ({ ...x, [k]: (x[k] ?? []).filter((_, j) => j !== i) }));
  const save = async () => {
    setBusy(true);
    try { const clean: RecommendedTimes = {}; for (const [k, v] of Object.entries(times)) { const c = v.filter((it) => it.time).map((it) => ({ time: it.time, ...(it.note?.trim() ? { note: it.note.trim() } : {}) })); if (c.length) clean[k] = c; } await saveRecommendedTimes(clean); pushToast("success", t("บันทึกเวลาแนะนำแล้ว", "Saved")); onSaved(clean); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };
  // ตัวเลือกเวลาแบบ 24 ชม. (ชั่วโมง:นาที) — บังคับรูปแบบ ไม่ขึ้นกับ locale ของเบราว์เซอร์
  const HourMin = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
    const [h, m] = (value || ":").split(":");
    const mins = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]; if (m && !mins.includes(m)) mins.push(m);
    return (
      <span className="inline-flex items-center gap-0.5">
        <select value={h || ""} onChange={(e) => onChange(`${e.target.value || "00"}:${m || "00"}`)} className="h-9 border border-slate-200 rounded-lg px-1 text-sm bg-white">
          <option value="" disabled>--</option>
          {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((hh) => <option key={hh} value={hh}>{hh}</option>)}
        </select>
        <span className="text-slate-400">:</span>
        <select value={m || ""} onChange={(e) => onChange(`${h || "00"}:${e.target.value || "00"}`)} className="h-9 border border-slate-200 rounded-lg px-1 text-sm bg-white">
          <option value="" disabled>--</option>
          {mins.sort().map((mm) => <option key={mm} value={mm}>{mm}</option>)}
        </select>
      </span>
    );
  };
  return (
    <ERPModal open onClose={onClose} size="md" title={t("เวลาแนะนำการโพสต์ (ต่อวัน)", "Suggested posting times")}>
      <div className="space-y-2">
        <p className="text-[11px] text-slate-400">{t("ตั้งเวลา (24 ชม.) ที่แนะนำให้โพสต์ในแต่ละวัน (เพิ่มได้หลายเวลา) · ใส่หมายเหตุได้ (จะโชว์ตอนชี้ปุ่มเวลา) — เมื่อเลือกวันโพสต์จะมีปุ่มให้กดใช้", "Set suggested times (24h) per weekday (multiple) · add a note (shown as tooltip) — buttons appear when you pick a date")}</p>
        {days.map(([k, th, en]) => (
          <div key={k} className="flex items-start gap-2">
            <span className="w-24 text-sm text-slate-600 pt-1.5 shrink-0">{t(th, en)}</span>
            <div className="flex-1 flex flex-wrap items-center gap-1.5">
              {(times[k] ?? []).map((it, i) => (
                <div key={i} className="inline-flex items-center gap-1 border border-slate-100 rounded-lg p-1">
                  <HourMin value={it.time} onChange={(v) => patchTime(k, i, { time: v })} />
                  <input value={it.note ?? ""} onChange={(e) => patchTime(k, i, { note: e.target.value })} placeholder={t("หมายเหตุ", "Note")} title={t("หมายเหตุ (โชว์ตอนชี้ปุ่มเวลา)", "Note (shown as tooltip)")} className="h-9 w-24 border border-slate-200 rounded-lg px-2 text-xs" />
                  <button onClick={() => removeTime(k, i)} title={t("ลบ", "Remove")} className="text-slate-300 hover:text-red-500 text-sm px-0.5">✕</button>
                </div>
              ))}
              <button onClick={() => addTime(k)} className="h-8 px-2 text-[11px] text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">＋ {t("เพิ่มเวลา", "Add time")}</button>
            </div>
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
          <button onClick={save} disabled={busy} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{busy ? "..." : t("บันทึก", "Save")}</button>
        </div>
      </div>
    </ERPModal>
  );
}

function PlatformSettingsModal({ platforms, templates, settings, onClose, onSaved, pushToast }: { platforms: { value: string; label: string }[]; templates: CaptionTemplate[]; settings: PlatformSettings; onClose: () => void; onSaved: (v: PlatformSettings) => void; pushToast: (type: Toast["type"], m: string) => void }) {
  const t = useT();
  const [val, setVal] = useState<PlatformSettings>(settings);
  const [saving, setSaving] = useState(false);
  const setP = (p: string, patch: Partial<PlatformSetting>) => setVal((v) => ({ ...v, [p]: { ...v[p], ...patch } }));
  const save = async () => {
    setSaving(true);
    try { await savePlatformSettings(val); pushToast("success", t("บันทึกแล้ว", "Saved")); onSaved(val); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setSaving(false); }
  };
  return (
    <ERPModal open onClose={onClose} size="xl" title={t("⚙️ ตั้งค่าต่อแพลตฟอร์ม", "⚙️ Platform Settings")}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ปิด", "Close")}</button>
        <button onClick={save} disabled={saving} className="h-9 px-5 text-sm text-white bg-violet-600 rounded-lg disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button>
      </>}>
      <p className="text-xs text-slate-400 mb-3">{t("ค่ากลาง ใช้กับทุกคอนเทนต์: แม่แบบเริ่มต้น · ปิดแคปชั่น/แฮชแท็กที่ไม่ต้องใช้ · ลิงก์ไปหน้าโพสต์ · โน้ตบอกคนทำงาน", "Global settings for all content: default template · skip caption/hashtags · post link · worker note")}</p>
      <div className="space-y-3">
        {platforms.map((p) => { const s = val[p.value] ?? {}; return (
          <div key={p.value} className="border border-slate-200 rounded-lg p-3">
            <p className="text-sm font-semibold text-slate-700 mb-2">{p.label}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">{t("แม่แบบเริ่มต้น", "Default template")}
                <select value={s.template_key ?? ""} onChange={(e) => setP(p.value, { template_key: e.target.value || null })} className="mt-0.5 w-full h-8 border border-slate-200 rounded-md px-2 text-sm bg-white">
                  <option value="">{t("— อัตโนมัติ —", "— Auto —")}</option>
                  {templates.map((tp) => <option key={tp.key} value={tp.key}>{tp.label}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-500">{t("ลิงก์ไปโพสต์", "Post URL")}
                <input value={s.post_url ?? ""} onChange={(e) => setP(p.value, { post_url: e.target.value })} placeholder="https://..." className="mt-0.5 w-full h-8 border border-slate-200 rounded-md px-2 text-sm" />
              </label>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={s.use_caption !== false} onChange={(e) => setP(p.value, { use_caption: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />{t("ใช้แคปชั่น", "Use caption")}</label>
              <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={s.use_hashtags !== false} onChange={(e) => setP(p.value, { use_hashtags: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />{t("ใช้แฮชแท็ก", "Use hashtags")}</label>
            </div>
            <label className="text-xs text-slate-500 block mt-2">{t("โน้ตบอกคนทำงาน", "Note for the worker")}
              <textarea value={s.note ?? ""} onChange={(e) => setP(p.value, { note: e.target.value })} rows={2} placeholder={t("เช่น ใส่รูป 1:1 อย่างน้อย 5 รูป + วิดีโอ 15 วิ", "e.g. 5+ square images + 15s video")} className="mt-0.5 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
            </label>
          </div>
        ); })}
        {platforms.length === 0 && <p className="text-sm text-slate-400">{t("ยังไม่มีแพลตฟอร์ม", "No platforms")}</p>}
      </div>
    </ERPModal>
  );
}

// ตั้งค่าแม่แบบแคปชั่น + ช่องทางร้าน (ต่อแบรนด์ หรือ ค่ากลาง)
function CaptionTemplateSettings({ brandId, brandLabel, onClose, onSaved, pushToast }: { brandId: string | null; brandLabel: string | null; onClose: () => void; onSaved: () => void; pushToast: (type: Toast["type"], m: string) => void }) {
  const t = useT();
  const [templates, setTemplates] = useState<CaptionTemplate[]>([]);
  const [channels, setChannels] = useState<ShopChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => { (async () => { try { const r = await getCaptionTemplates(brandId); setTemplates(r.templates.length ? r.templates : []); setChannels(r.shop_channels); } catch (e) { pushToast("error", (e as Error).message); } finally { setLoading(false); } })(); }, [brandId, pushToast]);

  const active = templates[activeIdx];
  const setActiveBody = (body: string) => setTemplates((ts) => ts.map((t, i) => i === activeIdx ? { ...t, body } : t));
  const setActiveLabel = (label: string) => setTemplates((ts) => ts.map((t, i) => i === activeIdx ? { ...t, label } : t));
  const insertVar = (v: string) => setActiveBody((active?.body ?? "") + v);
  const addTemplate = () => { setTemplates((ts) => [...ts, { key: `custom_${ts.length + 1}`, label: t("แม่แบบใหม่", "New Template"), body: "{caption}\n\n{hashtags}" }]); setActiveIdx(templates.length); };
  const removeActive = () => { if (!active || !window.confirm(t(`ลบแม่แบบ "${active.label}" ?`, `Delete template "${active.label}"?`))) return; setTemplates((ts) => ts.filter((_, i) => i !== activeIdx)); setActiveIdx(0); };

  // preview ตัวอย่าง (ใช้ข้อมูลสมมติ)
  const sampleVars = { caption: "ข้อความตัวอย่างที่พิมพ์เอง", hashtags: "#LouisMontini #กระเป๋าหนัง", shop: channels, fake_price: 1290, real_price: 990, price: 1290, color: "ดำ", sku: "TTM061-04", product: "กระเป๋าสตางค์หนังแท้", link: "Shopee: https://shp.ee/xxx\nLazada: https://lzd.co/yyy" };

  const save = async () => {
    setSaving(true);
    try { await saveCaptionTemplates(brandId, templates, channels); pushToast("success", t("บันทึกแม่แบบแล้ว", "Template saved")); onSaved(); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} title={`${t("จัดการแม่แบบแคปชั่น", "Manage Caption Templates")}${brandId ? ` — ${brandLabel ?? t("แบรนด์", "Brand")}` : ` — ${t("ค่ากลาง (ทุกแบรนด์)", "Default (all brands)")}`}`} size="xl"
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ปิด", "Close")}</button>
        <button onClick={save} disabled={saving || loading} className="h-9 px-5 text-sm text-white bg-violet-600 rounded-lg disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button>
      </>}>
      {loading ? <p className="text-sm text-slate-400 p-4">{t("กำลังโหลด...", "Loading...")}</p> : (
        <div className="space-y-4">
          {brandId && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">{t("ช่องทางร้าน (ใช้กับตัวแปร", "Shop channels (used with variable")} {"{shop}"})</p>
              <div className="space-y-1.5">
                {channels.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={c.label} onChange={(e) => setChannels((cs) => cs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="Shopee" className="h-9 w-32 border border-slate-200 rounded-lg px-2 text-sm" />
                    <input value={c.value} onChange={(e) => setChannels((cs) => cs.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} placeholder="Louis Montini Official" className="flex-1 h-9 border border-slate-200 rounded-lg px-2 text-sm" />
                    <button onClick={() => setChannels((cs) => cs.filter((_, j) => j !== i))} className="h-9 px-2 text-slate-400 hover:text-red-500">✕</button>
                  </div>
                ))}
                <button onClick={() => setChannels((cs) => [...cs, { label: "", value: "" }])} className="text-sm text-violet-700 hover:underline">＋ {t("เพิ่มช่องทาง", "Add Channel")}</button>
              </div>
            </div>
          )}

          {/* แท็บแม่แบบ */}
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t, i) => <button key={i} onClick={() => setActiveIdx(i)} className={`px-2.5 py-1 rounded-lg text-xs border ${i === activeIdx ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200"}`}>{t.label || t.key}</button>)}
            <button onClick={addTemplate} className="px-2.5 py-1 rounded-lg text-xs border border-dashed border-slate-300 text-slate-500">＋ {t("แม่แบบ", "Template")}</button>
          </div>

          {active && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div><label className="text-xs text-slate-400">{t("ชื่อแม่แบบ", "Template Name")}</label><input value={active.label} onChange={(e) => setActiveLabel(e.target.value)} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm" /></div>
                <div>
                  <label className="text-xs text-slate-400">{t("เนื้อหาแม่แบบ (แทรกตัวแปรได้)", "Template Body (variables insertable)")}</label>
                  <textarea value={active.body} onChange={(e) => setActiveBody(e.target.value)} rows={10} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-mono leading-relaxed" />
                </div>
                <div className="flex flex-wrap gap-1">
                  {CAPTION_VARS.map((v) => <button key={v.key} onClick={() => insertVar(v.label)} title={v.hint} className="text-[11px] bg-slate-100 hover:bg-violet-100 text-slate-600 rounded px-1.5 py-0.5">{v.label}</button>)}
                </div>
                <button onClick={removeActive} className="text-xs text-red-500 hover:underline">{t("ลบแม่แบบนี้", "Delete this template")}</button>
              </div>
              <div>
                <label className="text-xs text-slate-400">{t("ตัวอย่าง (ใช้ข้อมูลสมมติ)", "Preview (sample data)")}</label>
                <pre className="mt-0.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2.5 whitespace-pre-wrap font-sans leading-relaxed h-[280px] overflow-y-auto">{renderCaption(active.body, sampleVars) || "—"}</pre>
              </div>
            </div>
          )}
          <p className="text-[11px] text-slate-400">{t("บรรทัดที่ตัวแปรว่างทั้งหมดจะถูกตัดออกอัตโนมัติ", "Lines where all variables are empty will be removed automatically")} · {brandId ? t("บันทึกแล้วจะใช้เฉพาะแบรนด์นี้", "Saved settings apply to this brand only") : t("นี่คือค่ากลางที่ทุกแบรนด์ใช้ ถ้ายังไม่ตั้งของตัวเอง", "This is the default used by all brands that haven't set their own")}</p>
        </div>
      )}
    </ERPModal>
  );
}

// ตั้งค่าพรอมต์ตั้งต้น + แฮชแท็กเริ่มต้น (ต่อแบรนด์ + ต่อแพลตฟอร์ม + ตัวรวม)
function CaptionConfigModal({ cfg, brandId, brandLabel, platforms, onClose, onSaved, pushToast }: { cfg: CaptionConfig; brandId: string | null; brandLabel: string | null; platforms: { value: string; label: string }[]; onClose: () => void; onSaved: (v: CaptionConfig) => void; pushToast: (type: Toast["type"], m: string) => void }) {
  const t = useT();
  const [val, setVal] = useState<CaptionConfig>(cfg);
  const [saving, setSaving] = useState(false);
  const brandKey = brandId ?? "";
  const setPromptBrand = (txt: string) => setVal((v) => ({ ...v, prompt_by_brand: { ...(v.prompt_by_brand ?? {}), [brandKey]: txt } }));
  const setHashBrand = (txt: string) => setVal((v) => ({ ...v, hashtags_by_brand: { ...(v.hashtags_by_brand ?? {}), [brandKey]: txt } }));
  const setHashPlat = (p: string, txt: string) => setVal((v) => ({ ...v, hashtags_by_platform: { ...(v.hashtags_by_platform ?? {}), [p]: txt } }));
  const save = async () => { setSaving(true); try { await saveCaptionConfig(val); pushToast("success", t("บันทึกแล้ว", "Saved")); onSaved(val); } catch (e) { pushToast("error", (e as Error).message); } finally { setSaving(false); } };
  return (
    <ERPModal open onClose={onClose} size="lg" title={t("✍️ พรอมต์ + แฮชแท็กเริ่มต้น", "✍️ Prompt + default hashtags")}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ปิด", "Close")}</button>
        <button onClick={save} disabled={saving} className="h-9 px-5 text-sm text-white bg-violet-600 rounded-lg disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button>
      </>}>
      <div className="space-y-4">
        {/* พรอมต์ */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">📋 {t("พรอมต์ตั้งต้น (เอาไปวางใน AI เขียนแคปชั่น)", "Prompt (paste into AI to write captions)")}</p>
          <p className="text-[11px] text-slate-400">{t("ใช้ตัวแปรได้: {product} {price} {color} {shop} — ปุ่ม 📋 คัดลอกพรอมต์ จะเติมข้อมูลสินค้าให้อัตโนมัติ", "Variables: {product} {price} {color} {shop} — the 📋 button fills product info automatically")}</p>
          {brandId && (
            <div>
              <label className="text-xs text-slate-400">{t("พรอมต์ของแบรนด์", "Brand prompt")} — {brandLabel || brandId}</label>
              <ERPTextarea rows={4} value={val.prompt_by_brand?.[brandKey] ?? ""} onChange={(e) => setPromptBrand(e.target.value)} placeholder={t("เว้นว่าง = ใช้พรอมต์รวมด้านล่าง", "Empty = use the global prompt below")} />
            </div>
          )}
          <div>
            <label className="text-xs text-slate-400">{t("พรอมต์รวม (ทุกแบรนด์ที่ไม่ได้ตั้งเอง)", "Global prompt (fallback)")}</label>
            <ERPTextarea rows={4} value={val.prompt ?? ""} onChange={(e) => setVal((v) => ({ ...v, prompt: e.target.value }))} placeholder={t("เช่น: ช่วยเขียนแคปชั่นขายของสำหรับ {product} ราคา {price} สี {color} โทนสนุก ...", "e.g. Write a sales caption for {product} at {price}, colors {color}, fun tone ...")} />
          </div>
        </div>
        {/* แฮชแท็กเริ่มต้น */}
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-sm font-semibold text-slate-700"># {t("แฮชแท็กเริ่มต้น (คอนเทนต์ใหม่เติมให้: แบรนด์ + แพลตฟอร์ม รวมกัน)", "Default hashtags (new content prefills: brand + platform)")}</p>
          {brandId && (
            <div>
              <label className="text-xs text-slate-400">{t("ของแบรนด์", "Brand")} — {brandLabel || brandId}</label>
              <ERPInput value={val.hashtags_by_brand?.[brandKey] ?? ""} onChange={(e) => setHashBrand(e.target.value)} placeholder="#แบรนด์ #ของน่ารัก" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {platforms.map((p) => (
              <div key={p.value}>
                <label className="text-xs text-slate-400">{p.label}</label>
                <ERPInput value={val.hashtags_by_platform?.[p.value] ?? ""} onChange={(e) => setHashPlat(p.value, e.target.value)} placeholder="#hashtag" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </ERPModal>
  );
}

// ส่วนที่พับได้ในคอลัมน์ซ้ายของ drawer คอนเทนต์ — หัวข้อมีแถบชัด + กด ▼ พับ/กาง (จำต่อคน)
// section แบบ "แบน" — หัวข้อ + เส้นคั่นบน (ไม่ทำเป็นกล่อง/เงา จะได้ไม่ดูจม)
function CSection({ title, order, collapsed, onToggle, right, children }: { title: string; order: number; collapsed: boolean; onToggle: () => void; right?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ order }} className="border-t border-slate-100 pt-2.5">
      <div className="w-full flex items-center justify-between gap-2 mb-1.5">
        <button onClick={onToggle} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 tracking-wide hover:text-violet-700 min-w-0">
          <span className="text-[10px] text-slate-300 shrink-0 w-3 text-center">{collapsed ? "▸" : "▾"}</span><span className="truncate">{title}</span>
        </button>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {!collapsed && <div>{children}</div>}
    </div>
  );
}
