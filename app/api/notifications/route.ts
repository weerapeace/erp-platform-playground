import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type Notification = {
  id:          string;
  user_id:     string;
  event_type:  string;
  title:       string;
  body:        string | null;
  link_url:    string | null;
  entity_type: string | null;
  entity_id:   string | null;
  priority:    "low" | "normal" | "high";
  read_at:     string | null;
  created_at:  string;
};

export type NotificationsResponse = {
  data:           Notification[];
  unread_count:   number;
  error:          string | null;
};

// ---- GET — list + unread count ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit       = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "30")));
  const unreadOnly  = searchParams.get("unread_only") === "true";

  const client = supabaseFromRequest(request);
  const [{ data: list, error: listErr }, { data: unread, error: countErr }] = await Promise.all([
    client.rpc("erp_notifications_list", { p_limit: limit, p_unread_only: unreadOnly }),
    client.rpc("erp_notifications_unread_count"),
  ]);

  if (listErr || countErr) {
    return NextResponse.json({ data: [], unread_count: 0, error: (listErr ?? countErr)?.message ?? "error" } satisfies NotificationsResponse, { status: 500 });
  }

  return NextResponse.json({
    data: (list as Notification[]) ?? [],
    unread_count: Number(unread ?? 0),
    error: null,
  } satisfies NotificationsResponse);
}

// ---- PATCH — mark read (single หรือ all) ----

type PatchBody = { id?: string; all?: boolean };

export async function PATCH(request: NextRequest) {
  let body: PatchBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const client = supabaseFromRequest(request);
  if (body.all) {
    const { data, error } = await client.rpc("erp_notifications_mark_all_read");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ marked: data, error: null });
  }
  if (body.id) {
    const { data, error } = await client.rpc("erp_notifications_mark_read", { p_id: body.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: data, error: null });
  }
  return NextResponse.json({ error: "id หรือ all required" }, { status: 400 });
}
