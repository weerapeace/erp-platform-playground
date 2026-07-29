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

export async function getBrandPlatforms(): Promise<BrandPlatformMap> {
  try {
    const j = await apiFetch("/api/creative-brand-platforms").then((r) => r.json());
    return (j.map ?? {}) as BrandPlatformMap;
  } catch { return {}; }
}

export function BrandPlatformsModal({ brands, initial, onClose, onSaved, pushToast }: {
  brands: { id: string; name: string }[];
  initial?: BrandPlatformMap;
  onClose: () => void;
  onSaved: (map: BrandPlatformMap) => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
}) {
  const t = useT();
  const { platforms } = useCreativeOptions();
  const [map, setMap] = useState<BrandPlatformMap>(initial ?? {});
  const [loading, setLoading] = useState(!initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) return;
    (async () => { setMap(await getBrandPlatforms()); setLoading(false); })();
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
      const j = await apiFetch("/api/creative-brand-platforms", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ map }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      pushToast("success", t("บันทึกแพลตฟอร์มต่อแบรนด์แล้ว", "Saved brand platforms"));
      onSaved(map);
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
            </div>
          ))}
          {brands.length === 0 && <p className="py-8 text-center text-sm text-slate-400">{t("ยังไม่มีแบรนด์", "No brands yet")}</p>}
        </div>
      )}
    </ERPModal>
  );
}
