"use client";

// ============================================================
// Creative Content / Social — จัดการโพสต์ + caption หลายแพลตฟอร์ม + ปฏิทิน
// ของกลาง: StandaloneShell, ERPModal, ConfirmDialog, ERPForm*, ProductPicker
// ข้อมูลจาก /api/creative-content + /api/creative-hashtags (ดู app/tasks/data.ts)
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSWRLite } from "@/lib/swr-lite";
import { renderCaption, computeRealPrice, CAPTION_VARS, type ShopChannel } from "@/lib/caption-template";
import { StandaloneShell } from "@/components/standalone-shell";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { SkuPicker, ParentSkuPicker } from "@/components/pickers";
import type { SkuPickerValue, ParentSkuPickerValue } from "@/components/pickers";
import {
  CONTENT_STATUS_META, POST_TYPES,
  listContent, listContentTemplates, getContent, createContent, updateContent, deleteContent,
  listCampaigns, listBrands, listHashtags, createHashtag,
  getCaptionTemplates, saveCaptionTemplates, getParentSkuColors,
  type ContentItem, type ContentDetail, type ContentCaption, type ContentStatus,
  type BrandOption, type Hashtag, type CaptionTemplate,
} from "../data";
import { useCreativeOptions, platformLabel } from "../use-options";
import { useT } from "@/components/i18n";

const POST_TYPE_LABEL = Object.fromEntries(POST_TYPES.map((p) => [p.value, p.label]));
type Toast = { id: number; type: "success" | "error" | "info"; message: string };

function StatusBadge({ status }: { status: ContentStatus }) {
  const m = CONTENT_STATUS_META[status] ?? CONTENT_STATUS_META.draft;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}</span>;
}

const EMPTY_FORM = { title: "", post_type: "image", status: "draft" as ContentStatus, brand_id: "", campaign_id: "", scheduled_at: "", product: null as SkuPickerValue | null, platforms: [] as string[], note: "" };

