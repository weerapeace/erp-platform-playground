/**
 * 💚 แปลงออเดอร์ LINE SHOPPING (GET /orders · GET /orders/{orderNo}) → แถว platform_orders — pure · มีเทสต์
 * ใช้ที่: app/api/line-shopping/orders-sync (ตัวดึงอัตโนมัติทุก 15 นาที + ปุ่ม "ดึงตอนนี้") · เจ้าของเลือก 2026-11-20 ข้อ 4
 * ⚠️ ยังไม่เคยเห็นข้อมูลจริง (ร้านยังไม่มีออเดอร์ผ่านระบบ) — ตัวแปลงอ่านได้หลายชื่อช่อง · รอบแรกที่มีออเดอร์จะจดรูปข้อมูล (ไม่มีที่อยู่) ใน audit ให้ตรวจ
 * ไม่เก็บที่อยู่/เบอร์ผู้รับ
 * 2026-11-27 (เจ้าของสั่ง): เก็บข้อความลูกค้า remarkBuyer · ข้อความถึงผู้รับ remarkRecipient · isGift · ตัวเลือกสินค้า (variants)
 *   ไว้ใน raw.line_shopping → หน้างานพิเศษ (/order-ops/gift-cards) อ่านไปคัดแยกการ์ด/สลักชื่อ · ไม่กระทบการจับคู่สินค้า/สต๊อก
 */
import { lineShoppingStatus, lineShoppingToInternal, type PlatformOrderStatus } from "@/lib/platform-order-status";

export type LineOrderItemMapped = { sku_code: string | null; name: string | null; qty: number; price: number | null; variant: string | null };
export type LineOrderMapped = {
  external_order_id: string;
  updated_at: string | null;
  head: {
    order_no: string; customer_name: string | null; status: PlatformOrderStatus; platform_status: string;
    total: number | null; currency: string; ordered_at: string | null; cod_amount: number;
    tracking_no: string | null; carrier: string | null; raw: Record<string, unknown>;
  };
  items: LineOrderItemMapped[];
};

const pick = (o: Record<string, unknown> | null | undefined, ...keys: string[]): unknown => {
  if (!o) return undefined;
  for (const k of keys) if (o[k] != null && o[k] !== "") return o[k];
  return undefined;
};
const str = (v: unknown): string | null => { const s = v == null ? "" : String(v).trim(); return s ? s : null; };
const money = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "object") return money(pick(v as Record<string, unknown>, "amount", "value"));
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const iso = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000).toISOString();
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** ตัวเลือกสินค้าเป็นข้อความ — variantName (ข้อความ) หรือ variants (รายการ {name,value} / ข้อความ) เช่น "สี: ดำ / ชื่อที่สลัก: KORN" */
export function lineVariantText(it: Record<string, unknown>): string | null {
  const one = str(pick(it, "variantName", "variant", "optionName", "variationName"));
  const arr = it.variants;
  if (!Array.isArray(arr) || !arr.length) return one;
  const parts = (arr as unknown[]).map((v) => {
    if (v == null) return null;
    if (typeof v !== "object") return str(v);
    const o = v as Record<string, unknown>;
    const k = str(pick(o, "name", "optionName", "key", "title", "label"));
    const val = str(pick(o, "value", "optionValue", "valueName", "text"));
    return k && val && k !== val ? `${k}: ${val}` : val ?? k;
  }).filter((x): x is string => !!x);
  return parts.length ? parts.join(" / ").slice(0, 300) : one;
}

/** รายการสินค้าในออเดอร์ (ชื่อช่องที่เป็นไปได้: orderItems / items / products) */
export function lineOrderItems(o: Record<string, unknown>): LineOrderItemMapped[] {
  const arr = pick(o, "orderItems", "items", "products", "orderProducts");
  if (!Array.isArray(arr)) return [];
  return (arr as Record<string, unknown>[]).map((it) => ({
    sku_code: str(pick(it, "sku", "skuCode", "sellerSku", "productSku")),
    name: str(pick(it, "name", "productName", "title")),
    qty: Math.max(1, Math.round(Number(pick(it, "quantity", "qty", "amount")) || 1)),
    price: money(pick(it, "price", "unitPrice", "salePrice", "pricePerUnit")),
    variant: lineVariantText(it),
  }));
}

