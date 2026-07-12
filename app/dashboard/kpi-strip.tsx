"use client";

// KpiStrip — widget แถบ KPI ตัวเลขจริง (เฟส 3 Role Board) — สรุปงานค้าง + เลขจริงรวมทุกระบบ
import { METRIC_LABEL, colorForSystem } from "@/lib/dashboard-systems";
import type { SystemApp } from "./system-cards";

export function KpiStrip({ unread, metrics, apps }: { unread: number; metrics: Record<string, number>; apps: SystemApp[] }) {
  const appLabel = new Map(apps.map((a) => [a.key, a.label]));
  const entries = Object.entries(metrics).filter(([k, v]) => v > 0 && METRIC_LABEL[k]).slice(0, 3);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="text-xs text-slate-500">งานค้างของฉัน</div>
        <div className="text-2xl font-semibold text-slate-800">{unread}</div>
      </div>
      {entries.map(([k, v]) => (
        <div key={k} className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-xs text-slate-500 flex items-center gap-1.5 truncate">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorForSystem(k) }} />
            <span className="truncate">{appLabel.get(k) ?? k} · {METRIC_LABEL[k]}</span>
          </div>
          <div className="text-2xl font-semibold text-slate-800">{v}</div>
        </div>
      ))}
    </div>
  );
}
