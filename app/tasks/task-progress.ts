// ============================================================
// ความคืบหน้าของงาน (ตัวเดียวทั้งการ์ด/กล่องชี้/ลิ้นชัก) — เจ้าของเลือก 2026-11-22
//  • มีคอนเทนต์ผูกงาน → นับจากคอนเทนต์ที่ "พร้อม/ตั้งเวลา/โพสต์แล้ว" ÷ คอนเทนต์ทั้งหมด (ไม่นับยกเลิก) = ตรงกับรายการที่เหลือจริง
//  • ยังไม่มีคอนเทนต์ → ใช้ % ตามสถานะงานเหมือนเดิม (ตั้งที่ /tasks/settings แท็บสถานะ)
//  • งานปิดแล้ว (เสร็จ/ยกเลิก) = ตาม % สถานะ
// ============================================================
import type { CreativeTask } from "./data";

export type TaskProgress = { pct: number; done: number | null; total: number | null; source: "content" | "status" };

export function taskProgress(task: Pick<CreativeTask, "progress_percent" | "content_done" | "content_total">, closed = false): TaskProgress {
  const total = Number(task.content_total ?? 0), done = Number(task.content_done ?? 0);
  if (!closed && total > 0) return { pct: Math.round((Math.min(done, total) / total) * 100), done, total, source: "content" };
  return { pct: Math.max(0, Math.min(100, Math.round(Number(task.progress_percent ?? 0)))), done: null, total: null, source: "status" };
}
