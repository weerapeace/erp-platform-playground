"use client";

/**
 * มุมมองปฏิทินวันต่ออายุ — โปรเจกต์รอบบิลลงแต่ละวันของเดือนที่แสดง (เลื่อนเดือนได้)
 * monthly = ทุกเดือน · yearly = เดือน/วันเดิม · one-time = วันจริง
 * แสดงเฉพาะรายการที่ active (ที่จ่ายอยู่จริง)
 */
import { useMemo, useState } from "react";
import { fmtCost, monthlyTHB, fmtBaht, type SubSettings, type Subscription } from "@/lib/subscriptions";

const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const TH_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function parts(dateStr: string | null): { y: number; m: number; d: number } | null {
  if (!dateStr) return null;
  const mm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  if (!mm) return null;
  return { y: Number(mm[1]), m: Number(mm[2]) - 1, d: Number(mm[3]) };
}

/** วันในเดือน (year, monthIndex) ที่ sub นี้ต่ออายุ — null ถ้าไม่ตกในเดือนนั้น */
function renewalDayInMonth(sub: Subscription, year: number, monthIndex: number): number | null {
  const p = parts(sub.billing_date);
  if (!p) return null;
  const dim = new Date(year, monthIndex + 1, 0).getDate();
  if (sub.billing_cycle === "monthly") return Math.min(p.d, dim);
  if (sub.billing_cycle === "yearly") return p.m === monthIndex ? Math.min(p.d, dim) : null;
  // one-time
  return p.y === year && p.m === monthIndex ? p.d : null;
}

export function SubscriptionsCalendar({ rows, settings, onEditSub }: {
  rows: Subscription[];
  settings: SubSettings;
  onEditSub: (s: Subscription) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const active = useMemo(() => rows.filter((r) => r.active && r.billing_date), [rows]);

  // group ตามวัน
  const byDay = useMemo(() => {
    const map: Record<number, Subscription[]> = {};
    for (const s of active) {
      const day = renewalDayInMonth(s, year, month);
      if (day != null) (map[day] ??= []).push(s);
    }
    return map;
  }, [active, year, month]);

  const monthTotal = useMemo(
    () => Object.values(byDay).flat().reduce((sum, s) => sum + monthlyTHB(s, settings), 0),
    [byDay, settings],
  );

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (day: number) => year === now.getFullYear() && month === now.getMonth() && day === now.getDate();
  const shift = (delta: number) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  return (
    <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="h-8 w-8 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600">‹</button>
          <div className="text-sm font-semibold text-slate-800 min-w-[140px] text-center">{TH_MONTHS[month]} {year + 543}</div>
          <button onClick={() => shift(1)} className="h-8 w-8 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600">›</button>
          <button onClick={goToday} className="h-8 px-3 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600">วันนี้</button>
        </div>
        <div className="text-xs text-slate-500">รวมเดือนนี้ <span className="font-semibold text-indigo-600 tabular-nums">{fmtBaht(monthTotal)}</span></div>
      </div>

      {/* หัวสัปดาห์ */}
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-400 border-b border-slate-100">
        {TH_DOW.map((d, i) => <div key={i} className="py-1.5">{d}</div>)}
      </div>

      {/* วัน */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => (
          <div key={i} className={`min-h-[86px] border-b border-r border-slate-50 p-1 ${day == null ? "bg-slate-50/40" : ""}`}>
            {day != null && (
              <>
                <div className={`text-[11px] mb-1 inline-flex items-center justify-center w-5 h-5 rounded-full ${isToday(day) ? "bg-indigo-600 text-white font-bold" : "text-slate-400"}`}>{day}</div>
                <div className="space-y-1">
                  {(byDay[day] ?? []).map((s) => (
                    <button key={s.id} onClick={() => onEditSub(s)} title={`${s.name} · ${fmtCost(Number(s.cost), s.currency)}`}
                      className="block w-full text-left truncate rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] px-1 py-0.5 leading-tight">
                      {s.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {active.length === 0 && (
        <div className="py-8 text-center text-sm text-slate-400">ยังไม่มีรายการที่มีวันต่ออายุ</div>
      )}
    </div>
  );
}
