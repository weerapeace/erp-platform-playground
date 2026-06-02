/**
 * Export Service กลาง — CSV / Excel
 *
 * ทุก list ต้องใช้ service นี้ — ห้ามเขียน CSV/Excel logic ใน page เอง
 * รองรับ:
 *   - field permission (กรอง column ที่ user ไม่มีสิทธิ์)
 *   - audit log การ export (POST /api/audit-logs/export)
 *   - 2 รูปแบบ: CSV (built-in) / Excel (dynamic xlsx)
 *
 * Excel ใช้ dynamic import + webpackIgnore: true → ยังไม่ติดตั้ง xlsx ก็ build ผ่าน
 * (จะ throw เฉพาะตอนเรียก exportToExcel จริง)
 */

import { apiFetch } from "@/lib/api";

// ---- Types ----

export type ExportColumn = {
  /** key ใน row object */
  key:        string;
  /** หัวคอลัมน์ (ไทย) */
  header:     string;
  /** permission ที่ต้องมีจึงจะ export ได้ — undefined = ทุกคน */
  permission?: string;
  /** custom formatter (เช่น date, currency) — default String(v) */
  format?:    (value: unknown, row: Record<string, unknown>) => string;
  /** column width (Excel เท่านั้น) */
  width?:     number;
};

export type ExportContext = {
  /** entity_type สำหรับ audit log เช่น "erp_playground_product" */
  entityType: string;
  /** mode: ที่แสดง / ที่เลือก / ทั้งหมดที่ filter อยู่ */
  mode:       "visible" | "selected" | "filtered_all";
  /** จำนวนรายการที่จะ export (ก่อน filter permission) */
  totalRows:  number;
  /** filter / search state (สำหรับเก็บใน audit) */
  filterDesc?: string;
};

export type ExportOptions = {
  format:     "csv" | "excel";
  filename:   string;                              // ไม่ต้องใส่ .csv/.xlsx
  rows:       Record<string, unknown>[];
  columns:    ExportColumn[];
  context:    ExportContext;
  /** function check permission (จาก useAuth) — undefined = อนุญาตทุก field */
  can?:       (perm: string) => boolean;
};

// ---- ตัวกรอง column ตาม permission ----

export function filterColumnsByPermission(
  columns: ExportColumn[],
  can?: (perm: string) => boolean,
): { allowed: ExportColumn[]; blocked: ExportColumn[] } {
  const allowed: ExportColumn[] = [];
  const blocked: ExportColumn[] = [];
  for (const col of columns) {
    if (col.permission && can && !can(col.permission)) blocked.push(col);
    else allowed.push(col);
  }
  return { allowed, blocked };
}

// ---- Format ค่าตาม column ----

function defaultFormat(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่";
  if (typeof v === "object") return "";
  return String(v);
}

function rowToValues(row: Record<string, unknown>, cols: ExportColumn[]): (string | number | boolean)[] {
  return cols.map(c => {
    const raw = row[c.key];
    if (c.format) return c.format(raw, row);
    // เก็บเป็น native type สำหรับ Excel
    if (typeof raw === "number" || typeof raw === "boolean") return raw;
    return defaultFormat(raw);
  });
}

// ---- CSV ----

function escapeCsv(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(rows: Record<string, unknown>[], cols: ExportColumn[]): Blob {
  const headers = cols.map(c => c.header);
  const lines = [
    headers.map(escapeCsv).join(","),
    ...rows.map(r => rowToValues(r, cols).map(escapeCsv).join(",")),
  ];
  // ﻿ = UTF-8 BOM → Excel อ่านภาษาไทยถูก
  return new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
}

// ---- Excel (dynamic import) ----

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadXlsx(): Promise<any> {
  // bundle xlsx เป็น async chunk (โหลดในเบราว์เซอร์ตอนกด export) — xlsx อยู่ใน dependencies แล้ว
  return await import("xlsx");
}

async function buildExcel(
  rows: Record<string, unknown>[],
  cols: ExportColumn[],
  sheetName = "Sheet1",
): Promise<Blob> {
  const XLSX: any = await loadXlsx();

  // ข้อมูล: row 0 = headers, ถัดมาเป็น data
  const data: (string | number | boolean)[][] = [
    cols.map(c => c.header),
    ...rows.map(r => rowToValues(r, cols)),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);

  // column widths
  ws["!cols"] = cols.map(c => ({ wch: c.width ?? Math.max(c.header.length + 2, 12) }));

  // freeze header
  ws["!freeze"] = { ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const buf: ArrayBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---- Download trigger ----

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Audit log (best-effort, ไม่ block download ถ้า fail) ----

async function logExportAudit(opts: ExportOptions, exportedCount: number, blockedFields: string[]) {
  try {
    await apiFetch("/api/audit-logs/export", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_type:  opts.context.entityType,
        format:       opts.format,
        mode:         opts.context.mode,
        total_rows:   opts.context.totalRows,
        exported_rows: exportedCount,
        columns:      opts.columns.filter(c => !blockedFields.includes(c.key)).map(c => c.key),
        blocked_columns: blockedFields,
        filter_desc:  opts.context.filterDesc ?? null,
        filename:     opts.filename,
      }),
    });
  } catch (err) {
    console.error("[export] audit log failed", err);
  }
}

// ---- Public: exportTable ----

export async function exportTable(opts: ExportOptions): Promise<{ exported: number; blocked: string[] }> {
  const { allowed, blocked } = filterColumnsByPermission(opts.columns, opts.can);
  if (allowed.length === 0) {
    throw new Error("ไม่มีคอลัมน์ที่คุณมีสิทธิ์ export — ติดต่อ admin");
  }

  const ext = opts.format === "csv" ? "csv" : "xlsx";
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${opts.filename}-${date}.${ext}`;

  const blob = opts.format === "csv"
    ? buildCsv(opts.rows, allowed)
    : await buildExcel(opts.rows, allowed);

  triggerDownload(blob, filename);

  await logExportAudit({ ...opts, filename }, opts.rows.length, blocked.map(b => b.key));

  return { exported: opts.rows.length, blocked: blocked.map(b => b.key) };
}
