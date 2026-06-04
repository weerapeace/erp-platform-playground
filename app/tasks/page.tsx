"use client";

// ============================================================
// Task Manager — ขั้น A (Mock UI)
// ใช้ของกลาง ERP: PlaygroundShell, DataTable, ERPModal, ConfirmDialog,
// ERPForm*, EmployeePicker, ProductPicker, ActivityFeed
// ยังไม่ต่อ Supabase — ข้อมูลมาจาก ./mock-data (ขั้น B ค่อยต่อ /api/master-v2/tasks)
// ============================================================

import { useMemo, useState } from "react";
import { StandaloneShell } from "@/components/standalone-shell";
import { DataTable } from "@/components/data-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { EmployeePicker, ProductPicker } from "@/components/pickers";
import type { EmployeePickerValue, ProductPickerValue } from "@/components/pickers";
import { ActivityFeed, type ActivityEntry } from "@/components/activity-feed";
import type { ColumnDef } from "@tanstack/react-table";
import { KanbanBoard } from "./kanban-board";
import { CanvasBoard } from "./canvas-board";
import {
  MOCK_TASKS, MOCK_ME, STATUS_META, PRIORITY_META, TASK_TRANSITIONS,
  isOverdue, withinThisWeek,
  type Task, type TaskStatus, type TaskPriority, type Comment,
} from "./mock-data";

// ============================================================
// Helpers
// ============================================================

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const m = PRIORITY_META[priority];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>{m.label}</span>;
}

function DueCell({ t }: { t: Task }) {
  if (!t.due_date) return <span className="text-xs text-slate-400">—</span>;
  const overdue = isOverdue(t);
  return (
    <span className={`text-xs ${overdue ? "text-red-600 font-semibold" : "text-slate-500"}`}>
      {overdue && "⚠ "}{t.due_date}
    </span>
  );
}

// ============================================================
// Columns + Views (Saved Views)
// ============================================================

const COLUMNS: ColumnDef<Task>[] = [
  {
    accessorKey: "task_no", header: "เลขที่งาน", size: 150,
    cell: ({ getValue }) => <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-medium">{getValue() as string}</span>,
  },
  {
    accessorKey: "title", header: "ชื่องาน",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800 line-clamp-1">{row.original.title}</div>
        {row.original.product_sku && (
          <div className="text-xs text-slate-400 line-clamp-1">📦 {row.original.product_sku} · {row.original.product_name}</div>
        )}
      </div>
    ),
  },
  { accessorKey: "assignee_name", header: "ผู้รับผิดชอบ", size: 140, meta: { filterable: true } },
  {
    accessorKey: "priority", header: "ความสำคัญ", size: 110,
    cell: ({ getValue }) => <PriorityBadge priority={getValue() as TaskPriority} />,
  },
  {
    accessorKey: "status", header: "สถานะ", size: 110,
    cell: ({ getValue }) => <TaskStatusBadge status={getValue() as TaskStatus} />,
  },
  {
    accessorKey: "due_date", header: "กำหนดส่ง", size: 120,
    cell: ({ row }) => <DueCell t={row.original} />,
  },
  { accessorKey: "project", header: "โปรเจกต์/หมวด", size: 150, meta: { filterable: true } },
];

const VIEWS = [
  { id: "all",          label: "ทั้งหมด" },
  { id: "mine",         label: "🙋 งานของฉัน",     filter: (r: Record<string, unknown>) => r.assignee_name === MOCK_ME },
  { id: "assigned",     label: "📥 มอบหมายให้ฉัน",  filter: (r: Record<string, unknown>) => r.assignee_name === MOCK_ME && r.creator_name !== MOCK_ME },
  { id: "overdue",      label: "⚠️ เกินกำหนด",      filter: (r: Record<string, unknown>) => isOverdue(r as Task) },
  { id: "this_week",    label: "🗓️ สัปดาห์นี้",     filter: (r: Record<string, unknown>) => withinThisWeek(r as Task) },
  { id: "done",         label: "✅ เสร็จแล้ว",       filter: (r: Record<string, unknown>) => r.status === "done" },
];

const PRIORITY_OPTIONS = (Object.keys(PRIORITY_META) as TaskPriority[]).map(k => ({ value: k, label: PRIORITY_META[k].label }));

// ============================================================
// Toast
// ============================================================

