import { describe, it, expect } from "vitest";
import {
  roundMoney, sumEarnings, sumPreTaxDeductions, computeWithholdingTax,
  computeLineTotals, salaryDayDivisor, attendanceHourlyRate,
  lateDeduction, absenceDeduction, overtimeAmount,
} from "@/lib/payroll-calc";

describe("payroll-calc — ตรงสูตรแอปเก่า (เหมือนเดิม)", () => {
  it("roundMoney ปัด 2 ตำแหน่ง", () => {
    expect(roundMoney(292.0206)).toBe(292.02);
    expect(roundMoney(0.005)).toBe(0.01);
    expect(roundMoney("17000")).toBe(17000);
  });

  it("sumEarnings รวมรายได้ครบ 8 ช่อง", () => {
    expect(sumEarnings({ base_salary: 17000, overtime_amount: 500, allowance_amount: 600 })).toBe(18100);
    expect(sumEarnings({})).toBe(0);
  });

  it("sumPreTaxDeductions รวมหักก่อนภาษี", () => {
    expect(sumPreTaxDeductions({ late_deduction: 100, social_security_employee: 558, mid_month_paid: 1000 })).toBe(1658);
  });

  it("computeWithholdingTax — gross-up (เหมือน buildPayrollLine)", () => {
    // gross 10000, preTax(SS) 558 → ฐาน 9442, rate 3% → tax 292.02
    expect(computeWithholdingTax(10000, 558, 3)).toBe(292.02);
    // rate 0 → ไม่มีภาษี
    expect(computeWithholdingTax(10000, 558, 0)).toBe(0);
  });

  it("computeLineTotals — gross/total_deduction/net", () => {
    const line = { base_salary: 17000, overtime_amount: 500, late_deduction: 100, social_security_employee: 558, withholding_tax: 0 };
    expect(computeLineTotals(line)).toEqual({ gross_pay: 17500, total_deduction: 658, net_pay: 16842, withholding_tax: 0 });
  });

  it("computeLineTotals — รวมภาษีในยอดหัก", () => {
    const line = { base_salary: 10000, social_security_employee: 558, withholding_tax: 292.02 };
    const r = computeLineTotals(line);
    expect(r.gross_pay).toBe(10000);
    expect(r.total_deduction).toBe(850.02);
    expect(r.net_pay).toBe(9149.98);
  });

  it("salaryDayDivisor — office=30, อื่นๆ=วันจริง/26", () => {
    expect(salaryDayDivisor(true)).toBe(30);
    expect(salaryDayDivisor(false, 24)).toBe(24);
    expect(salaryDayDivisor(false, 0, 0)).toBe(26);
  });

  it("attendanceHourlyRate — รายเดือน = เงินเดือน÷ตัวหาร÷8", () => {
    expect(attendanceHourlyRate({ wage_type: "monthly", base_salary: 26000 }, { divisor: 26, hoursPerDay: 8 })).toBe(125);
    expect(attendanceHourlyRate({ wage_type: "daily", daily_wage: 400 }, { divisor: 26, hoursPerDay: 8 })).toBe(50);
    expect(attendanceHourlyRate({ wage_type: "hourly", hourly_wage: 60 }, { divisor: 26 })).toBe(60);
  });

  it("หักสาย / หักขาด / OT", () => {
    expect(lateDeduction(30, 125)).toBe(62.5);   // 0.5 ชม. × 125
    expect(absenceDeduction(8, 125)).toBe(1000); // 8 ชม. × 125
    expect(overtimeAmount(2, 125, 1.5)).toBe(375); // 2 ชม. × 125 × 1.5
  });
});
