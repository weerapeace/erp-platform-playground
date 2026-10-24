/**
 * 💬 เริ่มผูกบัญชี Discord — ผู้ใช้ที่ล็อกอิน ERP อยู่ → พาไปหน้ายืนยันของ Discord (scope identify เท่านั้น)
 * GET /api/account/discord-link/start?json=1 (apiFetch ส่ง token) → { url } แล้วหน้าเว็บพาไปเอง  ← หน้า /account/discord ใช้ตัวนี้
 *   (ERP เก็บล็อกอินใน localStorage ไม่ใช่ cookie — ลิงก์ <a href> ธรรมดาไม่มี token ติดไป = เซิร์ฟเวอร์คิดว่ายังไม่ล็อกอิน)
 * GET /api/account/discord-link/start (ไม่มี json) → redirect ตรง (ใช้ได้เฉพาะเมื่อมี cookie ล็อกอิน)
 * กลับมาที่ /api/account/discord-link/callback · state เซ็นด้วย DISCORD_CLIENT_SECRET (ใครเริ่ม + หมดอายุ 15 นาที) กันคนอื่นปลอมมาผูก
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { discordAuthorizeUrl, discordReady, discordSignState } from "@/lib/discord";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = new URL(request.url).origin;
  const asJson = request.nextUrl.searchParams.get("json") === "1";
  const back = (q: string) => NextResponse.redirect(`${origin}/account/discord?${q}`);
  if (!discordReady().link) {
    return asJson ? NextResponse.json({ url: null, error: "ระบบยังไม่ได้ตั้งค่าส่วนผูกบัญชี Discord (DISCORD_CLIENT_SECRET) — แจ้งแอดมิน" }, { status: 503 }) : back("err=not-ready");
  }
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) {
    return asJson ? NextResponse.json({ url: null, error: "ต้องเข้าสู่ระบบ ERP ก่อน" }, { status: 401 }) : NextResponse.redirect(`${origin}/login?next=${encodeURIComponent("/account/discord")}`);
  }
  const url = discordAuthorizeUrl(discordSignState(user.id), `${origin}/api/account/discord-link/callback`);
  return asJson ? NextResponse.json({ url, error: null }) : NextResponse.redirect(url);
}
