"use client";

// ============================================================
// App Subscription — มุมมองบอร์ด (Kanban)
// ลากการ์ดข้ามคอลัมน์ = เปลี่ยนค่า (สถานะ/หมวด/ประเภท/รอบบิล) · ใช้ @dnd-kit ของกลาง
// จัดกลุ่มสลับได้: สถานะ (default) / หมวดหมู่ / งาน-ส่วนตัว / รอบบิล
// ============================================================
import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import {
  type Subscription, type SubSettings, type SubType, type BillingCycle,
  CYCLE_LABEL, subStatusLabel, monthlyTHB, fmtBaht, nextRenewal, daysUntil,
} from "@/lib/subscriptions";

export type BoardGroupBy = "status" | "category" | "type" | "cycle";
export const GROUP_OPTIONS: { key: BoardGroupBy; label: string }[] = [
  { key: "status", label: "สถานะ" },
  { key: "category", label: "หมวดหมู่" },
  { key: "type", label: "งาน–ส่วนตัว" },
  { key: "cycle", label: "รอบบิล" },
];

type BoardCol = { key: string; label: string; dot: string };

const STATUS_COLS: BoardCol[] = [
  { key: "active", label: "ใช้งาน", dot: "bg-emerald-400" },
  { key: "pending_cancel", label: "กำลังยกเลิก", dot: "bg-amber-400" },
  { key: "wishlist", label: "อยากซื้อ", dot: "bg-blue-400" },
  { key: "closed", label: "ปิด", dot: "bg-slate-300" },
  { key: "cancelled", label: "ยกเลิกแล้ว", dot: "bg-red-400" },
];
const TYPE_COLS: BoardCol[] = [
  { key: "work", label: "งาน", dot: "bg-indigo-400" },
  { key: "personal", label: "ส่วนตัว", dot: "bg-pink-400" },
];
const CYCLE_COLS: BoardCol[] = [
  { key: "monthly", label: "รายเดือน", dot: "bg-sky-400" },
  { key: "yearly", label: "รายปี", dot: "bg-violet-400" },
  { key: "one-time", label: "จ่ายครั้งเดียว", dot: "bg-slate-400" },
];
const CATEGORY_DOTS = ["bg-purple-400", "bg-teal-400", "bg-amber-400", "bg-blue-400", "bg-pink-400", "bg-green-400", "bg-orange-400", "bg-rose-400"];

const STATUS_PATCH: Record<string, Partial<Subscription>> = {
  active: { active: true, pending_cancel: false, want_to_buy: false },
  pending_cancel: { active: true, pending_cancel: true, want_to_buy: false },
  wishlist: { active: false, pending_cancel: false, want_to_buy: true },
  closed: { active: false, pending_cancel: false, want_to_buy: false },
  cancelled: { active: false, pending_cancel: true, want_to_buy: false },
};

const STATUS_BADGE: Record<string, string> = {
  "ใช้งาน": "bg-emerald-50 text-emerald-700",
  "กำลังยกเลิก": "bg-amber-50 text-amber-700",
  "อยากซื้อ": "bg-blue-50 text-blue-700",
  "ปิด": "bg-slate-100 text-slate-500",
  "ยกเลิกแล้ว": "bg-red-50 text-red-600",
};

// รายการนี้อยู่คอลัมน์ไหน (ตามการจัดกลุ่ม)
export function boardKeyOf(groupBy: BoardGroupBy, sub: Subscription): string {
  if (groupBy === "category") return sub.category || "Other";
  if (groupBy === "type") return sub.type;
  if (groupBy === "cycle") return sub.billing_cycle;
  // status
  if (sub.want_to_buy) return "wishlist";
  if (!sub.active && sub.pending_cancel) return "cancelled";
  if (!sub.active) return "closed";
  if (sub.pending_cancel) return "pending_cancel";
  return "active";
}

// ลากไปคอลัมน์นี้ → ต้องแก้ค่าอะไร
export function boardPatchFor(groupBy: BoardGroupBy, toKey: string): Partial<Subscription> {
  if (groupBy === "status") return STATUS_PATCH[toKey] ?? {};
  if (groupBy === "category") return { category: toKey };
  if (groupBy === "type") return { type: toKey as SubType };
  return { billing_cycle: toKey as BillingCycle };
}

function boardColumns(groupBy: BoardGroupBy, rows: Subscription[]): BoardCol[] {
  if (groupBy === "status") return STATUS_COLS;
  if (groupBy === "type") return TYPE_COLS;
  if (groupBy === "cycle") return CYCLE_COLS;
  // category = ไดนามิกจากข้อมูลจริง
  const seen = new Set<string>();
  for (const r of rows) seen.add(r.category || "Other");
  return [...seen].sort((a, b) => a.localeCompare(b, "th")).map((k, i) => ({ key: k, label: k, dot: CATEGORY_DOTS[i % CATEGORY_DOTS.length] }));
}

