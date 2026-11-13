/**
 * ตัวเลือกการจัดส่งของร้าน TikTok (อ่านอย่างเดียว) — กล่อง "ตัวเลือกการจัดส่ง" ในลิ้นชัก + หน้าลงฉบับร่าง (เจ้าของสั่ง 2026-11-13 "ทำทั้ง 2 อย่าง")
 *  GET ?listing_id= | ?brand_id=  [&fresh=1]   (products.platforms.view)
 *   → { options: TtsDeliveryOption[] (กำหนดให้สินค้าได้), limits: TtsDeliveryOption[] | null (แบบที่คลังใช้อยู่ + ขีดจำกัดน้ำหนัก), error }
 *  สิทธิ์ Logistics (seller.logistics — กุญแจร้าน LM มีแล้ว) · แคช 10 นาทีต่อร้าน (ttsShopDeliveryOptions ใน ../shared)
 *  การตั้งให้สินค้า = ส่งพร้อม "บันทึกขึ้น TikTok" (listing-edit extra.delivery) / ตอนสร้างฉบับร่าง (extra.tiktok_delivery)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { ttsShopDeliveryOptions, ttsShopFor } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const shop = await ttsShopFor(supabaseAdmin(), { listingId: sp.get("listing_id"), brandId: sp.get("brand_id") }, user?.id ?? null);
  if (!shop.ok) return reply({ options: null, error: shop.error }, shop.status);
  try {
    const r = await ttsShopDeliveryOptions(shop.accessToken, shop.cipher, sp.get("fresh") === "1");
    return reply({ options: r.options, limits: r.limits, error: null });
  } catch (e) {
    return reply({ options: null, error: `ดึงตัวเลือกการจัดส่งจาก TikTok ไม่ได้: ${(e as Error).message}` }, 502);
  }
}
