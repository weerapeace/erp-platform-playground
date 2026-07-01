"use client";

// ============================================================
// GoalRoadmap — "เส้นทางสู่ความสำเร็จ" (ของกลาง)
// แสดงขั้นบันไดของเป้าหมายเป็น stepper แนวตั้ง
//  ✅ เสร็จ (เขียว) · 🔵 กำลังทำ (ฟ้า + แถบ%) · ⚪ ยังไม่เริ่ม (เทา) · ⊘ ข้าม
// reusable: โมดูลอื่น (แคมเปญ/โปรเจกต์/ผลิต) เอาไปใช้ซ้ำได้
//  <GoalRoadmap steps={steps} onToggleStep={fn} onAddStep={fn} onCreateTask={fn} />
// ============================================================

import React from "react";

export type StepStatus = "pending" | "in_progress" | "done" | "skipped";

export type RoadmapStep = {
  id: string;
  title: string;
  description?: string;
  status: StepStatus;
  target_date?: string | null;   // ISO "YYYY-MM-DD"
  progress_percent?: number;     // 0-100 (เฉพาะ in_progress)
  assignee?: string;
  linked_task_count?: number;
  linked_task_done?: number;
};

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${TH_MONTH[m - 1]} ${y}`;
}

const STATUS_LABEL: Record<StepStatus, string> = {
  pending: "ยังไม่เริ่ม",
  in_progress: "กำลังทำ",
  done: "เสร็จแล้ว",
  skipped: "ข้าม",
};

function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconPlay() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

export function GoalRoadmap({
  steps,
  editable = false,
  onToggleStep,
  onAddStep,
  onCreateTask,
}: {
  steps: RoadmapStep[];
  editable?: boolean;
  /** คลิกวงกลม → สลับสถานะเสร็จ/ยังไม่เสร็จ */
  onToggleStep?: (id: string) => void;
  onAddStep?: () => void;
  onCreateTask?: (step: RoadmapStep) => void;
}) {
  const ordered = [...steps];

  return (
    <div className="flex flex-col">
      {ordered.map((step, i) => {
        const isLast = i === ordered.length - 1;
        const done = step.status === "done";
        const active = step.status === "in_progress";
        const skipped = step.status === "skipped";

        // สีวงกลม + เส้นเชื่อม
        const circle = done
          ? "bg-emerald-500 text-white border-emerald-500"
          : active
            ? "bg-blue-50 text-blue-600 border-blue-500"
            : "bg-slate-50 text-slate-400 border-slate-300";
        const connector = done ? "bg-emerald-400" : "bg-slate-200";

        return (
          <div key={step.id} className="flex gap-3.5">
            {/* Rail: วงกลม + เส้น */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                disabled={!editable || !onToggleStep || skipped}
                onClick={() => onToggleStep?.(step.id)}
                title={editable ? "คลิกเพื่อสลับเสร็จ/ยังไม่เสร็จ" : STATUS_LABEL[step.status]}
                className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-semibold flex-shrink-0 transition-colors ${circle} ${
                  editable && onToggleStep && !skipped ? "cursor-pointer hover:brightness-95" : "cursor-default"
                }`}
              >
                {done ? <IconCheck /> : active ? <IconPlay /> : skipped ? "⊘" : i + 1}
              </button>
              {!isLast && <div className={`w-0.5 flex-1 min-h-[22px] ${connector}`} />}
            </div>

            {/* เนื้อหาแต่ละขั้น */}
            <div className={`flex-1 ${isLast ? "pb-0" : "pb-5"}`}>
              <div className={`font-medium ${done || active ? "text-slate-900" : "text-slate-500"} ${skipped ? "line-through text-slate-400" : ""}`}>
                {i + 1}. {step.title}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap gap-x-2">
                <span
                  className={
                    done ? "text-emerald-600" : active ? "text-blue-600" : "text-slate-400"
                  }
                >
                  {active && step.progress_percent != null
                    ? `กำลังทำ ${step.progress_percent}%`
                    : STATUS_LABEL[step.status]}
                </span>
                {step.target_date && <span>· กำหนด {fmtDate(step.target_date)}</span>}
                {step.assignee && <span>· {step.assignee}</span>}
              </div>

              {step.description && (
                <div className="text-xs text-slate-500 mt-1">{step.description}</div>
              )}

              {/* แถบ % ของขั้นที่กำลังทำ */}
              {active && step.progress_percent != null && (
                <div className="h-1.5 w-40 max-w-full bg-slate-100 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${step.progress_percent}%` }} />
                </div>
              )}

              {/* งานที่ผูก + ปุ่มสร้างงาน */}
              {(step.linked_task_count || onCreateTask) && !done && !skipped && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {!!step.linked_task_count && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1">
                      📋 งานผูกไว้ {step.linked_task_count} ชิ้น
                      {step.linked_task_done != null && ` (เสร็จ ${step.linked_task_done})`}
                    </span>
                  )}
                  {onCreateTask && (
                    <button
                      type="button"
                      onClick={() => onCreateTask(step)}
                      className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:bg-blue-50 rounded-full px-2.5 py-1 transition-colors"
                    >
                      + สร้างงาน
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {editable && onAddStep && (
        <button
          type="button"
          onClick={onAddStep}
          className="ml-[46px] mt-1 self-start text-sm text-slate-500 hover:text-blue-600 border border-dashed border-slate-300 hover:border-blue-300 rounded-lg px-3 py-1.5 transition-colors"
        >
          + เพิ่มขั้นบันได
        </button>
      )}
    </div>
  );
}
