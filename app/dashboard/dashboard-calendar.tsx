"use client";

// ============================================================
// DashboardCalendar — โหมด "ปฏิทิน" ของแดชบอร์ดรวมทุกระบบ
// รวมงานครบกำหนด (due_at) ทุกระบบในปฏิทินเดียว · สีแยกตามระบบ · กรองระบบได้
// ============================================================
import { useMemo, useState } from "react";
import { systemForEvent, colorForSystem } from "@/lib/dashboard-systems";
import type { Notification, TeamNotification } from "@/app/api/notifications/route";
import type { SystemApp } from "./system-cards";

const WEEK = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const dkey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

type Props = {
  apps: SystemApp[];
  list: Notification[];
  team?: boolean;
  onOpen: (n: Notification) => void;
};

export function DashboardCalendar({ apps, list, team, onOpen }: Props) {
  const appLabel = useMemo(() => new Map(apps.map((a) => [a.key, a.label])), [apps]);
  const today = new Date();
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: today.getFullYear(), m: today.getMonth() });
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // งานที่มีกำหนดส่ง (due_at) → จัดตามวัน
  const byDay = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of list) {
      if (!n.due_at) continue;
      const sys = systemForEvent(n.event_type);
      if (hidden.has(sys)) continue;
      const d = new Date(n.due_at);
      const k = dkey(d);
      (map.get(k) ?? map.set(k, []).get(k)!).push(n);
    }
    return map;
  }, [list, hidden]);

  // ระบบที่มีงานครบกำหนด (สำหรับ legend/filter)
  const systemsInView = useMemo(() => {
    const s = new Set<string>();
    for (const n of list) if (n.due_at) s.add(systemForEvent(n.event_type));
    return [...s];
  }, [list]);

  // สร้างช่องปฏิทิน (เริ่มวันจันทร์)
  const cells = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1);
    const offset = (first.getDay() + 6) % 7;   // จันทร์ = 0
    const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < offset; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(ym.y, ym.m, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [ym]);

  const move = (delta: number) => setYm(({ y, m }) => { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const isToday = (d: Date) => d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  const isPast = (d: Date) => { const t = new Date(today); t.setHours(0, 0, 0, 0); return d < t; };
  const toggle = (sys: string) => setHidden((h) => { const n = new Set(h); if (n.has(sys)) n.delete(sys); else n.add(sys); return n; });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4">
      {/* หัว: เดือน + เลื่อน */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-base font-semibold text-slate-800">{MONTHS[ym.m]} {ym.y + 543}</div>
        <div className="flex items-center gap-1">
          <button onClick={() => move(-1)} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500">‹</button>
          <button onClick={() => setYm({ y: today.getFullYear(), m: today.getMonth() })} className="px-2.5 h-8 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">วันนี้</button>
          <button onClick={() => move(1)} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500">›</button>
        </div>
      </div>

      {/* หัวคอลัมน์วัน */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEK.map((w) => <div key={w} className="text-center text-[11px] text-slate-400">{w}</div>)}
      </div>

      {/* ช่องวัน */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[58px]" />;
          const items = byDay.get(dkey(d)) ?? [];
          const tdy = isToday(d);
          return (
            <div key={i} className={`min-h-[58px] rounded-lg border p-1 ${tdy ? "border-blue-300 bg-blue-50/50" : "border-slate-100"}`}>
              <div className={`text-[11px] mb-0.5 ${tdy ? "text-blue-700 font-semibold" : isPast(d) ? "text-slate-300" : "text-slate-500"}`}>{d.getDate()}</div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((n) => {
                  const sys = systemForEvent(n.event_type);
                  return (
                    <button key={n.id} onClick={() => onOpen(n)} title={`${n.title}${team && (n as TeamNotification).recipient_name ? " · " + (n as TeamNotification).recipient_name : ""}`}
                      className="w-full text-left text-[10px] text-white rounded px-1 py-0.5 truncate leading-tight hover:opacity-90"
                      style={{ background: colorForSystem(sys) }}>
                      {n.title}
                    </button>
                  );
                })}
                {items.length > 3 && <div className="text-[10px] text-slate-400 px-1">+{items.length - 3} รายการ</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* legend / filter ระบบ */}
      {systemsInView.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-slate-100">
          <span className="text-[11px] text-slate-400">กรองระบบ:</span>
          {systemsInView.map((sys) => {
            const off = hidden.has(sys);
            return (
              <button key={sys} onClick={() => toggle(sys)}
                className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-colors ${off ? "border-slate-200 text-slate-300 line-through" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: off ? "#cbd5e1" : colorForSystem(sys) }} />
                {appLabel.get(sys) ?? sys}
              </button>
            );
          })}
        </div>
      )}
      {list.filter((n) => n.due_at).length === 0 && (
        <div className="text-center text-sm text-slate-400 py-6">ไม่มีงานที่มีกำหนดส่งในช่วงนี้</div>
      )}
    </div>
  );
}
