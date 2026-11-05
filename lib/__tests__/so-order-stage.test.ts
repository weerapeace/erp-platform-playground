import { describe, expect, it } from "vitest";
import { soLineStage, soShipState } from "@/lib/so-order-stage";

describe("soLineStage — ขั้นของรายการในใบสั่งขาย (มุมมองตามชุด)", () => {
  it("ยังไม่มีใบสั่งผลิต = รอเปิดผลิต", () => {
    expect(soLineStage({ orderShipped: false, hasMo: false })).toBe(0);
  });
  it("ใบสั่งผลิตถูกยกเลิก = กลับไปรอเปิดผลิต", () => {
    expect(soLineStage({ orderShipped: false, hasMo: true, moStatus: "cancelled", dispatched: true })).toBe(0);
  });
  it("มีใบ ยังไม่จ่ายงาน = เปิดผลิตแล้ว", () => {
    expect(soLineStage({ orderShipped: false, hasMo: true, moStatus: "draft" })).toBe(1);
  });
  it("จ่ายงานแล้ว = กำลังผลิต", () => {
    expect(soLineStage({ orderShipped: false, hasMo: true, dispatched: true })).toBe(2);
  });
  it("ช่างส่งครบ หรือปิดใบ = ทำเสร็จ", () => {
    expect(soLineStage({ orderShipped: false, hasMo: true, dispatched: true, submitted: true })).toBe(3);
    expect(soLineStage({ orderShipped: false, hasMo: true, moStatus: "done" })).toBe(3);
  });
  it("ใบสั่งขายส่งแล้ว = ส่งลูกค้าแล้ว (ชนะทุกอย่าง)", () => {
    expect(soLineStage({ orderShipped: true, hasMo: false })).toBe(4);
  });
  it("ใบขายที่ผูกกับใบสั่งผลิตครบจำนวน = ส่งลูกค้าแล้ว แม้ใบสั่งขายยังไม่กดส่ง", () => {
    expect(soLineStage({ orderShipped: false, hasMo: true, moStatus: "confirmed", delivered: true })).toBe(4);
  });
  it("soShipState — ครบ / บางส่วน / ยังไม่ส่ง", () => {
    expect(soShipState(300, 300)).toBe("full");
    expect(soShipState(20, 80)).toBe("full");
    expect(soShipState(200, 80)).toBe("part");
    expect(soShipState(60, 0)).toBe("none");
    expect(soShipState(0, 0)).toBe("none");
  });
});
