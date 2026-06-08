/**
 * แบรนด์ (Brands) — สำหรับตั้งสีประจำแบรนด์ (ใช้ทำกรอบการ์ดบนบอร์ดจ่ายงาน)
 * GET   /api/brands         → รายชื่อแบรนด์ + สี
 * PATCH /api/brands         → ตั้งสี { id, color }
 * อ่าน/เขียนผ่าน supabaseAdmin + ตรวจ login
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type Brand = { id: string; name: string; color: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ data: [], error: "ต้อง login" }, { status: 401 });
  const { data, error } = await supabaseAdmin().from("brands").select("id, name, color").eq("is_active", true).order("name", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as Brand[], error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: { id?: string; color?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ไม่พบแบรนด์" }, { status: 400 });
  const color = body.color && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : null;

  const admin = supabaseAdmin();
  const { error } = await admin.from("brands").update({ color }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "brand", entityId: body.id, actorId: user.id, actorName: user.email ?? null, metadata: { color } });
  return NextResponse.json({ id: body.id, color, error: null });
}
