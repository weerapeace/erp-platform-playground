/**
 * 💬 ผูกบัญชี Discord ของฉัน — สถานะ / ยกเลิก (หน้า /account/discord)
 * GET    → { linked, discord_username, ready: { bot, buttons, link } }
 * DELETE → ยกเลิกการผูกของฉัน (audit)
 * เริ่มผูก = GET /api/account/discord-link/start (พาไปยืนยันกับ Discord แล้วกลับมาที่ /callback)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { discordReady } from "@/lib/discord";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function me(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const u = await me(request);
  if (!u) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const { data } = await supabaseAdmin().from("erp_discord_links").select("discord_username, linked_at").eq("user_id", u.id).maybeSingle();
  const row = data as { discord_username: string | null; linked_at: string } | null;
  return NextResponse.json({ linked: !!row, discord_username: row?.discord_username ?? null, linked_at: row?.linked_at ?? null, ready: discordReady(), error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const u = await me(request);
  if (!u) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_discord_links").delete().eq("user_id", u.id).select("discord_user_id, discord_username");
  if (error) return NextResponse.json({ error: "ยกเลิกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  if (data?.length) await writeAudit(admin, { action: "delete", entityType: "discord_link", entityId: u.id, actorId: u.id, actorName: u.email, metadata: data[0] as Record<string, unknown> });
  return NextResponse.json({ ok: true, error: null });
}
