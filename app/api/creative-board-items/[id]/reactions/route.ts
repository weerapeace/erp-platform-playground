/**
 * Board item — reaction (vote/pin/like) toggle รายคน
 * POST /api/creative-board-items/[id]/reactions  { type }  → toggle (มี=ลบ, ไม่มี=เพิ่ม)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TYPES = new Set(["vote", "pin", "like"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: { type?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const type = String(body.type ?? "");
  if (!TYPES.has(type)) return NextResponse.json({ error: "ชนิดไม่ถูกต้อง" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("erp_creative_board_reactions").select("id").eq("item_id", id).eq("user_id", user.id).eq("type", type).maybeSingle();
  let active: boolean;
  if (existing) { await admin.from("erp_creative_board_reactions").delete().eq("id", existing.id); active = false; }
  else { const { error } = await admin.from("erp_creative_board_reactions").insert({ item_id: id, user_id: user.id, type }); if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 }); active = true; }
  return NextResponse.json({ active, error: null });
}
