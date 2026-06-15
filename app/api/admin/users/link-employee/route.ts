/**
 * เชื่อมบัญชีผู้ใช้ระบบ ↔ พนักงาน (user_profiles.employee_id)
 * GET  ?user_id=  → { employee_id, employee_label }  (ของที่ผูกไว้ปัจจุบัน)
 * POST { user_id, employee_id|null }  → ตั้ง/ยกเลิกการเชื่อม
 * ตรวจสิทธิ์ admin.users
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function requireAdmin(request: NextRequest): Promise<string | null> {
  const { data: can, error } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: "admin.users" });
  if (error) return error.message;
  if (can !== true) return "ไม่มีสิทธิ์ (admin.users)";
  return null;
}

function empLabel(e: Record<string, unknown> | null): string | null {
  if (!e) return null;
  const nick = (e.nickname as string) || "";
  const name = [e.first_name, e.last_name].filter(Boolean).join(" ").trim();
  const code = (e.employee_code as string) || "";
  return [name || nick || code, code && (name || nick) ? `(${code})` : ""].filter(Boolean).join(" ") || code || null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const err = await requireAdmin(request); if (err) return NextResponse.json({ error: err }, { status: 403 });
  const userId = new URL(request.url).searchParams.get("user_id") ?? "";
  if (!userId) return NextResponse.json({ error: "ต้องระบุ user_id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: prof } = await admin.from("user_profiles").select("employee_id").eq("id", userId).maybeSingle();
  const empId = (prof?.employee_id as string) ?? null;
  let label: string | null = null;
  if (empId) {
    const { data: e } = await admin.from("employees").select("employee_code, first_name, last_name, nickname").eq("id", empId).maybeSingle();
    label = empLabel(e as Record<string, unknown> | null);
  }
  return NextResponse.json({ employee_id: empId, employee_label: label, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const err = await requireAdmin(request); if (err) return NextResponse.json({ error: err }, { status: 403 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { user_id?: string; employee_id?: string | null };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const userId = (body.user_id ?? "").trim();
  if (!userId) return NextResponse.json({ error: "ต้องระบุ user_id" }, { status: 400 });
  const empId = body.employee_id ? String(body.employee_id) : null;

  const admin = supabaseAdmin();
  const { error } = await admin.from("user_profiles").update({ employee_id: empId, updated_at: new Date().toISOString() }).eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, {
    action: "update", entityType: "user", entityId: userId,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { employee_id: empId },
  });
  return NextResponse.json({ ok: true, error: null });
}
