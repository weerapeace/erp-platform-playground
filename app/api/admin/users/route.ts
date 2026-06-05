import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// ---- Types ----

export type AdminUser = {
  id:                 string;
  email:              string;
  display_name:       string | null;
  username:           string | null;
  role:               "admin" | "manager" | "staff" | "viewer";
  active:             boolean;
  avatar_url:         string | null;
  last_seen_at:       string | null;
  last_sign_in_at:    string | null;
  email_confirmed_at: string | null;
  created_at:         string;
  updated_at:         string;
};

export type AdminUsersResponse = {
  data:  AdminUser[];
  error: string | null;
};

// ---- GET /api/admin/users — list ผ่าน RPC (ตรวจ admin.users ใน erp_can) ----

export async function GET(request: NextRequest) {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_admin_users_list");
  if (error) {
    return NextResponse.json({ data: [], error: error.message } satisfies AdminUsersResponse, { status: 500 });
  }
  return NextResponse.json({ data: (data as AdminUser[]) ?? [], error: null } satisfies AdminUsersResponse);
}

// ---- POST /api/admin/users — invite ใหม่ ----
// flow:
//   1. ใช้ user JWT เรียก RPC dummy เพื่อ verify ว่ามี admin.users  ← ทำผ่าน erp_admin_users_create_profile ที่ตรวจ permission
//   2. ใช้ service role เรียก auth.admin.inviteUserByEmail → ได้ user_id
//   3. ใช้ user JWT เรียก erp_admin_users_create_profile(user_id, email, name, role)

type InviteBody = {
  email:        string;
  display_name?: string;
  role?:        "admin" | "manager" | "staff" | "viewer";
  actor?:       string;
};

export async function POST(request: NextRequest) {
  let body: InviteBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.email || !body.email.includes("@")) {
    return NextResponse.json({ error: "email ไม่ถูกต้อง" }, { status: 400 });
  }
  const role = body.role ?? "viewer";

  // 1. ตรวจ permission ผ่าน RPC: ลอง create_profile ด้วย dummy id หาก erp_can fail จะ raise
  // (ทำ permission check แบบไม่สร้าง — เช็ค erp_can โดยตรงผ่าน rpc.)
  const userClient = supabaseFromRequest(request);
  const { data: canData, error: canError } = await userClient.rpc("erp_can", { p_permission: "admin.users" });
  if (canError) {
    return NextResponse.json({ error: canError.message }, { status: 500 });
  }
  if (canData !== true) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เชิญผู้ใช้ (admin.users)" }, { status: 403 });
  }

  // 2. invite ผ่าน service role
  //    redirectTo = หน้า "ตั้งรหัสผ่าน" บนเว็บจริง (origin ของ request นี้) → ผู้ถูกเชิญตั้งรหัสผ่านครั้งแรกได้
  const origin = request.headers.get("origin") || new URL(request.url).origin;
  const admin = supabaseAdmin();
  const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(body.email, {
    redirectTo: `${origin}/auth/set-password`,
  });
  if (invErr || !inv?.user) {
    return NextResponse.json({ error: invErr?.message ?? "invite ไม่สำเร็จ" }, { status: 500 });
  }

  // 3. สร้าง profile (ผ่าน user JWT — audit log จะมี actor uid)
  const { data: profile, error: pErr } = await userClient.rpc("erp_admin_users_create_profile", {
    p_user_id:      inv.user.id,
    p_email:        body.email,
    p_display_name: body.display_name ?? null,
    p_role:         role,
    p_actor:        body.actor ?? null,
  });
  if (pErr) {
    // rollback — delete user เพราะ invite ไปแล้วแต่ profile ไม่ผ่าน
    await admin.auth.admin.deleteUser(inv.user.id);
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  return NextResponse.json({ data: profile, error: null });
}

// ---- PATCH /api/admin/users — เปลี่ยน role หรือ active ----

type UpdateBody = {
  user_id:       string;
  role?:         "admin" | "manager" | "staff" | "viewer";
  active?:       boolean;
  display_name?: string;
  avatar_url?:   string | null;
  actor?:        string;
};

export async function PATCH(request: NextRequest) {
  let body: UpdateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const client = supabaseFromRequest(request);
  let updated;

  // แก้ชื่อ + รูปโปรไฟล์ (ส่งทั้งคู่เสมอ — RPC เซ็ตทั้ง 2 ช่อง) แอดมิน/เจ้าของบัญชี
  if (body.display_name !== undefined || body.avatar_url !== undefined) {
    const { data, error } = await client.rpc("erp_admin_users_update_profile", {
      p_user_id:      body.user_id,
      p_display_name: body.display_name ?? null,
      p_avatar_url:   body.avatar_url ?? null,
      p_actor:        body.actor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated = data;
  }

  if (body.role) {
    const { data, error } = await client.rpc("erp_admin_users_update_role", {
      p_user_id: body.user_id, p_role: body.role, p_actor: body.actor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated = data;
  }
  if (body.active !== undefined) {
    const { data, error } = await client.rpc("erp_admin_users_set_active", {
      p_user_id: body.user_id, p_active: body.active, p_actor: body.actor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated = data;
  }
  return NextResponse.json({ data: updated, error: null });
}
