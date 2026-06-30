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
import { SELECT, flattenContent, attachAssignees } from "./shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const search   = (searchParams.get("search") ?? "").trim();
  const status   = (searchParams.get("status") ?? "").trim();
  const campaign = (searchParams.get("campaign_id") ?? "").trim();
  const brandId  = (searchParams.get("brand_id") ?? "").trim();
  const platform = (searchParams.get("platform") ?? "").trim();
  const taskId   = (searchParams.get("task_id") ?? "").trim();   // คอนเทนต์ของงานนี้
  const onlyUnlinked = searchParams.get("unlinked") === "1";     // เฉพาะคอนเทนต์ที่ยังไม่ผูกงาน (สำหรับ "แนบ")
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
  if (taskId)   q = q.eq("task_id", taskId);
  if (onlyUnlinked) q = q.is("task_id", null);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ data: [], total: 0, error: friendlyDbError(error.message) }, { status: 500 });
  const items = ((data ?? []) as Record<string, unknown>[]).map(flattenContent);
  await attachAssignees(admin, items);
  return NextResponse.json({ data: items, total: count ?? items.length, error: null });
}

type Caption = { platform: string; caption?: string | null; hashtags?: string | null; caption_type?: string | null };
type CreateBody = {
  title?: string; task_id?: string | null; campaign_id?: string | null; brand_id?: string | null; sku_id?: string | null; parent_sku_id?: string | null; product_name?: string | null;
  post_type?: string | null; platforms?: string[]; status?: string; scheduled_at?: string | null;
  product_links?: { platform: string; url: string }[]; note?: string | null; captions?: Caption[]; is_template?: boolean;
  discount_value?: number | null; discount_is_percent?: boolean; assignee_id?: string | null; assignee_ids?: string[];
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
    content_no: no, title, task_id: body.task_id || null, campaign_id: body.campaign_id || null, brand_id: body.brand_id || null,
    sku_id: body.sku_id || null, parent_sku_id: body.parent_sku_id || null, product_name: body.product_name?.trim() || null, post_type: body.post_type || null,
    platforms: body.platforms ?? [], status: body.status || "draft", scheduled_at: body.scheduled_at || null,
    product_links: body.product_links ?? [], note: body.note?.trim() || null, is_template: !!body.is_template, created_by: user?.id ?? null,
    discount_value: body.discount_value ?? null, discount_is_percent: !!body.discount_is_percent,
    assignee_ids: Array.isArray(body.assignee_ids) ? body.assignee_ids : (body.assignee_id ? [body.assignee_id] : []),
    assignee_id: (Array.isArray(body.assignee_ids) ? body.assignee_ids[0] : body.assignee_id) || null,
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
