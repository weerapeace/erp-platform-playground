// ตัวกลางดึงออเดอร์ TikTok → platform_orders (ใช้ร่วม: ปุ่ม /api/tiktok-shop/sync-orders + ตัวดึงอัตโนมัติ /api/cron/tiktok-orders)
// แยกจาก route.ts (route ต้อง export แค่ handler)
// ใบใหม่ = เพิ่มหัว + รายการ (จับคู่รหัส SKU) · ใบเดิม = อัปเดตตามร้าน (ไม่แตะรายการ) · source "tiktok_api" = สถานะตามร้าน (isShopManaged)
// ไม่เก็บที่อยู่/เบอร์ผู้รับ · ⚠️ อ่านอย่างเดียว ไม่แก้อะไรบนร้าน
import type { SupabaseClient } from "@supabase/supabase-js";
import { tiktokToInternal } from "@/lib/platform-order-status";
import { ttsSearchOrders, ttsOrderToPlatformOrder, ttsErrorText, ttsIsRateLimit, type TtsOrderMapped, type TtsOrderPage, type TtsShop } from "@/lib/tiktok-shop";

export const TTS_ORDER_SOURCE = "tiktok_api";
const PAGE = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) { if (i >= 2 || !ttsIsRateLimit(e)) throw e; await sleep(1200 * (i + 1)); }
  }
}

export type TtsOrderSyncResult = {
  api_total: number; fetched: number; created: number; updated: number; items_created: number; items_matched: number;
  next_page_token: string | null; done: boolean; stop_reason: string | null; sample: Record<string, unknown> | null;
};

/**
 * ดึงออเดอร์ทีละหน้าจนครบหรือหมดเวลา
 * window: createTimeGe (สร้างตั้งแต่) หรือ updateTimeGe (เปลี่ยนสถานะตั้งแต่) — unix วินาที
 */
export async function syncTiktokOrders(admin: SupabaseClient, args: {
  platformId: string; brandId: string; accessToken: string; shop: TtsShop;
  window: { createTimeGe?: number; updateTimeGe?: number }; pageToken?: string | null; timeBudgetMs: number; withSample?: boolean;
}): Promise<TtsOrderSyncResult> {
  const { platformId, brandId, accessToken, shop } = args;
  const started = Date.now();
  let token: string | null = args.pageToken ?? null, apiTotal = 0, done = false, stopReason: string | null = null;
  let fetched = 0, created = 0, updated = 0, itemsCreated = 0, itemsMatched = 0;
  let sample: Record<string, unknown> | null = null;

  while (Date.now() - started < args.timeBudgetMs) {
    let page: TtsOrderPage;
    try { page = await withRetry(() => ttsSearchOrders(accessToken, shop.cipher, { ...args.window, pageToken: token, pageSize: PAGE })); }
    catch (e) { stopReason = ttsErrorText(e); break; }
    if (page.total > 0) apiTotal = page.total;
    if (args.withSample && !sample && page.orders[0]) {
      // ตัวอย่างรูปข้อมูลจริง (ไม่เก็บที่อยู่ผู้รับ) — ไว้ยืนยันกับเอกสาร
      const o = page.orders[0];
      const li = Array.isArray(o.line_items) ? (o.line_items as Record<string, unknown>[])[0] : null;
      sample = { order_keys: Object.keys(o), status: o.status, payment: o.payment, line_item0: li ? { ...li, sku_image: undefined } : null, line_items_n: Array.isArray(o.line_items) ? (o.line_items as unknown[]).length : 0 };
    }

    const mapped = page.orders.map((o) => ttsOrderToPlatformOrder(o, tiktokToInternal)).filter((m): m is TtsOrderMapped => !!m);
    if (mapped.length) {
      const ids = mapped.map((m) => m.external_order_id);
      const { data: exist, error: exErr } = await admin.from("platform_orders").select("external_order_id").eq("platform_id", platformId).in("external_order_id", ids);
      if (exErr) { stopReason = `อ่านออเดอร์เดิมไม่สำเร็จ: ${exErr.message}`; break; }
      const had = new Set(((exist ?? []) as { external_order_id: string }[]).map((r) => r.external_order_id));
      const now = new Date().toISOString();
      // หัวออเดอร์: ใบใหม่ + ใบเดิม ในคำสั่งเดียว (ใบเดิม = อัปเดตตามร้าน)
      const rows = mapped.map((m) => ({ platform_id: platformId, brand_id: brandId, source: TTS_ORDER_SOURCE, external_order_id: m.external_order_id, ...m.head, updated_at: now }));
      const { data: up, error: upErr } = await admin.from("platform_orders").upsert(rows, { onConflict: "platform_id,external_order_id" }).select("id, external_order_id");
      if (upErr) { stopReason = `บันทึกออเดอร์ไม่สำเร็จ: ${upErr.message}`; break; }
      fetched += mapped.length;   // นับเฉพาะที่บันทึกได้จริง
      const idOf = new Map(((up ?? []) as { id: string; external_order_id: string }[]).map((r) => [r.external_order_id, r.id]));
      const fresh = mapped.filter((m) => !had.has(m.external_order_id));
      created += fresh.length; updated += mapped.length - fresh.length;

      // รายการสินค้าเฉพาะใบใหม่ · จับคู่รหัสร้าน = รหัส SKU ลูกในระบบ
      const codes = [...new Set(fresh.flatMap((m) => m.items.map((i) => i.sku_code)).filter((c): c is string => !!c))];
      const skuBy = new Map<string, { id: string; parent_sku_id: string | null }>();
      for (let i = 0; i < codes.length; i += 200) {
        const { data: sk } = await admin.from("skus_v2").select("id, code, parent_sku_id").in("code", codes.slice(i, i + 200));
        for (const s of (sk ?? []) as { id: string; code: string; parent_sku_id: string | null }[]) skuBy.set(s.code, { id: s.id, parent_sku_id: s.parent_sku_id });
      }
      const itemRows = fresh.flatMap((m) => {
        const orderId = idOf.get(m.external_order_id);
        if (!orderId) return [];
        return m.items.map((it) => {
          const s = it.sku_code ? skuBy.get(it.sku_code) : undefined;
          if (s) itemsMatched++;
          return { order_id: orderId, sku_code: it.sku_code, matched_sku_id: s?.id ?? null, matched_parent_sku_id: s?.parent_sku_id ?? null, name: it.name, qty: it.qty, price: it.price, raw: { source: TTS_ORDER_SOURCE, sku_id: it.sku_id, variant: it.variant } };
        });
      });
      for (let i = 0; i < itemRows.length; i += 200) {
        const { error: itErr } = await admin.from("platform_order_items").insert(itemRows.slice(i, i + 200));
        if (itErr) { stopReason = `บันทึกรายการสินค้าไม่สำเร็จ: ${itErr.message}`; break; }
        itemsCreated += Math.min(200, itemRows.length - i);
      }
      if (stopReason) break;
    }

    token = page.nextPageToken;
    if (!token || page.orders.length === 0) { done = true; break; }
  }
  return { api_total: apiTotal, fetched, created, updated, items_created: itemsCreated, items_matched: itemsMatched, next_page_token: done ? null : token, done, stop_reason: stopReason, sample };
}
