/**
 * ดึงสินค้าที่ลงไว้บน TikTok Shop → หน้า "สินค้าบนแพลตฟอร์ม" — /api/tiktok-shop/sync-products
 *  POST { brand_id, page_token?, run_started_at? }  (products.platforms.edit)
 *   → ต่ออายุกุญแจถ้าใกล้หมด → ค้นหาสินค้าทั้งร้านทีละ 50 (status=ALL) ต่อจาก page_token
 *   → รายละเอียดเฉพาะตัวที่ใหม่/แก้ไขตั้งแต่ดึงครั้งก่อน (เอารูปแรก + หมวด + ชื่อตัวเลือก) · ตัวที่ไม่เปลี่ยนใช้รูป/หมวดเดิม
 *   → บันทึก + จับคู่รหัสตรงด้วยของกลาง lib/platform-catalog-sync (ไม่ทับคู่เดิม · ไม่จับคู่ตัวที่กด "ไม่ต้องจับคู่")
 *   ← { next_page_token, done, complete, run_started_at, api_total, fetched, stop_reason, created, updated, … }
 *
 * ดึงหลายครั้งต่อกัน (หน้าเว็บเรียกต่อเองจนครบ) แบบเดียวกับ Lazada — TikTok ใช้ page_token แทน offset
 *   ครั้งแรกไม่ส่ง page_token → เริ่มรอบใหม่ · ครั้งต่อไปส่ง next_page_token + run_started_at เดิมกลับมา
 *   สินค้าที่ร้านลบแล้ว (DELETED — status=ALL ส่งมาด้วย) ไม่บันทึก แต่นับไว้ (skipped_so_far ส่งต่อข้ามครั้ง)
 *   จบครบ + บันทึกตั้งแต่เริ่มรอบ + ตัวที่ข้าม ≥ total_count → ตัวเดิมที่ไม่มาในรอบนี้ (รวมตัวที่ร้านลบ) = ติดป้าย "ไม่อยู่บนร้านแล้ว"
 * ⚠️ อ่านอย่างเดียว — ไม่แก้อะไรบนร้าน TikTok
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ttsSearchProducts, ttsGetProduct, ttsDetailExtras, ttsProductToCatalogItem, ttsErrorText, ttsIsRateLimit, type TtsCatalogItem, type TtsProductPage } from "@/lib/tiktok-shop";
import { markMissingSince, seenSince, upsertCatalogListings } from "@/lib/platform-catalog-sync";
import { getPlatformId, ttsTokenOrReason } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const PAGE = 50;
const TIME_BUDGET_MS = 30_000;      // ไม่เริ่มหน้าใหม่หลังจากนี้ (เหลือเวลาบันทึก · maxDuration 60)
const RUN_MAX_AGE_MS = 30 * 60_000;  // รอบดึงเก่ากว่านี้ = เริ่มรอบใหม่
const DETAIL_CONCURRENCY = 4;        // ขอรายละเอียดพร้อมกันทีละ 4 ตัว (กันโดนจำกัดความถี่)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** ลองซ้ำเมื่อโดนจำกัดความถี่ (รอ 1.2 / 2.4 วิ) · error อื่นโยนต่อทันที */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) { if (i >= 2 || !ttsIsRateLimit(e)) throw e; await sleep(1200 * (i + 1)); }
  }
}

