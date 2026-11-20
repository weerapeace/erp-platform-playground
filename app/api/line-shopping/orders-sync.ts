// ตัวกลางดึงออเดอร์ LINE SHOPPING → platform_orders (ตัวดึงอัตโนมัติทุก 15 นาที + ปุ่ม "ดึงตอนนี้" หน้าสถานะดึงออเดอร์)
// เจ้าของเลือก 2026-11-20 (widget หน้าสถานะดึงออเดอร์ ข้อ 4) · ล้อ app/api/shopee/orders-sync.ts
//   เรียงตามเวลาอัปเดตล่าสุดก่อน → หยุดเมื่อถึงใบที่อัปเดตก่อนช่วงที่ขอ · ใบใหม่ = หัว + รายการ (จับคู่รหัส SKU) · ใบเดิม = อัปเดตตามร้าน
//   รายการไม่มากับหน้ารายการ = เปิดรายละเอียดทีละใบ (≤ 20 ใบ/รอบ) · ที่มา "line_shopping_api" = สถานะตามร้าน (ดูอย่างเดียว)
// ไม่เก็บที่อยู่/เบอร์ผู้รับ · ⚠️ อ่านอย่างเดียว ไม่แก้อะไรบนร้าน
import type { SupabaseClient } from "@supabase/supabase-js";
import { lineGetOrder, lineListOrders } from "@/lib/line-shopping";
import { lineOrderItems, lineOrderShape, lineOrderToPlatformOrder, type LineOrderMapped } from "@/lib/line-shopping-orders";

export const LINE_ORDER_SOURCE = "line_shopping_api";
const PAGE = 50;
const MAX_DETAIL = 20;

export type LineOrderSyncResult = { fetched: number; created: number; updated: number; items_created: number; items_matched: number; done: boolean; stop_reason: string | null; shape: Record<string, unknown> | null };

/** แบรนด์ที่ใส่กุญแจ LINE SHOPPING ไว้ */
export async function lineConnectedBrandIds(admin: SupabaseClient, platformId: string): Promise<string[]> {
  const { data } = await admin.from("platform_credentials").select("brand_id, api_key").eq("platform_id", platformId);
  return ((data ?? []) as { brand_id: string; api_key: string | null }[]).filter((r) => !!r.api_key).map((r) => r.brand_id);
}

