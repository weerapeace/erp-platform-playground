/**
 * 📲 ปุ่มบนแจ้งเตือนมือถือของแผนงาน — POST /api/team-plan/push-action  body { token, action }
 *   action: "snooze1h" = เตือนอีกครั้งใน 1 ชม. · "tomorrow" = เตือนพรุ่งนี้ 09:00 · "done" = ติ๊กเสร็จ (งานทำซ้ำ → สร้างรอบถัดไป)
 * เรียกจาก service worker (/notify-sw.js) ซึ่งไม่มีโทเคนล็อกอิน → ยืนยันด้วยรหัสลับในแจ้งเตือน (ผูก งาน+คน · หมดอายุ 7 วัน · signPlanAction)
 * ทำได้เฉพาะงานที่รหัสผูกไว้ และคนนั้นยังเป็นผู้รับผิดชอบ/คนสร้าง · มีประวัติ audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { addDaysYmd, todayBangkok } from "@/lib/date";
import { userNames } from "@/lib/record-tasks-server";
import { normalizePlanMeta, normalizePlanSent, TEAM_PLAN_MODULE } from "@/lib/team-plan";
import { createNextRepeat, PLAN_COLS, verifyPlanAction, type PlanRow } from "@/lib/team-plan-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACTIONS = ["snooze1h", "tomorrow", "done"] as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { token?: string; action?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const action = String(body.action ?? "");
  if (!(ACTIONS as readonly string[]).includes(action)) return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  const who = verifyPlanAction(String(body.token ?? ""));
  if (!who) return NextResponse.json({ error: "ลิงก์หมดอายุหรือไม่ถูกต้อง — เปิดแอปแล้วทำในหน้าแผนงานแทน" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data } = await admin.from("erp_record_tasks").select(PLAN_COLS).eq("id", who.itemId).eq("module_key", TEAM_PLAN_MODULE).maybeSingle();
  const row = data as PlanRow | null;
  if (!row) return NextResponse.json({ error: "ไม่พบงานนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const plan = normalizePlanMeta(row.metadata?.plan);
  if ((row.assigned_to ?? plan.created_by_id) !== who.userId) return NextResponse.json({ error: "งานนี้ไม่ได้อยู่กับคุณแล้ว" }, { status: 403 });
  if (row.status === "resolved") return NextResponse.json({ ok: true, already: true, error: null });

  const actorName = (await userNames(admin, [who.userId])).get(who.userId) ?? "ผู้ใช้";
  const now = new Date();
  if (action === "done") {
    const { data: upd, error } = await admin.from("erp_record_tasks")
      .update({ status: "resolved", resolved_at: now.toISOString(), resolved_by: actorName }).eq("id", row.id).select(PLAN_COLS).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeAudit(admin, { action: "update", entityType: "record_task", entityId: row.id, actorId: who.userId, actorName: `${actorName} (มือถือ)`,
      metadata: { module_key: TEAM_PLAN_MODULE, title: row.title, status: "resolved", via: "push" } });
    const next = await createNextRepeat(admin, upd as PlanRow, { id: who.userId, name: actorName }, now);
    return NextResponse.json({ ok: true, done: true, next_due: next?.due_at ?? null, error: null });
  }

  // เลื่อนเตือน — ตัวตั้งเวลาเตือนอีกครั้งเมื่อถึงเวลา (plan_sent.snooze_until)
  const until = action === "snooze1h" ? new Date(now.getTime() + 3600e3) : new Date(`${addDaysYmd(todayBangkok(now), 1)}T09:00:00+07:00`);
  const sent = { ...normalizePlanSent(row.metadata?.plan_sent), snooze_until: until.toISOString(), snooze_sent: null };
  const { error } = await admin.from("erp_record_tasks").update({ metadata: { ...(row.metadata ?? {}), plan_sent: sent } }).eq("id", row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(admin, { action: "update", entityType: "record_task", entityId: row.id, actorId: who.userId, actorName: `${actorName} (มือถือ)`,
    metadata: { module_key: TEAM_PLAN_MODULE, title: row.title, snooze_until: sent.snooze_until, via: "push" } });
  return NextResponse.json({ ok: true, snooze_until: sent.snooze_until, error: null });
}
