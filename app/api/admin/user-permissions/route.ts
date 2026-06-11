/**
 * Admin — สิทธิ์เฉพาะคน (เฟส 3 ระบบสิทธิ์)
 *
 * GET    /api/admin/user-permissions?user_id=X
 *        → { permissions(catalog), role_key, role_perms[], overrides[{permission_key,mode}] }
 * POST   /api/admin/user-permissions { user_id, permission_key, mode: 'grant'|'revoke'|'default' }
 *        → mode=default ลบ override (กลับไปตามตำแหน่ง) · อื่น = upsert
 *
 * สิทธิ์: ต้องมี admin.users · เขียนผ่าน supabaseAdmin · audit → audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type PermCatalogItem = { key: string; label: string; category: string; is_dangerous: boolean };
export type UserOverride = { permission_key: string; mode: "grant" | "revoke" };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const userId = (new URL(request.url).searchParams.get("user_id") ?? "").trim();
  if (!userId) return NextResponse.json({ error: "ต้องส่ง user_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const [catRes, profRes, ovRes] = await Promise.all([
    admin.from("erp_permissions").select("key, label, category, is_dangerous").order("sort_order", { ascending: true }),
    admin.from("user_profiles").select("role").eq("id", userId).single(),
    admin.from("erp_user_permissions").select("permission_key, mode").eq("user_id", userId),
  ]);
  if (catRes.error) return NextResponse.json({ error: catRes.error.message }, { status: 500 });
  const roleKey = (profRes.data?.role as string) ?? null;

  let rolePerms: string[] = [];
  if (roleKey && roleKey !== "admin") {
    const { data } = await admin.from("erp_role_permissions").select("permission_key").eq("role_key", roleKey);
    rolePerms = ((data ?? []) as Array<{ permission_key: string }>).map((r) => r.permission_key);
  } else if (roleKey === "admin") {
    rolePerms = ((catRes.data ?? []) as PermCatalogItem[]).map((p) => p.key);   // admin = ทุกสิทธิ์
  }

  return NextResponse.json({
    permissions: (catRes.data ?? []) as PermCatalogItem[],
    role_key: roleKey,
    role_perms: rolePerms,
    overrides: (ovRes.data ?? []) as UserOverride[],
    error: null,
  });
}

type PostBody = { user_id?: string; permission_key?: string; mode?: "grant" | "revoke" | "default" };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: PostBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const userId = (body.user_id ?? "").trim();
  const permKey = (body.permission_key ?? "").trim();
  const mode = body.mode;
  if (!userId || !permKey || !mode) return NextResponse.json({ error: "ต้องส่ง user_id, permission_key, mode" }, { status: 400 });

  const admin = supabaseAdmin();
  if (mode === "default") {
    const { error } = await admin.from("erp_user_permissions").delete().eq("user_id", userId).eq("permission_key", permKey);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { error } = await admin.from("erp_user_permissions")
      .upsert({ user_id: userId, permission_key: permKey, mode, granted_by: user?.id ?? null, granted_at: new Date().toISOString() }, { onConflict: "user_id,permission_key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAudit(admin, {
    action: "user_permission_override", entityType: "user", entityId: userId,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { permission_key: permKey, mode },
  });
  return NextResponse.json({ ok: true, error: null });
}
