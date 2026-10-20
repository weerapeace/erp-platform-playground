"use client";

// ============================================================
// Overview Kanban — บอร์ดการ์ดในหน้าภาพรวม (แทนตาราง)
// จัดกลุ่มคอลัมน์ได้: สถานะ / แบรนด์ / ความสำคัญ / ประเภทงาน (จากธีม kanban)
// ลากการ์ดข้ามคอลัมน์ = เปลี่ยนค่านั้น — สถานะผ่าน workflow (onMoveStatus), อื่น ๆ แก้ตรง (onSetField)
// การ์ดเลือกโชว์ข้อมูลได้ (รูปปก/แบรนด์/ผู้รับผิดชอบ/กำหนดส่ง/ความสำคัญ/ความคืบหน้า)
// ============================================================

import { useMemo, useState, type ReactNode } from "react";
import { useT } from "@/components/i18n";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { r2ImageUrl } from "@/lib/r2-image";
import { HoverPreview } from "@/components/hover-image";
import { AssigneeStack } from "./assignee-avatar";
import { taskTypeLabel } from "./use-options";
import { TaskTypeChip } from "./task-type-chip";
import { statusMeta, isTerminal, canTransitionTo, type Status } from "./use-statuses";
import { PRIORITY_META, PRIORITY_RANK, priorityLabel, isOverdue, type CreativeTask, type CreativePriority, type BrandOption } from "./data";
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

