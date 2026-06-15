"use client";

/**
 * SearchableSelect — ของกลาง: dropdown ที่ค้นหาได้ (พิมพ์กรองรายการ)
 * ใช้แทน <select> เมื่อ option เยอะ เช่น เลือก table ปลายทางของ relation
 *
 * <SearchableSelect value={v} options={[{value,label,badge?,sub?}]} onChange={setV} />
 *
 * dropdown วาดผ่าน portal + position:fixed → ลอยทะลุกล่องที่มี overflow (ไม่โดนตัด/จม)
 * คำนวณตำแหน่งจากปุ่ม และเด้งขึ้นเองถ้าพื้นที่ด้านล่างไม่พอ
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption = { value: string; label: string; badge?: string; sub?: string; searchText?: string };

type Pos = { left: number; top: number; width: number; openUp: boolean };

export function SearchableSelect({
  value, options, onChange, placeholder = "— เลือก —", disabled, className,
}: {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<Pos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const cur = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(s) ||
      o.value.toLowerCase().includes(s) ||
      (o.sub ?? "").toLowerCase().includes(s) ||
      (o.searchText ?? "").toLowerCase().includes(s));
  }, [q, options]);

  const close = () => { setOpen(false); setQ(""); };

  // คำนวณตำแหน่ง dropdown จาก rect ของปุ่ม (เด้งขึ้นถ้าด้านล่างไม่พอ)
  const compute = useCallback(() => {
    const el = btnRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const PANEL_MAX = 320;   // ความสูงโดยประมาณ (input ค้นหา + รายการ)
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < PANEL_MAX && r.top > spaceBelow;
    setPos({ left: r.left, width: r.width, top: openUp ? r.top : r.bottom, openUp });
  }, []);

  useLayoutEffect(() => { if (open) compute(); }, [open, compute]);
  useEffect(() => {
    if (!open) return;
    const h = () => compute();
    window.addEventListener("scroll", h, true);   // capture → จับ scroll ของกล่องด้านในด้วย
    window.addEventListener("resize", h);
    return () => { window.removeEventListener("scroll", h, true); window.removeEventListener("resize", h); };
  }, [open, compute]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <button ref={btnRef} type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        className="w-full h-9 px-2 text-sm text-left border border-slate-200 rounded-md bg-white flex items-center gap-1 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-500">
        <span className="flex-1 min-w-0 truncate">
          {cur ? <>{cur.label}{cur.badge ? ` ${cur.badge}` : ""}</> : <span className="text-slate-400">{placeholder}</span>}
        </span>
        <span className="text-slate-400 text-xs">▾</span>
      </button>
      {open && !disabled && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[1000]" onClick={close} />
          <div className="fixed z-[1001] bg-white border border-slate-200 rounded-lg shadow-xl"
            style={{ left: pos.left, top: pos.top, width: pos.width, transform: pos.openUp ? "translateY(calc(-100% - 4px))" : "translateY(4px)" }}>
            <div className="p-2 border-b border-slate-100">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา…"
                className="w-full h-8 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">ไม่พบรายการ</div>}
              {filtered.map((o) => (
                <button key={o.value} type="button"
                  onClick={() => { onChange(o.value); close(); }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 ${o.value === value ? "bg-blue-100 font-medium" : ""}`}>
                  {o.label}{o.badge ? ` ${o.badge}` : ""}
                  {o.sub ? <span className="text-[11px] text-slate-400"> · {o.sub}</span> : null}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
