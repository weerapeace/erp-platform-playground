"use client";

// ============================================================
// ScheduleBoard (ของกลาง) — ปฏิทิน + กล่อง "ยังไม่ลงวันที่" + ลากวางเพื่อตั้งวัน
// รับข้อมูลอะไรก็ได้: ส่ง items + getDate + onSchedule + วิธี render การ์ด/ชิป เข้ามา
// ลากการ์ดจากกล่อง → วางบนวัน = onSchedule(item, "YYYY-MM-DD") · วางกลับกล่อง = onSchedule(item, null)
// ใช้ซ้ำได้: ผลิต (due_date), Design (วันนัด), QC (เดดไลน์), งาน, แผนทีม, ปฏิทินรวม ฯลฯ
//
// layout (ไม่บังคับ — ใช้คู่กับของกลาง device-view):
//   ไม่ส่ง   = แบบเดิม (ดูความกว้างจอจริงด้วย lg:)
//   desktop  = ปฏิทินซ้าย กล่องขวา · ลากวางได้
//   tablet   = ปฏิทินบน กล่องล่าง (การ์ด 2 ต่อแถว) · ตั้งวันด้วยช่อง 📅 ใต้การ์ด (จอสัมผัสลากไม่ได้)
//   phone    = ช่องวันเป็น "จุด + จำนวน" แตะวัน = ดูรายการ · กล่องยังไม่ลงวันพับไว้ก่อน
//
// เครื่องมือในตัว (ทุกหน้าที่ใช้ได้เลย · 2026-11-20 เจ้าของขอ):
//   มุมมอง เดือน / สัปดาห์ / รายการ · ค้นหา (ต้องส่ง getSearchText) · "ความแน่น" ระบายสีวันงานเยอะ
//   "+N" กดได้ → ป๊อปรายการทั้งวัน (ลากออกไปวันอื่นได้) · วันหยุดราชการไทย (lib/thai-holidays) · พิมพ์/PDF
//   เลือกหลายรายการ → เลื่อนทั้งชุด −1/+1/+7 วัน (onScheduleMany ถ้ามี ไม่งั้นเรียก onSchedule ทีละใบ)
//   ป๊อปดูงาน: ส่ง renderPopView → กดชิป/การ์ด = ป๊อปเล็กข้างรายการ (แทน onClick เดิมของชิป)
//   กดช่องวัน = ป๊อป ERPModal รายการทั้งวัน (การ์ดมีรูป · ส่ง renderDayItem ถ้าอยากให้ต่างจากการ์ดกล่อง) — ทุกแท็บปฏิทินใช้ร่วม (เจ้าของสั่ง 2026-11-20)
//   fill = ช่องวันยืดเต็มความสูงจอ (ใช้คู่ของกลาง FullscreenStage ตอนเต็มจอ) · fillOffset = ความสูงส่วนหัวที่กันไว้ (px)
// ============================================================
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { thaiHolidays } from "@/lib/thai-holidays";
import { ERPModal } from "@/components/modal";

const WEEK = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (s: string, n: number) => { const [y, m, d] = s.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };
const thDate = (s: string, o: Intl.DateTimeFormatOptions) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("th-TH", o); };
const BACKLOG_PAGE = 30;   // จอสัมผัส: โชว์ทีละ 30 ใบ (กันมือถือหน่วงตอนมีเป็นร้อย)

export type SchedFilter = { value: string; label: string; color?: string };
export type SchedLayout = "desktop" | "tablet" | "phone";
export type SchedView = "month" | "week" | "list";
type Pop<T> = { kind: "item"; item: T; x: number; y: number } | { kind: "day"; date: string; x: number; y: number };

const VIEW_KEY = "erp_sched_view";
const HEAT_KEY = "erp_sched_heat";
const readLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ไม่มีที่เก็บ = ไม่จำ */ } };

