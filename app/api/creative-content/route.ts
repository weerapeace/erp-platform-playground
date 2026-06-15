/**
 * Creative Content API — โพสต์ social (list + create)
 *
 * GET  /api/creative-content?search=&status=&campaign_id=&brand_id=&platform=&include_inactive=1
 * POST /api/creative-content  body = { title, ...fields, captions?: [{platform, caption, hashtags}] }
 *
 * ของกลาง: guardApi (tasks.*) + writeAudit. Join brands / campaigns / skus_v2.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../master-v2/[entity]/route";
import { nextContentNo } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const SELECT = `id, content_no, title, campaign_id, brand_id, sku_id, product_name, post_type,
  platforms, status, approval_status, scheduled_at, published_at, published_url, product_links, note,
  is_template, is_active, created_at, updated_at,
  brand:brands!brand_id(name, color),
  campaign:erp_creative_campaigns!campaign_id(name),
  sku:skus_v2!sku_id(code, name_th, color, color_th, list_price)`;

export function flattenContent(r: Record<string, unknown>): Record<string, unknown> {
  const b = (Array.isArray(r.brand) ? r.brand[0] : r.brand) as { name?: string; color?: string | null } | null;
  const c = (Array.isArray(r.campaign) ? r.campaign[0] : r.campaign) as { name?: string } | null;
  const s = (Array.isArray(r.sku) ? r.sku[0] : r.sku) as { code?: string; name_th?: string; color?: string | null; color_th?: string | null; list_price?: number | null } | null;
  const out: Record<string, unknown> = { ...r };
  delete out.brand; delete out.campaign; delete out.sku;
  out.brand_label = b?.name ?? null;
  out.brand_color = b?.color ?? null;
  out.campaign_label = c?.name ?? null;
  out.sku_code = s?.code ?? null;
  out.sku_name = s?.name_th ?? null;
  out.sku_color = (s?.color_th as string) ?? (s?.color as string) ?? null;
  out.sku_price = s?.list_price ?? null;
  return out;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const search   = (searchParams.get("search") ?? "").trim();
  const status   = (searchParams.get("status") ?? "").trim();
  const campaign = (searchParams.get("campaign_id") ?? "").trim();
  const brandId  = (searchParams.get("brand_id") ?? "").trim();
  const platform = (searchParams.get("platform") ?? "").trim();
  const includeInactive = searchParams.get("include_inactive") === "1";
  const templatesOnly = searchParams.get("templates") === "1";

  const admin = supabaseAdmin();
  let q = admin.from("erp_creative_content").select(SELECT, { count: "exact" })
    .order("updated_at", { ascending: false }).limit(500);
  q = q.eq("is_template", templatesOnly); // ปกติ=คอนเทนต์จริง, ?templates=1=แม่แบบ
  if (!includeInactive) q = q.eq("is_active", true);
  if (search)   { const t = `%${search}%`; q = q.or(`title.ilike.${t},content_no.ilike.${t}`); }
  if (status)   q = q.eq("status", status);
  if (campaign) q = q.eq("campaign_id", campaign);
  if (brandId)  q = q.eq("brand_id", brandId);
  if (platform) q = q.contains("platforms", [platform]);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ data: [], total: 0, error: friendlyDbError(error.message) }, { status: 500 });
  const items = ((data ?? []) as Record<string, unknown>[]).map(flattenContent);
  return NextResponse.json({ data: items, total: count ?? items.length, error: null });
}

type Caption = { platform: string; caption?: string | null; hashtags?: string | null; caption_type?: string | null };
type CreateBody = {
  title?: string; campaign_id?: string | null; brand_id?: string | null; sku_id?: string | null; product_name?: string | null;
  post_type?: string | null; platforms?: string[]; status?: string; scheduled_at?: string | null;
  product_links?: { platform: string; url: string }[]; note?: string | null; captions?: Caption[]; is_template?: boolean;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.create"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: CreateBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "กรุณาใส่ชื่อคอนเทนต์" }, { status: 400 });

  const admin = supabaseAdmin();
  const row = (no: string) => ({
    content_no: no, title, campaign_id: body.campaign_id || null, brand_id: body.brand_id || null,
    sku_id: body.sku_id || null, product_name: body.product_name?.trim() || null, post_type: body.post_type || null,
    platforms: body.platforms ?? [], status: body.status || "draft", scheduled_at: body.scheduled_at || null,
    product_links: body.product_links ?? [], note: body.note?.trim() || null, is_template: !!body.is_template, created_by: user?.id ?? null,
  });

  let no = await nextContentNo(admin);
  let { data: created, error } = await admin.from("erp_creative_content").insert(row(no)).select("id, content_no").single();
  if (error && /duplicate|unique/i.test(error.message)) {
    no = await nextContentNo(admin);
    ({ data: created, error } = await admin.from("erp_creative_content").insert(row(no)).select("id, content_no").single());
  }
  if (error || !created) return NextResponse.json({ error: friendlyDbError(error?.message ?? "insert failed") }, { status: 400 });

  // captions เริ่มต้น (ถ้าส่งมา)
  if (Array.isArray(body.captions) && body.captions.length > 0) {
    const caps = body.captions.filter((c) => c?.platform).map((c, i) => ({ content_id: created!.id, platform: c.platform, caption: c.caption ?? null, hashtags: c.hashtags ?? null, caption_type: c.caption_type ?? "short", sort_order: i }));
    if (caps.length) await admin.from("erp_creative_content_captions").insert(caps);
  }

  await writeAudit(admin, { action: "create", entityType: "creative_content", entityId: created.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { content_no: no, title } });
  return NextResponse.json({ id: created.id, content_no: no, error: null });
}
