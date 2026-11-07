/**
 * 🖨 ประวัติการพิมพ์เอกสาร (ของกลาง) — ชนิด/ป้ายกำกับ ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และหน้าเว็บ
 *   บันทึก: components/report/use-print-log.ts (usePrintLog — หน้าพิมพ์เรียกตัวเดียว จับปุ่มพิมพ์ / Ctrl+P / PDF / ลิงก์ให้เอง)
 *   อ่าน:   GET /api/print-logs?doc_type=&doc_id=  ·  ป้ายบนบอร์ด = /api/mo/work-board (printSummaryOf ใน lib/print-log-server.ts)
 *   แสดง:  components/print-history (PrintHistoryBadge — ป้าย "พิมพ์แล้ว N ครั้ง" + ประวัติ)
 *   ตาราง: print_logs (supabase/migrations/202611100400_print_logs.sql)
 */

/** เอกสารที่บันทึกการพิมพ์ได้ — เพิ่มชนิดใหม่ที่นี่ที่เดียว */
// piecework = แถวงานเหมา (mo_piecework.id) จากใบจ่ายงานเหมา · sale_line = บรรทัดใบขาย (erp_playground_so_lines.id) จากใบสรุปจับคู่ใบขาย → ใบงาน
// work_log = ใบจดผลงานตามใบงาน (doc_id = manufacturing_orders.id) จาก /print/work-steps/<id>?mode=worklog
// so_order = ใบเช็กสถานะใบสั่งขาย (doc_id = so_orders.id) จาก /print/so-order-status/<id>
// ds_notice = ใบแจ้งลูกค้าของใบงานออกแบบ (doc_id = design_sheet_notices.id) จาก /print/design-sheet/<id>/notice/<noticeId>
// ds_pattern = หน้าแพทเทิร์นจากตีราคา (doc_id = design_sheets.id) จาก /print/design-sheet/<id>/pattern
export const PRINT_DOC_TYPES = ["mo", "piecework", "sale_line", "work_log", "so_order", "ds_notice", "ds_pattern"] as const;
export type PrintDocType = (typeof PRINT_DOC_TYPES)[number];
/** สิทธิ์ดู/บันทึกประวัติพิมพ์ต่อชนิด (ไม่ระบุ = ดูสินค้าได้ products.view) — ฝ่ายขายเปิดใบสั่งขายได้แต่อาจไม่มีสิทธิ์ดูสินค้า */
export const PRINT_DOC_PERM: Partial<Record<PrintDocType, string>> = { so_order: "so.view" };
export const printDocPerm = (t: PrintDocType): string => PRINT_DOC_PERM[t] ?? "products.view";

/** พิมพ์แบบไหน: print = กดพิมพ์ / Ctrl+P / บันทึก PDF จากหน้าต่างพิมพ์ · pdf = โหลด/เปิดไฟล์ PDF · link = เปิดไฟล์พิมพ์ในแท็บใหม่ / ส่งลิงก์ */
export type PrintHow = "print" | "pdf" | "link";
export const PRINT_HOW_LABEL: Record<PrintHow, string> = { print: "พิมพ์ / บันทึก PDF", pdf: "ไฟล์ PDF", link: "เปิดไฟล์พิมพ์ / ส่งลิงก์" };

/** ใบที่จะบันทึกว่าพิมพ์ (หน้าพิมพ์รวมหลายใบ = หลายรายการ) */
export type PrintLogItem = { doc_id: string; doc_no?: string | null; qty?: number | null };

export type PrintLogRow = {
  id: string; doc_type: string; doc_id: string; doc_no: string | null; variant: PrintHow; batch_size: number;
  qty_at_print: number | null; printed_by: string | null; printed_by_name: string | null; printed_at: string;
};

/** สรุปต่อใบ (ป้ายบนบอร์ด): พิมพ์กี่ครั้ง · ครั้งล่าสุดเมื่อไหร่ · จำนวนสั่งตอนพิมพ์ครั้งล่าสุด */
export type PrintSummary = { n: number; last: string; qty: number | null };

/** หน้าพิมพ์ (components/report) ประกาศว่า "กำลังพิมพ์" ทาง window event นี้ → usePrintLog รับไปบันทึก */
export const PRINT_EVENT = "erp:report-print";

/** จำนวนสั่งตอนนี้ไม่ตรงกับตอนพิมพ์ครั้งล่าสุด = ใบที่ช่างถืออยู่เป็นฉบับเก่า */
export const printQtyChanged = (s: { qty: number | null } | null | undefined, currentQty: number | null | undefined) =>
  !!s && s.qty != null && currentQty != null && Math.abs(Number(s.qty) - Number(currentQty)) > 0.0001;
