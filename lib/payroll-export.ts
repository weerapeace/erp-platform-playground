import * as XLSX from "xlsx";
import { writeAudit } from "@/lib/audit";
import { money } from "@/lib/payroll-calc";
import type { Pnd3AllocationPreview } from "@/lib/payroll-pnd3-allocation";
import { applyPnd3Allocation, buildPnd3AllocationPreview, isForeignDailyPnd3Source } from "@/lib/payroll-pnd3-allocation-db";
import { listPnd3ExportRowOverrides } from "@/lib/payroll-pnd3-export-row-overrides-db";
import { listPnd3RecurringItems, pnd3GrossUpFromNet } from "@/lib/payroll-pnd3-recurring-db";
import { listPayrollRegisterRecurringItems, type PayrollRegisterRecurringItem } from "@/lib/payroll-register-recurring-db";
import { computePayrollRegisterAmounts, formatThaiNationalId } from "@/lib/payroll-register-print";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Row = Record<string, unknown>;

export type PayrollExportType = "pnd3" | "payroll_register";
export const DEFAULT_PND3_INCOME_TYPE = "ค่าจ้าง";
const MOJIBAKE_PATTERN = /(เธ|โ€|ยท|เธฟ)/;
const PAYROLL_REGISTER_COMPANY_NAME = "ห้างหุ้นส่วนจำกัด ไอ.เอส.จี. เทรดดิ้ง ";
export const PAYROLL_REGISTER_EXCEL_NUMBER_FORMAT = '_-* #,##0.00_-;-* #,##0.00_-;_-* "-"??_-;_-@_-';
const PAYROLL_REGISTER_HEADERS = [
  "ลำดับ",
  "ชื่อ-นามสกุล",
  "เลขบัตร/Passport",
  "ฐานเงินเดือน",
  "เงินเดือน 16",
  "เงินเดือน 31",
  "OT 31",
  "เงินสด",
  "ปกส. 5%",
  "ยอดคงเหลือ",
] as const;
const PAYROLL_REGISTER_COLUMN_WIDTHS = [4.3, 26.9, 19.9, 14.9, 13, 13, 10.9, 13, 13, 12.9];
const PND3_HEADERS = ["ลำดับ", "วันที่", "ชื่อบริษัท/บุคคล", "เลข 13 หลัก", "ที่อยู่", "ค่าจ้าง/บริการ", "จำนวนเงิน", "ภาษี", "ยอดสุทธิ"] as const;
const PND3_COLUMN_WIDTHS = [10.85546875, 11.85546875, 26.85546875, 19.85546875, 36.85546875, 16.85546875, 11.85546875, 10.85546875, 10.85546875];
const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

export type PayrollExportActor = {
  actorId?: string | null;
  actorName?: string | null;
};

export type PayrollExportRow = {
  id: string;
  selection_id: string;
  source: "employee" | "pnd3_recurring" | "payroll_register_recurring";
  source_id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  nickname: string;
  nationality: string;
  national_id: string;
  passport_no: string;
  address: string;
  income_type: string;
  contract_id: string;
  contract_type: string;
  wage_type: string;
  payroll_register_base_salary: number;
  include_pnd3_export: boolean;
  include_payroll_register_export: boolean;
  base_salary: number;
  daily_wage_amount: number;
  hourly_wage_amount: number;
  piece_rate_amount: number;
  overtime_amount: number;
  allowance_amount: number;
  bonus_amount: number;
  commission_amount: number;
  late_deduction: number;
  absence_deduction: number;
  unpaid_leave_deduction: number;
  advance_deduction: number;
  damage_deduction: number;
  social_security_employee: number;
  withholding_tax: number;
  other_deduction: number;
  mid_month_paid: number;
  gross_pay: number;
  total_deduction: number;
  net_pay: number;
  identity_no: string;
  register_base_salary: number;
  register_mid_month_paid: number;
  register_month_end_pay: number;
  register_transfer_net_pay: number;
  register_overtime_amount: number;
  register_cash_pay: number;
  register_social_security: number;
  register_balance: number;
  pnd3_allocation_net?: number;
  pnd3_row_key?: string;
  pnd3_base_selection_id?: string;
  pnd3_payment_date?: string;
  pnd3_is_extra?: boolean;
  pnd3_net_override?: number | null;
  pnd3_national_id_override?: string | null;
  pnd3_address_override?: string | null;
};

export type Pnd3ExportRowOverride = {
  row_key: string;
  base_selection_id: string;
  payment_date?: string | null;
  net_pay?: number | null;
  national_id?: string | null;
  address?: string | null;
  is_extra?: boolean;
  display_order?: number;
};

export type PayrollExportPreview = {
  export_type: PayrollExportType;
  period: { id: string; period_name: string; status: string; payment_date: string };
  run: { id: string; run_no: number; calculated_at: string | null } | null;
  rows: PayrollExportRow[];
  totals: { count: number; gross_pay: number; withholding_tax: number; net_pay: number; register_base: number };
  pnd3_allocation?: Pnd3AllocationPreview | null;
};

