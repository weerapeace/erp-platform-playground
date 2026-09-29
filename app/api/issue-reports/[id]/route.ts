/**
 * /api/issue-reports/[id]
 *   PATCH  ทีมงาน (report.manage): เปลี่ยนสถานะ/priority/โน้ต
 *          ผู้แจ้ง (เจ้าของใบ): แก้ข้อความ/ความด่วน/แอป/รูป ได้ตอนใบยัง "เปิด" (ทีมงานยังไม่รับเรื่อง)
 *   DELETE ผู้แจ้งถอนเรื่องของตัวเอง (ตอนยัง "เปิด") หรือทีมงานปิดเรื่อง → สถานะ closed (ไม่ลบ เก็บไว้ดูย้อนหลัง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUSES = new Set(["open", "in_progress", "resolved", "closed"]);
const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

/** ผู้ใช้ปัจจุบัน + เป็นทีมงาน (report.manage) ไหม */
async function who(request: NextRequest): Promise<{ uid: string | null; email: string | null; manage: boolean }> {
  const sb = supabaseFromRequest(request);
  const { data: auth } = await sb.auth.getUser();
  const { data: canManage } = await sb.rpc("erp_can", { p_permission: "report.manage" });
  return { uid: auth?.user?.id ?? null, email: auth?.user?.email ?? null, manage: canManage === true };
}

/** ผู้แจ้งแก้ใบของตัวเอง (เฉพาะใบที่ยังเปิด) */
async function reporterPatch(request: NextRequest, id: string, uid: string, email: string | null) {
  let body: { description?: string; priority?: string; images?: string[]; app_id?: string | null; app_name?: string | null };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const db = supabaseAdmin();
  const { data: cur } = await db.from("issue_reports").select("id, reporter_id, status, description, priority, images, app_id, app_name").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบใบแจ้งนี้" }, { status: 404 });
  const c = cur as Record<string, unknown>;
  if (c.reporter_id !== uid) return NextResponse.json({ error: "แก้ได้เฉพาะใบที่ตัวเองแจ้ง" }, { status: 403 });
  if (c.status !== "open") return NextResponse.json({ error: "ทีมงานรับเรื่องแล้ว แก้ไม่ได้ — ถ้ามีข้อมูลเพิ่ม ให้แจ้งใบใหม่" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.description !== undefined) {
    const d = String(body.description ?? "").trim();
    if (!d) return NextResponse.json({ error: "กรุณาอธิบายปัญหา" }, { status: 400 });
    patch.description = d;
  }
  if (body.priority !== undefined && PRIORITIES.has(String(body.priority))) patch.priority = body.priority;
  if (Array.isArray(body.images)) patch.images = body.images.filter((x) => typeof x === "string");
  if (body.app_id !== undefined) { patch.app_id = body.app_id || null; patch.app_name = body.app_name ?? null; }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true, error: null });

  patch.updated_at = new Date().toISOString();
  const { error } = await db.from("issue_reports").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(db, { action: "update", entityType: "issue_reports", entityId: id, actorId: uid, actorName: email,
    metadata: { by: "reporter", old: { description: c.description, priority: c.priority, app_name: c.app_name, images: c.images }, new: patch } });
  return NextResponse.json({ ok: true, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(request, "report.create");
  if (guard) return guard;
  const { id } = await params;
  const me = await who(request);

  const db = supabaseAdmin();
  const { data: cur } = await db.from("issue_reports").select("id, reporter_id, status, admin_note").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบใบแจ้งนี้" }, { status: 404 });
  const c = cur as Record<string, unknown>;
  if (!me.manage) {
    if (!me.uid || c.reporter_id !== me.uid) return NextResponse.json({ error: "ถอนได้เฉพาะใบที่ตัวเองแจ้ง" }, { status: 403 });
    if (c.status !== "open") return NextResponse.json({ error: "ทีมงานรับเรื่องแล้ว ถอนเองไม่ได้ — แจ้งทีมงานให้ปิดเรื่อง" }, { status: 400 });
  }
  if (c.status === "closed") return NextResponse.json({ error: "ใบนี้ปิดไปแล้ว" }, { status: 400 });

  const now = new Date().toISOString();
  const note = me.manage && c.reporter_id !== me.uid ? (c.admin_note ?? null) : [c.admin_note, "ผู้แจ้งถอนเรื่องเอง"].filter(Boolean).join(" · ");
  const { error } = await db.from("issue_reports").update({ status: "closed", resolved_at: now, updated_at: now, admin_note: note }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(db, { action: "cancel", entityType: "issue_reports", entityId: id, actorId: me.uid, actorName: me.email,
    metadata: { by: me.manage && c.reporter_id !== me.uid ? "manager" : "reporter", was: c.status } });
  return NextResponse.json({ ok: true, error: null });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ผู้แจ้ง (ไม่มีสิทธิ์ทีมงาน) → แก้ใบของตัวเอง
  const me = await who(request);
  if (!me.manage) {
    const g = await guardApi(request, "report.create");
    if (g) return g;
    if (!me.uid) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
    return reporterPatch(request, id, me.uid, me.email);
  }

  let body: { status?: string; priority?: string; admin_note?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status && STATUSES.has(body.status)) {
    patch.status = body.status;
    patch.resolved_at = body.status === "resolved" || body.status === "closed" ? new Date().toISOString() : null;
  }
  if (body.priority && PRIORITIES.has(body.priority)) patch.priority = body.priority;
  if (body.admin_note !== undefined) patch.admin_note = body.admin_note;

  const sb = supabaseFromRequest(request);
  const { data: auth } = await sb.auth.getUser();

  const db = supabaseAdmin();
  const { error } = await db.from("issue_reports").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(db, {
    action: "update", entityType: "issue_reports", entityId: id,
    actorId: auth?.user?.id ?? null, actorName: null, metadata: patch,
  });
  return NextResponse.json({ ok: true, error: null });
}
