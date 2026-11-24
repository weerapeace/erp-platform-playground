/**
 * ศูนย์ร้านออนไลน์ (/master/channel-portal) ฝั่ง server — นับตัวเลขทุกร้านทุกแบรนด์จากแถวจริง (อ่านอย่างเดียว ไม่แตะร้าน)
 * ใช้: GET /api/channel-portal · กติกา/ชนิดข้อมูล = lib/channel-portal (pure + เทสต์)
 *
 * ใช้ตัวนับ/กติกาเดิมทั้งหมด ไม่เขียนกฎใหม่ซ้ำ:
 *   ร้าน + ทางดึง + วันต้องเชื่อมใหม่ = loadPullInputs (lib/order-pull-server) · สถานะดึง = shopPullHealth (lib/order-pull-health)
 *   ยอดขาย = มูลค่าสินค้า itemValueByOrder/orderValue (lib/platform-dashboard-calc — ตัวเดียวกับแดชบอร์ด) · ไม่นับออเดอร์จากเมล
 *   รอจัดส่ง = needsAction (lib/platform-order-status — ตัวเดียวกับศูนย์ออเดอร์/หน้าแบรนด์)
 *   ยังไม่จับคู่ = กฎหน้าแบรนด์ (ไม่นับที่ไม่อยู่บนร้านแล้ว / กดไม่ต้องจับคู่)
 *   สินค้าซ้ำ = กฎ /api/platform-catalog/duplicates (รายการบนร้านที่ยังอยู่ + จับคู่แล้ว · ≥ 2 รายการต่อรุ่น · หักกลุ่ม "ไม่ใช่ตัวซ้ำ")
 * ใหม่ (ไม่มีที่ไหนนับมาก่อน): ราคาบนร้าน ≤ ฿1 ที่ยังเปิดขาย
 * ไม่มีสิทธิ์กลุ่มไหน = ตัวเลขกลุ่มนั้นเป็น null (ไม่ส่งออกไป) · ห้ามส่งกุญแจร้านออกไป (loadPullInputs มีแค่วันหมดอายุ)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/fetch-all";
import { loadPullInputs } from "@/lib/order-pull-server";
import { shopPullHealth } from "@/lib/order-pull-health";
import { REPORT_ONLY_SOURCES, isReportOnly, needsAction } from "@/lib/platform-order-status";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { bkkStartIso, bkkYmd, itemValueByOrder, orderValue, type ItemLite } from "@/lib/platform-dashboard-calc";
import { dupIgnoredKey } from "@/lib/platform-duplicates";
import {
  PORTAL_APP_KEY, daysLeft, portalConnState,
  type PortalMenuRow, type PortalPlatform, type PortalPriceLow, type PortalResponse, type PortalShop, type PortalTotals,
} from "@/lib/channel-portal";

type Listing = { id: string; platform_id: string; brand_id: string | null; matched_parent_sku_id: string | null; match_ignored: boolean | null; status: string | null; price: number | null; updated_at: string | null };
type OrderRow = { id: string; platform_id: string; brand_id: string | null; total: number | null; source: string | null; status: string; platform_status: string | null };

/** สถานะบนร้านที่ถือว่า "ปิดขาย" (ราคา ฿1 ของรายการพวกนี้ไม่นับเป็นงาน เช่น บริการห่อของขวัญที่ตั้งใจปิดไว้) */
const CLOSED_STATUSES = new Set(["unlist", "inactive", "deactivated", "deleted", "banned", "closed", "hidden", "draft", "seller_deactivated"]);
const PRICE_LOW_MAX = 1;
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const shopKey = (platformId: string, brandId: string | null) => `${platformId}|${brandId ?? ""}`;