const LINE_COLS = [
  "id",
  "employee_id",
  "contract_id",
  "payroll_run_id",
  "base_salary",
  "daily_wage_amount",
  "hourly_wage_amount",
  "piece_rate_amount",
  "overtime_amount",
  "allowance_amount",
  "bonus_amount",
  "commission_amount",
  "late_deduction",
  "absence_deduction",
  "unpaid_leave_deduction",
  "advance_deduction",
  "damage_deduction",
  "social_security_employee",
  "withholding_tax",
  "other_deduction",
  "mid_month_paid",
  "gross_pay",
  "total_deduction",
  "net_pay",
].join(", ");

const text = (value: unknown) => String(value ?? "").trim();
const boolDefault = (value: unknown, fallback: boolean) => value === null || value === undefined ? fallback : value === true;
const round2 = (value: number) => Math.round(value * 100) / 100;
const CONFIRMED_PAYMENT_STATUSES = ["approved", "paid"] as const;
export function cleanPnd3IncomeType(value: unknown) {
  const raw = text(value);
  if (!raw || MOJIBAKE_PATTERN.test(raw)) return DEFAULT_PND3_INCOME_TYPE;
  return raw;
}

export function pnd3NetPayBasis(payrollNetPay: unknown, paidAmount: unknown) {
  const paid = round2(money(paidAmount));
  if (paid > 0) return paid;
  return round2(money(payrollNetPay));
}

export function payrollRegisterNetPayBasis(payrollNetPay: unknown, paidAmount: unknown) {
  const paid = round2(money(paidAmount));
  if (paid > 0) return paid;
  return round2(money(payrollNetPay));
}

async function pnd3ConfirmedPaymentNetByEmployee(admin: ReturnType<typeof supabaseAdmin>, periodId: string) {
  const { data: batchRows, error: batchError } = await admin
    .from("payment_batches")
    .select("id")
    .eq("payroll_period_id", periodId)
    .in("status", CONFIRMED_PAYMENT_STATUSES);
  if (batchError) throw new Error(batchError.message);

  const batchIds = ((batchRows ?? []) as Row[]).map((batch) => text(batch.id)).filter(Boolean);
  if (!batchIds.length) return new Map<string, number>();

  const { data: lineRows, error: lineError } = await admin
    .from("payment_batch_lines")
    .select("employee_id, paid_amount, status")
    .in("payment_batch_id", batchIds)
    .in("status", CONFIRMED_PAYMENT_STATUSES);
  if (lineError) throw new Error(lineError.message);

  const byEmployee = new Map<string, number>();
  ((lineRows ?? []) as Row[]).forEach((line) => {
    const employeeId = text(line.employee_id);
    const paidAmount = round2(money(line.paid_amount));
    if (!employeeId || paidAmount <= 0) return;
    byEmployee.set(employeeId, round2((byEmployee.get(employeeId) ?? 0) + paidAmount));
  });
  return byEmployee;
}

async function payrollRegisterConfirmedMonthEndPaymentNetByEmployee(admin: ReturnType<typeof supabaseAdmin>, periodId: string) {
  const { data: batchRows, error: batchError } = await admin
    .from("payment_batches")
    .select("id")
    .eq("payroll_period_id", periodId)
    .eq("batch_type", "month_end")
    .in("status", CONFIRMED_PAYMENT_STATUSES);
  if (batchError) throw new Error(batchError.message);

  const batchIds = ((batchRows ?? []) as Row[]).map((batch) => text(batch.id)).filter(Boolean);
  if (!batchIds.length) return new Map<string, number>();

  const { data: lineRows, error: lineError } = await admin
    .from("payment_batch_lines")
    .select("employee_id, paid_amount, status")
    .in("payment_batch_id", batchIds)
    .in("status", CONFIRMED_PAYMENT_STATUSES);
  if (lineError) throw new Error(lineError.message);

  const byEmployee = new Map<string, number>();
  ((lineRows ?? []) as Row[]).forEach((line) => {
    const employeeId = text(line.employee_id);
    const paidAmount = round2(money(line.paid_amount));
    if (!employeeId || paidAmount <= 0) return;
    byEmployee.set(employeeId, round2((byEmployee.get(employeeId) ?? 0) + paidAmount));
  });
  return byEmployee;
}
const buddhistDate = (value: string) => {
  if (!value) return "";
  const [yyyy, mm, dd] = value.slice(0, 10).split("-");
  if (!yyyy || !mm || !dd) return value;
  return `${Number(dd)}/${Number(mm)}/${Number(yyyy) + 543}`;
};

function payrollRegisterMonthTitle(paymentDate: string, fallback: string) {
  const [yyyy, mm] = text(paymentDate).slice(0, 10).split("-");
  const monthIndex = Number(mm) - 1;
  const year = Number(yyyy);
  if (Number.isFinite(year) && monthIndex >= 0 && monthIndex < THAI_MONTHS.length) {
    return `${THAI_MONTHS[monthIndex]} ${year + 543}`;
  }
  return fallback || "";
}

function employeeName(emp: Row) {
  const name = [emp.first_name, emp.last_name].map(text).filter(Boolean).join(" ");
  const nickname = text(emp.nickname);
  return `${name || nickname || text(emp.employee_code)}${nickname && name ? ` (${nickname})` : ""}`;
}

