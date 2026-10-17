import { describe, it, expect } from "vitest";
import { createStorefrontOrder } from "../website-orders";
import { fakeDb, type Row } from "./fake-db";

/**
 * 🌐 ก้อน 6 — สั่งซื้อจากหน้าอังกฤษทั้งเส้นกับฐานข้อมูลจำลอง (ไม่แตะ DB จริง)
 * ออเดอร์จำภาษา · รายการเก็บชื่อไทย (พนักงาน) + อังกฤษ (ลูกค้า) · ชื่อสีจากทะเบียนสีกลาง · name_en ที่เป็นไทย = ไม่นับ
 */
type Db = Parameters<typeof createStorefrontOrder>[0];
const SHOP = { id: "shop-1", slug: "louis", field_map: null };
const P = "11111111-2222-3333-4444-555555555555";
const Q = "22222222-2222-3333-4444-555555555555";

function setup() {
  const tables: Record<string, Row[]> = {
    store_settings: [{ shop_id: SHOP.id, key: "pay_cod", value: "1" }],
    store_listings: [
      { shop_id: SHOP.id, parent_sku_id: P, is_published: true, web_price: 1000 },
      { shop_id: SHOP.id, parent_sku_id: Q, is_published: true, web_price: 500 },
    ],
    parent_skus_v2: [
      { id: P, code: "BP01", name_th: "กระเป๋าเป้", name_en: "Backpack", category_id: null },
      { id: Q, code: "TT01", name_th: "กระเป๋าผ้า", name_en: "กระเป๋าผ้า", category_id: null },
    ],
    skus_v2: [
      { id: "aaaaaaaa-0000-0000-0000-000000000001", parent_sku_id: P, code: "BP01-01", color: "กรมท่า", list_price: 1000, is_active: true, attribute_values: null },
      { id: "bbbbbbbb-0000-0000-0000-000000000002", parent_sku_id: Q, code: "TT01-01", color: "ดำ", list_price: 500, is_active: true, attribute_values: null },
    ],
    erp_color_dictionary: [{ id: "c1", th: "กรมท่า", en: "Navy", is_active: true }],
    store_orders: [],
    store_order_items: [],
  };
  return { tables, db: fakeDb(tables) as unknown as Db };
}

const body = (lang?: string) => ({
  items: [
    { productId: P, optionId: "sku-aaaaaaaa", qty: 1 },
    { productId: Q, optionId: "sku-bbbbbbbb", qty: 1 },
  ],
  customer: { name: "Anna", phone: "0812345678", email: "anna@example.test" },
  ship: { addressLine: "99/9 Sukhumvit" },
  paymentMethod: "cod",
  lang,
});

describe("createStorefrontOrder + 🌐 ภาษาลูกค้า", () => {
  it("หน้าอังกฤษ: ออเดอร์ lang=en · เก็บชื่อ 2 ภาษา · ลูกค้าเห็นอังกฤษ", async () => {
    const { tables, db } = setup();
    const r = await createStorefrontOrder(db, SHOP, body("en"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.orderId).toBeTruthy();
    expect(tables.store_orders[0]).toMatchObject({ lang: "en" });
    expect(tables.store_order_items[0]).toMatchObject({ name: "กระเป๋าเป้", variant_label: "กรมท่า", name_en: "Backpack", variant_label_en: "Navy" });
    // name_en กรอกเป็นไทย = ไม่ใช่ชื่ออังกฤษ · สีที่ไม่มีในทะเบียน = ไม่เก็บ (ใช้ไทย)
    expect(tables.store_order_items[1]).toMatchObject({ name: "กระเป๋าผ้า", name_en: null, variant_label_en: null });
    expect(r.order.lang).toBe("en");
    expect(r.order.items.map((i) => [i.name, i.variantLabel])).toEqual([["Backpack", "Navy"], ["กระเป๋าผ้า", "ดำ"]]);
  });

  it("หน้าไทย/ไม่ส่งภาษา: lang=th · ลูกค้าเห็นไทย (ชื่ออังกฤษยังเก็บไว้)", async () => {
    const { tables, db } = setup();
    const r = await createStorefrontOrder(db, SHOP, body());
    expect(r.ok && r.order.items[0].name).toBe("กระเป๋าเป้");
    expect(tables.store_orders[0]).toMatchObject({ lang: "th" });
    expect(tables.store_order_items[0]).toMatchObject({ name_en: "Backpack" });
  });
});
