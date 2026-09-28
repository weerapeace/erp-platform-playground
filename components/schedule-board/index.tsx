"use client";

// ============================================================
// ScheduleBoard (ของกลาง) — ปฏิทินเดือน + กล่อง "ยังไม่ลงวันที่" + ลากวางเพื่อตั้งวัน
// รับข้อมูลอะไรก็ได้: ส่ง items + getDate + onSchedule + วิธี render การ์ด/ชิป เข้ามา
// ลากการ์ดจากกล่อง → วางบนวัน = onSchedule(item, "YYYY-MM-DD") · วางกลับกล่อง = onSchedule(item, null)
// ใช้ซ้ำได้: ผลิต (due_date), Design (วันนัด), QC (เดดไลน์) ฯลฯ
//
// layout (ไม่บังคับ — ใช้คู่กับของกลาง device-view):
//   ไม่ส่ง   = แบบเดิม (ดูความกว้างจอจริงด้วย lg:)
//   desktop  = ปฏิทินซ้าย กล่องขวา · ลากวางได้
//   tablet   = ปฏิทินบน กล่องล่าง (การ์ด 2 ต่อแถว) · ตั้งวันด้วยช่อง 📅 ใต้การ์ด (จอสัมผัสลากไม่ได้)
//   phone    = ช่องวันเป็น "จุด + จำนวน" แตะวัน = ดูรายการ · กล่องยังไม่ลงวันพับไว้ก่อน
// ============================================================
import { useMemo, useRef, useState } from "react";

const WEEK = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const dkey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const BACKLOG_PAGE = 30;   // จอสัมผัส: โชว์ทีละ 30 ใบ (กันมือถือหน่วงตอนมีเป็นร้อย)

export type SchedFilter = { value: string; label: string; color?: string };
export type SchedLayout = "desktop" | "tablet" | "phone";

