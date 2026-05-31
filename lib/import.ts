/**
 * Import Service กลาง — CSV / Excel parse → validate → batch
 *
 * Schema-driven — แต่ละ entity ส่ง ImportSchema เพื่อบอก:
 *   - fields ที่รับได้
 *   - column header aliases (auto-map)
 *   - validators per field
 *
 * รองรับ .csv, .xlsx, .xls — Excel ผ่าน dynamic import + webpackIgnore
 */

// ---- Types ----

export type FieldType = "text" | "number" | "boolean" | "select";

export type ImportField = {
  /** ชื่อ field ใน DB (key ที่ส่งไป RPC) */
  key:        string;
  /** ป้ายแสดงผล (ไทย) */
  label:      string;
  type:       FieldType;
  /** ต้องมีข้อมูล (ไม่ว่าง) */
  required?:  boolean;
  /** คำที่ใช้ match กับ CSV header (lowercase compare) */
  aliases?:   string[];
  /** สำหรับ select — list ค่าที่ยอมรับ */
  options?:   string[];
  /** custom validator — return error message ถ้าผิด */
  validate?:  (value: unknown, row: Record<string, unknown>) => string | null;
};

export type ImportSchema = {
  /** entity_type ที่ส่งไป API */
  entityType: string;
  label:      string;
  /** มี field unique ที่ใช้ detect duplicate (เช่น 'sku', 'code') */
  uniqueKey?: string;
  fields:     ImportField[];
};

// ---- Parse raw file → { headers, rows } ----

export type ParsedFile = {
  headers: string[];
  rows:    Record<string, string>[];   // value ทุกตัวเป็น string ก่อน
};

// ---- CSV parser (simple — handles quoted commas/newlines) ----
function parseCsv(text: string): ParsedFile {
  // strip BOM
  const stripped = text.replace(/^﻿/, "");
  const lines = stripped.split(/\r\n|\n|\r/);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = ""; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuote) {
        if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQuote = false; }
        else cur += c;
      } else {
        if (c === ',') { cells.push(cur); cur = ""; }
        else if (c === '"' && cur === "") { inQuote = true; }
        else cur += c;
      }
    }
    cells.push(cur);
    return cells;
  };

  const headers = parseLine(lines[0]).map(h => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = (cells[j] ?? "").trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

// ---- Excel parser ----
async function parseExcel(file: File): Promise<ParsedFile> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const XLSX: any = await import(/* webpackIgnore: true */ ("xlsx" as string));
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
  if (data.length === 0) return { headers: [], rows: [] };
  const headers = (data[0] as unknown[]).map((h) => String(h).trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < data.length; i++) {
    const cells = data[i] as unknown[];
    if (!cells || cells.every(c => c === "" || c == null)) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = String(cells[j] ?? "").trim(); });
    rows.push(row);
  }
  return { headers, rows };
  /* eslint-enable */
}

export async function parseImportFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseExcel(file);
  }
  const text = await file.text();
  return parseCsv(text);
}

// ---- Auto-map headers → schema fields ----

export function autoMapHeaders(headers: string[], fields: ImportField[]): Record<string, string> {
  const map: Record<string, string> = {};   // field.key → csv header
  for (const f of fields) {
    const aliases = [f.key, f.label, ...(f.aliases ?? [])].map(s => s.toLowerCase());
    const match = headers.find(h => aliases.includes(h.toLowerCase()));
    if (match) map[f.key] = match;
  }
  return map;
}

// ---- Validation ----

export type ValidationError = { row: number; field: string; message: string };

