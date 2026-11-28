/**
 * 🎬 Video Shot — อ่านลิงก์ที่วาง → แพลตฟอร์ม + ชื่อคลิป + ภาพปก + เวลาที่ติดมากับลิงก์ (learn.manage · ใช้เติมฟอร์มก่อนบันทึก)
 * GET /api/learn/shots/meta?url=<ลิงก์>
 * ลิงก์สั้น (pin.it / vt.tiktok.com) ย่อให้ · ไม่ดาวน์โหลดไฟล์วิดีโอ · ดึงข้อมูลไม่ได้ = ยังใช้ลิงก์ได้ (แค่ไม่มีชื่อ/ภาพปก)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { LEARN_MANAGE } from "@/lib/learn";
import { fetchShotMeta, resolveShotLink } from "@/lib/video-shot-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, LEARN_MANAGE); if (denied) return denied;
  const raw = (new URL(request.url).searchParams.get("url") ?? "").trim();
  const link = await resolveShotLink(raw);
  if (!link) return NextResponse.json({ data: null, error: "ลิงก์นี้ยังไม่รองรับ — ใช้ลิงก์ YouTube / TikTok / Pinterest / Instagram" }, { status: 400 });
  if (!link.id) return NextResponse.json({ data: null, error: "ลิงก์สั้นนี้เปิดไม่ได้ ลองเปิดในแอปแล้ว copy ลิงก์เต็มมาวาง" }, { status: 400 });
  const meta = await fetchShotMeta(link).catch(() => ({ title: null, thumb_url: null }));
  return NextResponse.json({ data: { ...link, ...meta }, error: null }, { headers: { "Cache-Control": "private, max-age=600" } });
}
