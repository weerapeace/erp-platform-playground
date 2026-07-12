/**
 * /api/dashboard/layouts — หน้าแดชบอร์ดต่อตำแหน่ง (erp_dashboard_layouts) — เฟส 3 Role Board
 * GET              → layout ทุก role (อ่านได้ทุก user — /dashboard ใช้เลือกของ role ตัวเอง)
 * PATCH {role_key,patch} → ตั้ง layout ของ role (upsert) — ต้องมีสิทธิ์ admin.users
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { DashboardLayout } from "@/lib/dashboard-widgets";

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
    .from("erp_dashboard_layouts").select("role_key, widgets, default_view");
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as DashboardLayout[], error: null },
    { headers: { "Cache-Control": "private, max-age=30" } });
}

export async function PATCH(request: NextRequest) {
  const err = await requireAdmin(request);
  if (err) return NextResponse.json({ error: err }, { status: 403 });
  let body: { role_key?: string; patch?: Partial<DashboardLayout> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.role_key || !body.patch) return NextResponse.json({ error: "ต้องมี role_key + patch" }, { status: 400 });
  const { role_key: _drop, ...patch } = body.patch as Record<string, unknown>;
  void _drop;
  const { data, error } = await supabaseAdmin()
    .from("erp_dashboard_layouts")
    .upsert({ role_key: body.role_key, ...patch, updated_at: new Date().toISOString() }, { onConflict: "role_key" })
    .select("role_key, widgets, default_view").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
