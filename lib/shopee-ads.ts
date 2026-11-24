/**
 * Shopee Ads API (อ่านอย่างเดียว) — ยอดโฆษณารายวัน ระดับร้าน + ระดับแคมเปญ · pure parser มีเทสต์ lib/__tests__/shopee-ads.test.ts
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-24 (แผนการตลาด รอบ 3 ข้อ 1 "ดึง Shopee Ads อัตโนมัติทุกวัน")
 * ชื่อช่องตามเอกสาร Shopee Open Platform (เปิดดู 2026-11-24):
 *   GET /api/v2/ads/get_all_cpc_ads_daily_performance?start_date=DD-MM-YYYY&end_date=DD-MM-YYYY
 *     → response[]: date, impression, clicks, broad_order, direct_order, broad_item_sold, broad_gmv, direct_gmv, expense
 *   GET /api/v2/ads/get_product_level_campaign_id_list?ad_type=all&offset&limit
 *     → response.campaign_list[]: campaign_id, ad_type · has_next_page
 *   GET /api/v2/ads/get_product_campaign_daily_performance?start_date&end_date&campaign_id_list=1,2 (≤ 100 ต่อครั้ง)
 *     → response[].campaign_list[]: campaign_id, ad_type, campaign_placement, ad_name, metrics_list[]: date, impression, clicks,
 *        expense, broad_gmv, broad_order, broad_order_amount, direct_order, direct_gmv
 *   ย้อนหลังได้ไม่เกิน 6 เดือน · สิทธิ์แอป: Seller In House System / Marketing / Ads Service
 *   ⚠️ แคมเปญ GMV Max (gms) อยู่อีกชุด API — ยังไม่ดึง (ยอดระดับร้าน "all cpc" อาจไม่รวม)
 * ไฟล์นี้ import "@/lib/shopee" ได้ (server) แต่ส่วน parse เป็น pure
 */
import { shopeeFetch } from "@/lib/shopee";

export type AdsDailyRow = {
  level: "shop" | "campaign"; campaign_id: string; campaign_name: string | null; ad_type: string | null; placement: string | null;
  date: string; impressions: number; clicks: number; orders: number; direct_orders: number; items: number; sales: number; direct_sales: number; spend: number;
};

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** "17-03-2021" → "2021-03-17" (รับ "2021-03-17" ด้วย) · ผิดรูป = null */
export function shopeeAdsDate(s: unknown): string | null {
  const t = String(s ?? "").trim();
  let m = t.match(/^(\d{2})-(\d{2})-(\d{4})$/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return t;
  return null;
}
/** "2021-03-17" → "17-03-2021" */
export const toShopeeAdsDate = (ymd: string) => `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}-${ymd.slice(0, 4)}`;

const metricsOf = (m: Record<string, unknown>) => ({
  impressions: n(m.impression ?? m.impressions), clicks: n(m.clicks),
  orders: n(m.broad_order), direct_orders: n(m.direct_order),
  items: n(m.broad_order_amount ?? m.broad_item_sold), sales: n(m.broad_gmv), direct_sales: n(m.direct_gmv), spend: n(m.expense),
});

/** คำตอบ get_all_cpc_ads_daily_performance → แถวระดับร้าน */
export function parseShopDaily(j: Record<string, unknown>): AdsDailyRow[] {
  const list = Array.isArray(j.response) ? arr(j.response) : arr(obj(j.response).list ?? obj(j.response).daily_list);
  const out: AdsDailyRow[] = [];
  for (const r of list) {
    const date = shopeeAdsDate(r.date); if (!date) continue;
    out.push({ level: "shop", campaign_id: "", campaign_name: null, ad_type: null, placement: null, date, ...metricsOf(r) });
  }
  return out;
}

/** คำตอบ get_product_level_campaign_id_list → รหัสแคมเปญ + มีหน้าถัดไปไหม */
export function parseCampaignIds(j: Record<string, unknown>): { ids: string[]; hasNext: boolean } {
  const r = obj(j.response);
  return { ids: arr(r.campaign_list).map((c) => String(c.campaign_id ?? "")).filter(Boolean), hasNext: r.has_next_page === true };
}

/** คำตอบ get_product_campaign_daily_performance → แถวรายแคมเปญต่อวัน (ข้ามวันที่ไม่มีอะไรเลย) */
export function parseCampaignDaily(j: Record<string, unknown>): AdsDailyRow[] {
  const shops = Array.isArray(j.response) ? arr(j.response) : [obj(j.response)];
  const out: AdsDailyRow[] = [];
  for (const s of shops) for (const c of arr(s.campaign_list)) {
    const common = obj(c.common_info);
    const base = {
      level: "campaign" as const, campaign_id: String(c.campaign_id ?? ""),
      campaign_name: String(c.ad_name ?? common.ad_name ?? "").trim() || null,
      ad_type: String(c.ad_type ?? common.ad_type ?? "").trim() || null,
      placement: String(c.campaign_placement ?? common.campaign_placement ?? "").trim() || null,
    };
    if (!base.campaign_id) continue;
    for (const m of arr(c.metrics_list)) {
      const date = shopeeAdsDate(m.date); if (!date) continue;
      const mt = metricsOf(m);
      if (!mt.spend && !mt.impressions && !mt.clicks && !mt.sales) continue;
      out.push({ ...base, date, ...mt });
    }
  }
  return out;
}

type Tok = { accessToken: string; shopId: string | number };

/** ยอดรวมทั้งร้านรายวัน (ช่วงละไม่เกิน ~30 วัน) */
export async function shopeeAdsShopDaily(t: Tok, fromYmd: string, toYmd: string): Promise<AdsDailyRow[]> {
  return parseShopDaily(await shopeeFetch("/api/v2/ads/get_all_cpc_ads_daily_performance", { ...t, query: { start_date: toShopeeAdsDate(fromYmd), end_date: toShopeeAdsDate(toYmd) } }));
}
/** รหัสแคมเปญทั้งหมดของร้าน */
export async function shopeeAdsCampaignIds(t: Tok): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0, guard = 0; guard < 20; guard++) {
    const r = parseCampaignIds(await shopeeFetch("/api/v2/ads/get_product_level_campaign_id_list", { ...t, query: { ad_type: "all", offset, limit: 500 } }));
    ids.push(...r.ids);
    if (!r.hasNext || !r.ids.length) break;
    offset += r.ids.length;
  }
  return [...new Set(ids)];
}
/** ยอดรายแคมเปญรายวัน (ถามทีละ 100 แคมเปญ) */
export async function shopeeAdsCampaignDaily(t: Tok, ids: readonly string[], fromYmd: string, toYmd: string): Promise<AdsDailyRow[]> {
  const out: AdsDailyRow[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    out.push(...parseCampaignDaily(await shopeeFetch("/api/v2/ads/get_product_campaign_daily_performance", {
      ...t, query: { start_date: toShopeeAdsDate(fromYmd), end_date: toShopeeAdsDate(toYmd), campaign_id_list: ids.slice(i, i + 100).join(",") },
    })));
  }
  return out;
}
