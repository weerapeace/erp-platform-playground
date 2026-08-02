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
  color:              string | null;
  last_seen_at:       string | null;
  last_sign_in_at:    string | null;
  email_confirmed_at: string | null;
  created_at:         string;
  updated_at:         string;
  employee_id?:       string | null;   // ทะเบียนพนักงานที่ผูกไว้ (สิทธิ์ "พนักงาน" ต้องมีเสมอ)
  employee_label?:    string | null;
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
  const users = (data as AdminUser[]) ?? [];
  // เติมสีประจำตัว + พนักงานที่ผูกไว้ (RPC เดิมไม่มี 2 คอลัมน์นี้)
  // employee_code ใช้โชว์ป้ายเตือน "สิทธิ์พนักงานแต่ยังไม่ผูกทะเบียนพนักงาน"
  try {
    const admin = supabaseAdmin();
    const ids = users.map((u) => u.id);
    const { data: profs } = await admin.from("user_profiles").select("id, color, employee_id").in("id", ids);
    const rows = (profs ?? []) as { id: string; color: string | null; employee_id: string | null }[];
    const empIds = rows.map((r) => r.employee_id).filter(Boolean) as string[];
    const codeById = new Map<string, string>();
    if (empIds.length) {
      const { data: emps } = await admin.from("employees").select("id, employee_code, nickname").in("id", empIds);
      for (const e of (emps ?? []) as { id: string; employee_code: string | null; nickname: string | null }[]) {
        codeById.set(e.id, [e.employee_code, e.nickname].filter(Boolean).join(" "));
      }
    }
    const pmap = new Map(rows.map((r) => [r.id, r]));
    for (const u of users) {
      const p = pmap.get(u.id);
      u.color = p?.color ?? null;
      u.employee_id = p?.employee_id ?? null;
      u.employee_label = p?.employee_id ? (codeById.get(p.employee_id) ?? "") : null;
    }
  } catch { /* ไม่มีข้อมูลเสริมก็ปล่อยว่าง */ }
  return NextResponse.json({ data: users, error: null } satisfies AdminUsersResponse);
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
  color?:        string | null;
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
    // กฎ: ผู้ใช้สิทธิ์ "พนักงาน" ต้องผูกกับทะเบียนพนักงานเสมอ
    // (ไม่งั้นระบบไม่รู้ว่าใครคือใคร → ลาออกแล้วปิดบัญชีอัตโนมัติไม่ได้ · สลิป/สิทธิ์รายคนก็ผูกไม่ได้)
    if (body.role === "staff") {
      const { data: prof } = await supabaseAdmin()
        .from("user_profiles").select("employee_id").eq("id", body.user_id).maybeSingle();
      if (!prof?.employee_id) {
        return NextResponse.json({
          error: 'สิทธิ์ "พนักงาน" ต้องผูกกับทะเบียนพนักงานก่อน — กดเมนู ⋮ ของผู้ใช้คนนี้ แล้วเลือก "ผูกพนักงาน"',
        }, { status: 400 });
      }
    }
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
  // ⑥ สีประจำตัว — แก้ของตัวเองได้เสมอ · แก้ให้คนอื่นต้องมีสิทธิ์ admin.users
  if (body.color !== undefined) {
    const { data: { user: authU } } = await client.auth.getUser();
    const isSelf = !!authU?.id && authU.id === body.user_id;
    if (!isSelf) {
      const { data: can, error: canErr } = await client.rpc("erp_can", { p_permission: "admin.users" });
      if (canErr) return NextResponse.json({ error: canErr.message }, { status: 500 });
      if (can !== true) return NextResponse.json({ error: "ไม่มีสิทธิ์แก้สีผู้ใช้อื่น (admin.users)" }, { status: 403 });
    }
    const { error } = await supabaseAdmin().from("user_profiles").update({ color: body.color || null }).eq("id", body.user_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated = { ...(updated as object ?? {}), color: body.color || null };
  }
  return NextResponse.json({ data: updated, error: null });
}
