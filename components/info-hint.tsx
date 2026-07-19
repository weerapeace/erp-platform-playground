"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * InfoHint — ปุ่ม ⓘ เล็ก ๆ "กดแล้วเด้ง popup อธิบายสั้น ๆ" ข้าง ๆ ปุ่ม/ฟิลด์ (ของกลาง)
 * ใช้เมื่ออยากอธิบายว่าปุ่มนี้ทำอะไร โดยไม่รกหน้าจอ · กดที่อื่น/Esc = ปิด
 *
 * <InfoHint>เนื้อหาอธิบาย (รองรับ JSX)</InfoHint>
 *   side="left"  → popup ชิดซ้าย (ค่าเริ่มต้น)  | side="right" → ชิดขวา (กันล้นขอบเมื่อปุ่มอยู่ทางขวา)
 */
export function InfoHint({ children, label, side = "left", className = "" }: {
  children: ReactNode;
  label?: string;
  side?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <span ref={ref} className={`relative inline-flex align-middle ${className}`}>
      <button type="button" aria-label={label || "ข้อมูลเพิ่มเติม"} aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o); }}
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold leading-none transition-colors ${open ? "border-violet-400 bg-violet-50 text-violet-600" : "border-slate-300 text-slate-400 hover:text-violet-600 hover:border-violet-300"}`}>
        i
      </button>
      {open && (
        <span onClick={(e) => e.stopPropagation()}
          className={`absolute top-full mt-1 z-50 w-64 max-w-[80vw] rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] font-normal leading-relaxed text-slate-600 shadow-xl whitespace-normal text-left normal-case ${side === "right" ? "right-0" : "left-0"}`}>
          {children}
        </span>
      )}
    </span>
  );
}
