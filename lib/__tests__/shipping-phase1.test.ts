import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isKnownCourier, labelSizeOf, normalizeCourier, productsForBooking, shippopBookAndConfirm, statusFromWebhook, isDropOffCourier, courierLabel, type BookItem } from "../shippop";
import { boxOfItems, orderCenterShippingForce, orderCenterShippingMode, newShipping } from "../order-shipping";
import { shippingStatusPatch } from "../shipping/order-status-db";
import { shippingProvider } from "../shipping/provider";
import { shippingCostThb } from "../shipping/cost";

/** 🚚 เฟส 1 SHIPPOP (2026-11-19) — ตรวจกับคู่มือทางการแล้ว: COD ต้องมี product[] · ECP ไม่มี · cancel จาก webhook อาจชั่วคราว */

const ENV_KEYS = ["SHIPPOP_API_KEY", "SHIPPOP_ENV", "SHIPPOP_EMAIL", "SHIPPOP_ORDER_CENTER_LIVE"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } vi.unstubAllGlobals(); });

const addr = { name: "ร้าน", address: "1", district: "ก", state: "ข", province: "กรุงเทพมหานคร", postcode: "10110", tel: "0811111111" };
const item = (o: Partial<BookItem> = {}): BookItem => ({ key: "o1", from: addr, to: addr, parcel: { name: "ออเดอร์ M1", weight: 450, width: 20, length: 30, height: 10 }, courierCode: "FLE", codAmount: 0, ref: "M1", ...o });

describe("🔐 สวิตช์โหมดศูนย์ออเดอร์ — กุญแจจริงต้องเปิดเอง", () => {
  it("ไม่มีกุญแจ = จำลอง · กุญแจทดลอง = ระบบทดลอง · กุญแจจริง = จำลองจนตั้ง SHIPPOP_ORDER_CENTER_LIVE=1", () => {
    expect(orderCenterShippingForce({})).toBe("sim");
    expect(orderCenterShippingMode({})).toBe("sim");
    expect(orderCenterShippingForce({ SHIPPOP_API_KEY: "k" })).toBeUndefined();
    expect(orderCenterShippingMode({ SHIPPOP_API_KEY: "k" })).toBe("sandbox");
    expect(orderCenterShippingForce({ SHIPPOP_API_KEY: "k", SHIPPOP_ENV: "prod" })).toBe("sim");
    expect(orderCenterShippingMode({ SHIPPOP_API_KEY: "k", SHIPPOP_ENV: "prod" })).toBe("sim");
    expect(orderCenterShippingForce({ SHIPPOP_API_KEY: "k", SHIPPOP_ENV: "prod", SHIPPOP_ORDER_CENTER_LIVE: "1" })).toBeUndefined();
    expect(orderCenterShippingMode({ SHIPPOP_API_KEY: "k", SHIPPOP_ENV: "prod", SHIPPOP_ORDER_CENTER_LIVE: "1" })).toBe("prod");
    expect(orderCenterShippingForce({ SHIPPOP_API_KEY: " ", SHIPPOP_ENV: "prod", SHIPPOP_ORDER_CENTER_LIVE: "1" })).toBe("sim");
  });
  it("จองระบบทดลอง = ติดป้าย sandbox · ค่าส่งที่บันทึก = ฿0", () => {
    expect(newShipping({ mode: "live", sandbox: true, purchaseId: "1", trackingCode: "SP1", courierCode: "FLE", codAmount: 0, at: "t" }).sandbox).toBe(true);
    expect(newShipping({ mode: "sim", sandbox: true, purchaseId: "1", trackingCode: "SIM1", courierCode: "FLE", codAmount: 0, at: "t" }).sandbox).toBeUndefined();
    expect(shippingCostThb(38.5, true)).toBe(0);
    expect(shippingCostThb(38.5, false)).toBe(38.5);
  });
});

describe("📦 กล่องจากสินค้า", () => {
  it("เลือกกล่องปริมาตรใหญ่สุด · นับรายการที่ไม่มีกล่อง · หลายชิ้น = เตือน", () => {
    const C = { width_cm: 20, length_cm: 30, height_cm: 10, name: "C" };
    const D = { width_cm: 22, length_cm: 35, height_cm: 14, name: "D" };
    expect(boxOfItems([{ qty: 1, box: C }])).toEqual({ box: "20x30x10", name: "C", missing: 0, multi: false });
    expect(boxOfItems([{ qty: 1, box: C }, { qty: 2, box: D }, { qty: 1, box: null }])).toEqual({ box: "22x35x14", name: "D", missing: 1, multi: true });
    expect(boxOfItems([{ qty: 1, box: { width_cm: 0, length_cm: 30, height_cm: 10 } }]).box).toBeNull();
    expect(boxOfItems([]).box).toBeNull();
  });
});

