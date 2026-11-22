// ============================================================
// ความคืบหน้าของงาน (ตัวเดียวทั้งการ์ด/กล่องชี้) — เจ้าของเลือก 2026-11-22: "Progress bar เอาตามความพร้อมสินค้า"
//  • มีผลเช็กความพร้อมสินค้า (readiness_done/total จาก lib/task-readiness-server · ลิ้นชักงานบันทึกทับตอนเปิด) → ผ่าน ÷ ทั้งหมด
//  • ยังไม่เคยเช็ก / งานไม่ผูกสินค้า → % ตามสถานะงาน (ตั้งที่ /tasks/settings แท็บสถานะ)
// ============================================================
import type { CreativeTask } from "./data";

export type TaskProgress = { pct: number; done: number | null; total: number | null; missing: number; source: "readiness" | "status" };

export function taskProgress(task: Pick<CreativeTask, "progress_percent" | "readiness_done" | "readiness_total">): TaskProgress {
  const total = Number(task.readiness_total ?? 0), done = Number(task.readiness_done ?? 0);
  if (total > 0) { const d = Math.min(done, total); return { pct: Math.round((d / total) * 100), done: d, total, missing: total - d, source: "readiness" }; }
  return { pct: Math.max(0, Math.min(100, Math.round(Number(task.progress_percent ?? 0)))), done: null, total: null, missing: 0, source: "status" };
}