type Prev = { update_time: number | null; image: string | null; category: string | null; labels: Record<string, string> };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string; page_token?: string | null; run_started_at?: string; skipped_so_far?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = (body.brand_id ?? "").trim();
  if (!brandId) return NextResponse.json({ error: "เลือกแบรนด์/ร้านก่อน (การเชื่อม TikTok Shop ผูกกับแบรนด์)" }, { status: 400 });
  const startToken = (body.page_token ?? "").trim() || null;
  const prevRun = Date.parse(body.run_started_at ?? "");
  const runOk = !!startToken && Number.isFinite(prevRun) && prevRun <= Date.now() && Date.now() - prevRun < RUN_MAX_AGE_MS;
  const runStartedAt = runOk ? new Date(prevRun).toISOString() : new Date().toISOString();
  const firstCall = !startToken;
  // สินค้าที่ร้านลบแล้ว (status DELETED) ไม่บันทึก — นับไว้เทียบยอด "ครบทั้งร้าน" (ยอดของ TikTok รวมตัวที่ลบด้วย) · ส่งต่อกันข้ามครั้ง
  const skippedPrev = startToken ? Math.max(0, Math.floor(Number(body.skipped_so_far) || 0)) : 0;
  let skippedDeleted = 0;

  const admin = supabaseAdmin();
  const ttId = await getPlatformId(admin, "tiktok");
  if (!ttId) return NextResponse.json({ error: "ยังไม่มีแพลตฟอร์ม TikTok ในระบบ" }, { status: 400 });
  const tok = await ttsTokenOrReason(admin, brandId, ttId, user?.id ?? null);
  if (!tok.ok) return NextResponse.json({ error: tok.reason }, { status: 400 });
  const shop = tok.meta.shops?.[0];
  if (!shop?.cipher) return NextResponse.json({ error: "ยังไม่รู้รหัสร้าน TikTok — ไปที่ บัญชีแพลตฟอร์ม › TikTok แล้วกด ตรวจการเชื่อมต่อ ก่อน" }, { status: 400 });

  const started = Date.now();
  const items: TtsCatalogItem[] = [];
  let token: string | null = startToken, apiTotal = 0, done = false, stopReason: string | null = null;
  let detailsFetched = 0, detailsFailed = 0, detailsReused = 0;
  let sample: Record<string, unknown> | null = null;

  while (Date.now() - started < TIME_BUDGET_MS) {
    let page: TtsProductPage;
    try { page = await withRetry(() => ttsSearchProducts(tok.accessToken, shop.cipher, { pageToken: token, pageSize: PAGE })); }
    catch (e) { stopReason = ttsErrorText(e); break; }
    if (page.total > 0) apiTotal = page.total;
    // status=ALL ของ TikTok รวม "ลบแล้ว" มาด้วย (เจอจริง 2026-11-12: 71/898) → ข้าม · ตัวเดิมในระบบจะติดป้าย "ไม่อยู่บนร้านแล้ว" ตอนจบรอบครบ (เหมือน Lazada)
    const live = page.products.filter((p) => String(p.status ?? "").toUpperCase() !== "DELETED");
    skippedDeleted += page.products.length - live.length;

    // รูป/หมวด/ชื่อตัวเลือกเดิม (ตัวที่ไม่ได้แก้ตั้งแต่ครั้งก่อน ไม่ต้องขอรายละเอียดซ้ำ)
    const ids = live.map((p) => String(p.id ?? "")).filter(Boolean);
    const prev = new Map<string, Prev>();
    if (ids.length) {
      const { data } = await admin.from("platform_catalog_listings").select("external_product_id, tt:raw->tiktok")
        .eq("platform_id", ttId).eq("brand_id", brandId).in("external_product_id", ids);
      for (const r of (data ?? []) as { external_product_id: string; tt: { update_time?: number | null; image?: string | null; category?: string | null; skus?: { id?: string | null; label?: string }[] } | null }[]) {
        if (!r.tt) continue;
        const labels: Record<string, string> = {};
        for (const s of r.tt.skus ?? []) if (s.id && s.label) labels[s.id] = s.label;
        prev.set(r.external_product_id, { update_time: r.tt.update_time ?? null, image: r.tt.image ?? null, category: r.tt.category ?? null, labels });
      }
    }

    const need = live.filter((p) => {
      const old = prev.get(String(p.id ?? ""));
      return !old || !old.image || old.update_time == null || Number(p.update_time) !== old.update_time;
    });
    const details = new Map<string, Record<string, unknown> | null>();
    for (let i = 0; i < need.length; i += DETAIL_CONCURRENCY) {
      await Promise.all(need.slice(i, i + DETAIL_CONCURRENCY).map(async (p) => {
        const id = String(p.id ?? "");
        try { details.set(id, await withRetry(() => ttsGetProduct(tok.accessToken, shop.cipher, id))); detailsFetched++; }
        catch { details.set(id, null); detailsFailed++; }   // ขอรายละเอียดไม่ได้ → ยังบันทึกข้อมูลหลักได้ (รูป/หมวดใช้ของเดิม)
      }));
    }

    for (const p of live) {
      const id = String(p.id ?? "");
      const d = details.get(id);
      const old = prev.get(id);
      let extras: { image: string | null; category: string | null; labels: Map<string, string> } | null = null;
      if (d) extras = ttsDetailExtras(d);
      else if (old) { extras = { image: old.image, category: old.category, labels: new Map(Object.entries(old.labels)) }; if (!details.has(id)) detailsReused++; }
      const it = ttsProductToCatalogItem(p, extras);
      if (it) items.push(it);
      // ตัวอย่างคำตอบจริง 1 ตัว (ตัดให้สั้น) เก็บใน audit ครั้งแรก — ไว้ยืนยันรูปข้อมูลกับเอกสาร
      if (!sample && firstCall) {
        const sk = Array.isArray(p.skus) ? (p.skus as unknown[])[0] : null;
        sample = { product_keys: Object.keys(p), sku0: sk, status: p.status, detail_keys: d ? Object.keys(d) : null, detail_image0: d ? (d.main_images as unknown[] | undefined)?.[0] ?? null : null, detail_cat: d ? d.category_chains ?? null : null };
      }
    }

    token = page.nextPageToken;
    if (!token || page.products.length === 0) { done = true; break; }
  }

  if (items.length === 0 && stopReason) {
    return NextResponse.json({ error: `อ่านสินค้าจาก TikTok ไม่สำเร็จ: ${stopReason}`, next_page_token: startToken, run_started_at: runStartedAt }, { status: 400 });
  }

  let saved;
  try { saved = await upsertCatalogListings(admin, { platformId: ttId, brandId, source: "api", items }); }
  catch (e) { return NextResponse.json({ error: `บันทึกไม่สำเร็จ: ${(e as Error).message}`, next_page_token: startToken, run_started_at: runStartedAt }, { status: 400 }); }

  let seen = 0, complete = false, gone = { removed: 0, removed_skipped: 0 };
  if (done) {
    try {
      seen = await seenSince(admin, { platformId: ttId, brandId, since: runStartedAt });
      complete = apiTotal > 0 && seen + skippedPrev + skippedDeleted >= apiTotal;
      if (complete) gone = await markMissingSince(admin, { platformId: ttId, brandId, since: runStartedAt });
    } catch (e) { stopReason = `เช็กสินค้าที่ร้านลบไม่สำเร็จ: ${(e as Error).message}`; }
  }

  const result = {
    api_total: apiTotal, fetched: items.length, next_page_token: done ? null : token,
    done, complete, seen_in_run: seen, run_started_at: runStartedAt, stop_reason: stopReason,
    details_fetched: detailsFetched, details_reused: detailsReused, details_failed: detailsFailed,
    skipped_deleted: skippedDeleted, skipped_so_far: skippedPrev + skippedDeleted,
    ...saved, ...gone,
  };
  await writeAudit(admin, {
    action: "import", entityType: "platform_catalog", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "tiktok_api", brand_id: brandId, shop: shop.name, ...result, ...(sample ? { sample } : {}) },
  });
  return NextResponse.json({ ok: true, partial: !done, ...result, error: null });
}
