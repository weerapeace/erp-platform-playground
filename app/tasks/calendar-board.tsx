"use client";

// ============================================================
// CalendarBoard — มุมมองปฏิทิน (งานเรียงตามกำหนดส่ง) สำหรับโมดูลงาน Creative
// ใช้ข้อมูล tasks ที่หน้า /tasks โหลดอยู่แล้ว (ไม่ยิง API เพิ่ม)
// 2026-11-20: ย้ายมาใช้ปฏิทินกลาง ScheduleBoard (เต็มจอ · กล่อง "ยังไม่ลงวัน" ขวา · ลากเปลี่ยนวัน · +N กดได้
//   · เดือน/สัปดาห์/รายการ · ค้นหา · ความแน่น · เลือกหลายงาน · วันหยุด · พิมพ์) + ป๊อปดูงาน (เลื่อนวัน/เปลี่ยนสถานะ/เปิดเต็ม)
// ============================================================
import { ScheduleBoard } from "@/components/schedule-board";
import { useViewportLayout } from "@/components/device-view";
import { statusMeta, isTerminal, transitionsFrom } from "./use-statuses";
import { isOverdue, type CreativeTask } from "./data";

export function CalendarBoard({ tasks, onCardClick, onSetDue, onSetDueMany, onStatus }: {
  tasks: CreativeTask[];
  onCardClick: (id: string) => void;
  onSetDue?: (task: CreativeTask, date: string | null) => void;
  onSetDueMany?: (tasks: CreativeTask[], deltaDays: number | null) => void;
  onStatus?: (task: CreativeTask, toKey: string) => void;
}) {
  const layout = useViewportLayout();
  // งานที่ปิดแล้วและไม่มีวัน ไม่ต้องรกกล่อง "ยังไม่ลงวัน"
  const items = tasks.filter((t) => t.due_date || !isTerminal(t.status));
  const chipCls = (t: CreativeTask) => isOverdue(t) ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-violet-50 hover:border-violet-200";
  const who = (t: CreativeTask) => (t.assignees?.length ? t.assignees.map((a) => a.label).join(", ") : t.assignee_label) || "ยังไม่มีผู้รับผิดชอบ";

  return (
    <ScheduleBoard<CreativeTask>
      items={items}
      layout={layout}
      maxPerDay={4}
      backlogTitle="ยังไม่ลงวันส่ง"
      printTitle="ปฏิทินงาน"
      getDate={(t) => (t.due_date ? String(t.due_date).slice(0, 10) : null)}
      onSchedule={(t, d) => onSetDue?.(t, d)}
      onScheduleMany={onSetDueMany}
      getSearchText={(t) => `${t.task_no ?? ""} ${t.title} ${t.product_name ?? ""} ${who(t)}`}
      getDotColor={(t) => (isOverdue(t) ? "#ef4444" : "#8b5cf6")}
      hint={onSetDue ? "ลากงานไปวันอื่นเพื่อเปลี่ยนวันส่ง · ลากเข้ากล่องขวา = ไม่กำหนดวัน · กดงานเพื่อดู/จัดการ" : "กดงานเพื่อดูรายละเอียด"}
      renderChip={(t) => (
        <button type="button" onClick={() => onCardClick(t.id)} title={`${t.task_no ?? ""} ${t.title}`}
          className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight ${chipCls(t)}`}>
          <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${statusMeta(t.status).dot}`} />{t.title}
        </button>
      )}
      renderCard={(t) => (
        <button type="button" onClick={() => onCardClick(t.id)}
          className={`block w-full rounded-lg border px-2 py-1.5 text-left text-xs ${chipCls(t)}`}>
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusMeta(t.status).dot}`} />{statusMeta(t.status).label}
            {t.task_no && <span className="ml-auto font-mono">{t.task_no}</span>}
          </div>
          <div className="truncate">{t.title}</div>
        </button>
      )}
      renderPopView={(t, close) => {
        const m = statusMeta(t.status);
        const next = transitionsFrom(t.status);
        return (
          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2">
              <div className="min-w-0">
                {t.task_no && <div className="font-mono text-[10px] text-slate-400">{t.task_no}</div>}
                <div className="text-sm font-semibold leading-snug text-slate-800">{t.title}</div>
              </div>
              <button type="button" onClick={close} aria-label="ปิด" className="ml-auto shrink-0 text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-slate-600">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}</span>
              <span>👤 {who(t)}</span>
              {t.product_name && <span className="truncate">📦 {t.product_name}</span>}
            </div>
            {onSetDue && (
              <label className="flex items-center gap-1.5">
                <span className="shrink-0 text-slate-500">📅 วันส่ง</span>
                <input type="date" value={t.due_date ? String(t.due_date).slice(0, 10) : ""} onChange={(e) => onSetDue(t, e.target.value || null)}
                  className="h-8 flex-1 rounded-lg border border-slate-200 px-2 text-xs" />
              </label>
            )}
            {onStatus && next.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {next.map((tr) => (
                  <button key={tr.to_key} type="button" onClick={() => { onStatus(t, tr.to_key); close(); }}
                    className="h-7 rounded-md border border-slate-200 px-2 hover:bg-violet-50 hover:border-violet-200">{tr.label || statusMeta(tr.to_key).label}</button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => { close(); onCardClick(t.id); }} className="h-8 w-full rounded-lg bg-violet-600 text-white hover:bg-violet-700">เปิดรายละเอียดเต็ม ↗</button>
          </div>
        );
      }}
    />
  );
}
