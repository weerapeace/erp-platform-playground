"use client";
/**
 * 🏷 แท็ก/โปรเจกต์ของงานในแผนงานทีม (เฉพาะโมดูลนี้ — ไม่ใช่ของกลาง)
 *   PlanTagChip  = ป้ายแท็ก (สีคงที่ต่อชื่อ · lib/team-plan tagColor)
 *   PlanTagInput = พิมพ์แล้ว Enter / จุลภาค เพื่อเพิ่ม · × เอาออก · แนะนำแท็กที่ทีมใช้อยู่ (กดเพิ่มได้เลย)
 * กฎแท็ก (ตัดซ้ำ/ยาวสุด/สูงสุด) = cleanPlanTags ใน lib/team-plan — ใช้ตัวเดียวกับ API
 */
import { useState } from "react";
import { cleanPlanTags, PLAN_TAG_MAX, tagColor } from "@/lib/team-plan";

export function PlanTagChip({ tag, onRemove, onClick, active = false }: { tag: string; onRemove?: () => void; onClick?: () => void; active?: boolean }) {
  const c = tagColor(tag);
  const body = <><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} />{tag}</>;
  const cls = `inline-flex max-w-[12rem] items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap ${active ? "ring-1 ring-violet-400" : ""}`;
  const style = { background: `${c}14`, color: c };
  return (
    <span className={cls} style={style}>
      {onClick ? <button type="button" onClick={onClick} className="inline-flex items-center gap-1 truncate">{body}</button> : body}
      {onRemove && <button type="button" onClick={onRemove} aria-label={`เอาแท็ก ${tag} ออก`} className="ml-0.5 opacity-60 hover:opacity-100">×</button>}
    </span>
  );
}

export function PlanTagInput({ value, onChange, suggestions = [], disabled = false }: {
  value: string[]; onChange: (tags: string[]) => void; suggestions?: string[]; disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const full = value.length >= PLAN_TAG_MAX;
  const add = (raw: string) => {
    const next = cleanPlanTags([...value, ...raw.split(",")]);
    if (next.length !== value.length) onChange(next);
    setText("");
  };
  const remaining = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()))
    .filter((s) => !text.trim() || s.toLowerCase().includes(text.trim().toLowerCase())).slice(0, 8);
  return (
    <div>
      <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1 focus-within:ring-2 focus-within:ring-violet-400">
        {value.map((t) => <PlanTagChip key={t} tag={t} onRemove={disabled ? undefined : () => onChange(value.filter((x) => x !== t))} />)}
        {!disabled && !full && (
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={40} aria-label="เพิ่มแท็ก"
            placeholder={value.length ? "" : "เช่น เว็บ ISG แล้วกด Enter"}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === ",") && text.trim()) { e.preventDefault(); add(text); }
              if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
            }}
            onBlur={() => { if (text.trim()) add(text); }}
            className="h-7 min-w-[8rem] flex-1 border-0 bg-transparent px-1 text-sm focus:outline-none" />
        )}
      </div>
      {!disabled && !full && remaining.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-slate-400">ที่ทีมใช้:</span>
          {remaining.map((s) => <PlanTagChip key={s} tag={s} onClick={() => add(s)} />)}
        </div>
      )}
      {full && !disabled && <p className="mt-1 text-[11px] text-slate-400">ใส่ได้สูงสุด {PLAN_TAG_MAX} แท็ก</p>}
    </div>
  );
}
