/**
 * สรุปการตลาดรายสัปดาห์ — โหลดตัวเลข + ให้ AI เขียนสรุป + บันทึก (แผนการตลาด รอบ 8 · เจ้าของเลือก 2026-11-27 แบบ A + ข้อ 1-4)
 * --------------------------------------------------------------------------
 * collectWeeklyData  = รวมตัวเลขสัปดาห์ (ยอดขาย/ช่องทาง/สินค้า/ยกเลิก/โฆษณา/รีวิว/โพสต์/แจ้งเตือน) จากตารางเดียวกับแท็บอื่นของหน้าการตลาด
 * generateWeeklyReport = เก็บตัวเลข → AI (aiChat "ai.marketing_weekly" · ปิด/งบหมดได้ที่ศูนย์บริการที่เสียเงิน) → บันทึก marketing_weekly_reports
 *   มีใบของสัปดาห์+แบรนด์นี้แล้ว = เขียนทับใบเดิม แต่เก็บเวอร์ชันเก่าไว้ใน history (ย้อนกลับได้)
 *   AI ใช้ไม่ได้ → ตัวเลขยังบันทึกครบ + ai_error บอกเหตุผล (กดให้ AI เขียนใหม่ทีหลังได้)
 * ⚠️ server เท่านั้น · สูตรล้วน = lib/marketing-weekly-calc.ts
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllPages } from "@/lib/fetch-all";
import { countsAsSale } from "@/lib/platform-order-status";
import { loadOrderItems, loadPlatformOrders, type SalesOrderLite } from "@/lib/platform-sales-load";
import { SALES_TARGET_KEY, bkkStartIso, bkkYmd, itemValueByOrder, orderValue, readSalesTarget, shiftYmd } from "@/lib/platform-dashboard-calc";
import { CANCEL_GROUPS, cancelReasonGroup } from "@/lib/marketing-overview-calc";
import { BREAKEVEN_KEY, aggregateCampaigns, dailyTotals, losingCampaigns, readBreakeven, roasOf, type AdsRow } from "@/lib/marketing-ads-calc";
import { engagementOf, postSummary, reviewSummary } from "@/lib/marketing-content-calc";
import { computeMarketingAlerts } from "@/lib/marketing-alerts-server";
import { aiChat } from "@/lib/paid-services-server";
import {
  WEEKLY_ASK, WEEKLY_SYSTEM, lastFullWeek, movers, parseWeeklyAi, pushWeeklyHistory, reviewSamples, weekEndOf, weeklyPrompt, type WeeklyData,
} from "@/lib/marketing-weekly-calc";

type Admin = ReturnType<typeof supabaseAdmin>;
export const WEEKLY_AI_KEY = "ai.marketing_weekly";
export const WEEKLY_COLS = "id, week_start, brand_id, data, ai_summary, ai_actions, review_summary, ai_model, ai_error, edited, history, source, created_by, updated_by, created_at, updated_at, is_active, deleted_at";

const productKey = (it: { sku_code: string | null; name: string | null }) => (it.sku_code ? it.sku_code.replace(/-\d{1,3}$/, "") : `name:${(it.name ?? "?").slice(0, 60)}`);
const productName = (it: { sku_code: string | null; name: string | null }) => {
  const nm = (it.name ?? "").replace(/\s+/g, " ").trim().slice(0, 50);
  return it.sku_code ? `${it.sku_code.replace(/-\d{1,3}$/, "")} ${nm}`.trim() : nm || "—";
};

export async function collectWeeklyData(admin: Admin, weekStart: string, brandId: string | null, today = bkkYmd(Date.now()) as string): Promise<WeeklyData> {
  const week = { from: weekStart, to: weekEndOf(weekStart) };
  const prev = { from: shiftYmd(weekStart, -7), to: shiftYmd(weekStart, -1) };
  const monthFrom = `${week.to.slice(0, 7)}-01`;
  const loadFrom = [prev.from, monthFrom].sort()[0];
  const notes: string[] = [];

  const [{ data: plats }, { data: brand }, { data: tgt }] = await Promise.all([
    admin.from("erp_platforms").select("id, code, name_th"),
    brandId ? admin.from("brands").select("name").eq("id", brandId).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("ui_config").select("value").eq("key", SALES_TARGET_KEY).maybeSingle(),
  ]);
  const platById = new Map(((plats ?? []) as { id: string; code: string; name_th: string | null }[]).map((p) => [p.id, p]));

  // ── ยอดขาย ──
  const all = (await loadPlatformOrders(admin, { brandId, fromYmd: loadFrom, toYmd: week.to })).filter(countsAsSale);
  const dayOf = (o: SalesOrderLite) => bkkYmd(o.ordered_at ?? null) ?? "";
  const inRange = (o: SalesOrderLite, r: { from: string; to: string }) => { const d = dayOf(o); return d >= r.from && d <= r.to; };
  const two = all.filter((o) => inRange(o, prev) || inRange(o, week));
  const items = await loadOrderItems(admin, two.map((o) => o.id));
  const byOrder = itemValueByOrder(items);
  // ออเดอร์เก่ากว่าสองสัปดาห์ (ต้นเดือน) ใช้ยอดที่จ่าย — พอสำหรับเทียบเป้า
  const val = (o: SalesOrderLite) => orderValue(o, byOrder);
  const cur = all.filter((o) => inRange(o, week)), prv = all.filter((o) => inRange(o, prev));
  const sum = (os: SalesOrderLite[]) => os.reduce((s, o) => s + val(o), 0);
  const salesCur = sum(cur), salesPrev = sum(prv);
  const tval = readSalesTarget((tgt as { value?: unknown } | null)?.value, week.to.slice(0, 7), brandId);
  const mtd = sum(all.filter((o) => inRange(o, { from: monthFrom, to: week.to })));

  const chan = new Map<string, { code: string; name: string; cur: number; prev: number; orders: number }>();
  for (const o of [...cur, ...prv]) {
    const p = o.platform_id ? platById.get(o.platform_id) : undefined;
    const code = p?.code ?? "other";
    const g = chan.get(code) ?? { code, name: p?.name_th ?? "อื่น ๆ", cur: 0, prev: 0, orders: 0 };
    if (inRange(o, week)) { g.cur += val(o); g.orders++; } else g.prev += val(o);
    chan.set(code, g);
  }
  const daily: WeeklyData["daily"] = [];
  for (let i = 0; i < 7; i++) {
    const d = shiftYmd(week.from, i);
    const os = cur.filter((o) => dayOf(o) === d);
    daily.push({ date: d, sales: sum(os), orders: os.length });
  }

  // ── สินค้า ──
  const weekOf = new Map(two.map((o) => [o.id, inRange(o, week) ? "cur" : "prev"]));
  const prod = new Map<string, { key: string; name: string; sales: number; qty: number; prev: number }>();
  for (const it of items) {
    const k = productKey(it);
    const g = prod.get(k) ?? { key: k, name: productName(it), sales: 0, qty: 0, prev: 0 };
    const v = (Number(it.qty) || 0) * (Number(it.price) || 0);
    if (weekOf.get(it.order_id) === "cur") { g.sales += v; g.qty += Number(it.qty) || 0; } else g.prev += v;
    prod.set(k, g);
  }
  const prods = [...prod.values()];
  const mv = movers(prods.map((p) => ({ name: p.name, cur: p.sales, prev: p.prev })));

  // ── ยกเลิก ──
  const cRows = await fetchAllPages<{ id: string; ordered_at: string | null; r1: string | null; r2: string | null }>((a, b) => {
    let q = admin.from("platform_orders").select("id, ordered_at, r1:raw->shopee->>cancel_reason, r2:raw->tiktok->>cancel_reason").eq("status", "cancelled")
      .gte("ordered_at", bkkStartIso(prev.from)).lt("ordered_at", bkkStartIso(shiftYmd(week.to, 1)));
    if (brandId) q = q.eq("brand_id", brandId);
    return q.order("id", { ascending: true }).range(a, b);
  });
  const cCur = cRows.filter((r) => (bkkYmd(r.ordered_at) ?? "") >= week.from);
  const cancels = { count: cCur.length, prev: cRows.length - cCur.length, storeFault: cCur.filter((r) => CANCEL_GROUPS[cancelReasonGroup(r.r1 || r.r2)].storeFault).length };

  // ── โฆษณา ──
  let ads: WeeklyData["ads"] = null;
  {
    const rows = (await fetchAllPages<AdsRow>((a, b) => {
      let q = admin.from("marketing_ads_daily").select("platform, brand_id, account_id, level, campaign_id, campaign_name, ad_type, date, impressions, clicks, orders, sales, spend")
        .gte("date", prev.from).lte("date", week.to);
      if (brandId) q = q.eq("brand_id", brandId);
      return q.order("id", { ascending: true }).range(a, b);
    })).map((r) => ({ ...r, spend: Number(r.spend) || 0, sales: Number(r.sales) || 0, clicks: Number(r.clicks) || 0, impressions: Number(r.impressions) || 0, orders: Number(r.orders) || 0 }));
    if (rows.length) {
      const tot = (from: string, to: string) => dailyTotals(rows.filter((r) => r.date >= from && r.date <= to)).reduce((s, d) => ({ spend: s.spend + d.spend, sales: s.sales + d.sales }), { spend: 0, sales: 0 });
      const a = tot(week.from, week.to), p = tot(prev.from, prev.to);
      const { data: cfg } = await admin.from("ui_config").select("value").eq("key", BREAKEVEN_KEY).maybeSingle();
      const be = (cfg as { value?: unknown } | null)?.value ?? {};
      const losing = losingCampaigns(aggregateCampaigns(rows.filter((r) => r.date >= week.from), (b) => readBreakeven(be, b))).slice(0, 5)
        .map((c) => ({ name: c.name, spend: c.spend, roas: c.roas }));
      ads = { spend: a.spend, sales: a.sales, roas: roasOf(a.sales, a.spend), prevSpend: p.spend, prevSales: p.sales, prevRoas: roasOf(p.sales, p.spend), losing };
    }
  }

  // ── รีวิว (สัปดาห์นี้ · ข้อความน้อยกว่า 10 = ขยายเป็น 28 วัน ให้ AI สรุปได้) ──
  const loadReviews = (from: string) => fetchAllPages<{ rating: number | null; comment: string | null; reply: string | null; images: unknown; item_id: string | null; created_at_shop: string | null }>((a, b) => {
    let q = admin.from("marketing_reviews").select("rating, comment, reply, images, item_id, created_at_shop")
      .gte("created_at_shop", bkkStartIso(from)).lt("created_at_shop", bkkStartIso(shiftYmd(week.to, 1)));
    if (brandId) q = q.eq("brand_id", brandId);
    return q.order("created_at_shop", { ascending: false }).range(a, b);
  });
  const revWeek = await loadReviews(week.from);
  const rs = reviewSummary(revWeek);
  let sampleRows = revWeek, windowDays = 7;
  if (revWeek.filter((r) => (r.comment ?? "").trim().length >= 4).length < 10) { sampleRows = await loadReviews(shiftYmd(week.to, -27)); windowDays = 28; }
  const reviews = { count: rs.count, avg: rs.avg, low: revWeek.filter((r) => r.rating != null && r.rating <= 3).length, lowOpen: rs.lowOpen, replyRate: rs.replyRate, windowDays, samples: reviewSamples(sampleRows) };

  // ── โพสต์ ──
  const posts = (await fetchAllPages<{ platform: string; message: string | null; permalink: string | null; posted_at: string | null; likes: number; comments: number; shares: number; views: number | null }>((a, b) => {
    let q = admin.from("marketing_social_posts").select("platform, message, permalink, posted_at, likes, comments, shares, views")
      .gte("posted_at", bkkStartIso(week.from)).lt("posted_at", bkkStartIso(shiftYmd(week.to, 1)));
    if (brandId) q = q.or(`brand_id.eq.${brandId},brand_id.is.null`);
    return q.order("posted_at", { ascending: false }).range(a, b);
  })).map((p) => ({ ...p, likes: Number(p.likes) || 0, comments: Number(p.comments) || 0, shares: Number(p.shares) || 0 }));
  const topPosts = [...posts].sort((a, b) => engagementOf(b) - engagementOf(a)).slice(0, 3)
    .map((p) => ({ platform: p.platform, text: (p.message ?? "").replace(/\s+/g, " ").trim().slice(0, 90) || "(ไม่มีข้อความ)", engagement: engagementOf(p), link: p.permalink }));

  // ── แจ้งเตือน (เฉพาะใบรวมทุกแบรนด์ของสัปดาห์ล่าสุด — กติกาคิดจาก "วันนี้") ──
  let alerts: WeeklyData["alerts"] = [];
  if (!brandId && weekStart === lastFullWeek(today)) {
    alerts = (await computeMarketingAlerts(admin, today).catch(() => [])).map((a) => ({ level: a.level, title: a.title, body: a.body }));
  }

  if (!ads) notes.push("ยังไม่มีข้อมูลโฆษณาของสัปดาห์นี้ (เชื่อมบัญชีโฆษณาที่แท็บโฆษณา)");
  if (week.to >= today) notes.push("สัปดาห์นี้ยังไม่จบ — ตัวเลขจะเพิ่มขึ้นอีก");

  return {
    v: 1, week, prev, brand: { id: brandId, name: brandId ? ((brand as { name?: string } | null)?.name ?? "แบรนด์") : "ทุกแบรนด์" },
    sales: {
      cur: salesCur, prev: salesPrev, orders: cur.length, prevOrders: prv.length,
      aov: cur.length ? salesCur / cur.length : null, prevAov: prv.length ? salesPrev / prv.length : null,
      target: { month: week.to.slice(0, 7), target: tval, mtd, pct: tval ? mtd / tval : null },
    },
    channels: [...chan.values()].sort((a, b) => b.cur - a.cur),
    daily,
    topProducts: [...prods].sort((a, b) => b.sales - a.sales).slice(0, 10),
    rising: mv.rising, falling: mv.falling, cancels, ads, reviews,
    posts: postSummary(posts), topPosts, alerts, notes,
  };
}

type Ctx = { userId: string | null; request?: Request | null; source: "manual" | "cron" };

/** สร้าง/สร้างใหม่ ใบสรุปสัปดาห์ (เก็บเวอร์ชันเก่าไว้ใน history) — คืนแถวที่บันทึก */
export async function generateWeeklyReport(admin: Admin, weekStart: string, brandId: string | null, ctx: Ctx, opts: { skipAi?: boolean } = {}): Promise<Record<string, unknown>> {
  const data = await collectWeeklyData(admin, weekStart, brandId);
  let summary: string | null = null, actions: unknown[] = [], review: unknown = {}, model: string | null = null, aiError: string | null = null;
  if (!opts.skipAi) {
    try {
      const raw = await aiChat(WEEKLY_AI_KEY, WEEKLY_SYSTEM, [{ type: "text", text: `${weeklyPrompt(data)}\n\n${WEEKLY_ASK}` }], 1800, undefined,
        { request: ctx.request ?? null, userId: ctx.userId, place: "หน้าภาพรวมการตลาด → สรุปสัปดาห์" });
      const p = parseWeeklyAi(raw);
      summary = p.summary || null; actions = p.actions; review = p.review;
      model = "ai";   // รุ่นจริง + ค่าใช้จ่าย ดูที่ศูนย์บริการที่เสียเงิน (ประวัติการใช้) · ช่องนี้แค่บอกว่าข้อความมาจาก AI
      if (!summary) aiError = "AI ตอบกลับว่าง — กด \"ให้ AI เขียนใหม่\" อีกครั้ง";
    } catch (e) {
      aiError = e instanceof Error ? e.message.slice(0, 300) : "AI เขียนสรุปไม่สำเร็จ";
    }
  }

  let q = admin.from("marketing_weekly_reports").select(WEEKLY_COLS).eq("week_start", weekStart).eq("is_active", true);
  q = brandId ? q.eq("brand_id", brandId) : q.is("brand_id", null);
  const { data: cur } = await q.maybeSingle();
  const now = new Date().toISOString();
  const row = { data, ai_summary: summary, ai_actions: actions, review_summary: review, ai_model: model, ai_error: aiError, edited: false, source: ctx.source, updated_by: ctx.userId, updated_at: now };
  if (cur) {
    const c = cur as Record<string, unknown>;
    const history = pushWeeklyHistory(c.history, { at: now, by: ctx.userId, summary: (c.ai_summary as string | null) ?? null, actions: c.ai_actions, review: c.review_summary, reason: "สร้างใหม่" });
    // ไม่ใช้ AI / AI ล้มเหลว ตอนสร้างใหม่ = เก็บข้อความเดิมไว้ (อัปเดตแค่ตัวเลข)
    const keepText = opts.skipAi || aiError ? { ai_summary: c.ai_summary, ai_actions: c.ai_actions, review_summary: c.review_summary, ai_model: c.ai_model, edited: c.edited } : {};
    const { data: up, error } = await admin.from("marketing_weekly_reports").update({ ...row, ...keepText, history }).eq("id", c.id as string).select(WEEKLY_COLS).single();
    if (error) throw new Error(error.message);
    return { ...(up as Record<string, unknown>), _before: c, _created: false };
  }
  const { data: ins, error } = await admin.from("marketing_weekly_reports").insert({ ...row, week_start: weekStart, brand_id: brandId, created_by: ctx.userId, created_at: now }).select(WEEKLY_COLS).single();
  if (error) throw new Error(error.message);
  return { ...(ins as Record<string, unknown>), _before: null, _created: true };
}
