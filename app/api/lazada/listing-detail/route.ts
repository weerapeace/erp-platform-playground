/**
 * สินค้าบน Lazada "ตัวเดียว" แบบเต็ม — ลิ้นชักสินค้าบนร้าน (/master/platform-catalog) · เฟส 1 = อ่านอย่างเดียว
 *
 *  GET  ?listing_id=        (products.platforms.view) → ดึงสดจาก Lazada (/product/item/get) ไม่บันทึกอะไร
 *  POST { listing_id }      (products.platforms.edit) → ดึงสด + อัปเดตสำเนาย่อในระบบ (raw.lazada · ชื่อ · ราคา · สถานะ)
 *                            = ปุ่ม "ดึงตัวนี้จาก Lazada" (ไม่ต้องดึงทั้งร้าน)
 *  → LazadaListingDetailResponse { view, fetched_at, saved?, error }
 *
 * ไม่แก้อะไรบนร้าน Lazada · ข้อมูลเต็ม (รูป/HTML) ไม่เก็บในระบบ (บวม) — แปลงด้วย lib/lazada-listing-edit lazadaListingView
 * สำเนาย่อใช้ตัวแปลงเดียวกับตอนดึงทั้งร้าน (lazProductToCatalogItem) → ข้อมูลรูปแบบเดียวกันเป๊ะ
 * error ของ Lazada → ภาษาคนด้วย lazErrorText
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { lazErrorText, lazGetItem, lazProductToCatalogItem } from "@/lib/lazada";
import { lazadaListingView, type LazadaListingDetailResponse } from "@/lib/lazada-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { lazTokenOrReason } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

type Row = { id: string; platform_id: string; brand_id: string | null; external_product_id: string | null; title: string | null; price: number | null; status: string | null; raw: Record<string, unknown> | null };
const fail = (error: string, status: number) => NextResponse.json({ view: null, fetched_at: null, error } satisfies LazadaListingDetailResponse, { status, headers: { "Cache-Control": "no-store" } });

async function fetchLive(request: NextRequest, listingId: string): Promise<{ row: Row; item: Record<string, unknown> } | NextResponse> {
  const admin = supabaseAdmin();
  const { data: l } = await admin.from("platform_catalog_listings")
    .select("id, platform_id, brand_id, external_product_id, title, price, status, raw").eq("id", listingId).maybeSingle();
  const row = l as Row | null;
  if (!row) return fail("ไม่พบสินค้านี้ (อาจถูกลบไปแล้ว)", 404);
  const { data: pf } = await admin.from("erp_platforms").select("code").eq("id", row.platform_id).maybeSingle();
  if ((pf as { code?: string } | null)?.code !== "lazada") return fail("ใช้ได้เฉพาะสินค้าบน Lazada", 400);
  const itemId = String(row.external_product_id ?? "").trim();
  if (!itemId || !row.brand_id) return fail("รายการนี้ไม่มีรหัสสินค้าบน Lazada", 400);
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const tok = await lazTokenOrReason(admin, row.brand_id, row.platform_id, user?.id ?? null);
  if (!tok.ok) return fail(tok.reason, 400);
  try {
    const item = await lazGetItem(tok.gateway, tok.accessToken, itemId);
    if (!item) return fail(`ไม่พบสินค้า #${itemId} บน Lazada (อาจถูกลบไปแล้ว)`, 404);
    return { row, item };
  } catch (e) {
    return fail(lazErrorText(e), 502);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const listingId = (request.nextUrl.searchParams.get("listing_id") ?? "").trim();
  if (!listingId) return fail("ต้องระบุสินค้า", 400);
  const live = await fetchLive(request, listingId);
  if (live instanceof NextResponse) return live;
  const view = lazadaListingView(live.item);
  if (!view) return fail("Lazada ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง", 502);
  return NextResponse.json({ view, fetched_at: new Date().toISOString(), error: null } satisfies LazadaListingDetailResponse, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  let body: { listing_id?: string };
  try { body = await request.json(); } catch { return fail("invalid JSON", 400); }
  const listingId = String(body.listing_id ?? "").trim();
  if (!listingId) return fail("ต้องระบุสินค้า", 400);
  const live = await fetchLive(request, listingId);
  if (live instanceof NextResponse) return live;
  const view = lazadaListingView(live.item);
  const slim = lazProductToCatalogItem(live.item);
  if (!view || !slim) return fail("Lazada ส่งข้อมูลสินค้ามาไม่ครบ — ลองใหม่อีกครั้ง", 502);

  // สำเนาย่อในระบบ — กติกาเดียวกับ upsertCatalogListings (lib/platform-catalog-sync): เจอบนร้าน = ล้างป้าย "ไม่อยู่บนร้านแล้ว" · ไม่แตะคู่ที่จับไว้
  const { row } = live;
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin().from("platform_catalog_listings").update({
    raw: { ...(row.raw ?? {}), ...slim.raw },
    title: slim.title ?? row.title, price: slim.price ?? row.price, status: slim.status ?? (isGoneStatus(row.status) ? null : row.status),
    sku_code: slim.skus[0] ?? null, last_imported_at: now, updated_at: now,
  }).eq("id", row.id);
  if (error) return NextResponse.json({ view, fetched_at: now, saved: false, error: `ดึงจาก Lazada ได้ แต่บันทึกสำเนาในระบบไม่สำเร็จ: ${error.message}` } satisfies LazadaListingDetailResponse, { status: 500 });
  return NextResponse.json({ view, fetched_at: now, saved: true, error: null } satisfies LazadaListingDetailResponse, { headers: { "Cache-Control": "no-store" } });
}
