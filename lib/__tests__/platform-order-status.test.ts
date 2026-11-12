import { describe, it, expect } from "vitest";
import {
  allowedNext, bangkokDayRange, checkTransition, isReportOnly, isShopManaged, needsAction, platformStatusLabel, platformStatusWarning, shipDue, shopeeToInternal, tiktokToInternal,
} from "../platform-order-status";

/** 🎵 ออเดอร์ TikTok (API · 2026-11-12) — สถานะตามร้าน ดูอย่างเดียว */
describe("🎵 ออเดอร์ TikTok", () => {
  it("แปลงสถานะ TikTok → สถานะในระบบ", () => {
    expect(tiktokToInternal("UNPAID")).toBe("new");
    expect(tiktokToInternal("ON_HOLD")).toBe("new");
    expect(tiktokToInternal("AWAITING_SHIPMENT")).toBe("new");
    expect(tiktokToInternal("AWAITING_COLLECTION")).toBe("packed");
    expect(tiktokToInternal("PARTIALLY_SHIPPING")).toBe("packed");
    expect(tiktokToInternal("IN_TRANSIT")).toBe("shipped");
    expect(tiktokToInternal("DELIVERED")).toBe("shipped");
    expect(tiktokToInternal("COMPLETED")).toBe("shipped");
    expect(tiktokToInternal("CANCELLED")).toBe("cancelled");
    expect(tiktokToInternal("WHATEVER")).toBeNull();
  });
  it("source tiktok_api = เปลี่ยนสถานะ/ตัดสต๊อกที่นี่ไม่ได้ แต่ยังนับเป็นงานต้องจัดส่ง", () => {
    expect(isShopManaged("tiktok_api")).toBe(true);
    expect(isShopManaged("api")).toBe(false);
    const r = checkTransition({ status: "new", source: "tiktok_api" }, "confirmed");
    expect(r.ok).toBe(false);
    expect(needsAction({ status: "new", source: "tiktok_api", platform_status: "AWAITING_SHIPMENT" })).toBe(true);
  });
  it("ON_HOLD (ผู้ซื้อยังยกเลิกได้) ยังไม่นับงาน + มีป้ายเตือน", () => {
    expect(needsAction({ status: "new", source: "tiktok_api", platform_status: "ON_HOLD" })).toBe(false);
    expect(platformStatusWarning("ON_HOLD")).toContain("ยกเลิก");
  });
  it("ชื่อสถานะบนร้านภาษาไทย ทั้ง Shopee และ TikTok", () => {
    expect(platformStatusLabel("READY_TO_SHIP")).toBe("ที่ต้องจัดส่ง");
    expect(platformStatusLabel("AWAITING_COLLECTION")).toBe("รอขนส่งมารับ");
    expect(platformStatusLabel("XYZ")).toBe("XYZ");
  });
});

/** 📦 กติกากลางออเดอร์จากแพลตฟอร์ม (ศูนย์ออเดอร์ เฟส A · 2026-11-10) */
describe("📦 สถานะออเดอร์แพลตฟอร์ม", () => {
  it("ออเดอร์จากเมล = ดูอย่างเดียว เปลี่ยนสถานะไม่ได้ (กันตัดสต๊อกคลังออนไลน์ติดลบ)", () => {
    expect(isReportOnly("email")).toBe(true);
    expect(isReportOnly("api")).toBe(false);
    expect(isReportOnly(null)).toBe(false);
    const r = checkTransition({ status: "new", source: "email" }, "confirmed");
    expect(r.ok).toBe(false);
  });

  it("เส้นทางสถานะ: ต้องจัดส่ง → ยืนยัน/แพ็ก/ยกเลิก · ส่งแล้วกับยกเลิกไปต่อไม่ได้", () => {
    expect(allowedNext("new")).toEqual(["confirmed", "packed", "cancelled"]);
    expect(allowedNext("packed")).toEqual(["shipped", "cancelled"]);
    expect(allowedNext("shipped")).toEqual([]);
    expect(allowedNext("cancelled")).toEqual([]);
    expect(allowedNext("weird")).toEqual([]);
    expect(checkTransition({ status: "new", source: "api" }, "packed").ok).toBe(true);
    expect(checkTransition({ status: "shipped", source: "api" }, "cancelled").ok).toBe(false);
    expect(checkTransition({ status: "cancelled", source: "import" }, "confirmed").ok).toBe(false);
    expect(checkTransition({ status: "new", source: "api" }, "lost").ok).toBe(false);
    // สถานะเดิม = ไม่ถือว่าผิด (กดซ้ำ)
    expect(checkTransition({ status: "packed", source: "api" }, "packed").ok).toBe(true);
  });

  it("สถานะ Shopee → สถานะในระบบ", () => {
    expect(shopeeToInternal("READY_TO_SHIP")).toBe("new");
    expect(shopeeToInternal("UNPAID")).toBe("new");
    expect(shopeeToInternal("PROCESSED")).toBe("packed");
    expect(shopeeToInternal("SHIPPED")).toBe("shipped");
    expect(shopeeToInternal("COMPLETED")).toBe("shipped");
    expect(shopeeToInternal("CANCELLED")).toBe("cancelled");
    expect(shopeeToInternal("in_cancel")).toBe("new");
    expect(shopeeToInternal("SOMETHING_NEW")).toBeNull();
    expect(platformStatusWarning("IN_CANCEL")).toContain("ขอยกเลิก");
    expect(platformStatusWarning("READY_TO_SHIP")).toBeNull();
  });

  it("ต้องลงมือไหม: ไม่นับออเดอร์เมล / ยังไม่จ่าย / ส่งแล้ว", () => {
    expect(needsAction({ status: "new", source: "api", platform_status: "READY_TO_SHIP" })).toBe(true);
    expect(needsAction({ status: "packed", source: "api" })).toBe(true);
    expect(needsAction({ status: "new", source: "api", platform_status: "UNPAID" })).toBe(false);
    expect(needsAction({ status: "new", source: "email" })).toBe(false);
    expect(needsAction({ status: "shipped", source: "api" })).toBe(false);
  });

  it("กำหนดส่งนับวันตามเวลาไทย (กันกับดัก UTC)", () => {
    // ตอนนี้ = 10 พ.ย. 2026 23:30 เวลาไทย (16:30 UTC)
    const now = Date.parse("2026-11-10T16:30:00Z");
    expect(shipDue({ status: "new", ship_by_at: "2026-11-10T16:00:00Z" }, now)).toBe("late");
    expect(shipDue({ status: "new", ship_by_at: "2026-11-10T16:59:00Z" }, now)).toBe("today");   // 23:59 ไทย
    expect(shipDue({ status: "new", ship_by_at: "2026-11-10T17:30:00Z" }, now)).toBe("tomorrow"); // 00:30 ของวันที่ 11 ไทย
    expect(shipDue({ status: "new", ship_by_at: "2026-11-13T05:00:00Z" }, now)).toBe("later");
    expect(shipDue({ status: "shipped", ship_by_at: "2026-11-01T00:00:00Z" }, now)).toBe("none");
    expect(shipDue({ status: "new", ship_by_at: null }, now)).toBe("none");
    const r = bangkokDayRange(now);
    expect(r.start).toBe("2026-11-09T17:00:00.000Z");
    expect(r.end).toBe("2026-11-10T17:00:00.000Z");
  });
});
