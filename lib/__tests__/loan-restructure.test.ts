import { describe, it, expect } from "vitest";
import { addMonthsISO, buildRestructureSchedule, equalInstallment, scheduleTotals } from "../loan-restructure";

describe("addMonthsISO", () => {
  it("บวกเดือนและยึดวันที่ตัดงวด", () => {
    expect(addMonthsISO("2026-07-31", 1)).toBe("2026-08-31");
    expect(addMonthsISO("2026-01-31", 1)).toBe("2026-02-28");      // เดือนสั้น → วันสุดท้าย
    expect(addMonthsISO("2026-07-31", 1, 25)).toBe("2026-08-25");  // dueDay ชนะวันเดิม
    expect(addMonthsISO("2026-11-15", 3)).toBe("2027-02-15");      // ข้ามปี
  });
});

describe("equalInstallment", () => {
  it("annuity ตรงสูตรธนาคาร", () => {
    // 1,000,000 · 12%/ปี รายเดือน · 12 งวด ≈ 88,848.79
    expect(equalInstallment(1_000_000, 0.01, 12)).toBeCloseTo(88848.79, 1);
    expect(equalInstallment(1200, 0, 12)).toBe(100);
  });
});

describe("buildRestructureSchedule", () => {
  const base = {
    openingPrincipal: 1_000_000, annualRate: 12, monthsPerPeriod: 1,
    method: "equal_installment" as const, holidayPeriods: 0, periods: 12,
    firstDueDate: "2026-07-31", dueDay: null,
  };

  it("ผ่อนเท่ากันทุกงวด → เงินต้นหมดพอดีงวดสุดท้าย", () => {
    const rows = buildRestructureSchedule(base);
    expect(rows).toHaveLength(12);
    const t = scheduleTotals(rows);
    expect(t.principal).toBeCloseTo(1_000_000, 2);
    expect(rows[0].interest_due).toBeCloseTo(10_000, 2);
    expect(t.lastDue).toBe("2027-06-30");
  });

  it("พักเงินต้น 3 งวด = จ่ายดอกอย่างเดียว แล้วค่อยผ่อน", () => {
    const rows = buildRestructureSchedule({ ...base, holidayPeriods: 3, periods: 12 });
    expect(rows).toHaveLength(15);
    expect(rows[0]).toMatchObject({ principal_due: 0, interest_due: 10_000, holiday: true });
    expect(rows[2].holiday).toBe(true);
    expect(rows[3].holiday).toBeUndefined();
    expect(rows[3].principal_due).toBeGreaterThan(0);
    expect(scheduleTotals(rows).principal).toBeCloseTo(1_000_000, 2);
  });

  it("ค่างวดที่ธนาคารกำหนดเอง สูงจนปิดก่อนครบงวด → หยุดเมื่อเงินต้นหมด", () => {
    const rows = buildRestructureSchedule({ ...base, periods: 24, installmentOverride: 500_000 });
    expect(rows.length).toBeLessThan(24);
    expect(scheduleTotals(rows).principal).toBeCloseTo(1_000_000, 2);
  });

  it("ตัดเงินต้นเท่ากัน / ดอกอย่างเดียว", () => {
    const ep = buildRestructureSchedule({ ...base, method: "equal_principal", periods: 4 });
    expect(ep.map((r) => r.principal_due)).toEqual([250_000, 250_000, 250_000, 250_000]);
    const io = buildRestructureSchedule({ ...base, method: "interest_only", periods: 3 });
    expect(io.map((r) => r.principal_due)).toEqual([0, 0, 1_000_000]);
  });

  it("ราย 3 เดือน → ดอกเบี้ยต่องวด × 3 และวันครบกำหนดห่าง 3 เดือน", () => {
    const rows = buildRestructureSchedule({ ...base, monthsPerPeriod: 3, periods: 4 });
    expect(rows[0].interest_due).toBeCloseTo(30_000, 2);
    expect(rows[1].due_date).toBe("2026-10-31");
  });

  it("ข้อมูลไม่ครบ → ว่าง", () => {
    expect(buildRestructureSchedule({ ...base, openingPrincipal: 0 })).toEqual([]);
    expect(buildRestructureSchedule({ ...base, periods: 0 })).toEqual([]);
  });
});
