"use client";

/**
 * มุมมองเพิ่มของกระดานเงินสด (/cashflow/board) — ข้อมูลชุดเดียวกับกระดานรายวัน ต่างกันแค่วิธีวาง
 *  - week     รายสัปดาห์ (ค่าเริ่มต้น) — คอลัมน์ละ 1 สัปดาห์ ลากการ์ดข้ามสัปดาห์/ลงวันได้
 *  - ledger   แบบสมุดบัญชี — เรียงวันลงมา มียอดคงเหลือทุกบรรทัด (เหมาะมือถือ)
 *  - chart    กราฟ + รายการ — แท่งยอดคงเหลือรายวัน กดแท่งดูรายการวันนั้น
 *  - calendar ปฏิทินเดือน — ช่องละวัน ลากการ์ดไปวางวันอื่นได้
 * กระดานรายวันแบบเดิม (เส้นเวลาแนวนอน) อยู่ใน app/cashflow/board/page.tsx
 *
 * ทุกมุมมอง: ลาก/กดการ์ด = ลองเลื่อนวันเท่านั้น (ยังไม่บันทึก) — ยืนยันที่แถบล่างของกระดาน
 * สี: แดง = เงินติดลบ · เหลือง = ต่ำกว่าเงินกันขั้นต่ำ (ค่าตั้งกลาง lib/cashflow-settings)
 */
import { useEffect, useMemo, useState } from "react";
import { CASHFLOW_SOURCE, THB, addDaysISO, formatDayMonthTH, monthLabelTH, parseISO, type CashflowEvent, type CashflowSource } from "@/lib/cashflow";
import type { CompanyRef } from "@/lib/company-filter";
import { Card, GroupCard, TONE_BG, TONE_TEXT, balanceTone, shortTHB, type BoardCard } from "@/components/cashflow/board-card";

export type BoardViewKey = "day" | "week" | "ledger" | "chart" | "calendar";

export const BOARD_VIEWS: { key: BoardViewKey; label: string; icon: string; hint: string }[] = [
  { key: "week",     label: "รายสัปดาห์",   icon: "🗓", hint: "คอลัมน์ละ 1 สัปดาห์ ลากการ์ดข้ามสัปดาห์ได้" },
  { key: "day",      label: "รายวัน",       icon: "🧲", hint: "เส้นเวลาแนวนอน คอลัมน์ละ 1 วัน (แบบเดิม)" },
  { key: "ledger",   label: "สมุดบัญชี",    icon: "📒", hint: "เรียงวันลงมา มียอดคงเหลือทุกบรรทัด" },
  { key: "chart",    label: "กราฟ",         icon: "📊", hint: "เห็นทันทีว่าวันไหนเงินต่ำ กดแท่งดูรายการ" },
  { key: "calendar", label: "ปฏิทิน",       icon: "📅", hint: "ปฏิทินเดือน ลากการ์ดไปวางวันอื่นได้" },
];

const VIEW_KEY = "erp-cashboard-view";

/** จำมุมมองที่แต่ละคนชอบ (ต่อเครื่อง) — ค่าเริ่มต้น = รายสัปดาห์ */
export function useBoardView(): [BoardViewKey, (v: BoardViewKey) => void] {
  const [view, setView] = useState<BoardViewKey>("week");
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY) as BoardViewKey | null;
      if (v && BOARD_VIEWS.some((x) => x.key === v)) setView(v);
    } catch { /* โหมดส่วนตัว */ }
  }, []);
  const set = (v: BoardViewKey) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ไม่เป็นไร */ }
  };
  return [view, set];
}