function employeeOfficialName(emp: Row) {
  return [emp.title, emp.first_name, emp.last_name].map(text).filter(Boolean).join(" ") || employeeName(emp);
}

function paymentDateFor(period: Row) {
  return text(period.payment_date) || text(period.end_date) || new Date().toISOString().slice(0, 10);
}

function exportFlag(row: PayrollExportRow, type: PayrollExportType) {
  if (type === "pnd3") {
    if (row.net_pay <= 0) return false;
    if (row.source !== "employee" || row.pnd3_is_extra === true) return true;
    return row.include_pnd3_export === true;
  }
  return row.include_payroll_register_export !== false;
}

export function filterPayrollExportRows(rows: PayrollExportRow[], type: PayrollExportType, employeeIds?: string[]) {
  const selected = new Set((employeeIds ?? []).filter(Boolean));
  return rows
    .filter((row) => exportFlag(row, type))
    .filter((row) => selected.size === 0 || selected.has(row.selection_id) || (!row.pnd3_is_extra && selected.has(row.employee_id)))
    .sort((a, b) => {
      if (type === "pnd3") {
        const baseSort = (a.pnd3_base_selection_id || a.selection_id).localeCompare(b.pnd3_base_selection_id || b.selection_id, "th");
        if (baseSort !== 0) return baseSort;
        if ((a.pnd3_is_extra ?? false) !== (b.pnd3_is_extra ?? false)) return a.pnd3_is_extra ? 1 : -1;
      }
      const sourceSort = a.source.localeCompare(b.source);
      if (sourceSort !== 0) return sourceSort;
      return (a.employee_code || a.employee_name).localeCompare(b.employee_code || b.employee_name, "th");
    });
}

export function payrollExportTotals(rows: PayrollExportRow[]) {
  return {
    count: rows.length,
    gross_pay: round2(rows.reduce((sum, row) => sum + row.gross_pay, 0)),
    withholding_tax: round2(rows.reduce((sum, row) => sum + row.withholding_tax, 0)),
    net_pay: round2(rows.reduce((sum, row) => sum + row.net_pay, 0)),
    register_base: round2(rows.reduce((sum, row) => sum + row.payroll_register_base_salary, 0)),
  };
}

export function payrollRegisterExportAmounts(row: Record<string, unknown>) {
  const registerBase = money(row.payroll_register_base_salary) || money(row.base_salary);
  const registerNetPay = payrollRegisterNetPayBasis(row.net_pay, row.register_paid_amount ?? row.paid_amount);
  return computePayrollRegisterAmounts({
    base_salary: registerBase,
    mid_month_paid: row.mid_month_paid,
    social_security_employee: row.social_security_employee,
    net_pay: registerNetPay,
  });
}

export function payrollExportIdentityNo(row: Pick<PayrollExportRow, "identity_no" | "national_id" | "passport_no"> | Record<string, unknown>) {
  const identityNo = text(row.identity_no);
  return formatThaiNationalId(identityNo) || formatThaiNationalId(text(row.national_id)) || identityNo || text(row.passport_no) || "-";
}

export function buildPayrollRegisterRecurringExportRow(item: PayrollRegisterRecurringItem): PayrollExportRow {
  const identityNo = payrollExportIdentityNo({
    identity_no: item.identity_no,
    national_id: item.national_id,
    passport_no: item.passport_no,
  });
  const baseSalary = money(item.register_base_salary);
  const midMonthPaid = money(item.register_mid_month_paid);
  const monthEndPay = money(item.register_month_end_pay);
  const transferNetPay = money(item.register_transfer_net_pay);
  const overtimeAmount = money(item.register_overtime_amount);
  const cashPay = money(item.register_cash_pay);
  const socialSecurity = money(item.register_social_security);
  const balance = money(item.register_balance);
  return {
    id: item.id,
    selection_id: `payroll-register-recurring:${item.id}`,
    source: "payroll_register_recurring",
    source_id: item.id,
    employee_id: "",
    employee_code: item.recipient_code,
    employee_name: item.recipient_name,
    nickname: item.nickname,
    nationality: item.nationality,
    national_id: item.national_id,
    passport_no: item.passport_no,
    address: "",
    income_type: "",
    contract_id: "",
    contract_type: "คนนอกประจำ",
    wage_type: "payroll_register_recurring",
    payroll_register_base_salary: baseSalary,
    include_pnd3_export: false,
    include_payroll_register_export: true,
    base_salary: baseSalary,
    daily_wage_amount: 0,
    hourly_wage_amount: 0,
    piece_rate_amount: 0,
    overtime_amount: overtimeAmount,
    allowance_amount: 0,
    bonus_amount: 0,
    commission_amount: 0,
    late_deduction: 0,
    absence_deduction: 0,
    unpaid_leave_deduction: 0,
    advance_deduction: 0,
    damage_deduction: 0,
    social_security_employee: socialSecurity,
    withholding_tax: 0,
    other_deduction: 0,
    mid_month_paid: midMonthPaid,
    gross_pay: transferNetPay,
    total_deduction: 0,
    net_pay: transferNetPay,
    identity_no: identityNo,
    register_base_salary: baseSalary,
    register_mid_month_paid: midMonthPaid,
    register_month_end_pay: monthEndPay,
    register_transfer_net_pay: transferNetPay,
    register_overtime_amount: overtimeAmount,
    register_cash_pay: cashPay,
    register_social_security: socialSecurity,
    register_balance: balance,
  };
}

