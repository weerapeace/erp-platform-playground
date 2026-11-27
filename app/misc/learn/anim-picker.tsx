"use client";

/**
 * 🎞️ เลือกภาพเคลื่อนไหวสอนของขั้นตอน (ในป๊อปแก้บทเรียน)
 *   ไม่มี / คลังสำเร็จรูป (ANIM_PRESETS) / ภาพเฉพาะเรื่องที่ Claude เขียนไว้ (เก็บไว้ · แก้โค้ดได้ในส่วนขั้นสูง · เอาออกได้)
 *   ดูตัวอย่างได้ทันทีก่อนบันทึก
 */
import { useState } from "react";
import { Icon } from "@/components/icon";
import { LessonAnim } from "@/components/lesson-anim";
import { ANIM_PRESETS, type LessonAnimation } from "@/lib/lesson-anim";

const groups = [...new Set(ANIM_PRESETS.map((p) => p.group))];

export function AnimPicker({ value, onChange }: { value: LessonAnimation | null; onChange: (a: LessonAnimation | null) => void }) {
  const [preview, setPreview] = useState(false);
  const [keptCustom, setKeptCustom] = useState<LessonAnimation | null>(value?.type === "custom" ? value : null);
  const sel = !value ? "" : value.type === "preset" ? value.key : "__custom";

  const pick = (k: string) => {
    if (!k) onChange(null);
    else if (k === "__custom") onChange(keptCustom);
    else onChange({ type: "preset", key: k });
  };

  return (
    <div className="rounded-lg border border-indigo-100 bg-white p-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-[12px] font-medium text-indigo-700"><Icon name="sparkles" /> ภาพเคลื่อนไหวสอน</label>
        <select value={sel} onChange={(e) => pick(e.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-[13px]">
          <option value="">— ไม่มี —</option>
          {groups.map((g) => (
            <optgroup key={g} label={`คลังสำเร็จรูป · ${g}`}>
              {ANIM_PRESETS.filter((p) => p.group === g).map((p) => <option key={p.key} value={p.key}>{p.label} — {p.hint}</option>)}
            </optgroup>
          ))}
          {keptCustom && <option value="__custom">ภาพเฉพาะเรื่อง (Claude เขียนให้)</option>}
        </select>
        {value && (
          <button type="button" onClick={() => setPreview((p) => !p)} className="h-8 rounded-lg border border-slate-200 px-2.5 text-[12px] text-slate-600 hover:bg-slate-50">
            {preview ? "ซ่อนตัวอย่าง" : "ดูตัวอย่าง"}
          </button>
        )}
      </div>
      {value?.type === "custom" && (
        <details className="mt-2 text-[12px] text-slate-500">
          <summary className="cursor-pointer select-none">ขั้นสูง: แก้โค้ดภาพ (HTML/SVG) — ปกติให้สั่ง Claude แก้ในแชต</summary>
          <textarea value={value.html} rows={6} spellCheck={false}
            onChange={(e) => { const a: LessonAnimation = { type: "custom", html: e.target.value, height: value.height }; setKeptCustom(a); onChange(a); }}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-[11px]" />
          <label className="mt-1 flex items-center gap-2">ความสูง (px)
            <input type="number" min={120} max={900} value={value.height}
              onChange={(e) => { const a: LessonAnimation = { type: "custom", html: value.html, height: Number(e.target.value) || 300 }; setKeptCustom(a); onChange(a); }}
              className="h-7 w-20 rounded border border-slate-200 px-1.5" />
          </label>
        </details>
      )}
      {value && preview && <div className="mt-2"><LessonAnim animation={value} /></div>}
    </div>
  );
}
