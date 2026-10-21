import { describe, it, expect } from "vitest";
import { createStorefrontOrder } from "../website-orders";
import { fakeDb, type Row } from "./fake-db";

/**
 * 🔒 ร้านปิดเว็บอยู่ = ไม่รับคำสั่งซื้อ (audit 2026-10-21) — ฐานข้อมูลจำลอง ไม่แตะ DB จริง
 * เช็กก่อนตรวจข้อมูลออเดอร์ → ทดสอบบนเว็บจริงด้วยข้อมูลไม่ครบได้โดยไม่มีออเดอร์ถูกสร้าง
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

const body = () => ({
  items: [{ productId: P, qty: 1 }],
  customer: { name: "สมหญิง", phone: "0812345678" },
  ship: { addressLine: "99/9 ถ.สุขุมวิท" },
  paymentMethod: "cod",
});

describe("createStorefrontOrder + ร้านปิดเว็บ", () => {
  it("ปิดเว็บอยู่ → 403 ไม่สร้างออเดอร์", async () => {
    const { tables, db } = setup({ site_closed: "1" });
    const r = await createStorefrontOrder(db, SHOP, body());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
    expect(tables.store_orders.length).toBe(0);
  });

  it("ปิดเว็บ + ข้อมูลไม่ครบ → ตอบ 403 (ไม่ใช่ 400) = เช็กก่อนตรวจข้อมูล", async () => {
    const { db } = setup({ site_closed: "1" });
    const r = await createStorefrontOrder(db, SHOP, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("ทดลองสั่งผ่านลิงก์พรีวิว (allowClosed) → สั่งได้", async () => {
    const { tables, db } = setup({ site_closed: "1" });
    const r = await createStorefrontOrder(db, SHOP, body(), { allowClosed: true });
    expect(r.ok).toBe(true);
    expect(tables.store_orders.length).toBe(1);
  });

  it("เปิดเว็บปกติ → สั่งได้เหมือนเดิม", async () => {
    const { tables, db } = setup({});
    const r = await createStorefrontOrder(db, SHOP, body());
    expect(r.ok).toBe(true);
    expect(tables.store_orders.length).toBe(1);
  });
});
