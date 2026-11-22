/**
 * แดชบอร์ดรวมผู้บริหาร (หลายแพลตฟอร์ม) — /api/platform-dashboard
 * GET ?platform_id=&brand_id=&from=&to=  (products.platforms.view)
 *   → kpi · month (ยอดเดือนนี้ + เดือนก่อนช่วงเดียวกัน + เป้า) · byPlatform · byStatus · byDay · hourly (เลือกวันเดียว)
 *     · topProducts (ตามยอด+ตามชิ้น) · lowStock (เฉพาะที่ขายได้ใน 30 วัน) · shipDue · unmatched · latest · connection · prev
 * PATCH { set_target, month: "YYYY-MM", brand_id?, amount|null }  (products.platforms.edit) → ตั้ง/ลบเป้ายอดขายเดือนนั้น (+ audit)
 * รวมจาก: platform_orders(+items) · platform_catalog_listings · lib/sku-stock · สถานะดึงออเดอร์/สินค้า (lib/order-pull-server · catalog_refresh)
 * หมายเหตุ: aggregate ฝั่ง JS (ไล่ทีละหน้า) — ถ้าโตมากค่อยย้ายเป็น SQL/rpc · สูตรตัวเลข = lib/platform-dashboard-calc (pure + เทสต์)
 * 🐛 แก้ 2026-11-14 (หลังดึงออเดอร์ Shopee จาก API แล้วออเดอร์เกินพัน):
 *   - เดิม .limit(5000) แต่ PostgREST ตัดที่ 1,000 เงียบ ๆ → ไล่ทีละหน้า (fetchAllPages)
 *   - ยอดขายนับใบที่ผู้ซื้อยังไม่จ่าย (UNPAID) → ใช้กติกากลาง countsAsSale (ตัวเดียวกับรายงานยอดขาย)
 *   - "รอแพ็ค/ยืนยัน · รอส่ง" นับใบจากเมล (ส่งแล้ว สถานะ new ตลอด) เป็นพัน → ใช้ needsAction (ตัวเดียวกับศูนย์ออเดอร์)
 *   - กรองวันที่ด้วย ordered_at ขอบวันเวลาไทย · สินค้าขายดีถามทีละชุด
 * ➕ 2026-11-20: byDay · prev · topProducts[].image · byPlatform[].id
 * ➕ 2026-11-22 (เจ้าของขอ 9 ข้อ + ข้อเสริม 1-7 · หน้าใหม่แบบปกติ):
 *   - ยอดขายหลัก = ราคาสินค้าแบบหน้าร้าน (ตรงกับ Shopee: Σ จำนวน×ราคาหลังส่วนลดร้าน) + salesPaid = ลูกค้าจ่ายจริง (เดิมใช้ตัวนี้ → Shopee 17,100 แต่หน้านี้ 12,387)
 *   - month · shipDue (ต้องส่งวันนี้/เลยกำหนด) · cancel rate · AOV · unmatched (รายการในออเดอร์ที่ยังไม่จับคู่ SKU) · latest (ออเดอร์ล่าสุด)
 *   - hourly (ยอดตามชั่วโมง เทียบวันก่อน) · target (เป้ารายเดือน) · connection (สถานะดึงออเดอร์ + ดึงสินค้า ต่อร้าน)
 *   - lowStock = เฉพาะ SKU ที่ขายได้ใน 30 วัน (สต๊อกจากของกลาง lib/sku-stock · เดิมอ่านตารางสต๊อกเก่า 500 แถวแรก)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditChangeMeta, writeAudit } from "@/lib/audit";
import { fetchAllPages } from "@/lib/fetch-all";
import { LIVE_LISTING_OR } from "@/lib/platform-listing-health";
import { countsAsSale, isReportOnly, isUnpaidPlatformStatus, needsAction, shipDue } from "@/lib/platform-order-status";
import { r2ImageUrl } from "@/lib/r2-image";
import { loadSkuStock } from "@/lib/sku-stock";
import { loadPullInputs } from "@/lib/order-pull-server";
import { shopPullHealth } from "@/lib/order-pull-health";
import { CATALOG_REFRESH_PREFIX, normalizeRefreshState } from "@/lib/catalog-refresh-plan";
import {
  SALES_TARGET_KEY, bkkStartIso, bkkYmd, hourlyBuckets, itemValueByOrder, lowStockSelling, monthToDate, orderValue,
  readSalesTarget, shiftYmd, topProducts as rankTop, writeSalesTarget, type ItemLite,
} from "@/lib/platform-dashboard-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const STATUS_ORDER = ["new", "confirmed", "packed", "shipped", "cancelled"];
const ITEM_CHUNK = 200;   // id ออเดอร์ต่อคำขอรายการสินค้า (URL ไม่ยาวเกิน · แถวไม่ถึงเพดาน 1,000)
const isYmd = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const MAX_DAILY = 120;   // ช่วงยาวกว่านี้ → รวมเป็นรายเดือน
const minYmd = (...ds: (string | null)[]) => ds.filter((d): d is string => !!d).sort()[0] ?? null;

type OrderLite = { id: string; platform_id: string | null; status: string; platform_status: string | null; source: string | null; total: number | null; ordered_at?: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const platformId = (sp.get("platform_id") ?? "").trim();
  const brandId = (sp.get("brand_id") ?? "").trim();
  const from = (sp.get("from") ?? "").trim();
  const to = (sp.get("to") ?? "").trim();
  const admin = supabaseAdmin();
  const nowMs = Date.now();
  const today = bkkYmd(nowMs) as string;

  // ตัวเลือกฟิลเตอร์: แพลตฟอร์มที่เปิด + แบรนด์ (ไม่เอาที่ตั้ง "ซ่อนในช่องทางขาย" ที่หน้าแบรนด์ · เดิม = แบรนด์ลูกค้า)
  const [{ data: pf }, { data: br }] = await Promise.all([
    admin.from("erp_platforms").select("id, code, name_th, icon_key").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.from("brands").select("id, name").eq("is_active", true).not("hide_in_sales_channels", "is", true).order("name", { ascending: true }),
  ]);
  const platforms = ((pf ?? []) as Record<string, unknown>[]).map((p) => ({ id: String(p.id), code: String(p.code ?? ""), name_th: String(p.name_th ?? p.code ?? ""), icon_key: (p.icon_key as string) ?? null }));
  const brands = ((br ?? []) as Record<string, unknown>[]).map((b) => ({ id: String(b.id), name: String(b.name ?? "") }));
  const pfById = new Map(platforms.map((p) => [p.id, p]));

  // ช่วงที่ต้องใช้: ช่วงที่เลือก · เดือนนี้ + เดือนก่อนช่วงเดียวกัน · 30 วันล่าสุด (สต๊อกใกล้หมด) · วันก่อนหน้า (กราฟชั่วโมง เมื่อเลือกวันเดียว)
  const mtd = monthToDate(today);
  const last30From = shiftYmd(today, -29);
  const singleDay = isYmd(from) && from === to ? from : null;
  const hourPrev = singleDay ? shiftYmd(singleDay, -1) : null;
  const windowFrom = isYmd(from) ? minYmd(from, mtd.prevFrom, last30From, hourPrev) : null;   // ไม่เลือกช่วง = ทั้งหมดอยู่แล้ว
  const fromIso = isYmd(from) ? bkkStartIso(from) : null;
  const toIso = isYmd(to) ? bkkStartIso(shiftYmd(to, 1)) : null;   // ถึงสิ้นวัน "to" (เวลาไทย)
  const inRange = (o: OrderLite) => (!fromIso || (o.ordered_at ?? "") >= fromIso) && (!toIso || (o.ordered_at ?? "") < toIso);
  const inDays = (o: OrderLite, a: string, b: string) => { const d = bkkYmd(o.ordered_at ?? null); return !!d && d >= a && d <= b; };

  // ออเดอร์ทั้งหมดในหน้าต่างเวลาเดียว (ตามฟิลเตอร์แพลตฟอร์ม/แบรนด์) — แบ่งใช้ในหน้านี้ ไม่ถามซ้ำ
  const winOrders = await fetchAllPages<OrderLite>((a, b) => {
    let oq = admin.from("platform_orders").select("id, platform_id, status, platform_status, source, total, ordered_at");
    if (platformId) oq = oq.eq("platform_id", platformId);
    if (brandId) oq = oq.eq("brand_id", brandId);
    if (windowFrom) oq = oq.gte("ordered_at", bkkStartIso(windowFrom));
    return oq.order("id", { ascending: true }).range(a, b);
  });
  const orders = winOrders.filter(inRange);
  const sales = orders.filter(countsAsSale);
  const monthSales = winOrders.filter((o) => countsAsSale(o) && inDays(o, mtd.from, mtd.to));
  const prevMonthSales = winOrders.filter((o) => countsAsSale(o) && inDays(o, mtd.prevFrom, mtd.prevTo));
  const last30Sales = winOrders.filter((o) => countsAsSale(o) && inDays(o, last30From, today));
  const hourSales = singleDay && hourPrev ? winOrders.filter((o) => countsAsSale(o) && inDays(o, hourPrev, singleDay)) : [];

  // รายการสินค้าของทุกออเดอร์ที่นับเป็นยอดขาย (รวมทุกช่วง ไม่ซ้ำ) — ถามทีละชุด พร้อมกันทีละ 4
  const needIds = [...new Set([...sales, ...monthSales, ...prevMonthSales, ...last30Sales, ...hourSales].map((o) => o.id))];
  const items: ItemLite[] = [];
  {
    const chunks: string[][] = [];
    for (let i = 0; i < needIds.length; i += ITEM_CHUNK) chunks.push(needIds.slice(i, i + ITEM_CHUNK));
    for (let i = 0; i < chunks.length; i += 4) {
      const got = await Promise.all(chunks.slice(i, i + 4).map((ids) => fetchAllPages<ItemLite>((a, b) =>
        admin.from("platform_order_items").select("id, order_id, matched_sku_id, sku_code, name, qty, price").in("order_id", ids).order("id", { ascending: true }).range(a, b))));
      for (const g of got) items.push(...g);
    }
  }
  const valByOrder = itemValueByOrder(items);
  const val = (o: OrderLite) => orderValue(o, valByOrder);
  const sumVal = (os: OrderLite[]) => os.reduce((s, o) => s + val(o), 0);
  const sumPaid = (os: OrderLite[]) => os.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const itemsOf = (os: OrderLite[]) => { const ids = new Set(os.map((o) => o.id)); return items.filter((it) => ids.has(it.order_id)); };

  // สินค้าบนแพลตฟอร์ม (catalog) ตามฟิลเตอร์ (แพลตฟอร์ม/แบรนด์) — ไม่นับตัวที่ร้านลบไปแล้ว
  const catalog = await fetchAllPages<{ platform_id: string; matched_parent_sku_id: string | null; match_ignored: boolean | null }>((a, b) => {
    let cq = admin.from("platform_catalog_listings").select("id, platform_id, matched_parent_sku_id, match_ignored").or(LIVE_LISTING_OR);
    if (platformId) cq = cq.eq("platform_id", platformId);
    if (brandId) cq = cq.eq("brand_id", brandId);
    return cq.order("id", { ascending: true }).range(a, b);
  });

  // KPI
  const salesTotal = sumVal(sales);
  const todo = orders.filter(needsAction);
  const cancelled = orders.filter((o) => o.status === "cancelled").length;
  const catalogMatched = catalog.filter((c) => c.matched_parent_sku_id).length;
  const catalogIgnored = catalog.filter((c) => !c.matched_parent_sku_id && c.match_ignored).length;
  const kpi = {
    salesTotal, salesPaid: sumPaid(sales), salesOrders: sales.length, aov: sales.length ? salesTotal / sales.length : 0,
    ordersCount: orders.length, ordersPending: todo.filter((o) => o.status === "new" || o.status === "confirmed").length, ordersToShip: todo.filter((o) => o.status === "packed").length,
    cancelled, cancelRate: orders.length ? cancelled / orders.length : 0,
    unpaid: orders.filter((o) => o.status !== "cancelled" && isUnpaidPlatformStatus(o.platform_status)).length,
    catalogTotal: catalog.length, catalogMatched, catalogIgnored, catalogUnmatched: catalog.length - catalogMatched - catalogIgnored,
  };

  // เดือนนี้ถึงวันนี้ + เดือนก่อนช่วงเดียวกัน + เป้า
  const { data: tgt } = await admin.from("ui_config").select("value").eq("key", SALES_TARGET_KEY).maybeSingle();
  const month = {
    ym: mtd.ym, from: mtd.from, to: mtd.to, sales: sumVal(monthSales), paid: sumPaid(monthSales), orders: monthSales.length,
    prev: { from: mtd.prevFrom, to: mtd.prevTo, sales: sumVal(prevMonthSales), orders: prevMonthSales.length },
    target: readSalesTarget((tgt as { value?: unknown } | null)?.value, mtd.ym, brandId || null),
  };

  // แยกตามแพลตฟอร์ม
  const byPlatform = platforms.map((p) => {
    const os = orders.filter((o) => o.platform_id === p.id);
    const ss = os.filter(countsAsSale);
    const cs = catalog.filter((c) => c.platform_id === p.id);
    return { id: p.id, code: p.code, name_th: p.name_th, icon_key: p.icon_key, orders: os.length, sales: sumVal(ss), paid: sumPaid(ss), catalog: cs.length, matched: cs.filter((c) => c.matched_parent_sku_id).length };
  }).filter((x) => x.orders > 0 || x.catalog > 0);

  // แยกตามสถานะ — ใบจากเมล (ส่งแล้ว สถานะในระบบค้าง new) นับเป็น "ส่งแล้ว"
  const effStatus = (o: { source: string | null; status: string }) => (isReportOnly(o.source) && o.status !== "cancelled" ? "shipped" : o.status);
  const byStatus = STATUS_ORDER.map((s) => ({ status: s, count: orders.filter((o) => effStatus(o) === s).length }));

  // ขายดี (อันดับต้นทั้งตามชิ้น + ตามยอด) + รูปของตัวที่จับคู่ ERP แล้ว
  const rangeItems = itemsOf(sales);
  let topProducts: (ReturnType<typeof rankTop>[number] & { image?: string | null })[] = rankTop(rangeItems, 10);
  const matchedIds = new Set(rangeItems.filter((it) => it.matched_sku_id).map((it) => it.matched_sku_id as string));
  const imgSkuIds = topProducts.map((t) => t.key).filter((k) => matchedIds.has(k));
  if (imgSkuIds.length) {
    const { data: imgRows } = await admin.from("skus_v2").select("id, cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key )").in("id", imgSkuIds);
    const imgMap = new Map<string, string | null>();
    for (const r of ((imgRows ?? []) as Record<string, unknown>[])) {
      const parent = r.parent_skus_v2 as { cover_image_r2_key?: string | null } | { cover_image_r2_key?: string | null }[] | null;
      const parentKey = Array.isArray(parent) ? parent[0]?.cover_image_r2_key : parent?.cover_image_r2_key;
      imgMap.set(String(r.id), r2ImageUrl(((r.cover_image_r2_key as string | null) || parentKey) ?? null, 160));
    }
    topProducts = topProducts.map((t) => ({ ...t, image: imgMap.get(t.key) ?? null }));
  }

  // รายการในออเดอร์ (ช่วงที่เลือก) ที่ยังไม่จับคู่ SKU — ตัดสต๊อก/นับขายดีไม่ได้
  const um = rangeItems.filter((it) => !it.matched_sku_id);
  const umCodes = new Map<string, number>();
  for (const it of um) { const k = it.sku_code || it.name || "?"; umCodes.set(k, (umCodes.get(k) ?? 0) + (Number(it.qty) || 0)); }
  const unmatched = { lines: um.length, codes: umCodes.size, top: [...umCodes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code, qty]) => ({ code, qty })) };

  // ยอดรายวัน (วันไทย) — ไม่เลือกช่วง = 30 วันล่าสุด · เลือกช่วง = ทุกวันในช่วง · ยาวเกิน 120 วัน = รายเดือน
  const dayTo = isYmd(to) ? (to > today ? today : to) : today;
  const dayFrom = isYmd(from) ? from : shiftYmd(dayTo, -29);
  const spanDays = Math.round((Date.parse(`${dayTo}T00:00:00Z`) - Date.parse(`${dayFrom}T00:00:00Z`)) / 86_400_000) + 1;
  const monthly = spanDays > MAX_DAILY;
  const dayMap = new Map<string, { sales: number; orders: number }>();
  if (spanDays > 0) {
    if (monthly) {
      for (let m = dayFrom.slice(0, 7); m <= dayTo.slice(0, 7);) {
        dayMap.set(m, { sales: 0, orders: 0 });
        const [y, mo] = m.split("-").map(Number);
        m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
      }
    } else {
      for (let i = 0; i < spanDays; i++) dayMap.set(shiftYmd(dayFrom, i), { sales: 0, orders: 0 });
    }
    const daySource = isYmd(from) ? sales : last30Sales;
    for (const o of daySource) {
      const d = bkkYmd(o.ordered_at ?? null);
      if (!d || d < dayFrom || d > dayTo) continue;
      const g = dayMap.get(monthly ? d.slice(0, 7) : d);
      if (g) { g.sales += val(o); g.orders += 1; }
    }
  }
  const byDay = { unit: monthly ? "month" : "day", from: dayFrom, to: dayTo, points: [...dayMap.entries()].map(([date, v]) => ({ date, ...v })) };

  // ยอดตามชั่วโมง (เลือกวันเดียว) เทียบวันก่อนหน้า
  const hourly = singleDay && hourPrev ? { day: singleDay, prevDay: hourPrev, cur: hourlyBuckets(hourSales, singleDay, val), prev: hourlyBuckets(hourSales, hourPrev, val) } : null;

  // ช่วงก่อนหน้า (ยาวเท่ากัน) — เฉพาะเมื่อเลือกทั้ง from และ to · เทียบ "ลูกค้าจ่าย" (ไม่ต้องโหลดรายการสินค้าเพิ่ม)
  let prev: { from: string; to: string; salesPaid: number; ordersCount: number } | null = null;
  if (fromIso && toIso && spanDays > 0 && !monthly) {
    const pFrom = shiftYmd(from, -spanDays), pTo = shiftYmd(from, -1);
    const inWin = !!windowFrom && pFrom >= windowFrom;
    const pOrders = inWin ? winOrders.filter((o) => inDays(o, pFrom, pTo)) : await fetchAllPages<OrderLite>((a, b) => {
      let oq = admin.from("platform_orders").select("id, platform_id, status, platform_status, source, total");
      if (platformId) oq = oq.eq("platform_id", platformId);
      if (brandId) oq = oq.eq("brand_id", brandId);
      return oq.gte("ordered_at", bkkStartIso(pFrom)).lt("ordered_at", bkkStartIso(shiftYmd(pTo, 1))).order("id", { ascending: true }).range(a, b);
    });
    prev = { from: pFrom, to: pTo, salesPaid: sumPaid(pOrders.filter(countsAsSale)), ordersCount: pOrders.length };
  }

  // ต้องส่งวันนี้ / เลยกำหนด (ออเดอร์ที่ยังต้องจัดการ ทุกวันที่สั่ง — กติกาเดียวกับศูนย์ออเดอร์)
  let openQ = admin.from("platform_orders").select("id, status, source, platform_status, ship_by_at").in("status", ["new", "confirmed", "packed"]).not("ship_by_at", "is", null).limit(1000);
  if (platformId) openQ = openQ.eq("platform_id", platformId);
  if (brandId) openQ = openQ.eq("brand_id", brandId);
  const { data: openRows } = await openQ;
  const open = ((openRows ?? []) as { status: string; source: string | null; platform_status: string | null; ship_by_at: string | null }[]).filter(needsAction);
  const dues = open.map((o) => shipDue(o, nowMs));
  const shipDueCounts = { late: dues.filter((d) => d === "late").length, today: dues.filter((d) => d === "today").length, tomorrow: dues.filter((d) => d === "tomorrow").length };

  // ออเดอร์ล่าสุด 8 ใบ (ไม่ขึ้นกับช่วงวันที่)
  let lastQ = admin.from("platform_orders").select("id, platform_id, order_no, external_order_id, total, status, platform_status, source, ordered_at").not("ordered_at", "is", null).order("ordered_at", { ascending: false }).limit(8);
  if (platformId) lastQ = lastQ.eq("platform_id", platformId);
  if (brandId) lastQ = lastQ.eq("brand_id", brandId);
  const { data: lastRows } = await lastQ;
  const latest = ((lastRows ?? []) as Record<string, unknown>[]).map((o) => {
    const p = pfById.get(String(o.platform_id ?? ""));
    return {
      id: String(o.id), ordered_at: (o.ordered_at as string) ?? null, platform_code: p?.code ?? null, platform_name: p?.name_th ?? null, icon_key: p?.icon_key ?? null,
      order_no: String(o.order_no || o.external_order_id || "").trim() || null, total: Number(o.total) || 0,
      status: effStatus({ source: (o.source as string) ?? null, status: String(o.status ?? "") }), unpaid: isUnpaidPlatformStatus(o.platform_status as string | null),
    };
  });

  // สต๊อกใกล้หมด — เฉพาะ SKU ที่ขายได้ใน 30 วัน (ของกลาง lib/sku-stock) · พร้อมขาย ≤ 5 หรือพอขายอีก ≤ 7 วัน
  let lowStock: { sku_id: string; code: string; name: string; available: number; sold30: number; cover_days: number | null; image?: string | null }[] = [];
  {
    const sold = new Map<string, number>();
    for (const it of itemsOf(last30Sales)) if (it.matched_sku_id) sold.set(it.matched_sku_id, (sold.get(it.matched_sku_id) ?? 0) + (Number(it.qty) || 0));
    if (sold.size) {
      const stock = await loadSkuStock(admin, [...sold.keys()]);
      const avail = new Map([...sold.keys()].map((id) => { const s = stock.get(id); return [id, s ? s.onHand - s.reserved : 0] as const; }));
      const rows = lowStockSelling(sold, avail, { maxAvail: 5, maxCoverDays: 7, limit: 15 });
      if (rows.length) {
        const { data: skuData } = await admin.from("skus_v2").select("id, code, name_th, cover_image_r2_key").in("id", rows.map((r) => r.skuId));
        const skuMap = new Map(((skuData ?? []) as Record<string, unknown>[]).map((s) => [String(s.id), s]));
        lowStock = rows.map((r) => {
          const s = skuMap.get(r.skuId);
          return { sku_id: r.skuId, code: String(s?.code ?? "—"), name: String(s?.name_th ?? ""), available: r.available, sold30: r.sold30, cover_days: r.coverDays, image: r2ImageUrl((s?.cover_image_r2_key as string | null) ?? null, 120) };
        });
      }
    }
  }

  // สถานะการเชื่อมต่อต่อร้าน: ดึงออเดอร์ (lib/order-pull-health) + ดึงสินค้า (catalog_refresh)
  type ConnShop = { platform: string; brand_id: string | null; label: string; mode: string; state: string; headline: string; fix: string | null; last_run_at: string | null; catalog: { ok: boolean; at: string | null; error: string | null } | null };
  let connection: { shops: ConnShop[]; last_pull_at: string | null } = { shops: [], last_pull_at: null };
  try {
    const [{ shops }, { data: crs }] = await Promise.all([
      loadPullInputs(admin),
      admin.from("ui_config").select("key, value").like("key", `${CATALOG_REFRESH_PREFIX}%`),
    ]);
    const cat = new Map(((crs ?? []) as { key: string; value: unknown }[]).map((r) => [r.key.slice(CATALOG_REFRESH_PREFIX.length), normalizeRefreshState(r.value)]));
    const pfCode = platformId ? pfById.get(platformId)?.code ?? null : null;
    const list = shops.filter((s) => s.mode !== "none" && (!brandId || !s.brand_id || s.brand_id === brandId) && (!pfCode || s.platform === pfCode));
    connection = {
      shops: list.map((s) => {
        const h = shopPullHealth(s, nowMs);
        const c = s.brand_id ? cat.get(`${s.platform}:${s.brand_id}`) : undefined;
        return { platform: s.platform, brand_id: s.brand_id, label: s.label, mode: s.mode, state: h.state, headline: h.headline, fix: h.fix, last_run_at: s.run?.at ?? null, catalog: c ? { ok: c.ok, at: c.last_done_at, error: c.error } : null };
      }),
      last_pull_at: list.map((s) => s.run?.at ?? "").filter(Boolean).sort().pop() ?? null,
    };
  } catch { /* สถานะเชื่อมต่อโหลดไม่ได้ ไม่ทำให้แดชบอร์ดล้ม */ }

  return NextResponse.json({ filters: { platforms, brands }, kpi, month, byPlatform, byStatus, topProducts, lowStock, byDay, hourly, prev, shipDue: shipDueCounts, unmatched, latest, connection, today, error: null }, { headers: { "Cache-Control": "no-store" } });
}

