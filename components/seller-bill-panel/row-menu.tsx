"use client";

/**
 * เมนู ⋯ ท้ายแถวบิลร้าน — เก็บปุ่มที่ใช้ไม่บ่อย (เปลี่ยน / ข้าม / เป็นสินค้า / ลบ) ให้แถวไม่รก
 * ★ 2026-11-15 เจ้าของ: "ออกแบบให้ดูไม่ตาลาย" · ใช้ของกลาง FloatingDropdown (ลอยทับ ไม่โดนกล่องตัด)
 * ใช้ใน components/seller-bill-panel + หัวหน้าใบสำคัญรับ (★ 2026-11-16 ปุ่ม "＋ ใบใหม่ ▾" และเมนู ⋯ บนมือถือ — buttonClassName ปรับหน้าตาปุ่ม)
 */
import { useRef, useState } from "react";
import { FloatingDropdown } from "@/components/floating-dropdown";

export type RowMenuItem = { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; title?: string; checked?: boolean };

export function RowMenu({ items, disabled, label = "⋯", title = "ตัวเลือกเพิ่ม", buttonClassName }: { items: RowMenuItem[]; disabled?: boolean; label?: string; title?: string; buttonClassName?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <span ref={ref} className="inline-flex">
      <button type="button" disabled={disabled} onClick={() => setOpen((v) => !v)} title={title} aria-label={title}
        className={buttonClassName ?? "h-7 min-w-7 px-1.5 text-sm leading-none rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"}>{label}</button>
      <FloatingDropdown anchorRef={ref} open={open} onClose={() => setOpen(false)} minWidth={180}>
        <div className="py-1 bg-white rounded-lg border border-slate-200 shadow-lg">
          {items.map((it, k) => (
            <button key={k} type="button" disabled={it.disabled} title={it.title}
              onClick={() => { setOpen(false); it.onClick(); }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-slate-50 disabled:opacity-40 ${it.danger ? "text-red-600" : "text-slate-700"}`}>
              {it.checked !== undefined && <span className={`w-3.5 h-3.5 rounded border text-[10px] leading-3 text-center ${it.checked ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300"}`}>{it.checked ? "✓" : ""}</span>}
              {it.label}
            </button>
          ))}
        </div>
      </FloatingDropdown>
    </span>
  );
}
