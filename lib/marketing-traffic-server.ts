/**
 * คนเข้าร้าน (ของกลาง · server เท่านั้น) — เก็บยอดสะสมต่อสินค้าทุกคืน + โหลดให้แท็บ "คนเข้าร้าน" + เตือนดาวตก/คนดูพุ่ง
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-25 (แผนการตลาด รอบ 4 ข้อ 1, 3, 4)
 * Shopee: GET /api/v2/product/get_item_extra_info?item_id_list=1,2 (≤ 50 ต่อครั้ง) → views / likes / sale / rating_star / comment_count (ยอดสะสม)
 * รายการสินค้า = platform_catalog_listings (Shopee · สถานะ normal หรือยังไม่รู้ — ไม่เอาที่ซ่อน/ลบ)
 * ⚠️ อ่านจากร้านอย่างเดียว · ย้อนหลังไม่ได้ (Shopee ไม่มียอดย้อนหลังรายวัน)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllPages } from "@/lib/fetch-all";
import { shopeeErrorText, shopeeFetch } from "@/lib/shopee";
import { bkkYmd, shiftYmd } from "@/lib/platform-dashboard-calc";
import { dailyDeltas, ratingDrops, viewSpikes, type ItemSnap } from "@/lib/marketing-traffic-calc";
import { getPlatformId, shopeeTokenOrReason } from "@/app/api/shopee/shared";
import { shopeeConnectedBrandIds } from "@/app/api/shopee/orders-sync";

type Admin = ReturnType<typeof supabaseAdmin>;
type Obj = Record<string, unknown>;
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** คำตอบ get_item_extra_info → ยอดสะสมต่อสินค้า (pure) */
export function parseItemExtra(j: Obj): { item_id: string; views: number; likes: number; sales: number; rating: number | null; comments: number }[] {
  const r = (j.response && typeof j.response === "object" ? j.response : {}) as Obj;
  const list = Array.isArray(r.item_list) ? (r.item_list as Obj[]) : [];
  return list.map((x) => ({
    item_id: String(x.item_id ?? ""), views: n(x.views), likes: n(x.likes), sales: n(x.sale),
    rating: Number.isFinite(Number(x.rating_star)) && Number(x.rating_star) > 0 ? Number(x.rating_star) : null, comments: n(x.comment_count),
  })).filter((x) => x.item_id);
}

/** เก็บยอดสะสม ณ ตอนนี้ ลงวัน `asOf` (ค่าเริ่ม = เมื่อวานตามเวลาไทย เพราะรันหลังเที่ยงคืน = ยอดสิ้นวันเมื่อวาน) */
export async function snapshotShopeeItems(admin: Admin, opts: { deadline: number; asOf?: string }): Promise<{ brands: number; items: number; saved: number; errors: string[] }> {
  const spId = await getPlatformId(admin, "shopee");
  const res = { brands: 0, items: 0, saved: 0, errors: [] as string[] };
  if (!spId) return res;
  const asOf = opts.asOf ?? shiftYmd(bkkYmd(Date.now()) as string, -1);
  for (const brandId of await shopeeConnectedBrandIds(admin, spId)) {
    if (Date.now() > opts.deadline) { res.errors.push("หมดเวลารอบนี้"); break; }
    const tok = await shopeeTokenOrReason(admin, brandId, spId, null);
    if (!tok.ok) { res.errors.push(tok.reason); continue; }
    const listings = await fetchAllPages<{ external_product_id: string; status: string | null }>((a, b) =>
      admin.from("platform_catalog_listings").select("external_product_id, status").eq("platform_id", spId).eq("brand_id", brandId).order("id", { ascending: true }).range(a, b));
    const ids = [...new Set(listings.filter((l) => !l.status || l.status === "normal").map((l) => String(l.external_product_id)).filter((x) => /^\d+$/.test(x)))];
    res.brands++; res.items += ids.length;
    const rows: Obj[] = [];
    const now = new Date().toISOString();
    for (let i = 0; i < ids.length; i += 50) {
      if (Date.now() > opts.deadline) break;
      try {
        const got = parseItemExtra(await shopeeFetch("/api/v2/product/get_item_extra_info", { accessToken: tok.accessToken, shopId: tok.shopId, query: { item_id_list: ids.slice(i, i + 50).join(",") } }));
        for (const g of got) rows.push({ platform: "shopee", brand_id: brandId, item_id: g.item_id, date: asOf, views: g.views, likes: g.likes, sales: g.sales, rating: g.rating, comments: g.comments, updated_at: now });
      } catch (e) { res.errors.push(shopeeErrorText(e)); break; }
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("marketing_item_stats").upsert(rows.slice(i, i + 500), { onConflict: "platform,item_id,date" });
      if (error) { res.errors.push(error.message); break; }
      res.saved += Math.min(500, rows.length - i);
    }
  }
  return res;
}

