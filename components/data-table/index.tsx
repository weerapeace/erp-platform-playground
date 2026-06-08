"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ERPModal } from "@/components/modal";
import { useAuth, type Permission } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { ImageThumbnail } from "@/components/image-manager";
import { RelationPicker, type RelationConfig } from "@/components/relation-picker";
import { readRelationLabel } from "@/lib/relation";
import { formatDate } from "@/lib/date";
import type { TableLayoutSettings, RowColorRule } from "@/app/api/table-layouts/route";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
  type ColumnSizingState,
  type ColumnOrderState,
  type ColumnPinningState,
  type Column,
  type RowData,
} from "@tanstack/react-table";

// ---- Filter type (defined early — used in module augmentation) ----

export type FilterFieldType = "text" | "number" | "select" | "boolean";

// ---- TanStack Table ColumnMeta augmentation ----

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** แสดงใน Filter panel */
    filterable?: boolean;
    /** "text" | "number" | "select" — ถ้าไม่ระบุ auto-detect จากข้อมูล */
    filterType?: FilterFieldType;
    /** label ใน filter panel ถ้า header ไม่ใช่ string */
    filterLabel?: string;
    /** ตัวเลือกคงที่สำหรับ select — ถ้าไม่ระบุ auto-compute จากข้อมูล */
    filterOptions?: { label: string; value: string }[];
    /** จัดกลุ่มใน Column Manager เช่น "ข้อมูลหลัก" | "ราคา" | "ระบบ" */
    group?: string;
    /** ต้องมีสิทธิ์นี้ถึงเห็นคอลัมน์ (เช่น "products.cost.view") — ไม่มีสิทธิ์ = ซ่อน */
    permission?: string;
    /** สรุปท้ายตาราง: "sum" = รวมตัวเลข, หรือ function เอง */
    summary?: "sum" | "count" | ((rows: unknown[]) => React.ReactNode);
    /** "image" = แสดงค่าเป็น thumbnail รูป + hover ขยาย */
    type?: "image";
  }
}

// ---- Icons ----

function IconSearch() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>;
}
function IconSearchSm() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>;
}
function IconChevronUp() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>;
}
function IconChevronDown() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>;
}
function IconChevronsUpDown() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>;
}
function IconColumns() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18" /></svg>;
}
function IconFilter() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>;
}
function IconDownload() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
}
function IconMoreVertical() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>;
}
function IconX() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}
function IconChevronLeft() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>;
}
function IconChevronRight() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>;
}
function IconRefreshCw() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>;
}
function IconChevronRightPanel() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>;
}
function IconPlus() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
function IconBookmark() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>;
}

