/**
 * ค่าปรับแต่ง UI ต่อผู้ใช้ (per-user, key-value jsonb) — /api/user-prefs
 * GET ?key=tasks_overview_theme → { value }   (ของผู้ใช้ที่ล็อกอินเท่านั้น)
 * PATCH { key, value } → upsert ของตัวเอง
 * ของกลาง: ตาราง user_ui_prefs (RLS เจ้าของเท่านั้น) · ใช้ user JWT (ไม่ต้องสิทธิ์พิเศษ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ value: {}, error: "unauthenticated" }, { status: 401 });
  const key = (new URL(request.url).searchParams.get("key") ?? "").trim();
  if (!key) return NextResponse.json({ value: {}, error: "ต้องระบุ key" }, { status: 400 });
  const { data, error } = await client.from("user_ui_prefs").select("value").eq("user_id", user.id).eq("key", key).maybeSingle();
  if (error) return NextResponse.json({ value: {}, error: error.message }, { status: 500 });
  return NextResponse.json({ value: (data as { value?: Record<string, unknown> } | null)?.value ?? {}, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let body: { key?: string; value?: Record<string, unknown> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const key = (body.key ?? "").trim();
  if (!key) return NextResponse.json({ error: "ต้องระบุ key" }, { status: 400 });
  const { error } = await client.from("user_ui_prefs")
    .upsert({ user_id: user.id, key, value: body.value ?? {}, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, error: null });
}
