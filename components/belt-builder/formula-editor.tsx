"use client";

/**
 * StrapFormulaEditor — ช่องแก้สูตรตัดหนัง {mult, add_cm} + ตารางตัวอย่างสด "เอวเท่านี้ → ตัดหนังกี่ซม. · รูอยู่ตรงไหน"
 * กฎคิด = lib/belt-builder.ts (strapLengthCm / holePositionsCm) ใช้ร่วมกับหน้าเว็บลูกค้า
 */
import { useMemo } from "react";
import { DEFAULT_STRAP_FORMULA, holePositionsCm, parseStrapFormula, strapLengthCm, type StrapFormula } from "@/lib/belt-builder";

export function StrapFormulaEditor({ value, onChange, disabled, form }: {
  value: unknown;
  onChange: (f: StrapFormula) => void;
  disabled?: boolean;
  /** ค่าฟอร์มปัจจุบัน (เอาช่วงเอว / จำนวนรู / ระยะรู มาทำตัวอย่าง) */
  form: Record<string, unknown>;
}) {
  const f = useMemo(() => parseStrapFormula(value) ?? DEFAULT_STRAP_FORMULA, [value]);
  const min = Number(form.waist_min_in) || 28, max = Number(form.waist_max_in) || 46;
  const holes = Number(form.hole_count) || 5, spacing = Number(form.hole_spacing_cm) || 2.5;
  const samples = useMemo(() => {
    const out: number[] = [];
    const step = Math.max(1, Math.round((max - min) / 4));
    for (let w = min; w <= max; w += step) out.push(w);
    if (out[out.length - 1] !== max) out.push(max);
    return out;
  }, [min, max]);
  const num = "w-24 border border-slate-300 rounded px-2 py-1 text-sm tabular-nums disabled:bg-slate-50";
  const set = (k: keyof StrapFormula, v: string) => { const n = Number(v); if (Number.isFinite(n)) onChange({ ...f, [k]: n }); };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2 text-sm text-slate-700">
        <span className="pb-1.5">ความยาวหนัง (ซม.) = เอว (นิ้ว) ×</span>
        <input type="number" step="0.01" className={num} value={f.mult} disabled={disabled} onChange={(e) => set("mult", e.target.value)} />
        <span className="pb-1.5">+</span>
        <input type="number" step="0.5" className={num} value={f.add_cm} disabled={disabled} onChange={(e) => set("add_cm", e.target.value)} />
        <span className="pb-1.5">ซม.</span>
        {!disabled && <button type="button" onClick={() => onChange(DEFAULT_STRAP_FORMULA)} className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50">↺ ค่าเริ่มต้น (×2.54 + 24)</button>}
      </div>
      <div className="text-[11px] text-slate-500">2.54 = แปลงนิ้วเป็นซม. · +24 ซม. = เผื่อหัว + ปลายสาย + ช่วงรู (สูตรชั่วคราว ปรับได้) · รูกลางตรงกับรอบเอว ที่เหลือห่างกัน {spacing} ซม.</div>
      <table className="text-xs border border-slate-200 rounded overflow-hidden">
        <thead className="bg-slate-50 text-slate-600"><tr><th className="px-2 py-1 text-left">เอว (นิ้ว)</th><th className="px-2 py-1 text-right">ตัดหนัง (ซม.)</th><th className="px-2 py-1 text-left">ตำแหน่งรู {holes} รู (ซม. จากปลาย)</th></tr></thead>
        <tbody>
          {samples.map((w) => (
            <tr key={w} className="border-t border-slate-100">
              <td className="px-2 py-1 tabular-nums">{w}</td>
              <td className="px-2 py-1 tabular-nums text-right font-medium">{strapLengthCm(w, f)}</td>
              <td className="px-2 py-1 tabular-nums text-slate-600">{holePositionsCm(w, f, holes, spacing).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
