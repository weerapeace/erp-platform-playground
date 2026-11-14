// ตัวกลางดึงออเดอร์ Shopee → platform_orders (ใช้ร่วม: ปุ่ม /api/shopee/sync-orders + ตัวดึงอัตโนมัติใน /api/cron/tiktok-orders)
// แยกจาก route.ts (route ต้อง export แค่ handler) · ล้อ app/api/tiktok-shop/orders-sync.ts
//
// เจ้าของเลือก 2026-11-14: "ไม่ต้องดึงจากเมลแล้ว — ออเดอร์จาก Shopee ตรงกว่า"
//   ใบใหม่ = เพิ่มหัว + รายการ (จับคู่รหัส SKU) · ใบเดิม (รวมใบที่มาจากเมล — เลขออเดอร์เดียวกัน) = อัปเดตตามร้าน
//   → source เป็น "shopee_api" (สถานะตามร้าน · isShopManaged) · รายการสินค้าเดิม (จับคู่/ยืนยันไว้จากเมล) ไม่แตะ · ใบที่ยังไม่มีรายการ = เติมจาก Shopee
//   raw เดิม (raw.email) เก็บไว้ + เพิ่ม raw.shopee · ใบที่ตัดสต๊อกไปแล้ว (stock_deducted) ไม่เปลี่ยนที่มา/สถานะในระบบ แค่อัปเดตสถานะบนร้าน
// ไม่เก็บที่อยู่/เบอร์ผู้รับ (PII ปิด) · ⚠️ อ่านอย่างเดียว ไม่แก้อะไรบนร้าน
import type { SupabaseClient } from "@supabase/supabase-js";
import { shopeeToInternal } from "@/lib/platform-order-status";
import { shopeeErrorText, shopeeGetOrderDetail, shopeeGetOrderList, shopeeIsRateLimit, shopeeOrderToPlatformOrder, type ShopeeOrderMapped } from "@/lib/shopee";

export const SHOPEE_ORDER_SOURCE = "shopee_api";
const PAGE = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) { if (i >= 2 || !shopeeIsRateLimit(e)) throw e; await sleep(1500 * (i + 1)); }
  }
}

export type ShopeeOrderSyncResult = {
  fetched: number; created: number; updated: number; from_email: number; items_created: number; items_matched: number;
  next_cursor: string | null; done: boolean; stop_reason: string | null; sample: Record<string, unknown> | null;
};

type ExistRow = { id: string; external_order_id: string; source: string | null; status: string; stock_deducted: boolean | null; raw: Record<string, unknown> | null };

/**
 * ดึงออเดอร์ 1 ช่วงเวลา (≤ 15 วัน) ทีละหน้าจนครบหรือหมดเวลา
 * window.field: create_time (ดึงย้อนหลัง) / update_time (ตัวดึงอัตโนมัติ — เฉพาะที่เปลี่ยนสถานะ)
 */
