import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { OrderStatusKey, StatusData, DailySummary, HourlyPoint, ProductRow } from "@/lib/marketing/mock-data";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { all: "ทั้งหมด", confirmed: "ยืนยันแล้ว", paid: "ชำระเงินแล้ว" };
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);

type Row = Record<string, unknown>;

function toDaily(r: Row): DailySummary {
  return {
    date: String(r.date ?? ""),
    gross_sales: n(r.gross_sales),
    sales_excl_shopee_discount: n(r.sales_excl_shopee_discount),
    orders: n(r.orders),
    aov: n(r.aov),
    clicks: n(r.clicks),
    visitors: n(r.visitors),
    conversion_rate: n(r.conversion_rate),
    cancelled_orders: n(r.cancelled_orders),
    cancelled_sales: n(r.cancelled_sales),
    refund_orders: n(r.refund_orders),
    refund_sales: n(r.refund_sales),
    buyers: n(r.buyers),
    new_buyers: n(r.new_buyers),
    returning_buyers: n(r.returning_buyers),
    potential_buyers: n(r.potential_buyers),
    repeat_rate: n(r.repeat_rate),
  };
}
function toHourly(r: Row): HourlyPoint {
  return {
    hour: n(r.hour),
    gross_sales: n(r.gross_sales),
    orders: n(r.orders),
    clicks: n(r.clicks),
    visitors: n(r.visitors),
    conversion_rate: n(r.conversion_rate),
  };
}
function toProduct(r: Row): ProductRow {
  return {
    marketplace_item_id: String(r.marketplace_item_id ?? ""),
    product_name: String(r.product_name ?? ""),
    product_status: String(r.product_status ?? ""),
    sales_share: n(r.sales_share),
    sales: n(r.sales),
    impressions: n(r.impressions),
    clicks: n(r.clicks),
    orders: n(r.orders),
    units: n(r.units),
    ctr: n(r.ctr),
    conversion_rate: n(r.conversion_rate),
    aov: n(r.aov),
    buyers: n(r.buyers),
  };
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "marketing.dashboard.view");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform") || "shopee";
  const paramShop = searchParams.get("shop");
  const paramDate = searchParams.get("date");

  const admin = supabaseAdmin();

  // ดึง daily ทั้งหมดของ platform เพื่อหา available dates/shops
  const { data: allDaily, error } = await admin
    .from("marketing_sales_daily")
    .select("*")
    .eq("platform", platform)
    .order("date", { ascending: false });
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  const rows = (allDaily ?? []) as Row[];
  const availableDates = [...new Set(rows.map((r) => String(r.date)))];
  const availableShops = [...new Set(rows.map((r) => String(r.shop ?? "")))];

  if (rows.length === 0) {
    return NextResponse.json({
      data: { platform, shop: "", date: null, byStatus: {}, meta: { availableDates: [], availableShops: [] } },
      error: null,
    });
  }

  const date = paramDate && availableDates.includes(paramDate) ? paramDate : availableDates[0];
  // ร้านเริ่มต้น: param → ร้านของแถวล่าสุดในวันนั้น → ร้านแรก
  const shopOfDate = rows.find((r) => String(r.date) === date);
  const shop =
    paramShop !== null && paramShop !== undefined
      ? paramShop
      : String(shopOfDate?.shop ?? availableShops[0] ?? "");

  const dailyForDate = rows.filter((r) => String(r.date) === date && String(r.shop ?? "") === shop);

  const [{ data: hourly }, { data: products }] = await Promise.all([
    admin.from("marketing_sales_hourly").select("*").eq("platform", platform).eq("shop", shop).eq("date", date),
    admin.from("marketing_product_daily").select("*").eq("platform", platform).eq("shop", shop).eq("date", date),
  ]);

  const byStatus: Partial<Record<OrderStatusKey, StatusData>> = {};
  for (const r of dailyForDate) {
    const st = String(r.order_status) as OrderStatusKey;
    const traffic = {
      product_page: n(r.traffic_product_page),
      live: n(r.traffic_live),
      video: n(r.traffic_video),
      partner: n(r.traffic_partner),
      shopee_ads: n(r.traffic_shopee_ads),
    };
    const total = traffic.product_page + traffic.live + traffic.video + traffic.partner || n(r.gross_sales);
    byStatus[st] = {
      label: STATUS_LABEL[st] ?? st,
      daily: toDaily(r),
      hourly: ((hourly ?? []) as Row[])
        .filter((h) => String(h.order_status) === st)
        .map(toHourly)
        .sort((a, b) => a.hour - b.hour),
      products: ((products ?? []) as Row[])
        .filter((p) => String(p.order_status) === st)
        .map(toProduct)
        .sort((a, b) => b.sales - a.sales),
      traffic: { total, ...traffic },
    };
  }

  return NextResponse.json({
    data: { platform, shop, date, byStatus, meta: { availableDates, availableShops } },
    error: null,
  });
}
