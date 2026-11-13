/**
 * เริ่มเชื่อมต่อ Lazada — /api/lazada/oauth/start?brand_id=...
 * เรียกผ่าน apiFetch (แนบ Bearer token) → คืน { auth_url } ให้ client พาไปหน้าอนุญาตของ Lazada
 * state เข้ารหัสพา brand_id ไปด้วย · callback กลับมาที่ /api/lazada/callback
 * แบรนด์ที่ตั้งแอปของตัวเอง (app_key/app_secret) → เปิดหน้าอนุญาตด้วยแอปนั้น · ไม่ได้ตั้ง = แอปกลาง (env)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { lazConfigured, lazAuthUrl } from "@/lib/lazada";
import { lazRedirectUri, buildState, getPlatformId, loadLazApp, LAZ_APP_BROKEN } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  if (!brandId) return NextResponse.json({ error: "ต้องเลือกแบรนด์ก่อนเชื่อมต่อ" }, { status: 400 });
  const admin = supabaseAdmin();
  const lazId = await getPlatformId(admin, "lazada");
  if (!lazId) return NextResponse.json({ error: "ไม่พบแพลตฟอร์ม lazada ในระบบ" }, { status: 400 });
  const app = await loadLazApp(admin, brandId, lazId);
  if (app && !app.secret) return NextResponse.json({ error: LAZ_APP_BROKEN }, { status: 400 });
  if (!lazConfigured(app)) return NextResponse.json({ error: "ยังไม่ได้ตั้ง LAZADA_APP_KEY / LAZADA_APP_SECRET ในระบบ (Vercel) และแบรนด์นี้ยังไม่ได้ใส่กุญแจแอปของตัวเอง" }, { status: 400 });
  const state = await buildState(brandId);
  return NextResponse.json({ auth_url: lazAuthUrl(lazRedirectUri(), state, app), error: null });
}