// ตั้ง/ลบเป้ายอดขายรายเดือน (ทั้งหมด หรือ ต่อแบรนด์) — แก้ได้ ลบได้ ทุกครั้งลง audit
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  let body: { set_target?: boolean; month?: string; brand_id?: string | null; amount?: number | string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  if (!body.set_target) return NextResponse.json({ error: "ไม่รู้จักคำสั่ง" }, { status: 400 });
  const ym = String(body.month ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) return NextResponse.json({ error: "เดือนไม่ถูกต้อง" }, { status: 400 });
  const brandId = String(body.brand_id ?? "").trim() || null;
  const amount = body.amount == null || body.amount === "" ? null : Number(body.amount);
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) return NextResponse.json({ error: "จำนวนเงินไม่ถูกต้อง" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("ui_config").select("value").eq("key", SALES_TARGET_KEY).maybeSingle();
  const before = readSalesTarget((cur as { value?: unknown } | null)?.value, ym, brandId);
  const next = writeSalesTarget((cur as { value?: unknown } | null)?.value, ym, brandId, amount);
  const { error } = await admin.from("ui_config").upsert({ key: SALES_TARGET_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const after = readSalesTarget(next, ym, brandId);
  await writeAudit(admin, {
    action: after == null ? "delete" : before == null ? "create" : "update", entityType: "platform_sales_target", entityId: brandId,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { month: ym, brand_id: brandId, label: `เป้ายอดขาย ${ym}${brandId ? "" : " (ทุกแบรนด์)"}`, ...auditChangeMeta({ target: before }, { target: after }) },
  });
  return NextResponse.json({ ok: true, target: after, error: null });
}
