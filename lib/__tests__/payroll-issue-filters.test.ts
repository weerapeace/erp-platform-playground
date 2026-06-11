import { describe, expect, it } from "vitest";
import {
  countEmployeesMissingCurrentContract,
  getPayrollIssueFilter,
  isRecurringPayrollIssueRow,
  payrollWageProblem,
} from "@/lib/payroll-issue-filters";

describe("payroll-issue-filters", () => {
  it("reads payroll issue and period id from MasterCRUD filter shape", () => {
    expect(getPayrollIssueFilter({
      __payroll_issue: { type: "text", value: "invalid_contract_wage" },
      __period_id: { type: "text", value: "period-1" },
    })).toEqual({ issueCode: "invalid_contract_wage", periodId: "period-1" });
  });

  it("detects wage fields that block contract calculation", () => {
    expect(payrollWageProblem({ wage_type: "monthly", base_salary: 0 })).toBe("เงินเดือนฐานว่างหรือเป็น 0");
    expect(payrollWageProblem({ wage_type: "daily", daily_wage: "" })).toBe("ค่าแรงรายวันว่างหรือเป็น 0");
    expect(payrollWageProblem({ wage_type: "hourly", hourly_wage: null })).toBe("ค่าแรงรายชั่วโมงว่างหรือเป็น 0");
    expect(payrollWageProblem({ wage_type: "monthly", base_salary: 12000 })).toBeNull();
  });

  it("does not flag contractor contracts when salary wage fields are empty", () => {
    expect(payrollWageProblem({ contract_type: "contractor", wage_type: "monthly", base_salary: 0 })).toBeNull();
    expect(payrollWageProblem({ employment_type: "contractor", wage_type: "daily", daily_wage: 0 })).toBeNull();
    expect(payrollWageProblem({ wage_type: "piecework", base_salary: 0 })).toBeNull();
  });

  it("does not count employees whose current contract belongs to another company", () => {
    const employees = [{ id: "emp-a" }, { id: "emp-b" }, { id: "emp-c" }];
    const periodContracts = [{ employee_id: "emp-a", company_id: "company-a" }];
    const allCurrentContracts = [
      { employee_id: "emp-a", company_id: "company-a" },
      { employee_id: "emp-b", company_id: "company-b" },
    ];

    expect(countEmployeesMissingCurrentContract(employees, periodContracts, allCurrentContracts, "company-a")).toBe(1);
  });

  it("matches recurring rows for each payroll readiness issue", () => {
    expect(isRecurringPayrollIssueRow({ employee_id: "" }, "recurring_missing_employee")).toBe(true);
    expect(isRecurringPayrollIssueRow({ contract_id: null }, "recurring_missing_contract")).toBe(true);
    expect(isRecurringPayrollIssueRow({ calculation_method: "fixed", amount_per_period: 0 }, "recurring_invalid_amount")).toBe(true);
    expect(isRecurringPayrollIssueRow({ calculation_method: "days_rate", quantity_default: 1, rate_default: 0 }, "recurring_invalid_amount")).toBe(true);
    expect(isRecurringPayrollIssueRow({ calculation_method: "fixed", amount_per_period: 100 }, "recurring_invalid_amount")).toBe(false);
  });
});
