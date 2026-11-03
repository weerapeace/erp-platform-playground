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
