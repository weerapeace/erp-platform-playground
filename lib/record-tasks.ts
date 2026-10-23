/**
 * เช็กลิสต์กลาง (erp_record_tasks) — ส่วนที่ใช้ร่วมกันทั้งจอและ API (ห้าม import ของฝั่งเซิร์ฟเวอร์ในไฟล์นี้)
 * สรุปสั้นไว้โชว์บนการ์ด/อีเมล: ข้อที่ยังไม่เสร็จ (เรียงตามเวลาที่เพิ่ม) + จำนวนข้อที่เสร็จแล้ว
 * doc: docs/record-tasks.md
 */

export type ChecklistSummary = { open: string[]; done: number };

/** "เสร็จ" ในตาราง = resolved (check constraint: open/in_progress/resolved/ignored/archived) */
export const isTaskDone = (status: string | null | undefined) => status === "resolved";

export function summarizeTasks(items: { title: string; status: string }[]): ChecklistSummary {
  return {
    open: items.filter((t) => !isTaskDone(t.status)).map((t) => t.title),
    done: items.filter((t) => isTaskDone(t.status)).length,
  };
}
