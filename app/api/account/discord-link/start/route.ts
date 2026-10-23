/**
 * 💬 เริ่มผูกบัญชี Discord — ผู้ใช้ที่ล็อกอิน ERP อยู่ (cookie) → พาไปหน้ายืนยันของ Discord (scope identify เท่านั้น)
 * GET /api/account/discord-link/start → redirect · กลับมาที่ /api/account/discord-link/callback
 * state เซ็นด้วย DISCORD_CLIENT_SECRET (ใครเริ่ม + หมดอายุ 15 นาที) กันคนอื่นปลอมมาผูก
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { discordAuthorizeUrl, discordReady, discordSignState } from "@/lib/discord";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = new URL(request.url).origin;
  const back = (q: string) => NextResponse.redirect(`${origin}/account/discord?${q}`);
  if (!discordReady().link) return back("err=not-ready");
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent("/account/discord")}`);
  return NextResponse.redirect(discordAuthorizeUrl(discordSignState(user.id), `${origin}/api/account/discord-link/callback`));
}
