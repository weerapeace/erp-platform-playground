/**
 * เช็กข้ามร้าน ฝั่ง server — อ่าน DB แล้วประกอบตาราง "สินค้าในระบบ × ทุกร้าน" ด้วยกฎกลาง lib/platform-cross-shop
 * ใช้: GET /api/platform-catalog/cross-shop?brand_id= (หน้าสินค้าบนแพลตฟอร์ม ?view=cross) · อ่านอย่างเดียว ไม่แตะร้าน
 *
 * ของกลางที่ใช้ (ไม่มีตัวอ่าน/ตัวเดาตัวที่ 2):
 *   รายการบนร้าน = loadListingsWithRaw (lib/platform-shop-view-server · ฟังก์ชัน DB platform_listings_slim ตัวเดียวกับมุมมองหน้าร้าน)
 *   "อาจมีแล้ว" = computeMatchSuggestions (lib/platform-match-server) กฎเดียวกับกอง "อาจมีบนร้านแล้ว" ใน loadNotListedGroups
 *   ร้านที่แบรนด์สั่งซ่อน = ui_config listing_hidden_platforms (lib/listing-hidden-platforms) · สต๊อกระบบ = lib/sku-stock
 *   คอลัมน์ Website = store_listings (หน้าร้านเว็บของเรา · กฎเดียวกับ /api/public/storefront/products: ร้าน active + is_published)
 *   ป้ายพร้อมลง = ผลที่จดไว้ใน platform_create_readiness (lib/platform-readiness-store · cron ตรวจทุกคืน)
 * ความเร็ว: ทุกร้านอ่านพร้อมกัน · ตัวเดาคู่ทำเฉพาะร้านที่มีรายการยังไม่จับคู่ · สต๊อกถามเป็นชุด (พร้อมกันทีละ 4 ชุด)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllPages } from "@/lib/fetch-all";
import { SELLING_PLATFORMS } from "@/lib/selling-platforms";
import { isGoneStatus } from "@/lib/platform-listing-health";
import { loadListingsWithRaw } from "@/lib/platform-shop-view-server";
import { computeMatchSuggestions } from "@/lib/platform-match-server";
import { LISTING_HIDDEN_KEY, hiddenCodesOf, normalizeHiddenMap } from "@/lib/listing-hidden-platforms";
import { loadSkuStock } from "@/lib/sku-stock";
import { loadReadiness } from "@/lib/platform-readiness-store";
import { WEBSITE, buildCell, emptyCell, listableMissing, type CellListing, type CrossRow, type CrossShop, type CrossShopResponse } from "@/lib/platform-cross-shop";
import type { SkuLite } from "@/lib/platform-variant-match";

type Admin = ReturnType<typeof supabaseAdmin>;
const CHUNK = 200;
const chunks = <T,>(xs: T[], n = CHUNK): T[][] => { const out: T[][] = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out; };

type ParentRow = {
  id: string; code: string | null; name_th: string | null; name_platform: string | null; cover_image_r2_key: string | null;
  weight_g: number | null; size_length_cm: number | null; size_height_cm: number | null; platform_description: string | null; description: string | null;
};
type SkuRow = { id: string; code: string; parent_sku_id: string | null; is_active: boolean | null; sale_ok: boolean | null; list_price: number | null; fake_price: number | null };

/** ทำงานทีละกลุ่ม (กันยิง DB พร้อมกันเยอะเกิน) */
async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

