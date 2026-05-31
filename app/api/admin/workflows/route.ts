export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type WorkflowDefinition = {
  entity_type:   string;
  label:         string;
  initial_state: string;
  active:        boolean;
  notes:         string | null;
  created_at:    string;
  updated_at:    string;
};

export type WorkflowState = {
  id:          string;
  entity_type: string;
  state_key:   string;
  label:       string;
  color:       "slate" | "blue" | "amber" | "emerald" | "red" | "purple";
  is_terminal: boolean;
  lock_edit:   boolean;
  sort_order:  number;
};

export type WorkflowTransition = {
  id:                  string;
  entity_type:         string;
  action_key:          string;
  label:               string;
  from_state:          string;
  to_state:            string;
  required_permission: string | null;
  use_approval_rule:   boolean;
  require_reason:      boolean;
  side_effects:        string[];
  sort_order:          number;
};

export type WorkflowFull = {
  definition:  WorkflowDefinition;
  states:      WorkflowState[];
  transitions: WorkflowTransition[];
};

// ---- GET ?entity_type=... → คืน full workflow, ไม่มี = list defs ----

export async function GET(request: NextRequest) {
  const entityType = new URL(request.url).searchParams.get("entity_type");
  const client = supabaseFromRequest(request);
  if (entityType) {
    const { data, error } = await client.rpc("erp_workflow_get", { p_entity_type: entityType });
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    return NextResponse.json({ data: data as WorkflowFull | null, error: null });
  }
  const { data, error } = await client.rpc("erp_workflow_list_definitions");
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data as WorkflowDefinition[]) ?? [], error: null });
}

// ---- PATCH — toggle active OR upsert state/transition ----

type PatchBody =
  | { kind: "active";     entity_type: string; active: boolean; actor?: string }
  | { kind: "state";      state: Partial<WorkflowState> & { entity_type: string; state_key: string; label: string }; actor?: string }
  | { kind: "transition"; transition: Partial<WorkflowTransition> & {
      entity_type: string; action_key: string; label: string; from_state: string; to_state: string;
    }; actor?: string };

export async function PATCH(request: NextRequest) {
  let body: PatchBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const client = supabaseFromRequest(request);

  if (body.kind === "active") {
    const { data, error } = await client.rpc("erp_workflow_set_active", {
      p_entity_type: body.entity_type, p_active: body.active, p_actor: body.actor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  }

  if (body.kind === "state") {
    const s = body.state;
    const { data, error } = await client.rpc("erp_workflow_state_upsert", {
      p_id:          s.id ?? null,
      p_entity_type: s.entity_type,
      p_state_key:   s.state_key,
      p_label:       s.label,
      p_color:       s.color ?? "slate",
      p_is_terminal: s.is_terminal ?? false,
      p_lock_edit:   s.lock_edit ?? false,
      p_sort_order:  s.sort_order ?? 100,
      p_actor:       body.actor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  }

  if (body.kind === "transition") {
    const t = body.transition;
    const { data, error } = await client.rpc("erp_workflow_transition_upsert", {
      p_id:                  t.id ?? null,
      p_entity_type:         t.entity_type,
      p_action_key:          t.action_key,
      p_label:               t.label,
      p_from_state:          t.from_state,
      p_to_state:            t.to_state,
      p_required_permission: t.required_permission ?? null,
      p_use_approval_rule:   t.use_approval_rule ?? false,
      p_require_reason:      t.require_reason ?? false,
      p_side_effects:        t.side_effects ?? [],
      p_sort_order:          t.sort_order ?? 100,
      p_actor:               body.actor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  }

  return NextResponse.json({ error: "kind ไม่ถูกต้อง" }, { status: 400 });
}

// ---- DELETE ?kind=state|transition&id=... ----

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const kind  = searchParams.get("kind");
  const id    = searchParams.get("id");
  const actor = searchParams.get("actor");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const client = supabaseFromRequest(request);
  const fn = kind === "transition" ? "erp_workflow_transition_delete" : "erp_workflow_state_delete";
  const { data, error } = await client.rpc(fn, { p_id: id, p_actor: actor });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
