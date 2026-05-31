export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type AdminSavedView = {
  id:          string;
  table_id:    string;
  label:       string;
  config:      Record<string, unknown>;
  owner_id:    string;
  owner_name:  string | null;
  owner_email: string | null;
  visibility:  "personal" | "team" | "system";
  is_default:  boolean;
  description: string | null;
  created_at:  string;
  updated_at:  string;
};

export type AdminSavedViewsResponse = {
  data:  AdminSavedView[];
  error: string | null;
};

// ---- GET — list ทั้งหมด ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tableId   = searchParams.get("table_id");
  const visibility = searchParams.get("visibility");
  const { data, error } = await supabaseFromRequest(request).rpc("erp_admin_saved_views_list", {
    p_table_id:   tableId   || null,
    p_visibility: visibility || null,
  });
  if (error) {
    return NextResponse.json({ data: [], error: error.message } satisfies AdminSavedViewsResponse, { status: 500 });
  }
  return NextResponse.json({ data: (data as AdminSavedView[]) ?? [], error: null } satisfies AdminSavedViewsResponse);
}

// ---- PATCH — change visibility หรือ set/clear default ----

type PatchBody = {
  id:         string;
  visibility?: "personal" | "team" | "system";
  is_default?: boolean;
  actor?:     string;
};

export async function PATCH(request: NextRequest) {
  let body: PatchBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const client = supabaseFromRequest(request);
  let result;

  if (body.visibility) {
    const { data, error } = await client.rpc("erp_admin_saved_views_set_visibility", {
      p_id: body.id, p_visibility: body.visibility, p_actor: body.actor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = data;
  }
  if (body.is_default !== undefined) {
    if (body.is_default) {
      const { data, error } = await client.rpc("erp_admin_saved_views_set_default", {
        p_id: body.id, p_actor: body.actor ?? null,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      result = data;
    } else {
      const { error } = await client.rpc("erp_admin_saved_views_clear_default", {
        p_id: body.id, p_actor: body.actor ?? null,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ data: result, error: null });
}

// ---- DELETE ?id=... ----

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id    = searchParams.get("id");
  const actor = searchParams.get("actor");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_saved_views_delete", {
    p_id: id, p_actor: actor,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
