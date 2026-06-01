"use client";

/**
 * MasterCRUDPage — config-driven page สำหรับ master data
 *
 * ใช้สำหรับสร้างหน้า admin ของ customers / employees / warehouses / departments / units / taxes
 * แต่ละหน้าแค่ pass config object → ได้หน้าครบ list + create + edit + soft delete + bulk + export + audit
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable, type DataTableView, type RowAction, type BulkAction, type BulkEditField, type BulkEditResult, type ServerFetchParams } from "@/components/data-table";
import { Drawer, ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied, type Permission } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { loadValidationRules, validateValue, type ValidationRule } from "@/lib/validation";
import type { ColumnDef } from "@tanstack/react-table";
import type { FormField, FieldRegistryV2Response } from "@/app/api/admin/field-registry-v2/route";
import { RelationPicker, type RelationConfig } from "@/components/relation-picker";
import { ImageInput, ImageCell } from "@/components/image-input";
import { resolveDefault, evaluateCondition } from "@/lib/field-helpers";
import { StudioPanel, type StudioField } from "@/components/master-crud/studio-panel";

// ---- Helper: map FormField (Registry) → FieldDef (MasterCRUDPage internal) ----

// Default render สำหรับ relation field — อ่าน label จาก row[`{key}_label`] หรือ row[`{key}_name`]
function defaultRelationCellRender(key: string) {
  // strip _id suffix สำหรับหา key ของ label
  const base = key.endsWith("_id") ? key.slice(0, -3) : key;
  return (value: unknown, row?: Record<string, unknown>): React.ReactNode => {
    if (!row) return value ? <code className="text-xs text-slate-400">{String(value).slice(0, 8)}...</code> : <span className="text-slate-300">—</span>;
    const label = row[`${base}_label`] ?? row[`${base}_name`];
    if (label) return <span className="text-sm text-slate-700">{String(label)}</span>;
    if (value) return <code className="text-xs text-slate-400" title="ยังไม่ได้ resolve label">{String(value).slice(0, 8)}...</code>;
    return <span className="text-slate-300">—</span>;
  };
}

function registryToFieldDef(
  rf: FormField,
  cellRenderers?: Record<string, (v: unknown, row?: Record<string, unknown>) => React.ReactNode>,
): FieldDef {
  // map ui_field_type → FieldDef.type
  const fieldType: FieldDef["type"] =
    rf.ui_field_type === "boolean" ? "boolean"
    : rf.ui_field_type === "number" ? "number"
    : rf.ui_field_type === "relation" ? "relation"
    : rf.ui_field_type === "image" ? "image"
    : rf.ui_field_type === "select" ? "select"
    : rf.ui_field_type === "textarea" || rf.ui_field_type === "json" ? "textarea"
    : "text";

  const opts = (rf.options as { options?: string[] })?.options;
  const relCfg = rf.relation_config as RelationConfig | undefined;
  const key = rf.column_name ?? rf.field_key;
  const customRender = cellRenderers?.[key];

  // default cellRender
  const effectiveCellRender: ((v: unknown, row?: Record<string, unknown>) => React.ReactNode) | undefined =
    customRender
      ?? (fieldType === "relation"
          ? defaultRelationCellRender(key)
          : fieldType === "image"
            ? (v: unknown) => <ImageCell r2Key={v as string | null} size={40} />
            : undefined);

  // Sprint 9: validation_rules → validations array
  const valRules = rf.validation_rules as { rules?: string[] } | undefined;

  return {
    key,
    fieldId:     rf.id,            // F11B: registry id สำหรับ Studio save
    label:       rf.field_label,
    type:        fieldType,
    required:    rf.is_required,
    options:     opts,
    placeholder: rf.placeholder ?? undefined,
    helpText:    rf.help_text ?? undefined,
    colSize:     rf.is_visible ? rf.width : undefined,
    // Sprint 9: เปลี่ยน is_editable=false → readonly (แสดงแต่ disable) ไม่ใช่ซ่อน
    hideInForm:  !rf.show_in_form,
    readonly:    !rf.is_editable,
    formSpan:    (rf.form_column_span >= 2 ? 2 : 1) as 1 | 2,
    filterable:  rf.is_filterable,
    sortable:    rf.is_sortable,
    cellRender:  effectiveCellRender,
    relationConfig: relCfg && relCfg.target_table ? relCfg : undefined,
    groupKey:    rf.group_key,
    order:       rf.display_order,
    validations: Array.isArray(valRules?.rules) ? valRules.rules : undefined,
    // Sprint 12
    defaultValue:      rf.default_value,
    defaultExpression: rf.default_expression,
    inlineEditable:    rf.is_inline_editable,
    // Sprint 13
    conditionRules:    rf.condition_rules ?? null,
  };
}


// resolveDefault + evaluateCondition: ย้ายไป @/lib/field-helpers (Sprint 14)

// ---- Group config (Sprint 7) ----
// defaultOpen = true ทุก section — user ขอ "ดึงมาไม่ครบ" ปัญหามาจาก collapse
// ปุ่ม "ยุบทั้งหมด" มีอยู่ใน FormSections header
const GROUP_CONFIG: Record<string, { label: string; icon: string; defaultOpen: boolean; order: number }> = {
  core:      { label: "ข้อมูลหลัก",     icon: "📋", defaultOpen: true, order: 10 },
  relations: { label: "ความสัมพันธ์",  icon: "🔗", defaultOpen: true, order: 20 },
  product:   { label: "คุณสมบัติ",      icon: "✨", defaultOpen: true, order: 25 },
  specs:     { label: "ขนาด/สเปก",     icon: "📐", defaultOpen: true, order: 30 },
  supplier:  { label: "ผู้จำหน่าย",     icon: "🏭", defaultOpen: true, order: 35 },
  content:   { label: "เนื้อหา",        icon: "📝", defaultOpen: true, order: 40 },
  pricing:   { label: "ราคา & ต้นทุน",  icon: "💰", defaultOpen: true, order: 50 },
  media:     { label: "รูปภาพ/ไฟล์",    icon: "🖼️", defaultOpen: true, order: 55 },
  status:    { label: "สถานะ",          icon: "🟢", defaultOpen: true, order: 60 },
  other:     { label: "อื่น ๆ",         icon: "📦", defaultOpen: true, order: 80 },
  system:    { label: "ระบบ",           icon: "⚙️", defaultOpen: false, order: 90 },
};

function getGroupConfig(key: string) {
  return GROUP_CONFIG[key] ?? { label: key, icon: "📁", defaultOpen: false, order: 99 };
}

// ---- Field types ----

export type FieldDef = {
  key:        string;
  /** F11B: erp_module_fields.id — ใช้ตอน Studio บันทึก layout (group/order) */
  fieldId?:   string;
  label:      string;
  type:       "text" | "number" | "boolean" | "select" | "textarea" | "relation" | "image";
  required?:  boolean;
  options?:   string[];                   // สำหรับ select
  placeholder?: string;
  /** help text แสดงใต้ label ใน form */
  helpText?:  string;
  /** ขนาดในตาราง (ไม่ระบุ = ซ่อนจาก table) */
  colSize?:   number;
  /** ซ่อนใน form drawer */
  hideInForm?: boolean;
  /** Sprint 9: แสดงใน form แต่แก้ไม่ได้ (disabled) */
  readonly?:  boolean;
  /** custom cell render ใน table (row available เพื่ออ่าน sibling fields เช่น *_label สำหรับ relation) */
  cellRender?: (value: unknown, row?: Record<string, unknown>) => React.ReactNode;
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
  /** config สำหรับ relation field (FK picker) */
  relationConfig?: RelationConfig;
  /** Sprint 7: section group สำหรับ form layout */
  groupKey?:  string;
  /** Sprint 7: lower number = ขึ้นก่อนใน group + section ordering */
  order?:     number;
  /** Sprint 12: static default ตอน Create */
  defaultValue?: string | null;
  /** Sprint 12: dynamic default — 'now()' | 'today()' | 'current_user()' | 'uuid()' */
  defaultExpression?: string | null;
  /** Sprint 12: เปิดดับเบิ้ลคลิก cell แก้ในตารางได้ */
  inlineEditable?: boolean;
  /** Sprint 13: เงื่อนไขแสดงในฟอร์ม — {show_if: {field, operator, value}} */
  conditionRules?: Record<string, unknown> | null;
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
  /**
   * field schema — สอง mode:
   *   - static: ให้ fields[] array (legacy)
   *   - dynamic: ให้ moduleKey → MasterCRUDPage โหลดจาก Field Registry (sprint 2+)
   * ระบุได้ทั้งสอง (dynamic จะ override static)
   */
  fields?:   FieldDef[];
  /** dynamic field loading จาก erp_module_fields */
  moduleKey?: string;
  /** ฟังก์ชัน custom สำหรับ cellRender override (key → fn) — ใช้กับ dynamic mode */
  cellRenderers?: Record<string, (value: unknown, row?: Record<string, unknown>) => React.ReactNode>;
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
  /** จำนวน row ที่ดึงตอนโหลด (client mode, default 200) */
  pageLimit?: number;
  /**
   * F19: server-side pagination — ดึงทีละหน้าจาก server (กัน Worker 1102 ถาวร)
   * เหมาะกับ dataset ใหญ่ (>500 rows เช่น parent-skus, skus)
   * Trade-off: ปิด client filter/saved-views (search + pagination ทำที่ server)
   */
  serverMode?: boolean;
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

  // ---- Dynamic field loading (Sprint 2) ----
  // ถ้ามี moduleKey — load fields config จาก Field Registry
  // ไม่งั้นใช้ config.fields ที่ส่งมา (static legacy)
  const [registryFields, setRegistryFields] = useState<FormField[] | null>(null);
  const [registryLoading, setRegistryLoading] = useState(!!config.moduleKey);

  useEffect(() => {
    if (!config.moduleKey) return;
    setRegistryLoading(true);
    apiFetch(`/api/admin/field-registry-v2?module=${encodeURIComponent(config.moduleKey)}`)
      .then((r) => r.json() as Promise<FieldRegistryV2Response>)
      .then((res) => {
        if (res.error) console.error("Field Registry load error:", res.error);
        else setRegistryFields(res.fields);
      })
      .catch((e) => console.error("Field Registry load failed:", e))
      .finally(() => setRegistryLoading(false));
  }, [config.moduleKey]);

  // คำนวณ effective fields — Registry มาก่อน, fallback ไป static config.fields
  // Sprint 8: filter sensitive fields ที่ user ไม่มี permission
  const effectiveFields: FieldDef[] = useMemo(() => {
    if (registryFields && registryFields.length > 0) {
      return registryFields
        .filter((rf) => {
          if (rf.is_sensitive && rf.sensitive_permission) {
            return can(rf.sensitive_permission as Parameters<typeof can>[0]);
          }
          return true;
        })
        .map((rf) => registryToFieldDef(rf, config.cellRenderers));
    }
    return config.fields ?? [];
  }, [registryFields, config.fields, config.cellRenderers, can]);

  // auto-derive searchKeys จาก Registry ถ้ามี
  const effectiveSearchKeys: string[] = useMemo(() => {
    if (registryFields && registryFields.length > 0) {
      return registryFields
        .filter((f) => f.is_searchable)
        .map((f) => f.column_name ?? f.field_key);
    }
    return config.searchKeys ?? ["name", "code"];
  }, [registryFields, config.searchKeys]);

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
  // F11: drawer mode — "view" (อ่านอย่างเดียว) | "edit" (ฟอร์ม)
  const [drawerMode,  setDrawerMode]  = useState<"view" | "edit">("view");
  const [detailLoading, setDetailLoading] = useState(false);

  // archive
  const [archiveTarget, setArchiveTarget] = useState<Row | null>(null);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  // F19: refresh trigger สำหรับ server mode (เพิ่มค่า → DataTable โหลดหน้าใหม่)
  const [serverRefresh, setServerRefresh] = useState(0);

  // F11B: Studio v1 (drag-drop layout builder)
  const [studioOpen, setStudioOpen] = useState(false);

  // ---- Fetch (client mode) ----
  const fetchList = useCallback(async () => {
    if (config.serverMode) { setLoading(false); return; }  // server mode ไม่โหลดทั้งก้อน
    setLoading(true); setError(null);
    try {
      // F19: ลด default 500 → 200 (กัน Worker 1102) — ใช้ search หา row ที่เหลือ
      const limit = config.pageLimit ?? 200;
      const res = await apiFetch(`${apiBase}${config.apiPath}?limit=${limit}&include_inactive=true`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRows((json.data ?? []) as Row[]);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, [config.apiPath, apiBase, config.pageLimit, config.serverMode]);

  useEffect(() => { if (canView) fetchList(); }, [canView, fetchList]);

  // F19: refresh ที่ทำงานทั้ง 2 mode — client โหลดใหม่ / server bump key
  const refreshData = useCallback(async () => {
    if (config.serverMode) setServerRefresh((n) => n + 1);
    else await fetchList();
  }, [config.serverMode, fetchList]);

  // ---- Server fetch (server mode — ดึงทีละหน้า) ----
  const serverFetch = useCallback(async (params: ServerFetchParams): Promise<{ rows: Row[]; total: number }> => {
    const offset = (params.page - 1) * params.pageSize;
    const qs = new URLSearchParams({
      limit:  String(params.pageSize),
      offset: String(offset),
      include_inactive: "true",
    });
    if (params.search) qs.set("search", params.search);
    const res = await apiFetch(`${apiBase}${config.apiPath}?${qs}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return { rows: (json.data ?? []) as Row[], total: (json.total as number) ?? 0 };
  }, [apiBase, config.apiPath]);

  // ⚠ ห้าม early return ที่นี่ — จะทำให้ hooks ด้านล่าง (useMemo/useCallback อีก 8+ ตัว)
  // ไม่ถูกเรียก → React error #310 'Rendered fewer hooks than expected'
  // → ย้ายเช็ค canView ไปก่อน return JSX หลัก

  // ---- Form ops ----
  // Sprint 12: prefill defaults (static + dynamic expression)
  const emptyForm = useMemo(() => {
    const e: Record<string, unknown> = {};
    effectiveFields.forEach(f => {
      e[f.key] = resolveDefault(f.type, f.defaultValue, f.defaultExpression, user?.email ?? null);
    });
    return e;
  }, [effectiveFields, user?.email]);

  const updateForm = (patch: Partial<Record<string, unknown>>) => {
    setForm(p => ({ ...p, ...patch })); setDirty(true);
  };

  const openCreate = () => {
    setEditingId(null); setForm(emptyForm); setFormErr(null); setDirty(false); setModalOpen(true);
  };
  // F10a: open edit drawer — fetch full row จาก /[id] เพื่อได้ทุก field
  // (sync wrapper เพื่อให้ rowActions/onRowClick type ตรง — fetch ผ่าน .then ภายใน)
  const openEdit = (r: Row) => {
    setEditingId(r.id);
    setFormErr(null); setDirty(false); setModalOpen(true);

    // เริ่มด้วยค่าจาก list (compact projection) — กันฟอร์มว่างขณะรอ full row
    const partial: Record<string, unknown> = {};
    effectiveFields.forEach(field => {
      const v = r[field.key];
      partial[field.key] = v == null ? (field.type === "boolean" ? false : "") : v;
    });
    setForm(partial);

    // fetch full row ใน background (REST mode เท่านั้น)
    if (!isRest) return;
    apiFetch(`${apiBase}${config.apiPath}/${r.id}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error || !json.data) return;
        const full = json.data as Record<string, unknown>;
        const f: Record<string, unknown> = {};
        effectiveFields.forEach((field) => {
          const v = full[field.key];
          f[field.key] = v == null ? (field.type === "boolean" ? false : "") : v;
        });
        setForm(f);
      })
      .catch(() => { /* keep partial — ดีกว่าค้าง */ });
  };
  // F11: เตือน unsaved เฉพาะโหมด edit ที่มีการแก้
  const tryClose = () => { if (drawerMode === "edit" && dirty) setConfirmDiscard(true); else setModalOpen(false); };
  const discard  = () => { setConfirmDiscard(false); setModalOpen(false); setDirty(false); };
  // F11: สลับเข้าโหมดแก้ไข
  const switchToEdit = () => { setDrawerMode("edit"); setFormErr(null); setFieldErrors({}); };

  const save = async () => {
    // 1. รัน validation rules per field — Sprint 13: skip field ที่ condition ไม่ผ่าน
    const fErr: Record<string, string[]> = {};
    let hasErr = false;
    for (const f of effectiveFields) {
      // ถ้า condition rule ซ่อนอยู่ → ไม่ต้อง validate (รวม required)
      if (!evaluateCondition(f.conditionRules, form)) continue;
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
      effectiveFields.forEach((f) => {
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
      setDirty(false);
      // F11: แก้ของเดิม → กลับไปโหมดดู (ไม่ปิด) | สร้างใหม่ → ปิด drawer
      if (editingId) {
        // update form จาก response → detail view โชว์ค่าใหม่ทันที
        if (json.data) {
          const full = json.data as Record<string, unknown>;
          const f: Record<string, unknown> = {};
          effectiveFields.forEach((fd) => {
            const v = full[fd.key];
            f[fd.key] = v == null ? (fd.type === "boolean" ? false : "") : v;
          });
          setForm(f);
        }
        setDrawerMode("view");
      } else {
        setModalOpen(false);
      }
      await refreshData();
    } catch (err) { setFormErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const archive = async (r: Row) => {
    try {
      const res = await apiFetch(`${apiBase}${config.apiPath}/${r.id}?actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("ปิดบัญชีแล้ว");
      await refreshData();
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
      await refreshData();
    } catch (err) { setError(err instanceof Error ? err.message : "เปิดไม่สำเร็จ"); }
  };

  // ---- Columns ----
  const columns: ColumnDef<Row>[] = useMemo(() => {
    const tableFields = effectiveFields.filter(f => f.colSize !== undefined);
    const cols: ColumnDef<Row>[] = tableFields.map(f => ({
      id: f.key, accessorKey: f.key, header: f.label, size: f.colSize,
      enableSorting: f.sortable !== false,
      meta: {
        filterable: f.filterable ?? false,
        filterType: f.filterType ?? (f.type === "number" ? "number" : f.type === "select" ? "select" : "text"),
        ...(f.type === "select" && f.options ? { filterOptions: f.options.map(o => ({ value: o, label: o })) } : {}),
      },
      cell: f.cellRender
        ? ({ getValue, row }) => f.cellRender!(getValue(), row.original as Record<string, unknown>)
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
  }, [effectiveFields, activeField]);

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
        await refreshData();
      },
    },
  ] : [], [canEdit, user?.name, apiBase, config.apiPath, refreshData]);

  // ---- Sprint 12: Inline editing ----
  // เปิดเฉพาะ field ที่ admin tick is_inline_editable + user มีสิทธิ์ edit + ไม่ใช่ sensitive
  const inlineEditFields = useMemo(() => {
    if (!canEdit) return [];
    return effectiveFields
      .filter((f) => f.inlineEditable && !f.readonly && f.type !== "image" && f.type !== "relation" && f.type !== "textarea")
      .map((f) => f.key);
  }, [canEdit, effectiveFields]);

  const onInlineEdit = useCallback(async (
    row: Row,
    field: string,
    value: string,
  ): Promise<string | null> => {
    // หา field def เพื่อ coerce type
    const def = effectiveFields.find((f) => f.key === field);
    if (!def) return "field ไม่พบ";
    let coerced: unknown = value;
    if (def.type === "number") {
      if (value === "" || value == null) coerced = null;
      else {
        const n = Number(value);
        if (isNaN(n)) return "ต้องเป็นตัวเลข";
        coerced = isRest ? n : String(n);
      }
    } else if (def.type === "boolean") {
      coerced = isRest ? (value === "true") : value;
    } else {
      coerced = isRest ? (value === "" ? null : value) : value;
    }
    try {
      const res = await apiFetch(`${apiBase}${config.apiPath}/${row.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: coerced, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) return json.error;
      // optimistic update local
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, [field]: coerced } as Row : r));
      flash(`✓ บันทึก ${def.label}`);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "บันทึกไม่สำเร็จ";
    }
  }, [effectiveFields, apiBase, config.apiPath, user?.name, isRest]);

  // ---- Bulk edit fields ----
  const bulkEditFields: BulkEditField[] = useMemo(() => {
    if (!canEdit) return [];
    return effectiveFields
      .filter((f) => f.bulkEditable)
      .map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type === "textarea" ? "text" : (f.type as "text" | "number" | "select" | "boolean"),
        options: f.type === "select" && f.options ? f.options.map((o) => ({ value: o, label: o })) : undefined,
      }));
  }, [canEdit, effectiveFields]);

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
    await refreshData();
    flash(`แก้ ${success} ราย${failed > 0 ? ` (พลาด ${failed})` : ""}`);
    return { success, failed };
  }, [apiBase, config.apiPath, user?.name, refreshData]);

  // ---- Render form field ----
  const renderField = (f: FieldDef) => {
    const v = form[f.key];
    const errs = fieldErrors[f.key];
    const hasErr = errs && errs.length > 0;
    const disabled = !!f.readonly;
    const common = `w-full h-9 mt-0.5 px-3 text-sm border rounded-md focus:outline-none focus:ring-1 ${
      hasErr ? "border-red-300 focus:ring-red-500"
      : disabled ? "border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
      : "border-slate-200 focus:ring-orange-500 focus:border-orange-500"
    }`;
    return (
      <label key={f.key} className={`block ${f.formSpan === 2 ? "col-span-2" : ""}`}>
        <span className="text-xs font-medium text-slate-600">
          {f.label}
          {f.required && <span className="text-red-500 ml-0.5">*</span>}
          {f.readonly && <span className="ml-1 text-[10px] text-slate-400">(read-only)</span>}
        </span>
        {f.helpText && <div className="text-[11px] text-slate-400 mt-0.5">{f.helpText}</div>}
        {f.type === "image" ? (
          <ImageInput
            value={(v as string) || null}
            onChange={(val) => updateForm({ [f.key]: val })}
            folder={config.apiPath}
            required={f.required}
            disabled={disabled}
            hasError={hasErr}
          />
        ) : f.type === "relation" && f.relationConfig ? (
          <div className="mt-0.5">
            <RelationPicker
              value={(v as string) || null}
              onChange={(val) => updateForm({ [f.key]: val })}
              config={f.relationConfig}
              placeholder={f.placeholder ?? `— เลือก ${f.label} —`}
              required={f.required}
              disabled={disabled}
              hasError={hasErr}
            />
          </div>
        ) : f.type === "select" ? (
          <select value={(v as string) || ""} disabled={disabled}
            onChange={e => updateForm({ [f.key]: e.target.value })}
            className={`${common} bg-white`}>
            <option value="">— เลือก —</option>
            {f.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        ) : f.type === "textarea" ? (
          <textarea value={(v as string) || ""} disabled={disabled}
            onChange={e => updateForm({ [f.key]: e.target.value })}
            rows={3} placeholder={f.placeholder}
            className={`w-full mt-0.5 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 ${
              hasErr ? "border-red-300 focus:ring-red-500"
              : disabled ? "border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
              : "border-slate-200 focus:ring-orange-500 focus:border-orange-500"
            }`} />
        ) : f.type === "boolean" ? (
          <div className="h-9 mt-0.5 flex items-center">
            <input type="checkbox" disabled={disabled} checked={!!v}
              onChange={e => updateForm({ [f.key]: e.target.checked })}
              className="rounded border-slate-300" />
            <span className="ml-2 text-xs text-slate-500">{v ? "เปิด" : "ปิด"}</span>
          </div>
        ) : (
          <input
            type={f.type === "number" ? "number" : "text"}
            disabled={disabled}
            value={(v as string | number | undefined) ?? ""}
            onChange={e => updateForm({ [f.key]: e.target.value })}
            placeholder={f.placeholder}
            className={common}
          />
        )}
        {hasErr && (
          <div className="text-[11px] text-red-600 mt-1 space-y-0.5 flex flex-col">
            {errs.map((m, i) => <span key={i} className="flex items-center gap-1">⚠ <span>{m}</span></span>)}
          </div>
        )}
      </label>
    );
  };

  // F11: render ค่าแบบอ่านอย่างเดียว (detail view)
  const renderDetailValue = (f: FieldDef): React.ReactNode => {
    const v = form[f.key];
    if (f.type === "image") {
      return <ImageCell r2Key={(v as string) || null} size={160} />;
    }
    if (f.type === "boolean") {
      return v
        ? <span className="inline-flex items-center gap-1 text-sm text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />เปิด</span>
        : <span className="inline-flex items-center gap-1 text-sm text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-300" />ปิด</span>;
    }
    if (f.type === "relation") {
      if (f.cellRender) return f.cellRender(v, form);
      const base = f.key.endsWith("_id") ? f.key.slice(0, -3) : f.key;
      const label = form[`${base}_label`] ?? form[`${base}_name`];
      if (label) return <span className="text-sm text-slate-800">{String(label)}</span>;
      return v ? <code className="text-xs text-slate-400">{String(v).slice(0, 8)}…</code> : <span className="text-slate-300">—</span>;
    }
    if (v == null || v === "") return <span className="text-slate-300 text-sm">—</span>;
    if (f.type === "number") {
      const n = Number(v);
      return <span className="text-sm tabular-nums text-slate-800">{isNaN(n) ? String(v) : n.toLocaleString("th-TH")}</span>;
    }
    return <span className="text-sm text-slate-800 whitespace-pre-wrap break-words">{String(v)}</span>;
  };

  // F11: header ของ detail view
  const detailTitle = (form["name_th"] ?? form["name"] ?? form["sku_name"] ?? form["code"] ?? config.title) as string;
  const detailCode  = (form["code"] ?? form["sku"] ?? "") as string;
  const coverKey    = (form["cover_image_r2_key"] as string) || null;

  // F14: early return AFTER all hooks — กัน React error #310
  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

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
          <div className="flex items-center gap-2">
            {/* F11B: Studio button — เฉพาะหน้าที่ใช้ Field Registry + admin */}
            {config.moduleKey && canEdit && (
              <button onClick={() => setStudioOpen(true)}
                title="ลากจัด layout ฟอร์ม + บันทึกลง Field Registry"
                className="h-9 px-3 text-sm font-medium border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 inline-flex items-center gap-1.5">
                🎨 ออกแบบหน้า
              </button>
            )}
            {canCreate && (
              <button onClick={openCreate}
                className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                ＋ เพิ่ม{config.title}
              </button>
            )}
          </div>
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <DataTable
          tableId={config.tableId}
          data={rows}
          columns={columns}
          loading={loading || registryLoading}
          searchableKeys={effectiveSearchKeys as (keyof Row)[]}
          searchPlaceholder={`ค้นหา ${config.title}...`}
          views={views}
          rowActions={rowActions}
          bulkActions={bulkActions}
          bulkEditFields={bulkEditFields.length > 0 ? bulkEditFields : undefined}
          onBulkEdit={bulkEditFields.length > 0 ? onBulkEdit : undefined}
          inlineEditFields={inlineEditFields.length > 0 ? inlineEditFields : undefined}
          onInlineEdit={inlineEditFields.length > 0 ? onInlineEdit : undefined}
          exportFilename={config.apiPath}
          exportEntityType={config.exportEntityType}
          canCheck={(p) => can(p as Parameters<typeof can>[0])}
          pageSize={config.serverMode ? 50 : 20}
          onRowClick={openEdit}
          serverFetch={config.serverMode ? serverFetch : undefined}
          serverRefreshKey={config.serverMode ? serverRefresh : undefined}
        />

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      {/* F11: Drawer (slide จากขวา) — สลับ view/edit */}
      <Drawer
        open={modalOpen}
        onClose={tryClose}
        size="lg"
        hasUnsavedChanges={drawerMode === "edit" && dirty}
        title={
          drawerMode === "view"
            ? (editingId ? `${config.title}` : `เพิ่ม ${config.title}`)
            : (editingId ? `แก้ไข ${config.title}` : `เพิ่ม ${config.title}ใหม่`)
        }
        footer={
          drawerMode === "view" ? (
            <>
              <button onClick={() => setModalOpen(false)}
                className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">ปิด</button>
              {canEdit && (
                <button onClick={switchToEdit}
                  className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1.5">
                  ✎ แก้ไข
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => { if (editingId) { setDrawerMode("view"); setDirty(false); } else tryClose(); }}
                disabled={saving}
                className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {editingId ? "ยกเลิก" : "ปิด"}
              </button>
              <button onClick={save} disabled={saving}
                className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </>
          )
        }
      >
        {drawerMode === "view" ? (
          // ---- โหมดดูรายละเอียด ----
          <div className="space-y-4">
            {/* Header: รูป + ชื่อ + code */}
            <div className="flex items-start gap-4 pb-4 border-b border-slate-100">
              {coverKey && <ImageCell r2Key={coverKey} size={88} />}
              <div className="min-w-0 flex-1">
                {detailCode && (
                  <code className="inline-block text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600 mb-1">{detailCode}</code>
                )}
                <h2 className="text-lg font-semibold text-slate-900 break-words">{detailTitle}</h2>
                <div className="mt-1">
                  {form[activeField]
                    ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />เปิดอยู่</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-300" />ปิดอยู่</span>}
                </div>
              </div>
            </div>

            {detailLoading && <div className="text-xs text-slate-400">⏳ กำลังโหลดรายละเอียด...</div>}

            <DetailSections
              fields={effectiveFields.filter(f =>
                !f.hideInForm
                && f.key !== "cover_image_r2_key"
                && evaluateCondition(f.conditionRules, form)
              )}
              renderValue={renderDetailValue}
            />
          </div>
        ) : (
          // ---- โหมดแก้ไข (ฟอร์ม) ----
          <div className="space-y-4">
            {formErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}
            <FormSections
              fields={effectiveFields.filter(f => !f.hideInForm && evaluateCondition(f.conditionRules, form))}
              renderField={renderField}
            />
          </div>
        )}
      </Drawer>

      <ConfirmDialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)}
        title="ยังไม่บันทึก" message="ออกโดยไม่บันทึกหรือไม่?"
        confirmText="ออก" cancelText="อยู่ต่อ" onConfirm={discard} variant="danger" />

      <ConfirmDialog open={archiveTarget !== null} onClose={() => setArchiveTarget(null)}
        title="ปิดบัญชี" message={`ปิดบัญชี "${archiveTarget?.name as string}" ใช่ไหม?`}
        confirmText="ปิดบัญชี" cancelText="ยกเลิก" variant="danger"
        onConfirm={() => { if (archiveTarget) archive(archiveTarget); }} />

      {/* F11B: Studio v1 — drag-drop layout builder (full-screen) */}
      {studioOpen && (
        <StudioPanel
          moduleLabel={config.title}
          fields={effectiveFields
            .filter((f) => f.fieldId)
            .map<StudioField>((f) => ({
              fieldId:  f.fieldId,
              key:      f.key,
              label:    f.label,
              groupKey: f.groupKey ?? "other",
              order:    f.order ?? 999,
              type:     f.type,
            }))}
          onClose={() => setStudioOpen(false)}
          onSaved={() => {
            setStudioOpen(false);
            // reload field registry → layout ใหม่มีผลทันที
            if (config.moduleKey) {
              setRegistryLoading(true);
              apiFetch(`/api/admin/field-registry-v2?module=${encodeURIComponent(config.moduleKey)}`)
                .then((r) => r.json() as Promise<FieldRegistryV2Response>)
                .then((res) => { if (!res.error) setRegistryFields(res.fields); })
                .finally(() => setRegistryLoading(false));
            }
          }}
        />
      )}
    </PlaygroundShell>
  );
}

