export type PayrollContractLike = Record<string, unknown>;

function text(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isPayrollContractor(contract: PayrollContractLike = {}): boolean {
  return ["contractor", "piecework"].includes(text(contract.contract_type))
    || ["contractor", "piecework"].includes(text(contract.employment_type))
    || text(contract.wage_type) === "piecework";
}

export function isPayrollDailyLike(contract: PayrollContractLike = {}): boolean {
  return text(contract.contract_type) === "daily" || ["daily", "hourly"].includes(text(contract.wage_type));
}

export function isAttendanceScanExempt(contract: PayrollContractLike = {}): boolean {
  return contract.attendance_scan_exempt === true;
}

export function shouldShowInAttendanceGrid(contract: PayrollContractLike = {}): boolean {
  return !isPayrollContractor(contract);
}

export function shouldReceivePaidPeriodHoliday(contract: PayrollContractLike = {}): boolean {
  return !isPayrollContractor(contract) && !isPayrollDailyLike(contract);
}

export function shouldRequireAttendanceScan(contract: PayrollContractLike = {}): boolean {
  return !isPayrollContractor(contract) && !isAttendanceScanExempt(contract);
}
