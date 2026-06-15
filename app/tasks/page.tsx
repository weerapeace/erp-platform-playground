"use client";

// ============================================================
// Creative Task Manager — ต่อข้อมูลจริง (Phase B)
// ของกลาง: StandaloneShell, DataTable, ERPModal, ConfirmDialog, ERPForm*,
//          UserPicker, ProductPicker, ActivityFeed
// ข้อมูลจาก /api/creative-tasks (ดู app/tasks/data.ts)
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { StandaloneShell } from "@/components/standalone-shell";
import { useAuth } from "@/components/auth";
import { useT } from "@/components/i18n";
import { DataTable } from "@/components/data-table";
import { ERPInput } from "@/components/form";
import { UserPicker } from "@/components/pickers";
import type { UserPickerValue } from "@/components/pickers";
import type { ColumnDef } from "@tanstack/react-table";
import { KanbanBoard } from "./kanban-board";
import { CanvasBoard } from "./canvas-board";
import { CreateTaskModal } from "./create-task-modal";
import { taskTypeLabel, platformLabel } from "./use-options";
import { useCreativeStatuses, statusMeta, transitionsFrom, transitionBetween, isTerminal } from "./use-statuses";
import { SubtaskCard, AddSubtaskForm } from "./subtask-manager";
import {
  PRIORITY_META, APPROVAL_META, ASSET_META, PRIORITY_RANK,
  isOverdue, withinThisWeek,
  listTasks, getTask, transitionTask, approveTask, deleteTask,
  addSubtask, updateSubtask, addComment, addAttachment,
  listCampaigns, listBrands, listMySubtasks,
  type CreativeTask, type CreativeStatus, type CreativePriority, type TaskDetail,
  type Campaign, type BrandOption, type MySubtask,
} from "./data";

// ============================================================
// Badges
// ============================================================
function StatusBadge({ status }: { status: string }) {
  const m = statusMeta(status);
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}</span>;
}
function PriorityBadge({ priority }: { priority: CreativePriority }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.normal;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>{m.label}</span>;
}


// ============================================================
// Table columns + views
// ============================================================
const COLUMNS: ColumnDef<CreativeTask>[] = [
  { accessorKey: "task_no", header: "เลขที่งาน", size: 140, cell: ({ getValue }) => <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-medium">{(getValue() as string) || "—"}</span> },
  {
    accessorKey: "title", header: "ชื่องาน",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800 line-clamp-1">{row.original.title}</div>
        <div className="text-xs text-slate-400 line-clamp-1">
          {row.original.task_type && <span>{taskTypeLabel(row.original.task_type)}</span>}
          {row.original.sku_code && <span> · 📦 {row.original.sku_code}</span>}
        </div>
      </div>
    ),
  },
  { accessorKey: "brand_label", header: "แบรนด์", size: 120, meta: { filterable: true }, cell: ({ row }) => row.original.brand_label ? <span className="inline-flex items-center gap-1.5 text-sm text-slate-700"><span className="h-2.5 w-2.5 rounded-full" style={{ background: row.original.brand_color || "#cbd5e1" }} />{row.original.brand_label}</span> : <span className="text-slate-300">—</span> },
  { accessorKey: "assignee_label", header: "ผู้รับผิดชอบ", size: 130, meta: { filterable: true }, cell: ({ getValue }) => (getValue() as string) || <span className="text-slate-300">—</span> },
  { accessorKey: "priority", header: "ความสำคัญ", size: 100, cell: ({ getValue }) => <PriorityBadge priority={getValue() as CreativePriority} /> },
  { accessorKey: "status", header: "สถานะ", size: 120, cell: ({ getValue }) => <StatusBadge status={getValue() as CreativeStatus} /> },
  { accessorKey: "progress_percent", header: "คืบหน้า", size: 90, cell: ({ getValue }) => { const v = (getValue() as number) ?? 0; return <div className="flex items-center gap-1.5"><div className="h-1.5 w-12 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400" style={{ width: `${v}%` }} /></div><span className="text-[11px] text-slate-400">{v}%</span></div>; } },
  { accessorKey: "due_date", header: "กำหนดส่ง", size: 110, cell: ({ row }) => { const t = row.original; if (!t.due_date) return <span className="text-xs text-slate-400">—</span>; const od = isOverdue(t); return <span className={`text-xs ${od ? "text-red-600 font-semibold" : "text-slate-500"}`}>{od && "⚠ "}{t.due_date}</span>; } },
];