export async function syncLineOrders(admin: SupabaseClient, args: {
  platformId: string; brandId: string; apiKey: string; sinceIso: string; timeBudgetMs: number; maxPages?: number;
}): Promise<LineOrderSyncResult> {
  const { platformId, brandId, apiKey } = args;
  const started = Date.now();
  const since = Date.parse(args.sinceIso);
  let fetched = 0, created = 0, updated = 0, itemsCreated = 0, itemsMatched = 0, details = 0, done = false, stopReason: string | null = null;
  let shape: Record<string, unknown> | null = null;

  for (let page = 1; page <= (args.maxPages ?? 10) && Date.now() - started < args.timeBudgetMs; page++) {
    const res = await lineListOrders(apiKey, { page, perPage: PAGE, sortBy: "UPDATED_AT", orderBy: "DESC" });
    if (!res.ok) { stopReason = res.error ?? "LINE SHOPPING ไม่ตอบ"; break; }
    const rows = res.rows ?? [];
    if (rows.length && !shape) shape = lineOrderShape(rows[0]);
    let mapped = rows.map(lineOrderToPlatformOrder).filter((m): m is LineOrderMapped => !!m);
    // ถึงใบที่อัปเดตก่อนช่วงที่ขอ = จบ (ไม่มีเวลาอัปเดต = เก็บไว้ แล้วหยุดที่หน้านี้)
    const fresh = mapped.filter((m) => !m.updated_at || Date.parse(m.updated_at) >= since);
    const reachedOld = fresh.length < mapped.length || mapped.every((m) => !m.updated_at);
    mapped = fresh;

    if (mapped.length) {
      const ids = mapped.map((m) => m.external_order_id);
      const { data: exist, error: exErr } = await admin.from("platform_orders").select("id, external_order_id, status, stock_deducted, source").eq("platform_id", platformId).in("external_order_id", ids);
      if (exErr) { stopReason = `อ่านออเดอร์เดิมไม่สำเร็จ: ${exErr.message}`; break; }
      const had = new Map(((exist ?? []) as { id: string; external_order_id: string; status: string; stock_deducted: boolean | null; source: string | null }[]).map((r) => [r.external_order_id, r]));
      const hadIds = [...had.values()].map((r) => r.id);
      const withItems = new Set<string>();
      for (let i = 0; i < hadIds.length; i += 200) {
        const { data: it } = await admin.from("platform_order_items").select("order_id").in("order_id", hadIds.slice(i, i + 200));
        for (const r of (it ?? []) as { order_id: string }[]) withItems.add(r.order_id);
      }
      // ใบที่ยังไม่มีรายการและหน้ารายการไม่ส่งรายการมา → เปิดรายละเอียด
      for (const m of mapped) {
        const prev = had.get(m.external_order_id);
        if (m.items.length || (prev && withItems.has(prev.id)) || details >= MAX_DETAIL) continue;
        const d = await lineGetOrder(apiKey, m.external_order_id);
        details++;
        if (d.ok && d.order) { m.items = lineOrderItems(d.order); if (!shape?.item_keys || !(shape.item_keys as unknown[]).length) shape = lineOrderShape(d.order); }
      }
      const now = new Date().toISOString();
      const rows2 = mapped.map((m) => {
        const prev = had.get(m.external_order_id);
        // ออเดอร์ที่สร้างเองในศูนย์ (manual) ไม่ทับ · ตัดสต๊อกแล้ว = คงสถานะในระบบ
        if (prev?.stock_deducted) return { platform_id: platformId, brand_id: brandId, source: prev.source ?? LINE_ORDER_SOURCE, external_order_id: m.external_order_id, ...m.head, status: prev.status, updated_at: now };
        return { platform_id: platformId, brand_id: brandId, source: LINE_ORDER_SOURCE, external_order_id: m.external_order_id, ...m.head, updated_at: now };
      });
      const { data: up, error: upErr } = await admin.from("platform_orders").upsert(rows2, { onConflict: "platform_id,external_order_id" }).select("id, external_order_id");
      if (upErr) { stopReason = `บันทึกออเดอร์ไม่สำเร็จ: ${upErr.message}`; break; }
      fetched += mapped.length;
      const idOf = new Map(((up ?? []) as { id: string; external_order_id: string }[]).map((r) => [r.external_order_id, r.id]));
      for (const m of mapped) { if (had.has(m.external_order_id)) updated++; else created++; }

      const needItems = mapped.filter((m) => { const prev = had.get(m.external_order_id); return m.items.length && (!prev || !withItems.has(prev.id)); });
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
          return { order_id: orderId, sku_code: it.sku_code, matched_sku_id: s?.id ?? null, matched_parent_sku_id: s?.parent_sku_id ?? null, name: it.name, qty: it.qty, price: it.price, raw: { source: LINE_ORDER_SOURCE, variant: it.variant } };
        });
      });
      for (let i = 0; i < itemRows.length; i += 200) {
        const { error: itErr } = await admin.from("platform_order_items").insert(itemRows.slice(i, i + 200));
        if (itErr) { stopReason = `บันทึกรายการสินค้าไม่สำเร็จ: ${itErr.message}`; break; }
        itemsCreated += Math.min(200, itemRows.length - i);
      }
      if (stopReason) break;
    }
    if (reachedOld || rows.length < PAGE || page >= (res.totalPage ?? 1)) { done = true; break; }
  }
  return { fetched, created, updated, items_created: itemsCreated, items_matched: itemsMatched, done, stop_reason: stopReason, shape };
}
