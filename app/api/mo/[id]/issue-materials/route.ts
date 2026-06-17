/**
 * POST /api/mo/[id]/issue-materials — เบิกวัตถุดิบของใบสั่งผลิตออกจากคลัง (− out ตาม required_qty)
 * body: { warehouse_id, actor? }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { friendlyDbError } from "../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  const { id } = await params;
  let body: { warehouse_id?: string; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.warehouse_id) return NextResponse.json({ error: "ต้องระบุคลังที่เบิก" }, { status: 400 });

  const { data, error } = await supabaseAdmin().rpc("erp_mo_issue_materials", {
    p_mo_id: id, p_warehouse_id: body.warehouse_id, p_actor: body.actor ?? user.email ?? "system",
  });
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  return NextResponse.json({ ok: true, issued_lines: data, error: null });
}
