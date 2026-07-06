/**
 * เริ่มเชื่อมต่อ Lazada — /api/lazada/oauth/start?brand_id=...
 * เรียกผ่าน apiFetch (แนบ Bearer token) → คืน { auth_url } ให้ client พาไปหน้าอนุญาตของ Lazada
 * state เข้ารหัสพา brand_id ไปด้วย · callback กลับมาที่ /api/lazada/callback
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { lazConfigured, lazAuthUrl } from "@/lib/lazada";
import { lazRedirectUri, buildState } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  if (!lazConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้ง LAZADA_APP_KEY / LAZADA_APP_SECRET ในระบบ (Vercel)" }, { status: 400 });
  if (!brandId) return NextResponse.json({ error: "ต้องเลือกแบรนด์ก่อนเชื่อมต่อ" }, { status: 400 });
  const state = await buildState(brandId);
  return NextResponse.json({ auth_url: lazAuthUrl(lazRedirectUri(), state), error: null });
}
