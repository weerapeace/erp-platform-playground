"use client";
// ป๊อปตั้งค่าของคอนเทนต์: คลังแฮชแท็ก · เวลาโพสต์แนะนำ · ตั้งค่าแพลตฟอร์ม · แม่แบบแคปชัน · ตั้งค่าแคปชัน (แยกจาก content.tsx — Y1)
import { useCallback, useEffect, useState } from "react";
import { renderCaption, CAPTION_VARS, type ShopChannel } from "@/lib/caption-template";
import { ERPModal } from "@/components/modal";
import { ERPInput, ERPTextarea } from "@/components/form";
import { listHashtags, createHashtag, updateHashtag, deleteHashtag, getCaptionTemplates, saveCaptionTemplates, saveRecommendedTimes, type RecommendedTimes, savePlatformSettings, saveCaptionConfig, type Hashtag, type CaptionTemplate, type CaptionConfig, type PlatformSettings, type PlatformSetting } from "../data";
import { useT } from "@/components/i18n";
import { askConfirm } from "@/components/modal/ask-dialog";
import { type ToastVariant } from "@/components/toast";

// ตั้งค่าต่อแพลตฟอร์ม (ค่ากลาง): แม่แบบเริ่มต้น / ปิดแคปชั่น-แฮชแท็ก / ลิงก์ไปโพสต์ / โน้ตบอกคนทำงาน
// โมดอลจัดการ "คลังแฮชแท็ก" — ดู/เพิ่ม/แก้ (กดที่ข้อความ)/ลบ/ค้นหา · แฮชแท็กในคลังจะขึ้น typeahead ในช่อง #hashtag
export function HashtagLibraryModal({ brandId, onClose, pushToast }: { brandId: string | null; onClose: () => void; pushToast: (type: ToastVariant, m: string) => void }) {
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
  const remove = async (h: Hashtag) => { if (!(await askConfirm({ title: `${t("ลบ", "Delete")} ${h.text}?`, variant: "danger" }))) return; try { await deleteHashtag(h.id); await load(); } catch (e) { pushToast("error", (e as Error).message); } };
  // ✏️ กดที่ข้อความเพื่อแก้ (พิมพ์ผิด) — Enter = บันทึก · Esc = ยกเลิก
  const [ed, setEd] = useState<{ id: string; text: string } | null>(null);
  const saveEd = async () => {
    if (!ed) return;
    const raw = ed.text.trim().replace(/^#/, ""); if (!raw) { setEd(null); return; }
    setBusy(true);
    try { await updateHashtag(ed.id, "#" + raw); setEd(null); await load(); pushToast("success", t("แก้แฮชแท็กแล้ว", "Hashtag updated")); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };
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
              {tags.map((h) => ed?.id === h.id ? (
                <span key={h.id} className="inline-flex items-center gap-1 text-xs bg-violet-50 border border-violet-300 rounded-full pl-2 pr-1 py-0.5">
                  <input value={ed.text} autoFocus disabled={busy} onChange={(e) => setEd({ ...ed, text: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") void saveEd(); if (e.key === "Escape") setEd(null); }}
                    className="w-36 h-6 px-1 text-xs bg-white border border-violet-200 rounded focus:outline-none" />
                  <button onClick={() => void saveEd()} disabled={busy} title={t("บันทึก", "Save")} className="text-violet-600 hover:text-violet-800 w-5 h-5 flex items-center justify-center">✓</button>
                  <button onClick={() => setEd(null)} disabled={busy} title={t("ยกเลิก", "Cancel")} className="text-slate-400 hover:text-slate-600 w-5 h-5 flex items-center justify-center">✕</button>
                </span>
              ) : (
                <span key={h.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 rounded-full pl-2.5 pr-1 py-1">
                  <button type="button" onClick={() => setEd({ id: h.id, text: h.text })} title={t("กดเพื่อแก้ข้อความ", "Click to edit")} className="hover:text-violet-700 hover:underline decoration-dotted">{h.text}</button><span className="text-[10px] text-slate-400">·{h.usage_count}</span>
                  <button onClick={() => remove(h)} title={t("ลบ", "Delete")} className="text-slate-300 hover:text-red-500 w-4 h-4 flex items-center justify-center">✕</button>
                </span>
              ))}
            </div>
          )}
        <p className="text-[11px] text-slate-400">{t("แฮชแท็กในคลังจะขึ้นให้เลือกอัตโนมัติเมื่อพิมพ์ในช่อง #hashtag ของแต่ละแพลตฟอร์ม · กดที่ข้อความเพื่อแก้", "Library hashtags autocomplete in each platform's #hashtag field · click a tag to edit")}</p>
        <div className="flex justify-end"><button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button></div>
      </div>
    </ERPModal>
  );
}

// โมดอลตั้ง "เวลาแนะนำการโพสต์" ต่อวัน (จันทร์-อาทิตย์) — เก็บค่ากลาง ใช้เตือนตอนเลือกวันโพสต์
export function RecommendedTimesModal({ initial, onClose, onSaved, pushToast }: { initial: RecommendedTimes; onClose: () => void; onSaved: (v: RecommendedTimes) => void; pushToast: (type: ToastVariant, m: string) => void }) {
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

export function PlatformSettingsModal({ platforms, templates, settings, onClose, onSaved, pushToast }: { platforms: { value: string; label: string }[]; templates: CaptionTemplate[]; settings: PlatformSettings; onClose: () => void; onSaved: (v: PlatformSettings) => void; pushToast: (type: ToastVariant, m: string) => void }) {
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
            <label className="text-xs text-slate-500 block mt-2">💡 {t("คำแนะนำ/ข้อควรระวัง — โชว์เป็นปุ่ม ⓘ บนการ์ดแพลตฟอร์ม (เอาเมาส์ชี้)", "Tips — shown as ⓘ on the platform card (hover)")}
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
export function CaptionTemplateSettings({ brandId, brandLabel, onClose, onSaved, pushToast }: { brandId: string | null; brandLabel: string | null; onClose: () => void; onSaved: () => void; pushToast: (type: ToastVariant, m: string) => void }) {
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
  const removeActive = async () => { if (!active || !(await askConfirm({ title: t(`ลบแม่แบบ "${active.label}" ?`, `Delete template "${active.label}"?`), variant: "danger" }))) return; setTemplates((ts) => ts.filter((_, i) => i !== activeIdx)); setActiveIdx(0); };

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
export function CaptionConfigModal({ cfg, brandId, brandLabel, platforms, onClose, onSaved, pushToast }: { cfg: CaptionConfig; brandId: string | null; brandLabel: string | null; platforms: { value: string; label: string }[]; onClose: () => void; onSaved: (v: CaptionConfig) => void; pushToast: (type: ToastVariant, m: string) => void }) {
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
