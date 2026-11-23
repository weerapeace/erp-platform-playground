/**
 * ภาพรวมการตลาด — /api/marketing/overview (หน้า /marketing/dashboard · สิทธิ์ marketing.dashboard.view)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-23 (แผนการตลาด รอบ 1 · widget แบบ A + แจ้งเตือน · เป้าแยกช่องทาง · เจาะลึก · ตัวกรองแบรนด์ · ส่งออก Excel)
 * GET ?from=&to=&platform_id=&brand_id=&event=YYYY-MM-DD
 *   → kpi · compare (ช่วงก่อน/เดือนก่อน/ปีก่อน) · pace (เดือนนี้เทียบเป้า) · byPlatform · daily · monthDaily · heatmap
 *     · products (80/20 + ดาวรุ่ง/กำลังตก) · cancel (จัดกลุ่มเหตุผล) · campaign (วันพิเศษ) · alerts · notes
 * GET ?orders_for=<key สินค้า>&from&to  → ออเดอร์ที่มีสินค้านั้น (เจาะลึกจากตารางสินค้า · สูงสุด 200 ใบ)
 * ข้อมูล: platform_orders(+items) — ยอดขาย = มูลค่าสินค้า ชุดเดียวกับแดชบอร์ดช่องทางขาย (lib/platform-dashboard-calc)
 *   สูตรวิเคราะห์ = lib/marketing-overview-calc (pure + เทสต์) · โหลด = lib/platform-sales-load (ของกลาง)
 * เป้า: ui_config platform_sales_targets (ตั้ง/แก้/ลบ ผ่าน PATCH /api/platform-dashboard + platform_code · มี audit)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";
import { countsAsSale } from "@/lib/platform-order-status";
import { r2ImageUrl } from "@/lib/r2-image";
import { loadOrderItems, loadPlatformOrders, type SalesOrderLite } from "@/lib/platform-sales-load";
import { SALES_TARGET_KEY, bkkStartIso, bkkYmd, itemValueByOrder, monthToDate, orderValue, readSalesTarget, shiftYmd, type ItemLite } from "@/lib/platform-dashboard-calc";
import {
  abcClassify, buildMarketingAlerts, campaignDaysBetween, campaignResult, changePct, comparePeriods, daysInclusive, groupCancelReasons,
  cancelReasonGroup, CANCEL_GROUPS, paceToTarget, significantFalls, topHeatCells, trendOf, weekHourHeatmap,
} from "@/lib/marketing-overview-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const isYmd = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const MAX_DAILY = 120;           // ช่วงยาวกว่านี้ → กราฟรายเดือน
const TREND_DAYS = 14;           // ดาวรุ่ง/กำลังตก: 14 วันล่าสุด เทียบ 14 วันก่อนหน้า
const CAMPAIGN_LOOKBACK = 180;   // วันพิเศษย้อนหลังกี่วัน

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "marketing.dashboard.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();
  const today = bkkYmd(Date.now()) as string;
  const platformId = (sp.get("platform_id") ?? "").trim() || null;
  const brandId = (sp.get("brand_id") ?? "").trim() || null;
  const mtd = monthToDate(today);
  let from = (sp.get("from") ?? "").trim(); let to = (sp.get("to") ?? "").trim();
  if (!isYmd(from)) from = mtd.from;
  if (!isYmd(to) || to > today) to = today;
  if (from > to) from = to;

  try {
    // ── เจาะลึก: ออเดอร์ที่มีสินค้าตัวนี้ ──
    const ordersFor = (sp.get("orders_for") ?? "").trim();
    if (ordersFor) return NextResponse.json(await ordersForProduct(admin, ordersFor, from, to, platformId, brandId), { headers: { "Cache-Control": "no-store" } });

    const [{ data: pf }, { data: br }, { data: tgt }] = await Promise.all([
      admin.from("erp_platforms").select("id, code, name_th, icon_key").eq("is_active", true).order("sort_order", { ascending: true }),
      admin.from("brands").select("id, name").eq("is_active", true).not("hide_in_sales_channels", "is", true).order("name", { ascending: true }),
      admin.from("ui_config").select("value").eq("key", SALES_TARGET_KEY).maybeSingle(),
    ]);
    const platforms: Platform[] = ((pf ?? []) as Record<string, unknown>[]).map((p) => ({ id: String(p.id), code: String(p.code ?? ""), name_th: String(p.name_th ?? p.code ?? ""), icon_key: (p.icon_key as string) ?? null }));
    const brands = ((br ?? []) as Record<string, unknown>[]).map((b) => ({ id: String(b.id), name: String(b.name ?? "") }));
    const pfById = new Map(platforms.map((p) => [p.id, p]));
    const platformCode = platformId ? pfById.get(platformId)?.code ?? null : null;

    // ── หน้าต่างเวลาเดียว ครอบทุกอย่างที่ต้องใช้ ──
    const cmp = comparePeriods(from, to);
    const trendTo = to, trendCurFrom = shiftYmd(trendTo, -(TREND_DAYS - 1)), trendPrevFrom = shiftYmd(trendTo, -(2 * TREND_DAYS - 1)), trendPrevTo = shiftYmd(trendTo, -TREND_DAYS);
    const campaignFrom = shiftYmd(today, -CAMPAIGN_LOOKBACK);
    const days = campaignDaysBetween(campaignFrom, today);
    const eventParam = (sp.get("event") ?? "").trim();
    const winFrom = [from, cmp.prev.from, cmp.lastMonth.from, mtd.prevFrom, shiftYmd(today, -35), trendPrevFrom, campaignFrom].sort()[0];
    const win = await loadPlatformOrders(admin, { platformId, brandId, fromYmd: winFrom });
    const winSales = win.filter(countsAsSale);
    const items = await loadOrderItems(admin, winSales.map((o) => o.id));
    const valByOrder = itemValueByOrder(items);
    const val = (o: SalesOrderLite) => orderValue(o, valByOrder);
    const dayOf = (o: SalesOrderLite) => bkkYmd(o.ordered_at ?? null);
    const between = (os: SalesOrderLite[], a: string, b: string) => os.filter((o) => { const d = dayOf(o); return !!d && d >= a && d <= b; });
    const sumVal = (os: SalesOrderLite[]) => os.reduce((s, o) => s + val(o), 0);
    const sumPaid = (os: SalesOrderLite[]) => os.reduce((s, o) => s + (Number(o.total) || 0), 0);

    // ── ปีก่อน: นอกหน้าต่าง → ถามแยก (ส่วนใหญ่ยังไม่มีข้อมูล) ──
    let lastYearSales: SalesOrderLite[] = [];
    {
      const ly = (await loadPlatformOrders(admin, { platformId, brandId, fromYmd: cmp.lastYear.from, toYmd: cmp.lastYear.to })).filter(countsAsSale);
      if (ly.length) {
        const lyItems = await loadOrderItems(admin, ly.map((o) => o.id));
        const m = itemValueByOrder(lyItems);
        for (const [k, v] of m) valByOrder.set(k, v);
      }
      lastYearSales = ly;
    }

    // ── KPI ช่วงที่เลือก ──
    const rangeAll = between(win, from, to);
    const rangeSales = rangeAll.filter(countsAsSale);
    const sales = sumVal(rangeSales);
    const cancelledRange = rangeAll.filter((o) => o.status === "cancelled");
    const noValue = rangeSales.filter((o) => !(val(o) > 0));   // ไม่มียอดเงินเลย (เช่น Lazada จากเมล: ไม่มีราคาในรายการ + ไม่มียอดรวม)
    const kpi = {
      sales, paid: sumPaid(rangeSales), orders: rangeSales.length, aov: rangeSales.length ? sales / rangeSales.length : 0,
      allOrders: rangeAll.length, cancelled: cancelledRange.length, cancelRate: rangeAll.length ? cancelledRange.length / rangeAll.length : 0,
      noValueOrders: noValue.length,
    };
    const periodOf = (os: SalesOrderLite[], p: { from: string; to: string }) => ({ ...p, sales: sumVal(os), orders: os.length });
    const compare = {
      prev: periodOf(between(winSales, cmp.prev.from, cmp.prev.to), cmp.prev),
      lastMonth: periodOf(between(winSales, cmp.lastMonth.from, cmp.lastMonth.to), cmp.lastMonth),
      lastYear: periodOf(lastYearSales, cmp.lastYear),
    };

    // ── เดือนนี้ เทียบเป้า (ช่องทางที่เลือก หรือรวม) ──
    const tv = (tgt as { value?: unknown } | null)?.value;
    const monthSalesOrders = between(winSales, mtd.from, mtd.to);
    const monthTarget = readSalesTarget(tv, mtd.ym, brandId, platformCode);
    const pace = { ym: mtd.ym, scope: platformCode ? "platform" : "all", ...paceToTarget(sumVal(monthSalesOrders), monthTarget, today) };
    const targets = {
      ym: mtd.ym,
      total: readSalesTarget(tv, mtd.ym, brandId),
      byPlatform: Object.fromEntries(platforms.map((p) => [p.code, readSalesTarget(tv, mtd.ym, brandId, p.code)])),
    };
    const monthDaily: { date: string; sales: number }[] = [];
    {
      const m = new Map<string, number>();
      for (const o of monthSalesOrders) { const d = dayOf(o) as string; m.set(d, (m.get(d) ?? 0) + val(o)); }
      for (let d = mtd.from; d <= today; d = shiftYmd(d, 1)) monthDaily.push({ date: d, sales: m.get(d) ?? 0 });
    }

    // ── แยกช่องทาง ──
    const prevSalesOrders = between(winSales, cmp.prev.from, cmp.prev.to);
    const byPlatform = platforms.map((p) => {
      const ss = rangeSales.filter((o) => o.platform_id === p.id);
      const all = rangeAll.filter((o) => o.platform_id === p.id);
      const pv = prevSalesOrders.filter((o) => o.platform_id === p.id);
      const s = sumVal(ss);
      return {
        id: p.id, code: p.code, name_th: p.name_th, icon_key: p.icon_key, sales: s, paid: sumPaid(ss), orders: ss.length,
        prevSales: sumVal(pv), change: changePct(s, sumVal(pv)), share: sales > 0 ? s / sales : 0,
        cancelled: all.filter((o) => o.status === "cancelled").length, allOrders: all.length,
        noValue: noValue.filter((o) => o.platform_id === p.id).length,
        target: targets.byPlatform[p.code] ?? null,
      };
    }).filter((x) => x.allOrders > 0 || x.prevSales > 0);

    // ── ยอดรายวัน (แยกช่องทาง) ──
    const span = daysInclusive(from, to);
    const monthly = span > MAX_DAILY;
    const dailyMap = new Map<string, { date: string; sales: number; orders: number; byPlatform: Record<string, number> }>();
    if (monthly) {
      for (let m = from.slice(0, 7); m <= to.slice(0, 7);) {
        dailyMap.set(m, { date: m, sales: 0, orders: 0, byPlatform: {} });
        const [y, mo] = m.split("-").map(Number);
        m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
      }
    } else for (let d = from; d <= to; d = shiftYmd(d, 1)) dailyMap.set(d, { date: d, sales: 0, orders: 0, byPlatform: {} });
    for (const o of rangeSales) {
      const d = dayOf(o) as string;
      const g = dailyMap.get(monthly ? d.slice(0, 7) : d);
      if (!g) continue;
      const v = val(o); const code = pfById.get(o.platform_id ?? "")?.code ?? "other";
      g.sales += v; g.orders += 1; g.byPlatform[code] = (g.byPlatform[code] ?? 0) + v;
    }
    const daily = { unit: monthly ? "month" : "day", points: [...dailyMap.values()] };

    // ── แผนที่ความร้อน วัน × ชั่วโมง ──
    const heat = weekHourHeatmap(rangeSales, val);

    // ── สินค้า: ยอดช่วงที่เลือก + ช่วงก่อน + เทรนด์ 14 วัน + 80/20 ──
    const itemsByOrder = new Map<string, ItemLite[]>();
    for (const it of items) { const a = itemsByOrder.get(it.order_id) ?? []; a.push(it); itemsByOrder.set(it.order_id, a); }
    type Agg = { key: string; matched: string | null; code: string | null; name: string; sales: number; qty: number; orders: Set<string>; prevSales: number; tCur: number; tPrev: number; platforms: Map<string, number> };
    const agg = new Map<string, Agg>();
    const keyOf = (it: ItemLite) => it.matched_sku_id || it.sku_code || it.name || "?";
    const touch = (it: ItemLite) => {
      const k = keyOf(it);
      let g = agg.get(k);
      if (!g) { g = { key: k, matched: it.matched_sku_id, code: it.sku_code, name: it.name ?? it.sku_code ?? "—", sales: 0, qty: 0, orders: new Set(), prevSales: 0, tCur: 0, tPrev: 0, platforms: new Map() }; agg.set(k, g); }
      return g;
    };
    const lineVal = (it: ItemLite) => (Number(it.qty) || 0) * (Number(it.price) || 0);
    for (const o of rangeSales) for (const it of itemsByOrder.get(o.id) ?? []) {
      const g = touch(it); g.sales += lineVal(it); g.qty += Number(it.qty) || 0; g.orders.add(o.id);
      const code = pfById.get(o.platform_id ?? "")?.code ?? "other"; g.platforms.set(code, (g.platforms.get(code) ?? 0) + lineVal(it));
    }
    for (const o of prevSalesOrders) for (const it of itemsByOrder.get(o.id) ?? []) touch(it).prevSales += lineVal(it);
    for (const o of between(winSales, trendCurFrom, trendTo)) for (const it of itemsByOrder.get(o.id) ?? []) touch(it).tCur += lineVal(it);
    for (const o of between(winSales, trendPrevFrom, trendPrevTo)) for (const it of itemsByOrder.get(o.id) ?? []) touch(it).tPrev += lineVal(it);

    const avgLine = sales > 0 && agg.size ? sales / agg.size : 0;
    const minBase = Math.max(500, avgLine * 0.5);   // ตัวขายน้อยมาก แกว่งนิดเดียวไม่นับเป็นดาวรุ่ง/ตก
    const ranked = abcClassify([...agg.values()].filter((g) => g.sales > 0 || g.tCur > 0 || g.tPrev > 0 || g.prevSales > 0));
    const matchedIds = ranked.map((g) => g.matched).filter((x): x is string => !!x);
    const skuInfo = new Map<string, { code: string; name: string; image: string | null }>();
    for (let i = 0; i < matchedIds.length; i += 200) {
      const { data } = await admin.from("skus_v2").select("id, code, name_th, cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key )").in("id", matchedIds.slice(i, i + 200));
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        const parent = r.parent_skus_v2 as { cover_image_r2_key?: string | null } | { cover_image_r2_key?: string | null }[] | null;
        const pKey = Array.isArray(parent) ? parent[0]?.cover_image_r2_key : parent?.cover_image_r2_key;
        skuInfo.set(String(r.id), { code: String(r.code ?? ""), name: String(r.name_th ?? ""), image: r2ImageUrl(((r.cover_image_r2_key as string | null) || pKey) ?? null, 120) });
      }
    }
    const products = ranked.map((g) => {
      const info = g.matched ? skuInfo.get(g.matched) : undefined;
      const t = trendOf(g.tCur, g.tPrev, { minBase });
      return {
        key: g.key, matched: !!g.matched, code: info?.code || g.code || "", name: info?.name || g.name, image: info?.image ?? null,
        sales: g.sales, qty: g.qty, orders: g.orders.size, prevSales: g.prevSales, change: changePct(g.sales, g.prevSales),
        abc: g.abc, share: g.share, trend: t.trend, trendChange: t.change, last14: g.tCur, prev14: g.tPrev,
        platforms: [...g.platforms.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => platforms.find((p) => p.code === c)?.name_th ?? c).join(", "),
      };
    });
    const abcSummary = (["A", "B", "C"] as const).map((k) => { const rs = products.filter((p) => p.abc === k && p.sales > 0); return { abc: k, count: rs.length, sales: rs.reduce((s, p) => s + p.sales, 0) }; });

    // ── ยกเลิก: เหตุผล (Shopee/TikTok เก็บไว้ใน raw) ──
    type CRow = { id: string; platform_id: string | null; ordered_at: string | null; r1: string | null; r2: string | null };
    const cancelFrom = [from, shiftYmd(today, -6)].sort()[0];
    const cRows = await fetchAllPages<CRow>((a, b) => {
      let q = admin.from("platform_orders").select("id, platform_id, ordered_at, r1:raw->shopee->>cancel_reason, r2:raw->tiktok->>cancel_reason").eq("status", "cancelled").gte("ordered_at", bkkStartIso(cancelFrom)).lt("ordered_at", bkkStartIso(shiftYmd(to > today ? to : today, 1)));
      if (platformId) q = q.eq("platform_id", platformId);
      if (brandId) q = q.eq("brand_id", brandId);
      return q.order("id", { ascending: true }).range(a, b);
    });
    const reasonOf = (r: CRow) => r.r1 || r.r2 || null;
    const inRangeC = cRows.filter((r) => { const d = bkkYmd(r.ordered_at); return !!d && d >= from && d <= to; });
    const last7From = shiftYmd(today, -6);
    const storeFault7d = cRows.filter((r) => { const d = bkkYmd(r.ordered_at); return !!d && d >= last7From && CANCEL_GROUPS[cancelReasonGroup(reasonOf(r))].storeFault; }).length;
    const cancel = {
      total: cancelledRange.length, rate: kpi.cancelRate, storeFault7d,
      groups: groupCancelReasons(inRangeC.map(reasonOf)),
      byPlatform: byPlatform.map((p) => ({ code: p.code, name_th: p.name_th, cancelled: p.cancelled, allOrders: p.allOrders, rate: p.allOrders ? p.cancelled / p.allOrders : 0 })),
    };

    // ── วันพิเศษ ──
    const salesDaily = new Map<string, { sales: number; orders: number }>();
    for (const o of winSales) { const d = dayOf(o) as string; const g = salesDaily.get(d) ?? { sales: 0, orders: 0 }; g.sales += val(o); g.orders += 1; salesDaily.set(d, g); }
    const campaignDays = days.map((d) => ({ ...d, sales: salesDaily.get(d.date)?.sales ?? 0, orders: salesDaily.get(d.date)?.orders ?? 0 }));
    const firstDouble = campaignDays.find((d) => /^\d+\.\d+$/.test(d.label) && d.date <= today);
    const eventDate = isYmd(eventParam) ? eventParam : firstDouble?.date ?? null;
    const campaign = {
      days: campaignDays,
      selected: eventDate ? { ...campaignResult(salesDaily, eventDate), label: campaignDays.find((d) => d.date === eventDate)?.label ?? eventDate } : null,
    };

    // ── แจ้งเตือน ──
    const yesterday = shiftYmd(today, -1);
    const avgFrom = shiftYmd(today, -29), avgTo = shiftYmd(today, -2);
    const avgDaily28 = sumVal(between(winSales, avgFrom, avgTo)) / 28;
    const fallingA = significantFalls(products.map((p) => ({ ...p, cur: p.last14, prev: p.prev14 })), sales).map((p) => ({ name: p.code || p.name, change: p.trendChange }));
    const alerts = buildMarketingAlerts({ pace, yesterday: sumVal(between(winSales, yesterday, yesterday)), avgDaily28, storeFaultCancels7d: storeFault7d, fallingA });

    // ── หมายเหตุข้อมูล ──
    const notes: string[] = [];
    if (noValue.length) notes.push(`${noValue.length} ออเดอร์ไม่มียอดเงิน (ส่วนใหญ่ Lazada ที่มาทางอีเมล) — นับจำนวนใบได้ แต่ยอดเงินยังไม่รวม`);
    const rangeIds = new Set(rangeSales.map((o) => o.id));
    const unmatchedLines = items.filter((it) => !it.matched_sku_id && rangeIds.has(it.order_id)).length;
    if (unmatchedLines) notes.push(`${unmatchedLines} รายการสินค้ายังไม่จับคู่ SKU — ในตารางสินค้าจะแสดงเป็นรหัสบนร้านแยกต่างหาก`);

    return NextResponse.json({
      filters: { platforms, brands }, range: { from, to, days: span }, today, kpi, compare, pace, targets, monthDaily, byPlatform, daily,
      heatmap: { grid: heat, top: topHeatCells(heat, 3) }, products, abcSummary, trendWindow: { curFrom: trendCurFrom, to: trendTo, prevFrom: trendPrevFrom, prevTo: trendPrevTo },
      cancel, campaign, alerts, notes, error: null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/marketing/overview]", e);
    return NextResponse.json({ error: "โหลดข้อมูลการตลาดไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
  }
}

/** ออเดอร์ที่มีสินค้า key (matched_sku_id หรือรหัสบนร้าน หรือชื่อ) ในช่วง — ใช้เจาะลึกจากตารางสินค้า */
async function ordersForProduct(admin: ReturnType<typeof supabaseAdmin>, key: string, from: string, to: string, platformId: string | null, brandId: string | null) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(key);
  const orders = (await loadPlatformOrders(admin, { platformId, brandId, fromYmd: from, toYmd: to })).filter(countsAsSale);
  const items = await loadOrderItems(admin, orders.map((o) => o.id));
  const hit = items.filter((it) => (isUuid ? it.matched_sku_id === key : !it.matched_sku_id && (it.sku_code || it.name) === key));
  const byOrder = new Map<string, { qty: number; value: number }>();
  for (const it of hit) { const g = byOrder.get(it.order_id) ?? { qty: 0, value: 0 }; g.qty += Number(it.qty) || 0; g.value += (Number(it.qty) || 0) * (Number(it.price) || 0); byOrder.set(it.order_id, g); }
  const ids = [...byOrder.keys()];
  const { data: pf } = await admin.from("erp_platforms").select("id, name_th");
  const pfName = new Map(((pf ?? []) as { id: string; name_th: string | null }[]).map((p) => [String(p.id), p.name_th ?? null]));
  const meta = new Map<string, { order_no: string | null; platform: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("platform_orders").select("id, order_no, external_order_id, platform_id").in("id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      meta.set(String(r.id), { order_no: String(r.order_no || r.external_order_id || "").trim() || null, platform: pfName.get(String(r.platform_id ?? "")) ?? null });
    }
  }
  const rows = orders.filter((o) => byOrder.has(o.id)).sort((a, b) => String(b.ordered_at).localeCompare(String(a.ordered_at))).slice(0, 200).map((o) => ({
    id: o.id, ordered_at: o.ordered_at ?? null, order_no: meta.get(o.id)?.order_no ?? null, platform: meta.get(o.id)?.platform ?? null,
    qty: byOrder.get(o.id)!.qty, value: byOrder.get(o.id)!.value, status: o.status,
  }));
  return { orders: rows, total: byOrder.size, error: null };
}
