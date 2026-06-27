"use client";

// ============================================================
// WorkloadBoard — ภาระงานต่อคน (หัวหน้าเห็นว่าใครถืองานกี่ชิ้น/ใครงานล้น)
// คำนวณจาก tasks + ผู้รับผิดชอบ (m2m) ที่หน้า /tasks โหลดอยู่แล้ว — นับเฉพาะงานที่ยังไม่ปิด
// ============================================================

import { useMemo } from "react";
import { useT } from "@/components/i18n";
import { isTerminal } from "./use-statuses";
import { isOverdue, type CreativeTask, type SubtaskAssignee } from "./data";
import { AssigneeAvatar } from "./assignee-avatar";
import { StatusBadge } from "./task-detail-drawer";

type Row = { person: SubtaskAssignee; open: number; overdue: number; tasks: CreativeTask[] };

export function WorkloadBoard({ tasks, onCardClick }: { tasks: CreativeTask[]; onCardClick: (id: string) => void }) {
  const t = useT();

  const { rows, unassigned } = useMemo(() => {
    const m = new Map<string, Row>();
    const noOne: CreativeTask[] = [];
    for (const tk of tasks) {
      if (isTerminal(tk.status)) continue;
      const as = tk.assignees ?? [];
      if (as.length === 0) { noOne.push(tk); continue; }
      for (const a of as) {
        const e = m.get(a.id) ?? { person: a, open: 0, overdue: 0, tasks: [] };
        e.open++; if (isOverdue(tk)) e.overdue++; e.tasks.push(tk);
        m.set(a.id, e);
      }
    }
    return { rows: [...m.values()].sort((a, b) => b.open - a.open), unassigned: noOne };
  }, [tasks]);

  const maxOpen = Math.max(1, ...rows.map((r) => r.open));

  if (rows.length === 0 && unassigned.length === 0) {
    return <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">{t("ไม่มีงานค้างในระบบ 🎉", "No open tasks 🎉")}</div>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">{t("ภาระงานที่ยังไม่ปิด แยกตามผู้รับผิดชอบ (เรียงจากมากไปน้อย)", "Open workload per assignee (most first)")}</p>
      {rows.map((r) => (
        <div key={r.person.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <AssigneeAvatar a={r.person} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800">{r.person.label || t("ไม่ทราบชื่อ", "Unknown")}</span>
                <span className="text-xs text-slate-500">{r.open} {t("งาน", "tasks")}</span>
                {r.overdue > 0 && <span className="text-[11px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-1.5">⚠ {t("เกินกำหนด", "overdue")} {r.overdue}</span>}
              </div>
              {/* แถบภาระงาน */}
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1.5">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${(r.open / maxOpen) * 100}%` }} />
              </div>
            </div>
          </div>
          {/* งานของคนนี้ (chips กดเปิดได้) */}
          <div className="flex flex-wrap gap-1.5 mt-2 pl-11">
            {r.tasks.slice(0, 12).map((tk) => (
              <button key={tk.id} onClick={() => onCardClick(tk.id)} title={`${tk.task_no ?? ""} ${tk.title}`}
                className={`inline-flex items-center gap-1 text-[11px] rounded-full border px-2 py-0.5 max-w-[200px] ${isOverdue(tk) ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-violet-50 hover:border-violet-200"}`}>
                <span className="truncate">{tk.title}</span>
              </button>
            ))}
            {r.tasks.length > 12 && <span className="text-[11px] text-slate-400 self-center">+{r.tasks.length - 12}</span>}
          </div>
        </div>
      ))}

      {unassigned.length > 0 && (
        <div className="bg-amber-50/50 rounded-xl border border-amber-200 p-3">
          <p className="text-sm font-semibold text-amber-800 mb-2">🕳 {t("ยังไม่มีผู้รับผิดชอบ", "Unassigned")} ({unassigned.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map((tk) => (
              <button key={tk.id} onClick={() => onCardClick(tk.id)} className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-amber-200 bg-white px-2 py-1 hover:border-violet-300 max-w-[260px]">
                <StatusBadge status={tk.status} />
                <span className="truncate text-slate-700">{tk.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
