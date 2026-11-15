/**
 * หมวด Shopee ที่แนะนำ "ทีละหลายสินค้า" (เฟส 5C) — ตารางยืนยันหมวดในตัวช่วยลงสินค้า (แท็บ Shopee)
 *
 *  GET ?parent_sku_ids=a,b,c (≤50)  (products.platforms.view)
 *   → { rows: [{ parent_id, code, name, confirmed, suggestion, candidates, on_shop }], platform_id, error }
 *   confirmed = มีหมวดที่ยืนยันแล้ว (ร่าง / หมวดกลาง) · suggestion = หมวดที่จะใช้ (ตัวแรกของ candidates)
 * ไม่บันทึกอะไร — หน้าเว็บบันทึกหมวดที่ติ๊กลงร่างเอง (PATCH /api/product-platforms { category_path })
 * ตัวคิดหมวดตัวเดียวกับหน้าดูก่อนส่ง/ลงจริง = ../load (shopeeCategoryCandidates) — ห้ามเขียนตัวเดาหมวดตัวที่ 2
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { loadListingContexts } from "@/lib/product-listing-context";
import { LIVE_LISTING_OR } from "@/lib/platform-listing-health";
import type { ShopeeBulkCategoryRow } from "@/lib/shopee-create-plan";
import { shopeeCategoryCandidates } from "../load";
import { getPlatformId, shopeeTokenOrReason } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MAX_IDS = 50;
const NO_STORE = { "Cache-Control": "no-store" };
const str = (v: unknown) => (v == null ? "" : String(v)).trim();
type Resp = { rows: ShopeeBulkCategoryRow[]; platform_id: string | null; error: string | null };

/** ทำทีละ n งานพร้อมกัน (กันยิง Shopee รัว) */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const ids = [...new Set((request.nextUrl.searchParams.get("parent_sku_ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
  if (!ids.length) return NextResponse.json({ rows: [], platform_id: null, error: "ต้องระบุสินค้า" } satisfies Resp, { status: 400, headers: NO_STORE });
  if (ids.length > MAX_IDS) return NextResponse.json({ rows: [], platform_id: null, error: `ครั้งละไม่เกิน ${MAX_IDS} สินค้า` } satisfies Resp, { status: 400, headers: NO_STORE });
  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const platformId = await getPlatformId(admin, "shopee");
  if (!platformId) return NextResponse.json({ rows: [], platform_id: null, error: "ยังไม่มีแพลตฟอร์ม Shopee" } satisfies Resp, { status: 400, headers: NO_STORE });

  const [items, { data: brands }, { data: onShop }] = await Promise.all([
    loadListingContexts(admin, ids, platformId),
    admin.from("parent_skus_v2").select("id, brand_id").in("id", ids),
    admin.from("platform_catalog_listings").select("matched_parent_sku_id, external_product_id").eq("platform_id", platformId).in("matched_parent_sku_id", ids).or(LIVE_LISTING_OR),
  ]);
  const brandOf = new Map(((brands ?? []) as { id: string; brand_id: string | null }[]).map((b) => [b.id, b.brand_id]));
  const shopOf = new Map(((onShop ?? []) as { matched_parent_sku_id: string; external_product_id: string | null }[]).map((l) => [l.matched_parent_sku_id, str(l.external_product_id) || "?"]));
  // กุญแจร้านต่อแบรนด์ (ถามครั้งเดียวต่อแบรนด์)
  const tokens = new Map<string, Promise<{ accessToken: string; shopId: string } | string>>();
  const tokenOf = (brandId: string) => {
    if (!tokens.has(brandId)) tokens.set(brandId, shopeeTokenOrReason(admin, brandId, platformId, user?.id ?? null).then((t) => (t.ok ? { accessToken: t.accessToken, shopId: t.shopId } : t.reason)));
    return tokens.get(brandId)!;
  };

  const rows = await pool(items, 4, async (it): Promise<ShopeeBulkCategoryRow> => {
    const p = it.parent;
    const d = it.draft as Record<string, unknown> | null;
    const name = (str(d?.title) || str(p.name_platform) || str(p.name_th)).replace(/\s+/g, " ");
    const brandId = brandOf.get(p.id) ?? null;
    const tok = brandId ? await tokenOf(brandId) : "สินค้ายังไม่มีแบรนด์";
    const candidates = await shopeeCategoryCandidates(admin, {
      platformId, token: typeof tok === "string" ? null : tok, name, draftPath: str(d?.category_path) || null, mappedCategory: it.platformCategory || null,
      productCategoryId: p.category_id, productCategoryName: p.category_name,
    });
    const suggestion = candidates[0] ?? null;
    return {
      parent_id: p.id, code: str(p.code), name, confirmed: suggestion?.kind === "draft" || suggestion?.kind === "central",
      suggestion, candidates, on_shop: shopOf.get(p.id) ?? null,
      note: typeof tok === "string" ? `แนะนำจาก Shopee ไม่ได้ (${tok}) — ใช้หมวดจากสินค้าประเภทเดียวกันแทน` : null,
    };
  });
  // เรียงตามลำดับที่ขอ
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.parent_id) ?? 0) - (order.get(b.parent_id) ?? 0));
  return NextResponse.json({ rows, platform_id: platformId, error: null } satisfies Resp, { headers: NO_STORE });
}
