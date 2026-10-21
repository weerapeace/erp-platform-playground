"use client";
// ชิ้นส่วน UI เล็กที่หน้าคอนเทนต์ + drawer คอนเทนต์ใช้ร่วม (แยกจาก content.tsx — Y1)
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CONTENT_STATUS_META, contentStatusLabel, type ContentStatus } from "../data";
import { useT } from "@/components/i18n";

export function StatusBadge({ status }: { status: ContentStatus }) {
  useT();   // subscribe ภาษา
  const m = CONTENT_STATUS_META[status] ?? CONTENT_STATUS_META.draft;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{contentStatusLabel(status)}</span>;
}

// เมนู ⋯ เล็ก ๆ ท้ายหัวการ์ด (ของที่ไม่ได้ใช้ทุกครั้ง) · กดที่อื่นแล้วปิดเอง
export function RowMenu({ items, label, up = false }: { items: { label: string; onClick: () => void }[]; label?: string; up?: boolean }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [open]);
  return (
    <div ref={boxRef} className="relative">
      {label
        ? <button type="button" onClick={() => setOpen((o) => !o)} className="h-9 px-3 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{label}</button>
        : <button type="button" onClick={() => setOpen((o) => !o)} title="เพิ่มเติม" className="text-slate-400 hover:text-violet-700 px-1 leading-none text-base">⋯</button>}
      {open && (
        <div className={`absolute z-20 min-w-[200px] bg-white border border-slate-200 rounded-lg shadow-lg py-1 ${up ? "left-0 bottom-full mb-1" : "right-0 top-full mt-1"}`}>
          {items.map((it) => (
            <button key={it.label} type="button" onClick={() => { setOpen(false); it.onClick(); }} className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 ${label ? "text-sm text-slate-700" : "text-xs text-slate-700"}`}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ส่วนที่พับได้ในคอลัมน์ซ้ายของ drawer คอนเทนต์ — หัวข้อมีแถบชัด + กด ▼ พับ/กาง (จำต่อคน)
// section แบบ "แบน" — หัวข้อ + เส้นคั่นบน (ไม่ทำเป็นกล่อง/เงา จะได้ไม่ดูจม)
export function CSection({ title, order, collapsed, onToggle, right, children }: { title: string; order: number; collapsed: boolean; onToggle: () => void; right?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ order }} className="border-t border-slate-100 pt-2.5">
      <div className="w-full flex items-center justify-between gap-2 mb-1.5">
        <button onClick={onToggle} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 tracking-wide hover:text-violet-700 min-w-0">
          <span className="text-[10px] text-slate-300 shrink-0 w-3 text-center">{collapsed ? "▸" : "▾"}</span><span className="truncate">{title}</span>
        </button>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {!collapsed && <div>{children}</div>}
    </div>
  );
}
