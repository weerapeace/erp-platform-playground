"use client";

// ============================================================
// BrandPromptsTab — จัดการ prompt ต่อแบรนด์ (override) ในหน้าเทมเพลต
// เลือกแบรนด์ -> แก้ prompt ต่อชนิดงานย่อย · เว้นว่าง = ใช้ค่าเริ่มต้น (registry) · แบรนด์ทับเวลา resolve
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { PromptEditor } from "@/components/prompt-editor";
import { useT } from "@/components/i18n";
import { listBrands, listSubtaskTypes, listBrandPrompts, saveBrandPrompt, type BrandOption, type SubtaskType } from "../data";

type ToastFn = (t: "success" | "error" | "info", m: string) => void;

export function BrandPromptsTab({ pushToast }: { pushToast: ToastFn }) {
  const t = useT();
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [types, setTypes] = useState<SubtaskType[]>([]);
  const [brandId, setBrandId] = useState("");
  const [prompts, setPrompts] = useState<Record<string, string>>({}); // ค่าที่บันทึกแล้ว
  const [draft, setDraft] = useState<Record<string, string>>({});      // ค่าที่กำลังแก้
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => { (async () => { try { const [b, ty] = await Promise.all([listBrands(), listSubtaskTypes()]); setBrands(b); setTypes(ty); if (b[0]) setBrandId(b[0].id); } catch { /* ignore */ } })(); }, []);

  const loadPrompts = useCallback(async (bid: string) => {
    if (!bid) { setPrompts({}); setDraft({}); return; }
    setLoading(true);
    try { const list = await listBrandPrompts(bid); const map = Object.fromEntries(list.map((p) => [p.subtask_type, p.prompt_template ?? ""])); setPrompts(map); setDraft(map); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadPrompts(brandId); }, [brandId, loadPrompts]);

  const promptTypes = types.filter((ty) => ty.has_copy_prompt || (ty.prompt_template ?? "").trim().length > 0);

  const brandName = brands.find((b) => b.id === brandId)?.name ?? "";

  const save = async (ty: SubtaskType, val: string) => {
    setSavingKey(ty.key);
    try { await saveBrandPrompt(brandId, ty.key, val.trim() || null); const v = val.trim(); setPrompts((p) => ({ ...p, [ty.key]: v })); setDraft((d) => ({ ...d, [ty.key]: v })); pushToast("success", v ? t("บันทึก prompt แล้ว", "Prompt saved") : t("กลับค่าเริ่มต้นแล้ว", "Reset to default")); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setSavingKey(null); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-sm text-slate-600">{t("เลือกแบรนด์", "Brand")}:</span>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white min-w-[200px]">
          {brands.length === 0 && <option value="">—</option>}
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <p className="text-xs text-slate-400 mb-3">{t("ตั้ง prompt เฉพาะแบรนด์นี้ — เว้นว่าง = ใช้ค่าเริ่มต้นของชนิดงาน · คลิกปุ่มตัวแปรใต้ช่องเพื่อแทรก (เช่น ชื่อแบรนด์ ราคา สี) ไม่ต้องพิมพ์ {{ }} เอง", "Per-brand prompt — empty = use type default · click variable chips to insert")}</p>
      {loading ? <div className="py-10 text-center text-slate-400 text-sm">{t("กำลังโหลด...", "Loading...")}</div> : (
        <div className="space-y-3">
          {promptTypes.map((ty) => {
            const saved = prompts[ty.key] ?? "";
            const cur = draft[ty.key] ?? "";
            const hasOverride = saved.trim().length > 0;
            return (
              <div key={ty.key} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-700">{ty.icon ?? "🧩"} {ty.label_th}</span>
                  <span className="flex items-center gap-2">
                    {hasOverride ? <span className="text-[10px] text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">{t("กำหนดเอง", "Custom")}</span> : <span className="text-[10px] text-slate-400">{t("ใช้ค่าเริ่มต้น", "Default")}</span>}
                    {hasOverride && <button onClick={() => save(ty, "")} className="text-[11px] text-rose-500 hover:underline">{t("กลับค่าเริ่มต้น", "Reset")}</button>}
                  </span>
                </div>
                <PromptEditor value={cur} rows={3}
                  sampleOverrides={{ brand_name: brandName }}
                  placeholder={ty.prompt_template ?? t("เว้นว่าง = ใช้ค่าเริ่มต้นของชนิดงาน", "Empty = use type default")}
                  onChange={(v) => setDraft((d) => ({ ...d, [ty.key]: v }))}
                  onCommit={(v) => { if (v.trim() !== saved.trim()) save(ty, v); }} />
                {savingKey === ty.key && <p className="text-[10px] text-slate-400 mt-1">{t("กำลังบันทึก...", "Saving...")}</p>}
              </div>
            );
          })}
          {promptTypes.length === 0 && <p className="text-sm text-slate-400">{t("ไม่มีชนิดงานที่ใช้ prompt", "No prompt-enabled subtask types")}</p>}
        </div>
      )}
    </div>
  );
}