export async function syncShopeeOrders(admin: SupabaseClient, args: {
  platformId: string; brandId: string; accessToken: string; shopId: string;
  window: { field: "create_time" | "update_time"; from: number; to: number }; cursor?: string | null; timeBudgetMs: number; withSample?: boolean;
}): Promise<ShopeeOrderSyncResult> {
  const { platformId, brandId, accessToken, shopId } = args;
  const started = Date.now();
  let cursor = args.cursor ?? "", done = false, stopReason: string | null = null;
  let fetched = 0, created = 0, updated = 0, fromEmail = 0, itemsCreated = 0, itemsMatched = 0;
  let sample: Record<string, unknown> | null = null;

  while (Date.now() - started < args.timeBudgetMs) {
    // 1) รายการเลขออเดอร์ในช่วงนี้ (≤100) → 2) รายละเอียดทีละ 50
    let page;
    try { page = await withRetry(() => shopeeGetOrderList(accessToken, shopId, { ...args.window, cursor, pageSize: PAGE })); }
    catch (e) { stopReason = shopeeErrorText(e); break; }
    const sns = page.orders.map((o) => o.order_sn);
    const details: Record<string, unknown>[] = [];
    try {
      for (let i = 0; i < sns.length; i += 50) details.push(...await withRetry(() => shopeeGetOrderDetail(accessToken, shopId, sns.slice(i, i + 50))));
    } catch (e) { stopReason = shopeeErrorText(e); break; }
    if (args.withSample && !sample && details[0]) {
      // ตัวอย่างรูปข้อมูลจริง (ไม่มีที่อยู่ผู้รับ — ไม่ได้ขอ) ไว้ยืนยันตัวแปลง
      const d = details[0];
      const li = Array.isArray(d.item_list) ? (d.item_list as Record<string, unknown>[])[0] : null;
      sample = { order_keys: Object.keys(d), order_status: d.order_status, cod: d.cod, total_amount: d.total_amount, ship_by_date: d.ship_by_date, package0: Array.isArray(d.package_list) ? (d.package_list as unknown[])[0] : null, item0: li ? { ...li, image_info: undefined } : null, items_n: Array.isArray(d.item_list) ? (d.item_list as unknown[]).length : 0 };
    }

    const mapped = details.map((d) => shopeeOrderToPlatformOrder(d, shopeeToInternal)).filter((m): m is ShopeeOrderMapped => !!m);
    if (mapped.length) {
      const ids = mapped.map((m) => m.external_order_id);
      const { data: exist, error: exErr } = await admin.from("platform_orders").select("id, external_order_id, source, status, stock_deducted, raw").eq("platform_id", platformId).in("external_order_id", ids);
      if (exErr) { stopReason = `อ่านออเดอร์เดิมไม่สำเร็จ: ${exErr.message}`; break; }
      const had = new Map(((exist ?? []) as ExistRow[]).map((r) => [r.external_order_id, r]));
      // ใบเดิมที่มีรายการสินค้าแล้ว (ไม่เติมซ้ำ)
      const hadIds = [...had.values()].map((r) => r.id);
      const withItems = new Set<string>();
      for (let i = 0; i < hadIds.length; i += 200) {
        const { data: it } = await admin.from("platform_order_items").select("order_id").in("order_id", hadIds.slice(i, i + 200));
        for (const r of (it ?? []) as { order_id: string }[]) withItems.add(r.order_id);
      }
      const now = new Date().toISOString();
      const rows = mapped.map((m) => {
        const prev = had.get(m.external_order_id);
        const raw = { ...(prev?.raw ?? {}), ...m.head.raw };
        // ใบที่ตัดสต๊อกแล้ว (มีคนกดยืนยันใน ERP) — คงที่มา/สถานะในระบบไว้ ให้คนจัดการต่อ · อัปเดตแค่สถานะบนร้าน
        if (prev?.stock_deducted) return { platform_id: platformId, brand_id: brandId, source: prev.source ?? SHOPEE_ORDER_SOURCE, external_order_id: m.external_order_id, ...m.head, status: prev.status, raw, updated_at: now };
        return { platform_id: platformId, brand_id: brandId, source: SHOPEE_ORDER_SOURCE, external_order_id: m.external_order_id, ...m.head, raw, updated_at: now };
      });
      const { data: up, error: upErr } = await admin.from("platform_orders").upsert(rows, { onConflict: "platform_id,external_order_id" }).select("id, external_order_id");
      if (upErr) { stopReason = `บันทึกออเดอร์ไม่สำเร็จ: ${upErr.message}`; break; }
      fetched += mapped.length;
      const idOf = new Map(((up ?? []) as { id: string; external_order_id: string }[]).map((r) => [r.external_order_id, r.id]));
      for (const m of mapped) {
        const prev = had.get(m.external_order_id);
        if (!prev) created++; else { updated++; if (prev.source === "email") fromEmail++; }
      }

      // รายการสินค้า: ใบใหม่ + ใบเดิมที่ยังไม่มีรายการ · จับคู่รหัสร้าน (model_sku) = รหัส SKU ลูกในระบบ
      const needItems = mapped.filter((m) => { const prev = had.get(m.external_order_id); return !prev || !withItems.has(prev.id); });
      const codes = [...new Set(needItems.flatMap((m) => m.items.map((i) => i.sku_code)).filter((c): c is string => !!c))];
      const skuBy = new Map<string, { id: string; parent_sku_id: string | null }>();
      for (let i = 0; i < codes.length; i += 200) {
        const { data: sk } = await admin.from("skus_v2").select("id, code, parent_sku_id").in("code", codes.slice(i, i + 200));
        for (const s of (sk ?? []) as { id: string; code: string; parent_sku_id: string | null }[]) skuBy.set(s.code, { id: s.id, parent_sku_id: s.parent_sku_id });
      }
      const itemRows = needItems.flatMap((m) => {
        const orderId = idOf.get(m.external_order_id);
        if (!orderId) return [];
        return m.items.map((it) => {
          const s = it.sku_code ? skuBy.get(it.sku_code) : undefined;
          if (s) itemsMatched++;
          return { order_id: orderId, sku_code: it.sku_code, matched_sku_id: s?.id ?? null, matched_parent_sku_id: s?.parent_sku_id ?? null, name: it.name, qty: it.qty, price: it.price, raw: { source: SHOPEE_ORDER_SOURCE, item_id: it.item_id, model_id: it.model_id, variant: it.variant } };
        });
      });
      for (let i = 0; i < itemRows.length; i += 200) {
        const { error: itErr } = await admin.from("platform_order_items").insert(itemRows.slice(i, i + 200));
        if (itErr) { stopReason = `บันทึกรายการสินค้าไม่สำเร็จ: ${itErr.message}`; break; }
        itemsCreated += Math.min(200, itemRows.length - i);
      }
      if (stopReason) break;
    }

    if (!page.more || !page.nextCursor || page.orders.length === 0) { done = true; break; }
    cursor = page.nextCursor;
  }
  return { fetched, created, updated, from_email: fromEmail, items_created: itemsCreated, items_matched: itemsMatched, next_cursor: done ? null : cursor, done, stop_reason: stopReason, sample };
}

/** แบรนด์ที่เชื่อม Shopee อยู่ (stage connected) — ตัวดึงอัตโนมัติ + ปุ่มที่ไม่เลือกแบรนด์ */
export async function shopeeConnectedBrandIds(admin: SupabaseClient, platformId: string): Promise<string[]> {
  const { data } = await admin.from("platform_credentials").select("brand_id, meta").eq("platform_id", platformId);
  return ((data ?? []) as { brand_id: string; meta: { stage?: string } | null }[]).filter((r) => r.meta?.stage === "connected").map((r) => r.brand_id);
}
