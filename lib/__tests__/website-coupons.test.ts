import { describe, it, expect } from "vitest";
import { couponLabel, evaluateCoupon, normalizeCouponCode, sanitizeCouponInput, type StoreCoupon } from "../website-coupons";

/**
 * 🎟️ คูปองส่วนลด — กฎกลางคิดเงิน (ยอดออเดอร์จริงขึ้นกับตัวนี้)
 *  - คิดเป็นสตางค์ผ่าน lib/money · ลดเฉพาะค่าสินค้า ไม่เกินยอด · % มีเพดาน
 *  - เงื่อนไขครบ: ปิด/ยังไม่เริ่ม/หมดอายุ/ครบจำนวน/ยอดขั้นต่ำ/เบอร์ละครั้ง/ลูกค้าใหม่
 */
const base: StoreCoupon = {
  id: "c1",
  shopId: "s1",
  code: "WELCOME10",
  kind: "percent",
  value: 10,
  minSubtotal: 0,
  maxDiscount: null,
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  perPhoneOnce: true,
  newCustomersOnly: false,
  active: true,
  note: "",
};
const fresh = { usedCount: 0, phoneUsed: false, phoneHasOrders: false };
const NOW = new Date("2026-10-14T12:00:00Z");

describe("คิดส่วนลด", () => {
  it("เปอร์เซ็นต์ ปัดเป็นสตางค์ (half-up)", () => {
    expect(evaluateCoupon(base, 1234.55, fresh, NOW)).toEqual({ ok: true, discount: 123.46, label: "ลด 10%" });
  });
  it("เปอร์เซ็นต์มีเพดาน", () => {
    const r = evaluateCoupon({ ...base, maxDiscount: 100 }, 5000, fresh, NOW);
    expect(r.ok && r.discount).toBe(100);
  });
  it("จำนวนบาท ไม่เกินยอดสินค้า (ไม่ติดลบ)", () => {
    expect(evaluateCoupon({ ...base, kind: "fixed", value: 150 }, 990, fresh, NOW)).toMatchObject({ ok: true, discount: 150 });
    expect(evaluateCoupon({ ...base, kind: "fixed", value: 500 }, 120, fresh, NOW)).toMatchObject({ ok: true, discount: 120 });
  });
});

describe("เงื่อนไขใช้ไม่ได้ = บอกเหตุผลภาษาคน", () => {
  const err = (c: Partial<StoreCoupon>, sub = 1000, u = fresh) => {
    const r = evaluateCoupon({ ...base, ...c }, sub, u, NOW);
    return r.ok ? "" : r.error;
  };
  it("ปิด / ยังไม่เริ่ม / หมดอายุ", () => {
    expect(err({ active: false })).toContain("ปิดใช้งาน");
    expect(err({ startsAt: "2026-11-01T00:00:00Z" })).toContain("ยังไม่เริ่ม");
    expect(err({ endsAt: "2026-10-01T00:00:00Z" })).toContain("หมดอายุ");
  });
  it("ครบจำนวน / ยอดขั้นต่ำ", () => {
    expect(err({ usageLimit: 5 }, 1000, { ...fresh, usedCount: 5 })).toContain("ครบจำนวน");
    expect(err({ minSubtotal: 1500 }, 1000)).toContain("฿1,500");
  });
  it("เบอร์ละครั้ง / เฉพาะลูกค้าใหม่", () => {
    expect(err({}, 1000, { ...fresh, phoneUsed: true })).toContain("ใช้โค้ดนี้ไปแล้ว");
    expect(err({ perPhoneOnce: false }, 1000, { ...fresh, phoneUsed: true })).toBe("");
    expect(err({ newCustomersOnly: true }, 1000, { ...fresh, phoneHasOrders: true })).toContain("ครั้งแรก");
  });
});

describe("ข้อมูลจากหน้าจอ ERP", () => {
  it("โค้ดพิมพ์เล็ก/มีช่องว่าง → ตัวใหญ่ติดกัน", () => {
    expect(normalizeCouponCode(" welcome 10 ")).toBe("WELCOME10");
    expect(normalizeCouponCode("ลด10%")).toBe("10");
  });
  it("ตรวจครบ: โค้ด/ชนิด/มูลค่า/% เกิน 90/วันที่", () => {
    expect(sanitizeCouponInput({ code: "ab", kind: "percent", value: 10 }).ok).toBe(false);
    expect(sanitizeCouponInput({ code: "NEW10", value: 10 }).ok).toBe(false);
    expect(sanitizeCouponInput({ code: "NEW10", kind: "percent", value: 95 }).ok).toBe(false);
    expect(sanitizeCouponInput({ code: "NEW10", kind: "percent", value: 0 }).ok).toBe(false);
    expect(sanitizeCouponInput({ code: "NEW10", kind: "fixed", value: 100, startsAt: "2026-11-01", endsAt: "2026-10-01" }).ok).toBe(false);
    const ok = sanitizeCouponInput({ code: "new10", kind: "percent", value: 10, maxDiscount: "200", usageLimit: "" });
    expect(ok).toMatchObject({ ok: true, coupon: { code: "NEW10", value: 10, maxDiscount: 200, usageLimit: null, perPhoneOnce: true, newCustomersOnly: false, active: true } });
  });
  it("ป้ายอธิบาย", () => {
    expect(couponLabel({ kind: "percent", value: 10, maxDiscount: 200, minSubtotal: 1000 })).toBe("ลด 10% (สูงสุด ฿200) เมื่อซื้อครบ ฿1,000");
    expect(couponLabel({ kind: "fixed", value: 100, maxDiscount: null, minSubtotal: 0 })).toBe("ลด ฿100");
  });
});
