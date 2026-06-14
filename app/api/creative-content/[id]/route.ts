/**
 * Creative Content — รายตัว (detail พร้อม captions / update / soft-delete)
 *
 * GET    /api/creative-content/[id]   → คอนเทนต์ + captions (ต่อแพลตฟอร์ม)
 * PATCH  /api/creative-content/[id]   → แก้ฟิลด์ + แทนที่ captions/product_links ทั้งชุด (ถ้าส่งมา)
 *          status -> published จะ set published_at อัตโนมัติ
 * DELETE /api/creative-content/[id]   → soft delete
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { SELECT, flattenContent } from "../route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EDITABLE = new Set(["title", "campaign_id", "brand_id", "sku_id", "product_name", "post_type", "platforms", "status", "scheduled_at", "published_url", "note"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_content").select(SELECT).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 500 });
  if (!data) return NextResponse.json({ error: "ไม่พบคอนเทนต์" }, { status: 404 });
  const { data: caps } = await admin.from("erp_creative_content_captions").select("*").eq("content_id", id).order("sort_order", { ascending: true });
  return NextResponse.json({ data: { ...flattenContent(data as Record<string, unknown>), captions: caps ?? [] }, error: null });
}

type Caption = { platform: string; caption?: string | null; hashtags?: string | null };
type PatchBody = Record<string, unknown> & { captions?: Caption[]; product_links?: { platform: string; url: string }[] };

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: PatchBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) if (EDITABLE.has(k)) patch[k] = v === "" ? null : v;
  if (Array.isArray(body.product_links)) patch.product_links = body.product_links;
  if (patch.status === "published" && !("published_url" in patch && !patch.published_url)) patch.published_at = new Date().toISOString();

  if (Object.keys(patch).length > 1 || !body.captions) {
    const { error } = await admin.from("erp_creative_content").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  }

  // แทนที่ captions ทั้งชุด (ถ้าส่งมา)
  if (Array.isArray(body.captions)) {
    await admin.from("erp_creative_content_captions").delete().eq("content_id", id);
    const caps = body.captions.filter((c) => c?.platform).map((c, i) => ({ content_id: id, platform: c.platform, caption: c.caption ?? null, hashtags: c.hashtags ?? null, sort_order: i }));
    if (caps.length) { const { error: cErr } = await admin.from("erp_creative_content_captions").insert(caps); if (cErr) return NextResponse.json({ error: friendlyDbError(cErr.message) }, { status: 400 }); }
  }

  await writeAudit(admin, { action: "update", entityType: "creative_content", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { changes: Object.keys(patch).filter((k) => k !== "updated_at") } });

  const { data: fresh } = await admin.from("erp_creative_content").select(SELECT).eq("id", id).maybeSingle();
  const { data: caps2 } = await admin.from("erp_creative_content_captions").select("*").eq("content_id", id).order("sort_order", { ascending: true });
  return NextResponse.json({ data: fresh ? { ...flattenContent(fresh as Record<string, unknown>), captions: caps2 ?? [] } : null, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.delete"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_creative_content").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "creative_content", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ success: true, error: null });
}
