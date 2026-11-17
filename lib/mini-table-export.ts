// ============================================================
// mini-table-export — แปลงแถว/คอลัมน์ของตารางเล็ก (MiniTable) เป็นข้อมูลส่งออก Excel (pure เทสต์ได้)
// ค่าแต่ละช่อง: exportValue → sortValue → ผลของ cell ถ้าเป็นตัวหนังสือ/ตัวเลข · คอลัมน์ที่หาค่าไม่ได้เลย (เช่น ปุ่ม/รูป) = ไม่ส่งออก
// ส่งออกจริง + ตัดคอลัมน์ที่ไม่มีสิทธิ์ + บันทึกประวัติ = lib/export (exportTable)
// ============================================================
import type { ExportColumn } from "@/lib/export";

export type MiniExportCol<T> = {
  key: string;
  header: unknown;
  label?: string;
  sortLabel?: string;
  cell: (row: T) => unknown;
  sortValue?: (row: T) => string | number | null | undefined;
  exportValue?: (row: T) => string | number | null | undefined;
  /** ไม่ส่งออกคอลัมน์นี้ */
  noExport?: boolean;
  /** สิทธิ์ที่ต้องมีถึงจะส่งออกคอลัมน์นี้ได้ (เช่น "products.cost.view") */
  exportPermission?: string;
};

function plain(v: unknown): string | number | null | undefined {
  if (v == null) return v as null | undefined;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่";
  return undefined; // ReactNode อื่น ๆ (ปุ่ม รูป) — อ่านค่าไม่ได้
}

export function buildMiniExport<T>(columns: MiniExportCol<T>[], rows: T[]): { columns: ExportColumn[]; rows: Record<string, unknown>[] } {
  const cols = columns.filter((c) => !c.noExport);
  const getters = cols.map((c) => (row: T) => {
    if (c.exportValue) return c.exportValue(row);
    if (c.sortValue) return c.sortValue(row);
    return plain(c.cell(row));
  });
  // คอลัมน์ที่ทุกแถวอ่านค่าไม่ได้ (undefined) = ตัดทิ้ง
  const keep = cols.map((c, i) => !!(c.exportValue || c.sortValue) || rows.some((r) => getters[i](r) !== undefined));
  const out: ExportColumn[] = [];
  cols.forEach((c, i) => {
    if (!keep[i]) return;
    const header = c.label ?? (typeof c.header === "string" ? c.header : c.sortLabel ?? c.key);
    out.push({ key: c.key, header, permission: c.exportPermission });
  });
  const data = rows.map((r) => {
    const o: Record<string, unknown> = {};
    cols.forEach((c, i) => { if (keep[i]) o[c.key] = getters[i](r) ?? ""; });
    return o;
  });
  return { columns: out, rows: data };
}
