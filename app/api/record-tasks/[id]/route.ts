/**
 * Record Tasks — แก้/ลบ รายการเช็คลิสต์
 * PATCH  /api/record-tasks/[id]  body { status?, title?, assigned_to?, actor? }   status: 'open' | 'done'
 *        สิทธิ์ products.edit · หรือ "ผู้รับผิดชอบติ๊กข้อของตัวเอง" (เปลี่ยนแค่ status) ได้แม้ไม่มีสิทธิ์แก้
 *        เปลี่ยนผู้รับผิดชอบ → กระดิ่งเด้งบอกคนใหม่
 * DELETE /api/record-tasks/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { isUuid, notifyAssignee, userNames } from "@/lib/record-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  const { id } = await params;

  let body: { status?: string; title?: string; actor?: string; assigned_to?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const actor = body.actor ?? user.email ?? "system";

  const admin = supabaseAdmin();
  const { data: before } = await admin.from("erp_record_tasks").select("id, module_key, record_id, title, status, assigned_to").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const b = before as { module_key: string; record_id: string; title: string; status: string; assigned_to: string | null };
  const onlyStatus = body.title === undefined && body.assigned_to === undefined;
  if (!(await apiCan(request, "products.edit")) && !(onlyStatus && b.assigned_to === user.id)) {
    return NextResponse.json({ error: "ต้องเข้าสู่ระบบและมีสิทธิ์ใช้งาน (products.edit)" }, { status: 401 });
  }

  const patch: Record<string, unknown> = {};
  if (body.assigned_to !== undefined) {
    if (body.assigned_to !== null && !isUuid(body.assigned_to)) return NextResponse.json({ error: "ผู้รับผิดชอบไม่ถูกต้อง" }, { status: 400 });
    patch.assigned_to = body.assigned_to;
  }
  if (typeof body.title === "string") { const t = body.title.trim().slice(0, 300); if (!t) return NextResponse.json({ error: "ชื่อว่างไม่ได้" }, { status: 400 }); patch.title = t; }
  if (typeof body.status === "string") {
    // ค่าใน DB ถูกจำกัดด้วย check constraint: open/in_progress/resolved/ignored/archived → "เสร็จ" = resolved
    const st = body.status === "resolved" || body.status === "done" ? "resolved" : "open";
    patch.status = st;
    patch.resolved_at = st === "resolved" ? new Date().toISOString() : null;
    patch.resolved_by = st === "resolved" ? actor : null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีอะไรให้แก้" }, { status: 400 });

  const { data, error } = await admin.from("erp_record_tasks").update(patch).eq("id", id).select("id, status, title, assigned_to").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(admin, { action: "update", entityType: "record_task", entityId: id, actorId: user.id, actorName: actor, metadata: { ...patch, title: b.title } });
  const row = data as { assigned_to: string | null };
  if (body.assigned_to !== undefined && row.assigned_to && row.assigned_to !== b.assigned_to) {
    await notifyAssignee(admin, { module_key: b.module_key, record_id: b.record_id, title: (patch.title as string | undefined) ?? b.title, assigned_to: row.assigned_to }, { id: user.id, name: actor });
  }
  const names = await userNames(admin, [row.assigned_to]);
  return NextResponse.json({ data: { ...data, assigned_name: row.assigned_to ? names.get(row.assigned_to) ?? null : null }, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  const { id } = await params;

  const admin = supabaseAdmin();
  const { data: gone, error } = await admin.from("erp_record_tasks").delete().eq("id", id).select("module_key, record_id, title, status, assigned_to");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // เก็บข้อความที่ลบไว้ในประวัติ (ลบแล้วเรียกคืนไม่ได้)
  await writeAudit(admin, { action: "delete", entityType: "record_task", entityId: id, actorId: user.id, actorName: user.email ?? "system", metadata: (gone?.[0] as Record<string, unknown> | undefined) ?? {} });
  return NextResponse.json({ ok: true, error: null });
}
