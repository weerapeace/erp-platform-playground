"use client";

// ============================================================
// Task Manager — Kanban Board (ขั้น A mock)
// ลากการ์ดข้ามคอลัมน์ = เปลี่ยนสถานะ (ใช้ @dnd-kit ของกลางที่ติดตั้งแล้ว)
// ขั้น B จะ validate transition ผ่าน workflow engine กลาง + audit
// ============================================================

import { useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import {
  STATUS_META, PRIORITY_META, isOverdue,
  type Task, type TaskStatus, type TaskPriority,
} from "./mock-data";

const COLUMNS: TaskStatus[] = ["new", "in_progress", "review", "done", "cancelled"];

const COLUMN_ACCENT: Record<TaskStatus, string> = {
  new:         "border-t-blue-400",
  in_progress: "border-t-indigo-400",
  review:      "border-t-amber-400",
  done:        "border-t-emerald-400",
  cancelled:   "border-t-slate-300",
};

// ---- การ์ดเนื้อหา (ใช้ทั้งในคอลัมน์ + DragOverlay) ----
function CardBody({ task, dragging }: { task: Task; dragging?: boolean }) {
  const pr = PRIORITY_META[task.priority as TaskPriority];
  const overdue = isOverdue(task);
  const doneSub = task.subtasks.filter(s => s.status === "done").length;
  const doneChk = task.checklist.filter(c => c.done).length;
  const subTotal = task.subtasks.length;
  const chkTotal = task.checklist.length;
  return (
    <div className={`bg-white rounded-lg border border-slate-200 p-3 shadow-sm ${dragging ? "shadow-xl ring-2 ring-violet-300 rotate-1" : "hover:border-violet-300 hover:shadow"}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${pr.cls}`}>{pr.label}</span>
        <span className="font-mono text-[10px] text-slate-400">{task.task_no}</span>
      </div>
      <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2 mb-2">{task.title}</p>
      {task.product_sku && (
        <p className="text-[11px] text-slate-400 line-clamp-1 mb-1.5">📦 {task.product_sku}</p>
      )}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-500 line-clamp-1 flex-1">👤 {task.assignee_name}</span>
        {task.due_date && (
          <span className={overdue ? "text-red-600 font-semibold" : "text-slate-400"}>
            {overdue && "⚠ "}{task.due_date.slice(5)}
          </span>
        )}
      </div>
      {(subTotal > 0 || chkTotal > 0) && (
        <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-400">
          {subTotal > 0 && <span>☑️ งานย่อย {doneSub}/{subTotal}</span>}
          {chkTotal > 0 && <span>✓ เช็คลิสต์ {doneChk}/{chkTotal}</span>}
        </div>
      )}
    </div>
  );
}

// ---- การ์ดที่ลากได้ ----
function DraggableCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      onClick={onClick}
      className={`cursor-grab active:cursor-grabbing touch-none ${isDragging ? "opacity-40" : ""}`}
    >
      <CardBody task={task} />
    </div>
  );
}

// ---- คอลัมน์ (drop zone) ----
function Column({ status, tasks, onCardClick }: { status: TaskStatus; tasks: Task[]; onCardClick: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const m = STATUS_META[status];
  return (
    <div className="flex flex-col w-72 shrink-0">
      <div className={`flex items-center justify-between px-3 py-2 bg-white rounded-t-lg border border-b-0 border-slate-200 border-t-4 ${COLUMN_ACCENT[status]}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${m.dot}`} />
          <span className="text-sm font-semibold text-slate-700">{m.label}</span>
        </div>
        <span className="text-xs font-medium text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[120px] space-y-2 p-2 rounded-b-lg border border-t-0 border-slate-200 transition-colors ${isOver ? "bg-violet-50" : "bg-slate-50/60"}`}
      >
        {tasks.map(t => <DraggableCard key={t.id} task={t} onClick={() => onCardClick(t.id)} />)}
        {tasks.length === 0 && (
          <div className="h-20 flex items-center justify-center text-xs text-slate-300 border-2 border-dashed border-slate-200 rounded-lg">
            ลากการ์ดมาวางที่นี่
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Board
// ============================================================

export function KanbanBoard({
  tasks, onMove, onCardClick,
}: {
  tasks: Task[];
  onMove: (taskId: string, to: TaskStatus) => void;
  onCardClick: (id: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const activeTask = tasks.find(t => t.id === activeId) ?? null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over?.id as TaskStatus | undefined;
    if (!overId) return;
    const task = tasks.find(t => t.id === String(e.active.id));
    if (task && task.status !== overId) onMove(task.id, overId);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {COLUMNS.map(status => (
          <Column
            key={status}
            status={status}
            tasks={tasks.filter(t => t.status === status)}
            onCardClick={onCardClick}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? <div className="w-72"><CardBody task={activeTask} dragging /></div> : null}
      </DragOverlay>
    </DndContext>
  );
}
