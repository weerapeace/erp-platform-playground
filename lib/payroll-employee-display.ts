export type PayrollEmployeeDisplayRow = {
  id: string;
  employee_code?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  current_contract_no?: string | null;
  current_contract_type?: string | null;
  current_employment_type?: string | null;
  current_wage_type?: string | null;
};

export const PAYROLL_CONTRACT_TYPE_LABEL: Record<string, string> = {
  permanent: "ประจำ",
  regular_external: "ประจำนอกระบบ",
  daily: "รายวัน",
  contractor: "งานเหมา",
  hourly: "รายชั่วโมง",
};

export const PAYROLL_WAGE_TYPE_LABEL: Record<string, string> = {
  monthly: "รายเดือน",
  daily: "รายวัน",
  hourly: "รายชั่วโมง",
  piece_rate: "รายชิ้น",
  mixed: "ผสม",
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export function payrollEmployeeName(row: PayrollEmployeeDisplayRow): string {
  return clean(row.full_name) ||
    [row.first_name, row.last_name].map(clean).filter((v) => v && v !== "-").join(" ") ||
    clean(row.nickname);
}

export function payrollContractTypeLabel(value: unknown): string {
  const raw = clean(value);
  return PAYROLL_CONTRACT_TYPE_LABEL[raw] ?? raw;
}

export function payrollWageTypeLabel(value: unknown): string {
  const raw = clean(value);
  return PAYROLL_WAGE_TYPE_LABEL[raw] ?? raw;
}

export function payrollEmployeeSearchText(row: PayrollEmployeeDisplayRow): string {
  return [
    row.id,
    row.employee_code,
    row.full_name,
    row.first_name,
    row.last_name,
    row.nickname,
    row.current_contract_no,
    row.current_contract_type,
    payrollContractTypeLabel(row.current_contract_type),
    row.current_employment_type,
    row.current_wage_type,
    payrollWageTypeLabel(row.current_wage_type),
  ].map(clean).filter(Boolean).join(" ");
}

export function buildPayrollEmployeeSelectOption(row: PayrollEmployeeDisplayRow) {
  const name = payrollEmployeeName(row);
  const nickname = clean(row.nickname);
  const contractType = payrollContractTypeLabel(row.current_contract_type);
  const wageType = payrollWageTypeLabel(row.current_wage_type);
  const contractNo = clean(row.current_contract_no);
  const labelName = name ? ` · ${name}${nickname ? ` (${nickname})` : ""}` : "";
  const subParts = [
    contractNo ? `สัญญา ${contractNo}` : "",
    contractType,
    wageType,
  ].filter(Boolean);

  return {
    value: row.id,
    label: `${clean(row.employee_code)}${labelName}`.trim() || name || row.id,
    badge: contractType || undefined,
    sub: subParts.join(" · "),
  };
}
