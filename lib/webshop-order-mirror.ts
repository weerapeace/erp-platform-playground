/**
 * 🌐 ส่งต่อออเดอร์เว็บไซต์ของเรา (store_orders) เข้าศูนย์ออเดอร์ (platform_orders) — ฝั่งเซิร์ฟเวอร์เท่านั้น
 * เจ้าของเลือก 2026-11-20 (widget หน้าสถานะดึงออเดอร์ ข้อ 5): ให้ศูนย์ออเดอร์/แดชบอร์ดรวมหลายแพลตฟอร์มนับออเดอร์เว็บด้วย
 *   เรียกจากตัวดึงอัตโนมัติทุก 15 นาที (/api/cron/tiktok-orders) + ปุ่ม "ดึงตอนนี้"
 *   ที่มา "webshop" = สถานะตามหน้าเว็บไซต์ › ออเดอร์ (ศูนย์ออเดอร์ดูอย่างเดียว · ไม่ตัดสต๊อกซ้ำ — เว็บจัดการเอง)
 *   ร้านเว็บ → แบรนด์ จับจากชื่อ (shops.name ↔ brands.name ไม่สนช่องว่าง/ตัวพิมพ์) · ไม่เจอ = ไม่ระบุแบรนด์
 *   บันทึกเฉพาะใบใหม่ / ใบที่สถานะ-ยอด-เลขพัสดุเปลี่ยน (ไม่เขียนซ้ำทุกรอบ) · ย้อนดู 60 วัน
 *   ไม่คัดลอกที่อยู่/เบอร์ลูกค้า (ดูได้ที่หน้าเว็บไซต์ › ออเดอร์)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { webshopStatus, webshopToInternal } from "@/lib/platform-order-status";

export const WEBSHOP_ORDER_SOURCE = "webshop";
const LOOKBACK_DAYS = 60;

export type WebshopMirrorResult = { checked: number; created: number; updated: number; items_created: number; stop_reason: string | null };

const norm = (s: string | null | undefined) => String(s ?? "").toLowerCase().replace(/[^a-z0-9ก-๙]/g, "");

type StoreOrder = {
  id: string; order_no: string; status: string; payment_status: string | null; payment_method: string | null; customer_name: string | null;
  grand_total: number | string | null; created_at: string; shop_id: string | null; tracking_no: string | null; tracking_carrier: string | null; cod_fee: number | string | null;
};

export async function mirrorWebshopOrders(admin: SupabaseClient, opts: { platformId: string; shopId?: string | null } ): Promise<WebshopMirrorResult> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  let q = admin.from("store_orders").select("id, order_no, status, payment_status, payment_method, customer_name, grand_total, created_at, shop_id, tracking_no, tracking_carrier, cod_fee").gte("created_at", since).order("created_at", { ascending: false }).limit(2000);
  if (opts.shopId) q = q.eq("shop_id", opts.shopId);
  const { data, error } = await q;
  if (error) return { checked: 0, created: 0, updated: 0, items_created: 0, stop_reason: `อ่านออเดอร์เว็บไม่สำเร็จ: ${error.message}` };
  const orders = ((data ?? []) as StoreOrder[]).filter((o) => o.order_no);
  if (!orders.length) return { checked: 0, created: 0, updated: 0, items_created: 0, stop_reason: null };

  const [{ data: shops }, { data: brands }] = await Promise.all([
    admin.from("shops").select("id, name, slug"),
    admin.from("brands").select("id, name"),
  ]);
  const brandByName = new Map(((brands ?? []) as { id: string; name: string }[]).map((b) => [norm(b.name), b.id]));
  const brandOfShop = new Map(((shops ?? []) as { id: string; name: string; slug: string }[]).map((s) => [s.id, brandByName.get(norm(s.name)) ?? brandByName.get(norm(s.slug)) ?? null]));

  const ids = orders.map((o) => o.order_no);
  const had = new Map<string, { id: string; status: string; platform_status: string | null; total: number | null; tracking_no: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ex, error: exErr } = await admin.from("platform_orders").select("id, external_order_id, status, platform_status, total, tracking_no").eq("platform_id", opts.platformId).in("external_order_id", ids.slice(i, i + 200));
    if (exErr) return { checked: orders.length, created: 0, updated: 0, items_created: 0, stop_reason: `อ่านศูนย์ออเดอร์ไม่สำเร็จ: ${exErr.message}` };
    for (const r of (ex ?? []) as { id: string; external_order_id: string; status: string; platform_status: string | null; total: number | null; tracking_no: string | null }[]) had.set(r.external_order_id, r);
  }

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  const fresh: StoreOrder[] = [];
  let updated = 0;
  for (const o of orders) {
    const ps = webshopStatus(o);
    const total = Number(o.grand_total) || 0;
    const prev = had.get(o.order_no);
    const head = {
      platform_id: opts.platformId, brand_id: o.shop_id ? brandOfShop.get(o.shop_id) ?? null : null, source: WEBSHOP_ORDER_SOURCE,
      external_order_id: o.order_no, order_no: o.order_no,
      customer_name: o.customer_name ? o.customer_name.trim().split(/\s+/)[0] : null,
      status: webshopToInternal(ps) ?? "new", platform_status: ps, total, currency: "THB", ordered_at: o.created_at,
      tracking_no: o.tracking_no || null, carrier: o.tracking_carrier || null,
      cod_amount: String(o.payment_method ?? "").toLowerCase() === "cod" ? total : 0,
      raw: { webshop: { store_order_id: o.id, shop_id: o.shop_id, payment_method: o.payment_method, payment_status: o.payment_status, status: o.status } },
      updated_at: now,
    };
    if (!prev) { rows.push(head); fresh.push(o); continue; }
    if (prev.platform_status !== ps || Number(prev.total ?? 0) !== total || (prev.tracking_no ?? null) !== (head.tracking_no ?? null)) { rows.push(head); updated++; }
  }
  if (!rows.length) return { checked: orders.length, created: 0, updated: 0, items_created: 0, stop_reason: null };

  const { data: up, error: upErr } = await admin.from("platform_orders").upsert(rows, { onConflict: "platform_id,external_order_id" }).select("id, external_order_id");
  if (upErr) return { checked: orders.length, created: 0, updated: 0, items_created: 0, stop_reason: `บันทึกเข้าศูนย์ออเดอร์ไม่สำเร็จ: ${upErr.message}` };
  const idOf = new Map(((up ?? []) as { id: string; external_order_id: string }[]).map((r) => [r.external_order_id, r.id]));

  // รายการสินค้าเฉพาะใบใหม่ (sku_id ของเว็บ = SKU ในระบบอยู่แล้ว)
  let itemsCreated = 0;
  const freshIds = fresh.map((o) => o.id);
  for (let i = 0; i < freshIds.length; i += 200) {
    const { data: its } = await admin.from("store_order_items").select("order_id, sku_id, sku_code, name, variant_label, unit_price, qty").in("order_id", freshIds.slice(i, i + 200));
    const list = (its ?? []) as { order_id: string; sku_id: string | null; sku_code: string | null; name: string | null; variant_label: string | null; unit_price: number | string | null; qty: number | null }[];
    const skuIds = [...new Set(list.map((x) => x.sku_id).filter((x): x is string => !!x))];
    const parentOf = new Map<string, string | null>();
    if (skuIds.length) {
      const { data: sk } = await admin.from("skus_v2").select("id, parent_sku_id").in("id", skuIds);
      for (const s of (sk ?? []) as { id: string; parent_sku_id: string | null }[]) parentOf.set(s.id, s.parent_sku_id);
    }
    const noOf = new Map(fresh.map((o) => [o.id, o.order_no]));
    const itemRows = list.flatMap((x) => {
      const orderId = idOf.get(noOf.get(x.order_id) ?? "");
      if (!orderId) return [];
      return [{ order_id: orderId, sku_code: x.sku_code, matched_sku_id: x.sku_id, matched_parent_sku_id: x.sku_id ? parentOf.get(x.sku_id) ?? null : null, name: x.name, qty: Math.max(1, Number(x.qty) || 1), price: x.unit_price == null ? null : Number(x.unit_price), raw: { source: WEBSHOP_ORDER_SOURCE, variant: x.variant_label } }];
    });
    if (itemRows.length) {
      const { error: itErr } = await admin.from("platform_order_items").insert(itemRows);
      if (itErr) return { checked: orders.length, created: fresh.length, updated, items_created: itemsCreated, stop_reason: `บันทึกรายการสินค้าไม่สำเร็จ: ${itErr.message}` };
      itemsCreated += itemRows.length;
    }
  }
  return { checked: orders.length, created: fresh.length, updated, items_created: itemsCreated, stop_reason: null };
}
