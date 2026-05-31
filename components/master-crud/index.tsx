"use client";

/**
 * MasterCRUDPage — config-driven page สำหรับ master data
 *
 * ใช้สำหรับสร้างหน้า admin ของ customers / employees / warehouses / departments / units / taxes
 * แต่ละหน้าแค่ pass config object → ได้หน้าครบ list + create + edit + soft delete + bulk + export + audit
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable, type DataTableView, type RowAction, type BulkAction, type BulkEditField, type BulkEditResult } from "@/components/data-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied, type Permission } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { loadValidationRules, validateValue, type ValidationRule } from "@/lib/validation";
import type { ColumnDef } from "@tanstack/react-table";

// ---- Field types ----

export type FieldDef = {
  key:        string;
  label:      string;
  type:       "text" | "number" | "boolean" | "select" | "textarea";
  required?:  boolean;
  options?:   string[];                   // สำหรับ select
  placeholder?: string;
  /** ขนาดในตาราง (ไม่ระบุ = ซ่อนจาก table) */
  colSize?:   number;
  /** ซ่อนใน form drawer */
  hideInForm?: boolean;
  /** custom cell render ใน table */
  cellRender?: (value: unknown) => React.ReactNode;
  /** กว้างใน form drawer: 1 / 2 / 3 (default 1 = col-span-1 from 2-col grid) */
  formSpan?:  1 | 2;
  /** validation rule keys ที่จะรัน (เช่น ['required','email']) */
  validations?: string[];
  /** เปิด column filter ใน DataTable */
  filterable?: boolean;
  /** filter type override (default: auto จาก type) */
  filterType?: "text" | "number" | "select";
  /** เปิด sort ใน DataTable (default: true) */
  sortable?: boolean;
  /** เปิด bulk edit สำหรับ field นี้ */
  bulkEditable?: boolean;
};

export type MasterCRUDConfig = {
  /** entity path (เช่น 'customers' → /api/master/customers) */
  apiPath:        string;
  /** ID สำหรับ DataTable saved views + table layout */
  tableId:        string;
  /** title display */
  title:          string;
  description?:   string;
  icon?:          string;
  /** permission keys */
  permissions: {
    view:   Permission;
    create: Permission;
    edit:   Permission;
  };
  /** field schema */
  fields:    FieldDef[];
  /** unique key field (default: 'code') */
  uniqueKey?: string;
  /** entity_type สำหรับ audit log export */
  exportEntityType?: string;
  /** searchableKeys */
  searchKeys?: string[];
  /**
   * Base URL ก่อน apiPath
   * default = "/api/master/"  → RPC pattern (legacy: customers/employees/etc.)
   * override = "/api/master-v2/" → REST pattern (Master Data v2: parent-skus/skus/partners)
   */
  apiBase?: string;
  /** field ที่เป็น soft-delete (default 'active' for RPC, 'is_active' for v2) */
  activeField?: string;
};

type Row = Record<string, unknown> & { id: string; active?: boolean };

// ============================================================
// MasterCRUDPage component
// ============================================================

