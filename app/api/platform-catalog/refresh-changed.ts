/**
 * ดึงสินค้าจากร้าน "เฉพาะตัวที่เปลี่ยน" (ไม่ใช่ route · import ได้) — Lazada / Shopee (+ TikTok แบบช่วงสั้นตอนเช็กก่อนลง)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-21 ข้อ 1-3 (บั๊ก LY22 ลง Lazada แล้วแต่แท็บแพลตฟอร์มขึ้น "พร้อมลง"):
 *   เดิมรายการสินค้าบนร้านของ Lazada/Shopee อัปเดตเฉพาะตอนกด "ดึงสินค้าจากร้าน" (LM Lazada ค้างตั้งแต่ 2026-11-13)
 *   ใช้ 3 ที่ ตัวเดียวกัน:
 *     1) /api/cron/catalog-refresh ทุกชั่วโมง (ทุกแบรนด์ที่เชื่อม Lazada / Shopee)
 *     2) ด่านก่อนลงจริงใน /api/<ร้าน>/create-product (guardNotOnShop) — เจอบนร้าน = ไม่สร้างซ้ำ
 *     3) ปุ่ม "เช็กกับร้านตอนนี้" ในแท็บแพลตฟอร์ม (/api/product-platforms/shop-check)
 *   กติกาช่วงเวลา/รอบค้าง/ความเก่า = lib/catalog-refresh-plan (pure + เทสต์) · สถานะเก็บ ui_config catalog_refresh:<ร้าน>:<แบรนด์>
 *   แปลงข้อมูล + บันทึก + จับคู่รหัสตรง = ตัวเดียวกับปุ่มดึงสินค้า (lazProductToCatalogItem / shopeeItemToCatalogItem / upsertCatalogListings)
 *   ไม่ติดป้าย "ไม่อยู่บนร้านแล้ว" (ทำได้เฉพาะรอบดึงครบทั้งร้าน — ปุ่มดึงสินค้า)
 * ⚠️ อ่านจากร้านอย่างเดียว ไม่แก้อะไรบนร้าน
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { lazErrorText, lazGetProducts, lazProductToCatalogItem, type LazCatalogItem } from "@/lib/lazada";
import {
  SHOPEE_PULL_STATUSES, shopeeErrorText, shopeeGetItemBaseInfo, shopeeGetItemList, shopeeGetModelList, shopeeIsRateLimit,
  shopeeItemToCatalogItem, shopeeModelsToSlim, type ShopeeSlim, type ShopeeSlimModel, type ShopeeSlimTier,
} from "@/lib/shopee";
import { upsertCatalogListings, type CatalogSyncItem } from "@/lib/platform-catalog-sync";
import { LIVE_LISTING_OR } from "@/lib/platform-listing-health";
import {
  catalogRefreshKey, finishRefreshState, isCatalogStale, normalizeRefreshState, planRefreshWindow, CATALOG_REFRESH_PREFIX,
} from "@/lib/catalog-refresh-plan";
import { PULL_RUN_PREFIX } from "@/lib/order-pull-health";
import { getPlatformId, lazTokenOrReason } from "../lazada/shared";
import { shopeeTokenOrReason } from "../shopee/shared";
import { ttsTokenOrReason } from "../tiktok-shop/shared";
import { syncTiktokProductsChanged } from "../tiktok-shop/products-sync";

export type RefreshPlatform = "lazada" | "shopee";
export const REFRESH_PLATFORMS: RefreshPlatform[] = ["lazada", "shopee"];
export type RefreshResult = { platform: string; brand_id: string; ok: boolean; done: boolean; saved: number; newly_matched: number; error: string | null; fresh_at: string | null };

const PAGE = 50;
const SHOPEE_MAX_WINDOW_MS = 14 * 24 * 3600_000;   // Shopee จำกัดช่วงเวลาค้นต่อครั้ง (ออเดอร์ ≤ 15 วัน) → ทีละ ≤ 14 วัน
const MODEL_CONCURRENCY = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function shopeeRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) { if (i >= 2 || !shopeeIsRateLimit(e)) throw e; await sleep(1500 * (i + 1)); }
  }
}

async function readState(admin: SupabaseClient, key: string) {
  const { data } = await admin.from("ui_config").select("value").eq("key", key).maybeSingle();
  return normalizeRefreshState((data as { value?: unknown } | null)?.value);
}
async function writeState(admin: SupabaseClient, key: string, value: unknown) {
  await admin.from("ui_config").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}
/** เวลาที่ดึงแบบเต็มครั้งล่าสุด (โดยประมาณ = แถวที่อัปเดตล่าสุดของร้าน+แบรนด์นี้) — ใช้ตอนยังไม่เคยมีรอบ "เฉพาะตัวที่เปลี่ยน" */
async function lastFullPullMs(admin: SupabaseClient, platformId: string, brandId: string): Promise<number | null> {
  const { data } = await admin.from("platform_catalog_listings").select("updated_at").eq("platform_id", platformId).eq("brand_id", brandId)
    .eq("source", "api").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const t = Date.parse(String((data as { updated_at?: string } | null)?.updated_at ?? ""));
  return Number.isFinite(t) ? t : null;
}

