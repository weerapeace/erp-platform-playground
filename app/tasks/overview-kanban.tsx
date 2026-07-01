"use client";

// ============================================================
// Overview Kanban — บอร์ดการ์ดในหน้าภาพรวม (แทนตาราง)
// จัดกลุ่มคอลัมน์ได้: สถานะ / แบรนด์ / ความสำคัญ / ประเภทงาน (จากธีม kanban)
// ลากการ์ดข้ามคอลัมน์ = เปลี่ยนค่านั้น — สถานะผ่าน workflow (onMoveStatus), อื่น ๆ แก้ตรง (onSetField)
// การ์ดเลือกโชว์ข้อมูลได้ (รูปปก/แบรนด์/ผู้รับผิดชอบ/กำหนดส่ง/ความสำคัญ/ความคืบหน้า)
// ============================================================

import { useMemo, useState } from "react";
import { useT } from "@/components/i18n";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { r2ImageUrl } from "@/lib/r2-image";
import { HoverPreview } from "@/components/hover-image";
import { AssigneeStack } from "./assignee-avatar";
import { taskTypeLabel } from "./use-options";
import { statusMeta, type Status } from "./use-statuses";
import { PRIORITY_META, priorityLabel, isOverdue, type CreativeTask, type CreativePriority, type BrandOption } from "./data";
import type { KanbanTheme, KanbanGroupBy, StatusColorMap, AnimTheme } from "./overview-customizer";
import { ovStatusBg } from "./overview-customizer";

const NONE = "__none__";

type Col = { key: string; label: string; dotClass?: string; dotColor?: string; barColor?: string };

// ค่ากลุ่มของงานตามมิติที่เลือก
function groupValue(task: CreativeTask, by: KanbanGroupBy): string {
  if (by === "status") return task.status;
  if (by === "brand") return task.brand_id ?? NONE;
  if (by === "priority") return task.priority;
  return task.task_type ?? NONE;
}

// รูปการ์ด: Parent SKU มาก่อน (ตามกฎเดียวกับ drawer) → รูปที่อัปเอง → รูป SKU
export function coverKey(task: CreativeTask): string | null {
  return (task.parent_sku_image_key as string) || (task.cover_image_r2_key as string) || (task.sku_image_key as string) || null;
}

