/**
 * GET /api/creative-tasks/my-subtasks — งานย่อยที่มอบหมายให้ฉัน (ยังไม่เสร็จ + งานแม่ยัง active)
 * รวมจาก junction m2m (erp_creative_subtask_assignees.user_id) + legacy single (subtasks.assignee_id)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const me = user?.id ?? null;
  if (!me) return NextResponse.json({ data: [], error: null });

  const admin = supabaseAdmin();
  const [{ data: links }, { data: legacy }] = await Promise.all([
    admin.from("erp_creative_subtask_assignees").select("subtask_id").eq("user_id", me),
    admin.from("erp_creative_subtasks").select("id").eq("assignee_id", me),
  ]);
  const ids = [...new Set([
    ...((links ?? []) as { subtask_id: string }[]).map((r) => r.subtask_id),
    ...((legacy ?? []) as { id: string }[]).map((r) => r.id),
  ])];
  if (!ids.length) return NextResponse.json({ data: [], error: null });

  const { data, error } = await admin.from("erp_creative_subtasks")
    .select("id, title, status, due_date, required_before_next, task_id, task:erp_creative_tasks!task_id(task_no, title, status, is_active)")
    .in("id", ids)
    .not("status", "in", "(done,posted,approved)")
    .order("due_date", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });

  const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const t = (Array.isArray(r.task) ? r.task[0] : r.task) as Record<string, unknown> | null;
    return {
      id: r.id, title: r.title, status: r.status, due_date: r.due_date, required_before_next: r.required_before_next,
      task_id: r.task_id, task_no: t?.task_no ?? null, task_title: t?.title ?? null, task_status: t?.status ?? null,
      task_active: t?.is_active ?? true,
    };
  }).filter((r) => r.task_active);

  return NextResponse.json({ data: rows, error: null });
}
