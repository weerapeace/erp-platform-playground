/**
 * เริ่มเชื่อมต่อ Facebook — /api/meta/oauth/start?brand_id=...
 * เรียกผ่าน apiFetch (แนบ Bearer token) → คืน { auth_url } ให้ client พาเบราว์เซอร์ไปหน้าอนุญาต Facebook
 * (เปิดลิงก์ตรงจากเบราว์เซอร์ไม่ได้ เพราะ token อยู่ใน header ไม่ใช่ cookie → guardApi จะไม่รู้จักผู้ใช้)
 * state เข้ารหัสพา brand_id ไปด้วย · callback จะกลับมาที่ /api/meta/oauth/callback
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { metaConfigured, metaAuthUrl } from "@/lib/meta-graph";
import { metaRedirectUri, buildState } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  if (!metaConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า META_APP_ID / META_APP_SECRET ในระบบ (Vercel)" }, { status: 400 });
  if (!brandId) return NextResponse.json({ error: "ต้องเลือกแบรนด์ก่อนเชื่อมต่อ" }, { status: 400 });
  const state = await buildState(brandId);
  return NextResponse.json({ auth_url: metaAuthUrl(metaRedirectUri(), state), error: null });
}