function cleanIsoDate(value: unknown, fallback: string) {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

function applyPnd3NetAmount(row: PayrollExportRow, netPay: unknown): PayrollExportRow {
  const amounts = pnd3GrossUpFromNet(netPay, 3);
  return {
    ...row,
    gross_pay: amounts.gross_pay,
    withholding_tax: amounts.withholding_tax,
    total_deduction: amounts.withholding_tax,
    net_pay: amounts.net_pay,
    pnd3_net_override: amounts.net_pay,
  };
}

export function applyPnd3ExportRowOverrides(
  rows: PayrollExportRow[],
  overrides: Pnd3ExportRowOverride[],
  defaultPaymentDate: string,
): PayrollExportRow[] {
  const fallbackDate = cleanIsoDate(defaultPaymentDate, new Date().toISOString().slice(0, 10));
  const normalOverrides = new Map<string, Pnd3ExportRowOverride>();
  const extras = new Map<string, Pnd3ExportRowOverride[]>();
  overrides.forEach((override) => {
    const rowKey = text(override.row_key);
    const baseSelectionId = text(override.base_selection_id);
    if (!rowKey || !baseSelectionId) return;
    const clean = {
      ...override,
      row_key: rowKey,
      base_selection_id: baseSelectionId,
      payment_date: override.payment_date ? cleanIsoDate(override.payment_date, fallbackDate) : null,
      net_pay: override.net_pay == null ? null : Math.max(money(override.net_pay), 0),
      national_id: override.national_id == null ? null : text(override.national_id),
      address: override.address == null ? null : text(override.address),
      display_order: Number(override.display_order) || 0,
      is_extra: override.is_extra === true,
    };
    if (clean.is_extra) {
      const list = extras.get(baseSelectionId) ?? [];
      list.push(clean);
      extras.set(baseSelectionId, list);
      return;
    }
    normalOverrides.set(rowKey, clean);
  });

  const result: PayrollExportRow[] = [];
  rows.forEach((row) => {
    const baseSelectionId = row.pnd3_base_selection_id || row.selection_id;
    const rowKey = row.pnd3_row_key || row.selection_id;
    const override = normalOverrides.get(rowKey) ?? normalOverrides.get(baseSelectionId);
    let baseRow: PayrollExportRow = {
      ...row,
      selection_id: rowKey,
      pnd3_row_key: rowKey,
      pnd3_base_selection_id: baseSelectionId,
      pnd3_payment_date: cleanIsoDate(override?.payment_date ?? row.pnd3_payment_date, fallbackDate),
      pnd3_is_extra: false,
      pnd3_net_override: override?.net_pay ?? row.pnd3_net_override ?? null,
      pnd3_national_id_override: override?.national_id ?? row.pnd3_national_id_override ?? null,
      pnd3_address_override: override?.address ?? row.pnd3_address_override ?? null,
    };
    if (override?.national_id != null) baseRow.national_id = override.national_id;
    if (override?.address != null) baseRow.address = override.address;
    if (override?.net_pay != null) baseRow = applyPnd3NetAmount(baseRow, override.net_pay);
    result.push(baseRow);

    (extras.get(baseSelectionId) ?? [])
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.row_key.localeCompare(b.row_key))
      .forEach((extra) => {
        const netPay = extra.net_pay ?? baseRow.net_pay;
        result.push(applyPnd3NetAmount({
          ...baseRow,
          id: extra.row_key,
          selection_id: extra.row_key,
          pnd3_row_key: extra.row_key,
          pnd3_base_selection_id: baseSelectionId,
          pnd3_payment_date: cleanIsoDate(extra.payment_date, fallbackDate),
          pnd3_is_extra: true,
          pnd3_allocation_net: 0,
          national_id: extra.national_id ?? baseRow.national_id,
          address: extra.address ?? baseRow.address,
          pnd3_national_id_override: extra.national_id ?? baseRow.national_id,
          pnd3_address_override: extra.address ?? baseRow.address,
        }, netPay));
      });
  });
  return result;
}

