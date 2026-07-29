"use client";

// ตั้งค่า "แบรนด์นี้ลงแพลตฟอร์มไหน" — ใช้ตอนสร้างคอนเทนต์ (ติ๊กแพลตฟอร์มให้อัตโนมัติตามแบรนด์)
// ไม่ได้ตั้ง = ลงได้ทุกแพลตฟอร์ม (ไม่บังคับ) · ตั้งแล้วคอนเทนต์ใหม่ของแบรนด์นั้นจะติ๊กเฉพาะที่เลือกไว้
// เก็บที่ ui_config(key='creative_brand_platforms') ผ่าน /api/creative-brand-platforms

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { useCreativeOptions } from "../use-options";

export type BrandPlatformMap = Record<string, string[]>;
export type BrandFormatMap = Record<string, Record<string, string>>;   // brand → platform → รูปแบบโพสต์

// รูปแบบที่แต่ละแพลตฟอร์มมีให้เลือก (ต้องตรงกับ POST_FORMATS ในหน้าคอนเทนต์)
export const FORMATS: Record<string, { key: string; th: string; en: string }[]> = {
  instagram: [{ key: "single", th: "รูปเดียว", en: "Single" }, { key: "carousel", th: "อัลบั้ม", en: "Carousel" }, { key: "reels", th: "Reels", en: "Reels" }, { key: "story", th: "Story", en: "Story" }],
  facebook: [{ key: "single", th: "รูปเดียว", en: "Single" }, { key: "carousel", th: "อัลบั้ม", en: "Album" }, { key: "video", th: "วิดีโอ", en: "Video" }, { key: "story", th: "Story", en: "Story" }],
  tiktok: [{ key: "video", th: "วิดีโอ", en: "Video" }, { key: "carousel", th: "โพสต์รูป", en: "Photo" }],
  youtube: [{ key: "video", th: "วิดีโอ", en: "Video" }, { key: "reels", th: "Shorts", en: "Shorts" }],
};

export async function getBrandPlatforms(): Promise<{ map: BrandPlatformMap; formats: BrandFormatMap }> {
  try {
    const j = await apiFetch("/api/creative-brand-platforms").then((r) => r.json());
    return { map: (j.map ?? {}) as BrandPlatformMap, formats: (j.formats ?? {}) as BrandFormatMap };
  } catch { return { map: {}, formats: {} }; }
}

export function BrandPlatformsModal({ brands, initial, initialFormats, onClose, onSaved, pushToast }: {
  brands: { id: string; name: string }[];
  initial?: BrandPlatformMap;
  initialFormats?: BrandFormatMap;
  onClose: () => void;
  onSaved: (map: BrandPlatformMap, formats: BrandFormatMap) => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
}) {
  const t = useT();
  const { platforms } = useCreativeOptions();
  const [map, setMap] = useState<BrandPlatformMap>(initial ?? {});
  const [fmt, setFmt] = useState<BrandFormatMap>(initialFormats ?? {});
  const [loading, setLoading] = useState(!initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) return;
    (async () => { const r = await getBrandPlatforms(); setMap(r.map); setFmt(r.formats); setLoading(false); })();
  }, [initial]);

  const isSet = (bid: string) => Array.isArray(map[bid]);
  const on = (bid: string, p: string) => !isSet(bid) || map[bid].includes(p);
  const toggle = (bid: string, p: string) => setMap((m) => {
    const cur = Array.isArray(m[bid]) ? m[bid] : platforms.map((x) => x.value);   // ยังไม่ตั้ง = ถือว่าเลือกไว้ทุกอัน
    const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
    return { ...m, [bid]: next };
  });
  const reset = (bid: string) => setMap((m) => { const n = { ...m }; delete n[bid]; return n; });

  const save = async () => {
    setSaving(true);
    try {
      const j = await apiFetch("/api/creative-brand-platforms", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ map, formats: fmt }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      pushToast("success", t("บันทึกแพลตฟอร์มต่อแบรนด์แล้ว", "Saved brand platforms"));
      onSaved(map, fmt);
    } catch (e) { pushToast("error", (e as Error).message); } finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="lg" title={t("🏷️ แบรนด์นี้ลงแพลตฟอร์มไหน", "Platforms per brand")}
      description={t("ตั้งครั้งเดียว — สร้างคอนเทนต์ครั้งต่อไป เลือกแบรนด์แล้วระบบติ๊กให้อัตโนมัติ (ยังแก้รายใบได้)", "Set once — new content auto-selects these platforms per brand (still editable per item)")}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={save} disabled={saving || loading} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? "..." : t("บันทึก", "Save")}</button>
        </div>}>
      {loading ? <p className="py-8 text-center text-sm text-slate-400">{t("กำลังโหลด...", "Loading...")}</p> : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {brands.map((b) => (
            <div key={b.id} className="border border-slate-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-medium text-slate-800">{b.name}</span>
                {isSet(b.id)
                  ? <>
                      <span className="text-[11px] text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2">{t("ตั้งไว้", "Custom")} {map[b.id].length}/{platforms.length}</span>
                      <button onClick={() => reset(b.id)} className="ml-auto text-[11px] text-slate-400 hover:text-violet-700">{t("ล้างค่า (ลงทุกที่)", "Reset (all)")}</button>
                    </>
                  : <span className="text-[11px] text-slate-400">{t("ยังไม่ตั้ง = ลงได้ทุกแพลตฟอร์ม", "Not set = all platforms")}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {platforms.map((p) => {
                  const active = on(b.id, p.value);
                  return (
                    <button key={p.value} type="button" onClick={() => toggle(b.id, p.value)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${active
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-rose-50 text-rose-700 border-rose-200 line-through"}`}>{p.label}</button>
                  );
                })}
              </div>
              {/* รูปแบบโพสต์เริ่มต้นของแบรนด์นี้ — เฉพาะแพลตฟอร์มที่ลง + ที่มีตัวเลือก */}
              {platforms.some((p) => on(b.id, p.value) && (FORMATS[p.value] ?? []).length > 0) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 pt-1.5 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400">🎬 {t("ลงเป็น", "Post as")}</span>
                  {platforms.filter((p) => on(b.id, p.value) && (FORMATS[p.value] ?? []).length > 0).map((p) => (
                    <label key={p.value} className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                      {p.label}
                      <select value={fmt[b.id]?.[p.value] ?? ""} onChange={(e) => setFmt((m) => {
                        const cur = { ...(m[b.id] ?? {}) };
                        if (e.target.value) cur[p.value] = e.target.value; else delete cur[p.value];
                        return { ...m, [b.id]: cur };
                      })} className="h-6 text-[11px] border border-slate-200 rounded px-1 bg-white">
                        <option value="">{t("อัตโนมัติ", "Auto")}</option>
                        {(FORMATS[p.value] ?? []).map((f) => <option key={f.key} value={f.key}>{t(f.th, f.en)}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          {brands.length === 0 && <p className="py-8 text-center text-sm text-slate-400">{t("ยังไม่มีแบรนด์", "No brands yet")}</p>}
        </div>
      )}
    </ERPModal>
  );
}