export function ScheduleBoard<T extends { id: string }>({
  items, getDate, onSchedule, renderCard, renderChip,
  filters, getFilter, getSearchText, dayFooter, backlogTitle = "ยังไม่ลงวันที่", hint, maxPerDay = 3,
  layout, getDotColor,
}: {
  items: T[];
  getDate: (i: T) => string | null;
  onSchedule: (i: T, date: string | null) => void;
  renderCard: (i: T) => React.ReactNode;    // การ์ดในกล่อง backlog + แผงวันที่เลือก
  renderChip: (i: T) => React.ReactNode;     // ชิปเล็กในช่องวัน
  filters?: SchedFilter[];
  getFilter?: (i: T) => string | undefined;
  getSearchText?: (i: T) => string;          // ข้อความให้ค้นหาในกล่อง backlog
  dayFooter?: (items: T[]) => React.ReactNode;   // สรุปท้ายช่องวัน (เช่น จำนวนรวม)
  backlogTitle?: string;
  hint?: string;
  maxPerDay?: number;
  layout?: SchedLayout;
  getDotColor?: (i: T) => string | undefined;    // สีจุดในช่องวัน (โหมดมือถือ)
}) {
  const today = new Date();
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: today.getFullYear(), m: today.getMonth() });
  const [flt, setFlt] = useState("all");
  const [overKey, setOverKey] = useState<string | null>(null);
  const [q, setQ] = useState("");                          // ค้นหาในกล่อง backlog
  const [selDay, setSelDay] = useState<string | null>(null);   // วันที่กดเลือก (dkey)
  const [backlogOpen, setBacklogOpen] = useState<boolean | null>(null);   // null = ค่าเริ่มต้นตาม layout
  const [backlogLimit, setBacklogLimit] = useState(BACKLOG_PAGE);
  const dragRef = useRef<T | null>(null);

  const isPhone = layout === "phone";
  const touch = layout === "phone" || layout === "tablet";   // ตั้งวันด้วยช่องวันที่แทนการลาก
  const showBacklog = backlogOpen ?? !isPhone;               // มือถือพับไว้ก่อน

  const filtered = useMemo(
    () => (!filters || flt === "all") ? items : items.filter((it) => getFilter?.(it) === flt),
    [items, filters, flt, getFilter],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const it of filtered) {
      const d = getDate(it); if (!d) continue;
      const k = dkey(new Date(d + "T00:00:00"));
      (m.get(k) ?? m.set(k, []).get(k)!).push(it);
    }
    return m;
  }, [filtered, getDate]);
  const backlog = useMemo(() => filtered.filter((it) => !getDate(it)), [filtered, getDate]);
  const backlogShown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t && getSearchText ? backlog.filter((it) => getSearchText(it).toLowerCase().includes(t)) : backlog;
  }, [backlog, q, getSearchText]);
  const backlogVisible = touch ? backlogShown.slice(0, backlogLimit) : backlogShown;
  const selDayItems = selDay ? (byDay.get(selDay) ?? []) : [];

  const cells = useMemo(() => {
    const offset = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7;   // จันทร์ = 0
    const dim = new Date(ym.y, ym.m + 1, 0).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < offset; i++) arr.push(null);
    for (let d = 1; d <= dim; d++) arr.push(new Date(ym.y, ym.m, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [ym]);

  const move = (delta: number) => setYm(({ y, m }) => { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const isToday = (d: Date) => dkey(d) === dkey(today);
  const drop = (dateStr: string | null) => { const it = dragRef.current; dragRef.current = null; setOverKey(null); if (it) onSchedule(it, dateStr); };
  const dragProps = (it: T) => touch ? {} : ({
    draggable: true,
    onDragStart: () => { dragRef.current = it; },
    onDragEnd: () => { dragRef.current = null; setOverKey(null); },
    className: "cursor-grab active:cursor-grabbing",
  });
  const dropProps = (key: string, dateStr: string | null) => touch ? {} : ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (overKey !== key) setOverKey(key); },
    onDragLeave: () => setOverKey((k) => (k === key ? null : k)),
    onDrop: () => drop(dateStr),
  });

  // การ์ด 1 ใบ (กล่อง backlog + แผงวันที่เลือก) — จอสัมผัสมีช่อง 📅 ตั้ง/เปลี่ยนวัน แทนการลาก
  const card = (it: T) => {
    const d = getDate(it);
    return (
      <div key={it.id} {...dragProps(it)}>
        {renderCard(it)}
        {touch && (
          <div className="mt-1 flex items-center gap-1.5">
            <label className="flex-1 min-w-0 flex items-center gap-1.5 h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-500">
              <span className="shrink-0">📅 {d ? "เปลี่ยนวัน" : "ลงวัน"}</span>
              <input type="date" value={d ?? ""} onChange={(e) => onSchedule(it, e.target.value || null)}
                className="flex-1 min-w-0 bg-transparent text-slate-700 focus:outline-none" />
            </label>
            {d && <button type="button" onClick={() => onSchedule(it, null)} className="h-9 px-2.5 shrink-0 rounded-lg border border-slate-200 bg-white text-xs text-slate-500 hover:bg-slate-50">เอาวันออก</button>}
          </div>
        )}
      </div>
    );
  };

  const wrapCls = layout === undefined ? "flex flex-col lg:flex-row gap-3" : layout === "desktop" ? "flex flex-row gap-3" : "flex flex-col gap-3";
  const backlogWidth = layout === undefined ? "lg:w-72" : layout === "desktop" ? "w-72" : "w-full";
  const cellMin = isPhone ? "min-h-[50px]" : "min-h-[74px]";

  return (
    <div className={wrapCls}>
      {/* ปฏิทิน */}
      <div className="flex-1 min-w-0">
        {filters && filters.length > 1 && (
          <div className={`flex items-center gap-1.5 mb-2 ${isPhone ? "overflow-x-auto pb-0.5 [scrollbar-width:none]" : "flex-wrap"}`}>
            {filters.map((f) => (
              <button key={f.value} onClick={() => setFlt(f.value)}
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 rounded-full border transition-colors whitespace-nowrap shrink-0 ${touch ? "h-8" : "py-1"} ${flt === f.value ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {f.color && <span className="w-2 h-2 rounded-full" style={{ background: flt === f.value ? "#fff" : f.color }} />}{f.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 mb-2">
          <button onClick={() => move(-1)} className={`${touch ? "h-9 w-9" : "h-8 w-8"} shrink-0 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50`}>‹</button>
          <h3 className={`text-base font-bold text-slate-800 text-center ${isPhone ? "flex-1 min-w-0 truncate" : "w-44"}`}>{new Date(ym.y, ym.m, 1).toLocaleDateString("th-TH", { year: "numeric", month: "long" })}</h3>
          <button onClick={() => move(1)} className={`${touch ? "h-9 w-9" : "h-8 w-8"} shrink-0 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50`}>›</button>
          <button onClick={() => setYm({ y: today.getFullYear(), m: today.getMonth() })} className={`ml-1 shrink-0 px-3 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 ${touch ? "h-9" : "h-8"}`}>เดือนนี้</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400 mb-1">{WEEK.map((w) => <div key={w}>{w}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className={cellMin} />;
            const key = ymd(d);
            const dayItems = byDay.get(dkey(d)) ?? [];
            const on = overKey === key;
            const sel = selDay === dkey(d);
            return (
              <div key={i}
                onClick={() => setSelDay((s) => (s === dkey(d) ? null : dkey(d)))}
                {...dropProps(key, key)}
                className={`${cellMin} rounded-lg border p-1 transition-colors cursor-pointer ${on ? "border-blue-400 bg-blue-50 ring-1 ring-blue-300" : sel ? "border-blue-400 ring-2 ring-blue-300 bg-white" : isToday(d) ? "border-blue-300 bg-blue-50/40" : "border-slate-100 bg-white hover:bg-slate-50"}`}>
                {isPhone ? (
                  // มือถือ: ช่องแคบเกินกว่าจะอ่านชื่อ → จุดสี + จำนวน · แตะวันเพื่อดูรายการ
                  <div className="flex flex-col items-center gap-0.5">
                    <div className={`text-[11px] ${isToday(d) ? "text-blue-700 font-semibold" : "text-slate-400"}`}>{d.getDate()}</div>
                    {dayItems.length > 0 && <>
                      <div className="flex items-center gap-0.5">
                        {dayItems.slice(0, 3).map((it) => <span key={it.id} className="w-1.5 h-1.5 rounded-full" style={{ background: getDotColor?.(it) ?? "#3b82f6" }} />)}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-600 tabular-nums leading-none">{dayItems.length}</div>
                    </>}
                  </div>
                ) : (<>
                  <div className={`text-[11px] mb-0.5 ${isToday(d) ? "text-blue-700 font-semibold" : "text-slate-400"}`}>{d.getDate()}</div>
                  <div className="space-y-0.5">
                    {dayItems.slice(0, maxPerDay).map((it) => <div key={it.id} {...dragProps(it)} onClick={(e) => e.stopPropagation()}>{renderChip(it)}</div>)}
                    {dayItems.length > maxPerDay && <div className="text-[10px] text-slate-400 px-1">+{dayItems.length - maxPerDay} อื่น ๆ</div>}
                  </div>
                  {dayFooter && dayItems.length > 0 && <div className="mt-0.5">{dayFooter(dayItems)}</div>}
                </>)}
              </div>
            );
          })}
        </div>
        {hint && <p className="text-[11px] text-slate-400 mt-2">💡 {hint}</p>}

        {/* แผงรายการของ "วันที่กดเลือก" */}
        {selDay && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h4 className="text-sm font-bold text-slate-700">📅 {(() => { const [yy, mm, dd] = selDay.split("-").map(Number); return new Date(yy, mm, dd).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); })()} · {selDayItems.length} รายการ</h4>
              <button onClick={() => setSelDay(null)} className="text-xs text-slate-400 hover:text-slate-600 shrink-0">ปิด ✕</button>
            </div>
            {selDayItems.length === 0
              ? <p className="text-sm text-slate-400">ไม่มีรายการวันนี้</p>
              : <div className="grid gap-2.5" style={{ gridTemplateColumns: isPhone ? "minmax(0, 1fr)" : "repeat(auto-fill, minmax(240px, 1fr))" }}>{selDayItems.map(card)}</div>}
          </div>
        )}
      </div>

      {/* กล่อง "ยังไม่ลงวันที่" */}
      <div
        {...dropProps("backlog", null)}
        className={`${backlogWidth} shrink-0 rounded-xl border p-2 transition-colors ${overKey === "backlog" ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-slate-50/60"}`}>
        <div className={`flex items-center gap-2 px-1 ${showBacklog ? "mb-2" : ""} ${touch ? "cursor-pointer min-h-[36px]" : ""}`}
          onClick={touch ? () => setBacklogOpen(!showBacklog) : undefined}>
          <span className="text-sm font-semibold text-slate-700">📥 {backlogTitle}</span>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{backlog.length}</span>
          {touch && <span className="text-xs text-slate-400 w-3">{showBacklog ? "▾" : "▸"}</span>}
        </div>
        {showBacklog && <>
          {getSearchText && backlog.length > 0 && (
            <div className="relative mb-2 px-0.5">
              <input value={q} onChange={(e) => { setQ(e.target.value); setBacklogLimit(BACKLOG_PAGE); }} placeholder="🔍 ค้นหา SKU / ชื่อ / MO / แบรนด์"
                className={`w-full pl-2 pr-6 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${touch ? "h-9 text-sm" : "h-8 text-xs"}`} />
              {q && <button onClick={() => setQ("")} className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs">✕</button>}
            </div>
          )}
          {backlog.length === 0
            ? <div className="text-center text-xs text-slate-400 py-8">ลงวันครบแล้ว 🎉</div>
            : backlogShown.length === 0
              ? <div className="text-center text-xs text-slate-400 py-8">ไม่พบรายการที่ค้นหา</div>
              : touch ? (
                <>
                  <div className={`grid gap-2.5 ${isPhone ? "grid-cols-1" : "grid-cols-2"}`}>{backlogVisible.map(card)}</div>
                  {backlogShown.length > backlogVisible.length && (
                    <button type="button" onClick={() => setBacklogLimit((n) => n + BACKLOG_PAGE)}
                      className="mt-2 w-full h-9 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50">
                      ดูเพิ่มอีก {Math.min(BACKLOG_PAGE, backlogShown.length - backlogVisible.length)} ใบ (เหลือ {backlogShown.length - backlogVisible.length})
                    </button>
                  )}
                </>
              ) : (
                <div className="space-y-1.5 max-h-[58vh] overflow-y-auto pr-0.5">
                  {backlogVisible.map(card)}
                </div>
              )}
        </>}
      </div>
    </div>
  );
}
