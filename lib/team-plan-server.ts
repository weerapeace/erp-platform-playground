/**
 * แผนงานทีม — ฝั่งเซิร์ฟเวอร์ (API /api/team-plan + ตัวตั้งเวลาแจ้งเตือน)
 *   toPlanItem      = แถว erp_record_tasks → ที่ส่งให้หน้าเว็บ (metadata ไม่ส่งทั้งก้อน: แยกเป็น plan + links)
 *   notifyPlanAssignee = กระดิ่งบอกคนที่ถูกมอบงาน (ไม่เด้งถ้ามอบให้ตัวเอง) · เปิดแล้วไปที่งานนั้นในหน้าแผนงาน
 * กฎ pure อยู่ที่ lib/team-plan · doc: docs/team-plan.md
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { linksOf } from "@/lib/record-tasks";
import { isUuid } from "@/lib/record-tasks-server";
import { asPriority, normalizePlanMeta, type PlanItem } from "@/lib/team-plan";

type Admin = ReturnType<typeof supabaseAdmin>;

export const PLAN_COLS = "id, module_key, record_id, title, description, status, priority, assigned_to, created_by, due_at, resolved_by, resolved_at, metadata, created_at, updated_at";

export type PlanRow = {
  id: string; title: string; description: string | null; status: string; priority: string | null;
  due_at: string | null; assigned_to: string | null; created_by: string | null; created_at: string; updated_at: string;
  resolved_by: string | null; resolved_at: string | null; metadata: Record<string, unknown> | null;
};

export function toPlanItem(r: PlanRow, names: Map<string, string>): PlanItem {
  return {
    id: r.id, title: r.title, note: r.description, status: r.status, priority: asPriority(r.priority),
    due_at: r.due_at, assigned_to: r.assigned_to, assigned_name: r.assigned_to ? names.get(r.assigned_to) ?? null : null,
    created_by: r.created_by, created_at: r.created_at, updated_at: r.updated_at,
    resolved_by: r.resolved_by, resolved_at: r.resolved_at,
    links: linksOf(r.metadata), plan: normalizePlanMeta(r.metadata?.plan),
  };
}

export const planLink = (id: string) => `/tasks/plan?item=${encodeURIComponent(id)}`;

export async function notifyPlanAssignee(admin: Admin, item: { id: string; title: string; assigned_to: string | null; due_label?: string }, actor: { id: string | null; name: string | null }) {
  if (!isUuid(item.assigned_to) || item.assigned_to === actor.id) return;
  try {
    await admin.rpc("erp_notify", {
      p_user_ids: [item.assigned_to], p_event_type: "team_plan.assigned",
      p_title: `มีงานในแผนงานรอคุณ: ${item.title}`.slice(0, 200),
      p_body: `${item.due_label ? `กำหนด ${item.due_label} · ` : ""}มอบโดย ${actor.name || "ผู้ใช้"}`,
      p_link_url: planLink(item.id), p_entity_type: "team_plan", p_entity_id: item.id, p_priority: "normal",
    });
  } catch (e) { console.error("[team-plan] notify assignee", e); }   // แจ้งไม่ได้ ไม่ทำให้บันทึกพลาด
}
