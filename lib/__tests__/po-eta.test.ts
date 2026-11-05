import { describe, it, expect } from "vitest";
import { addDaysIso, etaSourceLabel, poEta, DEFAULT_SHOP_LEAD_DAYS } from "@/lib/po-eta";

describe("po-eta (วันคาดของเข้า)", () => {
  it("วันที่ตั้งเองในใบชนะเสมอ", () => {
    expect(poEta({ expected_date: "2026-04-22", order_date: "2026-04-22", shop_lead: "7" })).toMatchObject({ date: "2026-04-22", source: "po" });
  });
  it("วันสั่ง + ระยะส่งของร้าน · ร้านไม่ตั้ง = 10 วัน", () => {
    expect(poEta({ order_date: "2026-04-22", shop_lead: "7" })).toMatchObject({ date: "2026-04-29", source: "shop", lead_days: 7 });
    expect(poEta({ order_date: "2026-04-22" })).toMatchObject({ date: "2026-05-02", source: "default", lead_days: DEFAULT_SHOP_LEAD_DAYS });
    expect(poEta({ order_date: "2026-04-22", shop_lead: "" }).source).toBe("default");
  });
  it("ร้าน \"หลังชำระเงิน\": นับจากวันจ่ายจริง → วันครบกำหนดจ่าย → วันสั่ง", () => {
    expect(poEta({ order_date: "2026-10-01", shop_lead: "7|after_pay", paid_date: "2026-10-10" }).date).toBe("2026-10-17");
    expect(poEta({ order_date: "2026-10-01", shop_lead: "7|after_pay", payment_due_date: "2026-10-05" }).date).toBe("2026-10-12");
    expect(poEta({ order_date: "2026-10-01", shop_lead: "7|after_pay" })).toMatchObject({ date: "2026-10-08", after_pay: true });
  });
  it("ไม่มีวันสั่ง = ไม่มีวันคาด · ข้ามปีไม่เพี้ยน (UTC)", () => {
    expect(poEta({ order_date: null }).date).toBeNull();
    expect(addDaysIso("2026-12-25", 10)).toBe("2027-01-04");
  });
  it("ป้ายที่มา", () => {
    expect(etaSourceLabel({ expected_source: "shop", lead_time_days: 7 })).toBe("~ร้าน 7 วัน");
    expect(etaSourceLabel({ expected_source: "default" })).toContain("10 วัน");
    expect(etaSourceLabel({ expected_source: "po" })).toBeNull();
  });
});