type Toast = { id: number; type: "success" | "error" | "info"; message: string };

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const color = { success: "bg-emerald-600", error: "bg-red-600", info: "bg-slate-800" };
  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${color[t.type]}`}>
          <span>{t.type === "success" ? "✓" : t.type === "error" ? "⚠️" : "ℹ️"}</span>{t.message}
          <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Form
// ============================================================

type FormState = {
  title: string;
  description: string;
  assignee: EmployeePickerValue | null;
  priority: TaskPriority;
  due_date: string;
  project: string;
  tags: string;
  product: ProductPickerValue | null;
};

const EMPTY_FORM: FormState = {
  title: "", description: "", assignee: null, priority: "normal",
  due_date: "", project: "", tags: "", product: null,
};

// ============================================================
// Main Page
// ============================================================

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS);
  const [boardView, setBoardView] = useState<"table" | "kanban" | "canvas">("table");

  // create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // detail drawer
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useMemo(() => tasks.find(t => t.id === detailId) ?? null, [tasks, detailId]);

  // cancel confirm
  const [cancelTarget, setCancelTarget] = useState<Task | null>(null);

  // toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, type, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  };

  const counts = useMemo(() => ({
    total: tasks.length,
    mine: tasks.filter(t => t.assignee_name === MOCK_ME).length,
    overdue: tasks.filter(isOverdue).length,
  }), [tasks]);

  // ---- create ----
  const openCreate = () => { setForm(EMPTY_FORM); setFormErr(null); setDirty(false); setModalOpen(true); };
  const updateForm = (patch: Partial<FormState>) => { setForm(p => ({ ...p, ...patch })); setDirty(true); };

  const save = () => {
    if (!form.title.trim()) { setFormErr("กรุณากรอกชื่องาน"); return; }
    if (!form.assignee) { setFormErr("กรุณาเลือกผู้รับผิดชอบ"); return; }
    const seq = 13 + (tasks.length - MOCK_TASKS.length);
    const newTask: Task = {
      id: `t-new-${Date.now()}`,
      task_no: `TASK-2026-${String(seq).padStart(5, "0")}`,
      title: form.title.trim(),
      description: form.description.trim(),
      status: "new",
      priority: form.priority,
      assignee_name: form.assignee.name,
      assignee_id: form.assignee.id,
      creator_name: MOCK_ME,
      due_date: form.due_date || null,
      project: form.project.trim() || "ทั่วไป",
      tags: form.tags.split(",").map(s => s.trim()).filter(Boolean),
      product_sku: form.product?.sku ?? null,
      product_name: form.product?.name ?? null,
      subtasks: [],
      checklist: [],
      comments: [],
      created_at: new Date().toISOString(),
    };
    setTasks(p => [newTask, ...p]);
    setModalOpen(false); setDirty(false);
    pushToast("success", `สร้างงาน ${newTask.task_no} แล้ว (เลขที่งานจาก numbering กลางในขั้น B)`);
  };

  // ---- workflow transition (mock — ขั้น B ใช้ workflow engine กลาง) ----
  const doTransition = (taskId: string, to: TaskStatus, label: string) => {
    setTasks(p => p.map(t => t.id === taskId ? { ...t, status: to } : t));
    pushToast("info", `เปลี่ยนสถานะ → ${STATUS_META[to].label} (${label})`);
  };

  // ---- checklist toggle ----
  const toggleChecklist = (taskId: string, itemId: string) => {
    setTasks(p => p.map(t => t.id === taskId
      ? { ...t, checklist: t.checklist.map(c => c.id === itemId ? { ...c, done: !c.done } : c) }
      : t));
  };

  // ---- add comment ----
  const addComment = (taskId: string, text: string) => {
    const c: Comment = { id: `cm-${Date.now()}`, author_name: MOCK_ME, text, created_at: new Date().toISOString() };
    setTasks(p => p.map(t => t.id === taskId ? { ...t, comments: [...t.comments, c] } : t));
  };

  return (
    <StandaloneShell title="จัดการงาน (Task Manager)" icon="✅" accent="violet">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-violet-50 text-violet-700 border border-violet-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          📋 Task Manager — ขั้น A (Mock UI ให้ดูหน้าตาก่อนต่อฐานข้อมูล)
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">จัดการงาน (Task Manager)</h1>
            <p className="text-slate-500 mt-1">
              ใช้ตารางกลาง · Saved Views · ฟอร์มกลาง · Picker กลาง · Workflow — ตอนนี้เป็นข้อมูลตัวอย่าง
            </p>
          </div>
          <button onClick={openCreate} className="h-10 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors shrink-0">
            ＋ สร้างงาน
          </button>
        </div>
        {/* mini stats */}
        <div className="flex gap-3 mt-4">
          <StatChip label="งานทั้งหมด" value={counts.total} />
          <StatChip label="งานของฉัน" value={counts.mine} tone="violet" />
          <StatChip label="เกินกำหนด" value={counts.overdue} tone="red" />
        </div>
      </div>

      <div className="px-8 py-6 space-y-5">
        {/* Workflow path */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">เส้นทางสถานะ (Workflow)</p>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <TaskStatusBadge status="new" />
            <span className="text-slate-400">→ เริ่มทำ →</span>
            <TaskStatusBadge status="in_progress" />
            <span className="text-slate-400">→ ส่งตรวจ →</span>
            <TaskStatusBadge status="review" />
            <span className="text-slate-400">→ ผ่าน →</span>
            <TaskStatusBadge status="done" />
            <span className="text-slate-300 mx-1">|</span>
            <span className="text-slate-400">ตีกลับ ↩ / ยกเลิก →</span>
            <TaskStatusBadge status="cancelled" />
          </div>
        </div>

        {/* View toggle: ตาราง / Kanban / Canvas */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          <ViewToggleBtn active={boardView === "table"} onClick={() => setBoardView("table")} icon="📋" label="ตาราง" />
          <ViewToggleBtn active={boardView === "kanban"} onClick={() => setBoardView("kanban")} icon="🟦" label="Kanban" />
          <ViewToggleBtn active={boardView === "canvas"} onClick={() => setBoardView("canvas")} icon="🟪" label="Canvas" />
        </div>

        {boardView === "table" && (
          /* Table (ของกลาง) */
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <DataTable<Task>
              data={tasks} columns={COLUMNS}
              title={`รายการงาน (${tasks.length})`}
              description="คลิกที่งานเพื่อดูรายละเอียด · ตารางกลางตัวเดียวกับทุกโมดูล"
              emptyMessage="ยังไม่มีงาน — กดปุ่ม สร้างงาน"
              searchPlaceholder="ค้นหา เลขที่ / ชื่องาน / ผู้รับผิดชอบ..."
              searchableKeys={["task_no", "title", "assignee_name", "project"]}
              views={VIEWS} tableId="tasks"
              exportFilename="งาน"
              enableCards
              cardConfig={{
                primary: "title",
                subtitle: "task_no",
                badges: ["status", "priority"],
                lines: ["assignee_name", "due_date", "project"],
              }}
              onRowClick={(row) => setDetailId(row.id)}
            />
          </div>
        )}

        {boardView === "kanban" && (
          /* Kanban board — ลากการ์ดข้ามคอลัมน์ = เปลี่ยนสถานะ */
          <div>
            <p className="text-xs text-slate-400 mb-2">💡 ลากการ์ดข้ามคอลัมน์เพื่อเปลี่ยนสถานะ · คลิกการ์ดเพื่อดูรายละเอียด</p>
            <KanbanBoard
              tasks={tasks}
              onCardClick={(id) => setDetailId(id)}
              onMove={(taskId, to) => doTransition(taskId, to, "ลากบนกระดาน")}
            />
          </div>
        )}

        {boardView === "canvas" && (
          /* Canvas board (แบบ Miro) — ลากการ์ดอิสระ + โซน + sticky note */
          <CanvasBoard
            tasks={tasks}
            startMaximized
            onCardClick={(id) => setDetailId(id)}
            onMove={(taskId, to) => doTransition(taskId, to, "ลากบน Canvas")}
          />
        )}
      </div>

      {/* ============ Create Modal ============ */}
      <ERPModal
        open={modalOpen} onClose={() => setModalOpen(false)}
        title="สร้างงานใหม่"
        description="ผู้รับผิดชอบ + สินค้า ใช้ Picker กลาง (ดึงข้อมูลจริงจากระบบ)"
        size="lg" hasUnsavedChanges={dirty}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={save} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">สร้างงาน</button>
          </>
        }
      >
        {formErr && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {formErr}</div>}
        <ERPFormSection title="ข้อมูลงาน" columns={2}>
          <ERPFormField label="ชื่องาน" required span={2}>
            <ERPInput value={form.title} onChange={e => updateForm({ title: e.target.value })} placeholder="เช่น ถ่ายรูปสินค้าคอลเลกชันใหม่" />
          </ERPFormField>
          <ERPFormField label="รายละเอียด" span={2}>
            <ERPTextarea value={form.description} rows={2} onChange={e => updateForm({ description: e.target.value })} placeholder="อธิบายงานเพิ่มเติม" />
          </ERPFormField>
          <ERPFormField label="ผู้รับผิดชอบ" required>
            <EmployeePicker value={form.assignee} onChange={v => updateForm({ assignee: v })} disableCreate />
          </ERPFormField>
          <ERPFormField label="ความสำคัญ">
            <ERPSelect value={form.priority} options={PRIORITY_OPTIONS} onChange={e => updateForm({ priority: e.target.value as TaskPriority })} />
          </ERPFormField>
          <ERPFormField label="กำหนดส่ง">
            <ERPInput type="date" value={form.due_date} onChange={e => updateForm({ due_date: e.target.value })} />
          </ERPFormField>
          <ERPFormField label="โปรเจกต์/หมวด">
            <ERPInput value={form.project} onChange={e => updateForm({ project: e.target.value })} placeholder="เช่น การตลาด / Content" />
          </ERPFormField>
          <ERPFormField label="สินค้า/SKU (ถ้ามี)" span={2}>
            <ProductPicker value={form.product} onChange={v => updateForm({ product: v })} disableCreate />
          </ERPFormField>
          <ERPFormField label="แท็ก (คั่นด้วย ,)" span={2}>
            <ERPInput value={form.tags} onChange={e => updateForm({ tags: e.target.value })} placeholder="ถ่ายรูป, summer" />
          </ERPFormField>
        </ERPFormSection>
      </ERPModal>

      {/* ============ Detail Drawer ============ */}
      {detail && (
        <TaskDetailDrawer
          task={detail}
          onClose={() => setDetailId(null)}
          onTransition={doTransition}
          onToggleChecklist={toggleChecklist}
          onAddComment={addComment}
          onCancel={() => setCancelTarget(detail)}
        />
      )}

      {/* Cancel confirm */}
      <ConfirmDialog
        open={!!cancelTarget} onClose={() => setCancelTarget(null)}
        onConfirm={() => { if (cancelTarget) { doTransition(cancelTarget.id, "cancelled", "ยกเลิกงาน"); setCancelTarget(null); } }}
        title="ยกเลิกงาน"
        message={<span>ต้องการยกเลิก <span className="font-semibold">{cancelTarget?.title}</span> ใช่ไหม?</span>}
        confirmText="ยกเลิกงาน" variant="danger"
      />

      <ToastStack toasts={toasts} onDismiss={id => setToasts(p => p.filter(t => t.id !== id))} />
    </StandaloneShell>
  );
}

function ViewToggleBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button onClick={onClick}
      className={`h-8 px-3 rounded-md text-sm font-medium transition-colors ${active ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
      {icon} {label}
    </button>
  );
}

