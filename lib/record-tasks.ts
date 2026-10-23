/**
 * เช็กลิสต์กลาง (erp_record_tasks) — ส่วนที่ใช้ร่วมกันทั้งจอและ API (ห้าม import ของฝั่งเซิร์ฟเวอร์ในไฟล์นี้)
 * สรุปสั้นไว้โชว์บนการ์ด/อีเมล: ข้อที่ยังไม่เสร็จ (เรียงตามเวลาที่เพิ่ม) + ผู้รับผิดชอบของแต่ละข้อ + จำนวนข้อที่เสร็จแล้ว
 * doc: docs/record-tasks.md
 */

/** open[i] = ข้อความข้อที่ค้าง · who[i] = ชื่อผู้รับผิดชอบข้อนั้น (null = ยังไม่มีคนรับ) */
export type ChecklistSummary = { open: string[]; who?: (string | null)[]; done: number };

/** "เสร็จ" ในตาราง = resolved (check constraint: open/in_progress/resolved/ignored/archived) */
export const isTaskDone = (status: string | null | undefined) => status === "resolved";

export function summarizeTasks(items: { title: string; status: string; assigned_name?: string | null }[]): ChecklistSummary {
  const open = items.filter((t) => !isTaskDone(t.status));
  return {
    open: open.map((t) => t.title),
    who: open.map((t) => t.assigned_name ?? null),
    done: items.filter((t) => isTaskDone(t.status)).length,
  };
}

/** "รอหาผ้า · ฝน" — ข้อความ + ชื่อผู้รับผิดชอบ (ถ้ามี) */
export const taskWithWho = (title: string, who: string | null | undefined, sep = " · ") => (who ? `${title}${sep}${who}` : title);
