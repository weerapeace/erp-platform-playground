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
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { SkuPicker, ParentSkuPicker, UserPicker } from "@/components/pickers";
import type { SkuPickerValue, ParentSkuPickerValue, UserPickerValue } from "@/components/pickers";
import { ImageAttach } from "@/components/image-attach";
import { ImageLightbox } from "@/components/image-lightbox";
import { r2ImageUrl } from "@/lib/r2-image";
import {
  CONTENT_STATUS_META, POST_TYPES, contentStatusLabel, postTypeLabel,
  listContent, listContentTemplates, getContent, createContent, updateContent, deleteContent,
  listCampaigns, listBrands, listHashtags, createHashtag, getTask, listSubtasks,
  getCaptionTemplates, saveCaptionTemplates, getParentSkuColors,
  listContentAttachments, addContentAttachment, deleteContentAttachment,
  getPlatformSettings, savePlatformSettings, getLinkPreview,
  getCaptionConfig, saveCaptionConfig, defaultHashtags, resolvePrompt,
  type ContentItem, type ContentDetail, type ContentCaption, type ContentStatus,
  type BrandOption, type Hashtag, type CaptionTemplate, type CaptionConfig,
  type ContentAttachment, type PlatformSettings, type PlatformSetting, type LinkPreview,
} from "../data";
import { useCreativeOptions, platformLabel } from "../use-options";
import { apiFetch } from "@/lib/api";
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

const EMPTY_FORM = { title: "", post_type: "image", status: "draft" as ContentStatus, brand_id: "", campaign_id: "", scheduled_at: "", product: null as SkuPickerValue | null, platforms: [] as string[], note: "" };

