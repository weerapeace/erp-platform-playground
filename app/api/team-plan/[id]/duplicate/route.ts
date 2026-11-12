/**
 * 📋 แผนงานทีม — ทำสำเนา 1 งาน (เจ้าของขอ 2026-11-12)
 * POST /api/team-plan/[id]/duplicate → { data: PlanItem } งานใหม่ชื่อ "… (สำเนา)"
 *   คัดลอก: โน้ต · ความด่วน · กำหนด · ผู้รับผิดชอบ · เตือน · ทำซ้ำ · สำคัญ · แท็ก · คนติดตาม · เวลาที่คาด · ลิงก์ · ที่มา
 *           + เช็กลิสต์ชุดเดิมแบบยังไม่ติ๊ก (copyPlanChecklist)
 *   ไม่คัดลอก: ดาวงานหลักวันนี้ · รอคนอื่น · ประวัติการเตือน · ไฟล์แนบ · คอมเมนต์
 * สิทธิ์ tasks.create · ประวัติ audit_logs (entity record_task · via duplicate)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { isUuid, loadChecklistSummaries, userNames } from "@/lib/record-tasks-server";
import { normalizePlanMeta, TEAM_PLAN_CHECK, TEAM_PLAN_MODULE } from "@/lib/team-plan";
import { copyPlanChecklist, PLAN_COLS, toPlanItem, type PlanRow } from "@/lib/team-plan-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.create"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });

  const admin = supabaseAdmin();
  const { data: src } = await admin.from("erp_record_tasks").select(PLAN_COLS).eq("id", id).eq("module_key", TEAM_PLAN_MODULE).maybeSingle();
  const row = src as PlanRow | null;
  if (!row) return NextResponse.json({ error: "ไม่พบงานนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });

  const actorName = (await userNames(admin, [user.id])).get(user.id) ?? user.email ?? "ผู้ใช้";
  const plan = { ...normalizePlanMeta(row.metadata?.plan), star_date: null, waiting: null, created_by_id: user.id };
  const meta: Record<string, unknown> = { ...(row.metadata ?? {}), plan };
  delete meta.plan_sent;   // งานใหม่ = ยังไม่เคยเตือน
  const title = `${row.title} (สำเนา)`.slice(0, 300);

  const { data, error } = await admin.from("erp_record_tasks").insert({
    module_key: TEAM_PLAN_MODULE, record_id: "", record_type: "",
    title, description: row.description, status: "open", priority: row.priority,
    assigned_to: row.assigned_to, due_at: row.due_at, created_by: actorName, metadata: meta,
  }).select(PLAN_COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const copy = data as PlanRow;

  const checks = await copyPlanChecklist(admin, row.id, copy.id, actorName);
  await writeAudit(admin, { action: "create", entityType: "record_task", entityId: copy.id, actorId: user.id, actorName,
    metadata: { module_key: TEAM_PLAN_MODULE, title, via: "duplicate", from_id: row.id, from_title: row.title, checklist_copied: checks } });

  const names = await userNames(admin, [copy.assigned_to]);
  const summaries = checks ? await loadChecklistSummaries(admin, TEAM_PLAN_CHECK.moduleKey, [copy.id]).catch(() => new Map()) : new Map();
  return NextResponse.json({ data: { ...toPlanItem(copy, names), checklist: summaries.get(copy.id) ?? null }, error: null });
}
