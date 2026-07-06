/**
 * ผูก/ยกเลิกผูก LINE เข้ากับ "user" (ไม่จำเป็นต้องเป็นพนักงาน)
 * GET    → สถานะการผูกของฉัน { linked, line_user_id }
 * POST   { id_token } → ยืนยัน LINE แล้วบันทึก line_user_id ให้ user ที่ล็อกอินอยู่
 * DELETE            → ยกเลิกผูกของฉัน
 * DELETE ?user_id=X → แอดมินยกเลิกผูกให้คนอื่น
 * ใช้กับหน้าอนุมัติเล็ก (LINE) เพื่อระบุว่าใครเป็นคนอนุมัติ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyLineIdToken } from "@/lib/line-employee-portal-db";
import { APPROVE_CHANNEL_ID } from "@/lib/approval-token";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function me(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const uid = await me(request);
  if (!uid) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const { data } = await supabaseAdmin().from("user_profiles").select("line_user_id").eq("id", uid).maybeSingle();
  const lid = (data as { line_user_id?: string | null } | null)?.line_user_id ?? null;
  return NextResponse.json({ linked: !!lid, line_user_id: lid ? `${String(lid).slice(0, 6)}…` : null, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const uid = await me(request);
  if (!uid) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  let body: { id_token?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  let sub = "";
  try { const p = await verifyLineIdToken(body.id_token, undefined, APPROVE_CHANNEL_ID); sub = String((p as { sub?: string }).sub ?? ""); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 401 }); }
  if (!sub) return NextResponse.json({ error: "ยืนยัน LINE ไม่สำเร็จ" }, { status: 401 });

  const admin = supabaseAdmin();
  // กันผูกซ้ำกับ user อื่น
  const { data: dup } = await admin.from("user_profiles").select("id").eq("line_user_id", sub).neq("id", uid).maybeSingle();
  if (dup) return NextResponse.json({ error: "บัญชี LINE นี้ถูกผูกกับผู้ใช้อื่นแล้ว" }, { status: 409 });
  const { error } = await admin.from("user_profiles").update({ line_user_id: sub }).eq("id", uid);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "line:link_user", entityType: "user", entityId: uid, actorId: uid, actorName: null, metadata: {} });
  return NextResponse.json({ ok: true, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const uid = await me(request);
  if (!uid) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const target = new URL(request.url).searchParams.get("user_id");
  const admin = supabaseAdmin();
  let victim = uid;
  if (target && target !== uid) {
    // แอดมินเท่านั้นที่ยกเลิกผูกให้คนอื่นได้
    const { data: prof } = await admin.from("user_profiles").select("role").eq("id", uid).maybeSingle();
    if ((prof as { role?: string } | null)?.role !== "admin") return NextResponse.json({ error: "เฉพาะแอดมิน" }, { status: 403 });
    victim = target;
  }
  const { error } = await admin.from("user_profiles").update({ line_user_id: null }).eq("id", victim);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "line:unlink_user", entityType: "user", entityId: victim, actorId: uid, actorName: null, metadata: {} });
  return NextResponse.json({ ok: true, error: null });
}