/** opts.suggest=false = ไม่เดาคู่ (cron ไม่ต้องใช้ช่องเหลือง) · opts.stock=false = ไม่อ่านสต๊อก */
export async function loadCrossShop(admin: Admin, brandId: string, opts: { suggest?: boolean; stock?: boolean } = {}): Promise<Omit<CrossShopResponse, "error">> {
  const [{ data: brand }, { data: pfs }, { data: accounts }, { data: hiddenCfg }, parents] = await Promise.all([
    admin.from("brands").select("id, name").eq("id", brandId).maybeSingle(),
    admin.from("erp_platforms").select("id, code, name_th, sort_order").in("code", [...SELLING_PLATFORMS]).order("sort_order", { ascending: true }),
    admin.from("platform_accounts").select("platform_id").eq("brand_id", brandId).eq("is_active", true),
    admin.from("ui_config").select("value").eq("key", LISTING_HIDDEN_KEY).maybeSingle(),
    fetchAllPages<ParentRow>((from, to) => admin.from("parent_skus_v2")
      .select("id, code, name_th, name_platform, cover_image_r2_key, weight_g, size_length_cm, size_height_cm, platform_description, description")
      .eq("brand_id", brandId).eq("is_active", true).order("code", { ascending: true }).order("id", { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: ParentRow[] | null; error: unknown }>),
  ]);
  const pfRows = (pfs ?? []) as { id: string; code: string; name_th: string }[];
  const hidden = new Set(hiddenCodesOf(normalizeHiddenMap((hiddenCfg as { value?: unknown } | null)?.value), brandId));
  const withAccount = new Set(((accounts ?? []) as { platform_id: string }[]).map((a) => a.platform_id));
  const parentIds = parents.map((p) => p.id);

  // SKU ของแบรนด์ (ใช้จับตัวเลือกบนร้าน + ราคาที่ระบบจะส่ง) · รหัสซ้ำ = ใช้ตัวที่เปิดใช้งาน (เหมือน loadSkuLookup)
  const skus = (await inBatches(chunks(parentIds), 4, (part) => fetchAllPages<SkuRow>((from, to) => admin.from("skus_v2")
    .select("id, code, parent_sku_id, is_active, sale_ok, list_price, fake_price").in("parent_sku_id", part)
    .order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: SkuRow[] | null; error: unknown }>))).flat();
  const byCode = new Map<string, SkuLite>(); const fakeOf = new Map<string, number>(); const saleOf = new Map<string, number>();
  const activeCodes = new Set<string>();
  const sellable = new Map<string, SkuRow[]>();   // parent → SKU เปิดขาย
  for (const s of skus) {
    const active = s.is_active !== false;
    if (active && s.sale_ok !== false && s.parent_sku_id) (sellable.get(s.parent_sku_id) ?? sellable.set(s.parent_sku_id, []).get(s.parent_sku_id)!).push(s);
    if (byCode.has(s.code) && (activeCodes.has(s.code) || !active)) continue;
    byCode.set(s.code, { code: s.code, parent_sku_id: s.parent_sku_id, name: null });
    const f = Number(s.fake_price); if (Number.isFinite(f) && f > 0) fakeOf.set(s.code, f); else fakeOf.delete(s.code);
    const l = Number(s.list_price); if (Number.isFinite(l) && l > 0) saleOf.set(s.code, l); else saleOf.delete(s.code);
    if (active) activeCodes.add(s.code);
  }

  // ร้าน: เปิดตรวจ = มีบัญชีร้านของแบรนด์ หรือมีรายการบนร้าน · แบรนด์สั่งซ่อน = hidden
  const [listingsByPf, web, readyMap] = await Promise.all([
    Promise.all(pfRows.map((p) => (p.code === WEBSITE ? Promise.resolve([]) : loadListingsWithRaw(admin, p.id, brandId)))),
    loadWebListings(admin, parentIds),
    loadReadiness(admin, parentIds),
  ]);
  const shops: CrossShop[] = pfRows.map((p, i) => ({
    code: p.code, name: p.name_th,
    state: hidden.has(p.code) ? "hidden" : p.code === WEBSITE ? (web.size ? "on" : "noshop") : withAccount.has(p.id) || listingsByPf[i].length ? "on" : "noshop",
  }));

  // ตัวเดาคู่ เฉพาะร้านที่เปิดตรวจและมีรายการยังไม่จับคู่ (กฎเดียวกับกอง "อาจมีบนร้านแล้ว")
  const unmatched: Record<string, number> = {};
  const sugg = await Promise.all(pfRows.map(async (p, i) => {
    const n = listingsByPf[i].filter((l) => !l.matched_parent_sku_id && !l.match_ignored && !isGoneStatus(l.status)).length;
    unmatched[p.code] = n;
    return opts.suggest !== false && shops[i].state === "on" && n ? computeMatchSuggestions(admin, { platformId: p.id, brandId }) : null;
  }));

  // สต๊อกในระบบ (BigSeller ยังคุมสต๊อก — ส่วนใหญ่ยังไม่มีข้อมูล = null ไม่ใช่ 0)
  const sellIds = [...sellable.values()].flat().map((s) => s.id);
  const stockMaps = opts.stock === false ? [] : await inBatches(chunks(sellIds, 300), 4, (part) => loadSkuStock(admin, part));
  const stockOf = new Map<string, number>();
  for (const m of stockMaps) for (const [id, st] of m) stockOf.set(id, Math.max(0, st.onHand - st.reserved));

  // รายการที่จับคู่แล้ว ต่อ (ร้าน, รุ่น) · ตัวเดา top ต่อ (ร้าน, รุ่น)
  const matchedBy = pfRows.map((_, i) => {
    const m = new Map<string, CellListing[]>();
    for (const l of listingsByPf[i]) if (l.matched_parent_sku_id) (m.get(l.matched_parent_sku_id) ?? m.set(l.matched_parent_sku_id, []).get(l.matched_parent_sku_id)!).push(l);
    return m;
  });
  const maybeBy = pfRows.map((_, i) => {
    const m = new Map<string, { lid: string; title: string | null; score: number }>();
    const s = sugg[i]; if (!s) return m;
    for (const l of s.listings) {
      const top = s.suggestions[l.id]?.[0]; if (!top) continue;
      const prev = m.get(top.parent_sku_id);
      if (!prev || top.score > prev.score) m.set(top.parent_sku_id, { lid: l.id, title: l.title ?? null, score: top.score });
    }
    return m;
  });

  const rows: CrossRow[] = parents.map((p) => {
    const sell = sellable.get(p.id) ?? [];
    const sales = sell.map((s) => Number(s.list_price)).filter((n) => Number.isFinite(n) && n > 0);
    const fulls = sell.map((s) => Number(s.fake_price)).filter((n) => Number.isFinite(n) && n > 0);
    const stocks = sell.map((s) => stockOf.get(s.id)).filter((n): n is number => n != null);
    const ctx = { byCode, fakeOf, saleOf, ourCodes: sell.map((s) => s.code) };
    const cells: CrossRow["cells"] = {};
    pfRows.forEach((pf, i) => {
      if (shops[i].state !== "on") { cells[pf.code] = emptyCell("off"); return; }
      if (pf.code === WEBSITE) {
        const w = web.get(p.id);
        const c = emptyCell(!w ? "none" : w.published.length ? "selling" : "hidden");
        if (w) { c.listings = 1; c.web_shops = w.published.length ? w.published : w.listed; }
        cells[pf.code] = c; return;
      }
      const c = buildCell(pf.code, matchedBy[i].get(p.id) ?? [], ctx);
      if (c.st === "none") { const mb = maybeBy[i].get(p.id); if (mb) { c.st = "maybe"; c.maybe = mb; } }
      cells[pf.code] = c;
    });
    const desc = (p.platform_description || p.description || "").trim();
    const stored = readyMap.get(p.id);
    const row: CrossRow = {
      id: p.id, code: p.code ?? "", name: p.name_th, name_platform: p.name_platform, cover_key: p.cover_image_r2_key,
      our: {
        sale: sales.length ? Math.min(...sales) : null, full: fulls.length ? Math.min(...fulls) : null, skus: sell.length,
        stock: stocks.length ? stocks.reduce((a, b) => a + b, 0) : null,
        desc_len: [...desc].length, weight_g: p.weight_g != null ? Number(p.weight_g) : null,
        box: !!(Number(p.size_length_cm) > 0 && Number(p.size_height_cm) > 0),
      },
      cells,
    };
    if (stored) {
      const ready: NonNullable<CrossRow["ready"]> = {};
      for (const c of listableMissing(row, shops.filter((s) => s.state === "on").map((s) => s.code))) {
        const r = stored[c]; if (r) ready[c] = { ready: r.ready, on_shop: r.on_shop, missing: r.missing, at: r.checked_at };
      }
      if (Object.keys(ready).length) row.ready = ready;
    }
    return row;
  });
  return { brand: brand ? { id: (brand as { id: string }).id, name: String((brand as { name: string | null }).name ?? "") } : null, shops, rows, unmatched };
}

