/**
 * เริ่มเชื่อมต่อ TikTok Shop — /api/tiktok-shop/oauth/start?brand_id=...
 * เรียกผ่าน apiFetch (แนบ Bearer token) → คืน { auth_url } ให้ client พาไปหน้าอนุญาตของ TikTok
 * state เข้ารหัสพา brand_id ไปด้วย · TikTok เรียกกลับที่ /api/tiktok-shop/callback (ตั้งเป็น Redirect URL ในแอปแล้ว)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { ttsConfigured, ttsAuthUrl } from "@/lib/tiktok-shop";
import { buildState } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  if (!ttsConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้ง TIKTOK_SHOP_APP_KEY / TIKTOK_SHOP_APP_SECRET / TIKTOK_SHOP_SERVICE_ID ในระบบ (Vercel)" }, { status: 400 });
  if (!brandId) return NextResponse.json({ error: "ต้องเลือกแบรนด์ก่อนเชื่อมต่อ" }, { status: 400 });
  const state = await buildState(brandId);
  return NextResponse.json({ auth_url: ttsAuthUrl(state), error: null });
}
