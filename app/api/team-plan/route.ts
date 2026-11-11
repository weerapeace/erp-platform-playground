/**
 * 📋 แผนงานทีม (Todo ตามความด่วน) — /api/team-plan
 *
 * GET  → { data: PlanItem[] } งานที่ยังไม่เสร็จทั้งหมด + งานที่เสร็จใน 7 วันล่าสุด (ทั้งทีม · หน้าเว็บกรอง "ของฉัน" เอง)
 *      ?mine=1 = เฉพาะงานของฉัน (แท็บแผนงานในศูนย์แจ้งเตือน)
 * POST body { title, note?, priority?, due_at?, assigned_to?, important?, remind?, repeat?, waiting_note?, source?, links? } → สร้าง 1 งาน
 *      มอบให้คนอื่น → กระดิ่งเด้งบอกคนนั้น (+ มือถือ ถ้าเปิดรับ)
 *
 * เก็บที่ erp_record_tasks module_key "team_plan" record_id "" (ตารางเช็กลิสต์กลาง) · ข้อมูลเสริมใน metadata.plan (lib/team-plan)
 * สิทธิ์: ดู tasks.view · เพิ่ม tasks.create · ประวัติ audit_logs (entity record_task)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { isUuid, userNames } from "@/lib/record-tasks-server";
import { normalizeTaskLinks } from "@/lib/record-tasks";
import { asPriority, dueLabel, normalizePlanMeta, TEAM_PLAN_MODULE } from "@/lib/team-plan";
import { notifyPlanAssignee, PLAN_COLS, toPlanItem, type PlanRow } from "@/lib/team-plan-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  // ?mine=1 = เฉพาะงานของฉัน (ผู้รับผิดชอบคือฉัน หรือไม่มีผู้รับผิดชอบแต่ฉันสร้าง) — แท็บแผนงานในศูนย์แจ้งเตือนใช้
  const mine = new URL(request.url).searchParams.get("mine") === "1";
  const me = mine ? (await supabaseFromRequest(request).auth.getUser()).data.user?.id ?? null : null;
  if (mine && !me) return NextResponse.json({ data: [], error: null });
  const admin = supabaseAdmin();
  const since = new Date(Date.now() - 7 * 86400e3).toISOString();
  const { data, error } = await admin.from("erp_record_tasks").select(PLAN_COLS)
    .eq("module_key", TEAM_PLAN_MODULE).eq("record_id", "")
    .or(`status.neq.resolved,resolved_at.gte.${since}`)
    .order("created_at", { ascending: true }).limit(2000);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const all = (data ?? []) as PlanRow[];
  const rows = me ? all.filter((r) => (r.assigned_to ?? normalizePlanMeta(r.metadata?.plan).created_by_id) === me) : all;
  const names = await userNames(admin, rows.map((r) => r.assigned_to));
  return NextResponse.json({ data: rows.map((r) => toPlanItem(r, names)), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.create"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const title = String(body.title ?? "").trim().slice(0, 300);
  if (!title) return NextResponse.json({ error: "พิมพ์ชื่องานก่อน" }, { status: 400 });
  const assigned = body.assigned_to == null || body.assigned_to === "" ? null : body.assigned_to;
  if (assigned !== null && !isUuid(assigned)) return NextResponse.json({ error: "ผู้รับผิดชอบไม่ถูกต้อง" }, { status: 400 });
  const due = body.due_at == null || body.due_at === "" ? null : String(body.due_at);
  if (due !== null && Number.isNaN(Date.parse(due))) return NextResponse.json({ error: "กำหนดไม่ถูกต้อง" }, { status: 400 });

  const admin = supabaseAdmin();
  const actorName = (await userNames(admin, [user.id])).get(user.id) ?? user.email ?? "ผู้ใช้";
  const plan = normalizePlanMeta({
    important: body.important, remind: body.remind, repeat: body.repeat, source: body.source,
    waiting: typeof body.waiting_note === "string" && body.waiting_note.trim() ? { note: body.waiting_note } : null,
    created_by_id: user.id,
  });
  const links = normalizeTaskLinks(body.links);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 4000) || null : null;

  const { data, error } = await admin.from("erp_record_tasks").insert({
    module_key: TEAM_PLAN_MODULE, record_id: "", record_type: "",
    title, description: note, status: "open", priority: asPriority(body.priority),
    assigned_to: assigned, due_at: due ? new Date(due).toISOString() : null, created_by: actorName,
    metadata: { plan, ...(links.length ? { links } : {}) },
  }).select(PLAN_COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = data as PlanRow;
  await writeAudit(admin, { action: "create", entityType: "record_task", entityId: row.id, actorId: user.id, actorName,
    metadata: { module_key: TEAM_PLAN_MODULE, title, priority: row.priority, due_at: row.due_at, assigned_to: row.assigned_to, plan } });
  await notifyPlanAssignee(admin, { id: row.id, title, assigned_to: row.assigned_to, due_label: dueLabel(row.due_at) }, { id: user.id, name: actorName });
  const names = await userNames(admin, [row.assigned_to]);
  return NextResponse.json({ data: toPlanItem(row, names), error: null });
}
