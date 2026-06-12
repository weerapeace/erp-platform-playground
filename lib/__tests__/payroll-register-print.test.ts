import { describe, expect, it } from "vitest";
import {
  buildPayrollRegisterPrintHref,
  computePayrollRegisterAmounts,
  formatThaiNationalId,
  normalizePayrollRegisterPaper,
} from "@/lib/payroll-register-print";

describe("payroll register print", () => {
  it("defaults payroll register to A4 landscape", () => {
    expect(normalizePayrollRegisterPaper("bad-value")).toBe("a4-landscape");
    expect(buildPayrollRegisterPrintHref({ periodId: "period-1" }))
      .toBe("/print/payroll-register?period_id=period-1&paper=a4-landscape");
  });

  it("can build an embedded A3 landscape preview link", () => {
    expect(buildPayrollRegisterPrintHref({
      periodId: "period-1",
      paper: "a3-landscape",
      embedded: true,
    })).toBe("/print/payroll-register?period_id=period-1&paper=a3-landscape&embedded=1");
  });

  it("formats Thai national ID like the legacy payroll register", () => {
    expect(formatThaiNationalId("3320700553101")).toBe("3 3207 00553 10 1");
    expect(formatThaiNationalId("AB123")).toBe("AB123");
  });

  it("calculates month-end, OT, cash, social security, and balance like the register", () => {
    expect(computePayrollRegisterAmounts({
      base_salary: 11160,
      mid_month_paid: 3000,
      social_security_employee: 558,
      net_pay: 16929,
    })).toEqual({
      base_salary: 11160,
      mid_month_paid: 3000,
      month_end_pay: 7602,
      transfer_net_pay: 16929,
      overtime_amount: 9327,
      cash_pay: 0,
      social_security: 558,
      balance: 10602,
    });

    expect(computePayrollRegisterAmounts({
      base_salary: 11160,
      mid_month_paid: 3000,
      social_security_employee: 558,
      net_pay: 7000,
    })).toMatchObject({
      month_end_pay: 7000,
      overtime_amount: 0,
      cash_pay: 602,
      balance: 10602,
    });

    expect(computePayrollRegisterAmounts({
      base_salary: 11160,
      mid_month_paid: 3000,
      social_security_employee: 558,
      net_pay: 3976.27,
    })).toMatchObject({
      month_end_pay: 3976.27,
      transfer_net_pay: 3976.27,
      overtime_amount: 0,
      cash_pay: 3625.73,
      balance: 10602,
    });
  });
});
