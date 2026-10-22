import { describe, it, expect, beforeEach } from "vitest";
import { orderStatusFromShippop, parseBox, shippopBookAndConfirm, shippopMode, shippopQuote, telOf, type ShippopInfo } from "../shippop";
import { applyShippopStatus, bookItemOf, senderOf, type ShippopOrderRow } from "../shippop-db";
import { DEFAULT_SITE_INFO } from "../website-site-info";
import { fakeDb, type Row } from "./fake-db";

/** 🚚 Shippop (ชุด 9 · 2026-10-22) — ยังไม่มี API KEY = โหมดจำลอง */
beforeEach(() => {
  delete process.env.SHIPPOP_API_KEY;
});

const info = {
  ...DEFAULT_SITE_INFO,
  shippop_enabled: true,
  shippop_from_name: "ร้านหลุยส์",
  shippop_from_tel: "+66 81-111-1111",
  shippop_from_address: "99 ถ.พระราม 2",
  shippop_from_district: "แสมดำ",
  shippop_from_state: "บางขุนเทียน",
  shippop_from_province: "กรุงเทพมหานคร",
  shippop_from_postcode: "10150",
};
const order = (o: Partial<ShippopOrderRow> = {}): ShippopOrderRow => ({
  id: "o-1",
  shop_id: "s-1",
  order_no: "LM-0001",
  status: "preparing",
  payment_method: "cod",
  payment_status: "unpaid",
  grand_total: 1290,
  deposit_amount: null,
  customer_name: "อร",
  customer_phone: "081-234-5678",
  ship_address_line: "12/3 ซ.สุขุมวิท 31",
  ship_subdistrict: "คลองตันเหนือ",
  ship_district: "วัฒนา",
  ship_province: "กรุงเทพมหานคร",
  ship_postal: "10110",
  tracking_no: null,
  tracking_carrier: null,
  shippop: null,
  ...o,
});

describe("🚚 กฎ Shippop", () => {
  it("กล่อง/เบอร์/สถานะ", () => {
    expect(parseBox("25 x 35 x 12")).toEqual({ width: 25, length: 35, height: 12 });
    expect(parseBox("อะไรก็ไม่รู้")).toEqual({ width: 20, length: 30, height: 10 });
    expect(telOf("+66 81-111-1111")).toBe("0811111111");
    expect(orderStatusFromShippop("shipping")).toBe("shipped");
    expect(orderStatusFromShippop("complete")).toBe("completed");
    expect(orderStatusFromShippop("problem")).toBeNull();
    expect(shippopMode()).toBe("sim");
  });
  it("ที่อยู่ผู้ส่งต้องครบ · ผู้รับต้องมีที่อยู่/จังหวัด/รหัสไปรษณีย์", () => {
    expect(senderOf({ ...info, shippop_from_postcode: "" })).toMatchObject({ ok: false, error: expect.stringContaining("รหัสไปรษณีย์") });
    const s = senderOf(info);
    expect(s.ok && s.from).toMatchObject({ tel: "0811111111", postcode: "10150", district: "แสมดำ", state: "บางขุนเทียน" });
    if (!s.ok) return;
    expect(bookItemOf(order({ ship_postal: "" }), s.from, info, { courierCode: "FLE", qty: 1 })).toMatchObject({ ok: false });
  });
  it("เก็บปลายทางที่ยังไม่จ่าย = cod เท่ายอด · จ่ายแล้ว/โอน = 0 · น้ำหนัก = ต่อชิ้น × จำนวน", () => {
    const s = senderOf(info);
    if (!s.ok) throw new Error("sender");
    const a = bookItemOf(order(), s.from, info, { courierCode: "FLE", qty: 3 });
    expect(a.ok && a.item).toMatchObject({ codAmount: 1290, parcel: { weight: 1500, width: 20, length: 30, height: 10 }, to: { district: "คลองตันเหนือ", state: "วัฒนา", postcode: "10110", tel: "0812345678" } });
    const b = bookItemOf(order({ payment_method: "promptpay", payment_status: "paid" }), s.from, info, { courierCode: "FLE", qty: 1, weight: 800 });
    expect(b.ok && b.item).toMatchObject({ codAmount: 0, parcel: { weight: 800 } });
  });
  it("โหมดจำลอง: ดูราคา + จองได้เลข SIM โดยไม่เรียก Shippop", async () => {
    const s = senderOf(info);
    if (!s.ok) throw new Error("sender");
    const q = await shippopQuote(s.from, s.from, { name: "x", weight: 1000, width: 20, length: 30, height: 10 });
    expect(q.length).toBeGreaterThan(3);
    const it = bookItemOf(order(), s.from, info, { courierCode: "FLE", qty: 1 });
    if (!it.ok) throw new Error("item");
    const r = await shippopBookAndConfirm([it.item]);
    expect(r.mode).toBe("sim");
    expect(r.results[0]).toMatchObject({ key: "o-1", ok: true, trackingCode: expect.stringMatching(/^SIM/) });
  });
});

describe("📬 สถานะจาก Shippop (applyShippopStatus)", () => {
  const sp: ShippopInfo = { mode: "sim", purchaseId: "P1", trackingCode: "SIM1", courierCode: "FLE", courierTrackingCode: "SIMTH1", price: 38, codAmount: 0, status: "booking", bookedAt: "2026-10-22T00:00:00Z", history: [] };
  it("ขนส่งรับ = จัดส่งแล้ว · ส่งถึง = สำเร็จ + เวลาได้รับของ · เดินหน้าอย่างเดียว · ยกเลิกแล้วไม่แตะ", async () => {
    const tables: Record<string, Row[]> = { store_orders: [{ id: "o-1", status: "preparing" }] };
    const db = fakeDb(tables) as unknown as Parameters<typeof applyShippopStatus>[0];
    expect(await applyShippopStatus(db, order({ shippop: sp }), "shipping", "2026-10-22T01:00:00Z", undefined, "test")).toEqual({ orderStatus: "shipped" });
    expect(tables.store_orders[0]).toMatchObject({ status: "shipped", shippop: { status: "shipping" } });
    expect(await applyShippopStatus(db, order({ status: "shipped", shippop: sp }), "complete", "2026-10-23T01:00:00Z", undefined, "test")).toEqual({ orderStatus: "completed" });
    expect(tables.store_orders[0].completed_at).toBeTruthy();
    expect(await applyShippopStatus(db, order({ status: "completed", shippop: sp }), "shipping", "x", undefined, "test")).toEqual({ orderStatus: null });
    expect(await applyShippopStatus(db, order({ status: "cancelled", shippop: sp }), "complete", "x", undefined, "test")).toEqual({ orderStatus: null });
  });
});