export async function getPayrollExportPreview(periodId: string, type: PayrollExportType): Promise<PayrollExportPreview> {
  const admin = supabaseAdmin();
  const { data: periodRows, error: periodError } = await admin
    .from("payroll_periods")
    .select("id, period_name, status, start_date, end_date, payment_date")
    .eq("id", periodId)
    .limit(1);
  if (periodError) throw new Error(periodError.message);
  const period = (periodRows?.[0] as Row | undefined) ?? null;
  if (!period) throw new Error("ไม่พบงวดเงินเดือน");

  const { data: runRows, error: runError } = await admin
    .from("payroll_runs")
    .select("id, run_no, calculated_at")
    .eq("payroll_period_id", periodId)
    .order("run_no", { ascending: false })
    .limit(1);
  if (runError) throw new Error(runError.message);
  const run = (runRows?.[0] as { id: string; run_no: number; calculated_at: string | null } | undefined) ?? null;

  let lineQuery = admin.from("payroll_lines").select(LINE_COLS).eq("payroll_period_id", periodId);
  if (run) lineQuery = lineQuery.eq("payroll_run_id", run.id);
  const { data: lineRows, error: lineError } = await lineQuery;
  if (lineError) throw new Error(lineError.message);
  const lines = ((lineRows ?? []) as unknown) as Row[];

  const employeeIds = [...new Set(lines.map((row) => text(row.employee_id)).filter(Boolean))];
  const contractIds = [...new Set(lines.map((row) => text(row.contract_id)).filter(Boolean))];

  let employeeRows: Row[] = [];
  let contractRows: Row[] = [];
  if (employeeIds.length) {
    const { data, error } = await admin.from("employees").select("id, employee_code, title, first_name, last_name, nickname, nationality, national_id, passport_no, address").in("id", employeeIds);
    if (error) throw new Error(error.message);
    employeeRows = (data ?? []) as Row[];
  }
  if (contractIds.length) {
    const { data, error } = await admin.from("employee_contracts").select("id, contract_type, wage_type, payroll_register_base_salary, include_pnd3_export, include_payroll_register_export").in("id", contractIds);
    if (error) throw new Error(error.message);
    contractRows = (data ?? []) as Row[];
  }

  const employees = new Map<string, Row>();
  const contracts = new Map<string, Row>();
  employeeRows.forEach((row) => employees.set(text(row.id), row));
  contractRows.forEach((row) => contracts.set(text(row.id), row));
  const pnd3PaymentNetByEmployee = type === "pnd3"
    ? await pnd3ConfirmedPaymentNetByEmployee(admin, periodId)
    : new Map<string, number>();
  const payrollRegisterPaymentNetByEmployee = type === "payroll_register"
    ? await payrollRegisterConfirmedMonthEndPaymentNetByEmployee(admin, periodId)
    : new Map<string, number>();

  const allRows = lines.map((line): PayrollExportRow => {
    const employeeId = text(line.employee_id);
    const employee = employees.get(employeeId) ?? {};
    const contract = contracts.get(text(line.contract_id)) ?? {};
    const pnd3NetBasis = pnd3NetPayBasis(line.net_pay, pnd3PaymentNetByEmployee.get(employeeId));
    const pnd3Amounts = pnd3GrossUpFromNet(pnd3NetBasis, 3);
    const registerBase = money(contract.payroll_register_base_salary) || money(line.base_salary);
    const registerPaidAmount = payrollRegisterPaymentNetByEmployee.get(employeeId);
    const identityNo = payrollExportIdentityNo({
      identity_no: "",
      national_id: text(employee.national_id),
      passport_no: text(employee.passport_no),
    });
    const registerAmounts = payrollRegisterExportAmounts({
      ...line,
      payroll_register_base_salary: registerBase,
      register_paid_amount: registerPaidAmount,
    });
    return {
      id: text(line.id),
      selection_id: employeeId,
      source: "employee",
      source_id: employeeId,
      employee_id: employeeId,
      employee_code: text(employee.employee_code),
      employee_name: employeeOfficialName(employee),
      nickname: text(employee.nickname),
      nationality: text(employee.nationality),
      national_id: identityNo,
      passport_no: text(employee.passport_no),
      address: text(employee.address),
      income_type: cleanPnd3IncomeType(null),
      contract_id: text(line.contract_id),
      contract_type: text(contract.contract_type) || text(line.contract_type),
      wage_type: text(contract.wage_type) || text(line.wage_type),
      payroll_register_base_salary: registerBase,
      include_pnd3_export: boolDefault(contract.include_pnd3_export, false),
      include_payroll_register_export: boolDefault(contract.include_payroll_register_export, true),
      base_salary: money(line.base_salary),
      daily_wage_amount: money(line.daily_wage_amount),
      hourly_wage_amount: money(line.hourly_wage_amount),
      piece_rate_amount: money(line.piece_rate_amount),
      overtime_amount: money(line.overtime_amount),
      allowance_amount: money(line.allowance_amount),
      bonus_amount: money(line.bonus_amount),
      commission_amount: money(line.commission_amount),
      late_deduction: money(line.late_deduction),
      absence_deduction: money(line.absence_deduction),
      unpaid_leave_deduction: money(line.unpaid_leave_deduction),
      advance_deduction: money(line.advance_deduction),
      damage_deduction: money(line.damage_deduction),
      social_security_employee: money(line.social_security_employee),
      withholding_tax: type === "pnd3" ? pnd3Amounts.withholding_tax : money(line.withholding_tax),
      other_deduction: money(line.other_deduction),
      mid_month_paid: money(line.mid_month_paid),
      gross_pay: type === "pnd3" ? pnd3Amounts.gross_pay : money(line.gross_pay),
      total_deduction: type === "pnd3" ? pnd3Amounts.withholding_tax : money(line.total_deduction),
      net_pay: type === "pnd3" ? pnd3Amounts.net_pay : money(line.net_pay),
      identity_no: identityNo,
      register_base_salary: registerAmounts.base_salary,
      register_mid_month_paid: registerAmounts.mid_month_paid,
      register_month_end_pay: registerAmounts.month_end_pay,
      register_transfer_net_pay: registerAmounts.transfer_net_pay,
      register_overtime_amount: registerAmounts.overtime_amount,
      register_cash_pay: registerAmounts.cash_pay,
      register_social_security: registerAmounts.social_security,
      register_balance: registerAmounts.balance,
    };
  });

  const recurringRows: PayrollExportRow[] = type === "pnd3"
    ? (await listPnd3RecurringItems(false)).map((item): PayrollExportRow => {
      const amounts = pnd3GrossUpFromNet(item.default_net_amount, item.tax_rate);
      return {
        id: item.id,
        selection_id: `pnd3:${item.id}`,
        source: "pnd3_recurring",
        source_id: item.id,
        employee_id: "",
        employee_code: "",
        employee_name: item.recipient_name,
        nickname: "",
        nationality: "",
        national_id: item.tax_id,
        passport_no: "",
        address: item.address,
        income_type: cleanPnd3IncomeType(item.income_type),
        contract_id: "",
        contract_type: "รายการประจำ",
        wage_type: "pnd3",
        payroll_register_base_salary: 0,
        include_pnd3_export: true,
        include_payroll_register_export: false,
        base_salary: 0,
        daily_wage_amount: 0,
        hourly_wage_amount: 0,
        piece_rate_amount: 0,
        overtime_amount: 0,
        allowance_amount: 0,
        bonus_amount: 0,
        commission_amount: 0,
        late_deduction: 0,
        absence_deduction: 0,
        unpaid_leave_deduction: 0,
        advance_deduction: 0,
        damage_deduction: 0,
        social_security_employee: 0,
        withholding_tax: amounts.withholding_tax,
        other_deduction: 0,
        mid_month_paid: 0,
        gross_pay: amounts.gross_pay,
        total_deduction: amounts.withholding_tax,
        net_pay: amounts.net_pay,
        identity_no: item.tax_id,
        register_base_salary: 0,
        register_mid_month_paid: 0,
        register_month_end_pay: 0,
        register_transfer_net_pay: 0,
        register_overtime_amount: 0,
        register_cash_pay: 0,
        register_social_security: 0,
        register_balance: 0,
      };
    })
    : (await listPayrollRegisterRecurringItems(false)).map(buildPayrollRegisterRecurringExportRow);

  const rawRows = [...allRows, ...recurringRows];
  let rows = filterPayrollExportRows(rawRows, type);
  let pnd3Allocation: Pnd3AllocationPreview | null = null;
  if (type === "pnd3") {
    rows = rows.filter((row) => !isForeignDailyPnd3Source(row));
    pnd3Allocation = await buildPnd3AllocationPreview(periodId, rawRows, rows);
    rows = applyPnd3Allocation(rows, pnd3Allocation, rawRows.filter((row) => !isForeignDailyPnd3Source(row)));
    rows = applyPnd3ExportRowOverrides(rows, await listPnd3ExportRowOverrides(periodId), paymentDateFor(period));
    rows = filterPayrollExportRows(rows, type);
  }
  return {
    export_type: type,
    period: {
      id: text(period.id),
      period_name: text(period.period_name),
      status: text(period.status),
      payment_date: paymentDateFor(period),
    },
    run,
    rows,
    totals: payrollExportTotals(rows),
    pnd3_allocation: pnd3Allocation,
  };
}

