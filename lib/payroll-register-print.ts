export type PayrollRegisterPaper = "a4-landscape" | "a3-landscape";

const money = (value: unknown): number => Number(value) || 0;
const roundMoney = (value: unknown): number => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function normalizePayrollRegisterPaper(value: unknown): PayrollRegisterPaper {
  return value === "a3-landscape" ? "a3-landscape" : "a4-landscape";
}

export function buildPayrollRegisterPrintHref(input: {
  periodId: string;
  paper?: PayrollRegisterPaper | string | null;
  basePath?: string;
  embedded?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("period_id", input.periodId);
  params.set("paper", normalizePayrollRegisterPaper(input.paper));
  if (input.embedded) params.set("embedded", "1");
  return `${input.basePath ?? "/print/payroll-register"}?${params.toString()}`;
}

export function formatThaiNationalId(value: unknown): string {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 13) return raw;
  return `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5, 10)} ${digits.slice(10, 12)} ${digits.slice(12)}`;
}

export function computePayrollRegisterAmounts(line: Record<string, unknown>): {
  base_salary: number;
  mid_month_paid: number;
  month_end_pay: number;
  transfer_net_pay: number;
  overtime_amount: number;
  cash_pay: number;
  social_security: number;
  balance: number;
} {
  const baseSalary = roundMoney(money(line.base_salary));
  const midMonthPaid = roundMoney(money(line.mid_month_paid));
  const socialSecurity = roundMoney(money(line.social_security_employee));
  const monthEndPay = roundMoney(baseSalary - midMonthPaid - socialSecurity);
  const transferNetPay = roundMoney(money(line.net_pay));
  const diff = roundMoney(transferNetPay - monthEndPay);

  return {
    base_salary: baseSalary,
    mid_month_paid: midMonthPaid,
    month_end_pay: monthEndPay,
    transfer_net_pay: transferNetPay,
    overtime_amount: diff > 0 ? diff : 0,
    cash_pay: diff < 0 ? roundMoney(Math.abs(diff)) : 0,
    social_security: socialSecurity,
    balance: roundMoney(baseSalary - socialSecurity),
  };
}
