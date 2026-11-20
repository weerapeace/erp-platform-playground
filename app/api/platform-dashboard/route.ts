/**
 * แดชบอร์ดรวมผู้บริหาร (หลายแพลตฟอร์ม) — /api/platform-dashboard
 * GET ?platform_id=&brand_id=&from=&to=  (products.platforms.view)
 *   → kpi (ยอดขาย/ออเดอร์/สินค้า), byPlatform, byStatus, topProducts, lowStock, filters
 * รวมจาก: platform_orders(+items) · platform_catalog_listings · erp_playground_stock_balances
 * หมายเหตุ: aggregate ฝั่ง JS (ออเดอร์ ~6,000 ใบ ไล่ทีละหน้า) — ถ้าโตมากค่อยย้ายเป็น SQL/rpc
 * 🐛 แก้ 2026-11-14 (หลังดึงออเดอร์ Shopee จาก API แล้วออเดอร์เกินพัน):
 *   - เดิม .limit(5000) แต่ PostgREST ตัดที่ 1,000 เงียบ ๆ → ยอดขาย/จำนวนคิดจาก 1,000 ใบสุ่ม → ไล่ทีละหน้า (fetchAllPages)
 *   - ยอดขายนับใบที่ผู้ซื้อยังไม่จ่าย (UNPAID) → ใช้กติกากลาง countsAsSale (ตัวเดียวกับรายงานยอดขาย)
 *   - "รอแพ็ค/ยืนยัน · รอส่ง" นับใบจากเมล (ส่งแล้ว สถานะ new ตลอด) เป็นพัน → ใช้ needsAction (ตัวเดียวกับศูนย์ออเดอร์)
 *   - กรองวันที่ด้วย created_at (เวลาที่ระบบบันทึก — ใบที่ดึงย้อนหลังวันเดียวกันหมด) + ขอบวันแบบ UTC → ใช้ ordered_at ขอบวันเวลาไทย
 *   - สินค้าขายดีส่ง id 5,000 ตัวในคำขอเดียว (ยาวเกิน/ตัดที่พัน) → ถามทีละชุด
 * ➕ 2026-11-20 (หน้าใหม่แบบนิตยสาร): byDay (ยอดรายวันตามวันไทย) · prev (ยอดช่วงก่อนหน้ายาวเท่ากัน เมื่อเลือกทั้ง from+to)
 *   · topProducts[].image (รูปสินค้าที่จับคู่ ERP แล้ว) · byPlatform[].id — สูตรตัวเลขเดิมไม่เปลี่ยน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";
import { LIVE_LISTING_OR } from "@/lib/platform-listing-health";
import { countsAsSale, isReportOnly, needsAction } from "@/lib/platform-order-status";
import { r2ImageUrl } from "@/lib/r2-image";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_ORDER = ["new", "confirmed", "packed", "shipped", "cancelled"];
const ITEM_CHUNK = 200;   // id ออเดอร์ต่อคำขอรายการสินค้า (URL ไม่ยาวเกิน · แถวไม่ถึงเพดาน 1,000)

/** "YYYY-MM-DD" (วันที่เลือกในหน้า = วันไทย) → เวลาเริ่มวันนั้นตามเวลาไทย (ISO) · รูปไม่ถูก = null */
function bkkDayStart(d: string, addDays = 0): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const ms = Date.parse(`${d}T00:00:00+07:00`);
  return Number.isFinite(ms) ? new Date(ms + addDays * 86_400_000).toISOString() : null;
}

