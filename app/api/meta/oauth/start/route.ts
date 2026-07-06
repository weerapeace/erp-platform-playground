/**
 * เริ่มเชื่อมต่อ Facebook — /api/meta/oauth/start?brand_id=...
 * เปิดจากปุ่ม "เชื่อมต่อ Facebook" (top-level navigation) → เด้งไปหน้าอนุญาตของ Facebook
 * state เข้ารหัสพา brand_id ไปด้วย · callback จะกลับมาที่ /api/meta/oauth/callback
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { metaConfigured, metaAuthUrl } from "@/lib/meta-graph";
import { baseUrl, metaRedirectUri, buildState } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  const back = (msg: string) => NextResponse.redirect(`${baseUrl()}/admin/platform-accounts?meta_error=${encodeURIComponent(msg)}`);
  if (!metaConfigured()) return back("ยังไม่ได้ตั้งค่า META_APP_ID / META_APP_SECRET ในระบบ (Vercel)");
  if (!brandId) return back("ต้องเลือกแบรนด์ก่อนเชื่อมต่อ");
  const state = await buildState(brandId);
  return NextResponse.redirect(metaAuthUrl(metaRedirectUri(), state));
}
