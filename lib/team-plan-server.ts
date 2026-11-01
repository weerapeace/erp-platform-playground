/**
 * แผนงานทีม — ฝั่งเซิร์ฟเวอร์ (API /api/team-plan + ตัวตั้งเวลาแจ้งเตือน)
 *   toPlanItem         = แถว erp_record_tasks → ที่ส่งให้หน้าเว็บ (metadata ไม่ส่งทั้งก้อน: แยกเป็น plan + links)
 *   notifyPlanAssignee = กระดิ่งบอกคนที่ถูกมอบงาน (ไม่เด้งถ้ามอบให้ตัวเอง) · เปิดแล้วไปที่งานนั้นในหน้าแผนงาน
 *   createNextRepeat   = งานทำซ้ำติ๊กเสร็จ → สร้างรอบถัดไป
 *   signPlanAction / verifyPlanAction = รหัสลับของปุ่มบนแจ้งเตือนมือถือ (อีก 1 ชม. / พรุ่งนี้เช้า / เสร็จแล้ว)
 *   runTeamPlanReminders = รอบแจ้งเตือนทุก 15 นาที (ก่อนกำหนด · เลยกำหนด+เลื่อนเป็นด่วน · รอคนอื่น · เลื่อนเตือน · สรุปเช้า)
 * กฎ pure อยู่ที่ lib/team-plan · doc: docs/team-plan.md
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { todayBangkok } from "@/lib/date";
import { linksOf } from "@/lib/record-tasks";
import { isUuid } from "@/lib/record-tasks-server";
import {
  asPriority, isSummaryWindow, nextDue, normalizePlanMeta, normalizePlanSent, planMorningSummary, planReminders, TEAM_PLAN_MODULE,
  type PlanItem, type ReminderNote,
} from "@/lib/team-plan";

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

// ── งานทำซ้ำ: สร้างรอบถัดไป (ใช้ทั้งติ๊กเสร็จในหน้าเว็บ และปุ่ม "เสร็จแล้ว" บนแจ้งเตือนมือถือ) ──
export async function createNextRepeat(admin: Admin, row: PlanRow, actor: { id: string | null; name: string }, now: Date = new Date()): Promise<PlanRow | null> {
  const plan = normalizePlanMeta(row.metadata?.plan, now);
  if (!plan.repeat) return null;
  const meta = { ...(row.metadata ?? {}) };
  delete meta.plan_sent;   // รอบใหม่ = ยังไม่เคยเตือน
  const { data } = await admin.from("erp_record_tasks").insert({
    module_key: TEAM_PLAN_MODULE, record_id: "", record_type: "",
    title: row.title, description: row.description, status: "open", priority: row.priority,
    assigned_to: row.assigned_to, due_at: nextDue(row.due_at, plan.repeat, now), created_by: actor.name,
    metadata: { ...meta, plan: { ...plan, star_date: null, waiting: null } },
  }).select(PLAN_COLS).single();
  const next = (data as PlanRow | null) ?? null;
  if (next) await writeAudit(admin, { action: "create", entityType: "record_task", entityId: next.id, actorId: actor.id, actorName: actor.name,
    metadata: { module_key: TEAM_PLAN_MODULE, title: next.title, due_at: next.due_at, repeat_from: row.id } });
  return next;
}

// ── ปุ่มบนแจ้งเตือนมือถือ — รหัสลับผูก งาน+คน+วันหมดอายุ (service worker ไม่มีโทเคนล็อกอิน) ──
const ACTION_TTL_SEC = 7 * 86400;
function actionKey(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("missing server key");
  return `team-plan-action:${k}`;
}
const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export function signPlanAction(itemId: string, userId: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const body = b64url(Buffer.from(`${itemId}.${userId}.${nowSec + ACTION_TTL_SEC}`));
  return `${body}.${b64url(createHmac("sha256", actionKey()).update(body).digest())}`;
}
export function verifyPlanAction(token: string, nowSec = Math.floor(Date.now() / 1000)): { itemId: string; userId: string } | null {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig) return null;
  const want = b64url(createHmac("sha256", actionKey()).update(body).digest());
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [itemId, userId, exp] = Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8").split(".");
  if (!isUuid(itemId) || !isUuid(userId) || !(Number(exp) > nowSec)) return null;
  return { itemId, userId };
}

// ── รอบแจ้งเตือน (เรียกจาก /api/cron/email-reports ทุก 15 นาที) ──
const NOTE_EVENT: Record<ReminderNote["kind"], string> = { snooze: "team_plan.snooze", before: "team_plan.remind", overdue: "team_plan.overdue", waiting: "team_plan.waiting" };
export type PlanRemindStats = { items: number; notes: number; escalated: number; summaries: number; errors: number };

export async function runTeamPlanReminders(admin: Admin, now: Date = new Date()): Promise<PlanRemindStats> {
  const stats: PlanRemindStats = { items: 0, notes: 0, escalated: 0, summaries: 0, errors: 0 };
  const { data, error } = await admin.from("erp_record_tasks").select(PLAN_COLS)
    .eq("module_key", TEAM_PLAN_MODULE).eq("record_id", "").neq("status", "resolved").limit(5000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PlanRow[];
  stats.items = rows.length;
  const items = rows.map((r) => ({
    id: r.id, title: r.title, status: r.status, priority: asPriority(r.priority), due_at: r.due_at, assigned_to: r.assigned_to,
    plan: normalizePlanMeta(r.metadata?.plan, now), sent: normalizePlanSent(r.metadata?.plan_sent),
  }));

  const { notes, patches } = planReminders(items, now);
  const saved = new Set<string>();
  for (const p of patches) {
    const row = rows.find((r) => r.id === p.id)!;
    const { error: e } = await admin.from("erp_record_tasks")
      .update({ metadata: { ...(row.metadata ?? {}), plan_sent: p.sent }, ...(p.priority ? { priority: p.priority } : {}) }).eq("id", p.id);
    if (e) { stats.errors++; continue; }
    saved.add(p.id);
    if (p.priority) {
      stats.escalated++;
      await writeAudit(admin, { action: "update", entityType: "record_task", entityId: p.id, actorId: null, actorName: "ระบบ (แผนงาน)",
        metadata: { module_key: TEAM_PLAN_MODULE, title: row.title, priority: p.priority, priority_before: row.priority, reason: "เลยกำหนด → เลื่อนเป็นด่วนอัตโนมัติ" } });
    }
  }
  for (const n of notes) {
    if (!saved.has(n.item_id)) continue;   // บันทึกกันซ้ำไม่ได้ = ไม่ส่ง (รอบหน้าลองใหม่)
    const { error: e } = await admin.rpc("erp_notify", {
      p_user_ids: [n.user_id], p_event_type: NOTE_EVENT[n.kind], p_title: n.title.slice(0, 200), p_body: n.body,
      p_link_url: planLink(n.item_id), p_entity_type: "team_plan", p_entity_id: n.item_id, p_priority: n.high ? "high" : "normal",
    });
    if (e) stats.errors++; else stats.notes++;
  }

  // สรุปเช้า 9:00 (ส่งได้ถึง 11:59 · วันละครั้งต่อคน)
  if (isSummaryWindow(now)) {
    const users = [...new Set(items.map((t) => t.assigned_to ?? t.plan.created_by_id).filter(isUuid))];
    if (users.length) {
      const midnight = new Date(`${todayBangkok(now)}T00:00:00+07:00`).toISOString();
      const { data: done } = await admin.from("erp_notifications").select("user_id")
        .eq("event_type", "team_plan.summary").gte("created_at", midnight).in("user_id", users);
      const already = new Set(((done ?? []) as { user_id: string }[]).map((d) => d.user_id));
      for (const u of users.filter((x) => !already.has(x))) {
        const s = planMorningSummary(items, u, now);
        if (!s) continue;
        const { error: e } = await admin.rpc("erp_notify", {
          p_user_ids: [u], p_event_type: "team_plan.summary", p_title: s.title, p_body: s.body,
          p_link_url: "/tasks/plan", p_entity_type: "team_plan", p_entity_id: null, p_priority: "normal",
        });
        if (e) stats.errors++; else stats.summaries++;
      }
    }
  }
  return stats;
}
