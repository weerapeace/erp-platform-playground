import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
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
const PAYROLL_REGISTER_FONT = "Angsana New";
const PAYROLL_REGISTER_FONT_SIZE = 14;
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
export function cleanPnd3IncomeType(value: unknown) {
  const raw = text(value);
  if (!raw || MOJIBAKE_PATTERN.test(raw)) return DEFAULT_PND3_INCOME_TYPE;
  return raw;
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
  if (type === "pnd3") return row.include_pnd3_export === true && row.net_pay > 0;
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
  return computePayrollRegisterAmounts({
    base_salary: registerBase,
    mid_month_paid: row.mid_month_paid,
    social_security_employee: row.social_security_employee,
    net_pay: row.net_pay,
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

  const allRows = lines.map((line): PayrollExportRow => {
    const employee = employees.get(text(line.employee_id)) ?? {};
    const contract = contracts.get(text(line.contract_id)) ?? {};
    const pnd3Amounts = pnd3GrossUpFromNet(line.net_pay, 3);
    const registerBase = money(contract.payroll_register_base_salary) || money(line.base_salary);
    const identityNo = payrollExportIdentityNo({
      identity_no: "",
      national_id: text(employee.national_id),
      passport_no: text(employee.passport_no),
    });
    const registerAmounts = payrollRegisterExportAmounts({
      ...line,
      payroll_register_base_salary: registerBase,
    });
    return {
      id: text(line.id),
      selection_id: text(line.employee_id),
      source: "employee",
      source_id: text(line.employee_id),
      employee_id: text(line.employee_id),
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

export async function buildPayrollRegisterWorkbookBuffer(rows: PayrollExportRow[], paymentDate: string, periodName: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP Payroll";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const worksheet = workbook.addWorksheet("Payroll Register", {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.25,
        bottom: 0.25,
        header: 0.1,
        footer: 0.1,
      },
    },
  });

  PAYROLL_REGISTER_COLUMN_WIDTHS.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });

  worksheet.mergeCells("A1:J1");
  worksheet.mergeCells("A2:J2");
  worksheet.getCell("A1").value = PAYROLL_REGISTER_COMPANY_NAME;
  worksheet.getCell("A2").value = `  ทะเบียนเงินเดือน ${payrollRegisterMonthTitle(paymentDate, periodName)}`;
  PAYROLL_REGISTER_HEADERS.forEach((header, index) => {
    worksheet.getCell(3, index + 1).value = header;
  });

  rows.forEach((row, index) => {
    worksheet.addRow([
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
    ]);
  });

  const firstDataRow = 4;
  const lastDataRow = firstDataRow + rows.length - 1;
  const totalRowNumber = lastDataRow + 1;
  const totalRow = worksheet.getRow(totalRowNumber);
  totalRow.getCell(2).value = "รวม";
  for (let columnNumber = 4; columnNumber <= 10; columnNumber += 1) {
    const columnLetter = worksheet.getColumn(columnNumber).letter;
    totalRow.getCell(columnNumber).value = {
      formula: `SUM(${columnLetter}${firstDataRow}:${columnLetter}${lastDataRow})`,
    };
  }

  const thinBorder = { style: "thin" as const, color: { argb: "FF000000" } };
  for (let rowNumber = 1; rowNumber <= totalRowNumber; rowNumber += 1) {
    const excelRow = worksheet.getRow(rowNumber);
    excelRow.height = 20.6;
    for (let columnNumber = 1; columnNumber <= PAYROLL_REGISTER_HEADERS.length; columnNumber += 1) {
      const cell = excelRow.getCell(columnNumber);
      cell.font = {
        name: PAYROLL_REGISTER_FONT,
        size: PAYROLL_REGISTER_FONT_SIZE,
        bold: rowNumber <= 3 || rowNumber === totalRowNumber,
      };
      cell.border = {
        top: thinBorder,
        left: thinBorder,
        bottom: thinBorder,
        right: thinBorder,
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: rowNumber <= 2
          ? "center"
          : columnNumber === 1 || (columnNumber >= 4 && columnNumber <= 9)
            ? "center"
            : columnNumber === 10
              ? "right"
              : "left",
      };
      if (columnNumber >= 4 && columnNumber <= 10) {
        cell.numFmt = PAYROLL_REGISTER_EXCEL_NUMBER_FORMAT;
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

export function pnd3SheetRows(rows: PayrollExportRow[], paymentDate: string) {
  return [
    ["ภ.ง.ด.3", "", "", "", "", "", "", "", ""],
    ["ลำดับ", "วันที่", "ชื่อบริษัท/บุคคล", "เลข 13 หลัก", "ที่อยู่", "ค่าจ้าง/บริการ", "จำนวนเงิน", "ภาษี", "ยอดสุทธิ"],
    ...rows.map((row, index) => [
      index + 1,
      buddhistDate(row.pnd3_payment_date || paymentDate),
      row.employee_name,
      row.national_id,
      row.address,
      cleanPnd3IncomeType(row.income_type),
      row.gross_pay,
      row.withholding_tax,
      row.net_pay,
    ]),
  ];
}

function autosizeSheet(ws: XLSX.WorkSheet, rows: unknown[][]) {
  ws["!cols"] = rows[0].map((_, colIndex) => ({
    wch: Math.min(
      36,
      Math.max(10, ...rows.map((row) => String(row[colIndex] ?? "").length + 2)),
    ),
  }));
}

export async function buildPayrollExportWorkbook(periodId: string, type: PayrollExportType, paymentDate: string, employeeIds: string[] = []) {
  const preview = await getPayrollExportPreview(periodId, type);
  const rows = filterPayrollExportRows(preview.rows, type, employeeIds);
  if (!rows.length) throw new Error("ไม่มีรายการให้ export");

  if (type === "payroll_register") {
    const buffer = await buildPayrollRegisterWorkbookBuffer(rows, paymentDate || preview.period.payment_date, preview.period.period_name);
    return { buffer, preview, rows, totals: payrollExportTotals(rows) };
  }

  const sheetRows = pnd3SheetRows(rows, paymentDate || preview.period.payment_date);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
  autosizeSheet(ws, sheetRows);
  XLSX.utils.book_append_sheet(wb, ws, "PND3");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
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