function StatChip({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "violet" | "red" }) {
  const cls = { slate: "bg-slate-50 text-slate-700 border-slate-200", violet: "bg-violet-50 text-violet-700 border-violet-200", red: "bg-red-50 text-red-700 border-red-200" }[tone];
  return (
    <div className={`px-3 py-1.5 rounded-lg border text-sm ${cls}`}>
      <span className="font-bold">{value}</span> <span className="opacity-70">{label}</span>
    </div>
  );
}

// ============================================================
// Detail Drawer
// ============================================================

function TaskDetailDrawer({
  task, onClose, onTransition, onToggleChecklist, onAddComment, onCancel,
}: {
  task: Task;
  onClose: () => void;
  onTransition: (taskId: string, to: TaskStatus, label: string) => void;
  onToggleChecklist: (taskId: string, itemId: string) => void;
  onAddComment: (taskId: string, text: string) => void;
  onCancel: () => void;
}) {
  const [commentText, setCommentText] = useState("");
  const transitions = TASK_TRANSITIONS[task.status];
  const isClosed = task.status === "done" || task.status === "cancelled";
  const doneSub = task.subtasks.filter(s => s.status === "done").length;
  const doneChk = task.checklist.filter(c => c.done).length;

  // synthesize activity from task (ขั้น B → audit_logs กลาง)
  const activity: ActivityEntry[] = [
    {
      id: "a-create", action: "create", entity_type: "task", entity_id: task.id,
      actor_name: task.creator_name, metadata: {}, created_at: task.created_at,
    },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[580px] max-w-[95vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate">{task.title}</h3>
            <span className="font-mono text-xs text-slate-500">{task.task_no}</span>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Status + meta */}
          <div className="flex items-center gap-2 flex-wrap">
            <TaskStatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {task.tags.map(tg => <span key={tg} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">#{tg}</span>)}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="ผู้รับผิดชอบ" value={task.assignee_name} />
            <Field label="ผู้สร้าง" value={task.creator_name} />
            <Field label="กำหนดส่ง" value={task.due_date} highlight={isOverdue(task)} />
            <Field label="โปรเจกต์/หมวด" value={task.project} />
          </div>
          {task.product_sku && (
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <p className="text-xs text-slate-400 mb-1">สินค้าที่เกี่ยวข้อง</p>
              <span className="font-mono text-xs bg-white border border-slate-200 px-1.5 py-0.5 rounded mr-2">{task.product_sku}</span>
              {task.product_name}
            </div>
          )}
          {task.description && (
            <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
              <p className="text-xs text-slate-400 mb-1">รายละเอียด</p>{task.description}
            </div>
          )}

          {/* Subtasks */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              งานย่อย (Subtask) {task.subtasks.length > 0 && `· ${doneSub}/${task.subtasks.length}`}
            </p>
            {task.subtasks.length === 0 ? (
              <p className="text-sm text-slate-400 italic">ยังไม่มีงานย่อย</p>
            ) : (
              <div className="space-y-1.5">
                {task.subtasks.map(s => (
                  <div key={s.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                    <span className={`text-sm flex-1 ${s.status === "done" ? "line-through text-slate-400" : "text-slate-700"}`}>{s.name}</span>
                    <span className="text-xs text-slate-400">{s.assignee_name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border ${
                      s.status === "done" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : s.status === "in_progress" ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                      : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                      {s.status === "done" ? "เสร็จ" : s.status === "in_progress" ? "กำลังทำ" : "รอทำ"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Checklist */}
          {task.checklist.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">เช็คลิสต์ · {doneChk}/{task.checklist.length}</p>
              <div className="space-y-1">
                {task.checklist.map(c => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer py-1">
                    <input type="checkbox" checked={c.done} onChange={() => onToggleChecklist(task.id, c.id)} className="h-4 w-4 rounded border-slate-300 text-violet-600" />
                    <span className={`text-sm ${c.done ? "line-through text-slate-400" : "text-slate-700"}`}>{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Comments (mock — ขั้น B ใช้ comment-thread กลาง) */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">ความคิดเห็น ({task.comments.length})</p>
            <div className="space-y-2 mb-3">
              {task.comments.map(c => (
                <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-slate-700">{c.author_name}</span>
                    <span className="text-xs text-slate-400">{c.created_at.slice(0, 16).replace("T", " ")}</span>
                  </div>
                  <p className="text-sm text-slate-600">{c.text}</p>
                </div>
              ))}
              {task.comments.length === 0 && <p className="text-sm text-slate-400 italic">ยังไม่มีความคิดเห็น</p>}
            </div>
            <div className="flex gap-2">
              <ERPInput value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="เขียนความคิดเห็น..." />
              <button
                onClick={() => { if (commentText.trim()) { onAddComment(task.id, commentText.trim()); setCommentText(""); } }}
                className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 shrink-0">ส่ง</button>
            </div>
          </div>

          {/* Activity (ของกลาง ActivityFeed) */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ประวัติ (Activity)</p>
            <ActivityFeed entries={activity} compact emptyMessage="ยังไม่มีประวัติ" />
          </div>
        </div>

        {/* Workflow action footer */}
        <div className="border-t border-slate-200 px-6 py-4 shrink-0 flex items-center gap-2 flex-wrap">
          {isClosed ? (
            <p className="text-sm text-slate-400 text-center w-full">งานปิดแล้ว ({STATUS_META[task.status].label}) — ดูได้อย่างเดียว</p>
          ) : (
            <>
              {transitions.map(tr => (
                <button key={tr.action} onClick={() => onTransition(task.id, tr.to, tr.label)}
                  className={`h-9 px-4 text-sm font-medium rounded-lg ${
                    tr.variant === "primary" ? "flex-1 bg-violet-600 text-white hover:bg-violet-700"
                    : "text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
                  {tr.label}
                </button>
              ))}
              <button onClick={onCancel} className="h-9 px-4 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">ยกเลิก</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${highlight ? "text-red-600" : "text-slate-800"}`}>{highlight && "⚠ "}{value || "—"}</p>
    </div>
  );
}