export function lineOrderToPlatformOrder(o: Record<string, unknown>): LineOrderMapped | null {
  const no = str(pick(o, "orderNumber", "orderNo", "order_number", "id"));
  if (!no) return null;
  const ps = lineShoppingStatus({ orderStatus: pick(o, "orderStatus", "status"), paymentStatus: pick(o, "paymentStatus"), shipmentStatus: pick(o, "shipmentStatus") });
  const total = money(pick(o, "totalPrice", "grandTotal", "total", "netPrice", "totalAmount"));
  const ship = pick(o, "shipmentDetails", "shipments", "shipment");
  const ship0 = (Array.isArray(ship) ? ship[0] : ship) as Record<string, unknown> | undefined;
  const pay = String(pick(o, "paymentMethod", "paymentType") ?? "").toUpperCase();
  const customer = pick(o, "customer", "buyer") as Record<string, unknown> | undefined;
  const fullName = str(pick(o, "customerName", "buyerName")) ?? str(pick(customer, "name", "displayName"));
  return {
    external_order_id: no,
    updated_at: iso(pick(o, "updatedAt", "lastUpdatedAt")),
    head: {
      order_no: no,
      customer_name: fullName ? fullName.split(/\s+/)[0] : null,
      status: lineShoppingToInternal(ps) ?? "new",
      platform_status: ps,
      total, currency: "THB",
      ordered_at: iso(pick(o, "checkoutAt", "createdAt", "orderedAt")),
      cod_amount: pay.includes("COD") || pay.includes("CASH_ON_DELIVERY") ? total ?? 0 : 0,
      tracking_no: str(pick(ship0, "trackingNumber", "trackingNo")) ?? str(pick(o, "trackingNumber", "trackingNo")),
      carrier: str(pick(ship0, "shippingProvider", "courier", "carrier", "shipmentProvider")),
      raw: {
        line_shopping: {
          orderStatus: pick(o, "orderStatus", "status") ?? null, paymentStatus: pick(o, "paymentStatus") ?? null, shipmentStatus: pick(o, "shipmentStatus") ?? null,
          paymentMethod: pick(o, "paymentMethod", "paymentType") ?? null, createdAt: pick(o, "createdAt") ?? null, checkoutAt: pick(o, "checkoutAt") ?? null,
          updatedAt: pick(o, "updatedAt") ?? null, subtotal: pick(o, "subtotalPrice", "subtotal") ?? null, shipping: pick(o, "shippingPrice", "shippingFee") ?? null,
          discount: pick(o, "discountAmount", "discount") ?? null,
          // ข้อความลูกค้า (ชื่อสลัก/ข้อความการ์ด) + ของขวัญ + ตัวเลือกสินค้า — หน้างานพิเศษอ่าน (lib/gift-card-design buyerNoteOf)
          remarkBuyer: str(pick(o, "remarkBuyer", "buyerRemark", "remark", "note")),
          remarkRecipient: str(pick(o, "remarkRecipient", "recipientRemark", "giftMessage")),
          isGift: pick(o, "isGift") === true || pick(o, "isGift") === "true",
          itemVariants: lineOrderItems(o).filter((i) => i.variant).map((i) => ({ sku: i.sku_code, variant: i.variant })),
        },
      },
    },
    items: lineOrderItems(o),
  };
}

/** รูปข้อมูลจริง (ชื่อช่องเท่านั้น ไม่มีค่า) — จดใน audit ไว้ยืนยันตัวแปลง */
export function lineOrderShape(o: Record<string, unknown>): Record<string, unknown> {
  const items = pick(o, "orderItems", "items", "products", "orderProducts");
  const item0 = Array.isArray(items) ? (items[0] as Record<string, unknown> | undefined) : undefined;
  return { order_keys: Object.keys(o), item_keys: item0 ? Object.keys(item0) : [], orderStatus: pick(o, "orderStatus", "status") ?? null, paymentStatus: pick(o, "paymentStatus") ?? null, shipmentStatus: pick(o, "shipmentStatus") ?? null };
}
