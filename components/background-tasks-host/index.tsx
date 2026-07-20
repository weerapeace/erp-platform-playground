"use client";
/**
 * BackgroundTasksHost — กล่องสถานะงานเบื้องหลังมุมขวาล่าง (ของกลาง)
 *   mount ครั้งเดียวใน layout · โชว์ทุกงานที่เรียกผ่าน runBackgroundTask()
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { subscribeBgTasks, getBgTasks, dismissBgTask, type BgTask } from "@/lib/background-tasks";

export function BackgroundTasksHost() {
  const tasks = useSyncExternalStore(subscribeBgTasks, getBgTasks, getBgTasks);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || tasks.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[600] flex flex-col gap-2 w-72 max-w-[90vw]">
      {tasks.map((t) => <BgCard key={t.id} t={t} />)}
    </div>,
    document.body,
  );
}

function BgCard({ t }: { t: BgTask }) {
  const pct = t.total > 0 ? Math.min(100, Math.round((t.done / t.total) * 100)) : (t.status === "running" ? 0 : 100);
  const textTone = t.status === "error" ? "text-rose-600" : t.status === "success" ? "text-emerald-600" : "text-indigo-600";
  const bar = t.status === "error" ? "bg-rose-500" : t.status === "success" ? "bg-emerald-500" : "bg-indigo-500";
  const icon = t.status === "error" ? "⚠️" : t.status === "success" ? "✓" : "⏳";
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-lg p-3 animate-[fadeIn_.2s_ease]">
      <div className="flex items-start gap-2">
        <span className={`text-sm shrink-0 ${t.status === "running" ? "animate-pulse" : ""}`}>{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-slate-700 truncate">{t.label}</p>
          <p className={`text-[11px] ${textTone} truncate`}>
            {t.status === "running"
              ? (t.total > 0 ? `กำลังทำ ${t.done}/${t.total}…` : "กำลังทำ…")
              : (t.message ?? (t.status === "success" ? "เสร็จแล้ว" : "ผิดพลาด"))}
          </p>
        </div>
        {t.status !== "running" && (
          <button onClick={() => dismissBgTask(t.id)} className="text-slate-400 hover:text-slate-600 shrink-0 text-xs" title="ปิด">✕</button>
        )}
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full ${bar} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