type Pulled = { done: boolean; cursor: string; sinceMs: number; saved: number; newly: number; error: string | null };

async function pullLazada(admin: SupabaseClient, ctx: { platformId: string; brandId: string; sinceMs: number; startedAtMs: number; cursor: string; budgetMs: number }): Promise<Pulled> {
  const tok = await lazTokenOrReason(admin, ctx.brandId, ctx.platformId, null);
  if (!tok.ok) return { done: false, cursor: ctx.cursor, sinceMs: ctx.sinceMs, saved: 0, newly: 0, error: tok.reason };
  const started = Date.now();
  let offset = Number(ctx.cursor) || 0; let saved = 0; let newly = 0;
  const updateAfter = new Date(ctx.sinceMs).toISOString().replace(/\.\d{3}Z$/, "+00:00");
  while (Date.now() - started < ctx.budgetMs) {
    let res: { products: Record<string, unknown>[]; total: number };
    try { res = await lazGetProducts(tok.gateway, tok.accessToken, { offset, limit: PAGE, updateAfter }); }
    catch (e) { return { done: false, cursor: String(offset), sinceMs: ctx.sinceMs, saved, newly, error: lazErrorText(e) }; }
    const items: LazCatalogItem[] = [];
    for (const p of res.products) { const it = lazProductToCatalogItem(p); if (it) items.push(it); }
    if (items.length) {
      try {
        const r = await upsertCatalogListings(admin, { platformId: ctx.platformId, brandId: ctx.brandId, source: "api", items });
        saved += items.length; newly += r.newly_matched ?? 0;
      } catch (e) { return { done: false, cursor: String(offset), sinceMs: ctx.sinceMs, saved, newly, error: `บันทึกไม่สำเร็จ: ${(e as Error).message}` }; }
    }
    offset += res.products.length;
    if (!res.products.length || res.products.length < PAGE || (res.total && offset >= res.total)) return { done: true, cursor: "", sinceMs: ctx.sinceMs, saved, newly, error: null };
  }
  return { done: false, cursor: String(offset), sinceMs: ctx.sinceMs, saved, newly, error: null };
}

