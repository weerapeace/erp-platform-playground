import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type Notification = {
  id:            string;
  user_id:       string;
  event_type:    string;
  title:         string;
  body:          string | null;
  link_url:      string | null;
  entity_type:   string | null;
  entity_id:     string | null;
  priority:      "low" | "normal" | "high";
  read_at:       string | null;
  created_at:    string;
  pinned_at:     string | null;
  snoozed_until: string | null;
  due_at:        string | null;
};

export type NotificationsResponse = {
  data:           Notification[];
  unread_count:   number;
  error:          string | null;
};

// notification ของคนอื่นในทีม (สำหรับ owner/manager) + ชื่อผู้รับ
export type TeamNotification = Notification & {
  recipient_name:  string;
  recipient_color: string | null;
};

export type TeamNotificationsResponse = {
  data:    TeamNotification[];
  allowed: boolean;           // false = user ไม่มีสิทธิ์ notifications.view_team
  error:   string | null;
};

// ---- GET — list + unread count ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit          = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "30")));
  const unreadOnly     = searchParams.get("unread_only") === "true";
  const includeSnoozed = searchParams.get("include_snoozed") === "true";

  const scope  = searchParams.get("scope");
  const client = supabaseFromRequest(request);

  // ---- scope=team: ภาพรวมทีม (เฉพาะคนมีสิทธิ์ notifications.view_team) ----
  if (scope === "team") {
    const [{ data: allowed }, { data: teamList, error: teamErr }] = await Promise.all([
      client.rpc("erp_can", { p_permission: "notifications.view_team" }),
      client.rpc("erp_notifications_team_list", { p_limit: limit, p_include_snoozed: true }),
    ]);
    if (teamErr) {
      return NextResponse.json({ data: [], allowed: !!allowed, error: teamErr.message } satisfies TeamNotificationsResponse, { status: 500 });
    }
    return NextResponse.json({ data: (teamList as TeamNotification[]) ?? [], allowed: !!allowed, error: null } satisfies TeamNotificationsResponse);
  }

  const [{ data: list, error: listErr }, { data: unread, error: countErr }] = await Promise.all([
    client.rpc("erp_notifications_list", { p_limit: limit, p_unread_only: unreadOnly, p_include_snoozed: includeSnoozed }),
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

// ---- PATCH — mark read (single/all) + pin/snooze ----

type PatchBody = {
  id?:     string;
  all?:    boolean;
  action?: "pin" | "snooze";
  value?:  boolean;         // pin: true = ปักหมุด, false = เลิกปักหมุด
  until?:  string | null;   // snooze: ISO timestamp, null = ยกเลิกการเลื่อน
};

export async function PATCH(request: NextRequest) {
  let body: PatchBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const client = supabaseFromRequest(request);

  // ปักหมุด / เลิกปักหมุด
  if (body.action === "pin" && body.id) {
    const { data, error } = await client.rpc("erp_notifications_pin", { p_id: body.id, p_pinned: body.value ?? true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: data, error: null });
  }
  // เลื่อนดูทีหลัง / ยกเลิกการเลื่อน
  if (body.action === "snooze" && body.id) {
    const { data, error } = await client.rpc("erp_notifications_snooze", { p_id: body.id, p_until: body.until ?? null });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: data, error: null });
  }
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
