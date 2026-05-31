export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type SavedView = {
  id:          string;
  table_id:    string;
  label:       string;
  config:      Record<string, unknown>;
  owner_id:    string;
  owner_name:  string | null;
  visibility:  "personal" | "team" | "system";
  is_default:  boolean;
  description: string | null;
  created_at:  string;
  updated_at:  string;
};

// ---- GET /api/saved-views?table_id=... ----
export async function GET(request: NextRequest) {
  const tableId = new URL(request.url).searchParams.get("table_id");
  if (!tableId) return NextResponse.json({ data: [], error: "table_id required" }, { status: 400 });

  const { data, error } = await supabaseFromRequest(request)
    .rpc("erp_playground_saved_views_list", { p_table_id: tableId });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data as SavedView[]) ?? [], error: null });
}

// ---- POST /api/saved-views ----
export async function POST(request: NextRequest) {
  let body: {
    table_id: string; label: string; config: Record<string, unknown>;
    visibility?: "personal" | "team" | "system"; description?: string; actor?: string;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const { data, error } = await supabaseFromRequest(request)
    .rpc("erp_playground_saved_views_create", {
      p_table_id:    body.table_id,
      p_label:       body.label,
      p_config:      body.config ?? {},
      p_visibility:  body.visibility ?? "personal",
      p_description: body.description ?? null,
      p_actor:       body.actor ?? null,
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

// ---- DELETE /api/saved-views?id=... ----
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id    = searchParams.get("id");
  const actor = searchParams.get("actor");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseFromRequest(request)
    .rpc("erp_playground_saved_views_delete", { p_id: id, p_actor: actor });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, error: null });
}
