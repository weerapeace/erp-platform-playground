/**
 * สีธีม (accent) ของผู้ใช้ — เก็บใน user_profiles.theme_color
 * GET  → { theme_color }
 * POST { theme_color: '#rrggbb' | null } → บันทึก (null = ใช้ค่า default)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ theme_color: null, error: null });
  const { data } = await supabaseAdmin().from("user_profiles").select("theme_color").eq("id", user.id).maybeSingle();
  return NextResponse.json({ theme_color: (data?.theme_color as string) ?? null, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: { theme_color?: string | null };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const c = body.theme_color && /^#[0-9a-fA-F]{6}$/.test(body.theme_color) ? body.theme_color : null;
  const { error } = await supabaseAdmin().from("user_profiles")
    .update({ theme_color: c, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, theme_color: c, error: null });
}
