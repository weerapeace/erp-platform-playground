import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);
type Row = Record<string, unknown>;

// GET ?platform=&shop=&period=ps|pe → แคมเปญโฆษณาของช่วงที่เลือก (ล่าสุดถ้าไม่ระบุ)
export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "marketing.dashboard.view");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform") || "shopee";
  const paramShop = searchParams.get("shop");
  const paramPeriod = searchParams.get("period"); // "YYYY-MM-DD|YYYY-MM-DD"

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("marketing_ads_campaign")
    .select("*")
    .eq("platform", platform)
    .order("period_end", { ascending: false });
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) {
    return NextResponse.json({
      data: { platform, shop: "", period_start: null, period_end: null, campaigns: [], totals: null, meta: { periods: [], shops: [] } },
      error: null,
    });
  }

  const shops = [...new Set(rows.map((r) => String(r.shop ?? "")))];
  const periodKey = (r: Row) => `${r.period_start}|${r.period_end}`;
  const periodsAll = [...new Set(rows.map(periodKey))];
  const periods = periodsAll.map((p) => {
    const [start, end] = p.split("|");
    return { key: p, start, end };
  });

  const shop = paramShop !== null && paramShop !== undefined ? paramShop : String(rows[0].shop ?? shops[0] ?? "");
  const selKey = paramPeriod && periodsAll.includes(paramPeriod) ? paramPeriod : periodKey(rows.find((r) => String(r.shop ?? "") === shop) ?? rows[0]);
  const [ps, pe] = selKey.split("|");

  const campaigns = rows
    .filter((r) => String(r.shop ?? "") === shop && periodKey(r) === selKey)
    .map((r) => ({
      campaign_name: String(r.campaign_name ?? ""),
      status: String(r.status ?? ""),
      ad_type: String(r.ad_type ?? ""),
      impressions: n(r.impressions),
      clicks: n(r.clicks),
      ctr: n(r.ctr),
      orders: n(r.orders),
      conversion_rate: n(r.conversion_rate),
      cpa: n(r.cpa),
      items_sold: n(r.items_sold),
      sales: n(r.sales),
      spend: n(r.spend),
      roas: n(r.roas),
      acos: n(r.acos),
    }))
    .sort((a, b) => b.spend - a.spend);

  const totals = campaigns.reduce(
    (a, c) => {
      a.spend += c.spend;
      a.sales += c.sales;
      a.orders += c.orders;
      a.clicks += c.clicks;
      a.impressions += c.impressions;
      return a;
    },
    { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 },
  );
  const blended = {
    ...totals,
    roas: totals.spend ? totals.sales / totals.spend : 0,
    acos: totals.sales ? (totals.spend / totals.sales) * 100 : 0,
    cpc: totals.clicks ? totals.spend / totals.clicks : 0,
    ctr: totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0,
  };

  return NextResponse.json({
    data: { platform, shop, period_start: ps, period_end: pe, campaigns, totals: blended, meta: { periods, shops } },
    error: null,
  });
}
