import { roundPayslipNetPay } from "@/lib/payroll-payslip-print";

export type PaymentPayslipInput = {
  id: string;
  payroll_period_id: string;
  payroll_line_id?: string | null;
  employee_id: string;
  gross_pay: unknown;
  total_deduction: unknown;
  net_pay: unknown;
};

export type MidMonthPaymentInput = {
  payroll_period_id: string;
  employee_id: string;
  setting_id?: string | null;
  amount: unknown;
  note?: string | null;
};

export type PaymentLineDraft = {
  payroll_period_id: string;
  employee_id: string;
  source_payroll_line_id: string | null;
  gross_amount: number;
  deduction_amount: number;
  paid_amount: number;
  status: "draft";
  note: string;
};

export type PaymentLineNote = {
  source?: string;
  payslip_id?: string;
  setting_id?: string | null;
  net_before_rounding?: number;
  rounding_adjustment?: number;
  rounded_net_pay?: number;
  line_note?: string | null;
};

export type PaymentExportRow = {
  employee_code?: string | null;
  employee_name?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_no?: string | null;
  payslip_no?: string | null;
  paid_amount?: unknown;
  status?: string | null;
  note?: string | null;
};

export type PaymentBatchType = "month_end" | "mid_month" | "special";
export type PaymentCompareStatus = "same" | "changed" | "new" | "missing_this_month";

const PAYMENT_BATCH_TYPES: PaymentBatchType[] = ["month_end", "mid_month", "special"];
const LEGACY_PAYMENT_METHOD_BATCH_TYPE: Record<string, PaymentBatchType> = {
  bank: "month_end",
  cash: "month_end",
  advance: "mid_month",
};

const money = (value: unknown): number => Number(value) || 0;
const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export function normalizePaymentBatchType(value: unknown): PaymentBatchType {
  const raw = String(value ?? "").trim();
  if ((PAYMENT_BATCH_TYPES as string[]).includes(raw)) return raw as PaymentBatchType;
  return LEGACY_PAYMENT_METHOD_BATCH_TYPE[raw] ?? "month_end";
}

export function buildPaymentLineFromPayslip(slip: PaymentPayslipInput): PaymentLineDraft {
  const rounded = roundPayslipNetPay(slip.net_pay);
  return {
    payroll_period_id: slip.payroll_period_id,
    employee_id: slip.employee_id,
    source_payroll_line_id: slip.payroll_line_id ?? null,
    gross_amount: round2(money(slip.gross_pay)),
    deduction_amount: round2(money(slip.total_deduction)),
    paid_amount: rounded.rounded,
    status: "draft",
    note: JSON.stringify({
      source: "payroll_payslip",
      payslip_id: slip.id,
      net_before_rounding: rounded.before,
      rounding_adjustment: rounded.adjustment,
      rounded_net_pay: rounded.rounded,
    }),
  };
}

export function buildMidMonthPaymentLine(input: MidMonthPaymentInput): PaymentLineDraft {
  const amount = round2(Math.max(0, money(input.amount)));
  return {
    payroll_period_id: input.payroll_period_id,
    employee_id: input.employee_id,
    source_payroll_line_id: null,
    gross_amount: 0,
    deduction_amount: 0,
    paid_amount: amount,
    status: "draft",
    note: JSON.stringify({
      source: "payroll_mid_month",
      setting_id: input.setting_id ?? null,
      rounded_net_pay: amount,
      line_note: input.note ?? null,
    }),
  };
}

export function comparePaymentLineWithPrevious(currentAmount: unknown, previousAmount: unknown): {
  previous_paid_amount: number | null;
  delta_amount: number | null;
  compare_status: PaymentCompareStatus;
} {
  const hasPrevious = previousAmount !== null && previousAmount !== undefined && previousAmount !== "";
  const current = round2(money(currentAmount));
  if (!hasPrevious) return { previous_paid_amount: null, delta_amount: null, compare_status: "new" };
  const previous = round2(money(previousAmount));
  const delta = round2(current - previous);
  if (current <= 0 && previous > 0) return { previous_paid_amount: previous, delta_amount: delta, compare_status: "missing_this_month" };
  return { previous_paid_amount: previous, delta_amount: delta, compare_status: Math.abs(delta) < 0.005 ? "same" : "changed" };
}

export function parsePaymentLineNote(note: unknown): PaymentLineNote {
  if (!note || typeof note !== "string") return {};
  try {
    const parsed = JSON.parse(note) as PaymentLineNote;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function paymentExportCsv(rows: PaymentExportRow[]): string {
  const header = [
    "employee_code",
    "employee_name",
    "bank_name",
    "bank_account_name",
    "bank_account_no",
    "paid_amount",
  ];
  const body = rows.map((row) => {
    return [
      row.employee_code,
      row.employee_name,
      row.bank_name,
      row.bank_account_name,
      row.bank_account_no,
      money(row.paid_amount),
    ].map(csvEscape).join(",");
  });
  return `\ufeff${[header.join(","), ...body].join("\n")}`;
}
