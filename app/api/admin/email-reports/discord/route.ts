/**
 * 💬 ตัวเลือก Discord สำหรับหน้าตั้งค่ารายงาน — ห้อง/บทบาทของทุกเซิร์ฟเวอร์ที่บอทอยู่ + สถานะการตั้งบอท
 * GET /api/admin/email-reports/discord → { ready: { bot, buttons, link }, invite_url, channels, roles, error }
 * สิทธิ์: admin.email_reports
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { DiscordError, discordGuildOptions, discordInviteUrl, discordReady } from "@/lib/discord";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.email_reports"); if (denied) return denied;
  const ready = discordReady();
  const invite_url = discordInviteUrl();
  if (!ready.bot) return NextResponse.json({ ready, invite_url, channels: [], roles: [], error: null });
  try {
    const { channels, roles } = await discordGuildOptions();
    return NextResponse.json({ ready, invite_url, channels, roles, error: channels.length ? null : "บอทยังไม่ได้อยู่ในเซิร์ฟเวอร์ไหน — เชิญบอทเข้าเซิร์ฟเวอร์ก่อน (คู่มือขั้นที่ 6)" });
  } catch (e) {
    return NextResponse.json({ ready, invite_url, channels: [], roles: [], error: e instanceof DiscordError ? e.message : "โหลดห้อง Discord ไม่สำเร็จ" });
  }
}
