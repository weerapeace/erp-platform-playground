/**
 * team-plan-pet — แท็บ "แผนงาน" ในศูนย์แจ้งเตือน (ตัว Pet) · pure ไม่ยิง DB · ทดสอบได้
 *
 * งานของฉัน = ผู้รับผิดชอบคือฉัน หรือไม่มีผู้รับผิดชอบแต่ฉันสร้าง (นิยามเดียวกับปุ่ม "ของฉัน" บนกระดาน / ตัวตั้งเวลาเตือน)
 * กลุ่ม: เกินกำหนด → ครบวันนี้ → ถัดไป (7 วัน) → รอคนอื่น → ยังไม่ถึง/ไม่กำหนดวัน · เสร็จวันนี้ (พับ)
 * ตัวเลขบนตัว Pet = เกินกำหนด + ครบวันนี้
 * ตัว Pet พูด (ฟองคำพูด) เมื่อมีเรื่องใหม่: เลยกำหนด · ถึงเวลาเตือนที่กดเลื่อนไว้ · ถึงเวลาเตือนตามที่ตั้งในงาน · มีคนมอบงานให้ · สรุปเช้า 9:00
 *   (กติกาเวลาเตือนใช้ remindAt / planMorningSummary ตัวเดียวกับตัวตั้งเวลา lib/team-plan — ไม่คิดใหม่)
 * ใช้ที่: components/work-popup/plan-tab · components/work-popup/index (WorkPopupHost)
 */
import { addDaysYmd, todayBangkok } from "@/lib/date";
import { dueLabel, isOverdue, isSummaryWindow, planMorningSummary, remindAt, sortPlanItems, type PlanItem } from "@/lib/team-plan";

export type PlanGroupKey = "over" | "today" | "soon" | "wait" | "later" | "done";
export const PLAN_GROUPS: { key: PlanGroupKey; label: string; icon: string }[] = [
  { key: "over", label: "เกินกำหนด", icon: "warning" },
  { key: "today", label: "ครบวันนี้", icon: "clock" },
  { key: "soon", label: "ถัดไป (7 วัน)", icon: "calendar" },
  { key: "wait", label: "รอคนอื่น", icon: "waiting" },
  { key: "later", label: "ยังไม่ถึง / ไม่กำหนดวัน", icon: "list" },
  { key: "done", label: "เสร็จวันนี้", icon: "done" },
];
const SOON_DAYS = 7;
/** ข่าว "มีคนมอบงานให้" นับเฉพาะงานที่ขยับภายใน 24 ชม. (กันตอนเปิดครั้งแรกแล้วพูดถึงงานเก่าทั้งหมด) */
const FRESH_MS = 24 * 3600e3;

export const ownerOf = (t: Pick<PlanItem, "assigned_to" | "plan">) => t.assigned_to ?? t.plan.created_by_id;
export const isMine = (t: Pick<PlanItem, "assigned_to" | "plan">, me: string) => !!me && ownerOf(t) === me;

/** แบ่งงานของฉันเป็นกลุ่ม (เรียงในกลุ่ม: ⭐ วันนี้ → กำหนดใกล้สุด → เก่าก่อน) */
export function groupMyPlan(items: PlanItem[], me: string, now: Date = new Date()): Record<PlanGroupKey, PlanItem[]> {
  const today = todayBangkok(now);
  const soonEnd = addDaysYmd(today, SOON_DAYS);
  const out: Record<PlanGroupKey, PlanItem[]> = { over: [], today: [], soon: [], wait: [], later: [], done: [] };
  for (const t of items) {
    if (!isMine(t, me)) continue;
    if (t.status === "resolved") { if (t.resolved_at && todayBangkok(new Date(t.resolved_at)) === today) out.done.push(t); continue; }
    if (isOverdue(t.due_at, now)) out.over.push(t);
    else if (t.plan.waiting) out.wait.push(t);
    else if (t.due_at && todayBangkok(new Date(t.due_at)) === today) out.today.push(t);
    else if (t.due_at && todayBangkok(new Date(t.due_at)) <= soonEnd) out.soon.push(t);
    else out.later.push(t);
  }
  for (const k of Object.keys(out) as PlanGroupKey[]) out[k] = sortPlanItems(out[k], now);
  return out;
}

/** ตัวเลขบนแท็บ/ตัว Pet */
export const planPetCount = (g: Record<PlanGroupKey, PlanItem[]> | null) => (g ? g.over.length + g.today.length : 0);

export type PlanNews = { key: string; kind: "overdue" | "snooze" | "remind" | "assigned" | "morning"; text: string; item_id?: string };

/** เรื่องที่ตัว Pet ควรพูดตอนนี้ (ทั้งหมด — ผู้เรียกตัดเรื่องที่เคยเห็นแล้วออกเอง) · เรียง: เลยกำหนด → เตือนที่เลื่อนไว้ → ใกล้กำหนด → งานใหม่ → สรุปเช้า */
export function planPetNews(items: (PlanItem & { snooze_until?: string | null })[], me: string, now: Date = new Date()): PlanNews[] {
  const mine = items.filter((t) => t.status !== "resolved" && isMine(t, me));
  const over: PlanNews[] = [], snooze: PlanNews[] = [], remind: PlanNews[] = [], assigned: PlanNews[] = [];
  for (const t of mine) {
    const due = t.due_at;
    if (due && isOverdue(due, now)) over.push({ key: `overdue:${t.id}:${due}`, kind: "overdue", text: `เลยกำหนดแล้ว: ${t.title}`, item_id: t.id });
    else if (due && t.plan.remind !== "none") {
      const at = remindAt(due, t.plan.remind);
      if (at && at.getTime() <= now.getTime()) remind.push({ key: `remind:${t.id}:${due}`, kind: "remind", text: `ใกล้ถึงกำหนด (${dueLabel(due, now)}): ${t.title}`, item_id: t.id });
    }
    const until = t.snooze_until;
    if (until && Date.parse(until) <= now.getTime() && now.getTime() - Date.parse(until) < FRESH_MS) {
      snooze.push({ key: `snooze:${t.id}:${until}`, kind: "snooze", text: `เตือนอีกครั้ง: ${t.title}`, item_id: t.id });
    }
    const by = t.plan.created_by_id;
    if (t.assigned_to === me && by && by !== me && now.getTime() - Date.parse(t.updated_at || t.created_at) < FRESH_MS) {
      assigned.push({ key: `assigned:${t.id}:${me}`, kind: "assigned", text: `มีงานใหม่มอบให้คุณ: ${t.title}`, item_id: t.id });
    }
  }
  const out = [...over, ...snooze, ...remind, ...assigned];
  if (isSummaryWindow(now)) {
    const s = planMorningSummary(items, me, now);
    if (s) out.push({ key: `morning:${todayBangkok(now)}`, kind: "morning", text: `สรุปงานวันนี้: ${s.body.split("\n")[0]}` });
  }
  return out;
}

/** "เลื่อนไปพรุ่งนี้" = วันพรุ่งนี้ (นับจากวันนี้) เวลาเดิมของงาน · ไม่มีกำหนด = 18:00 (เหมือนปุ่มกำหนดด่วน "พรุ่งนี้") */
export function shiftToTomorrow(dueAt: string | null, now: Date = new Date()): string {
  const hm = dueAt ? new Date(Date.parse(dueAt) + 7 * 3600e3).toISOString().slice(11, 16) : "18:00";
  return new Date(`${addDaysYmd(todayBangkok(now), 1)}T${hm}:00+07:00`).toISOString();
}
