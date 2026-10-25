"use client";

/**
 * 🔢 StepInput — ช่องตัวเลข + ปุ่ม −/+ + หมุนลูกกลิ้งเมาส์ปรับทีละขั้น (ของกลาง)
 *
 * ใช้กับช่องตัวเลขที่ "ขยับทีละนิด" บ่อย เช่น ระยะห่าง ขอบ ความกว้าง ความยาว (เจ้าของขอ 2026-10-25: ทีละ 1 mm)
 *   - พิมพ์ได้ลื่น (พิมพ์ "0." / ลบจนว่าง ไม่เด้ง) · ว่าง = null
 *   - ปุ่ม − / + · ลูกศร ↑↓ บนคีย์บอร์ด · หมุนลูกกลิ้ง (ขึ้น = เพิ่ม) → ทีละ step · กด Shift ค้าง = ทีละ step × 10
 *   - ลูกกลิ้งใช้ useWheelStep ตัวเดียวกับ WheelSelect: ต้องขยับเมาส์มาชี้ก่อน (เลื่อนหน้าผ่าน ๆ ค่าไม่เปลี่ยน)
 *   - min / max = ปุ่ม/ลูกกลิ้งไม่พาเกินขอบ (พิมพ์เองยังได้ — ผู้เรียกตรวจเอง)
 * หน่วยเป็นของผู้เรียก (เช่น แสดง cm ก็ส่ง step = 0.1 ให้ได้ทีละ 1 mm)
 * เอกสาร: docs/step-input.md
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n";
import { useWheelStep } from "@/components/wheel-select";

const clean = (n: number) => Number(n.toFixed(6));   // กันเลขเพี้ยน 0.30000000000000004
const show = (v: number | null) => (v == null || !Number.isFinite(v) ? "" : String(clean(v)));

export function StepInput({
  value, onChange, step = 1, min, max, unit, integer = false, className = "", disabled, placeholder, ariaLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;            // ป้ายหน่วยท้ายช่อง (ไม่ใส่ = ไม่แสดง)
  integer?: boolean;
  className?: string;       // ขนาดของทั้งกล่อง (เช่น "h-8 w-full")
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const t = useT();
  const [text, setText] = useState(show(value));
  const focused = useRef(false);
  const current = useRef(value);   // ค่าล่าสุดทันที (หมุนลูกกลิ้งเร็วหลายขั้นในจังหวะเดียว ไม่ให้หาย)
  current.current = value;
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!focused.current) setText(show(value)); }, [value]);

  const bump = (dir: 1 | -1, big = false) => {
    if (disabled) return;
    const base = current.current ?? min ?? 0;
    let next = clean(base + dir * step * (big ? 10 : 1));
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    if (integer) next = Math.round(next);
    current.current = next;
    setText(show(next));
    onChange(next);
  };
  const shift = useRef(false);
  useWheelStep(wrap, (dir) => bump(dir === -1 ? 1 : -1, shift.current), !disabled);   // หมุนขึ้น = เพิ่ม

  const btn = "flex w-7 shrink-0 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 select-none";
  return (
    <div ref={wrap} className={`flex items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-violet-400 ${disabled ? "opacity-60" : ""} ${className}`}
      onPointerMove={(e) => { shift.current = e.shiftKey; }}>
      <button type="button" tabIndex={-1} className={`${btn} border-r border-slate-200`} disabled={disabled}
        aria-label={t("ลด", "Decrease")} title={t("ลด (Shift = ×10) · หมุนลูกกลิ้งเมาส์ได้", "Decrease (Shift = ×10) · mouse wheel works too")} onClick={(e) => bump(-1, e.shiftKey)}>−</button>
      <input
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        aria-label={ariaLabel}
        className="min-w-0 flex-1 bg-transparent px-1.5 text-center text-sm outline-none"
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; setText(show(current.current)); }}
        onKeyDown={(e) => {
          shift.current = e.shiftKey;
          if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); bump(e.key === "ArrowUp" ? 1 : -1, e.shiftKey); }
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(",", ".");
          setText(raw);
          const n = raw.trim() === "" ? null : Number(raw);
          const v = n == null || !Number.isFinite(n) ? null : integer ? Math.floor(n) : n;
          current.current = v;
          onChange(v);
        }}
      />
      {unit && <span className="flex items-center pr-1 text-[11px] text-slate-400">{unit}</span>}
      <button type="button" tabIndex={-1} className={`${btn} border-l border-slate-200`} disabled={disabled}
        aria-label={t("เพิ่ม", "Increase")} title={t("เพิ่ม (Shift = ×10) · หมุนลูกกลิ้งเมาส์ได้", "Increase (Shift = ×10) · mouse wheel works too")} onClick={(e) => bump(1, e.shiftKey)}>+</button>
    </div>
  );
}
