import { describe, it, expect } from "vitest";
import { createStorefrontOrder } from "../website-orders";
import { fakeDb, type Row } from "./fake-db";

/**
 * 🎀 ห่อของขวัญ — สั่งซื้อทั้งเส้นกับฐานข้อมูลจำลอง (ไม่แตะ DB จริง)
 * กันบั๊ก: ค่าห่อต้องมาจากที่ร้านตั้ง (ไม่เชื่อหน้าเว็บ) · บวกในยอดรวม · ไม่โดนส่วนลด · ร้านปิดบริการ = ไม่รับ · ข้อความ/ซ่อนราคา รับเฉพาะที่ร้านเปิด
 */
type Db = Parameters<typeof createStorefrontOrder>[0];
const SHOP = { id: "shop-1", slug: "louis", field_map: null };
const P = "11111111-2222-3333-4444-555555555555";

function setup(settings: Record<string, string>) {
  const tables: Record<string, Row[]> = {
    store_settings: Object.entries({ shipping_flat: "50", free_shipping_min: "0", pay_cod: "1", ...settings }).map(([key, value]) => ({ shop_id: SHOP.id, key, value })),
    store_listings: [{ shop_id: SHOP.id, parent_sku_id: P, is_published: true, web_name: "กระเป๋าเป้", web_price: 1000 }],
    parent_skus_v2: [{ id: P, code: "BP01", name: "กระเป๋าเป้", category_id: null }],
    skus_v2: [{ id: "aaaaaaaa-0000-0000-0000-000000000001", parent_sku_id: P, code: "BP01-01", color: "ดำ", list_price: 1000, is_active: true, attribute_values: null }],
    store_orders: [],
    store_order_items: [],
  };
  return { tables, db: fakeDb(tables) as unknown as Db };
}

const body = (gift?: unknown) => ({
  items: [{ productId: P, qty: 1 }],
  customer: { name: "สมหญิง", phone: "0812345678" },
  ship: { addressLine: "99/9 ถ.สุขุมวิท" },
  paymentMethod: "cod",
  gift,
});

describe("createStorefrontOrder + 🎀 ห่อของขวัญ", () => {
  it("ห่อ: ค่าห่อจากที่ร้านตั้ง บวกในยอดรวม + เก็บข้อความ/ซ่อนราคา ลงออเดอร์", async () => {
    const { tables, db } = setup({ gift_enabled: "1", gift_fee: "59" });
    const r = await createStorefrontOrder(db, SHOP, body({ wrap: true, message: "สุขสันต์วันเกิด", hidePrice: true, fee: 0 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order).toMatchObject({ subtotal: 1000, shippingFee: 50, giftWrap: true, giftFee: 59, giftMessage: "สุขสันต์วันเกิด", giftHidePrice: true, grandTotal: 1109 });
    expect(tables.store_orders[0]).toMatchObject({ gift_wrap: true, gift_fee: 59, gift_message: "สุขสันต์วันเกิด", gift_hide_price: true, grand_total: 1109 });
  });

  it("ไม่ห่อ: ไม่มีค่าห่อ · ช่อง gift ในออเดอร์ = ค่าว่าง", async () => {
    const { tables, db } = setup({ gift_enabled: "1", gift_fee: "59" });
    const r = await createStorefrontOrder(db, SHOP, body());
    expect(r.ok && r.order.grandTotal).toBe(1050);
    expect(tables.store_orders[0]).toMatchObject({ gift_wrap: false, gift_fee: 0, gift_message: null, gift_hide_price: false });
  });

  it("ร้านปิดบริการแล้ว แต่ลูกค้าติ๊กห่อมา → ไม่รับ บอกให้เอาออก (ไม่สร้างออเดอร์)", async () => {
    const { tables, db } = setup({ gift_enabled: "0", gift_fee: "59" });
    const r = await createStorefrontOrder(db, SHOP, body({ wrap: true }));
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(tables.store_orders).toHaveLength(0);
  });

  it("ร้านไม่เปิดให้เขียนการ์ด/ซ่อนราคา → ไม่เก็บค่าที่ส่งมา · ห่อฟรี (ค่าห่อ 0) ได้", async () => {
    const { tables, db } = setup({ gift_enabled: "1", gift_fee: "0", gift_allow_message: "0", gift_allow_hide_price: "0" });
    const r = await createStorefrontOrder(db, SHOP, body({ wrap: true, message: "แอบส่ง", hidePrice: true }));
    expect(r.ok && r.order).toMatchObject({ giftWrap: true, giftFee: 0, giftMessage: "", giftHidePrice: false, grandTotal: 1050 });
    expect(tables.store_orders[0]).toMatchObject({ gift_message: null, gift_hide_price: false });
  });
});

describe("createStorefrontOrder + 💌 การ์ดอวยพรแยกจากห่อ", () => {
  it("การ์ดอย่างเดียว (ไม่ห่อ): ค่าการ์ดจากที่ร้านตั้ง บวกยอดรวม · เก็บข้อความ · gift_wrap = false", async () => {
    const { tables, db } = setup({ card_enabled: "1", card_fee: "20" });
    const r = await createStorefrontOrder(db, SHOP, body({ addCard: true, message: "สุขสันต์วันเกิด", fee: 0 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order).toMatchObject({ giftWrap: false, giftFee: 0, giftCardFee: 20, giftCardOnly: true, giftMessage: "สุขสันต์วันเกิด", grandTotal: 1070 });
    expect(tables.store_orders[0]).toMatchObject({ gift_wrap: false, gift_fee: 0, gift_card_fee: 20, gift_message: "สุขสันต์วันเกิด", grand_total: 1070 });
  });

  it("ห่อ + การ์ด: คิดทั้ง 2 อย่าง", async () => {
    const { db } = setup({ gift_enabled: "1", gift_fee: "59", card_enabled: "1", card_fee: "20" });
    const r = await createStorefrontOrder(db, SHOP, body({ wrap: true, addCard: true, message: "รักนะ" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order).toMatchObject({ giftWrap: true, giftFee: 59, giftCardFee: 20, giftCardOnly: true, grandTotal: 1129 });
  });

  it("ร้านปิดขายการ์ดแยก = ไม่รับ (บอกเหตุผล) · ไม่เลือกอะไร = ไม่มีค่าการ์ด", async () => {
    const off = setup({ card_enabled: "0", card_fee: "20" });
    const r = await createStorefrontOrder(off.db, SHOP, body({ addCard: true, message: "x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/การ์ด/);
    const none = setup({ card_enabled: "1", card_fee: "20" });
    const r2 = await createStorefrontOrder(none.db, SHOP, body());
    expect(r2.ok && r2.order).toMatchObject({ giftCardFee: 0, giftCardOnly: false, grandTotal: 1050 });
  });
});
