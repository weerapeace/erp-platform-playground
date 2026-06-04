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
import { resolveRelationLabels } from "@/lib/relation";
import { loadValidationRules, validateValue, type ValidationRule } from "@/lib/validation";
import type { ColumnDef } from "@tanstack/react-table";
import type { FormField, FieldRegistryV2Response, FormLayout } from "@/app/api/admin/field-registry-v2/route";
import { RelationPicker, type RelationConfig } from "@/components/relation-picker";
import { RelationPeekModal } from "@/components/relation-peek";
import { ImageInput, ImageCell, ImageGallery } from "@/components/image-input";
import { FieldCreatorModal } from "@/components/field-creator";
import { LayoutEditorModal } from "@/components/layout-editor";
import { RelationMany2Many, RelationOne2Many } from "@/components/relation-multi";
import { ImportWizard } from "@/components/import-wizard";
import { buildImportSchemaFromRegistry } from "@/lib/import";
import { useToast } from "@/components/toast";
import { resolveDefault, evaluateCondition } from "@/lib/field-helpers";
import { computeField, formatComputed, type ComputeFormat } from "@/lib/formula";
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
    const secondary = row[`${base}_secondary`];
    if (label) return (
      <span className="text-sm text-slate-700">
        {String(label)}
        {secondary != null && String(secondary) !== "" && <span className="ml-1 text-xs text-slate-400">· {String(secondary)}</span>}
      </span>
    );
    if (value) return <code className="text-xs text-slate-400" title="ยังไม่ได้ resolve label">{String(value).slice(0, 8)}...</code>;
    return <span className="text-slate-300">—</span>;
  };
}

