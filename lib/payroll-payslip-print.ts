export type PayslipPrintLanguage = "employee" | "th" | "en";
export type RenderedPayslipLanguage = "th" | "en";
export type PayslipPrintPaper = "a6-landscape" | "a5-landscape";
export type PayslipMoneyItem = { key: string; th: string; en: string; amount: number };

const EARNINGS_FOR_PRINT: readonly (readonly [string, string, string])[] = [
  ["daily_wage_amount", "ค่าแรงรายวัน", "Daily Wage"],
  ["hourly_wage_amount", "ค่าแรงรายชั่วโมง", "Hourly Wage"],
  ["piece_rate_amount", "ค่าเหมา", "Piece Rate"],
  ["overtime_amount", "OT", "OT"],
  ["allowance_amount", "เงินเพิ่ม", "Allowance"],
  ["bonus_amount", "โบนัส", "Bonus"],
  ["commission_amount", "คอมมิชชั่น", "Commission"],
];

const DEDUCTIONS_FOR_PRINT: readonly (readonly [string, string, string])[] = [
  ["late_deduction", "สาย/ลา/มาสาย/ออกก่อน", "Late/Early Leave"],
  ["absence_deduction", "ขาดงาน", "Absent"],
  ["unpaid_leave_deduction", "ลาไม่รับค่าจ้าง", "Unpaid Leave"],
  ["advance_deduction", "เบิกล่วงหน้า", "Advance"],
  ["damage_deduction", "หักค่าเสียหาย", "Damage"],
  ["social_security_employee", "ประกันสังคม", "Social Security"],
  ["withholding_tax", "ภาษีหัก ณ ที่จ่าย", "Withholding Tax"],
  ["other_deduction", "หักอื่น ๆ", "Other"],
  ["mid_month_paid", "จ่ายกลางเดือน", "Mid-month Paid"],
];

const NET_PAY_DIGIT_CODE: Record<string, string> = {
  "1": "E",
  "2": "R",
  "3": "A",
  "4": "W",
  "5": "a",
  "6": "N",
  "7": "S",
  "8": "H",
  "9": "O",
  "0": "P",
};

const money = (value: unknown): number => Number(value) || 0;
const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export function normalizePayslipPrintLanguage(value: unknown): PayslipPrintLanguage {
  return value === "th" || value === "en" || value === "employee" ? value : "employee";
}

export function normalizePayslipPrintPaper(value: unknown): PayslipPrintPaper {
  return value === "a5-landscape" ? "a5-landscape" : "a6-landscape";
}

export function payslipLanguageForEmployee(
  requested: PayslipPrintLanguage,
  employeeLanguage: unknown,
): RenderedPayslipLanguage {
  if (requested === "th" || requested === "en") return requested;
  return employeeLanguage === "en" ? "en" : "th";
}

export function uniquePayslipIds(ids: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  ids.forEach((id) => {
    const clean = String(id ?? "").trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  });
  return out;
}

export function buildPayslipPrintHref(input: {
  periodId: string;
  payslipIds: unknown[];
  language?: PayslipPrintLanguage | string | null;
  paper?: PayslipPrintPaper | string | null;
  basePath?: string;
  embedded?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("period_id", input.periodId);
  const ids = uniquePayslipIds(input.payslipIds);
  if (ids.length) params.set("ids", ids.join(","));
  params.set("lang", normalizePayslipPrintLanguage(input.language));
  params.set("paper", normalizePayslipPrintPaper(input.paper));
  if (input.embedded) params.set("embedded", "1");
  return `${input.basePath ?? "/payroll/payslips/print"}?${params.toString()}`;
}

export function roundPayslipNetPay(value: unknown): { before: number; rounded: number; adjustment: number } {
  const before = round2(money(value));
  const rounded = Math.floor(before + 0.5);
  return { before, rounded, adjustment: round2(rounded - before) };
}

export function encodePayslipNetPay(value: unknown): string {
  const rounded = Math.max(0, Math.trunc(money(value)));
  return String(rounded).split("").map((digit) => NET_PAY_DIGIT_CODE[digit] ?? "").join("");
}

function moneyItems(line: Record<string, unknown>, defs: readonly (readonly [string, string, string])[]): PayslipMoneyItem[] {
  return defs
    .map(([key, th, en]) => ({ key, th, en, amount: round2(money(line[key])) }))
    .filter((item) => Math.abs(item.amount) > 0.004);
}

export function payslipDisplayMoneyItems(line: Record<string, unknown>): {
  earnings: PayslipMoneyItem[];
  deductions: PayslipMoneyItem[];
} {
  return {
    earnings: moneyItems(line, EARNINGS_FOR_PRINT),
    deductions: moneyItems(line, DEDUCTIONS_FOR_PRINT),
  };
}
