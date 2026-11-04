import { describe, expect, it } from "vitest";
import { computeDueDate, formatCreditTerm, salesCreditTermOf } from "@/lib/credit-term";

describe("credit-term — เครดิตฝั่งขายของลูกค้า (ใบวางบิล)", () => {
  it("ใช้ช่องใหม่ sales_credit_term ก่อน · ว่าง → แปลงจำนวนวันแบบเก่า · ไม่มีทั้งคู่ = null", () => {
    expect(salesCreditTermOf({ sales_credit_term: "days:45", payment_terms_days: 30 })).toBe("days:45");
    expect(salesCreditTermOf({ sales_credit_term: null, payment_terms_days: 30 })).toBe("days:30");
    expect(salesCreditTermOf({ sales_credit_term: "ขยะ", payment_terms_days: 0 })).toBeNull();
    expect(salesCreditTermOf(null)).toBeNull();
  });
  it("วันครบกำหนดนับจากวันที่วางบิล", () => {
    expect(computeDueDate("2026-11-03", "days:45")).toBe("2026-12-18");
    expect(computeDueDate("2026-11-03", "eom")).toBe("2026-11-30");
    expect(computeDueDate("2026-11-03", null)).toBeNull();
    expect(formatCreditTerm("days:45")).toBe("45 วัน");
  });
});

describe("credit-term — ตัวเลข X กำหนดเอง (หน้าตั้งเครดิต 2026-11-04)", () => {
  it("ทุกวันที่ X (เดือนที่สั่ง): ยังไม่เลยวัน = เดือนนี้ · เลยแล้ว = เดือนถัดไป · X เกินวันของเดือน = วันสุดท้าย", () => {
    expect(computeDueDate("2026-11-10", "monthday:25")).toBe("2026-11-25");
    expect(computeDueDate("2026-11-25", "monthday:25")).toBe("2026-11-25");
    expect(computeDueDate("2026-11-28", "monthday:25")).toBe("2026-12-25");
    expect(computeDueDate("2027-02-10", "monthday:31")).toBe("2027-02-28");
    expect(computeDueDate("2026-12-28", "monthday:20")).toBe("2027-01-20");
  });
  it("วันที่ X เดือนถัดไป: เดือนถัดไปเสมอ ไม่สนวันสั่ง", () => {
    expect(computeDueDate("2026-11-01", "monthday_next:25")).toBe("2026-12-25");
    expect(computeDueDate("2026-11-28", "monthday_next:25")).toBe("2026-12-25");
    expect(computeDueDate("2027-01-31", "monthday_next:30")).toBe("2027-02-28");
  });
  it("X วัน ใส่เองได้ เช่น 21 / 90", () => {
    expect(computeDueDate("2026-11-04", "days:21")).toBe("2026-11-25");
    expect(computeDueDate("2026-11-04", "days:90")).toBe("2027-02-02");
  });
  it("ชื่อที่โชว์ตรงกับตัวเลือกในช่องกรอก", () => {
    expect(formatCreditTerm("monthday:12")).toBe("ทุกวันที่ 12 (เดือนที่สั่ง)");
    expect(formatCreditTerm("monthday_next:7")).toBe("วันที่ 7 เดือนถัดไป");
    expect(formatCreditTerm("eom")).toBe("สิ้นเดือน (เดือนที่สั่ง)");
    expect(formatCreditTerm("days:21")).toBe("21 วัน");
  });
});
