/**
 * Platform Category Mapping — /api/platform-category-map
 * จับคู่ "หมวดกลาง (platform_central_categories)" → หมวดของแต่ละร้าน (เลือกจาก platform_category_options)
 *   GET  → { categories(หมวดกลาง), platforms, mappings }  (products.platforms.view)
 *   POST { central_category_id, entries:[{platform_id, path}] } (products.platforms.manage_accounts)
 *         path = "{external_id} · {ชื่อหมวด}" ที่เลือกจาก dropdown · ว่าง = ลบการจับคู่
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const [{ data: categories }, { data: platforms }, { data: mappings }] = await Promise.all([
    admin.from("platform_central_categories").select("id, name").eq("is_active", true).order("sort_order").order("name"),
    admin.from("erp_platforms").select("id, code, name_th, icon_key, sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.from("platform_category_mappings").select("central_category_id, platform_id, platform_category_path"),
  ]);
  return NextResponse.json({ categories: categories ?? [], platforms: platforms ?? [], mappings: mappings ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = user?.id ?? null;

  let body: { central_category_id?: string; entries?: { platform_id?: string; path?: string }[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const catId = String(body.central_category_id ?? "").trim();
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!catId) return NextResponse.json({ error: "ต้องระบุ central_category_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  for (const e of entries) {
    const pid = String(e.platform_id ?? "").trim();
    if (!pid) continue;
    const path = String(e.path ?? "").trim();
    if (!path) {
      const { error } = await admin.from("platform_category_mappings").delete().eq("central_category_id", catId).eq("platform_id", pid);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await admin.from("platform_category_mappings").upsert({
        central_category_id: catId, platform_id: pid, platform_category_path: path,
        is_active: true, updated_by: actor, updated_at: now, created_by: actor,
      }, { onConflict: "central_category_id,platform_id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, error: null });
}
