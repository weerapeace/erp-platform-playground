"use client";

/**
 * Admin Workflows — ใช้ DataTable กลาง (K2.2)
 *
 * 2 ตาราง: States + Transitions — แต่ละตารางมี search/column manager/sort/saved view
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PlaygroundShell } from "@/components/playground-shell";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { DataTable } from "@/components/data-table";
import { apiFetch } from "@/lib/api";
import type {
  WorkflowDefinition, WorkflowState, WorkflowTransition, WorkflowFull
} from "@/app/api/admin/workflows/route";

// ---- Color map ----

const COLOR_MAP: Record<string, string> = {
  slate:   "bg-slate-100 text-slate-700 border-slate-300",
  blue:    "bg-blue-50 text-blue-700 border-blue-300",
  amber:   "bg-amber-50 text-amber-700 border-amber-300",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-300",
  red:     "bg-red-50 text-red-700 border-red-300",
  purple:  "bg-purple-50 text-purple-700 border-purple-300",
};

const SIDE_EFFECT_OPTIONS: { v: string; label: string }[] = [
  { v: "assign_number",      label: "🔢 ออกเลขเอกสาร" },
  { v: "set_submitted_at",   label: "📤 บันทึกเวลาส่ง" },
  { v: "set_approved_at",    label: "✓ บันทึกเวลาอนุมัติ" },
  { v: "set_approver",       label: "👤 บันทึกผู้อนุมัติ" },
  { v: "set_reject_reason",  label: "✗ บันทึกเหตุผลปฏิเสธ" },
  { v: "notify_approvers",   label: "🔔 แจ้งผู้อนุมัติ" },
  { v: "notify_requester",   label: "🔔 แจ้งผู้ขอ" },
  { v: "reserve_stock",      label: "📌 จอง stock (SO)" },
  { v: "release_reservation",label: "↩️ ปลด stock reservation (SO)" },
  { v: "ship_stock_out",     label: "📦 ตัด stock OUT (SO)" },
];

// ============================================================
// Page
// ============================================================

export default function AdminWorkflowsPage() {
  const canView = usePermission("workflow.view");
  const canEdit = usePermission("admin.workflow");
  const { user } = useAuth();

  const [defs, setDefs]   = useState<WorkflowDefinition[]>([]);
  const [selected, setSelected] = useState<string>("pr");
  const [wf, setWf]       = useState<WorkflowFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // modals
  const [stateModal,      setStateModal]      = useState<WorkflowState | "new" | null>(null);
  const [transitionModal, setTransitionModal] = useState<WorkflowTransition | "new" | null>(null);
  const [deleteTarget,    setDeleteTarget]    = useState<{ kind: "state"|"transition"; id: string; label: string } | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const loadDefs = useCallback(async () => {
    const res = await apiFetch("/api/admin/workflows");
    const json = await res.json();
    if (!json.error) setDefs(json.data ?? []);
  }, []);

  const loadWf = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(`/api/admin/workflows?entity_type=${selected}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setWf(json.data);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, [selected]);

  useEffect(() => { if (canView) { loadDefs(); loadWf(); } }, [canView, loadDefs, loadWf]);

  const toggleActive = async () => {
    if (!wf) return;
    try {
      const res = await apiFetch("/api/admin/workflows", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "active", entity_type: wf.definition.entity_type, active: !wf.definition.active, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(wf.definition.active ? "ปิด workflow engine แล้ว (ใช้ fallback)" : "เปิด workflow engine แล้ว");
      await loadWf();
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
  };

  const remove = async (kind: "state"|"transition", id: string) => {
    try {
      const res = await apiFetch(`/api/admin/workflows?kind=${kind}&id=${id}&actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("ลบแล้ว");
      await loadWf();
    } catch (err) { setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ"); }
    finally { setDeleteTarget(null); }
  };

  // ============================================================
  // Columns: States
  // ============================================================
  const stateColumns = useMemo<ColumnDef<WorkflowState, unknown>[]>(() => [
    { id: "sort_order", accessorKey: "sort_order", header: "ลำดับ",
      meta: { group: "ข้อมูลหลัก", filterType: "number" },
      cell: ({ getValue }) => <span className="font-mono text-xs text-slate-500">{String(getValue() ?? "")}</span>,
    },
    { id: "state_key", accessorKey: "state_key", header: "Key",
      meta: { group: "ข้อมูลหลัก" },
      cell: ({ getValue }) => <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{String(getValue() ?? "")}</code>,
    },
    { id: "label", accessorKey: "label", header: "ป้ายแสดงผล",
      meta: { group: "ข้อมูลหลัก" },
    },
    { id: "color", accessorKey: "color", header: "สี",
      meta: { group: "การแสดงผล" },
      cell: ({ getValue }) => {
        const c = String(getValue() ?? "");
        return <span className={`inline-block text-xs px-2 py-0.5 rounded border ${COLOR_MAP[c]}`}>{c}</span>;
      },
    },
    { id: "is_terminal", accessorKey: "is_terminal", header: "Terminal",
      meta: { group: "การตั้งค่า", filterType: "select" },
      cell: ({ getValue }) => <span className="text-xs">{getValue() ? "✓ ใช่" : "—"}</span>,
    },
    { id: "lock_edit", accessorKey: "lock_edit", header: "Lock Edit",
      meta: { group: "การตั้งค่า", filterType: "select" },
      cell: ({ getValue }) => <span className="text-xs">{getValue() ? "🔒 ใช่" : "—"}</span>,
    },
  ], []);

  // ============================================================
  // Columns: Transitions
  // ============================================================
  const transitionColumns = useMemo<ColumnDef<WorkflowTransition, unknown>[]>(() => [
    { id: "label", accessorKey: "label", header: "Action",
      meta: { group: "ข้อมูลหลัก" },
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-slate-800">{row.original.label}</div>
          <code className="text-[10px] text-slate-400">{row.original.action_key}</code>
        </div>
      ),
    },
    { id: "transition_path", accessorKey: "from_state", header: "From → To",
      meta: { group: "ข้อมูลหลัก" },
      cell: ({ row }) => (
        <div className="text-xs">
          <code className="bg-slate-100 px-1.5 py-0.5 rounded">{row.original.from_state}</code>
          <span className="mx-2 text-slate-400">→</span>
          <code className="bg-slate-100 px-1.5 py-0.5 rounded">{row.original.to_state}</code>
        </div>
      ),
    },
    { id: "permission", accessorKey: "required_permission", header: "สิทธิ์",
      meta: { group: "สิทธิ์" },
      cell: ({ row }) => {
        const t = row.original;
        if (t.use_approval_rule) return <span className="text-xs text-purple-700">✋ Approval Rule</span>;
        if (t.required_permission) return <code className="text-xs text-slate-700">{t.required_permission}</code>;
        return <span className="text-xs text-slate-300">—</span>;
      },
    },
    { id: "require_reason", accessorKey: "require_reason", header: "เหตุผล",
      meta: { group: "การตั้งค่า", filterType: "select" },
      cell: ({ getValue }) => <span className="text-xs">{getValue() ? "✓ ต้องระบุ" : "—"}</span>,
    },
    { id: "side_effects", accessorKey: "side_effects", header: "Side Effects",
      meta: { group: "การตั้งค่า" },
      cell: ({ row }) => {
        const ses = row.original.side_effects;
        if (ses.length === 0) return <span className="text-xs text-slate-300">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {ses.map(se => {
              const opt = SIDE_EFFECT_OPTIONS.find(o => o.v === se);
              return (
                <span key={se} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                  {opt?.label ?? se}
                </span>
              );
            })}
          </div>
        );
      },
    },
  ], []);

  // Row actions (ใช้ใน DataTable)
  const stateActions = useMemo(() => canEdit ? [
    { label: "แก้", icon: "✏️", onClick: (s: WorkflowState) => setStateModal(s) },
    { label: "ลบ", icon: "🗑", onClick: (s: WorkflowState) => setDeleteTarget({ kind: "state", id: s.id, label: s.label }), variant: "danger" as const },
  ] : [], [canEdit]);

  const transitionActions = useMemo(() => canEdit ? [
    { label: "แก้", icon: "✏️", onClick: (t: WorkflowTransition) => setTransitionModal(t) },
    { label: "ลบ", icon: "🗑", onClick: (t: WorkflowTransition) => setDeleteTarget({ kind: "transition", id: t.id, label: t.label }), variant: "danger" as const },
  ] : [], [canEdit]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-slate-800">Workflows</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            ตั้งค่า states + transitions ของเอกสาร — ถ้าปิด engine จะใช้ logic เดิม (hardcoded) แทน
          </p>
        </div>

        {/* Entity selector */}
        <div className="mb-4 flex gap-2 flex-wrap">
          {defs.map(d => (
            <button key={d.entity_type} onClick={() => setSelected(d.entity_type)}
              className={`h-9 px-4 text-sm font-medium rounded-lg border ${
                selected === d.entity_type
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}>
              {d.label}
              {!d.active && <span className="ml-1.5 text-[10px] opacity-70">(ปิด)</span>}
            </button>
          ))}
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        {loading || !wf ? (
          <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
        ) : (
          <>
            {/* Definition header */}
            <div className="mb-4 p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800">{wf.definition.label}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Initial state: <code className="font-mono text-slate-700">{wf.definition.initial_state}</code>
                  {wf.definition.notes && <> · {wf.definition.notes}</>}
                </p>
              </div>
              {canEdit && (
                <button onClick={toggleActive}
                  className={`h-8 px-3 text-xs font-medium rounded-lg border ${
                    wf.definition.active
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                      : "bg-slate-100 text-slate-500 border-slate-300"
                  }`}>
                  {wf.definition.active ? "🟢 Engine เปิด" : "⚪ Engine ปิด"}
                </button>
              )}
            </div>

            {/* States table */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700">📍 States ({wf.states.length})</h3>
                {canEdit && (
                  <button onClick={() => setStateModal("new")}
                    className="h-7 px-3 text-xs font-medium border border-slate-200 rounded hover:bg-slate-50 text-slate-700">
                    + เพิ่ม state
                  </button>
                )}
              </div>
              <DataTable<WorkflowState>
                tableId={`admin-workflow-states-${selected}`}
                data={wf.states}
                columns={stateColumns}
                searchPlaceholder="ค้นหา state key หรือ label..."
                searchableKeys={["state_key", "label"]}
                rowActions={stateActions}
                pageSize={20}
                exportFilename={`workflow-${selected}-states`}
                exportEntityType="workflow_states"
              />
            </div>

            {/* Transitions table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700">⚡ Transitions ({wf.transitions.length})</h3>
                {canEdit && (
                  <button onClick={() => setTransitionModal("new")}
                    className="h-7 px-3 text-xs font-medium border border-slate-200 rounded hover:bg-slate-50 text-slate-700">
                    + เพิ่ม transition
                  </button>
                )}
              </div>
              <DataTable<WorkflowTransition>
                tableId={`admin-workflow-transitions-${selected}`}
                data={wf.transitions}
                columns={transitionColumns}
                searchPlaceholder="ค้นหา action หรือ permission..."
                searchableKeys={["action_key", "label", "required_permission"]}
                rowActions={transitionActions}
                pageSize={20}
                exportFilename={`workflow-${selected}-transitions`}
                exportEntityType="workflow_transitions"
              />
            </div>
          </>
        )}

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      {/* State modal */}
      {stateModal !== null && wf && (
        <StateModal entity={wf.definition.entity_type} initial={stateModal === "new" ? null : stateModal}
          actor={user?.name}
          onClose={() => setStateModal(null)} onSaved={async () => { setStateModal(null); flash("บันทึกแล้ว"); await loadWf(); }} />
      )}

      {/* Transition modal */}
      {transitionModal !== null && wf && (
        <TransitionModal entity={wf.definition.entity_type} states={wf.states}
          initial={transitionModal === "new" ? null : transitionModal}
          actor={user?.name}
          onClose={() => setTransitionModal(null)} onSaved={async () => { setTransitionModal(null); flash("บันทึกแล้ว"); await loadWf(); }} />
      )}

      <ConfirmDialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}
        title={`ลบ ${deleteTarget?.kind === "state" ? "State" : "Transition"}`}
        message={`ลบ "${deleteTarget?.label}" ใช่ไหม?`}
        confirmText="ลบ" cancelText="ยกเลิก"
        onConfirm={() => { if (deleteTarget) remove(deleteTarget.kind, deleteTarget.id); }} variant="danger" />
    </PlaygroundShell>
  );
}

// ============================================================
// State Modal
// ============================================================
function StateModal({ entity, initial, actor, onClose, onSaved }: {
  entity: string; initial: WorkflowState | null; actor?: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    id:          initial?.id ?? null as string | null,
    state_key:   initial?.state_key ?? "",
    label:       initial?.label ?? "",
    color:       (initial?.color ?? "slate") as WorkflowState["color"],
    is_terminal: initial?.is_terminal ?? false,
    lock_edit:   initial?.lock_edit ?? false,
    sort_order:  initial?.sort_order ?? 100,
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState<string | null>(null);

  const save = async () => {
    if (!form.state_key.trim() || !form.label.trim()) { setErr("state_key + label จำเป็น"); return; }
    setSaving(true); setErr(null);
    try {
      const res = await apiFetch("/api/admin/workflows", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "state",
          state: { ...form, entity_type: entity },
          actor,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      await onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "ผิดพลาด"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={() => !saving && onClose()} size="md"
      title={initial ? "แก้ State" : "เพิ่ม State"}
      footer={
        <>
          <button onClick={onClose} disabled={saving}
            className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
          <button onClick={save} disabled={saving}
            className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "..." : "บันทึก"}
          </button>
        </>
      }>
      <div className="space-y-3">
        {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {err}</div>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Key (อังกฤษ, ไม่มี space)</span>
            <input value={form.state_key} onChange={e => setForm({ ...form, state_key: e.target.value })}
              placeholder="draft" disabled={initial !== null}
              className="w-full h-9 mt-0.5 px-3 text-sm font-mono border border-slate-200 rounded disabled:bg-slate-50" />
            {initial && <span className="text-[10px] text-slate-400">เปลี่ยน key ไม่ได้</span>}
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">ป้ายแสดงผล</span>
            <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
              placeholder="ร่าง"
              className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">สี</span>
            <select value={form.color} onChange={e => setForm({ ...form, color: e.target.value as WorkflowState["color"] })}
              className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded bg-white">
              {(["slate","blue","amber","emerald","red","purple"] as const).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">ลำดับการแสดง</span>
            <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 100 })}
              className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
          </label>
        </div>
        <div className="flex gap-4 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_terminal} onChange={e => setForm({ ...form, is_terminal: e.target.checked })}
              className="rounded border-slate-300" />
            <span>Terminal (จบ flow)</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.lock_edit} onChange={e => setForm({ ...form, lock_edit: e.target.checked })}
              className="rounded border-slate-300" />
            <span>Lock Edit (ห้ามแก้ field)</span>
          </label>
        </div>
      </div>
    </ERPModal>
  );
}

// ============================================================
// Transition Modal
// ============================================================
function TransitionModal({ entity, states, initial, actor, onClose, onSaved }: {
  entity: string; states: WorkflowState[]; initial: WorkflowTransition | null; actor?: string;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    id:                  initial?.id ?? null as string | null,
    action_key:          initial?.action_key ?? "",
    label:               initial?.label ?? "",
    from_state:          initial?.from_state ?? states[0]?.state_key ?? "",
    to_state:            initial?.to_state ?? states[0]?.state_key ?? "",
    required_permission: initial?.required_permission ?? "",
    use_approval_rule:   initial?.use_approval_rule ?? false,
    require_reason:      initial?.require_reason ?? false,
    side_effects:        initial?.side_effects ?? [],
    sort_order:          initial?.sort_order ?? 100,
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState<string | null>(null);

  const toggleEffect = (v: string) => {
    setForm(p => ({
      ...p,
      side_effects: p.side_effects.includes(v)
        ? p.side_effects.filter(x => x !== v) : [...p.side_effects, v],
    }));
  };

  const save = async () => {
    if (!form.action_key.trim() || !form.label.trim()) { setErr("action_key + label จำเป็น"); return; }
    setSaving(true); setErr(null);
    try {
      const res = await apiFetch("/api/admin/workflows", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "transition",
          transition: {
            ...form, entity_type: entity,
            required_permission: form.required_permission || null,
          },
          actor,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      await onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "ผิดพลาด"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={() => !saving && onClose()} size="lg"
      title={initial ? "แก้ Transition" : "เพิ่ม Transition"}
      footer={
        <>
          <button onClick={onClose} disabled={saving}
            className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
          <button onClick={save} disabled={saving}
            className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "..." : "บันทึก"}
          </button>
        </>
      }>
      <div className="space-y-3">
        {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {err}</div>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Action Key (อังกฤษ)</span>
            <input value={form.action_key} onChange={e => setForm({ ...form, action_key: e.target.value })}
              placeholder="submit"
              className="w-full h-9 mt-0.5 px-3 text-sm font-mono border border-slate-200 rounded" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">ป้ายแสดงผล</span>
            <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
              placeholder="ส่งอนุมัติ"
              className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">From State</span>
            <select value={form.from_state} onChange={e => setForm({ ...form, from_state: e.target.value })}
              className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded bg-white">
              {states.map(s => <option key={s.id} value={s.state_key}>{s.state_key} — {s.label}</option>)}
              <option value="*">* (ทุก state)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">To State</span>
            <select value={form.to_state} onChange={e => setForm({ ...form, to_state: e.target.value })}
              className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded bg-white">
              {states.map(s => <option key={s.id} value={s.state_key}>{s.state_key} — {s.label}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Required Permission (เว้นว่าง = ไม่เช็ค)</span>
            <input value={form.required_permission} onChange={e => setForm({ ...form, required_permission: e.target.value })}
              placeholder="pr.submit" disabled={form.use_approval_rule}
              className="w-full h-9 mt-0.5 px-3 text-sm font-mono border border-slate-200 rounded disabled:bg-slate-100" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Sort Order</span>
            <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 100 })}
              className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
          </label>
        </div>

        <div className="flex gap-4 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.use_approval_rule}
              onChange={e => setForm({ ...form, use_approval_rule: e.target.checked })}
              className="rounded border-slate-300" />
            <span>ใช้ Approval Rule (แทน permission)</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.require_reason}
              onChange={e => setForm({ ...form, require_reason: e.target.checked })}
              className="rounded border-slate-300" />
            <span>ต้องระบุเหตุผล</span>
          </label>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-600 mb-1">Side Effects</p>
          <div className="grid grid-cols-2 gap-1.5 bg-slate-50 rounded-lg p-2">
            {SIDE_EFFECT_OPTIONS.map(o => (
              <label key={o.v} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.side_effects.includes(o.v)}
                  onChange={() => toggleEffect(o.v)} className="rounded border-slate-300" />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </ERPModal>
  );
}
