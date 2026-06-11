"use client";

/**
 * SearchableSelect — ของกลาง: dropdown ที่ค้นหาได้ (พิมพ์กรองรายการ)
 * ใช้แทน <select> เมื่อ option เยอะ เช่น เลือก table ปลายทางของ relation
 *
 * <SearchableSelect value={v} options={[{value,label,badge?,sub?}]} onChange={setV} />
 */
import { useMemo, useState } from "react";

export type SelectOption = { value: string; label: string; badge?: string; sub?: string; searchText?: string };

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

  return (
    <div className={`relative ${className ?? ""}`}>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        className="w-full h-9 px-2 text-sm text-left border border-slate-200 rounded-md bg-white flex items-center gap-1 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-500">
        <span className="flex-1 min-w-0 truncate">
          {cur ? <>{cur.label}{cur.badge ? ` ${cur.badge}` : ""}</> : <span className="text-slate-400">{placeholder}</span>}
        </span>
        <span className="text-slate-400 text-xs">▾</span>
      </button>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl">
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
        </>
      )}
    </div>
  );
}
