import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import type { PRLine } from "../route";

// ---- GET /api/purchase-requests/[id] (detail + lines) ----

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data, error } = await supabase.rpc("erp_playground_pr_get", { p_id: id });

  if (error) {
    console.error("[api/purchase-requests/[id]] GET", error);
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data, error: null });
}

// ---- PATCH /api/purchase-requests/[id] (update draft) ----

type UpdateBody = {
  title?: string; requester_name?: string; department?: string; note?: string; lines?: PRLine[]; actor?: string;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: UpdateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_pr_update", {
    p_id:             id,
    p_title:          body.title          ?? null,
    p_requester_name: body.requester_name ?? null,
    p_department:     body.department     ?? null,
    p_note:           body.note           ?? null,
    p_lines:          body.lines ?? null,
    p_actor:          body.actor          ?? null,
  });

  if (error) {
    console.error("[api/purchase-requests/[id]] PATCH", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data, error: null });
}
