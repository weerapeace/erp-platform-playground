/**
 * ดึง + เก็บยอดโฆษณา (ของกลาง · server เท่านั้น) — ใช้ที่ /api/cron/marketing-ads + ปุ่ม "ดึงตอนนี้" ในแท็บโฆษณา
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-24 (แผนการตลาด รอบ 3 ข้อ 1 Shopee Ads อัตโนมัติ · ข้อ 6 Meta Ads)
 * ที่เก็บ: marketing_ads_daily (ยอดรายวัน ระดับร้าน/แคมเปญ) · marketing_ads_accounts (บัญชี + สถานะดึงล่าสุด + token Meta เข้ารหัส)
 * ครั้งแรกของบัญชี = ย้อน 90 วัน (ทีละ 30 วัน) · ครั้งต่อไป = 7 วันล่าสุด (ยอดจากโฆษณานับย้อนได้ 7 วันหลังคลิก จึงดึงทับทุกครั้ง)
 * ⚠️ อ่านจากแพลตฟอร์มอย่างเดียว
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { decryptSecret } from "@/lib/secret-box";
import { bkkYmd, shiftYmd } from "@/lib/platform-dashboard-calc";
import { shopeeErrorText } from "@/lib/shopee";
import { shopeeAdsCampaignDaily, shopeeAdsCampaignIds, shopeeAdsShopDaily, type AdsDailyRow } from "@/lib/shopee-ads";
import { metaAdsCampaignDaily } from "@/lib/meta-ads";
import { fetchAllPages } from "@/lib/fetch-all";
import { BREAKEVEN_KEY, aggregateCampaigns, losingCampaigns, readBreakeven, type AdsRow } from "@/lib/marketing-ads-calc";
import { getPlatformId, shopeeTokenOrReason } from "@/app/api/shopee/shared";
import { shopeeConnectedBrandIds } from "@/app/api/shopee/orders-sync";

type Admin = ReturnType<typeof supabaseAdmin>;
const BACKFILL_DAYS = 90;
const RECENT_DAYS = 7;

/** ช่วงวันที่ต้องดึง (แบ่งทีละ ≤ 30 วัน) — มีข้อมูลแล้ว = 7 วันล่าสุด */
export function adsWindows(today: string, hasData: boolean): { from: string; to: string }[] {
  const days = hasData ? RECENT_DAYS : BACKFILL_DAYS;
  const out: { from: string; to: string }[] = [];
  for (let end = today; out.length < 10;) {
    const start = shiftYmd(end, -29);
    const floor = shiftYmd(today, -(days - 1));
    out.push({ from: start < floor ? floor : start, to: end });
    if (start <= floor) break;
    end = shiftYmd(start, -1);
  }
  return out;
}

async function hasRows(admin: Admin, platform: string, accountId: string): Promise<boolean> {
  const { count } = await admin.from("marketing_ads_daily").select("id", { count: "exact", head: true }).eq("platform", platform).eq("account_id", accountId);
  return (count ?? 0) > 0;
}

export async function saveAdsRows(admin: Admin, platform: string, brandId: string | null, accountId: string, rows: readonly (AdsDailyRow & { messages?: number })[]): Promise<number> {
  const now = new Date().toISOString();
  const payload = rows.map((r) => ({
    platform, brand_id: brandId, account_id: accountId, level: r.level, campaign_id: r.campaign_id, campaign_name: r.campaign_name, ad_type: r.ad_type, placement: r.placement,
    date: r.date, impressions: Math.round(r.impressions), clicks: Math.round(r.clicks), orders: r.orders, direct_orders: r.direct_orders, items: r.items,
    sales: r.sales, direct_sales: r.direct_sales, spend: r.spend, source: "api", raw: r.messages ? { messages: r.messages } : null, updated_at: now,
  }));
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await admin.from("marketing_ads_daily").upsert(payload.slice(i, i + 500), { onConflict: "platform,account_id,level,campaign_id,date" });
    if (error) throw new Error(error.message);
  }
  return payload.length;
}

async function markAccount(admin: Admin, platform: string, brandId: string | null, accountId: string, name: string | null, r: { ok: boolean; error?: string | null }) {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = { platform, brand_id: brandId, account_id: accountId, last_sync_at: now, last_error: r.ok ? null : (r.error ?? "ดึงไม่สำเร็จ"), updated_at: now };
  if (name) row.account_name = name;
  if (r.ok) row.last_ok_at = now;
  await admin.from("marketing_ads_accounts").upsert(row, { onConflict: "platform,account_id" });
}

export type AdsSyncResult = { platform: string; brand_id: string | null; account: string; ok: boolean; rows?: number; error?: string };

