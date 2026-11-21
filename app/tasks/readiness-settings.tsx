"use client";

/**
 * ⚙️ ตั้งค่า "ความพร้อมสินค้า" (รายการ ✓/✕ ใต้ความคืบหน้าในลิ้นชักงาน) — /tasks/settings แท็บ "ความพร้อมสินค้า"
 * ตาราง: แถว = เรื่องที่เช็ก · คอลัมน์ = ค่ากลาง + แต่ละประเภทงาน (ไม่ตั้ง = ใช้ค่ากลาง)
 * บันทึกทันทีที่ติ๊ก (ui_config task_readiness_rules · ประวัติการแก้ลง audit ที่ /api/ui-config) · ติ๊กกลับ = ย้อนได้
 * เจ้าของขอ 2026-11-21
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { useCreativeOptions } from "./use-options";
import { DEFAULT_READINESS, READINESS_DEFS, READINESS_RULES_KEY, type ReadinessKey, type ReadinessRules } from "@/lib/task-readiness";
import { clearReadinessRulesCache, loadReadinessRules } from "./task-readiness-bar";

export function ReadinessRulesManager({ showToast }: { showToast: (m: string) => void }) {
  const t = useT();
  const { taskTypes } = useCreativeOptions();
  const [rules, setRules] = useState<ReadinessRules | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadReadinessRules(true).then(setRules); }, []);

  const save = async (next: ReadinessRules, msg: string) => {
    setSaving(true); setErr(null);
    try {
      const r = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: READINESS_RULES_KEY, value: next }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Save failed"));
      setRules(next); clearReadinessRulesCache(); showToast(msg);
    } catch (e) { setErr(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setSaving(false); }
  };

  if (!rules) return <p className="text-sm text-slate-400">{t("กำลังโหลด…", "Loading…")}</p>;
  const def = rules.default ?? DEFAULT_READINESS;
  const toggleIn = (list: ReadinessKey[], k: ReadinessKey) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const setDefault = (k: ReadinessKey) => save({ ...rules, default: toggleIn(def, k) }, t("บันทึกค่ากลางแล้ว", "Default saved"));
  const setType = (type: string, k: ReadinessKey) => save({ ...rules, byType: { ...rules.byType, [type]: toggleIn(rules.byType[type] ?? def, k) } }, t("บันทึกแล้ว", "Saved"));
  const resetType = (type: string) => { const bt = { ...rules.byType }; delete bt[type]; void save({ ...rules, byType: bt }, t("กลับไปใช้ค่ากลางแล้ว", "Back to default")); };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{t("ความพร้อมสินค้า (ยังขาดอะไร)", "Product readiness (what's missing)")}</h3>
        <p className="text-xs text-slate-500">{t("เลือกเรื่องที่ลิ้นชักงานจะเช็กใต้ความคืบหน้า · โชว์เฉพาะงานที่ผูก Parent SKU · ประเภทงานที่ไม่ได้ตั้ง = ใช้ค่ากลาง · ไม่ติ๊กเลย = ไม่โชว์แถบ", "Pick what the task drawer checks under progress · only for tasks linked to a Parent SKU · unset task types use the default · none ticked = bar hidden")}</p>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left font-medium px-3 py-2 min-w-[200px]">{t("เรื่องที่เช็ก", "Check")}</th>
              <th className="font-medium px-2 py-2">{t("ค่ากลาง", "Default")}</th>
              {taskTypes.map((tt) => (
                <th key={tt.value} className="font-medium px-2 py-2 whitespace-nowrap">
                  <div>{tt.label}</div>
                  {rules.byType[tt.value]
                    ? <button type="button" disabled={saving} onClick={() => resetType(tt.value)} className="text-[10px] text-violet-600 hover:underline">{t("ใช้ค่ากลาง", "Use default")}</button>
                    : <span className="text-[10px] text-slate-400">{t("(ตามค่ากลาง)", "(default)")}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {READINESS_DEFS.map((d) => (
              <tr key={d.key} className="border-t border-slate-100">
                <td className="px-3 py-1.5"><div className="text-slate-700">{t(d.label, d.label_en)}</div><div className="text-[10px] text-slate-400">{d.hint}</div></td>
                <td className="text-center"><input type="checkbox" disabled={saving} checked={def.includes(d.key)} onChange={() => setDefault(d.key)} /></td>
                {taskTypes.map((tt) => {
                  const own = rules.byType[tt.value];
                  return <td key={tt.value} className="text-center"><input type="checkbox" disabled={saving} className={own ? "" : "opacity-40"} checked={(own ?? def).includes(d.key)} onChange={() => setType(tt.value, d.key)} /></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
