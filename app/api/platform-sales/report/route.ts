/**
 * 📈 สินค้าที่ขายได้บนแพลตฟอร์ม (รายเดือน) — GET /api/platform-sales/report?month=YYYY-MM&platform_id=&brand_id=
 * สิทธิ์: platform_orders.view
 *
 * อ่านจาก platform_orders + platform_order_items (ทุกแหล่ง: เมล / ไฟล์ / API) ตามวันที่สั่งซื้อ (เวลาไทย)
 * - ไม่นับออเดอร์ที่ยกเลิก (นับแยกเป็นตัวเลข)
 * - ยอดเงิน = ราคาสินค้า × จำนวน (ไม่รวมค่าส่ง · ยังไม่หักค่าธรรมเนียมแพลตฟอร์ม)
 * - สินค้าที่ยังไม่จับคู่ SKU ยังนับอยู่ (โชว์ชื่อจากร้าน ไม่มีรหัส)
 * คืน products ในรูป SoldProduct (lib/sold-products) → ใช้ตารางกลาง SoldProductsTable ได้เลย (customer = ร้าน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";
import { isMonthKey, thisMonth } from "@/lib/month";
import { SKU_COVER_SELECT, coverUrl, resolveSkuCover } from "@/lib/sku-cover";
import type { SoldProduct } from "@/lib/sold-products";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OrderRow = { id: string; platform_id: string; brand_id: string | null; status: string; source: string | null };
type ItemRow = { order_id: string; name: string | null; qty: number | null; price: number | null; matched_sku_id: string | null; raw: Record<string, unknown> | null };

/** ต้นเดือน/ต้นเดือนถัดไป ตามเวลาไทย (00:00 น. ไทย = 17:00 UTC ของวันก่อน) */
function monthBoundsTh(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1, -7)).toISOString(), to: new Date(Date.UTC(y, m, 1, -7)).toISOString() };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const month = isMonthKey(sp.get("month")) ? String(sp.get("month")) : thisMonth();
  const platformId = (sp.get("platform_id") ?? "").trim();
  const brandId = (sp.get("brand_id") ?? "").trim();
  const admin = supabaseAdmin();
  const { from, to } = monthBoundsTh(month);

  const [{ data: pf }, { data: br }] = await Promise.all([
    admin.from("erp_platforms").select("id, code, name_th").in("code", ["shopee", "lazada", "tiktok", "line_shopping", "website"]).order("sort_order"),
    admin.from("brands").select("id, name").order("name"),
  ]);
  const platforms = (pf ?? []) as { id: string; code: string; name_th: string }[];
  const brands = (br ?? []) as { id: string; name: string }[];
  const pfName = new Map(platforms.map((p) => [p.id, p.name_th]));
  const brandName = new Map(brands.map((b) => [b.id, b.name]));

  const orders = await fetchAllPages<OrderRow>((a, b) => {
    let q = admin.from("platform_orders").select("id, platform_id, brand_id, status, source").gte("ordered_at", from).lt("ordered_at", to).order("id").range(a, b);
    if (platformId) q = q.eq("platform_id", platformId);
    if (brandId) q = q.eq("brand_id", brandId);
    return q;
  });
  const active = orders.filter((o) => o.status !== "cancelled");
  const orderOf = new Map(active.map((o) => [o.id, o]));

  const items: ItemRow[] = [];
  const ids = active.map((o) => o.id);
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await admin.from("platform_order_items").select("order_id, name, qty, price, matched_sku_id, raw").in("order_id", ids.slice(i, i + 300));
    items.push(...((data ?? []) as ItemRow[]));
  }

  const skuIds = [...new Set(items.map((i) => i.matched_sku_id).filter(Boolean) as string[])];
  const skuInfo = new Map<string, { code: string; color: string | null; image: string | null }>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const { data } = await admin.from("skus_v2").select(`id, code, color_platform_th, color, ${SKU_COVER_SELECT}`).in("id", skuIds.slice(i, i + 300));
    for (const s of (data ?? []) as Record<string, unknown>[]) {
      skuInfo.set(String(s.id), { code: String(s.code), color: (s.color_platform_th as string | null) ?? (s.color as string | null) ?? null, image: coverUrl(resolveSkuCover(s).key) });
    }
  }

  // รวมเป็นแถวละ ร้าน × สินค้า
  const shopLabel = (o: OrderRow) => [pfName.get(o.platform_id) ?? "แพลตฟอร์มอื่น", o.brand_id ? brandName.get(o.brand_id) : null].filter(Boolean).join(" · ");
  const rows = new Map<string, SoldProduct>();
  const byShop = new Map<string, { shop: string; orders: Set<string>; qty: number; amount: number }>();
  let qty = 0, amount = 0, pending = 0;
  const noPrice = new Set<string>();
  for (const it of items) {
    const o = orderOf.get(it.order_id);
    if (!o) continue;
    const q = Number(it.qty ?? 0), amt = it.price != null ? Number(it.price) * q : 0;
    if (it.price == null) noPrice.add(o.id);
    const sku = it.matched_sku_id ? skuInfo.get(it.matched_sku_id) : undefined;
    if (!sku) pending++;
    const variant = (it.raw?.variant as string | null) ?? null;
    const shop = shopLabel(o);
    const name = sku ? `${it.name ?? sku.code}${sku.color ? ` · ${sku.color}` : ""}` : `${it.name ?? "(ไม่มีชื่อ)"}${variant ? ` · ${variant}` : ""} — ยังไม่จับคู่`;
    const key = `${shop}|${sku?.code ?? name}`;
    const r = rows.get(key) ?? { customer: shop, customer_code: null, sku: sku?.code ?? null, name, unit: "ชิ้น", qty: 0, amt: 0, image: sku?.image ?? null };
    r.qty += q; r.amt += amt;
    rows.set(key, r);
    const s = byShop.get(shop) ?? { shop, orders: new Set<string>(), qty: 0, amount: 0 };
    s.orders.add(o.id); s.qty += q; s.amount += amt;
    byShop.set(shop, s);
    qty += q; amount += amt;
  }

  // คำขอคืนเงินที่เข้ามาในเดือนนี้ (เมลไม่บอกเลขออเดอร์ → นับรวม ไม่หักยอด)
  const { count: returns } = await admin.from("platform_email_inbox").select("id", { count: "exact", head: true })
    .eq("kind", "return_requested").gte("received_at", from).lt("received_at", to);

  return NextResponse.json({
    month,
    platforms,
    brands,
    summary: {
      orders: active.length,
      cancelled: orders.length - active.length,
      qty,
      amount,
      no_price_orders: noPrice.size,
      pending_items: pending,
      returns: returns ?? 0,
      from_email: active.filter((o) => o.source === "email").length,
    },
    by_shop: [...byShop.values()].map((s) => ({ shop: s.shop, orders: s.orders.size, qty: s.qty, amount: s.amount })).sort((a, b) => b.amount - a.amount),
    products: [...rows.values()],
    error: null,
  });
}
