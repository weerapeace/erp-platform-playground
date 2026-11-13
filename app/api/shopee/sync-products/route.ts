/**
 * ดึงสินค้าที่ลงไว้บน Shopee → หน้า "สินค้าบนแพลตฟอร์ม" — /api/shopee/sync-products
 *  POST { brand_id, cursor?, run_started_at? }  (products.platforms.edit)
 *   → ต่ออายุกุญแจถ้าใกล้หมด → วนทีละสถานะ (ขายอยู่ / ปิดขาย / รอตรวจ / ถูกแบน) ทีละ 50 ตัว
 *     get_item_list → get_item_base_info (50 ตัว 1 ครั้ง) → get_model_list เฉพาะตัวใหม่/ที่เปลี่ยน (เทียบ update_time · ตัวเดิมใช้ตัวเลือกที่เก็บไว้)
 *   → บันทึก + จับคู่รหัสตรงด้วยของกลาง lib/platform-catalog-sync (ไม่ทับคู่เดิม · ที่เหลือให้ตัวเดาคู่เสนอในหน้า)
 *   ← { next_cursor, done, complete, run_started_at, api_total, fetched, models_fetched, stop_reason, created, updated, newly_matched, removed, ... }
 *
 * ดึงหลายครั้งต่อกัน (หน้าเว็บเรียกต่อเองจนครบ · ล้อ /api/lazada/sync-products):
 *   cursor = "ลำดับสถานะ:offset" · ครั้งแรกไม่ส่ง → เริ่มรอบใหม่ (run_started_at = ตอนนี้) · ครั้งต่อไปส่ง next_cursor + run_started_at เดิมกลับมา
 *   ครั้งสุดท้ายจบครบ + จำนวนที่บันทึกตั้งแต่เริ่มรอบ ≥ ยอดรวมที่ Shopee รายงาน (ทุกสถานะ) → ตัวเดิมที่ไม่มา = ติดป้าย "ไม่อยู่บนร้านแล้ว"
 *   (ไม่ขอตัวที่ร้านลบแล้ว → ตัวที่ไม่มา = ลบแล้ว)
 * ⚠️ อ่านอย่างเดียว — ไม่แก้อะไรบนร้าน Shopee · ไม่ใช้ยอดสต๊อกจาก Shopee เป็นยอดตั้งต้น (เก็บไว้ดูเทียบเท่านั้น)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import {
  SHOPEE_PULL_STATUSES, shopeeErrorText, shopeeGetItemBaseInfo, shopeeGetItemList, shopeeGetModelList, shopeeIsRateLimit,
  shopeeItemToCatalogItem, shopeeModelsToSlim, type ShopeeSlim, type ShopeeSlimModel, type ShopeeSlimTier,
} from "@/lib/shopee";
import { markMissingSince, seenSince, upsertCatalogListings, type CatalogSyncItem } from "@/lib/platform-catalog-sync";
import { getPlatformId, shopeeTokenOrReason } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const PAGE = 50;                    // = เพดาน get_item_base_info ต่อครั้ง → 1 หน้า = รายละเอียด 1 ครั้ง
const TIME_BUDGET_MS = 28_000;      // ไม่เริ่มหน้าใหม่หลังจากนี้ (หน้าหนึ่ง = รายการ + รายละเอียด + ตัวเลือกสูงสุด 50 ครั้ง · maxDuration 60)
const RUN_MAX_AGE_MS = 30 * 60_000; // รอบดึงเก่ากว่านี้ = เริ่มรอบใหม่
const MODEL_CONCURRENCY = 4;        // ดึงตัวเลือกพร้อมกันทีละ 4 (Shopee ไม่บอกเพดาน — เกินได้ 429)
const MAX_PAGES_PER_STATUS = 200;   // กันวนไม่จบ (200 × 50 = 10,000 ตัว/สถานะ)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** เรียก Shopee · โดน 429 = รอ 1.5 / 3 วิ แล้วลองใหม่ (สูงสุด 3 ครั้ง) · error อื่นโยนต่อทันที */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) { if (i >= 2 || !shopeeIsRateLimit(e)) throw e; await sleep(1500 * (i + 1)); }
  }
}