const VIEWS = [
  { id: "all", label: "ทั้งหมด" },
  { id: "active", label: "🔵 กำลังดำเนินการ", filter: (r: Record<string, unknown>) => !isTerminal(r.status as string) },
  { id: "need_review", label: "🟡 รอตรวจ/อนุมัติ", filter: (r: Record<string, unknown>) => r.status === "need_review" },
  { id: "overdue", label: "⚠️ เกินกำหนด", filter: (r: Record<string, unknown>) => isOverdue(r as CreativeTask) },
  { id: "this_week", label: "🗓️ สัปดาห์นี้", filter: (r: Record<string, unknown>) => withinThisWeek(r as CreativeTask) },
  { id: "blocked", label: "🔴 ติดปัญหา", filter: (r: Record<string, unknown>) => r.status === "blocked" },
  { id: "done", label: "✅ เสร็จ/ปิดงาน", filter: (r: Record<string, unknown>) => isTerminal(r.status as string) },
];

// ============================================================
// Toast
// ============================================================
type Toast = { id: number; type: "success" | "error" | "info"; message: string };
function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const color = { success: "bg-emerald-600", error: "bg-red-600", info: "bg-slate-800" };
  return (
    <div className="fixed bottom-6 right-6 z-[70] flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${color[t.type]}`}>
          <span>{t.type === "success" ? "✓" : t.type === "error" ? "⚠️" : "ℹ️"}</span>{t.message}
          <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Main page
// ============================================================
export default function TasksPage() {
  const { user } = useAuth();
  const t = useT();
  const { statuses } = useCreativeStatuses();
  const [tasks, setTasks] = useState<CreativeTask[]>([]);
  const [myTasks, setMyTasks] = useState<CreativeTask[]>([]);
  const [mySubs, setMySubs] = useState<MySubtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"queue" | "table" | "kanban" | "canvas">("table");
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  // create modal
  const [createOpen, setCreateOpen] = useState(false);

  // detail drawer
  const [detailId, setDetailId] = useState<string | null>(null);


  // toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  const loadAll = useCallback(async () => {
    try { setTasks(await listTasks({ sort_by: "updated_at", sort_dir: "desc" })); }
    catch (e) { pushToast("error", `โหลดงานไม่สำเร็จ: ${(e as Error).message}`); }
  }, [pushToast]);
  const loadMine = useCallback(async () => {
    try { setMyTasks(await listTasks({ mine: true })); }
    catch (e) { pushToast("error", `โหลดงานของฉันไม่สำเร็จ: ${(e as Error).message}`); }
  }, [pushToast]);
  const loadMySubs = useCallback(async () => { try { setMySubs(await listMySubtasks()); } catch { /* ignore */ } }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadAll(), loadMine(), loadMySubs()]);
      try { const [b, c] = await Promise.all([listBrands(), listCampaigns()]); setBrands(b); setCampaigns(c); } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [loadAll, loadMine, loadMySubs]);

  // เปิด drawer งานอัตโนมัติจากลิงก์ /tasks?task=<id> (เช่นกดมาจากการ์ดบน Canvas)
  useEffect(() => { const tid = new URLSearchParams(window.location.search).get("task"); if (tid) setDetailId(tid); }, []);

  const reload = useCallback(async () => { await Promise.all([loadAll(), loadMine(), loadMySubs()]); }, [loadAll, loadMine, loadMySubs]);
  const toggleMySub = useCallback(async (s: MySubtask) => {
    try { await updateSubtask(s.task_id, s.id, { status: "done" }); pushToast("success", "ทำงานย่อยเสร็จแล้ว ✓"); await loadMySubs(); }
    catch (e) { pushToast("error", (e as Error).message); }
  }, [pushToast, loadMySubs]);

  const counts = useMemo(() => ({
    total: tasks.length,
    mine: myTasks.length,
    overdue: tasks.filter(isOverdue).length,
    review: tasks.filter((t) => t.status === "need_review").length,
  }), [tasks, myTasks]);

  // ---- create ----
  const openCreate = () => setCreateOpen(true);

  // ---- workflow (เส้นทาง + ชนิด อ่านจาก DB) ----
  const applyMove = useCallback(async (task: CreativeTask, toKey: string, force?: boolean) => {
    if (force) {
      try { await transitionTask(task.id, toKey, undefined, true); pushToast("success", `→ ${statusMeta(toKey).label}`); await reload(); }
      catch (e) { pushToast("error", (e as Error).message); }
      return;
    }
    const tr = transitionBetween(task.status, toKey);
    if (!tr) { pushToast("error", `เปลี่ยน "${statusMeta(task.status).label}" → "${statusMeta(toKey).label}" ไม่ได้`); return; }
    try {
      if (tr.kind === "approve") await approveTask(task.id, "approve", undefined, toKey);
      else if (tr.kind === "reject" || tr.kind === "revise") { const c = (typeof window !== "undefined" && window.prompt(tr.kind === "reject" ? "เหตุผลที่ไม่ผ่าน:" : "สิ่งที่ต้องแก้:")) || ""; await approveTask(task.id, tr.kind as "reject" | "revise", c, toKey); }
      else if (tr.kind === "block") { const reason = (typeof window !== "undefined" && window.prompt("ติดปัญหาเรื่องอะไร?")) || ""; await transitionTask(task.id, toKey, reason); }
      else await transitionTask(task.id, toKey);
      pushToast("success", `→ ${statusMeta(toKey).label}`);
      await reload();
    } catch (e) { pushToast("error", (e as Error).message); }
  }, [pushToast, reload]);

  const onDelete = async (id: string) => { try { await deleteTask(id); pushToast("info", "ลบงานแล้ว"); setDetailId(null); await reload(); } catch (e) { pushToast("error", (e as Error).message); } };

  return (
    <StandaloneShell title={t("งาน Creative (Task Manager)", "Creative Tasks")} icon="🎨" accent="violet">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("งาน Creative", "Creative Tasks")}</h1>
            <p className="text-slate-500 mt-1">{t("ถ่ายรูป · แต่งรูป · Banner · Video · ลงสินค้า · Social — ตารางกลาง · Workflow · อนุมัติ", "Photo · Retouch · Banner · Video · Listing · Social — central table · workflow · approval")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href="/tasks/campaigns" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">📣 {t("แคมเปญ", "Campaigns")}</a>
            <a href="/tasks/content" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">📱 {t("คอนเทนต์", "Content")}</a>
            <a href="/tasks/templates" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">🔁 {t("เทมเพลต", "Templates")}</a>
            {user?.role === "admin" && <a href="/tasks/settings" className="h-10 px-3 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50" title={t("ตั้งค่าสิทธิ์", "Settings")}>⚙️</a>}
            <button onClick={openCreate} className="h-10 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors">＋ {t("สร้างงาน", "New task")}</button>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <StatChip label={t("งานทั้งหมด", "All tasks")} value={counts.total} />
          <StatChip label={t("งานของฉัน", "My tasks")} value={counts.mine} tone="violet" />
          <StatChip label={t("รอตรวจ", "In review")} value={counts.review} tone="amber" />
          <StatChip label={t("เกินกำหนด", "Overdue")} value={counts.overdue} tone="red" />
        </div>
      </div>

      <div className="px-8 py-6 space-y-5">
        {/* View toggle */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          <ViewToggleBtn active={view === "queue"} onClick={() => setView("queue")} icon="🙋" label={t("คิวงานของฉัน", "My queue")} />
          <ViewToggleBtn active={view === "table"} onClick={() => setView("table")} icon="📋" label={t("ตาราง", "Table")} />
          <ViewToggleBtn active={view === "kanban"} onClick={() => setView("kanban")} icon="🟦" label="Kanban" />
          <ViewToggleBtn active={view === "canvas"} onClick={() => setView("canvas")} icon="🟪" label="Canvas" />
        </div>

        {loading ? (
          <div className="py-20 text-center text-slate-400">กำลังโหลดข้อมูล...</div>
        ) : (
          <>
            {view === "queue" && <QueueView tasks={myTasks} subtasks={mySubs} onOpen={(id) => setDetailId(id)} onMove={applyMove} onCreate={openCreate} onToggleSub={toggleMySub} />}

            {view === "table" && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <DataTable<CreativeTask>
                  data={tasks} columns={COLUMNS}
                  title={`${t("รายการงาน", "Tasks")} (${tasks.length})`}
                  description={t("คลิกที่งานเพื่อดูรายละเอียด · ตารางกลางตัวเดียวกับทุกโมดูล", "Click a row to view details · shared table used across modules")}
                  emptyMessage={t("ยังไม่มีงาน — กดปุ่ม สร้างงาน", "No tasks yet — click New task")}
                  searchPlaceholder={t("ค้นหา เลขที่ / ชื่องาน / ผู้รับผิดชอบ...", "Search no. / title / assignee...")}
                  searchableKeys={["task_no", "title", "assignee_label", "brand_label", "sku_code"]}
                  views={VIEWS} tableId="creative-tasks" exportFilename="งาน-creative"
                  enableCards
                  cardConfig={{ primary: "title", subtitle: "task_no", badges: ["status", "priority"], lines: ["assignee_label", "due_date", "brand_label"] }}
                  onRowClick={(row) => setDetailId(row.id)}
                />
              </div>
            )}

            {view === "kanban" && (
              <div>
                <p className="text-xs text-slate-400 mb-2">💡 ลากการ์ดข้ามคอลัมน์เพื่อเปลี่ยนสถานะ · คลิกการ์ดเพื่อดูรายละเอียด</p>
                <KanbanBoard tasks={tasks} statuses={statuses} onCardClick={(id) => setDetailId(id)} onMove={(taskId, to) => { const t = tasks.find((x) => x.id === taskId); if (t) applyMove(t, to); }} />
              </div>
            )}

            {view === "canvas" && (
              <div>
                <p className="text-xs text-slate-400 mb-2">💡 ลากการ์ดอิสระ · ปล่อยในโซนสถานะเพื่อเปลี่ยนสถานะ · วาดกล่อง/โน้ต/ลูกศร/วางรูปได้ · ดับเบิลคลิกการ์ด = ดูรายละเอียด</p>
                <CanvasBoard tasks={tasks} statuses={statuses} startMaximized onAddTask={openCreate} onCardClick={(id) => setDetailId(id)} onMove={(taskId, to, force) => { const t = tasks.find((x) => x.id === taskId); if (t) applyMove(t, to, force); }} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Create modal (ของกลาง — ใช้ร่วมกับ Campaign Canvas) */}
      <CreateTaskModal open={createOpen} onClose={() => setCreateOpen(false)} pushToast={pushToast}
        onCreated={async (t) => { pushToast("success", `สร้างงาน ${t.task_no} แล้ว`); await reload(); }} />

      {/* Detail drawer */}
      {detailId && (
        <TaskDetailDrawer
          taskId={detailId} brands={brands} campaigns={campaigns}
          onClose={() => setDetailId(null)} onChanged={reload}
          onMove={applyMove} onDelete={onDelete} pushToast={pushToast}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </StandaloneShell>
  );
}

function ViewToggleBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return <button onClick={onClick} className={`h-8 px-3 rounded-md text-sm font-medium transition-colors ${active ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{icon} {label}</button>;
}
function StatChip({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "violet" | "red" | "amber" }) {
  const cls = { slate: "bg-slate-50 text-slate-700 border-slate-200", violet: "bg-violet-50 text-violet-700 border-violet-200", red: "bg-red-50 text-red-700 border-red-200", amber: "bg-amber-50 text-amber-700 border-amber-200" }[tone];
  return <div className={`px-3 py-1.5 rounded-lg border text-sm ${cls}`}><span className="font-bold">{value}</span> <span className="opacity-70">{label}</span></div>;
}

// ============================================================
// Queue View — หน้าพนักงาน ปุ่มใหญ่ งานตัวเองเด่น
// ============================================================
function QueueView({ tasks, subtasks, onOpen, onMove, onCreate, onToggleSub }: {
  tasks: CreativeTask[]; subtasks: MySubtask[]; onOpen: (id: string) => void; onMove: (t: CreativeTask, toKey: string) => void; onCreate: () => void; onToggleSub: (s: MySubtask) => void;
}) {
  const ordered = useMemo(() => [...tasks].filter((t) => !isTerminal(t.status)).sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (pr !== 0) return pr;
    return (a.due_date || "9999").localeCompare(b.due_date || "9999");
  }), [tasks]);

  if (ordered.length === 0 && subtasks.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="text-4xl mb-3">🎉</div>
        <p className="text-slate-600 font-medium">ไม่มีงานค้างในคิวของคุณ</p>
        <p className="text-slate-400 text-sm mt-1">งาน/งานย่อยที่มอบหมายให้คุณจะแสดงที่นี่ เรียงตามความสำคัญและกำหนดส่ง</p>
        <button onClick={onCreate} className="mt-4 h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ สร้างงาน</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* งานย่อยของฉัน */}
      {subtasks.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-700 mb-2">🧩 งานย่อยของฉัน ({subtasks.length})</p>
          <div className="space-y-1.5">
            {subtasks.map((s) => (
              <div key={s.id} className="flex items-center gap-2 border border-slate-100 rounded-lg px-3 py-2 hover:border-violet-200">
                <input type="checkbox" checked={false} onChange={() => onToggleSub(s)} title="ทำเสร็จ" className="h-4 w-4 rounded border-slate-300 text-violet-600 cursor-pointer" />
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpen(s.task_id)}>
                  <span className="text-sm text-slate-700">{s.title}</span>
                  {s.required_before_next && <span className="ml-2 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1">ต้องเสร็จก่อน</span>}
                  <div className="text-xs text-slate-400 truncate">↳ {s.task_no ? <span className="font-mono">{s.task_no}</span> : null} {s.task_title}</div>
                </div>
                {s.due_date && <span className="text-xs text-slate-400 shrink-0">{s.due_date}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {ordered.length > 0 && <p className="text-sm text-slate-500">งานที่ต้องทำตอนนี้ · เรียงตามความสำคัญ + กำหนดส่ง ({ordered.length})</p>}
      {ordered.map((t, i) => {
        const od = isOverdue(t);
        const actions = transitionsFrom(t.status);
        return (
          <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-violet-300 transition-colors">
            <div className="flex items-start gap-4">
              <div className="h-9 w-9 rounded-full bg-violet-50 text-violet-700 font-bold flex items-center justify-center shrink-0">{i + 1}</div>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpen(t.id)}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                  {t.task_type && <span className="text-xs text-slate-400">{taskTypeLabel(t.task_type)}</span>}
                </div>
                <p className="text-base font-semibold text-slate-800 leading-snug">{t.title}</p>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                  <span className="font-mono">{t.task_no}</span>
                  {t.brand_label && <span>· {t.brand_label}</span>}
                  {t.sku_code && <span>· 📦 {t.sku_code}</span>}
                  {t.due_date && <span className={od ? "text-red-600 font-semibold" : ""}>· {od ? "⚠ เกินกำหนด " : "ส่ง "}{t.due_date}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap pl-13">
              {actions.map((a) => (
                <button key={a.to_key} onClick={() => onMove(t, a.to_key)} className="h-9 px-4 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700">{a.label}</button>
              ))}
              <button onClick={() => onOpen(t.id)} className="h-9 px-4 text-sm font-medium rounded-lg text-slate-600 border border-slate-200 hover:bg-slate-50">📂 เปิดงาน</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Detail Drawer (โหลดรายละเอียดจริงจาก API)
// ============================================================
function TaskDetailDrawer({ taskId, brands, campaigns, onClose, onChanged, onMove, onDelete, pushToast }: {
  taskId: string; brands: BrandOption[]; campaigns: Campaign[];
  onClose: () => void; onChanged: () => Promise<void> | void;
  onMove: (t: CreativeTask, toKey: string) => Promise<void>;
  onDelete: (id: string) => void;
  pushToast: (type: Toast["type"], message: string) => void;
}) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const load = useCallback(async () => {
    try { setDetail(await getTask(taskId)); }
    catch (e) { pushToast("error", `โหลดรายละเอียดไม่สำเร็จ: ${(e as Error).message}`); }
  }, [taskId, pushToast]);
  useEffect(() => { load(); }, [load]);

  const refresh = async () => { await load(); await onChanged(); };

  if (!detail) {
    return (
      <>
        <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
        <div className="fixed right-0 top-0 h-full w-[600px] max-w-[95vw] bg-white shadow-2xl z-50 flex items-center justify-center"><span className="text-slate-400">กำลังโหลด...</span></div>
      </>
    );
  }
  const t = detail;
  const isClosed = isTerminal(t.status);
  const actions = transitionsFrom(t.status);
  const doneSub = t.subtasks.filter((s) => s.status === "done").length;

  const handleMove = async (toKey: string) => { setBusy(true); await onMove(t, toKey); await refresh(); setBusy(false); };
  const sendComment = async () => { if (!commentText.trim()) return; try { await addComment(t.id, commentText.trim()); setCommentText(""); await load(); } catch (e) { pushToast("error", (e as Error).message); } };
  const addLink = async () => { if (!linkUrl.trim()) return; try { await addAttachment(t.id, { kind: "drive_link", label: linkLabel.trim() || undefined, url: linkUrl.trim() }); setLinkLabel(""); setLinkUrl(""); await load(); } catch (e) { pushToast("error", (e as Error).message); } };

  const brandColor = brands.find((b) => b.id === t.brand_id)?.color ?? t.brand_color;
  const campaignName = campaigns.find((c) => c.id === t.campaign_id)?.name ?? t.campaign_label;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[600px] max-w-[95vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate">{t.title}</h3>
            <span className="font-mono text-xs text-slate-500">{t.task_no}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onDelete(t.id)} className="h-8 px-2 text-xs text-red-500 hover:bg-red-50 rounded-md">ลบ</button>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* status row */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} />
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${APPROVAL_META[t.approval_status].cls}`}>อนุมัติ: {APPROVAL_META[t.approval_status].label}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ASSET_META[t.asset_status].cls}`}>{ASSET_META[t.asset_status].label}</span>
          </div>
          {/* progress */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1"><span>ความคืบหน้า</span><span>{t.progress_percent}%</span></div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-500" style={{ width: `${t.progress_percent}%` }} /></div>
            {t.blocker_status === "blocked" && t.blocker_reason && <p className="text-xs text-red-600 mt-1">⚠ ติดปัญหา: {t.blocker_reason}</p>}
          </div>
          {/* meta */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="ประเภทงาน" value={t.task_type ? taskTypeLabel(t.task_type) : null} />
            <Field label="แบรนด์" value={t.brand_label} dot={brandColor} />
            <Field label="ผู้รับผิดชอบ" value={t.assignee_label} />
            <Field label="ผู้ตรวจ/อนุมัติ" value={t.reviewer_label || t.approver_label} />
            <Field label="กำหนดส่ง" value={t.due_date} highlight={isOverdue(t)} />
            <Field label="แคมเปญ" value={campaignName} />
            <Field label="Parent SKU" value={t.parent_sku_code ? `${t.parent_sku_code}${t.parent_sku_name ? " · " + t.parent_sku_name : ""}` : null} />
          </div>
          {/* SKU card */}
          {(t.sku_code || t.product_name) && (
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <p className="text-xs text-slate-400 mb-1">สินค้าที่เกี่ยวข้อง</p>
              {t.sku_code && <span className="font-mono text-xs bg-white border border-slate-200 px-1.5 py-0.5 rounded mr-2">{t.sku_code}</span>}
              <span className="text-slate-700">{t.sku_name || t.product_name}</span>
              <div className="flex gap-4 mt-1.5 text-xs text-slate-500">
                {t.sku_color && <span>สี: {t.sku_color}</span>}
                {t.sku_price != null && <span>ราคา: {Number(t.sku_price).toLocaleString()}</span>}
              </div>
            </div>
          )}
          {/* platforms */}
          {t.platforms && t.platforms.length > 0 && <div className="flex flex-wrap gap-1.5">{t.platforms.map((p) => <span key={p} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{platformLabel(p)}</span>)}</div>}
          {/* description */}
          {t.description && <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600"><p className="text-xs text-slate-400 mb-1">รายละเอียด</p>{t.description}</div>}
          {/* links */}
          {(t.drive_folder_url || t.final_asset_url || t.published_url) && (
            <div className="flex flex-wrap gap-2">
              {t.drive_folder_url && <a href={t.drive_folder_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-violet-700 hover:bg-violet-50">📁 โฟลเดอร์ Drive</a>}
              {t.final_asset_url && <a href={t.final_asset_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-violet-700 hover:bg-violet-50">🖼 ไฟล์จริง</a>}
              {t.published_url && <a href={t.published_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-violet-700 hover:bg-violet-50">🔗 ลิงก์ที่เผยแพร่</a>}
            </div>
          )}

          {/* subtasks */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">งานย่อย {t.subtasks.length > 0 && `· ${doneSub}/${t.subtasks.length}`}</p>
            <div className="space-y-2">
              {t.subtasks.map((s) => <SubtaskCard key={s.id} sub={s} taskId={t.id} reload={refresh} pushToast={pushToast} />)}
            </div>
            <AddSubtaskForm onAdd={async (body) => { await addSubtask(t.id, body); await refresh(); }} pushToast={pushToast} />
          </div>

          {/* attachments */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">ไฟล์/ลิงก์แนบ ({t.attachments.length})</p>
            <div className="space-y-1.5 mb-2">
              {t.attachments.map((a) => (
                <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm text-violet-700 hover:bg-violet-50">
                  🔗 <span className="truncate">{a.label || a.url}</span>
                </a>
              ))}
              {t.attachments.length === 0 && <p className="text-sm text-slate-400 italic">ยังไม่มีไฟล์แนบ</p>}
            </div>
            <div className="flex gap-2">
              <ERPInput value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="ชื่อ (ไม่บังคับ)" />
              <ERPInput value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="วางลิงก์ Drive/URL" />
              <button onClick={addLink} className="h-9 px-3 text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 shrink-0">แนบ</button>
            </div>
          </div>

          {/* comments */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">ความคิดเห็น ({t.comments.length})</p>
            <div className="space-y-2 mb-3">
              {t.comments.map((c) => (
                <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-0.5"><span className="text-xs font-medium text-slate-700">{c.author_name || "ผู้ใช้"}</span><span className="text-xs text-slate-400">{c.created_at.slice(0, 16).replace("T", " ")}</span></div>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
              {t.comments.length === 0 && <p className="text-sm text-slate-400 italic">ยังไม่มีความคิดเห็น</p>}
            </div>
            <div className="flex gap-2">
              <ERPInput value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="เขียนความคิดเห็น..." />
              <button onClick={sendComment} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 shrink-0">ส่ง</button>
            </div>
          </div>
        </div>

        {/* footer actions */}
        <div className="border-t border-slate-200 px-6 py-4 shrink-0 flex items-center gap-2 flex-wrap">
          {actions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center w-full">{isClosed ? `งานปิดแล้ว (${statusMeta(t.status).label})` : "ไม่มีการกระทำ"} — ดูได้อย่างเดียว</p>
          ) : actions.map((a, i) => {
            const cls = a.kind === "approve" ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : a.kind === "reject" ? "text-red-600 border border-red-200 hover:bg-red-50"
              : a.kind === "revise" ? "text-orange-700 border border-orange-200 hover:bg-orange-50"
              : a.kind === "block" ? "text-red-600 border border-red-200 hover:bg-red-50"
              : i === 0 ? "flex-1 bg-violet-600 text-white hover:bg-violet-700" : "text-slate-600 border border-slate-200 hover:bg-slate-50";
            return <button key={a.to_key} disabled={busy} onClick={() => handleMove(a.to_key)} className={`h-9 px-4 text-sm font-medium rounded-lg disabled:opacity-50 ${cls}`}>{a.label}</button>;
          })}
        </div>
      </div>
    </>
  );
}

function Field({ label, value, highlight, dot }: { label: string; value: string | null | undefined; highlight?: boolean; dot?: string | null }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className={`text-sm font-medium flex items-center gap-1.5 ${highlight ? "text-red-600" : "text-slate-800"}`}>
        {dot && value && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: dot || "#cbd5e1" }} />}
        {highlight && "⚠ "}{value || "—"}
      </p>
    </div>
  );
}