export function MasterCRUDPage({ config }: { config: MasterCRUDConfig }) {
  const canView   = usePermission(config.permissions.view);
  const canCreate = usePermission(config.permissions.create);
  const canEdit   = usePermission(config.permissions.edit);
  const { user, can } = useAuth();
  const apiBase    = config.apiBase ?? "/api/master/";
  const activeField = config.activeField ?? "active";
  const isRest     = (config.apiBase ?? "").includes("master-v2");

  const [rows,    setRows]    = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [validationRules, setValidationRules] = useState<Record<string, ValidationRule>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // load validation rules once
  useEffect(() => { loadValidationRules().then(setValidationRules); }, []);

  // form drawer
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [form,        setForm]        = useState<Record<string, unknown>>({});
  const [formErr,     setFormErr]     = useState<string | null>(null);
  const [dirty,       setDirty]       = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // archive
  const [archiveTarget, setArchiveTarget] = useState<Row | null>(null);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  // ---- Fetch ----
  const fetchList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(`${apiBase}${config.apiPath}?limit=200&include_inactive=true`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRows((json.data ?? []) as Row[]);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, [config.apiPath]);

  useEffect(() => { if (canView) fetchList(); }, [canView, fetchList]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  // ---- Form ops ----
  const emptyForm = useMemo(() => {
    const e: Record<string, unknown> = {};
    config.fields.forEach(f => {
      e[f.key] = f.type === "boolean" ? false : "";
    });
    return e;
  }, [config.fields]);

  const updateForm = (patch: Partial<Record<string, unknown>>) => {
    setForm(p => ({ ...p, ...patch })); setDirty(true);
  };

  const openCreate = () => {
    setEditingId(null); setForm(emptyForm); setFormErr(null); setDirty(false); setModalOpen(true);
  };
  const openEdit = (r: Row) => {
    setEditingId(r.id);
    const f: Record<string, unknown> = {};
    config.fields.forEach(field => {
      const v = r[field.key];
      f[field.key] = v == null ? (field.type === "boolean" ? false : "") : v;
    });
    setForm(f); setFormErr(null); setDirty(false); setModalOpen(true);
  };
  const tryClose = () => { if (dirty) setConfirmDiscard(true); else setModalOpen(false); };
  const discard  = () => { setConfirmDiscard(false); setModalOpen(false); setDirty(false); };

  const save = async () => {
    // 1. รัน validation rules per field
    const fErr: Record<string, string[]> = {};
    let hasErr = false;
    for (const f of config.fields) {
      const keys = [
        ...(f.required ? ["required"] : []),
        ...(f.validations ?? []),
      ];
      if (keys.length === 0) continue;
      const errs = validateValue(form[f.key], keys, validationRules);
      if (errs.length > 0) { fErr[f.key] = errs; hasErr = true; }
    }
    setFieldErrors(fErr);
    if (hasErr) {
      setFormErr("มี field ที่ยังไม่ผ่านการตรวจ — ดูข้อความใต้แต่ละ field");
      return;
    }
    setSaving(true); setFormErr(null);
    try {
      // serialize fields:
      //   REST mode (v2): proper types (number → number, boolean → boolean)
      //   RPC mode (legacy): everything → string (for jsonb cast)
      const serialized: Record<string, unknown> = {};
      config.fields.forEach((f) => {
        // skip read-only fields (no key in form)
        if (f.hideInForm) return;
        const v = form[f.key];
        if (f.type === "number") {
          if (v === "" || v == null) serialized[f.key] = null;
          else serialized[f.key] = isRest ? Number(v) : String(v);
        } else if (f.type === "boolean") {
          serialized[f.key] = isRest ? !!v : String(!!v);
        } else {
          serialized[f.key] = (v as string) || (isRest ? null : "");
        }
      });

      const url    = editingId
        ? `${apiBase}${config.apiPath}/${editingId}`
        : `${apiBase}${config.apiPath}`;
      const method = editingId ? "PATCH" : "POST";

      const res = await apiFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...serialized, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(editingId ? "บันทึกแล้ว" : "สร้างใหม่แล้ว");
      setModalOpen(false); setDirty(false);
      await fetchList();
    } catch (err) { setFormErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const archive = async (r: Row) => {
    try {
      const res = await apiFetch(`${apiBase}${config.apiPath}/${r.id}?actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("ปิดบัญชีแล้ว");
      await fetchList();
    } catch (err) { setError(err instanceof Error ? err.message : "ปิดไม่สำเร็จ"); }
    finally { setArchiveTarget(null); }
  };
  const restore = async (r: Row) => {
    try {
      const res = await apiFetch(`${apiBase}${config.apiPath}/${r.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [activeField]: isRest ? true : "true", actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("เปิดใช้งานแล้ว");
      await fetchList();
    } catch (err) { setError(err instanceof Error ? err.message : "เปิดไม่สำเร็จ"); }
  };

  // ---- Columns ----
  const columns: ColumnDef<Row>[] = useMemo(() => {
    const tableFields = config.fields.filter(f => f.colSize !== undefined);
    const cols: ColumnDef<Row>[] = tableFields.map(f => ({
      id: f.key, accessorKey: f.key, header: f.label, size: f.colSize,
      enableSorting: f.sortable !== false,
      meta: {
        filterable: f.filterable ?? false,
        filterType: f.filterType ?? (f.type === "number" ? "number" : f.type === "select" ? "select" : "text"),
        ...(f.type === "select" && f.options ? { filterOptions: f.options.map(o => ({ value: o, label: o })) } : {}),
      },
      cell: f.cellRender
        ? ({ getValue }) => f.cellRender!(getValue())
        : ({ getValue }) => {
            const v = getValue();
            if (v == null || v === "") return <span className="text-slate-300">—</span>;
            if (typeof v === "boolean") return v ? "✓" : "—";
            return String(v);
          },
    }));
    // active column สุดท้ายเสมอ (รองรับทั้ง 'active' และ 'is_active')
    cols.push({
      id: activeField, accessorKey: activeField, header: "สถานะ", size: 90,
      cell: ({ getValue }) => {
        const a = getValue() as boolean;
        return a ? (
          <span className="inline-flex items-center gap-1.5 text-xs"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>เปิด</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-300"/>ปิดอยู่</span>
        );
      },
    });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.fields, activeField]);

  // ---- Views ----
  // ⚠️ DataTableView field คือ "filter" (ไม่ใช่ "predicate")
  const views: DataTableView[] = useMemo(() => [
    { id: "active",   label: "เปิดอยู่",  filter: (r) => r[activeField] === true },
    { id: "all",      label: "ทั้งหมด",   filter: () => true },
    { id: "inactive", label: "ปิดอยู่",   filter: (r) => r[activeField] === false },
  ], [activeField]);

  // ---- Row actions ----
  const rowActions: RowAction<Row>[] = useMemo(() => {
    const acts: RowAction<Row>[] = [{ label: "ดู / แก้", icon: "✎", onClick: openEdit }];
    if (canEdit) {
      acts.push({
        label: "เปิด/ปิด", icon: "⏻",
        onClick: (r: Row) => r[activeField] ? setArchiveTarget(r) : restore(r),
      });
    }
    return acts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, activeField]);

  // ---- Bulk archive ----
  const bulkActions: BulkAction<Row>[] = useMemo(() => canEdit ? [
    {
      label: "ปิดบัญชีที่เลือก",
      onClick: async (selected: Row[]) => {
        if (!confirm(`ปิด ${selected.length} ราย?`)) return;
        for (const r of selected) {
          await apiFetch(`${apiBase}${config.apiPath}/${r.id}?actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
        }
        flash(`ปิด ${selected.length} ราย`);
        await fetchList();
      },
    },
  ] : [], [canEdit, user?.name, apiBase, config.apiPath, fetchList]);

  // ---- Bulk edit fields ----
  const bulkEditFields: BulkEditField[] = useMemo(() => {
    if (!canEdit) return [];
    return config.fields
      .filter((f) => f.bulkEditable)
      .map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type === "textarea" ? "text" : (f.type as "text" | "number" | "select" | "boolean"),
        options: f.type === "select" && f.options ? f.options.map((o) => ({ value: o, label: o })) : undefined,
      }));
  }, [canEdit, config.fields]);

  const onBulkEdit = useCallback(async (
    edits: { row: Row; changes: Record<string, unknown> }[]
  ): Promise<BulkEditResult> => {
    let success = 0, failed = 0;
    for (const e of edits) {
      try {
        const res = await apiFetch(`${apiBase}${config.apiPath}/${e.row.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...e.changes, actor: user?.name }),
        });
        const json = await res.json();
        if (json.error) { failed++; continue; }
        success++;
      } catch { failed++; }
    }
    await fetchList();
    flash(`แก้ ${success} ราย${failed > 0 ? ` (พลาด ${failed})` : ""}`);
    return { success, failed };
  }, [apiBase, config.apiPath, user?.name, fetchList]);

  // ---- Render form field ----
  const renderField = (f: FieldDef) => {
    const v = form[f.key];
    const errs = fieldErrors[f.key];
    const hasErr = errs && errs.length > 0;
    const common = `w-full h-9 mt-0.5 px-3 text-sm border rounded-md focus:outline-none focus:ring-1 ${
      hasErr ? "border-red-300 focus:ring-red-500" : "border-slate-200 focus:ring-blue-500"
    }`;
    return (
      <label key={f.key} className={`block ${f.formSpan === 2 ? "col-span-2" : ""}`}>
        <span className="text-xs font-medium text-slate-600">
          {f.label} {f.required && <span className="text-red-500">*</span>}
          {f.validations && f.validations.length > 0 && (
            <span className="ml-1 text-[10px] text-slate-400">{f.validations.join(", ")}</span>
          )}
        </span>
        {f.type === "select" ? (
          <select value={(v as string) || ""} onChange={e => updateForm({ [f.key]: e.target.value })}
            className={`${common} bg-white`}>
            <option value="">— เลือก —</option>
            {f.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        ) : f.type === "textarea" ? (
          <textarea value={(v as string) || ""} onChange={e => updateForm({ [f.key]: e.target.value })}
            rows={2} placeholder={f.placeholder}
            className="w-full mt-0.5 px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
        ) : f.type === "boolean" ? (
          <div className="h-9 mt-0.5 flex items-center">
            <input type="checkbox" checked={!!v} onChange={e => updateForm({ [f.key]: e.target.checked })}
              className="rounded border-slate-300" />
            <span className="ml-2 text-xs text-slate-500">{v ? "เปิด" : "ปิด"}</span>
          </div>
        ) : (
          <input
            type={f.type === "number" ? "number" : "text"}
            value={(v as string | number | undefined) ?? ""}
            onChange={e => updateForm({ [f.key]: e.target.value })}
            placeholder={f.placeholder}
            className={common}
          />
        )}
        {hasErr && (
          <div className="text-[11px] text-red-600 mt-1 space-y-0.5">
            {errs.map((m, i) => <div key={i}>⚠ {m}</div>)}
          </div>
        )}
      </label>
    );
  };

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">
              {config.icon && <span className="mr-2">{config.icon}</span>}{config.title}
            </h1>
            {config.description && <p className="text-sm text-slate-500 mt-0.5">{config.description}</p>}
          </div>
          {canCreate && (
            <button onClick={openCreate}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              ＋ เพิ่ม{config.title}
            </button>
          )}
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <DataTable
          tableId={config.tableId}
          data={rows}
          columns={columns}
          loading={loading}
          searchableKeys={(config.searchKeys ?? ["name","code"]) as (keyof Row)[]}
          searchPlaceholder={`ค้นหา ${config.title}...`}
          views={views}
          rowActions={rowActions}
          bulkActions={bulkActions}
          bulkEditFields={bulkEditFields.length > 0 ? bulkEditFields : undefined}
          onBulkEdit={bulkEditFields.length > 0 ? onBulkEdit : undefined}
          exportFilename={config.apiPath}
          exportEntityType={config.exportEntityType}
          canCheck={(p) => can(p as Parameters<typeof can>[0])}
          pageSize={20}
          onRowClick={openEdit}
        />

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      {/* Drawer */}
      <ERPModal open={modalOpen} onClose={tryClose} size="lg"
        title={editingId ? `แก้ ${config.title}` : `เพิ่ม ${config.title}ใหม่`}
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
          <div className="grid grid-cols-2 gap-3">
            {config.fields.filter(f => !f.hideInForm).map(renderField)}
          </div>
        </div>
      </ERPModal>

      <ConfirmDialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)}
        title="ยังไม่บันทึก" message="ออกโดยไม่บันทึกหรือไม่?"
        confirmText="ออก" cancelText="อยู่ต่อ" onConfirm={discard} variant="danger" />

      <ConfirmDialog open={archiveTarget !== null} onClose={() => setArchiveTarget(null)}
        title="ปิดบัญชี" message={`ปิดบัญชี "${archiveTarget?.name as string}" ใช่ไหม?`}
        confirmText="ปิดบัญชี" cancelText="ยกเลิก" variant="danger"
        onConfirm={() => { if (archiveTarget) archive(archiveTarget); }} />
    </PlaygroundShell>
  );
}
