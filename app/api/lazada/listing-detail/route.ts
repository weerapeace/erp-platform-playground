/**
 * สินค้าบน Lazada "ตัวเดียว" แบบเต็ม — ลิ้นชักสินค้าบนร้าน (/master/platform-catalog)
 *
 *  GET  ?listing_id=        (products.platforms.view) → ดึงสดจาก Lazada (/product/item/get) ไม่บันทึกอะไร
 *  POST { listing_id }      (products.platforms.edit) → ดึงสด + อัปเดตสำเนาย่อในระบบ (raw.lazada · ชื่อ · ราคา · สถานะ)
 *                            = ปุ่ม "ดึงตัวนี้จาก Lazada" (ไม่ต้องดึงทั้งร้าน)
 *  → LazadaListingDetailResponse { view, fetched_at, saved?, error }
 *
 * ไม่แก้อะไรบนร้าน Lazada · ข้อมูลเต็ม (รูป/HTML) ไม่เก็บในระบบ (บวม) — แปลงด้วย lib/lazada-listing-edit lazadaListingView
 * โหลด/ดึงสด/บันทึกสำเนา = ของใช้ร่วม ../shared (loadLazListingLive · saveLazSlimCopy) — ตัวเดียวกับ listing-edit / listing-display
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { lazadaListingView, type LazadaListingDetailResponse } from "@/lib/lazada-listing-edit";
import { loadLazListingLive, saveLazSlimCopy } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => NextResponse.json({ view: null, fetched_at: null, error } satisfies LazadaListingDetailResponse, { status, headers: NO_STORE });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const listingId = (request.nextUrl.searchParams.get("listing_id") ?? "").trim();
  if (!listingId) return fail("ต้องระบุสินค้า", 400);
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const live = await loadLazListingLive(supabaseAdmin(), listingId, user?.id ?? null);
  if (!live.ok) return fail(live.error, live.status);
  const view = lazadaListingView(live.item);
  if (!view) return fail("Lazada ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง", 502);
  return NextResponse.json({ view, fetched_at: new Date().toISOString(), error: null } satisfies LazadaListingDetailResponse, { headers: NO_STORE });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  let body: { listing_id?: string };
  try { body = await request.json(); } catch { return fail("invalid JSON", 400); }
  const listingId = String(body.listing_id ?? "").trim();
  if (!listingId) return fail("ต้องระบุสินค้า", 400);
  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const live = await loadLazListingLive(admin, listingId, user?.id ?? null);
  if (!live.ok) return fail(live.error, live.status);
  const view = lazadaListingView(live.item);
  if (!view) return fail("Lazada ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง", 502);
  const now = new Date().toISOString();
  const err = await saveLazSlimCopy(admin, live.row, live.item);
  if (err) return NextResponse.json({ view, fetched_at: now, saved: false, error: `ดึงจาก Lazada ได้ แต่บันทึกสำเนาในระบบไม่สำเร็จ: ${err}` } satisfies LazadaListingDetailResponse, { status: 500, headers: NO_STORE });
  return NextResponse.json({ view, fetched_at: now, saved: true, error: null } satisfies LazadaListingDetailResponse, { headers: NO_STORE });
}
