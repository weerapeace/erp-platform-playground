import { money } from "@/lib/payroll-calc";
import { isPayrollContractor } from "@/lib/payroll-attendance-rules";

export type PayrollIssueFilter = {
  issueCode: string | null;
  periodId: string | null;
};

type FilterValue = { value?: unknown; selected?: unknown[] };

function isBlank(v: unknown): boolean {
  return v == null || String(v).trim() === "";
}

function filterValue(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const f = v as FilterValue;
  if (typeof f.value === "string" && f.value.trim()) return f.value.trim();
  if (Array.isArray(f.selected) && typeof f.selected[0] === "string") return f.selected[0];
  return null;
}

function text(v: unknown): string {
  return String(v ?? "").trim();
}

export function getPayrollIssueFilter(filters: Record<string, unknown> | null | undefined): PayrollIssueFilter {
  return {
    issueCode: filterValue(filters?.__payroll_issue) ?? null,
    periodId: filterValue(filters?.__period_id) ?? null,
  };
}

export function isContractorContract(contract: Record<string, unknown>): boolean {
  return isPayrollContractor(contract);
}

export function payrollWageProblem(contract: Record<string, unknown>): string | null {
  if (isContractorContract(contract)) return null;
  const wageType = String(contract.wage_type ?? "monthly");
  if (wageType === "daily" && money(contract.daily_wage) <= 0) return "ค่าแรงรายวันว่างหรือเป็น 0";
  if (wageType === "hourly" && money(contract.hourly_wage) <= 0) return "ค่าแรงรายชั่วโมงว่างหรือเป็น 0";
  if (wageType !== "daily" && wageType !== "hourly" && money(contract.base_salary) <= 0) return "เงินเดือนฐานว่างหรือเป็น 0";
  return null;
}

export function filterEmployeesMissingCurrentContract(
  employees: Record<string, unknown>[],
  periodContracts: Record<string, unknown>[],
  allCurrentContracts: Record<string, unknown>[],
  periodCompanyId: string | null,
): Record<string, unknown>[] {
  const periodContractByEmployee = new Set(periodContracts.map((contract) => text(contract.employee_id)).filter(Boolean));
  const currentContractByEmployee = new Map<string, Record<string, unknown>>();
  for (const contract of allCurrentContracts) {
    const employeeId = text(contract.employee_id);
    if (employeeId && !currentContractByEmployee.has(employeeId)) currentContractByEmployee.set(employeeId, contract);
  }

  return employees.filter((employee) => {
    const employeeId = text(employee.id);
    if (!employeeId || periodContractByEmployee.has(employeeId)) return false;

    const currentContract = currentContractByEmployee.get(employeeId);
    if (periodCompanyId && currentContract) {
      const contractCompanyId = text(currentContract.company_id);
      if (contractCompanyId && contractCompanyId !== periodCompanyId) return false;
    }
    return true;
  });
}

export function countEmployeesMissingCurrentContract(
  employees: Record<string, unknown>[],
  periodContracts: Record<string, unknown>[],
  allCurrentContracts: Record<string, unknown>[],
  periodCompanyId: string | null,
): number {
  return filterEmployeesMissingCurrentContract(employees, periodContracts, allCurrentContracts, periodCompanyId).length;
}

export function isRecurringPayrollIssueRow(row: Record<string, unknown>, issueCode: string): boolean {
  if (issueCode === "recurring_missing_employee") return isBlank(row.employee_id);
  if (issueCode === "recurring_missing_contract") return isBlank(row.contract_id);
  if (issueCode !== "recurring_invalid_amount") return false;

  if (String(row.calculation_method ?? "fixed") === "fixed") return money(row.amount_per_period) <= 0;
  return money(row.quantity_default) <= 0 || money(row.rate_default) <= 0;
}
