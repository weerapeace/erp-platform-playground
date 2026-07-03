"use client";

// ============================================================
// Creative Task Manager — ต่อข้อมูลจริง (Phase B)
// ของกลาง: StandaloneShell, DataTable, ERPModal, ConfirmDialog, ERPForm*,
//          UserPicker, ProductPicker, ActivityFeed
// ข้อมูลจาก /api/creative-tasks (ดู app/tasks/data.ts)
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { StandaloneShell } from "@/components/standalone-shell";
import { HoverImage } from "@/components/hover-image";
import { useAuth } from "@/components/auth";
import type { UserPickerValue } from "@/components/pickers";
import { useT } from "@/components/i18n";
import { useSWRLite } from "@/lib/swr-lite";
import type { ColumnDef } from "@tanstack/react-table";
import { OverviewKanban } from "./overview-kanban";
import { KanbanSettings } from "./kanban-settings";
import { CanvasBoard } from "./canvas-board";
import { CalendarBoard } from "./calendar-board";
import { WorkloadBoard } from "./workload-board";
import { ReportBoard } from "./report-board";
import { CreateTaskModal } from "./create-task-modal";
import { QuickTaskModal } from "./quick-task-modal";
import { KnowledgeDrawer } from "./knowledge-drawer";
import { TaskDetailDrawer, StatusBadge, PriorityBadge } from "./task-detail-drawer";
import { AssigneeStack } from "./assignee-avatar";
import { apiFetch } from "@/lib/api";
import { applyTaskTransition } from "./task-actions";
import { OverviewDashboard } from "./overview-dashboard";
import { arrangeMySubtasks, loadMySubView, DEFAULT_MYSUB_VIEW, type MySubView } from "./my-subtasks-view";
import { DEFAULT_THEME, mergeTheme, type OverviewTheme } from "./overview-customizer";
import { type MetricDef } from "./metrics";
import { taskTypeLabel } from "./use-options";
import { useCreativeStatuses, transitionsFrom, isTerminal } from "./use-statuses";
import {
  PRIORITY_RANK, PRIORITY_META, priorityLabel, isOverdue,
  listTasks, deleteTask, updateTask,
  listCampaigns, listBrands, listMySubtasks,
  type CreativeTask, type CreativeStatus, type CreativePriority,
  type Campaign, type BrandOption, type MySubtask,
} from "./data";

