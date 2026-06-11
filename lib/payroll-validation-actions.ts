export type PayrollIssueFix = {
  label: string;
  href: string;
};

function countText(count?: number): string {
  return count && count > 0 ? ` ${count} รายการ` : "";
}

function issueFilterHref(path: string, issueCode: string, periodId: string): string {
  const flt = encodeURIComponent(JSON.stringify({
    __payroll_issue: { type: "text", value: issueCode },
    __period_id: { type: "text", value: periodId },
  }));
  return `${path}?flt=${flt}`;
}

export function buildPayrollIssueFix(issueCode: string, periodId: string, count?: number): PayrollIssueFix | undefined {
  if (!periodId) return undefined;

  if (
    issueCode === "period_status_locked" ||
    issueCode === "invalid_period_dates" ||
    issueCode === "missing_work_days" ||
    issueCode === "missing_hours_per_day"
  ) {
    return { label: "ไปแก้งวดเงินเดือน", href: `/payroll/periods?open=${periodId}` };
  }

  if (issueCode === "employees_without_contract") {
    return {
      label: `ไปดูพนักงาน${countText(count)}`,
      href: issueFilterHref("/payroll/employees", issueCode, periodId),
    };
  }

  if (issueCode === "no_active_contracts" || issueCode === "invalid_contract_wage") {
    return {
      label: `ไปแก้สัญญา${countText(count)}`,
      href: issueFilterHref("/payroll/contracts", issueCode, periodId),
    };
  }

  if (
    issueCode === "recurring_missing_employee" ||
    issueCode === "recurring_missing_contract" ||
    issueCode === "recurring_invalid_amount"
  ) {
    return {
      label: `ไปแก้เงินประจำ${countText(count)}`,
      href: issueFilterHref("/payroll/recurring", issueCode, periodId),
    };
  }

  if (issueCode === "existing_runs") {
    return { label: "ไปดูผลเงินเดือน", href: `/payroll/review?period_id=${periodId}` };
  }

  return undefined;
}
