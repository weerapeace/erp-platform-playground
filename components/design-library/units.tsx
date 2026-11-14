"use client";

/**
 * 📚 Design Library — หน่วยความยาว ซม./นิ้ว (จำต่อคน ผ่าน useViewPref → user_ui_prefs)
 * ค่าจริงเก็บเป็น ซม. เสมอ (lib/length-units ของกลาง) — สลับหน่วยแค่เปลี่ยน "การแสดง"
 *   const unit = useLenUnit()  →  <UnitToggle unit={unit} />  ·  <LenInput cm={v} unit={unit.unit} onChange={(cm) => …} />
 */
import { useEffect, useState } from "react";
import { useViewPref } from "@/lib/use-view-pref";
import { fromUnit, toUnit, unitLabel, type LengthUnit } from "@/lib/length-units";

const UNITS = ["cm", "in"] as const;
export type LenUnit = (typeof UNITS)[number];

export function useLenUnit() {
  const { view, setView, saveDefault } = useViewPref<LenUnit>("design_library_unit", UNITS, "cm");
  const set = (u: LenUnit) => { setView(u); saveDefault(u); };
  return { unit: view, set };
}

const round = (cm: number, u: LengthUnit) => { const v = toUnit(cm, u); const k = u === "in" ? 100 : 10; return Math.round(v * k) / k; };
/** ตัวเลขในหน่วยที่เลือก (ไว้โชว์) เช่น fmtLen(30,"in") = "11.81 นิ้ว" */
export const fmtLen = (cm: number, u: LenUnit) => `${round(cm, u)} ${unitLabel(u)}`;

export function UnitToggle({ unit, set }: { unit: LenUnit; set: (u: LenUnit) => void }) {
  return (
    <span className="inline-flex rounded-lg border border-slate-200 overflow-hidden" title="หน่วยที่แสดง (จำแยกต่อคน) — ระบบเก็บเป็นเซนติเมตรเสมอ">
      {UNITS.map((u, i) => (
        <button key={u} type="button" onClick={() => set(u)}
          className={`h-7 px-2.5 text-[12px] ${i ? "border-l border-slate-200" : ""} ${unit === u ? "bg-indigo-50 text-indigo-700" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{unitLabel(u)}</button>
      ))}
    </span>
  );
}

/** ช่องกรอกความยาว — แสดง/พิมพ์ในหน่วยที่เลือก ส่งกลับเป็น ซม. (พิมพ์ทศนิยมได้ไม่กระโดด) */
export function LenInput({ cm, unit, onChange, disabled, className = "" }: { cm: number; unit: LenUnit; onChange: (cm: number) => void; disabled?: boolean; className?: string }) {
  const [text, setText] = useState(String(round(cm, unit)));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(String(round(cm, unit))); }, [cm, unit, focus]);
  return (
    <span className={`flex items-center gap-1 ${className}`}>
      <input type="number" min={0} step={unit === "in" ? 0.25 : 0.5} disabled={disabled} value={text}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0) onChange(Math.round(fromUnit(n, unit) * 100) / 100); }}
        className="w-full h-9 px-2 border border-slate-200 rounded-lg text-sm text-slate-800 disabled:bg-slate-50" />
      <span className="text-[11px] text-slate-400 shrink-0 w-7">{unitLabel(unit)}</span>
    </span>
  );
}
