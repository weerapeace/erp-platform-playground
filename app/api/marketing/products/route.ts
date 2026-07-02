import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);
type Row = Record<string, unknown>;

// GET ?from=&to= → รวมยอดขายรายสินค้า "ข้ามช่องทาง" (จับกลุ่มด้วย SKU ระบบถ้าผูกแล้ว)
// ใช้เฉพาะ order_status='paid' (ยอดจ่ายเงินจริง) กันนับซ้ำ 3 สถานะ
export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "marketing.dashboard.view");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const admin = supabaseAdmin();
  let q = admin.from("marketing_product_daily").select("*").eq("order_status", "paid");
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) {
    return NextResponse.json({ data: { products: [], platforms: [], date_min: null, date_max: null }, error: null }, {});
  }

  // resolve mapping (platform:item_id → internal_sku) + ชื่อ ERP
  const { data: maps } = await admin
    .from("marketplace_sku_mappings")
    .select("platform, marketplace_sku, internal_sku");
  const mapKey = (platform: string, item: string) => `${platform}:${item}`;
  const itemToSku = new Map<string, string>();
  for (const m of (maps ?? []) as Row[]) {
    const isku = String(m.internal_sku ?? "");
    if (isku) itemToSku.set(mapKey(String(m.platform ?? ""), String(m.marketplace_sku ?? "")), isku);
  }
  const codes = Array.from(new Set(itemToSku.values()));
  const codeToName = new Map<string, string>();
  if (codes.length) {
    const { data: skus } = await admin.from("skus_v2").select("code, name_th").in("code", codes);
    for (const sk of (skus ?? []) as Row[]) codeToName.set(String(sk.code), String(sk.name_th ?? ""));
  }

  interface Agg {
    key: string;
    internal_sku: string | null;
    display_name: string;
    mapped: boolean;
    total_sales: number;
    total_orders: number;
    total_units: number;
    by_platform: Record<string, number>;
    marketplace_item_id: string;
    platforms: Set<string>;
  }
  const groups = new Map<string, Agg>();
  const platformsSet = new Set<string>();
  let dateMin: string | null = null;
  let dateMax: string | null = null;

  for (const r of rows) {
    const platform = String(r.platform ?? "");
    const itemId = String(r.marketplace_item_id ?? "");
    const date = String(r.date ?? "");
    if (date) {
      if (!dateMin || date < dateMin) dateMin = date;
      if (!dateMax || date > dateMax) dateMax = date;
    }
    platformsSet.add(platform);
    const isku = itemToSku.get(mapKey(platform, itemId)) ?? null;
    const key = isku ? `sku:${isku}` : `mp:${platform}:${itemId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        internal_sku: isku,
        display_name: isku ? codeToName.get(isku) || isku : String(r.product_name ?? ""),
        mapped: !!isku,
        total_sales: 0,
        total_orders: 0,
        total_units: 0,
        by_platform: {},
        marketplace_item_id: itemId,
        platforms: new Set<string>(),
      };
      groups.set(key, g);
    }
    g.total_sales += n(r.sales);
    g.total_orders += n(r.orders);
    g.total_units += n(r.units);
    g.by_platform[platform] = (g.by_platform[platform] ?? 0) + n(r.sales);
    g.platforms.add(platform);
    if (!g.mapped && !g.display_name) g.display_name = String(r.product_name ?? "");
  }

  const products = Array.from(groups.values())
    .map((g) => ({
      internal_sku: g.internal_sku,
      display_name: g.display_name,
      mapped: g.mapped,
      marketplace_item_id: g.marketplace_item_id,
      total_sales: g.total_sales,
      total_orders: g.total_orders,
      total_units: g.total_units,
      by_platform: g.by_platform,
      channel_count: g.platforms.size,
    }))
    .sort((a, b) => b.total_sales - a.total_sales);

  return NextResponse.json({
    data: { products, platforms: Array.from(platformsSet), date_min: dateMin, date_max: dateMax },
    error: null,
  });
}
