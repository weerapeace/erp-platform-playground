/**
 * สินค้าบน Shopee "ตัวเดียว" แบบเต็ม — ลิ้นชักสินค้าบนร้าน (/master/platform-catalog)
 *
 *  GET  ?listing_id=        (products.platforms.view) → ดึงสดจาก Shopee (get_item_base_info + get_model_list) ไม่บันทึกอะไร
 *  POST { listing_id }      (products.platforms.edit) → ดึงสด + อัปเดตสำเนาย่อในระบบ (raw.shopee · ชื่อ · ราคา · สถานะ)
 *                            = ปุ่ม "ดึงตัวนี้จาก Shopee" (ไม่ต้องดึงทั้งร้าน)
 *  → ShopeeListingDetailResponse { view, fetched_at, saved?, error }
 * ไม่แก้อะไรบนร้าน · ของใช้ร่วม ../shared (loadShopeeListingLive · saveShopeeSlimCopy) · กติกา lib/shopee-listing-edit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import type { ShopeeListingDetailResponse } from "@/lib/shopee-listing-edit";
import { loadShopeeListingLive, saveShopeeSlimCopy } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => NextResponse.json({ view: null, fetched_at: null, error } satisfies ShopeeListingDetailResponse, { status, headers: NO_STORE });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const listingId = (request.nextUrl.searchParams.get("listing_id") ?? "").trim();
  if (!listingId) return fail("ต้องระบุสินค้า", 400);
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const r = await loadShopeeListingLive(supabaseAdmin(), listingId, user?.id ?? null);
  if (!r.ok) return fail(r.error, r.status);
  return NextResponse.json({ view: r.view, fetched_at: new Date().toISOString(), error: null } satisfies ShopeeListingDetailResponse, { headers: NO_STORE });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  let body: { listing_id?: string };
  try { body = await request.json(); } catch { return fail("invalid JSON", 400); }
  const listingId = String(body.listing_id ?? "").trim();
  if (!listingId) return fail("ต้องระบุสินค้า", 400);
  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const r = await loadShopeeListingLive(admin, listingId, user?.id ?? null);
  if (!r.ok) return fail(r.error, r.status);
  const now = new Date().toISOString();
  const err = await saveShopeeSlimCopy(admin, r.row, r.live);
  if (err) return NextResponse.json({ view: r.view, fetched_at: now, saved: false, error: `ดึงจาก Shopee ได้ แต่บันทึกสำเนาในระบบไม่สำเร็จ: ${err}` } satisfies ShopeeListingDetailResponse, { status: 500, headers: NO_STORE });
  return NextResponse.json({ view: r.view, fetched_at: now, saved: true, error: null } satisfies ShopeeListingDetailResponse, { headers: NO_STORE });
}
