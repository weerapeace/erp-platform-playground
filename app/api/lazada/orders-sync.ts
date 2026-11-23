// ตัวกลางดึงออเดอร์ Lazada → platform_orders (ใช้ร่วม: ตัวดึงอัตโนมัติ /api/cron/tiktok-orders ทุก 15 นาที + ปุ่ม "ดึงตอนนี้" หน้าสถานะดึงออเดอร์)
// ล้อ app/api/shopee/orders-sync.ts · เจ้าของเลือก 2026-11-20 (widget หน้าสถานะดึงออเดอร์ ข้อ 1)
//
//   ใบใหม่ = เพิ่มหัว + รายการ (จับคู่รหัสร้าน = รหัส SKU) · ใบเดิม (รวมใบที่มาจากเมล — เลขออเดอร์เดียวกัน) = อัปเดตตามร้าน → source "lazada_api"
//   รายการสินค้า: ใบเดิมที่ยังไม่มีรายการ = เติม · ใบที่รายการมาจากเมลล้วน (ไม่รู้ราคา/สี) และยังไม่ตัดสต๊อก/ยังไม่แพ็ก = แทนด้วยรายการจาก Lazada
//   ใบที่ตัดสต๊อกไปแล้ว (stock_deducted) ไม่เปลี่ยนที่มา/สถานะในระบบ แค่อัปเดตสถานะบนร้าน
//   เมล Lazada ยังทำงานต่อเป็นทางสำรอง (ถ้าตัวนี้ล้ม ออเดอร์ยังเข้าทางเมล) — เมลไม่ทับใบที่มีรายการแล้ว
// ไม่เก็บที่อยู่/เบอร์ผู้รับ · ⚠️ อ่านอย่างเดียว ไม่แก้อะไรบนร้าน
import type { SupabaseClient } from "@supabase/supabase-js";
import { lazErrorText, lazGetOrderItems, lazGetOrders, type LazGateway } from "@/lib/lazada";
import { lazOrderToPlatformOrder, type LazOrderMapped } from "@/lib/lazada-orders";
import { lazWithRetry, listLazCredRows } from "./shared";

export const LAZADA_ORDER_SOURCE = "lazada_api";
const PAGE = 100;

export type LazOrderSyncResult = {
  fetched: number; created: number; updated: number; from_email: number; items_created: number; items_matched: number; items_replaced: number;
  done: boolean; stop_reason: string | null;
};

type ExistRow = { id: string; external_order_id: string; source: string | null; status: string; stock_deducted: boolean | null; packed_at: string | null; raw: Record<string, unknown> | null };

/** แบรนด์ที่เชื่อม Lazada อยู่ (stage connected) */
export async function lazadaConnectedBrandIds(admin: SupabaseClient, platformId: string): Promise<string[]> {
  return (await listLazCredRows(admin, platformId)).filter((r) => r.meta?.stage === "connected").map((r) => r.brand_id);
}

/**
 * ดึงออเดอร์ที่เปลี่ยนสถานะหลัง updatedAfter (หรือสร้างหลัง createdAfter) ทีละหน้าจนครบหรือหมดเวลา
 */