/** Shopee Ads ทุกร้านที่เชื่อมไว้ */
export async function syncShopeeAds(admin: Admin, opts: { deadline: number; brandId?: string | null }): Promise<AdsSyncResult[]> {
  const spId = await getPlatformId(admin, "shopee");
  if (!spId) return [];
  const today = bkkYmd(Date.now()) as string;
  const brands = (await shopeeConnectedBrandIds(admin, spId)).filter((b) => !opts.brandId || b === opts.brandId);
  const { data: off } = await admin.from("marketing_ads_accounts").select("account_id").eq("platform", "shopee").eq("is_active", false);
  const offIds = new Set(((off ?? []) as { account_id: string }[]).map((r) => r.account_id));   // ปิดดึงไว้ในแท็บโฆษณา
  const out: AdsSyncResult[] = [];
  for (const brandId of brands) {
    if (Date.now() > opts.deadline) { out.push({ platform: "shopee", brand_id: brandId, account: "", ok: false, error: "หมดเวลารอบนี้ (รอบถัดไปดึงต่อ)" }); continue; }
    const tok = await shopeeTokenOrReason(admin, brandId, spId, null);
    if (!tok.ok) { out.push({ platform: "shopee", brand_id: brandId, account: "", ok: false, error: tok.reason }); continue; }
    const acct = String(tok.shopId);
    if (offIds.has(acct)) continue;
    const name = (tok.meta as { shop_name?: string } | undefined)?.shop_name ?? null;
    try {
      const wins = adsWindows(today, await hasRows(admin, "shopee", acct));
      const ids = await shopeeAdsCampaignIds(tok);
      let rows = 0;
      for (const w of wins) {
        if (Date.now() > opts.deadline) break;
        const shop = await shopeeAdsShopDaily(tok, w.from, w.to);
        const camp = ids.length ? await shopeeAdsCampaignDaily(tok, ids, w.from, w.to) : [];
        rows += await saveAdsRows(admin, "shopee", brandId, acct, [...shop, ...camp]);
      }
      await markAccount(admin, "shopee", brandId, acct, name, { ok: true });
      out.push({ platform: "shopee", brand_id: brandId, account: acct, ok: true, rows });
    } catch (e) {
      const msg = shopeeErrorText(e);
      await markAccount(admin, "shopee", brandId, acct, name, { ok: false, error: msg });
      out.push({ platform: "shopee", brand_id: brandId, account: acct, ok: false, error: msg });
    }
  }
  return out;
}

/** Meta Ads ทุกบัญชีที่เปิดดึงไว้ */
export async function syncMetaAds(admin: Admin, opts: { deadline: number; brandId?: string | null }): Promise<AdsSyncResult[]> {
  let q = admin.from("marketing_ads_accounts").select("account_id, account_name, brand_id, token_enc, token_expires_at").eq("platform", "meta").eq("is_active", true);
  if (opts.brandId) q = q.eq("brand_id", opts.brandId);
  const { data } = await q;
  const today = bkkYmd(Date.now()) as string;
  const out: AdsSyncResult[] = [];
  for (const a of (data ?? []) as { account_id: string; account_name: string | null; brand_id: string | null; token_enc: string | null; token_expires_at: string | null }[]) {
    if (Date.now() > opts.deadline) break;
    const token = a.token_enc ? await decryptSecret(a.token_enc).catch(() => null) : null;
    if (!token) { await markAccount(admin, "meta", a.brand_id, a.account_id, null, { ok: false, error: "ยังไม่ได้เชื่อม Meta Ads หรือกุญแจหาย — กดเชื่อมใหม่" }); continue; }
    if (a.token_expires_at && Date.parse(a.token_expires_at) < Date.now()) { await markAccount(admin, "meta", a.brand_id, a.account_id, null, { ok: false, error: "สิทธิ์ Meta หมดอายุ (60 วัน) — กดเชื่อม Meta Ads ใหม่" }); continue; }
    try {
      let rows = 0;
      for (const w of adsWindows(today, await hasRows(admin, "meta", a.account_id))) {
        if (Date.now() > opts.deadline) break;
        rows += await saveAdsRows(admin, "meta", a.brand_id, a.account_id, await metaAdsCampaignDaily(token, a.account_id, w.from, w.to));
      }
      await markAccount(admin, "meta", a.brand_id, a.account_id, null, { ok: true });
      out.push({ platform: "meta", brand_id: a.brand_id, account: a.account_id, ok: true, rows });
    } catch (e) {
      const msg = `Meta ตอบว่า: ${e instanceof Error ? e.message : String(e)}`;
      await markAccount(admin, "meta", a.brand_id, a.account_id, null, { ok: false, error: msg });
      out.push({ platform: "meta", brand_id: a.brand_id, account: a.account_id, ok: false, error: msg });
    }
  }
  return out;
}

/** แคมเปญที่ขาดทุนติดกัน ≥ 3 วัน (7 วันล่าสุดถึงเมื่อวาน) — กล่องเตือนหน้าการตลาด + ตัวเตือนทุกเช้า · ยังไม่ตั้งจุดคุ้มทุน = ไม่เตือน */
export async function recentLosingCampaigns(admin: Admin, today: string, brandId?: string | null): Promise<{ name: string; platform: string; spend: number; roas: number | null; breakeven: number | null; days: number }[]> {
  const { data: cfg } = await admin.from("ui_config").select("value").eq("key", BREAKEVEN_KEY).maybeSingle();
  const be = (cfg as { value?: unknown } | null)?.value ?? {};
  if (!Object.keys(be as object).length) return [];
  const rows = await fetchAllPages<AdsRow>((a, b) => {
    let q = admin.from("marketing_ads_daily").select("platform, brand_id, account_id, level, campaign_id, campaign_name, ad_type, date, impressions, clicks, orders, sales, spend")
      .eq("level", "campaign").gte("date", shiftYmd(today, -7)).lte("date", shiftYmd(today, -1));
    if (brandId) q = q.eq("brand_id", brandId);
    return q.order("id", { ascending: true }).range(a, b);
  });
  const norm = rows.map((r) => ({ ...r, spend: Number(r.spend) || 0, sales: Number(r.sales) || 0, clicks: Number(r.clicks) || 0, impressions: Number(r.impressions) || 0, orders: Number(r.orders) || 0 }));
  return losingCampaigns(aggregateCampaigns(norm, (b) => readBreakeven(be, b))).map((c) => ({ name: c.name, platform: c.platform, spend: c.spend, roas: c.roas, breakeven: c.breakeven, days: c.lossStreak }));
}
