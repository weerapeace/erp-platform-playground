import { describe, it, expect } from "vitest";
import { canMove, moveError, needsConfirm } from "../website-order-status";
import { orderStatusLabel, paymentStatusLabel } from "../website-orders";

/** 🔁 เส้นทางสถานะออเดอร์เว็บร้าน (audit 2026-10-21) */
describe("เส้นทางสถานะออเดอร์", () => {
  it("เดินหน้าตามขั้นได้", () => {
    expect(canMove("status", "pending", "preparing")).toBe(true);
    expect(canMove("status", "preparing", "shipped")).toBe(true);
    expect(canMove("status", "shipped", "completed")).toBe(true);
  });

  it("ถอยกลับ 1 ขั้นได้ (แก้กดผิด) + ยกเลิกได้ก่อนสำเร็จ", () => {
    expect(canMove("status", "preparing", "pending")).toBe(true);
    expect(canMove("status", "shipped", "preparing")).toBe(true);
    for (const s of ["pending", "preparing", "shipped"]) expect(canMove("status", s, "cancelled")).toBe(true);
  });

  it("ข้ามขั้น / ย้อนจากสถานะจบ = ไม่ได้", () => {
    expect(canMove("status", "pending", "shipped")).toBe(false);
    expect(canMove("status", "pending", "completed")).toBe(false);
    expect(canMove("status", "completed", "pending")).toBe(false);
    expect(canMove("status", "cancelled", "pending")).toBe(false);
    expect(canMove("status", "completed", "cancelled")).toBe(false);
  });

  it("สถานะเดิมซ้ำ = ผ่าน · สถานะที่ไม่มีจริง = ไม่ผ่าน", () => {
    expect(canMove("status", "completed", "completed")).toBe(true);
    expect(canMove("status", "pending", "lost")).toBe(false);
  });

  it("สถานะเก่าที่ระบบไม่รู้จัก → ย้ายไปสถานะที่ถูกต้องได้", () => {
    expect(canMove("status", "legacy_x", "pending")).toBe(true);
  });

  it("สถานะชำระเงิน", () => {
    expect(canMove("payment", "unpaid", "paid")).toBe(true);
    expect(canMove("payment", "verifying", "unpaid")).toBe(true);
    expect(canMove("payment", "paid", "refunded")).toBe(true);
    expect(canMove("payment", "unpaid", "refunded")).toBe(false);
    expect(canMove("payment", "refunded", "paid")).toBe(false);
  });

  it("ข้อความเตือนเป็นภาษาคน", () => {
    expect(moveError("status", "completed", "pending", orderStatusLabel)).toContain("จบแล้ว");
    expect(moveError("status", "pending", "shipped", orderStatusLabel)).toContain("เลือกได้");
    expect(moveError("payment", "unpaid", "paid", paymentStatusLabel)).toBeNull();
  });

  it("ถามยืนยันเฉพาะการเปลี่ยนสำคัญ", () => {
    expect(needsConfirm("status", "pending", "preparing")).toBe(false);
    expect(needsConfirm("status", "preparing", "shipped")).toBe(true);
    expect(needsConfirm("status", "pending", "cancelled")).toBe(true);
    expect(needsConfirm("payment", "unpaid", "paid")).toBe(true);
    expect(needsConfirm("payment", "paid", "unpaid")).toBe(false);
    expect(needsConfirm("status", "shipped", "shipped")).toBe(false);
  });
});
