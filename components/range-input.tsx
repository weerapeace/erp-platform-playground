"use client";

/**
 * ของกลาง — แถบเลื่อน + ช่องพิมพ์ตัวเลข (ลากหรือพิมพ์ก็ได้)
 *
 *   <RangeInput value={v} min={0} max={160} step={4} hardMax={999} unit="px" onChange={(v) => set({ gap: v })} />
 *
 * - พิมพ์ได้เกินปลายแถบถึง hardMin / hardMax (ไม่ใส่ = เท่าปลายแถบ) → ค่าเกิน แถบค้างที่ปลาย ตัวเลขยังถูก
 * - Enter / คลิกออก = ใช้ค่า · Esc = ยกเลิก · ↑↓ = ทีละ step (Shift = ×10) · พิมพ์ไม่ใช่ตัวเลข = กลับค่าเดิม
 * - ⚠️ ตั้ง hardMax เกินเพดานเดิม ต้องขยายตัวทำความสะอาดค่าด้วย (ERP normalize + เว็บร้าน clamp — memory theme_range_clamp_two_repos)
 * - label = แบบซ้อน: ป้ายชื่อซ้าย + ช่องตัวเลขขวาอยู่บรรทัดบน · แถบเต็มความกว้างอยู่ล่าง
 *   (ใช้ในที่แคบ เช่น แถบคู่ 2 คอลัมน์ในตัวแก้ผืนผ้าใบ — แบบแถวเดียวแถบจะสั้นจนลากยาก)
 */
import { useState, type ReactNode } from "react";

export function RangeInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  hardMin,
  hardMax,
  unit,
  className = "w-full",
  disabled,
  ariaLabel,
  onMouseEnter,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** พิมพ์ได้ต่ำสุด/สูงสุด (เกินปลายแถบได้) */
  hardMin?: number;
  hardMax?: number;
  unit?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  onMouseEnter?: () => void;
  /** ใส่ = แบบซ้อน (ป้ายชื่อ + ช่องตัวเลขบรรทัดบน · แถบเต็มกว้างด้านล่าง) */
  label?: ReactNode;
}) {
  const lo = hardMin ?? min;
  const hi = hardMax ?? max;
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(hi, Math.max(lo, n));
  const commit = () => {
    if (draft == null) return;
    const n = Number(draft.trim().replace(",", "."));
    setDraft(null);
    if (draft.trim() === "" || !Number.isFinite(n)) return;
    onChange(clamp(n));
  };
  const slider = (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={Math.min(max, Math.max(min, value))}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
      className={label != null ? "block w-full accent-blue-600" : "flex-1 min-w-0 accent-blue-600"}
    />
  );
  const box = (
    <input
      type="text"
      inputMode="decimal"
      value={draft ?? String(value)}
      disabled={disabled}
      aria-label={ariaLabel ? `${ariaLabel} (พิมพ์ตัวเลข)` : "พิมพ์ตัวเลข"}
      title={`พิมพ์ตัวเลขได้ ${lo}–${hi}${unit ?? ""} · Enter = ใช้ค่า · ↑↓ ทีละ ${step}`}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const d = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
          setDraft(null);
          onChange(clamp(Number((value + d).toFixed(4))));
        }
      }}
      className="w-14 shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-right tabular-nums text-slate-700 focus:outline-none focus:border-blue-400 disabled:opacity-50"
    />
  );
  const unitEl = unit && <span className="shrink-0 text-[11px] text-slate-400">{unit}</span>;
  if (label != null)
    return (
      <div className={className} onMouseEnter={onMouseEnter}>
        <div className="flex items-center justify-between gap-2">
          {label}
          <span className="flex shrink-0 items-center gap-1">
            {box}
            {unitEl}
          </span>
        </div>
        {slider}
      </div>
    );
  return (
    <div className={`flex items-center gap-2 ${className}`} onMouseEnter={onMouseEnter}>
      {slider}
      {box}
      {unitEl}
    </div>
  );
}
