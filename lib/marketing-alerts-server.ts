/**
 * คิดแจ้งเตือนการตลาด (ภาพรวมทุกช่องทาง ทุกแบรนด์) — ใช้ที่ตัวเตือนทุกเช้า /api/cron/marketing-alert
 * กติกาเดียวกับกล่อง "ต้องจัดการ" บนหน้า /marketing/dashboard (lib/marketing-overview-calc buildMarketingAlerts)
 *   หน้าเว็บคิดจากข้อมูลที่โหลดตามตัวกรองอยู่แล้ว · ตัวนี้โหลดเองแบบรวมทั้งหมด (ไม่มีตัวกรอง)
 * ⚠️ server เท่านั้น
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllPages } from "@/lib/fetch-all";
import { countsAsSale } from "@/lib/platform-order-status";
import { loadOrderItems, loadPlatformOrders, type SalesOrderLite } from "@/lib/platform-sales-load";
import { SALES_TARGET_KEY, bkkStartIso, bkkYmd, itemValueByOrder, monthToDate, orderValue, readSalesTarget, shiftYmd } from "@/lib/platform-dashboard-calc";
import { CANCEL_GROUPS, abcClassify, buildMarketingAlerts, cancelReasonGroup, paceToTarget, significantFalls, trendOf, type MarketingAlert } from "@/lib/marketing-overview-calc";

type Admin = ReturnType<typeof supabaseAdmin>;

export async function computeMarketingAlerts(admin: Admin, today = bkkYmd(Date.now()) as string): Promise<MarketingAlert[]> {
  const mtd = monthToDate(today);
  const winFrom = [mtd.from, shiftYmd(today, -29)].sort()[0];
  const win = (await loadPlatformOrders(admin, { fromYmd: winFrom })).filter(countsAsSale);
  const items = await loadOrderItems(admin, win.map((o) => o.id));
  const byOrder = itemValueByOrder(items);
  const val = (o: SalesOrderLite) => orderValue(o, byOrder);
  const dayOf = (o: SalesOrderLite) => bkkYmd(o.ordered_at ?? null) ?? "";
  const sumBetween = (a: string, b: string) => win.reduce((s, o) => { const d = dayOf(o); return d >= a && d <= b ? s + val(o) : s; }, 0);

  const { data: tgt } = await admin.from("ui_config").select("value").eq("key", SALES_TARGET_KEY).maybeSingle();
  const pace = paceToTarget(sumBetween(mtd.from, mtd.to), readSalesTarget((tgt as { value?: unknown } | null)?.value, mtd.ym, null), today);
  const yesterday = shiftYmd(today, -1);

  // ยกเลิกฝั่งร้าน 7 วัน
  const since = shiftYmd(today, -6);
  const cRows = await fetchAllPages<{ id: string; r1: string | null; r2: string | null }>((a, b) =>
    admin.from("platform_orders").select("id, r1:raw->shopee->>cancel_reason, r2:raw->tiktok->>cancel_reason").eq("status", "cancelled").gte("ordered_at", bkkStartIso(since)).order("id", { ascending: true }).range(a, b));
  const storeFault7d = cRows.filter((r) => CANCEL_GROUPS[cancelReasonGroup(r.r1 || r.r2)].storeFault).length;

  // สินค้ากลุ่ม A (30 วัน) ที่ 14 วันล่าสุดตก
  const curFrom = shiftYmd(today, -13), prevFrom = shiftYmd(today, -27), prevTo = shiftYmd(today, -14);
  const dayByOrder = new Map(win.map((o) => [o.id, dayOf(o)]));
  const agg = new Map<string, { name: string; sales: number; cur: number; prev: number }>();
  for (const it of items) {
    const k = it.matched_sku_id || it.sku_code || it.name || "?";
    const g = agg.get(k) ?? { name: it.sku_code || it.name || "—", sales: 0, cur: 0, prev: 0 };
    const v = (Number(it.qty) || 0) * (Number(it.price) || 0);
    const d = dayByOrder.get(it.order_id) ?? "";
    if (d >= shiftYmd(today, -29)) g.sales += v;
    if (d >= curFrom && d <= today) g.cur += v;
    if (d >= prevFrom && d <= prevTo) g.prev += v;
    agg.set(k, g);
  }
  const total = [...agg.values()].reduce((s, g) => s + g.sales, 0);
  const minBase = Math.max(500, agg.size ? (total / agg.size) * 0.5 : 0);
  const fallingA = significantFalls(abcClassify([...agg.values()]).map((g) => { const t = trendOf(g.cur, g.prev, { minBase }); return { ...g, trend: t.trend, change: t.change }; }), total)
    .map((g) => ({ name: g.name, change: g.change }));

  return buildMarketingAlerts({ pace, yesterday: sumBetween(yesterday, yesterday), avgDaily28: sumBetween(shiftYmd(today, -29), shiftYmd(today, -2)) / 28, storeFaultCancels7d: storeFault7d, fallingA });
}
