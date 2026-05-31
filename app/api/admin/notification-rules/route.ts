export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type RecipientType = "role" | "user" | "approvers" | "requester" | "mentioned";

export type Recipient = {
  type:  RecipientType;
  value?: string;   // role_key หรือ user_id
};

export type NotificationRule = {
  id:              string;
  event_type:      string;
  name:            string;
  description:     string | null;
  recipients:      Recipient[];
  title_template:  string;
  body_template:   string | null;
  link_pattern:    string | null;
  priority:        "low" | "normal" | "high";
  exclude_actor:   boolean;
  active:          boolean;
  sort_order:      number;
  notes:           string | null;
  created_at:      string;
  updated_at:      string;
};

export type NotificationRulesResponse = {
  data:  NotificationRule[];
  error: string | null;
};

// ---- GET ?event_type=... (optional) ----
export async function GET(request: NextRequest) {
  const et = new URL(request.url).searchParams.get("event_type");
  const { data, error } = await supabaseFromRequest(request).rpc("erp_notification_rules_list", {
    p_event_type: et || null,
  });
  if (error) return NextResponse.json({ data: [], error: error.message } satisfies NotificationRulesResponse, { status: 500 });
  return NextResponse.json({ data: (data as NotificationRule[]) ?? [], error: null } satisfies NotificationRulesResponse);
}

// ---- POST/PATCH upsert ----
type UpsertBody = Partial<NotificationRule> & {
  event_type: string; name: string; title_template: string;
  actor?: string;
};

async function upsert(request: NextRequest) {
  let body: UpsertBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!body.event_type || !body.name || !body.title_template) {
    return NextResponse.json({ error: "event_type, name, title_template จำเป็น" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_notification_rules_upsert", {
    p_id:             body.id ?? null,
    p_event_type:     body.event_type,
    p_name:           body.name,
    p_description:    body.description ?? null,
    p_recipients:     body.recipients ?? [],
    p_title_template: body.title_template,
    p_body_template:  body.body_template ?? null,
    p_link_pattern:   body.link_pattern ?? null,
    p_priority:       body.priority ?? "normal",
    p_exclude_actor:  body.exclude_actor ?? true,
    p_active:         body.active ?? true,
    p_sort_order:     body.sort_order ?? 100,
    p_notes:          body.notes ?? null,
    p_actor:          body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
export const POST  = upsert;
export const PATCH = upsert;

// ---- DELETE ?id=... ----
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id    = searchParams.get("id");
  const actor = searchParams.get("actor");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data, error } = await supabaseFromRequest(request).rpc("erp_notification_rules_delete", {
    p_id: id, p_actor: actor,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
