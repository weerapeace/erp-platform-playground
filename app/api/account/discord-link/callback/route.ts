/**
 * 💬 กลับจากหน้ายืนยันของ Discord — ตรวจ state → แลก code เป็นบัญชี Discord → บันทึกการผูก → กลับหน้า /account/discord
 * GET /api/account/discord-link/callback?code=&state=
 * บัญชี Discord หนึ่ง ผูกได้กับผู้ใช้ ERP คนเดียว (ผูกกับคนอื่นอยู่ = ไม่ยอม) · ผูกใหม่ทับของเดิมของตัวเองได้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { DiscordError, discordReadState, discordUserFromCode } from "@/lib/discord";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const back = (q: string) => NextResponse.redirect(`${url.origin}/account/discord?${q}`);
  if (url.searchParams.get("error")) return back("err=cancelled");   // กดยกเลิกที่หน้า Discord
  const userId = discordReadState(url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!userId || !code) return back("err=expired");

  let du: { id: string; username: string };
  try { du = await discordUserFromCode(code, `${url.origin}/api/account/discord-link/callback`); }
  catch (e) { console.error("[discord-link]", e instanceof DiscordError ? e.message : e); return back("err=discord"); }

  const admin = supabaseAdmin();
  const { data: taken } = await admin.from("erp_discord_links").select("user_id").eq("discord_user_id", du.id).maybeSingle();
  if (taken && (taken as { user_id: string }).user_id !== userId) return back("err=taken");
  const { error } = await admin.from("erp_discord_links").upsert(
    { user_id: userId, discord_user_id: du.id, discord_username: du.username, linked_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) { console.error("[discord-link] save", error.message); return back("err=save"); }
  await writeAudit(admin, { action: "create", entityType: "discord_link", entityId: userId, actorId: userId, actorName: du.username, metadata: { discord_user_id: du.id, discord_username: du.username } });
  return back("ok=1");
}