export function ScheduleBoard<T extends { id: string }>({
  items, getDate, onSchedule, renderCard, renderChip,
  filters, getFilter, getSearchText, dayFooter, backlogTitle = "ยังไม่ลงวันที่", hint, maxPerDay = 3,
  layout, getDotColor, onMonthChange, onAddOnDay, renderPopView, onScheduleMany, holidays = true, printTitle,
  renderDayItem, fill = false, fillOffset = 190, toolbarExtra, dayActions,
}: {
  items: T[];
  getDate: (i: T) => string | null;
  onSchedule: (i: T, date: string | null) => void;
  renderCard: (i: T) => ReactNode;    // การ์ดในกล่อง backlog + แผงวันที่เลือก + มุมมองรายการ
  renderChip: (i: T) => ReactNode;     // ชิปเล็กในช่องวัน
  filters?: SchedFilter[];
  getFilter?: (i: T) => string | undefined;
  getSearchText?: (i: T) => string;          // ข้อความให้ค้นหา (ส่งมา = มีช่องค้นหาทั้งปฏิทิน + กล่อง)
  dayFooter?: (items: T[]) => ReactNode;   // สรุปท้ายช่องวัน (เช่น จำนวนรวม)
  backlogTitle?: string;
  hint?: string;
  maxPerDay?: number;
  layout?: SchedLayout;
  getDotColor?: (i: T) => string | undefined;    // สีจุดในช่องวัน (โหมดมือถือ)
  onMonthChange?: (y: number, m: number) => void;   // เลื่อนเดือน → ให้หน้าโหลดข้อมูลช่วงนั้น (m = 0-11)
  onAddOnDay?: (date: string) => void;              // ปุ่ม + มุมช่องวัน (จอ PC) / ในแผงวันที่เลือก → เพิ่มรายการวันนั้น
  renderPopView?: (i: T, close: () => void) => ReactNode;   // ป๊อปดูงาน (กดชิป/การ์ด)
  onScheduleMany?: (items: T[], deltaDays: number | null) => void;   // เลื่อนทั้งชุด (null = เอาวันออก)
  holidays?: boolean;     // โชว์วันหยุดราชการไทย (ค่าเริ่มต้น เปิด)
  printTitle?: string;    // หัวกระดาษตอนพิมพ์
  renderDayItem?: (i: T) => ReactNode;   // แถวในป๊อปรายการวัน (ไม่ส่ง = ใช้ renderCard)
  fill?: boolean;         // ช่องวันยืดเต็มความสูงจอ (โหมดเต็มจอ)
  fillOffset?: number;    // ความสูงส่วนบนที่กันไว้ตอน fill (px)
  toolbarExtra?: ReactNode; // ปุ่มเพิ่มของหน้าในแถบเครื่องมือปฏิทิน (เช่น ตั้งค่าการ์ด · เต็มจอ)
  dayActions?: (items: T[], date: string) => ReactNode;   // ปุ่มท้ายป๊อปวัน (เช่น ยืนยันวันกะทั้งวัน)
}) {
  const today = new Date();
  const todayKey = ymd(today);
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: today.getFullYear(), m: today.getMonth() });
  const [weekStart, setWeekStart] = useState(() => addDays(todayKey, -((today.getDay() + 6) % 7)));
  const [view, setViewState] = useState<SchedView>("month");
  const [heat, setHeat] = useState(false);
  const [flt, setFlt] = useState("all");
  const [overKey, setOverKey] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selDay, setSelDay] = useState<string | null>(null);   // วันที่กดเลือก (YYYY-MM-DD)
  const [backlogOpen, setBacklogOpen] = useState<boolean | null>(null);
  const [backlogLimit, setBacklogLimit] = useState(BACKLOG_PAGE);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [pop, setPop] = useState<Pop<T> | null>(null);
  const [dayPick, setDayPick] = useState<T | null>(null);   // รายการที่กดดูในป๊อปวัน (มี renderPopView = โชว์ในป๊อปเดียวกัน ไม่ซ้อนป๊อป)
  const dragRef = useRef<T | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const isPhone = layout === "phone";
  const touch = layout === "phone" || layout === "tablet";
  const showBacklog = backlogOpen ?? !isPhone;

  useEffect(() => {
    const v = readLS(VIEW_KEY);
    if (v === "month" || v === "week" || v === "list") setViewState(v);
    setHeat(readLS(HEAT_KEY) === "1");
  }, []);
  const setView = (v: SchedView) => { setViewState(v); writeLS(VIEW_KEY, v); };
  // เดือนที่กำลังดู (สัปดาห์ = เดือนของวันแรกในสัปดาห์) → บอกหน้าให้โหลดข้อมูล
  const viewYm = view === "week" ? { y: Number(weekStart.slice(0, 4)), m: Number(weekStart.slice(5, 7)) - 1 } : ym;
  useEffect(() => { onMonthChange?.(viewYm.y, viewYm.m); }, [viewYm.y, viewYm.m]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ปิดป๊อปเมื่อกดข้างนอก / Esc
  useEffect(() => {
    if (!pop) return;
    const down = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) setPop(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setPop(null); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [pop]);

  const hol = useMemo(() => (holidays ? { ...thaiHolidays(viewYm.y - 1), ...thaiHolidays(viewYm.y), ...thaiHolidays(viewYm.y + 1) } : {}) as Record<string, string>, [holidays, viewYm.y]);

  const filtered = useMemo(() => {
    let arr = (!filters || flt === "all") ? items : items.filter((it) => getFilter?.(it) === flt);
    const t = q.trim().toLowerCase();
    if (t && getSearchText) arr = arr.filter((it) => getSearchText(it).toLowerCase().includes(t));
    return arr;
  }, [items, filters, flt, getFilter, q, getSearchText]);

  const byDay = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const it of filtered) {
      const d = getDate(it); if (!d) continue;
      const k = d.slice(0, 10);
      (m.get(k) ?? m.set(k, []).get(k)!).push(it);
    }
    return m;
  }, [filtered, getDate]);
  const backlog = useMemo(() => filtered.filter((it) => !getDate(it)), [filtered, getDate]);
  const backlogVisible = touch ? backlog.slice(0, backlogLimit) : backlog;
  const selDayItems = selDay ? (byDay.get(selDay) ?? []) : [];

  const cells = useMemo(() => {
    if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const offset = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7;   // จันทร์ = 0
    const dim = new Date(ym.y, ym.m + 1, 0).getDate();
    const arr: (string | null)[] = [];
    for (let i = 0; i < offset; i++) arr.push(null);
    for (let d = 1; d <= dim; d++) arr.push(ymd(new Date(ym.y, ym.m, d)));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [ym, view, weekStart]);
  const listDays = useMemo(() => {
    const pre = `${ym.y}-${pad2(ym.m + 1)}`;
    return [...byDay.keys()].filter((k) => k.startsWith(pre)).sort();
  }, [byDay, ym]);

  const move = (delta: number) => {
    if (view === "week") { setWeekStart((w) => addDays(w, 7 * delta)); return; }
    setYm(({ y, m }) => { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  };
  const goToday = () => { setYm({ y: today.getFullYear(), m: today.getMonth() }); setWeekStart(addDays(todayKey, -((today.getDay() + 6) % 7))); };
  const title = view === "week"
    ? `${thDate(weekStart, { day: "numeric", month: "short" })} – ${thDate(addDays(weekStart, 6), { day: "numeric", month: "short", year: "numeric" })}`
    : new Date(ym.y, ym.m, 1).toLocaleDateString("th-TH", { year: "numeric", month: "long" });

  const drop = (dateStr: string | null) => { const it = dragRef.current; dragRef.current = null; setOverKey(null); if (it) onSchedule(it, dateStr); };
  const dragProps = (it: T) => (touch || selecting) ? {} : ({
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

  // จุดวางป๊อป (เทียบกับกล่องปฏิทิน)
  const anchorOf = (el: Element) => {
    const r = el.getBoundingClientRect(), root = rootRef.current?.getBoundingClientRect();
    const w = root?.width ?? 0;
    return { x: Math.max(0, Math.min((r.left - (root?.left ?? 0)), w - 300)), y: r.bottom - (root?.top ?? 0) + 4 };
  };
  const togglePick = (it: T) => setPicked((cur) => { const n = new Set(cur); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; });
  // กดชิป/การ์ด: โหมดเลือก = ติ๊ก · มีป๊อปดูงาน = เปิดป๊อป · ไม่งั้นปล่อยให้ onClick เดิมของชิปทำงาน
  const clickCapture = (it: T) => (e: React.MouseEvent) => {
    if (selecting) { e.preventDefault(); e.stopPropagation(); togglePick(it); return; }
    if (renderPopView) { e.preventDefault(); e.stopPropagation(); setPop({ kind: "item", item: it, ...anchorOf(e.currentTarget) }); }
  };
  // กดรายการในป๊อปวัน: มีป๊อปดูงาน = เปิดในป๊อปเดียวกัน · ไม่งั้นปล่อย onClick เดิม (เช่น เปิดลิ้นชักใบงาน)
  const dayClick = (it: T) => (e: React.MouseEvent) => {
    if (renderPopView) { e.preventDefault(); e.stopPropagation(); setDayPick(it); return; }
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;   // ปุ่มในการ์ด (เช่น ยืนยันนัดส่ง) ทำงานในป๊อปต่อ
    setSelDay(null);   // เปิดลิ้นชัก/หน้ารายละเอียดของหน้านั้นแทน (กันป๊อปซ้อนป๊อป)
  };
  const pickedItems = useMemo(() => items.filter((i) => picked.has(i.id)), [items, picked]);
  const shiftPicked = (delta: number | null) => {
    const list = delta === null ? pickedItems : pickedItems.filter((i) => !!getDate(i));
    if (!list.length) return;
    if (onScheduleMany) onScheduleMany(list, delta);
    else for (const it of list) { const d = getDate(it); onSchedule(it, delta === null ? null : addDays(d!.slice(0, 10), delta)); }
  };
  const exitSelect = () => { setSelecting(false); setPicked(new Set()); };

  const chipWrap = (it: T) => (
    <div key={it.id} {...dragProps(it)} onClickCapture={clickCapture(it)} onClick={(e) => e.stopPropagation()}
      className={`${(dragProps(it) as { className?: string }).className ?? ""} relative ${selecting && picked.has(it.id) ? "rounded ring-2 ring-blue-500" : ""}`}>
      {selecting && <span className={`pointer-events-none absolute -left-0.5 -top-0.5 z-[1] h-3 w-3 rounded-sm border text-[8px] leading-[10px] text-white text-center ${picked.has(it.id) ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"}`}>{picked.has(it.id) ? "✓" : ""}</span>}
      {renderChip(it)}
    </div>
  );

  // การ์ด 1 ใบ (กล่อง backlog + แผงวันที่เลือก + รายการ) — จอสัมผัสมีช่อง 📅 ตั้ง/เปลี่ยนวัน แทนการลาก
  const card = (it: T) => {
    const d = getDate(it);
    return (
      <div key={it.id} {...dragProps(it)} onClickCapture={clickCapture(it)} className={`${(dragProps(it) as { className?: string }).className ?? ""} ${selecting && picked.has(it.id) ? "rounded-lg ring-2 ring-blue-500" : ""}`}>
        {renderCard(it)}
        {touch && !selecting && (
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

  const heatCls = (n: number) => !heat || n < 3 ? "" : n >= 8 ? "!bg-rose-100" : n >= 5 ? "!bg-amber-100" : "!bg-amber-50";
  const wrapCls = layout === undefined ? "flex flex-col lg:flex-row gap-3" : layout === "desktop" ? "flex flex-row gap-3" : "flex flex-col gap-3";
  const backlogWidth = layout === undefined ? "lg:w-72" : layout === "desktop" ? "w-72" : "w-full";
  const cellMin = view === "week" ? "min-h-[220px]" : isPhone ? "min-h-[50px]" : "min-h-[74px]";
  // เต็มจอ: แบ่งความสูงจอให้ทุกแถวของเดือนเท่า ๆ กัน (ไม่ต่ำกว่าค่าเดิม)
  const fillStyle = fill && view === "month" && !isPhone ? { minHeight: `max(74px, calc((100vh - ${fillOffset}px) / ${Math.max(4, cells.length / 7)}))` } : undefined;
  const perDay = view === "week" ? 999 : fill && !isPhone ? Math.max(maxPerDay, 6) : maxPerDay;
  const btnH = touch ? "h-9" : "h-8";
  const seg = (on: boolean) => `px-2.5 ${touch ? "h-8" : "h-7"} text-xs rounded-md ${on ? "bg-white text-slate-800 shadow-sm font-medium" : "text-slate-500 hover:text-slate-700"}`;

  const dayCell = (key: string | null, i: number) => {
    if (!key) return <div key={i} className={cellMin} style={fillStyle} />;
    const dayItems = byDay.get(key) ?? [];
    const on = overKey === key, sel = selDay === key, isToday = key === todayKey, h = hol[key];
    const num = Number(key.slice(8, 10));
    return (
      <div key={key}
        onClick={() => setSelDay((s) => (s === key ? null : key))}
        {...dropProps(key, key)}
        style={fillStyle}
        className={`${cellMin} min-w-0 rounded-lg border p-1 transition-colors cursor-pointer ${on ? "border-blue-400 bg-blue-50 ring-1 ring-blue-300" : sel ? "border-blue-400 ring-2 ring-blue-300 bg-white" : isToday ? "border-blue-300 bg-blue-50/40" : "border-slate-100 bg-white hover:bg-slate-50"} ${heatCls(dayItems.length)}`}>
        {isPhone && view !== "week" ? (
          <div className="flex flex-col items-center gap-0.5">
            <div className={`text-[11px] ${isToday ? "text-blue-700 font-semibold" : h ? "text-rose-500" : "text-slate-400"}`}>{num}</div>
            {dayItems.length > 0 && <>
              <div className="flex items-center gap-0.5">
                {dayItems.slice(0, 3).map((it) => <span key={it.id} className="w-1.5 h-1.5 rounded-full" style={{ background: getDotColor?.(it) ?? "#3b82f6" }} />)}
              </div>
              <div className="text-[10px] font-semibold text-slate-600 tabular-nums leading-none">{dayItems.length}</div>
            </>}
          </div>
        ) : (<>
          <div className={`group/day flex items-center gap-1 text-[11px] mb-0.5 ${isToday ? "text-blue-700 font-semibold" : h ? "text-rose-500" : "text-slate-400"}`}>
            {view === "week" ? thDate(key, { weekday: "short", day: "numeric", month: "short" }) : num}
            {h && <span className="min-w-0 truncate text-[10px] text-rose-400" title={h}>{h}</span>}
            {onAddOnDay && <button type="button" title="เพิ่มรายการวันนี้" onClick={(e) => { e.stopPropagation(); onAddOnDay(key); }}
              className="ml-auto h-4 w-4 shrink-0 rounded leading-none text-slate-400 opacity-0 group-hover/day:opacity-100 hover:bg-blue-100 hover:text-blue-700">+</button>}
          </div>
          <div className="space-y-0.5">
            {dayItems.slice(0, perDay).map(chipWrap)}
            {dayItems.length > perDay && (
              <button type="button" onClick={(e) => { e.stopPropagation(); setPop({ kind: "day", date: key, ...anchorOf(e.currentTarget) }); }}
                className="w-full rounded px-1 text-left text-[10px] text-blue-600 hover:bg-blue-50 hover:underline">+{dayItems.length - perDay} อื่น ๆ</button>
            )}
          </div>
          {dayFooter && dayItems.length > 0 && <div className="mt-0.5">{dayFooter(dayItems)}</div>}
        </>)}
      </div>
    );
  };

  return (
    <div ref={rootRef} className={`sched-print relative ${wrapCls}`}>
      {/* พิมพ์: ซ่อนทุกอย่างนอกปฏิทิน + เครื่องมือ (เบราว์เซอร์มี "บันทึกเป็น PDF" ให้เลือกในหน้าพิมพ์) */}
      <style>{`@media print{body *{visibility:hidden!important}.sched-print,.sched-print *{visibility:visible!important}.sched-print{position:absolute;left:0;top:0;width:100%}.sched-noprint{display:none!important}}`}</style>
      <div className="flex-1 min-w-0">
        {printTitle && <div className="hidden print:block text-lg font-bold mb-2">{printTitle} · {title}</div>}
        {filters && filters.length > 1 && (
          <div className={`sched-noprint flex items-center gap-1.5 mb-2 ${isPhone ? "overflow-x-auto pb-0.5 [scrollbar-width:none]" : "flex-wrap"}`}>
            {filters.map((f) => (
              <button key={f.value} onClick={() => setFlt(f.value)}
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 rounded-full border transition-colors whitespace-nowrap shrink-0 ${touch ? "h-8" : "py-1"} ${flt === f.value ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {f.color && <span className="w-2 h-2 rounded-full" style={{ background: flt === f.value ? "#fff" : f.color }} />}{f.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1 mb-2">
          <button onClick={() => move(-1)} className={`sched-noprint ${btnH} w-8 shrink-0 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50`}>‹</button>
          <h3 className={`text-base font-bold text-slate-800 text-center ${isPhone ? "flex-1 min-w-0 truncate" : "min-w-44 px-1"}`}>{title}</h3>
          <button onClick={() => move(1)} className={`sched-noprint ${btnH} w-8 shrink-0 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50`}>›</button>
          <button onClick={goToday} className={`sched-noprint ml-1 shrink-0 px-3 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 ${btnH}`}>วันนี้</button>
          <div className="sched-noprint ml-1 inline-flex rounded-lg bg-slate-100 p-0.5" data-no-split>
            {(["month", "week", "list"] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={seg(view === v)}>{v === "month" ? "เดือน" : v === "week" ? "สัปดาห์" : "รายการ"}</button>)}
          </div>
          <div className={`sched-noprint flex items-center gap-1 ${isPhone ? "w-full mt-1" : "ml-auto"}`}>
            {getSearchText && (
              <div className={`relative ${isPhone ? "flex-1" : "w-44"}`}>
                <input value={q} onChange={(e) => { setQ(e.target.value); setBacklogLimit(BACKLOG_PAGE); }} placeholder="🔍 ค้นหาในปฏิทิน"
                  className={`w-full pl-2 pr-6 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${touch ? "h-9 text-sm" : "h-8 text-xs"}`} />
                {q && <button onClick={() => setQ("")} className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs">✕</button>}
              </div>
            )}
            <button type="button" onClick={() => { const n = !heat; setHeat(n); writeLS(HEAT_KEY, n ? "1" : "0"); }} aria-pressed={heat} title="ระบายสีวันที่งานแน่น (3+ อ่อน · 5+ ส้ม · 8+ แดง)"
              className={`${btnH} shrink-0 rounded-lg border px-2 text-xs ${heat ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>🔥 ความแน่น</button>
            <button type="button" onClick={() => (selecting ? exitSelect() : setSelecting(true))} aria-pressed={selecting} title="เลือกหลายรายการ แล้วเลื่อนวันทั้งชุด"
              className={`${btnH} shrink-0 rounded-lg border px-2 text-xs ${selecting ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>☑ เลือกหลายงาน</button>
            {toolbarExtra}
            {!touch && <button type="button" onClick={() => window.print()} title="พิมพ์ / บันทึกเป็น PDF"
              className={`${btnH} shrink-0 rounded-lg border border-slate-200 px-2 text-xs text-slate-500 hover:bg-slate-50`}>🖨 พิมพ์</button>}
          </div>
        </div>

        {selecting && (
          <div className="sched-noprint mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs text-blue-800">
            <span className="font-medium">เลือก {picked.size} รายการ</span>
            <span className="text-blue-600/70">· กดรายการเพื่อติ๊ก</span>
            <span className="ml-auto" />
            {[-1, 1, 7].map((n) => (
              <button key={n} type="button" disabled={!picked.size} onClick={() => shiftPicked(n)} className="h-7 rounded-md border border-blue-200 bg-white px-2 hover:bg-blue-100 disabled:opacity-40">{n > 0 ? `+${n}` : n} วัน</button>
            ))}
            <button type="button" disabled={!picked.size} onClick={() => shiftPicked(null)} className="h-7 rounded-md border border-blue-200 bg-white px-2 hover:bg-blue-100 disabled:opacity-40">เอาวันออก</button>
            <button type="button" onClick={exitSelect} className="h-7 rounded-md px-2 text-blue-700 hover:bg-blue-100">เสร็จ</button>
          </div>
        )}

        {view === "list" ? (
          listDays.length === 0
            ? <p className="py-10 text-center text-sm text-slate-400">ไม่มีรายการในเดือนนี้{q && " ที่ตรงกับคำค้น"}</p>
            : <div className="space-y-3">
                {listDays.map((k) => (
                  <div key={k} {...dropProps(k, k)} className={`rounded-xl border p-2 ${overKey === k ? "border-blue-400 bg-blue-50" : k === todayKey ? "border-blue-200 bg-blue-50/30" : "border-slate-100 bg-white"}`}>
                    <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
                      {thDate(k, { weekday: "long", day: "numeric", month: "long" })}
                      {hol[k] && <span className="text-xs font-normal text-rose-500">{hol[k]}</span>}
                      <span className="ml-auto text-xs font-normal text-slate-400">{byDay.get(k)!.length} รายการ</span>
                      {onAddOnDay && <button type="button" onClick={() => onAddOnDay(k)} className="sched-noprint text-xs font-normal text-blue-600 hover:underline">+ เพิ่ม</button>}
                    </div>
                    <div className="grid gap-2" style={{ gridTemplateColumns: isPhone ? "minmax(0, 1fr)" : "repeat(auto-fill, minmax(240px, 1fr))" }}>{byDay.get(k)!.map(card)}</div>
                  </div>
                ))}
              </div>
        ) : (<>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400 mb-1">{WEEK.map((w) => <div key={w}>{w}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">{cells.map(dayCell)}</div>
        </>)}
        {hint && <p className="sched-noprint text-[11px] text-slate-400 mt-2">💡 {hint}</p>}

      </div>

      {/* กล่อง "ยังไม่ลงวันที่" */}
      <div
        {...dropProps("backlog", null)}
        className={`sched-noprint ${backlogWidth} shrink-0 rounded-xl border p-2 transition-colors ${overKey === "backlog" ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-slate-50/60"}`}>
        <div className={`flex items-center gap-2 px-1 ${showBacklog ? "mb-2" : ""} ${touch ? "cursor-pointer min-h-[36px]" : ""}`}
          onClick={touch ? () => setBacklogOpen(!showBacklog) : undefined}>
          <span className="text-sm font-semibold text-slate-700">📥 {backlogTitle}</span>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{backlog.length}</span>
          {touch && <span className="text-xs text-slate-400 w-3">{showBacklog ? "▾" : "▸"}</span>}
        </div>
        {showBacklog && <>
          {backlog.length === 0
            ? <div className="text-center text-xs text-slate-400 py-8">{q ? "ไม่พบรายการที่ค้นหา" : "ลงวันครบแล้ว 🎉"}</div>
            : touch ? (
              <>
                <div className={`grid gap-2.5 ${isPhone ? "grid-cols-1" : "grid-cols-2"}`}>{backlogVisible.map(card)}</div>
                {backlog.length > backlogVisible.length && (
                  <button type="button" onClick={() => setBacklogLimit((n) => n + BACKLOG_PAGE)}
                    className="mt-2 w-full h-9 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50">
                    ดูเพิ่มอีก {Math.min(BACKLOG_PAGE, backlog.length - backlogVisible.length)} ใบ (เหลือ {backlog.length - backlogVisible.length})
                  </button>
                )}
              </>
            ) : (
              <div className={`space-y-1.5 overflow-y-auto pr-0.5 ${fill ? "max-h-[calc(100vh-150px)]" : "max-h-[70vh]"}`}>{backlogVisible.map(card)}</div>
            )}
        </>}
      </div>

      {/* ป๊อปรายการของ "วันที่กด" (ERPModal ของกลาง · การ์ดมีรูป + วางเมาส์ดูรูปใหญ่ตามที่หน้าส่งมา) */}
      <ERPModal open={!!selDay && view !== "list"} onClose={() => { setSelDay(null); setDayPick(null); }} size="lg" defaultExpanded={false} storageKey="sched-day-pop"
        title={selDay ? `${thDate(selDay, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${selDayItems.length} รายการ` : ""}
        description={selDay && hol[selDay] ? hol[selDay] : undefined}
        footer={selDay && (onAddOnDay || dayActions) ? <>
          {dayActions?.(selDayItems, selDay)}
          {onAddOnDay && <button type="button" onClick={() => { const d = selDay; setSelDay(null); onAddOnDay(d); }} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-blue-700 hover:bg-blue-50">+ เพิ่มรายการวันนี้</button>}
        </> : undefined}>
        {dayPick && renderPopView ? (
          <div>
            <button type="button" onClick={() => setDayPick(null)} className="mb-2 text-xs text-blue-700 hover:underline">‹ กลับไปรายการของวัน</button>
            {renderPopView(dayPick, () => setDayPick(null))}
          </div>
        ) : selDayItems.length === 0
          ? <p className="py-6 text-center text-sm text-slate-400">ไม่มีรายการวันนี้</p>
          : <div className="grid gap-2.5" style={{ gridTemplateColumns: isPhone ? "minmax(0, 1fr)" : "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {selDayItems.map((it) => renderDayItem
                ? <div key={it.id} onClickCapture={dayClick(it)}>{renderDayItem(it)}</div>
                : <div key={it.id} onClickCapture={dayClick(it)}>{renderCard(it)}</div>)}
            </div>}
      </ERPModal>

      {/* ป๊อป: ดูงาน / รายการทั้งวัน (+N) */}
      {pop && (
        <div ref={popRef} className="sched-noprint absolute z-40 w-[300px] max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl"
          style={{ left: pop.x, top: pop.y }}>
          {pop.kind === "item" ? renderPopView?.(pop.item, () => setPop(null)) : (
            <>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">{thDate(pop.date, { weekday: "short", day: "numeric", month: "short" })} · {(byDay.get(pop.date) ?? []).length} รายการ</span>
                <button type="button" onClick={() => setPop(null)} className="ml-auto text-xs text-slate-400 hover:text-slate-600">✕</button>
              </div>
              <div className="max-h-72 space-y-0.5 overflow-y-auto">{(byDay.get(pop.date) ?? []).map(chipWrap)}</div>
              {!touch && <p className="mt-1.5 text-[10px] text-slate-400">ลากรายการออกไปวางวันอื่นได้</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
