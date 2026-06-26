/**
 * Brand Theme API — ธีมต่อแบรนด์ (Brand Theme Builder)
 * GET   /api/brand-themes/[brandId]            → { published, draft, error }
 * PATCH /api/brand-themes/[brandId] {config}   → บันทึกร่าง (สิทธิ์ brand.theme.edit)
 * POST  /api/brand-themes/[brandId] {publish}  → เผยแพร่ draft→published (สิทธิ์ brand.theme.publish)
 *
 * เก็บที่ brand_themes · guardApi(products.view) สำหรับอ่าน · เขียนตรวจสิทธิ์เอง (admin + erp_role_permissions) + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;

// ตรวจสิทธิ์: admin ผ่านหมด · role อื่นต้องมี permission_key ใน erp_role_permissions
async function hasPerm(admin: Admin, userId: string, key: string): Promise<boolean> {
  const { data: prof } = await admin.from("user_profiles").select("role, active").eq("id", userId).maybeSingle();
  const role = prof?.active ? (prof.role as string | null) : null;
  if (role === "admin") return true;
  if (!role) return false;
  const { data } = await admin.from("erp_role_permissions").select("permission_key").eq("role_key", role).eq("permission_key", key).maybeSingle();
  return !!data;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { brandId } = await params;
  const { data, error } = await supabaseAdmin().from("brand_themes")
    .select("published_config, draft_config, updated_at, published_at").eq("brand_id", brandId).maybeSingle();
  if (error) return NextResponse.json({ published: null, draft: null, error: error.message }, { status: 500 });
  return NextResponse.json({
    published: data?.published_config ?? null,
    draft: data?.draft_config ?? null,
    updated_at: data?.updated_at ?? null, published_at: data?.published_at ?? null, error: null,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  const { brandId } = await params;
  const admin = supabaseAdmin();
  if (!(await hasPerm(admin, user.id, "brand.theme.edit")))
    return NextResponse.json({ error: "คุณไม่มีสิทธิ์แก้ธีมแบรนด์ (brand.theme.edit)" }, { status: 403 });

  let body: { config?: Record<string, unknown>; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const config = body.config && typeof body.config === "object" ? body.config : {};
  const actor = body.actor ?? user.email ?? "system";

  const { error } = await admin.from("brand_themes")
    .upsert({ brand_id: brandId, draft_config: config, updated_by: actor, updated_at: new Date().toISOString() }, { onConflict: "brand_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(admin, { action: "theme_draft", entityType: "brand_theme", entityId: brandId, actorId: user.id, actorName: actor, metadata: { theme_name: (config as { theme_name?: string }).theme_name ?? null } });
  return NextResponse.json({ ok: true, error: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  const { brandId } = await params;
  const admin = supabaseAdmin();

  let body: { publish?: boolean; reset?: boolean; config?: Record<string, unknown>; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const actor = body.actor ?? user.email ?? "system";

  // reset = ล้างธีม (draft+published) กลับ default
  if (body.reset) {
    if (!(await hasPerm(admin, user.id, "brand.theme.publish")))
      return NextResponse.json({ error: "คุณไม่มีสิทธิ์รีเซ็ต/เผยแพร่ธีม (brand.theme.publish)" }, { status: 403 });
    const { error } = await admin.from("brand_themes")
      .upsert({ brand_id: brandId, draft_config: {}, published_config: {}, published_by: actor, published_at: new Date().toISOString(), updated_by: actor, updated_at: new Date().toISOString() }, { onConflict: "brand_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeAudit(admin, { action: "theme_reset", entityType: "brand_theme", entityId: brandId, actorId: user.id, actorName: actor, metadata: {} });
    return NextResponse.json({ ok: true, error: null });
  }

  // publish = คัด draft (หรือ config ที่ส่งมา) → published
  if (!(await hasPerm(admin, user.id, "brand.theme.publish")))
    return NextResponse.json({ error: "คุณไม่มีสิทธิ์เผยแพร่ธีม (brand.theme.publish)" }, { status: 403 });
  // หา config ที่จะ publish: ถ้าส่ง config มาใช้ตัวนั้น (และบันทึกเป็น draft ด้วย) · ไม่งั้นใช้ draft ที่บันทึกไว้
  let toPublish = body.config && typeof body.config === "object" ? body.config : null;
  if (!toPublish) {
    const { data } = await admin.from("brand_themes").select("draft_config").eq("brand_id", brandId).maybeSingle();
    toPublish = (data?.draft_config as Record<string, unknown>) ?? {};
  }
  const now = new Date().toISOString();
  const { error } = await admin.from("brand_themes")
    .upsert({ brand_id: brandId, draft_config: toPublish, published_config: toPublish, updated_by: actor, updated_at: now, published_by: actor, published_at: now }, { onConflict: "brand_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(admin, { action: "theme_publish", entityType: "brand_theme", entityId: brandId, actorId: user.id, actorName: actor, metadata: { theme_name: (toPublish as { theme_name?: string }).theme_name ?? null } });
  return NextResponse.json({ ok: true, error: null });
}