export function ContentPageView() {
  const t = useT();
  const { platforms } = useCreativeOptions();
  const [view, setView] = useState<"list" | "calendar" | "templates">("list");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<ContentItem | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // create modal
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [tplId, setTplId] = useState("");
  const [tplCaptions, setTplCaptions] = useState<ContentCaption[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

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
  const load = useCallback(async () => { await itemsSWR.revalidate(true); }, [itemsSWR]);
  const reloadTemplates = useCallback(async () => { await templatesSWR.revalidate(true); }, [templatesSWR]);
  // เปิด drawer คอนเทนต์อัตโนมัติจากลิงก์ /tasks/content?content=<id> (กดมาจากการ์ดบน Canvas)
  useEffect(() => { const cid = new URLSearchParams(window.location.search).get("content"); if (cid) setDetailId(cid); }, []);

  const upd = (patch: Partial<typeof EMPTY_FORM>) => { setForm((p) => ({ ...p, ...patch })); setDirty(true); };
  const togglePlatform = (v: string) => upd({ platforms: form.platforms.includes(v) ? form.platforms.filter((x) => x !== v) : [...form.platforms, v] });
  const openCreate = () => { setForm(EMPTY_FORM); setTplId(""); setTplCaptions([]); setDirty(false); setFormErr(null); setOpen(true); };
  const applyTemplate = async (tid: string) => {
    setTplId(tid);
    if (!tid) { setTplCaptions([]); return; }
    try { const d = await getContent(tid); upd({ post_type: d.post_type ?? "image", platforms: d.platforms ?? [], brand_id: d.brand_id ?? "", note: d.note ?? "" }); setTplCaptions(d.captions ?? []); }
    catch (e) { pushToast("error", (e as Error).message); }
  };

  const save = async () => {
    if (!form.title.trim()) { setFormErr(t("กรุณาใส่ชื่อคอนเทนต์", "Please enter a content title")); return; }
    setSaving(true); setFormErr(null);
    try {
      const { content_no } = await createContent({
        title: form.title.trim(), campaign_id: form.campaign_id || null, brand_id: form.brand_id || null,
        sku_id: form.product?.id ?? null, product_name: form.product?.name ?? null, post_type: form.post_type || null,
        platforms: form.platforms, status: form.status, scheduled_at: form.scheduled_at || null, note: form.note.trim() || null,
        captions: tplCaptions.length ? form.platforms.map((p) => { const c = tplCaptions.find((x) => x.platform === p); return { platform: p, caption: c?.caption ?? null, hashtags: c?.hashtags ?? null, caption_type: c?.caption_type ?? "short" }; }) : undefined,
      });
      setOpen(false); setDirty(false); pushToast("success", t(`สร้างคอนเทนต์ ${content_no} แล้ว`, `Content ${content_no} created`)); await load();
    } catch (e) { setFormErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const onDelete = async () => { if (!delTarget) return; try { await deleteContent(delTarget.id); pushToast("info", t("ลบแล้ว", "Deleted")); await load(); await reloadTemplates(); } catch (e) { pushToast("error", (e as Error).message); } finally { setDelTarget(null); } };
  // สร้างแม่แบบคอนเทนต์เปล่า → เปิด drawer ให้กรอกแคปชั่น/แพลตฟอร์ม
  const createTpl = async () => {
    const name = window.prompt(t("ชื่อแม่แบบคอนเทนต์", "Content template name"));
    if (!name?.trim()) return;
    try { const { id } = await createContent({ title: name.trim(), is_template: true }); await reloadTemplates(); setDetailId(id); pushToast("success", t("สร้างแม่แบบแล้ว", "Template created")); }
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
            <button onClick={openCreate} className="h-10 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {t("สร้างคอนเทนต์", "Create Content")}</button>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit mt-4">
          <button onClick={() => setView("list")} className={`h-8 px-3 rounded-md text-sm font-medium ${view === "list" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>📋 {t("รายการ", "List")}</button>
          <button onClick={() => setView("calendar")} className={`h-8 px-3 rounded-md text-sm font-medium ${view === "calendar" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>🗓️ {t("ปฏิทิน", "Calendar")}</button>
          <button onClick={() => setView("templates")} className={`h-8 px-3 rounded-md text-sm font-medium ${view === "templates" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>🧩 {t("แม่แบบ", "Templates")}</button>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-6">
        {loading ? <div className="py-20 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>
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
                      <div className="flex items-start justify-between gap-2">
                        <button onClick={() => setDetailId(c.id)} className="min-w-0 text-left flex-1">
                          <span className="text-[10px] text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">🧩 {t("แม่แบบ", "Template")}</span>
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
                    {c.assignee_label && <span>· 🙋 {c.assignee_label}</span>}
                    {c.scheduled_at && <span>· 🗓 {c.scheduled_at.slice(0, 16).replace("T", " ")}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* create modal */}
      <ERPModal open={open} onClose={() => setOpen(false)} title={t("สร้างคอนเทนต์ใหม่", "Create New Content")} size="lg" hasUnsavedChanges={dirty}
        footer={<>
          <button onClick={() => setOpen(false)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("สร้าง", "Create")}</button>
        </>}>
        {formErr && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {formErr}</div>}
        {templates.length > 0 && (
          <div className="mb-4 flex items-center gap-2 bg-violet-50/60 border border-violet-100 rounded-lg px-3 py-2">
            <span className="text-sm text-slate-600 shrink-0">📋 {t("เริ่มจากเทมเพลต:", "Start from template:")}</span>
            <select value={tplId} onChange={(e) => applyTemplate(e.target.value)} className="flex-1 h-8 border border-slate-200 rounded-md px-2 text-sm bg-white">
              <option value="">{t("— ไม่ใช้เทมเพลต —", "— No template —")}</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        )}
        <ERPFormSection title={t("ข้อมูลคอนเทนต์", "Content Details")} columns={2}>
          <ERPFormField label={t("ชื่อคอนเทนต์", "Content Title")} required span={2}><ERPInput value={form.title} onChange={(e) => upd({ title: e.target.value })} placeholder={t("เช่น โปรโมต Heart Bag สีชมพู 7.7", "e.g. Promote Heart Bag Pink 7.7")} /></ERPFormField>
          <ERPFormField label={t("ประเภทโพสต์", "Post Type")}><ERPSelect value={form.post_type} options={POST_TYPES.map((p) => ({ value: p.value, label: postTypeLabel(p.value) }))} onChange={(e) => upd({ post_type: e.target.value })} /></ERPFormField>
          <ERPFormField label={t("สถานะ", "Status")}><ERPSelect value={form.status} options={Object.keys(CONTENT_STATUS_META).map((v) => ({ value: v, label: contentStatusLabel(v as ContentStatus) }))} onChange={(e) => upd({ status: e.target.value as ContentStatus })} /></ERPFormField>
          <ERPFormField label={t("แบรนด์", "Brand")}><ERPSelect value={form.brand_id} options={[{ value: "", label: t("— ไม่ระบุ —", "— None —") }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => upd({ brand_id: e.target.value })} /></ERPFormField>
          <ERPFormField label="Campaign"><ERPSelect value={form.campaign_id} options={[{ value: "", label: t("— ไม่ระบุ —", "— None —") }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => upd({ campaign_id: e.target.value })} /></ERPFormField>
          <ERPFormField label={t("ตั้งเวลาโพสต์", "Schedule Post")}><ERPInput type="datetime-local" value={form.scheduled_at} onChange={(e) => upd({ scheduled_at: e.target.value })} /></ERPFormField>
          <ERPFormField label={t("สินค้า/SKU (ถ้ามี)", "Product/SKU (if any)")}><SkuPicker value={form.product} onChange={(v) => upd({ product: v })} /></ERPFormField>
          <ERPFormField label={t("แพลตฟอร์ม", "Platforms")} span={2}>
            <div className="flex flex-wrap gap-1.5">{platforms.map((p) => <button key={p.value} type="button" onClick={() => togglePlatform(p.value)} className={`px-2.5 py-1 rounded-full text-xs border ${form.platforms.includes(p.value) ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>{p.label}</button>)}</div>
          </ERPFormField>
          <ERPFormField label={t("โน้ต/บรีฟ", "Note/Brief")} span={2}><ERPTextarea value={form.note} rows={2} onChange={(e) => upd({ note: e.target.value })} /></ERPFormField>
        </ERPFormSection>
      </ERPModal>

      {detailId && <ContentDrawer contentId={detailId} brands={brands} onClose={() => setDetailId(null)} onChanged={() => { load(); reloadTemplates(); }} onDelete={(c) => setDelTarget(c)} pushToast={pushToast} />}

      <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={onDelete}
        title={t("ลบคอนเทนต์", "Delete Content")} message={<span>{t("ต้องการลบ", "Delete")} <span className="font-semibold">{delTarget?.title}</span> {t("ใช่ไหม?", "?")}</span>} confirmText={t("ลบ", "Delete")} variant="danger" />

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
export function ContentDrawer({ contentId, brands, onClose, onChanged, onDelete, pushToast }: {
  contentId: string; brands: BrandOption[];
  onClose: () => void; onChanged: () => void; onDelete?: (c: ContentItem) => void;
  pushToast: (type: Toast["type"], m: string) => void;
}) {
  const t = useT();
  const { platforms } = useCreativeOptions();
  const [d, setD] = useState<ContentDetail | null>(null);
  const [caps, setCaps] = useState<ContentCaption[]>([]);
  const [links, setLinks] = useState<{ platform: string; url: string }[]>([]);
  const [status, setStatus] = useState<ContentStatus>("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [assignee, setAssignee] = useState<UserPickerValue | null>(null);   // ผู้รับผิดชอบคอนเทนต์
  const [saving, setSaving] = useState(false);
  // แม่แบบ + ส่วนลด
  const [templates, setTemplates] = useState<CaptionTemplate[]>([]);
  const [shopChannels, setShopChannels] = useState<ShopChannel[]>([]);
  const [discountValue, setDiscountValue] = useState<string>("");
  const [discountPct, setDiscountPct] = useState(false);
  const [tplSettingsOpen, setTplSettingsOpen] = useState(false);
  const [psOpen, setPsOpen] = useState(false);   // โมดอลตั้งค่าแพลตฟอร์ม
  const [capCfg, setCapCfg] = useState<CaptionConfig>({});   // พรอมต์ + แฮชแท็กเริ่มต้น
  const [cfgOpen, setCfgOpen] = useState(false);   // โมดอลตั้งค่าพรอมต์/แฮชแท็ก
  // สินค้า: SKU เดี่ยว + Parent SKU + สีที่มี
  const [sku, setSku] = useState<SkuPickerValue | null>(null);
  const [parent, setParent] = useState<ParentSkuPickerValue | null>(null);
  const [parentColors, setParentColors] = useState<string[]>([]);
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
      setAssignee(detail.assignee_id ? ({ id: detail.assignee_id, name: detail.assignee_label ?? "" } as UserPickerValue) : null);
      setLinks(Array.isArray(detail.product_links) ? detail.product_links : []);
      setDiscountValue(detail.discount_value != null ? String(detail.discount_value) : "");
      setDiscountPct(!!detail.discount_is_percent);
      setSku(detail.sku_id ? { id: detail.sku_id, code: detail.sku_code ?? "", name: detail.sku_name ?? detail.product_name ?? "", color: detail.sku_color, list_price: detail.sku_price } : null);
      setParent(detail.parent_sku_id ? { id: detail.parent_sku_id, code: detail.parent_sku_code ?? "", name: detail.parent_sku_name ?? "" } : null);
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
    try { const r = await getCaptionTemplates(d?.brand_id ?? null); setTemplates(r.templates); setShopChannels(r.shop_channels); } catch { /* ใช้ค่าว่าง */ }
  }, [d?.brand_id]);
  useEffect(() => { if (d) loadTemplates(); }, [d, loadTemplates]);

  const setCap = (platform: string, patch: Partial<ContentCaption>) => setCaps((cs) => cs.map((c) => c.platform === platform ? { ...c, ...patch } : c));

  // เลือก Parent SKU → ดึงสีของ SKU ลูกทั้งหมดมารวม
  useEffect(() => { if (!parent?.id) { setParentColors([]); return; } let live = true; getParentSkuColors(parent.id).then((cs) => { if (live) setParentColors(cs); }).catch(() => {}); return () => { live = false; }; }, [parent?.id]);

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

  // โน้ตต่อแพลตฟอร์ม (แก้ในตัว) — บันทึกตอนเลิกโฟกัส
  const setPlatNote = (platform: string, note: string) => setPset((ps) => ({ ...ps, [platform]: { ...ps[platform], note } }));
  const persistPset = async () => { try { await savePlatformSettings(pset); } catch (e) { pushToast("error", (e as Error).message); } };

  // ราคาเต็ม = ราคา SKU ที่เลือก · ราคาขาย = ราคา − ส่วนลด · สี = SKU เดี่ยว หรือ รวมสีลูกของ Parent
  const fakePrice = sku?.list_price ?? null;
  const realPrice = computeRealPrice(fakePrice, discountValue === "" ? null : Number(discountValue), discountPct);
  const colorText = parentColors.length ? parentColors.join(", ") : (sku?.color ?? null);
  // ตัวแปรสินค้าที่ใช้ร่วมทุก caption (ไม่รวม caption/hashtags ที่ต่างกันต่อแพลตฟอร์ม)
  const sharedVars = useMemo(() => ({
    shop: shopChannels, fake_price: fakePrice, real_price: realPrice,
    price: fakePrice, color: colorText, sku: sku?.code ?? null, product: sku?.name ?? d?.product_name ?? null,
  }), [shopChannels, fakePrice, realPrice, colorText, sku?.code, sku?.name, d?.product_name]);

  // คัดลอกพรอมต์ตั้งต้น (เติมตัวแปรสินค้าให้แล้ว) ไปวางใน AI เขียนแคปชั่นต่อ
  const copyPrompt = async () => {
    const raw = resolvePrompt(capCfg, d?.brand_id ?? null);
    if (!raw.trim()) { pushToast("info", t("ยังไม่ได้ตั้งพรอมต์ — กด ✍️ ตั้งค่า", "No prompt set — click ✍️ Config")); setCfgOpen(true); return; }
    const text = renderCaption(raw, { caption: "", hashtags: "", ...sharedVars });
    try { await navigator.clipboard.writeText(text); pushToast("success", t("คัดลอกพรอมต์แล้ว", "Prompt copied")); }
    catch { pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateContent(contentId, {
        status, scheduled_at: scheduledAt || null, published_url: publishedUrl.trim() || null, assignee_id: assignee?.id ?? null,
        sku_id: sku?.id ?? null, parent_sku_id: parent?.id ?? null, product_name: sku?.name ?? d?.product_name ?? null,
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
      await createContent({ is_template: true, title: `${d.title} (เทมเพลต)`, post_type: d.post_type, platforms: d.platforms ?? [], brand_id: d.brand_id, captions: caps.map((c) => ({ platform: c.platform, caption: c.caption, hashtags: c.hashtags, caption_type: c.caption_type ?? "short" })) });
      pushToast("success", t("บันทึกเป็นเทมเพลตแล้ว ✓ (เลือกใช้ได้ตอนสร้างคอนเทนต์)", "Saved as template ✓ (available when creating content)")); onChanged();
    } catch (e) { pushToast("error", (e as Error).message); }
  };

  if (!d) return (<><div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} /><div className="fixed right-0 top-0 h-full w-[1180px] max-w-[98vw] bg-white shadow-2xl z-50 flex items-center justify-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div></>);

  const contentPlatforms = d.platforms ?? [];
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
          <div className="min-w-0"><h3 className="text-base font-semibold text-slate-900 truncate">{d.title}</h3><span className="font-mono text-xs text-slate-500">{d.content_no}</span></div>
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
          <div ref={bodyRef} className={isWide ? "flex-1 flex min-h-0" : "contents"} style={isWide && dth.swap ? { flexDirection: "row-reverse" } : undefined}>
          {/* ───── ฝั่งกลาง: ข้อมูล + แนบงาน ───── */}
          <div className={`flex flex-col ${densityPad(dth.density)} ${densityGap(dth.density)} ${isWide ? "overflow-y-auto min-w-0" : ""}`} style={isWide ? { flexBasis: `${leftPct}%`, flexGrow: 0, flexShrink: 0 } : undefined}>
            {/* status + schedule + assignee — ปักไว้บนสุดเสมอ */}
            <div className="grid grid-cols-2 gap-3" style={{ order: -1 }}>
              <div><label className="text-xs text-slate-400">{t("สถานะ", "Status")}</label><ERPSelect value={status} options={Object.keys(CONTENT_STATUS_META).map((v) => ({ value: v, label: contentStatusLabel(v as ContentStatus) }))} onChange={(e) => setStatus(e.target.value as ContentStatus)} /></div>
              <div><label className="text-xs text-slate-400">{t("ตั้งเวลาโพสต์", "Schedule Post")}</label><ERPInput type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
              <div className="col-span-2"><label className="text-xs text-slate-400">{t("ผู้รับผิดชอบคอนเทนต์", "Content assignee")}</label><UserPicker value={assignee} onChange={setAssignee} disableCreate /></div>
            </div>

            {/* สินค้า: SKU เดี่ยว + Parent SKU + สีที่มี + ดึงจากงาน */}
            {!isHidden(dth, "product") && (
            <CSection title={cLabelOf("product")} order={cOrderOf("product")} collapsed={coll("product")} onToggle={() => toggleColl("product")}
              right={d.task_id ? <button onClick={(e) => { e.stopPropagation(); pullFromTask(); }} disabled={pullBusy} className="text-xs text-violet-700 hover:underline disabled:opacity-50">{pullBusy ? t("กำลังดึง…", "Pulling…") : t("⬇ ดึงสินค้าจากงาน", "⬇ Pull from task")}</button> : undefined}>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400">SKU ({t("สีเดี่ยว", "single color")})</label><SkuPicker value={sku} onChange={setSku} /></div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-400">Parent SKU ({t("ทุกสี", "all colors")})</label>
                    {parent?.id && <button onClick={() => setOpenParentId(parent.id)} className="text-[11px] text-violet-700 hover:underline">↗ {t("เปิดดูสินค้า", "Open")}</button>}
                  </div>
                  <ParentSkuPicker value={parent} onChange={setParent} />
                </div>
              </div>
              <div className="mt-2">
                <label className="text-xs text-slate-400">{t("สีที่มี", "Available Colors")} ({"{color}"})</label>
                <div className="min-h-9 px-3 py-1.5 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg">{colorText || <span className="text-slate-400">{t("— เลือก SKU (ได้สีเดียว) หรือ Parent SKU (รวมทุกสีลูก)", "— Select SKU (single color) or Parent SKU (all child colors)")}</span>}</div>
              </div>
            </CSection>)}

            {/* ราคา / ส่วนลด — ซ่อนถ้ายังไม่เลือก SKU/Parent SKU */}
            {!isHidden(dth, "price") && (sku || parent) && (
            <CSection title={cLabelOf("price")} order={cOrderOf("price")} collapsed={coll("price")} onToggle={() => toggleColl("price")}>
              <div className="flex items-end gap-2 flex-wrap">
                <div><label className="text-xs text-slate-400">{t("ราคาเต็ม (จาก SKU)", "Full Price (from SKU)")}</label><div className="h-9 px-3 flex items-center text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg min-w-24">{fakePrice != null ? `${Number(fakePrice).toLocaleString("th-TH")} ฿` : t("— (ไม่มี SKU)", "— (no SKU)")}</div></div>
                <div><label className="text-xs text-slate-400">{t("ส่วนลด", "Discount")}</label>
                  <div className="flex">
                    <input value={discountValue} onChange={(e) => setDiscountValue(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" className="h-9 w-24 border border-slate-200 rounded-l-lg px-2 text-sm" />
                    <button type="button" onClick={() => setDiscountPct((p) => !p)} title={t("สลับ บาท/เปอร์เซ็นต์", "Toggle Baht/Percent")} className="h-9 px-3 text-sm border border-l-0 border-slate-200 rounded-r-lg bg-slate-50 hover:bg-slate-100">{discountPct ? "%" : "฿"}</button>
                  </div>
                </div>
                <div><label className="text-xs text-slate-400">{t("ราคาขายจริง", "Selling Price")}</label><div className="h-9 px-3 flex items-center text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg min-w-24">{realPrice != null ? `${Number(realPrice).toLocaleString("th-TH")} ฿` : "—"}</div></div>
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

            {/* แนบงานเพิ่มเอง: รูป / วิดีโอ / ลิงก์พรีวิว (default พับ) */}
            {!isHidden(dth, "attach") && (
            <CSection title={cLabelOf("attach")} order={cOrderOf("attach")} collapsed={coll("attach")} onToggle={() => toggleColl("attach")}>
              <ContentAttachments attachments={attachments} onAttachImage={onAttachImage} onUploadVideo={onUploadVideo} onAddLink={onAddLink} onDelete={onDelAttachment} pushToast={pushToast} />
            </CSection>)}

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

            {/* หมายเหตุ/สิ่งที่ต้องทำ ต่อแพลตฟอร์ม (แก้ในตัว) */}
            {!isHidden(dth, "platform_notes") && contentPlatforms.length > 0 && (
              <CSection title={cLabelOf("platform_notes")} order={cOrderOf("platform_notes")} collapsed={coll("platform_notes")} onToggle={() => toggleColl("platform_notes")}>
                <div className="space-y-2">
                  {contentPlatforms.map((p) => (
                    <div key={p} className="border border-slate-200 rounded-lg p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-600">{platformLabel(p)}</span>
                        {pset[p]?.post_url && <a href={pset[p].post_url ?? "#"} target="_blank" rel="noreferrer" className="text-[11px] text-violet-700 hover:underline">↗ {t("ไปโพสต์", "Open to post")}</a>}
                      </div>
                      <textarea value={pset[p]?.note ?? ""} onChange={(e) => setPlatNote(p, e.target.value)} onBlur={persistPset} rows={2} placeholder={t("หมายเหตุ/สิ่งที่ต้องแนบ เช่น รูป 1:1 อย่างน้อย 5 รูป", "Notes / what to attach")} className="mt-1 w-full border border-slate-200 rounded px-2 py-1 text-xs" />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-300 mt-1">{t("โน้ตเป็นค่ากลาง (ทุกคอนเทนต์เห็นเหมือนกัน) · ตั้งลิงก์ไปโพสต์ที่ ⚙️ ตั้งค่าแพลตฟอร์ม", "Notes are global · set post links in ⚙️ Platform settings")}</p>
              </CSection>
            )}

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
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={copyPrompt} className="text-xs font-medium text-violet-700 hover:underline">📋 {t("คัดลอกพรอมต์", "Copy prompt")}</button>
                <button onClick={() => setCfgOpen(true)} className="text-xs text-violet-700 hover:underline">✍️ {t("พรอมต์/แฮชแท็ก", "Prompt/Hashtags")}</button>
                <button onClick={() => setPsOpen(true)} className="text-xs text-violet-700 hover:underline">⚙️ {t("ตั้งค่าแพลตฟอร์ม", "Platform settings")}</button>
                <button onClick={() => setTplSettingsOpen(true)} className="text-xs text-violet-700 hover:underline">📝 {t("แม่แบบ", "Templates")}</button>
              </div>
            </div>
            {caps.length === 0 ? <p className="text-sm text-slate-400 italic">{t("ยังไม่ได้เลือกแพลตฟอร์ม (แก้ที่ตอนสร้าง)", "No platforms selected (edit at creation time)")}</p> : (
              <div className="space-y-3">
                {caps.map((c) => <CaptionCard key={c.platform} cap={c} templates={templates} sharedVars={sharedVars} brandId={d.brand_id} setting={pset[c.platform]} onChange={(patch) => setCap(c.platform, patch)} pushToast={pushToast} />)}
              </div>
            )}
          </div>
          </div>
        </div>

        <div className="border-t border-slate-200 px-6 py-4 shrink-0 flex items-center gap-2">
          {!d.is_template && <button onClick={saveAsTemplate} className="h-9 px-3 text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 mr-auto">💾 {t("บันทึกเป็นเทมเพลต", "Save as Template")}</button>}
          <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
          <button onClick={save} disabled={saving} style={{ background: btnBg(dth) }} className="h-9 px-5 text-sm font-medium text-white rounded-lg disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button>
        </div>
      </div>

      {cfgOpen && <CaptionConfigModal cfg={capCfg} brandId={d.brand_id} brandLabel={d.brand_label} platforms={platforms} onClose={() => setCfgOpen(false)} onSaved={(v) => { setCapCfg(v); setCfgOpen(false); }} pushToast={pushToast} />}
      {tplSettingsOpen && <CaptionTemplateSettings brandId={d.brand_id} brandLabel={d.brand_label} onClose={() => setTplSettingsOpen(false)} onSaved={() => { setTplSettingsOpen(false); loadTemplates(); }} pushToast={pushToast} />}
      {psOpen && <PlatformSettingsModal platforms={platforms} templates={templates} settings={pset} onClose={() => setPsOpen(false)} onSaved={(v) => { setPset(v); setPsOpen(false); }} pushToast={pushToast} />}
      <ImageLightbox images={taskMedia.images.map((im) => ({ url: r2ImageUrl(im.key, 1600) ?? "", label: im.label }))} index={tmLb} onClose={() => setTmLb(-1)} onIndex={setTmLb} />
      {openParentId && <MasterRecordDrawer moduleKey="parent-skus-v2" apiPath="parent-skus" recordId={openParentId} onClose={() => setOpenParentId(null)} onChanged={() => {}} />}
    </>
  );
}

type SharedVars = { shop: ShopChannel[]; fake_price: number | null; real_price: number | null; price: number | null; color: string | null; sku: string | null; product: string | null };

// ============================================================
// ไฟล์แนบของคอนเทนต์: รูป (ย่อก่อนอัป) / วิดีโอสั้น / ลิงก์ (พรีวิว OG เต็ม)
// ============================================================
function ContentAttachments({ attachments, onAttachImage, onUploadVideo, onAddLink, onDelete, pushToast }: {
  attachments: ContentAttachment[];
  onAttachImage: (r: { r2_key: string; file_name: string; content_type: string; size_bytes: number }) => Promise<void>;
  onUploadVideo: (f: File) => Promise<void>;
  onAddLink: (url: string) => Promise<void>;
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
        <span className="text-[11px] text-slate-400 ml-2">{t("คลิปยาวใช้ลิงก์ด้านล่าง", "Long clips → use link below")}</span>
        {videos.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            {videos.map((v) => (
              <div key={v.id} className="relative group">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={r2ImageUrl(v.r2_key) ?? undefined} controls className="w-full h-28 object-cover rounded-lg border border-slate-200 bg-black" />
                <button onClick={() => void onDelete(v.id)} title={t("ลบ", "Delete")} className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-red-500 text-xs opacity-0 group-hover:opacity-100 shadow">✕</button>
              </div>
            ))}
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
  const [loaded, setLoaded] = useState(false);
  const loadTags = useCallback(async () => { try { setTags(await listHashtags({ brand_id: brandId || undefined, platform })); setLoaded(true); } catch { /* ว่าง */ } }, [brandId, platform]);
  useEffect(() => { if (focus && !loaded) loadTags(); }, [focus, loaded, loadTags]);

  const tokens = (value ?? "").split(/\s+/).filter(Boolean);
  const lastTok = (value ?? "").split(/\s+/).pop() ?? "";
  const q = lastTok.replace(/^#/, "").toLowerCase();
  const suggestions = tags
    .filter((h) => { const txt = h.text.toLowerCase().replace(/^#/, ""); return q ? txt.includes(q) : true; })
    .filter((h) => !tokens.includes(h.text))
    .slice(0, 12);
  const exists = tags.some((h) => h.text.toLowerCase().replace(/^#/, "") === q);

  const applyTag = (text: string) => {
    const parts = (value ?? "").split(/\s+/);
    if (parts.length === 0) { onChange(text + " "); return; }
    parts[parts.length - 1] = text;   // แทนที่ token ที่กำลังพิมพ์
    onChange(parts.join(" ") + " ");
  };
  const addNew = async () => {
    const raw = q.trim(); if (!raw) return;
    const text = "#" + raw.replace(/^#/, "");
    try { const h = await createHashtag({ text, brand_id: brandId || null, platform }); applyTag(h.text); await loadTags(); }
    catch (e) { pushToast("error", (e as Error).message); }
  };

  return (
    <div className="relative">
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
        placeholder={t("#hashtag คั่นด้วยเว้นวรรค (พิมพ์เพื่อค้นหาจากคลัง)", "#hashtag (type to search library)")} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm" />
      {focus && (suggestions.length > 0 || (q && !exists)) && (
        <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto p-1">
          {suggestions.map((h) => (
            <button key={h.id} onMouseDown={(e) => { e.preventDefault(); applyTag(h.text); }} className="flex w-full items-center justify-between gap-2 text-left px-2 py-1 text-sm rounded hover:bg-violet-50 text-slate-700">
              <span className="truncate">{h.text}</span><span className="text-[10px] text-slate-300 shrink-0">{h.usage_count}</span>
            </button>
          ))}
          {q && !exists && <button onMouseDown={(e) => { e.preventDefault(); void addNew(); }} className="block w-full text-left px-2 py-1 text-sm rounded hover:bg-emerald-50 text-emerald-700">＋ {t("เพิ่ม", "Add")} “#{q}” {t("เข้าคลัง", "to library")}</button>}
        </div>
      )}
    </div>
  );
}

// caption ต่อ 1 แพลตฟอร์ม: แม่แบบ + แคปชั่น + hashtag typeahead + พรีวิว + ปุ่มไปโพสต์/คัดลอก
// เคารพตั้งค่าแพลตฟอร์ม: แม่แบบเริ่มต้น / ปิดแคปชั่น-แฮชแท็ก / ลิงก์ไปโพสต์
function CaptionCard({ cap, templates, sharedVars, brandId, setting, onChange, pushToast }: { cap: ContentCaption; templates: CaptionTemplate[]; sharedVars: SharedVars; brandId: string | null; setting?: PlatformSetting; onChange: (p: Partial<ContentCaption>) => void; pushToast: (type: Toast["type"], m: string) => void }) {
  const t = useT();
  const [tplOpen, setTplOpen] = useState(false);   // พับปุ่มเลือกแม่แบบไว้ก่อน
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

  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-slate-700">{platformLabel(cap.platform)}</span>
        <div className="flex items-center gap-3 shrink-0">
          {postUrl && <a href={postUrl} target="_blank" rel="noreferrer" className="text-xs text-violet-700 hover:underline">↗ {t("ไปโพสต์", "Post")}</a>}
          <button onClick={copy} className="text-xs text-violet-700 hover:underline">📋 {t("คัดลอก", "Copy")}</button>
        </div>
      </div>
      {/* เลือกแม่แบบ (พับไว้ — กดกางเมื่อจะเปลี่ยน) · ซ่อนถ้าปิดแคปชั่น */}
      {useCaption && (
      <div className="mb-2">
        <button onClick={() => setTplOpen((o) => !o)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-violet-700">
          📑 {t("แม่แบบ", "Template")}: <span className="font-medium text-slate-700">{tpl?.label ?? t("ไม่มี", "none")}</span> <span className="text-[10px]">{tplOpen ? "▲" : "▼"}</span>
        </button>
        {tplOpen && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {templates.map((tp) => { const on = typeKey === tp.key; return (
              <button key={tp.key} onClick={() => { onChange({ caption_type: tp.key }); setTplOpen(false); }} className={`px-2.5 py-0.5 rounded-full text-xs border ${on ? "bg-violet-600 text-white border-violet-600" : "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"}`}>{tp.label}</button>
            ); })}
            {templates.length === 0 && <span className="text-xs text-slate-400">{t("ยังไม่มีแม่แบบ — กด 📝 แม่แบบ", "No templates yet — click 📝 Templates")}</span>}
          </div>
        )}
      </div>
      )}
      {useCaption
        ? <ERPTextarea value={cap.caption ?? ""} rows={3} onChange={(e) => onChange({ caption: e.target.value })} placeholder={t(`เขียน caption สำหรับ ${platformLabel(cap.platform)}...`, `Write caption for ${platformLabel(cap.platform)}...`)} />
        : <p className="text-[11px] text-slate-400 italic bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2">{t("ปิดแคปชั่นสำหรับแพลตฟอร์มนี้ (เปิดได้ที่ ⚙️ ตั้งค่าแพลตฟอร์ม)", "Caption off for this platform (toggle in ⚙️ Platform settings)")}</p>}
      {useHashtags && <div className="mt-2"><HashtagInput value={cap.hashtags} onChange={(v) => onChange({ hashtags: v })} brandId={brandId} platform={cap.platform} pushToast={pushToast} /></div>}
      {/* preview ผลลัพธ์ที่จะคัดลอก — โชว์เฉพาะเมื่อมีแคปชั่นจริง */}
      {useCaption && (cap.caption ?? "").trim() && (
        <div className="mt-2">
          <p className="text-[11px] text-slate-400 mb-1">{t("ตัวอย่างที่จะโพสต์ (ประกอบจากแม่แบบ)", "Preview (assembled from template)")}</p>
          <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2.5 whitespace-pre-wrap font-sans leading-relaxed">{preview || "—"}</pre>
        </div>
      )}
    </div>
  );
}

// ตั้งค่าต่อแพลตฟอร์ม (ค่ากลาง): แม่แบบเริ่มต้น / ปิดแคปชั่น-แฮชแท็ก / ลิงก์ไปโพสต์ / โน้ตบอกคนทำงาน
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
  const sampleVars = { caption: "ข้อความตัวอย่างที่พิมพ์เอง", hashtags: "#LouisMontini #กระเป๋าหนัง", shop: channels, fake_price: 1290, real_price: 990, price: 1290, color: "ดำ", sku: "TTM061-04", product: "กระเป๋าสตางค์หนังแท้" };

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
function CSection({ title, order, collapsed, onToggle, right, children }: { title: string; order: number; collapsed: boolean; onToggle: () => void; right?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ order }} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <div className={`w-full flex items-center justify-between gap-2 pl-2.5 pr-3 py-2 ${collapsed ? "" : "border-b border-slate-100"}`}>
        <button onClick={onToggle} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 tracking-wide hover:text-violet-700 min-w-0">
          <span className="text-[10px] text-slate-300 shrink-0 w-3 text-center">{collapsed ? "▸" : "▾"}</span><span className="truncate">{title}</span>
        </button>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {!collapsed && <div className="px-3 py-3">{children}</div>}
    </div>
  );
}
