/**
 * Creative Project — รายตัว
 * GET    /api/creative-projects/[id]  → project + board_id + skus + labels
 * PATCH  /api/creative-projects/[id]  → แก้ฟิลด์ (ชื่อ/สถานะ/slides/drive/pm/summary...)
 * DELETE /api/creative-projects/[id]  → soft delete
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { userLabelMap } from "@/lib/creative-tasks-server";
import { r2DeleteObject } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EDITABLE = new Set(["name", "status", "brand_id", "campaign_id", "pm_id", "google_slides_url", "drive_folder_url", "summary", "note"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data: p, error } = await admin.from("erp_creative_projects")
    .select("*, brand:brands!brand_id(name, color), parent:parent_skus_v2!parent_sku_id(code, name_th), campaign:erp_creative_campaigns!campaign_id(name)")
    .eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 500 });
  if (!p) return NextResponse.json({ error: "ไม่พบโปรเจกต์" }, { status: 404 });

  const [{ data: board }, { data: skus }] = await Promise.all([
    admin.from("erp_creative_boards").select("id, name, status").eq("project_id", id).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    admin.from("erp_creative_project_skus").select("sku_id, parent_sku_id, role, sku:skus_v2!sku_id(code, name_th, color_th, color, list_price, cover_image_r2_key)").eq("project_id", id),
  ]);

  const c = p as Record<string, unknown>;
  const b = (Array.isArray(c.brand) ? c.brand[0] : c.brand) as { name?: string; color?: string | null } | null;
  const par = (Array.isArray(c.parent) ? c.parent[0] : c.parent) as { code?: string; name_th?: string } | null;
  const camp = (Array.isArray(c.campaign) ? c.campaign[0] : c.campaign) as { name?: string } | null;
  const pmMap = await userLabelMap(admin, [c.pm_id as string]);

  const skuList = ((skus ?? []) as Record<string, unknown>[]).map((s) => {
    const sk = (Array.isArray(s.sku) ? s.sku[0] : s.sku) as Record<string, unknown> | null;
    return { sku_id: s.sku_id, role: s.role, code: sk?.code ?? null, name: sk?.name_th ?? null, color: (sk?.color_th as string) ?? (sk?.color as string) ?? null, price: sk?.list_price ?? null, image_key: sk?.cover_image_r2_key ?? null };
  });

  return NextResponse.json({ data: {
    id: c.id, code: c.code, name: c.name, status: c.status,
    parent_sku_id: c.parent_sku_id, parent_sku_code: par?.code ?? null, parent_sku_name: par?.name_th ?? null,
    brand_id: c.brand_id, brand_label: b?.name ?? null, brand_color: b?.color ?? null,
    campaign_id: c.campaign_id, campaign_label: camp?.name ?? null,
    pm_id: c.pm_id, pm_label: pmMap.get(String(c.pm_id)) ?? null,
    google_slides_url: c.google_slides_url, drive_folder_url: c.drive_folder_url,
    summary: c.summary ?? {}, note: c.note,
    board_id: (board as { id?: string } | null)?.id ?? null,
    skus: skuList,
  }, error: null });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) if (EDITABLE.has(k)) patch[k] = v === "" ? null : v;
  if (Object.keys(patch).length === 1) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้ไข" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_creative_projects").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "creative_project", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { changes: Object.keys(patch).filter((k) => k !== "updated_at") } });
  return NextResponse.json({ success: true, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.delete"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_creative_projects").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  // เก็บกวาดไฟล์รูปใน R2 ของทุกกระดานในโปรเจกต์ (best-effort)
  try {
    const { data: boards } = await admin.from("erp_creative_boards").select("id").eq("project_id", id);
    const boardIds = (boards ?? []).map((b) => b.id as string);
    if (boardIds.length) {
      const { data: imgs } = await admin.from("erp_creative_board_items").select("r2_key").in("board_id", boardIds).eq("item_type", "image").not("r2_key", "is", null);
      const keys = [...new Set((imgs ?? []).map((r) => r.r2_key as string).filter(Boolean))];
      for (const k of keys) { try { await r2DeleteObject(k); } catch { /* best-effort */ } }
    }
  } catch { /* ไม่ให้พังการลบโปรเจกต์ */ }

  await writeAudit(admin, { action: "delete", entityType: "creative_project", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ success: true, error: null });
}
