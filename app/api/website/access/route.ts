/**
 * 🔐 สิทธิ์เว็บไซต์ "ใครทำอะไรได้" — /api/website/access (หน้า /website/access)
 * GET  → ร้าน · ตำแหน่ง + สิทธิ์เว็บไซต์ของแต่ละตำแหน่ง · ผู้ใช้ + ยกเว้นรายคน (เฉพาะคีย์ website.*)
 * POST { roles: [{role_key, permission_key, granted}], users: [{user_id, permission_key, mode: grant|revoke|default}] }
 *      → ตำแหน่ง: RPC erp_role_permission_toggle (ต้อง admin.roles · audit ในตัว)
 *      → รายคน: erp_user_permissions (ต้อง admin.users) + audit website_access.user
 *      สิทธิ์ร้านที่ยังไม่มีในทะเบียน (ร้านใหม่) + 👷 หัวข้อดีไซน์ (website.design.topic.* / publish / advanced) สร้างให้ก่อน
 * ของกลาง: lib/website-access (กลุ่ม/คีย์) · ระบบสิทธิ์เดิม (erp_role_permissions / erp_user_permissions / erp_can)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { DESIGN_ADVANCED_PERM, DESIGN_PUBLISH_PERM, DESIGN_TOPIC_PERMS, DESIGN_TOPICS, designTopicPerm, WEBSITE_ACCESS_PERM, WEBSITE_GROUP_PERMS, websiteShopPerm } from "@/lib/website-access";
import { DESIGN_PAGES } from "@/lib/website-design-nav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Shop = { id: string; slug: string; name: string };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users");
  if (denied) return denied;
  const sb = supabaseAdmin();
  const [shops, roles, rolePerms, users, overrides, canRoles] = await Promise.all([
    sb.from("shops").select("id, slug, name").order("is_default", { ascending: false }).order("name"),
    sb.from("erp_roles").select("key, label, active").order("key"),
    sb.from("erp_role_permissions").select("role_key, permission_key").like("permission_key", "website.%"),
    sb.from("user_profiles").select("id, email, display_name, role, active").order("display_name"),
    sb.from("erp_user_permissions").select("user_id, permission_key, mode").like("permission_key", "website.%"),
    apiCan(request, "admin.roles"),
  ]);
  const err = shops.error ?? roles.error ?? rolePerms.error ?? users.error ?? overrides.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  return NextResponse.json({
    shops: shops.data ?? [],
    roles: roles.data ?? [],
    rolePerms: rolePerms.data ?? [],
    users: (users.data ?? []).map((u) => ({ id: u.id, name: u.display_name || u.email || "—", email: u.email, role: u.role, active: u.active !== false })),
    overrides: overrides.data ?? [],
    canRoles,
    error: null,
  });
}

type RoleChange = { role_key?: string; permission_key?: string; granted?: boolean };
type UserChange = { user_id?: string; permission_key?: string; mode?: "grant" | "revoke" | "default" };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users");
  if (denied) return denied;
  let body: { roles?: RoleChange[]; users?: UserChange[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const sb = supabaseAdmin();
  const { data: shopRows } = await sb.from("shops").select("id, slug, name");
  const shops = (shopRows ?? []) as Shop[];
  const allowedKeys = new Set([WEBSITE_ACCESS_PERM, ...WEBSITE_GROUP_PERMS, ...DESIGN_TOPIC_PERMS, ...shops.map((s) => websiteShopPerm(s.slug))]);
  const roleChanges = (body.roles ?? []).filter((c) => c.role_key && c.role_key !== "admin" && allowedKeys.has(c.permission_key ?? "") && typeof c.granted === "boolean");
  const userChanges = (body.users ?? []).filter((c) => c.user_id && allowedKeys.has(c.permission_key ?? "") && ["grant", "revoke", "default"].includes(c.mode ?? ""));
  if (!roleChanges.length && !userChanges.length) return NextResponse.json({ ok: true, errors: [], error: null });

  // ร้านใหม่ที่ยังไม่มีสิทธิ์ในทะเบียน → สร้างก่อน (toggle/override ต้องมีคีย์ในทะเบียน)
  const shopKeys = shops.map((s) => ({ key: websiteShopPerm(s.slug), label: `เว็บไซต์ · เข้าร้าน ${s.name}`, category: "เว็บไซต์", is_dangerous: false, sort_order: 2220 }));
  if (shopKeys.length) await sb.from("erp_permissions").upsert(shopKeys, { onConflict: "key", ignoreDuplicates: true });
  // 👷 หัวข้อดีไซน์ (หน้าดีไซน์แบบง่ายของพนักงาน) — มีในทะเบียนครั้งแรกที่บันทึก
  if ([...roleChanges, ...userChanges].some((c) => DESIGN_TOPIC_PERMS.includes(c.permission_key ?? ""))) {
    const designKeys = [
      ...DESIGN_TOPICS.map((t) => ({ key: designTopicPerm(t), label: `เว็บไซต์ · ดีไซน์แก้ได้: ${DESIGN_PAGES[t].label}`, category: "เว็บไซต์", is_dangerous: false, sort_order: 2215 })),
      { key: DESIGN_PUBLISH_PERM, label: "เว็บไซต์ · ดีไซน์: เผยแพร่เองได้ (คนที่แก้บางหัวข้อ)", category: "เว็บไซต์", is_dangerous: false, sort_order: 2216 },
      { key: DESIGN_ADVANCED_PERM, label: "เว็บไซต์ · ดีไซน์: โชว์การตั้งค่าละเอียด (คนที่แก้บางหัวข้อ)", category: "เว็บไซต์", is_dangerous: false, sort_order: 2217 },
    ];
    await sb.from("erp_permissions").upsert(designKeys, { onConflict: "key", ignoreDuplicates: true });
  }

  const errors: string[] = [];
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  if (roleChanges.length) {
    if (!(await apiCan(request, "admin.roles"))) errors.push("แก้สิทธิ์ตามตำแหน่งต้องมีสิทธิ์ admin.roles");
    else {
      const client = supabaseFromRequest(request);
      for (const c of roleChanges) {
        const { error } = await client.rpc("erp_role_permission_toggle", { p_role_key: c.role_key, p_permission_key: c.permission_key, p_granted: c.granted, p_actor: user?.email ?? null });
        if (error) errors.push(`${c.role_key} · ${c.permission_key}: ${error.message}`);
      }
    }
  }

  const byUser = new Map<string, UserChange[]>();
  for (const c of userChanges) {
    const { error } =
      c.mode === "default"
        ? await sb.from("erp_user_permissions").delete().eq("user_id", c.user_id!).eq("permission_key", c.permission_key!)
        : await sb.from("erp_user_permissions").upsert({ user_id: c.user_id, permission_key: c.permission_key, mode: c.mode, granted_by: user?.id ?? null, granted_at: new Date().toISOString() }, { onConflict: "user_id,permission_key" });
    if (error) errors.push(`${c.user_id} · ${c.permission_key}: ${error.message}`);
    else byUser.set(c.user_id!, [...(byUser.get(c.user_id!) ?? []), c]);
  }
  for (const [userId, changes] of byUser) {
    await writeAudit(sb, {
      action: "website_access.user",
      entityType: "user",
      entityId: userId,
      actorId: user?.id ?? null,
      actorName: user?.email ?? null,
      metadata: { changes: changes.map((c) => ({ permission_key: c.permission_key, mode: c.mode })) },
    });
  }
  return NextResponse.json({ ok: errors.length === 0, errors, error: errors.length ? errors.join(" · ") : null });
}
