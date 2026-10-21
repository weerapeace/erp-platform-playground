"use client";

// ============================================================
// Creative Content / Social — จัดการโพสต์ + caption หลายแพลตฟอร์ม + ปฏิทิน
// ของกลาง: StandaloneShell, ERPModal, ConfirmDialog, ERPForm*, ProductPicker
// ข้อมูลจาก /api/creative-content + /api/creative-hashtags (ดู app/tasks/data.ts)
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSWRLite } from "@/lib/swr-lite";
import { StandaloneShell } from "@/components/standalone-shell";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { CONTENT_STATUS_META, postTypeLabel, listContent, listContentTemplates, createContent, updateContent, deleteContent, bulkDeleteContent, listCampaigns, listBrands, type ContentItem } from "../data";
import { useCreativeOptions, platformLabel } from "../use-options";
import { ContentCreateModal } from "./content-create-modal";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useT } from "@/components/i18n";
import { askText } from "@/components/modal/ask-dialog";
import { usePushToast } from "@/components/toast";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { StatusBadge } from "./content-ui";
import { AiCaptionModal } from "./caption-card";
import { ContentDrawer } from "./content-drawer";
export { ContentDrawer } from "./content-drawer";   // ย้ายไป content-drawer.tsx — re-export กันโค้ดเดิมที่อ้างจากไฟล์นี้
export { postFormatLabel } from "./caption-card";   // ย้ายไป caption-card.tsx — re-export กันโค้ดเดิมที่อ้างจากไฟล์นี้

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

  // create modal (ฟอร์ม/logic ย้ายไปของกลาง ContentCreateModal แล้ว)
  const [open, setOpen] = useState(false);
  const [iconEditId, setIconEditId] = useState<string | null>(null);   // แม่แบบที่กำลังเปลี่ยนไอคอน

  const pushToast = usePushToast();   // แจ้งเตือนผ่าน toast กลาง (components/toast)

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
    const name = (await askText({ title: t("ชื่อแม่แบบคอนเทนต์", "Content template name"), required: true }));
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
        {loading ? <LoadingState />
          : loadError ? (
            <ErrorState onRetry={() => void load()} />
          )
          : view === "templates" ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-500">{t("แม่แบบคอนเทนต์ — ตั้งแคปชั่น/แพลตฟอร์มไว้ล่วงหน้า เลือกใช้ตอนสร้างคอนเทนต์ได้", "Content templates — preset captions/platforms, pick when creating content")}</p>
                <button onClick={createTpl} className="h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {t("สร้างแม่แบบ", "New Template")}</button>
              </div>
              {templates.length === 0 ? (
                <EmptyState icon="🧩" title={t("ยังไม่มีแม่แบบคอนเทนต์", "No content templates yet")} hint={t('สร้างใหม่ หรือกด "บันทึกเป็นเทมเพลต" จากคอนเทนต์ที่มีอยู่', 'Create one, or click "Save as Template" from existing content')} />
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
            <EmptyState icon="📱" title={t("ยังไม่มีคอนเทนต์", "No content yet")} action={{ label: <>＋ {t("สร้างคอนเทนต์", "Create Content")}</>, onClick: openCreate }} />
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
        brands={brands} campaigns={campaigns} pushToast={pushToast} />

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
