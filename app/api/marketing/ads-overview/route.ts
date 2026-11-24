/**
 * แท็บ "โฆษณา" ของหน้าภาพรวมการตลาด — /api/marketing/ads-overview (สิทธิ์ marketing.dashboard.view)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-24 (แผนการตลาด รอบ 3 · แบบ A + ข้อ 1-6)
 * GET ?from=&to=&brand_id=&platform=shopee|meta
 *   → kpi (ค่าโฆษณา · ยอดจากโฆษณา · ROAS · ACOS · TACoS · ค่าแอฟฟิลิเอต/Boost) · daily · campaigns (+สถานะเทียบจุดคุ้มทุน)
 *     · files (แคมเปญจากไฟล์ที่อัปโหลด marketing_ads_campaign) · accounts (สถานะดึง Shopee/Meta — ไม่ส่ง token) · breakeven
 * PATCH { brand_id|null, roas|null } → ตั้ง/แก้/ลบจุดคุ้มทุน (products.platforms.edit · audit · หน้าเว็บมีปุ่มย้อนกลับ)
 * ข้อมูลโฆษณา = marketing_ads_daily (เติมโดย /api/cron/marketing-ads) · สูตร = lib/marketing-ads-calc
 * ค่าแอฟฟิลิเอต/Boost = หมวด "ค่าโฆษณา/แอฟฟิลิเอต" จากค่าธรรมเนียมจริงต่อออเดอร์ (lib/marketing-fees-server · รอบ 2)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit, auditChangeMeta } from "@/lib/audit";
import { fetchAllPages } from "@/lib/fetch-all";
import { bkkYmd, monthToDate, orderValue } from "@/lib/platform-dashboard-calc";
import { loadFeeContext } from "@/lib/marketing-fees-server";
import { BREAKEVEN_KEY, adsStatus, aggregateCampaigns, dailyTotals, readBreakeven, roasOf, writeBreakeven, type AdsRow } from "@/lib/marketing-ads-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const isYmd = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
type DbRow = AdsRow & { raw: { messages?: number } | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "marketing.dashboard.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();
  const today = bkkYmd(Date.now()) as string;
  const brandId = (sp.get("brand_id") ?? "").trim() || null;
  const platform = (sp.get("platform") ?? "").trim() || null;
  let from = (sp.get("from") ?? "").trim(); let to = (sp.get("to") ?? "").trim();
  if (!isYmd(from)) from = monthToDate(today).from;
  if (!isYmd(to) || to > today) to = today;
  if (from > to) from = to;

  try {
    const [{ data: cfg }, { data: pf }, { data: br }, { data: accts }] = await Promise.all([
      admin.from("ui_config").select("value").eq("key", BREAKEVEN_KEY).maybeSingle(),
      admin.from("erp_platforms").select("id, code, name_th"),
      admin.from("brands").select("id, name"),
      admin.from("marketing_ads_accounts").select("platform, brand_id, account_id, account_name, is_active, last_sync_at, last_ok_at, last_error, token_expires_at"),
    ]);
    const beCfg = (cfg as { value?: unknown } | null)?.value ?? {};
    const brandName = new Map(((br ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
    const breakevenOf = (b: string | null) => readBreakeven(beCfg, b);

    // ── ยอดโฆษณาจาก API ──
    const rows = (await fetchAllPages<DbRow>((a, b) => {
      let q = admin.from("marketing_ads_daily").select("platform, brand_id, account_id, level, campaign_id, campaign_name, ad_type, date, impressions, clicks, orders, sales, spend, raw").gte("date", from).lte("date", to);
      if (brandId) q = q.eq("brand_id", brandId);
      if (platform) q = q.eq("platform", platform);
      return q.order("id", { ascending: true }).range(a, b);
    })).map((r) => ({ ...r, impressions: Number(r.impressions) || 0, clicks: Number(r.clicks) || 0, orders: Number(r.orders) || 0, sales: Number(r.sales) || 0, spend: Number(r.spend) || 0, messages: r.raw?.messages ?? 0 }));
    const campaigns = aggregateCampaigns(rows, breakevenOf).map((c) => ({ ...c, brand_name: c.brand_id ? brandName.get(c.brand_id) ?? "" : "" }));
    const daily = dailyTotals(rows);

    // ── แคมเปญจากไฟล์ที่อัปโหลด (ไม่รู้แบรนด์ → ซ่อนเมื่อกรองแบรนด์) ──
    type FileRow = { platform: string; shop: string | null; period_start: string; period_end: string; campaign_name: string | null; ad_type: string | null; impressions: number | null; clicks: number | null; orders: number | null; sales: number | null; spend: number | null };
    let files: (FileRow & { roas: number | null; status: string })[] = [];
    if (!brandId && platform !== "meta") {
      const { data } = await admin.from("marketing_ads_campaign").select("platform, shop, period_start, period_end, campaign_name, ad_type, impressions, clicks, orders, sales, spend").gte("period_start", from).lte("period_end", to).order("spend", { ascending: false }).limit(500);
      files = ((data ?? []) as FileRow[]).filter((f) => !platform || f.platform === platform).map((f) => {
        const roas = roasOf(Number(f.sales) || 0, Number(f.spend) || 0);
        return { ...f, roas, status: adsStatus(roas, breakevenOf(null)) };
      });
    }

    // ── ยอดขายทั้งหมด (TACoS) + ค่าแอฟฟิลิเอต/Boost จากค่าธรรมเนียมจริง ──
    const codeById = new Map(((pf ?? []) as { id: string; code: string }[]).map((p) => [p.id, p.code]));
    const ctx = await loadFeeContext(admin, { fromYmd: from, toYmd: to, brandId }, codeById);
    const totalSales = ctx.orders.reduce((s, o) => s + orderValue(o, ctx.valByOrder), 0);
    const affiliate = ctx.summary.map((s) => ({ platform: s.platform, fee: s.byCat.ads, covered: s.covered, orders: s.orders })).filter((x) => x.fee > 0);

    const spend = daily.reduce((s, d) => s + d.spend, 0) + files.reduce((s, f) => s + (Number(f.spend) || 0), 0);
    const adSales = daily.reduce((s, d) => s + d.sales, 0) + files.reduce((s, f) => s + (Number(f.sales) || 0), 0);
    const affiliateFee = affiliate.reduce((s, a) => s + a.fee, 0);
    const be = breakevenOf(brandId);
    const kpi = {
      spend, adSales, roas: roasOf(adSales, spend), acos: adSales > 0 ? spend / adSales : null, totalSales, tacos: totalSales > 0 ? spend / totalSales : null,
      affiliateFee, marketingCost: spend + affiliateFee, marketingPct: totalSales > 0 ? (spend + affiliateFee) / totalSales : null,
      clicks: campaigns.reduce((s, c) => s + c.clicks, 0), impressions: campaigns.reduce((s, c) => s + c.impressions, 0), orders: campaigns.reduce((s, c) => s + c.orders, 0),
      breakeven: be, status: adsStatus(roasOf(adSales, spend), be),
    };

    const accounts = ((accts ?? []) as Record<string, unknown>[])
      .filter((a) => !brandId || a.brand_id === brandId)
      .map((a) => ({ ...a, brand_name: a.brand_id ? brandName.get(String(a.brand_id)) ?? "" : "", token_expires_at: a.token_expires_at ?? null }));

    const notes: string[] = [];
    if (!rows.length && !files.length) notes.push("ยังไม่มียอดโฆษณาในช่วงนี้ — ตัวดึงทำงานวันละ 2 รอบ (08:40 / 20:40) หรือกด “ดึงตอนนี้”");
    if (brandId) notes.push("กรองแบรนด์อยู่ — แคมเปญจากไฟล์ที่อัปโหลดไม่รู้แบรนด์ จึงไม่รวม");
    notes.push("ยอดจากโฆษณา = ยอดซื้อภายใน 7 วันหลังคลิก (ตัวเลขของแพลตฟอร์ม) · ยอดไม่กี่วันล่าสุดยังขยับขึ้นได้");

    return NextResponse.json({
      range: { from, to }, kpi, daily, campaigns, files, affiliate, accounts,
      breakeven: { cfg: beCfg, current: be, brands: [...brandName.entries()].map(([id, name]) => ({ id, name })) }, notes, error: null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/marketing/ads-overview]", e);
    return NextResponse.json({ error: "โหลดข้อมูลโฆษณาไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  let body: { brand_id?: string | null; roas?: number | string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  const brandId = String(body.brand_id ?? "").trim() || null;
  const roas = body.roas == null || body.roas === "" ? null : Number(body.roas);
  if (roas != null && (!Number.isFinite(roas) || roas < 0 || roas > 100)) return NextResponse.json({ error: "ROAS ต้องเป็นตัวเลข 0–100" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("ui_config").select("value").eq("key", BREAKEVEN_KEY).maybeSingle();
  const curV = (cur as { value?: Record<string, number> } | null)?.value ?? {};
  const before = curV[brandId || "*"] ?? null;
  const next = writeBreakeven(curV, brandId, roas);
  const { error } = await admin.from("ui_config").upsert({ key: BREAKEVEN_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 400 });
  const after = next[brandId || "*"] ?? null;
  await writeAudit(admin, {
    action: after == null ? "delete" : before == null ? "create" : "update", entityType: "marketing_ads_breakeven", entityId: brandId,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { brand_id: brandId, label: `ROAS จุดคุ้มทุน${brandId ? "" : " (ทุกแบรนด์)"}`, ...auditChangeMeta({ roas: before }, { roas: after }) },
  });
  return NextResponse.json({ ok: true, roas: after, before, error: null });
}
