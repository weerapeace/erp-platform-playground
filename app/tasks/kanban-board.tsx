"use client";

// ============================================================
// Creative Task Manager — Kanban Board
// ลากการ์ดข้ามคอลัมน์ = เปลี่ยนสถานะ (ใช้ @dnd-kit ของกลาง)
// validate transition + audit ทำที่ API (/api/creative-tasks/[id])
// ============================================================

import { useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { STATUS_META, PRIORITY_META, isOverdue, type CreativeTask, type CreativeStatus, type CreativePriority } from "./data";

// คอลัมน์หลักของสายงาน (เลื่อนแนวนอนได้) — ตัด cancelled/blocked ออกจากบอร์ดหลัก
const COLUMNS: CreativeStatus[] = ["backlog", "ready", "in_progress", "need_review", "revision", "approved", "scheduled", "published", "done"];

function CardBody({ task, dragging }: { task: CreativeTask; dragging?: boolean }) {
  const pr = PRIORITY_META[task.priority as CreativePriority];
  const overdue = isOverdue(task);
  return (
    <div className={`bg-white rounded-lg border border-slate-200 p-3 shadow-sm ${dragging ? "shadow-xl ring-2 ring-violet-300 rotate-1" : "hover:border-violet-300 hover:shadow"}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${pr.cls}`}>{pr.label}</span>
        <span className="font-mono text-[10px] text-slate-400">{task.task_no}</span>
      </div>
      <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2 mb-2">{task.title}</p>
      {task.sku_code && <p className="text-[11px] text-slate-400 line-clamp-1 mb-1.5">📦 {task.sku_code}{task.sku_name ? ` · ${task.sku_name}` : ""}</p>}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-500 line-clamp-1 flex-1">👤 {task.assignee_label || "—"}</span>
        {task.due_date && <span className={overdue ? "text-red-600 font-semibold" : "text-slate-400"}>{overdue && "⚠ "}{task.due_date.slice(5)}</span>}
      </div>
      <div className="mt-2 pt-2 border-t border-slate-100">
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400" style={{ width: `${task.progress_percent}%` }} /></div>
      </div>
    </div>
  );
}

function DraggableCard({ task, onClick }: { task: CreativeTask; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={onClick}
      className={`cursor-grab active:cursor-grabbing touch-none ${isDragging ? "opacity-40" : ""}`}>
      <CardBody task={task} />
    </div>
  );
}

function Column({ status, tasks, onCardClick }: { status: CreativeStatus; tasks: CreativeTask[]; onCardClick: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const m = STATUS_META[status];
  return (
    <div className="flex flex-col w-64 shrink-0">
      <div className="flex items-center justify-between px-3 py-2 bg-white rounded-t-lg border border-b-0 border-slate-200 border-t-4 border-t-violet-300">
        <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${m.dot}`} /><span className="text-sm font-semibold text-slate-700">{m.label}</span></div>
        <span className="text-xs font-medium text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{tasks.length}</span>
      </div>
      <div ref={setNodeRef} className={`flex-1 min-h-[120px] space-y-2 p-2 rounded-b-lg border border-t-0 border-slate-200 transition-colors ${isOver ? "bg-violet-50" : "bg-slate-50/60"}`}>
        {tasks.map((t) => <DraggableCard key={t.id} task={t} onClick={() => onCardClick(t.id)} />)}
        {tasks.length === 0 && <div className="h-20 flex items-center justify-center text-xs text-slate-300 border-2 border-dashed border-slate-200 rounded-lg">ลากการ์ดมาวางที่นี่</div>}
      </div>
    </div>
  );
}

export function KanbanBoard({ tasks, onMove, onCardClick }: {
  tasks: CreativeTask[];
  onMove: (taskId: string, to: CreativeStatus) => void;
  onCardClick: (id: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const activeTask = tasks.find((t) => t.id === activeId) ?? null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over?.id as CreativeStatus | undefined;
    if (!overId) return;
    const task = tasks.find((t) => t.id === String(e.active.id));
    if (task && task.status !== overId) onMove(task.id, overId);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {COLUMNS.map((status) => (
          <Column key={status} status={status} tasks={tasks.filter((t) => t.status === status)} onCardClick={onCardClick} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{activeTask ? <div className="w-64"><CardBody task={activeTask} dragging /></div> : null}</DragOverlay>
    </DndContext>
  );
}