// ============================================================
// Table columns + views
// ============================================================
type Tfn = (th: string, en: string) => string;
function makeColumns(t: Tfn): ColumnDef<CreativeTask>[] { return [
  { accessorKey: "task_no", header: t("เลขที่งาน", "Task no."), size: 140, cell: ({ getValue }) => <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-medium">{(getValue() as string) || "—"}</span> },
  {
    accessorKey: "title", header: t("ชื่องาน", "Title"),
    cell: ({ row }) => {
      const cover = row.original.cover_image_r2_key ? `/api/r2-image?key=${encodeURIComponent(row.original.cover_image_r2_key)}` : null;
      return (
        <div className="flex items-center gap-2 min-w-0">
          <HoverImage url={cover} size={34} previewSize={320} rounded="rounded-md" fallback="🎨" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-800 line-clamp-1">{row.original.title}</div>
            <div className="text-xs text-slate-400 line-clamp-1">
              {row.original.task_type && <span>{taskTypeLabel(row.original.task_type)}</span>}
              {row.original.sku_code && <span> · 📦 {row.original.sku_code}</span>}
            </div>
          </div>
        </div>
      );
    },
  },
  { accessorKey: "brand_label", header: t("แบรนด์", "Brand"), size: 120, meta: { filterable: true }, cell: ({ row }) => row.original.brand_label ? <span className="inline-flex items-center gap-1.5 text-sm text-slate-700"><span className="h-2.5 w-2.5 rounded-full" style={{ background: row.original.brand_color || "#cbd5e1" }} />{row.original.brand_label}</span> : <span className="text-slate-300">—</span> },
  { accessorKey: "assignee_label", header: t("ผู้รับผิดชอบ", "Assignee"), size: 150, meta: { filterable: true }, cell: ({ row }) => { const a = row.original.assignees; return a && a.length ? <AssigneeStack list={a} /> : ((row.original.assignee_label as string) || <span className="text-slate-300">—</span>); } },
  { accessorKey: "priority", header: t("ความสำคัญ", "Priority"), size: 100, cell: ({ getValue }) => <PriorityBadge priority={getValue() as CreativePriority} /> },
  { accessorKey: "status", header: t("สถานะ", "Status"), size: 120, cell: ({ getValue }) => <StatusBadge status={getValue() as CreativeStatus} /> },
  { accessorKey: "progress_percent", header: t("คืบหน้า", "Progress"), size: 90, cell: ({ getValue }) => { const v = (getValue() as number) ?? 0; return <div className="flex items-center gap-1.5"><div className="h-1.5 w-12 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400" style={{ width: `${v}%` }} /></div><span className="text-[11px] text-slate-400">{v}%</span></div>; } },
  { accessorKey: "due_date", header: t("กำหนดส่ง", "Due date"), size: 110, cell: ({ row }) => { const row0 = row.original; if (!row0.due_date) return <span className="text-xs text-slate-400">—</span>; const od = isOverdue(row0); return <span className={`text-xs ${od ? "text-red-600 font-semibold" : "text-slate-500"}`}>{od && "⚠ "}{row0.due_date}</span>; } },
]; }

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
  const { user, can } = useAuth();
  const t = useT();
  const COLUMNS = useMemo(() => makeColumns(t), [t]);
  const { statuses } = useCreativeStatuses();
  const [view, setView] = useState<"overview" | "queue" | "calendar" | "workload" | "report" | "kanban" | "canvas">("overview");
  const [ovFilter, setOvFilter] = useState<"all" | "mine" | "review" | "overdue">("all"); // ตัวกรองตารางในภาพรวม (จากการ์ด)
  const [ovTheme, setOvTheme] = useState<OverviewTheme>(DEFAULT_THEME); // ธีมหน้าภาพรวม "ของฉัน" (per-user)
  const [ovMetrics, setOvMetrics] = useState<MetricDef[]>([]); // การ์ดเมตริกของฉัน (per-user)
  const [mySubView, setMySubView] = useState<MySubView>(DEFAULT_MYSUB_VIEW); // จัดกลุ่ม/เรียงงานย่อยของฉัน (admin ตั้งกลาง)
  useEffect(() => { loadMySubView().then(setMySubView).catch(() => {}); }, []);

  // create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);   // งานด่วน (Quick Task)
  // คลังความรู้
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);

  // detail drawer
  const [detailId, setDetailId] = useState<string | null>(null);


  // toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  // โหลดข้อมูลแบบ stale-while-revalidate (ของกลาง) — กลับเข้าหน้านี้ใหม่ = โชว์ทันที แล้วอัปเดตเงียบ
  // poll ทุก 20 วิ (เฉพาะตอนเปิดแท็บ) → งานที่คนอื่น/เครื่องอื่นแก้ อัปเดตเองไม่ต้อง refresh
  const tasksSWR = useSWRLite("creative:tasks:all", () => listTasks({ sort_by: "updated_at", sort_dir: "desc" }), { refreshMs: 20000 });
  const mineSWR = useSWRLite("creative:tasks:mine", () => listTasks({ mine: true }), { refreshMs: 20000 });
  const subsSWR = useSWRLite("creative:my-subtasks", () => listMySubtasks(), { refreshMs: 20000 });
  const brandsSWR = useSWRLite("creative:brands", () => listBrands());
  const campaignsSWR = useSWRLite("creative:campaigns", () => listCampaigns());
  const tasks = useMemo(() => tasksSWR.data ?? [], [tasksSWR.data]);
  const myTasks = useMemo(() => mineSWR.data ?? [], [mineSWR.data]);
  const mySubs = useMemo(() => subsSWR.data ?? [], [subsSWR.data]);
  const brands = useMemo(() => brandsSWR.data ?? [], [brandsSWR.data]);
  const campaigns = useMemo(() => campaignsSWR.data ?? [], [campaignsSWR.data]);
  const loading = tasksSWR.loading; // โชว์ skeleton เฉพาะตอนยังไม่เคยมีข้อมูลจริง

  // เปิด drawer งานอัตโนมัติจากลิงก์ /tasks?task=<id> (เช่นกดมาจากการ์ดบน Canvas)
  // และรองรับ /tasks?view=table|queue|kanban|canvas|overview (เช่นลิงก์ "งานทั้งหมด" จากหน้าแคมเปญ)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const tid = sp.get("task"); if (tid) setDetailId(tid);
    const v = sp.get("view");
    if (v === "queue" || v === "calendar" || v === "workload" || v === "report" || v === "kanban" || v === "canvas" || v === "overview") setView(v);
    else if (v === "table") setView("overview");   // แท็บตารางถูกรวมเข้าภาพรวมแล้ว → ลิงก์เดิมมาที่ภาพรวม
  }, []);

  // เรียลไทม์ (ของกลาง Supabase broadcast — ไม่แตะ RLS ตารางงาน): มีคนแก้ → ทุกจอ revalidate เอง ไม่ต้อง refresh
  const chRef = useRef<ReturnType<typeof supabaseBrowser.channel> | null>(null);
  const revalidateAll = useCallback(() => { void tasksSWR.revalidate(true); void mineSWR.revalidate(true); void subsSWR.revalidate(true); }, [tasksSWR, mineSWR, subsSWR]);
  useEffect(() => {
    const ch = supabaseBrowser.channel("creative-board", { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "changed" }, () => revalidateAll()).subscribe();
    chRef.current = ch;
    return () => { try { supabaseBrowser.removeChannel(ch); } catch { /* noop */ } chRef.current = null; };
  }, [revalidateAll]);

  // หลังบันทึก/ลบ → โหลดงานใหม่ + กระจาย broadcast ให้จออื่นอัปเดตทันที
  const reload = useCallback(async () => {
    await Promise.all([tasksSWR.revalidate(true), mineSWR.revalidate(true), subsSWR.revalidate(true)]);
    try { chRef.current?.send({ type: "broadcast", event: "changed", payload: {} }); } catch { /* noop */ }
  }, [tasksSWR, mineSWR, subsSWR]);

  // ธีมหน้าภาพรวม "ของฉัน" — มีธีมส่วนตัวใช้เลย · ไม่มี → ใช้ธีมเริ่มต้นของทีม (ถ้าแอดมินตั้งไว้)
  useEffect(() => {
    (async () => {
      try {
        const j = await apiFetch("/api/user-prefs?key=tasks_overview_theme").then((r) => r.json());
        if (j && !j.error && j.value && Object.keys(j.value).length > 0) { setOvTheme(mergeTheme(j.value)); return; }
        const tj = await apiFetch("/api/ui-config?key=tasks_overview_theme_default").then((r) => r.json());
        if (tj && !tj.error && tj.value && Object.keys(tj.value).length > 0) setOvTheme(mergeTheme(tj.value));
      } catch { /* ใช้ค่าเริ่มต้น */ }
    })();
  }, []);
  // sweep แจ้งเตือน "ใกล้/เกินกำหนด" ให้ผู้รับผิดชอบ (lazy ตอนเปิดหน้า, กันซ้ำวันละครั้ง) — fire-and-forget
  useEffect(() => { void apiFetch("/api/creative-tasks/reminders").catch(() => {}); }, []);
  const saveTheme = useCallback((th: OverviewTheme) => {
    setOvTheme(th);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "tasks_overview_theme", value: th }) });
  }, []);
  // การ์ดเมตริกของฉัน — โหลดครั้งเดียว + บันทึกเมื่อแก้
  useEffect(() => { apiFetch("/api/user-prefs?key=tasks_metric_cards").then((r) => r.json()).then((j) => { if (j && !j.error && Array.isArray(j.value)) setOvMetrics(j.value); }).catch(() => {}); }, []);
  const saveMetrics = useCallback((list: MetricDef[]) => {
    setOvMetrics(list);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "tasks_metric_cards", value: list }) });
  }, []);

  // "รอตรวจ" = จำนวนงานย่อยที่ส่งมาในคิว (ไม่ใช่งานสถานะ need_review) — ให้ตรงกับตารางคิว
  const [reviewPending, setReviewPending] = useState<number | null>(null);
  useEffect(() => { void apiFetch("/api/creative-tasks/review-queue?count=1").then((r) => r.json()).then((j) => { if (typeof j.pending === "number") setReviewPending(j.pending); }).catch(() => {}); }, [tasks]);
  const counts = useMemo(() => ({
    total: tasks.length,
    mine: myTasks.length,
    overdue: tasks.filter(isOverdue).length,
    review: reviewPending ?? tasks.filter((tk) => tk.status === "need_review").length,
  }), [tasks, myTasks, reviewPending]);

  // ---- create ----
  const openCreate = () => setCreateOpen(true);

  // ---- workflow (เส้นทาง + ชนิด อ่านจาก DB) — ใช้ของกลาง applyTaskTransition ----
  const applyMove = useCallback(async (task: CreativeTask, toKey: string, force?: boolean) => {
    const ok = await applyTaskTransition(task, toKey, { pushToast, force });
    if (ok) await reload();
  }, [pushToast, reload]);

  const onDelete = async (id: string) => { try { await deleteTask(id); pushToast("info", t("ลบงานแล้ว", "Task deleted")); setDetailId(null); await reload(); } catch (e) { pushToast("error", (e as Error).message); } };

  return (
    <StandaloneShell title={t("งาน Creative (Task Manager)", "Creative Tasks")} icon="🎨" accent="violet">
      {/* Header */}
      {/* แถบหัว — ซ่อนทั้งแถบบนหน้าภาพรวม (ปุ่มทั้งหมดมีใน Hero + ทางลัด ของภาพรวมแล้ว) */}
      {view !== "overview" && (
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
            <button onClick={() => setKnowledgeOpen(true)} className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">📚 {t("ความรู้", "Knowledge")}</button>
            {user?.role === "admin" && <a href="/tasks/settings" className="h-10 px-3 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50" title={t("ตั้งค่าสิทธิ์", "Settings")}>⚙️</a>}
            <button onClick={() => setQuickOpen(true)} className="h-10 px-4 text-amber-700 bg-amber-50 border border-amber-200 text-sm font-medium rounded-lg hover:bg-amber-100 transition-colors">⚡ {t("งานด่วน", "Quick task")}</button>
            <button onClick={openCreate} className="h-10 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors">＋ {t("สร้างงาน", "New task")}</button>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <StatChip label={t("งานทั้งหมด", "All tasks")} value={counts.total} onClick={() => { setOvFilter("all"); setView("overview"); }} />
          <StatChip label={t("งานของฉัน", "My tasks")} value={counts.mine} tone="violet" onClick={() => setView("queue")} active={view === "queue"} />
          <StatChip label={t("รอตรวจ", "In review")} value={counts.review} tone="amber" onClick={() => { setOvFilter("review"); setView("overview"); }} />
          <StatChip label={t("เกินกำหนด", "Overdue")} value={counts.overdue} tone="red" onClick={() => { setOvFilter("overdue"); setView("overview"); }} />
        </div>
      </div>
      )}

      <div className="px-8 py-6 space-y-5">
        {/* เมนูมุมมอง — บนภาพรวมย้ายเข้า Hero แล้ว (ส่งเป็น viewSwitcher) · มุมมองอื่นโชว์ตรงนี้ */}
        {view !== "overview" && <ViewSwitcher view={view} setView={setView} t={t} />}

        {loading ? (
          <div className="py-20 text-center text-slate-400">{t("กำลังโหลดข้อมูล...", "Loading data...")}</div>
        ) : (
          <>
            {view === "overview" && (
              <OverviewDashboard
                userName={user?.name}
                userId={user?.id ?? null}
                counts={counts}
                myTasks={myTasks}
                mySubs={mySubs}
                campaigns={campaigns}
                tasks={tasks}
                brands={brands}
                columns={COLUMNS}
                filter={ovFilter}
                onFilter={setOvFilter}
                theme={ovTheme}
                canUpload={can("files.upload")}
                onThemeChange={saveTheme}
                statuses={statuses}
                viewSwitcher={<ViewSwitcher view={view} setView={setView} t={t} onHero />}
                onMoveStatus={(taskId, to) => { const found = tasks.find((x) => x.id === taskId); if (found) applyMove(found, to); }}
                onSetField={async (taskId, field, value) => { try { await updateTask(taskId, { [field]: value }); await reload(); } catch (e) { pushToast("error", (e as Error).message); } }}
                isAdmin={user?.role === "admin"}
                onOpenTask={(id) => setDetailId(id)}
                onCreate={openCreate}
                onQuickCreate={() => setQuickOpen(true)}
                onOpenKnowledge={() => setKnowledgeOpen(true)}
                onChanged={reload}
                metrics={ovMetrics}
                onMetricsChange={saveMetrics}
                mySubView={mySubView}
              />
            )}

            {view === "queue" && <QueueView tasks={myTasks} subtasks={mySubs} mySubView={mySubView} onOpen={(id) => setDetailId(id)} onMove={applyMove} onCreate={openCreate} />}

            {view === "calendar" && (
              <div>
                <p className="text-xs text-slate-400 mb-2">💡 {t("งานเรียงตามกำหนดส่ง · คลิกงานเพื่อดูรายละเอียด", "Tasks by due date · click a task to view details")}</p>
                <CalendarBoard tasks={tasks} onCardClick={(id) => setDetailId(id)} />
              </div>
            )}

            {view === "workload" && <WorkloadBoard tasks={tasks} onCardClick={(id) => setDetailId(id)} />}

            {view === "report" && <ReportBoard tasks={tasks} />}

            {view === "kanban" && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs text-slate-400">💡 {t("ลากการ์ดข้ามคอลัมน์เพื่อเปลี่ยนสถานะ · คลิกการ์ดเพื่อดูรายละเอียด · ปรับการ์ด/จัดกลุ่มที่ ⚙️", "Drag cards across columns · click to view · adjust via ⚙️")}</p>
                  <KanbanSettings cfg={ovTheme.kanban} onChange={(k) => saveTheme({ ...ovTheme, kanban: k })} accent={ovTheme.accent} />
                </div>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <OverviewKanban tasks={tasks} statuses={statuses} brands={brands} cfg={ovTheme.kanban} accent={ovTheme.accent}
                    onMoveStatus={(taskId, to) => { const found = tasks.find((x) => x.id === taskId); if (found) applyMove(found, to); }}
                    onSetField={async (taskId, field, value) => { try { await updateTask(taskId, { [field]: value }); await reload(); } catch (e) { pushToast("error", (e as Error).message); } }}
                    onCardClick={(id) => setDetailId(id)} />
                </div>
              </div>
            )}

            {view === "canvas" && (
              <div>
                <p className="text-xs text-slate-400 mb-2">💡 {t("ลากการ์ดอิสระ · ปล่อยในโซนสถานะเพื่อเปลี่ยนสถานะ · วาดกล่อง/โน้ต/ลูกศร/วางรูปได้ · ดับเบิลคลิกการ์ด = ดูรายละเอียด", "Drag cards freely · drop into a status zone to change status · draw boxes/notes/arrows/images · double-click a card to view details")}</p>
                <CanvasBoard tasks={tasks} statuses={statuses} startMaximized onAddTask={openCreate} onCardClick={(id) => setDetailId(id)} onMove={(taskId, to, force) => { const found = tasks.find((x) => x.id === taskId); if (found) applyMove(found, to, force); }} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Create modal (ของกลาง — ใช้ร่วมกับ Campaign Canvas) */}
      <CreateTaskModal open={createOpen} onClose={() => setCreateOpen(false)} pushToast={pushToast}
        onCreated={async (newTask) => { pushToast("success", `${t("สร้างงาน", "Task created")} ${newTask.task_no}`); await reload(); }} />

      <QuickTaskModal open={quickOpen} onClose={() => setQuickOpen(false)} pushToast={pushToast}
        me={user ? ({ id: user.id, name: user.name } as UserPickerValue) : null}
        onCreated={async () => { await reload(); }} />

      {/* Detail drawer */}
      {detailId && (
        <TaskDetailDrawer
          taskId={detailId} brands={brands} campaigns={campaigns}
          onClose={() => setDetailId(null)} onChanged={reload}
          onMove={applyMove} onDelete={onDelete} pushToast={pushToast}
        />
      )}

      {/* คลังความรู้ — แก้ไขได้ (ของกลางในโมดูล) */}
      {knowledgeOpen && <KnowledgeDrawer onClose={() => setKnowledgeOpen(false)} canEdit={user?.role === "admin" || user?.role === "manager"} pushToast={pushToast} />}

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </StandaloneShell>
  );
}

function ViewToggleBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return <button onClick={onClick} className={`h-8 px-3 rounded-md text-sm font-medium transition-colors ${active ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{icon} {label}</button>;
}
function StatChip({ label, value, tone = "slate", onClick, active }: { label: string; value: number; tone?: "slate" | "violet" | "red" | "amber"; onClick?: () => void; active?: boolean }) {
  const cls = { slate: "bg-slate-50 text-slate-700 border-slate-200", violet: "bg-violet-50 text-violet-700 border-violet-200", red: "bg-red-50 text-red-700 border-red-200", amber: "bg-amber-50 text-amber-700 border-amber-200" }[tone];
  return <button onClick={onClick} className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${cls} ${active ? "ring-2 ring-violet-400" : "hover:brightness-95"}`}><span className="font-bold">{value}</span> <span className="opacity-70">{label}</span></button>;
}

