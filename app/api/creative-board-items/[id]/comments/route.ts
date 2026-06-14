/**
 * Board item — คอมเมนต์ + @mention
 * GET  /api/creative-board-items/[id]/comments
 * POST /api/creative-board-items/[id]/comments  { body, mentions?: string[] (user_profiles.id) }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../../../master-v2/[entity]/route";
import { notify } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_creative_board_comments").select("*").eq("item_id", id).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { body?: string; mentions?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const text = (body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "พิมพ์ข้อความก่อนส่ง" }, { status: 400 });
  const mentions = Array.isArray(body.mentions) ? body.mentions.filter(Boolean) : [];

  const admin = supabaseAdmin();
  const { data: item } = await admin.from("erp_creative_board_items").select("board_id").eq("id", id).maybeSingle();
  const { data: row, error } = await admin.from("erp_creative_board_comments").insert({
    item_id: id, board_id: (item?.board_id as string) ?? null, author_id: user?.id ?? null, author_name: user?.email ?? null, body: text, mentions,
  }).select("*").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  // แจ้งเตือนผู้ถูก @mention (user จริง)
  for (const uid of mentions.slice(0, 20)) {
    if (uid && uid !== user?.id) await notify(admin, { userId: uid, eventType: "board_mention", title: "ถูกพูดถึงในกระดาน Brainstorm", body: text.slice(0, 120), linkUrl: "/projects", entityId: id });
  }
  return NextResponse.json({ data: row, error: null });
}