export async function syncLazadaOrders(admin: SupabaseClient, args: {
  platformId: string; brandId: string; accessToken: string; gateway: LazGateway;
  window: { updatedAfter?: string; createdAfter?: string }; timeBudgetMs: number;
}): Promise<LazOrderSyncResult> {
  const { platformId, brandId, accessToken, gateway } = args;
  const started = Date.now();
  let offset = 0, done = false, stopReason: string | null = null;
  let fetched = 0, created = 0, updated = 0, fromEmail = 0, itemsCreated = 0, itemsMatched = 0, itemsReplaced = 0;

  while (Date.now() - started < args.timeBudgetMs) {
    let page: { orders: Record<string, unknown>[]; total: number };
    try { page = await lazWithRetry(() => lazGetOrders(gateway, accessToken, { ...args.window, limit: PAGE, offset }), "orders/get"); }
    catch (e) { stopReason = lazErrorText(e); break; }
    if (!page.orders.length) { done = true; break; }

    const oids = page.orders.map((o) => String(o.order_id ?? "")).filter(Boolean);
    const itemsBy: Record<string, Record<string, unknown>[]> = {};
    try {
      for (let i = 0; i < oids.length; i += 50) Object.assign(itemsBy, await lazWithRetry(() => lazGetOrderItems(gateway, accessToken, oids.slice(i, i + 50)), "orders/items/get"));
    } catch (e) { stopReason = `อ่านรายการสินค้าไม่สำเร็จ: ${lazErrorText(e)}`; break; }

    const mapped = page.orders.map((o) => lazOrderToPlatformOrder(o, itemsBy[String(o.order_id ?? "")])).filter((m): m is LazOrderMapped => !!m);
    if (mapped.length) {
      const ids = mapped.map((m) => m.external_order_id);
      const { data: exist, error: exErr } = await admin.from("platform_orders").select("id, external_order_id, source, status, stock_deducted, packed_at, raw").eq("platform_id", platformId).in("external_order_id", ids);
      if (exErr) { stopReason = `อ่านออเดอร์เดิมไม่สำเร็จ: ${exErr.message}`; break; }
      const had = new Map(((exist ?? []) as ExistRow[]).map((r) => [r.external_order_id, r]));
      // รายการเดิมของใบที่มีอยู่แล้ว: ไม่มีเลย / มาจากเมลล้วน
      const hadIds = [...had.values()].map((r) => r.id);
      const itemSrc = new Map<string, { n: number; email: number }>();
      for (let i = 0; i < hadIds.length; i += 200) {
        const { data: it } = await admin.from("platform_order_items").select("order_id, raw").in("order_id", hadIds.slice(i, i + 200));
        for (const r of (it ?? []) as { order_id: string; raw: { source?: string } | null }[]) {
          const c = itemSrc.get(r.order_id) ?? { n: 0, email: 0 };
          c.n++; if (r.raw?.source === "email") c.email++;
          itemSrc.set(r.order_id, c);
        }
      }
      const now = new Date().toISOString();
      const rows = mapped.map((m) => {
        const prev = had.get(m.external_order_id);
        const raw = { ...(prev?.raw ?? {}), ...m.head.raw };
        if (prev?.stock_deducted) return { platform_id: platformId, brand_id: brandId, source: prev.source ?? LAZADA_ORDER_SOURCE, external_order_id: m.external_order_id, ...m.head, status: prev.status, raw, updated_at: now };
        return { platform_id: platformId, brand_id: brandId, source: LAZADA_ORDER_SOURCE, external_order_id: m.external_order_id, ...m.head, raw, updated_at: now };
      });
      const { data: up, error: upErr } = await admin.from("platform_orders").upsert(rows, { onConflict: "platform_id,external_order_id" }).select("id, external_order_id");
      if (upErr) { stopReason = `บันทึกออเดอร์ไม่สำเร็จ: ${upErr.message}`; break; }
      fetched += mapped.length;
      const idOf = new Map(((up ?? []) as { id: string; external_order_id: string }[]).map((r) => [r.external_order_id, r.id]));
      for (const m of mapped) {
        const prev = had.get(m.external_order_id);
        if (!prev) created++; else { updated++; if (prev.source === "email") fromEmail++; }
      }

      // จับคู่รหัสร้าน (sku) = รหัส SKU ลูกในระบบ
      const codes = [...new Set(mapped.flatMap((m) => m.items.map((i) => i.sku_code)).filter((c): c is string => !!c))];
      const skuBy = new Map<string, { id: string; parent_sku_id: string | null }>();
      for (let i = 0; i < codes.length; i += 200) {
        const { data: sk } = await admin.from("skus_v2").select("id, code, parent_sku_id").in("code", codes.slice(i, i + 200));
        for (const s of (sk ?? []) as { id: string; code: string; parent_sku_id: string | null }[]) skuBy.set(s.code, { id: s.id, parent_sku_id: s.parent_sku_id });
      }
      // ใบที่ต้องใส่รายการ: ใหม่ · เดิมไม่มีรายการ · เดิมรายการจากเมลล้วน (ยังไม่ตัดสต๊อก/ยังไม่แพ็ก) และรายการ Lazada จับคู่ SKU ได้ครบ = แทนที่
      //   (จับคู่ไม่ครบ = คงรายการจากเมลไว้ — เมลอาจมีคนยืนยันรุ่นไว้แล้ว ไม่ให้การจับคู่แย่ลง)
      const replaceIds: string[] = [];
      const needItems = mapped.filter((m) => {
        if (!m.items.length) return false;
        const prev = had.get(m.external_order_id);
        if (!prev) return true;
        const c = itemSrc.get(prev.id);
        if (!c || c.n === 0) return true;
        const allMatched = m.items.every((i) => !!i.sku_code && skuBy.has(i.sku_code));
        if (c.email === c.n && allMatched && !prev.stock_deducted && !prev.packed_at) { replaceIds.push(prev.id); return true; }
        return false;
      });
      if (replaceIds.length) {
        const { error: delErr } = await admin.from("platform_order_items").delete().in("order_id", replaceIds);
        if (delErr) { stopReason = `แทนรายการจากเมลไม่สำเร็จ: ${delErr.message}`; break; }
        itemsReplaced += replaceIds.length;
      }
      const itemRows = needItems.flatMap((m) => {
        const orderId = idOf.get(m.external_order_id);
        if (!orderId) return [];
        return m.items.map((it) => {
          const s = it.sku_code ? skuBy.get(it.sku_code) : undefined;
          if (s) itemsMatched++;
          return { order_id: orderId, sku_code: it.sku_code, matched_sku_id: s?.id ?? null, matched_parent_sku_id: s?.parent_sku_id ?? null, name: it.name, qty: it.qty, price: it.price, raw: { source: LAZADA_ORDER_SOURCE, shop_sku: it.shop_sku, variant: it.variant, order_item_ids: it.order_item_ids, original_price: it.original_price ?? null, paid_price: it.paid_price ?? null } };
        });
      });
      for (let i = 0; i < itemRows.length; i += 200) {
        const { error: itErr } = await admin.from("platform_order_items").insert(itemRows.slice(i, i + 200));
        if (itErr) { stopReason = `บันทึกรายการสินค้าไม่สำเร็จ: ${itErr.message}`; break; }
        itemsCreated += Math.min(200, itemRows.length - i);
      }
      if (stopReason) break;
    }

    offset += page.orders.length;
    if (page.orders.length < PAGE || (page.total > 0 && offset >= page.total)) { done = true; break; }
  }
  return { fetched, created, updated, from_email: fromEmail, items_created: itemsCreated, items_matched: itemsMatched, items_replaced: itemsReplaced, done, stop_reason: stopReason };
}
