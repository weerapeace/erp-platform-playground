/**
 * ดึงสินค้า TikTok "เฉพาะตัวที่เปลี่ยน" (ไม่ใช่ route · import ได้) — ใช้กับตัวดึงอัตโนมัติเป็นรอบ (cron tiktok-orders เรียกต่อท้าย ทุก 15 นาที)
 * เจ้าของเลือก (2026-11-13 "ตามแนะนำเลย"): กดเปิดขาย/เผยแพร่ใน Seller Center แล้ว ERP เปลี่ยนสถานะให้เอง (ภายในรอบถัดไป)
 *
 *   Search Products 202502 (status ALL + update_time_ge) → ข้ามตัวที่ลบแล้ว → รายละเอียดเฉพาะตัวที่เปลี่ยน (รูป/หมวด/ชื่อตัวเลือก · มีเพดาน)
 *   → ttsProductToCatalogItem (ตัวแปลงเดียวกับปุ่มดึงสินค้า) → upsertCatalogListings
 * ไม่ติดป้าย "ไม่อยู่บนร้านแล้ว" (ทำได้เฉพาะรอบดึงครบทั้งร้าน — ปุ่มดึงสินค้า) · อ่านอย่างเดียว ไม่แก้อะไรบนร้าน
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ttsDetailExtras, ttsErrorText, ttsProductToCatalogItem, ttsSearchProducts, type TtsCatalogItem } from "@/lib/tiktok-shop";
import { upsertCatalogListings } from "@/lib/platform-catalog-sync";
import { ttsGetProductRetry } from "./shared";

const PAGE = 50;
const MAX_DETAILS = 40;
const DETAIL_CONCURRENCY = 3;

export type TtsProductsSyncResult = { fetched: number; saved: number; details: number; skipped_deleted: number; stop_reason: string | null };

export async function syncTiktokProductsChanged(admin: SupabaseClient, opts: {
  platformId: string; brandId: string; accessToken: string; cipher: string; updateTimeGe: number; timeBudgetMs?: number;
}): Promise<TtsProductsSyncResult> {
  const started = Date.now();
  const budget = opts.timeBudgetMs ?? 30_000;
  const live: Record<string, unknown>[] = [];
  let token: string | null = null; let skipped = 0; let stop: string | null = null;
  while (Date.now() - started < budget) {
    try {
      const page = await ttsSearchProducts(opts.accessToken, opts.cipher, { pageToken: token, pageSize: PAGE, updateTimeGe: opts.updateTimeGe });
      const keep = page.products.filter((p) => String(p.status ?? "").toUpperCase() !== "DELETED");
      skipped += page.products.length - keep.length;
      live.push(...keep);
      token = page.nextPageToken;
      if (!token || page.products.length === 0) break;
    } catch (e) { stop = ttsErrorText(e); break; }
  }
  if (!live.length) return { fetched: 0, saved: 0, details: 0, skipped_deleted: skipped, stop_reason: stop };

  // รูป/หมวด/ชื่อตัวเลือกเดิม — ตัวที่ขอรายละเอียดไม่ทัน/ไม่ได้ ใช้ของเดิม
  const ids = live.map((p) => String(p.id ?? "")).filter(Boolean);
  const prev = new Map<string, { image: string | null; category: string | null; labels: Map<string, string> }>();
  {
    const { data } = await admin.from("platform_catalog_listings").select("external_product_id, tt:raw->tiktok")
      .eq("platform_id", opts.platformId).eq("brand_id", opts.brandId).in("external_product_id", ids);
    for (const r of (data ?? []) as { external_product_id: string; tt: { image?: string | null; category?: string | null; skus?: { id?: string | null; label?: string }[] } | null }[]) {
      if (!r.tt) continue;
      const labels = new Map<string, string>();
      for (const s of r.tt.skus ?? []) if (s.id && s.label) labels.set(s.id, s.label);
      prev.set(r.external_product_id, { image: r.tt.image ?? null, category: r.tt.category ?? null, labels });
    }
  }
  const details = new Map<string, Record<string, unknown> | null>();
  const need = ids.slice(0, MAX_DETAILS);
  for (let i = 0; i < need.length && Date.now() - started < budget + 15_000; i += DETAIL_CONCURRENCY) {
    await Promise.all(need.slice(i, i + DETAIL_CONCURRENCY).map(async (id) => {
      try { details.set(id, await ttsGetProductRetry(opts.accessToken, opts.cipher, id)); } catch { details.set(id, null); }
    }));
  }
  const items: TtsCatalogItem[] = [];
  for (const p of live) {
    const id = String(p.id ?? "");
    const d = details.get(id);
    const extras = d ? ttsDetailExtras(d) : prev.get(id) ?? null;
    const it = ttsProductToCatalogItem(p, extras);
    if (it) items.push(it);
  }
  try {
    await upsertCatalogListings(admin, { platformId: opts.platformId, brandId: opts.brandId, source: "api", items });
  } catch (e) { return { fetched: live.length, saved: 0, details: details.size, skipped_deleted: skipped, stop_reason: `บันทึกไม่สำเร็จ: ${(e as Error).message}` }; }
  return { fetched: live.length, saved: items.length, details: [...details.values()].filter(Boolean).length, skipped_deleted: skipped, stop_reason: stop };
}