// เมนูเลือกมุมมอง (☰ ดรอปดาวน์) — โชว์ในแถบบน (มุมมองอื่น) หรือฝังใน Hero (onHero) ของหน้าภาพรวม
function ViewSwitcher({ view, setView, t, onHero }: {
  view: string;
  setView: (v: "overview" | "queue" | "calendar" | "workload" | "report" | "kanban" | "canvas") => void;
  t: Tfn;
  onHero?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const VIEWS = [
    { k: "overview", icon: "🏠", label: t("ภาพรวม", "Overview") },
    { k: "queue", icon: "🙋", label: t("คิวงานของฉัน", "My queue") },
    { k: "calendar", icon: "📅", label: t("ปฏิทิน", "Calendar") },
    { k: "workload", icon: "👥", label: t("ภาระงาน", "Workload") },
    { k: "report", icon: "📊", label: t("รายงาน", "Report") },
    { k: "kanban", icon: "🟦", label: "Kanban" },
    { k: "canvas", icon: "🟪", label: "Canvas" },
  ] as const;
  const cur = VIEWS.find((v) => v.k === view) ?? VIEWS[0];
  const btnCls = onHero
    ? "inline-flex items-center gap-2 h-9 px-3.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm font-semibold backdrop-blur-sm"
    : "inline-flex items-center gap-2 h-9 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold";
  return (
    <div className="relative w-fit">
      <button onClick={() => setOpen((o) => !o)} className={btnCls}>
        <span>≡</span><span>{cur.icon} {cur.label}</span><span className={onHero ? "text-white/70" : "text-slate-400"}>▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
            {VIEWS.map((v) => (
              <button key={v.k} onClick={() => { setView(v.k); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${view === v.k ? "bg-violet-50 text-violet-700 font-medium" : "text-slate-700 hover:bg-slate-50"}`}>
                <span>{v.icon}</span>{v.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// Queue View — หน้าพนักงาน ปุ่มใหญ่ งานตัวเองเด่น
// ============================================================
// สี/ป้ายสถานะงานย่อย (ให้ตรงกับ SUB_STEPS ในงานย่อย)
const SUB_STATUS_LABEL: Record<string, string> = { todo: "ยังไม่เริ่ม", in_progress: "กำลังทำ", submitted: "รออนุมัติ", approved: "อนุมัติแล้ว", doing: "กำลังทำ", done: "อนุมัติแล้ว", posted: "อนุมัติแล้ว" };
const SUB_STATUS_DOT: Record<string, string> = { todo: "bg-slate-400", in_progress: "bg-blue-500", submitted: "bg-amber-500", approved: "bg-emerald-500", doing: "bg-blue-500", done: "bg-emerald-500", posted: "bg-emerald-500" };

function QueueView({ tasks, subtasks, mySubView, onOpen, onMove, onCreate }: {
  tasks: CreativeTask[]; subtasks: MySubtask[]; mySubView: MySubView; onOpen: (id: string) => void; onMove: (t: CreativeTask, toKey: string) => void; onCreate: () => void;
}) {
  const t = useT();
  const ordered = useMemo(() => [...tasks].filter((t) => !isTerminal(t.status)).sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (pr !== 0) return pr;
    return (a.due_date || "9999").localeCompare(b.due_date || "9999");
  }), [tasks]);

  if (ordered.length === 0 && subtasks.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="text-4xl mb-3">🎉</div>
        <p className="text-slate-600 font-medium">{t("ไม่มีงานค้างในคิวของคุณ", "Your queue is clear")}</p>
        <p className="text-slate-400 text-sm mt-1">{t("งาน/งานย่อยที่มอบหมายให้คุณจะแสดงที่นี่ เรียงตามความสำคัญและกำหนดส่ง", "Tasks and subtasks assigned to you will appear here, sorted by priority and due date")}</p>
        <button onClick={onCreate} className="mt-4 h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {t("สร้างงาน", "New task")}</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* งานย่อยของฉัน */}
      {subtasks.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-700 mb-2">🧩 {t("งานย่อยของฉัน", "My subtasks")} ({subtasks.length})</p>
          <div className="space-y-3">
            {arrangeMySubtasks(subtasks, mySubView).map((g) => (
              <div key={g.key}>
                {g.label && <p className="text-[11px] font-semibold text-slate-500 mb-1">{g.label} ({g.items.length})</p>}
                <div className="space-y-1.5">
                  {g.items.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 border border-slate-100 rounded-lg px-3 py-2 hover:border-violet-200 cursor-pointer" onClick={() => onOpen(s.task_id)} title={t("กดเพื่อเปิดงาน → เริ่ม/ส่งงาน", "Click to open task → start / submit")}>
                      <span className={`h-2 w-2 rounded-full shrink-0 ${SUB_STATUS_DOT[s.status] ?? "bg-slate-400"}`} title={SUB_STATUS_LABEL[s.status] ?? t("ยังไม่เริ่ม", "Not started")} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-slate-700">{s.title}</span>
                        <span className="ml-2 text-[10px] text-slate-400">{SUB_STATUS_LABEL[s.status] ?? t("ยังไม่เริ่ม", "Not started")}</span>
                        {s.priority && s.priority !== "normal" && <span className="ml-2 text-[10px] text-slate-400">· {priorityLabel(s.priority as CreativePriority)}</span>}
                        {s.required_before_next && <span className="ml-2 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1">{t("ต้องเสร็จก่อน", "Must complete first")}</span>}
                        <div className="text-xs text-slate-400 truncate">↳ {s.task_no ? <span className="font-mono">{s.task_no}</span> : null} {s.task_title}</div>
                      </div>
                      {s.due_date && <span className="text-xs text-slate-400 shrink-0">{s.due_date}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ordered.length > 0 && <p className="text-sm text-slate-500">{t("งานที่ต้องทำตอนนี้ · เรียงตามความสำคัญ + กำหนดส่ง", "Tasks to do now · sorted by priority + due date")} ({ordered.length})</p>}
      {ordered.map((task, i) => {
        const od = isOverdue(task);
        const actions = transitionsFrom(task.status);
        return (
          <div key={task.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-violet-300 transition-colors">
            <div className="flex items-start gap-4">
              <div className="h-9 w-9 rounded-full bg-violet-50 text-violet-700 font-bold flex items-center justify-center shrink-0">{i + 1}</div>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpen(task.id)}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <PriorityBadge priority={task.priority} />
                  <StatusBadge status={task.status} />
                  {task.task_type && <span className="text-xs text-slate-400">{taskTypeLabel(task.task_type)}</span>}
                </div>
                <p className="text-base font-semibold text-slate-800 leading-snug">{task.title}</p>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                  <span className="font-mono">{task.task_no}</span>
                  {task.brand_label && <span>· {task.brand_label}</span>}
                  {task.sku_code && <span>· 📦 {task.sku_code}</span>}
                  {task.due_date && <span className={od ? "text-red-600 font-semibold" : ""}>· {od ? `⚠ ${t("เกินกำหนด", "Overdue")} ` : `${t("ส่ง", "Due")} `}{task.due_date}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap pl-13">
              {actions.map((a) => (
                <button key={a.to_key} onClick={() => onMove(task, a.to_key)} className="h-9 px-4 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700">{a.label}</button>
              ))}
              <button onClick={() => onOpen(task.id)} className="h-9 px-4 text-sm font-medium rounded-lg text-slate-600 border border-slate-200 hover:bg-slate-50">📂 {t("เปิดงาน", "Open task")}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

