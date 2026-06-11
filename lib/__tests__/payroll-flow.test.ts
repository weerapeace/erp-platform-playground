import { describe, expect, it } from "vitest";
import { buildPayrollCalcRunHref, shouldAutoRunPayrollCalc } from "@/lib/payroll-flow";

describe("payroll-flow", () => {
  it("builds a calc-run link that keeps the selected period and requests auto run", () => {
    expect(buildPayrollCalcRunHref("period-1", { autoRun: true })).toBe("/payroll/calc-run?period_id=period-1&auto_run=1");
  });

  it("does not request auto run by default", () => {
    expect(buildPayrollCalcRunHref("period-1")).toBe("/payroll/calc-run?period_id=period-1");
  });

  it("detects auto-run query strings", () => {
    expect(shouldAutoRunPayrollCalc("?period_id=period-1&auto_run=1")).toBe(true);
    expect(shouldAutoRunPayrollCalc("?period_id=period-1")).toBe(false);
  });
});