async function pullShopee(admin: SupabaseClient, ctx: { platformId: string; brandId: string; sinceMs: number; startedAtMs: number; cursor: string; budgetMs: number }): Promise<Pulled> {
  const tok = await shopeeTokenOrReason(admin, ctx.brandId, ctx.platformId, null);
  if (!tok.ok) return { done: false, cursor: ctx.cursor, sinceMs: ctx.sinceMs, saved: 0, newly: 0, error: tok.reason };
  const { accessToken, shopId } = tok;
  const started = Date.now();
  const m = ctx.cursor.match(/^(\d+):(\d+)$/);
  let si = m ? Math.min(Number(m[1]), SHOPEE_PULL_STATUSES.length) : 0; let offset = m ? Number(m[2]) : 0;
  const chunkEnd = Math.min(ctx.sinceMs + SHOPEE_MAX_WINDOW_MS, ctx.startedAtMs);
  const from = Math.floor(ctx.sinceMs / 1000); const to = Math.floor(chunkEnd / 1000);
  let saved = 0; let newly = 0;
  while (si < SHOPEE_PULL_STATUSES.length) {
    if (Date.now() - started > ctx.budgetMs) return { done: false, cursor: `${si}:${offset}`, sinceMs: ctx.sinceMs, saved, newly, error: null };
    const status = SHOPEE_PULL_STATUSES[si];
    try {
      const page = await shopeeRetry(() => shopeeGetItemList(accessToken, shopId, { status, offset, pageSize: PAGE, updateTimeFrom: from, updateTimeTo: to }));
      if (!page.items.length) { si++; offset = 0; continue; }
      const ids = page.items.map((x) => x.item_id);
      const [bases, { data: prevRows }] = await Promise.all([
        shopeeRetry(() => shopeeGetItemBaseInfo(accessToken, shopId, ids)),
        admin.from("platform_catalog_listings").select("external_product_id, shopee:raw->shopee").eq("platform_id", ctx.platformId).eq("brand_id", ctx.brandId).in("external_product_id", ids),
      ]);
      const prev = new Map(((prevRows ?? []) as { external_product_id: string; shopee: ShopeeSlim | null }[]).map((r) => [r.external_product_id, r.shopee]));
      const modelsOf = new Map<string, { tiers: ShopeeSlimTier[]; models: ShopeeSlimModel[] }>();
      const need: string[] = [];
      for (const b of bases) {
        const id = String(b.item_id ?? "");
        if (b.has_model !== true) continue;
        const p = prev.get(id);
        if (p && p.update_time != null && p.update_time === Number(b.update_time) && p.models?.length) modelsOf.set(id, { tiers: p.tiers ?? [], models: p.models });
        else need.push(id);
      }
      for (let i = 0; i < need.length; i += MODEL_CONCURRENCY) {
        const chunk = need.slice(i, i + MODEL_CONCURRENCY);
        const got = await Promise.all(chunk.map((id) => shopeeRetry(() => shopeeGetModelList(accessToken, shopId, id))));
        chunk.forEach((id, k) => modelsOf.set(id, shopeeModelsToSlim(got[k])));
      }
      const items = bases.map((b) => shopeeItemToCatalogItem(b, modelsOf.get(String(b.item_id ?? "")) ?? null)).filter((x): x is NonNullable<typeof x> => !!x) as CatalogSyncItem[];
      if (items.length) {
        const r = await upsertCatalogListings(admin, { platformId: ctx.platformId, brandId: ctx.brandId, source: "api", items });
        saved += items.length; newly += r.newly_matched ?? 0;
      }
      if (page.hasNext && page.nextOffset > offset) offset = page.nextOffset;
      else { si++; offset = 0; }
    } catch (e) {
      return { done: false, cursor: `${si}:${offset}`, sinceMs: ctx.sinceMs, saved, newly, error: shopeeErrorText(e) };
    }
  }
  // ช่วงนี้ครบ — ถ้ายังไม่ถึงเวลาเริ่มรอบ (ข้อมูลเก่าเกิน 14 วัน) ทำช่วงถัดไปรอบหน้า
  if (chunkEnd < ctx.startedAtMs) return { done: false, cursor: "", sinceMs: chunkEnd, saved, newly, error: null };
  return { done: true, cursor: "", sinceMs: ctx.sinceMs, saved, newly, error: null };
}