// กำหนดส่งเทียบวันนี้ เป็นจำนวนวัน (ลบ = เกินมาแล้ว) · ใช้วันที่ตามเวลาเครื่อง + Date.UTC กันเพี้ยน timezone
function dueDiffDays(due: string): number {
  const [y, m, d] = due.slice(0, 10).split("-").map(Number);
  const now = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

// ตัวเลือกเสริมของการ์ด (มุมมอง WIP ใช้) — ป้ายสถานะ / กำหนดส่งแบบนับวัน / ความสูงรูปปก / ความกว้างรูปที่โหลด
type CardExtra = { statusPill?: boolean; relDue?: boolean; coverCls?: string; imgW?: number };

// รูปปกปรับได้ต่อคน (KanbanTheme): ขนาด · ครอปเต็มกรอบ/เห็นทั้งรูป · อยู่บน/ข้างซ้าย
const COVER_TOP_H: Record<string, string> = { sm: "h-16", md: "h-28", lg: "h-44", square: "aspect-square" };
const COVER_SIDE_BOX: Record<string, string> = { auto: "w-16 h-16", sm: "w-12 h-12", md: "w-16 h-16", lg: "w-24 h-24", square: "w-20 h-20" };
// ระยะห่างระหว่างการ์ด (px) — ใช้ทั้งบอร์ดการ์ดและ WIP
const CARD_GAP_PX: Record<string, number> = { tight: 4, normal: 8, loose: 14, xloose: 22 };
export const cardGapPx = (cfg: KanbanTheme) => CARD_GAP_PX[cfg.cardGap ?? "normal"] ?? 8;

// ───────── การ์ด ─────────
function CardBody({ task, cfg, dragging, extra }: { task: CreativeTask; cfg: KanbanTheme; dragging?: boolean; extra?: CardExtra }) {
  const t = useT();   // subscribe ภาษา
  const pr = PRIORITY_META[task.priority as CreativePriority];
  const overdue = isOverdue(task);
  const compact = cfg.compact === true;
  // คอลัมน์ที่จบแล้ว (เสร็จ/ยกเลิก) ไม่โชว์รูปปก — เหลือแค่ตัวอักษร+ผู้รับผิดชอบ
  const showImages = cfg.cover && !isTerminal(task.status);
  const cover = showImages ? coverKey(task) : null;
  const size = cfg.coverSize ?? "auto";
  const coverUrl = cover ? r2ImageUrl(cover, size === "lg" || size === "square" ? Math.max(extra?.imgW ?? 320, 480) : extra?.imgW ?? 320) : null;
  const side = cfg.coverPos === "side" && !!coverUrl;   // รูปเล็กข้างซ้าย (ข้อความอยู่ขวา)
  const fitCls = cfg.coverFit === "contain" ? "object-contain bg-white" : "object-cover bg-slate-50";   // contain = เห็นทั้งรูป ไม่ครอป
  const topH = COVER_TOP_H[size] ?? extra?.coverCls ?? (compact ? "h-12" : "h-20");
  // งานเรียงพิมพ์ไม่ผูกสินค้า → ไม่มีรูปปก แต่มี "รูป Artwork ที่จะพิมพ์" → โชว์เป็นแถวรูปเล็กแทน
  const artKeys = showImages && !coverUrl ? (task.arrange_image_keys ?? []) : [];
  const artMax = compact ? 4 : 6;
  const artShown = artKeys.slice(0, artMax);
  // กรอบสีตามแบรนด์ (ถ้าเปิด + แบรนด์มีสี hex)
  const bc = task.brand_color;
  const brandBorder = cfg.brandBorder && bc && /^#[0-9a-fA-F]{6}$/.test(String(bc));
  const showSku = cfg.sku !== false, showTaskNo = cfg.taskNo !== false;
  return (
    <div className={`bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm ${dragging ? "shadow-xl ring-2 ring-violet-300 rotate-1" : "hover:border-violet-300 hover:shadow"}`}
      style={brandBorder ? { borderColor: String(bc), borderLeftWidth: 3 } : undefined}>
      {coverUrl && !side && (
        <HoverPreview url={r2ImageUrl(cover)} previewW={640}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" loading="lazy" decoding="async" className={`${topH} w-full ${fitCls} border-b border-slate-100`} />
        </HoverPreview>
      )}
      {/* งานเรียงพิมพ์ — แถวรูป Artwork ที่จะพิมพ์ (เล็ก หลายตัว · ชี้เมาส์ดูใหญ่) */}
      {artShown.length > 0 && (
        <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50/70 px-1.5 py-1.5">
          {artShown.map((k) => (
            <HoverPreview key={k} url={r2ImageUrl(k)} previewW={520}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r2ImageUrl(k, 160) ?? undefined} alt="" loading="lazy" decoding="async"
                className={`${compact ? "h-8 w-8" : "h-10 w-10"} rounded border border-slate-200 bg-white object-contain`} />
            </HoverPreview>
          ))}
          {artKeys.length > artShown.length && (
            <span className="text-[10px] font-medium text-slate-400">+{artKeys.length - artShown.length}</span>
          )}
        </div>
      )}
      <div className={`${compact ? "p-2" : "p-2.5"} ${side ? "flex gap-2.5 items-start" : ""}`}>
        {side && (
          <HoverPreview url={r2ImageUrl(cover)} previewW={640}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl!} alt="" loading="lazy" decoding="async" className={`${COVER_SIDE_BOX[size] ?? COVER_SIDE_BOX.auto} shrink-0 rounded-md border border-slate-200 ${fitCls}`} />
          </HoverPreview>
        )}
        <div className={side ? "flex-1 min-w-0" : undefined}>
        {/* flex-wrap: การ์ดแคบ (3 คอลัมน์/รูปข้างซ้าย) เลขที่งานตกบรรทัดใหม่ ไม่ทับป้าย */}
        <div className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 ${compact ? "mb-1" : "mb-1.5"}`}>
          <div className="flex items-center gap-1 min-w-0">
            {cfg.priority && pr && <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${pr.cls}`}>{priorityLabel(task.priority as CreativePriority)}</span>}
            {cfg.taskType !== false && task.task_type && <TaskTypeChip code={task.task_type} />}
          </div>
          {showTaskNo && <span className="font-mono text-[10px] text-slate-400 shrink-0 ml-auto">{task.task_no}</span>}
        </div>
        <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2">{task.title}</p>
        {showSku && task.sku_code && <p className="text-[11px] text-slate-400 line-clamp-1 mt-1">📦 {task.sku_code}{task.sku_name ? ` · ${task.sku_name}` : ""}</p>}
        {cfg.brand && task.brand_label && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
            <span className="h-2 w-2 rounded-full" style={{ background: task.brand_color || "#cbd5e1" }} />{task.brand_label}
          </div>
        )}
        {extra?.statusPill && (() => { const m = statusMeta(task.status); return (
          <div className="mt-1.5"><span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}</span></div>
        ); })()}
        {(cfg.assignee || cfg.due) && (
          <div className="flex items-center justify-between gap-2 mt-2">
            {cfg.assignee ? <AssigneeStack list={task.assignees} size={20} /> : <span />}
            {cfg.due && task.due_date && (extra?.relDue ? (() => {
              const d = dueDiffDays(task.due_date);
              return <span title={task.due_date} className={`text-[11px] whitespace-nowrap ${d < 0 ? "text-red-600 font-semibold" : d === 0 ? "text-amber-600 font-semibold" : "text-slate-400"}`}>
                {d < 0 ? t(`⚠ เกิน ${-d} วัน`, `⚠ ${-d}d late`) : d === 0 ? t("ส่งวันนี้", "Due today") : t(`อีก ${d} วัน`, `in ${d}d`)}</span>;
            })() : <span className={`text-[11px] ${overdue ? "text-red-600 font-semibold" : "text-slate-400"}`}>{overdue && "⚠ "}{task.due_date.slice(5)}</span>)}
          </div>
        )}
        {cfg.progress && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400" style={{ width: `${task.progress_percent}%` }} /></div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function DraggableCard({ task, cfg, animCls, onClick, extra }: { task: CreativeTask; cfg: KanbanTheme; animCls?: string; onClick: () => void; extra?: CardExtra }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={onClick}
      className={`cursor-grab active:cursor-grabbing touch-none ${animCls ?? ""} ${isDragging ? "opacity-40" : ""}`}>
      <CardBody task={task} cfg={cfg} extra={extra} />
    </div>
  );
}

