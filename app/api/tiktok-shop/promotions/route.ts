/**
 * โปรโมชัน/ส่วนลดของร้าน TikTok (อ่านอย่างเดียว · ไม่แก้อะไรบนร้าน) — เจ้าของสั่ง 2026-11-13 "ทำ 1,2,4" ข้อ 4
 *  GET ?listing_id= | ?brand_id=  [&product_id=] [&fresh=1]   (products.platforms.view)
 *   → { promos: TtsPromo[] (ทั้งร้าน · กำลังใช้ + ยังไม่เริ่ม), for_product: string[] (id โปรที่สินค้านี้อยู่), truncated, fetched_at, error, need_scope }
 *  ⚠️ ต้องเปิดสิทธิ์ "Promotion Information" (seller.promotion.info) ในแอปที่ Partner Center + เชื่อมต่อใหม่ — ยังไม่เปิด = error + need_scope=true
 *  แคช 10 นาทีต่อร้าน (ttsShopPromotions ใน ../shared) · กฎแปลงคำตอบ: lib/tiktok-promotions
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { ttsErrorText } from "@/lib/tiktok-shop";
import { tiktokPromosForProduct } from "@/lib/tiktok-promotions";
import { ttsShopFor, ttsShopPromotions } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const productId = (sp.get("product_id") ?? "").trim();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const shop = await ttsShopFor(supabaseAdmin(), { listingId: sp.get("listing_id"), brandId: sp.get("brand_id") }, user?.id ?? null);
  if (!shop.ok) return reply({ promos: null, error: shop.error }, shop.status);
  try {
    const r = await ttsShopPromotions(shop.accessToken, shop.cipher, sp.get("fresh") === "1");
    return reply({
      promos: r.promos, truncated: r.truncated, fetched_at: new Date(r.cachedAt).toISOString(),
      for_product: productId ? tiktokPromosForProduct(r.promos, productId).map((p) => p.id) : [],
      error: null,
    });
  } catch (e) {
    const code = String((e as { code?: unknown })?.code ?? "");
    const needScope = code === "105005" || /access scope/i.test(String((e as Error)?.message ?? ""));
    return reply({ promos: null, need_scope: needScope, error: `ดึงโปรโมชันจาก TikTok ไม่ได้: ${ttsErrorText(e)}` }, needScope ? 200 : 502);
  }
}
