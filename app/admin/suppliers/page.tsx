"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import type { DataTableView, RowAction, BulkAction } from "@/components/data-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import type { SandboxSupplier, SandboxSuppliersResponse } from "@/app/api/playground-suppliers/route";

// ============================================================
// Form state
// ============================================================

type FormState = {
  name: string; code: string; contact_name: string; contact_phone: string;
  contact_email: string; category: string; address: string; tax_id: string; note: string;
};
const EMPTY: FormState = {
  name: "", code: "", contact_name: "", contact_phone: "",
  contact_email: "", category: "", address: "", tax_id: "", note: "",
};

// ============================================================
// Page
// ============================================================

export default function AdminSuppliersPage() {
  const canView   = usePermission("suppliers.view");
  const canCreate = usePermission("suppliers.create");
  const canEdit   = usePermission("suppliers.edit");
  const { user, can } = useAuth();

  const [rows,    setRows]    = useState<SandboxSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // form drawer
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [form,        setForm]        = useState<FormState>(EMPTY);
  const [formErr,     setFormErr]     = useState<string | null>(null);
  const [dirty,       setDirty]       = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // archive confirm
  const [archiveTarget, setArchiveTarget] = useState<SandboxSupplier | null>(null);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  // ---- Fetch ----
  const fetchList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/playground-suppliers?limit=200&include_inactive=true");
      const json: SandboxSuppliersResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setRows(json.data);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canView) fetchList(); }, [canView, fetchList]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  // ---- Form ops ----
  const updateForm = (patch: Partial<FormState>) => { setForm(p => ({ ...p, ...patch })); setDirty(true); };

  const openCreate = () => {
    setEditingId(null); setForm(EMPTY); setFormErr(null); setDirty(false); setModalOpen(true);
  };
  const openEdit = (s: SandboxSupplier) => {
    setEditingId(s.id);
    setForm({
      name: s.name, code: s.code ?? "", contact_name: s.contact_name ?? "",
      contact_phone: s.contact_phone ?? "", contact_email: s.contact_email ?? "",
      category: s.category ?? "", address: s.address ?? "",
      tax_id: s.tax_id ?? "", note: s.note ?? "",
    });
    setFormErr(null); setDirty(false); setModalOpen(true);
  };
  const tryClose = () => { if (dirty) setConfirmDiscard(true); else setModalOpen(false); };
  const discard  = () => { setConfirmDiscard(false); setModalOpen(false); setDirty(false); };

  const save = async () => {
    if (!form.name.trim()) { setFormErr("กรุณากรอกชื่อผู้จำหน่าย"); return; }
    setSaving(true); setFormErr(null);
    try {
      const payload = { ...form, actor: user?.name };
      const res = editingId
        ? await apiFetch(`/api/playground-suppliers/${editingId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch("/api/playground-suppliers", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(editingId ? "บันทึกการแก้ไขแล้ว" : "สร้างผู้จำหน่ายแล้ว");
      setModalOpen(false); setDirty(false);
      await fetchList();
    } catch (err) { setFormErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const archive = async (s: SandboxSupplier) => {
    try {
      const res = await apiFetch(`/api/playground-suppliers/${s.id}?actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("ปิดบัญชีแล้ว");
      await fetchList();
    } catch (err) { setError(err instanceof Error ? err.message : "ปิดไม่สำเร็จ"); }
    finally { setArchiveTarget(null); }
  };
  const restore = async (s: SandboxSupplier) => {
    try {
      const res = await apiFetch(`/api/playground-suppliers/${s.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("เปิดบัญชีแล้ว");
      await fetchList();
    } catch (err) { setError(err instanceof Error ? err.message : "เปิดไม่สำเร็จ"); }
  };

  // ---- Columns ----
  const columns: ColumnDef<SandboxSupplier>[] = useMemo(() => [
    {
      id: "code", accessorKey: "code", header: "รหัส", size: 110,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? <code className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{v}</code> : <span className="text-slate-300">—</span>;
      },
    },
    { id: "name", accessorKey: "name", header: "ชื่อ", size: 280 },
    {
      id: "category", accessorKey: "category", header: "หมวดหมู่", size: 140,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{v}</span> : <span className="text-slate-300">—</span>;
      },
    },
    { id: "contact_name", accessorKey: "contact_name", header: "ผู้ติดต่อ", size: 140 },
    { id: "contact_phone", accessorKey: "contact_phone", header: "เบอร์", size: 130 },
    { id: "contact_email", accessorKey: "contact_email", header: "อีเมล", size: 180 },
    {
      id: "active", accessorKey: "active", header: "สถานะ", size: 90,
      cell: ({ getValue }) => {
        const a = getValue() as boolean;
        return a ? (
          <span className="inline-flex items-center gap-1.5 text-xs"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>เปิด</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-300"/>ปิดอยู่</span>
        );
      },
    },
  ], []);

  // ---- Views ----
  const views: DataTableView[] = useMemo(() => [
    { id: "active",  label: "เปิดอยู่",  predicate: (r: Record<string, unknown>) => (r as unknown as SandboxSupplier).active === true },
    { id: "all",     label: "ทั้งหมด",   predicate: () => true },
    { id: "inactive",label: "ปิดอยู่",   predicate: (r: Record<string, unknown>) => (r as unknown as SandboxSupplier).active === false },
  ], []);

  // ---- Row actions ----
  const rowActions: RowAction<SandboxSupplier>[] = useMemo(() => {
    const acts: RowAction<SandboxSupplier>[] = [
      { label: "ดู / แก้ไข", icon: "✎", onClick: openEdit },
    ];
    if (canEdit) {
      acts.push({
        label: "เปิด/ปิดบัญชี",
        icon:  "⏻",
        onClick: (r: SandboxSupplier) => r.active ? setArchiveTarget(r) : restore(r),
      });
    }
    return acts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  // ---- Bulk actions ----
  const bulkActions: BulkAction<SandboxSupplier>[] = useMemo(() => canEdit ? [
    {
      label: "ปิดบัญชีที่เลือก",
      onClick: async (selected: SandboxSupplier[]) => {
        if (!confirm(`ปิดบัญชี ${selected.length} ราย?`)) return;
        for (const s of selected) {
          await apiFetch(`/api/playground-suppliers/${s.id}?actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
        }
        flash(`ปิด ${selected.length} ราย`);
        await fetchList();
      },
    },
  ] : [], [canEdit, user?.name, fetchList]);

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">ผู้จำหน่าย</h1>
            <p className="text-sm text-slate-500 mt-0.5">จัดการข้อมูลผู้จำหน่ายกลาง — ใช้กับ PR/PO/Product</p>
          </div>
          {canCreate && (
            <button onClick={openCreate}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              ＋ เพิ่มผู้จำหน่าย
            </button>
          )}
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <DataTable
          tableId="admin-suppliers"
          data={rows}
          columns={columns}
          loading={loading}
          searchableKeys={["name","code","contact_name","contact_phone","contact_email"]}
          searchPlaceholder="ค้นหา รหัส / ชื่อ / เบอร์ / อีเมล..."
          views={views}
          rowActions={rowActions}
          bulkActions={bulkActions}
          exportFilename="suppliers"
          exportEntityType="erp_playground_supplier"
          canCheck={(p) => can(p as Parameters<typeof can>[0])}
          pageSize={20}
          onRowClick={openEdit}
        />

        {toast && (
          <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">
            ✓ {toast}
          </div>
        )}
      </div>

      {/* Drawer create/edit */}
      <ERPModal open={modalOpen} onClose={tryClose} size="lg"
        title={editingId ? "แก้ไขผู้จำหน่าย" : "เพิ่มผู้จำหน่ายใหม่"}
        footer={
          <>
            <button onClick={tryClose} disabled={saving}
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
            <Field label="ชื่อผู้จำหน่าย *" value={form.name} onChange={v => updateForm({ name: v })} colSpan={2} autoFocus />
            <Field label="รหัส" value={form.code} onChange={v => updateForm({ code: v })} placeholder="SUP-001" />
          </div>

          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider pt-2">ผู้ติดต่อ</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="ชื่อผู้ติดต่อ" value={form.contact_name} onChange={v => updateForm({ contact_name: v })} />
            <Field label="เบอร์โทร" value={form.contact_phone} onChange={v => updateForm({ contact_phone: v })} placeholder="02-xxx-xxxx" />
            <Field label="อีเมล" value={form.contact_email} onChange={v => updateForm({ contact_email: v })} placeholder="contact@..." type="email" />
          </div>

          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider pt-2">ที่อยู่ + ภาษี</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="หมวดหมู่" value={form.category} onChange={v => updateForm({ category: v })} placeholder="ไอที / เครื่องเขียน" />
            <Field label="เลขผู้เสียภาษี" value={form.tax_id} onChange={v => updateForm({ tax_id: v })} colSpan={2} />
          </div>
          <Field label="ที่อยู่" value={form.address} onChange={v => updateForm({ address: v })} multiline rows={2} />
          <Field label="หมายเหตุ" value={form.note} onChange={v => updateForm({ note: v })} multiline rows={2} />
        </div>
      </ERPModal>

      {/* Unsaved discard */}
      <ConfirmDialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)}
        title="คุณมีข้อมูลที่ยังไม่ได้บันทึก" message="ต้องการออกโดยไม่บันทึกหรือไม่?"
        confirmText="ออกโดยไม่บันทึก" cancelText="อยู่ต่อ"
        onConfirm={discard} variant="danger" />

      {/* Archive confirm */}
      <ConfirmDialog open={archiveTarget !== null} onClose={() => setArchiveTarget(null)}
        title="ปิดบัญชีผู้จำหน่าย"
        message={`ปิดบัญชี "${archiveTarget?.name}" ใช่ไหม? — รายการที่อ้างอิงอยู่จะไม่ถูกลบ; เปิดกลับได้ทีหลัง`}
        confirmText="ปิดบัญชี" cancelText="ยกเลิก"
        onConfirm={() => { if (archiveTarget) archive(archiveTarget); }} variant="danger" />
    </PlaygroundShell>
  );
}

// ---- Local Field component ----
function Field({
  label, value, onChange, placeholder, type = "text", colSpan = 1, multiline = false, rows = 1, autoFocus,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; colSpan?: number;
  multiline?: boolean; rows?: number; autoFocus?: boolean;
}) {
  const span = colSpan === 2 ? "col-span-2" : colSpan === 3 ? "col-span-3" : "";
  return (
    <label className={`block ${span}`}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
          className="w-full mt-0.5 px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
          className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
      )}
    </label>
  );
}