const CLOSED_PREVIEW = 7;   // คอลัมน์ที่จบแล้ว (เสร็จ/ยกเลิก) โชว์แค่ N ใบล่าสุด — ที่เหลือกด "ดูทั้งหมด"

function Column({ col, tasks, cfg, accent, animCls, onCardClick, limit, onShowAll }: { col: Col; tasks: CreativeTask[]; cfg: KanbanTheme; accent: string; animCls?: string; onCardClick: (id: string) => void; limit?: number; onShowAll?: () => void }) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  const shown = limit && tasks.length > limit ? tasks.slice(0, limit) : tasks;
  const hidden = tasks.length - shown.length;
  return (
    <div className="flex flex-col w-64 shrink-0">
      <div className="flex items-center justify-between px-3 py-2 bg-white rounded-t-lg border border-b-0 border-slate-200 border-t-4" style={{ borderTopColor: col.barColor || accent }}>
        <div className="flex items-center gap-2 min-w-0">
          {col.dotColor ? <span className="h-2 w-2 rounded-full shrink-0" style={{ background: col.dotColor }} /> : col.dotClass ? <span className={`h-2 w-2 rounded-full shrink-0 ${col.dotClass}`} /> : null}
          <span className="text-sm font-semibold text-slate-700 truncate" title={col.label}>{col.label}</span>
        </div>
        <span className="text-xs font-medium text-slate-400 bg-slate-100 rounded-full px-2 py-0.5 shrink-0">{tasks.length}</span>
      </div>
      <div ref={setNodeRef} style={{ gap: cardGapPx(cfg) }} className={`flex-1 min-h-[120px] flex flex-col p-2 rounded-b-lg border border-t-0 border-slate-200 transition-colors ${isOver ? "bg-violet-50" : "bg-slate-50/60"}`}>
        {shown.map((tk) => <DraggableCard key={tk.id} task={tk} cfg={cfg} animCls={animCls} onClick={() => onCardClick(tk.id)} />)}
        {hidden > 0 && (
          <button type="button" onClick={onShowAll}
            className="w-full rounded-lg border border-dashed border-slate-300 bg-white/70 py-2 text-xs font-medium text-violet-600 hover:border-violet-300 hover:bg-violet-50">
            {t(`ดูทั้งหมด (${tasks.length}) — อีก ${hidden} งาน →`, `View all (${tasks.length}) — ${hidden} more →`)}
          </button>
        )}
        {tasks.length === 0 && <div className="h-16 flex items-center justify-center text-xs text-slate-300 border-2 border-dashed border-slate-200 rounded-lg">{t("ลากการ์ดมาวางที่นี่", "Drag cards here")}</div>}
      </div>
    </div>
  );
}

