export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type ApprovalRule = {
  id:            string;
  entity_type:   string;
  label:         string;
  min_amount:    number | null;
  max_amount:    number | null;
  department:    string | null;
  required_role: "admin" | "manager" | "staff";
  priority:      number;
  active:        boolean;
  notes:         string | null;
  created_at:    string;
  updated_at:    string;
};

export type ApprovalRulesResponse = {
  data:  ApprovalRule[];
  error: string | null;
};

// ---- GET — list (optionally filter entity_type) ----

export async function GET(request: NextRequest) {
  const entityType = new URL(request.url).searchParams.get("entity_type");
  const { data, error } = await supabaseFromRequest(request).rpc("erp_approval_rules_list", {
    p_entity_type: entityType ?? null,
  });
  if (error) {
    return NextResponse.json({ data: [], error: error.message } satisfies ApprovalRulesResponse, { status: 500 });
  }
  return NextResponse.json({ data: (data as ApprovalRule[]) ?? [], error: null } satisfies ApprovalRulesResponse);
}

// ---- POST/PATCH — upsert (id null = create) ----

type UpsertBody = {
  id?:            string;
  entity_type:    string;
  label:          string;
  min_amount?:    number | null;
  max_amount?:    number | null;
  department?:    string | null;
  required_role:  "admin" | "manager" | "staff";
  priority?:      number;
  active?:        boolean;
  notes?:         string | null;
  actor?:         string;
};

async function upsert(request: NextRequest) {
  let body: UpsertBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!body.entity_type || !body.label || !body.required_role) {
    return NextResponse.json({ error: "entity_type, label, required_role จำเป็น" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_approval_rules_upsert", {
    p_id:            body.id            ?? null,
    p_entity_type:   body.entity_type,
    p_label:         body.label,
    p_min_amount:    body.min_amount    ?? null,
    p_max_amount:    body.max_amount    ?? null,
    p_department:    body.department    ?? null,
    p_required_role: body.required_role,
    p_priority:      body.priority      ?? 100,
    p_active:        body.active        ?? true,
    p_notes:         body.notes         ?? null,
    p_actor:         body.actor         ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export const POST  = upsert;
export const PATCH = upsert;

// ---- DELETE — ?id=... ----

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id    = searchParams.get("id");
  const actor = searchParams.get("actor");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await supabaseFromRequest(request).rpc("erp_approval_rules_delete", {
    p_id: id, p_actor: actor,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
