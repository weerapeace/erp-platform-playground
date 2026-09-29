/**
 * Creative Task — คอมเมนต์ + @mention
 * GET  /api/creative-tasks/[id]/comments
 * POST /api/creative-tasks/[id]/comments   body = { body, mentions?: string[] (employee ids) }
 * PATCH  { comment_id, body }   → แก้คอมเมนต์ "ของตัวเอง" (พิมพ์ผิด)
 * DELETE ?comment_id=           → ลบคอมเมนต์ของตัวเอง · แอดมิน/ผู้จัดการลบของคนอื่นได้ (ข้อความเดิมเก็บในประวัติ)
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
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;   // เขียนคอมเมนต์ = สิทธิ์แก้ไข (ไม่ใช่แค่ดู)
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

/** ผู้ใช้ปัจจุบัน + เป็นแอดมิน/ผู้จัดการไหม */
async function whoAmI(request: NextRequest): Promise<{ id: string | null; email: string | null; isManager: boolean }> {
  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { id: null, email: null, isManager: false };
  const { data } = await client.rpc("erp_current_user");
  const p = data as { role?: string | null; active?: boolean | null } | null;
  const role = String(p?.role ?? "");
  return { id: user.id, email: user.email ?? null, isManager: p?.active !== false && (role === "admin" || role === "manager") };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  let body: { comment_id?: string; body?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const commentId = String(body.comment_id ?? "").trim();
  const text = (body.body ?? "").trim();
  if (!commentId) return NextResponse.json({ error: "ต้องระบุคอมเมนต์" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "ข้อความห้ามว่าง — ถ้าไม่ต้องการแล้วให้กดลบ" }, { status: 400 });

  const me = await whoAmI(request);
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("erp_creative_comments").select("id, task_id, author_id, body").eq("id", commentId).eq("task_id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบคอมเมนต์นี้" }, { status: 404 });
  const c = cur as { author_id: string | null; body: string };
  if (!me.id || c.author_id !== me.id) return NextResponse.json({ error: "แก้ได้เฉพาะคอมเมนต์ของตัวเอง" }, { status: 403 });
  if (c.body === text) return NextResponse.json({ data: cur, error: null });

  const { data: row, error } = await admin.from("erp_creative_comments").update({ body: text }).eq("id", commentId).select("*").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "comment_edit", entityType: "creative_task", entityId: id, actorId: me.id, actorName: me.email, metadata: { comment_id: commentId, old: c.body, new: text } });
  return NextResponse.json({ data: row, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const commentId = (new URL(request.url).searchParams.get("comment_id") ?? "").trim();
  if (!commentId) return NextResponse.json({ error: "ต้องระบุคอมเมนต์" }, { status: 400 });

  const me = await whoAmI(request);
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("erp_creative_comments").select("id, task_id, author_id, author_name, body, created_at").eq("id", commentId).eq("task_id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบคอมเมนต์นี้" }, { status: 404 });
  const c = cur as { author_id: string | null };
  if (!me.id || (c.author_id !== me.id && !me.isManager)) return NextResponse.json({ error: "ลบได้เฉพาะคอมเมนต์ของตัวเอง (แอดมิน/ผู้จัดการลบของคนอื่นได้)" }, { status: 403 });

  const { error } = await admin.from("erp_creative_comments").delete().eq("id", commentId);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "comment_delete", entityType: "creative_task", entityId: id, actorId: me.id, actorName: me.email, metadata: { comment_id: commentId, snapshot: cur } });
  return NextResponse.json({ success: true, error: null });
}
