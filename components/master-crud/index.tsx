"use client";

/**
 * MasterCRUDPage — config-driven page สำหรับ master data
 *
 * ใช้สำหรับสร้างหน้า admin ของ customers / employees / warehouses / departments / units / taxes
 * แต่ละหน้าแค่ pass config object → ได้หน้าครบ list + create + edit + soft delete + bulk + export + audit
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { PlaygroundShell, useShellPresent } from "@/components/playground-shell";
import { DataTable, type DataTableView, type RowAction, type BulkAction, type BulkEditField, type BulkEditResult, type ServerFetchParams, type FilterFieldOption } from "@/components/data-table";
import { Drawer, ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied, type Permission } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { loadValidationRules, validateValue, type ValidationRule } from "@/lib/validation";
import type { ColumnDef } from "@tanstack/react-table";
import type { FormField, FieldRegistryV2Response, FormLayout } from "@/app/api/admin/field-registry-v2/route";
import { RelationPicker, type RelationConfig } from "@/components/relation-picker";
import { ImageInput, ImageCell, ImageGallery } from "@/components/image-input";
import { FieldCreatorModal } from "@/components/field-creator";
import { LayoutEditorModal } from "@/components/layout-editor";
import { RelationMany2Many, RelationOne2Many } from "@/components/relation-multi";
import { resolveDefault, evaluateCondition } from "@/lib/field-helpers";
import dynamic from "next/dynamic";
import type { StudioField } from "@/components/master-crud/studio-panel";

// F20: lazy-load Studio (dnd-kit ~30kb) — โหลดเฉพาะตอนกด "ออกแบบหน้า"
// → ลด bundle ของ master page → startup เร็วขึ้น → กัน Worker 1102
const StudioPanel = dynamic(
  () => import("@/components/master-crud/studio-panel").then((m) => m.StudioPanel),
  { ssr: false },
);

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
    : rf.ui_field_type === "many2many" ? "many2many"
    : rf.ui_field_type === "one2many" ? "one2many"
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
    isVisible:   rf.is_visible,          // F23: Studio column toggle
    width:       rf.width,
    showInForm:  rf.show_in_form,         // F23: Studio form toggle
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
  type:       "text" | "number" | "boolean" | "select" | "textarea" | "relation" | "image" | "many2many" | "one2many";
  required?:  boolean;
  options?:   string[];                   // สำหรับ select
  placeholder?: string;
  /** help text แสดงใต้ label ใน form */
  helpText?:  string;
  /** ขนาดในตาราง (ไม่ระบุ = ซ่อนจาก table) */
  colSize?:   number;
  /** F23: แสดงใน list table (Studio toggle) */
  isVisible?: boolean;
  /** F23: ความกว้าง column (px) */
  width?:     number;
  /** F23: แสดงใน form drawer (Studio toggle) */
  showInForm?: boolean;
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
  /**
   * กลุ่ม A: โชว์ทุก column ที่ลงทะเบียนไว้เป็น default (ไม่สนใจ is_visible)
   * เหมาะกับหน้าที่ field ไม่เยอะ (skeleton/operation) — ผู้ใช้ยังซ่อนเองได้ทีหลังผ่าน Column Manager
   */
  defaultShowAllColumns?: boolean;
  /**
   * ตัวกรองตายตัว (baseFilter) — ใช้ทำ "มุมมองกรองไว้แล้ว" ของตารางเดียวกัน
   * เช่น Customers = partners ที่ is_customer=true (ผู้ใช้ลบตัวกรองนี้ไม่ได้)
   * รูปแบบเดียวกับ column filter ที่ส่งให้ API: { col: { type, value/min/max/selected } }
   */
  baseFilter?: Record<string, unknown>;
  /**
   * ค่าเริ่มต้นตอนกดสร้างใหม่ (ทับค่า default จาก Field Registry)
   * เช่น สร้างจากหน้า Customers → ตั้ง is_customer=true ให้อัตโนมัติ
   */
  createDefaults?: Record<string, unknown>;
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
  const [registryLayout, setRegistryLayout] = useState<FormLayout>(null);  // กลุ่ม B
  const [registryLoading, setRegistryLoading] = useState(!!config.moduleKey);

  useEffect(() => {
    if (!config.moduleKey) return;
    setRegistryLoading(true);
    apiFetch(`/api/admin/field-registry-v2?module=${encodeURIComponent(config.moduleKey)}`)
      .then((r) => r.json() as Promise<FieldRegistryV2Response>)
      .then((res) => {
        if (res.error) console.error("Field Registry load error:", res.error);
        else { setRegistryFields(res.fields); setRegistryLayout(res.layout ?? null); }
      })
      .catch((e) => console.error("Field Registry load failed:", e))
      .finally(() => setRegistryLoading(false));
  }, [config.moduleKey]);

  // F30: โหลดทะเบียน field ใหม่ (ใช้ซ้ำ — Studio save + toggle filterable)
  const refreshRegistry = useCallback(async () => {
    if (!config.moduleKey) return;
    setRegistryLoading(true);
    try {
      const r = await apiFetch(`/api/admin/field-registry-v2?module=${encodeURIComponent(config.moduleKey)}`);
      const res = (await r.json()) as FieldRegistryV2Response;
      if (!res.error) { setRegistryFields(res.fields); setRegistryLayout(res.layout ?? null); }
    } finally {
      setRegistryLoading(false);
    }
  }, [config.moduleKey]);

  // F30: toggle is_filterable เข้าทะเบียนกลาง (กระทบทุกคน) — จากปุ่ม "เลือก field กรอง"
  const handleSetFilterable = useCallback(async (fieldId: string, value: boolean) => {
    const r = await apiFetch("/api/admin/field-registry-v2/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [fieldId], patch: { is_filterable: value } }),
    });
    if ((await r.json()).error) throw new Error("set filterable failed");
    await refreshRegistry();
  }, [refreshRegistry]);

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

  // ข้อ 2: related fields — field ที่ดึงค่าจากตารางที่เชื่อมมาโชว์ (read-only, ไม่มี column จริง)
  const relatedFields = useMemo(
    () => (registryFields ?? []).filter((f) => f.ui_field_type === "related"),
    [registryFields],
  );
  // cache: key = "<target_module_key>.<target_field>" → { [target_id]: value }
  const relatedMapsRef = useRef<Record<string, Record<string, unknown>>>({});
  // เก็บ relatedFields ใน ref → ให้ ensureRelatedMaps/enrichRelated มี identity คงที่
  // (ไม่งั้น serverFetch/fetchList จะเปลี่ยน identity ตอน registry โหลด → DataTable refetch ซ้ำ = กระพริบ)
  const relatedFieldsRef = useRef(relatedFields);
  relatedFieldsRef.current = relatedFields;

  // โหลด map ของ target ที่ยังไม่มี (await ได้) — เรียกก่อน enrich เพื่อกันกระพริบ (ไม่ refetch ซ้ำ)
  const ensureRelatedMaps = useCallback(async () => {
    for (const f of relatedFieldsRef.current) {
      const rc = (f.relation_config ?? {}) as Record<string, unknown>;
      const tmk = String(rc.target_module_key ?? rc.target_table ?? "");
      const tf  = String(rc.target_field ?? "");
      if (!tmk || !tf) continue;
      const ck = `${tmk}.${tf}`;
      if (relatedMapsRef.current[ck]) continue;
      try {
        const j = await apiFetch(`${apiBase}${tmk}?limit=1000&include_inactive=true`).then((r) => r.json());
        const m: Record<string, unknown> = {};
        (j.data ?? []).forEach((row: Record<string, unknown>) => { m[String(row.id)] = row[tf]; });
        relatedMapsRef.current[ck] = m;
      } catch { /* related จะว่างไว้ */ }
    }
  }, [apiBase]);

  // เติมค่า related ลงใน row (ใช้ทั้ง list + detail) จาก map ที่โหลดไว้
  const enrichRelated = useCallback((list: Row[]): Row[] => {
    const rfs = relatedFieldsRef.current;
    if (rfs.length === 0) return list;
    return list.map((r) => {
      const o: Row = { ...r };
      for (const f of rfs) {
        const rc = (f.relation_config ?? {}) as Record<string, unknown>;
        const viaCol = String(rc.via_column ?? rc.via_field ?? "");
        const ck = `${rc.target_module_key ?? rc.target_table}.${rc.target_field}`;
        const m = relatedMapsRef.current[ck];
        const id = r[viaCol];
        o[f.field_key] = m && id != null ? (m[String(id)] ?? null) : (r[f.field_key] ?? null);
      }
      return o;
    });
  }, []);

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
  const [fieldCreatorOpen, setFieldCreatorOpen] = useState(false);
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);

  // ---- Fetch (client mode) ----
  const fetchList = useCallback(async () => {
    if (config.serverMode) { setLoading(false); return; }  // server mode ไม่โหลดทั้งก้อน
    setLoading(true); setError(null);
    try {
      // F19: ลด default 500 → 200 (กัน Worker 1102) — ใช้ search หา row ที่เหลือ
      const limit = config.pageLimit ?? 200;
      const bf = config.baseFilter && Object.keys(config.baseFilter).length > 0
        ? `&filters=${encodeURIComponent(JSON.stringify(config.baseFilter))}` : "";
      const res = await apiFetch(`${apiBase}${config.apiPath}?limit=${limit}&include_inactive=true${bf}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      await ensureRelatedMaps();
      setRows(enrichRelated((json.data ?? []) as Row[]));
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, [config.apiPath, apiBase, config.pageLimit, config.serverMode, config.baseFilter, enrichRelated, ensureRelatedMaps]);

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
    if (params.sortBy)  { qs.set("sort_by", params.sortBy); qs.set("sort_dir", params.sortDir ?? "asc"); }
    // F27: ส่ง column filters → server (encode เป็น JSON) + baseFilter ตายตัว (ทับไม่ได้)
    const merged = { ...(params.filters ?? {}), ...(config.baseFilter ?? {}) };
    if (Object.keys(merged).length > 0) {
      qs.set("filters", JSON.stringify(merged));
    }
    const res = await apiFetch(`${apiBase}${config.apiPath}?${qs}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    await ensureRelatedMaps();
    return { rows: enrichRelated((json.data ?? []) as Row[]), total: (json.total as number) ?? 0 };
  }, [apiBase, config.apiPath, config.baseFilter, enrichRelated, ensureRelatedMaps]);

  // ⚠ ห้าม early return ที่นี่ — จะทำให้ hooks ด้านล่าง (useMemo/useCallback อีก 8+ ตัว)
  // ไม่ถูกเรียก → React error #310 'Rendered fewer hooks than expected'
  // → ย้ายเช็ค canView ไปก่อน return JSX หลัก

  // ---- Form ops ----
  // Sprint 12: prefill defaults (static + dynamic expression)
  const emptyForm = useMemo(() => {
    const e: Record<string, unknown> = {};
    effectiveFields.forEach(f => {
      const dtype = (f.type === "many2many" || f.type === "one2many") ? "text" : f.type;
      e[f.key] = resolveDefault(dtype, f.defaultValue, f.defaultExpression, user?.email ?? null);
    });
    return e;
  }, [effectiveFields, user?.email]);

  const updateForm = (patch: Partial<Record<string, unknown>>) => {
    setForm(p => ({ ...p, ...patch })); setDirty(true);
  };

  const openCreate = () => {
    setEditingId(null); setForm({ ...emptyForm, ...(config.createDefaults ?? {}) }); setFormErr(null); setDirty(false);
    setDrawerMode("edit");   // F24: กดเพิ่ม → เข้าฟอร์มกรอกเลย (ไม่ใช่ view)
    setModalOpen(true);
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
        // ข้อ 2: เติมค่า related ลง full row ก่อน (full row ไม่มี column related)
        const [full] = enrichRelated([json.data as Row]);
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
    // กลุ่ม A: ถ้า defaultShowAllColumns → โชว์ทุก field (ใช้ width เป็น size สำรอง)
    const showAll = config.defaultShowAllColumns === true;
    const tableFields = effectiveFields.filter(f => showAll ? true : f.colSize !== undefined);
    const cols: ColumnDef<Row>[] = tableFields.map(f => ({
      id: f.key, accessorKey: f.key, header: f.label, size: f.colSize ?? f.width ?? 150,
      enableSorting: f.sortable !== false,
      meta: {
        filterable: f.filterable ?? false,
        filterType: f.filterType ?? (f.type === "number" ? "number" : f.type === "boolean" ? "boolean" : f.type === "select" ? "select" : "text"),
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

  // F30: ตัวเลือก field สำหรับปุ่ม "เลือก field กรอง"
  // จำกัดเฉพาะ field ที่เป็น column ในตาราง (colSize) — เพราะการ์ดกรองสร้างจาก column ที่โชว์
  const filterFieldOptions: FilterFieldOption[] = useMemo(() =>
    effectiveFields
      .filter(f => f.fieldId && f.colSize !== undefined)
      .map(f => ({
        fieldId:      f.fieldId!,
        key:          f.key,
        label:        f.label,
        isFilterable: f.filterable ?? false,
      })),
  [effectiveFields]);

  // กลุ่ม B: section (group) ที่มีอยู่จริง สำหรับ Layout Editor
  const sectionsForLayout = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of effectiveFields) {
      const k = f.groupKey ?? "other";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).map(([key, count]) => ({ key, label: getGroupConfig(key).label, count }));
  }, [effectiveFields]);

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
        type: (["number", "select", "boolean"].includes(f.type) ? f.type : "text") as "text" | "number" | "select" | "boolean",
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
        ) : f.type === "many2many" ? (
          <div className="mt-0.5">
            <RelationMany2Many config={(f.relationConfig ?? {}) as Record<string, string>} recordId={editingId} editable={!disabled} />
          </div>
        ) : f.type === "one2many" ? (
          <div className="mt-0.5">
            <RelationOne2Many config={(f.relationConfig ?? {}) as Record<string, string>} recordId={editingId} />
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
    if (f.type === "many2many") {
      return <RelationMany2Many config={(f.relationConfig ?? {}) as Record<string, string>} recordId={editingId} editable={false} />;
    }
    if (f.type === "one2many") {
      return <RelationOne2Many config={(f.relationConfig ?? {}) as Record<string, string>} recordId={editingId} />;
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
  // ข้อ 3: ถ้าอยู่ใต้ layout ร่วม (มี shell แล้ว) → ไม่เรนเดอร์ shell ซ้อน (sidebar นิ่ง ไม่เด้ง)
  const insideShell = useShellPresent();
  const Wrap = insideShell
    ? ({ children }: { children: React.ReactNode }) => <>{children}</>
    : PlaygroundShell;

  if (!canView) return <Wrap><AccessDenied /></Wrap>;

  return (
    <Wrap>
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
            {/* กลุ่ม B: จัด Layout (Tab/Section/columns) */}
            {config.moduleKey && canEdit && (
              <button onClick={() => setLayoutEditorOpen(true)}
                title="จัด Tab / Section / จำนวนคอลัมน์ของฟอร์ม"
                className="h-9 px-3 text-sm font-medium border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 inline-flex items-center gap-1.5">
                🗂️ Layout
              </button>
            )}
            {/* กลุ่ม C: เพิ่ม field ใหม่ (สร้าง column ใน Supabase) */}
            {config.moduleKey && canEdit && (
              <button onClick={() => setFieldCreatorOpen(true)}
                title="เพิ่ม field ใหม่ + สร้าง column จริงใน Supabase"
                className="h-9 px-3 text-sm font-medium border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 inline-flex items-center gap-1.5">
                ＋ เพิ่ม Field
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
          enableCards={!config.serverMode}
          cardConfig={!config.serverMode ? {
            image:    "cover_image_r2_key",
            primary:  effectiveSearchKeys[0] ?? "name_th",
            subtitle: "code",
          } : undefined}
          filterFieldOptions={config.moduleKey ? filterFieldOptions : undefined}
          onSetFilterable={config.moduleKey && canEdit ? handleSetFilterable : undefined}
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
        {/* F25: layout 2 คอลัมน์ — ซ้าย=รูป+core, ขวา=tabs (responsive: แคบ→ซ้อนบนล่าง) */}
        {(() => {
          const visibleFields = effectiveFields.filter(f =>
            !f.hideInForm && f.key !== "cover_image_r2_key" && evaluateCondition(f.conditionRules, form)
          );
          const coreFields = visibleFields.filter(f => (f.groupKey ?? "other") === "core");
          const tabFields  = visibleFields.filter(f => (f.groupKey ?? "other") !== "core");

          // กลุ่ม B (ตัวเลือก 3): ถ้าหน้านี้จัด Layout ไว้ → รูปบนสุด + Layout คุมทุก field (รวม core)
          const hasLayout = !!registryLayout?.tabs?.length;
          if (hasLayout) {
            const imageField = effectiveFields.find(f => f.key === "cover_image_r2_key");
            return (
              <div className="space-y-4">
                {/* รูปบนสุด เต็มกว้าง (เฉพาะหน้าที่มีรูป) */}
                {(coverKey || (drawerMode === "edit" && imageField)) && (
                  <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center" style={{ maxHeight: 260 }}>
                    {coverKey
                      ? <ImageGallery r2Key={coverKey} />
                      : imageField ? renderField(imageField) : null}
                  </div>
                )}
                {/* code + status */}
                <div className="flex items-center gap-3">
                  {detailCode && <code className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{detailCode}</code>}
                  {form[activeField]
                    ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />เปิดอยู่</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-300" />ปิดอยู่</span>}
                </div>
                {drawerMode === "edit" && formErr && (
                  <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>
                )}
                {/* Layout คุมทุก field (รวม core) */}
                {drawerMode === "view"
                  ? <DetailSections fields={visibleFields} renderValue={renderDetailValue} layout={registryLayout} />
                  : <FormSections fields={visibleFields} renderField={renderField} layout={registryLayout} />}
              </div>
            );
          }

          return (
            <div className="flex flex-col md:flex-row gap-5">
              {/* ซ้าย: รูป + core */}
              <div className="md:w-72 md:flex-shrink-0 space-y-4">
                {/* รูปใหญ่ */}
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50 aspect-square flex items-center justify-center">
                  {coverKey
                    ? <ImageGallery r2Key={coverKey} />
                    : drawerMode === "edit"
                      ? renderField(effectiveFields.find(f => f.key === "cover_image_r2_key") ?? coreFields[0])
                      : <div className="text-slate-300 text-sm">ไม่มีรูป</div>}
                </div>

                {/* code + status */}
                <div>
                  {detailCode && <code className="inline-block text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600 mb-1">{detailCode}</code>}
                  <div>
                    {form[activeField]
                      ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />เปิดอยู่</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-300" />ปิดอยู่</span>}
                  </div>
                </div>

                {/* core fields (Code/Name) — โชว์ตลอด ไม่อยู่ใน tab */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  {drawerMode === "view"
                    ? coreFields.map((f) => (
                        <div key={f.key}>
                          <div className="text-[11px] text-slate-400 mb-0.5">{f.label}</div>
                          <div>{renderDetailValue(f)}</div>
                        </div>
                      ))
                    : coreFields.map((f) => <div key={f.key}>{renderField(f)}</div>)}
                </div>
              </div>

              {/* ขวา: tabs (หมวดที่เหลือ) */}
              <div className="flex-1 min-w-0">
                {detailLoading && drawerMode === "view" && <div className="text-xs text-slate-400 mb-2">⏳ กำลังโหลด...</div>}
                {drawerMode === "edit" && formErr && (
                  <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>
                )}
                {tabFields.length > 0 ? (
                  drawerMode === "view"
                    ? <DetailSections fields={tabFields} renderValue={renderDetailValue} layout={registryLayout} />
                    : <FormSections fields={tabFields} renderField={renderField} layout={registryLayout} />
                ) : (
                  <div className="text-sm text-slate-300 py-8 text-center">ไม่มีข้อมูลเพิ่มเติม</div>
                )}
              </div>
            </div>
          );
        })()}
      </Drawer>

      <ConfirmDialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)}
        title="ยังไม่บันทึก" message="ออกโดยไม่บันทึกหรือไม่?"
        confirmText="ออก" cancelText="อยู่ต่อ" onConfirm={discard} variant="danger" />

      <ConfirmDialog open={archiveTarget !== null} onClose={() => setArchiveTarget(null)}
        title="ปิดบัญชี" message={`ปิดบัญชี "${archiveTarget?.name as string}" ใช่ไหม?`}
        confirmText="ปิดบัญชี" cancelText="ยกเลิก" variant="danger"
        onConfirm={() => { if (archiveTarget) archive(archiveTarget); }} />

      {/* กลุ่ม C: Field Creator — เพิ่ม column จริงใน Supabase */}
      {fieldCreatorOpen && config.moduleKey && (
        <FieldCreatorModal
          moduleKey={config.moduleKey}
          moduleTitle={config.title}
          onClose={() => setFieldCreatorOpen(false)}
          onCreated={() => { void refreshRegistry(); refreshData(); }}
        />
      )}

      {/* กลุ่ม B: Layout Editor — Tab/Section/columns */}
      {layoutEditorOpen && config.moduleKey && (
        <LayoutEditorModal
          moduleKey={config.moduleKey}
          moduleTitle={config.title}
          layout={registryLayout}
          sections={sectionsForLayout}
          onClose={() => setLayoutEditorOpen(false)}
          onSaved={() => { void refreshRegistry(); }}
        />
      )}

      {/* F11B: Studio v1 — drag-drop layout builder (full-screen) */}
      {studioOpen && (
        <StudioPanel
          moduleLabel={config.title}
          fields={effectiveFields
            .filter((f) => f.fieldId)
            .map<StudioField>((f) => ({
              fieldId:    f.fieldId,
              key:        f.key,
              label:      f.label,
              groupKey:   f.groupKey ?? "other",
              order:      f.order ?? 999,
              type:       f.type,
              isVisible:  f.isVisible ?? false,   // F23: column toggle
              showInForm: f.showInForm ?? false,  // F23: form toggle
            }))}
          onClose={() => setStudioOpen(false)}
          onSaved={() => {
            setStudioOpen(false);
            // reload field registry → layout ใหม่มีผลทันที
            void refreshRegistry();
          }}
        />
      )}
    </Wrap>
  );
}

// ============================================================
// FormSections — Sprint 7: group fields by groupKey + collapsible
// ============================================================

// กลุ่ม B: คลาส grid ต่อจำนวน column (static string → Tailwind ไม่ purge)
const COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };

/** จัด field เป็น Map<group_key, FieldDef[]> (sort ตาม order) */
function groupByKey(fields: FieldDef[]): Map<string, FieldDef[]> {
  const map = new Map<string, FieldDef[]>();
  for (const f of fields) {
    const k = f.groupKey ?? "other";
    const list = map.get(k) ?? [];
    list.push(f);
    map.set(k, list);
  }
  for (const [, list] of map) list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  return map;
}

/** กลุ่ม B: render ตาม layout (Tab → Section → columns) ใช้ทั้ง form + detail */
function LayoutTabs({
  layout, byGroup, renderGrid,
}: {
  layout: NonNullable<FormLayout>;
  byGroup: Map<string, FieldDef[]>;
  renderGrid: (fields: FieldDef[], columns: number) => React.ReactNode;
}) {
  const tabs = layout.tabs ?? [];
  const [active, setActive] = useState<string>(tabs[0]?.key ?? "");
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.key === active)) setActive(tabs[0].key);
  }, [tabs, active]);

  const assigned = new Set<string>();
  tabs.forEach((t) => t.sections.forEach((s) => assigned.add(s.key)));
  const leftover: FieldDef[] = [];
  byGroup.forEach((fs, g) => { if (!assigned.has(g)) leftover.push(...fs); });

  const cur = tabs.find((t) => t.key === active) ?? tabs[0];
  if (!cur) return null;

  return (
    <div>
      {tabs.length > 1 && (
        <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto scrollbar-hide">
          {tabs.map((t) => (
            <button key={t.key} type="button" onClick={() => setActive(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
                t.key === active ? "border-orange-500 text-orange-600 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}>
              {t.icon && <span>{t.icon}</span>}<span>{t.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="pt-3 space-y-4">
        {cur.sections.map((sec) => {
          const fs = byGroup.get(sec.key) ?? [];
          if (fs.length === 0) return null;
          return (
            <div key={sec.key}>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{sec.label}</h4>
              {renderGrid(fs, sec.columns || 2)}
            </div>
          );
        })}
        {active === tabs[0]?.key && leftover.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">อื่นๆ</h4>
            {renderGrid(leftover, 2)}
          </div>
        )}
      </div>
    </div>
  );
}

function FormSections({
  fields, renderField, layout,
}: {
  fields: FieldDef[];
  renderField: (f: FieldDef) => React.ReactNode;
  layout?: FormLayout;
}) {
  // hooks ทั้งหมดเรียกก่อน return เสมอ (Rules of Hooks)
  const byGroup = useMemo(() => groupByKey(fields), [fields]);
  const grouped = useMemo(() =>
    Array.from(byGroup.entries()).sort(([a], [b]) => getGroupConfig(a).order - getGroupConfig(b).order),
  [byGroup]);
  const [activeTab, setActiveTab] = useState<string>(grouped[0]?.[0] ?? "");
  useEffect(() => {
    if (grouped.length > 0 && !grouped.some(([k]) => k === activeTab)) setActiveTab(grouped[0][0]);
  }, [grouped, activeTab]);

  // กลุ่ม B: ถ้ามี layout → ใช้ Tab → Section → columns
  if (layout?.tabs?.length) {
    return <LayoutTabs layout={layout} byGroup={byGroup} renderGrid={(fs, cols) => (
      <div className={`grid ${COLS[cols] ?? "grid-cols-2"} gap-3`}>{fs.map(renderField)}</div>
    )} />;
  }

  // fallback (เดิม): group_key = tab, grid 2 คอลัมน์
  const single = grouped.length <= 1;
  const current = grouped.find(([k]) => k === activeTab) ?? grouped[0];
  return (
    <div>
      {!single && <SectionTabBar grouped={grouped} active={activeTab} onSelect={setActiveTab} />}
      {current && (
        <div className="grid grid-cols-2 gap-3 pt-3">
          {current[1].map(renderField)}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SectionTabBar — F24: tabs แนวนอน (ขีดเส้นล่าง) ใช้ทั้ง form + detail
// ============================================================

function SectionTabBar({
  grouped, active, onSelect,
}: {
  grouped: [string, FieldDef[]][];
  active: string;
  onSelect: (k: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto scrollbar-hide">
      {grouped.map(([groupKey, groupFields]) => {
        const cfg = getGroupConfig(groupKey);
        const isActive = groupKey === active;
        return (
          <button
            key={groupKey}
            type="button"
            onClick={() => onSelect(groupKey)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
              isActive
                ? "border-orange-500 text-orange-600 font-medium"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <span>{cfg.icon}</span>
            <span>{cfg.label}</span>
            <span className={`text-[10px] ${isActive ? "text-orange-400" : "text-slate-400"}`}>{groupFields.length}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// DetailSections — F11: read-only detail view (group by section)
// ============================================================

function DetailSections({
  fields, renderValue, layout,
}: {
  fields: FieldDef[];
  renderValue: (f: FieldDef) => React.ReactNode;
  layout?: FormLayout;
}) {
  const byGroup = useMemo(() => groupByKey(fields), [fields]);
  const grouped = useMemo(() =>
    Array.from(byGroup.entries()).sort(([a], [b]) => getGroupConfig(a).order - getGroupConfig(b).order),
  [byGroup]);
  const [activeTab, setActiveTab] = useState<string>(grouped[0]?.[0] ?? "");
  useEffect(() => {
    if (grouped.length > 0 && !grouped.some(([k]) => k === activeTab)) setActiveTab(grouped[0][0]);
  }, [grouped, activeTab]);

  // dl grid ตามจำนวน column
  const renderDl = (fs: FieldDef[], cols: number) => (
    <dl className={`grid ${COLS[cols] ?? "grid-cols-2"} gap-x-4 gap-y-3`}>
      {fs.map((f) => (
        <div key={f.key} className={(f.type === "textarea" || f.type === "image") && cols > 1 ? "col-span-2" : ""}>
          <dt className="text-[11px] text-slate-400 mb-0.5">{f.label}</dt>
          <dd>{renderValue(f)}</dd>
        </div>
      ))}
    </dl>
  );

  // กลุ่ม B: layout mode
  if (layout?.tabs?.length) {
    return <LayoutTabs layout={layout} byGroup={byGroup} renderGrid={renderDl} />;
  }

  // fallback (เดิม)
  const single = grouped.length <= 1;
  const current = grouped.find(([k]) => k === activeTab) ?? grouped[0];
  return (
    <div>
      {!single && <SectionTabBar grouped={grouped} active={activeTab} onSelect={setActiveTab} />}
      {current && <div className="pt-4">{renderDl(current[1], 2)}</div>}
    </div>
  );
}
