/**
 * 🛍 แปลงออเดอร์ Lazada (/orders/get + /orders/items/get) → แถว platform_orders — pure · มีเทสต์ · ไม่ import lib/lazada (ใช้ฝั่งไหนก็ได้)
 * ใช้ที่: app/api/lazada/orders-sync (ตัวดึงอัตโนมัติทุก 15 นาที + ปุ่ม "ดึงตอนนี้")
 * ไม่เก็บที่อยู่/เบอร์ผู้รับ (address_billing / address_shipping ตัดทิ้ง) · ชื่อผู้ซื้อเก็บแค่ชื่อต้น
 * Lazada 1 แถวรายการ = 1 ชิ้น → รวมตามรหัสร้าน (sku) ได้จำนวน
 */
import { lazadaOrderStatus, lazadaToInternal, type PlatformOrderStatus } from "@/lib/platform-order-status";

export type LazOrderItemMapped = { sku_code: string | null; name: string | null; qty: number; price: number | null; variant: string | null; shop_sku: string | null; order_item_ids: string[]; original_price?: number | null; paid_price?: number | null };
export type LazOrderMapped = {
  external_order_id: string;
  head: {
    order_no: string; customer_name: string | null; status: PlatformOrderStatus; platform_status: string | null;
    total: number | null; currency: string; ordered_at: string | null; cod_amount: number;
    tracking_no: string | null; carrier: string | null; package_no: string | null; ship_by_at: string | null;
    raw: Record<string, unknown>;
  };
  items: LazOrderItemMapped[];
};

/** "1,299.00" → 1299 · ว่าง/อ่านไม่ได้ = null */
export function lazMoney(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** เวลาแบบ Lazada "2026-11-20 13:41:18 +0700" (หรือ ISO) → ISO · อ่านไม่ได้ = null */
export function lazTime(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?\s*(?:([+-])(\d{2}):?(\d{2}))?$/);
  if (m) {
    const [, y, mo, d, h, mi, se, sign, oh, om] = m;
    let t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se ?? 0));
    const off = sign ? (+oh * 60 + +(om ?? 0)) * (sign === "-" ? -1 : 1) : 7 * 60;   // ไม่มีเขตเวลา = เวลาไทย
    t -= off * 60_000;
    return new Date(t).toISOString();
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const str = (v: unknown): string | null => { const s = v == null ? "" : String(v).trim(); return s ? s : null; };
const RAW_KEYS = ["order_id", "order_number", "statuses", "created_at", "updated_at", "price", "payment_method", "items_count", "shipping_fee", "voucher", "voucher_platform", "voucher_seller", "warehouse_code", "delivery_info", "remarks", "gift_option"] as const;

export function lazOrderToPlatformOrder(o: Record<string, unknown>, items: Record<string, unknown>[] | undefined): LazOrderMapped | null {
  const oid = str(o.order_id) ?? str(o.order_number);
  if (!oid) return null;
  const ps = lazadaOrderStatus(Array.isArray(o.statuses) ? o.statuses : items?.map((i) => i.status) ?? []);
  const raw: Record<string, unknown> = {};
  for (const k of RAW_KEYS) if (o[k] !== undefined) raw[k] = o[k];

  // รายการ: รวมตามรหัสร้าน · ชิ้นที่ยกเลิกแล้วไม่นับ (เว้นแต่ยกเลิกทั้งใบ = เก็บไว้ให้เห็นว่าเคยสั่งอะไร)
  const list = items ?? [];
  const allCancelled = list.length > 0 && list.every((i) => /^cancel/i.test(String(i.status ?? "")));
  const by = new Map<string, LazOrderItemMapped>();
  let shipBy: number | null = null, tracking: string | null = null, carrier: string | null = null, pkg: string | null = null;
  for (const it of list) {
    const st = String(it.status ?? "");
    if (!allCancelled && /^cancel/i.test(st)) continue;
    const sku = str(it.sku);
    const key = sku ?? `name:${str(it.name) ?? ""}|${str(it.variation) ?? ""}`;
    const price = lazMoney(it.item_price) ?? lazMoney(it.paid_price);
    const prev = by.get(key);
    if (prev) { prev.qty += 1; prev.order_item_ids.push(String(it.order_item_id ?? "")); }
    else by.set(key, { sku_code: sku, name: str(it.name), qty: 1, price, variant: str(it.variation), shop_sku: str(it.shop_sku), order_item_ids: [String(it.order_item_id ?? "")], original_price: lazMoney(it.item_price), paid_price: lazMoney(it.paid_price) });
    const promised = lazTime(it.promised_shipping_time) ?? lazTime(it.sla_time_stamp) ?? lazTime(it.fulfillment_sla);
    if (promised) { const t = Date.parse(promised); if (shipBy == null || t < shipBy) shipBy = t; }
    tracking = tracking ?? str(it.tracking_code);
    carrier = carrier ?? str(it.shipment_provider);
    pkg = pkg ?? str(it.package_id);
  }

  const total = lazMoney(o.price);
  const cod = String(o.payment_method ?? "").toUpperCase() === "COD" ? total ?? 0 : 0;
  return {
    external_order_id: oid,
    head: {
      order_no: str(o.order_number) ?? oid,
      customer_name: str(o.customer_first_name),
      status: lazadaToInternal(ps) ?? "new",
      platform_status: ps,
      total, currency: "THB",
      ordered_at: lazTime(o.created_at),
      cod_amount: cod,
      tracking_no: tracking, carrier, package_no: pkg,
      ship_by_at: shipBy == null ? null : new Date(shipBy).toISOString(),
      raw: { lazada: { ...raw, ...(list[0] ? { item_keys: Object.keys(list[0]), shipping_provider_type: str(list[0].shipping_provider_type), shipping_type: str(list[0].shipping_type), sla: { sla_time_stamp: list[0].sla_time_stamp ?? null, promised_shipping_time: list[0].promised_shipping_time ?? null, fulfillment_sla: list[0].fulfillment_sla ?? null } } : {}) } },
    },
    items: [...by.values()],
  };
}
