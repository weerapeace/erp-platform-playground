/**
 * Generic Lookups — single value PATCH / DELETE
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

const ALLOWED = ["name", "code", "sort_order", "parent_id", "is_active", "metadata"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  for (const k of ALLOWED) if (body[k] !== undefined) patch[k] = body[k];
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มี field ที่ update" }, { status: 400 });

  const supabase = supabaseFromRequest(request);
  const { data, error } = await supabase
    .from("erp_lookups")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

// DELETE — default: soft delete (is_active=false) · ?hard=1: ลบจริงออกจากตาราง
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const hard = new URL(request.url).searchParams.get("hard") === "1";
  const supabase = supabaseFromRequest(request);
  const { error } = hard
    ? await supabase.from("erp_lookups").delete().eq("id", id)
    : await supabase.from("erp_lookups").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