/** ดึงเฉพาะตัวที่เปลี่ยนของร้าน+แบรนด์นี้ (ต่อจากรอบก่อน) แล้วจดสถานะ — ไม่ throw */
export async function refreshShopChanged(admin: SupabaseClient, args: { platform: RefreshPlatform; brandId: string; budgetMs: number }): Promise<RefreshResult> {
  const { platform, brandId } = args;
  const base = { platform, brand_id: brandId, ok: false, done: false, saved: 0, newly_matched: 0 };
  try {
    const platformId = await getPlatformId(admin, platform);
    if (!platformId) return { ...base, error: `ยังไม่มีแพลตฟอร์ม ${platform} ในระบบ`, fresh_at: null };
    const key = catalogRefreshKey(platform, brandId);
    const prev = await readState(admin, key);
    const now = Date.now();
    const win = planRefreshWindow(prev, now, prev.last_done_at ? null : await lastFullPullMs(admin, platformId, brandId));
    if (!win) return { ...base, error: "ยังไม่เคยดึงสินค้าจากร้านนี้ — กด \"ดึงสินค้าจากร้าน\" แบบเต็ม 1 ครั้งก่อน", fresh_at: null };
    const ctx = { platformId, brandId, sinceMs: win.sinceMs, startedAtMs: win.startedAtMs, cursor: win.cursor, budgetMs: args.budgetMs };
    const r = platform === "lazada" ? await pullLazada(admin, ctx) : await pullShopee(admin, ctx);
    const next = finishRefreshState(prev, { sinceMs: r.sinceMs, startedAtMs: win.startedAtMs, cursor: r.cursor, done: r.done, error: r.error, saved: r.saved }, Date.now());
    await writeState(admin, key, next);
    return { ...base, ok: !r.error, done: r.done && !r.error, saved: r.saved, newly_matched: r.newly, error: r.error, fresh_at: next.last_done_at };
  } catch (e) {
    return { ...base, error: (e as Error).message || "ดึงไม่สำเร็จ", fresh_at: null };
  }
}

/** TikTok: ดึงตัวที่เปลี่ยนใน 2 ชม.ล่าสุด (ตัวดึงทุก 15 นาทีมีอยู่แล้ว — ตรงนี้กันช่องว่างก่อนลงจริง) */
async function refreshTiktokRecent(admin: SupabaseClient, brandId: string, budgetMs: number): Promise<RefreshResult> {
  const base = { platform: "tiktok", brand_id: brandId, ok: false, done: false, saved: 0, newly_matched: 0, fresh_at: null };
  try {
    const platformId = await getPlatformId(admin, "tiktok");
    if (!platformId) return { ...base, error: "ยังไม่มีแพลตฟอร์ม TikTok ในระบบ" };
    const tok = await ttsTokenOrReason(admin, brandId, platformId, null);
    if (!tok.ok) return { ...base, error: tok.reason };
    const shop = tok.meta.shops?.[0];
    if (!shop?.cipher) return { ...base, error: "ยังไม่รู้รหัสร้าน TikTok (กด ตรวจการเชื่อมต่อ)" };
    const startedIso = new Date().toISOString();
    const r = await syncTiktokProductsChanged(admin, { platformId, brandId, accessToken: tok.accessToken, cipher: shop.cipher, updateTimeGe: Math.floor(Date.now() / 1000) - 2 * 3600, timeBudgetMs: budgetMs });
    return { ...base, ok: !r.stop_reason, done: !r.stop_reason, saved: r.saved, error: r.stop_reason, fresh_at: r.stop_reason ? null : startedIso };
  } catch (e) { return { ...base, error: (e as Error).message || "ดึงไม่สำเร็จ" }; }
}

export type ShopCheck = { brandId: string | null; result: RefreshResult | null; onShop: { id: string; external_id: string | null; title: string | null } | null; freshAt: string | null };

