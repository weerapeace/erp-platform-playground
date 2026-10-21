import { describe, it, expect } from "vitest";
import { createStorefrontOrder } from "../website-orders";
import { sanitizeTiers, tierPerkDiscount } from "../member-points";
import { fakeDb, type Row } from "./fake-db";

/** 🎁 สิทธิ์ตามระดับสมาชิก (ชุด 6 · 2026-10-22) — ลด % จากยอดหลังโปร ก่อนคูปอง + ส่งฟรี */
describe("🎁 กฎสิทธิ์ระดับ", () => {
  it("ส่วนลด = % ของยอด (ปัด 2 ตำแหน่ง) · ไม่มีระดับ/0% = 0 · เพดาน 50%", () => {
    expect(tierPerkDiscount(1000, { discountPct: 5 })).toBe(50);
    expect(tierPerkDiscount(999.99, { discountPct: 10 })).toBe(100);
    expect(tierPerkDiscount(1000, { discountPct: 0 })).toBe(0);
    expect(tierPerkDiscount(1000, null)).toBe(0);
    expect(tierPerkDiscount(1000, { discountPct: 90 })).toBe(500);
  });
  it("ตั้งระดับ: ส่วนลด 0–50 · ส่งฟรีต้องเป็น true เท่านั้น · ไม่ใส่ = 0", () => {
    const ok = sanitizeTiers([{ name: "Silver", minSpend: 5000, earnMultiplier: 1.5, discountPct: 5, freeShipping: true }, { name: "Member", minSpend: 0, earnMultiplier: 1 }]);
    expect(ok.ok && ok.tiers).toEqual([
      { key: "member", name: "Member", minSpend: 0, earnMultiplier: 1, color: "#9CA3AF", discountPct: 0, freeShipping: false },
      { key: "silver", name: "Silver", minSpend: 5000, earnMultiplier: 1.5, color: "#9CA3AF", discountPct: 5, freeShipping: true },
    ]);
    expect(sanitizeTiers([{ name: "Gold", minSpend: 0, earnMultiplier: 1, discountPct: 60 }])).toMatchObject({ ok: false });
  });
});

type Db = Parameters<typeof createStorefrontOrder>[0];
const SHOP = { id: "shop-1", slug: "louis", field_map: null };
const P = "11111111-2222-3333-4444-555555555555";
const MEMBER = "99999999-0000-0000-0000-000000000001";

function setup(opts: { points?: boolean; spend?: number } = {}) {
  const tables: Record<string, Row[]> = {
    store_settings: Object.entries({ shipping_flat: "60", free_shipping_min: "0", pay_cod: "1", pay_promptpay: "1", promptpay_number: "0812345678", points_enabled: opts.points === false ? "0" : "1" }).map(([key, value]) => ({ shop_id: SHOP.id, key, value })),
    store_listings: [{ shop_id: SHOP.id, parent_sku_id: P, is_published: true, web_name: "กระเป๋า", web_price: 1000, web_stock_status: "in" }],
    parent_skus_v2: [{ id: P, code: "BAG01", name: "กระเป๋า", category_id: null }],
    skus_v2: [{ id: "aaaaaaaa-0000-0000-0000-000000000001", parent_sku_id: P, code: "BAG01-01", color: "ดำ", list_price: 1000, is_active: true, attribute_values: null }],
    store_member_tiers: [
      { shop_id: SHOP.id, key: "member", name: "Member", min_spend: 0, earn_multiplier: 1, color: "#999999", discount_pct: 0, free_shipping: false },
      { shop_id: SHOP.id, key: "silver", name: "Silver", min_spend: 5000, earn_multiplier: 1.5, color: "#94A3B8", discount_pct: 10, free_shipping: true },
    ],
    store_orders: [],
    store_order_items: [],
  };
  const db = fakeDb(tables, {
    store_member_stats: (a) => (a.p_customers as string[]).map((id) => ({ customer_id: id, balance: 0, spend_12m: opts.spend ?? 6000, order_count: 1, order_total: opts.spend ?? 6000 })),
  }) as unknown as Db;
  return { tables, db };
}
const body = (extra: Record<string, unknown> = {}) => ({ items: [{ productId: P, qty: 1 }], customer: { name: "สมหญิง", phone: "0812345678" }, ship: { addressLine: "99/9 ถ.สุขุมวิท" }, paymentMethod: "promptpay", ...extra });

describe("createStorefrontOrder + 🎁 สิทธิ์ระดับ", () => {
  it("สมาชิก Silver: ลด 10% + ส่งฟรี · บันทึกบรรทัด 'สิทธิ์สมาชิก Silver −10%'", async () => {
    const { tables, db } = setup();
    const r = await createStorefrontOrder(db, SHOP, body(), { customerId: MEMBER });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order).toMatchObject({ subtotal: 1000, shippingFee: 0, discount: 100, grandTotal: 900 });
    expect(r.order.promos).toEqual([{ name: "สิทธิ์สมาชิก Silver −10%", amount: 100 }]);
    expect(tables.store_orders[0]).toMatchObject({ discount: 100, shipping_fee: 0, grand_total: 900 });
    expect((tables.store_orders[0].promos as { id: string }[])[0].id).toBe("member:silver");
  });

  it("ระดับเริ่มต้น (ไม่มีสิทธิ์) / ไม่ได้ล็อกอิน / ร้านปิดแต้ม = ราคาเดิม + ค่าส่งปกติ", async () => {
    const low = await createStorefrontOrder(setup({ spend: 100 }).db, SHOP, body(), { customerId: MEMBER });
    expect(low.ok && low.order).toMatchObject({ shippingFee: 60, discount: 0, grandTotal: 1060 });
    const guest = await createStorefrontOrder(setup().db, SHOP, body());
    expect(guest.ok && guest.order).toMatchObject({ shippingFee: 60, discount: 0, grandTotal: 1060 });
    const off = await createStorefrontOrder(setup({ points: false }).db, SHOP, body(), { customerId: MEMBER });
    expect(off.ok && off.order).toMatchObject({ shippingFee: 60, discount: 0, grandTotal: 1060 });
  });
});