/** cursor "ลำดับสถานะ:offset" → ตัวเลข (ผิดรูป = เริ่มต้น) */
function parseCursor(c: unknown): { si: number; offset: number } | null {
  const m = String(c ?? "").match(/^(\d+):(\d+)$/);
  if (!m) return null;
  const si = Number(m[1]), offset = Number(m[2]);
  return si < SHOPEE_PULL_STATUSES.length && offset <= MAX_PAGES_PER_STATUS * PAGE ? { si, offset } : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string; cursor?: string; run_started_at?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = (body.brand_id ?? "").trim();
  if (!brandId) return NextResponse.json({ error: "เลือกแบรนด์/ร้านก่อน (การเชื่อม Shopee ผูกกับแบรนด์)" }, { status: 400 });
  const start = parseCursor(body.cursor);
  const prevRun = Date.parse(body.run_started_at ?? "");
  const runOk = !!start && Number.isFinite(prevRun) && prevRun <= Date.now() && Date.now() - prevRun < RUN_MAX_AGE_MS;
  const runStartedAt = runOk ? new Date(prevRun).toISOString() : new Date().toISOString();
  let { si, offset } = runOk && start ? start : { si: 0, offset: 0 };
  const fromCursor = `${si}:${offset}`;

  const admin = supabaseAdmin();
  const spId = await getPlatformId(admin, "shopee");
  if (!spId) return NextResponse.json({ error: "ยังไม่มีแพลตฟอร์ม Shopee ในระบบ" }, { status: 400 });
  const tok = await shopeeTokenOrReason(admin, brandId, spId, user?.id ?? null);
  if (!tok.ok) return NextResponse.json({ error: tok.reason }, { status: 400 });
  const { accessToken, shopId } = tok;

  const started = Date.now();
  let fetched = 0, modelsFetched = 0, modelsReused = 0, pages = 0;
  let stopReason: string | null = null, done = false;
  const totals: Record<string, number> = {};
  const savedSum = { created: 0, updated: 0, matched: 0, newly_matched: 0, restored: 0 };
  let sample: unknown = null;   // คำตอบจริงตัวแรก (ย่อ) เก็บใน audit ไว้ตรวจตัวแปลง

  while (si < SHOPEE_PULL_STATUSES.length) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const status = SHOPEE_PULL_STATUSES[si];
    try {
      // 1) รายการ 50 ตัวของสถานะนี้
      const page = await withRetry(() => shopeeGetItemList(accessToken, shopId, { status, offset, pageSize: PAGE }));
      totals[status] = page.total;
      if (!page.items.length) { si++; offset = 0; continue; }
      const ids = page.items.map((x) => x.item_id);
      // 2) รายละเอียด (1 ครั้ง) + ตัวเลือกที่เก็บไว้รอบก่อน (ใช้ซ้ำถ้า update_time ไม่เปลี่ยน)
      const [bases, { data: prevRows }] = await Promise.all([
        withRetry(() => shopeeGetItemBaseInfo(accessToken, shopId, ids)),
        admin.from("platform_catalog_listings").select("external_product_id, shopee:raw->shopee").eq("platform_id", spId).eq("brand_id", brandId).in("external_product_id", ids),
      ]);
      const prev = new Map(((prevRows ?? []) as { external_product_id: string; shopee: ShopeeSlim | null }[]).map((r) => [r.external_product_id, r.shopee]));
      if (!sample && bases[0]) sample = { item: Object.fromEntries(Object.entries(bases[0]).filter(([k]) => k !== "description" && k !== "description_info")) };
      // 3) ตัวเลือก — เฉพาะตัวที่มีตัวเลือก และ (ใหม่ / เปลี่ยน / รอบก่อนไม่มีตัวเลือก)
      const modelsOf = new Map<string, { tiers: ShopeeSlimTier[]; models: ShopeeSlimModel[] }>();
      const need: string[] = [];
      for (const b of bases) {
        const id = String(b.item_id ?? "");
        if (b.has_model !== true) continue;
        const p = prev.get(id);
        if (p && p.update_time != null && p.update_time === Number(b.update_time) && p.models?.length) { modelsOf.set(id, { tiers: p.tiers ?? [], models: p.models }); modelsReused++; }
        else need.push(id);
      }
      for (let i = 0; i < need.length; i += MODEL_CONCURRENCY) {
        const chunk = need.slice(i, i + MODEL_CONCURRENCY);
        const got = await Promise.all(chunk.map((id) => withRetry(() => shopeeGetModelList(accessToken, shopId, id))));
        chunk.forEach((id, k) => modelsOf.set(id, shopeeModelsToSlim(got[k])));
        modelsFetched += chunk.length;
        if (!sample || !(sample as { model?: unknown }).model) sample = { ...(sample as object ?? {}), model: got[0] ? { tier_variation: got[0].tier_variation, model: got[0].model.slice(0, 2) } : null };
      }
      // 4) บันทึกหน้านี้ทันที (หมดเวลากลางทาง = หน้าที่ทำแล้วไม่หาย)
      const items = bases.map((b) => shopeeItemToCatalogItem(b, modelsOf.get(String(b.item_id ?? "")) ?? null)).filter((x): x is NonNullable<typeof x> => !!x) as CatalogSyncItem[];
      const saved = await upsertCatalogListings(admin, { platformId: spId, brandId, source: "api", items });
      savedSum.created += saved.created; savedSum.updated += saved.updated; savedSum.matched += saved.matched; savedSum.newly_matched += saved.newly_matched; savedSum.restored += saved.restored;
      fetched += items.length; pages++;
      if (page.hasNext && page.nextOffset > offset && page.nextOffset <= MAX_PAGES_PER_STATUS * PAGE) offset = page.nextOffset;
      else { si++; offset = 0; }
    } catch (e) {
      console.warn(`[shopee] ดึงสินค้า ${status} ตั้งแต่ตัวที่ ${offset + 1} ไม่สำเร็จ: ${(e as Error).message}`);
      stopReason = shopeeErrorText(e);
      break;   // หยุดที่หน้านี้ (ครั้งหน้าเริ่มที่หน้านี้ใหม่)
    }
  }
  if (si >= SHOPEE_PULL_STATUSES.length) done = true;
  if (fetched === 0 && stopReason && !done) {
    return NextResponse.json({ error: `อ่านสินค้าจาก Shopee ไม่สำเร็จ: ${stopReason}`, next_cursor: fromCursor, run_started_at: runStartedAt }, { status: 400 });
  }

  // จบรอบครบ → ยอดรวมทุกสถานะจาก Shopee (ถามใหม่ทีละสถานะ ครั้งละ 1 ตัว) เทียบกับที่บันทึกตั้งแต่เริ่มรอบ → ครบจริงค่อยติดป้ายตัวที่ไม่มา
  let apiTotal = 0, seen = 0, complete = false, gone = { removed: 0, removed_skipped: 0 };
  if (done) {
    try {
      for (const s of SHOPEE_PULL_STATUSES) {
        const t = totals[s] ?? (await withRetry(() => shopeeGetItemList(accessToken, shopId, { status: s, offset: 0, pageSize: 1 }))).total;
        apiTotal += t;
      }
      seen = await seenSince(admin, { platformId: spId, brandId, since: runStartedAt });
      complete = seen >= apiTotal;
      if (complete && apiTotal > 0) gone = await markMissingSince(admin, { platformId: spId, brandId, since: runStartedAt });
    } catch (e) { stopReason = `เช็กสินค้าที่ร้านลบไม่สำเร็จ: ${shopeeErrorText(e)}`; }
  }

  const result = {
    api_total: apiTotal || Object.values(totals).reduce((a, b) => a + b, 0), totals, fetched, pages, models_fetched: modelsFetched, models_reused: modelsReused,
    from_cursor: fromCursor, next_cursor: done ? null : `${si}:${offset}`, done, complete, seen_in_run: seen, run_started_at: runStartedAt, stop_reason: stopReason,
    ...savedSum, ...gone,
  };
  await writeAudit(admin, {
    action: "import", entityType: "platform_catalog", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "shopee_api", brand_id: brandId, shop_id: shopId, ...result, ...(fromCursor === "0:0" && sample ? { sample } : {}) },
  });
  return NextResponse.json({ ok: true, partial: !done, ...result, error: null });
}
