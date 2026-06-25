/**
 * Record Tasks — แก้/ลบ รายการเช็คลิสต์
 * PATCH  /api/record-tasks/[id]  body { status?, title?, actor? }   status: 'open' | 'done'
 * DELETE /api/record-tasks/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  const { id } = await params;

  let body: { status?: string; title?: string; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const actor = body.actor ?? user.email ?? "system";

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") { const t = body.title.trim(); if (!t) return NextResponse.json({ error: "ชื่อว่างไม่ได้" }, { status: 400 }); patch.title = t; }
  if (typeof body.status === "string") {
    const st = body.status === "done" ? "done" : "open";
    patch.status = st;
    patch.resolved_at = st === "done" ? new Date().toISOString() : null;
    patch.resolved_by = st === "done" ? actor : null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีอะไรให้แก้" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_record_tasks").update(patch).eq("id", id).select("id, status, title").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(admin, { action: "update", entityType: "record_task", entityId: id, actorId: user.id, actorName: actor, metadata: patch });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  const { id } = await params;

  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_record_tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(admin, { action: "delete", entityType: "record_task", entityId: id, actorId: user.id, actorName: user.email ?? "system", metadata: {} });
  return NextResponse.json({ ok: true, error: null });
}
