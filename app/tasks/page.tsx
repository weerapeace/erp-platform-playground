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
import { DataTable } from "@/components/data-table";
import { ERPModal } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { UserPicker, ProductPicker } from "@/components/pickers";
import type { UserPickerValue, ProductPickerValue } from "@/components/pickers";
import type { ColumnDef } from "@tanstack/react-table";
import { KanbanBoard } from "./kanban-board";
import { CanvasBoard } from "./canvas-board";
import { useCreativeOptions, taskTypeLabel, platformLabel } from "./use-options";
import { useCreativeStatuses, statusMeta, transitionsFrom, transitionBetween, isTerminal } from "./use-statuses";
import {
  PRIORITY_META, APPROVAL_META, ASSET_META, PRIORITY_RANK,
  isOverdue, withinThisWeek,
  listTasks, getTask, createTask, transitionTask, approveTask, deleteTask,
  addSubtask, updateSubtask, deleteSubtask, addComment, addAttachment, deleteAttachment,
  listCampaigns, listBrands, listTemplates,
  type CreativeTask, type CreativeStatus, type CreativePriority, type TaskDetail,
  type Campaign, type BrandOption, type TaskTemplate, type CreativeSubtask,
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

const PRIORITY_OPTIONS = (Object.keys(PRIORITY_META) as CreativePriority[]).map((k) => ({ value: k, label: PRIORITY_META[k].label }));

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
// Create form
// ============================================================
type FormState = {
  title: string; description: string; task_type: string;
  brand_id: string; campaign_id: string;
  assignee: UserPickerValue | null; reviewer: UserPickerValue | null;
  priority: CreativePriority; due_date: string;
  product: ProductPickerValue | null; platforms: string[]; drive_folder_url: string;
};
const EMPTY_FORM: FormState = {
  title: "", description: "", task_type: "photo_shoot", brand_id: "", campaign_id: "",
  assignee: null, reviewer: null, priority: "normal", due_date: "", product: null, platforms: [], drive_folder_url: "",
};

// ============================================================
// Main page
// ============================================================
export default function TasksPage() {
  const { user } = useAuth();
  const { taskTypes, platforms } = useCreativeOptions();
  const { statuses } = useCreativeStatuses();
  const [tasks, setTasks] = useState<CreativeTask[]>([]);
  const [myTasks, setMyTasks] = useState<CreativeTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"queue" | "table" | "kanban" | "canvas">("table");
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [tplId, setTplId] = useState("");

  // create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadAll(), loadMine()]);
      try { const [b, c, tp] = await Promise.all([listBrands(), listCampaigns(), listTemplates()]); setBrands(b); setCampaigns(c); setTemplates(tp); } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [loadAll, loadMine]);

  const reload = useCallback(async () => { await Promise.all([loadAll(), loadMine()]); }, [loadAll, loadMine]);

  const counts = useMemo(() => ({
    total: tasks.length,
    mine: myTasks.length,
    overdue: tasks.filter(isOverdue).length,
    review: tasks.filter((t) => t.status === "need_review").length,
  }), [tasks, myTasks]);

  // ---- create ----
  const openCreate = () => { setForm(EMPTY_FORM); setTplId(""); setFormErr(null); setDirty(false); setModalOpen(true); };
  const updateForm = (patch: Partial<FormState>) => { setForm((p) => ({ ...p, ...patch })); setDirty(true); };
  const applyTemplate = (id: string) => {
    setTplId(id);
    const t = templates.find((x) => x.id === id);
    if (t) updateForm({ task_type: t.task_type ?? form.task_type, priority: (t.default_priority as CreativePriority) ?? form.priority, platforms: t.platforms ?? [], brand_id: t.brand_id ?? form.brand_id });
  };
  const togglePlatform = (v: string) => updateForm({ platforms: form.platforms.includes(v) ? form.platforms.filter((x) => x !== v) : [...form.platforms, v] });

  const save = async () => {
    if (!form.title.trim()) { setFormErr("กรุณากรอกชื่องาน"); return; }
    setSaving(true); setFormErr(null);
    const tpl = templates.find((t) => t.id === tplId);
    const subtasks = tpl?.steps?.filter((s) => s.title?.trim()).map((s) => ({ title: s.title, description: s.description ?? null, assignee_ids: s.assignee_ids ?? [], required_before_next: !!s.required_before_next })) ?? [];
    try {
      const { task_no } = await createTask({
        title: form.title.trim(), description: form.description.trim() || null, task_type: form.task_type || null,
        brand_id: form.brand_id || null, campaign_id: form.campaign_id || null,
        assignee_id: form.assignee?.id ?? null, reviewer_id: form.reviewer?.id ?? null,
        priority: form.priority, due_date: form.due_date || null,
        sku_id: form.product?.id ?? null, product_name: form.product?.name ?? null,
        platforms: form.platforms, drive_folder_url: form.drive_folder_url.trim() || null,
        subtasks,
      });
      setModalOpen(false); setDirty(false);
      pushToast("success", `สร้างงาน ${task_no} แล้ว`);
      await reload();
    } catch (e) { setFormErr((e as Error).message); }
    finally { setSaving(false); }
  };

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
    <StandaloneShell title="งาน Creative (Task Manager)" icon="🎨" accent="violet">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">งาน Creative</h1>
            <p className="text-slate-500 mt-1">ถ่ายรูป · แต่งรูป · Banner · Video · ลงสินค้า · Social — ตารางกลาง · Workflow · อนุมัติ</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href="/projects" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">🧠 Brainstorm</a>
            <a href="/tasks/campaigns" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">📣 แคมเปญ</a>
            <a href="/tasks/content" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">📱 คอนเทนต์</a>
            <a href="/tasks/templates" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">🔁 เทมเพลต</a>
            {user?.role === "admin" && <a href="/tasks/settings" className="h-10 px-3 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50" title="ตั้งค่าสิทธิ์">⚙️</a>}
            <button onClick={openCreate} className="h-10 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors">＋ สร้างงาน</button>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <StatChip label="งานทั้งหมด" value={counts.total} />
          <StatChip label="งานของฉัน" value={counts.mine} tone="violet" />
          <StatChip label="รอตรวจ" value={counts.review} tone="amber" />
          <StatChip label="เกินกำหนด" value={counts.overdue} tone="red" />
        </div>
      </div>

      <div className="px-8 py-6 space-y-5">
        {/* View toggle */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          <ViewToggleBtn active={view === "queue"} onClick={() => setView("queue")} icon="🙋" label="คิวงานของฉัน" />
          <ViewToggleBtn active={view === "table"} onClick={() => setView("table")} icon="📋" label="ตาราง" />
          <ViewToggleBtn active={view === "kanban"} onClick={() => setView("kanban")} icon="🟦" label="Kanban" />
          <ViewToggleBtn active={view === "canvas"} onClick={() => setView("canvas")} icon="🟪" label="Canvas" />
        </div>

        {loading ? (
          <div className="py-20 text-center text-slate-400">กำลังโหลดข้อมูล...</div>
        ) : (
          <>
            {view === "queue" && <QueueView tasks={myTasks} onOpen={(id) => setDetailId(id)} onMove={applyMove} onCreate={openCreate} />}

            {view === "table" && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <DataTable<CreativeTask>
                  data={tasks} columns={COLUMNS}
                  title={`รายการงาน (${tasks.length})`}
                  description="คลิกที่งานเพื่อดูรายละเอียด · ตารางกลางตัวเดียวกับทุกโมดูล"
                  emptyMessage="ยังไม่มีงาน — กดปุ่ม สร้างงาน"
                  searchPlaceholder="ค้นหา เลขที่ / ชื่องาน / ผู้รับผิดชอบ..."
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

      {/* Create modal */}
      <ERPModal
        open={modalOpen} onClose={() => setModalOpen(false)} title="สร้างงานใหม่"
        description="ผู้รับผิดชอบ + สินค้า ใช้ Picker กลาง (ดึงข้อมูลจริง)" size="lg" hasUnsavedChanges={dirty}
        footer={<>
          <button onClick={() => setModalOpen(false)} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "สร้างงาน"}</button>
        </>}
      >
        {formErr && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {formErr}</div>}
        {templates.length > 0 && (
          <div className="mb-4 flex items-center gap-2 bg-violet-50/60 border border-violet-100 rounded-lg px-3 py-2">
            <span className="text-sm text-slate-600 shrink-0">🔁 เริ่มจากเทมเพลต:</span>
            <select value={tplId} onChange={(e) => applyTemplate(e.target.value)} className="flex-1 h-8 border border-slate-200 rounded-md px-2 text-sm bg-white">
              <option value="">— ไม่ใช้เทมเพลต —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.steps?.length ?? 0} ขั้นตอน)</option>)}
            </select>
          </div>
        )}
        <ERPFormSection title="ข้อมูลงาน" columns={2}>
          <ERPFormField label="ชื่องาน" required span={2}><ERPInput value={form.title} onChange={(e) => updateForm({ title: e.target.value })} placeholder="เช่น ถ่ายรูปกระเป๋า Summer 8 สี" /></ERPFormField>
          <ERPFormField label="ประเภทงาน"><ERPSelect value={form.task_type} options={taskTypes} onChange={(e) => updateForm({ task_type: e.target.value })} /></ERPFormField>
          <ERPFormField label="ความสำคัญ"><ERPSelect value={form.priority} options={PRIORITY_OPTIONS} onChange={(e) => updateForm({ priority: e.target.value as CreativePriority })} /></ERPFormField>
          <ERPFormField label="แบรนด์"><ERPSelect value={form.brand_id} options={[{ value: "", label: "— ไม่ระบุ —" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => updateForm({ brand_id: e.target.value })} /></ERPFormField>
          <ERPFormField label="แคมเปญ"><ERPSelect value={form.campaign_id} options={[{ value: "", label: "— ไม่ระบุ —" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => updateForm({ campaign_id: e.target.value })} /></ERPFormField>
          <ERPFormField label="ผู้รับผิดชอบ"><UserPicker value={form.assignee} onChange={(v) => updateForm({ assignee: v })} disableCreate /></ERPFormField>
          <ERPFormField label="ผู้ตรวจ/อนุมัติ"><UserPicker value={form.reviewer} onChange={(v) => updateForm({ reviewer: v })} disableCreate /></ERPFormField>
          <ERPFormField label="กำหนดส่ง"><ERPInput type="date" value={form.due_date} onChange={(e) => updateForm({ due_date: e.target.value })} /></ERPFormField>
          <ERPFormField label="โฟลเดอร์ Drive (ลิงก์)"><ERPInput value={form.drive_folder_url} onChange={(e) => updateForm({ drive_folder_url: e.target.value })} placeholder="https://drive.google.com/..." /></ERPFormField>
          <ERPFormField label="สินค้า/SKU (ถ้ามี)" span={2}><ProductPicker value={form.product} onChange={(v) => updateForm({ product: v })} disableCreate /></ERPFormField>
          <ERPFormField label="แพลตฟอร์ม" span={2}>
            <div className="flex flex-wrap gap-1.5">
              {platforms.map((p) => <button key={p.value} type="button" onClick={() => togglePlatform(p.value)} className={`px-2.5 py-1 rounded-full text-xs border ${form.platforms.includes(p.value) ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>{p.label}</button>)}
            </div>
          </ERPFormField>
          <ERPFormField label="รายละเอียด" span={2}><ERPTextarea value={form.description} rows={2} onChange={(e) => updateForm({ description: e.target.value })} placeholder="อธิบายงาน/บรีฟเพิ่มเติม" /></ERPFormField>
        </ERPFormSection>
      </ERPModal>

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
function QueueView({ tasks, onOpen, onMove, onCreate }: {
  tasks: CreativeTask[]; onOpen: (id: string) => void; onMove: (t: CreativeTask, toKey: string) => void; onCreate: () => void;
}) {
  const ordered = useMemo(() => [...tasks].filter((t) => !isTerminal(t.status)).sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (pr !== 0) return pr;
    return (a.due_date || "9999").localeCompare(b.due_date || "9999");
  }), [tasks]);

  if (ordered.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="text-4xl mb-3">🎉</div>
        <p className="text-slate-600 font-medium">ไม่มีงานค้างในคิวของคุณ</p>
        <p className="text-slate-400 text-sm mt-1">งานที่มอบหมายให้คุณจะแสดงที่นี่ เรียงตามความสำคัญและกำหนดส่ง</p>
        <button onClick={onCreate} className="mt-4 h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ สร้างงาน</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">งานที่ต้องทำตอนนี้ · เรียงตามความสำคัญ + กำหนดส่ง ({ordered.length})</p>
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

// ฟอร์มเพิ่มงานย่อย (รวยเหมือนเทมเพลต — ชื่อ + รายละเอียด + ผู้รับผิดชอบหลายคน)
function AddSubtaskForm({ onAdd, pushToast }: { onAdd: (body: { title: string; description?: string | null; assignee_ids?: string[] }) => Promise<void>; pushToast: (type: Toast["type"], m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignees, setAssignees] = useState<{ id: string; label: string }[]>([]);
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try { await onAdd({ title: title.trim(), description: desc.trim() || null, assignee_ids: assignees.map((a) => a.id) }); setTitle(""); setDesc(""); setAssignees([]); setOpen(false); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setBusy(false); }
  };
  if (!open) return <button onClick={() => setOpen(true)} className="mt-2 text-sm text-violet-700 hover:underline">＋ เพิ่มงานย่อย</button>;
  return (
    <div className="mt-2 border border-violet-200 rounded-lg p-3 space-y-2 bg-violet-50/30">
      <ERPInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่องานย่อย" />
      <ERPTextarea value={desc} rows={2} onChange={(e) => setDesc(e.target.value)} placeholder="รายละเอียด (ไม่บังคับ)" />
      <div>
        <p className="text-[11px] text-slate-400 mb-1">ผู้รับผิดชอบ (เลือกได้หลายคน)</p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{a.label}<button onClick={() => setAssignees((xs) => xs.filter((x) => x.id !== a.id))} className="text-slate-400 hover:text-red-500">✕</button></span>)}
        </div>
        <UserPicker value={adding} onChange={(v) => { if (v && !assignees.some((a) => a.id === v.id)) setAssignees((xs) => [...xs, { id: v.id, label: v.name }]); setAdding(null); }} disableCreate />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
        <button onClick={submit} disabled={busy} className="h-8 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{busy ? "..." : "เพิ่ม"}</button>
      </div>
    </div>
  );
}

// การ์ดงานย่อย — รายละเอียด + ผู้รับผิดชอบหลายคน (m2m) + ไฟล์แนบ
function SubtaskCard({ sub, taskId, reload, pushToast }: { sub: CreativeSubtask; taskId: string; reload: () => Promise<void>; pushToast: (type: Toast["type"], m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState(sub.description ?? "");
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const ids = sub.assignees.map((a) => a.id);

  const patch = async (p: Record<string, unknown>) => { try { await updateSubtask(taskId, sub.id, p); await reload(); } catch (e) { pushToast("error", (e as Error).message); } };
  const addAssignee = async (v: UserPickerValue | null) => { if (!v || ids.includes(v.id)) return; setAdding(null); await patch({ assignee_ids: [...ids, v.id] }); };
  const del = async () => { if (!window.confirm(`ลบงานย่อย "${sub.title}" ?`)) return; try { await deleteSubtask(taskId, sub.id); await reload(); } catch (e) { pushToast("error", (e as Error).message); } };
  const addLink = async () => { if (!linkUrl.trim()) return; try { await addAttachment(taskId, { kind: "drive_link", label: linkLabel.trim() || undefined, url: linkUrl.trim(), subtask_id: sub.id }); setLinkLabel(""); setLinkUrl(""); await reload(); } catch (e) { pushToast("error", (e as Error).message); } };

  return (
    <div className="border border-slate-200 rounded-lg">
      <div className="flex items-center gap-2 px-3 py-2">
        <input type="checkbox" checked={sub.status === "done"} onChange={() => patch({ status: sub.status === "done" ? "todo" : "done" })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />
        <button onClick={() => setOpen((o) => !o)} className={`text-sm flex-1 text-left ${sub.status === "done" ? "line-through text-slate-400" : "text-slate-700"}`}>{sub.title}</button>
        {sub.required_before_next && <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1">ต้องเสร็จก่อน</span>}
        <div className="flex -space-x-1">{sub.assignees.slice(0, 3).map((a) => <span key={a.id} title={a.label} className="h-5 w-5 rounded-full bg-violet-100 text-violet-700 text-[10px] flex items-center justify-center border border-white">{(a.label || "?").slice(0, 1)}</span>)}</div>
        {(sub.attachments?.length ?? 0) > 0 && <span className="text-[10px] text-slate-400">📎{sub.attachments!.length}</span>}
        <button onClick={() => setOpen((o) => !o)} className="text-slate-300 text-xs">{open ? "▲" : "▼"}</button>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-slate-100">
          <ERPTextarea value={desc} rows={2} onChange={(e) => setDesc(e.target.value)} onBlur={() => { if ((desc.trim() || null) !== (sub.description || null)) patch({ description: desc.trim() || null }); }} placeholder="รายละเอียดงานย่อย..." />
          <div>
            <p className="text-[11px] text-slate-400 mb-1">ผู้รับผิดชอบ (เลือกได้หลายคน)</p>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {sub.assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{a.label}<button onClick={() => patch({ assignee_ids: ids.filter((x) => x !== a.id) })} className="text-slate-400 hover:text-red-500">✕</button></span>)}
              {sub.assignees.length === 0 && <span className="text-xs text-slate-400">ยังไม่มี</span>}
            </div>
            <UserPicker value={adding} onChange={addAssignee} disableCreate />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-1">ไฟล์/ลิงก์ส่งงาน</p>
            <div className="space-y-1 mb-1.5">
              {(sub.attachments ?? []).map((a) => <div key={a.id} className="flex items-center gap-2 text-xs"><a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-violet-700 truncate flex-1">🔗 {a.label || a.url}</a><button onClick={async () => { try { await deleteAttachment(taskId, a.id); await reload(); } catch (e) { pushToast("error", (e as Error).message); } }} className="text-slate-300 hover:text-red-500">✕</button></div>)}
            </div>
            <div className="flex gap-1.5">
              <ERPInput value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="ชื่อ" />
              <ERPInput value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="วางลิงก์" />
              <button onClick={addLink} className="h-9 px-2 text-xs text-violet-700 border border-violet-200 rounded-lg shrink-0">แนบ</button>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={sub.required_before_next} onChange={(e) => patch({ required_before_next: e.target.checked })} />ต้องเสร็จก่อนขั้นถัดไป</label>
            <button onClick={del} className="text-xs text-red-500 hover:underline">ลบงานย่อย</button>
          </div>
        </div>
      )}
    </div>
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
