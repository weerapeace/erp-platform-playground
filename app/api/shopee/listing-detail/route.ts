/**
 * สินค้าบน Shopee "ตัวเดียว" แบบเต็ม — ลิ้นชักสินค้าบนร้าน (/master/platform-catalog)
 *
 *  GET  ?listing_id=        (products.platforms.view) → ดึงสดจาก Shopee (get_item_base_info + get_model_list) ไม่บันทึกอะไร
 *  GET  ?listing_id=&part=attrs&category_id=  (products.platforms.view) → ช่องข้อมูลจำเพาะของหมวด (get_attribute_tree · จำไว้ 6 ชม.) + ชื่อหมวด
 *       → ShopeeAttrFieldsResponse { fields, category_name, error } (แท็บข้อมูลจำเพาะ · 2026-11-23)
 *  POST { listing_id }      (products.platforms.edit) → ดึงสด + อัปเดตสำเนาย่อในระบบ (raw.shopee · ชื่อ · ราคา · สถานะ)
 *                            = ปุ่ม "ดึงตัวนี้จาก Shopee" (ไม่ต้องดึงทั้งร้าน)
 *  → ShopeeListingDetailResponse { view, fetched_at, saved?, error }
 * ไม่แก้อะไรบนร้าน · ของใช้ร่วม ../shared (loadShopeeListingLive · saveShopeeSlimCopy) · กติกา lib/shopee-listing-edit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import type { ShopeeAttrFieldsResponse, ShopeeListingDetailResponse } from "@/lib/shopee-listing-edit";
import { shopeeAttrFieldsOf } from "@/lib/shopee-create-plan";
import { shopeeErrorText, shopeeGetAttributeTree } from "@/lib/shopee";
import type { TtsAttrField } from "@/lib/tiktok-attrs";
import { loadShopeeListingLive, saveShopeeSlimCopy, shopeeTokenOrReason } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => NextResponse.json({ view: null, fetched_at: null, error } satisfies ShopeeListingDetailResponse, { status, headers: NO_STORE });

// ช่องของหมวดเปลี่ยนไม่บ่อย → จำไว้ในเครื่องเซิร์ฟเวอร์ 6 ชม. (ต่อร้าน × หมวด)
const TREE_TTL = 6 * 3600_000;
const treeCache = new Map<string, { at: number; fields: TtsAttrField[] }>();

/** แท็บข้อมูลจำเพาะ: ช่องของหมวด + ชื่อหมวด (ไม่ดึงสินค้าซ้ำ — ใช้หมวดที่หน้าเว็บส่งมา) */
async function attrFields(request: NextRequest, listingId: string, categoryId: string): Promise<NextResponse> {
  const out = (b: ShopeeAttrFieldsResponse, status = 200) => NextResponse.json(b, { status, headers: NO_STORE });
  if (!/^\d+$/.test(categoryId)) return out({ fields: null, category_name: null, error: "ไม่รู้หมวดของสินค้านี้" }, 400);
  const admin = supabaseAdmin();
  const { data: l } = await admin.from("platform_catalog_listings").select("brand_id, platform_id").eq("id", listingId).maybeSingle();
  const row = l as { brand_id: string | null; platform_id: string } | null;
  if (!row?.brand_id) return out({ fields: null, category_name: null, error: "ไม่พบสินค้านี้" }, 404);
  const { data: cat } = await admin.from("platform_category_options").select("name_th, name_en").eq("platform_id", row.platform_id).eq("external_id", categoryId).maybeSingle();
  const c = cat as { name_th?: string | null; name_en?: string | null } | null;
  const categoryName = c?.name_th || c?.name_en || null;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const tok = await shopeeTokenOrReason(admin, row.brand_id, row.platform_id, user?.id ?? null);
  if (!tok.ok) return out({ fields: null, category_name: categoryName, error: tok.reason }, 400);
  const key = `${tok.shopId}:${categoryId}`;
  const hit = treeCache.get(key);
  if (hit && Date.now() - hit.at < TREE_TTL) return out({ fields: hit.fields, category_name: categoryName, error: null });
  try {
    const fields = shopeeAttrFieldsOf(await shopeeGetAttributeTree(tok.accessToken, tok.shopId, categoryId));
    treeCache.set(key, { at: Date.now(), fields });
    return out({ fields, category_name: categoryName, error: null });
  } catch (e) {
    return out({ fields: null, category_name: categoryName, error: `โหลดช่องของหมวดจาก Shopee ไม่สำเร็จ: ${shopeeErrorText(e)}` }, 502);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const listingId = (sp.get("listing_id") ?? "").trim();
  if (!listingId) return fail("ต้องระบุสินค้า", 400);
  if (sp.get("part") === "attrs") return attrFields(request, listingId, (sp.get("category_id") ?? "").trim());
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
