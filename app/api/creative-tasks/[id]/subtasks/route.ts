/**
 * Creative Task — งานย่อย (subtasks) — รองรับ รายละเอียด + ผู้รับผิดชอบหลายคน (m2m)
 * GET    /api/creative-tasks/[id]/subtasks
 * POST   /api/creative-tasks/[id]/subtasks   body = { title, description?, assignee_ids?: string[], due_date?, required_before_next? }
 * PATCH  /api/creative-tasks/[id]/subtasks   body = { subtask_id, ...fields, assignee_ids? }
 * DELETE /api/creative-tasks/[id]/subtasks?subtask_id=...
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";
import { subtaskAssigneesMap, setSubtaskAssignees } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EDITABLE = new Set(["title", "description", "assignee_id", "status", "due_date", "required_before_next", "sort_order"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_subtasks").select("*").eq("task_id", id).order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  const rows = (data ?? []) as Record<string, unknown>[];
  const aMap = await subtaskAssigneesMap(admin, rows.map((r) => String(r.id)));
  return NextResponse.json({ data: rows.map((r) => ({ ...r, assignees: aMap.get(String(r.id)) ?? [] })), error: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "กรุณาใส่ชื่องานย่อย" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: maxRow } = await admin.from("erp_creative_subtasks").select("sort_order").eq("task_id", id).order("sort_order", { ascending: false }).limit(1);
  const sort = ((maxRow?.[0]?.sort_order as number) ?? -1) + 1;
  const ids = Array.isArray(body.assignee_ids) ? (body.assignee_ids as string[]) : [];
  const { data: row, error } = await admin.from("erp_creative_subtasks").insert({
    task_id: id, title, description: (body.description as string)?.trim() || null, assignee_id: ids[0] || (body.assignee_id as string) || null,
    due_date: (body.due_date as string) || null, required_before_next: !!body.required_before_next, sort_order: sort,
  }).select("*").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  if (ids.length) await setSubtaskAssignees(admin, row.id, ids);
  await writeAudit(admin, { action: "subtask:create", entityType: "creative_task", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { title } });
  const aMap = await subtaskAssigneesMap(admin, [row.id]);
  return NextResponse.json({ data: { ...row, assignees: aMap.get(String(row.id)) ?? [] }, error: null });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const subtaskId = String(body.subtask_id ?? "");
  if (!subtaskId) return NextResponse.json({ error: "subtask_id required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) if (EDITABLE.has(k)) patch[k] = v === "" ? null : v;

  const admin = supabaseAdmin();
  if (Array.isArray(body.assignee_ids)) {
    await setSubtaskAssignees(admin, subtaskId, body.assignee_ids as string[]);
    patch.assignee_id = (body.assignee_ids as string[])[0] || null; // sync legacy single field
  }
  let row: Record<string, unknown> | null = null;
  if (Object.keys(patch).length > 1) {
    const { data, error } = await admin.from("erp_creative_subtasks").update(patch).eq("id", subtaskId).eq("task_id", id).select("*").single();
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
    row = data as Record<string, unknown>;
  } else {
    const { data } = await admin.from("erp_creative_subtasks").select("*").eq("id", subtaskId).maybeSingle();
    row = data as Record<string, unknown> | null;
  }
  await writeAudit(admin, { action: "subtask:update", entityType: "creative_task", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { subtask_id: subtaskId } });
  const aMap = await subtaskAssigneesMap(admin, [subtaskId]);
  return NextResponse.json({ data: row ? { ...row, assignees: aMap.get(subtaskId) ?? [] } : null, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const subtaskId = new URL(request.url).searchParams.get("subtask_id") ?? "";
  if (!subtaskId) return NextResponse.json({ error: "subtask_id required" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_creative_subtasks").delete().eq("id", subtaskId).eq("task_id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  return NextResponse.json({ success: true, error: null });
}
