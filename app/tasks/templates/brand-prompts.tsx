"use client";

// ============================================================
// BrandPromptsTab — จัดการ prompt ต่อแบรนด์ (override) ในหน้าเทมเพลต
// เลือกแบรนด์ -> แก้ prompt ต่อชนิดงานย่อย · เว้นว่าง = ใช้ค่าเริ่มต้น (registry) · แบรนด์ทับเวลา resolve
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { ERPTextarea } from "@/components/form";
import { useT } from "@/components/i18n";
import { listBrands, listSubtaskTypes, listBrandPrompts, saveBrandPrompt, type BrandOption, type SubtaskType } from "../data";

type ToastFn = (t: "success" | "error" | "info", m: string) => void;

export function BrandPromptsTab({ pushToast }: { pushToast: ToastFn }) {
  const t = useT();
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [types, setTypes] = useState<SubtaskType[]>([]);
  const [brandId, setBrandId] = useState("");
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => { (async () => { try { const [b, ty] = await Promise.all([listBrands(), listSubtaskTypes()]); setBrands(b); setTypes(ty); if (b[0]) setBrandId(b[0].id); } catch { /* ignore */ } })(); }, []);

  const loadPrompts = useCallback(async (bid: string) => {
    if (!bid) { setPrompts({}); return; }
    setLoading(true);
    try { const list = await listBrandPrompts(bid); setPrompts(Object.fromEntries(list.map((p) => [p.subtask_type, p.prompt_template ?? ""]))); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadPrompts(brandId); }, [brandId, loadPrompts]);

  const promptTypes = types.filter((ty) => ty.has_copy_prompt || (ty.prompt_template ?? "").trim().length > 0);

  const save = async (ty: SubtaskType, val: string) => {
    setSavingKey(ty.key);
    try { await saveBrandPrompt(brandId, ty.key, val.trim() || null); setPrompts((p) => ({ ...p, [ty.key]: val.trim() })); pushToast("success", val.trim() ? t("บันทึก prompt แล้ว", "Prompt saved") : t("กลับค่าเริ่มต้นแล้ว", "Reset to default")); }
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
      <p className="text-xs text-slate-400 mb-3">{t("ตั้ง prompt เฉพาะแบรนด์นี้ — เว้นว่าง = ใช้ค่าเริ่มต้นของชนิดงาน · ตัวแปร เช่น {{brand_name}} {{price}} {{colors}} {{collection}} {{approved_image_urls}}", "Per-brand prompt — empty = use type default")}</p>
      {loading ? <div className="py-10 text-center text-slate-400 text-sm">{t("กำลังโหลด...", "Loading...")}</div> : (
        <div className="space-y-3">
          {promptTypes.map((ty) => {
            const override = prompts[ty.key] ?? "";
            const hasOverride = override.trim().length > 0;
            return (
              <div key={ty.key} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-700">{ty.icon ?? "🧩"} {ty.label_th}</span>
                  <span className="flex items-center gap-2">
                    {hasOverride ? <span className="text-[10px] text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">{t("กำหนดเอง", "Custom")}</span> : <span className="text-[10px] text-slate-400">{t("ใช้ค่าเริ่มต้น", "Default")}</span>}
                    {hasOverride && <button onClick={() => save(ty, "")} className="text-[11px] text-rose-500 hover:underline">{t("กลับค่าเริ่มต้น", "Reset")}</button>}
                  </span>
                </div>
                <ERPTextarea key={`${ty.key}:${brandId}:${hasOverride}`} rows={3} defaultValue={override}
                  placeholder={ty.prompt_template ?? t("(ค่าเริ่มต้น)", "(default)")}
                  onBlur={(e) => { if (e.target.value.trim() !== override.trim()) save(ty, e.target.value); }} />
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
