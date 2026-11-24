/**
 * สูตรแท็บ "โฆษณา" ของหน้าภาพรวมการตลาด — pure + เทสต์ lib/__tests__/marketing-ads-calc.test.ts
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-24 (แผนการตลาด รอบ 3 · แบบ A + ข้อ 2 ROAS จุดคุ้มทุนต่อแบรนด์ · ข้อ 3 เตือนแคมเปญขาดทุน 3 วันติด)
 * ROAS = ยอดจากโฆษณา ÷ ค่าโฆษณา · ACOS = ค่าโฆษณา ÷ ยอดจากโฆษณา · TACoS = ค่าโฆษณา ÷ ยอดขายทั้งหมด
 * จุดคุ้มทุน (break-even ROAS) เจ้าของตั้งเองต่อแบรนด์ — ui_config `marketing_ads_breakeven` = { "<brand_id หรือ *>": ROAS }
 * ห้าม import "@/..." (ใช้ได้ทั้งหน้าเว็บ/หลังบ้าน/เทสต์)
 */

export const BREAKEVEN_KEY = "marketing_ads_breakeven";
export const NEAR_BAND = 1.2;   // ROAS ≥ คุ้มทุน × 1.2 = ทำกำไร · คุ้มทุน..×1.2 = เฉียด · ต่ำกว่าคุ้มทุน = ขาดทุน

/** จุดคุ้มทุนของแบรนด์ (ไม่มี = ใช้ค่า "*" ทุกแบรนด์ · ไม่มีทั้งคู่ = null) */
export function readBreakeven(v: unknown, brandId: string | null | undefined): number | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  for (const k of [brandId || "", "*"]) { if (!k) continue; const x = Number(m[k]); if (Number.isFinite(x) && x > 0) return x; }
  return null;
}
/** ตั้ง/ลบจุดคุ้มทุน (roas ว่าง/≤0 = ลบ) → ก้อนใหม่ */
export function writeBreakeven(v: unknown, brandId: string | null | undefined, roas: number | null): Record<string, number> {
  const cur = v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, number>) } : {};
  const k = brandId || "*";
  if (roas != null && Number.isFinite(roas) && roas > 0) cur[k] = Math.round(roas * 100) / 100; else delete cur[k];
  return cur;
}

export type AdsStatus = "profit" | "near" | "loss" | "unknown";
export function adsStatus(roas: number | null, breakeven: number | null): AdsStatus {
  if (roas == null || breakeven == null) return "unknown";
  if (roas >= breakeven * NEAR_BAND) return "profit";
  if (roas >= breakeven) return "near";
  return "loss";
}
export const roasOf = (sales: number, spend: number): number | null => (spend > 0 ? sales / spend : null);

export type AdsRow = {
  platform: string; brand_id: string | null; account_id: string; level: "shop" | "campaign"; campaign_id: string; campaign_name: string | null; ad_type: string | null;
  date: string; impressions: number; clicks: number; orders: number; sales: number; spend: number; messages?: number;
};

export type CampaignAgg = {
  key: string; platform: string; brand_id: string | null; account_id: string; campaign_id: string; name: string; ad_type: string | null; source: "api" | "file";
  spend: number; sales: number; orders: number; clicks: number; impressions: number; messages: number;
  roas: number | null; acos: number | null; ctr: number | null; cpc: number | null;
  breakeven: number | null; status: AdsStatus; lossStreak: number; firstDate: string; lastDate: string;
};

/** รวมแถวรายวันระดับแคมเปญ → ต่อแคมเปญ + สถานะเทียบจุดคุ้มทุน + ขาดทุนติดกันกี่วันล่าสุด */
export function aggregateCampaigns(rows: readonly AdsRow[], breakevenOf: (brandId: string | null) => number | null): CampaignAgg[] {
  const m = new Map<string, CampaignAgg & { days: Map<string, { s: number; v: number }> }>();
  for (const r of rows) {
    if (r.level !== "campaign") continue;
    const key = `${r.platform}|${r.account_id}|${r.campaign_id}`;
    let g = m.get(key);
    if (!g) {
      g = { key, platform: r.platform, brand_id: r.brand_id, account_id: r.account_id, campaign_id: r.campaign_id, name: r.campaign_name || r.campaign_id, ad_type: r.ad_type, source: "api",
        spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0, messages: 0, roas: null, acos: null, ctr: null, cpc: null, breakeven: null, status: "unknown", lossStreak: 0, firstDate: r.date, lastDate: r.date, days: new Map() };
      m.set(key, g);
    }
    if (r.campaign_name) g.name = r.campaign_name;
    g.spend += r.spend; g.sales += r.sales; g.orders += r.orders; g.clicks += r.clicks; g.impressions += r.impressions; g.messages += r.messages ?? 0;
    if (r.date < g.firstDate) g.firstDate = r.date; if (r.date > g.lastDate) g.lastDate = r.date;
    const d = g.days.get(r.date) ?? { s: 0, v: 0 }; d.s += r.spend; d.v += r.sales; g.days.set(r.date, d);
  }
  return [...m.values()].map(({ days, ...g }) => {
    const be = breakevenOf(g.brand_id);
    const roas = roasOf(g.sales, g.spend);
    let streak = 0;
    for (const date of [...days.keys()].sort().reverse()) {
      const d = days.get(date) as { s: number; v: number };
      if (d.s <= 0) continue;
      if (be != null && d.v / d.s < be) streak++; else break;
    }
    return {
      ...g, roas, acos: g.sales > 0 ? g.spend / g.sales : null, ctr: g.impressions > 0 ? g.clicks / g.impressions : null, cpc: g.clicks > 0 ? g.spend / g.clicks : null,
      breakeven: be, status: adsStatus(roas, be), lossStreak: streak,
    };
  }).sort((a, b) => b.spend - a.spend);
}

/** แคมเปญที่ขาดทุนติดกัน ≥ minDays วัน (ใช้เตือนทุกเช้า) — เฉพาะที่ตั้งจุดคุ้มทุนแล้ว */
export function losingCampaigns(aggs: readonly CampaignAgg[], minDays = 3): CampaignAgg[] {
  return aggs.filter((c) => c.breakeven != null && c.lossStreak >= minDays).sort((a, b) => b.spend - a.spend);
}

/** ยอดรวมรายวัน — Shopee ใช้ยอดระดับร้าน (ครบกว่า) · ช่องทางที่ไม่มีระดับร้าน (Meta) ใช้ผลรวมแคมเปญ */
export function dailyTotals(rows: readonly AdsRow[]): { date: string; spend: number; sales: number; byPlatform: Record<string, number> }[] {
  const shopKeys = new Set(rows.filter((r) => r.level === "shop").map((r) => `${r.platform}|${r.account_id}`));
  const m = new Map<string, { date: string; spend: number; sales: number; byPlatform: Record<string, number> }>();
  for (const r of rows) {
    const acct = `${r.platform}|${r.account_id}`;
    if (shopKeys.has(acct) ? r.level !== "shop" : r.level !== "campaign") continue;
    const g = m.get(r.date) ?? { date: r.date, spend: 0, sales: 0, byPlatform: {} };
    g.spend += r.spend; g.sales += r.sales; g.byPlatform[r.platform] = (g.byPlatform[r.platform] ?? 0) + r.spend;
    m.set(r.date, g);
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}
