/**
 * เช็กข้ามร้าน ฝั่ง server — อ่าน DB แล้วประกอบตาราง "สินค้าในระบบ × ทุกร้าน" ด้วยกฎกลาง lib/platform-cross-shop
 * ใช้: GET /api/platform-catalog/cross-shop?brand_id= (หน้าสินค้าบนแพลตฟอร์ม ?view=cross) · อ่านอย่างเดียว ไม่แตะร้าน
 *
 * ของกลางที่ใช้ (ไม่มีตัวอ่าน/ตัวเดาตัวที่ 2):
 *   รายการบนร้าน = loadListingsWithRaw (lib/platform-shop-view-server · ฟังก์ชัน DB platform_listings_slim ตัวเดียวกับมุมมองหน้าร้าน)
 *   "อาจมีแล้ว" = computeMatchSuggestions (lib/platform-match-server) กฎเดียวกับกอง "อาจมีบนร้านแล้ว" ใน loadNotListedGroups
 *   ร้านที่แบรนด์สั่งซ่อน = ui_config listing_hidden_platforms (lib/listing-hidden-platforms) · สต๊อกระบบ = lib/sku-stock
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
import { buildCell, emptyCell, type CellListing, type CrossRow, type CrossShop, type CrossShopResponse } from "@/lib/platform-cross-shop";
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

export async function loadCrossShop(admin: Admin, brandId: string): Promise<Omit<CrossShopResponse, "error">> {
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
  const listingsByPf = await Promise.all(pfRows.map((p) => loadListingsWithRaw(admin, p.id, brandId)));
  const shops: CrossShop[] = pfRows.map((p, i) => ({
    code: p.code, name: p.name_th,
    state: hidden.has(p.code) ? "hidden" : withAccount.has(p.id) || listingsByPf[i].length ? "on" : "noshop",
  }));

  // ตัวเดาคู่ เฉพาะร้านที่เปิดตรวจและมีรายการยังไม่จับคู่ (กฎเดียวกับกอง "อาจมีบนร้านแล้ว")
  const unmatched: Record<string, number> = {};
  const sugg = await Promise.all(pfRows.map(async (p, i) => {
    const n = listingsByPf[i].filter((l) => !l.matched_parent_sku_id && !l.match_ignored && !isGoneStatus(l.status)).length;
    unmatched[p.code] = n;
    return shops[i].state === "on" && n ? computeMatchSuggestions(admin, { platformId: p.id, brandId }) : null;
  }));

  // สต๊อกในระบบ (BigSeller ยังคุมสต๊อก — ส่วนใหญ่ยังไม่มีข้อมูล = null ไม่ใช่ 0)
  const sellIds = [...sellable.values()].flat().map((s) => s.id);
  const stockMaps = await inBatches(chunks(sellIds, 300), 4, (part) => loadSkuStock(admin, part));
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
      const c = buildCell(pf.code, matchedBy[i].get(p.id) ?? [], ctx);
      if (c.st === "none") { const mb = maybeBy[i].get(p.id); if (mb) { c.st = "maybe"; c.maybe = mb; } }
      cells[pf.code] = c;
    });
    const desc = (p.platform_description || p.description || "").trim();
    return {
      id: p.id, code: p.code ?? "", name: p.name_th, name_platform: p.name_platform, cover_key: p.cover_image_r2_key,
      our: {
        sale: sales.length ? Math.min(...sales) : null, full: fulls.length ? Math.min(...fulls) : null, skus: sell.length,
        stock: stocks.length ? stocks.reduce((a, b) => a + b, 0) : null,
        desc_len: [...desc].length, weight_g: p.weight_g != null ? Number(p.weight_g) : null,
        box: !!(Number(p.size_length_cm) > 0 && Number(p.size_height_cm) > 0),
      },
      cells,
    };
  });
  return { brand: brand ? { id: (brand as { id: string }).id, name: String((brand as { name: string | null }).name ?? "") } : null, shops, rows, unmatched };
}
