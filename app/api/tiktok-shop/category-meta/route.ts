/**
 * ช่องคุณลักษณะ + กติกาของหมวด TikTok สำหรับลิ้นชักสินค้าบนร้าน (อ่านอย่างเดียว · ไม่แตะร้าน)
 *  GET ?listing_id=&category_id=   (products.platforms.view)
 *  → { fields: TtsAttrField[] | null, rules: TtsCategoryRules | null, error }
 * กุญแจร้าน = ของแบรนด์ที่รายการนี้อยู่ · แคช 10 นาที (ttsCategoryMeta ใน ../shared — ใช้ร่วมกับหน้าลงฉบับร่าง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { ttsCategoryMeta, ttsTokenOrReason } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const listingId = (request.nextUrl.searchParams.get("listing_id") ?? "").trim();
  const categoryId = (request.nextUrl.searchParams.get("category_id") ?? "").trim();
  if (!listingId || !/^\d+$/.test(categoryId)) return reply({ fields: null, rules: null, error: "ต้องระบุ listing_id + category_id" }, 400);
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { data: l } = await admin.from("platform_catalog_listings").select("platform_id, brand_id").eq("id", listingId).maybeSingle();
  const row = l as { platform_id: string; brand_id: string | null } | null;
  if (!row?.brand_id) return reply({ fields: null, rules: null, error: "ไม่พบสินค้านี้" }, 404);
  const tok = await ttsTokenOrReason(admin, row.brand_id, row.platform_id, user?.id ?? null);
  if (!tok.ok) return reply({ fields: null, rules: null, error: tok.reason }, 400);
  const cipher = tok.meta.shops?.[0]?.cipher;
  if (!cipher) return reply({ fields: null, rules: null, error: "ยังไม่รู้รหัสร้าน TikTok" }, 400);
  return reply(await ttsCategoryMeta(tok.accessToken, cipher, categoryId));
}
