/**
 * ภาษาที่ผู้ใช้เลือก (ต่อบัญชี) — เก็บใน user_profiles.language
 * GET  → { language }   (ของผู้ใช้ที่ล็อกอิน)
 * POST { language: 'th' | 'en' } → บันทึก
 * ผูกกับบัญชีตัวเอง (ใช้ user.id จาก session) → ตั้งได้เฉพาะของตัวเอง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ language: "th", error: null });
  const { data } = await supabaseAdmin().from("user_profiles").select("language").eq("id", user.id).maybeSingle();
  const lang = data?.language === "en" ? "en" : "th";
  return NextResponse.json({ language: lang, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: { language?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const lang = body.language === "en" ? "en" : "th";
  const { error } = await supabaseAdmin().from("user_profiles")
    .update({ language: lang, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, language: lang, error: null });
}
