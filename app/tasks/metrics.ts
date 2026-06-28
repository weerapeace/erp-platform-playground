// ============================================================
// Custom metric cards — การ์ดนับเลขที่ผู้ใช้สร้างเอง (เงื่อนไข + ชื่อ/ไอคอน/สี)
// เก็บต่อคนใน user_ui_prefs key=tasks_metric_cards · ใช้ matchMetric นับ + กรองตาราง
// ============================================================
import { isOverdue, type CreativeTask } from "./data";
import { isTerminal } from "./use-statuses";

export type MetricDue = "" | "today" | "overdue" | "thisweek" | "thismonth" | "none";
export type MetricCond = {
  status?: string;       // คีย์สถานะงาน
  priority?: string;     // ความสำคัญ
  taskType?: string;     // ประเภทงาน
  brandId?: string;      // แบรนด์
  due?: MetricDue;       // กำหนดส่ง
  mine?: boolean;        // เฉพาะของฉัน
  openOnly?: boolean;    // เฉพาะที่ยังไม่เสร็จ (ไม่นับสถานะปิด)
};
export type MetricDef = { id: string; label: string; icon: string; color: string; cond: MetricCond };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** เงื่อนไขทั้งหมดต้องผ่าน (AND) — ใช้ทั้งนับเลขและกรองตาราง */
export function matchMetric(tk: CreativeTask, cond: MetricCond, ctx: { myTaskIds: Set<string>; today: string }): boolean {
  if (cond.openOnly && isTerminal(tk.status)) return false;
  if (cond.mine && !ctx.myTaskIds.has(tk.id)) return false;
  if (cond.status && tk.status !== cond.status) return false;
  if (cond.priority && tk.priority !== cond.priority) return false;
  if (cond.taskType && tk.task_type !== cond.taskType) return false;
  if (cond.brandId && tk.brand_id !== cond.brandId) return false;
  if (cond.due) {
    const due = tk.due_date ? String(tk.due_date).slice(0, 10) : null;
    if (cond.due === "none") { if (due) return false; }
    else if (cond.due === "overdue") { if (!isOverdue(tk)) return false; }
    else if (cond.due === "today") { if (due !== ctx.today) return false; }
    else if (cond.due === "thisweek") { if (!due) return false; const wk = iso(new Date(Date.now() + 7 * 864e5)); if (due < ctx.today || due > wk) return false; }
    else if (cond.due === "thismonth") { if (!due) return false; if (due.slice(0, 7) !== ctx.today.slice(0, 7)) return false; }
  }
  return true;
}

/** สรุปเงื่อนไขเป็นข้อความสั้นๆ (โชว์ใต้ชื่อการ์ดในตัวจัดการ) */
export function describeCond(c: MetricCond, opt: { typeLabel: (v: string) => string; brandLabel: (v: string) => string; statusLabel: (v: string) => string; priorityLabel: (v: string) => string }): string {
  const parts: string[] = [];
  if (c.mine) parts.push("ของฉัน");
  if (c.openOnly) parts.push("ยังไม่เสร็จ");
  if (c.status) parts.push(opt.statusLabel(c.status));
  if (c.priority) parts.push(opt.priorityLabel(c.priority));
  if (c.taskType) parts.push(opt.typeLabel(c.taskType));
  if (c.brandId) parts.push(opt.brandLabel(c.brandId));
  const dueLbl: Record<string, string> = { today: "ครบกำหนดวันนี้", overdue: "เกินกำหนด", thisweek: "ภายในสัปดาห์นี้", thismonth: "ภายในเดือนนี้", none: "ไม่มีกำหนดส่ง" };
  if (c.due) parts.push(dueLbl[c.due] ?? "");
  return parts.filter(Boolean).join(" · ") || "ทุกงาน";
}
