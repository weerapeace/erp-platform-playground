// event กลาง: คอนเทนต์ของงานเปลี่ยนจากที่อื่น (เช่น สร้างจากกระดานบรีฟ) → รายการคอนเทนต์ในลิ้นชักงาน/การ์ดโหลดใหม่
// แยกไฟล์เล็กไว้ ให้ลิ้นชักงานฟังได้โดยไม่ต้องดึงชุดการ์ดกระดานทั้งก้อน
export const TASK_CONTENT_CHANGED = "erp:task-content-changed";
export function emitTaskContentChanged(taskId: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(TASK_CONTENT_CHANGED, { detail: { taskId } }));
}
