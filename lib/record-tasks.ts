/**
 * เช็กลิสต์กลาง (erp_record_tasks) — ส่วนที่ใช้ร่วมกันทั้งจอและ API (ห้าม import ของฝั่งเซิร์ฟเวอร์ในไฟล์นี้)
 * สรุปสั้นไว้โชว์บนการ์ด/อีเมล: ข้อที่ยังไม่เสร็จ (เรียงตามเวลาที่เพิ่ม) + ผู้รับผิดชอบของแต่ละข้อ + จำนวนข้อที่เสร็จแล้ว
 * doc: docs/record-tasks.md
 */

/** open[i] = ข้อความข้อที่ค้าง · who[i] = ชื่อผู้รับผิดชอบ (null = ยังไม่มีคนรับ) · ids[i] = id ข้อ (ติ๊กบนการ์ดได้ตรง) · aids[i] = user id ผู้รับผิดชอบ */
export type ChecklistSummary = { open: string[]; who?: (string | null)[]; ids?: string[]; aids?: (string | null)[]; done: number };

/** "เสร็จ" ในตาราง = resolved (check constraint: open/in_progress/resolved/ignored/archived) */
export const isTaskDone = (status: string | null | undefined) => status === "resolved";

export function summarizeTasks(items: { id?: string; title: string; status: string; assigned_to?: string | null; assigned_name?: string | null }[]): ChecklistSummary {
  const open = items.filter((t) => !isTaskDone(t.status));
  return {
    open: open.map((t) => t.title),
    who: open.map((t) => t.assigned_name ?? null),
    ...(open.every((t) => t.id) ? { ids: open.map((t) => t.id!), aids: open.map((t) => t.assigned_to ?? null) } : {}),
    done: items.filter((t) => isTaskDone(t.status)).length,
  };
}

/** "รอหาผ้า · ฝน" — ข้อความ + ชื่อผู้รับผิดชอบ (ถ้ามี) */
export const taskWithWho = (title: string, who: string | null | undefined, sep = " · ") => (who ? `${title}${sep}${who}` : title);
