import { describe, it, expect } from "vitest";
import { checkMoTransition } from "../mo-workflow";
import { bucketOf, daysBetweenYmd, bangkokYmd } from "../mo-backlog";

// กฎกลางเปลี่ยนสถานะใบสั่งผลิต — ใช้ทั้งหน้า /master/mo-backlog และ /api/mo/bulk-status
const base = { status: "draft", qty: 50, dispatched: 0, received: 0, openWorkOrders: 0 };

describe("checkMoTransition — ปิดงาน", () => {
  it("ส่งคืนครบ + ไม่มีใบจ่ายงานค้าง = ปิดได้", () => {
    expect(checkMoTransition("close", { ...base, dispatched: 50, received: 50 })).toBeNull();
  });
  it("ยังส่งคืนไม่ครบ = ข้าม (เคสจริง MO-2026-00004 คืน 1/50)", () => {
    expect(checkMoTransition("close", { ...base, dispatched: 50, received: 1, openWorkOrders: 1 })).toMatch(/ส่งคืนไม่ครบ/);
  });
  it("คืนครบแต่ใบจ่ายงานยังไม่ปิด = ข้าม", () => {
    expect(checkMoTransition("close", { ...base, dispatched: 50, received: 50, openWorkOrders: 1 })).toMatch(/ใบจ่ายงานค้าง/);
  });
  it("ใบที่ปิด/ยกเลิกแล้ว ทำซ้ำไม่ได้", () => {
    expect(checkMoTransition("close", { ...base, status: "done", received: 50 })).toMatch(/ปิดงานไปแล้ว/);
    expect(checkMoTransition("close", { ...base, status: "cancelled" })).toMatch(/ยกเลิกไปแล้ว/);
  });
});

describe("checkMoTransition — ยกเลิก", () => {
  it("ยังไม่จ่ายเลย = ยกเลิกได้", () => {
    expect(checkMoTransition("cancel", base)).toBeNull();
  });
  it("จ่ายไปแล้ว = ยกเลิกไม่ได้", () => {
    expect(checkMoTransition("cancel", { ...base, dispatched: 10, openWorkOrders: 1 })).toMatch(/จ่ายงานไปแล้ว/);
  });
});

describe("bucketOf — แบ่งกลุ่มใบค้าง", () => {
  const r = (o: Partial<{ qty: number; dispatched: number; received: number; age_days: number }>) => ({ qty: 50, dispatched: 0, received: 0, age_days: 10, ...o });
  it("A คืนครบ · B อยู่กับช่าง · P จ่ายบางส่วน", () => {
    expect(bucketOf(r({ dispatched: 50, received: 50 }))).toBe("A");
    expect(bucketOf(r({ dispatched: 50, received: 1 }))).toBe("B");
    expect(bucketOf(r({ dispatched: 20 }))).toBe("P");
  });
  it("ยังไม่จ่าย แบ่งตามอายุ (ขอบ 30/60/90 วัน)", () => {
    expect(bucketOf(r({ age_days: 91 }))).toBe("C");
    expect(bucketOf(r({ age_days: 90 }))).toBe("D");
    expect(bucketOf(r({ age_days: 61 }))).toBe("D");
    expect(bucketOf(r({ age_days: 60 }))).toBe("E");
    expect(bucketOf(r({ age_days: 31 }))).toBe("E");
    expect(bucketOf(r({ age_days: 30 }))).toBe("F");
  });
});

describe("วันที่ตามเวลาไทย", () => {
  it("ตี 2 เวลาไทย (19:00 UTC วันก่อน) ยังเป็นวันใหม่", () => {
    expect(bangkokYmd("2026-06-13T19:30:00Z")).toBe("2026-06-14");
  });
  it("นับวันข้ามเดือน", () => {
    expect(daysBetweenYmd("2026-06-14", "2026-10-25")).toBe(133);
  });
});
