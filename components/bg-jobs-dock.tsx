"use client";

// ของกลาง: ชิปงานเบื้องหลัง (ลอยมุมล่างขวา) — โชว์งานที่ยิงผ่าน runBgJob (lib/bg-jobs)
// running = สปินเนอร์ + แถบโหลดวิ่ง + เวลาเดิน · done = ✓ + ลิงก์เปิดผลลัพธ์ · error = ! + สาเหตุ
// mount ครั้งเดียวระดับหน้า (เช่น app/tasks/page.tsx)

import { useEffect, useState } from "react";
import { subscribeBgJobs, dismissBgJob, type BgJob } from "@/lib/bg-jobs";
import { useT } from "@/components/i18n";

export function BgJobsDock() {
  const [jobs, setJobs] = useState<BgJob[]>([]);
  useEffect(() => subscribeBgJobs(setJobs), []);
  if (jobs.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[10000] flex flex-col gap-2 w-[19rem] max-w-[calc(100vw-2rem)]">
      {/* keyframes สำหรับแถบโหลดแบบวิ่ง (indeterminate) + ชิปเด้งเข้า */}
      <style>{`
        @keyframes bgjob-indet{0%{left:-40%;width:40%}50%{width:60%}100%{left:100%;width:40%}}
        @keyframes bgjob-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      `}</style>
      {jobs.map((j) => <BgJobChip key={j.id} job={j} />)}
    </div>
  );
}

function BgJobChip({ job }: { job: BgJob }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (job.status !== "running") return;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [job.status]);

  const secs = Math.max(0, Math.round(((job.endedAt ?? now) - job.startedAt) / 1000));
  const timeStr = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m${String(secs % 60).padStart(2, "0")}s`;

  const border = job.status === "running" ? "border-violet-200" : job.status === "done" ? "border-emerald-200" : "border-rose-200";

  return (
    <div className={`rounded-xl border ${border} bg-white shadow-lg px-3 py-2.5`} style={{ animation: "bgjob-in .2s ease-out" }}>
      <div className="flex items-start gap-2.5">
        {job.status === "running" ? (
          <span className="mt-0.5 h-4 w-4 rounded-full border-2 border-violet-200 border-t-violet-600 animate-spin shrink-0" aria-hidden />
        ) : job.status === "done" ? (
          <span className="mt-0.5 h-4 w-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[11px] shrink-0">✓</span>
        ) : (
          <span className="mt-0.5 h-4 w-4 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-[11px] font-bold shrink-0">!</span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-slate-700 text-sm truncate">{job.label}</p>
            <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">{timeStr}</span>
          </div>
          <p className={`text-[11px] truncate ${job.status === "error" ? "text-rose-600" : "text-slate-500"}`}>
            {job.status === "running"
              ? (job.hint || t("กำลังทำงานเบื้องหลัง…", "Working in the background…"))
              : job.status === "done"
                ? (job.detail || t("เสร็จแล้ว", "Done"))
                : (job.detail || t("ทำไม่สำเร็จ", "Failed"))}
          </p>
          {job.status === "done" && job.href && (
            <a href={job.href} target="_blank" rel="noopener noreferrer"
              className="inline-block mt-1 text-[11px] font-medium text-violet-700 hover:underline">
              📁 {t("เปิดโฟลเดอร์", "Open folder")}
            </a>
          )}
        </div>

        {job.status !== "running" && (
          <button onClick={() => dismissBgJob(job.id)} aria-label={t("ปิด", "Dismiss")}
            className="text-slate-300 hover:text-slate-500 shrink-0 text-xs leading-none mt-0.5">✕</button>
        )}
      </div>

      {job.status === "running" && (
        <div className="mt-2 h-1 rounded-full bg-violet-100 overflow-hidden relative">
          <span className="absolute top-0 h-full rounded-full bg-violet-500"
            style={{ animation: "bgjob-indet 1.3s ease-in-out infinite" }} />
        </div>
      )}
    </div>
  );
}