// ข้อ 3: passthrough wrapper ระดับโมดูล (identity คงที่) — ใช้เมื่ออยู่ใต้ layout ร่วม
// เพื่อไม่ให้ subtree (ตาราง) remount ทุก render
function ShellPassthrough({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
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
    : rf.ui_field_type === "computed" ? "computed"
    : "text";

  const opts = (rf.options as { options?: string[] })?.options;
  const relCfg = rf.relation_config as RelationConfig | undefined;
  const key = rf.column_name ?? rf.field_key;
  const customRender = cellRenderers?.[key];

  // computed: อ่านสูตร/รูปแบบจาก relation_config (เก็บไว้ที่นั่นเพื่อเลี่ยง migrate DB)
  const compCfg = rf.relation_config as { kind?: string; formula?: string; format?: ComputeFormat; decimals?: number; summary?: boolean } | undefined;
  const isComputed = fieldType === "computed";
  const compFormula  = isComputed ? compCfg?.formula : undefined;
  const compFormat   = isComputed ? (compCfg?.format ?? "number") : undefined;
  const compDecimals = isComputed ? (compCfg?.decimals ?? 2) : undefined;

  // default cellRender
  const effectiveCellRender: ((v: unknown, row?: Record<string, unknown>) => React.ReactNode) | undefined =
    customRender
      ?? (isComputed
          ? (_v: unknown, row?: Record<string, unknown>) => {
              const n = computeField(compFormula, (row ?? {}) as Record<string, unknown>);
              return <span className="text-sm tabular-nums text-slate-800">{formatComputed(n, compFormat, compDecimals)}</span>;
            }
          : fieldType === "relation"
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
    bulkEditable:      rf.is_bulk_editable,
    // Sprint 13
    conditionRules:    rf.condition_rules ?? null,
    // Studio style presets
    uiStyle:           (rf.ui_style as Record<string, unknown>) ?? undefined,
    // computed field
    formula:         compFormula,
    computeFormat:   compFormat,
    computeDecimals: compDecimals,
    summarize:       isComputed ? !!compCfg?.summary : undefined,
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

// ---- Status summary cards (ของกลาง) ----
// แปลงค่าสถานะ (technical) → ชื่อไทย + สี — ครอบคลุมสถานะที่พบบ่อยในหลายโมดูล
// ค่าที่ไม่รู้จัก → ใช้ค่าดิบ + สี neutral
const STATUS_META: Record<string, { label: string; ring: string; bg: string; text: string; dot: string }> = {
  draft:       { label: "ร่าง",          ring: "ring-slate-300",   bg: "bg-slate-50",   text: "text-slate-600",   dot: "bg-slate-400" },
  waiting:     { label: "รอสั่งซื้อ",     ring: "ring-amber-300",   bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500" },
  pending:     { label: "รอดำเนินการ",   ring: "ring-amber-300",   bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500" },
  submitted:   { label: "ส่งแล้ว",        ring: "ring-sky-300",     bg: "bg-sky-50",     text: "text-sky-700",     dot: "bg-sky-500" },
  rfq_created: { label: "สั่งซื้อแล้ว",   ring: "ring-blue-300",    bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500" },
  confirmed:   { label: "ยืนยันแล้ว",    ring: "ring-blue-300",    bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500" },
  partial:     { label: "รับบางส่วน",     ring: "ring-amber-300",   bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500" },
  short_closed:{ label: "ปิดยอด (ขาด)",  ring: "ring-orange-300",  bg: "bg-orange-50",  text: "text-orange-700",  dot: "bg-orange-500" },
  approved:    { label: "อนุมัติแล้ว",   ring: "ring-emerald-300", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  received:    { label: "รับของแล้ว",    ring: "ring-emerald-300", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  done:        { label: "เสร็จสิ้น",      ring: "ring-emerald-300", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  completed:   { label: "เสร็จสิ้น",      ring: "ring-emerald-300", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  rejected:    { label: "ปฏิเสธ",         ring: "ring-red-300",     bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500" },
  cancelled:   { label: "ยกเลิก",         ring: "ring-red-300",     bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500" },
};
const statusMeta = (v: string) => STATUS_META[v] ?? { label: v, ring: "ring-slate-300", bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400" };

function StatusCards({
  options, counts, total, active, onPick,
}: {
  options: string[];
  counts: Record<string, number>;
  total: number;
  active: string | null;
  onPick: (v: string | null) => void;
}) {
  const card = (key: string | null, label: string, count: number, m?: ReturnType<typeof statusMeta>) => {
    const on = active === key;
    return (
      <button key={key ?? "__all__"} type="button" onClick={() => onPick(on ? null : key)}
        className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border bg-white transition-all
          ${on ? `ring-2 ${m?.ring ?? "ring-blue-400"} border-transparent` : "border-slate-200 hover:border-slate-300"}`}>
        {m ? <span className={`w-2 h-2 rounded-full ${m.dot}`} /> : <span className="w-2 h-2 rounded-full bg-slate-300" />}
        <div className="text-left leading-tight">
          <div className={`text-lg font-semibold tabular-nums ${m?.text ?? "text-slate-700"}`}>{count.toLocaleString()}</div>
          <div className="text-[11px] text-slate-500">{label}</div>
        </div>
      </button>
    );
  };
  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {card(null, "ทั้งหมด", total)}
      {options.map((o) => card(o, statusMeta(o).label, counts[o] ?? 0, statusMeta(o)))}
    </div>
  );
}

// ---- Field types ----

export type FieldDef = {
  key:        string;
  /** F11B: erp_module_fields.id — ใช้ตอน Studio บันทึก layout (group/order) */
  fieldId?:   string;
  label:      string;
  type:       "text" | "number" | "boolean" | "select" | "textarea" | "relation" | "image" | "many2many" | "one2many" | "computed";
  /** computed: สูตรคำนวณ เช่น "qty * price_est" (อ้างชื่อ field ในระเบียนเดียวกัน) */
  formula?:   string;
  /** computed: รูปแบบผลลัพธ์ */
  computeFormat?: ComputeFormat;
  /** computed: จำนวนทศนิยม */
  computeDecimals?: number;
  /** computed: แสดงผลรวม (sum) ท้ายคอลัมน์ในตาราง */
  summarize?: boolean;
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
  /** Studio style presets (ขนาด/หนา/เอียง/ขีดเส้นใต้/สี/ฟอนต์/จัดชิด/ไฮไลต์) */
  uiStyle?:   Record<string, unknown>;
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
   * อ่านอย่างเดียว — ซ่อนปุ่มสร้าง/แก้/ลบ (ใช้กับหน้าแสดงข้อมูลที่คำนวณแล้ว
   * เช่น payroll lines / payslips ที่ห้ามแก้ตรง ๆ) — ของกลาง
   */
  readOnly?: boolean;
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
  /**
   * bulk action เพิ่มเติม (เช่น "สร้างใบสั่งซื้อ" บนหน้า PR) — ของกลาง
   * ระบบจะ refresh ตารางให้อัตโนมัติหลัง onClick เสร็จ
   */
  extraBulkActions?: Array<{
    label: string;
    onClick: (selected: Record<string, unknown>[]) => Promise<void> | void;
    variant?: "default" | "danger";
  }>;
};

type Row = Record<string, unknown> & { id: string; active?: boolean };

// ============================================================
// MasterCRUDPage component
// ============================================================

export function MasterCRUDPage({ config }: { config: MasterCRUDConfig }) {
  const canView   = usePermission(config.permissions.view);
  const canCreate = usePermission(config.permissions.create) && !config.readOnly;
  const canEdit   = usePermission(config.permissions.edit)   && !config.readOnly;
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

  // โหลดค่า related "เฉพาะ id ที่อยู่ในแถวหน้านี้" (เร็ว ไม่โหลดทั้งตาราง) + cache ต่อ id
  // เรียกก่อน enrich เพื่อกันกระพริบ — id ที่เคยโหลดแล้วจะไม่ดึงซ้ำ
  const ensureRelatedMaps = useCallback(async (rowsToResolve: Row[]) => {
    const CHUNK = 80;  // กัน URL ยาวเกิน (include_ids)
    const resolveInChunks = async (cfg: { target_table: string; target_label_field: string }, ids: string[]) => {
      const out = new Map<string, { label: string }>();
      for (let i = 0; i < ids.length; i += CHUNK) {
        const part = await resolveRelationLabels(apiFetch, cfg, ids.slice(i, i + CHUNK));
        part.forEach((v, k) => out.set(k, v));
      }
      return out;
    };
    for (const f of relatedFieldsRef.current) {
      const rc = (f.relation_config ?? {}) as Record<string, unknown>;
      const targetTable = String(rc.target_table ?? "");
      const tmk = String(rc.target_module_key ?? rc.target_table ?? "");
      const tf  = String(rc.target_field ?? "");
      const viaCol = String(rc.via_column ?? rc.via_field ?? "");
      if (!targetTable || !tf || !viaCol) continue;
      const ck = `${tmk}.${tf}`;
      const cache = (relatedMapsRef.current[ck] ??= {} as Record<string, unknown>);
      // id ที่ต้องการ (เฉพาะแถวหน้านี้) ที่ยังไม่มีใน cache
      const need = Array.from(new Set(
        rowsToResolve.map((r) => r[viaCol]).filter((v) => v != null && v !== "").map((v) => String(v)),
      )).filter((id) => !(id in cache));
      if (need.length === 0) continue;
      try {
        // hop 1: parent id → ค่า target_field (เช่น brand_id)
        const parentMap = await resolveInChunks({ target_table: targetTable, target_label_field: tf }, need);
        const idToVal: Record<string, string | null> = {};
        need.forEach((id) => { idToVal[id] = parentMap.get(id)?.label ?? null; });
        // hop 2 (ถ้ามี resolve_table): ค่า FK → ชื่อ (เช่น brand_id → brands.name)
        const resolveTable = String(rc.resolve_table ?? "");
        const resolveLabel = String(rc.resolve_label ?? "");
        if (resolveTable && resolveLabel) {
          const vals = Array.from(new Set(Object.values(idToVal).filter(Boolean).map((v) => String(v))));
          const valMap = vals.length ? await resolveInChunks({ target_table: resolveTable, target_label_field: resolveLabel }, vals) : new Map();
          for (const id of need) { const v = idToVal[id]; idToVal[id] = v ? (valMap.get(String(v))?.label ?? null) : null; }
        }
        Object.assign(cache, idToVal);
      } catch { /* related จะว่างไว้ */ }
    }
  }, []);

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

  // archive (soft) — เก็บไว้เผื่อ flow อื่น
  const [archiveTarget, setArchiveTarget] = useState<Row | null>(null);
  // delete dialog (ลบชั่วคราว / ลบถาวร)
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deleteMode, setDeleteMode] = useState<"soft" | "hard">("soft");
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // toast กลาง (ของกลาง) — flash = สำเร็จ, fail = ผิดพลาด
  const notify = useToast();
  const flash = (m: string) => notify.success(m);
  const fail = (m: string) => notify.error(m);

  // F19: refresh trigger สำหรับ server mode (เพิ่มค่า → DataTable โหลดหน้าใหม่)
  const [serverRefresh, setServerRefresh] = useState(0);

  // กดดู record ที่เชื่อม (relation) แบบ popup ซ้อน
  const [peek, setPeek] = useState<{ moduleKey: string; id: string } | null>(null);

  // การ์ดสรุปสถานะ (ของกลาง) — กรองตาราง client-side ตามสถานะที่กด
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // reverse one2many อัตโนมัติ (ของกลาง) — relation จากโมดูลอื่นที่ชี้กลับมาหาโมดูลนี้
  type ReverseRel = { source_module_key: string; source_label: string; fk_column: string; label_field: string; sub_fields: string[]; image_field: string | null };
  const [reverseRels, setReverseRels] = useState<ReverseRel[]>([]);
  useEffect(() => {
    if (!config.moduleKey) { setReverseRels([]); return; }
    let alive = true;
    apiFetch(`/api/admin/reverse-relations?module=${config.moduleKey}`).then((r) => r.json()).then((j) => {
      if (alive && Array.isArray(j.data)) setReverseRels(j.data as ReverseRel[]);
    }).catch(() => {});
    return () => { alive = false; };
  }, [config.moduleKey]);

  // F11B: Studio v1 (drag-drop layout builder)
  const [studioOpen, setStudioOpen] = useState(false);
  const [fieldCreatorOpen, setFieldCreatorOpen] = useState(false);
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);   // นำเข้าข้อมูล (ของกลาง)
  const [toolsOpen, setToolsOpen] = useState(false);     // เมนู "ปรับแต่ง" (ยุบปุ่ม admin)

  // ตัวกรองจากลิงก์ (?flt=<json>) — เปิดหน้าแบบกรองไว้ล่วงหน้า เช่นจากปุ่ม "จัดการกลุ่ม"
  // ต่างจาก baseFilter ตรงที่ "ล้างได้" (ผู้ใช้กดล้างเพื่อดู/เพิ่มสมาชิกนอกกลุ่มได้)
  const [urlFilter, setUrlFilter] = useState<Record<string, unknown>>({});

  // ---- Fetch (client mode) ----
  const fetchList = useCallback(async () => {
    if (config.serverMode) { setLoading(false); return; }  // server mode ไม่โหลดทั้งก้อน
    setLoading(true); setError(null);
    try {
      // F19: ลด default 500 → 200 (กัน Worker 1102) — ใช้ search หา row ที่เหลือ
      const limit = config.pageLimit ?? 200;
      const mergedBf = { ...urlFilter, ...(config.baseFilter ?? {}) };
      const bf = Object.keys(mergedBf).length > 0
        ? `&filters=${encodeURIComponent(JSON.stringify(mergedBf))}` : "";
      const res = await apiFetch(`${apiBase}${config.apiPath}?limit=${limit}&include_inactive=true${bf}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const raw = (json.data ?? []) as Row[];
      await ensureRelatedMaps(raw);
      setRows(enrichRelated(raw));
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, [config.apiPath, apiBase, config.pageLimit, config.serverMode, config.baseFilter, urlFilter, enrichRelated, ensureRelatedMaps]);

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
    // F27: ส่ง column filters → server (encode เป็น JSON) + urlFilter (จากลิงก์) + baseFilter ตายตัว (ทับไม่ได้)
    const merged = { ...(params.filters ?? {}), ...urlFilter, ...(config.baseFilter ?? {}) };
    if (Object.keys(merged).length > 0) {
      qs.set("filters", JSON.stringify(merged));
    }
    const res = await apiFetch(`${apiBase}${config.apiPath}?${qs}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    const raw = (json.data ?? []) as Row[];
    await ensureRelatedMaps(raw);
    return { rows: enrichRelated(raw), total: (json.total as number) ?? 0 };
  }, [apiBase, config.apiPath, config.baseFilter, urlFilter, enrichRelated, ensureRelatedMaps]);

  // ⚠ ห้าม early return ที่นี่ — จะทำให้ hooks ด้านล่าง (useMemo/useCallback อีก 8+ ตัว)
  // ไม่ถูกเรียก → React error #310 'Rendered fewer hooks than expected'
  // → ย้ายเช็ค canView ไปก่อน return JSX หลัก

  // ---- Form ops ----
  // Sprint 12: prefill defaults (static + dynamic expression)
  const emptyForm = useMemo(() => {
    const e: Record<string, unknown> = {};
    effectiveFields.forEach(f => {
      // many2many/one2many/computed ไม่มี default ที่ resolveDefault รองรับ → fallback เป็น text
      const dtype = (f.type === "many2many" || f.type === "one2many" || f.type === "computed") ? "text" : f.type;
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
      .then(async (json) => {
        if (json.error || !json.data) return;
        // ข้อ 2: เติมค่า related ลง full row ก่อน (full row ไม่มี column related)
        await ensureRelatedMaps([json.data as Row]);
        const [full] = enrichRelated([json.data as Row]);
        const f: Record<string, unknown> = {};
        effectiveFields.forEach((field) => {
          const v = full[field.key];
          f[field.key] = v == null ? (field.type === "boolean" ? false : "") : v;
          // เก็บชื่อ (label) ของ relation ไว้โชว์ใน detail (ไม่ใช่รหัส) — รองรับคอลัมน์ที่ไม่ลงท้าย _id ด้วย (เช่น product_group)
          if (field.type === "relation") {
            const base = field.key.endsWith("_id") ? field.key.slice(0, -3) : field.key;
            for (const suf of ["_label", "_name"]) {
              const lk = base + suf;
              if (lk in full) f[lk] = full[lk];
            }
          }
        });
        setForm(f);
      })
      .catch(() => { /* keep partial — ดีกว่าค้าง */ });
  };
  // เปิด record อัตโนมัติจาก ?open=<id> (เช่นกด "เปิดหน้าเต็ม" จาก popup relation)
  // อ่านจาก window.location เพื่อเลี่ยง useSearchParams ที่ต้องมี Suspense (พังตอน prerender)
  const autoOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canView || typeof window === "undefined") return;
    const openParam = new URLSearchParams(window.location.search).get("open");
    if (!openParam || autoOpenedRef.current === openParam) return;
    autoOpenedRef.current = openParam;
    setDrawerMode("view");
    openEdit({ id: openParam } as Row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  // อ่านตัวกรองจากลิงก์ ?flt=<json> ครั้งเดียวตอนเข้า → กรองไว้ล่วงหน้า (ล้างได้)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const flt = new URLSearchParams(window.location.search).get("flt");
    if (!flt) return;
    try {
      const parsed = JSON.parse(flt);
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) setUrlFilter(parsed as Record<string, unknown>);
    } catch { /* ignore */ }
  }, []);
  // เมื่อ urlFilter เปลี่ยน (ตั้ง/ล้าง) → ดึงข้อมูลใหม่ (server mode bump key / client refetch)
  const urlFilterKey = JSON.stringify(urlFilter);
  useEffect(() => {
    if (urlFilterKey !== "{}") void refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFilterKey]);
  const clearUrlFilter = () => {
    setUrlFilter({});
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href); u.searchParams.delete("flt");
      window.history.replaceState({}, "", u.toString());
    }
    void refreshData();
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
      // field เสมือน (ไม่มีคอลัมน์จริงในตาราง) — ห้ามส่งไป insert/update ไม่งั้น PostgREST error
      const VIRTUAL_TYPES = new Set(["computed", "one2many", "many2many"]);
      effectiveFields.forEach((f) => {
        if (f.hideInForm) return;
        if (f.readonly) return;            // read-only / related (เช่น seller_country_rel) = ค่าที่ดึงมาโชว์ ไม่ใช่คอลัมน์ที่แก้ได้
        if (VIRTUAL_TYPES.has(f.type)) return;
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
            // เก็บชื่อ relation มาโชว์หลังบันทึก (รองรับคอลัมน์ที่ไม่ลงท้าย _id)
            if (fd.type === "relation") {
              const base = fd.key.endsWith("_id") ? fd.key.slice(0, -3) : fd.key;
              for (const suf of ["_label", "_name"]) { const lk = base + suf; if (lk in full) f[lk] = full[lk]; }
            }
          });
          setForm(f);
        }
        setDrawerMode("view");
      } else {
        setModalOpen(false);
      }
      await refreshData();
    } catch (err) { const m = err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"; setFormErr(m); fail(m); }
    finally { setSaving(false); }
  };

  const rowLabel = (r: Row) => String(r.name_th ?? r.name ?? r.code ?? r.sku ?? r.label ?? r.title ?? r.id);

  // ลบชั่วคราว (soft) / ลบถาวร (hard) — จากกล่อง deleteTarget
  const doDelete = async () => {
    if (!deleteTarget) return;
    if (deleteMode === "hard" && deleteText.trim() !== "ลบ") { setError('พิมพ์คำว่า "ลบ" เพื่อยืนยันการลบถาวร'); return; }
    setDeleting(true); setError(null);
    try {
      const url = `${apiBase}${config.apiPath}/${deleteTarget.id}?actor=${encodeURIComponent(user?.name ?? "")}${deleteMode === "hard" ? "&hard=1" : ""}`;
      const res = await apiFetch(url, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(deleteMode === "hard" ? "ลบถาวรแล้ว" : "ลบแล้ว (กู้คืนได้)");
      setDeleteTarget(null); setDeleteMode("soft"); setDeleteText("");
      await refreshData();
    } catch (err) { const m = err instanceof Error ? err.message : "ลบไม่สำเร็จ"; setError(m); fail(m); }
    finally { setDeleting(false); }
  };
  const openDelete = (r: Row) => { setDeleteTarget(r); setDeleteMode("soft"); setDeleteText(""); setError(null); };
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
    // default ทุกตาราง = โชว์ทุกคอลัมน์ (owner ต้องการเห็นครบ) — หน้าไหนอยากจำกัดให้ตั้ง defaultShowAllColumns:false
    const showAll = config.defaultShowAllColumns !== false;
    // one2many/many2many = ลิสต์ความสัมพันธ์ → ไม่เหมาะเป็นคอลัมน์ตาราง (ดูเต็มในหน้า detail)
    const tableFields = effectiveFields
      .filter(f => f.type !== "one2many" && f.type !== "many2many")
      .filter(f => showAll ? true : f.colSize !== undefined);
    const cols: ColumnDef<Row>[] = tableFields.map(f => ({
      id: f.key, accessorKey: f.key, header: f.label, size: f.colSize ?? f.width ?? 150,
      enableSorting: f.sortable !== false,
      meta: {
        filterable: f.filterable ?? false,
        filterType: f.filterType ?? (f.type === "number" ? "number" : f.type === "boolean" ? "boolean" : f.type === "select" ? "select" : "text"),
        ...(f.type === "select" && f.options ? { filterOptions: f.options.map(o => ({ value: o, label: o })) } : {}),
        // computed + ตั้ง "แสดงผลรวมท้ายตาราง" → sum สูตรทุกแถวในหน้านี้
        ...(f.type === "computed" && f.summarize
          ? { summary: (rows: unknown[]) => formatComputed(
              (rows as Record<string, unknown>[]).reduce((a, r) => a + (computeField(f.formula, r) ?? 0), 0),
              f.computeFormat, f.computeDecimals) }
          : f.type === "number" && f.summarize ? { summary: "sum" as const } : {}),
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
    { id: "active",   label: "เปิดอยู่",  filter: (r) => r[activeField] === true,
      serverFilter: { [activeField]: { type: "boolean", value: "true" } } },
    { id: "all",      label: "ทั้งหมด",   filter: () => true },
    { id: "inactive", label: "ปิดอยู่",   filter: (r) => r[activeField] === false,
      serverFilter: { [activeField]: { type: "boolean", value: "false" } } },
  ], [activeField]);

  // ---- Row actions ----
  const rowActions: RowAction<Row>[] = useMemo(() => {
    const acts: RowAction<Row>[] = [{ label: "ดู / แก้", icon: "✎", onClick: openEdit }];
    if (canEdit) {
      acts.push({ label: "กู้คืน", icon: "↩", onClick: restore, show: (r: Row) => !r[activeField] });
      acts.push({ label: "ลบ", icon: "🗑", onClick: openDelete, variant: "danger" });
    }
    return acts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, activeField]);

  // ---- Bulk archive ----
  const bulkActions: BulkAction<Row>[] = useMemo(() => {
    // bulk action เพิ่มเติมจาก config (เช่น สร้างใบสั่งซื้อ) — wrap ให้ refresh อัตโนมัติ
    const extra: BulkAction<Row>[] = (config.extraBulkActions ?? []).map((a) => ({
      label: a.label,
      variant: a.variant,
      onClick: async (selected: Row[]) => { await a.onClick(selected); await refreshData(); },
    }));
    const base: BulkAction<Row>[] = canEdit ? [
      {
        label: "🗑 ลบที่เลือก (ชั่วคราว)",
        onClick: async (selected: Row[]) => {
          if (!confirm(`ลบชั่วคราว ${selected.length} ราย? (ซ่อนไว้ กู้คืนได้)`)) return;
          for (const r of selected) {
            await apiFetch(`${apiBase}${config.apiPath}/${r.id}?actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
          }
          flash(`ลบชั่วคราว ${selected.length} ราย`);
          await refreshData();
        },
      },
      {
        label: "🔴 ลบถาวรที่เลือก",
        variant: "danger",
        onClick: async (selected: Row[]) => {
          const ans = window.prompt(`⚠ ลบถาวร ${selected.length} ราย — ลบจริงออกจากระบบ กู้คืนไม่ได้!\n\nพิมพ์ "ลบ" เพื่อยืนยัน:`);
          if (ans == null) return;
          if (ans.trim() !== "ลบ") { setError('ยกเลิก: ต้องพิมพ์ "ลบ" ให้ตรงเพื่อยืนยันลบถาวร'); return; }
          let ok = 0; const fails: string[] = [];
          for (const r of selected) {
            try {
              const res = await apiFetch(`${apiBase}${config.apiPath}/${r.id}?hard=1&actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
              const j = await res.json();
              if (j.error) fails.push(j.error); else ok++;
            } catch (e) { fails.push(String((e as Error).message ?? e)); }
          }
          flash(`ลบถาวร ${ok} ราย${fails.length ? ` · ล้มเหลว ${fails.length}` : ""}`);
          if (fails.length) fail(`ลบถาวรไม่สำเร็จ ${fails.length} ราย: ${fails[0]}`);
          await refreshData();
        },
      },
    ] : [];
    return [...extra, ...base];
  }, [canEdit, user?.name, apiBase, config.apiPath, config.extraBulkActions, refreshData]);

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

  // Quick edit ในหน้า detail (view mode) — บันทึกทันทีผ่าน onInlineEdit + อัปเดต form
  const quickSave = useCallback(async (field: string, value: string): Promise<string | null> => {
    if (!editingId) return "ยังไม่มีระเบียน";
    const err = await onInlineEdit({ id: editingId } as Row, field, value);
    if (!err) {
      const def = effectiveFields.find((f) => f.key === field);
      const coerced: unknown = def?.type === "boolean" ? (value === "true")
        : def?.type === "number" ? (value === "" ? null : Number(value))
        : (value === "" ? "" : value);
      setForm((p) => ({ ...p, [field]: coerced }));
    }
    return err;
  }, [editingId, onInlineEdit, effectiveFields]);

  // ---- Bulk edit fields ----
  // Bulk edit (ของกลาง): ตั้งค่ารายฟิลด์ใน Studio (toggle) — เก็บใน registry (is_bulk_editable)
  // ไม่ derive/hardcode รายชื่อ field ในโค้ด → admin คุมเองว่าจะให้แก้ field ไหนแบบ bulk
  const bulkEditFields: BulkEditField[] = useMemo(() => {
    if (!canEdit) return [];
    return effectiveFields
      .filter((f) => f.bulkEditable === true && ["text", "number", "boolean", "select", "relation"].includes(f.type) && (f.type !== "relation" || !!f.relationConfig))
      .map((f) => ({
        key: f.key,
        label: f.label,
        type: (["number", "select", "boolean", "relation"].includes(f.type) ? f.type : "text") as BulkEditField["type"],
        options: f.type === "select" && f.options ? f.options.map((o) => ({ value: o, label: o })) : undefined,
        relationConfig: f.type === "relation" ? f.relationConfig : undefined,
      }));
  }, [canEdit, effectiveFields]);

  const onBulkEdit = useCallback(async (
    edits: { row: Row; changes: Record<string, unknown> }[]
  ): Promise<BulkEditResult> => {
    const total = edits.length;
    if (total === 0) { flash("ไม่มีรายการที่เปลี่ยน"); return { success: 0, failed: 0 }; }
    try {
      // ยิงครั้งเดียว — server จัดกลุ่มแถวที่ค่าเหมือนกันแล้ว UPDATE ทีละกลุ่ม (เร็วกว่ายิงทีละแถวมาก)
      const res = await apiFetch(`${apiBase}${config.apiPath}/bulk-update`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits: edits.map((e) => ({ id: e.row.id, changes: e.changes })), actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); fail(json.error); return { success: 0, failed: total }; }
      const success = (json.affected as number) ?? total;
      await refreshData();
      flash(`แก้ ${success} ราย`);
      return { success, failed: total - success };
    } catch (e) {
      const m = e instanceof Error ? e.message : "บันทึกไม่สำเร็จ";
      setError(m); fail(m);
      return { success: 0, failed: total };
    }
  }, [apiBase, config.apiPath, user?.name, refreshData]);

  // แก้ "ทั้งหมดที่ตรงตัวกรอง" (server mode) — ยิง bulk-update ฝั่ง server
  const onBulkEditAllMatching = useCallback(async (
    changes: Record<string, unknown>,
    scope: { search: string; filters: Record<string, unknown> },
  ): Promise<{ affected: number }> => {
    const res = await apiFetch(`${apiBase}${config.apiPath}/bulk-update`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes, search: scope.search, filters: scope.filters, base_filter: config.baseFilter, actor: user?.name }),
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error);
    await refreshData();
    flash(`แก้ ${j.affected ?? 0} รายการ (ทั้งหมดที่ตรง)`);
    return { affected: (j.affected as number) ?? 0 };
  }, [apiBase, config.apiPath, config.baseFilter, user?.name, refreshData]);

  // ---- Render form field ----
  // ---- Status summary cards (ของกลาง) ----
  // หา field สถานะ (select ที่ชื่อ 'status') + นับจำนวนจาก rows ที่โหลด (client mode)
  const statusField = useMemo(
    () => effectiveFields.find((f) => f.key === "status" && f.type === "select" && (f.options?.length ?? 0) > 0),
    [effectiveFields],
  );
  const showStatusCards = !config.serverMode && !!statusField;
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    if (!statusField) return c;
    for (const r of rows) { const v = String(r[statusField.key] ?? ""); if (v) c[v] = (c[v] ?? 0) + 1; }
    return c;
  }, [rows, statusField]);
  const displayRows = useMemo(
    () => (showStatusCards && statusFilter && statusField)
      ? rows.filter((r) => String(r[statusField.key] ?? "") === statusFilter)
      : rows,
    [rows, showStatusCards, statusFilter, statusField],
  );

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
    // Studio style presets → CSS (ปรับขนาด/หนา/เอียง/สี/ฟอนต์/จัดชิด/ไฮไลต์ จาก ui_style)
    const us = (f.uiStyle ?? {}) as Record<string, unknown>;
    const SZ: Record<string, string> = { sm: "12px", base: "14px", lg: "16px", xl: "20px" };
    const FF: Record<string, string> = { serif: "Georgia, 'Times New Roman', serif", mono: "ui-monospace, 'Courier New', monospace" };
    const tStyle: React.CSSProperties = {
      fontSize: SZ[String(us.size ?? "")] || undefined,
      fontWeight: us.bold ? 700 : undefined,
      fontStyle: us.italic ? "italic" : undefined,
      textDecoration: us.underline ? "underline" : undefined,
      color: typeof us.color === "string" && us.color ? us.color : undefined,
      fontFamily: FF[String(us.font ?? "")] || undefined,
      textAlign: (["left", "center", "right"].includes(String(us.align)) ? (us.align as "left" | "center" | "right") : undefined),
    };
    const highlight = !!us.highlight;
    return (
      <label key={f.key} className={`block ${f.formSpan === 2 ? "col-span-2" : ""} ${highlight ? "bg-amber-50 border border-amber-200 rounded-lg p-2" : ""}`}>
        <span className="text-xs font-medium text-slate-600" style={tStyle}>
          {f.label}
          {f.required && <span className="text-red-500 ml-0.5">*</span>}
          {f.readonly && <span className="ml-1 text-[10px] text-slate-400">(read-only)</span>}
        </span>
        {f.helpText && <div className="text-[11px] text-slate-400 mt-0.5">{f.helpText}</div>}
        {f.type === "computed" ? (
          <div className="h-9 mt-0.5 flex items-center px-3 text-sm tabular-nums text-slate-700 bg-slate-50 border border-slate-200 rounded-md">
            {formatComputed(computeField(f.formula, form), f.computeFormat, f.computeDecimals)}
            <span className="ml-2 text-[10px] text-slate-400">∑ คำนวณอัตโนมัติ</span>
          </div>
        ) : f.type === "image" ? (
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
              siblingValues={form}
            />
          </div>
        ) : f.type === "many2many" ? (
          <div className="mt-0.5">
            <RelationMany2Many config={(f.relationConfig ?? {}) as Record<string, string>} recordId={editingId} editable={!disabled} />
          </div>
        ) : f.type === "one2many" ? (
          <div className="mt-0.5">
            <RelationOne2Many config={(f.relationConfig ?? {}) as Record<string, string>} recordId={editingId} fieldId={f.fieldId} configurable={canEdit} />
          </div>
        ) : f.type === "select" ? (
          <select value={(v as string) || ""} disabled={disabled}
            onChange={e => updateForm({ [f.key]: e.target.value })}
            style={tStyle}
            className={`${common} bg-white`}>
            <option value="">— เลือก —</option>
            {f.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        ) : f.type === "textarea" ? (
          <textarea value={(v as string) || ""} disabled={disabled}
            onChange={e => updateForm({ [f.key]: e.target.value })}
            rows={3} placeholder={f.placeholder} style={tStyle}
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
            style={tStyle}
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
  // wrapper: เติมปุ่มคัดลอกค่า ถ้า field ตั้ง ui_style.copyable
  const renderDetailValue = (f: FieldDef): React.ReactNode => {
    const node = renderDetailValueInner(f);
    const copyable = !!(f.uiStyle as Record<string, unknown> | undefined)?.copyable;
    if (!copyable) return node;
    const raw = form[f.key];
    if (raw == null || raw === "") return node;
    return <span className="inline-flex items-center gap-1">{node}<CopyValueBtn text={String(raw)} /></span>;
  };

  const renderDetailValueInner = (f: FieldDef): React.ReactNode => {
    const v = form[f.key];
    const vs = fieldStyleCss(f.uiStyle);   // สไตล์จาก Studio (ใช้กับค่าในหน้า detail)
    // Quick edit: field ที่ตั้ง inline + แก้ได้ + ชนิดง่ายๆ → กดแก้ได้เลยในหน้า detail
    if (drawerMode === "view" && editingId && canEdit && f.inlineEditable && !f.readonly
        && (f.type === "text" || f.type === "number" || f.type === "boolean" || f.type === "select")) {
      return <QuickEditCell field={f} value={v} onSave={(val) => quickSave(f.key, val)} />;
    }
    if (f.type === "computed") {
      const n = computeField(f.formula, form);
      return <span className="text-sm tabular-nums font-medium text-slate-800" style={vs}>{formatComputed(n, f.computeFormat, f.computeDecimals)}</span>;
    }
    if (f.type === "image") {
      return <ImageCell r2Key={(v as string) || null} size={160} />;
    }
    if (f.type === "many2many") {
      return <RelationMany2Many config={(f.relationConfig ?? {}) as Record<string, string>} recordId={editingId} editable={false} />;
    }
    if (f.type === "one2many") {
      return <RelationOne2Many config={(f.relationConfig ?? {}) as Record<string, string>} recordId={editingId} fieldId={f.fieldId} configurable={canEdit} />;
    }
    if (f.type === "boolean") {
      return v
        ? <span className="inline-flex items-center gap-1 text-sm text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />เปิด</span>
        : <span className="inline-flex items-center gap-1 text-sm text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-300" />ปิด</span>;
    }
    if (f.type === "relation") {
      const base = f.key.endsWith("_id") ? f.key.slice(0, -3) : f.key;
      const label = form[`${base}_label`] ?? form[`${base}_name`];
      const content: React.ReactNode = f.cellRender ? f.cellRender(v, form)
        : label ? <span className="text-sm text-slate-800" style={vs}>{String(label)}</span>
        : v ? <code className="text-xs text-slate-400">{String(v).slice(0, 8)}…</code>
        : <span className="text-slate-300">—</span>;
      const tgt = (f.relationConfig as RelationConfig | undefined)?.target_module_key
        ?? (f.relationConfig as RelationConfig | undefined)?.target_table;
      // กดเพื่อเด้ง popup ดูรายละเอียด record ที่เชื่อม (เช่น กด Parent SKU)
      if (v && tgt) {
        return (
          <button type="button" onClick={() => setPeek({ moduleKey: String(tgt), id: String(v) })}
            className="text-left inline-flex items-center gap-1 text-blue-600 hover:underline">
            {content}<span className="text-[10px] opacity-60">🔗</span>
          </button>
        );
      }
      return content;
    }
    if (v == null || v === "") return <span className="text-slate-300 text-sm">—</span>;
    if (f.type === "number") {
      const n = Number(v);
      return <span className="text-sm tabular-nums text-slate-800" style={vs}>{isNaN(n) ? String(v) : n.toLocaleString("th-TH")}</span>;
    }
    return <span className="text-sm text-slate-800 whitespace-pre-wrap break-words" style={vs}>{String(v)}</span>;
  };

  // F11: header ของ detail view
  const detailTitle = (form["name_th"] ?? form["name"] ?? form["sku_name"] ?? form["code"] ?? config.title) as string;
  const detailCode  = (form["code"] ?? form["sku"] ?? "") as string;
  const coverKey    = (form["cover_image_r2_key"] as string) || null;

  // F14: early return AFTER all hooks — กัน React error #310
  // ข้อ 3: ถ้าอยู่ใต้ layout ร่วม (มี shell แล้ว) → ไม่เรนเดอร์ shell ซ้อน (sidebar นิ่ง ไม่เด้ง)
  // ⚠ ต้องใช้ component ที่ "identity คงที่" (ShellPassthrough ระดับโมดูล) ไม่ใช่ arrow inline
  //   ไม่งั้น React เห็น type ใหม่ทุก render → remount ทั้ง subtree (ตาราง reload + search หาย)
  const insideShell = useShellPresent();
  const Wrap = insideShell ? ShellPassthrough : PlaygroundShell;

  if (!canView) return <Wrap><AccessDenied /></Wrap>;

  return (
    <Wrap>
      <div className="w-full px-6 py-6">
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-800">
              {config.icon && <span className="mr-2">{config.icon}</span>}{config.title}
            </h1>
            {config.description && <p className="text-sm text-slate-500 mt-0.5">{config.description}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* เมนู "ปรับแต่ง" — ยุบปุ่ม admin (ออกแบบหน้า / Layout / เพิ่ม Field) ให้สะอาด */}
            {config.moduleKey && canEdit && (
              <div className="relative">
                <button onClick={() => setToolsOpen((o) => !o)}
                  className="h-9 px-3 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap">
                  ⚙ ปรับแต่ง <span className="text-slate-400">▾</span>
                </button>
                {toolsOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setToolsOpen(false)} />
                    <div className="absolute right-0 z-40 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                      <button onClick={() => { setToolsOpen(false); setStudioOpen(true); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2">🎨 ออกแบบหน้า</button>
                      <button onClick={() => { setToolsOpen(false); setLayoutEditorOpen(true); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2">🗂️ จัด Layout (Tab/Section)</button>
                      <button onClick={() => { setToolsOpen(false); setFieldCreatorOpen(true); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2">＋ เพิ่ม Field ใหม่</button>
                    </div>
                  </>
                )}
              </div>
            )}
            {config.moduleKey && canCreate && registryFields && registryFields.length > 0 && (
              <button onClick={() => setImportOpen(true)}
                title="นำเข้าข้อมูลจาก CSV / Excel"
                className="h-9 px-3 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap">
                📥 นำเข้า
              </button>
            )}
            {canCreate && (
              <button onClick={openCreate}
                className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap">
                ＋ เพิ่ม{config.title}
              </button>
            )}
          </div>
        </div>

        {/* นำเข้าข้อมูล (ของกลาง) — schema สร้างจากทะเบียน field, commit ผ่าน endpoint กลาง */}
        {importOpen && config.moduleKey && registryFields && (
          <div className="fixed inset-0 z-[150] bg-black/40 flex items-center justify-center p-4" onClick={() => setImportOpen(false)}>
            <div className="w-full max-w-3xl max-h-[92vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <ImportWizard
                schema={buildImportSchemaFromRegistry(config.moduleKey, config.title, registryFields as Parameters<typeof buildImportSchemaFromRegistry>[2])}
                commitUrl={`${apiBase}${config.apiPath}/import`}
                actor={user?.name}
                onClose={() => setImportOpen(false)}
                onDone={() => { void refreshData(); }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <span className="flex-1">⚠ {/(not valid JSON|Unexpected token|Failed to fetch|<!DOCTYPE)/i.test(error) ? "โหลดข้อมูลไม่สำเร็จ (เซิร์ฟเวอร์อาจทำงานหนักชั่วคราว) — กดลองใหม่" : error}</span>
            <button onClick={() => { setError(null); void refreshData(); }} className="flex-shrink-0 h-7 px-3 text-xs font-medium border border-red-300 rounded bg-white hover:bg-red-100">🔄 ลองใหม่</button>
          </div>
        )}

        {showStatusCards && statusField && !loading && (
          <StatusCards
            options={statusField.options ?? []}
            counts={statusCounts}
            total={rows.length}
            active={statusFilter}
            onPick={setStatusFilter}
          />
        )}

        {Object.keys(urlFilter).length > 0 && (
          <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            🔎 กำลังแสดงเฉพาะรายการที่กรองจากลิงก์ที่เปิดมา
            <button onClick={clearUrlFilter} className="ml-auto text-xs font-medium px-2 py-1 rounded bg-white border border-amber-300 hover:bg-amber-100">✕ ล้างตัวกรอง (ดูทั้งหมด)</button>
          </div>
        )}

        <DataTable
          tableId={config.tableId}
          data={displayRows}
          columns={columns}
          loading={loading || registryLoading}
          searchableKeys={effectiveSearchKeys as (keyof Row)[]}
          searchPlaceholder={`ค้นหา ${config.title}...`}
          views={views}
          rowActions={rowActions}
          bulkActions={bulkActions}
          selectable
          bulkEditFields={bulkEditFields.length > 0 ? bulkEditFields : undefined}
          onBulkEdit={bulkEditFields.length > 0 ? onBulkEdit : undefined}
          onBulkEditAllMatching={config.serverMode && bulkEditFields.length > 0 ? onBulkEditAllMatching : undefined}
          inlineEditFields={inlineEditFields.length > 0 ? inlineEditFields : undefined}
          onInlineEdit={inlineEditFields.length > 0 ? onInlineEdit : undefined}
          exportFilename={config.apiPath}
          exportEntityType={config.exportEntityType}
          canCheck={(p) => can(p as Parameters<typeof can>[0])}
          pageSize={config.serverMode ? 50 : 20}
          onRowClick={openEdit}
          serverFetch={config.serverMode ? serverFetch : undefined}
          serverRefreshKey={config.serverMode ? serverRefresh : undefined}
          enableCards={true}
          cardConfig={{
            image:    "cover_image_r2_key",
            primary:  effectiveSearchKeys[0] ?? "name_th",
            subtitle: "code",
          }}
          filterFieldOptions={config.moduleKey ? filterFieldOptions : undefined}
          onSetFilterable={config.moduleKey && canEdit ? handleSetFilterable : undefined}
        />

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
          const hasCover = !!effectiveFields.find(f => f.key === "cover_image_r2_key");

          // กลุ่ม B: ถ้าจัด Layout ไว้ "และไม่มีรูปปก" → รูป/field เต็มกว้างตาม Layout
          // (โมดูลที่มีรูปปก เช่น Parent SKU/SKU → ใช้เลย์เอาต์ "รูปซ้าย" ด้านล่างเสมอ)
          const hasLayout = !!registryLayout?.tabs?.length;
          if (hasLayout && !hasCover) {
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

          // โมดูลไม่มีรูปปก (ไม่มี cover_image_r2_key) → ฟอร์มเต็มกว้างปกติ (ไม่มีคอลัมน์รูปซ้าย)
          if (!hasCover) {
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {detailCode && <code className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{detailCode}</code>}
                  {form[activeField]
                    ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />เปิดอยู่</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-300" />ปิดอยู่</span>}
                </div>
                {drawerMode === "edit" && formErr && (
                  <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>
                )}
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
                      ? renderField(effectiveFields.find(f => f.key === "cover_image_r2_key")!)
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
                    ? coreFields.map((f) => {
                        // ใส่สไตล์ (uiStyle) ที่ตั้งไว้ ให้ detail ตรงกับฟอร์ม
                        const css = fieldStyleCss(f.uiStyle);
                        const hl = !!(f.uiStyle ?? {}).highlight;
                        return (
                          <div key={f.key} className={hl ? "bg-amber-50 border border-amber-200 rounded-md p-1.5 -m-0.5" : ""}>
                            <div className="text-[11px] text-slate-400 mb-0.5" style={css}>{f.label}</div>
                            <div style={css}>{renderDetailValue(f)}</div>
                          </div>
                        );
                      })
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

        {/* reverse one2many อัตโนมัติ — รายการจากโมดูลอื่นที่ชี้กลับมาหาระเบียนนี้ (ของกลาง) */}
        {drawerMode === "view" && editingId && (() => {
          // ตัดอันที่ตั้งเป็น one2many field ไว้แล้วในโมดูลนี้ (กันซ้ำ เช่น Parent SKU → SKUs)
          const explicit = new Set(
            effectiveFields.filter((f) => f.type === "one2many").map((f) => {
              const rc = (f.relationConfig ?? {}) as Record<string, unknown>;
              return `${rc.target_module_key ?? rc.target_table}|${rc.target_fk_column}`;
            }),
          );
          const rels = reverseRels.filter((rr) => !explicit.has(`${rr.source_module_key}|${rr.fk_column}`));
          if (rels.length === 0) return null;
          return (
            <div className="mt-6 pt-4 border-t border-slate-100 space-y-4">
              <div className="text-sm font-semibold text-slate-700">🧩 ข้อมูลที่เกี่ยวข้อง (360)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rels.map((rr) => (
                  <div key={`${rr.source_module_key}|${rr.fk_column}`} className="border border-slate-150 rounded-lg p-3 bg-slate-50/40">
                    <RelationOne2Many recordId={editingId} title={rr.source_label} config={{
                      target_module_key: rr.source_module_key,
                      target_fk_column: rr.fk_column,
                      list_title_field: rr.label_field,
                      list_image_field: rr.image_field ?? undefined,
                      list_sub_fields: rr.sub_fields,
                    }} />
                  </div>
                ))}
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
        onConfirm={() => { if (archiveTarget) { void apiFetch(`${apiBase}${config.apiPath}/${archiveTarget.id}?actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" }).then(() => refreshData()); setArchiveTarget(null); } }} />

      {/* กล่องลบ — เลือกลบชั่วคราว / ลบถาวร (ของกลาง) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[150] bg-black/40 flex items-center justify-center p-4" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-800">ลบรายการ</h3>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{rowLabel(deleteTarget)}</p>
            </div>
            <div className="p-5 space-y-2">
              <label className={`flex gap-3 items-start p-3 rounded-lg border cursor-pointer ${deleteMode === "soft" ? "border-amber-300 bg-amber-50" : "border-slate-200 hover:bg-slate-50"}`}>
                <input type="radio" name="delmode" checked={deleteMode === "soft"} onChange={() => { setDeleteMode("soft"); setDeleteText(""); }} className="mt-0.5" />
                <div><div className="text-sm font-medium text-slate-800">🟡 ลบชั่วคราว (แนะนำ)</div>
                  <div className="text-xs text-slate-500 mt-0.5">ซ่อนจากตาราง แต่ข้อมูลยังอยู่ — กู้คืนได้ภายหลัง</div></div>
              </label>
              <label className={`flex gap-3 items-start p-3 rounded-lg border cursor-pointer ${deleteMode === "hard" ? "border-red-300 bg-red-50" : "border-slate-200 hover:bg-slate-50"}`}>
                <input type="radio" name="delmode" checked={deleteMode === "hard"} onChange={() => setDeleteMode("hard")} className="mt-0.5" />
                <div><div className="text-sm font-medium text-red-700">🔴 ลบถาวร (กู้คืนไม่ได้)</div>
                  <div className="text-xs text-slate-500 mt-0.5">ลบจริงออกจากฐานข้อมูล Supabase — ไม่สามารถกู้คืน</div></div>
              </label>
              {deleteMode === "hard" && (
                <div className="pt-1">
                  <label className="text-xs text-slate-600">พิมพ์ <code className="px-1 bg-slate-100 rounded text-red-600 font-mono">ลบ</code> เพื่อยืนยัน</label>
                  <input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoFocus placeholder="ลบ"
                    className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-red-400" />
                </div>
              )}
              {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">⚠ {error}</div>}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
              <button onClick={doDelete} disabled={deleting || (deleteMode === "hard" && deleteText.trim() !== "ลบ")}
                className={`h-9 px-5 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${deleteMode === "hard" ? "bg-red-600 hover:bg-red-700" : "bg-amber-500 hover:bg-amber-600"}`}>
                {deleting ? "กำลังลบ..." : deleteMode === "hard" ? "ลบถาวร" : "ลบชั่วคราว"}
              </button>
            </div>
          </div>
        </div>
      )}

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
          moduleKey={config.moduleKey}
          layout={registryLayout}
          sampleRows={rows.slice(0, 5) as Record<string, unknown>[]}
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
              inlineEditable: f.inlineEditable ?? false,  // ⚡ quick edit toggle
              bulkEditable: f.bulkEditable ?? false,      // ∑ bulk edit toggle
              // ตั้งค่า field (styling)
              formSpan:    f.formSpan ?? 1,
              helpText:    f.helpText ?? "",
              placeholder: f.placeholder ?? "",
              required:    f.required ?? false,
              editable:    !f.readonly,
              defaultValue: (f.defaultValue as string | null) ?? "",
              uiStyle:     f.uiStyle ?? {},
            }))}
          onClose={() => setStudioOpen(false)}
          onSaved={() => {
            setStudioOpen(false);
            // reload field registry → layout ใหม่มีผลทันที
            void refreshRegistry();
          }}
        />
      )}

      {/* popup ดูรายละเอียด record ที่เชื่อม (relation) เช่น Parent SKU */}
      {peek && (
        <RelationPeekModal moduleKey={peek.moduleKey} recordId={peek.id} onClose={() => setPeek(null)} />
      )}
    </Wrap>
  );
}

// ============================================================
// QuickEditCell — แก้ค่าเร็วในหน้า detail (view mode) บันทึกทันที
// ============================================================
function QuickEditCell({ field, value, onSave }: { field: FieldDef; value: unknown; onSave: (v: string) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const commit = async (newVal: string) => {
    setSaving(true); setErr(null);
    const e = await onSave(newVal);
    setSaving(false);
    if (e) { setErr(e); return; }
    setEditing(false);
  };

  if (field.type === "boolean") {
    return (
      <button type="button" disabled={saving} onClick={() => commit(value ? "false" : "true")}
        className="inline-flex items-center gap-1.5 text-sm group">
        <span className={`w-1.5 h-1.5 rounded-full ${value ? "bg-emerald-500" : "bg-slate-300"}`} />
        <span className={value ? "text-emerald-600" : "text-slate-400"}>{value ? "เปิด" : "ปิด"}</span>
        <span className="text-[10px] text-blue-400 opacity-0 group-hover:opacity-100">✎ แตะเพื่อสลับ</span>
        {err && <span className="text-[10px] text-red-500 ml-1">{err}</span>}
      </button>
    );
  }

  if (!editing) {
    const display = value == null || value === "" ? "—" : String(value);
    return (
      <button type="button" onClick={() => { setVal(value == null ? "" : String(value)); setEditing(true); }}
        className="text-left text-sm text-slate-800 hover:bg-blue-50/60 rounded px-1 -mx-1 inline-flex items-center gap-1 group max-w-full">
        <span className="truncate">{display}</span>
        <span className="text-[10px] text-blue-400 opacity-0 group-hover:opacity-100 flex-shrink-0">✎</span>
      </button>
    );
  }

  const inputCls = "h-8 px-2 text-sm border border-blue-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500";
  return (
    <div className="flex items-center gap-1">
      {field.type === "select" && field.options ? (
        <select autoFocus value={val} disabled={saving} onChange={(e) => setVal(e.target.value)} onBlur={() => commit(val)} className={`${inputCls} bg-white`}>
          <option value="">—</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input autoFocus type={field.type === "number" ? "number" : "text"} value={val} disabled={saving}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(val); if (e.key === "Escape") setEditing(false); }}
          onBlur={() => commit(val)} className={inputCls} />
      )}
      {saving && <span className="text-[10px] text-slate-400">…</span>}
      {err && <span className="text-[10px] text-red-500">{err}</span>}
    </div>
  );
}

// ============================================================
// FormSections — Sprint 7: group fields by groupKey + collapsible
// ============================================================

// กลุ่ม B: คลาส grid ต่อจำนวน column (static string → Tailwind ไม่ purge)
const COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };

// ปุ่มคัดลอกค่า field (เปิดผ่าน ui_style.copyable ใน Studio)
function CopyValueBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" title="คัดลอกค่า"
      onClick={(e) => { e.stopPropagation(); try { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* ignore */ } }}
      className={`text-xs shrink-0 ${done ? "text-emerald-600" : "text-slate-300 hover:text-blue-600"}`}>
      {done ? "✓" : "⧉"}
    </button>
  );
}

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
  // ซ่อนแท็บที่ไม่มี field จริง (เช่นแท็บ core ฝั่งขวาที่ core ถูกเรนเดอร์แยกซ้ายแล้ว)
  const tabs = (layout.tabs ?? []).filter((t) => t.sections.some((s) => (byGroup.get(s.key)?.length ?? 0) > 0));
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

// ui_style preset → CSS (ใช้ทั้ง form, detail, preview)
function fieldStyleCss(uiStyle?: Record<string, unknown>): React.CSSProperties {
  const us = uiStyle ?? {};
  const SZ: Record<string, string> = { sm: "12px", base: "14px", lg: "16px", xl: "20px" };
  const FF: Record<string, string> = { serif: "Georgia, 'Times New Roman', serif", mono: "ui-monospace, 'Courier New', monospace" };
  return {
    fontSize: SZ[String(us.size ?? "")] || undefined,
    fontWeight: us.bold ? 700 : undefined,
    fontStyle: us.italic ? "italic" : undefined,
    textDecoration: us.underline ? "underline" : undefined,
    color: typeof us.color === "string" && us.color ? us.color : undefined,
    fontFamily: FF[String(us.font ?? "")] || undefined,
    textAlign: (["left", "center", "right"].includes(String(us.align)) ? (us.align as "left" | "center" | "right") : undefined),
  };
}

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
      {fs.map((f) => {
        const css = fieldStyleCss(f.uiStyle);
        const hl = !!(f.uiStyle ?? {}).highlight;
        const wide = (f.type === "textarea" || f.type === "image") && cols > 1;
        return (
          <div key={f.key} className={`${wide ? "col-span-2" : ""} ${hl ? "bg-amber-50 border border-amber-200 rounded-md p-1.5 -m-0.5" : ""}`}>
            <dt className="text-[11px] text-slate-400 mb-0.5" style={css}>{f.label}</dt>
            <dd style={css}>{renderValue(f)}</dd>
          </div>
        );
      })}
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
