/**
 * แม่แบบแคปชั่น (ต่อแบรนด์ + ค่ากลาง) + ช่องทางร้านของแบรนด์
 * GET /api/creative-caption-templates?brand_id=...
 *   → { templates (ที่ใช้จริงสำหรับแบรนด์นี้), shop_channels, is_brand_specific }
 * PUT /api/creative-caption-templates
 *   body = { brand_id|null, templates:[{key,label,body,sort_order}], shop_channels:[{label,value}] }
 *   → แทนที่แม่แบบของแบรนด์นั้นทั้งชุด + อัปเดตช่องทางร้าน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Tpl = { key: string; label: string; body: string; sort_order?: number };
type Channel = { label: string; value: string };

const TPL_COLS = "id, brand_id, key, label, body, sort_order";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim() || null;
  const admin = supabaseAdmin();

  const [{ data: brandRows }, { data: globalRows }] = await Promise.all([
    brandId ? admin.from("erp_creative_caption_templates").select(TPL_COLS).eq("brand_id", brandId).eq("is_active", true).order("sort_order", { ascending: true }) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin.from("erp_creative_caption_templates").select(TPL_COLS).is("brand_id", null).eq("is_active", true).order("sort_order", { ascending: true }),
  ]);
  const brandT = (brandRows ?? []) as Record<string, unknown>[];
  const globalT = (globalRows ?? []) as Record<string, unknown>[];
  const templates = brandT.length ? brandT : globalT; // แบรนด์มีของตัวเอง → ใช้ของแบรนด์ ไม่งั้นค่ากลาง

  let shop_channels: Channel[] = [];
  if (brandId) {
    const { data: b } = await admin.from("brands").select("shop_channels").eq("id", brandId).maybeSingle();
    shop_channels = (b?.shop_channels as Channel[]) ?? [];
  }
  return NextResponse.json({ data: { templates, shop_channels, is_brand_specific: brandT.length > 0 }, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string | null; templates?: Tpl[]; shop_channels?: Channel[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = (body.brand_id ?? null) || null;
  const admin = supabaseAdmin();

  // แทนที่แม่แบบของแบรนด์นี้ทั้งชุด (หรือค่ากลางถ้า brand_id = null)
  if (Array.isArray(body.templates)) {
    const del = admin.from("erp_creative_caption_templates").delete();
    await (brandId ? del.eq("brand_id", brandId) : del.is("brand_id", null));
    const rows = body.templates.filter((t) => t.key?.trim()).map((t, i) => ({
      brand_id: brandId, key: t.key.trim(), label: (t.label ?? t.key).trim(), body: t.body ?? "", sort_order: t.sort_order ?? i, is_active: true,
    }));
    if (rows.length) { const { error } = await admin.from("erp_creative_caption_templates").insert(rows); if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 }); }
  }

  // ช่องทางร้าน (เฉพาะเมื่อมีแบรนด์)
  if (brandId && Array.isArray(body.shop_channels)) {
    const clean = body.shop_channels.filter((c) => c.label?.trim() || c.value?.trim()).map((c) => ({ label: (c.label ?? "").trim(), value: (c.value ?? "").trim() }));
    const { error } = await admin.from("brands").update({ shop_channels: clean }).eq("id", brandId);
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  }

  await writeAudit(admin, { action: "update", entityType: "caption_templates", entityId: brandId ?? "global", actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { count: body.templates?.length ?? 0 } });
  return NextResponse.json({ data: { ok: true }, error: null });
}
