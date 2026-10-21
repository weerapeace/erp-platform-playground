import { describe, it, expect } from "vitest";
import { amountDue, createStorefrontOrder, depositFor, paidNext } from "../website-orders";
import { fakeDb, type Row } from "./fake-db";

/** 📦 มัดจำพรีออเดอร์ (ชุด 3b · 2026-10-22) — ยอดมัดจำ · ยอดที่ต้องโอนแต่ละรอบ · สถานะหลังสลิปผ่าน · สั่งซื้อทั้งเส้น */
const ON = { preorder_deposit_enabled: true, preorder_deposit_pct: 30 };

describe("มัดจำ: กฎ", () => {
  it("ร้านเปิด + มีของพรีออเดอร์ = % ของยอดรวม · ไม่เข้าเงื่อนไข = 0", () => {
    expect(depositFor(ON, true, 1000)).toBe(300);
    expect(depositFor(ON, true, 999.99)).toBe(300);
    expect(depositFor(ON, false, 1000)).toBe(0);
    expect(depositFor({ ...ON, preorder_deposit_enabled: false }, true, 1000)).toBe(0);
    expect(depositFor({ ...ON, preorder_deposit_pct: 5 }, true, 1000)).toBe(100);
  });

  it("ยอดที่ต้องโอนรอบนี้: มัดจำ → ที่เหลือ → 0", () => {
    const o = { grand_total: 1000, deposit_amount: 300 };
    expect(amountDue({ ...o, payment_status: "unpaid" })).toBe(300);
    expect(amountDue({ ...o, payment_status: "verifying" })).toBe(300);
    expect(amountDue({ ...o, payment_status: "partial" })).toBe(700);
    expect(amountDue({ ...o, payment_status: "paid" })).toBe(0);
    expect(amountDue({ grand_total: 1000, deposit_amount: null, payment_status: "unpaid" })).toBe(1000);
  });

  it("สลิปผ่าน: มัดจำที่ยังไม่จ่าย → มัดจำแล้ว · มัดจำแล้ว/ออเดอร์ปกติ → ชำระแล้ว", () => {
    expect(paidNext({ grand_total: 1000, deposit_amount: 300, payment_status: "verifying" })).toBe("partial");
    expect(paidNext({ grand_total: 1000, deposit_amount: 300, payment_status: "partial" })).toBe("paid");
    expect(paidNext({ grand_total: 1000, deposit_amount: null, payment_status: "unpaid" })).toBe("paid");
  });
});

type Db = Parameters<typeof createStorefrontOrder>[0];
const SHOP = { id: "shop-1", slug: "louis", field_map: null };
const P = "11111111-2222-3333-4444-555555555555";

function setup(stock: string, settings: Record<string, string>) {
  const tables: Record<string, Row[]> = {
    store_settings: Object.entries({ shipping_flat: "0", free_shipping_min: "0", pay_cod: "1", pay_promptpay: "1", promptpay_number: "0812345678", ...settings }).map(([key, value]) => ({ shop_id: SHOP.id, key, value })),
    store_listings: [{ shop_id: SHOP.id, parent_sku_id: P, is_published: true, web_name: "กระเป๋าพรีออเดอร์", web_price: 1000, web_stock_status: stock }],
    parent_skus_v2: [{ id: P, code: "PRE01", name: "กระเป๋า", category_id: null }],
    skus_v2: [{ id: "aaaaaaaa-0000-0000-0000-000000000001", parent_sku_id: P, code: "PRE01-01", color: "ดำ", list_price: 1000, is_active: true, attribute_values: null }],
    store_orders: [],
    store_order_items: [],
  };
  return { tables, db: fakeDb(tables) as unknown as Db };
}
const body = (paymentMethod: string) => ({ items: [{ productId: P, qty: 1 }], customer: { name: "สมหญิง", phone: "0812345678" }, ship: { addressLine: "99/9 ถ.สุขุมวิท" }, paymentMethod });

describe("createStorefrontOrder + 📦 มัดจำ", () => {
  it("พรีออเดอร์ + โอนพร้อมเพย์: เก็บมัดจำ 30% · ยอดที่ต้องโอนตอนนี้ = มัดจำ", async () => {
    const { tables, db } = setup("preorder", { preorder_deposit_enabled: "1", preorder_deposit_pct: "30" });
    const r = await createStorefrontOrder(db, SHOP, body("promptpay"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order).toMatchObject({ grandTotal: 1000, depositAmount: 300, amountDue: 300 });
    expect(tables.store_orders[0]).toMatchObject({ deposit_amount: 300, grand_total: 1000 });
  });

  it("พรีออเดอร์ + เก็บปลายทาง (ร้านเปิดมัดจำ) = ไม่รับ บอกให้โอน", async () => {
    const { tables, db } = setup("preorder", { preorder_deposit_enabled: "1" });
    const r = await createStorefrontOrder(db, SHOP, body("cod"));
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(tables.store_orders).toHaveLength(0);
  });

  it("ร้านปิดมัดจำ / สินค้าปกติ = จ่ายเต็มเหมือนเดิม", async () => {
    const a = setup("preorder", { preorder_deposit_enabled: "0" });
    const ra = await createStorefrontOrder(a.db, SHOP, body("cod"));
    expect(ra.ok && ra.order.amountDue).toBe(1000);
    expect(a.tables.store_orders[0].deposit_amount).toBeNull();
    const b = setup("in", { preorder_deposit_enabled: "1" });
    const rb = await createStorefrontOrder(b.db, SHOP, body("promptpay"));
    expect(rb.ok && rb.order.depositAmount).toBeUndefined();
  });
});
