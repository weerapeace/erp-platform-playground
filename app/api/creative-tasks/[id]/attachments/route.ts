/**
 * Creative Task — ไฟล์/ลิงก์แนบ
 * GET    /api/creative-tasks/[id]/attachments
 * POST   /api/creative-tasks/[id]/attachments   body = { kind?: 'drive_link'|'url'|'file', label?, url?, r2_key?, file_name?, content_type?, size_bytes? }
 * DELETE /api/creative-tasks/[id]/attachments?attachment_id=...
 *
 * หมายเหตุ: การอัปโหลดไฟล์จริงใช้ระบบ R2 กลาง (/api/admin/upload) แล้วส่ง r2_key/url มาเก็บที่นี่
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_attachments").select("*").eq("task_id", id).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const kind = String(body.kind ?? "drive_link");
  const url = String(body.url ?? "").trim();
  const r2Key = String(body.r2_key ?? "").trim();
  if (!url && !r2Key) return NextResponse.json({ error: "ต้องมีลิงก์หรือไฟล์" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: row, error } = await admin.from("erp_creative_attachments").insert({
    task_id: id, subtask_id: (body.subtask_id as string) || null, kind, label: (body.label as string)?.trim() || null,
    url: url || null, r2_key: r2Key || null,
    file_name: (body.file_name as string) || null, content_type: (body.content_type as string) || null,
    size_bytes: typeof body.size_bytes === "number" ? body.size_bytes : null, uploaded_by: user?.id ?? null,
  }).select("*").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "attachment:add", entityType: "creative_task", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { kind, label: body.label } });
  return NextResponse.json({ data: row, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const attId = new URL(request.url).searchParams.get("attachment_id") ?? "";
  if (!attId) return NextResponse.json({ error: "attachment_id required" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_creative_attachments").delete().eq("id", attId).eq("task_id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "attachment:remove", entityType: "creative_task", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { attachment_id: attId } });
  return NextResponse.json({ success: true, error: null });
}
