/**
 * ✍ หมายเหตุที่พิมพ์เองบนหน้าพิมพ์ (ของกลาง) — ช่อง "พิมพ์เอง" ของใบพิมพ์แบบรายการ (lib/list-print blank = text)
 *   เก็บในตาราง print_row_notes (ทั้งทีมเห็น · จำไว้ครั้งหน้า) ผ่าน /api/print-notes · หน้าพิมพ์ใช้ usePrintNotes (components/report/use-print-notes)
 *   ที่อยู่ข้อความ = report + row_key (รายงานกำหนด คงที่) + col_key (คอลัมน์) — ใน HTML คือ data-note="<row_key>|<col_key>"
 *   รายงานใหม่ที่อยากมีช่องพิมพ์เอง → เพิ่มชื่อใน PRINT_NOTE_REPORTS · pure ไม่มี "use client" (ใช้ได้ทั้ง API/หน้า/เทสต์)
 */

export const PRINT_NOTE_REPORTS = ["purchasing-orders"] as const;
export type PrintNoteReport = (typeof PRINT_NOTE_REPORTS)[number];
export const isPrintNoteReport = (v: unknown): v is PrintNoteReport => typeof v === "string" && (PRINT_NOTE_REPORTS as readonly string[]).includes(v);

export const PRINT_NOTE_MAX = 500;
export const PRINT_NOTE_ROW_MAX = 300;
const COL_RE = /^[a-z0-9_]{1,24}$/;

export type PrintNote = { row_key: string; col_key: string; body: string; updated_by_name: string | null; updated_at: string };

/** ข้อความที่จะเก็บ: ตัดช่องว่างหัวท้าย · ตัดอักขระควบคุม (ยกเว้นขึ้นบรรทัด) · ไม่เกิน PRINT_NOTE_MAX */
export const cleanNoteBody = (v: unknown): string =>
  String(v ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, PRINT_NOTE_MAX);

export const okNoteRow = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= PRINT_NOTE_ROW_MAX;
export const okNoteCol = (v: unknown): v is string => typeof v === "string" && COL_RE.test(v);

/** แยก data-note "<row_key>|<col_key>" (row_key มี | ได้ — คอลัมน์อยู่หลัง | ตัวสุดท้าย) */
export function splitNoteKey(key: string): { row: string; col: string } | null {
  const i = key.lastIndexOf("|");
  if (i <= 0) return null;
  const row = key.slice(0, i), col = key.slice(i + 1);
  return okNoteRow(row) && okNoteCol(col) ? { row, col } : null;
}

/** ตารางยังไม่ได้สร้าง (migration ยังไม่ลง) — API ตอบว่า "ยังไม่พร้อม" แทน error ดิบ */
export const isMissingTableError = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /print_row_notes/.test(e.message ?? "") && /(does not exist|could not find)/i.test(e.message ?? ""));
