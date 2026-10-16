/**
 * แคตตาล็อกสำหรับป๊อป "เพิ่มสินค้าเข้าเว็บ" — /api/website/listings/catalog?shop=<slug>
 *
 * GET → { items, labels, badges, brands, categories, onShop, shopBrandId }
 *   items      = ทุก Parent SKU ที่เปิดใช้ + ป้ายการตลาด/ป้ายเสริม/สีที่เหลือ (ตัวโหลดกลางเดียวกับหน้า 🎯 SKU การตลาด) + หมวด ERP
 *   onShop     = parent_sku_id ที่อยู่ในร้านนี้แล้ว (ติ๊กซ้ำไม่ได้)
 *   shopBrandId= แบรนด์หลักของร้าน (แบรนด์ที่มีสินค้าในร้านมากสุด · ยังไม่มีสินค้า = แบรนด์ชื่อเดียวกับร้าน) → แท็บ SKU การตลาดเปิดที่แบรนด์นี้
 * สิทธิ์ products.view (คนจัดเว็บเห็นป้ายการตลาดได้ แต่แก้ป้ายต้องไปหน้า SKU การตลาด)
 * ของกลาง: lib/marketing/sku-list-db (loadMarketingSkuList) · guardApi
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { loadMarketingSkuList } from "@/lib/marketing/sku-list-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE = 1000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const slug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id, name, slug").eq("slug", slug).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; name: string; slug: string };

  const [list, listed, cats] = await Promise.all([
    loadMarketingSkuList(sb),
    sb.from("store_listings").select("parent_sku_id").eq("shop_id", s.id),
    sb.from("product_categories").select("id, name").order("name"),
  ]);
  if ("error" in list) return NextResponse.json({ error: list.error }, { status: 500 });

  // หมวด ERP ของแต่ละรุ่น (view การตลาดไม่มี) — ไล่ดึงเป็นหน้า
  const catOf = new Map<string, string | null>();
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await sb.from("parent_skus_v2").select("id, category_id").eq("is_active", true).order("id").range(from, from + PAGE - 1);
    if (error) break;
    for (const r of (data ?? []) as { id: string; category_id: string | null }[]) catOf.set(r.id, r.category_id);
    if (!data || data.length < PAGE) break;
  }

  const onShop = ((listed.data ?? []) as { parent_sku_id: string }[]).map((r) => r.parent_sku_id);
  const onSet = new Set(onShop);
  const items = list.data.items.map((it) => ({ ...it, category_id: catOf.get(it.parent_sku_id) ?? null }));

  // แบรนด์หลักของร้าน
  const byBrand = new Map<string, number>();
  for (const it of items) if (it.brand_id && onSet.has(it.parent_sku_id)) byBrand.set(it.brand_id, (byBrand.get(it.brand_id) ?? 0) + 1);
  let shopBrandId: string | null = [...byBrand.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  if (!shopBrandId) {
    const n = s.name.trim().toLowerCase();
    shopBrandId = list.data.brands.find((b) => b.name.trim().toLowerCase() === n)?.id ?? null;
  }

  const usedCats = new Set(items.map((i) => i.category_id).filter(Boolean));
  return NextResponse.json({
    ...list.data,
    items,
    categories: ((cats.data ?? []) as { id: string; name: string }[]).filter((c) => usedCats.has(c.id)),
    onShop,
    shopBrandId,
  });
}
