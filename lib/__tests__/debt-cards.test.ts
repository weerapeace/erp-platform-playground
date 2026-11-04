import { describe, expect, it } from "vitest";
import { applyCardPayment, cardRemaining, cardStatusFor, newStatementPatch } from "@/lib/debt-cards";
import { staleReason } from "@/lib/cashflow";

describe("บัตร/หนี้อื่น — บันทึกจ่าย", () => {
  const card = { statement_balance: 54912.38, paid_amount: 0 };

  it("จ่ายเต็มยอด = จ่ายครบ", () => {
    const r = applyCardPayment(card, 54912.38, "2026-11-04");
    expect(r).toEqual({ ok: true, patch: { paid_amount: 54912.38, paid_date: "2026-11-04", status: "paid" } });
  });

  it("จ่ายขั้นต่ำ = จ่ายบางส่วน · จ่ายต่ออีกจนครบ = จ่ายครบ", () => {
    const r1 = applyCardPayment(card, 12202.72, "2026-11-04");
    expect(r1.ok && r1.patch.status).toBe("partial");
    const after = { ...card, paid_amount: r1.ok ? r1.patch.paid_amount : 0 };
    expect(cardRemaining(after)).toBe(42709.66);
    const r2 = applyCardPayment(after, 42709.66, "2026-11-05");
    expect(r2.ok && r2.patch).toEqual({ paid_amount: 54912.38, paid_date: "2026-11-05", status: "paid" });
  });

  it("กันพิมพ์ผิด: 0 / ติดลบ / เกินยอดค้าง / ไม่ใส่วันที่", () => {
    expect(applyCardPayment(card, 0, "2026-11-04").ok).toBe(false);
    expect(applyCardPayment(card, -5, "2026-11-04").ok).toBe(false);
    expect(applyCardPayment(card, 60000, "2026-11-04").ok).toBe(false);
    expect(applyCardPayment(card, 100, "").ok).toBe(false);
    expect(applyCardPayment({ statement_balance: 100, paid_amount: 100 }, 1, "2026-11-04").ok).toBe(false);
  });

  it("ค่าว่าง (null) นับเป็น 0", () => {
    expect(cardRemaining({ statement_balance: "100.50", paid_amount: null })).toBe(100.5);
    expect(cardStatusFor(100, 0)).toBe("unpaid");
  });
});

describe("บัตร/หนี้อื่น — ใบแจ้งยอดใหม่", () => {
  const ok = { statement_date: "2026-11-01", statement_balance: 30000, minimum_due: 3000, due_date: "2026-11-20" };

  it("เริ่มนับจ่ายใหม่จาก 0 สถานะยังไม่จ่าย", () => {
    expect(newStatementPatch(ok)).toEqual({ ok: true, patch: { ...ok, paid_amount: 0, paid_date: null, status: "unpaid" } });
  });

  it("ยอด 0 = ไม่มีอะไรต้องจ่าย (จ่ายครบ)", () => {
    const r = newStatementPatch({ ...ok, statement_balance: 0, minimum_due: 0 });
    expect(r.ok && r.patch.status).toBe("paid");
  });

  it("กันข้อมูลผิด: ครบกำหนดก่อนวันใบแจ้งยอด / ขั้นต่ำเกินยอด / ไม่มีวันที่", () => {
    expect(newStatementPatch({ ...ok, due_date: "2026-10-01" }).ok).toBe(false);
    expect(newStatementPatch({ ...ok, minimum_due: 40000 }).ok).toBe(false);
    expect(newStatementPatch({ ...ok, statement_date: "" }).ok).toBe(false);
    expect(newStatementPatch({ ...ok, statement_balance: -1 }).ok).toBe(false);
  });
});

describe("ป้ายข้อมูลเก่า (staleReason)", () => {
  const today = "2026-11-04";
  it("เลยกำหนดไม่เกิน 30 วัน + เพิ่งแก้ = ปกติ", () => {
    expect(staleReason({ date: "2026-10-10", updatedAt: "2026-10-30T03:00:00Z", certainty: "actual" }, today)).toBeNull();
  });
  it("เลยกำหนดเกิน 30 วัน = เก่า (บัตรค้างตั้งแต่ พ.ค.)", () => {
    expect(staleReason({ date: "2026-05-15", updatedAt: "2026-11-01T00:00:00Z", certainty: "actual" }, today)).toMatch(/เลยกำหนดมา 173 วัน/);
  });
  it("ยังไม่ถึงกำหนด แต่ไม่ได้แก้เกิน 45 วัน = เก่า", () => {
    expect(staleReason({ date: "2026-11-20", updatedAt: "2026-09-07 07:22:22+00", certainty: "actual" }, today)).toMatch(/ไม่ได้อัปเดตมา 58 วัน/);
  });
  it("ประมาณการ (ระบบเดา) ไม่ขึ้นป้าย", () => {
    expect(staleReason({ date: "2026-01-01", updatedAt: null, certainty: "estimate" }, today)).toBeNull();
  });
});
