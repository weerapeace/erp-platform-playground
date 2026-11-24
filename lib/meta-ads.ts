/**
 * Meta Ads (Facebook/IG) — อ่านยอดโฆษณารายแคมเปญรายวัน · pure parser มีเทสต์ lib/__tests__/meta-ads.test.ts
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-24 (แผนการตลาด รอบ 3 ข้อ 6 "เชื่อม Meta Ads ตรง")
 * ต้องใช้ token ผู้ใช้ที่มีสิทธิ์ ads_read (ปุ่ม "เชื่อม Meta Ads" ในแท็บโฆษณา → /api/marketing/ads/meta/start)
 *   token ของเพจ (ที่ใช้โพสต์) อ่านโฆษณาไม่ได้ — คนละตัว
 * Graph API:
 *   GET /me/adaccounts?fields=id,name,account_status,currency,timezone_name
 *   GET /{act_id}/insights?level=campaign&time_increment=1&time_range={since,until}
 *       &fields=campaign_id,campaign_name,objective,impressions,clicks,spend,actions,action_values
 * ยอดขาย = มูลค่า "ซื้อ" (omni_purchase → purchase → pixel purchase) · ข้อความแชต (messaging_conversation_started) เก็บใน raw
 * ⚠️ อ่านอย่างเดียว ไม่แก้งบ/แคมเปญ
 */
import { META_API } from "@/lib/meta-graph";
import type { AdsDailyRow } from "@/lib/shopee-ads";

/** สิทธิ์ที่ขอตอน "เชื่อม Meta Ads" (อ่านอย่างเดียว) */
export const META_ADS_SCOPES = ["ads_read", "business_management"];

type Obj = Record<string, unknown>;
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Obj[]) : []);

const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase", "onsite_conversion.purchase"];
const MSG_TYPES = ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection"];

/** ค่าของ action ตามลำดับชนิดที่ต้องการ (เอาตัวแรกที่เจอ ไม่บวกซ้ำ — Meta นับซ้อนกันหลายชนิด) */
export function pickAction(list: unknown, types: readonly string[]): number {
  const rows = arr(list);
  for (const t of types) { const r = rows.find((x) => x.action_type === t); if (r) return n(r.value); }
  return 0;
}

export type MetaAdsRow = AdsDailyRow & { messages: number };

/** แถวจาก insights (level=campaign, time_increment=1) → แถวรายแคมเปญต่อวัน */
export function parseMetaInsights(rows: readonly Obj[]): MetaAdsRow[] {
  const out: MetaAdsRow[] = [];
  for (const r of rows) {
    const date = String(r.date_start ?? "").slice(0, 10);
    const id = String(r.campaign_id ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !id) continue;
    const orders = pickAction(r.actions, PURCHASE_TYPES);
    out.push({
      level: "campaign", campaign_id: id, campaign_name: String(r.campaign_name ?? "").trim() || null,
      ad_type: String(r.objective ?? "").trim() || null, placement: null, date,
      impressions: n(r.impressions), clicks: n(r.clicks), orders, direct_orders: orders, items: 0,
      sales: pickAction(r.action_values, PURCHASE_TYPES), direct_sales: pickAction(r.action_values, PURCHASE_TYPES), spend: n(r.spend),
      messages: pickAction(r.actions, MSG_TYPES),
    });
  }
  return out;
}

async function get(url: string): Promise<Obj> {
  const r = await fetch(url, { cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as Obj;
  if (!r.ok || j.error) { const e = j.error as { message?: string } | undefined; throw new Error(e?.message || `Meta HTTP ${r.status}`); }
  return j;
}

export type MetaAdAccount = { id: string; name: string; status: number; currency: string | null };
export async function metaAdAccounts(token: string): Promise<MetaAdAccount[]> {
  const q = new URLSearchParams({ fields: "id,name,account_status,currency", limit: "100", access_token: token });
  const j = await get(`${META_API}/me/adaccounts?${q}`);
  return arr(j.data).map((a) => ({ id: String(a.id ?? ""), name: String(a.name ?? a.id ?? ""), status: n(a.account_status), currency: (a.currency as string) ?? null })).filter((a) => a.id);
}

/** ยอดรายแคมเปญรายวันของบัญชีโฆษณา (ไล่ทุกหน้า สูงสุด 20 หน้า) */
export async function metaAdsCampaignDaily(token: string, actId: string, fromYmd: string, toYmd: string): Promise<MetaAdsRow[]> {
  const q = new URLSearchParams({
    level: "campaign", time_increment: "1", limit: "500", access_token: token,
    time_range: JSON.stringify({ since: fromYmd, until: toYmd }),
    fields: "campaign_id,campaign_name,objective,impressions,clicks,spend,actions,action_values",
  });
  let url: string | null = `${META_API}/${encodeURIComponent(actId)}/insights?${q}`;
  const rows: Obj[] = [];
  for (let i = 0; url && i < 20; i++) {
    const j = await get(url);
    rows.push(...arr(j.data));
    const next = (j.paging as { next?: string } | undefined)?.next;
    url = typeof next === "string" && next.startsWith("https://graph.facebook.com/") ? next : null;
  }
  return parseMetaInsights(rows);
}
