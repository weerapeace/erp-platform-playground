import { describe, it, expect } from "vitest";
import { createStorefrontOrder } from "../website-orders";
import { fakeDb, type Row } from "./fake-db";

/**
 * 🖨 ลายรีด — สั่งซื้อทั้งเส้นกับฐานข้อมูลจำลอง (ไม่แตะ DB จริง)
 * ราคาเพิ่มเอาจากแถวแบบ (ไม่เชื่อหน้าเว็บ) · แบบต้องตรงรุ่น/สี · ใช้ซ้ำไม่ได้ · มีรูปอัปเอง = เข้าคิวรอตรวจลาย · ลายคลังล้วน = อนุมัติเอง
 */
type Db = Parameters<typeof createStorefrontOrder>[0];
const SHOP = { id: "shop-1", slug: "pixie", field_map: null };
const P = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";
const BLUE = "aaaaaaaa-0000-0000-0000-000000000001";
const D_UP = "dddddddd-0000-4000-8000-000000000001";
const D_LIB = "dddddddd-0000-4000-8000-000000000002";
const D_USED = "dddddddd-0000-4000-8000-000000000003";

function setup() {
  const design = (id: string, extra: number, hasUpload: boolean, status = "draft", parent = P) => ({
    id, shop_id: SHOP.id, parent_sku_id: parent, option_id: `sku-${BLUE.slice(0, 8)}`, code: `CODE-${id.slice(-4)}`, method: "DTF",
    placements: [{ zone: "front", kind: hasUpload ? "upload" : "lib", name: "ลาย", x: 5, y: 5, w: 6, h: 6, rot: 0 }], zones: [],
    extra_price: extra, has_upload: hasUpload, status, review_status: null, review_note: null, reviewed_at: null, order_ref: null, ordered_at: null, uploads_purged_at: null, created_at: "2026-10-30",
  });
  const tables: Record<string, Row[]> = {
    store_settings: Object.entries({ shipping_flat: "50", free_shipping_min: "0", pay_cod: "1" }).map(([key, value]) => ({ shop_id: SHOP.id, key, value })),
    store_listings: [{ shop_id: SHOP.id, parent_sku_id: P, is_published: true, web_name: "กระเป๋าผ้า", web_price: 390 }],
    parent_skus_v2: [{ id: P, code: "TOTE01", name: "กระเป๋าผ้า", category_id: null }],
    skus_v2: [{ id: BLUE, parent_sku_id: P, code: "TOTE01-BL", color: "ฟ้า", list_price: 390, is_active: true, attribute_values: null, cover_image_r2_key: null }],
    store_print_designs: [design(D_UP, 110, true), design(D_LIB, 60, false), design(D_USED, 40, false, "ordered")],
    store_orders: [],
    store_order_items: [],
  };
  return { tables, db: fakeDb(tables) as unknown as Db };
}
const order = (items: Record<string, unknown>[]) => ({ items, customer: { name: "มินตรา", phone: "0812345678" }, ship: { addressLine: "99/9 ถ.สุขุมวิท" }, paymentMethod: "cod" });
const line = (printDesignId: string, qty = 1) => ({ productId: P, optionId: `sku-${BLUE.slice(0, 8)}`, qty, printDesignId });

describe("createStorefrontOrder + 🖨 ลายรีด", () => {
  it("ราคาต่อชิ้น = กระเป๋า + ค่ารีดจากแบบ · ผูกแบบ · มีรูปอัปเอง = รอตรวจลาย", async () => {
    const { tables, db } = setup();
    const r = await createStorefrontOrder(db, SHOP, order([line(D_UP, 2)]));
    expect(r.ok).toBe(true);
    const it = tables.store_order_items[0];
    expect(it).toMatchObject({ unit_price: 500, qty: 2, line_total: 1000, print_design_id: D_UP });
    expect(String(it.variant_label)).toContain("ลายรีด DTF 1 ลาย");
    const d = tables.store_print_designs.find((x) => x.id === D_UP)!;
    expect(d).toMatchObject({ status: "ordered", review_status: "pending" });
    expect(d.order_ref).toBeTruthy();
  });

  it("ลายคลังร้านล้วน = อนุมัติอัตโนมัติ", async () => {
    const { tables, db } = setup();
    expect((await createStorefrontOrder(db, SHOP, order([line(D_LIB)]))).ok).toBe(true);
    expect(tables.store_print_designs.find((x) => x.id === D_LIB)).toMatchObject({ status: "ordered", review_status: "approved" });
  });

  it("ปฏิเสธ: แบบที่สั่งไปแล้ว · แบบของรุ่นอื่น · แบบเดียวกัน 2 รายการ · แบบที่ไม่มี", async () => {
    const { db, tables } = setup();
    expect(await createStorefrontOrder(db, SHOP, order([line(D_USED)]))).toMatchObject({ ok: false, status: 409 });
    tables.store_print_designs.push({ ...tables.store_print_designs[1], id: "dddddddd-0000-4000-8000-000000000009", parent_sku_id: OTHER });
    expect(await createStorefrontOrder(db, SHOP, order([line("dddddddd-0000-4000-8000-000000000009")]))).toMatchObject({ ok: false, status: 409 });
    expect(await createStorefrontOrder(db, SHOP, order([line(D_LIB), line(D_LIB)]))).toMatchObject({ ok: false, status: 409 });
    expect(await createStorefrontOrder(db, SHOP, order([line("dddddddd-0000-4000-8000-0000000000ff")]))).toMatchObject({ ok: false, status: 409 });
    expect(tables.store_order_items).toHaveLength(0);
  });

  it("รายการปกติ (ไม่มีลาย) ไม่เปลี่ยน", async () => {
    const { tables, db } = setup();
    expect((await createStorefrontOrder(db, SHOP, order([{ productId: P, optionId: `sku-${BLUE.slice(0, 8)}`, qty: 1 }]))).ok).toBe(true);
    expect(tables.store_order_items[0]).toMatchObject({ unit_price: 390 });
    expect(tables.store_order_items[0].print_design_id).toBeUndefined();
  });
});
