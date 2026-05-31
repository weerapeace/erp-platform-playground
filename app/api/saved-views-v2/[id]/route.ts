/**
 * Saved Views API — single view
 *
 * PATCH  /api/saved-views/<id>   — update (RLS เคารพ owner)
 * DELETE /api/saved-views/<id>   — delete (RLS เคารพ owner)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

const ALLOWED_PATCH_FIELDS = [
  "view_label", "description",
  "is_default", "display_order",
  "columns_config", "filters", "sort_config",
  "search_text", "page_size", "group_by", "density",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // alias: label → view_label
  if (body.label !== undefined && body.view_label === undefined) body.view_label = body.label;

  const patch: Record<string, unknown> = {};
  for (const k of ALLOWED_PATCH_FIELDS) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "ไม่มี field ที่ update" }, { status: 400 });
  }

  const supabase = supabaseFromRequest(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const { data, error } = await supabase
    .from("erp_saved_views")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  const supabase = supabaseFromRequest(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  // soft delete = set is_active=false (กันลบ system โดยพลาด — RLS จะกัน is_locked เพิ่มอีกชั้น)
  const { error } = await supabase
    .from("erp_saved_views")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
