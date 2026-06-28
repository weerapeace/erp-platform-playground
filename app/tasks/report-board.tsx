"use client";

// ============================================================
// ReportBoard — รายงานสรุปงาน (productivity) สำหรับโมดูลงาน Creative
// คำนวณจาก tasks ที่โหลดแล้ว (client-side) — KPI + ตามแบรนด์ + ตามประเภทงาน
// ============================================================

import { useMemo } from "react";
import { useT } from "@/components/i18n";
import { isTerminal } from "./use-statuses";
import { isOverdue, type CreativeTask } from "./data";
import { taskTypeLabel } from "./use-options";

function groupCount(tasks: CreativeTask[], keyOf: (t: CreativeTask) => string): { label: string; n: number }[] {
  const m = new Map<string, number>();
  for (const t of tasks) { const k = keyOf(t); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
}

function BarList({ title, rows }: { title: string; rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-700 mb-3">{title}</p>
      {rows.length === 0 ? <p className="text-sm text-slate-400">—</p> : (
        <div className="space-y-2">
          {rows.slice(0, 12).map((r) => (
            <div key={r.label} className="flex items-center gap-2">
              <span className="text-xs text-slate-600 w-32 shrink-0 truncate">{r.label}</span>
              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400 rounded-full" style={{ width: `${(r.n / max) * 100}%` }} /></div>
              <span className="text-xs text-slate-500 w-8 text-right tabular-nums">{r.n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReportBoard({ tasks }: { tasks: CreativeTask[] }) {
  const t = useT();
  const s = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((tk) => isTerminal(tk.status)).length;
    const open = total - done;
    const overdue = tasks.filter((tk) => !isTerminal(tk.status) && isOverdue(tk)).length;
    const now = new Date(); const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const doneThisMonth = tasks.filter((tk) => tk.completed_at && String(tk.completed_at).slice(0, 7) === ym).length;
    const rate = total ? Math.round((done / total) * 100) : 0;
    const byBrand = groupCount(tasks, (tk) => tk.brand_label || t("ไม่ระบุแบรนด์", "No brand"));
    const byType = groupCount(tasks, (tk) => (tk.task_type ? taskTypeLabel(tk.task_type) : t("ไม่ระบุประเภท", "No type")));
    return { total, done, open, overdue, doneThisMonth, rate, byBrand, byType };
  }, [tasks, t]);

  const kpis: { label: string; value: string | number; tone: string }[] = [
    { label: t("งานทั้งหมด", "Total"), value: s.total, tone: "text-slate-800" },
    { label: t("เสร็จแล้ว", "Done"), value: s.done, tone: "text-emerald-600" },
    { label: t("กำลังทำ", "Open"), value: s.open, tone: "text-blue-600" },
    { label: t("เกินกำหนด", "Overdue"), value: s.overdue, tone: "text-red-600" },
    { label: t("เสร็จเดือนนี้", "Done this month"), value: s.doneThisMonth, tone: "text-violet-600" },
    { label: t("อัตราเสร็จ", "Completion"), value: `${s.rate}%`, tone: "text-amber-600" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{t("สรุปจากงานที่มีอยู่ในระบบตอนนี้", "Summary of current tasks in the system")}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className={`text-2xl font-bold tabular-nums ${k.tone}`}>{k.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BarList title={t("งานตามแบรนด์", "Tasks by brand")} rows={s.byBrand} />
        <BarList title={t("งานตามประเภท", "Tasks by type")} rows={s.byType} />
      </div>
    </div>
  );
}
