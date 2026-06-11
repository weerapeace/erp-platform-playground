import { describe, expect, it } from "vitest";
import {
  buildPayslipPrintHref,
  encodePayslipNetPay,
  payslipDisplayMoneyItems,
  normalizePayslipPrintLanguage,
  payslipLanguageForEmployee,
  roundPayslipNetPay,
} from "@/lib/payroll-payslip-print";

describe("payroll payslip print", () => {
  it("builds a print preview link for selected payslips only", () => {
    expect(buildPayslipPrintHref({
      periodId: "period-1",
      payslipIds: ["slip-2", "slip-1", "slip-2", ""],
      language: "employee",
    })).toBe("/payroll/payslips/print?period_id=period-1&ids=slip-2%2Cslip-1&lang=employee&paper=a6-landscape");
  });

  it("can build a clean embedded print link outside the payroll shell", () => {
    expect(buildPayslipPrintHref({
      periodId: "period-1",
      payslipIds: ["slip-1"],
      language: "th",
      basePath: "/print/payroll-payslips",
      embedded: true,
    })).toBe("/print/payroll-payslips?period_id=period-1&ids=slip-1&lang=th&paper=a6-landscape&embedded=1");
  });

  it("can build an A5 landscape print link", () => {
    expect(buildPayslipPrintHref({
      periodId: "period-1",
      payslipIds: ["slip-1"],
      language: "en",
      paper: "a5-landscape",
      basePath: "/print/payroll-payslips",
    })).toBe("/print/payroll-payslips?period_id=period-1&ids=slip-1&lang=en&paper=a5-landscape");
  });

  it("normalizes unsupported print language to employee preference", () => {
    expect(normalizePayslipPrintLanguage("th")).toBe("th");
    expect(normalizePayslipPrintLanguage("en")).toBe("en");
    expect(normalizePayslipPrintLanguage("bad-value")).toBe("employee");
  });

  it("uses employee language unless a print language is forced", () => {
    expect(payslipLanguageForEmployee("employee", "en")).toBe("en");
    expect(payslipLanguageForEmployee("employee", "th")).toBe("th");
    expect(payslipLanguageForEmployee("employee", null)).toBe("th");
    expect(payslipLanguageForEmployee("th", "en")).toBe("th");
    expect(payslipLanguageForEmployee("en", "th")).toBe("en");
  });

  it("rounds net pay for printed slips using half-up whole baht", () => {
    expect(roundPayslipNetPay(16983.49)).toEqual({ before: 16983.49, rounded: 16983, adjustment: -0.49 });
    expect(roundPayslipNetPay(16983.5)).toEqual({ before: 16983.5, rounded: 16984, adjustment: 0.5 });
    expect(roundPayslipNetPay(17000)).toEqual({ before: 17000, rounded: 17000, adjustment: 0 });
  });

  it("encodes rounded net pay using the private payslip digit code", () => {
    expect(encodePayslipNetPay(17000)).toBe("ESPPP");
    expect(encodePayslipNetPay(16984)).toBe("ENOHW");
    expect(encodePayslipNetPay(0)).toBe("P");
  });

  it("keeps base salary out of printed earnings items", () => {
    const items = payslipDisplayMoneyItems({
      base_salary: 17000,
      overtime_amount: 250,
      allowance_amount: 0,
      social_security_employee: 558,
    });
    expect(items.earnings).toEqual([{ key: "overtime_amount", th: "OT", en: "OT", amount: 250 }]);
    expect(items.deductions).toEqual([{ key: "social_security_employee", th: "ประกันสังคม", en: "Social Security", amount: 558 }]);
  });
});