export function BoardViewSwitcher({ value, onChange }: { value: BoardViewKey; onChange: (v: BoardViewKey) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 overflow-x-auto max-w-full">
      {BOARD_VIEWS.map((v) => (
        <button key={v.key} type="button" onClick={() => onChange(v.key)} title={v.hint}
                className={`h-8 px-3 text-sm rounded-md whitespace-nowrap transition-colors ${
                  value === v.key ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
          <span className="mr-1">{v.icon}</span>{v.label}
        </button>
      ))}
    </div>
  );
}

export type BoardViewProps = {
  days: string[];
  today: string;
  cardsByDay: Map<string, BoardCard[]>;
  byDay: Map<string, CashflowEvent[]>;
  levelByDay: { date: string; bal: number }[];
  startBalance: number;
  /** เงินกันขั้นต่ำ — ต่ำกว่านี้ระบายเหลือง */
  buffer: number;
  dragIds: string[] | null;
  overDay: string | null;
  pending: Record<string, string>;
  selected: Set<string>;
  openGroups: Set<string>;
  companies: CompanyRef[];
  showCompany: boolean;
  originalDate: (id: string) => string;
  onDragStart: (ids: string[]) => void;
  onDragEnd: () => void;
  onOver: (day: string | null) => void;
  onDrop: (day: string) => void;
  onToggleSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onToggleGroup: (key: string) => void;
};

const TH_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const dowOf = (day: string) => parseISO(day).getUTCDay();
/** วันจันทร์ของสัปดาห์ที่มีวันนี้ */
const mondayOf = (day: string) => addDaysISO(day, -((dowOf(day) + 6) % 7));

function useLevelMap(levelByDay: BoardViewProps["levelByDay"]) {
  return useMemo(() => new Map(levelByDay.map((x) => [x.date, x.bal])), [levelByDay]);
}

/** การ์ดของวันหนึ่ง (รองรับกองร้านเดียวกัน) */
function DayCards({ p, day, showDate }: { p: BoardViewProps; day: string; showDate?: boolean }) {
  const cards = p.cardsByDay.get(day) ?? [];
  const comps = p.showCompany ? p.companies : null;
  return (
    <>
      {cards.map((c) => c.kind === "single" ? (
        <Card key={c.key} ev={c.ev} companies={comps} showDate={showDate}
              dragging={!!p.dragIds?.includes(c.ev.id)} checked={p.selected.has(c.ev.id)}
              movedFrom={p.pending[c.ev.id] ? p.originalDate(c.ev.id) : null}
              onDragStart={p.onDragStart} onDragEnd={p.onDragEnd}
              onToggleSelect={p.onToggleSelect} onOpenDetail={p.onOpenDetail} />
      ) : (
        <GroupCard key={c.key} card={c} open={p.openGroups.has(c.key)} companies={comps}
                   dragging={!!p.dragIds?.some((id) => c.events.some((e) => e.id === id))}
                   selected={p.selected} pending={p.pending} originalDate={p.originalDate}
                   onToggle={() => p.onToggleGroup(c.key)}
                   onDragStart={p.onDragStart} onDragEnd={p.onDragEnd}
                   onToggleSelect={p.onToggleSelect} onOpenDetail={p.onOpenDetail} />
      ))}
    </>
  );
}

/** ช่องรับการ์ดตอนลาก — ใช้ร่วมทุกมุมมองที่ลากได้ */
function dropProps(p: BoardViewProps, day: string) {
  return {
    onDragOver: (e: React.DragEvent) => { if (p.dragIds) { e.preventDefault(); e.stopPropagation(); if (p.overDay !== day) p.onOver(day); } },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); p.onDrop(day); },
  };
}

// ============================================================
// รายสัปดาห์
// ============================================================

export function WeekView(p: BoardViewProps) {
  const level = useLevelMap(p.levelByDay);
  const first = p.days[0], last = p.days[p.days.length - 1];
  const weeks = useMemo(() => {
    const out: { start: string; days: string[] }[] = [];
    if (!first) return out;
    for (let s = mondayOf(first); s <= last; s = addDaysISO(s, 7)) {
      const ds: string[] = [];
      for (let i = 0; i < 7; i++) { const d = addDaysISO(s, i); if (d >= first && d <= last) ds.push(d); }
      out.push({ start: s, days: ds });
    }
    return out;
  }, [first, last]);

  /** มือถือ: สัปดาห์ที่กางไว้ — เริ่มกางสัปดาห์แรก + สัปดาห์ที่เงินต่ำ */
  const [openW, setOpenW] = useState<Set<string> | null>(null);
  const defaultOpen = useMemo(() => {
    const s = new Set<string>();
    weeks.forEach((w, i) => {
      if (i === 0 || w.days.some((d) => balanceTone(level.get(d) ?? p.startBalance, p.buffer) !== "ok")) s.add(w.start);
    });
    return s;
  }, [weeks, level, p.startBalance, p.buffer]);
  const isOpen = (k: string) => (openW ?? defaultOpen).has(k);
  const toggle = (k: string) => setOpenW((prev) => {
    const n = new Set(prev ?? defaultOpen);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  return (
    <div className="p-3 md:p-4">
      <div className="flex flex-col md:flex-row md:overflow-x-auto gap-3 md:pb-3">
        {weeks.map((w) => {
          const evs = w.days.flatMap((d) => p.byDay.get(d) ?? []);
          const inAmt = evs.filter((e) => e.direction === "in").reduce((s, e) => s + e.amount, 0);
          const outAmt = evs.filter((e) => e.direction === "out").reduce((s, e) => s + e.amount, 0);
          const endBal = level.get(w.days[w.days.length - 1]) ?? p.startBalance;
          const minBal = Math.min(...w.days.map((d) => level.get(d) ?? p.startBalance));
          const tone = balanceTone(minBal, p.buffer);
          const busyDays = w.days.filter((d) => (p.cardsByDay.get(d) ?? []).length > 0);
          const open = isOpen(w.start);
          const hasToday = w.days.includes(p.today);
          // วางลงตัวคอลัมน์ (ไม่ได้ชี้วันไหน) = วันเดียวกันของสัปดาห์นั้น
          const colDrop = (e: React.DragEvent) => {
            e.preventDefault();
            const id = p.dragIds?.[0];
            const src = id ? [...p.byDay.values()].flat().find((x) => x.id === id) : undefined;
            const off = src ? (dowOf(src.date) + 6) % 7 : 0;
            const target = addDaysISO(w.start, off);
            p.onDrop(target < w.days[0] ? w.days[0] : target > w.days[w.days.length - 1] ? w.days[w.days.length - 1] : target);
          };
          return (
            <section key={w.start}
                     onDragOver={(e) => { if (p.dragIds) e.preventDefault(); }}
                     onDrop={colDrop}
                     className={`md:w-[260px] md:shrink-0 rounded-xl border bg-slate-50/70 flex flex-col ${
                       p.dragIds ? "border-blue-200" : "border-slate-200"}`}>
              <button type="button" onClick={() => toggle(w.start)}
                      className={`text-left rounded-t-xl px-3 py-2.5 border-b border-slate-200 md:cursor-default ${TONE_BG[tone] || "bg-white"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {formatDayMonthTH(w.days[0])} – {formatDayMonthTH(w.days[w.days.length - 1])}
                    {hasToday && <span className="ml-1.5 text-[10px] px-1.5 py-px rounded-full bg-emerald-100 text-emerald-700 align-middle">สัปดาห์นี้</span>}
                  </span>
                  <span className="md:hidden text-slate-400 text-xs">{open ? "▲" : "▼"}</span>
                </div>
                <div className="mt-1 text-xs tabular-nums">
                  <span className="text-emerald-600">+{shortTHB(inAmt)}</span>
                  <span className="text-slate-300 mx-1">·</span>
                  <span className="text-rose-600">−{shortTHB(outAmt)}</span>
                  <span className="text-slate-400 ml-1.5">({evs.length} ใบ)</span>
                </div>
                <div className="text-xs tabular-nums mt-0.5">
                  <span className="text-slate-500">คงเหลือสิ้นสัปดาห์ </span>
                  <span className={TONE_TEXT[balanceTone(endBal, p.buffer)]}>{THB(endBal)}</span>
                </div>
                {tone !== "ok" && (
                  <div className={`text-[11px] mt-0.5 ${TONE_TEXT[tone]}`}>
                    {tone === "neg" ? "⚠️ เงินติดลบ" : "⚠️ ต่ำกว่าเงินกันขั้นต่ำ"} — ต่ำสุด {THB(minBal)}
                  </div>
                )}
              </button>

              {/* ตอนลาก: แถบ 7 วันให้วางลงวันที่ต้องการได้ตรง ๆ */}
              {p.dragIds && (
                <div className="grid grid-cols-7 gap-0.5 p-1.5 border-b border-slate-200 bg-white">
                  {Array.from({ length: 7 }, (_, i) => addDaysISO(w.start, i)).map((d) => {
                    const inRange = w.days.includes(d);
                    return (
                      <div key={d} {...(inRange ? dropProps(p, d) : {})}
                           className={`rounded text-center py-1 text-[10px] leading-tight ${
                             !inRange ? "text-slate-300" : p.overDay === d ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700"}`}>
                        {TH_DOW[dowOf(d)]}<br /><b>{parseISO(d).getUTCDate()}</b>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className={`flex-1 p-2 space-y-2 ${open ? "" : "hidden md:block"} md:max-h-[62vh] md:overflow-y-auto`}>
                {busyDays.length === 0 && <p className="text-xs text-slate-400 text-center py-4">ไม่มีรายการ</p>}
                {busyDays.map((d) => {
                  const bal = level.get(d) ?? p.startBalance;
                  return (
                    <div key={d} {...dropProps(p, d)}
                         className={`rounded-lg ${p.overDay === d ? "ring-2 ring-blue-400 bg-blue-50" : ""}`}>
                      <div className={`flex items-center justify-between px-1 pb-1 text-[11px] ${d === p.today ? "text-emerald-700 font-semibold" : "text-slate-500"}`}>
                        <span>{TH_DOW[dowOf(d)]} {formatDayMonthTH(d)}{d === p.today && " · วันนี้"}</span>
                        <span className={`tabular-nums ${TONE_TEXT[balanceTone(bal, p.buffer)]}`}>{shortTHB(bal)}</span>
                      </div>
                      <div className="space-y-1.5"><DayCards p={p} day={d} /></div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// สมุดบัญชี
// ============================================================

export function LedgerView(p: BoardViewProps) {
  const level = useLevelMap(p.levelByDay);
  const busy = p.days.filter((d) => (p.byDay.get(d) ?? []).length > 0);
  return (
    <div className="p-3 md:p-4">
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {busy.length === 0 && <p className="text-sm text-slate-400 text-center py-10">ไม่มีรายการในช่วงนี้</p>}
        {busy.map((d) => {
          const bal = level.get(d) ?? p.startBalance;
          const tone = balanceTone(bal, p.buffer);
          let run = (() => { const i = p.days.indexOf(d); return i > 0 ? level.get(p.days[i - 1]) ?? p.startBalance : p.startBalance; })();
          const evs = [...(p.byDay.get(d) ?? [])].sort((a, b) => (a.direction === b.direction ? b.amount - a.amount : a.direction === "in" ? -1 : 1));
          return (
            <div key={d}>
              <div className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs border-t border-slate-200 first:border-t-0 ${TONE_BG[tone] || "bg-slate-50"}`}>
                <span className={`font-semibold ${d === p.today ? "text-emerald-700" : "text-slate-700"}`}>
                  {TH_DOW[dowOf(d)]} {formatDayMonthTH(d)}{d === p.today && " · วันนี้"}
                </span>
                <span className="tabular-nums">คงเหลือ <b className={TONE_TEXT[tone]}>{THB(bal)}</b></span>
              </div>
              {evs.map((e) => {
                run += e.direction === "in" ? e.amount : -e.amount;
                const meta = CASHFLOW_SOURCE[e.source as CashflowSource];
                const moved = p.pending[e.id] ? p.originalDate(e.id) : null;
                return (
                  <button key={e.id} type="button" onClick={() => p.onOpenDetail(e.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 border-t border-slate-100 text-left text-sm hover:bg-slate-50">
                    <span className={`text-[10px] px-1.5 py-px rounded-full whitespace-nowrap ${
                      !e.movable ? "bg-violet-100 text-violet-700" : e.direction === "in" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      {!e.movable ? "🔒 " : ""}{meta.label}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-slate-800">{e.party}</span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {e.ref}{moved && <span className="text-blue-600"> · เลื่อนจาก {formatDayMonthTH(moved)} (ยังไม่บันทึก)</span>}
                      </span>
                    </span>
                    <span className={`tabular-nums font-semibold whitespace-nowrap ${e.direction === "in" ? "text-emerald-600" : "text-rose-600"}`}>
                      {e.direction === "in" ? "+" : "−"}{THB(e.amount)}
                    </span>
                    <span className={`hidden sm:inline w-28 text-right text-xs tabular-nums ${TONE_TEXT[balanceTone(run, p.buffer)]}`}>{THB(run)}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// กราฟ + รายการ
// ============================================================

export function ChartView(p: BoardViewProps) {
  const level = p.levelByDay;
  const firstLow = level.find((x) => balanceTone(x.bal, p.buffer) !== "ok")?.date;
  const [sel, setSel] = useState<string | null>(null);
  const day = sel && level.some((x) => x.date === sel) ? sel : firstLow ?? p.days.find((d) => (p.byDay.get(d) ?? []).length) ?? p.today;

  const W = 1000, H = 220, top = 14, bottom = 26;
  const vals = level.map((x) => x.bal).concat([0, p.buffer]);
  const max = Math.max(...vals), min = Math.min(...vals);
  const range = max - min || 1;
  const y = (v: number) => top + (H - top - bottom) * (1 - (v - min) / range);
  const bw = W / Math.max(1, level.length);
  const zeroY = y(0), bufY = y(p.buffer);
  const step = level.length > 120 ? 14 : level.length > 60 ? 7 : 3;
  const bal = level.find((x) => x.date === day)?.bal ?? p.startBalance;

  // 7 วันถัดจากวันที่เลือก — ให้เห็นว่าหลังจากนั้นเงินฟื้นไหม
  const next = p.days.filter((d) => d > day && d <= addDaysISO(day, 7) && (p.byDay.get(d) ?? []).length);

  return (
    <div className="p-3 md:p-4 space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[180px] md:h-[240px]" preserveAspectRatio="none" role="img"
             aria-label="กราฟเงินคงเหลือรายวัน">
          {level.map((x, i) => {
            const tone = balanceTone(x.bal, p.buffer);
            const yy = y(x.bal), h = Math.max(1.5, Math.abs(zeroY - yy));
            const fill = tone === "neg" ? "#ef4444" : tone === "low" ? "#f59e0b" : x.date === day ? "#1d4ed8" : "#93c5fd";
            return (
              <g key={x.date} onClick={() => setSel(x.date)} style={{ cursor: "pointer" }}>
                <rect x={i * bw} y={top} width={bw} height={H - top - bottom} fill="transparent" />
                <rect x={i * bw + bw * 0.12} y={Math.min(yy, zeroY)} width={bw * 0.76} height={h} rx={1.5}
                      fill={fill} stroke={x.date === day ? "#0f172a" : "none"} strokeWidth={x.date === day ? 1.5 : 0}>
                  <title>{formatDayMonthTH(x.date)} · {THB(x.bal)}</title>
                </rect>
                {(i % step === 0 || x.date === day) && (
                  <text x={i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill={x.date === day ? "#0f172a" : "#94a3b8"}>
                    {parseISO(x.date).getUTCDate()}
                  </text>
                )}
              </g>
            );
          })}
          <line x1="0" x2={W} y1={zeroY} y2={zeroY} stroke="#94a3b8" strokeDasharray="3 4" />
          {p.buffer > 0 && (
            <>
              <line x1="0" x2={W} y1={bufY} y2={bufY} stroke="#d97706" strokeDasharray="6 4" strokeWidth="1.5" />
              <text x={W - 6} y={bufY - 5} textAnchor="end" fontSize="12" fill="#b45309">เงินกันขั้นต่ำ {shortTHB(p.buffer)}</text>
            </>
          )}
        </svg>
        <p className="text-[11px] text-slate-400 px-1">แท่งฟ้า = เงินพอ · เหลือง = ต่ำกว่าเงินกันขั้นต่ำ · แดง = ติดลบ · กดแท่งเพื่อดูรายการวันนั้น</p>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { const i = p.days.indexOf(day); if (i > 0) setSel(p.days[i - 1]); }}
                  className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50" aria-label="วันก่อน">‹</button>
          <b className="text-sm text-slate-800">{TH_DOW[dowOf(day)]} {formatDayMonthTH(day)}{day === p.today && " · วันนี้"}</b>
          <button type="button" onClick={() => { const i = p.days.indexOf(day); if (i >= 0 && i < p.days.length - 1) setSel(p.days[i + 1]); }}
                  className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50" aria-label="วันถัดไป">›</button>
        </div>
        <span className="text-sm tabular-nums">คงเหลือ <b className={TONE_TEXT[balanceTone(bal, p.buffer)]}>{THB(bal)}</b></span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <DayCards p={p} day={day} />
        {(p.cardsByDay.get(day) ?? []).length === 0 && <p className="text-sm text-slate-400">ไม่มีรายการวันนี้ — กดแท่งอื่นในกราฟ</p>}
      </div>
      {next.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-1.5">7 วันถัดไป</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {next.map((d) => <DayCards key={d} p={p} day={d} showDate />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ปฏิทินเดือน
// ============================================================

export function CalendarView(p: BoardViewProps) {
  const level = useLevelMap(p.levelByDay);
  const first = p.days[0], last = p.days[p.days.length - 1];
  const [sel, setSel] = useState<string | null>(null);
  const day = sel ?? (p.days.find((d) => (p.byDay.get(d) ?? []).length) || p.today);
  const months = useMemo(() => {
    const out: string[] = [];
    if (!first) return out;
    for (let m = first.slice(0, 7); m <= last.slice(0, 7);) {
      out.push(m);
      const [yy, mm] = m.split("-").map(Number);
      m = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;
    }
    return out;
  }, [first, last]);

  return (
    <div className="p-3 md:p-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4">
      <div className="space-y-5">
        {months.map((m) => {
          const start = mondayOf(`${m}-01`);
          const cells: string[] = [];
          for (let d = start; d.slice(0, 7) <= m || cells.length % 7 !== 0; d = addDaysISO(d, 1)) cells.push(d);
          return (
            <div key={m}>
              <p className="text-sm font-semibold text-slate-700 mb-1.5">{monthLabelTH(m)}</p>
              <div className="grid grid-cols-7 gap-1">
                {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((x) => <div key={x} className="text-center text-[11px] text-slate-400">{x}</div>)}
                {cells.map((d) => {
                  const inMonth = d.slice(0, 7) === m, inRange = d >= first && d <= last;
                  if (!inMonth) return <div key={d} />;
                  const evs = p.byDay.get(d) ?? [];
                  const bal = level.get(d) ?? p.startBalance;
                  const tone = balanceTone(bal, p.buffer);
                  const net = evs.reduce((s, e) => s + (e.direction === "in" ? e.amount : -e.amount), 0);
                  return (
                    <div key={d} {...(inRange ? dropProps(p, d) : {})}
                         onClick={() => inRange && setSel(d)}
                         className={`rounded-lg border p-1 min-h-[54px] md:min-h-[96px] text-[11px] ${
                           !inRange ? "border-transparent bg-slate-50/50 text-slate-300"
                             : `cursor-pointer ${TONE_BG[tone] || "bg-white"} ${p.overDay === d ? "border-blue-500 ring-2 ring-blue-300" : d === day ? "border-slate-800" : "border-slate-200 hover:border-slate-300"}`}`}>
                      <div className="flex items-center justify-between">
                        <b className={d === p.today ? "text-emerald-700" : "text-slate-700"}>{parseISO(d).getUTCDate()}</b>
                        {inRange && net !== 0 && (
                          <span className={`hidden md:inline tabular-nums ${net > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {net > 0 ? "+" : "−"}{shortTHB(Math.abs(net))}
                          </span>
                        )}
                      </div>
                      {inRange && (
                        <>
                          {/* จอคอม: ชื่อการ์ด ลากได้ · มือถือ: จุดสี */}
                          <div className="hidden md:block mt-0.5 space-y-0.5">
                            {evs.slice(0, 3).map((e) => (
                              <div key={e.id} draggable={e.movable}
                                   onDragStart={(ev) => { if (!e.movable) { ev.preventDefault(); return; } ev.stopPropagation(); p.onDragStart([e.id]); }}
                                   onDragEnd={p.onDragEnd}
                                   onClick={(ev) => { ev.stopPropagation(); p.onOpenDetail(e.id); }}
                                   title={`${e.party} · ${THB(e.amount)}`}
                                   className={`truncate rounded px-1 py-px border-l-2 bg-white/80 ${
                                     !e.movable ? "border-l-violet-500" : e.direction === "in" ? "border-l-emerald-500" : "border-l-rose-500"}
                                     ${p.pending[e.id] ? "ring-1 ring-blue-300" : ""} ${e.movable ? "cursor-grab" : ""}`}>
                                {e.party}
                              </div>
                            ))}
                            {evs.length > 3 && <div className="text-slate-400">+{evs.length - 3} ใบ</div>}
                          </div>
                          <div className="md:hidden flex gap-0.5 mt-0.5 flex-wrap">
                            {evs.slice(0, 5).map((e) => (
                              <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${!e.movable ? "bg-violet-500" : e.direction === "in" ? "bg-emerald-500" : "bg-rose-500"}`} />
                            ))}
                          </div>
                          <div className={`mt-0.5 tabular-nums ${TONE_TEXT[tone]} ${tone === "ok" ? "!text-slate-400 !font-normal" : ""}`}>{shortTHB(bal)}</div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <aside className="lg:sticky lg:top-2 self-start rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <b className="text-sm text-slate-800">{TH_DOW[dowOf(day)]} {formatDayMonthTH(day)}</b>
          <span className="text-xs tabular-nums">คงเหลือ <b className={TONE_TEXT[balanceTone(level.get(day) ?? p.startBalance, p.buffer)]}>{THB(level.get(day) ?? p.startBalance)}</b></span>
        </div>
        <div className="space-y-1.5">
          <DayCards p={p} day={day} />
          {(p.cardsByDay.get(day) ?? []).length === 0 && <p className="text-xs text-slate-400">ไม่มีรายการ — กดวันอื่นในปฏิทิน</p>}
        </div>
      </aside>
    </div>
  );
}
