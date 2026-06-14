/**
 * Board item — รายตัว (PATCH ย้าย/แก้/สถานะ/แท็ก, DELETE)
 * PATCH  /api/creative-board-items/[id]
 * DELETE /api/creative-board-items/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { flattenItem } from "../../creative-boards/[boardId]/items/route";
import { r2DeleteObject } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EDITABLE = new Set(["title", "content", "url", "r2_key", "thumbnail_url", "sku_id", "task_id", "google_slides_url", "x", "y", "width", "height", "rotation", "z_index", "color", "tags", "status", "data"]);
const SELECT = `id, board_id, item_type, title, content, url, r2_key, thumbnail_url, sku_id, parent_sku_id, task_id,
  google_slides_url, x, y, width, height, rotation, z_index, color, tags, status, data, created_at, updated_at,
  sku:skus_v2!sku_id(code, name_th, color_th, color, list_price, cover_image_r2_key)`;

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
  const { data, error } = await admin.from("erp_creative_board_items").update(patch).eq("id", id).select(SELECT).single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  // ไม่ audit ทุกการลาก (ย้ายตำแหน่งบ่อย) — audit เฉพาะเปลี่ยนสถานะ
  if ("status" in body) await writeAudit(admin, { action: `board:item_${body.status}`, entityType: "creative_board_item", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ data: flattenItem(data as Record<string, unknown>), error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  // อ่านก่อนลบ — เผื่อเป็นรูปจะได้ลบไฟล์ใน R2 ด้วย
  const { data: item } = await admin.from("erp_creative_board_items").select("item_type, r2_key").eq("id", id).maybeSingle();
  const { error } = await admin.from("erp_creative_board_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  // ลบไฟล์รูปใน R2 (เฉพาะเมื่อไม่มี item อื่นใช้ key เดียวกัน) — best-effort ไม่ให้พังการลบหลัก
  const r2Key = (item?.r2_key as string | null) ?? null;
  if (item?.item_type === "image" && r2Key) {
    try {
      const { count } = await admin.from("erp_creative_board_items").select("id", { count: "exact", head: true }).eq("r2_key", r2Key);
      if ((count ?? 0) === 0) await r2DeleteObject(r2Key);
    } catch { /* ไฟล์ R2 ลบไม่ได้ก็ไม่เป็นไร — row ลบแล้ว */ }
  }

  await writeAudit(admin, { action: "board:delete_item", entityType: "creative_board_item", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { item_type: item?.item_type } });
  return NextResponse.json({ success: true, error: null });
}