function payrollRegisterSheetRows(rows: PayrollExportRow[], _paymentDate: string) {
  return [
    [...PAYROLL_REGISTER_HEADERS],
    ...rows.map((row, index) => [
      index + 1,
      row.employee_name,
      payrollExportIdentityNo(row),
      row.register_base_salary,
      row.register_mid_month_paid,
      row.register_month_end_pay,
      row.register_overtime_amount,
      row.register_cash_pay,
      row.register_social_security,
      row.register_balance,
    ]),
  ];
}

function payrollRegisterMoney(value: unknown) {
  return round2(money(value));
}

function pnd3IdentityNo(row: PayrollExportRow) {
  return formatThaiNationalId(text(row.national_id)) || formatThaiNationalId(text(row.identity_no)) || text(row.national_id) || text(row.identity_no) || text(row.passport_no) || "-";
}

export function buildPayrollRegisterWorkbookBuffer(rows: PayrollExportRow[], paymentDate: string, periodName: string) {
  const firstDataRow = 4;
  const lastDataRow = firstDataRow + rows.length - 1;
  const totalRowNumber = lastDataRow + 1;
  const sheetRows = [
    [PAYROLL_REGISTER_COMPANY_NAME],
    [`  ทะเบียนเงินเดือน ${payrollRegisterMonthTitle(paymentDate, periodName)}`],
    [...PAYROLL_REGISTER_HEADERS],
    ...rows.map((row, index) => [
      index + 1,
      row.employee_name,
      payrollExportIdentityNo(row),
      payrollRegisterMoney(row.register_base_salary),
      payrollRegisterMoney(row.register_mid_month_paid),
      payrollRegisterMoney(row.register_month_end_pay),
      payrollRegisterMoney(row.register_overtime_amount),
      payrollRegisterMoney(row.register_cash_pay),
      payrollRegisterMoney(row.register_social_security),
      payrollRegisterMoney(row.register_balance),
    ]),
    ["", "รวม", "", 0, 0, 0, 0, 0, 0, 0],
  ];

  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: "Payroll Register",
    Subject: "Payroll Register",
    Author: "ERP Payroll",
    CreatedDate: new Date(),
  };
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
  ];
  worksheet["!cols"] = PAYROLL_REGISTER_COLUMN_WIDTHS.map((width) => ({ wch: width }));
  worksheet["!rows"] = Array.from({ length: totalRowNumber }, () => ({ hpt: 20.6 }));

  for (let columnNumber = 4; columnNumber <= 10; columnNumber += 1) {
    const columnLetter = XLSX.utils.encode_col(columnNumber - 1);
    const cellRef = `${columnLetter}${totalRowNumber}`;
    worksheet[cellRef] = { t: "n", f: `SUM(${columnLetter}${firstDataRow}:${columnLetter}${lastDataRow})`, z: PAYROLL_REGISTER_EXCEL_NUMBER_FORMAT };
  }

  for (let rowNumber = firstDataRow; rowNumber <= totalRowNumber; rowNumber += 1) {
    for (let columnNumber = 4; columnNumber <= 10; columnNumber += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: rowNumber - 1, c: columnNumber - 1 });
      const cell = worksheet[cellRef];
      if (cell) cell.z = PAYROLL_REGISTER_EXCEL_NUMBER_FORMAT;
    }
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, "Payroll Register");
  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
    cellStyles: true,
  }) as Buffer;
}

