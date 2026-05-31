export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type Comment = {
  id:                  string;
  entity_type:         string;
  entity_id:           string;
  user_id:             string;
  user_name:           string | null;
  user_email:          string | null;
  body:                string;
  mentioned_user_ids:  string[];
  parent_id:           string | null;
  edited:              boolean;
  deleted_at:          string | null;
  created_at:          string;
  updated_at:          string;
};

export type CommentsResponse = { data: Comment[]; error: string | null };

// ---- GET ?entity_type=...&entity_id=... ----
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const et = searchParams.get("entity_type");
  const id = searchParams.get("entity_id");
  if (!et || !id) return NextResponse.json({ data: [], error: "entity_type & entity_id required" } satisfies CommentsResponse, { status: 400 });

  const { data, error } = await supabaseFromRequest(request).rpc("erp_comments_list", {
    p_entity_type: et, p_entity_id: id,
  });
  if (error) return NextResponse.json({ data: [], error: error.message } satisfies CommentsResponse, { status: 500 });
  return NextResponse.json({ data: (data as Comment[]) ?? [], error: null } satisfies CommentsResponse);
}

// ---- POST create ----
type CreateBody = {
  entity_type: string; entity_id: string; body: string;
  parent_id?: string; actor?: string;
};
export async function POST(request: NextRequest) {
  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.entity_type || !body.entity_id || !body.body?.trim()) {
    return NextResponse.json({ error: "entity_type, entity_id, body จำเป็น" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_comments_create", {
    p_entity_type: body.entity_type,
    p_entity_id:   body.entity_id,
    p_body:        body.body.trim(),
    p_parent_id:   body.parent_id ?? null,
    p_actor:       body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

// ---- PATCH update body ----
type PatchBody = { id: string; body: string; actor?: string };
export async function PATCH(request: NextRequest) {
  let b: PatchBody;
  try { b = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!b.id || !b.body?.trim()) return NextResponse.json({ error: "id, body required" }, { status: 400 });
  const { data, error } = await supabaseFromRequest(request).rpc("erp_comments_update", {
    p_id: b.id, p_body: b.body.trim(), p_actor: b.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

// ---- DELETE ?id=... ----
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id    = searchParams.get("id");
  const actor = searchParams.get("actor");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data, error } = await supabaseFromRequest(request).rpc("erp_comments_delete", {
    p_id: id, p_actor: actor,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