/** หน้าร้านเว็บของเรา: parent → ชื่อร้านที่เผยแพร่อยู่ / ที่เพิ่มไว้แต่ซ่อน (เฉพาะร้าน active) */
async function loadWebListings(admin: Admin, parentIds: string[]): Promise<Map<string, { published: string[]; listed: string[] }>> {
  const out = new Map<string, { published: string[]; listed: string[] }>();
  const { data: shopRows, error } = await admin.from("shops").select("id, name, status");
  if (error) { console.warn("[cross-shop] shops", error.message); return out; }
  const nameOf = new Map(((shopRows ?? []) as { id: string; name: string | null; status: string | null }[]).filter((s) => s.status === "active").map((s) => [s.id, s.name ?? "เว็บไซต์"]));
  if (!nameOf.size) return out;
  const parts = await inBatches(chunks(parentIds, 300), 4, async (part) => {
    const { data, error: e } = await admin.from("store_listings").select("shop_id, parent_sku_id, is_published").in("parent_sku_id", part).in("shop_id", [...nameOf.keys()]).limit(5000);
    if (e) console.warn("[cross-shop] store_listings", e.message);
    return (data ?? []) as { shop_id: string; parent_sku_id: string; is_published: boolean | null }[];
  });
  for (const l of parts.flat()) {
    const m = out.get(l.parent_sku_id) ?? out.set(l.parent_sku_id, { published: [], listed: [] }).get(l.parent_sku_id)!;
    const n = nameOf.get(l.shop_id)!;
    (l.is_published ? m.published : m.listed).push(n);
  }
  return out;
}
