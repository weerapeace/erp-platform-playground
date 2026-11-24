/**
 * เริ่มเชื่อม Meta Ads (อ่านยอดโฆษณา) — GET /api/marketing/ads/meta/start?brand_id=
 * เจ้าของเลือก 2026-11-24 (แผนการตลาด รอบ 3 ข้อ 6) · ขอสิทธิ์ ads_read (อ่านอย่างเดียว) แยกจากการเชื่อมเพจเพื่อโพสต์
 * ใช้ callback เดิม /api/meta/oauth/callback (ไม่ต้องลงทะเบียน URL ใหม่ใน Meta) — state ขึ้นต้น "ads:" = โหมดโฆษณา
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { metaAuthUrl, metaConfigured } from "@/lib/meta-graph";
import { META_ADS_SCOPES } from "@/lib/meta-ads";
import { buildState, metaRedirectUri } from "@/app/api/meta/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  if (!metaConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า META_APP_ID / META_APP_SECRET ในระบบ (Vercel)" }, { status: 400 });
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  if (!brandId) return NextResponse.json({ error: "เลือกแบรนด์ก่อนเชื่อม Meta Ads" }, { status: 400 });
  return NextResponse.json({ auth_url: metaAuthUrl(metaRedirectUri(), await buildState(`ads:${brandId}`), META_ADS_SCOPES), error: null });
}