// ============================================================
// FormSections — Sprint 7: group fields by groupKey + collapsible
// ============================================================

function FormSections({
  fields, renderField,
}: {
  fields: FieldDef[];
  renderField: (f: FieldDef) => React.ReactNode;
}) {
  // group fields by groupKey, sort each group by order
  const grouped = useMemo(() => {
    const map = new Map<string, FieldDef[]>();
    for (const f of fields) {
      const k = f.groupKey ?? "other";
      const list = map.get(k) ?? [];
      list.push(f);
      map.set(k, list);
    }
    // sort fields within each group by order
    for (const [, list] of map) {
      list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    }
    // sort groups by GROUP_CONFIG.order
    return Array.from(map.entries()).sort(
      ([a], [b]) => getGroupConfig(a).order - getGroupConfig(b).order
    );
  }, [fields]);

  // expand state per group
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const [key] of grouped) init[key] = getGroupConfig(key).defaultOpen;
    return init;
  });

  const allExpanded = grouped.every(([k]) => expanded[k] ?? getGroupConfig(k).defaultOpen);

  return (
    <div className="space-y-3">
      {/* Expand/collapse all */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            const next: Record<string, boolean> = {};
            for (const [k] of grouped) next[k] = !allExpanded;
            setExpanded(next);
          }}
          className="text-xs text-slate-500 hover:text-orange-600 hover:underline"
        >
          {allExpanded ? "▼ ยุบทั้งหมด" : "▶ ขยายทั้งหมด"}
        </button>
      </div>
      {grouped.map(([groupKey, groupFields]) => {
        const cfg = getGroupConfig(groupKey);
        const isOpen = expanded[groupKey] ?? cfg.defaultOpen;
        return (
          <div key={groupKey} className="border border-slate-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded((p) => ({ ...p, [groupKey]: !isOpen }))}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-100"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span>{cfg.icon}</span>
                {cfg.label}
                <span className="text-xs text-slate-400 font-normal">({groupFields.length})</span>
              </span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {isOpen && (
              <div className="px-3 py-3 grid grid-cols-2 gap-3">
                {groupFields.map(renderField)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// DetailSections — F11: read-only detail view (group by section)
// ============================================================

function DetailSections({
  fields, renderValue,
}: {
  fields: FieldDef[];
  renderValue: (f: FieldDef) => React.ReactNode;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, FieldDef[]>();
    for (const f of fields) {
      const k = f.groupKey ?? "other";
      const list = map.get(k) ?? [];
      list.push(f);
      map.set(k, list);
    }
    for (const [, list] of map) list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    return Array.from(map.entries()).sort(
      ([a], [b]) => getGroupConfig(a).order - getGroupConfig(b).order
    );
  }, [fields]);

  return (
    <div className="space-y-4">
      {grouped.map(([groupKey, groupFields]) => {
        const cfg = getGroupConfig(groupKey);
        return (
          <div key={groupKey}>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {groupFields.map((f) => (
                <div key={f.key} className={f.type === "textarea" || f.type === "image" ? "col-span-2" : ""}>
                  <dt className="text-[11px] text-slate-400 mb-0.5">{f.label}</dt>
                  <dd>{renderValue(f)}</dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}
