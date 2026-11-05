import { describe, expect, it } from "vitest";
import { autoCloseAction, soldAll } from "@/lib/mo-auto-close";

const base = { status: "confirmed", qty: 80, sold: 80, dispatched: 80, received: 80, openWorkOrders: 0 };

describe("mo-auto-close — ปิดงานอัตโนมัติเมื่อขายครบ + ส่งคืนครบ", () => {
  it("ขายครบ + ส่งคืนครบ + ไม่มีใบจ่ายค้าง = ปิด", () => {
    expect(autoCloseAction(base)).toBe("close");
    expect(autoCloseAction({ ...base, status: "draft", sold: 90 })).toBe("close");   // ผูกเกินก็ถือว่าครบ
  });
  it("ขายไม่ครบ / ส่งคืนไม่ครบ / มีใบจ่ายค้าง = ไม่ปิด", () => {
    expect(autoCloseAction({ ...base, sold: 50 })).toBeNull();
    expect(autoCloseAction({ ...base, received: 60 })).toBeNull();
    expect(autoCloseAction({ ...base, openWorkOrders: 1 })).toBeNull();
    expect(autoCloseAction({ ...base, dispatched: 0, received: 0 })).toBeNull();      // ขายแล้วแต่ในระบบยังไม่ผลิต → ไปอัปเดตงานก่อน
  });
  it("แอดมินข้ามขั้นรับคืน + ขายครบ = ปิดได้", () => {
    expect(autoCloseAction({ ...base, received: 0, receiveSkipped: true })).toBe("close");
  });
  it("ใบที่ระบบปิดเอง แล้วถอดผูกใบขาย = เปิดคืน · ใบที่คนปิดเองไม่แตะ · ใบยกเลิกไม่แตะ", () => {
    expect(autoCloseAction({ ...base, status: "done", sold: 0, lastCloseAuto: true })).toBe("reopen");
    expect(autoCloseAction({ ...base, status: "done", sold: 0, lastCloseAuto: false })).toBeNull();
    expect(autoCloseAction({ ...base, status: "done", lastCloseAuto: true })).toBeNull();   // ยังครบอยู่ = คงปิด
    expect(autoCloseAction({ ...base, status: "cancelled", sold: 0, lastCloseAuto: true })).toBeNull();
  });
  it("จำนวน 0 ไม่นับว่าขายครบ", () => {
    expect(soldAll({ qty: 0, sold: 0 })).toBe(false);
  });
});
