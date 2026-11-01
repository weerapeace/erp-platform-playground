/**
 * 📋 แผนงานทีม — แก้/ลบ 1 งาน
 * PATCH /api/team-plan/[id] body (ส่งเฉพาะที่เปลี่ยน):
 *   { title?, note?, priority?, due_at? (null = ไม่กำหนด), assigned_to? (null = ไม่ระบุ), status? ("open"|"resolved"),
 *     important?, star? (true = ⭐ งานหลักวันนี้ · สูงสุด 3 ต่อคนต่อวัน), waiting? (null | { note }), repeat? (null | { every, n }), remind?, links? }
 *   ติ๊กเสร็จงานทำซ้ำ → สร้างรอบถัดไปให้ (คืน next) · มอบให้คนใหม่ → กระดิ่งบอกคนนั้น
 * DELETE /api/team-plan/[id]  — คนสร้าง หรือคนที่มีสิทธิ์ tasks.delete
 * สิทธิ์แก้ tasks.edit · ทุกครั้งเขียนประวัติ (audit_logs entity record_task)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { isUuid, userNames } from "@/lib/record-tasks-server";
import { normalizeTaskLinks } from "@/lib/record-tasks";
import { todayBangkok } from "@/lib/date";
import { asPriority, dueLabel, MAX_STARS, nextDue, normalizePlanMeta, starCountFor, TEAM_PLAN_MODULE } from "@/lib/team-plan";
import { notifyPlanAssignee, PLAN_COLS, toPlanItem, type PlanRow } from "@/lib/team-plan-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

async function loadRow(admin: ReturnType<typeof supabaseAdmin>, id: string): Promise<PlanRow | null> {
  const { data } = await admin.from("erp_record_tasks").select(PLAN_COLS).eq("id", id).eq("module_key", TEAM_PLAN_MODULE).maybeSingle();
  return (data as PlanRow | null) ?? null;
}

export async function PATCH(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const before = await loadRow(admin, id);
  if (!before) return NextResponse.json({ error: "ไม่พบงานนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const actorName = (await userNames(admin, [user.id])).get(user.id) ?? user.email ?? "ผู้ใช้";
  const now = new Date();

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const t = String(body.title ?? "").trim().slice(0, 300);
    if (!t) return NextResponse.json({ error: "ชื่องานว่างไม่ได้" }, { status: 400 });
    patch.title = t;
  }
  if (body.note !== undefined) patch.description = typeof body.note === "string" ? body.note.trim().slice(0, 4000) || null : null;
  if (body.priority !== undefined) patch.priority = asPriority(body.priority);
  if (body.due_at !== undefined) {
    const d = body.due_at == null || body.due_at === "" ? null : String(body.due_at);
    if (d !== null && Number.isNaN(Date.parse(d))) return NextResponse.json({ error: "กำหนดไม่ถูกต้อง" }, { status: 400 });
    patch.due_at = d ? new Date(d).toISOString() : null;
  }
  if (body.assigned_to !== undefined) {
    const a = body.assigned_to == null || body.assigned_to === "" ? null : body.assigned_to;
    if (a !== null && !isUuid(a)) return NextResponse.json({ error: "ผู้รับผิดชอบไม่ถูกต้อง" }, { status: 400 });
    patch.assigned_to = a;
  }
  if (body.status !== undefined) {
    const done = body.status === "resolved" || body.status === "done";
    patch.status = done ? "resolved" : "open";
    patch.resolved_at = done ? now.toISOString() : null;
    patch.resolved_by = done ? actorName : null;
  }

  // ข้อมูลเสริม (metadata.plan) — แก้เฉพาะช่องที่ส่งมา
  const meta = { ...(before.metadata ?? {}) };
  const plan = normalizePlanMeta(meta.plan, now);
  let planChanged = false;
  if (body.important !== undefined) { plan.important = body.important !== false; planChanged = true; }
  if (body.remind !== undefined) { plan.remind = normalizePlanMeta({ remind: body.remind }).remind; planChanged = true; }
  if (body.repeat !== undefined) { plan.repeat = normalizePlanMeta({ repeat: body.repeat }).repeat; planChanged = true; }
  if (body.waiting !== undefined) {
    const w = body.waiting as { note?: unknown } | null;
    plan.waiting = w ? { note: String(w.note ?? "").trim().slice(0, 120), since: plan.waiting?.since ?? now.toISOString() } : null;
    planChanged = true;
  }
  if (body.star !== undefined) {
    if (body.star) {
      // ⭐ สูงสุด 3 งานต่อคนต่อวัน (นับตามผู้รับผิดชอบ · ไม่มี = คนสร้าง)
      const owner = (patch.assigned_to as string | null | undefined) ?? before.assigned_to ?? plan.created_by_id;
      if (owner) {
        const { data: others } = await admin.from("erp_record_tasks").select("id, status, assigned_to, metadata")
          .eq("module_key", TEAM_PLAN_MODULE).eq("record_id", "").neq("status", "resolved").neq("id", id).limit(2000);
        const list = ((others ?? []) as { status: string; assigned_to: string | null; metadata: Record<string, unknown> | null }[])
          .map((o) => ({ status: o.status, assigned_to: o.assigned_to, plan: normalizePlanMeta(o.metadata?.plan, now) }));
        if (starCountFor(list, owner, now) >= MAX_STARS) {
          return NextResponse.json({ error: `งานหลักวันนี้ของคนนี้ครบ ${MAX_STARS} งานแล้ว — เอาดาวงานอื่นออกก่อน` }, { status: 409 });
        }
      }
      plan.star_date = todayBangkok(now);
    } else plan.star_date = null;
    planChanged = true;
  }
  if (planChanged) meta.plan = plan;
  if (body.links !== undefined) {
    if (!Array.isArray(body.links)) return NextResponse.json({ error: "ลิงก์ไม่ถูกต้อง" }, { status: 400 });
    meta.links = normalizeTaskLinks(body.links);
  }
  if (planChanged || body.links !== undefined) patch.metadata = meta;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีอะไรให้แก้" }, { status: 400 });

  const { data, error } = await admin.from("erp_record_tasks").update(patch).eq("id", id).select(PLAN_COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as PlanRow;

  const { metadata: _m, ...changes } = patch;
  await writeAudit(admin, { action: "update", entityType: "record_task", entityId: id, actorId: user.id, actorName,
    metadata: { module_key: TEAM_PLAN_MODULE, title: before.title, ...changes, ...(planChanged ? { plan } : {}), ...(body.links !== undefined ? { links: meta.links } : {}) } });

  if (body.assigned_to !== undefined && row.assigned_to && row.assigned_to !== before.assigned_to) {
    await notifyPlanAssignee(admin, { id, title: row.title, assigned_to: row.assigned_to, due_label: dueLabel(row.due_at, now) }, { id: user.id, name: actorName });
  }

  // งานทำซ้ำเพิ่งติ๊กเสร็จ → สร้างรอบถัดไป (ผู้รับผิดชอบ/ความด่วน/เตือนเดิม · ไม่มีดาว/รอ)
  let next: PlanRow | null = null;
  const rowPlan = normalizePlanMeta(row.metadata?.plan, now);
  if (patch.status === "resolved" && before.status !== "resolved" && rowPlan.repeat) {
    const nextPlan = { ...rowPlan, star_date: null, waiting: null };
    const { data: created } = await admin.from("erp_record_tasks").insert({
      module_key: TEAM_PLAN_MODULE, record_id: "", record_type: "",
      title: row.title, description: row.description, status: "open", priority: row.priority,
      assigned_to: row.assigned_to, due_at: nextDue(row.due_at, rowPlan.repeat, now), created_by: actorName,
      metadata: { ...(row.metadata ?? {}), plan: nextPlan },
    }).select(PLAN_COLS).single();
    next = (created as PlanRow | null) ?? null;
    if (next) await writeAudit(admin, { action: "create", entityType: "record_task", entityId: next.id, actorId: user.id, actorName,
      metadata: { module_key: TEAM_PLAN_MODULE, title: next.title, due_at: next.due_at, repeat_from: id } });
  }

  const names = await userNames(admin, [row.assigned_to, next?.assigned_to]);
  return NextResponse.json({ data: toPlanItem(row, names), next: next ? toPlanItem(next, names) : null, error: null });
}

export async function DELETE(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });

  const admin = supabaseAdmin();
  const before = await loadRow(admin, id);
  if (!before) return NextResponse.json({ ok: true, error: null });   // ลบไปแล้ว
  const creator = normalizePlanMeta(before.metadata?.plan).created_by_id;
  if (creator !== user.id && !(await apiCan(request, "tasks.delete"))) {
    return NextResponse.json({ error: "ลบได้เฉพาะคนที่สร้างงานนี้ (หรือผู้มีสิทธิ์ลบงาน)" }, { status: 403 });
  }
  const { error } = await admin.from("erp_record_tasks").delete().eq("id", id).eq("module_key", TEAM_PLAN_MODULE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(admin, { action: "delete", entityType: "record_task", entityId: id, actorId: user.id, actorName: user.email ?? "ผู้ใช้",
    metadata: { module_key: TEAM_PLAN_MODULE, title: before.title, priority: before.priority, assigned_to: before.assigned_to, due_at: before.due_at, metadata: before.metadata } });
  return NextResponse.json({ ok: true, error: null });
}
