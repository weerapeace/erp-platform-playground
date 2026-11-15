/**
 * การ์ด "งานในแผน" บนกระดานแผนงานทีม (ฟังก์ชันล้วน) — ชื่องาน · กำหนด · คนทำ · เช็กลิสต์ x/y + แถบ · ผูกไว้ N อย่าง · เสร็จแล้ว
 *   สีขอบ: เสร็จ = เขียว · เกินกำหนด = แดง · ที่เหลือ = สีความด่วน
 *   ความสูงกล่อง = 40 + บรรทัด×18 (สูตรเดียวกับตอนกระดานซิงค์การ์ดข้อความ — อัปเดตแล้วกล่องไม่กระโดด)
 *   ข้อความบนการ์ดไม่ใช้อีโมจิ (ใช้ ☐ ☑ ■ □)
 */
import { wrapCardText } from "@/components/canvas-cards/skeletons";
import { checklistProgress } from "@/lib/record-tasks";
import { dueLabel, isOverdue, isPlanDone, PRIORITY_META, type PlanItem } from "@/lib/team-plan";
import { PLAN_CARD_KIND, progressBar } from "@/lib/team-plan-board";

export const PLAN_CARD_W = 260;

export function planCardText(t: PlanItem, now: Date = new Date()): string {
  const done = isPlanDone(t);
  const c = checklistProgress(t.checklist);
  const lines = [
    `${done ? "☑" : "☐"} ${wrapCardText(t.title, 24, 3)}`,
    `กำหนด: ${t.due_at ? dueLabel(t.due_at, now) : "ไม่มีกำหนด"}`,
    `คนทำ: ${t.assigned_name ?? "ยังไม่ระบุ"}`,
  ];
  if (c.total > 0) lines.push(`เช็กลิสต์ ${c.done}/${c.total}  ${progressBar(c.done, c.total)}`);
  if (t.plan.linked.length) lines.push(`ผูกไว้ ${t.plan.linked.length} อย่าง`);
  if (done) lines.push(`เสร็จแล้ว${t.resolved_by ? ` · ${t.resolved_by}` : ""}`);
  return lines.join("\n");
}

export function planCardStroke(t: PlanItem, now: Date = new Date()): string {
  if (isPlanDone(t)) return "#16a34a";
  if (isOverdue(t.due_at, now)) return "#dc2626";
  return PRIORITY_META[t.priority].color;
}

export const planCardHeight = (text: string) => 40 + text.split("\n").length * 18;

/** โครงการ์ด (Excalidraw skeleton) — customData = { kind: "team_plan", id } ดับเบิลคลิกเปิดป๊อปงาน */
export function planCardSkeleton(t: PlanItem, now: Date = new Date()): Record<string, unknown>[] {
  const gid = `${PLAN_CARD_KIND}-${t.id}-${Math.random().toString(36).slice(2, 7)}`;
  const data = { kind: PLAN_CARD_KIND, id: t.id, title: t.title, tooltip: "ดับเบิลคลิก = เปิดงาน · ลากเส้นไปการ์ดอื่น = ผูกงาน" };
  const text = planCardText(t, now);
  const W = PLAN_CARD_W, H = planCardHeight(text);
  return [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#ffffff", strokeColor: planCardStroke(t, now), strokeWidth: 2, fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
    { type: "text", x: 14, y: 14, width: W - 28, text, fontSize: 14, strokeColor: "#1e293b", groupIds: [gid], customData: data },
  ];
}

/** การ์ด "หน้าใน ERP" — ดับเบิลคลิกเปิดหน้านั้นในแท็บใหม่ (ผูกกับงานได้) */
export function erpPageCardSkeleton(p: { href: string; label: string; appName?: string | null }): Record<string, unknown>[] {
  const gid = `erp_page-${Math.random().toString(36).slice(2, 9)}`;
  const data = { kind: "erp_page", id: p.href, href: p.href, label: p.label, tooltip: "ดับเบิลคลิก = เปิดหน้านี้" };
  const text = [`หน้าใน ERP · ${wrapCardText(p.label, 22, 2)}`, p.appName ? `แอป: ${p.appName}` : null, p.href].filter(Boolean).join("\n");
  const W = 250, H = planCardHeight(text);
  return [
    { type: "rectangle", x: 0, y: 0, width: W, height: H, backgroundColor: "#f0f9ff", strokeColor: "#0284c7", fillStyle: "solid", roundness: { type: 3 }, groupIds: [gid], customData: data },
    { type: "text", x: 14, y: 14, width: W - 28, text, fontSize: 13, strokeColor: "#075985", groupIds: [gid], customData: data },
  ];
}

/** โน้ตแปะ (กระดาษเหลือง) — ไม่ใช่การ์ดข้อมูล ดับเบิลคลิกแก้ข้อความได้เลย */
export function stickyNoteSkeleton(): Record<string, unknown>[] {
  return [{ type: "rectangle", x: 0, y: 0, width: 200, height: 140, backgroundColor: "#fef08a", strokeColor: "#ca8a04", fillStyle: "solid", roundness: { type: 3 }, label: { text: "โน้ต", fontSize: 16, strokeColor: "#713f12" } }];
}
