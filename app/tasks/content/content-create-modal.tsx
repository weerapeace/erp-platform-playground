"use client";

// ============================================================
// ContentCreateModal (ของกลาง) — ป๊อปอัปสร้างคอนเทนต์ใหม่
// ใช้ทั้งหน้า /tasks/content และ /tasks/content-calendar (คลิกวันในปฏิทิน)
// รองรับ prefill: แบรนด์ (จากแท็บ) + วันตั้งโพสต์ (จากช่องวันที่คลิก)
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { useT } from "@/components/i18n";
import { useCreativeOptions } from "../use-options";
import { BrandPlatformsModal, getBrandPlatforms, type BrandPlatformMap } from "./brand-platforms-modal";
import {
  createContent, getContent, getRecommendedTimes, CONTENT_STATUS_META, POST_TYPES, contentStatusLabel, postTypeLabel,
  type ContentItem, type ContentCaption, type ContentStatus, type BrandOption, type RecommendedTimes,
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
  const [bpMap, setBpMap] = useState<BrandPlatformMap>({});      // แบรนด์ไหนลงแพลตฟอร์มไหน (ตั้งค่าไว้ล่วงหน้า)
  const [bpOpen, setBpOpen] = useState(false);
  const [recTimes, setRecTimes] = useState<RecommendedTimes>({});   // เวลาแนะนำการโพสต์ต่อวัน (จันทร์-อาทิตย์)
  const recRef = useRef<RecommendedTimes>({});
  useEffect(() => { getRecommendedTimes().then((r) => { setRecTimes(r); recRef.current = r; }).catch(() => {}); }, []);
  useEffect(() => { getBrandPlatforms().then(setBpMap).catch(() => {}); }, []);

  // เปิดใหม่ทุกครั้ง → รีเซ็ตฟอร์ม + เติมค่า default (แบรนด์จากแท็บ / วันจากช่องที่คลิก + เวลาแนะนำ)
  useEffect(() => {
    if (!open) return;
    let sched = defaultDate ?? "";
    if (sched && !sched.includes("T")) {   // ส่งมาเป็นวันล้วน → เติมเวลาแนะนำของวันนั้นให้ (ไม่มีก็ 10:00)
      const day = new Date(`${sched}T00:00:00`).getDay();
      const rec = (recRef.current[String(day)] ?? [])[0]?.time;
      sched = `${sched}T${rec || "10:00"}`;
    }
    setForm({ ...emptyForm(), brand_id: defaultBrandId ?? "", scheduled_at: sched });
    setTplId(""); setTplCaptions([]); setDirty(false); setFormErr(null);
  }, [open, defaultBrandId, defaultDate]);

  const upd = (patch: Partial<Form>) => { setForm((p) => ({ ...p, ...patch })); setDirty(true); };
  const togglePlatform = (v: string) => upd({ platforms: form.platforms.includes(v) ? form.platforms.filter((x) => x !== v) : [...form.platforms, v] });
  // เลือกแบรนด์ → ติ๊กแพลตฟอร์มตามที่ตั้งไว้ของแบรนด์นั้น (ยังไม่ตั้ง = ไม่ยุ่ง) · ถ้าติ๊กไว้แล้ว = ตัดตัวที่แบรนด์นี้ไม่ลงออก
  const pickBrand = (brandId: string) => {
    const allow = bpMap[brandId];
    if (!allow) { upd({ brand_id: brandId }); return; }
    const kept = form.platforms.filter((p) => allow.includes(p));
    upd({ brand_id: brandId, platforms: kept.length ? kept : [...allow] });
  };
  // แพลตฟอร์มที่แบรนด์นี้ตั้งไว้ว่า "ไม่ลง" — ยังกดเลือกได้ แต่ขึ้นสีจางบอกให้รู้
  const brandSkips = (p: string) => !!form.brand_id && Array.isArray(bpMap[form.brand_id]) && !bpMap[form.brand_id].includes(p);
  // เวลาแนะนำของวันที่เลือกโพสต์ (ปุ่มกดใช้ได้ทันที) — เหมือนใน drawer
  const schedRec = useMemo(() => {
    const dpart = form.scheduled_at.slice(0, 10);
    if (dpart.length < 10) return null;
    const day = new Date(`${dpart}T00:00:00`).getDay();
    const cur = form.scheduled_at.slice(11, 16);
    const items = (recTimes[String(day)] ?? []).filter((it) => it.time && it.time !== cur);
    if (!items.length) return null;
    const labels = [t("อา.", "Sun"), t("จ.", "Mon"), t("อ.", "Tue"), t("พ.", "Wed"), t("พฤ.", "Thu"), t("ศ.", "Fri"), t("ส.", "Sat")];
    return { items, label: labels[day] };
  }, [form.scheduled_at, recTimes, t]);
  const applyRecTime = (tm: string) => { const d = form.scheduled_at.slice(0, 10) || new Date().toISOString().slice(0, 10); upd({ scheduled_at: `${d}T${tm}` }); };
  const applyTemplate = async (tid: string) => {
    setTplId(tid);
    if (!tid) { setTplCaptions([]); return; }
    try { const d = await getContent(tid); const bid = d.brand_id ?? form.brand_id ?? ""; const allow = bpMap[bid]; const tplPlats = d.platforms ?? [];
           upd({ post_type: d.post_type ?? "image", platforms: allow ? tplPlats.filter((x: string) => allow.includes(x)) : tplPlats, brand_id: bid, note: d.note ?? "" }); setTplCaptions(d.captions ?? []); }
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
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm text-slate-600">📋 {t("เริ่มจากเทมเพลต:", "Start from template:")}</span>
            <a href="/tasks/content?view=templates" className="text-xs text-violet-600 hover:underline">⚙️ {t("จัดการ/ตั้งไอคอนแม่แบบ", "Manage templates")}</a>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button type="button" onClick={() => applyTemplate("")}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left ${tplId === "" ? "border-violet-400 bg-violet-50 ring-1 ring-violet-300" : "border-slate-200 hover:border-violet-300"}`}>
              <span className="text-lg shrink-0">🚫</span>
              <span className="truncate text-slate-500">{t("ไม่ใช้เทมเพลต", "No template")}</span>
            </button>
            {templates.map((tp) => (
              <button key={tp.id} type="button" onClick={() => applyTemplate(tp.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left ${tplId === tp.id ? "border-violet-400 bg-violet-50 ring-1 ring-violet-300" : "border-slate-200 hover:border-violet-300"}`}>
                <span className="text-lg shrink-0">{tp.template_icon || "🧩"}</span>
                <span className="truncate font-medium text-slate-700">{tp.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <ERPFormSection title={t("ข้อมูลคอนเทนต์", "Content Details")} columns={2}>
        <ERPFormField label={t("ชื่อคอนเทนต์", "Content Title")} required span={2}><ERPInput value={form.title} onChange={(e) => upd({ title: e.target.value })} placeholder={t("เช่น โปรโมต Heart Bag สีชมพู 7.7", "e.g. Promote Heart Bag Pink 7.7")} /></ERPFormField>
        <ERPFormField label={t("ประเภทโพสต์", "Post Type")}><ERPSelect value={form.post_type} options={POST_TYPES.map((p) => ({ value: p.value, label: postTypeLabel(p.value) }))} onChange={(e) => upd({ post_type: e.target.value })} /></ERPFormField>
        <ERPFormField label={t("สถานะ", "Status")}><ERPSelect value={form.status} options={Object.keys(CONTENT_STATUS_META).map((v) => ({ value: v, label: contentStatusLabel(v as ContentStatus) }))} onChange={(e) => upd({ status: e.target.value as ContentStatus })} /></ERPFormField>
        <ERPFormField label={t("แบรนด์", "Brand")}><ERPSelect value={form.brand_id} options={[{ value: "", label: t("— ไม่ระบุ —", "— None —") }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => pickBrand(e.target.value)} /></ERPFormField>
        <ERPFormField label="Campaign"><ERPSelect value={form.campaign_id} options={[{ value: "", label: t("— ไม่ระบุ —", "— None —") }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => upd({ campaign_id: e.target.value })} /></ERPFormField>
        <ERPFormField label={t("ตั้งเวลาโพสต์", "Schedule Post")}>
          <ERPInput type="datetime-local" value={form.scheduled_at} onChange={(e) => upd({ scheduled_at: e.target.value })} />
          {schedRec && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-violet-400">💡 {t("เวลาแนะนำ", "Suggested")} ({schedRec.label}):</span>
              {schedRec.items.map((it) => (
                <button key={it.time} type="button" onClick={() => applyRecTime(it.time)} title={it.note || t("เวลาแนะนำ", "Suggested time")} className="inline-flex items-center gap-0.5 text-[11px] text-violet-700 bg-white border border-violet-200 rounded-full px-2.5 py-1 hover:bg-violet-100">{it.time}{it.note ? <span className="text-violet-300">ⓘ</span> : null}</button>
              ))}
            </div>
          )}
        </ERPFormField>
        <ERPFormField label={t("สินค้า/SKU (ถ้ามี)", "Product/SKU (if any)")}><SkuPicker value={form.product} onChange={(v) => upd({ product: v })} /></ERPFormField>
        <ERPFormField label={t("แพลตฟอร์ม", "Platforms")} span={2}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[11px] text-slate-400">
              {form.brand_id && Array.isArray(bpMap[form.brand_id])
                ? t(`ติ๊กตามที่ตั้งไว้ของแบรนด์นี้ (${bpMap[form.brand_id].length} แพลตฟอร์ม) — แก้ได้`, `Auto-selected from this brand (${bpMap[form.brand_id].length}) — editable`)
                : t("แบรนด์นี้ยังไม่ได้ตั้งว่าลงที่ไหน", "No default platforms for this brand yet")}
            </span>
            <button type="button" onClick={() => setBpOpen(true)} className="text-[11px] font-medium text-violet-700 hover:underline shrink-0">⚙️ {t("ตั้งค่าต่อแบรนด์", "Set per brand")}</button>
          </div>
          <div className="flex flex-wrap gap-1.5">{platforms.map((p) => { const onSel = form.platforms.includes(p.value); const skip = brandSkips(p.value); return (
            <button key={p.value} type="button" onClick={() => togglePlatform(p.value)} title={skip ? t("แบรนด์นี้ตั้งไว้ว่าไม่ลงที่นี่", "This brand skips this platform") : undefined}
              className={`px-2.5 py-1 rounded-full text-xs border ${onSel ? "bg-violet-600 text-white border-violet-600" : skip ? "bg-rose-50 text-rose-400 border-rose-200" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>{p.label}</button>
          ); })}</div>
        </ERPFormField>
        <ERPFormField label={t("โน้ต/บรีฟ", "Note/Brief")} span={2}><ERPTextarea value={form.note} rows={2} onChange={(e) => upd({ note: e.target.value })} /></ERPFormField>
      </ERPFormSection>
      {bpOpen && <BrandPlatformsModal brands={brands} initial={bpMap} onClose={() => setBpOpen(false)} onSaved={(m) => { setBpMap(m); setBpOpen(false); if (form.brand_id && m[form.brand_id]) upd({ platforms: [...m[form.brand_id]] }); }} pushToast={pushToast} />}
    </ERPModal>
  );
}