export function pnd3SheetRows(rows: PayrollExportRow[], paymentDate: string) {
  return [
    ["ภ.ง.ด.3", "", "", "", "", "", "", "", ""],
    [...PND3_HEADERS],
    ...rows.map((row, index) => [
      index + 1,
      buddhistDate(row.pnd3_payment_date || paymentDate),
      row.employee_name,
      pnd3IdentityNo(row),
      row.address,
      cleanPnd3IncomeType(row.income_type),
      payrollRegisterMoney(row.gross_pay),
      payrollRegisterMoney(row.withholding_tax),
      payrollRegisterMoney(row.net_pay),
    ]),
    ["", "", "รวม", "", "", "", 0, 0, 0],
  ];
}

function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pnd3StringCell(ref: string, value: unknown, styleId: number) {
  const textValue = String(value ?? "");
  if (!textValue) return `<c r="${ref}" s="${styleId}"/>`;
  return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t>${xmlEscape(textValue)}</t></is></c>`;
}

function pnd3NumberCell(ref: string, value: unknown, styleId: number) {
  return `<c r="${ref}" s="${styleId}"><v>${payrollRegisterMoney(value)}</v></c>`;
}

function pnd3FormulaCell(ref: string, formula: string, value: unknown, styleId: number) {
  return `<c r="${ref}" s="${styleId}"><f>${xmlEscape(formula)}</f><v>${payrollRegisterMoney(value)}</v></c>`;
}

function buildPnd3WorksheetXml(rows: PayrollExportRow[], paymentDate: string) {
  const firstDataRow = 3;
  const lastDataRow = firstDataRow + rows.length - 1;
  const totalRowNumber = lastDataRow + 1;
  const totals = payrollExportTotals(rows);
  const rowXml: string[] = [];
  const titleCells = Array.from({ length: PND3_HEADERS.length }, (_, index) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: index });
    return pnd3StringCell(ref, index === 0 ? "ภ.ง.ด.3" : "", 1);
  }).join("");
  rowXml.push(`<row r="1" ht="20.6" customHeight="1">${titleCells}</row>`);

  rowXml.push(
    `<row r="2" ht="20.6" customHeight="1">${PND3_HEADERS.map((header, index) =>
      pnd3StringCell(XLSX.utils.encode_cell({ r: 1, c: index }), header, 2),
    ).join("")}</row>`,
  );

  rows.forEach((row, index) => {
    const rowNumber = firstDataRow + index;
    const values = [
      pnd3NumberCell(`A${rowNumber}`, index + 1, 4),
      pnd3StringCell(`B${rowNumber}`, buddhistDate(row.pnd3_payment_date || paymentDate), 4),
      pnd3StringCell(`C${rowNumber}`, row.employee_name, 3),
      pnd3StringCell(`D${rowNumber}`, pnd3IdentityNo(row), 3),
      pnd3StringCell(`E${rowNumber}`, row.address, 3),
      pnd3StringCell(`F${rowNumber}`, cleanPnd3IncomeType(row.income_type), 4),
      pnd3NumberCell(`G${rowNumber}`, row.gross_pay, 5),
      pnd3NumberCell(`H${rowNumber}`, row.withholding_tax, 5),
      pnd3NumberCell(`I${rowNumber}`, row.net_pay, 5),
    ];
    rowXml.push(`<row r="${rowNumber}" ht="20.6" customHeight="1">${values.join("")}</row>`);
  });

  const totalRow = [
    pnd3StringCell(`A${totalRowNumber}`, "", 6),
    pnd3StringCell(`B${totalRowNumber}`, "", 6),
    pnd3StringCell(`C${totalRowNumber}`, "รวม", 6),
    pnd3StringCell(`D${totalRowNumber}`, "", 6),
    pnd3StringCell(`E${totalRowNumber}`, "", 6),
    pnd3StringCell(`F${totalRowNumber}`, "", 6),
    pnd3FormulaCell(`G${totalRowNumber}`, `SUM(G${firstDataRow}:G${lastDataRow})`, totals.gross_pay, 7),
    pnd3FormulaCell(`H${totalRowNumber}`, `SUM(H${firstDataRow}:H${lastDataRow})`, totals.withholding_tax, 7),
    pnd3FormulaCell(`I${totalRowNumber}`, `SUM(I${firstDataRow}:I${lastDataRow})`, totals.net_pay, 7),
  ];
  rowXml.push(`<row r="${totalRowNumber}" ht="20.6" customHeight="1">${totalRow.join("")}</row>`);

  const columns = PND3_COLUMN_WIDTHS.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:I${totalRowNumber}"/>
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="20.6"/>
<cols>${columns}</cols>
<sheetData>${rowXml.join("")}</sheetData>
<mergeCells count="1"><mergeCell ref="A1:I1"/></mergeCells>
</worksheet>`;
}

