import { describe, it, expect } from "vitest";
import { createStorefrontOrder, toOrderView } from "../website-orders";
import { fakeDb, type Row } from "./fake-db";

/**
 * 🔤 ปั๊มชื่อ + 📸 ภาพรอยปั๊ม ณ ตอนสั่ง — สั่งซื้อทั้งเส้นกับฐานข้อมูลจำลอง (ไม่แตะ DB จริง)
 * กันบั๊ก: ภาพต้องเป็นรูปของสีที่สั่ง · ใช้ตำแหน่ง/มุมมองของค่าแยกสี (ถ้าตั้ง) · เอฟเฟกต์ของแบบที่เลือก · อ่านกลับในหน้าออเดอร์ได้
 */
type Db = Parameters<typeof createStorefrontOrder>[0];
const SHOP = { id: "shop-1", slug: "louis", field_map: null };
const P = "11111111-2222-3333-4444-555555555555";
const BLACK = "aaaaaaaa-0000-0000-0000-000000000001";
const RED = "bbbbbbbb-0000-0000-0000-000000000002";

function setup() {
  const pz = {
    enabled: true,
    styles: ["emboss", "gold"],
    positions: [
      { key: "center", enabled: true, x: 50, y: 52, size: 5, align: "center", skewX: 10 },
      { key: "right", enabled: false },
    ],
    // สีแดงตั้งค่าแยก: ตำแหน่ง/มุมมองต่างจากค่าหลัก
    colorOverrides: { [RED]: { positions: [{ key: "center", x: 61, y: 40, size: 6, rotate: -5, scaleY: 80 }] } },
  };
  const tables: Record<string, Row[]> = {
    store_settings: Object.entries({ shipping_flat: "50", free_shipping_min: "0", pay_cod: "1" }).map(([key, value]) => ({ shop_id: SHOP.id, key, value })),
    store_listings: [{ shop_id: SHOP.id, parent_sku_id: P, is_published: true, web_name: "กระเป๋าสตางค์", web_price: 790, web_personalize: pz }],
    parent_skus_v2: [{ id: P, code: "TTM130", name: "กระเป๋าสตางค์", category_id: null }],
    skus_v2: [
      { id: BLACK, parent_sku_id: P, code: "TTM130-01", color: "ดำ", list_price: 790, is_active: true, attribute_values: null, cover_image_r2_key: "skus/black.jpg" },
      { id: RED, parent_sku_id: P, code: "TTM130-02", color: "แดง", list_price: 790, is_active: true, attribute_values: null, cover_image_r2_key: "skus/red.jpg" },
    ],
    store_orders: [],
    store_order_items: [],
  };
  return { tables, db: fakeDb(tables) as unknown as Db };
}
const order = (optionId: string, style: string) => ({
  items: [{ productId: P, qty: 1, optionId, personalize: { text: "ANN", style, position: "center" } }],
  customer: { name: "สมหญิง", phone: "0812345678" },
  ship: { addressLine: "99/9 ถ.สุขุมวิท" },
  paymentMethod: "cod",
});

describe("createStorefrontOrder + 📸 ภาพรอยปั๊ม", () => {
  it("สีที่ตั้งค่าแยก: รูปของสีนั้น + ตำแหน่ง/มุมมองของสีนั้น + เอฟเฟกต์ทอง", async () => {
    const { tables, db } = setup();
    const r = await createStorefrontOrder(db, SHOP, order(`sku-${RED.slice(0, 8)}`, "gold"));
    expect(r.ok).toBe(true);
    const pz = tables.store_order_items[0].personalize as Record<string, unknown> & { preview: Record<string, unknown> };
    expect(pz).toMatchObject({ text: "ANN", style: "gold", position: "center" });
    expect(pz.preview).toMatchObject({ imageKey: "skus/red.jpg", pos: { key: "center", x: 61, y: 40, size: 6, rotate: -5, scaleY: 80, skewX: 0 } });
    expect(pz.preview.foilFx).toBeTruthy();
    expect(pz.preview.embossFx).toBeUndefined();
    // อ่านกลับในหน้าออเดอร์ (หลังบ้าน) ได้ภาพเดิม
    const view = toOrderView(tables.store_orders[0] as never, tables.store_order_items as never, null, "th");
    expect(view.items[0].personalize).toMatchObject({ text: "ANN", style: "gold", preview: { imageKey: "skus/red.jpg", pos: { x: 61 } } });
  });

  it("สีที่ไม่ได้แยกค่า: รูปของสีนั้น + ค่าหลัก (มุมมองเอียง 10°) + พิมพ์จม", async () => {
    const { tables, db } = setup();
    const r = await createStorefrontOrder(db, SHOP, order(`sku-${BLACK.slice(0, 8)}`, "emboss"));
    expect(r.ok).toBe(true);
    const pz = tables.store_order_items[0].personalize as { preview: Record<string, unknown> };
    expect(pz.preview).toMatchObject({ imageKey: "skus/black.jpg", pos: { x: 50, y: 52, skewX: 10, scaleY: 100 } });
    expect(pz.preview.embossFx).toBeTruthy();
  });

  it("ออเดอร์เก่า (ไม่มีภาพ) อ่านได้ ไม่พัง", () => {
    const view = toOrderView({ order_no: "X", status: "pending", payment_method: "cod", payment_status: "unpaid", customer_name: "", customer_phone: "", subtotal: 0, shipping_fee: 0, discount: 0, grand_total: 0, note: null, created_at: "" } as never, [{ name: "a", variant_label: null, unit_price: 1, qty: 1, line_total: 1, personalize: { text: "BOB", style: "emboss", position: "right" } }], null, "th");
    expect(view.items[0].personalize).toEqual({ text: "BOB", style: "emboss", position: "right", preview: null });
  });
});