describe("🚚 รหัสขนส่ง + ใบปะหน้า (ตามคู่มือ)", () => {
  it("ECP (ไม่มีในคู่มือ) → THP · drop-off = DS/KRYS", () => {
    expect(normalizeCourier("ECP")).toBe("THP");
    expect(normalizeCourier(" fle ")).toBe("FLE");
    expect(isKnownCourier("ECP")).toBe(true);
    expect(isKnownCourier("NOPE")).toBe(false);
    expect(courierLabel("ECP")).toContain("ไปรษณีย์");
    expect(isDropOffCourier("KRYDS")).toBe(true);
    expect(isDropOffCourier("KRYS")).toBe(true);
    expect(isDropOffCourier("FLE")).toBe(false);
  });
  it("ขนาดใบปะหน้า: รู้จัก = ใช้ · ไม่รู้จัก = สติกเกอร์ 4×6", () => {
    expect(labelSizeOf("A4")).toBe("A4");
    expect(labelSizeOf("100x150")).toBe("sticker4x6");
    expect(labelSizeOf(null)).toBe("sticker4x6");
  });
  it("ชั้นกลางขนส่ง: ไม่ระบุ/ไม่รู้จัก = SHIPPOP", () => {
    expect(shippingProvider().code).toBe("shippop");
    expect(shippingProvider("xyz").code).toBe("shippop");
  });
});

describe("💵 COD ต้องส่งรายการสินค้า (คู่มือบังคับ)", () => {
  it("มีรายการ = ใช้ (ตัดช่องว่าง/ปัดเลข) · COD ไม่มีรายการ = 1 บรรทัด · ไม่ COD ไม่มีรายการ = ไม่ส่ง", () => {
    expect(productsForBooking(item({ products: [{ product_code: "LM1", name: "  กระเป๋า   หนัง ", price: 890.456, amount: 2, weight: 300 }] })))
      .toEqual([{ product_code: "LM1", name: "กระเป๋า หนัง", price: 890.46, amount: 2, weight: 300 }]);
    expect(productsForBooking(item({ codAmount: 1290 }))).toEqual([{ product_code: "M1", name: "ออเดอร์ M1", price: 1290, amount: 1, weight: 450 }]);
    expect(productsForBooking(item())).toBeUndefined();
    expect(productsForBooking(item({ products: [{ product_code: "x", name: "x", price: 1, amount: 0, weight: 1 }] }))).toBeUndefined();
  });

  it("จองจริง (ระบบทดลอง): ส่ง product + รหัสขนส่งที่แก้แล้ว · บัญชีเติมเงินก่อน = แจ้งชัด", async () => {
    process.env.SHIPPOP_API_KEY = "test-key";
    const bodies: Record<string, unknown>[] = [];
    let prepaid = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      bodies.push(body);
      expect(url.startsWith("https://mkpservice.shippop.dev/")).toBe(true);   // ไม่ตั้ง SHIPPOP_ENV = ระบบทดลองเสมอ
      const j = url.endsWith("/booking/")
        ? { status: true, purchase_id: 77, ...(prepaid ? { payment_url: "https://pay" } : {}), data: { "0": { status: true, tracking_code: "SP1", price: "52" } } }
        : { status: true, result: { "0": { status: true, courier_tracking_code: "TH1" } } };
      return { ok: true, json: async () => j } as unknown as Response;
    }));
    const r = await shippopBookAndConfirm([item({ courierCode: "ECP", codAmount: 1290 })]);
    expect(r.mode).toBe("live");
    expect(r.results[0]).toMatchObject({ ok: true, trackingCode: "SP1", courierTrackingCode: "TH1", price: 52 });
    const data = (bodies[0].data as Record<string, unknown>[])[0];
    expect(data.courier_code).toBe("THP");
    expect(data.cod_amount).toBe(1290);
    expect(Array.isArray(data.product)).toBe(true);
    prepaid = true;
    await expect(shippopBookAndConfirm([item()])).rejects.toThrow(/เติมเงินก่อน/);
  });
});

describe("📬 สถานะจาก webhook", () => {
  it("cancel จาก webhook = จดประวัติแต่คงสถานะเดิม (กันจองซ้ำ) · สถานะอื่น = ใช้ตามจริง", () => {
    expect(statusFromWebhook("booking", "cancel").status).toBe("booking");
    expect(statusFromWebhook("booking", "cancel").note).toMatch(/ชั่วคราว/);
    expect(statusFromWebhook("cancel", "cancel")).toEqual({ status: "cancel" });
    expect(statusFromWebhook("booking", "shipping")).toEqual({ status: "shipping" });
  });

  it("ศูนย์ออเดอร์: ขนส่งรับ = ส่งแล้ว · cancel จาก webhook ไม่ปลด · ออเดอร์จากเมลไม่แตะสถานะ", () => {
    const sh = newShipping({ mode: "live", purchaseId: "1", trackingCode: "SP1", courierCode: "FLE", codAmount: 0, at: "t0" });
    const p = shippingStatusPatch({ status: "packed", source: "manual", shipping: sh }, "shipping", "t1", "รับแล้ว", { fromWebhook: true })!;
    expect(p.orderStatus).toBe("shipped");
    expect((p.patch.shipping as { status: string }).status).toBe("shipping");
    const c = shippingStatusPatch({ status: "packed", source: "manual", shipping: sh }, "cancel", "t1", undefined, { fromWebhook: true })!;
    expect(c.stored).toBe("booking");
    expect(c.orderStatus).toBeNull();
    const hist = (c.patch.shipping as { history: { status: string; note?: string }[] }).history;
    expect(hist.at(-1)).toMatchObject({ status: "cancel" });
    expect(hist.at(-1)?.note).toMatch(/ชั่วคราว/);
    expect(shippingStatusPatch({ status: "packed", source: "email", shipping: sh }, "shipping", "t1", undefined, { fromWebhook: true })!.orderStatus).toBeNull();
    expect(shippingStatusPatch({ status: "packed", source: "manual", shipping: null }, "shipping", "t1", undefined, { fromWebhook: true })).toBeNull();
  });
});
