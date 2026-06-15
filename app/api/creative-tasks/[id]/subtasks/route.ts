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
import { subtaskAssigneesMap, setSubtaskAssignees, notify } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EDITABLE = new Set(["title", "description", "assignee_id", "status", "due_date", "required_before_next", "sort_order"]);

// อ่าน role ของผู้ใช้ปัจจุบัน (admin/manager/...) — ใช้คุมสิทธิ์ละเอียดของงานย่อย
async function currentRole(request: NextRequest): Promise<string> {
  try { const { data } = await supabaseFromRequest(request).rpc("erp_current_user"); return ((data as { role?: string | null } | null)?.role) ?? "viewer"; }
  catch { return "viewer"; }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_subtasks").select("*").eq("task_id", id).order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  const rows = (data ?? []) as Record<string, unknown>[];
  const subIds = rows.map((r) => String(r.id));
  const aMap = await subtaskAssigneesMap(admin, subIds);
  // ไฟล์/รูปแนบของแต่ละงานย่อย
  const attBy = new Map<string, Record<string, unknown>[]>();
  if (subIds.length) {
    const { data: atts } = await admin.from("erp_creative_attachments").select("*").in("subtask_id", subIds).order("created_at", { ascending: true });
    for (const a of (atts ?? []) as Record<string, unknown>[]) { const k = String(a.subtask_id); const arr = attBy.get(k) ?? []; arr.push(a); attBy.set(k, arr); }
  }
  return NextResponse.json({ data: rows.map((r) => ({ ...r, assignees: aMap.get(String(r.id)) ?? [], attachments: attBy.get(String(r.id)) ?? [] })), error: null });
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

  const admin = supabaseAdmin();
  // งานแม่ (ผู้สร้าง + ผู้ตรวจ) + role ผู้ใช้ — ใช้คุมสิทธิ์ละเอียด
  const [{ data: parent }, role] = await Promise.all([
    admin.from("erp_creative_tasks").select("created_by, reviewer_id, task_no, title").eq("id", id).maybeSingle(),
    currentRole(request),
  ]);
  const isManager = role === "admin" || role === "manager";
  const isCreator = !!user?.id && user.id === (parent?.created_by as string | null);
  const isReviewer = !!user?.id && user.id === (parent?.reviewer_id as string | null);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) if (EDITABLE.has(k)) patch[k] = v === "" ? null : v;

  // ⑤ แก้ "ผู้รับผิดชอบ" ได้เฉพาะ admin/ผจก./คนสร้างงานแม่
  if (Array.isArray(body.assignee_ids) && !(isManager || isCreator))
    return NextResponse.json({ error: "คุณไม่มีสิทธิ์เปลี่ยนผู้รับผิดชอบงานย่อย" }, { status: 403 });
  // ④ อนุมัติ (status → approved) ได้เฉพาะ admin/ผจก./ผู้ตรวจของงาน
  if (patch.status === "approved" && !(isManager || isReviewer))
    return NextResponse.json({ error: "คุณไม่มีสิทธิ์อนุมัติงานย่อยนี้" }, { status: 403 });

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

  // ④ ส่งงาน (status → submitted) → แจ้งเตือน ผู้ตรวจ + admin/ผจก. ให้มากดอนุมัติ
  if (patch.status === "submitted") {
    try {
      const { data: mgrs } = await admin.from("user_profiles").select("id").in("role", ["admin", "manager"]);
      const recipients = new Set<string>([...((mgrs ?? []) as { id: string }[]).map((m) => m.id)]);
      if (parent?.reviewer_id) recipients.add(String(parent.reviewer_id));
      recipients.delete(String(user?.id ?? "")); // ไม่ต้องเตือนตัวเอง
      const subTitle = String(row?.title ?? "งานย่อย");
      const taskLabel = `${parent?.task_no ? parent.task_no + " " : ""}${parent?.title ?? ""}`.trim();
      await Promise.all([...recipients].map((uid) => notify(admin, {
        userId: uid, eventType: "subtask_submitted", priority: "high",
        title: `รออนุมัติงานย่อย: ${subTitle}`, body: taskLabel || null,
        linkUrl: `/tasks?task=${id}`, entityId: id,
      })));
    } catch { /* แจ้งเตือนล้มเหลวไม่ทำให้บันทึกพัง */ }
  }

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
