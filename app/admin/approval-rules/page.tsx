"use client";

/**
 * Admin Approval Rules — ใช้ DataTable กลาง (K2.4)
 *
 * รวม rule ทุก entity เป็นตารางเดียว มี column "ประเภท" + saved views ตามประเภท
 * เก็บ preview tool ไว้บน table เพื่อช่วยทดสอบ rule
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PlaygroundShell } from "@/components/playground-shell";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { DataTable } from "@/components/data-table";
import { apiFetch } from "@/lib/api";
import type { ApprovalRule, ApprovalRulesResponse } from "@/app/api/admin/approval-rules/route";

const ENTITY_TYPES: { v: string; label: string; icon: string }[] = [
  { v: "pr",      label: "ใบขอซื้อ (Purchase Request)", icon: "🛒" },
  { v: "po",      label: "ใบสั่งซื้อ (Purchase Order)",  icon: "📦" },
  { v: "invoice", label: "ใบแจ้งหนี้ (Invoice)",         icon: "💰" },
];
const ENTITY_LABEL: Record<string, string> = ENTITY_TYPES.reduce((a, e) => ({ ...a, [e.v]: `${e.icon} ${e.v.toUpperCase()}` }), {});

const ROLES: { v: "admin" | "manager" | "staff"; label: string; color: string }[] = [
  { v: "staff",   label: "พนักงาน",     color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { v: "manager", label: "ผู้จัดการ",    color: "bg-blue-50 text-blue-700 border-blue-200" },
  { v: "admin",   label: "ผู้ดูแลระบบ",  color: "bg-purple-50 text-purple-700 border-purple-200" },
];
const ROLE_LABEL: Record<string, string> = ROLES.reduce((a, r) => ({ ...a, [r.v]: r.label }), {});
const ROLE_COLOR: Record<string, string> = ROLES.reduce((a, r) => ({ ...a, [r.v]: r.color }), {});

const baht = (n: number | null) => n == null ? "—" : "฿" + n.toLocaleString("th-TH");

type FormState = {
  id:            string | null;
  entity_type:   string;
  label:         string;
  min_amount:    string;
  max_amount:    string;
  department:    string;
  required_role: "admin" | "manager" | "staff";
  priority:      string;
  active:        boolean;
  notes:         string;
};
const EMPTY: FormState = {
  id: null, entity_type: "pr", label: "",
  min_amount: "", max_amount: "", department: "",
  required_role: "manager", priority: "100", active: true, notes: "",
};

export default function AdminApprovalRulesPage() {
  const canView = usePermission("approval.view");
  const canEdit = usePermission("admin.approval_rules");
  const { user, can } = useAuth();

  const [rules,   setRules]   = useState<ApprovalRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form,      setForm]      = useState<FormState>(EMPTY);
  const [formErr,   setFormErr]   = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ApprovalRule | null>(null);

  const [previewEntity, setPreviewEntity] = useState<string>("pr");
  const [previewAmount, setPreviewAmount] = useState<string>("50000");
  const [previewDept,   setPreviewDept]   = useState<string>("");

  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/admin/approval-rules");
      const json: ApprovalRulesResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setRules(json.data);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const previewMatch = useMemo(() => {
    const amt = parseFloat(previewAmount) || 0;
    const dept = previewDept.trim() || null;
    const candidates = rules.filter(r =>
      r.active && r.entity_type === previewEntity
      && (r.min_amount == null || amt >= r.min_amount)
      && (r.max_amount == null || amt <= r.max_amount)
      && (r.department == null || r.department === dept)
    );
    candidates.sort((a, b) =>
      ((b.department != null ? 1 : 0) - (a.department != null ? 1 : 0)) ||
      (b.priority - a.priority)
    );
    return candidates[0] ?? null;
  }, [rules, previewEntity, previewAmount, previewDept]);

  const openCreate = () => { setForm({ ...EMPTY }); setFormErr(null); setModalOpen(true); };
  const openEdit = (r: ApprovalRule) => {
    setForm({
      id: r.id, entity_type: r.entity_type, label: r.label,
      min_amount: r.min_amount?.toString() ?? "",
      max_amount: r.max_amount?.toString() ?? "",
      department: r.department ?? "",
      required_role: r.required_role,
      priority: r.priority.toString(),
      active: r.active, notes: r.notes ?? "",
    });
    setFormErr(null); setModalOpen(true);
  };

  const save = async () => {
    if (!form.label.trim()) { setFormErr("กรุณากรอกชื่อ rule"); return; }
    const min = form.min_amount === "" ? null : parseFloat(form.min_amount);
    const max = form.max_amount === "" ? null : parseFloat(form.max_amount);
    if (min != null && max != null && min > max) { setFormErr("ยอดต่ำสุดต้องน้อยกว่ายอดสูงสุด"); return; }
    setSaving(true); setFormErr(null);
    try {
      const res = await apiFetch("/api/admin/approval-rules", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id, entity_type: form.entity_type, label: form.label,
          min_amount: min, max_amount: max,
          department: form.department.trim() || null,
          required_role: form.required_role,
          priority: parseInt(form.priority) || 100,
          active: form.active, notes: form.notes.trim() || null,
          actor: user?.name,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(form.id ? "บันทึกแล้ว" : "สร้าง rule ใหม่แล้ว");
      setModalOpen(false);
      await load();
    } catch (err) { setFormErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const remove = async (r: ApprovalRule) => {
    try {
      const res = await apiFetch(`/api/admin/approval-rules?id=${r.id}&actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("ลบ rule แล้ว");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ"); }
    finally { setDeleteTarget(null); }
  };

  // ============================================================
  // Columns
  // ============================================================
  const columns = useMemo<ColumnDef<ApprovalRule, unknown>[]>(() => [
    { id: "entity_type", accessorKey: "entity_type", header: "ประเภท",
      meta: { group: "ข้อมูลหลัก", filterType: "select" },
      cell: ({ getValue }) => <span className="text-xs">{ENTITY_LABEL[String(getValue() ?? "")] ?? getValue()}</span>,
    },
    { id: "priority", accessorKey: "priority", header: "ลำดับ",
      meta: { group: "ข้อมูลหลัก", filterType: "number" },
      cell: ({ getValue }) => <span className="font-mono text-xs text-slate-500">{String(getValue() ?? "")}</span>,
    },
    { id: "label", accessorKey: "label", header: "Rule",
      meta: { group: "ข้อมูลหลัก" },
      cell: ({ row }) => (
        <div>
          <div className={`font-medium ${row.original.active ? "text-slate-800" : "text-slate-400"}`}>{row.original.label}</div>
          {row.original.notes && <div className="text-xs text-slate-400 mt-0.5">{row.original.notes}</div>}
        </div>
      ),
    },
    { id: "min_amount", accessorKey: "min_amount", header: "ยอดต่ำสุด",
      meta: { group: "เงื่อนไข", filterType: "number" },
      cell: ({ getValue }) => <span className="text-xs">{baht(getValue() as number | null)}</span>,
    },
    { id: "max_amount", accessorKey: "max_amount", header: "ยอดสูงสุด",
      meta: { group: "เงื่อนไข", filterType: "number" },
      cell: ({ getValue }) => <span className="text-xs">{baht(getValue() as number | null)}</span>,
    },
    { id: "department", accessorKey: "department", header: "แผนก",
      meta: { group: "เงื่อนไข" },
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? <span className="text-xs">{v}</span> : <span className="text-xs text-slate-300">ทุกแผนก</span>;
      },
    },
    { id: "required_role", accessorKey: "required_role", header: "สิทธิ์",
      meta: { group: "เงื่อนไข", filterType: "select" },
      cell: ({ getValue }) => {
        const v = String(getValue() ?? "");
        return <span className={`inline-block text-xs px-2 py-0.5 rounded border ${ROLE_COLOR[v]}`}>{ROLE_LABEL[v]}</span>;
      },
    },
    { id: "active", accessorKey: "active", header: "สถานะ",
      meta: { group: "สถานะ", filterType: "select" },
      cell: ({ getValue }) => getValue()
        ? <span className="text-xs text-emerald-700">✓ ใช้งาน</span>
        : <span className="text-xs text-slate-400">ปิดอยู่</span>,
    },
  ], []);

  // Built-in views
  const builtInViews = useMemo(() => [
    { id: "all", label: "ทั้งหมด", predicate: () => true },
    { id: "active", label: "ใช้งานอยู่",
      predicate: (r: Record<string, unknown>) => (r as ApprovalRule).active === true },
    ...ENTITY_TYPES.map(et => ({
      id: et.v, label: `${et.icon} ${et.label}`,
      predicate: (r: Record<string, unknown>) => (r as ApprovalRule).entity_type === et.v,
    })),
  ], []);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">กฎอนุมัติ (Approval Rules)</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              ตั้งกฎว่าใครอนุมัติเอกสารช่วงยอดเท่าไหร่ — admin ผ่านทุก rule เสมอ
            </p>
          </div>
          {canEdit && (
            <button onClick={openCreate}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              ＋ เพิ่ม Rule
            </button>
          )}
        </div>

        {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        {/* Preview tool */}
        <div className="mb-6 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
          <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-3">🔮 ทดลอง — ดูใครอนุมัติได้</p>
          <div className="grid grid-cols-4 gap-2">
            <label className="block">
              <span className="text-xs text-slate-600">ประเภท</span>
              <select value={previewEntity} onChange={e => setPreviewEntity(e.target.value)}
                className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded bg-white">
                {ENTITY_TYPES.map(e => <option key={e.v} value={e.v}>{e.icon} {e.v.toUpperCase()}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">ยอดเงิน (฿)</span>
              <input type="number" value={previewAmount} onChange={e => setPreviewAmount(e.target.value)}
                className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">แผนก (เว้นว่าง = ทุก)</span>
              <input value={previewDept} onChange={e => setPreviewDept(e.target.value)} placeholder="—"
                className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
            </label>
            <div className="flex items-end">
              {previewMatch ? (
                <div className="px-3 py-1.5 bg-white rounded border border-slate-200 text-xs">
                  <div className="font-medium text-slate-800">{previewMatch.label}</div>
                  <div className="text-slate-500">
                    ต้องเป็น <span className={`inline-block px-1.5 py-0.5 rounded border ${ROLE_COLOR[previewMatch.required_role]}`}>
                      {ROLE_LABEL[previewMatch.required_role]}
                    </span> หรือสูงกว่า
                  </div>
                </div>
              ) : (
                <div className="px-3 py-1.5 bg-amber-50 rounded border border-amber-200 text-xs text-amber-800">
                  ⚠ ไม่มี rule ที่ตรง — ไม่มีใครอนุมัติได้ (ยกเว้น admin)
                </div>
              )}
            </div>
          </div>
        </div>

        <DataTable<ApprovalRule>
          tableId="admin-approval-rules"
          data={rules}
          columns={columns}
          loading={loading}
          searchPlaceholder="ค้นหาชื่อ rule, แผนก, หมายเหตุ..."
          searchableKeys={["label", "department", "notes"]}
          views={builtInViews}
          rowActions={canEdit ? [
            { label: "แก้", icon: "✏️", onClick: (r) => openEdit(r) },
            { label: "ลบ", icon: "🗑", onClick: (r) => setDeleteTarget(r), variant: "danger" },
          ] : []}
          exportFilename="approval-rules"
          exportEntityType="approval_rules"
          canCheck={(p) => can(p as Parameters<typeof can>[0])}
        />

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      {/* Edit Modal */}
      <ERPModal open={modalOpen} onClose={() => !saving && setModalOpen(false)} size="lg"
        title={form.id ? "แก้ Rule" : "สร้าง Rule ใหม่"}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} disabled={saving}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={save} disabled={saving}
              className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </>
        }>
        <div className="space-y-4">
          {formErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">ประเภทเอกสาร</span>
              <select value={form.entity_type} onChange={e => setForm({ ...form, entity_type: e.target.value })}
                className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded bg-white">
                {ENTITY_TYPES.map(e => <option key={e.v} value={e.v}>{e.label}</option>)}
              </select>
            </label>
            <label className="block col-span-2">
              <span className="text-xs font-medium text-slate-600">ชื่อ Rule *</span>
              <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} autoFocus
                placeholder="เช่น ผู้จัดการแผนก (≤ 10,000)"
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">ยอดต่ำสุด (เว้นว่าง = ไม่จำกัด)</span>
              <input type="number" value={form.min_amount} onChange={e => setForm({ ...form, min_amount: e.target.value })}
                placeholder="—" className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">ยอดสูงสุด (เว้นว่าง = ไม่จำกัด)</span>
              <input type="number" value={form.max_amount} onChange={e => setForm({ ...form, max_amount: e.target.value })}
                placeholder="—" className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">แผนก (เว้นว่าง = ทุก)</span>
              <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
                placeholder="ทุกแผนก" className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">สิทธิ์ที่ต้องการ *</span>
              <select value={form.required_role} onChange={e => setForm({ ...form, required_role: e.target.value as FormState["required_role"] })}
                className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded bg-white">
                {ROLES.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">ลำดับความสำคัญ</span>
              <input type="number" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
              <span className="text-[10px] text-slate-400">สูง = match ก่อน</span>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">หมายเหตุ</span>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })}
              className="rounded border-slate-300" />
            <span className="text-slate-600">ใช้งานอยู่</span>
          </label>
        </div>
      </ERPModal>

      <ConfirmDialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}
        title="ลบ Rule"
        message={`ลบ rule "${deleteTarget?.label}" ใช่ไหม? — เอกสารที่ใช้ rule นี้อยู่อาจอนุมัติไม่ได้`}
        confirmText="ลบ" cancelText="ยกเลิก"
        onConfirm={() => { if (deleteTarget) remove(deleteTarget); }} variant="danger" />
    </PlaygroundShell>
  );
}