export function validateRows(
  rows: Record<string, string>[],
  schema: ImportSchema,
  mapping: Record<string, string>,
): { mappedRows: Record<string, unknown>[]; errors: ValidationError[] } {
  const mappedRows: Record<string, unknown>[] = [];
  const errors: ValidationError[] = [];

  rows.forEach((row, i) => {
    const idx = i + 1;
    const mapped: Record<string, unknown> = {};
    for (const f of schema.fields) {
      const csvCol = mapping[f.key];
      const raw = csvCol ? row[csvCol] : "";

      // required check
      if (f.required && (!raw || !raw.toString().trim())) {
        errors.push({ row: idx, field: f.key, message: `${f.label} ห้ามว่าง` });
        continue;
      }
      if (!raw) { mapped[f.key] = null; continue; }

      // type coerce
      let val: unknown = raw;
      if (f.type === "number") {
        const n = parseFloat(String(raw).replace(/,/g, ""));
        if (isNaN(n)) {
          errors.push({ row: idx, field: f.key, message: `${f.label} ต้องเป็นตัวเลข ("${raw}")` });
          continue;
        }
        val = n;
      } else if (f.type === "boolean") {
        const s = String(raw).toLowerCase().trim();
        if (["true","1","yes","y","ใช่","เปิด","active"].includes(s))  val = true;
        else if (["false","0","no","n","ไม่","ปิด","inactive"].includes(s)) val = false;
        else {
          errors.push({ row: idx, field: f.key, message: `${f.label} ต้องเป็น true/false` });
          continue;
        }
      } else if (f.type === "select" && f.options) {
        if (!f.options.includes(String(raw))) {
          errors.push({ row: idx, field: f.key, message: `${f.label} ต้องเป็น: ${f.options.join("/")}` });
          continue;
        }
      }

      // custom validator
      if (f.validate) {
        const err = f.validate(val, row);
        if (err) { errors.push({ row: idx, field: f.key, message: err }); continue; }
      }

      mapped[f.key] = val;
    }
    mappedRows.push(mapped);
  });

  return { mappedRows, errors };
}

// ---- Built-in schemas ----

export const PRODUCT_IMPORT_SCHEMA: ImportSchema = {
  entityType: "products",
  label:      "สินค้า (Products)",
  uniqueKey:  "sku",
  fields: [
    { key: "sku",           label: "SKU",         type: "text",   aliases: ["รหัสสินค้า","รหัส","sku code","item code"] },
    { key: "name",          label: "ชื่อสินค้า",   type: "text",   required: true, aliases: ["product name","ชื่อ","product"] },
    { key: "category_name", label: "หมวดหมู่",    type: "text",   aliases: ["category","หมวด"] },
    { key: "brand_name",    label: "แบรนด์",       type: "text",   aliases: ["brand","ยี่ห้อ"] },
    { key: "seller_name",   label: "ผู้จำหน่าย",   type: "text",   aliases: ["seller","supplier"] },
    { key: "uom_name",      label: "หน่วย",         type: "text",   aliases: ["unit","หน่วยนับ","uom"] },
    { key: "color",         label: "สี",            type: "text",   aliases: ["colour"] },
    { key: "list_price",    label: "ราคาขาย",      type: "number", aliases: ["price","ราคา","selling price"] },
    { key: "cost_price",    label: "ราคาทุน",      type: "number", aliases: ["cost","ต้นทุน"] },
    { key: "stock_on_hand", label: "สต๊อก",        type: "number", aliases: ["stock","คงเหลือ","qty","quantity"] },
    { key: "active",        label: "ใช้งาน",        type: "boolean",aliases: ["status","สถานะ"] },
    { key: "note",          label: "หมายเหตุ",     type: "text",   aliases: ["notes","remark"] },
    { key: "product_type",  label: "ประเภทสินค้า", type: "text",   aliases: ["type"] },
  ],
};

export const SUPPLIER_IMPORT_SCHEMA: ImportSchema = {
  entityType: "suppliers",
  label:      "ผู้จำหน่าย (Suppliers)",
  uniqueKey:  "code",
  fields: [
    { key: "code",          label: "รหัส",         type: "text",   aliases: ["supplier code","รหัสผู้จำหน่าย"] },
    { key: "name",          label: "ชื่อ",          type: "text",   required: true, aliases: ["supplier name","company name","บริษัท"] },
    { key: "contact_name",  label: "ผู้ติดต่อ",     type: "text",   aliases: ["contact","ชื่อผู้ติดต่อ"] },
    { key: "contact_phone", label: "เบอร์โทร",     type: "text",   aliases: ["phone","tel","เบอร์","โทรศัพท์"] },
    { key: "contact_email", label: "อีเมล",         type: "text",   aliases: ["email","e-mail"] },
    { key: "category",      label: "หมวดหมู่",     type: "text",   aliases: ["category","หมวด"] },
    { key: "address",       label: "ที่อยู่",        type: "text",   aliases: ["addr"] },
    { key: "tax_id",        label: "เลขผู้เสียภาษี",type: "text",   aliases: ["tax id","tax number","เลขประจำตัวผู้เสียภาษี"] },
    { key: "note",          label: "หมายเหตุ",     type: "text",   aliases: ["notes","remark"] },
  ],
};

export const IMPORT_SCHEMAS: Record<string, ImportSchema> = {
  products:  PRODUCT_IMPORT_SCHEMA,
  suppliers: SUPPLIER_IMPORT_SCHEMA,
};
