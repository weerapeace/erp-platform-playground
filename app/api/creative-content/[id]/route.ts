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
import { SELECT, flattenContent, attachAssignees, validateContentFields } from "../shared";
import { r2ImageUrl } from "@/lib/r2-image";

// รูปหน้าปกของคอนเทนต์ (ให้การ์ดบนกระดานแคมเปญโชว์รูป) — ลำดับ: สื่อที่แนบ(รูป) → รูป SKU → รูปงานที่ผูก
async function resolveContentCover(admin: ReturnType<typeof supabaseAdmin>, contentId: string, flat: Record<string, unknown>): Promise<string | null> {
  const { data: att } = await admin.from("erp_creative_attachments").select("r2_key").eq("content_id", contentId).eq("kind", "image").not("r2_key", "is", null).order("created_at", { ascending: true }).limit(1);
  if (att?.[0]?.r2_key) return r2ImageUrl(String(att[0].r2_key), 480);
  const skuId = flat.sku_id as string | null;
  if (skuId) { const { data: sk } = await admin.from("skus_v2").select("cover_image_r2_key").eq("id", skuId).maybeSingle(); if (sk?.cover_image_r2_key) return r2ImageUrl(String(sk.cover_image_r2_key), 480); }
  const taskId = flat.task_id as string | null;
  if (taskId) { const { data: tk } = await admin.from("erp_creative_tasks").select("cover_image_r2_key").eq("id", taskId).maybeSingle(); if (tk?.cover_image_r2_key) return r2ImageUrl(String(tk.cover_image_r2_key), 480); }
  return null;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EDITABLE = new Set(["title", "task_id", "campaign_id", "brand_id", "sku_id", "parent_sku_id", "product_name", "post_type", "platforms", "status", "scheduled_at", "published_url", "posted_links", "post_status", "platform_images", "note", "discount_value", "discount_is_percent", "color_source", "template_icon", "assignee_id", "assignee_ids"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_content").select(SELECT).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 500 });
  if (!data) return NextResponse.json({ error: "ไม่พบคอนเทนต์" }, { status: 404 });
  const { data: caps } = await admin.from("erp_creative_content_captions").select("*").eq("content_id", id).order("sort_order", { ascending: true });
  const flat = flattenContent(data as Record<string, unknown>);
  await attachAssignees(admin, [flat]);
  const cover_image_url = await resolveContentCover(admin, id, flat);
  return NextResponse.json({ data: { ...flat, captions: caps ?? [], cover_image_url }, error: null });
}

type Caption = { platform: string; caption?: string | null; hashtags?: string | null; caption_type?: string | null };
type PatchBody = Record<string, unknown> & { captions?: Caption[]; product_links?: { platform: string; url: string }[] };

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: PatchBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  // ── ล็อกคอนเทนต์ที่ "เผยแพร่แล้ว" — แก้เนื้อหาหลักไม่ได้ (แก้ได้เฉพาะสถานะโพสต์/ลิงก์/โน้ต) จนกว่าจะย้อนสถานะ ──
  const LOCKED_WHEN_PUBLISHED = ["title", "brand_id", "campaign_id", "sku_id", "parent_sku_id", "product_name", "post_type", "platforms", "discount_value", "discount_is_percent", "captions", "color_source"];
  const { data: curC } = await admin.from("erp_creative_content").select("status").eq("id", id).maybeSingle();
  const curStatus = (curC as { status?: string } | null)?.status ?? "";
  const unlocking = "status" in body && body.status !== "published";   // กำลังย้อนสถานะออกจากเผยแพร่ = ปลดล็อก
  if (curStatus === "published" && !unlocking) {
    const touched = LOCKED_WHEN_PUBLISHED.filter((k) => k in body);
    if (touched.length) return NextResponse.json({ error: "คอนเทนต์นี้เผยแพร่แล้ว — แก้เนื้อหาไม่ได้ ต้องเปลี่ยนสถานะกลับก่อน" }, { status: 400 });
  }
  // ── ตรวจข้อมูลก่อนบันทึก ──
  const cErr = validateContentFields(body);
  if (cErr) return NextResponse.json({ error: cErr }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) if (EDITABLE.has(k)) patch[k] = v === "" ? null : v;
  if (Array.isArray(body.product_links)) patch.product_links = body.product_links;
  // m2m ผู้รับผิดชอบ: ตั้ง assignee_id (เดี่ยว) = คนแรก ให้ back-compat
  if (Array.isArray((body as { assignee_ids?: string[] }).assignee_ids)) { const arr = (body as { assignee_ids: string[] }).assignee_ids; patch.assignee_ids = arr; patch.assignee_id = arr[0] ?? null; }
  if (patch.status === "published" && !("published_url" in patch && !patch.published_url)) patch.published_at = new Date().toISOString();

  if (Object.keys(patch).length > 1 || !body.captions) {
    const { error } = await admin.from("erp_creative_content").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  }

  // แทนที่ captions ทั้งชุด (ถ้าส่งมา)
  if (Array.isArray(body.captions)) {
    await admin.from("erp_creative_content_captions").delete().eq("content_id", id);
    const caps = body.captions.filter((c) => c?.platform).map((c, i) => ({ content_id: id, platform: c.platform, caption: c.caption ?? null, hashtags: c.hashtags ?? null, caption_type: c.caption_type ?? "short", sort_order: i }));
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