export async function loadChannelPortal(
  admin: SupabaseClient,
  can: { listings: boolean; orders: boolean; pack: boolean },
  now = Date.now(),
): Promise<PortalResponse> {
  const todayStart = bkkStartIso(bkkYmd(now) ?? new Date(now).toISOString().slice(0, 10));
  const seeOrders = can.orders;
  const seeShip = can.orders || can.pack;
  const seeShops = can.listings || can.orders;

  const [pull, pfs, brandsRes, menusRes, listings, ignoredRes, todayOrders, shipRows] = await Promise.all([
    seeShops ? loadPullInputs(admin) : Promise.resolve({ shops: [] }),
    admin.from("erp_platforms").select("id, code"),
    admin.from("brands").select("id, name"),
    admin.from("erp_menu_items").select("id, href, permission_key, parent_id, audience, app_overrides").eq("is_active", true).contains("app_keys", [PORTAL_APP_KEY]),
    can.listings
      ? fetchAllPages<Listing>((from, to) => admin.from("platform_catalog_listings")
        .select("id, platform_id, brand_id, matched_parent_sku_id, match_ignored, status, price, updated_at")
        .order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: Listing[] | null; error: unknown }>, { strict: true })
      : Promise.resolve([] as Listing[]),
    can.listings ? admin.from("ui_config").select("key, value").like("key", "platform_dupes_ignored:%") : Promise.resolve({ data: [] }),
    seeOrders
      ? fetchAllPages<OrderRow>((from, to) => admin.from("platform_orders").select("id, platform_id, brand_id, total, source, status, platform_status")
        .gte("ordered_at", todayStart).order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: OrderRow[] | null; error: unknown }>, { strict: true })
      : Promise.resolve([] as OrderRow[]),
    // รอจัดส่ง: กรองหยาบที่ฐานข้อมูล (สถานะ + ไม่ใช่เมล) แล้วตัดสินจริงด้วย needsAction
    seeShip
      ? fetchAllPages<OrderRow>((from, to) => admin.from("platform_orders").select("id, platform_id, brand_id, total, source, status, platform_status")
        .in("status", ["new", "confirmed", "packed"]).or(`source.is.null,${REPORT_ONLY_SOURCES.map((s) => `source.neq.${s}`).join(",")}`)
        .order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: OrderRow[] | null; error: unknown }>, { strict: true })
      : Promise.resolve([] as OrderRow[]),
  ]);

  const codeOf = new Map(((pfs.data ?? []) as { id: string; code: string }[]).map((p) => [p.id, p.code]));
  const brandName = new Map(((brandsRes.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));

  // ── รายการบนร้าน: ต่อร้าน (platform × brand) ──
  const ignored = new Map<string, Set<string>>();
  for (const r of ((ignoredRes.data ?? []) as { key: string; value: unknown }[])) {
    ignored.set(r.key, new Set(Array.isArray(r.value) ? r.value.map(String) : []));
  }
  type Agg = { listings: number; unmatched: number; perParent: Map<string, number>; updated: string | null };
  const agg = new Map<string, Agg>();
  const priceLow: PortalPriceLow[] = [];
  for (const l of listings) {
    if (isGoneStatus(l.status)) continue;
    const k = shopKey(l.platform_id, l.brand_id);
    const a = agg.get(k) ?? { listings: 0, unmatched: 0, perParent: new Map(), updated: null };
    a.listings++;
    if (l.matched_parent_sku_id) a.perParent.set(l.matched_parent_sku_id, (a.perParent.get(l.matched_parent_sku_id) ?? 0) + 1);
    else if (!l.match_ignored) a.unmatched++;
    if (l.updated_at && (!a.updated || l.updated_at > a.updated)) a.updated = l.updated_at;
    agg.set(k, a);
    const price = l.price == null ? null : Number(l.price);
    if (price != null && Number.isFinite(price) && price <= PRICE_LOW_MAX && !CLOSED_STATUSES.has(String(l.status ?? "").toLowerCase())) {
      priceLow.push({ listing_id: l.id, platform: codeOf.get(l.platform_id) ?? "", brand_id: l.brand_id, title: null, price });
    }
  }
  const dupesOf = (platformId: string, brandId: string | null, a: Agg | undefined) => {
    if (!a) return 0;
    const ign = brandId ? ignored.get(dupIgnoredKey(platformId, brandId)) : undefined;
    let n = 0;
    for (const [parentId, c] of a.perParent) if (c > 1 && !ign?.has(parentId)) n++;
    return n;
  };
  // ชื่อสินค้าของรายการราคา ฿1 (มีไม่กี่ตัว — ดึงแยกทีหลัง ไม่ดึงชื่อทั้งร้าน)
  if (priceLow.length) {
    const ids = priceLow.slice(0, 50).map((p) => p.listing_id);
    const rows = (await Promise.all(chunk(ids, 50).map((part) => admin.from("platform_catalog_listings").select("id, title").in("id", part))))
      .flatMap((r) => (r.data ?? []) as { id: string; title: string | null }[]);
    const t = new Map(rows.map((r) => [r.id, r.title]));
    for (const p of priceLow) p.title = t.get(p.listing_id) ?? null;
  }

  // ── ออเดอร์วันนี้ + รอจัดส่ง ต่อร้าน ──
  const today = todayOrders.filter((o) => !isReportOnly(o.source));
  const items = today.length
    ? (await Promise.all(chunk(today.map((o) => o.id), 150).map((part) => admin.from("platform_order_items").select("order_id, matched_sku_id, sku_code, name, qty, price").in("order_id", part))))
      .flatMap((r) => (r.data ?? []) as ItemLite[])
    : [];
  const byOrder = itemValueByOrder(items);
  const todayBy = new Map<string, { n: number; sales: number }>();
  let todaySales = 0, todayPaid = 0;
  for (const o of today) {
    const v = orderValue(o, byOrder);
    todaySales += v; todayPaid += Number(o.total ?? 0) || 0;
    const k = shopKey(o.platform_id, o.brand_id);
    const cur = todayBy.get(k) ?? { n: 0, sales: 0 };
    cur.n++; cur.sales += v; todayBy.set(k, cur);
  }
  const ship = shipRows.filter((o) => needsAction(o));
  const shipBy = new Map<string, number>();
  for (const o of ship) shipBy.set(shopKey(o.platform_id, o.brand_id), (shipBy.get(shopKey(o.platform_id, o.brand_id)) ?? 0) + 1);

  // ── การ์ดร้าน ──
  const shops: PortalShop[] = pull.shops.map((s) => {
    const health = shopPullHealth(s, now);
    // เว็บร้าน: รายการบนเว็บอยู่ใต้แบรนด์ → รวมทุกแบรนด์ · ออเดอร์เว็บไม่ผูกแบรนด์ในตัวดึง → รวมทุกแบรนด์เหมือนกัน
    const keys = s.platform === "website"
      ? [...new Set([...agg.keys(), ...todayBy.keys(), ...shipBy.keys()].filter((k) => k.startsWith(`${s.platform_id}|`)))]
      : [shopKey(s.platform_id, s.brand_id)];
    const sum = <T,>(m: Map<string, T>, f: (v: T) => number) => keys.reduce((n, k) => n + (m.has(k) ? f(m.get(k) as T) : 0), 0);
    const a = s.platform === "website" ? undefined : agg.get(keys[0]);
    const listingsN = sum(agg, (v) => v.listings);
    const tokenDays = daysLeft(s.token_expires_at, now);
    const updated = keys.map((k) => agg.get(k)?.updated ?? null).filter((x): x is string => !!x).sort().pop() ?? null;
    return {
      key: `${s.platform}:${s.brand_id ?? "all"}`,
      platform: s.platform as PortalPlatform,
      brand_id: s.brand_id, brand_name: s.brand_name, shop_name: s.shop_name,
      conn: portalConnState(s.mode, tokenDays, listingsN),
      token_expires_at: s.token_expires_at, token_days_left: tokenDays,
      pull: { state: health.state, headline: health.headline, at: s.run?.at ?? null },
      listings: can.listings ? listingsN : null,
      unmatched: can.listings ? sum(agg, (v) => v.unmatched) : null,
      dupes: can.listings ? (s.platform === "website" ? keys.reduce((n, k) => n + dupesOf(s.platform_id, k.split("|")[1] || null, agg.get(k)), 0) : dupesOf(s.platform_id, s.brand_id, a)) : null,
      listings_updated_at: can.listings ? updated : null,
      today_orders: seeOrders ? sum(todayBy, (v) => v.n) : null,
      today_sales: seeOrders ? Math.round(sum(todayBy, (v) => v.sales)) : null,
      to_ship: seeShip ? sum(shipBy, (v) => v) : null,
    };
  });

  const totals: PortalTotals = {
    today_orders: seeOrders ? today.length : null,
    today_sales: seeOrders ? Math.round(todaySales) : null,
    today_paid: seeOrders ? Math.round(todayPaid) : null,
    // รวมทุกช่องทาง (รวม LINE OA / ออเดอร์มือที่ไม่มีการ์ดร้าน)
    to_ship: seeShip ? ship.length : null,
    unmatched: can.listings ? shops.reduce((n, s) => n + (s.platform === "website" ? 0 : s.unmatched ?? 0), 0) : null,
    dupes: can.listings ? shops.reduce((n, s) => n + (s.dupes ?? 0), 0) : null,
    price_low: can.listings ? priceLow.length : null,
  };

  const brandIds = [...new Set(shops.map((s) => s.brand_id).filter((x): x is string => !!x))];
  return {
    ok: true, error: null, now: new Date(now).toISOString(), can,
    brands: brandIds.map((id) => ({ id, name: brandName.get(id) ?? "ไม่ระบุแบรนด์" })).sort((a, b) => a.name.localeCompare(b.name, "th")),
    shops, totals, price_low: can.listings ? priceLow.slice(0, 50) : [],
    menus: ((menusRes.data ?? []) as PortalMenuRow[]),
  };
}
