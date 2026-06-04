/**
 * POST /api/admin/users/create-internal
 * สร้าง "ผู้ใช้ภายใน" — username + PIN (ไม่มีอีเมลจริง)
 *
 * body: { username, display_name?, pin, role?, actor? }
 * - สร้าง Supabase auth user ด้วยอีเมลหลอก (username@pin.local) + PIN เป็นรหัสผ่าน
 *   (email_confirm:true → ไม่ต้องยืนยันเมล)
 * - สร้าง profile (role default 'staff'; ไม่อนุญาต admin เพื่อความปลอดภัย)
 * - เซ็ต username ใน user_profiles
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { internalEmail, isValidUsername, isValidPin } from "@/lib/internal-users";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = { username?: string; display_name?: string; pin?: string; role?: string; actor?: string };

// PIN user จำกัดสิทธิ์ — ห้ามเป็น admin
const ALLOWED_ROLES = ["staff", "viewer", "manager"];

export async function POST(request: NextRequest) {
  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const username = (body.username ?? "").trim().toLowerCase();
  const pin = (body.pin ?? "").trim();
  const role = ALLOWED_ROLES.includes(body.role ?? "") ? (body.role as string) : "staff";

  if (!isValidUsername(username)) return NextResponse.json({ error: "username ต้องเป็น a-z, 0-9, _ ความยาว 3-32" }, { status: 400 });
  if (!isValidPin(pin)) return NextResponse.json({ error: "PIN ต้องเป็นตัวเลข 6 หลัก" }, { status: 400 });

  // 1) ตรวจสิทธิ์ admin.users
  const userClient = supabaseFromRequest(request);
  const { data: canData, error: canError } = await userClient.rpc("erp_can", { p_permission: "admin.users" });
  if (canError) return NextResponse.json({ error: canError.message }, { status: 500 });
  if (canData !== true) return NextResponse.json({ error: "ไม่มีสิทธิ์สร้างผู้ใช้ (admin.users)" }, { status: 403 });

  const admin = supabaseAdmin();
  const email = internalEmail(username);

  // 2) กัน username ซ้ำ
  const { data: dup } = await admin.from("user_profiles").select("id").eq("username", username).maybeSingle();
  if (dup) return NextResponse.json({ error: `username "${username}" ถูกใช้แล้ว` }, { status: 409 });

  // 3) สร้าง auth user (อีเมลหลอก + PIN, ยืนยันเมลให้เลย)
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
    user_metadata: { display_name: body.display_name ?? username, username, internal: true },
  });
  if (cErr || !created?.user) {
    const msg = cErr?.message ?? "สร้างผู้ใช้ไม่สำเร็จ";
    return NextResponse.json({ error: msg.includes("already") ? `username "${username}" ถูกใช้แล้ว` : msg }, { status: 500 });
  }
  const uid = created.user.id;

  // 4) สร้าง profile (ผ่าน user JWT → audit actor ถูกต้อง)
  const { error: pErr } = await userClient.rpc("erp_admin_users_create_profile", {
    p_user_id: uid, p_email: email, p_display_name: body.display_name ?? username, p_role: role, p_actor: body.actor ?? null,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(uid); // rollback
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  // 5) เซ็ต username (RPC ไม่ได้ตั้งให้)
  await admin.from("user_profiles").update({ username }).eq("id", uid);

  // 6) audit (ของกลาง — ลง audit_logs, ไม่ throw)
  await writeAudit(admin, {
    action: "admin.create_internal_user", entityType: "user_profiles", entityId: uid,
    actorName: body.actor ?? "system",
    metadata: { module: "admin.users", username, role, internal: true },
  });

  return NextResponse.json({ ok: true, data: { id: uid, username, email, role }, error: null });
}
