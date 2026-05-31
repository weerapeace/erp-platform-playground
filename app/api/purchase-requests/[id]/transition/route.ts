export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- POST /api/purchase-requests/[id]/transition ----
//
// Body: { action: "submit"|"approve"|"reject"|"cancel", actor?, reason? }

type TransitionBody = {
  action: "submit" | "approve" | "reject" | "cancel";
  actor?:  string;
  reason?: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: TransitionBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!body.action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_pr_transition", {
    p_id:     id,
    p_action: body.action,
    p_actor:  body.actor  ?? null,
    p_reason: body.reason ?? null,
  });

  if (error) {
    console.error("[api/purchase-requests/[id]/transition] POST", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data, error: null });
}