export function OverviewKanban({ tasks, statuses, brands, cfg, accent, statusColors, anim, onMoveStatus, onSetField, onCardClick, onShowAllStatus }: {
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
  onShowAllStatus?: (statusKey: string) => void;   // กด "ดูทั้งหมด" ในคอลัมน์ที่จบแล้ว → ไปหน้ารายการทั้งหมด (กรองสถานะนั้น)
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
            limit={cfg.groupBy === "status" && isTerminal(col.key) ? CLOSED_PREVIEW : undefined}
            onShowAll={() => onShowAllStatus?.(col.key)}
            tasks={tasks.filter((x) => groupValue(x, cfg.groupBy) === col.key)} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{activeTask ? <div className="w-64"><CardBody task={activeTask} cfg={cfg} dragging /></div> : null}</DragOverlay>
    </DndContext>
  );
}

// ============================================================
// มุมมอง WIP (งานค้าง) — ช่องใหญ่ "กำลังดำเนินการ" (รอคิว+พร้อมทำ+กำลังทำ) + ช่องเล็ก รอตรวจ / ต้องแก้
// · การ์ดในช่องใหญ่เลือกได้ 1–3 คอลัมน์ (cfg.wipCols) · เรียงกำหนดส่งเก่าสุดก่อน (เกินกำหนดขึ้นบน)
// · มีงาน "ต้องแก้" → ช่องนั้นย้ายไปหน้าสุด + กรอบแดง · ไม่โชว์บรรทัดสินค้าบนการ์ด
// · ลากการ์ด = เปลี่ยนสถานะผ่าน workflow เดิม (onMoveStatus) · ระหว่างลาก ช่องที่ลงไม่ได้จะจางลง
// ============================================================
export const WIP_ACTIVE_STATUSES = ["backlog", "ready", "in_progress"];   // รวมเป็นช่องใหญ่
const WIP_REVIEW = "need_review";
const WIP_FIX = "revision";
const WIP_LANE = "__wip__";
const WIP_LANE_TARGET = "in_progress";   // ลากเข้าช่องใหญ่ = กลับไป "กำลังทำ" (เช่น ต้องแก้ → แก้ต่อ)
export const isWipStatus = (s?: string | null) => !!s && (WIP_ACTIVE_STATUSES.includes(s) || s === WIP_REVIEW || s === WIP_FIX);

const laneTarget = (lane: string) => (lane === WIP_LANE ? WIP_LANE_TARGET : lane);
const laneOf = (status: string) => (WIP_ACTIVE_STATUSES.includes(status) ? WIP_LANE : status);
const WIP_COVER_CLS: Record<number, string> = { 1: "h-40", 2: "h-28", 3: "h-20" };

