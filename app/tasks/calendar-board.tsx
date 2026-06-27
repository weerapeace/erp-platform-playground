"use client";

// ============================================================
// CalendarBoard — มุมมองปฏิทิน (งานเรียงตามกำหนดส่ง) สำหรับโมดูลงาน Creative
// ใช้ข้อมูล tasks ที่หน้า /tasks โหลดอยู่แล้ว (ไม่ยิง API เพิ่ม) · กดงาน = เปิดรายละเอียด
// ============================================================

import { useMemo, useState } from "react";
import { useT } from "@/components/i18n";
import { statusMeta, isTerminal } from "./use-statuses";
import { isOverdue, type CreativeTask } from "./data";

const DOW_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function pad(n: number) { return String(n).padStart(2, "0"); }

export function CalendarBoard({ tasks, onCardClick }: { tasks: CreativeTask[]; onCardClick: (id: string) => void }) {
  const t = useT();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  // งานตามวันกำหนดส่ง (YYYY-MM-DD)
  const byDate = useMemo(() => {
    const map = new Map<string, CreativeTask[]>();
    for (const tk of tasks) {
      if (!tk.due_date) continue;
      const k = String(tk.due_date).slice(0, 10);
      const arr = map.get(k) ?? []; arr.push(tk); map.set(k, arr);
    }
    return map;
  }, [tasks]);
  const noDue = useMemo(() => tasks.filter((tk) => !tk.due_date && !isTerminal(tk.status)).length, [tasks]);

  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();
  const startDow = new Date(cursor.y, cursor.m, 1).getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = () => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }));
  const next = () => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }));
  const goToday = () => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); };

  const monthLabel = t(`${MONTH_TH[cursor.m]} ${cursor.y + 543}`, `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][cursor.m]} ${cursor.y}`);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* แถบเดือน */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <button onClick={prev} className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">‹</button>
          <span className="text-base font-semibold text-slate-800 min-w-[150px] text-center">{monthLabel}</span>
          <button onClick={next} className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">›</button>
          <button onClick={goToday} className="ml-1 h-8 px-3 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">{t("วันนี้", "Today")}</button>
        </div>
        {noDue > 0 && <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{t("ยังไม่กำหนดส่ง", "No due date")}: {noDue}</span>}
      </div>

      {/* หัวคอลัมน์วัน */}
      <div className="grid grid-cols-7 border-b border-slate-100">
        {(t("th", "en") === "th" ? DOW_TH : DOW_EN).map((d, i) => (
          <div key={i} className={`text-center text-xs font-medium py-1.5 ${i === 0 || i === 6 ? "text-rose-400" : "text-slate-400"}`}>{d}</div>
        ))}
      </div>

      {/* ช่องวัน */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) return <div key={idx} className="min-h-[96px] border-b border-r border-slate-50 bg-slate-50/40" />;
          const dateStr = `${cursor.y}-${pad(cursor.m + 1)}-${pad(day)}`;
          const list = byDate.get(dateStr) ?? [];
          const isToday = dateStr === todayStr;
          const dow = (startDow + day - 1) % 7;
          return (
            <div key={idx} className={`min-h-[96px] border-b border-r border-slate-50 p-1 ${dow === 0 || dow === 6 ? "bg-slate-50/30" : ""}`}>
              <div className={`text-xs mb-1 px-1 ${isToday ? "inline-flex items-center justify-center h-5 w-5 rounded-full bg-violet-600 text-white font-semibold" : "text-slate-400"}`}>{day}</div>
              <div className="space-y-0.5">
                {list.slice(0, 4).map((tk) => {
                  const m = statusMeta(tk.status);
                  const od = isOverdue(tk);
                  return (
                    <button key={tk.id} onClick={() => onCardClick(tk.id)} title={`${tk.task_no ?? ""} ${tk.title}`}
                      className={`w-full text-left text-[11px] leading-tight rounded px-1.5 py-0.5 truncate border ${od ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-violet-50 hover:border-violet-200"}`}>
                      <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 align-middle ${m.dot}`} />{tk.title}
                    </button>
                  );
                })}
                {list.length > 4 && <div className="text-[10px] text-slate-400 px-1">+{list.length - 4} {t("งาน", "more")}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
