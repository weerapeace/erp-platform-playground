"use client";

/**
 * ลิงก์ในข้อเช็กลิสต์ (ของกลาง · ไฟล์เล็ก) — ใช้ได้ทั้งในเช็กลิสต์ บนการ์ด และป๊อปเตือนงานตอนเข้า ERP (ไม่ลากของหนักของเช็กลิสต์มาด้วย)
 *   <TaskLinkList links onRemove? />  = รายการลิงก์ (ชื่อกำกับ/ชื่อเว็บ · เปิดแท็บใหม่)
 *   <TaskLinksButton links />         = ปุ่มย่อ 🔗 (1 ลิงก์ = เปิดเลย · หลายลิงก์ = เด้งรายการ)
 */
import { useRef, useState } from "react";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { linkHost, linkLabel, type TaskLink } from "@/lib/record-tasks";

/** ลิงก์ของข้อ (ของกลาง) — ชื่อกำกับ/ชื่อเว็บ กดเปิดแท็บใหม่ · onRemove = มี ✕ เอาออก */
export function TaskLinkList({ links, onRemove, className = "" }: { links: TaskLink[] | null | undefined; onRemove?: (url: string) => void; className?: string }) {
  if (!links?.length) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {links.map((l) => (
        <span key={l.url} className="inline-flex min-w-0 max-w-full items-center rounded-md border border-slate-200 bg-slate-50 pl-1.5 text-[11px]">
          <a href={l.url} target="_blank" rel="noopener noreferrer" title={l.url} className="min-w-0 truncate py-0.5 text-blue-700 hover:underline">
            ↗ {linkLabel(l)}{l.label ? <span className="text-slate-400"> · {linkHost(l.url)}</span> : null}
          </a>
          {onRemove
            ? <button type="button" onClick={() => onRemove(l.url)} title="เอาลิงก์ออก" aria-label={`เอาลิงก์ ${linkLabel(l)} ออก`} className="shrink-0 px-1 text-slate-300 hover:text-rose-500">✕</button>
            : <span className="pr-1.5" />}
        </span>
      ))}
    </div>
  );
}

/** ปุ่มลิงก์แบบย่อ (บนการ์ด/กล่องลอย) — 1 ลิงก์ = เปิดเลย · หลายลิงก์ = เด้งรายการ */
export function TaskLinksButton({ links }: { links: TaskLink[] | null | undefined }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  if (!links?.length) return null;
  const cls = "inline-flex h-5 shrink-0 items-center rounded px-1 text-[10px] font-medium text-blue-700 hover:bg-blue-50";
  if (links.length === 1) {
    return <a href={links[0].url} target="_blank" rel="noopener noreferrer" title={`${linkLabel(links[0])} — ${links[0].url}`} draggable={false} className={cls}>🔗</a>;
  }
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((o) => !o)} title={`ลิงก์ ${links.length} อัน`} draggable={false} className={cls}>🔗{links.length}</button>
      <FloatingDropdown anchorRef={ref} open={open} onClose={() => setOpen(false)} minWidth={200} maxWidth={300}>
        <div className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-2xl"><TaskLinkList links={links} className="flex-col" /></div>
      </FloatingDropdown>
    </>
  );
}