/** ยอดสะสมช่วง [from−1, to] (ต้องมีวันก่อนช่วงไว้ลบ) */
export async function loadItemSnaps(admin: Admin, f: { fromYmd: string; toYmd: string; brandId?: string | null }): Promise<ItemSnap[]> {
  const rows = await fetchAllPages<ItemSnap>((a, b) => {
    let q = admin.from("marketing_item_stats").select("item_id, brand_id, date, views, likes, sales, rating, comments").eq("platform", "shopee").gte("date", shiftYmd(f.fromYmd, -1)).lte("date", f.toYmd);
    if (f.brandId) q = q.eq("brand_id", f.brandId);
    return q.order("id", { ascending: true }).range(a, b);
  });
  return rows.map((r) => ({ ...r, views: n(r.views), likes: n(r.likes), sales: n(r.sales), comments: n(r.comments), rating: r.rating == null ? null : Number(r.rating) }));
}

/** ชื่อสินค้าบนร้าน + รุ่นที่จับคู่ (สำหรับแสดง) */
export async function loadListingNames(admin: Admin, itemIds: readonly string[]): Promise<Map<string, { title: string; parentId: string | null; brandId: string | null }>> {
  const out = new Map<string, { title: string; parentId: string | null; brandId: string | null }>();
  const spId = await getPlatformId(admin, "shopee");
  if (!spId) return out;
  for (let i = 0; i < itemIds.length; i += 200) {
    const { data } = await admin.from("platform_catalog_listings").select("external_product_id, title, matched_parent_sku_id, brand_id").eq("platform_id", spId).in("external_product_id", itemIds.slice(i, i + 200));
    for (const r of (data ?? []) as { external_product_id: string; title: string | null; matched_parent_sku_id: string | null; brand_id: string | null }[]) out.set(String(r.external_product_id), { title: r.title ?? "", parentId: r.matched_parent_sku_id, brandId: r.brand_id });
  }
  return out;
}

/** เตือนเช้า: ดาวตก + คนดูพุ่ง (ข้อมูลถึงเมื่อวาน) */
export async function recentTrafficAlerts(admin: Admin, today: string, brandId?: string | null): Promise<{ ratingDrops: { name: string; rating: number; prev: number | null; reason: "dropped" | "low" }[]; viewSpikes: { name: string; views: number; avg: number }[] }> {
  const last = shiftYmd(today, -1);
  const snaps = await loadItemSnaps(admin, { fromYmd: shiftYmd(last, -7), toYmd: last, brandId });
  if (!snaps.some((s) => s.date === last)) return { ratingDrops: [], viewSpikes: [] };
  const drops = ratingDrops(snaps.filter((s) => s.date === last), snaps.filter((s) => s.date === shiftYmd(last, -1)));
  const spikes = viewSpikes(dailyDeltas(snaps), last);
  const names = await loadListingNames(admin, [...new Set([...drops.map((d) => d.item_id), ...spikes.map((s) => s.item_id)])]);
  const nm = (id: string) => names.get(id)?.title || `สินค้า ${id}`;
  return {
    ratingDrops: drops.filter((d) => d.reason === "dropped").map((d) => ({ name: nm(d.item_id), rating: d.rating, prev: d.prev, reason: d.reason })),
    viewSpikes: spikes.map((s) => ({ name: nm(s.item_id), views: s.views, avg: s.avg })),
  };
}
