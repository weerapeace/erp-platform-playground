/**
 * Creative Campaign — รายตัว (detail พร้อมงานในแคมเปญ / update / soft-delete)
 *
 * GET    /api/creative-campaigns/[id]   → แคมเปญ + งานทั้งหมดในแคมเปญ + สรุปสถานะ
 * PATCH  /api/creative-campaigns/[id]   → แก้ฟิลด์
 * DELETE /api/creative-campaigns/[id]   → soft delete
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { SELECT, flattenTask } from "../../creative-tasks/route";
import { employeeLabelMap } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EDITABLE = new Set(["name", "brand_id", "objective", "status", "start_date", "end_date", "owner_id", "note"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data: camp, error } = await admin.from("erp_creative_campaigns")
    .select("*, brand:brands!brand_id(name, color)").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 500 });
  if (!camp) return NextResponse.json({ error: "ไม่พบแคมเปญ" }, { status: 404 });

  const { data: taskRows } = await admin.from("erp_creative_tasks").select(SELECT)
    .eq("campaign_id", id).eq("is_active", true).order("updated_at", { ascending: false });
  const rows = (taskRows ?? []) as Record<string, unknown>[];
  const empMap = await employeeLabelMap(admin, rows.flatMap((r) => [r.assignee_id as string, r.reviewer_id as string, r.approver_id as string]));
  const tasks = rows.map((r) => flattenTask(r, empMap));

  const summary: Record<string, number> = {};
  for (const t of tasks) summary[t.status as string] = (summary[t.status as string] ?? 0) + 1;

  const c = camp as Record<string, unknown>;
  const b = (Array.isArray(c.brand) ? c.brand[0] : c.brand) as { name?: string; color?: string | null } | null;
  const ownerMap = await employeeLabelMap(admin, [c.owner_id as string]);
  const campaign = {
    id: String(c.id), name: String(c.name), brand_id: (c.brand_id as string) ?? null,
    brand_label: b?.name ?? null, brand_color: b?.color ?? null,
    objective: (c.objective as string) ?? null, status: String(c.status ?? "active"),
    start_date: (c.start_date as string) ?? null, end_date: (c.end_date as string) ?? null,
    owner_id: (c.owner_id as string) ?? null, owner_label: ownerMap.get(String(c.owner_id)) ?? null,
    note: (c.note as string) ?? null, is_active: !!c.is_active,
  };
  return NextResponse.json({ data: { campaign, tasks, summary, task_count: tasks.length }, error: null });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) if (EDITABLE.has(k)) patch[k] = v === "" ? null : v;
  if (Object.keys(patch).length === 1) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้ไข" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_campaigns").update(patch).eq("id", id).select("id, name").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "creative_campaign", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { changes: Object.keys(patch).filter((k) => k !== "updated_at") } });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.delete"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_creative_campaigns").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "creative_campaign", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ success: true, error: null });
}
