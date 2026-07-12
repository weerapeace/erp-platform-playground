/**
 * /api/dashboard/panels — ตั้งค่าการ์ดระบบบนแดชบอร์ด (erp_dashboard_panels)
 *
 * GET             → รายการตั้งค่าทั้งหมด (อ่านได้ทุก user ที่ login — ใช้ render แดชบอร์ด)
 * PATCH {app_key,patch} → ตั้งค่าระบบ (upsert) — ต้องมีสิทธิ์ admin.users
 *
 * ต่อยอด: [[menu_nested_dropdown]] pattern · reuse erp_app_groups เป็น "ระบบ"
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { DashboardPanel } from "@/lib/dashboard-systems";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requireAdmin(request: NextRequest): Promise<string | null> {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: "admin.users" });
  if (error) return error.message;
  if (data !== true) return "ไม่มีสิทธิ์ตั้งค่าแดชบอร์ด (admin.users)";
  return null;
}

export async function GET(request: NextRequest) {
  const { data, error } = await supabaseFromRequest(request)
    .from("erp_dashboard_panels").select("app_key, hidden, enabled_events, visible_roles, sort_order");
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as DashboardPanel[], error: null },
    { headers: { "Cache-Control": "private, max-age=30" } });
}

export async function PATCH(request: NextRequest) {
  const err = await requireAdmin(request);
  if (err) return NextResponse.json({ error: err }, { status: 403 });
  let body: { app_key?: string; patch?: Partial<DashboardPanel> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.app_key || !body.patch) return NextResponse.json({ error: "ต้องมี app_key + patch" }, { status: 400 });
  const { app_key: _drop, ...patch } = body.patch as Record<string, unknown>;
  void _drop;
  const { data, error } = await supabaseAdmin()
    .from("erp_dashboard_panels")
    .upsert({ app_key: body.app_key, ...patch, updated_at: new Date().toISOString() }, { onConflict: "app_key" })
    .select("app_key, hidden, enabled_events, visible_roles, sort_order").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