function WipLane({ id, label, count, barColor, dotClass, wide, minWidth, alert, dragFrom, children, chips }: {
  id: string; label: string; count: number; barColor?: string; dotClass?: string; wide?: boolean; minWidth?: number; alert?: boolean;
  dragFrom?: string | null; children: ReactNode; chips?: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  // ระหว่างลาก: ช่องที่เปลี่ยนสถานะไปไม่ได้ (ตามเส้นทางใน DB) → จางลง
  const blocked = !!dragFrom && laneOf(dragFrom) !== id && !canTransitionTo(dragFrom, laneTarget(id));
  return (
    <div className={`flex flex-col ${wide ? "flex-1 min-w-0" : "w-60 shrink-0"} transition-opacity ${blocked ? "opacity-40" : ""}`} style={minWidth ? { minWidth } : undefined}>
      <div className={`px-3 py-2 bg-white rounded-t-lg border border-b-0 border-t-4 ${alert ? "border-red-300" : "border-slate-200"}`} style={barColor ? { borderTopColor: barColor } : undefined}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {dotClass && <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />}
            <span className={`text-sm font-semibold truncate ${alert ? "text-red-700" : "text-slate-700"}`}>{label}</span>
          </div>
          <span className={`text-xs font-medium rounded-full px-2 py-0.5 shrink-0 ${alert ? "bg-red-100 text-red-700" : "text-slate-400 bg-slate-100"}`}>{count}</span>
        </div>
        {chips}
      </div>
      <div ref={setNodeRef} className={`flex-1 min-h-[120px] p-2 rounded-b-lg border border-t-0 transition-colors ${alert ? "border-red-300" : "border-slate-200"} ${isOver && !blocked ? "bg-violet-50" : alert ? "bg-red-50/40" : "bg-slate-50/60"}`}>
        {children}
      </div>
    </div>
  );
}

export function WipBoard({ tasks, cfg, accent, statusColors, anim, onMoveStatus, onCardClick }: {
  tasks: CreativeTask[];
  cfg: KanbanTheme;
  accent: string;
  statusColors?: StatusColorMap;
  anim?: AnimTheme;
  onMoveStatus: (taskId: string, toKey: string) => void;
  onCardClick: (id: string) => void;
}) {
  const t = useT();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [subFilter, setSubFilter] = useState<string>("");   // ชิปกรองในช่องใหญ่ ("" = ทั้งหมด)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const animCls = `${anim?.hover ? "ov-hover" : ""} ${anim?.entrance ? "ov-enter" : ""}`.trim();
  const cols = cfg.wipCols ?? 2;
  const bigCfg: KanbanTheme = { ...cfg, sku: false };   // WIP ไม่โชว์บรรทัดสินค้า (เจ้าของเลือก)
  const smallCfg: KanbanTheme = { ...cfg, sku: false, cover: false, progress: false, brand: false, taskNo: false, taskType: false, compact: true };
  const bigExtra: CardExtra = { statusPill: true, relDue: true, coverCls: WIP_COVER_CLS[cols], imgW: cols === 1 ? 640 : 400 };
  const gap = cardGapPx(cfg);
  const smallExtra: CardExtra = { relDue: true };
  // สีแถบหัวช่อง = สีสถานะที่ผู้ใช้ตั้งเอง (ถ้ามี)
  const barOf = (key: string) => statusColors?.[key]?.c1 || undefined;

  // เรียง: กำหนดส่งเก่าสุดก่อน (ไม่มีกำหนดไว้ท้าย) → ความสำคัญสูงก่อน
  const lanes = useMemo(() => {
    const sorted = tasks.filter((x) => isWipStatus(x.status)).sort((a, b) =>
      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || (PRIORITY_RANK[a.priority as CreativePriority] ?? 9) - (PRIORITY_RANK[b.priority as CreativePriority] ?? 9));
    return {
      active: sorted.filter((x) => WIP_ACTIVE_STATUSES.includes(x.status)),
      review: sorted.filter((x) => x.status === WIP_REVIEW),
      fix: sorted.filter((x) => x.status === WIP_FIX),
    };
  }, [tasks]);
  const activeShown = subFilter ? lanes.active.filter((x) => x.status === subFilter) : lanes.active;
  const activeTask = tasks.find((x) => x.id === activeId) ?? null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over?.id ? String(e.over.id) : undefined;
    const task = tasks.find((x) => x.id === String(e.active.id));
    if (!overId || !task || laneOf(task.status) === overId) return;   // วางช่องเดิม = ไม่เปลี่ยน
    onMoveStatus(task.id, laneTarget(overId));
  };

  const empty = (msg: string) => <div className="h-16 flex items-center justify-center text-center px-2 text-xs text-slate-300 border-2 border-dashed border-slate-200 rounded-lg">{msg}</div>;

  // ชิปกรอง: ทั้งหมด → กำลังทำ → พร้อมทำ → รอคิว (ใกล้เสร็จสุดก่อน)
  const subChips: [string, string, number][] = [["", t("ทั้งหมด", "All"), lanes.active.length], ...[...WIP_ACTIVE_STATUSES].reverse().map((s): [string, string, number] => [s, statusMeta(s).label, lanes.active.filter((x) => x.status === s).length])];
  const activeLane = (
    <WipLane key={WIP_LANE} id={WIP_LANE} wide minWidth={cols * 220} label={t("กำลังดำเนินการ", "In progress")} count={lanes.active.length} barColor={accent} dragFrom={activeTask?.status}
      chips={
        <div className="flex flex-wrap gap-1 mt-1.5">
          {subChips.map(([k, label, n]) => {
            const on = subFilter === k;
            return <button key={k || "all"} type="button" onClick={() => setSubFilter(k)} style={on ? { background: accent, borderColor: accent } : undefined}
              className={`h-6 px-2 rounded-full border text-[11px] font-medium ${on ? "text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{label} {n}</button>;
          })}
        </div>
      }>
      {activeShown.length === 0 ? empty(t("ไม่มีงานค้างในกลุ่มนี้ 🎉", "Nothing in progress here 🎉")) : (
        <div className="grid items-start" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}>
          {activeShown.map((tk) => <DraggableCard key={tk.id} task={tk} cfg={bigCfg} extra={bigExtra} animCls={animCls} onClick={() => onCardClick(tk.id)} />)}
        </div>
      )}
    </WipLane>
  );
  const smallLane = (key: string, list: CreativeTask[], emptyMsg: string, alert?: boolean) => (
    <WipLane key={key} id={key} label={statusMeta(key).label} count={list.length} dotClass={statusMeta(key).dot} barColor={barOf(key) ?? (alert ? "#f87171" : undefined)} alert={alert} dragFrom={activeTask?.status}>
      {list.length === 0 ? empty(emptyMsg) : (
        <div className="flex flex-col" style={{ gap }}>{list.map((tk) => <DraggableCard key={tk.id} task={tk} cfg={smallCfg} extra={smallExtra} animCls={animCls} onClick={() => onCardClick(tk.id)} />)}</div>
      )}
    </WipLane>
  );
  const reviewLane = smallLane(WIP_REVIEW, lanes.review, t("ลากจาก \"กำลังทำ\" มาส่งตรวจ", "Drag from in progress to submit"));
  const fixLane = smallLane(WIP_FIX, lanes.fix, t("ไม่มีงานตีกลับ", "No revisions"), lanes.fix.length > 0);
  // มีงานต้องแก้ → ช่อง "ต้องแก้" ขึ้นหน้าสุด
  const ordered = lanes.fix.length > 0 ? [fixLane, activeLane, reviewLane] : [activeLane, reviewLane, fixLane];

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="flex gap-3 overflow-x-auto p-3 items-stretch">{ordered}</div>
      <DragOverlay dropAnimation={null}>{activeTask ? <div className="w-60"><CardBody task={activeTask} cfg={smallCfg} extra={smallExtra} dragging /></div> : null}</DragOverlay>
    </DndContext>
  );
}