// ---- Status Badge ----

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; label: string }> = {
  active:           { bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200", label: "Active" },
  inactive:         { bg: "bg-slate-100",   text: "text-slate-500",   border: "border-slate-200",   label: "Inactive" },
  draft:            { bg: "bg-slate-100",   text: "text-slate-600",   border: "border-slate-200",   label: "ร่าง" },
  submitted:        { bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200",   label: "รออนุมัติ" },
  waiting_approval: { bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200",   label: "รอ Approve" },
  approved:         { bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200", label: "อนุมัติแล้ว" },
  rejected:         { bg: "bg-red-50",      text: "text-red-700",     border: "border-red-200",     label: "ไม่อนุมัติ" },
  cancelled:        { bg: "bg-red-50",      text: "text-red-600",     border: "border-red-200",     label: "ยกเลิก" },
  low_stock:        { bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200",   label: "Low Stock" },
  // ---- จัดซื้อ v2 (purchasing) ----
  waiting:          { bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200",   label: "รออนุมัติ" },
  rfq_created:      { bg: "bg-blue-50",     text: "text-blue-700",    border: "border-blue-200",    label: "ออกใบสั่งซื้อแล้ว" },
  confirmed:        { bg: "bg-blue-50",     text: "text-blue-700",    border: "border-blue-200",    label: "ยืนยันแล้ว" },
  partial:          { bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200",   label: "รับบางส่วน" },
  received:         { bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200", label: "รับของแล้ว" },
  short_closed:     { bg: "bg-slate-100",   text: "text-slate-600",   border: "border-slate-200",   label: "ปิดยอดขาด" },
  completed:        { bg: "bg-purple-50",   text: "text-purple-700",  border: "border-purple-200",  label: "เสร็จสิ้น" },
  done:             { bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200", label: "เสร็จสิ้น" },
};

// ระบายสีแถวตามเงื่อนไข (ของกลาง) — กฎแรกที่เข้าเงื่อนไขชนะ
const ROW_COLOR_BG: Record<string, string> = {
  red: "#fef2f2", orange: "#fff7ed", amber: "#fffbeb", green: "#f0fdf4",
  blue: "#eff6ff", purple: "#faf5ff", slate: "#f8fafc",
};
const ROW_COLOR_BORDER: Record<string, string> = {
  red: "#ef4444", orange: "#f97316", amber: "#f59e0b", green: "#22c55e",
  blue: "#3b82f6", purple: "#a855f7", slate: "#94a3b8",
};
function evalRowColor(rules: RowColorRule[] | undefined, rowData: Record<string, unknown>): string | null {
  if (!rules?.length) return null;
  for (const r of rules) {
    if (!r?.column || !r?.color) continue;
    const v = rowData[r.column];
    let hit = false;
    switch (r.op) {
      case "empty":     hit = v == null || v === ""; break;
      case "not_empty": hit = v != null && v !== ""; break;
      case "eq":        hit = String(v ?? "") === String(r.value ?? ""); break;
      case "ne":        hit = String(v ?? "") !== String(r.value ?? ""); break;
      case "lt":        hit = Number(v) <  Number(r.value); break;
      case "lte":       hit = Number(v) <= Number(r.value); break;
      case "gt":        hit = Number(v) >  Number(r.value); break;
      case "gte":       hit = Number(v) >= Number(r.value); break;
    }
    if (hit) return r.color;
  }
  return null;
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200", label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
}

// ---- Field Registry type (export สำหรับ page ที่ใช้) ----

export type FieldRegistryEntry = {
  field_key:     string;
  field_label:   string;
  /** "text" | "currency" | "number" | "boolean" | "date" */
  ui_type:       string;
  /** "core" | "relation" | "product" | "pricing" | "status" | "system" | "content" | "supplier" */
  group_key:     string;
  is_visible:    boolean;
  is_filterable: boolean;
  is_sortable:   boolean;
  /** ถ้า true = ไม่มีข้อมูลจริงใน API response */
  is_sensitive:  boolean;
  col_width:     number;
};

// ---- Exported types ----

export type FilterableField = {
  key: string;
  label: string;
  type: FilterFieldType;
  options?: { label: string; value: string }[];
};

/** F30: ตัวเลือก field สำหรับปุ่ม "เลือก field กรอง" (registry-backed) */
export type FilterFieldOption = {
  fieldId: string;       // erp_module_fields.id — ใช้ตอน save is_filterable
  key: string;
  label: string;
  isFilterable: boolean; // สถานะปัจจุบันใน registry
};

export type ColumnFilterValue =
  | { type: "text";   value: string }
  | { type: "number"; min: string; max: string }
  | { type: "select"; selected: string[] }
  | { type: "boolean"; value: "true" | "false" };

export type FilterOperator =
  | "contains" | "not_contains" | "equals" | "not_equals"
  | "starts_with" | "is_empty" | "is_not_empty" | "gt" | "lt";

export type DataTableView = {
  id: string;
  label: string;
  filter?: (row: Record<string, unknown>) => boolean;
  /** server mode: ตัวกรองที่ส่งให้ server แทน filter() ฝั่งหน้าจอ (เช่น is_active) */
  serverFilter?: Record<string, ColumnFilterValue>;
};

export type RowAction<T> = {
  label: string;
  icon?: React.ReactNode;
  onClick: (row: T) => void;
  variant?: "default" | "danger";
  /** แสดงปุ่มนี้เฉพาะแถวที่เงื่อนไขเป็นจริง (ไม่ระบุ = แสดงทุกแถว) */
  show?: (row: T) => boolean;
};

export type BulkAction<T> = {
  label: string;
  onClick: (rows: T[]) => void;
  variant?: "default" | "danger";
};

/** field ที่แก้แบบ bulk ได้ (ตาม CLAUDE.md §18 — เฉพาะ field ที่อนุญาต) */
export type BulkEditField = {
  key:      string;
  label:    string;
  type:     "text" | "number" | "select" | "boolean" | "relation";
  options?: { value: string; label: string }[];
  relationConfig?: RelationConfig;  // สำหรับ type "relation" — ใช้ RelationPicker
};

export type BulkEditResult = { success: number; failed: number };

/** Card view config — เลือก field + ปรับลุค */
export type CardConfig = {
  primary?:  string;        // ตัวใหญ่ (title)
  subtitle?: string;        // ตัวรองใต้ title
  image?:    string;        // รูป (auto-detect จาก meta.type=image)
  badges?:   string[];      // badge สี
  metrics?:  string[];      // ตัวเลขเด่น
  lines?:    string[];      // ข้อมูลอื่น
  // ---- ลุค (ปรับได้) ----
  layout?:       "vertical" | "horizontal" | "compact" | "detailed";
  imageHeight?:  "sm" | "md" | "lg" | "xl";
  imageAspect?:  "square" | "wide" | "tall" | "auto";
  imageFit?:     "cover" | "contain";
  columns?:      "auto" | "1" | "2" | "3" | "4" | "5";
  primarySize?:  "sm" | "md" | "lg" | "xl";
};

/** พารามิเตอร์ที่ DataTable ส่งให้ server เมื่อใช้ server-side mode */
export type ServerFetchParams = {
  page:     number;   // 1-based
  pageSize: number;
  search:   string;
  sortBy:   string | null;
  sortDir:  "asc" | "desc" | null;
  /** F27: server-side column filters — { fieldKey: ColumnFilterValue } */
  filters?: Record<string, ColumnFilterValue>;
};

export interface DataTableProps<T extends Record<string, unknown>> {
  data: T[];
  columns: ColumnDef<T>[];
  title?: string;
  description?: string;
  loading?: boolean;
  error?: string;
  emptyMessage?: string;
  searchPlaceholder?: string;
  searchableKeys?: (keyof T)[];
  views?: DataTableView[];
  rowActions?: RowAction<T>[];
  bulkActions?: BulkAction<T>[];
  /** แสดง checkbox เลือกแถวเสมอ (แม้ไม่มี bulk action) — ใช้เลือกเพื่อ export ในหน้าอ่านอย่างเดียว */
  selectable?: boolean;
  pageSize?: number;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  /** ของกลาง: แสดงรายละเอียดแบบ slide-down ใต้แถวหลัก */
  renderExpandedRow?: (row: T) => React.ReactNode;
  /** ของกลาง: บอกว่าแถวนี้กำลังเปิดรายละเอียดอยู่หรือไม่ */
  isRowExpanded?: (row: T) => boolean;
  drawerContent?: (row: T) => React.ReactNode;
  drawerTitle?: string | ((row: T) => string);
  /** ID สำหรับบันทึก saved views ลง localStorage เช่น "products" */
  tableId?: string;
  /**
   * Field Registry จาก Supabase — ถ้าระบุ DataTable จะ:
   * 1. ใช้ field_label / group_key แทนการ guess จากชื่อ field
   * 2. แสดง registry fields ที่ยังไม่มีใน API ใน Column Manager (grayed out)
   * 3. ตั้ง filter type จาก ui_type อัตโนมัติ
   */
  fieldRegistry?: FieldRegistryEntry[];
  /** ชื่อไฟล์ตอน Export (ไม่ต้องใส่ .csv/.xlsx) — default: "export" */
  exportFilename?: string;
  /** entity_type สำหรับ audit log การ export — ถ้าไม่ระบุจะใช้ exportFilename */
  exportEntityType?: string;
  /** function check permission (จาก useAuth.can) — ใช้กรอง column ที่ user ไม่มีสิทธิ์ดูตอน export */
  canCheck?: (perm: string) => boolean;
  /** field ที่อนุญาตให้แก้แบบ bulk — ถ้าระบุจะมีปุ่ม "แก้หลายรายการ" */
  bulkEditFields?: BulkEditField[];
  /** callback แก้ bulk — รับค่าต่อแถว (แต่ละแถวมี changes ของตัวเอง) */
  onBulkEdit?: (edits: { row: T; changes: Record<string, unknown> }[]) => Promise<BulkEditResult>;
  /** label แสดงชื่อแถวใน bulk edit grid (default: name/sku) */
  bulkRowLabel?: (row: T) => string;
  /**
   * (server mode) แก้ "ทั้งหมดที่ตรงตัวกรอง" ข้ามหน้า — รับค่าใหม่ชุดเดียว + ขอบเขตตัวกรองปัจจุบัน
   * ถ้าระบุ + อยู่ server mode จะมีปุ่ม "แก้ทั้งหมดที่ตรง (N)"
   */
  onBulkEditAllMatching?: (
    changes: Record<string, unknown>,
    scope: { search: string; filters: Record<string, unknown> },
  ) => Promise<{ affected: number }>;
  /** column id ที่ดับเบิลคลิกแก้ในตารางได้ (inline edit) */
  inlineEditFields?: string[];
  /** callback บันทึก inline edit — return error string ถ้าพลาด */
  onInlineEdit?: (row: T, field: string, value: string) => Promise<string | null>;
  /**
   * Server-side mode — ถ้าระบุ DataTable จะดึงข้อมูลทีละหน้าจาก server
   * (search/sort/pagination ทำที่ server) เหมาะกับข้อมูลหลักหมื่นแถว
   * เมื่อใช้โหมดนี้: ปิด filter panel / views / bulk (ทำงานข้ามหน้าไม่ได้)
   */
  serverFetch?: (params: ServerFetchParams) => Promise<{ rows: T[]; total: number }>;
  /** trigger refetch (เปลี่ยนค่า → โหลดใหม่) */
  serverRefreshKey?: number;
  /** แจ้งแถวที่แสดงอยู่ (ตามลำดับ) ออกไป — ใช้ทำปุ่มเลื่อนรายการก่อนหน้า/ถัดไปในป๊อปอัป */
  onVisibleRowsChange?: (rows: T[]) => void;
  /** เปิด Card view (toggle table/cards) — ถ้าระบุจะมีปุ่มสลับ */
  enableCards?: boolean;
  /** Card config เริ่มต้น (ถ้าไม่ระบุ — auto-detect จาก columns) */
  cardConfig?: CardConfig;
  /** view เริ่มต้น */
  defaultViewMode?: "table" | "cards";
  /** F30: รายการ field ทั้งหมดที่เลือกกรองได้ (สำหรับปุ่ม "เลือก field กรอง") */
  filterFieldOptions?: FilterFieldOption[];
  /**
   * F30: บันทึก is_filterable เข้าทะเบียน field กลาง (กระทบทุกคน)
   * undefined = ไม่มีสิทธิ์/ไม่รองรับ → ซ่อนปุ่มเลือก field
   */
  onSetFilterable?: (fieldId: string, value: boolean) => Promise<void> | void;
}

// ---- Pinned column style (เฉพาะ pin ซ้าย) ----
function pinnedStyle<T>(column: Column<T, unknown>): { position?: "sticky"; left?: number } {
  if (column.getIsPinned() !== "left") return {};
  return { position: "sticky", left: column.getStart("left") };
}

// ---- CSV export helper (legacy — ตอนนี้ใช้ lib/export.ts) ----

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- Internal: saved view type ----

type StoredView = {
  id: string;
  label: string;
  baseViewId: string;
  colFilterValues: Record<string, ColumnFilterValue>;
  globalSearch: string;
  columnVisibility: VisibilityState;
  groupBy?: string | null;            // เฟส 3: จำการจัดกลุ่ม
  // จำหน้าตาตารางครบ (แบบ A): ลำดับ/ความกว้าง/ตรึง/เรียง/density/หน้า/โหมด
  columnOrder?: string[];
  columnSizing?: Record<string, number>;
  columnPinning?: { left?: string[]; right?: string[] };
  sorting?: { id: string; desc: boolean }[];
  density?: "normal" | "compact";
  pageSize?: number;
  viewMode?: "table" | "cards";
  visibility?: "personal" | "team" | "system";
  is_default?: boolean;
  owner_name?: string | null;
};

// ---- Registry helpers ----

function uiTypeToFilterType(uiType: string): FilterFieldType {
  if (uiType === "currency" || uiType === "number") return "number";
  if (uiType === "boolean") return "boolean";
  return "text";
}

// R5: fieldKey ส่งเข้ามาเพื่อให้ relation column อ่าน label คู่ (`{base}_label`) อัตโนมัติ
function buildRegistryCell(uiType: string, fieldKey?: string) {
  // เป็น relation ถ้า ui_type = "relation" หรือ field ลงท้าย _id (convention)
  const isRelation = uiType === "relation" || (!!fieldKey && fieldKey.endsWith("_id"));
  return ({ getValue, row }: { getValue: () => unknown; row?: { original: Record<string, unknown> } }) => {
    // R5: relation → โชว์ชื่อ (จาก sibling _label/_name) แทน id ดิบ
    if (isRelation && fieldKey && row?.original) {
      const label = readRelationLabel(row.original, fieldKey);
      const raw = getValue();
      if (label) return <span className="text-sm text-slate-700 line-clamp-1">{label}</span>;
      if (raw == null || raw === "") return <span className="text-xs text-slate-400">—</span>;
      // ไม่มี label มาให้ → โชว์ id แบบย่อ + เตือนว่า relation ยัง resolve ไม่ได้
      return <span className="text-xs text-slate-400 font-mono" title="ยังไม่มีชื่อ (label) — ตรวจ relation_joins ใน API">{String(raw).slice(0, 8)}…</span>;
    }
    const val = getValue();
    if (val == null || val === "") return <span className="text-xs text-slate-400">—</span>;
    if ((uiType === "currency" || uiType === "number") && !isNaN(Number(val))) {
      const n = Number(val);
      return <span className="text-sm tabular-nums text-slate-700">
        {uiType === "currency" ? `฿${n.toLocaleString("th-TH")}` : n.toLocaleString("th-TH")}
      </span>;
    }
    if (uiType === "boolean") {
      return <span className={`text-xs font-medium ${val ? "text-emerald-600" : "text-slate-400"}`}>{val ? "✓" : "—"}</span>;
    }
    if (uiType === "date") {
      return <span className="text-xs text-slate-500">{formatDate(val)}</span>;
    }
    return <span className="text-xs text-slate-600 line-clamp-1">{String(val)}</span>;
  };
}

// ---- Helpers ----

function inferFilterType(key: string, data: Record<string, unknown>[]): FilterFieldType {
  const sample = data.slice(0, 100).map(r => r[key]).filter(v => v != null && v !== "" && v !== "—");
  if (sample.length === 0) return "text";
  if (sample.every(v => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))))) return "number";
  const distinct = new Set(sample.map(v => String(v)));
  if (distinct.size <= 15) return "select";
  return "text";
}

function isColFilterActive(val: ColumnFilterValue | undefined): boolean {
  if (!val) return false;
  if (val.type === "text")    return val.value.length > 0;
  if (val.type === "number")  return val.min !== "" || val.max !== "";
  if (val.type === "select")  return val.selected.length > 0;
  if (val.type === "boolean") return val.value === "true" || val.value === "false";
  return false;
}

// ============================================================
// ---- Main DataTable ----
// ============================================================

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns: columnsProp,
  title,
  description,
  loading = false,
  error,
  emptyMessage = "ไม่พบข้อมูล",
  searchPlaceholder = "ค้นหา...",
  searchableKeys = [],
  views = [],
  rowActions = [],
  bulkActions = [],
  selectable = false,
  pageSize: initialPageSize = 10,
  onRetry,
  onRowClick,
  renderExpandedRow,
  isRowExpanded,
  drawerContent,
  drawerTitle,
  tableId,
  fieldRegistry = [],
  exportFilename = "export",
  exportEntityType,
  canCheck,
  bulkEditFields = [],
  onBulkEdit,
  bulkRowLabel,
  onBulkEditAllMatching,
  inlineEditFields = [],
  onInlineEdit,
  serverFetch,
  serverRefreshKey = 0,
  onVisibleRowsChange,
  enableCards,
  cardConfig,
  defaultViewMode = "table",
  filterFieldOptions,
  onSetFilterable,
}: DataTableProps<T>) {

  const isServer = !!serverFetch;
  const { can } = useAuth();

  // ---- Permission by field: ซ่อนคอลัมน์ที่ไม่มีสิทธิ์ ----
  const columns = useMemo(
    () => columnsProp.filter(c => !c.meta?.permission || can(c.meta.permission as Permission)),
    [columnsProp, can]
  );

  // ---- Density (แน่น/ปกติ) ----
  const [density, setDensity] = useState<"normal" | "compact">("normal");
  const cellPad = density === "compact" ? "px-3 py-1" : "px-4 py-3";

  // ---- Group by (จัดกลุ่ม) — ของกลาง (client mode เท่านั้น) ----
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupSort, setGroupSort] = useState<"label_asc" | "label_desc" | "count_desc" | "count_asc">("label_asc");
  const isGrouped = !!groupBy;

  // ---- Freeze header: ref/ความสูงของพื้นที่ตาราง (effect คำนวณอยู่ด้านล่าง หลัง state ครบ) ----
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [tableMaxH, setTableMaxH] = useState<number | null>(null);

  // ---- View mode (table / cards) ----
  const showCardToggle = !!enableCards || !!cardConfig;
  // มือถือ (จอ < 768px) + มีการ์ด → เริ่มต้นเป็น "การ์ด" อัตโนมัติ (ไม่ต้องเลื่อนตารางซ้าย-ขวา)
  const [viewMode, setViewMode] = useState<"table" | "cards">(() =>
    (showCardToggle && typeof window !== "undefined" && window.innerWidth < 768) ? "cards" : defaultViewMode
  );

  // ---- Admin default layout (Tier 3I) ----
  // โหลด default คอลัมน์/ค่าตั้งจาก server (admin View default)
  // เก็บ "เวอร์ชัน" (updated_at) ที่เคยใช้ไว้ใน localStorage — ถ้า admin แก้ default (updated_at เปลี่ยน)
  // จะ "บังคับใช้ค่าใหม่ทับ" ให้อัตโนมัติในการโหลดครั้งถัดไป (ไม่ต้องรีเซ็ตเอง)
  const layoutAppliedRef = useRef(false);
  const layoutKey = tableId ? `erp-dt-${tableId}-layout-ver` : null;
  const [pendingDefaultPageSize, setPendingDefaultPageSize] = useState<number | null>(null);
  // ค่าเริ่มต้นตารางแบบขยายได้ (settings jsonb) — ใช้ทำสรุปคอลัมน์/สีแถว ตอน render
  const [layoutSettings, setLayoutSettings] = useState<TableLayoutSettings | null>(null);
  useEffect(() => {
    if (!tableId || layoutAppliedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/table-layouts?table_id=${encodeURIComponent(tableId)}`);
        const json = await res.json();
        const layout = json.data as {
          columns: Array<{ key: string; visible: boolean; order: number; pinned?: "left" | "right" | null; width?: number }>;
          default_density: "normal" | "compact";
          default_page_size: number;
          default_view_mode: "table" | "cards";
          settings?: TableLayoutSettings | null;
          updated_at?: string;
        } | null;
        if (cancelled || !layout) return;
        // เทียบเวอร์ชัน: ถ้า updated_at ต่างจากที่เคยเก็บ = admin แก้ default ใหม่ → บังคับทับ
        const layoutVer = String(layout.updated_at ?? "");
        let storedVer = "";
        try { storedVer = (layoutKey && localStorage.getItem(layoutKey)) || ""; } catch { /* ignore */ }
        const isNewVersion = !!layoutVer && storedVer !== layoutVer;

        const vis: VisibilityState = {};
        const order: ColumnOrderState = [];
        const pinned: ColumnPinningState = { left: [], right: [] };
        const sizing: ColumnSizingState = {};
        const sortedCols = [...layout.columns].sort((a, b) => a.order - b.order);
        sortedCols.forEach(c => {
          vis[c.key] = c.visible;
          order.push(c.key);
          if (c.pinned === "left")  pinned.left!.push(c.key);
          if (c.pinned === "right") pinned.right!.push(c.key);
          if (c.width) sizing[c.key] = c.width;
        });
        if (isNewVersion) {
          // เวอร์ชันใหม่จาก admin → ทับของเดิมทั้งหมด เพื่อให้ default ใหม่แสดงผลจริง
          setColumnVisibility(vis);
          setColumnOrder(order);
          setColumnPinning(pinned);
          setColumnSizing(sizing);
        } else {
          setColumnVisibility(prev => ({ ...vis, ...prev }));
          setColumnOrder(prev => prev.length ? prev : order);
          setColumnPinning(prev => (prev.left?.length || prev.right?.length) ? prev : pinned);
          setColumnSizing(prev => Object.keys(prev).length ? prev : sizing);
        }
        setDensity(layout.default_density);
        setViewMode(layout.default_view_mode);
        setPendingDefaultPageSize(layout.default_page_size);
        // ค่าเริ่มต้นแบบขยายได้: เรียง / เรียงรอง / จัดกลุ่ม (ตั้งเฉพาะตอนยังไม่มีค่าเดิม → Saved View override ได้)
        const s = layout.settings ?? null;
        setLayoutSettings(s);
        if (s?.default_sort?.column) {
          const srt = [{ id: s.default_sort.column, desc: s.default_sort.dir === "desc" }];
          if (s.secondary_sort?.column) srt.push({ id: s.secondary_sort.column, desc: s.secondary_sort.dir === "desc" });
          setSorting((prev) => (prev.length ? prev : srt));
        }
        if (s?.group_by) setGroupBy((prev) => prev ?? s.group_by ?? null);
        layoutAppliedRef.current = true;
        try { if (layoutKey && layoutVer) localStorage.setItem(layoutKey, layoutVer); } catch { /* ignore */ }
      } catch { /* silent — fallback to component defaults */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  // ปุ่ม "reset to admin default" — เคลียร์ localStorage ของ table + reload page
  const resetToAdminDefault = useCallback(() => {
    if (!tableId) return;
    if (!confirm("รีเซ็ตกลับเป็น default ของระบบ? — การปรับแต่งของคุณ (columns, filter, density) จะหาย")) return;
    try {
      // clear ทุก key ที่เกี่ยวข้องกับ table นี้
      const prefix1 = `erp-dt-${tableId}`;
      const prefix2 = `erp-card-cfg-${tableId}`;
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith(prefix1) || k === prefix2) localStorage.removeItem(k);
      });
    } catch { /* ignore */ }
    window.location.reload();
  }, [tableId]);
  const [showCardCfg, setShowCardCfg] = useState(false);

  // auto-detect default card config
  const autoCardConfig = useMemo<CardConfig>(() => {
    const cols = columns.map(c => {
      const id = String((c as unknown as Record<string, unknown>).accessorKey ?? (c as unknown as Record<string, unknown>).id ?? "");
      return { id, header: typeof c.header === "string" ? c.header : id, type: c.meta?.type };
    }).filter(c => c.id);
    const imageCol = cols.find(c => c.type === "image")?.id;
    const nameCol  = cols.find(c => /name|title|ชื่อ|หัวข้อ/i.test(c.id) || c.header.includes("ชื่อ"))?.id ?? cols[0]?.id;
    const skuCol   = cols.find(c => /sku|number|code|เลขที่/i.test(c.id) || c.header.includes("SKU"))?.id;
    return { primary: nameCol, subtitle: skuCol !== nameCol ? skuCol : undefined, image: imageCol, badges: [], metrics: [], lines: [] };
  }, [columns]);

  // โหลด config จาก localStorage (per tableId) → fallback prop → auto-detect
  const cardCfgKey = tableId ? `erp-card-cfg-${tableId}` : null;
  const [cardCfg, setCardCfg] = useState<CardConfig>(() => {
    if (cardCfgKey) {
      try { const s = localStorage.getItem(cardCfgKey); if (s) return JSON.parse(s); } catch { /* ignore */ }
    }
    return cardConfig ?? autoCardConfig;
  });
  const persistCardCfg = (c: CardConfig) => {
    setCardCfg(c);
    if (cardCfgKey) { try { localStorage.setItem(cardCfgKey, JSON.stringify(c)); } catch { /* ignore */ } }
  };

  // ---- Core state ----
  const [sorting,          setSorting]         = useState<SortingState>([]);
  const [columnFilters,    setColumnFilters]    = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection,     setRowSelection]     = useState<RowSelectionState>({});
  const [columnSizing,     setColumnSizing]     = useState<ColumnSizingState>({});  // resize
  const [columnOrder,      setColumnOrder]       = useState<ColumnOrderState>([]);   // reorder
  const [columnPinning,    setColumnPinning]     = useState<ColumnPinningState>({ left: [], right: [] });
  const [colDrag,          setColDrag]           = useState<string | null>(null);    // header drag
  const [globalSearch,     setGlobalSearch]     = useState("");
  const [activeView,       setActiveView]       = useState(views[0]?.id ?? "all");
  const [showColumnMgr,    setShowColumnMgr]    = useState(false);
  const [copiedField,      setCopiedField]      = useState<string | null>(null);  // F1: คัดลอกชื่อ field จริง
  const [exportOpen,       setExportOpen]       = useState(false);
  const [rowMenu,          setRowMenu]          = useState<{ row: T; x: number; y: number } | null>(null);
  const [mounted,          setMounted]          = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ---- Filter state ----
  const [colFilterValues, setColFilterValues] = useState<Record<string, ColumnFilterValue>>({});
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // ---- Drawer state ----
  const [drawerRow,  setDrawerRow]  = useState<T | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);

  // ---- Bulk edit state ----
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkAllOpen,  setBulkAllOpen]  = useState(false);  // แก้ทั้งหมดที่ตรงตัวกรอง (server mode)

  // ---- Inline edit state ----
  const [editCell,  setEditCell]  = useState<{ rowId: string; colId: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // ---- Server-side state ----
  const [srvRows,     setSrvRows]     = useState<T[]>([]);
  const [srvTotal,    setSrvTotal]    = useState(0);
  const [srvLoading,  setSrvLoading]  = useState(false);
  // เฟส 4 (แบบ A): batch ใหญ่สำหรับจัดกลุ่ม server mode
  const [srvGroupRows,    setSrvGroupRows]    = useState<T[]>([]);
  const [srvGroupLoading, setSrvGroupLoading] = useState(false);
  const [srvGroupCapped,  setSrvGroupCapped]  = useState(false);
  const [srvPage,     setSrvPage]     = useState(0);   // 0-based
  const [srvPageSize, setSrvPageSize] = useState(initialPageSize);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // debounce search (server mode)
  useEffect(() => {
    if (!isServer) return;
    const t = setTimeout(() => setDebouncedSearch(globalSearch), 400);
    return () => clearTimeout(t);
  }, [globalSearch, isServer]);

  // F27: serialize filter values → stable dep + ส่งเฉพาะ filter ที่ active
  const activeServerFilters = useMemo(() => {
    const out: Record<string, ColumnFilterValue> = {};
    // system view tab (เปิดอยู่/ปิดอยู่) → ส่งเป็น server filter (server mode กรองฝั่งจอไม่ได้)
    const sv = views.find(v => v.id === activeView)?.serverFilter;
    if (sv) for (const [k, v] of Object.entries(sv)) out[k] = v;
    // ตัวกรองที่ user เลือกเอง — ทับ system view ได้ถ้าเป็น field เดียวกัน
    for (const [k, v] of Object.entries(colFilterValues)) {
      if (isColFilterActive(v)) out[k] = v;
    }
    return out;
  }, [colFilterValues, views, activeView]);
  const filtersKey = JSON.stringify(activeServerFilters);

  // reset to page 1 เมื่อ search/filter เปลี่ยน
  useEffect(() => { if (isServer) setSrvPage(0); }, [debouncedSearch, filtersKey, isServer]);

  // fetch จาก server
  // F-flicker: debounce 120ms — ตอนโหลดครั้งแรก deps หลายตัว (saved-view, layout, search)
  // ทยอยเปลี่ยนติดๆ กัน ทำให้ยิง fetch 4 รอบ = ตารางกระพริบ → รวบให้เหลือรอบเดียว
  useEffect(() => {
    if (!isServer || !serverFetch) return;
    let active = true;
    setSrvLoading(true);
    const sort = sorting[0];
    const t = setTimeout(() => {
      if (!active) return;
      serverFetch({
        page: srvPage + 1, pageSize: srvPageSize, search: debouncedSearch,
        sortBy: sort?.id ?? null, sortDir: sort ? (sort.desc ? "desc" : "asc") : null,
        filters: activeServerFilters,
      })
        .then(r => { if (active) { setSrvRows(r.rows); setSrvTotal(r.total); } })
        .catch(() => { if (active) { setSrvRows([]); setSrvTotal(0); } })
        .finally(() => { if (active) setSrvLoading(false); });
    }, 120);
    return () => { active = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isServer, serverFetch, srvPage, srvPageSize, debouncedSearch, sorting, serverRefreshKey, filtersKey]);

  // เฟส 4 (แบบ A): server mode + จัดกลุ่ม → ดึง batch ใหญ่ (cap) มาจัดกลุ่มในจอ
  useEffect(() => {
    if (!isServer || !serverFetch || !groupBy) { setSrvGroupRows([]); setSrvGroupCapped(false); return; }
    let active = true;
    setSrvGroupLoading(true);
    const sort = sorting[0];
    const t = setTimeout(() => {
      if (!active) return;
      serverFetch({
        page: 1, pageSize: 3000, search: debouncedSearch,
        sortBy: sort?.id ?? null, sortDir: sort ? (sort.desc ? "desc" : "asc") : null,
        filters: activeServerFilters,
      })
        .then(r => { if (active) { setSrvGroupRows(r.rows); setSrvGroupCapped(r.total > r.rows.length); } })
        .catch(() => { if (active) { setSrvGroupRows([]); setSrvGroupCapped(false); } })
        .finally(() => { if (active) setSrvGroupLoading(false); });
    }, 120);
    return () => { active = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isServer, serverFetch, groupBy, debouncedSearch, sorting, serverRefreshKey, filtersKey]);

  // ---- Saved Views (Supabase — owner-based, ข้ามเครื่อง) ----
  const [userViews, setUserViews] = useState<StoredView[]>([]);
  const [savingView,    setSavingView]    = useState(false);
  const [saveViewName,  setSaveViewName]  = useState("");
  const [saveViewVis,   setSaveViewVis]   = useState<"personal" | "team">("personal");
  const [saveViewDefault, setSaveViewDefault] = useState(false);   // แบบ A: ตั้งเป็นค่าเริ่มต้นเลย
  const saveInputRef = useRef<HTMLInputElement>(null);

  // โหลด views จาก Supabase (ต้อง login)
  const fetchUserViews = useCallback(async () => {
    if (!tableId) return;
    try {
      const res = await apiFetch(`/api/saved-views?table_id=${encodeURIComponent(tableId)}`);
      const json = await res.json();
      const rows = (json.data ?? []) as {
        id: string; label: string; config: Record<string, unknown>;
        visibility?: "personal" | "team" | "system"; is_default?: boolean; owner_name?: string | null;
      }[];
      setUserViews(rows.map(r => ({
        id: r.id, label: r.label,
        baseViewId:       (r.config.baseViewId as string) ?? "all",
        colFilterValues:  (r.config.colFilterValues as Record<string, ColumnFilterValue>) ?? {},
        globalSearch:     (r.config.globalSearch as string) ?? "",
        columnVisibility: (r.config.columnVisibility as VisibilityState) ?? {},
        groupBy:          (r.config.groupBy as string | null) ?? null,
        columnOrder:      r.config.columnOrder as string[] | undefined,
        columnSizing:     r.config.columnSizing as Record<string, number> | undefined,
        columnPinning:    r.config.columnPinning as { left?: string[]; right?: string[] } | undefined,
        sorting:          r.config.sorting as { id: string; desc: boolean }[] | undefined,
        density:          r.config.density as "normal" | "compact" | undefined,
        pageSize:         r.config.pageSize as number | undefined,
        viewMode:         r.config.viewMode as "table" | "cards" | undefined,
        visibility:       r.visibility ?? "personal",
        is_default:       r.is_default ?? false,
        owner_name:       r.owner_name ?? null,
      })));
    } catch { /* ignore */ }
  }, [tableId]);

  useEffect(() => { fetchUserViews(); }, [fetchUserViews]);

  // Auto-apply default view ตอนโหลดครั้งแรก (ถ้ามี is_default + ยังไม่เคย apply)
  const defaultAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultAppliedRef.current) return;
    if (userViews.length === 0) return;
    const def = userViews.find(v => v.is_default);
    if (def) {
      defaultAppliedRef.current = true;
      applyUserView(def);
    } else {
      defaultAppliedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userViews.length]);

  // ---- Auto-detect fields from data not in defined columns ----
  const definedColumnKeys = useMemo(() => new Set(
    columns.map(c => String(
      (c as unknown as Record<string, unknown>).accessorKey ??
      (c as unknown as Record<string, unknown>).id ?? ""
    )).filter(k => k)
  ), [columns]);

  const extraDataKeys = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0] as Record<string, unknown>)
      .filter(k => !definedColumnKeys.has(k));
  }, [data, definedColumnKeys]);

  // Registry lookup map
  const registryMap = useMemo(() => {
    const m: Record<string, FieldRegistryEntry> = {};
    fieldRegistry.forEach(f => { m[f.field_key] = f; });
    return m;
  }, [fieldRegistry]);

  // Auto-generated columns for extra data keys (hidden by default)
  // ใช้ field_label / group_key / ui_type จาก Field Registry ถ้ามี
  const autoColumnDefs = useMemo<ColumnDef<T>[]>(() => {
    return extraDataKeys.map(key => {
      const reg = registryMap[key];
      return {
        id: key,
        accessorKey: key,
        header: reg?.field_label ?? key,
        size: reg?.col_width ?? 150,
        meta: {
          group:        reg?.group_key ?? "Supabase Fields",
          filterable:   reg?.is_filterable ?? false,
          filterType:   reg ? uiTypeToFilterType(reg.ui_type) : undefined,
        },
        cell: buildRegistryCell(reg?.ui_type ?? "text", key),
      } as ColumnDef<T>;
    });
  }, [extraDataKeys, registryMap]);

  // Registry fields NOT in data → แสดงใน Column Manager แบบ "ยังไม่มีใน API"
  const registryOnlyFields = useMemo<FieldRegistryEntry[]>(() => {
    return fieldRegistry.filter(f =>
      !definedColumnKeys.has(f.field_key) &&
      !extraDataKeys.includes(f.field_key) &&
      !f.is_sensitive
    );
  }, [fieldRegistry, definedColumnKeys, extraDataKeys]);

  // Merge user columns + auto columns
  const allDefinedColumns = useMemo(() => [...columns, ...autoColumnDefs], [columns, autoColumnDefs]);

  // Hide auto-detected columns by default (once on first detection)
  const autoHiddenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const newKeys = extraDataKeys.filter(k => !autoHiddenRef.current.has(k));
    if (newKeys.length === 0) return;
    newKeys.forEach(k => autoHiddenRef.current.add(k));
    setColumnVisibility(prev => {
      const updated = { ...prev };
      let changed = false;
      newKeys.forEach(k => {
        if (!(k in updated)) { updated[k] = false; changed = true; }
      });
      return changed ? updated : prev;
    });
  }, [extraDataKeys]);

  // ---- Filterable fields (auto-build from column meta) ----
  const filterableFromColumns = useMemo<FilterableField[]>(() => {
    // F27: server mode ก็ใช้ filter ได้ (ส่งไปกรองที่ server)
    return columns.reduce<FilterableField[]>((acc, col) => {
      if (!col.meta?.filterable) return acc;
      const colId = String(
        (col as unknown as Record<string, unknown>).accessorKey ??
        (col as unknown as Record<string, unknown>).id ?? ""
      );
      if (!colId || columnVisibility[colId] === false) return acc;
      const label = typeof col.header === "string" ? col.header : (col.meta.filterLabel ?? colId);
      const type: FilterFieldType = col.meta.filterOptions ? "select"
        : (col.meta.filterType ?? inferFilterType(colId, data as Record<string, unknown>[]));
      acc.push({ key: colId, label, type, options: col.meta.filterOptions });
      return acc;
    }, []);
  }, [columns, columnVisibility, data]);

  const activeFilterCount = useMemo(
    () => filterableFromColumns.filter(f => isColFilterActive(colFilterValues[f.key])).length,
    [filterableFromColumns, colFilterValues]
  );

  const setColFilter = (key: string, val: ColumnFilterValue) =>
    setColFilterValues(prev => ({ ...prev, [key]: val }));

  const clearColFilters = () => setColFilterValues({});

  // ---- Saved views helpers (Supabase) ----
  const saveView = async () => {
    if (!saveViewName.trim() || !tableId) return;
    // แบบ A: เก็บหน้าตาตารางครบ
    const config = {
      baseViewId: activeView, colFilterValues, globalSearch, columnVisibility, groupBy,
      columnOrder, columnSizing, columnPinning, sorting, density, viewMode,
      pageSize: isServer ? srvPageSize : table.getState().pagination.pageSize,
    };
    const res = await apiFetch("/api/saved-views", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table_id: tableId, label: saveViewName.trim(), visibility: saveViewVis, config }),
    });
    const j = await res.json().catch(() => ({}));
    // ติ๊ก "ตั้งเป็นค่าเริ่มต้น" → PATCH view ที่เพิ่งสร้าง (clear default ตัวอื่นให้อัตโนมัติ)
    const newId = typeof j.data === "string" ? j.data : (j.data?.id as string | undefined);
    if (saveViewDefault && newId) {
      await apiFetch(`/api/saved-views?id=${newId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      }).catch(() => {});
    }
    setSavingView(false); setSaveViewName(""); setSaveViewVis("personal"); setSaveViewDefault(false);
    await fetchUserViews();
  };

  const deleteUserView = async (id: string) => {
    if (!confirm("ลบ view นี้?")) return;
    await apiFetch(`/api/saved-views?id=${id}`, { method: "DELETE" });
    await fetchUserViews();
  };

  // Toggle default flag — clear default ของ view อื่นใน table+owner เดียวกัน
  const setDefaultView = async (id: string, makeDefault: boolean) => {
    await apiFetch(`/api/saved-views?id=${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_default: makeDefault }),
    });
    await fetchUserViews();
  };

  const applyUserView = (view: StoredView) => {
    setActiveView(view.baseViewId);
    setColFilterValues(view.colFilterValues ?? {});
    setGlobalSearch(view.globalSearch ?? "");
    setColumnVisibility(view.columnVisibility ?? {});
    setGroupBy(view.groupBy ?? null);   // เฟส 3: คืนค่าการจัดกลุ่ม
    setCollapsedGroups(new Set());
    // แบบ A: คืนหน้าตาตารางครบ (ถ้ามีเก็บไว้)
    if (view.columnOrder) setColumnOrder(view.columnOrder);
    if (view.columnSizing) setColumnSizing(view.columnSizing);
    if (view.columnPinning) setColumnPinning(view.columnPinning);
    if (view.sorting) setSorting(view.sorting);
    if (view.density) setDensity(view.density);
    if (view.viewMode) setViewMode(view.viewMode);
    if (view.pageSize) setPendingDefaultPageSize(view.pageSize);
    setRowSelection({});
  };

  // ---- Row click ----
  const handleRowClick = (row: T) => {
    if (drawerContent) { setDrawerRow(row); setShowDrawer(true); }
    onRowClick?.(row);
  };
  const isRowClickable = !!(drawerContent || onRowClick);

  // ---- Filtered data ----
  const filteredData = useMemo(() => {
    if (isServer) return groupBy ? srvGroupRows : srvRows;   // server: จัดกลุ่ม=ใช้ batch ใหญ่, ปกติ=หน้าปัจจุบัน
    let d = data;
    const view = views.find(v => v.id === activeView);
    if (view?.filter) d = d.filter(row => view.filter!(row as Record<string, unknown>));

    const activeCFs = filterableFromColumns.filter(f => isColFilterActive(colFilterValues[f.key]));
    if (activeCFs.length > 0) {
      d = d.filter(row => activeCFs.every(field => {
        const fv = colFilterValues[field.key];
        if (!fv) return true;
        const rawVal = (row as Record<string, unknown>)[field.key];
        if (fv.type === "text") return !fv.value || String(rawVal ?? "").toLowerCase().includes(fv.value.toLowerCase());
        if (fv.type === "number") {
          const num = Number(rawVal);
          if (fv.min !== "" && !isNaN(Number(fv.min)) && num < Number(fv.min)) return false;
          if (fv.max !== "" && !isNaN(Number(fv.max)) && num > Number(fv.max)) return false;
          return true;
        }
        if (fv.type === "select") return fv.selected.length === 0 || fv.selected.includes(String(rawVal ?? ""));
        if (fv.type === "boolean") return Boolean(rawVal) === (fv.value === "true");
        return true;
      }));
    }

    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      d = d.filter(row =>
        (searchableKeys.length > 0 ? searchableKeys : Object.keys(row) as (keyof T)[]).some(
          k => String(row[k] ?? "").toLowerCase().includes(q)
        )
      );
    }
    return d;
  }, [isServer, srvRows, srvGroupRows, groupBy, data, activeView, views, colFilterValues, filterableFromColumns, globalSearch, searchableKeys]);

  // แจ้งแถวที่แสดงอยู่ออกไป (สำหรับปุ่มเลื่อนรายการในป๊อปอัป)
  useEffect(() => { onVisibleRowsChange?.(filteredData); }, [filteredData, onVisibleRowsChange]);

  // ---- Column building ----
  // แสดง checkbox เลือกแถว เมื่อมี bulk actions หรือ bulk edit
  const hasBulk = bulkActions.length > 0 || (bulkEditFields.length > 0 && !!onBulkEdit);
  const showSelectCol = hasBulk || selectable;
  const withSelectCol = useMemo<ColumnDef<T>[]>(() => {
    if (!showSelectCol) return allDefinedColumns;
    return [
      {
        id: "__select__",
        size: 40,
        header: ({ table }) => (
          <input type="checkbox" className="rounded border-slate-300 text-blue-600"
            checked={table.getIsAllPageRowsSelected()}
            ref={el => { if (el) el.indeterminate = table.getIsSomePageRowsSelected(); }}
            onChange={table.getToggleAllPageRowsSelectedHandler()} />
        ),
        cell: ({ row }) => (
          <input type="checkbox" className="rounded border-slate-300 text-blue-600"
            checked={row.getIsSelected()}
            onClick={e => e.stopPropagation()}
            onChange={row.getToggleSelectedHandler()} />
        ),
        enableSorting: false, enableHiding: false,
      },
      ...allDefinedColumns,
    ];
  }, [allDefinedColumns, showSelectCol]);

  const tableColumns = useMemo<ColumnDef<T>[]>(() => {
    // สรุปท้ายคอลัมน์ (ของกลาง) — ฉีด meta.summary จาก settings.summaries (sum/count/avg)
    const summaries = layoutSettings?.summaries ?? {};
    const injectSummary = (cols: ColumnDef<T>[]): ColumnDef<T>[] => {
      if (Object.keys(summaries).length === 0) return cols;
      return cols.map((c) => {
        const id = String((c as unknown as { accessorKey?: string }).accessorKey ?? c.id ?? "");
        const st = summaries[id];
        if (!st) return c;
        const summary: NonNullable<ColumnDef<T>["meta"]>["summary"] = st === "avg"
          ? (rows: unknown[]) => {
              const nums = (rows as Record<string, unknown>[]).map((r) => Number(r[id])).filter((n) => isFinite(n));
              return nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toLocaleString("th-TH", { maximumFractionDigits: 2 }) : "—";
            }
          : st;
        return { ...c, meta: { ...(c.meta ?? {}), summary } };
      });
    };
    const base = injectSummary(withSelectCol);
    if (rowActions.length === 0) return base;
    return [
      ...base,
      {
        id: "__actions__",
        size: 48,
        header: () => null,
        cell: ({ row }) => (
          <div className="flex justify-center">
            <button
              onClick={e => {
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                setRowMenu(prev =>
                  prev && prev.row === row.original ? null : { row: row.original, x: r.right, y: r.bottom }
                );
              }}
              className="h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <IconMoreVertical />
            </button>
          </div>
        ),
        enableSorting: false, enableHiding: false,
      },
    ];
  }, [withSelectCol, rowActions, layoutSettings]);

  // ---- TanStack Table instance ----
  const table = useReactTable({
    data: filteredData,
    columns: tableColumns,
    columnResizeMode: "onChange",  // column resize
    state: { sorting, columnFilters, columnVisibility, rowSelection, columnSizing, columnOrder, columnPinning },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: setColumnOrder,
    onColumnPinningChange: setColumnPinning,
    manualPagination: isServer,
    manualSorting:    isServer,
    manualFiltering:  isServer,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: isServer ? undefined : getSortedRowModel(),
    getFilteredRowModel: isServer ? undefined : getFilteredRowModel(),
    getPaginationRowModel: isServer ? undefined : getPaginationRowModel(),
    initialState: { pagination: { pageSize: initialPageSize } },
  });

  const selectedRows  = table.getSelectedRowModel().rows.map(r => r.original);
  const selectedCount = selectedRows.length;

  // ---- Freeze header: ให้พื้นที่ตาราง scroll ในตัว (สูงพอดีจอ) → thead sticky ค้างได้จริง ----
  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const recalc = () => {
      const top = el.getBoundingClientRect().top;          // ระยะจากบนจอถึงหัวตาราง
      const h = Math.round(window.innerHeight - top - 12);  // เผื่อขอบล่างนิดหน่อย
      setTableMaxH(h > 240 ? h : 240);
    };
    const raf = requestAnimationFrame(recalc);
    window.addEventListener("resize", recalc);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", recalc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, loading, srvLoading, srvGroupLoading, showFilterPanel, selectedCount]);

  // apply pendingDefaultPageSize หลัง table create
  useEffect(() => {
    if (pendingDefaultPageSize == null) return;
    if (isServer) setSrvPageSize(pendingDefaultPageSize);
    else table.setPageSize(pendingDefaultPageSize);
    setPendingDefaultPageSize(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDefaultPageSize]);

  // Group hidable columns by meta.group for Column Manager
  const groupedHidableColumns = useMemo(() => {
    const map = new Map<string, ReturnType<typeof table.getAllColumns>>();
    table.getAllColumns().filter(c => c.getCanHide()).forEach(col => {
      const group = col.columnDef.meta?.group
        ?? (extraDataKeys.includes(col.id) ? "Supabase Fields" : "ทั่วไป");
      const arr = map.get(group) ?? [];
      arr.push(col);
      map.set(group, arr);
    });
    return map;
  }, [table, extraDataKeys]);

  // ---- Export — ผ่าน service กลาง ----
  // 3 modes: visible (filter + columns ที่แสดง), selected (เฉพาะที่ติ๊ก), filtered_all (ทุก column ของแถวที่กรอง)
  const buildExportColumns = (mode: "visible" | "filtered_all") => {
    const cols = mode === "visible"
      ? table.getVisibleLeafColumns().filter(c => c.id !== "__select__" && c.id !== "__actions__")
      : table.getAllLeafColumns().filter(c => c.id !== "__select__" && c.id !== "__actions__");
    const mapped = cols.map(c => {
      const reg = fieldRegistry.find(f => f.field_key === c.id);
      const meta = c.columnDef.meta as { permission?: string } | undefined;
      return {
        key: c.id,
        header: reg?.field_label
          ?? (typeof c.columnDef.header === "string" ? (c.columnDef.header as string) : c.id),
        permission: meta?.permission as string | undefined,
      };
    });
    // ใส่คอลัมน์ ID ไว้บนสุดเสมอ → Export ออกไปแก้แล้วนำเข้ากลับ (อัปเดตด้วย ID) ได้
    if (!mapped.some(m => m.key === "id")) mapped.unshift({ key: "id", header: "ID", permission: undefined });
    return mapped;
  };
  const handleExportMode = async (format: "csv" | "excel", mode: "visible" | "selected" | "filtered_all") => {
    try {
      const expCols = buildExportColumns(mode === "selected" ? "visible" : mode);
      const sourceRows = mode === "selected"
        ? table.getSelectedRowModel().rows.map(r => r.original as Record<string, unknown>)
        : table.getFilteredRowModel().rows.map(r => r.original as Record<string, unknown>);
      if (sourceRows.length === 0) { setExportOpen(false); return; }
      const { exportTable } = await import("@/lib/export");
      const res = await exportTable({
        format, filename: exportFilename, rows: sourceRows, columns: expCols, can: canCheck,
        context: {
          entityType: exportEntityType ?? exportFilename,
          mode, totalRows: sourceRows.length,
          filterDesc: globalSearch ? `search: ${globalSearch}` : undefined,
        },
      });
      if (res.blocked.length > 0) {
        // ⚠ มีคอลัมน์ที่ user ไม่มีสิทธิ์ — แสดง toast แบบ inline ผ่าน console (ทำต่อใน UI ได้)
        console.warn("[export] blocked columns:", res.blocked);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "export ไม่สำเร็จ");
    } finally {
      setExportOpen(false);
    }
  };

  // ---- Column reorder (drag header) ----
  const reorderColumn = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const current = table.getState().columnOrder.length
      ? [...table.getState().columnOrder]
      : table.getAllLeafColumns().map(c => c.id);
    const fromIdx = current.indexOf(fromId);
    const toIdx   = current.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0) return;
    current.splice(fromIdx, 1);
    current.splice(toIdx, 0, fromId);
    table.setColumnOrder(current);
  };

  const isInternalCol = (id: string) => id === "__select__" || id === "__actions__";

  // ---- Inline edit save ----
  const saveInlineEdit = async (row: T, override?: string) => {
    if (!editCell || !onInlineEdit) { setEditCell(null); return; }
    setEditSaving(true);
    try {
      await onInlineEdit(row, editCell.colId, override ?? editValue);
    } finally {
      setEditSaving(false);
      setEditCell(null);
    }
  };

  // ---- Render ----
  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      {(title || description) && (
        <div className="px-6 py-4 border-b border-slate-200 bg-white">
          {title && <h2 className="text-lg font-semibold text-slate-900">{title}</h2>}
          {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
        </div>
      )}

      {/* ---- View Tabs + Saved Views ---- (server mode: tabs ส่ง filter ให้ server) */}
      {(views.length > 0 || userViews.length > 0 || tableId) && (
        <div className="flex items-center border-b border-slate-200 bg-white px-4 overflow-x-auto gap-0">
          {/* System views (from props) — สไตล์ tab เดียวกับ saved view */}
          {views.map(view => {
            const isActive = activeView === view.id && userViews.every(uv => uv.id !== activeView);
            return (
              <button key={view.id} onClick={() => { setActiveView(view.id); setRowSelection({}); }}
                className={`h-10 px-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors inline-flex items-center ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}>
                {view.label}
              </button>
            );
          })}

          {/* User saved views — สูง h-10 เท่ากับ system views, ดาวกดได้ */}
          {userViews.map(view => {
            const visIcon = view.visibility === "system" ? "⭐"
                          : view.visibility === "team"   ? "👥" : "";
            const visTitle = view.visibility === "system" ? "System view"
                          : view.visibility === "team"   ? `Team view${view.owner_name ? " · " + view.owner_name : ""}`
                          : "View ของฉัน";
            const isActive = activeView === view.baseViewId;
            return (
              <div key={view.id} className="relative group flex-shrink-0 inline-flex items-center">
                <button onClick={() => applyUserView(view)} title={visTitle}
                  className={`h-10 pl-3 pr-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors inline-flex items-center gap-1 ${
                    isActive
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}>
                  {visIcon && <span className="text-xs">{visIcon}</span>}
                  <span>{view.label}</span>
                </button>
                {/* ดาว — กดสลับ default */}
                <button
                  onClick={(e) => { e.stopPropagation(); setDefaultView(view.id, !view.is_default); }}
                  title={view.is_default ? "ยกเลิก default" : "ตั้งเป็น default view"}
                  className={`h-10 w-6 inline-flex items-center justify-center transition-colors ${
                    view.is_default ? "text-amber-500 hover:text-amber-600" : "text-slate-300 hover:text-amber-500"
                  }`}
                >{view.is_default ? "★" : "☆"}</button>
                {/* X delete — โผล่ตอน hover */}
                <button onClick={() => deleteUserView(view.id)}
                  title="ลบ view"
                  className="h-10 w-5 inline-flex items-center justify-center text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  <IconX />
                </button>
              </div>
            );
          })}

          {/* Save view button or inline input */}
          {tableId && (
            savingView ? (
              <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                <input
                  ref={saveInputRef}
                  value={saveViewName}
                  onChange={e => setSaveViewName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveView(); if (e.key === "Escape") { setSavingView(false); setSaveViewName(""); setSaveViewDefault(false); } }}
                  placeholder="ชื่อ View..."
                  autoFocus
                  className="h-7 w-28 px-2 text-xs border border-blue-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {canCheck?.("saved_views.share") && (
                  <select value={saveViewVis} onChange={e => setSaveViewVis(e.target.value as "personal" | "team")}
                    title="การมองเห็น"
                    className="h-7 px-1 text-xs border border-blue-300 rounded-md bg-white">
                    <option value="personal">👤 ส่วนตัว</option>
                    <option value="team">👥 ทีม</option>
                  </select>
                )}
                <label className="flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap" title="เปิดหน้านี้ครั้งหน้าจะใช้มุมมองนี้อัตโนมัติ">
                  <input type="checkbox" checked={saveViewDefault} onChange={e => setSaveViewDefault(e.target.checked)} className="rounded border-slate-300" />
                  ⭐ค่าเริ่มต้น
                </label>
                <button onClick={saveView} className="h-7 px-2 text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700">บันทึก</button>
                <button onClick={() => { setSavingView(false); setSaveViewName(""); setSaveViewDefault(false); }} className="h-7 px-2 text-xs text-slate-500 hover:text-slate-700">ยกเลิก</button>
              </div>
            ) : (
              <button onClick={() => setSavingView(true)}
                title="บันทึก View ปัจจุบัน"
                className="ml-2 h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <IconPlus />
              </button>
            )
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><IconSearch /></span>
          <input type="text" placeholder={searchPlaceholder} value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          {globalSearch && (
            <button onClick={() => setGlobalSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><IconX /></button>
          )}
        </div>
        <div className="flex-1" />

        {/* Filter — F30: โผล่แม้ยังไม่มี field กรอง ถ้ามีปุ่มเลือก field (onSetFilterable) */}
        {(filterableFromColumns.length > 0 || (!!onSetFilterable && (filterFieldOptions?.length ?? 0) > 0)) && (
          <button onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`flex items-center gap-1.5 h-8 px-3 text-sm border rounded-md transition-colors ${
              showFilterPanel || activeFilterCount > 0
                ? "bg-blue-50 border-blue-300 text-blue-700"
                : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
            }`}>
            <IconFilter />
            <span className="hidden sm:inline">Filter</span>
            {activeFilterCount > 0 && (
              <span className="ml-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}

        {/* Column Manager */}
        <div className="relative">
          <button onClick={() => setShowColumnMgr(!showColumnMgr)}
            className="flex items-center gap-1.5 h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-md bg-white hover:bg-slate-50 transition-colors">
            <IconColumns />
            <span className="hidden sm:inline">Columns</span>
            {extraDataKeys.length > 0 && (
              <span className="ml-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-amber-400 text-white text-xs font-bold" title={`${extraDataKeys.length} Supabase fields`}>
                +{extraDataKeys.length}
              </span>
            )}
          </button>

          {/* Column Manager dropdown — grouped */}
          {showColumnMgr && (
            <>
            {/* คลิกรอบนอกเพื่อปิด */}
            <div className="fixed inset-0 z-10" onClick={() => setShowColumnMgr(false)} />
            <div className="absolute right-0 top-10 z-20 w-60 bg-white border border-slate-200 rounded-lg shadow-lg py-2 max-h-[420px] overflow-y-auto">
              <div className="px-3 pb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">คอลัมน์</span>
                <button onClick={() => table.getAllColumns().filter(c => c.getCanHide()).forEach(c => c.toggleVisibility(true))}
                  className="text-xs text-blue-600 hover:underline">Reset</button>
              </div>

              {Array.from(groupedHidableColumns.entries()).map(([groupName, cols]) => (
                <div key={groupName}>
                  {groupedHidableColumns.size > 1 && (
                    <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{groupName}</span>
                      {groupName === "Supabase Fields" && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 rounded-full">ยังไม่ตั้งค่า</span>
                      )}
                    </div>
                  )}
                  {cols.map(col => (
                    <div key={col.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50">
                      <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                        <input type="checkbox" checked={col.getIsVisible()}
                          onChange={col.getToggleVisibilityHandler()}
                          className="rounded border-slate-300 text-blue-600 shrink-0" />
                        <span className="flex flex-col min-w-0">
                          <span className="text-sm text-slate-700 truncate">
                            {typeof col.columnDef.header === "string" ? col.columnDef.header : col.id}
                          </span>
                          {/* ชื่อ field จริงในฐานข้อมูล (เอาไว้บอกตอนดึงข้อมูล) */}
                          <code className="text-[10px] text-slate-400 truncate font-mono">{col.id}</code>
                        </span>
                        {col.columnDef.meta?.filterable && <span className="text-xs text-slate-400 shrink-0" title="filterable">⚙</span>}
                      </label>
                      {/* ปุ่มคัดลอกชื่อ field จริง */}
                      <button
                        onClick={() => { try { navigator.clipboard?.writeText(col.id); setCopiedField(col.id); setTimeout(() => setCopiedField(null), 1200); } catch { /* ignore */ } }}
                        title={`คัดลอกชื่อ field: ${col.id}`}
                        className={`text-xs shrink-0 ${copiedField === col.id ? "text-emerald-600" : "text-slate-300 hover:text-slate-600"}`}>
                        {copiedField === col.id ? "✓" : "⧉"}
                      </button>
                      {/* ปุ่มตรึงคอลัมน์ (pin ซ้าย) */}
                      <button
                        onClick={() => col.pin(col.getIsPinned() === "left" ? false : "left")}
                        title={col.getIsPinned() === "left" ? "ยกเลิกตรึง" : "ตรึงคอลัมน์ (ติดซ้าย)"}
                        className={`text-xs shrink-0 ${col.getIsPinned() === "left" ? "text-blue-600" : "text-slate-300 hover:text-slate-500"}`}>
                        📌
                      </button>
                    </div>
                  ))}
                  {groupName !== Array.from(groupedHidableColumns.keys()).at(-1) && (
                    <div className="mx-3 my-1 border-t border-slate-100" />
                  )}
                </div>
              ))}

              {/* Registry-only fields (exist in Supabase but not yet in API response) */}
              {registryOnlyFields.length > 0 && (
                <div>
                  <div className="mx-3 my-1 border-t border-slate-100" />
                  <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">ยังไม่มีใน API</span>
                    <span className="text-xs bg-slate-100 text-slate-400 px-1.5 rounded-full">{registryOnlyFields.length}</span>
                  </div>
                  {registryOnlyFields.map(f => (
                    <div key={f.field_key} className="flex items-center gap-2 px-3 py-1.5 opacity-40" title="field นี้มีใน Supabase แต่ยังไม่ได้เพิ่มใน API">
                      <input type="checkbox" disabled className="rounded border-slate-300 w-4 h-4" />
                      <span className="text-sm text-slate-500 flex-1">{f.field_label}</span>
                      <span className="text-xs text-slate-400 bg-slate-50 px-1 rounded">{f.group_key}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t border-slate-100 mt-1 pt-1 px-3 flex items-center justify-between">
                <button onClick={() => setShowColumnMgr(false)} className="text-xs text-slate-500 hover:text-slate-700">ปิด</button>
                {tableId && (
                  <button onClick={resetToAdminDefault}
                    title="รีเซ็ตกลับเป็น layout default ของระบบ"
                    className="text-xs text-amber-700 hover:text-amber-900 hover:bg-amber-50 px-2 py-0.5 rounded">
                    🔄 รีเซ็ต default
                  </button>
                )}
              </div>
            </div>
            </>
          )}
        </div>

        {/* F2: ปุ่มเข้าหน้าตั้งค่าฟิลด์ (Field Registry) ของโมดูลนี้ */}
        {tableId && (
          <a href={`/admin/module/${tableId.replace(/^master-/, "")}`}
            title="ตั้งค่าฟิลด์ของตารางนี้ (Field Registry)"
            className="flex items-center gap-1.5 h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-md bg-white hover:bg-slate-50 transition-colors">
            <span>⚙</span><span className="hidden sm:inline">ตั้งค่าฟิลด์</span>
          </a>
        )}

        {/* View Switcher (Table / Cards) */}
        {showCardToggle && (
          <div className="flex items-center h-8 border border-slate-200 rounded-md overflow-hidden">
            <button onClick={() => setViewMode("table")} title="แสดงแบบตาราง"
              className={`h-full px-2.5 text-sm transition-colors ${viewMode === "table" ? "bg-blue-50 text-blue-700" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📋</button>
            <button onClick={() => setViewMode("cards")} title="แสดงแบบการ์ด"
              className={`h-full px-2.5 text-sm transition-colors border-l border-slate-200 ${viewMode === "cards" ? "bg-blue-50 text-blue-700" : "bg-white text-slate-600 hover:bg-slate-50"}`}>🗂</button>
            {viewMode === "cards" && (
              <button onClick={() => setShowCardCfg(true)} title="ตั้งค่าการ์ด"
                className="h-full px-2.5 text-sm bg-white text-slate-500 hover:bg-slate-50 border-l border-slate-200">⚙</button>
            )}
          </div>
        )}

        {/* Density toggle (เฉพาะ table) */}
        {viewMode === "table" && (
          <button
            onClick={() => setDensity(d => d === "normal" ? "compact" : "normal")}
            title={density === "normal" ? "แสดงแบบแน่น (เห็นข้อมูลมากขึ้น)" : "แสดงแบบปกติ"}
            className="flex items-center gap-1.5 h-8 px-2.5 text-sm text-slate-600 border border-slate-200 rounded-md bg-white hover:bg-slate-50 transition-colors">
            {density === "normal" ? "≣" : "≡"}
          </button>
        )}

        {/* Group by (จัดกลุ่ม) — เฉพาะ table (client + server แบบ A) */}
        {viewMode === "table" && (
          <div className="relative">
            <button onClick={() => setGroupMenuOpen(o => !o)} title="จัดกลุ่มตาราง"
              className={`flex items-center gap-1.5 h-8 px-2.5 text-sm border rounded-md transition-colors ${groupBy ? "bg-blue-50 text-blue-700 border-blue-200" : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"}`}>
              <span>⊞</span>
              <span className="hidden sm:inline">{groupBy ? "จัดกลุ่มแล้ว" : "จัดกลุ่ม"}</span>
              <span className="text-slate-400">▾</span>
            </button>
            {groupMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setGroupMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden max-h-72 overflow-y-auto">
                  <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">จัดกลุ่มตาม</div>
                  <button onClick={() => { setGroupBy(null); setGroupMenuOpen(false); }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${!groupBy ? "text-blue-700 font-medium" : "text-slate-600"}`}>— ไม่จัดกลุ่ม —</button>
                  {table.getVisibleLeafColumns().filter(c => c.id !== "__select__" && c.id !== "__actions__").map(c => {
                    const label = typeof c.columnDef.header === "string" ? c.columnDef.header : c.id;
                    return (
                      <button key={c.id} onClick={() => { setGroupBy(c.id); setCollapsedGroups(new Set()); setGroupMenuOpen(false); }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${groupBy === c.id ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700"}`}>{label}</button>
                    );
                  })}
                  {/* ข้อ 3a: เรียงกลุ่มตาม */}
                  {groupBy && (
                    <>
                      <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-400 bg-slate-50 border-y border-slate-100">เรียงกลุ่มตาม</div>
                      {([
                        ["label_asc", "ชื่อกลุ่ม ก→ฮ"], ["label_desc", "ชื่อกลุ่ม ฮ→ก"],
                        ["count_desc", "จำนวนมาก→น้อย"], ["count_asc", "จำนวนน้อย→มาก"],
                      ] as [typeof groupSort, string][]).map(([val, lbl]) => (
                        <button key={val} onClick={() => setGroupSort(val)}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${groupSort === val ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700"}`}>{lbl}</button>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Export — dropdown */}
        <div className="relative">
          <button
            onClick={() => setExportOpen(o => !o)}
            disabled={filteredData.length === 0}
            title={`Export ${filteredData.length} รายการ`}
            className="flex items-center gap-1.5 h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-md bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <IconDownload />
            <span className="hidden sm:inline">Export</span>
            <span className="text-slate-400">▾</span>
          </button>
          {exportOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
                <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">
                  Excel (.xlsx)
                </div>
                <button onClick={() => handleExportMode("excel", "visible")}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center justify-between">
                  <span>📊 ที่แสดง (filter + คอลัมน์)</span>
                  <span className="text-xs text-slate-400">{filteredData.length}</span>
                </button>
                {table.getSelectedRowModel().rows.length > 0 && (
                  <button onClick={() => handleExportMode("excel", "selected")}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center justify-between">
                    <span>✓ ที่เลือก</span>
                    <span className="text-xs text-slate-400">{table.getSelectedRowModel().rows.length}</span>
                  </button>
                )}
                <button onClick={() => handleExportMode("excel", "filtered_all")}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center justify-between">
                  <span>📋 ทุกคอลัมน์ (ตามฟิลเตอร์)</span>
                  <span className="text-xs text-slate-400">{filteredData.length}</span>
                </button>
                <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-400 bg-slate-50 border-y border-slate-100">
                  CSV (.csv)
                </div>
                <button onClick={() => handleExportMode("csv", "visible")}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center justify-between">
                  <span>📄 ที่แสดง (CSV)</span>
                  <span className="text-xs text-slate-400">{filteredData.length}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilterPanel && (filterableFromColumns.length > 0 || (!!onSetFilterable && (filterFieldOptions?.length ?? 0) > 0)) && (
        <ColumnFilterPanel
          filterableFields={filterableFromColumns}
          colFilterValues={colFilterValues}
          data={data as Record<string, unknown>[]}
          onSetFilter={setColFilter}
          onClear={clearColFilters}
          onClose={() => setShowFilterPanel(false)}
          resultCount={filteredData.length}
          filterFieldOptions={filterFieldOptions}
          onSetFilterable={onSetFilterable}
        />
      )}

      {/* Active filter chips */}
      {!showFilterPanel && activeFilterCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100 flex-wrap">
          <span className="text-xs text-blue-600 font-medium flex items-center gap-1"><IconFilter /> กรองอยู่:</span>
          {filterableFromColumns.filter(f => isColFilterActive(colFilterValues[f.key])).map(f => {
            const fv = colFilterValues[f.key];
            let label = f.label;
            if (fv?.type === "text")   label = `${f.label}: "${fv.value}"`;
            if (fv?.type === "number") label = `${f.label}: ${fv.min || "0"} – ${fv.max || "∞"}`;
            if (fv?.type === "select") {
              const opts = f.options ?? [];
              label = `${f.label}: ${fv.selected.map(v => opts.find(o => o.value === v)?.label ?? v).join(", ")}`;
            }
            if (fv?.type === "boolean") label = `${f.label}: ${fv.value === "true" ? "ใช่" : "ไม่ใช่"}`;
            return (
              <span key={f.key} className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-700 text-xs px-2 py-1 rounded-full">
                {label}
                <button onClick={() => {
                  if (fv?.type === "text")    setColFilter(f.key, { type: "text",   value: "" });
                  if (fv?.type === "number")  setColFilter(f.key, { type: "number", min: "", max: "" });
                  if (fv?.type === "select")  setColFilter(f.key, { type: "select", selected: [] });
                  if (fv?.type === "boolean") setColFilter(f.key, { type: "text",   value: "" });
                }} className="text-blue-400 hover:text-red-500 ml-0.5"><IconX /></button>
              </span>
            );
          })}
          <button onClick={clearColFilters} className="text-xs text-red-500 hover:text-red-700 ml-1">ล้างทั้งหมด</button>
          <button onClick={() => setShowFilterPanel(true)} className="text-xs text-blue-600 hover:text-blue-800 underline ml-auto">แก้ไข Filter</button>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border-b border-blue-200">
          <span className="text-sm font-medium text-blue-700">เลือกแล้ว {selectedCount} รายการ</span>
          <div className="flex items-center gap-2">
            {bulkEditFields.length > 0 && onBulkEdit && (
              <button onClick={() => setBulkEditOpen(true)}
                className="h-7 px-3 text-xs font-medium rounded-md border bg-white border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors">
                ✏️ แก้รายการที่เลือก
              </button>
            )}
            {isServer && onBulkEditAllMatching && bulkEditFields.length > 0 && srvTotal > selectedCount && (
              <button onClick={() => setBulkAllOpen(true)}
                className="h-7 px-3 text-xs font-medium rounded-md border bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 transition-colors">
                ✏️ แก้ทั้งหมดที่ตรงตัวกรอง ({srvTotal.toLocaleString()})
              </button>
            )}
            {bulkActions.map((action, i) => (
              <button key={i} onClick={() => { action.onClick(selectedRows); setRowSelection({}); }}
                className={`h-7 px-3 text-xs font-medium rounded-md border transition-colors ${
                  action.variant === "danger"
                    ? "bg-white border-red-200 text-red-600 hover:bg-red-50"
                    : "bg-white border-blue-200 text-blue-700 hover:bg-blue-100"
                }`}>
                {action.label}
              </button>
            ))}
          </div>
          <button onClick={() => setRowSelection({})} className="ml-auto text-blue-500 hover:text-blue-700"><IconX /></button>
        </div>
      )}

      {/* Table / Cards — scroll ในตัว (สูงพอดีจอ) เพื่อให้ header (thead sticky) ค้างเวลาเลื่อน */}
      <div ref={tableScrollRef} className="flex-1 overflow-auto" style={tableMaxH ? { maxHeight: tableMaxH } : undefined}>
        {/* เฟส 4: เตือนเมื่อจัดกลุ่มจากตัวอย่าง (ข้อมูลเกิน cap) */}
        {isGrouped && srvGroupCapped && !srvGroupLoading && (
          <div className="mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            ⚠ จัดกลุ่มจาก {srvGroupRows.length.toLocaleString()} แถวแรก (ข้อมูลมีมากกว่านี้) — กรองให้แคบลงเพื่อยอดที่ครบถ้วน
          </div>
        )}
        {(loading || srvLoading || srvGroupLoading) ? (
          <LoadingSkeleton columns={tableColumns.length} rows={initialPageSize} />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : viewMode === "cards" ? (
          filteredData.length === 0 ? (
            <div className="py-16"><EmptyState message={emptyMessage} /></div>
          ) : (
            <CardsView<T>
              // F28: card ใช้ rows ที่ paginate แล้ว (เหมือน table) — ไม่ render ทั้ง 1,471
              rows={isServer ? filteredData : table.getRowModel().rows.map(r => r.original as T)}
              columns={columns}
              config={cardCfg}
              onRowClick={isRowClickable ? handleRowClick : undefined}
            />
          )
        ) : (
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => {
                    const isFiltered = header.column.columnDef.meta?.filterable
                      ? isColFilterActive(colFilterValues[header.column.id])
                      : false;
                    const colId = header.column.id;
                    const draggable = !isInternalCol(colId);
                    const pin = pinnedStyle(header.column);
                    const isPinned = !!header.column.getIsPinned();
                    return (
                      <th
                        key={header.id}
                        draggable={draggable}
                        onDragStart={draggable ? () => setColDrag(colId) : undefined}
                        onDragEnd={() => setColDrag(null)}
                        onDragOver={draggable ? e => { if (colDrag) e.preventDefault(); } : undefined}
                        onDrop={draggable ? () => { if (colDrag) reorderColumn(colDrag, colId); setColDrag(null); } : undefined}
                        style={{ width: header.getSize(), position: pin.position ?? "relative", left: pin.left, zIndex: isPinned ? 11 : undefined }}
                        className={`px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide select-none ${
                          isPinned ? "bg-slate-100 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" : "bg-slate-50"
                        } ${colDrag === colId ? "opacity-40" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
                      >
                        {header.isPlaceholder ? null : (
                          <div
                            className={`flex items-center gap-1 ${header.column.getCanSort() ? "cursor-pointer hover:text-slate-700" : ""}`}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {isFiltered && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                            {header.column.getCanSort() && (
                              <span className="text-slate-400 ml-0.5 flex items-center">
                                {header.column.getIsSorted() === "asc"  ? <IconChevronUp /> :
                                 header.column.getIsSorted() === "desc" ? <IconChevronDown /> : <IconChevronsUpDown />}
                                {/* ลำดับเมื่อเรียงหลายคอลัมน์ (shift+click) */}
                                {sorting.length > 1 && header.column.getSortIndex() >= 0 && (
                                  <span className="ml-0.5 text-[10px] font-bold text-blue-500">{header.column.getSortIndex() + 1}</span>
                                )}
                              </span>
                            )}
                          </div>
                        )}
                        {/* ---- Column resize handle ---- F4: mutex กับ reorder ---- */}
                        <div
                          draggable={false}
                          onMouseDown={(e) => {
                            e.stopPropagation();        // กัน HTML5 drag (reorder) trigger
                            e.preventDefault();          // กัน text selection
                            header.getResizeHandler()(e);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            header.getResizeHandler()(e);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          // กว้าง 8px แทน 4px = grab ง่ายขึ้น + เส้นกลาง 1px เห็นชัด
                          className={`group/resize absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none z-20 flex items-center justify-center ${
                            header.column.getIsResizing() ? "" : "opacity-0 hover:opacity-100"
                          }`}
                          title="ลากเพื่อปรับขนาด"
                        >
                          <div className={`h-full transition-colors ${
                            header.column.getIsResizing()
                              ? "w-[2px] bg-blue-500"
                              : "w-[1px] bg-slate-300 group-hover/resize:bg-blue-400 group-hover/resize:w-[2px]"
                          }`} />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {isGrouped ? (() => {
                // ---- จัดกลุ่ม (manual) — client: sorted model / server: core model (batch ใหญ่) ----
                const grows = (isServer ? table.getCoreRowModel() : table.getSortedRowModel()).rows;
                const leaf = table.getVisibleLeafColumns();
                if (grows.length === 0) return (
                  <tr><td colSpan={tableColumns.length} className="py-16 text-center"><EmptyState message={emptyMessage} /></td></tr>
                );
                const order: string[] = [];
                const groups = new Map<string, typeof grows>();
                for (const r of grows) {
                  const key = String(r.getValue(groupBy as string) ?? "");
                  let g = groups.get(key);
                  if (!g) { g = []; groups.set(key, g); order.push(key); }
                  g.push(r);
                }
                // ข้อ 3a: เรียงกลุ่มตามที่เลือก (ชื่อ/จำนวน)
                order.sort((a, b) =>
                  groupSort === "label_asc"  ? a.localeCompare(b, "th") :
                  groupSort === "label_desc" ? b.localeCompare(a, "th") :
                  groupSort === "count_asc"  ? (groups.get(a)!.length - groups.get(b)!.length) :
                                               (groups.get(b)!.length - groups.get(a)!.length));
                // ข้อ 1: ชื่อกลุ่มไปคอลัมน์แรก (คอลัมน์ data แรกที่ไม่ใช่ checkbox/actions)
                const firstDataCol = leaf.find(c => c.id !== "__select__" && c.id !== "__actions__");
                const gFieldLabel = (() => { const c = leaf.find(cc => cc.id === groupBy); return c && typeof c.columnDef.header === "string" ? c.columnDef.header : ""; })();
                return order.flatMap(key => {
                  const grp = groups.get(key)!;
                  const collapsed = collapsedGroups.has(key);
                  const headerCell = grp[0].getVisibleCells().find(cc => cc.column.id === groupBy);
                  // ข้อ 2: สถานะเลือกของทั้งกลุ่ม
                  const allSel = grp.length > 0 && grp.every(r => r.getIsSelected());
                  const someSel = grp.some(r => r.getIsSelected());
                  const out: React.ReactNode[] = [
                    <tr key={"grp_" + key}
                      onClick={() => setCollapsedGroups(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                      className="bg-slate-100/70 border-y border-slate-200 cursor-pointer hover:bg-slate-100">
                      {leaf.map(col => {
                        let content: React.ReactNode = null;
                        if (col.id === "__select__") {
                          // ข้อ 2: checkbox เลือกทั้งกลุ่ม
                          content = (
                            <input type="checkbox" checked={allSel}
                              ref={el => { if (el) el.indeterminate = someSel && !allSel; }}
                              onClick={e => e.stopPropagation()}
                              onChange={() => grp.forEach(r => r.toggleSelected(!allSel))}
                              className="rounded border-slate-300 text-blue-600" />
                          );
                        } else if (firstDataCol && col.id === firstDataCol.id) {
                          // ข้อ 1: ชื่อกลุ่ม (caret + field + ค่า + จำนวน) ที่คอลัมน์แรก
                          content = (
                            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                              <span className="text-slate-400 text-xs">{collapsed ? "▶" : "▼"}</span>
                              {gFieldLabel && <span className="text-slate-400 font-normal">{gFieldLabel}:</span>}
                              {headerCell ? flexRender(headerCell.column.columnDef.cell, headerCell.getContext()) : (key || "—")}
                              <span className="text-xs font-normal text-slate-500">({grp.length})</span>
                            </span>
                          );
                        } else if (col.id !== "__actions__") {
                          const s = col.columnDef.meta?.summary;
                          if (typeof s === "function") {
                            // คอลัมน์ computed (มีสูตรรวม) → ใช้ตัวรวมเดียวกับแถวรวมท้ายตาราง (ยอดเงินรวมกลุ่ม)
                            content = <span className="font-semibold text-slate-700 tabular-nums">{s(grp.map(r => r.original))}</span>;
                          } else {
                            let sum = 0, has = false;
                            for (const r of grp) {
                              const v = r.getValue(col.id); const n = Number(v);
                              if (v !== null && v !== "" && typeof v !== "boolean" && isFinite(n)) { sum += n; has = true; }
                            }
                            if (has) content = <span className="font-semibold text-slate-700 tabular-nums">{sum.toLocaleString("th-TH")}</span>;
                          }
                        }
                        return <td key={col.id} className={`${cellPad} text-sm`}>{content}</td>;
                      })}
                    </tr>,
                  ];
                  if (!collapsed) for (const row of grp) {
                    out.push(
                      <React.Fragment key={row.id}>
                        <tr onClick={() => isRowClickable && handleRowClick(row.original)}
                          className={`group transition-colors ${row.getIsSelected() ? "bg-blue-50" : "hover:bg-slate-50"} ${isRowClickable ? "cursor-pointer" : ""}`}>
                          {row.getVisibleCells().map(cell => (
                            <td key={cell.id} className={`${cellPad} text-slate-700 overflow-hidden text-ellipsis`}>
                              {cell.column.columnDef.meta?.type === "image"
                                ? <ImageThumbnail url={cell.getValue() as string | null} />
                                : flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                        {renderExpandedRow && isRowExpanded?.(row.original) && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={leaf.length} className="p-0">
                              {renderExpandedRow(row.original)}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  }
                  return out;
                });
              })() : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={tableColumns.length} className="py-16 text-center">
                    <EmptyState message={emptyMessage} />
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map(row => {
                  const rc = evalRowColor(layoutSettings?.row_color_rules, row.original as Record<string, unknown>);
                  const rcStyle: React.CSSProperties | undefined = rc
                    ? { boxShadow: `inset 3px 0 0 0 ${ROW_COLOR_BORDER[rc] ?? "#94a3b8"}`, ...(row.getIsSelected() ? {} : { backgroundColor: ROW_COLOR_BG[rc] ?? "#f8fafc" }) }
                    : undefined;
                  return (
                  <React.Fragment key={row.id}>
                  <tr
                    onClick={() => isRowClickable && handleRowClick(row.original)}
                    style={rcStyle}
                    className={`group transition-colors ${row.getIsSelected() ? "bg-blue-50" : "hover:bg-slate-50"} ${isRowClickable ? "cursor-pointer" : ""}`}>
                    {row.getVisibleCells().map(cell => {
                      const pin = pinnedStyle(cell.column);
                      const isPinned = !!cell.column.getIsPinned();
                      const selBg = row.getIsSelected() ? "bg-blue-50" : "bg-white group-hover:bg-slate-50";
                      const editable = !!onInlineEdit && inlineEditFields.includes(cell.column.id);
                      const isEditing = editCell?.rowId === row.id && editCell?.colId === cell.column.id;
                      return (
                        <td key={cell.id}
                          // กลุ่ม C UX: ช่องที่แก้ได้ "กินคลิกเดียว" ไว้ → ไม่เปิด drawer (ดับเบิลคลิกถึงแก้)
                          onClick={editable ? (e) => e.stopPropagation() : undefined}
                          onDoubleClick={editable ? (e) => {
                            e.stopPropagation();
                            setEditCell({ rowId: row.id, colId: cell.column.id });
                            setEditValue(String(cell.getValue() ?? ""));
                          } : undefined}
                          style={{ position: pin.position, left: pin.left, zIndex: isPinned ? 1 : undefined }}
                          className={`${cellPad} text-slate-700 overflow-hidden text-ellipsis ${isPinned ? `${selBg} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]` : ""} ${editable && !isEditing ? "cursor-text hover:bg-blue-50/40" : ""}`}
                          title={editable && !isEditing ? "ดับเบิลคลิกเพื่อแก้" : undefined}>
                          {cell.column.columnDef.meta?.type === "image" ? (
                            <ImageThumbnail url={cell.getValue() as string | null} />
                          ) : isEditing ? (
                            // field แบบ select → แก้เป็น dropdown (ไม่ใช่ช่องพิมพ์)
                            cell.column.columnDef.meta?.filterType === "select" && cell.column.columnDef.meta?.filterOptions ? (
                              <select
                                autoFocus
                                value={editValue}
                                disabled={editSaving}
                                onClick={e => e.stopPropagation()}
                                onChange={e => { setEditValue(e.target.value); saveInlineEdit(row.original, e.target.value); }}
                                onBlur={() => setEditCell(null)}
                                onKeyDown={e => { if (e.key === "Escape") setEditCell(null); }}
                                className="w-full h-7 px-1.5 -my-1 text-sm border border-blue-400 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">—</option>
                                {cell.column.columnDef.meta.filterOptions.map(o => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            ) : (
                            <input
                              autoFocus
                              value={editValue}
                              disabled={editSaving}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => saveInlineEdit(row.original)}
                              onKeyDown={e => {
                                if (e.key === "Enter") saveInlineEdit(row.original);
                                if (e.key === "Escape") setEditCell(null);
                              }}
                              className="w-full h-7 px-1.5 -my-1 text-sm border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            )
                          ) : (
                            flexRender(cell.column.columnDef.cell, cell.getContext())
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {renderExpandedRow && isRowExpanded?.(row.original) && (
                    <tr className="bg-slate-50/70">
                      <td colSpan={table.getVisibleLeafColumns().length} className="p-0">
                        {renderExpandedRow(row.original)}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  );
                })
              )}
            </tbody>
            {/* แถวสรุป (Total row) — จาก meta.summary หรือ settings.summaries */}
            {(columns.some(c => c.meta?.summary) || Object.keys(layoutSettings?.summaries ?? {}).length > 0) && table.getRowModel().rows.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-200 sticky bottom-0">
                <tr>
                  {table.getVisibleLeafColumns().map((col, i) => {
                    const s = col.columnDef.meta?.summary;
                    let content: React.ReactNode = i === 0 ? "รวม" : null;
                    if (s) {
                      if (s === "sum") {
                        const sum = filteredData.reduce((a, r) => a + (Number((r as Record<string, unknown>)[col.id]) || 0), 0);
                        content = sum.toLocaleString("th-TH");
                      } else if (s === "count") {
                        content = filteredData.filter(r => (r as Record<string, unknown>)[col.id] != null).length.toLocaleString("th-TH");
                      } else if (typeof s === "function") {
                        content = s(filteredData as unknown[]);
                      }
                    }
                    return <td key={col.id} className={`${cellPad} text-sm font-semibold text-slate-800 tabular-nums`}>{content}</td>;
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* Pagination (รองรับทั้ง client + server mode) — ซ่อนตอนจัดกลุ่ม (โชว์ทุกแถว) */}
      {!loading && !error && !isGrouped && (() => {
        const pageIndex = isServer ? srvPage : table.getState().pagination.pageIndex;
        const pageSize  = isServer ? srvPageSize : table.getState().pagination.pageSize;
        const pageCount = isServer ? Math.max(1, Math.ceil(srvTotal / srvPageSize)) : table.getPageCount();
        const totalRows = isServer ? srvTotal : filteredData.length;
        const goPage = (p: number) => isServer ? setSrvPage(p) : table.setPageIndex(p);
        const setSize = (s: number) => { if (isServer) { setSrvPageSize(s); setSrvPage(0); } else table.setPageSize(s); };
        const canPrev = pageIndex > 0;
        const canNext = pageIndex < pageCount - 1;
        const rangeStart = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
        const rangeEnd   = Math.min(totalRows, (pageIndex + 1) * pageSize);
        return (
        <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-slate-200 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">
              {isServer
                ? <>{rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} จาก <b className="text-slate-700">{totalRows.toLocaleString()}</b></>
                : <>{totalRows} รายการ</>}
              {activeFilterCount > 0 && <span className="text-blue-600 ml-1">(filtered)</span>}
              {selectedCount > 0 && <span className="text-blue-600 ml-1">({selectedCount} เลือก)</span>}
            </span>
            <select value={pageSize} onChange={e => setSize(Number(e.target.value))}
              className="h-7 px-2 text-xs border border-slate-200 rounded text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              {[10, 20, 50, 100].map(size => <option key={size} value={size}>{size} / หน้า</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => goPage(pageIndex - 1)} disabled={!canPrev}
              className="h-7 w-7 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <IconChevronLeft />
            </button>
            {Array.from({ length: Math.min(pageCount, 7) }, (_, i) => {
              let page: number;
              if (pageCount <= 7) page = i;
              else if (pageIndex < 4) page = i;
              else if (pageIndex > pageCount - 4) page = pageCount - 7 + i;
              else page = pageIndex - 3 + i;
              return (
                <button key={page} onClick={() => goPage(page)}
                  className={`h-7 w-7 flex items-center justify-center rounded text-sm transition-colors ${
                    pageIndex === page ? "bg-blue-600 text-white font-medium" : "text-slate-500 hover:bg-slate-100"
                  }`}>{page + 1}</button>
              );
            })}
            <button onClick={() => goPage(pageIndex + 1)} disabled={!canNext}
              className="h-7 w-7 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <IconChevronRight />
            </button>
          </div>
        </div>
        );
      })()}

      {/* Row Actions menu (portal — หลุดจากกรอบตาราง ไม่โดน overflow ตัด) */}
      {mounted && rowMenu && rowActions.length > 0 && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} />
          <div
            className="fixed z-50 min-w-[150px] bg-white border border-slate-200 rounded-lg shadow-lg py-1"
            style={{ top: rowMenu.y + 4, left: Math.max(8, rowMenu.x - 150) }}
          >
            {rowActions.filter((action) => !action.show || action.show(rowMenu.row)).map((action, i) => (
              <button
                key={i}
                onClick={() => { action.onClick(rowMenu.row); setRowMenu(null); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                  action.variant === "danger" ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50"
                }`}>
                {action.icon}{action.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}

      {/* Bulk Edit Modal */}
      {bulkEditOpen && onBulkEdit && (
        <BulkEditGrid
          fields={bulkEditFields}
          rows={selectedRows}
          rowLabel={bulkRowLabel ?? ((r) => {
            const rec = r as Record<string, unknown>;
            // ของกลาง: หาชื่อที่อ่านง่ายก่อน (name_th/name/code/sku/label) แล้วค่อย fallback id
            return String(rec.name_th ?? rec.name ?? rec.code ?? rec.sku ?? rec.label ?? rec.title ?? rec.id ?? "");
          })}
          onClose={() => setBulkEditOpen(false)}
          onApply={async (edits) => {
            const res = await onBulkEdit(edits);
            setRowSelection({});
            setBulkEditOpen(false);
            return res;
          }}
        />
      )}

      {/* Bulk Edit ALL MATCHING (server mode, ข้ามหน้า) */}
      {bulkAllOpen && onBulkEditAllMatching && (
        <BulkEditAllModal
          fields={bulkEditFields}
          count={srvTotal}
          onClose={() => setBulkAllOpen(false)}
          onApply={async (changes) => {
            const res = await onBulkEditAllMatching(changes, { search: debouncedSearch, filters: activeServerFilters });
            setBulkAllOpen(false);
            setRowSelection({});
            return res;
          }}
        />
      )}

      {/* Card config panel */}
      {showCardCfg && (
        <CardConfigDialog
          columns={columns}
          config={cardCfg}
          onClose={() => setShowCardCfg(false)}
          onSave={(c) => { persistCardCfg(c); setShowCardCfg(false); }}
        />
      )}

      {/* Detail Drawer */}
      {drawerContent && showDrawer && drawerRow && (
        <DetailDrawer open={showDrawer} onClose={() => setShowDrawer(false)}
          title={drawerTitle ? (typeof drawerTitle === "function" ? drawerTitle(drawerRow) : drawerTitle) : "รายละเอียด"}>
          {drawerContent(drawerRow)}
        </DetailDrawer>
      )}
    </div>
  );
}

// ============================================================
// ---- Column Filter Panel ----
// ============================================================

function ColumnFilterPanel({
  filterableFields, colFilterValues, data, onSetFilter, onClear, onClose, resultCount,
  filterFieldOptions, onSetFilterable,
}: {
  filterableFields: FilterableField[];
  colFilterValues: Record<string, ColumnFilterValue>;
  data: Record<string, unknown>[];
  onSetFilter: (key: string, val: ColumnFilterValue) => void;
  onClear: () => void;
  onClose: () => void;
  resultCount: number;
  filterFieldOptions?: FilterFieldOption[];
  onSetFilterable?: (fieldId: string, value: boolean) => Promise<void> | void;
}) {
  // F30: popover เลือก field กรอง (บันทึกเข้าทะเบียนกลาง)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const canPick = !!onSetFilterable && (filterFieldOptions?.length ?? 0) > 0;

  const pickerList = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const list = filterFieldOptions ?? [];
    if (!q) return list;
    return list.filter(o => o.label.toLowerCase().includes(q) || o.key.toLowerCase().includes(q));
  }, [filterFieldOptions, pickerQuery]);

  const toggleFilterable = async (opt: FilterFieldOption) => {
    if (!onSetFilterable) return;
    setSavingId(opt.fieldId);
    try { await onSetFilterable(opt.fieldId, !opt.isFilterable); }
    finally { setSavingId(null); }
  };

  const autoDistinct = useMemo(() => {
    const result: Record<string, string[]> = {};
    filterableFields.forEach(f => {
      if (f.type === "select" && !f.options) {
        result[f.key] = [...new Set(data.map(r => String(r[f.key] ?? "")))].filter(v => v && v !== "—" && v !== "null").sort();
      }
    });
    return result;
  }, [data, filterableFields]);

  const getOpts = (f: FilterableField) => f.options ?? (autoDistinct[f.key] ?? []).map(v => ({ value: v, label: v }));

  // field เชื่อมตาราง (เช่น brand_id) → ทำเป็น dropdown เลือก "ชื่อ" แทนช่องพิมพ์ id
  // ดึงคู่ id→label จาก data ที่มี sibling เช่น brand_id ↔ brand_label
  const relLabelKey = (key: string) => (key.endsWith("_id") ? key.slice(0, -3) + "_label" : null);
  const relOptsByField = useMemo(() => {
    const out: Record<string, { value: string; label: string }[]> = {};
    if (data.length === 0) return out;
    const first = data[0] as Record<string, unknown>;
    filterableFields.forEach(f => {
      const lk = relLabelKey(f.key);
      if (!lk || !(lk in first)) return;
      const seen = new Map<string, string>();
      for (const r of data as Record<string, unknown>[]) {
        const id = r[f.key];
        if (id == null || id === "") continue;
        if (!seen.has(String(id))) seen.set(String(id), String(r[lk] ?? id));
      }
      if (seen.size > 0) out[f.key] = [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
    });
    return out;
  }, [filterableFields, data]);

  const hasAnyActive = filterableFields.some(f => isColFilterActive(colFilterValues[f.key]));

  return (
    <div className="border-b border-blue-200 bg-blue-50/60 px-4 pt-3 pb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><IconFilter /> กรองข้อมูล</span>
          <span className="text-xs text-blue-600 font-medium bg-blue-100 px-2 py-0.5 rounded-full">{resultCount} รายการ</span>
        </div>
        <div className="flex items-center gap-3">
          {hasAnyActive && <button onClick={onClear} className="text-xs text-red-500 hover:text-red-700">ล้างทั้งหมด</button>}
          {/* F30: ปุ่มเลือก field กรอง (บันทึกเข้าทะเบียนกลาง — กระทบทุกคน) */}
          {canPick && (
            <div className="relative">
              <button onClick={() => setPickerOpen(o => !o)}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors ${
                  pickerOpen ? "bg-blue-100 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}>
                <span className="text-sm leading-none">+</span> เลือก field กรอง
              </button>
              {pickerOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
                  <div className="absolute right-0 mt-1 z-30 w-72 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-slate-100">
                      <p className="text-[11px] text-slate-400 mb-1.5 px-0.5">ติ๊กเพื่อเพิ่ม/ลบ field ที่กรองได้ (มีผลกับทุกคน)</p>
                      <input type="text" value={pickerQuery} onChange={e => setPickerQuery(e.target.value)}
                        placeholder="ค้นหา field..." autoFocus
                        className="w-full h-7 px-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="max-h-72 overflow-y-auto py-1">
                      {pickerList.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-slate-400 text-center">ไม่พบ field</p>
                      ) : pickerList.map(opt => (
                        <button key={opt.fieldId} onClick={() => toggleFilterable(opt)} disabled={savingId === opt.fieldId}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50 disabled:opacity-50">
                          <span className={`flex items-center justify-center w-4 h-4 rounded border ${
                            opt.isFilterable ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white"
                          }`}>{opt.isFilterable && <span className="text-[10px] leading-none">✓</span>}</span>
                          <span className="text-xs text-slate-700 flex-1 truncate">{opt.label}</span>
                          {savingId === opt.fieldId && <span className="text-[10px] text-slate-400">กำลังบันทึก…</span>}
                          <span className="text-[10px] text-slate-300 font-mono">{opt.key}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><IconX /></button>
        </div>
      </div>
      {filterableFields.length === 0 ? (
        <div className="text-xs text-slate-500 bg-white border border-dashed border-slate-200 rounded-lg px-4 py-5 text-center">
          ยังไม่ได้เลือก field สำหรับกรอง — กดปุ่ม <span className="font-medium text-blue-600">+ เลือก field กรอง</span> ด้านบนเพื่อเพิ่ม
        </div>
      ) : (
      <div className="flex flex-wrap gap-3">
        {filterableFields.map(field => {
          const fv = colFilterValues[field.key];
          // field เชื่อมตาราง → dropdown เลือกชื่อ (PickUP) แทนช่องพิมพ์ id
          const relOpts = relOptsByField[field.key];
          if (relOpts) {
            return <SelectFilterCard key={field.key} field={field} opts={relOpts} selected={fv?.type === "select" ? fv.selected : []} onChange={sel => onSetFilter(field.key, { type: "select", selected: sel })} />;
          }
          if (field.type === "text") {
            const val = fv?.type === "text" ? fv.value : "";
            return (
              <div key={field.key} className="bg-white border border-slate-200 rounded-lg p-3 min-w-[180px] shadow-sm">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{field.label}</p>
                <div className="relative">
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><IconSearchSm /></span>
                  <input type="text" value={val} onChange={e => onSetFilter(field.key, { type: "text", value: e.target.value })}
                    placeholder={`ค้นหา ${field.label}...`}
                    className="w-full h-7 pl-6 pr-6 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  {val && <button onClick={() => onSetFilter(field.key, { type: "text", value: "" })} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"><IconX /></button>}
                </div>
              </div>
            );
          }
          if (field.type === "number") {
            const min = fv?.type === "number" ? fv.min : "";
            const max = fv?.type === "number" ? fv.max : "";
            return (
              <div key={field.key} className="bg-white border border-slate-200 rounded-lg p-3 min-w-[200px] shadow-sm">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{field.label}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 mb-1">จาก</p>
                    <input type="number" value={min} onChange={e => onSetFilter(field.key, { type: "number", min: e.target.value, max })} placeholder="0" className="w-full h-7 px-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <span className="text-slate-400 mt-4">—</span>
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 mb-1">ถึง</p>
                    <input type="number" value={max} onChange={e => onSetFilter(field.key, { type: "number", min, max: e.target.value })} placeholder="∞" className="w-full h-7 px-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                </div>
                {(min || max) && <button onClick={() => onSetFilter(field.key, { type: "number", min: "", max: "" })} className="mt-2 text-xs text-red-500 hover:text-red-700">ล้าง</button>}
              </div>
            );
          }
          if (field.type === "boolean") {
            const cur = fv?.type === "boolean" ? fv.value : "";
            const choose = (v: "" | "true" | "false") => {
              if (v === "") onSetFilter(field.key, { type: "text", value: "" }); // ล้าง
              else onSetFilter(field.key, { type: "boolean", value: v });
            };
            return (
              <div key={field.key} className="bg-white border border-slate-200 rounded-lg p-3 min-w-[160px] shadow-sm">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{field.label}</p>
                <div className="flex gap-1">
                  {([
                    { v: "", label: "ทั้งหมด" },
                    { v: "true", label: "✓ ใช่" },
                    { v: "false", label: "✗ ไม่ใช่" },
                  ] as const).map(opt => (
                    <button key={opt.v} type="button" onClick={() => choose(opt.v)}
                      className={`flex-1 h-7 px-2 text-xs rounded-md border transition-colors ${
                        cur === opt.v
                          ? "bg-blue-600 border-blue-600 text-white font-medium"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          if (field.type === "select") {
            return <SelectFilterCard key={field.key} field={field} opts={getOpts(field)} selected={fv?.type === "select" ? fv.selected : []} onChange={sel => onSetFilter(field.key, { type: "select", selected: sel })} />;
          }
          return null;
        })}
      </div>
      )}
    </div>
  );
}

function SelectFilterCard({ field, opts, selected, onChange }: {
  field: FilterableField; opts: { value: string; label: string }[]; selected: string[]; onChange: (s: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = opts.filter(o => !search || o.label.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 min-w-[160px] max-w-[220px] shadow-sm">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center justify-between">
        <span>{field.label}</span>
        {selected.length > 0 && <span className="text-blue-600 font-bold normal-case">({selected.length})</span>}
      </p>
      {opts.length > 5 && (
        <div className="relative mb-2">
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><IconSearchSm /></span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..." className="w-full h-6 pl-6 pr-2 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
      )}
      <div className="space-y-1 max-h-[140px] overflow-y-auto">
        {filtered.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded">
            <input type="checkbox" checked={selected.includes(opt.value)}
              onChange={e => onChange(e.target.checked ? [...selected, opt.value] : selected.filter(v => v !== opt.value))}
              className="rounded border-slate-300 text-blue-600 w-3.5 h-3.5" />
            <span className="text-xs text-slate-700 truncate">{opt.label}</span>
          </label>
        ))}
        {filtered.length === 0 && <p className="text-xs text-slate-400 py-2 text-center">ไม่พบ</p>}
      </div>
      {selected.length > 0 && <button onClick={() => onChange([])} className="mt-2 text-xs text-red-500 hover:text-red-700">ล้าง</button>}
    </div>
  );
}

// ============================================================
// ---- Bulk Edit Modal (CLAUDE.md §18) ----
// ============================================================

// แก้ "ทั้งหมดที่ตรงตัวกรอง" (server mode) — เลือก field + ใส่ค่าเดียวต่อ field → ใช้กับทุกแถวที่ตรง
function BulkEditAllModal({
  fields, count, onClose, onApply,
}: {
  fields: BulkEditField[];
  count: number;
  onClose: () => void;
  onApply: (changes: Record<string, unknown>) => Promise<{ affected: number }>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [vals, setVals] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState("");
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (k: string) => setSelected((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const needConfirm = count > 20;
  const canApply = selected.size > 0 && (!needConfirm || typed === "CONFIRM");

  const apply = async () => {
    setApplying(true); setErr(null);
    try {
      const changes: Record<string, unknown> = {};
      for (const f of fields) {
        if (!selected.has(f.key)) continue;
        const raw = vals[f.key] ?? "";
        changes[f.key] = f.type === "boolean" ? raw === "true"
          : f.type === "number" ? (raw === "" ? null : Number(raw))
          : f.type === "relation" ? (raw || null)
          : raw;
      }
      const r = await onApply(changes);
      setResult(r.affected);
    } catch (e) { setErr(String(e)); }
    finally { setApplying(false); }
  };

  const btn = "h-9 px-4 text-sm font-medium rounded-lg disabled:opacity-50";
  return (
    <ERPModal open onClose={onClose} title={`แก้ทั้งหมดที่ตรงตัวกรอง (${count.toLocaleString()} รายการ)`} size="md"
      footer={result != null ? (
        <button onClick={onClose} className={`${btn} text-white bg-blue-600 hover:bg-blue-700`}>เสร็จสิ้น</button>
      ) : (
        <>
          <button onClick={onClose} disabled={applying} className={`${btn} text-slate-700 border border-slate-200 hover:bg-slate-50`}>ยกเลิก</button>
          <button onClick={apply} disabled={applying || !canApply} className={`${btn} text-white bg-amber-600 hover:bg-amber-700`}>{applying ? "กำลังแก้..." : "แก้ทั้งหมด"}</button>
        </>
      )}>
      {result != null ? (
        <div className="py-6 text-center text-sm text-emerald-700">✅ แก้สำเร็จ {result.toLocaleString()} รายการ</div>
      ) : (
        <div className="space-y-3">
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            ⚠ จะแก้ <b>ทุกแถวที่ตรงตัวกรอง/ค้นหาปัจจุบัน</b> ({count.toLocaleString()} รายการ) ไม่ใช่แค่ที่เลือกในหน้านี้
          </div>
          {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">⚠ {err}</div>}
          <p className="text-xs font-medium text-slate-600">เลือกข้อมูลที่จะแก้ + ใส่ค่าใหม่:</p>
          <div className="space-y-2 max-h-[40vh] overflow-auto">
            {fields.map((f) => (
              <div key={f.key} className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 w-40 flex-shrink-0 text-sm text-slate-700">
                  <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggle(f.key)} /> {f.label}
                </label>
                {selected.has(f.key) && (
                  f.type === "boolean" ? (
                    <select value={vals[f.key] ?? "false"} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded bg-white"><option value="true">ใช่</option><option value="false">ไม่ใช่</option></select>
                  ) : f.type === "select" && f.options ? (
                    <select value={vals[f.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded bg-white"><option value="">—</option>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  ) : f.type === "relation" && f.relationConfig ? (
                    <div className="flex-1"><RelationPicker value={vals[f.key] || null} config={f.relationConfig} onChange={(rid) => setVals((v) => ({ ...v, [f.key]: rid ?? "" }))} /></div>
                  ) : (
                    <input type={f.type === "number" ? "number" : "text"} value={vals[f.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded" />
                  )
                )}
              </div>
            ))}
          </div>
          {needConfirm && (
            <div>
              <p className="text-xs text-slate-500 mb-1">พิมพ์ <b>CONFIRM</b> เพื่อยืนยันแก้จำนวนมาก</p>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="CONFIRM"
                className="w-full h-8 px-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500" />
            </div>
          )}
        </div>
      )}
    </ERPModal>
  );
}

function BulkEditGrid<T extends Record<string, unknown>>({
  fields, rows, rowLabel, onClose, onApply,
}: {
  fields: BulkEditField[];
  rows: T[];
  rowLabel: (row: T) => string;
  onClose: () => void;
  onApply: (edits: { row: T; changes: Record<string, unknown> }[]) => Promise<BulkEditResult>;
}) {
  const count = rows.length;
  const rowId = (r: T) => String((r as Record<string, unknown>).id ?? rows.indexOf(r));

  // เลือกคอลัมน์ที่จะแก้
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickOpen, setPickOpen] = useState(false);   // dropdown เลือก field
  const [pickFilter, setPickFilter] = useState("");
  // ค่าต่อ cell: rowId → fieldKey → string ("true"/"false" สำหรับ boolean)
  const [cells, setCells] = useState<Record<string, Record<string, string>>>(() => {
    const c: Record<string, Record<string, string>> = {};
    rows.forEach(r => {
      const id = rowId(r);
      c[id] = {};
      fields.forEach(f => {
        const v = (r as Record<string, unknown>)[f.key];
        c[id][f.key] = f.type === "boolean" ? (v ? "true" : "false") : String(v ?? "");
      });
    });
    return c;
  });
  const [fillVals, setFillVals] = useState<Record<string, string>>({});
  const [typed,    setTyped]    = useState("");
  const [applying, setApplying] = useState(false);
  const [result,   setResult]   = useState<BulkEditResult | null>(null);

  const needsTyped = count > 20;
  const selCols = fields.filter(f => selected.has(f.key));
  const canApply = selected.size > 0 && (!needsTyped || typed === "CONFIRM");

  const toggle = (key: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const setCell = (rid: string, key: string, val: string) =>
    setCells(c => ({ ...c, [rid]: { ...c[rid], [key]: val } }));

  // เติมค่าเดียวกันทั้งคอลัมน์
  const fillColumn = (key: string, val: string) =>
    setCells(c => {
      const next = { ...c };
      rows.forEach(r => { const id = rowId(r); next[id] = { ...next[id], [key]: val }; });
      return next;
    });

  const apply = async () => {
    setApplying(true);
    try {
      // ส่งเฉพาะแถวที่ "เปลี่ยนจริง" และเฉพาะ field ที่ค่าต่างจากเดิม → เร็วขึ้นมาก
      const edits = rows.map(r => {
        const id = rowId(r);
        const orig = r as Record<string, unknown>;
        const changes: Record<string, unknown> = {};
        selCols.forEach(f => {
          const raw = cells[id]?.[f.key] ?? "";
          const next = f.type === "boolean" ? raw === "true"
            : f.type === "number" ? (raw === "" ? null : Number(raw))
            : f.type === "relation" ? (raw || null)
            : raw;
          // เทียบกับค่าเดิม — ข้ามถ้าไม่เปลี่ยน
          const prev = f.type === "boolean" ? !!orig[f.key]
            : f.type === "number" ? (orig[f.key] == null || orig[f.key] === "" ? null : Number(orig[f.key]))
            : (orig[f.key] ?? (f.type === "relation" ? null : ""));
          if (next !== prev) changes[f.key] = next;
        });
        return { row: r, changes };
      }).filter(e => Object.keys(e.changes).length > 0);
      setResult(await onApply(edits));
    } finally { setApplying(false); }
  };

  return (
    <ERPModal open onClose={onClose} title="แก้ไขหลายรายการ (ตาราง)" size="xl"
      footer={result ? (
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">เสร็จสิ้น</button>
      ) : (
        <>
          {needsTyped && selCols.length > 0 && (
            <div className="flex items-center gap-2 mr-auto">
              <span className="text-xs text-red-700">⚠️ {count} รายการ — พิมพ์ <b className="font-mono">CONFIRM</b>:</span>
              <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="CONFIRM" autoFocus
                className="h-9 w-28 px-2 text-sm font-mono border border-red-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
          )}
          <button onClick={onClose} disabled={applying} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
          <button onClick={apply} disabled={applying || !canApply}
            title={selCols.length === 0 ? "เลือกข้อมูลที่จะแก้ก่อน" : (needsTyped && typed !== "CONFIRM" ? 'พิมพ์ CONFIRM เพื่อยืนยัน' : "")}
            className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {applying ? "กำลังบันทึก..." : `บันทึก ${count} รายการ`}
          </button>
        </>
      )}
    >
      {result ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-emerald-700">{result.success}</p>
            <p className="text-xs text-emerald-600 mt-1">สำเร็จ</p>
          </div>
          <div className={`rounded-xl p-4 text-center border ${result.failed > 0 ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
            <p className={`text-3xl font-bold ${result.failed > 0 ? "text-red-600" : "text-slate-400"}`}>{result.failed}</p>
            <p className="text-xs text-slate-500 mt-1">ล้มเหลว</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* เลือกคอลัมน์ที่จะแก้ — dropdown ติ๊ก + ค้นหา */}
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1.5">เลือกข้อมูลที่จะแก้ (เลือกได้หลายช่อง):</p>
            <div className="relative w-full md:w-96">
              <button type="button" onClick={() => setPickOpen((o) => !o)}
                className="w-full h-9 px-3 text-sm text-left border border-slate-200 rounded-md bg-white flex items-center justify-between gap-2">
                <span className={selected.size > 0 ? "text-slate-700" : "text-slate-400"}>
                  {selected.size > 0 ? `เลือกแล้ว ${selected.size} ช่อง` : "เลือกข้อมูลที่จะแก้..."}
                </span>
                <span className="text-slate-400">▾</span>
              </button>
              {pickOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPickOpen(false)} />
                  <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-slate-100">
                      <input autoFocus value={pickFilter} onChange={(e) => setPickFilter(e.target.value)} placeholder="ค้นหา field..."
                        className="w-full h-8 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="overflow-y-auto">
                      {fields.filter((f) => { const q = pickFilter.trim().toLowerCase(); return !q || f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q); }).map((f) => (
                        <label key={f.key} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer">
                          <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggle(f.key)} className="rounded border-slate-300 text-blue-600" />
                          <span className="truncate text-slate-700">{f.label}</span>
                          <code className="ml-auto text-[10px] text-slate-400 flex-shrink-0">{f.key}</code>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* ที่เลือกแล้ว (chips) */}
            {selected.size > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {fields.filter((f) => selected.has(f.key)).map((f) => (
                  <span key={f.key} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {f.label}<button type="button" onClick={() => toggle(f.key)} className="hover:text-blue-900">✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {selCols.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
              ติ๊กข้อมูลด้านบนเพื่อเริ่มแก้ไข
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-auto max-h-[50vh]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 min-w-[160px] sticky left-0 bg-slate-50">รายการ ({count})</th>
                    {selCols.map(f => (
                      <th key={f.key} className="px-3 py-2 text-left min-w-[150px]">
                        <div className="text-xs font-semibold text-slate-600 mb-1">{f.label}</div>
                        {/* เติมทั้งคอลัมน์ */}
                        {f.type === "boolean" ? (
                          <div className="flex gap-1">
                            <button onClick={() => fillColumn(f.key, "true")} className="text-xs px-1.5 py-0.5 bg-white border border-slate-200 rounded hover:bg-emerald-50">เปิดหมด</button>
                            <button onClick={() => fillColumn(f.key, "false")} className="text-xs px-1.5 py-0.5 bg-white border border-slate-200 rounded hover:bg-slate-100">ปิดหมด</button>
                          </div>
                        ) : f.type === "select" ? (
                          <select value="" onChange={e => { if (e.target.value) fillColumn(f.key, e.target.value); }}
                            className="w-full h-6 px-1 text-xs border border-slate-200 rounded font-normal">
                            <option value="">⚡ เติมทั้งหมด...</option>
                            {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : f.type === "relation" && f.relationConfig ? (
                          <div className="font-normal"><RelationPicker value={null} config={f.relationConfig}
                            placeholder="⚡ เติมทั้งหมด..." onChange={(id) => fillColumn(f.key, id ?? "")} /></div>
                        ) : (
                          <div className="flex gap-1">
                            <input value={fillVals[f.key] ?? ""} onChange={e => setFillVals(v => ({ ...v, [f.key]: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter" && fillVals[f.key]) fillColumn(f.key, fillVals[f.key]); }}
                              placeholder="เติมทุกแถว" type={f.type === "number" ? "number" : "text"}
                              className="w-full h-6 px-1.5 text-xs border border-slate-200 rounded font-normal" />
                            <button onClick={() => fillColumn(f.key, fillVals[f.key] ?? "")} title="เติมลงทุกแถว"
                              className="text-xs px-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100">⚡</button>
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(r => {
                    const id = rowId(r);
                    return (
                      <tr key={id} className="hover:bg-slate-50/50">
                        <td className="px-3 py-1.5 text-slate-700 truncate max-w-[200px] sticky left-0 bg-white" title={rowLabel(r)}>{rowLabel(r)}</td>
                        {selCols.map(f => (
                          <td key={f.key} className="px-2 py-1.5">
                            {f.type === "boolean" ? (
                              <input type="checkbox" checked={cells[id]?.[f.key] === "true"}
                                onChange={e => setCell(id, f.key, e.target.checked ? "true" : "false")}
                                className="rounded border-slate-300 text-blue-600" />
                            ) : f.type === "select" ? (
                              <select value={cells[id]?.[f.key] ?? ""} onChange={e => setCell(id, f.key, e.target.value)}
                                className="w-full h-7 px-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500">
                                <option value="">—</option>
                                {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            ) : f.type === "relation" && f.relationConfig ? (
                              <RelationPicker value={cells[id]?.[f.key] || null} config={f.relationConfig}
                                onChange={(rid) => setCell(id, f.key, rid ?? "")} />
                            ) : (
                              <input type={f.type === "number" ? "number" : "text"} value={cells[id]?.[f.key] ?? ""}
                                onChange={e => setCell(id, f.key, e.target.value)}
                                className="w-full h-7 px-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}
    </ERPModal>
  );
}

// ============================================================
// ---- Cards View ----
// ============================================================

type ColMeta = { id: string; header: string; type?: string; cell?: ColumnDef<unknown>["cell"]; col: ColumnDef<unknown> };

function getColMeta<T>(columns: ColumnDef<T>[]): ColMeta[] {
  return columns.map(c => {
    const id = String((c as unknown as Record<string, unknown>).accessorKey ?? (c as unknown as Record<string, unknown>).id ?? "");
    return { id, header: typeof c.header === "string" ? c.header : id, type: c.meta?.type, cell: (c as ColumnDef<unknown>).cell, col: c as ColumnDef<unknown> };
  }).filter(c => c.id && c.id !== "__select__" && c.id !== "__actions__");
}

function fmtValue(v: unknown, type?: string): React.ReactNode {
  if (v == null || v === "") return <span className="text-slate-300">—</span>;
  if (type === "image") return null; // handled separately
  if (typeof v === "boolean") return v ? "✓" : "—";
  if (typeof v === "number") return v.toLocaleString("th-TH");
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

// ---- style mappings (Tailwind classes คงที่ — Tailwind detect ได้) ----

const COLS_CLASS: Record<NonNullable<CardConfig["columns"]>, string> = {
  auto: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  "1":  "grid-cols-1",
  "2":  "grid-cols-1 sm:grid-cols-2",
  "3":  "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  "4":  "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  "5":  "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
};
const IMG_H: Record<NonNullable<CardConfig["imageHeight"]>, string> = {
  sm: "h-24", md: "h-32", lg: "h-48", xl: "h-64",
};
const IMG_ASPECT: Record<NonNullable<CardConfig["imageAspect"]>, string> = {
  square: "aspect-square", wide: "aspect-video", tall: "aspect-[3/4]", auto: "",
};
const PRIMARY_SIZE: Record<NonNullable<CardConfig["primarySize"]>, string> = {
  sm: "text-sm", md: "text-base", lg: "text-lg", xl: "text-xl",
};

function CardsView<T extends Record<string, unknown>>({
  rows, columns, config, onRowClick,
}: {
  rows: T[];
  columns: ColumnDef<T>[];
  config: CardConfig;
  onRowClick?: (row: T) => void;
}) {
  const meta = useMemo(() => getColMeta(columns), [columns]);
  const get = (key: string | undefined) => meta.find(m => m.id === key);

  const primary  = get(config.primary);
  const subtitle = get(config.subtitle);
  const image    = get(config.image);
  const badges   = (config.badges  ?? []).map(get).filter(Boolean) as ColMeta[];
  const metrics  = (config.metrics ?? []).map(get).filter(Boolean) as ColMeta[];
  const lines    = (config.lines   ?? []).map(get).filter(Boolean) as ColMeta[];

  const layout   = config.layout      ?? "vertical";
  const showImg  = layout !== "compact" && !!image;
  const imgH     = IMG_H[config.imageHeight ?? "md"];
  const imgAsp   = IMG_ASPECT[config.imageAspect ?? "auto"];
  const imgFit   = config.imageFit === "contain" ? "object-contain" : "object-cover";
  const colsCls  = COLS_CLASS[config.columns ?? "auto"];
  const priSize  = PRIMARY_SIZE[config.primarySize ?? "md"];
  const isHorizontal = layout === "horizontal";
  const isCompact    = layout === "compact";

  const renderContent = (v: (k: string) => unknown) => (
    <div className={`${isCompact ? "p-2 space-y-1" : "p-3 space-y-2"} flex-1 min-w-0`}>
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {badges.map(b => {
            const val = v(b.id);
            if (val == null || val === "") return null;
            return <span key={b.id} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{fmtValue(val, b.type)}</span>;
          })}
        </div>
      )}
      {primary && <h3 className={`${priSize} font-semibold text-slate-900 line-clamp-2`}>{fmtValue(v(primary.id), primary.type)}</h3>}
      {subtitle && <p className="text-xs font-mono text-slate-500">{fmtValue(v(subtitle.id), subtitle.type)}</p>}
      {metrics.length > 0 && (
        <div className={`grid gap-2 ${isCompact ? "" : "pt-2 border-t border-slate-100"} ${metrics.length === 1 ? "" : "grid-cols-2"}`}>
          {metrics.map(m => (
            <div key={m.id}>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">{m.header}</p>
              <p className="text-sm font-bold text-slate-800 tabular-nums">{fmtValue(v(m.id), m.type)}</p>
            </div>
          ))}
        </div>
      )}
      {lines.length > 0 && (
        <div className={`space-y-0.5 ${isCompact ? "" : "pt-2 border-t border-slate-100"}`}>
          {lines.map(l => (
            <div key={l.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-400 shrink-0">{l.header}</span>
              <span className="text-slate-700 truncate">{fmtValue(v(l.id), l.type)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className={`grid ${colsCls} gap-3 p-4`}>
      {rows.map((row, i) => {
        const v = (k: string) => (row as Record<string, unknown>)[k];
        // F29: image field เก็บ r2_key → แปลงเป็น proxy URL
        const rawImg = showImg && image ? v(image.id) : null;
        const url = rawImg
          ? (String(rawImg).startsWith("http") || String(rawImg).startsWith("/api/")
              ? String(rawImg)
              : `/api/r2-image?key=${encodeURIComponent(String(rawImg))}`)
          : null;
        const imgBox = showImg && image ? (
          isHorizontal ? (
            <div className={`shrink-0 w-24 ${imgAsp || "aspect-square"} bg-slate-50 flex items-center justify-center overflow-hidden`}>
              {url ? <img src={String(url)} alt="" className={`w-full h-full ${imgFit}`} /> : <span className="text-slate-300 text-2xl">📷</span>}
            </div>
          ) : (
            <div className={`bg-slate-50 ${imgAsp || imgH} flex items-center justify-center overflow-hidden`}>
              {url ? <img src={String(url)} alt="" className={`w-full h-full ${imgFit}`} /> : <span className="text-slate-300 text-4xl">📷</span>}
            </div>
          )
        ) : null;
        return (
          <div key={String(row.id ?? i)}
            onClick={() => onRowClick?.(row)}
            className={`bg-white border border-slate-200 rounded-xl overflow-hidden transition-all ${onRowClick ? "cursor-pointer hover:border-blue-300 hover:shadow-md" : ""} ${isHorizontal ? "flex" : ""}`}>
            {imgBox}
            {renderContent(v)}
          </div>
        );
      })}
    </div>
  );
}

/* eslint-disable @next/next/no-img-element */

// ---- helper: select dropdown control ใน CardConfigDialog ----
function SelectCfg({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

// ============================================================
// ---- Card Config Dialog ----
// ============================================================

function CardConfigDialog<T>({
  columns, config, onClose, onSave,
}: {
  columns: ColumnDef<T>[];
  config: CardConfig;
  onClose: () => void;
  onSave: (c: CardConfig) => void;
}) {
  const meta = useMemo(() => getColMeta(columns), [columns]);
  const [draft, setDraft] = useState<CardConfig>(config);

  const toggleArr = (key: "badges" | "metrics" | "lines", id: string) => {
    setDraft(d => {
      const arr = new Set(d[key] ?? []);
      arr.has(id) ? arr.delete(id) : arr.add(id);
      return { ...d, [key]: [...arr] };
    });
  };

  const optionsForSingle = (label: string) => (
    <option value="">— {label} —</option>
  );

  const presets: { key: string; label: string; icon: string; cfg: Partial<CardConfig> }[] = [
    { key: "vertical",   label: "แนวตั้ง",  icon: "🗂",  cfg: { layout: "vertical",   imageHeight: "md", imageAspect: "auto",   imageFit: "cover", columns: "auto", primarySize: "md" } },
    { key: "horizontal", label: "แนวนอน",  icon: "📃",  cfg: { layout: "horizontal", imageAspect: "square", imageFit: "cover", columns: "2",   primarySize: "md" } },
    { key: "compact",    label: "แน่น",     icon: "≣",   cfg: { layout: "compact",    columns: "auto", primarySize: "sm" } },
    { key: "detailed",   label: "ละเอียด",  icon: "📰", cfg: { layout: "vertical",   imageHeight: "lg", imageAspect: "wide",   imageFit: "cover", columns: "2",   primarySize: "lg" } },
  ];

  return (
    <ERPModal open onClose={onClose} title="ตั้งค่าการแสดงผล Card" size="lg"
      footer={
        <>
          <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={() => onSave(draft)} className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">บันทึก</button>
        </>
      }
    >
      <div className="space-y-4">

        {/* Preset */}
        <div>
          <p className="text-xs font-medium text-slate-600 mb-1.5">รูปแบบสำเร็จรูป (เลือกแล้วปรับต่อได้)</p>
          <div className="grid grid-cols-4 gap-2">
            {presets.map(p => {
              const active = (draft.layout ?? "vertical") === p.cfg.layout && (draft.columns ?? "auto") === (p.cfg.columns ?? "auto");
              return (
                <button key={p.key} onClick={() => setDraft(d => ({ ...d, ...p.cfg }))}
                  className={`h-16 flex flex-col items-center justify-center rounded-lg border text-xs font-medium transition-colors ${
                    active ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}>
                  <span className="text-xl mb-0.5">{p.icon}</span>{p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ลุค (advanced) */}
        <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-3 gap-3">
          <SelectCfg label="คอลัมน์ต่อแถว" value={draft.columns ?? "auto"} onChange={v => setDraft({ ...draft, columns: v as CardConfig["columns"] })}
            options={[["auto","ปรับอัตโนมัติ"],["1","1"],["2","2"],["3","3"],["4","4"],["5","5"]]} />
          <SelectCfg label="ความสูงรูป" value={draft.imageHeight ?? "md"} onChange={v => setDraft({ ...draft, imageHeight: v as CardConfig["imageHeight"] })}
            options={[["sm","เล็ก"],["md","กลาง"],["lg","ใหญ่"],["xl","ใหญ่มาก"]]} />
          <SelectCfg label="อัตราส่วนรูป" value={draft.imageAspect ?? "auto"} onChange={v => setDraft({ ...draft, imageAspect: v as CardConfig["imageAspect"] })}
            options={[["auto","อัตโนมัติ"],["square","สี่เหลี่ยม 1:1"],["wide","กว้าง 16:9"],["tall","ตั้ง 3:4"]]} />
          <SelectCfg label="การจัดรูป" value={draft.imageFit ?? "cover"} onChange={v => setDraft({ ...draft, imageFit: v as CardConfig["imageFit"] })}
            options={[["cover","ครอบเต็ม (cover)"],["contain","โชว์ทั้งรูป (contain)"]]} />
          <SelectCfg label="ขนาดหัวข้อ" value={draft.primarySize ?? "md"} onChange={v => setDraft({ ...draft, primarySize: v as CardConfig["primarySize"] })}
            options={[["sm","เล็ก"],["md","กลาง"],["lg","ใหญ่"],["xl","ใหญ่มาก"]]} />
          <SelectCfg label="รูปแบบ" value={draft.layout ?? "vertical"} onChange={v => setDraft({ ...draft, layout: v as CardConfig["layout"] })}
            options={[["vertical","แนวตั้ง"],["horizontal","แนวนอน"],["compact","แน่น (ซ่อนรูป)"],["detailed","ละเอียด"]]} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">หัวข้อหลัก (ตัวใหญ่)</label>
            <select value={draft.primary ?? ""} onChange={e => setDraft({ ...draft, primary: e.target.value || undefined })}
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg">
              {optionsForSingle("ไม่แสดง")}
              {meta.map(m => <option key={m.id} value={m.id}>{m.header}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">หัวข้อรอง (ตัวเล็ก)</label>
            <select value={draft.subtitle ?? ""} onChange={e => setDraft({ ...draft, subtitle: e.target.value || undefined })}
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg">
              {optionsForSingle("ไม่แสดง")}
              {meta.map(m => <option key={m.id} value={m.id}>{m.header}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">รูปภาพ (ด้านบน card)</label>
            <select value={draft.image ?? ""} onChange={e => setDraft({ ...draft, image: e.target.value || undefined })}
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg">
              {optionsForSingle("ไม่แสดง")}
              {meta.filter(m => m.type === "image").map(m => <option key={m.id} value={m.id}>{m.header}</option>)}
            </select>
          </div>
        </div>

        {(["badges", "metrics", "lines"] as const).map(slot => {
          const labels = { badges: "ป้าย (badge)", metrics: "ตัวเลขเด่น (metric)", lines: "ข้อมูลรอง (line)" };
          const desc = { badges: "แสดงเป็น chip สี — เช่น สถานะ แผนก", metrics: "เน้นด้วยตัวใหญ่ — เช่น มูลค่า วันที่", lines: "บรรทัด label: value" };
          const sel = new Set(draft[slot] ?? []);
          return (
            <div key={slot}>
              <p className="text-xs font-medium text-slate-600">{labels[slot]}</p>
              <p className="text-xs text-slate-400 mb-1.5">{desc[slot]}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {meta.map(m => {
                  const on = sel.has(m.id);
                  return (
                    <label key={m.id} className={`flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer text-xs ${on ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      <input type="checkbox" checked={on} onChange={() => toggleArr(slot, m.id)} className="rounded border-slate-300" />
                      <span className="truncate">{m.header}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </ERPModal>
  );
}

// ============================================================
// ---- Detail Drawer ----
// ============================================================

function DetailDrawer({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[480px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <h3 className="text-base font-semibold text-slate-900 truncate flex-1 mr-3">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0">
            <IconChevronRightPanel />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

// ============================================================
// ---- Loading / Empty / Error ----
// ============================================================

function LoadingSkeleton({ columns, rows }: { columns: number; rows: number }) {
  return (
    <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
      <thead className="bg-slate-50 border-b border-slate-200">
        <tr>{Array.from({ length: columns }).map((_, i) => (<th key={i} className="px-4 py-2.5"><div className="h-3 w-20 bg-slate-200 rounded animate-pulse" /></th>))}</tr>
      </thead>
      <tbody className="bg-white divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, ri) => (
          <tr key={ri}>
            {Array.from({ length: columns }).map((_, ci) => (
              <td key={ci} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%`, animationDelay: `${ri * 50}ms` }} /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h6M9 13h4" /></svg>
      </div>
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-400">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700">เกิดข้อผิดพลาด</p>
        <p className="text-xs text-slate-500 mt-0.5">{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-1.5 h-8 px-4 text-sm bg-white border border-slate-200 text-slate-700 rounded-md hover:bg-slate-50 transition-colors">
          <IconRefreshCw /> ลองใหม่
        </button>
      )}
    </div>
  );
}
