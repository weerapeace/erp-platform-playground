/**
 * แดชบอร์ดรวมผู้บริหาร (หลายแพลตฟอร์ม) — /api/platform-dashboard
 * GET ?platform_id=&brand_id=&from=&to=  (products.platforms.view)
 *   → kpi (ยอดขาย/ออเดอร์/สินค้า), byPlatform, byStatus, topProducts, lowStock, filters
 * รวมจาก: platform_orders(+items) · platform_catalog_listings · erp_playground_stock_balances
 * หมายเหตุ: aggregate ฝั่ง JS (ออเดอร์ยังไม่เยอะ) — ถ้าโตมากค่อยย้ายเป็น SQL/rpc
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PENDING = new Set(["new", "confirmed"]);
const STATUS_ORDER = ["new", "confirmed", "packed", "shipped", "cancelled"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const platformId = (sp.get("platform_id") ?? "").trim();
  const brandId = (sp.get("brand_id") ?? "").trim();
  const from = (sp.get("from") ?? "").trim();
  const to = (sp.get("to") ?? "").trim();
  const admin = supabaseAdmin();

  // ตัวเลือกฟิลเตอร์: แพลตฟอร์มที่เปิด + แบรนด์ (ไม่เอาแบรนด์ลูกค้า)
  const [{ data: pf }, { data: br }] = await Promise.all([
    admin.from("erp_platforms").select("id, code, name_th, icon_key").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.from("brands").select("id, name").eq("is_active", true).not("is_customer_job", "is", true).order("name", { ascending: true }),
  ]);
  const platforms = ((pf ?? []) as Record<string, unknown>[]).map((p) => ({ id: String(p.id), code: String(p.code ?? ""), name_th: String(p.name_th ?? p.code ?? ""), icon_key: (p.icon_key as string) ?? null }));
  const brands = ((br ?? []) as Record<string, unknown>[]).map((b) => ({ id: String(b.id), name: String(b.name ?? "") }));

  // ออเดอร์ (ตามฟิลเตอร์)
  let oq = admin.from("platform_orders").select("id, platform_id, brand_id, status, total, created_at").limit(5000);
  if (platformId) oq = oq.eq("platform_id", platformId);
  if (brandId) oq = oq.eq("brand_id", brandId);
  if (from) oq = oq.gte("created_at", from);
  if (to) oq = oq.lte("created_at", `${to}T23:59:59`);
  const { data: ordersData } = await oq;
  const orders = (ordersData ?? []) as { id: string; platform_id: string; status: string; total: number | null }[];

  // สินค้าบนแพลตฟอร์ม (catalog) ตามฟิลเตอร์ (แพลตฟอร์ม/แบรนด์)
  let cq = admin.from("platform_catalog_listings").select("id, platform_id, matched_parent_sku_id").limit(20000);
  if (platformId) cq = cq.eq("platform_id", platformId);
  if (brandId) cq = cq.eq("brand_id", brandId);
  const { data: catData } = await cq;
  const catalog = (catData ?? []) as { platform_id: string; matched_parent_sku_id: string | null }[];

  // KPI
  const salesTotal = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + (o.total ?? 0), 0);
  const ordersPending = orders.filter((o) => PENDING.has(o.status)).length;
  const ordersToShip = orders.filter((o) => o.status === "packed").length;
  const catalogMatched = catalog.filter((c) => c.matched_parent_sku_id).length;
  const kpi = {
    salesTotal, ordersCount: orders.length, ordersPending, ordersToShip,
    catalogTotal: catalog.length, catalogMatched, catalogUnmatched: catalog.length - catalogMatched,
  };

  // แยกตามแพลตฟอร์ม
  const byPlatform = platforms.map((p) => {
    const os = orders.filter((o) => o.platform_id === p.id);
    const cs = catalog.filter((c) => c.platform_id === p.id);
    return {
      code: p.code, name_th: p.name_th, icon_key: p.icon_key,
      orders: os.length, sales: os.filter((o) => o.status !== "cancelled").reduce((s, o) => s + (o.total ?? 0), 0),
      catalog: cs.length, matched: cs.filter((c) => c.matched_parent_sku_id).length,
    };
  }).filter((x) => x.orders > 0 || x.catalog > 0);

  // แยกตามสถานะ
  const byStatus = STATUS_ORDER.map((s) => ({ status: s, count: orders.filter((o) => o.status === s).length }));

  // สินค้าขายดี (จาก order items ของออเดอร์ที่ผ่านฟิลเตอร์)
  let topProducts: { key: string; name: string; sku: string | null; qty: number; sales: number }[] = [];
  const orderIds = orders.filter((o) => o.status !== "cancelled").map((o) => o.id);
  if (orderIds.length) {
    const { data: itemsData } = await admin.from("platform_order_items").select("matched_sku_id, sku_code, name, qty, price").in("order_id", orderIds.slice(0, 5000));
    const items = (itemsData ?? []) as { matched_sku_id: string | null; sku_code: string | null; name: string | null; qty: number | null; price: number | null }[];
    const map = new Map<string, { key: string; name: string; sku: string | null; qty: number; sales: number }>();
    for (const it of items) {
      const key = it.matched_sku_id || it.sku_code || it.name || "?";
      const g = map.get(key) ?? { key, name: it.name ?? it.sku_code ?? "—", sku: it.sku_code ?? null, qty: 0, sales: 0 };
      g.qty += it.qty ?? 0; g.sales += (it.qty ?? 0) * (it.price ?? 0);
      map.set(key, g);
    }
    topProducts = [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);
  }

  // สต๊อกใกล้หมด (คงเหลือพร้อมขาย = on_hand - reserved <= 5)
  let lowStock: { code: string; name: string; available: number; warehouse: string | null }[] = [];
  const { data: balData } = await admin.from("erp_playground_stock_balances").select("product_id, warehouse_id, qty_on_hand, qty_reserved").limit(500);
  const bals = (balData ?? []) as { product_id: string; warehouse_id: string | null; qty_on_hand: number | null; qty_reserved: number | null }[];
  const lowBals = bals.map((b) => ({ ...b, available: (b.qty_on_hand ?? 0) - (b.qty_reserved ?? 0) })).filter((b) => b.available <= 5);
  if (lowBals.length) {
    const skuIds = [...new Set(lowBals.map((b) => b.product_id))];
    const { data: skuData } = await admin.from("skus_v2").select("id, code, name_th").in("id", skuIds);
    const skuMap = new Map<string, { code: string; name: string }>();
    for (const s of ((skuData ?? []) as Record<string, unknown>[])) skuMap.set(String(s.id), { code: String(s.code ?? ""), name: String(s.name_th ?? "") });
    lowStock = lowBals.map((b) => ({ code: skuMap.get(b.product_id)?.code ?? "—", name: skuMap.get(b.product_id)?.name ?? "", available: b.available, warehouse: b.warehouse_id })).sort((a, b) => a.available - b.available).slice(0, 20);
  }

  return NextResponse.json({ filters: { platforms, brands }, kpi, byPlatform, byStatus, topProducts, lowStock, error: null });
}
