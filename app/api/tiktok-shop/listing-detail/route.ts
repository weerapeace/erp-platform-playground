/**
 * สินค้าบน TikTok Shop "ตัวเดียว" แบบเต็ม — ลิ้นชักสินค้าบนร้าน (/master/platform-catalog)
 *
 *  GET  ?listing_id=        (products.platforms.view) → ดึงสดจาก TikTok (Get Product) ไม่บันทึกอะไร
 *  POST { listing_id }      (products.platforms.edit) → ดึงสด + อัปเดตสำเนาย่อในระบบ (raw.tiktok · ชื่อ · ราคา · สถานะ)
 *                            = ปุ่ม "ดึงตัวนี้จาก TikTok" (ไม่ต้องดึงทั้งร้าน)
 *  → TiktokListingDetailResponse { view, fetched_at, saved?, error }
 *
 * ไม่แก้อะไรบนร้าน TikTok · ข้อมูลเต็ม (รูป/HTML) ไม่เก็บในระบบ — แปลงด้วย lib/tiktok-listing-edit tiktokListingView
 * กำลังตรวจอยู่ → ดึงฉบับที่ส่งตรวจด้วย (ชื่อใหม่ที่รอตรวจ) · ของใช้ร่วม ../shared (loadTtsListingLive · saveTtsSlimCopy · ttsViewWithReview)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import type { TiktokListingDetailResponse } from "@/lib/tiktok-listing-edit";
import { loadTtsListingLive, saveTtsSlimCopy, ttsViewWithReview } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => NextResponse.json({ view: null, fetched_at: null, error } satisfies TiktokListingDetailResponse, { status, headers: NO_STORE });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const listingId = (request.nextUrl.searchParams.get("listing_id") ?? "").trim();
  if (!listingId) return fail("ต้องระบุสินค้า", 400);
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const live = await loadTtsListingLive(supabaseAdmin(), listingId, user?.id ?? null);
  if (!live.ok) return fail(live.error, live.status);
  const view = await ttsViewWithReview(live.accessToken, live.cipher, live.detail);
  if (!view) return fail("TikTok ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง", 502);
  return NextResponse.json({ view, fetched_at: new Date().toISOString(), error: null } satisfies TiktokListingDetailResponse, { headers: NO_STORE });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  let body: { listing_id?: string };
  try { body = await request.json(); } catch { return fail("invalid JSON", 400); }
  const listingId = String(body.listing_id ?? "").trim();
  if (!listingId) return fail("ต้องระบุสินค้า", 400);
  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const live = await loadTtsListingLive(admin, listingId, user?.id ?? null);
  if (!live.ok) return fail(live.error, live.status);
  const view = await ttsViewWithReview(live.accessToken, live.cipher, live.detail);
  if (!view) return fail("TikTok ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง", 502);
  const now = new Date().toISOString();
  const err = await saveTtsSlimCopy(admin, live.row, live.detail);
  if (err) return NextResponse.json({ view, fetched_at: now, saved: false, error: `ดึงจาก TikTok ได้ แต่บันทึกสำเนาในระบบไม่สำเร็จ: ${err}` } satisfies TiktokListingDetailResponse, { status: 500, headers: NO_STORE });
  return NextResponse.json({ view, fetched_at: now, saved: true, error: null } satisfies TiktokListingDetailResponse, { headers: NO_STORE });
}