/** สินค้า 1 ตัว: ดึงตัวที่เปลี่ยนของร้านนั้น แล้วดูว่าสินค้านี้อยู่บนร้านแล้วไหม (จับคู่ไว้ · ไม่นับตัวที่ร้านลบแล้ว) */
export async function checkParentOnShop(admin: SupabaseClient, platformCode: string, parentId: string, budgetMs: number): Promise<ShopCheck> {
  const { data: p } = await admin.from("parent_skus_v2").select("brand_id").eq("id", parentId).maybeSingle();
  const brandId = ((p as { brand_id?: string | null } | null)?.brand_id) ?? null;
  const platformId = await getPlatformId(admin, platformCode);
  let result: RefreshResult | null = null;
  if (brandId && (platformCode === "lazada" || platformCode === "shopee")) result = await refreshShopChanged(admin, { platform: platformCode, brandId, budgetMs });
  else if (brandId && platformCode === "tiktok") result = await refreshTiktokRecent(admin, brandId, budgetMs);
  let onShop: ShopCheck["onShop"] = null;
  if (platformId) {
    const { data } = await admin.from("platform_catalog_listings").select("id, external_product_id, title")
      .eq("platform_id", platformId).eq("matched_parent_sku_id", parentId).or(LIVE_LISTING_OR).limit(1).maybeSingle();
    const l = data as { id: string; external_product_id: string | null; title: string | null } | null;
    if (l) onShop = { id: l.id, external_id: l.external_product_id, title: l.title };
  }
  const freshAt = result?.fresh_at ?? (brandId ? (await catalogFreshness(admin, brandId))[platformCode] ?? null : null);
  return { brandId, result, onShop, freshAt };
}

/**
 * ด่านก่อนลงจริง (create-product ของแต่ละร้าน): เช็กกับร้านก่อน → เจอสินค้านี้บนร้าน = ไม่สร้างซ้ำ
 * เช็กไม่สำเร็จ + ข้อมูลร้านเก่ากว่า 2 ชม. = ไม่ให้ลง (ไม่แน่ใจ) · เช็กไม่สำเร็จแต่ข้อมูลสด (ตัวดึงทุกชั่วโมงเพิ่งทำ) = ลงต่อได้
 * คืน null = ผ่าน · อื่น ๆ = หยุดพร้อมข้อความ
 */
export async function guardNotOnShop(admin: SupabaseClient, platformCode: string, platformLabel: string, parentId: string, budgetMs = 15_000): Promise<{ status: number; error: string } | null> {
  const c = await checkParentOnShop(admin, platformCode, parentId, budgetMs);
  if (c.onShop) return { status: 409, error: `มีบน ${platformLabel} แล้ว${c.onShop.external_id ? ` (#${c.onShop.external_id})` : ""} — ระบบเพิ่งเจอตอนเช็กกับร้าน จับคู่ให้แล้ว ไม่สร้างซ้ำ` };
  if (c.result && !c.result.ok && isCatalogStale(c.freshAt, Date.now())) {
    return { status: 503, error: `เช็กกับ ${platformLabel} ก่อนลงไม่สำเร็จ (${c.result.error ?? "ไม่ทราบสาเหตุ"}) — กันลงซ้ำไว้ก่อน ลองใหม่อีกครั้ง` };
  }
  return null;
}

/** ข้อมูลร้านสดถึงเมื่อไร ต่อร้าน (platform code → ISO) — Lazada/Shopee จากสถานะรอบดึง (ไม่มี = เวลาดึงเต็มล่าสุด) · TikTok จากตัวดึงทุก 15 นาที */
export async function catalogFreshness(admin: SupabaseClient, brandId: string): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const [{ data: states }, { data: tt }, ids] = await Promise.all([
    admin.from("ui_config").select("key, value").like("key", `${CATALOG_REFRESH_PREFIX}%:${brandId}`),
    admin.from("ui_config").select("value").eq("key", `${PULL_RUN_PREFIX}tiktok:${brandId}`).maybeSingle(),
    Promise.all(REFRESH_PLATFORMS.map(async (c) => [c, await getPlatformId(admin, c)] as const)),
  ]);
  for (const s of (states ?? []) as { key: string; value: unknown }[]) {
    const code = s.key.slice(CATALOG_REFRESH_PREFIX.length).split(":")[0];
    out[code] = normalizeRefreshState(s.value).last_done_at;
  }
  for (const [code, pid] of ids) {
    if (out[code] || !pid) continue;
    const t = await lastFullPullMs(admin, pid, brandId);
    out[code] = t ? new Date(t).toISOString() : null;
  }
  const lastOk = (tt as { value?: { last_ok_at?: string | null } } | null)?.value?.last_ok_at ?? null;
  if (lastOk) out.tiktok = lastOk;
  return out;
}
