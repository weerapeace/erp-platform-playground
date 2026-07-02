/**
 * สถานะสินค้าบนเว็บร้านออนไลน์ (Pixiedustie store) ของ Parent SKU — /api/parent-web-listings?parentId=
 * ใช้ในแท็บ "🛍 เว็บไซต์" ของ Parent drawer — อ่านอย่างเดียว (จัดการที่หลังบ้านร้าน)
 * ของกลาง: guardApi(products.view) + supabaseAdmin (ตาราง store_listings/shops/store_order_items อยู่ DB เดียวกัน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STORE_BASE = process.env.NEXT_PUBLIC_STORE_BASE || "https://pixiedustie-store.vercel.app";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const parentId = (new URL(request.url).searchParams.get("parentId") ?? "").trim();
  if (!parentId) return NextResponse.json({ error: "ต้องระบุ parentId" }, { status: 400 });

  const sb = supabaseAdmin();

  const [{ data: parent }, { data: listings }, { data: shops }] = await Promise.all([
    sb.from("parent_skus_v2").select("id, code").eq("id", parentId).maybeSingle(),
    sb
      .from("store_listings")
      .select("shop_id, is_published, featured, web_price, web_name, web_images, updated_at")
      .eq("parent_sku_id", parentId),
    sb.from("shops").select("id, name, slug, is_default"),
  ]);
  if (!parent) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });

  const code = (parent as { code: string }).code;
  const shopMap = new Map(
    ((shops ?? []) as { id: string; name: string; slug: string; is_default: boolean }[]).map((s) => [s.id, s])
  );

  // ยอดขายผ่านเว็บต่อร้าน (จากรายการในออเดอร์ที่อ้างรหัสรุ่นนี้)
  const soldByShop = new Map<string, number>();
  const { data: items } = await sb.from("store_order_items").select("order_id, qty").eq("parent_code", code);
  const itemRows = (items ?? []) as { order_id: string; qty: number | string }[];
  if (itemRows.length) {
    const orderIds = [...new Set(itemRows.map((i) => i.order_id))];
    const { data: orders } = await sb.from("store_orders").select("id, shop_id, status").in("id", orderIds);
    const orderShop = new Map(
      ((orders ?? []) as { id: string; shop_id: string; status: string }[])
        .filter((o) => o.status !== "cancelled")
        .map((o) => [o.id, o.shop_id])
    );
    for (const it of itemRows) {
      const sid = orderShop.get(it.order_id);
      if (!sid) continue;
      soldByShop.set(sid, (soldByShop.get(sid) ?? 0) + (Number(it.qty) || 0));
    }
  }

  const rows = ((listings ?? []) as Record<string, unknown>[]).map((l) => {
    const shop = shopMap.get(l.shop_id as string);
    const slugName = shop?.slug ?? "";
    const isDefault = Boolean(shop?.is_default);
    const productUrl = isDefault
      ? `${STORE_BASE}/product/${encodeURIComponent(code)}`
      : `${STORE_BASE}/preview/${encodeURIComponent(slugName)}?next=${encodeURIComponent(`/product/${code}`)}`;
    return {
      shopName: shop?.name ?? slugName ?? "ร้าน",
      slug: slugName,
      isDefault,
      published: Boolean(l.is_published),
      featured: Boolean(l.featured),
      webPrice: l.web_price != null ? Number(l.web_price) : null,
      webName: (l.web_name as string | null) || null,
      webImagesCount: Array.isArray(l.web_images) ? (l.web_images as unknown[]).length : 0,
      soldQty: soldByShop.get(l.shop_id as string) ?? 0,
      updatedAt: (l.updated_at as string | null) ?? null,
      productUrl,
    };
  });
  rows.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.shopName.localeCompare(b.shopName));

  return NextResponse.json({ code, storeBase: STORE_BASE, adminUrl: `${STORE_BASE}/admin/products`, listings: rows });
}
