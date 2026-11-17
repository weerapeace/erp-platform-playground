"use client";

// ============================================================
// DateRangeInput (ของกลาง) — เลือก "ช่วงวันที่" ในปฏิทินเดียว
//   คลิกวันแรก → คลิกวันสุดท้าย (หรือกดค้างแล้วลากจากวันแรกไปวันสุดท้าย) · คลิกกลับด้านก็ได้ เรียงให้เอง
//   ปุ่มสำเร็จรูป: วันนี้ / 7 วันล่าสุด / 30 วันล่าสุด / เดือนนี้ / เดือนก่อน (เวลาไทย)
//   ค่า = { from, to } รูปแบบ "YYYY-MM-DD" (เหมือน DateInput) · ว่าง = ""
// ใช้แทนช่อง "ตั้งแต่ [DateInput] ถึง [DateInput]" 2 ช่อง:
//   <DateRangeInput value={{ from, to }} onChange={(r) => { setFrom(r.from); setTo(r.to); }} />
// แผงลอยผ่าน portal (ไม่โดนกรอบตัด) · Esc ปิดทีละชั้น · มือถือ = แผงเต็มความกว้าง
// ============================================================
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDate, todayBangkok } from "@/lib/date";
import { inRange, monthGrid, orderRange, rangeDays, rangePresets, TH_MONTHS, TH_WEEKDAYS, type YmdRange } from "@/lib/date-range";
import { useEscLayer } from "@/components/modal/esc-layer";

export function DateRangeInput({ value, onChange, disabled, placeholder = "เลือกช่วงวันที่", className = "", allowClear = true }: {
  value: { from: string | null | undefined; to: string | null | undefined };
  onChange: (r: YmdRange) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  allowClear?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const init = value.from || todayBangkok();
  const [view, setView] = useState<{ y: number; m: number }>({ y: +init.slice(0, 4), m: +init.slice(5, 7) - 1 });
  const [anchor, setAnchor] = useState<string | null>(null);   // คลิกวันแรกแล้ว รอวันสุดท้าย
  const [hover, setHover] = useState<string | null>(null);
  const dragging = useRef(false);
  useEscLayer(open, () => setOpen(false));

  const compute = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect(); if (!r) return;
    const W = 300, H = 380, below = window.innerHeight - r.bottom;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)), top: below < H && r.top > below ? r.top : r.bottom, up: below < H && r.top > below });
  }, []);
  useLayoutEffect(() => { if (open) compute(); }, [open, compute]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { const t = e.target as Node; if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false); };
    const onUp = () => { dragging.current = false; };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("resize", compute);
    return () => { document.removeEventListener("pointerdown", onDown, true); window.removeEventListener("pointerup", onUp); window.removeEventListener("resize", compute); };
  }, [open, compute]);

  const openPanel = () => {
    if (disabled) return;
    const v = value.from || todayBangkok();
    setView({ y: +v.slice(0, 4), m: +v.slice(5, 7) - 1 });
    setAnchor(null); setHover(null); setOpen(true);
  };
  const finish = (r: YmdRange) => { onChange(r); setAnchor(null); setHover(null); setOpen(false); };
  const pick = (ymd: string) => {
    if (!anchor) { setAnchor(ymd); setHover(ymd); return; }
    finish(orderRange(anchor, ymd));
  };
  const shift = (d: number) => setView((v) => { const m = v.m + d; return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }; });

  const shownRange: YmdRange | null = anchor ? orderRange(anchor, hover ?? anchor) : value.from && value.to ? { from: value.from, to: value.to } : null;
  const today = todayBangkok();
  const label = value.from && value.to ? (value.from === value.to ? formatDate(value.from) : `${formatDate(value.from)} – ${formatDate(value.to)}`) : "";

  return (
    <div className={`relative inline-flex ${className}`}>
      <button ref={btnRef} type="button" disabled={disabled} onClick={() => (open ? setOpen(false) : openPanel())}
        className="h-9 w-full min-w-[13rem] px-3 text-sm text-left border border-slate-200 rounded bg-white flex items-center gap-2 disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500">
        <span aria-hidden>📅</span>
        <span className={`flex-1 truncate tabular-nums ${label ? "" : "text-slate-400"}`}>{label || placeholder}</span>
        {label && allowClear && !disabled && (
          <span role="button" aria-label="ล้างช่วงวันที่" onClick={(e) => { e.stopPropagation(); onChange({ from: "", to: "" }); }} className="text-slate-300 hover:text-red-500">✕</span>
        )}
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} role="dialog" aria-label="เลือกช่วงวันที่"
          className="fixed z-[1001] w-[300px] max-w-[calc(100vw-16px)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl select-none"
          style={{ left: pos.left, top: pos.top, transform: pos.up ? "translateY(calc(-100% - 4px))" : "translateY(4px)" }}>
          <div className="mb-2 flex flex-wrap gap-1">
            {rangePresets().map((p) => (
              <button key={p.key} type="button" onClick={() => finish(p.range)}
                className="h-7 rounded-md bg-slate-100 px-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700">{p.label}</button>
            ))}
          </div>
          <div className="mb-1 flex items-center justify-between">
            <button type="button" onClick={() => shift(-1)} className="h-8 w-8 rounded-md hover:bg-slate-100" aria-label="เดือนก่อน">‹</button>
            <span className="text-sm font-medium text-slate-700">{TH_MONTHS[view.m]} {view.y}</span>
            <button type="button" onClick={() => shift(1)} className="h-8 w-8 rounded-md hover:bg-slate-100" aria-label="เดือนถัดไป">›</button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] text-slate-400">{TH_WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-y-0.5 text-center text-sm" onPointerLeave={() => { if (!anchor) setHover(null); }}>
            {monthGrid(view.y, view.m).flat().map((ymd) => {
              const outside = +ymd.slice(5, 7) - 1 !== view.m;
              const isFrom = shownRange?.from === ymd, isTo = shownRange?.to === ymd;
              const within = inRange(ymd, shownRange);
              return (
                <button key={ymd} type="button"
                  onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); dragging.current = true; if (!anchor) { setAnchor(ymd); setHover(ymd); } }}
                  onPointerEnter={() => { if (anchor) setHover(ymd); }}
                  onPointerUp={() => {
                    if (!dragging.current) return;
                    dragging.current = false;
                    // ลากไปวันอื่นแล้วปล่อย = จบช่วง · ปล่อยที่วันเดิม = รอคลิกวันที่สอง
                    if (anchor && hover && hover !== anchor) finish(orderRange(anchor, hover));
                    else if (anchor && ymd !== anchor) pick(ymd);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(ymd); } }}
                  title={formatDate(ymd)}
                  className={`h-9 tabular-nums ${within ? "bg-blue-50" : ""} ${isFrom ? "rounded-l-md" : ""} ${isTo ? "rounded-r-md" : ""}
                    ${isFrom || isTo ? "bg-blue-600 text-white font-semibold" : outside ? "text-slate-300" : "text-slate-700 hover:bg-slate-100"}
                    ${ymd === today && !(isFrom || isTo) ? "ring-1 ring-inset ring-blue-300 rounded-md" : ""}`}>
                  {+ymd.slice(8, 10)}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>{anchor ? "คลิกวันสุดท้าย (หรือลาก)" : shownRange ? `${rangeDays(shownRange)} วัน` : "คลิกวันแรก แล้ววันสุดท้าย"}</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 hover:bg-slate-100">ปิด</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
