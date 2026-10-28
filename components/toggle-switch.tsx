"use client";

/**
 * 🔘 ToggleSwitch (ของกลาง) — สวิตช์เปิด/ปิด (เขียว = เปิด) ใช้แทนการเขียนปุ่ม role="switch" เองในแต่ละหน้า
 *
 *   <ToggleSwitch on={m.enabled} onChange={(v) => set({ enabled: v })} title="เปิดให้ลูกค้าเลือก" />
 *   <ToggleSwitch on={x} onChange={setX} label="เก็บเงินปลายทาง" />   // มีป้ายข้าง ๆ (กดป้ายก็สลับได้)
 *
 * - กดสวิตช์ไม่ไหลไปถึงแถว/การ์ดที่ครอบ (stopPropagation) → วางบนการ์ดที่กดเพื่อเลือกได้
 * - size "sm" = แถวแน่น/การ์ด · "md" = ค่าเริ่ม
 * หน้าที่ยังเขียนสวิตช์เอง (ย้ายมาใช้ตัวนี้ได้เมื่อแตะ): parent-web-listings · personalize-editor · line-console · belt-builder
 */
import type { ReactNode } from "react";

export function ToggleSwitch({
  on,
  onChange,
  label,
  title,
  disabled,
  size = "md",
  className = "",
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  title?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const track = size === "sm" ? "h-4 w-7" : "h-5 w-9";
  const knob = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const shift = size === "sm" ? "translate-x-3.5" : "translate-x-[18px]";
  const btn = (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      className={`relative inline-flex shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50 ${track} ${on ? "bg-emerald-500" : "bg-slate-300"} ${label ? "" : className}`}
    >
      <span className={`inline-block rounded-full bg-white shadow transition-transform ${knob} ${on ? shift : "translate-x-0.5"}`} />
    </button>
  );
  if (!label) return btn;
  return (
    <label className={`inline-flex cursor-pointer select-none items-center gap-1.5 ${className}`} onClick={(e) => e.stopPropagation()}>
      {btn}
      <span>{label}</span>
    </label>
  );
}
