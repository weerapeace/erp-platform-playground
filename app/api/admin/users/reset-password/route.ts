/**
 * POST /api/admin/users/reset-password — admin ตั้งรหัสผ่าน/PIN ใหม่ให้ผู้ใช้
 * body: { user_id, password }
 * - ตรวจสิทธิ์ admin.users
 * - ใช้ service role: auth.admin.updateUserById(user_id, { password })
 *   (ใช้ได้ทั้งผู้ใช้อีเมล และผู้ใช้ภายใน @pin.local ที่ใช้ PIN เป็นรหัสผ่าน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userClient = supabaseFromRequest(request);
  const { data: { user } } = await userClient.auth.getUser();
  const { data: can, error: canErr } = await userClient.rpc("erp_can", { p_permission: "admin.users" });
  if (canErr) return NextResponse.json({ error: canErr.message }, { status: 500 });
  if (can !== true) return NextResponse.json({ error: "ไม่มีสิทธิ์ตั้งรหัสผ่าน (admin.users)" }, { status: 403 });

  let body: { user_id?: string; password?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const userId = (body.user_id ?? "").trim();
  const password = (body.password ?? "").trim();
  if (!userId) return NextResponse.json({ error: "ต้องระบุ user_id" }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "รหัสผ่าน/PIN อย่างน้อย 6 ตัว" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "reset_password", entityType: "user", entityId: userId,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {},
  });
  return NextResponse.json({ ok: true, error: null });
}
