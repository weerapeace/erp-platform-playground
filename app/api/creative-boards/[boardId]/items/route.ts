/**
 * Board items — list + create
 * GET  /api/creative-boards/[boardId]/items   → items (sku_card resolve ข้อมูลสินค้า)
 * POST /api/creative-boards/[boardId]/items   → { item_type, title?, content?, url?, r2_key?, sku_id?, x,y,width,height, color?, google_slides_url? }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SELECT = `id, board_id, item_type, title, content, url, r2_key, thumbnail_url, sku_id, parent_sku_id, task_id,
  google_slides_url, x, y, width, height, rotation, z_index, color, tags, status, data, created_at, updated_at,
  sku:skus_v2!sku_id(code, name_th, color_th, color, list_price, cover_image_r2_key)`;

export function flattenItem(r: Record<string, unknown>): Record<string, unknown> {
  const s = (Array.isArray(r.sku) ? r.sku[0] : r.sku) as Record<string, unknown> | null;
  const out: Record<string, unknown> = { ...r };
  delete out.sku;
  if (s) out.sku_info = { code: s.code ?? null, name: s.name_th ?? null, color: (s.color_th as string) ?? (s.color as string) ?? null, price: s.list_price ?? null, image_key: s.cover_image_r2_key ?? null };
  return out;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { boardId } = await params;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_board_items").select(SELECT).eq("board_id", boardId).order("z_index", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  return NextResponse.json({ data: ((data ?? []) as Record<string, unknown>[]).map(flattenItem), error: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { boardId } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const itemType = String(body.item_type ?? "");
  if (!itemType) return NextResponse.json({ error: "ต้องระบุชนิด item" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: maxRow } = await admin.from("erp_creative_board_items").select("z_index").eq("board_id", boardId).order("z_index", { ascending: false }).limit(1);
  const z = ((maxRow?.[0]?.z_index as number) ?? 0) + 1;
  const { data, error } = await admin.from("erp_creative_board_items").insert({
    board_id: boardId, item_type: itemType, title: (body.title as string) || null, content: (body.content as string) || null,
    url: (body.url as string) || null, r2_key: (body.r2_key as string) || null, thumbnail_url: (body.thumbnail_url as string) || null,
    sku_id: (body.sku_id as string) || null, parent_sku_id: (body.parent_sku_id as string) || null, task_id: (body.task_id as string) || null,
    google_slides_url: (body.google_slides_url as string) || null,
    x: typeof body.x === "number" ? body.x : 80, y: typeof body.y === "number" ? body.y : 80,
    width: typeof body.width === "number" ? body.width : 240, height: typeof body.height === "number" ? body.height : 140,
    color: (body.color as string) || null, z_index: z, created_by: user?.id ?? null,
  }).select(SELECT).single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "board:add_item", entityType: "creative_board", entityId: boardId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { item_type: itemType } });
  return NextResponse.json({ data: flattenItem(data as Record<string, unknown>), error: null });
}
