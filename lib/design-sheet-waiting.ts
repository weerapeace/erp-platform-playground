/**
 * ⏳ "รออะไรอยู่" ของใบงานออกแบบ = เช็กลิสต์กลาง (erp_record_tasks) + ปุ่มลัดค่าที่ใช้บ่อย (erp_lookups)
 * ค่าชุดเดียวใช้ทั้งฟอร์ม/การ์ด/hover/API รายการใบงาน/อีเมลรายงาน · migration 202610300500 · doc: docs/record-tasks.md
 */
export const DESIGN_WAITING = {
  moduleKey: "design_sheet_waiting",
  recordType: "design_sheet",
  presetType: "design_sheet_waiting",
} as const;