function pnd3StylesXml() {
  const numberFormat = xmlEscape(PAYROLL_REGISTER_EXCEL_NUMBER_FORMAT);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="${numberFormat}"/></numFmts>
<fonts count="3">
<font><sz val="12"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>
<font><b/><sz val="14"/><color theme="1"/><name val="Angsana New"/><family val="1"/></font>
<font><sz val="14"/><color theme="1"/><name val="Angsana New"/><family val="1"/></font>
</fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleMedium9"/>
</styleSheet>`;
}

function crc32(buffer: Buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function uint16(value: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function uint32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

function buildStoredZip(files: Array<{ name: string; content: string }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBuffer = Buffer.from(file.name, "utf8");
    const dataBuffer = Buffer.from(file.content, "utf8");
    const crc = crc32(dataBuffer);
    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(crc),
      uint32(dataBuffer.length),
      uint32(dataBuffer.length),
      uint16(nameBuffer.length),
      uint16(0),
      nameBuffer,
    ]);
    localParts.push(localHeader, dataBuffer);

    const centralHeader = Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(crc),
      uint32(dataBuffer.length),
      uint32(dataBuffer.length),
      uint16(nameBuffer.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      nameBuffer,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + dataBuffer.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0),
  ]);
  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

export function buildPnd3WorkbookBuffer(rows: PayrollExportRow[], paymentDate: string) {
  return buildStoredZip([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    },
    {
      name: "docProps/core.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>PND3</dc:title><dc:subject>PND3</dc:subject><dc:creator>ERP Payroll</dc:creator><cp:lastModifiedBy>ERP Payroll</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified></cp:coreProperties>`,
    },
    {
      name: "docProps/app.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>ERP Payroll</Application><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>PND3</vt:lpstr></vt:vector></TitlesOfParts></Properties>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="PND3" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/styles.xml", content: pnd3StylesXml() },
    { name: "xl/worksheets/sheet1.xml", content: buildPnd3WorksheetXml(rows, paymentDate) },
  ]);
}

export async function buildPayrollExportWorkbook(periodId: string, type: PayrollExportType, paymentDate: string, employeeIds: string[] = []) {
  const preview = await getPayrollExportPreview(periodId, type);
  const rows = filterPayrollExportRows(preview.rows, type, employeeIds);
  if (!rows.length) throw new Error("ไม่มีรายการให้ export");

  if (type === "payroll_register") {
    const buffer = await buildPayrollRegisterWorkbookBuffer(rows, paymentDate || preview.period.payment_date, preview.period.period_name);
    return { buffer, preview, rows, totals: payrollExportTotals(rows) };
  }

  const buffer = buildPnd3WorkbookBuffer(rows, paymentDate || preview.period.payment_date);
  return { buffer, preview, rows, totals: payrollExportTotals(rows) };
}

export async function auditPayrollExport(periodId: string, type: PayrollExportType, lineCount: number, actor: PayrollExportActor, metadata: Row = {}) {
  await writeAudit(supabaseAdmin(), {
    action: "export_payroll_excel",
    entityType: "payroll_periods",
    entityId: periodId,
    actorId: actor.actorId,
    actorName: actor.actorName,
    metadata: { export_type: type, line_count: lineCount, ...metadata },
  });
}

export function payrollExportFilename(periodName: string, type: PayrollExportType) {
  const safePeriod = (periodName || "period").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");
  return `${type === "pnd3" ? "pnd3" : "payroll-register"}-${safePeriod}.xlsx`;
}