// ───────── การ์ด ─────────
function CardBody({ task, cfg, dragging }: { task: CreativeTask; cfg: KanbanTheme; dragging?: boolean }) {
  useT();   // subscribe ภาษา
  const pr = PRIORITY_META[task.priority as CreativePriority];
  const overdue = isOverdue(task);
  const cover = cfg.cover ? coverKey(task) : null;
  const coverUrl = cover ? r2ImageUrl(cover, 320) : null;
  // กรอบสีตามแบรนด์ (ถ้าเปิด + แบรนด์มีสี hex)
  const bc = task.brand_color;
  const brandBorder = cfg.brandBorder && bc && /^#[0-9a-fA-F]{6}$/.test(String(bc));
  const compact = cfg.compact === true;
  const showSku = cfg.sku !== false, showTaskNo = cfg.taskNo !== false;
  return (
    <div className={`bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm ${dragging ? "shadow-xl ring-2 ring-violet-300 rotate-1" : "hover:border-violet-300 hover:shadow"}`}
      style={brandBorder ? { borderColor: String(bc), borderLeftWidth: 3 } : undefined}>
      {coverUrl && (
        <HoverPreview url={r2ImageUrl(cover)} previewW={640}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" loading="lazy" decoding="async" className={`${compact ? "h-12" : "h-20"} w-full object-cover bg-slate-50 border-b border-slate-100`} />
        </HoverPreview>
      )}
      <div className={compact ? "p-2" : "p-2.5"}>
        <div className={`flex items-center justify-between gap-2 ${compact ? "mb-1" : "mb-1.5"}`}>
          <div className="flex items-center gap-1 min-w-0">
            {cfg.priority && pr && <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${pr.cls}`}>{priorityLabel(task.priority as CreativePriority)}</span>}
            {cfg.taskType !== false && task.task_type && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border bg-slate-100 text-slate-600 border-slate-200 truncate max-w-[110px]">{taskTypeLabel(task.task_type)}</span>}
          </div>
          {showTaskNo && <span className="font-mono text-[10px] text-slate-400 shrink-0">{task.task_no}</span>}
        </div>
        <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2">{task.title}</p>
        {showSku && task.sku_code && <p className="text-[11px] text-slate-400 line-clamp-1 mt-1">📦 {task.sku_code}{task.sku_name ? ` · ${task.sku_name}` : ""}</p>}
        {cfg.brand && task.brand_label && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
            <span className="h-2 w-2 rounded-full" style={{ background: task.brand_color || "#cbd5e1" }} />{task.brand_label}
          </div>
        )}
        {(cfg.assignee || cfg.due) && (
          <div className="flex items-center justify-between gap-2 mt-2">
            {cfg.assignee ? <AssigneeStack list={task.assignees} size={20} /> : <span />}
            {cfg.due && task.due_date && <span className={`text-[11px] ${overdue ? "text-red-600 font-semibold" : "text-slate-400"}`}>{overdue && "⚠ "}{task.due_date.slice(5)}</span>}
          </div>
        )}
        {cfg.progress && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400" style={{ width: `${task.progress_percent}%` }} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ task, cfg, animCls, onClick }: { task: CreativeTask; cfg: KanbanTheme; animCls?: string; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={onClick}
      className={`cursor-grab active:cursor-grabbing touch-none ${animCls ?? ""} ${isDragging ? "opacity-40" : ""}`}>
      <CardBody task={task} cfg={cfg} />
    </div>
  );
}

function Column({ col, tasks, cfg, accent, animCls, onCardClick }: { col: Col; tasks: CreativeTask[]; cfg: KanbanTheme; accent: string; animCls?: string; onCardClick: (id: string) => void }) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div className="flex flex-col w-64 shrink-0">
      <div className="flex items-center justify-between px-3 py-2 bg-white rounded-t-lg border border-b-0 border-slate-200 border-t-4" style={{ borderTopColor: col.barColor || accent }}>
        <div className="flex items-center gap-2 min-w-0">
          {col.dotColor ? <span className="h-2 w-2 rounded-full shrink-0" style={{ background: col.dotColor }} /> : col.dotClass ? <span className={`h-2 w-2 rounded-full shrink-0 ${col.dotClass}`} /> : null}
          <span className="text-sm font-semibold text-slate-700 truncate" title={col.label}>{col.label}</span>
        </div>
        <span className="text-xs font-medium text-slate-400 bg-slate-100 rounded-full px-2 py-0.5 shrink-0">{tasks.length}</span>
      </div>
      <div ref={setNodeRef} className={`flex-1 min-h-[120px] space-y-2 p-2 rounded-b-lg border border-t-0 border-slate-200 transition-colors ${isOver ? "bg-violet-50" : "bg-slate-50/60"}`}>
        {tasks.map((tk) => <DraggableCard key={tk.id} task={tk} cfg={cfg} animCls={animCls} onClick={() => onCardClick(tk.id)} />)}
        {tasks.length === 0 && <div className="h-16 flex items-center justify-center text-xs text-slate-300 border-2 border-dashed border-slate-200 rounded-lg">{t("ลากการ์ดมาวางที่นี่", "Drag cards here")}</div>}
      </div>
    </div>
  );
}

export function OverviewKanban({ tasks, statuses, brands, cfg, accent, statusColors, anim, onMoveStatus, onSetField, onCardClick }: {
  tasks: CreativeTask[];
  statuses: Status[];
  brands: BrandOption[];
  cfg: KanbanTheme;
  accent: string;
  statusColors?: StatusColorMap;
  anim?: AnimTheme;
  onMoveStatus: (taskId: string, toKey: string) => void;
  onSetField: (taskId: string, field: string, value: string | null) => void;
  onCardClick: (id: string) => void;
}) {
  const t = useT();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const activeTask = tasks.find((x) => x.id === activeId) ?? null;
  const animCls = `${anim?.hover ? "ov-hover" : ""} ${anim?.entrance ? "ov-enter" : ""}`.trim();
  // สีสถานะที่ผู้ใช้ตั้งเอง (ไล่สีได้) → ใช้กับจุด/แถบหัวคอลัมน์
  const stColor = (key: string): { dotColor?: string; barColor?: string } => {
    const bg = statusColors ? ovStatusBg({ statusColors } as Parameters<typeof ovStatusBg>[0], key) : null;
    return bg ? { dotColor: bg, barColor: statusColors?.[key]?.c1 } : {};
  };

  // คอลัมน์ตามมิติที่จัดกลุ่ม (เฉพาะที่มีงาน + คอลัมน์ระบบที่กำหนดไว้)
  const columns = useMemo<Col[]>(() => {
    if (cfg.groupBy === "status") {
      const known = new Set(statuses.map((s) => s.key));
      const base: Col[] = statuses.map((s) => ({ key: s.key, label: statusMeta(s.key).label, dotClass: statusMeta(s.key).dot, ...stColor(s.key) }));
      const extra = [...new Set(tasks.map((x) => x.status).filter((s) => !known.has(s)))]
        .map((s) => ({ key: s, label: statusMeta(s).label, dotClass: statusMeta(s).dot, ...stColor(s) }));
      return [...base, ...extra];
    }
    if (cfg.groupBy === "priority") {
      return (Object.keys(PRIORITY_META) as CreativePriority[]).map((k) => ({ key: k, label: priorityLabel(k) }));
    }
    if (cfg.groupBy === "brand") {
      const present = new Set(tasks.map((x) => x.brand_id ?? NONE));
      const cols: Col[] = brands.filter((b) => present.has(b.id)).map((b) => ({ key: b.id, label: b.name, dotColor: b.color || "#cbd5e1" }));
      if (present.has(NONE)) cols.push({ key: NONE, label: t("ไม่ระบุแบรนด์", "No brand") });
      return cols;
    }
    // task_type
    const types = [...new Set(tasks.map((x) => x.task_type ?? NONE))];
    return types.map((v) => v === NONE ? { key: NONE, label: t("ไม่ระบุประเภท", "No type") } : { key: v, label: taskTypeLabel(v) || v });
  }, [cfg.groupBy, statuses, tasks, brands, t, statusColors]);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over?.id ? String(e.over.id) : undefined;
    if (!overId) return;
    const task = tasks.find((x) => x.id === String(e.active.id));
    if (!task) return;
    if (groupValue(task, cfg.groupBy) === overId) return;   // ไม่เปลี่ยน
    if (cfg.groupBy === "status") onMoveStatus(task.id, overId);
    else if (cfg.groupBy === "brand") onSetField(task.id, "brand_id", overId === NONE ? null : overId);
    else if (cfg.groupBy === "priority") onSetField(task.id, "priority", overId);
    else onSetField(task.id, "task_type", overId === NONE ? null : overId);
  };

  if (columns.length === 0) {
    return <div className="py-12 text-center text-sm text-slate-400">{t("ไม่มีงานในตัวกรองนี้", "No tasks in this filter")}</div>;
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto p-3">
        {columns.map((col) => (
          <Column key={col.key} col={col} cfg={cfg} accent={accent} animCls={animCls} onCardClick={onCardClick}
            tasks={tasks.filter((x) => groupValue(x, cfg.groupBy) === col.key)} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{activeTask ? <div className="w-64"><CardBody task={activeTask} cfg={cfg} dragging /></div> : null}</DragOverlay>
    </DndContext>
  );
}
