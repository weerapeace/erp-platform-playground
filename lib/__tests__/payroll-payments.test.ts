import { describe, expect, it } from "vitest";
import {
  buildMidMonthPaymentLine,
  buildPaymentLineFromPayslip,
  comparePaymentLineWithPrevious,
  csvEscape,
  normalizePaymentBatchType,
  parsePaymentLineNote,
  paymentLineGroup,
  paymentExportCsv,
} from "@/lib/payroll-payments";

describe("payroll payments", () => {
  it("normalizes old payment method words to valid payment batch types", () => {
    expect(normalizePaymentBatchType("bank")).toBe("month_end");
    expect(normalizePaymentBatchType("cash")).toBe("month_end");
    expect(normalizePaymentBatchType("mid_month")).toBe("mid_month");
    expect(normalizePaymentBatchType("unknown")).toBe("month_end");
  });

  it("groups payment lines by current contract type for the payment report tabs", () => {
    expect(paymentLineGroup({ contract_type: "permanent", wage_type: "monthly", source: "payroll_payslip" })).toBe("regular");
    expect(paymentLineGroup({ contract_type: "regular_external", wage_type: "monthly" })).toBe("other");
    expect(paymentLineGroup({ contract_type: "permanent", wage_type: "daily" })).toBe("other");
    expect(paymentLineGroup({ contract_type: "contractor", wage_type: "piece_rate" })).toBe("other");
  });

  it("builds a payment line from a payslip using rounded net pay", () => {
    const line = buildPaymentLineFromPayslip({
      id: "slip-1",
      payroll_period_id: "period-1",
      payroll_line_id: "line-1",
      employee_id: "emp-1",
      gross_pay: 17000,
      total_deduction: 16.35,
      net_pay: 16983.65,
    });

    expect(line).toMatchObject({
      payroll_period_id: "period-1",
      employee_id: "emp-1",
      source_payroll_line_id: "line-1",
      gross_amount: 17000,
      deduction_amount: 16.35,
      paid_amount: 16984,
      status: "draft",
    });
    expect(parsePaymentLineNote(line.note)).toMatchObject({
      source: "payroll_payslip",
      payslip_id: "slip-1",
      net_before_rounding: 16983.65,
      rounding_adjustment: 0.35,
      rounded_net_pay: 16984,
    });
  });

  it("builds a mid-month payment line from employee advance settings without requiring a payslip", () => {
    const line = buildMidMonthPaymentLine({
      payroll_period_id: "period-1",
      employee_id: "emp-1",
      setting_id: "setting-1",
      amount: 1500.257,
    });

    expect(line).toMatchObject({
      payroll_period_id: "period-1",
      employee_id: "emp-1",
      source_payroll_line_id: null,
      gross_amount: 0,
      deduction_amount: 0,
      paid_amount: 1500.26,
      status: "draft",
    });
    expect(parsePaymentLineNote(line.note)).toMatchObject({
      source: "payroll_mid_month",
      setting_id: "setting-1",
      rounded_net_pay: 1500.26,
    });
  });

  it("compares this month payment amount with previous month", () => {
    expect(comparePaymentLineWithPrevious(1000, 1000)).toEqual({ previous_paid_amount: 1000, delta_amount: 0, compare_status: "same" });
    expect(comparePaymentLineWithPrevious(1200, 1000)).toEqual({ previous_paid_amount: 1000, delta_amount: 200, compare_status: "changed" });
    expect(comparePaymentLineWithPrevious(500, null)).toEqual({ previous_paid_amount: null, delta_amount: null, compare_status: "new" });
    expect(comparePaymentLineWithPrevious(0, 800)).toEqual({ previous_paid_amount: 800, delta_amount: -800, compare_status: "missing_this_month" });
  });

  it("escapes csv cells safely", () => {
    expect(csvEscape('A "quoted", value')).toBe('"A ""quoted"", value"');
    expect(csvEscape("normal")).toBe("normal");
  });

  it("exports payment lines as bank csv with utf-8 bom", () => {
    const csv = paymentExportCsv([
      {
        employee_code: "ISG-001",
        employee_name: "Somchai Test",
        bank_name: "SCB",
        bank_account_name: "Somchai Test",
        bank_account_no: "123-456",
        paid_amount: 16984,
        status: "draft",
        payslip_no: "PS-001",
        note: JSON.stringify({ net_before_rounding: 16983.65, rounding_adjustment: 0.35 }),
      },
    ]);

    expect(csv.startsWith("\ufeff")).toBe(true);
    expect(csv.split("\n")[0]).toBe("\ufeffemployee_code,employee_name,bank_name,bank_account_name,bank_account_no,paid_amount");
    expect(csv).toContain("ISG-001,Somchai Test,SCB,Somchai Test,123-456,16984");
    expect(csv).not.toContain("PS-001");
    expect(csv).not.toContain("16983.65");
    expect(csv).not.toContain("0.35");
  });
});