/** วันไทย "YYYY-MM-DD" ของเวลา ISO */
function bkkDate(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10) : null;
}
/** บวก/ลบวันของ "YYYY-MM-DD" (คิดแบบ UTC ล้วน กันเวลาไทยร่นวัน) */
function shiftDay(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
const isYmd = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const MAX_DAILY = 120;   // ช่วงยาวกว่านี้ → รวมเป็นรายเดือน

type OrderLite = { id: string; platform_id: string | null; status: string; platform_status: string | null; source: string | null; total: number | null; ordered_at?: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const platformId = (sp.get("platform_id") ?? "").trim();
  const brandId = (sp.get("brand_id") ?? "").trim();
  const from = (sp.get("from") ?? "").trim();
  const to = (sp.get("to") ?? "").trim();
  const admin = supabaseAdmin();

  // ตัวเลือกฟิลเตอร์: แพลตฟอร์มที่เปิด + แบรนด์ (ไม่เอาที่ตั้ง "ซ่อนในช่องทางขาย" ที่หน้าแบรนด์ · เดิม = แบรนด์ลูกค้า)
  const [{ data: pf }, { data: br }] = await Promise.all([
    admin.from("erp_platforms").select("id, code, name_th, icon_key").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.from("brands").select("id, name").eq("is_active", true).not("hide_in_sales_channels", "is", true).order("name", { ascending: true }),
  ]);
  const platforms = ((pf ?? []) as Record<string, unknown>[]).map((p) => ({ id: String(p.id), code: String(p.code ?? ""), name_th: String(p.name_th ?? p.code ?? ""), icon_key: (p.icon_key as string) ?? null }));
  const brands = ((br ?? []) as Record<string, unknown>[]).map((b) => ({ id: String(b.id), name: String(b.name ?? "") }));

  // ออเดอร์ (ตามฟิลเตอร์)
  const fromIso = from ? bkkDayStart(from) : null;
  const toIso = to ? bkkDayStart(to, 1) : null;   // ถึงสิ้นวัน "to" (เวลาไทย) = ก่อนเริ่มวันถัดไป
  const orders = await fetchAllPages<OrderLite>((a, b) => {
    let oq = admin.from("platform_orders").select("id, platform_id, status, platform_status, source, total, ordered_at");
    if (platformId) oq = oq.eq("platform_id", platformId);
    if (brandId) oq = oq.eq("brand_id", brandId);
    if (fromIso) oq = oq.gte("ordered_at", fromIso);
    if (toIso) oq = oq.lt("ordered_at", toIso);
    return oq.order("id", { ascending: true }).range(a, b);
  });
  const sales = orders.filter(countsAsSale);

  // สินค้าบนแพลตฟอร์ม (catalog) ตามฟิลเตอร์ (แพลตฟอร์ม/แบรนด์)
  // 🐛 เดิม .limit(20000) แต่ PostgREST ตัดที่ 1,000 เงียบ ๆ (มี ~1,200 ตัว → ตัวเลขขาด) → ไล่ทีละหน้า
  const catalog = await fetchAllPages<{ platform_id: string; matched_parent_sku_id: string | null; match_ignored: boolean | null }>((from, to) => {
    let cq = admin.from("platform_catalog_listings").select("id, platform_id, matched_parent_sku_id, match_ignored").or(LIVE_LISTING_OR);   // ไม่นับตัวที่ร้านลบไปแล้ว
    if (platformId) cq = cq.eq("platform_id", platformId);
    if (brandId) cq = cq.eq("brand_id", brandId);
    return cq.order("id", { ascending: true }).range(from, to);
  });

  // KPI
  const sum = (os: OrderLite[]) => os.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const salesTotal = sum(sales);
  // งานที่ต้องทำ (กติกาเดียวกับการ์ด "ต้องจัดส่ง" ของศูนย์ออเดอร์) — ไม่นับใบจากเมล/ยังไม่จ่าย/พักยกเลิก
  const todo = orders.filter(needsAction);
  const ordersPending = todo.filter((o) => o.status === "new" || o.status === "confirmed").length;
  const ordersToShip = todo.filter((o) => o.status === "packed").length;
  const catalogMatched = catalog.filter((c) => c.matched_parent_sku_id).length;
  // "ยังไม่จับคู่" ไม่นับตัวที่กด "ไม่ต้องจับคู่" (งานบริการ/เลิกขาย) — ไม่งั้นไม่มีวันครบ
  const catalogIgnored = catalog.filter((c) => !c.matched_parent_sku_id && c.match_ignored).length;
  const kpi = {
    salesTotal, ordersCount: orders.length, ordersPending, ordersToShip,
    catalogTotal: catalog.length, catalogMatched, catalogIgnored, catalogUnmatched: catalog.length - catalogMatched - catalogIgnored,
  };

  // แยกตามแพลตฟอร์ม
  const byPlatform = platforms.map((p) => {
    const os = orders.filter((o) => o.platform_id === p.id);
    const cs = catalog.filter((c) => c.platform_id === p.id);
    return {
      id: p.id, code: p.code, name_th: p.name_th, icon_key: p.icon_key,
      orders: os.length, sales: sum(os.filter(countsAsSale)),
      catalog: cs.length, matched: cs.filter((c) => c.matched_parent_sku_id).length,
    };
  }).filter((x) => x.orders > 0 || x.catalog > 0);

  // แยกตามสถานะ
  //   ใบจากเมล = ยอดขายที่ร้านส่งของไปแล้ว (สถานะในระบบค้าง new) → นับเป็น "ส่งแล้ว" ไม่ใช่ "ใหม่"
  const effStatus = (o: OrderLite) => (isReportOnly(o.source) && o.status !== "cancelled" ? "shipped" : o.status);
  const byStatus = STATUS_ORDER.map((s) => ({ status: s, count: orders.filter((o) => effStatus(o) === s).length }));

  // สินค้าขายดี (จาก order items ของออเดอร์ที่นับเป็นยอดขาย) — ถามทีละชุด พร้อมกันทีละ 4
  let topProducts: { key: string; name: string; sku: string | null; qty: number; sales: number; image?: string | null }[] = [];
  const orderIds = sales.map((o) => o.id);
  if (orderIds.length) {
    type ItemLite = { matched_sku_id: string | null; sku_code: string | null; name: string | null; qty: number | null; price: number | null };
    const chunks: string[][] = [];
    for (let i = 0; i < orderIds.length; i += ITEM_CHUNK) chunks.push(orderIds.slice(i, i + ITEM_CHUNK));
    const items: ItemLite[] = [];
    for (let i = 0; i < chunks.length; i += 4) {
      const got = await Promise.all(chunks.slice(i, i + 4).map((ids) => fetchAllPages<ItemLite>((a, b) =>
        admin.from("platform_order_items").select("id, matched_sku_id, sku_code, name, qty, price").in("order_id", ids).order("id", { ascending: true }).range(a, b))));
      for (const g of got) items.push(...g);
    }
    const map = new Map<string, { key: string; name: string; sku: string | null; qty: number; sales: number }>();
    for (const it of items) {
      const key = it.matched_sku_id || it.sku_code || it.name || "?";
      const g = map.get(key) ?? { key, name: it.name ?? it.sku_code ?? "—", sku: it.sku_code ?? null, qty: 0, sales: 0 };
      g.qty += it.qty ?? 0; g.sales += (it.qty ?? 0) * (it.price ?? 0);
      map.set(key, g);
    }
    topProducts = [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);
    // รูป: เฉพาะตัวที่จับคู่ ERP แล้ว (key = matched_sku_id) · SKU ไม่มีรูป → ใช้รูปสินค้าแม่
    const matchedIds = new Set(items.filter((it) => it.matched_sku_id).map((it) => it.matched_sku_id as string));
    const skuIds = topProducts.map((t) => t.key).filter((k) => matchedIds.has(k));
    if (skuIds.length) {
      const { data: imgRows } = await admin.from("skus_v2").select("id, cover_image_r2_key, parent_skus_v2 ( cover_image_r2_key )").in("id", skuIds);
      const imgMap = new Map<string, string | null>();
      for (const r of ((imgRows ?? []) as Record<string, unknown>[])) {
        const parent = r.parent_skus_v2 as { cover_image_r2_key?: string | null } | { cover_image_r2_key?: string | null }[] | null;
        const parentKey = Array.isArray(parent) ? parent[0]?.cover_image_r2_key : parent?.cover_image_r2_key;
        imgMap.set(String(r.id), r2ImageUrl(((r.cover_image_r2_key as string | null) || parentKey) ?? null, 160));
      }
      topProducts = topProducts.map((t) => ({ ...t, image: imgMap.get(t.key) ?? null }));
    }
  }

  // ยอดรายวัน (วันไทย ตาม ordered_at · นับเฉพาะใบที่นับเป็นยอดขาย กติกาเดียวกับยอดขายรวม)
  //   ไม่เลือกช่วง = 30 วันล่าสุด · เลือกช่วง = ทุกวันในช่วง · ยาวเกิน 120 วัน = รายเดือน
  const today = bkkDate(new Date().toISOString()) as string;
  const dayTo = isYmd(to) ? (to > today ? today : to) : today;   // ไม่นับวันในอนาคต (เช่น "เดือนนี้" ถึงสิ้นเดือน) — ช่วงก่อนหน้าจะยาวเท่าวันที่ผ่านมาจริง
  const dayFrom = isYmd(from) ? from : shiftDay(dayTo, -29);
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
      for (let i = 0; i < spanDays; i++) dayMap.set(shiftDay(dayFrom, i), { sales: 0, orders: 0 });
    }
    for (const o of sales) {
      const d = bkkDate(o.ordered_at ?? null);
      if (!d || d < dayFrom || d > dayTo) continue;
      const g = dayMap.get(monthly ? d.slice(0, 7) : d);
      if (g) { g.sales += Number(o.total) || 0; g.orders += 1; }
    }
  }
  const byDay = { unit: monthly ? "month" : "day", from: dayFrom, to: dayTo, points: [...dayMap.entries()].map(([date, v]) => ({ date, ...v })) };

  // ช่วงก่อนหน้า (ยาวเท่ากัน ต่อท้ายก่อน from) — เฉพาะเมื่อเลือกทั้ง from และ to · ช่วงยาวเกิน 120 วันไม่เทียบ (โหลดหนัก)
  let prev: { from: string; to: string; salesTotal: number; ordersCount: number } | null = null;
  if (fromIso && toIso && spanDays > 0 && !monthly) {
    const pFrom = shiftDay(from, -spanDays), pTo = shiftDay(from, -1);
    const pFromIso = bkkDayStart(pFrom), pToIso = bkkDayStart(pTo, 1);
    if (pFromIso && pToIso) {
      const pOrders = await fetchAllPages<OrderLite>((a, b) => {
        let oq = admin.from("platform_orders").select("id, platform_id, status, platform_status, source, total");
        if (platformId) oq = oq.eq("platform_id", platformId);
        if (brandId) oq = oq.eq("brand_id", brandId);
        return oq.gte("ordered_at", pFromIso).lt("ordered_at", pToIso).order("id", { ascending: true }).range(a, b);
      });
      prev = { from: pFrom, to: pTo, salesTotal: sum(pOrders.filter(countsAsSale)), ordersCount: pOrders.length };
    }
  }

  // สต๊อกใกล้หมด (คงเหลือพร้อมขาย = on_hand - reserved <= 5)
  let lowStock: { code: string; name: string; available: number; warehouse: string | null }[] = [];
  const { data: balData } = await admin.from("erp_playground_stock_balances").select("product_id, warehouse_id, qty_on_hand, qty_reserved").limit(500);
  const bals = (balData ?? []) as { product_id: string; warehouse_id: string | null; qty_on_hand: number | null; qty_reserved: number | null }[];
  const lowBals = bals.map((b) => ({ ...b, available: (b.qty_on_hand ?? 0) - (b.qty_reserved ?? 0) })).filter((b) => b.available <= 5);
  if (lowBals.length) {
    const skuIds = [...new Set(lowBals.map((b) => b.product_id))];
    const { data: skuData } = await admin.from("skus_v2").select("id, code, name_th").in("id", skuIds);
    const skuMap = new Map<string, { code: string; name: string }>();
    for (const s of ((skuData ?? []) as Record<string, unknown>[])) skuMap.set(String(s.id), { code: String(s.code ?? ""), name: String(s.name_th ?? "") });
    lowStock = lowBals.map((b) => ({ code: skuMap.get(b.product_id)?.code ?? "—", name: skuMap.get(b.product_id)?.name ?? "", available: b.available, warehouse: b.warehouse_id })).sort((a, b) => a.available - b.available).slice(0, 20);
  }

  return NextResponse.json({ filters: { platforms, brands }, kpi, byPlatform, byStatus, topProducts, lowStock, byDay, prev, error: null });
}