function SubCardBody({ sub, settings, dragging }: { sub: Subscription; settings: SubSettings; dragging?: boolean }) {
  const monthly = monthlyTHB(sub, settings);
  const status = subStatusLabel(sub);
  const d = daysUntil(nextRenewal(sub));
  const soon = d !== null && d >= 0 && d <= 30;
  return (
    <div className={`bg-white rounded-lg border p-3 ${dragging ? "shadow-xl ring-2 ring-indigo-300 rotate-1 border-indigo-200" : "border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow"}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-slate-800 leading-snug line-clamp-2">{sub.name}</span>
        {sub.type === "personal" && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-pink-50 text-pink-600">ส่วนตัว</span>}
      </div>
      {(sub.account_email || sub.category) && (
        <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
          {sub.account_email || sub.category}{sub.billing_cycle !== "monthly" ? ` · ${CYCLE_LABEL[sub.billing_cycle]}` : ""}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="text-sm font-semibold text-slate-800 tabular-nums">{fmtBaht(monthly)}<span className="text-[11px] text-slate-400 font-normal">/ด.</span></span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_BADGE[status] ?? "bg-slate-100 text-slate-500"}`}>{status}</span>
      </div>
      {soon && <div className="text-[10px] text-amber-600 mt-1.5">⏰ ต่ออายุอีก {d} วัน</div>}
    </div>
  );
}

function DraggableCard({ sub, settings, onClick }: { sub: Subscription; settings: SubSettings; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: sub.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={onClick}
      className={`cursor-grab active:cursor-grabbing touch-none ${isDragging ? "opacity-40" : ""}`}>
      <SubCardBody sub={sub} settings={settings} />
    </div>
  );
}

function BoardColumn({ col, rows, total, settings, onEdit }: {
  col: BoardCol; rows: Subscription[]; total: number; settings: SubSettings; onEdit: (s: Subscription) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div className="flex flex-col w-60 shrink-0">
      <div className="flex items-center justify-between px-3 py-2 bg-white rounded-t-lg border border-b-0 border-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2 w-2 rounded-full shrink-0 ${col.dot}`} />
          <span className="text-sm font-semibold text-slate-700 truncate">{col.label}</span>
          <span className="text-xs font-medium text-slate-400 bg-slate-100 rounded-full px-2 py-0.5 shrink-0">{rows.length}</span>
        </div>
        <span className="text-xs font-medium text-slate-500 shrink-0">{fmtBaht(total)}/ด.</span>
      </div>
      <div ref={setNodeRef} className={`flex-1 min-h-[120px] space-y-2 p-2 rounded-b-lg border border-t-0 border-slate-200 transition-colors ${isOver ? "bg-indigo-50" : "bg-slate-50/60"}`}>
        {rows.map((s) => <DraggableCard key={s.id} sub={s} settings={settings} onClick={() => onEdit(s)} />)}
        {rows.length === 0 && <div className="h-20 flex items-center justify-center text-xs text-slate-300 border-2 border-dashed border-slate-200 rounded-lg">ลากการ์ดมาวางที่นี่</div>}
      </div>
    </div>
  );
}

export function SubscriptionsBoard({ rows, settings, groupBy, onEdit, onMove }: {
  rows: Subscription[];
  settings: SubSettings;
  groupBy: BoardGroupBy;
  onEdit: (s: Subscription) => void;
  onMove: (sub: Subscription, toKey: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const cols = useMemo(() => boardColumns(groupBy, rows), [groupBy, rows]);
  const activeSub = rows.find((r) => r.id === activeId) ?? null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over?.id ? String(e.over.id) : undefined;
    if (!overId) return;
    const sub = rows.find((r) => r.id === String(e.active.id));
    if (sub && boardKeyOf(groupBy, sub) !== overId) onMove(sub, overId);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {cols.map((col) => {
          const colRows = rows.filter((r) => boardKeyOf(groupBy, r) === col.key);
          const total = colRows.reduce((sum, r) => sum + monthlyTHB(r, settings), 0);
          return <BoardColumn key={col.key} col={col} rows={colRows} total={total} settings={settings} onEdit={onEdit} />;
        })}
        {cols.length === 0 && <div className="text-sm text-slate-400 p-8">ยังไม่มีรายการ</div>}
      </div>
      <DragOverlay dropAnimation={null}>{activeSub ? <div className="w-60"><SubCardBody sub={activeSub} settings={settings} dragging /></div> : null}</DragOverlay>
    </DndContext>
  );
}