export function ContentPageView() {
  const t = useT();
  const { platforms } = useCreativeOptions();
  const [view, setView] = useState<"list" | "calendar">("list");
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

  const onDelete = async () => { if (!delTarget) return; try { await deleteContent(delTarget.id); pushToast("info", t("ลบแล้ว", "Deleted")); await load(); } catch (e) { pushToast("error", (e as Error).message); } finally { setDelTarget(null); } };

  return (
    <StandaloneShell title={t("คอนเทนต์ Social", "Social Content")} icon="📱" accent="violet">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
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
        </div>
      </div>

      <div className="px-8 py-6">
        {loading ? <div className="py-20 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>
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
                    {c.post_type && <span>· {POST_TYPE_LABEL[c.post_type] ?? c.post_type}</span>}
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
          <ERPFormField label={t("ประเภทโพสต์", "Post Type")}><ERPSelect value={form.post_type} options={POST_TYPES} onChange={(e) => upd({ post_type: e.target.value })} /></ERPFormField>
          <ERPFormField label={t("สถานะ", "Status")}><ERPSelect value={form.status} options={Object.entries(CONTENT_STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))} onChange={(e) => upd({ status: e.target.value as ContentStatus })} /></ERPFormField>
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
  const [saving, setSaving] = useState(false);
  // แม่แบบ + ส่วนลด
  const [templates, setTemplates] = useState<CaptionTemplate[]>([]);
  const [shopChannels, setShopChannels] = useState<ShopChannel[]>([]);
  const [discountValue, setDiscountValue] = useState<string>("");
  const [discountPct, setDiscountPct] = useState(false);
  const [tplSettingsOpen, setTplSettingsOpen] = useState(false);
  // สินค้า: SKU เดี่ยว + Parent SKU + สีที่มี
  const [sku, setSku] = useState<SkuPickerValue | null>(null);
  const [parent, setParent] = useState<ParentSkuPickerValue | null>(null);
  const [parentColors, setParentColors] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const detail = await getContent(contentId);
      setD(detail); setStatus(detail.status); setScheduledAt(detail.scheduled_at ? detail.scheduled_at.slice(0, 16) : ""); setPublishedUrl(detail.published_url ?? "");
      setLinks(Array.isArray(detail.product_links) ? detail.product_links : []);
      setDiscountValue(detail.discount_value != null ? String(detail.discount_value) : "");
      setDiscountPct(!!detail.discount_is_percent);
      setSku(detail.sku_id ? { id: detail.sku_id, code: detail.sku_code ?? "", name: detail.sku_name ?? detail.product_name ?? "", color: detail.sku_color, list_price: detail.sku_price } : null);
      setParent(detail.parent_sku_id ? { id: detail.parent_sku_id, code: detail.parent_sku_code ?? "", name: detail.parent_sku_name ?? "" } : null);
      // เตรียม caption ให้ครบทุกแพลตฟอร์มของคอนเทนต์
      const platforms = detail.platforms ?? [];
      const byPlat = new Map(detail.captions.map((c) => [c.platform, c]));
      setCaps(platforms.map((p) => byPlat.get(p) ?? { platform: p, caption: "", hashtags: "" }));
    } catch (e) { pushToast("error", (e as Error).message); }
  }, [contentId, pushToast]);
  useEffect(() => { load(); }, [load]);

  // โหลดแม่แบบ + ช่องทางร้านของแบรนด์คอนเทนต์
  const loadTemplates = useCallback(async () => {
    try { const r = await getCaptionTemplates(d?.brand_id ?? null); setTemplates(r.templates); setShopChannels(r.shop_channels); } catch { /* ใช้ค่าว่าง */ }
  }, [d?.brand_id]);
  useEffect(() => { if (d) loadTemplates(); }, [d, loadTemplates]);

  const setCap = (platform: string, patch: Partial<ContentCaption>) => setCaps((cs) => cs.map((c) => c.platform === platform ? { ...c, ...patch } : c));

  // เลือก Parent SKU → ดึงสีของ SKU ลูกทั้งหมดมารวม
  useEffect(() => { if (!parent?.id) { setParentColors([]); return; } let live = true; getParentSkuColors(parent.id).then((cs) => { if (live) setParentColors(cs); }).catch(() => {}); return () => { live = false; }; }, [parent?.id]);

  // ราคาเต็ม = ราคา SKU ที่เลือก · ราคาขาย = ราคา − ส่วนลด · สี = SKU เดี่ยว หรือ รวมสีลูกของ Parent
  const fakePrice = sku?.list_price ?? null;
  const realPrice = computeRealPrice(fakePrice, discountValue === "" ? null : Number(discountValue), discountPct);
  const colorText = parentColors.length ? parentColors.join(", ") : (sku?.color ?? null);
  // ตัวแปรสินค้าที่ใช้ร่วมทุก caption (ไม่รวม caption/hashtags ที่ต่างกันต่อแพลตฟอร์ม)
  const sharedVars = useMemo(() => ({
    shop: shopChannels, fake_price: fakePrice, real_price: realPrice,
    price: fakePrice, color: colorText, sku: sku?.code ?? null, product: sku?.name ?? d?.product_name ?? null,
  }), [shopChannels, fakePrice, realPrice, colorText, sku?.code, sku?.name, d?.product_name]);

  const save = async () => {
    setSaving(true);
    try {
      await updateContent(contentId, {
        status, scheduled_at: scheduledAt || null, published_url: publishedUrl.trim() || null,
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

  if (!d) return (<><div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} /><div className="fixed right-0 top-0 h-full w-[640px] max-w-[97vw] bg-white shadow-2xl z-50 flex items-center justify-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div></>);

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[640px] max-w-[97vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0"><h3 className="text-base font-semibold text-slate-900 truncate">{d.title}</h3><span className="font-mono text-xs text-slate-500">{d.content_no}</span></div>
          <div className="flex items-center gap-1">
            {onDelete && <button onClick={() => onDelete(d)} className="h-8 px-2 text-xs text-red-500 hover:bg-red-50 rounded-md">{t("ลบ", "Delete")}</button>}
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* status + schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-400">{t("สถานะ", "Status")}</label><ERPSelect value={status} options={Object.entries(CONTENT_STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))} onChange={(e) => setStatus(e.target.value as ContentStatus)} /></div>
            <div><label className="text-xs text-slate-400">{t("ตั้งเวลาโพสต์", "Schedule Post")}</label><ERPInput type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
          </div>
          {/* สินค้า: SKU เดี่ยว + Parent SKU + สีที่มี */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t("สินค้า", "Product")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-400">SKU ({t("สีเดี่ยว", "single color")})</label><SkuPicker value={sku} onChange={setSku} /></div>
              <div><label className="text-xs text-slate-400">Parent SKU ({t("ทุกสี", "all colors")})</label><ParentSkuPicker value={parent} onChange={setParent} /></div>
            </div>
            <div className="mt-2">
              <label className="text-xs text-slate-400">{t("สีที่มี", "Available Colors")} ({"{color}"})</label>
              <div className="min-h-9 px-3 py-1.5 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg">{colorText || <span className="text-slate-400">{t("— เลือก SKU (ได้สีเดียว) หรือ Parent SKU (รวมทุกสีลูก)", "— Select SKU (single color) or Parent SKU (all child colors)")}</span>}</div>
            </div>
          </div>

          {/* ราคา / ส่วนลด — ใช้กับตัวแปร {fake_price}/{real_price} */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t("ราคา / ส่วนลด", "Price / Discount")}</p>
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
          </div>

          {/* captions per platform */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t("Caption แยกตามแพลตฟอร์ม", "Caption per Platform")}</p>
              <button onClick={() => setTplSettingsOpen(true)} className="text-xs text-violet-700 hover:underline">⚙️ {t("จัดการแม่แบบ", "Manage Templates")}</button>
            </div>
            {caps.length === 0 ? <p className="text-sm text-slate-400 italic">{t("ยังไม่ได้เลือกแพลตฟอร์ม (แก้ที่ตอนสร้าง)", "No platforms selected (edit at creation time)")}</p> : (
              <div className="space-y-3">
                {caps.map((c) => <CaptionCard key={c.platform} cap={c} templates={templates} sharedVars={sharedVars} brandId={d.brand_id} onChange={(patch) => setCap(c.platform, patch)} pushToast={pushToast} />)}
              </div>
            )}
          </div>

          {/* product links */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t("ลิงก์สินค้า (Shopee/Lazada/Website)", "Product Links (Shopee/Lazada/Website)")}</p>
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
          </div>

          {/* published url */}
          {(status === "published") && <div><label className="text-xs text-slate-400">{t("ลิงก์โพสต์ที่เผยแพร่", "Published Post URL")}</label><ERPInput value={publishedUrl} onChange={(e) => setPublishedUrl(e.target.value)} placeholder="https://..." /></div>}
        </div>

        <div className="border-t border-slate-200 px-6 py-4 shrink-0 flex items-center gap-2">
          {!d.is_template && <button onClick={saveAsTemplate} className="h-9 px-3 text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 mr-auto">💾 {t("บันทึกเป็นเทมเพลต", "Save as Template")}</button>}
          <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
          <button onClick={save} disabled={saving} className="h-9 px-5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button>
        </div>
      </div>

      {tplSettingsOpen && <CaptionTemplateSettings brandId={d.brand_id} brandLabel={d.brand_label} onClose={() => setTplSettingsOpen(false)} onSaved={() => { setTplSettingsOpen(false); loadTemplates(); }} pushToast={pushToast} />}
    </>
  );
}

type SharedVars = { shop: ShopChannel[]; fake_price: number | null; real_price: number | null; price: number | null; color: string | null; sku: string | null; product: string | null };

// caption ต่อ 1 แพลตฟอร์ม: เลือกแม่แบบ + พิมพ์ข้อความล้วน + preview ที่ประกอบเสร็จ (คัดลอกได้)
function CaptionCard({ cap, templates, sharedVars, brandId, onChange, pushToast }: { cap: ContentCaption; templates: CaptionTemplate[]; sharedVars: SharedVars; brandId: string | null; onChange: (p: Partial<ContentCaption>) => void; pushToast: (type: Toast["type"], m: string) => void }) {
  const t = useT();
  const [showTags, setShowTags] = useState(false);
  const [tags, setTags] = useState<Hashtag[]>([]);
  const [newTag, setNewTag] = useState("");
  const [loadingTags, setLoadingTags] = useState(false);

  const loadTags = useCallback(async () => {
    setLoadingTags(true);
    try { setTags(await listHashtags({ brand_id: brandId || undefined, platform: cap.platform })); } catch { /* ignore */ }
    finally { setLoadingTags(false); }
  }, [brandId, cap.platform]);
  useEffect(() => { if (showTags) loadTags(); }, [showTags, loadTags]);

  const appendTag = (text: string) => { const cur = cap.hashtags ?? ""; if (cur.includes(text)) return; onChange({ hashtags: (cur ? cur + " " : "") + text }); };
  const addNew = async () => {
    const t = newTag.trim(); if (!t) return;
    try { const h = await createHashtag({ text: t, brand_id: brandId || null, platform: cap.platform }); setNewTag(""); appendTag(h.text); await loadTags(); }
    catch (e) { pushToast("error", (e as Error).message); }
  };

  const typeKey = cap.caption_type ?? templates[0]?.key ?? "short";
  const tpl = templates.find((t) => t.key === typeKey) ?? templates[0];
  // ประกอบ preview จากแม่แบบ + ตัวแปร (ถ้าไม่มีแม่แบบ → caption + hashtags ตรงๆ)
  const preview = tpl ? renderCaption(tpl.body, { caption: cap.caption, hashtags: cap.hashtags, ...sharedVars }) : `${cap.caption ?? ""}\n\n${cap.hashtags ?? ""}`.trim();
  const copy = async () => { try { await navigator.clipboard.writeText(preview); pushToast("success", t(`คัดลอก ${platformLabel(cap.platform)} แล้ว`, `Copied ${platformLabel(cap.platform)}`)); } catch { pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")); } };

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">{platformLabel(cap.platform)}</span>
        <button onClick={copy} className="text-xs text-violet-700 hover:underline">📋 {t("คัดลอกผลลัพธ์", "Copy Result")}</button>
      </div>
      {/* เลือกแม่แบบ */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {templates.map((tp) => { const on = typeKey === tp.key; return (
          <button key={tp.key} onClick={() => onChange({ caption_type: tp.key })} className={`px-2.5 py-0.5 rounded-full text-xs border ${on ? "bg-violet-600 text-white border-violet-600" : "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"}`}>{tp.label}</button>
        ); })}
        {templates.length === 0 && <span className="text-xs text-slate-400">{t("ยังไม่มีแม่แบบ — กด ⚙️ จัดการแม่แบบ", "No templates yet — click ⚙️ Manage Templates")}</span>}
      </div>
      <ERPTextarea value={cap.caption ?? ""} rows={3} onChange={(e) => onChange({ caption: e.target.value })} placeholder={t(`เขียน caption สำหรับ ${platformLabel(cap.platform)}...`, `Write caption for ${platformLabel(cap.platform)}...`)} />
      <div className="mt-2">
        <ERPInput value={cap.hashtags ?? ""} onChange={(e) => onChange({ hashtags: e.target.value })} placeholder={t("#hashtag คั่นด้วยเว้นวรรค", "#hashtag separated by space")} />
        <button onClick={() => setShowTags((s) => !s)} className="text-xs text-violet-700 hover:underline mt-1">{showTags ? t("ซ่อนคลัง hashtag", "Hide Hashtag Library") : t("＋ เลือกจากคลัง hashtag", "＋ Select from Hashtag Library")}</button>
        {showTags && (
          <div className="mt-2 bg-slate-50 rounded-lg p-2">
            <div className="flex gap-1.5 mb-2">
              <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNew()} placeholder={t("เพิ่ม hashtag ใหม่เข้าคลัง", "Add new hashtag to library")} className="flex-1 h-8 border border-slate-200 rounded-md px-2 text-sm" />
              <button onClick={addNew} className="h-8 px-3 text-xs font-medium text-violet-700 border border-violet-200 rounded-md hover:bg-violet-50">{t("เพิ่ม", "Add")}</button>
            </div>
            {loadingTags ? <p className="text-xs text-slate-400">{t("กำลังโหลด...", "Loading...")}</p> : tags.length === 0 ? <p className="text-xs text-slate-400">{t("ยังไม่มี hashtag ในคลัง (พิมพ์เพิ่มด้านบน)", "No hashtags in library yet (type above to add)")}</p> : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((h) => <button key={h.id} onClick={() => appendTag(h.text)} className="text-xs bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-600 hover:border-violet-300 hover:text-violet-700" title={t(`ใช้ ${h.usage_count} ครั้ง`, `Used ${h.usage_count} times`)}>{h.text}</button>)}
              </div>
            )}
          </div>
        )}
      </div>
      {/* preview ผลลัพธ์ที่จะคัดลอก */}
      <div className="mt-2">
        <p className="text-[11px] text-slate-400 mb-1">{t("ตัวอย่างที่จะโพสต์ (ประกอบจากแม่แบบ)", "Preview (assembled from template)")}</p>
        <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2.5 whitespace-pre-wrap font-sans leading-relaxed">{preview || "—"}</pre>
      </div>
    </div>
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
