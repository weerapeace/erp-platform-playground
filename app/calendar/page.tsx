"use client";

// ============================================================
// โหมดปฏิทิน — ปฏิทินรวมเดดไลน์จริงจากทุกแผนก (ผลิต/ของเข้า/Design/ใบวางบิล/งาน/ขาย)
// เลือกเปิด-ปิดชั้น (Module) ได้ · คลิก event → เด้งไปหน้ารายละเอียดของแผนกนั้น
// ดึงจาก /api/calendar/events (RPC erp_calendar_events) ตามเดือนที่เปิดดู
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import type { CalendarEvent } from "@/app/api/calendar/events/route";

const WEEK = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const dkey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// ชั้น (Module) + สี + ป้าย
const MODULES: { key: string; label: string; color: string }[] = [
  { key: "production", label: "ผลิต", color: "#6366f1" },
  { key: "purchasing", label: "ของเข้า", color: "#f59e0b" },
  { key: "qc", label: "ส่ง QC", color: "#f43f5e" },
  { key: "billing", label: "ใบวางบิล", color: "#10b981" },
  { key: "sales", label: "ขาย/ส่งของ", color: "#ec4899" },
  { key: "design", label: "Design", color: "#8b5cf6" },
  { key: "tasks", label: "งาน", color: "#0ea5e9" },
];
const modMeta = new Map(MODULES.map((m) => [m.key, m]));
const colorOf = (m: string) => modMeta.get(m)?.color ?? "#94a3b8";
const labelOf = (m: string) => modMeta.get(m)?.label ?? m;

export default function CalendarPage() {
  const router = useRouter();
  const today = new Date();
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: today.getFullYear(), m: today.getMonth() });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    const from = new Date(ym.y, ym.m, 1);
    const to = new Date(ym.y, ym.m + 1, 0);
    setLoading(true);
    apiFetch(`/api/calendar/events?from=${ymd(from)}&to=${ymd(to)}`)
      .then((r) => r.json())
      .then((j) => setEvents((j.data ?? []) as CalendarEvent[]))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [ym]);
  useEffect(() => { load(); }, [load]);

  // event → จัดตามวัน (ข้ามชั้นที่ปิด)
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      if (hidden.has(e.module)) continue;
      const d = new Date(e.date + "T00:00:00");
      const k = dkey(d);
      (map.get(k) ?? map.set(k, []).get(k)!).push(e);
    }
    return map;
  }, [events, hidden]);

  // จำนวน event ต่อชั้น (สำหรับป้าย legend)
  const countByMod = useMemo(() => {
    const c = new Map<string, number>();
    for (const e of events) c.set(e.module, (c.get(e.module) ?? 0) + 1);
    return c;
  }, [events]);

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
  const toggle = (m: string) => setHidden((h) => { const n = new Set(h); if (n.has(m)) n.delete(m); else n.add(m); return n; });

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">📅 ปฏิทินรวม</h1>
            <p className="text-sm text-slate-500 mt-1">เดดไลน์จริงทุกแผนกในที่เดียว · เลือกเปิด-ปิดชั้นได้</p>
          </div>
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 text-xs">
            <span className={loading ? "animate-spin" : ""}>🔄</span> รีเฟรช
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 max-w-5xl mx-auto w-full">
        {/* ชั้น (Module) เปิด-ปิด */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-[11px] text-slate-400">ชั้นที่แสดง:</span>
          {MODULES.map((mod) => {
            const off = hidden.has(mod.key);
            const cnt = countByMod.get(mod.key) ?? 0;
            return (
              <button key={mod.key} onClick={() => toggle(mod.key)}
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${off ? "border-slate-200 text-slate-300 line-through" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: off ? "#cbd5e1" : mod.color }} />
                {mod.label}{cnt > 0 && <span className="text-slate-400">({cnt})</span>}
              </button>
            );
          })}
        </div>

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
              if (!d) return <div key={i} className="min-h-[72px]" />;
              const items = byDay.get(dkey(d)) ?? [];
              const tdy = isToday(d);
              return (
                <div key={i} className={`min-h-[72px] rounded-lg border p-1 ${tdy ? "border-blue-300 bg-blue-50/50" : "border-slate-100"}`}>
                  <div className={`text-[11px] mb-0.5 ${tdy ? "text-blue-700 font-semibold" : isPast(d) ? "text-slate-300" : "text-slate-500"}`}>{d.getDate()}</div>
                  <div className="space-y-0.5">
                    {items.slice(0, 4).map((e) => (
                      <button key={e.id} onClick={() => router.push(e.link)} title={`${labelOf(e.module)} · ${e.title}`}
                        className="w-full text-left text-[10px] text-white rounded px-1 py-0.5 truncate leading-tight hover:opacity-90"
                        style={{ background: colorOf(e.module) }}>
                        {e.title}
                      </button>
                    ))}
                    {items.length > 4 && <div className="text-[10px] text-slate-400 px-1">+{items.length - 4} รายการ</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {!loading && events.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-8">ไม่มีเดดไลน์ในเดือนนี้</div>
          )}
        </div>
      </div>
    </PlaygroundShell>
  );
}
