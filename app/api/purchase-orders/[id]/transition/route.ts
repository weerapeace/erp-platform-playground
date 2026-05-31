export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

type Body = { action: string; actor?: string; reason?: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_po_transition", {
    p_id: id, p_action: body.action, p_actor: body.actor ?? null, p_reason: body.reason ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
