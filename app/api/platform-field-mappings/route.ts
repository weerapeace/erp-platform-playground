/**
 * Field Mapping — /api/platform-field-mappings (ฟิลด์ ERP → ฟิลด์แพลตฟอร์ม)
 * GET   ?platform_id=  (products.platforms.view)  → { mappings: {[platform_field_key]: source_key} }
 * PATCH { platform_id, platform_field_key, source_key } (products.platforms.edit)
 *        source_key ว่าง = ลบ mapping
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { SOURCE_FIELD_KEYS } from "@/lib/platform-source-fields";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const platformId = (new URL(request.url).searchParams.get("platform_id") ?? "").trim();
  if (!platformId) return NextResponse.json({ mappings: {}, error: null });
  const { data } = await supabaseAdmin().from("platform_field_mappings").select("platform_field_key, source_key").eq("platform_id", platformId);
  const mappings: Record<string, string> = {};
  for (const r of ((data ?? []) as Record<string, unknown>[])) if (r.source_key) mappings[String(r.platform_field_key)] = String(r.source_key);
  return NextResponse.json({ mappings, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { platform_id?: string; platform_field_key?: string; source_key?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const platform_id = (body.platform_id ?? "").trim();
  const platform_field_key = (body.platform_field_key ?? "").trim();
  if (!platform_id || !platform_field_key) return NextResponse.json({ error: "ต้องมี platform_id + platform_field_key" }, { status: 400 });
  const source_key = (body.source_key ?? "").trim();
  if (source_key && !SOURCE_FIELD_KEYS.has(source_key)) return NextResponse.json({ error: "source_key ไม่ถูกต้อง" }, { status: 400 });
  const admin = supabaseAdmin();
  if (!source_key) {
    await admin.from("platform_field_mappings").delete().eq("platform_id", platform_id).eq("platform_field_key", platform_field_key);
  } else {
    const { error } = await admin.from("platform_field_mappings")
      .upsert({ platform_id, platform_field_key, source_key, updated_by: user?.id ?? null, updated_at: new Date().toISOString(), created_by: user?.id ?? null }, { onConflict: "platform_id,platform_field_key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await writeAudit(admin, { action: "update", entityType: "platform_field_mapping", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { platform_id, platform_field_key, source_key: source_key || null } });
  return NextResponse.json({ ok: true, error: null });
}
