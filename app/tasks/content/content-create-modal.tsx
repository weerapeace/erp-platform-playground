"use client";

// ============================================================
// ContentCreateModal (ของกลาง) — ป๊อปอัปสร้างคอนเทนต์ใหม่
// ใช้ทั้งหน้า /tasks/content และ /tasks/content-calendar (คลิกวันในปฏิทิน)
// รองรับ prefill: แบรนด์ (จากแท็บ) + วันตั้งโพสต์ (จากช่องวันที่คลิก)
// ============================================================

import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { useT } from "@/components/i18n";
import { useCreativeOptions } from "../use-options";
import {
  createContent, getContent, CONTENT_STATUS_META, POST_TYPES, contentStatusLabel, postTypeLabel,
  type ContentItem, type ContentCaption, type ContentStatus, type BrandOption,
} from "../data";

type CampaignOpt = { id: string; name: string };
type Form = { title: string; post_type: string; status: ContentStatus; brand_id: string; campaign_id: string; scheduled_at: string; product: SkuPickerValue | null; platforms: string[]; note: string };
const emptyForm = (): Form => ({ title: "", post_type: "image", status: "draft", brand_id: "", campaign_id: "", scheduled_at: "", product: null, platforms: [], note: "" });

export function ContentCreateModal({ open, onClose, onCreated, brands, campaigns, templates, defaultBrandId, defaultDate, pushToast }: {
  open: boolean;
  onClose: () => void;
  onCreated: (r: { id: string; content_no: string }) => void;
  brands: BrandOption[];
  campaigns: CampaignOpt[];
  templates: ContentItem[];
  defaultBrandId?: string | null;   // เติมแบรนด์ให้ (เช่น แท็บแบรนด์ที่เลือกในปฏิทิน)
  defaultDate?: string | null;       // เติมวันตั้งโพสต์ให้ (YYYY-MM-DDTHH:mm) — เช่น คลิกช่องวัน
  pushToast: (type: "success" | "error" | "info", m: string) => void;
}) {
  const t = useT();
  const { platforms } = useCreativeOptions();
  const [form, setForm] = useState<Form>(emptyForm());
  const [tplId, setTplId] = useState("");
  const [tplCaptions, setTplCaptions] = useState<ContentCaption[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  // เปิดใหม่ทุกครั้ง → รีเซ็ตฟอร์ม + เติมค่า default (แบรนด์จากแท็บ / วันจากช่องที่คลิก)
  useEffect(() => {
    if (!open) return;
    setForm({ ...emptyForm(), brand_id: defaultBrandId ?? "", scheduled_at: defaultDate ?? "" });
    setTplId(""); setTplCaptions([]); setDirty(false); setFormErr(null);
  }, [open, defaultBrandId, defaultDate]);

  const upd = (patch: Partial<Form>) => { setForm((p) => ({ ...p, ...patch })); setDirty(true); };
  const togglePlatform = (v: string) => upd({ platforms: form.platforms.includes(v) ? form.platforms.filter((x) => x !== v) : [...form.platforms, v] });
  const applyTemplate = async (tid: string) => {
    setTplId(tid);
    if (!tid) { setTplCaptions([]); return; }
    try { const d = await getContent(tid); upd({ post_type: d.post_type ?? "image", platforms: d.platforms ?? [], brand_id: d.brand_id ?? form.brand_id ?? "", note: d.note ?? "" }); setTplCaptions(d.captions ?? []); }
    catch (e) { pushToast("error", (e as Error).message); }
  };

  const save = async () => {
    if (!form.title.trim()) { setFormErr(t("กรุณาใส่ชื่อคอนเทนต์", "Please enter a content title")); return; }
    setSaving(true); setFormErr(null);
    try {
      const r = await createContent({
        title: form.title.trim(), campaign_id: form.campaign_id || null, brand_id: form.brand_id || null,
        sku_id: form.product?.id ?? null, product_name: form.product?.name ?? null, post_type: form.post_type || null,
        platforms: form.platforms, status: form.status, scheduled_at: form.scheduled_at || null, note: form.note.trim() || null,
        captions: tplCaptions.length ? form.platforms.map((p) => { const c = tplCaptions.find((x) => x.platform === p); return { platform: p, caption: c?.caption ?? null, hashtags: c?.hashtags ?? null, caption_type: c?.caption_type ?? "short" }; }) : undefined,
      });
      setDirty(false);
      pushToast("success", t(`สร้างคอนเทนต์ ${r.content_no} แล้ว`, `Content ${r.content_no} created`));
      onCreated(r);
    } catch (e) { setFormErr((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} title={t("สร้างคอนเทนต์ใหม่", "Create New Content")} size="lg" hasUnsavedChanges={dirty}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("สร้าง", "Create")}</button>
      </>}>
      {formErr && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {formErr}</div>}
      {templates.length > 0 && (
        <div className="mb-4 flex items-center gap-2 bg-violet-50/60 border border-violet-100 rounded-lg px-3 py-2">
          <span className="text-sm text-slate-600 shrink-0">📋 {t("เริ่มจากเทมเพลต:", "Start from template:")}</span>
          <select value={tplId} onChange={(e) => applyTemplate(e.target.value)} className="flex-1 h-8 border border-slate-200 rounded-md px-2 text-sm bg-white">
            <option value="">{t("— ไม่ใช้เทมเพลต —", "— No template —")}</option>
            {templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.title}</option>)}
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
  );
}
