/**
 * Creative Task — คอมเมนต์ + @mention
 * GET  /api/creative-tasks/[id]/comments
 * POST /api/creative-tasks/[id]/comments   body = { body, mentions?: string[] (employee ids) }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";
import { notify, employeeAuthId } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_comments").select("*").eq("task_id", id).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { body?: string; mentions?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const text = (body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "พิมพ์ข้อความก่อนส่ง" }, { status: 400 });
  const mentions = Array.isArray(body.mentions) ? body.mentions.filter(Boolean) : [];

  const admin = supabaseAdmin();
  const { data: row, error } = await admin.from("erp_creative_comments").insert({
    task_id: id, author_id: user?.id ?? null, author_name: user?.email ?? null, body: text, mentions,
  }).select("*").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, { action: "comment", entityType: "creative_task", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });

  // แจ้งเตือนผู้ถูก @mention (employee id → auth id)
  const { data: t } = await admin.from("erp_creative_tasks").select("title, task_no").eq("id", id).maybeSingle();
  for (const empId of mentions.slice(0, 20)) {
    const authId = await employeeAuthId(admin, empId);
    if (authId && authId !== user?.id) {
      await notify(admin, { userId: authId, eventType: "task_mention", title: `ถูกพูดถึงในงาน: ${t?.title ?? ""}`, body: text.slice(0, 120), entityId: id });
    }
  }
  return NextResponse.json({ data: row, error: null });
}
