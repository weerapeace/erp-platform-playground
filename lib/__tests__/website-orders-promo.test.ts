import { describe, it, expect } from "vitest";
import { createStorefrontOrder } from "../website-orders";
import { fakeDb, type Row } from "./fake-db";

/**
 * 🏷 โปรโมชันอัตโนมัติ — สั่งซื้อทั้งเส้นกับฐานข้อมูลจำลอง (ไม่แตะ DB จริง)
 * กันบั๊ก: ส่วนลดคิดใหม่ที่เซิร์ฟเวอร์ · รวมใน discount + แยกรายการใน promos · ⚡ ซ้อนโปรตะกร้า · โปรหมดเวลาไม่ลด · โปรห้ามคูปอง
 */
type Db = Parameters<typeof createStorefrontOrder>[0];
const SHOP = { id: "shop-1", slug: "louis", field_map: null };
const P = "11111111-2222-3333-4444-555555555555";
const future = new Date(Date.now() + 864e5).toISOString();
const past = new Date(Date.now() - 864e5).toISOString();

function setup(promos: Row[]) {
  const tables: Record<string, Row[]> = {
    store_settings: Object.entries({ shipping_flat: "50", free_shipping_min: "0", pay_cod: "1" }).map(([key, value]) => ({ shop_id: SHOP.id, key, value })),
    store_listings: [{ shop_id: SHOP.id, parent_sku_id: P, is_published: true, web_name: "กระเป๋าเป้", web_price: 1000 }],
    parent_skus_v2: [{ id: P, code: "BP01", name: "กระเป๋าเป้", category_id: null }],
    skus_v2: [{ id: "aaaaaaaa-0000-0000-0000-000000000001", parent_sku_id: P, code: "BP01-01", color: "ดำ", list_price: 1000, is_active: true, attribute_values: null }],
    store_promotions: promos.map((p, i) => ({ id: `promo-${i}`, shop_id: SHOP.id, active: true, starts_at: null, ends_at: null, created_at: `2026-10-0${i + 1}T00:00:00Z`, ...p })),
    store_orders: [],
    store_order_items: [],
  };
  return { tables, db: fakeDb(tables) as unknown as Db };
}

const body = (qty: number, couponCode?: string) => ({
  items: [{ productId: P, qty }],
  customer: { name: "สมหญิง", phone: "0812345678" },
  ship: { addressLine: "99/9 ถ.สุขุมวิท" },
  paymentMethod: "cod",
  couponCode,
});
const ALL = { mode: "all", codes: [], categories: [] };

describe("createStorefrontOrder + 🏷 โปรโมชัน", () => {
  it("ซื้อครบ 2 ลด 10%: ส่วนลดรวมใน discount + เก็บรายการโปร + ยอดรวมถูก", async () => {
    const { tables, db } = setup([{ name: "ซื้อ 2 ลด 10%", kind: "qty_percent", rule: { scope: ALL, minQty: 2, percent: 10 } }]);
    const r = await createStorefrontOrder(db, SHOP, body(2));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order).toMatchObject({ subtotal: 2000, discount: 200, grandTotal: 1850 });
    expect(r.order.promos).toEqual([{ name: "ซื้อ 2 ลด 10%", amount: 200 }]);
    expect(tables.store_orders[0]).toMatchObject({ discount: 200, promos: [{ name: "ซื้อ 2 ลด 10%", kind: "qty_percent", amount: 200 }] });
  });

  it("⚡ Flash 20% + ซื้อ 2 ลด 10% (จากราคาที่ลดแล้ว) = 400 + 160", async () => {
    const { db } = setup([
      { name: "Flash", kind: "flash", ends_at: future, rule: { scope: ALL, percent: 20 } },
      { name: "ซื้อ 2 ลด 10%", kind: "qty_percent", rule: { scope: ALL, minQty: 2, percent: 10 } },
    ]);
    const r = await createStorefrontOrder(db, SHOP, body(2));
    expect(r.ok && r.order.discount).toBe(560);
  });

  it("โปรหมดเวลาแล้ว / ปิดอยู่ = ไม่ลด · promos ว่าง", async () => {
    const { tables, db } = setup([
      { name: "หมดแล้ว", kind: "qty_percent", ends_at: past, rule: { scope: ALL, minQty: 2, percent: 10 } },
      { name: "ปิด", kind: "qty_percent", active: false, rule: { scope: ALL, minQty: 2, percent: 50 } },
    ]);
    const r = await createStorefrontOrder(db, SHOP, body(2));
    expect(r.ok && r.order.discount).toBe(0);
    expect(tables.store_orders[0].promos).toBeNull();
  });

  it("โปรห้ามใช้คู่คูปอง + ลูกค้าใส่โค้ด = ไม่รับออเดอร์ บอกชื่อโปร", async () => {
    const { tables, db } = setup([{ name: "ลดแรง", kind: "qty_percent", rule: { scope: ALL, minQty: 2, percent: 10, noCoupon: true } }]);
    const r = await createStorefrontOrder(db, SHOP, body(2, "WELCOME10"));
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(!r.ok && r.error).toContain("ลดแรง");
    expect(tables.store_orders).toHaveLength(0);
  });
});
