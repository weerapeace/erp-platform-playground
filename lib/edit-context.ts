/**
 * 🔁 บริบท "กำลังแก้สินค้าจากในงาน" (ของกลาง ฝั่งเบราว์เซอร์)
 *
 * เปิดตัวแก้สินค้าจากงาน Creative (โหมดใหม่) → setEditContext({ taskId, subtaskId }) · ปิด → clearEditContext()
 * ระหว่างนั้น apiFetch แนบ header x-erp-task / x-erp-subtask ไปกับทุกคำขอ
 * → ฝั่ง server (lib/record-versions: editContextFromRequest) จดเวอร์ชันพร้อมเลขงาน → การ์ดงานสรุป "สิ่งที่แก้ในงานนี้" ได้เอง
 * drawer ซ้อน (Parent → SKU ลูก) ได้บริบทเดียวกันอัตโนมัติ
 */

export type EditContext = { taskId: string; subtaskId?: string | null };

let current: EditContext | null = null;

export function setEditContext(ctx: EditContext | null): void { current = ctx; }
export function clearEditContext(): void { current = null; }
export function getEditContext(): EditContext | null { return current; }

/** header ที่แนบไปกับคำขอ (ว่าง = ไม่ได้แก้จากในงาน) */
export function editContextHeaders(): Record<string, string> {
  if (!current?.taskId) return {};
  return { "x-erp-task": current.taskId, ...(current.subtaskId ? { "x-erp-subtask": current.subtaskId } : {}) };
}
