/**
 * เริ่มเชื่อมต่อ Shopee — /api/shopee/oauth/start?brand_id=...
 * เรียกผ่าน apiFetch (แนบ Bearer token) → คืน { auth_url } ให้ client พาไปหน้าอนุญาตของ Shopee
 * state เข้ารหัสพา brand_id ไปด้วย (ติดไปกับ redirect) · Shopee พากลับที่ /api/shopee/callback
 * โดเมนของ redirect ต้องตรงกับ Redirect URL Domain ในหน้าแอป Shopee (ตั้งเป็น https://erp-platform-playground.vercel.app)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { shopeeConfigured, shopeeAuthUrl } from "@/lib/shopee";
import { buildState, shopeeRedirectUri } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  if (!shopeeConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้ง SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY ในระบบ (Vercel)" }, { status: 400 });
  if (!brandId) return NextResponse.json({ error: "ต้องเลือกแบรนด์ก่อนเชื่อมต่อ" }, { status: 400 });
  const state = await buildState(brandId);
  return NextResponse.json({ auth_url: await shopeeAuthUrl(shopeeRedirectUri(state)), error: null });
}
