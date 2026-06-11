import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { DEFAULT_PND3_RANDOM_SPREAD_PERCENT, PND3_RANDOM_ALLOCATION_NOTE, applyPnd3AllocationToPreviewRows, distributePnd3Allocation, equalizePnd3Allocation, filterPnd3OutputRows, initializePnd3Allocation, randomizePnd3Allocation, randomizePnd3AllocationSelection } from "@/lib/payroll-pnd3-allocation";
import { pnd3GrossUpFromNet } from "@/lib/payroll-pnd3-recurring-db";
import {
  DEFAULT_PND3_INCOME_TYPE,
  PAYROLL_REGISTER_EXCEL_NUMBER_FORMAT,
  applyPnd3ExportRowOverrides,
  buildPayrollRegisterWorkbookBuffer,
  buildPayrollRegisterRecurringExportRow,
  cleanPnd3IncomeType,
  filterPayrollExportRows,
  payrollExportIdentityNo,
  payrollExportTotals,
  payrollRegisterExportAmounts,
  pnd3SheetRows,
  type PayrollExportRow,
} from "@/lib/payroll-export";

const baseRow: PayrollExportRow = {
  id: "line-1",
  selection_id: "emp-1",
  source: "employee",
  source_id: "emp-1",
  employee_id: "emp-1",
  employee_code: "ISG-001",
  employee_name: "Somchai",
  nickname: "Som",
  nationality: "Thai",
  national_id: "1234567890123",
  passport_no: "",
  address: "Bangkok",
  income_type: DEFAULT_PND3_INCOME_TYPE,
  contract_id: "con-1",
  contract_type: "monthly",
  wage_type: "salary",
  payroll_register_base_salary: 12000,
  include_pnd3_export: false,
  include_payroll_register_export: true,
  base_salary: 12000,
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
  withholding_tax: 0,
  other_deduction: 0,
  mid_month_paid: 0,
  gross_pay: 12000,
  total_deduction: 0,
  net_pay: 12000,
  identity_no: "1 2345 67890 12 3",
  register_base_salary: 12000,
  register_mid_month_paid: 0,
  register_month_end_pay: 12000,
  register_transfer_net_pay: 12000,
  register_overtime_amount: 0,
  register_cash_pay: 0,
  register_social_security: 0,
  register_balance: 12000,
};

describe("payroll export rules", () => {
  it("uses contract flags to separate payroll register and PND3 rows", () => {
    const rows = [
      baseRow,
      { ...baseRow, id: "line-2", selection_id: "emp-2", employee_id: "emp-2", employee_code: "ISG-002", include_pnd3_export: true, include_payroll_register_export: false },
      { ...baseRow, id: "line-3", selection_id: "emp-3", employee_id: "emp-3", employee_code: "ISG-003", include_pnd3_export: true, include_payroll_register_export: true },
    ];

    expect(filterPayrollExportRows(rows, "payroll_register").map((row) => row.employee_code)).toEqual(["ISG-001", "ISG-003"]);
    expect(filterPayrollExportRows(rows, "pnd3").map((row) => row.employee_code)).toEqual(["ISG-002", "ISG-003"]);
  });

  it("uses readable Thai income type for PND3 rows", () => {
    expect(DEFAULT_PND3_INCOME_TYPE).toBe("ค่าจ้าง");
    expect(baseRow.income_type).toBe("ค่าจ้าง");
    expect(cleanPnd3IncomeType("เธเนเธฒเธเนเธฒเธ")).toBe("ค่าจ้าง");
    expect(cleanPnd3IncomeType("ค่าบริการ")).toBe("ค่าบริการ");
  });

  it("can export only selected employees", () => {
    const rows = [
      baseRow,
      { ...baseRow, id: "line-2", selection_id: "emp-2", employee_id: "emp-2", employee_code: "ISG-002" },
    ];

    expect(filterPayrollExportRows(rows, "payroll_register", ["emp-2"]).map((row) => row.employee_id)).toEqual(["emp-2"]);
  });

  it("summarizes selected rows", () => {
    const totals = payrollExportTotals([
      { ...baseRow, gross_pay: 1000, withholding_tax: 30, net_pay: 970, payroll_register_base_salary: 1000 },
      { ...baseRow, gross_pay: 2000, withholding_tax: 60, net_pay: 1940, payroll_register_base_salary: 2000 },
    ]);

    expect(totals).toEqual({ count: 2, gross_pay: 3000, withholding_tax: 90, net_pay: 2910, register_base: 3000 });
  });

  it("computes payroll register preview amounts from register base", () => {
    const amounts = payrollRegisterExportAmounts({
      ...baseRow,
      payroll_register_base_salary: 11160,
      base_salary: 11900,
      mid_month_paid: 3000,
      social_security_employee: 558,
      net_pay: 11342,
    });

    expect(amounts).toEqual({
      base_salary: 11160,
      mid_month_paid: 3000,
      month_end_pay: 7602,
      transfer_net_pay: 11342,
      overtime_amount: 3740,
      cash_pay: 0,
      social_security: 558,
      balance: 10602,
    });
  });

  it("builds payroll register Excel with legacy workbook formatting", async () => {
    const buffer = await buildPayrollRegisterWorkbookBuffer([
      {
        ...baseRow,
        employee_name: "นายจันทา สุมทุม",
        identity_no: "3320700553101",
        register_base_salary: 11160,
        register_mid_month_paid: 3000,
        register_month_end_pay: 7602,
        register_overtime_amount: 4753,
        register_cash_pay: 0,
        register_social_security: 558,
        register_balance: 10602,
      },
    ], "2026-04-30", "Teststst");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const worksheet = workbook.getWorksheet("Payroll Register");

    expect(worksheet).toBeDefined();
    expect(worksheet?.getCell("A1").value).toBe("ห้างหุ้นส่วนจำกัด ไอ.เอส.จี. เทรดดิ้ง ");
    expect(worksheet?.getCell("A2").value).toBe("  ทะเบียนเงินเดือน เมษายน 2569");
    expect(worksheet?.getCell("A3").value).toBe("ลำดับ");
    expect(worksheet?.getCell("C3").value).toBe("เลขบัตร/Passport");
    expect(worksheet?.getCell("J3").value).toBe("ยอดคงเหลือ");
    expect(worksheet?.getCell("C4").value).toBe("3 3207 00553 10 1");
    expect(worksheet?.getCell("D4").numFmt).toBe(PAYROLL_REGISTER_EXCEL_NUMBER_FORMAT);
    expect(worksheet?.getCell("D4").value).toBe(11160);
    expect(worksheet?.getCell("J4").alignment?.horizontal).toBe("right");
    expect(worksheet?.getCell("A1").font).toMatchObject({ name: "Angsana New", size: 14, bold: true });
    expect(worksheet?.getCell("A4").border?.top?.style).toBe("thin");
    expect(worksheet?.getCell("B5").value).toBe("รวม");
    expect(worksheet?.getCell("D5").value).toMatchObject({ formula: "SUM(D4:D4)" });
    expect(worksheet?.getCell("J5").value).toMatchObject({ formula: "SUM(J4:J4)" });
  });

  it("shows passport when payroll register row has no Thai national id", () => {
    expect(payrollExportIdentityNo({
      ...baseRow,
      national_id: "",
      identity_no: "",
      passport_no: "MG123456",
    })).toBe("MG123456");
  });

  it("builds payroll register recurring rows with net amount visible", () => {
    const row = buildPayrollRegisterRecurringExportRow({
      id: "rec-1",
      recipient_code: "",
      recipient_name: "Ms. HNIN EI Hlaing",
      nickname: "Nin",
      nationality: "MM",
      national_id: "",
      identity_no: "",
      passport_no: "MM987654",
      register_base_salary: 11160,
      register_mid_month_paid: 0,
      register_month_end_pay: 10602,
      register_transfer_net_pay: 10602,
      register_overtime_amount: 0,
      register_cash_pay: 370,
      register_social_security: 558,
      register_balance: 10602,
      status: "active",
      display_order: 100,
      note: null,
    });

    expect(row).toMatchObject({
      source: "payroll_register_recurring",
      selection_id: "payroll-register-recurring:rec-1",
      employee_name: "Ms. HNIN EI Hlaing",
      nickname: "Nin",
      passport_no: "MM987654",
      identity_no: "MM987654",
      include_payroll_register_export: true,
      register_transfer_net_pay: 10602,
      register_balance: 10602,
      net_pay: 10602,
    });
  });

  it("grosses up recurring PND3 net amount with tax rate", () => {
    expect(pnd3GrossUpFromNet(5000, 3)).toEqual({ gross_pay: 5154.64, withholding_tax: 154.64, net_pay: 5000 });
    expect(pnd3GrossUpFromNet(17000, 3)).toEqual({ gross_pay: 17525.77, withholding_tax: 525.77, net_pay: 17000 });
  });

  it("hides zero-net PND3 rows", () => {
    const rows = [
      { ...baseRow, include_pnd3_export: true, net_pay: 0, gross_pay: 0 },
      { ...baseRow, id: "line-2", selection_id: "emp-2", employee_id: "emp-2", employee_code: "ISG-002", include_pnd3_export: true, net_pay: 1000, gross_pay: 1000 },
    ];

    expect(filterPayrollExportRows(rows, "pnd3").map((row) => row.employee_code)).toEqual(["ISG-002"]);
  });

  it("spreads foreign daily PND3 allocation after fixed recipients", () => {
    const result = distributePnd3Allocation(1000, [
      { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 1000, is_selected: true, is_fixed: true, fixed_net_amount: 400 },
      { selection_id: "emp-2", target_source: "employee", target_label: "B", base_net_amount: 1000, is_selected: true, is_fixed: false, fixed_net_amount: 0 },
      { selection_id: "emp-3", target_source: "employee", target_label: "C", base_net_amount: 1000, is_selected: true, is_fixed: false, fixed_net_amount: 0 },
    ]);

    expect(result.rows.map((row) => row.allocated_net_amount)).toEqual([400, 300, 300]);
    expect(result.totals).toEqual({ pool_net_amount: 1000, allocated_net_amount: 1000, remaining_net_amount: 0, fixed_net_amount: 400, random_net_amount: 0 });
  });

  it("keeps fixed allocation visible when fixed total is over the pool", () => {
    const result = distributePnd3Allocation(1000, [
      { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 1000, is_selected: true, is_fixed: true, fixed_net_amount: 1200 },
      { selection_id: "emp-2", target_source: "employee", target_label: "B", base_net_amount: 1000, is_selected: true, is_fixed: false, fixed_net_amount: 0 },
    ]);

    expect(result.rows.map((row) => row.allocated_net_amount)).toEqual([1200, 0]);
    expect(result.totals.remaining_net_amount).toBe(-200);
  });

  it("randomizes flexible PND3 allocation without converting it to manual fixed", () => {
    const sequence = [0.2, 0.8];
    const result = randomizePnd3Allocation(1000, [
      { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 1000, is_selected: true, is_fixed: true, fixed_net_amount: 400 },
      { selection_id: "emp-2", target_source: "employee", target_label: "B", base_net_amount: 1000, is_selected: true, is_fixed: false, fixed_net_amount: 0 },
      { selection_id: "emp-3", target_source: "employee", target_label: "C", base_net_amount: 1000, is_selected: true, is_fixed: false, fixed_net_amount: 0 },
    ], () => sequence.shift() ?? 0.5);

    expect(result.rows.map((row) => row.allocated_net_amount)).toEqual([400, 120, 480]);
    expect(result.rows.map((row) => row.is_fixed)).toEqual([true, false, false]);
    expect(result.rows.map((row) => row.fixed_net_amount)).toEqual([400, 0, 0]);
    expect(result.rows.map((row) => row.random_net_amount ?? 0)).toEqual([0, 120, 480]);
    expect(result.rows.map((row) => row.note?.startsWith(PND3_RANDOM_ALLOCATION_NOTE) ?? false)).toEqual([false, true, true]);
    expect(result.totals.remaining_net_amount).toBe(0);
  });

  it("keeps saved random PND3 amounts separate from equal distribution", () => {
    const result = distributePnd3Allocation(1000, [
      { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 1000, is_selected: true, is_fixed: false, fixed_net_amount: 0, random_net_amount: 900 },
      { selection_id: "emp-2", target_source: "employee", target_label: "B", base_net_amount: 1000, is_selected: true, is_fixed: false, fixed_net_amount: 0, random_net_amount: 100 },
    ]);

    expect(result.rows.map((row) => row.allocated_net_amount)).toEqual([900, 100]);
    expect(result.rows.map((row) => row.is_fixed)).toEqual([false, false]);
    expect(result.totals.fixed_net_amount).toBe(0);
    expect(result.totals.random_net_amount).toBe(1000);
  });

  it("can randomize again without treating previous random rows as manual fixed", () => {
    const first = randomizePnd3Allocation(1000, [
      { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 1000, is_selected: true, is_fixed: false, fixed_net_amount: 0 },
      { selection_id: "emp-2", target_source: "employee", target_label: "B", base_net_amount: 1000, is_selected: true, is_fixed: false, fixed_net_amount: 0 },
    ], () => 0.5);
    const secondSeq = [0.9, 0.1];
    const second = randomizePnd3Allocation(1000, first.rows, () => secondSeq.shift() ?? 0.5);

    expect(first.rows.map((row) => row.allocated_net_amount)).toEqual([500, 500]);
    expect(second.rows.map((row) => row.allocated_net_amount)).toEqual([900, 100]);
    expect(second.totals.remaining_net_amount).toBe(0);
  });

  it("auto-selects flexible recipients when randomizing a fresh PND3 allocation", () => {
    const sequence = [0.25, 0.75];
    const result = randomizePnd3Allocation(1000, [
      { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 0, is_selected: false, is_fixed: false, fixed_net_amount: 0 },
      { selection_id: "emp-2", target_source: "employee", target_label: "B", base_net_amount: 0, is_selected: false, is_fixed: false, fixed_net_amount: 0 },
    ], () => sequence.shift() ?? 0.5);

    expect(result.rows.map((row) => row.is_selected)).toEqual([true, true]);
    expect(result.rows.map((row) => row.allocated_net_amount)).toEqual([250, 750]);
    expect(result.totals.remaining_net_amount).toBe(0);
  });

  it("starts a fresh PND3 allocation with all recipients unchecked by default", () => {
    const sequence = [0.2, 0.8];
    const result = initializePnd3Allocation(1000, [
      { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 0, is_selected: false, is_fixed: false, fixed_net_amount: 0 },
      { selection_id: "emp-2", target_source: "employee", target_label: "B", base_net_amount: 0, is_selected: false, is_fixed: false, fixed_net_amount: 0 },
    ], false, () => sequence.shift() ?? 0.5);

    expect(result.rows.map((row) => row.is_selected)).toEqual([false, false]);
    expect(DEFAULT_PND3_RANDOM_SPREAD_PERCENT).toBe(30);
    expect(result.rows.map((row) => row.random_net_amount ?? 0)).toEqual([0, 0]);
    expect(result.rows.map((row) => row.allocated_net_amount)).toEqual([0, 0]);
    expect(result.totals.remaining_net_amount).toBe(1000);
  });

  it("keeps PND3 recipients unchecked by default even when they already have a base amount", () => {
    const sequence = [0.2, 0.8];
    const result = initializePnd3Allocation(1000, [
      { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 16983.65, is_selected: false, is_fixed: false, fixed_net_amount: 0 },
      { selection_id: "emp-2", target_source: "employee", target_label: "B", base_net_amount: 0, is_selected: false, is_fixed: false, fixed_net_amount: 0 },
      { selection_id: "emp-3", target_source: "employee", target_label: "C", base_net_amount: 17000, is_selected: false, is_fixed: false, fixed_net_amount: 0 },
    ], false, () => sequence.shift() ?? 0.5);

    expect(result.rows.map((row) => row.is_selected)).toEqual([false, false, false]);
    expect(result.rows.map((row) => row.allocated_net_amount)).toEqual([0, 0, 0]);
    expect(result.totals.remaining_net_amount).toBe(1000);
  });

  it("keeps PND3 base-amount recipients unchecked when saved rows were unchecked", () => {
    const result = initializePnd3Allocation(1000, [
      { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 16983.65, is_selected: false, is_fixed: false, fixed_net_amount: 0 },
      { selection_id: "emp-2", target_source: "employee", target_label: "B", base_net_amount: 0, is_selected: false, is_fixed: false, fixed_net_amount: 0 },
      { selection_id: "emp-3", target_source: "employee", target_label: "C", base_net_amount: 17000, is_selected: false, is_fixed: false, fixed_net_amount: 0 },
    ], true);

    expect(result.rows.map((row) => row.is_selected)).toEqual([false, false, false]);
    expect(result.rows.map((row) => row.allocated_net_amount)).toEqual([0, 0, 0]);
    expect(result.totals.remaining_net_amount).toBe(1000);
  });

  it("can keep random PND3 amounts close to equal with a low spread", () => {
    const sequence = [0, 1];
    const result = randomizePnd3Allocation(1000, [
      { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 0, is_selected: true, is_fixed: false, fixed_net_amount: 0 },
      { selection_id: "emp-2", target_source: "employee", target_label: "B", base_net_amount: 0, is_selected: true, is_fixed: false, fixed_net_amount: 0 },
    ], () => sequence.shift() ?? 0.5, 20);

    expect(result.rows.map((row) => row.allocated_net_amount)).toEqual([400, 600]);
    expect(result.totals.remaining_net_amount).toBe(0);
  });

  it("can use a full spread when the user wants wider random PND3 amounts", () => {
    const sequence = [0, 1];
    const result = randomizePnd3Allocation(1000, [
      { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 0, is_selected: true, is_fixed: false, fixed_net_amount: 0 },
      { selection_id: "emp-2", target_source: "employee", target_label: "B", base_net_amount: 0, is_selected: true, is_fixed: false, fixed_net_amount: 0 },
    ], () => sequence.shift() ?? 0.5, 100);

    expect(result.rows.map((row) => row.allocated_net_amount)).toEqual([0, 1000]);
    expect(result.totals.remaining_net_amount).toBe(0);
  });

  it("activates saved random PND3 rows even when old saved rows were unchecked", () => {
    const result = initializePnd3Allocation(1000, [
      { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 0, is_selected: false, is_fixed: false, fixed_net_amount: 0, random_net_amount: 300 },
      { selection_id: "emp-2", target_source: "employee", target_label: "B", base_net_amount: 0, is_selected: false, is_fixed: false, fixed_net_amount: 0, random_net_amount: 700 },
    ], true);

    expect(result.rows.map((row) => row.is_selected)).toEqual([true, true]);
    expect(result.rows.map((row) => row.allocated_net_amount)).toEqual([300, 700]);
    expect(result.totals.remaining_net_amount).toBe(0);
  });

  it("randomizes the full pool across currently selected PND3 recipients after checking boxes", () => {
    const sequence = [0.25, 0.75];
    const result = randomizePnd3AllocationSelection(1000, [
      { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 0, is_selected: false, is_fixed: false, fixed_net_amount: 0 },
      { selection_id: "emp-2", target_source: "employee", target_label: "B", base_net_amount: 0, is_selected: true, is_fixed: false, fixed_net_amount: 0, random_net_amount: 100 },
      { selection_id: "emp-3", target_source: "employee", target_label: "C", base_net_amount: 0, is_selected: false, is_fixed: false, fixed_net_amount: 0 },
    ], "emp-3", true, () => sequence.shift() ?? 0.5, 100);

    expect(result.rows.map((row) => row.is_selected)).toEqual([false, true, true]);
    expect(result.rows.map((row) => row.allocated_net_amount)).toEqual([0, 250, 750]);
    expect(result.totals.remaining_net_amount).toBe(0);
  });

  it("can switch a randomized PND3 allocation back to equal split", () => {
    const result = equalizePnd3Allocation(1000, [
      { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 0, is_selected: true, is_fixed: false, fixed_net_amount: 0, random_net_amount: 900 },
      { selection_id: "emp-2", target_source: "employee", target_label: "B", base_net_amount: 0, is_selected: true, is_fixed: false, fixed_net_amount: 0, random_net_amount: 100 },
    ]);

    expect(result.rows.map((row) => row.random_net_amount ?? 0)).toEqual([0, 0]);
    expect(result.rows.map((row) => row.allocated_net_amount)).toEqual([500, 500]);
    expect(result.totals.random_net_amount).toBe(0);
    expect(result.totals.remaining_net_amount).toBe(0);
  });

  it("re-applies unsaved PND3 allocation to visible preview rows without double counting previous allocation", () => {
    const rows = [
      { selection_id: "emp-1", gross_pay: 123.71, withholding_tax: 3.71, net_pay: 120, pnd3_allocation_net: 20 },
      { selection_id: "emp-2", gross_pay: 103.09, withholding_tax: 3.09, net_pay: 100, pnd3_allocation_net: 0 },
    ];
    const applied = applyPnd3AllocationToPreviewRows(rows, {
      period_id: "period-1",
      source_rows: [],
      targets: [
        { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 100, is_selected: true, is_fixed: false, fixed_net_amount: 0, random_net_amount: 40, allocated_net_amount: 40 },
        { selection_id: "emp-2", target_source: "employee", target_label: "B", base_net_amount: 100, is_selected: true, is_fixed: false, fixed_net_amount: 0, random_net_amount: 0, allocated_net_amount: 0 },
      ],
      totals: { pool_net_amount: 40, allocated_net_amount: 40, remaining_net_amount: 0, fixed_net_amount: 0, random_net_amount: 40 },
    });

    expect(applied[0]).toMatchObject({ net_pay: 140, gross_pay: 144.33, withholding_tax: 4.33, pnd3_allocation_net: 40 });
    expect(applied[1]).toMatchObject({ net_pay: 100, gross_pay: 103.09, withholding_tax: 3.09, pnd3_allocation_net: 0 });
  });

  it("uses only the allocated PND3 amount for regular employee preview rows", () => {
    const applied = applyPnd3AllocationToPreviewRows([
      { selection_id: "emp-1", source: "employee", gross_pay: 14329.9, withholding_tax: 429.9, net_pay: 13900, pnd3_allocation_net: 0 },
    ], {
      period_id: "period-1",
      source_rows: [],
      targets: [
        { selection_id: "emp-1", target_source: "employee", target_label: "A", base_net_amount: 0, is_selected: true, is_fixed: false, fixed_net_amount: 0, random_net_amount: 2914.82, allocated_net_amount: 2914.82 },
      ],
      totals: { pool_net_amount: 2914.82, allocated_net_amount: 2914.82, remaining_net_amount: 0, fixed_net_amount: 0, random_net_amount: 2914.82 },
    });

    expect(applied[0]).toMatchObject({ net_pay: 2914.82, gross_pay: 3004.97, withholding_tax: 90.15, pnd3_allocation_net: 2914.82 });
  });

  it("hides regular employee PND3 rows unless they have an allocated amount", () => {
    const rows = filterPnd3OutputRows([
      { ...baseRow, selection_id: "emp-base", source: "employee", include_pnd3_export: true, net_pay: 13900, gross_pay: 14329.9, withholding_tax: 429.9, pnd3_allocation_net: 0 },
      { ...baseRow, selection_id: "emp-allocated", source: "employee", include_pnd3_export: true, net_pay: 2914.82, gross_pay: 3004.97, withholding_tax: 90.15, pnd3_allocation_net: 2914.82 },
      { ...baseRow, selection_id: "rec-1", source: "pnd3_recurring", include_pnd3_export: true, net_pay: 5000, gross_pay: 5154.64, withholding_tax: 154.64 },
    ]);

    expect(rows.map((row) => row.selection_id)).toEqual(["emp-allocated", "rec-1"]);
  });

  it("can split one PND3 recipient into another dated row with its own net amount", () => {
    const row = { ...baseRow, include_pnd3_export: true, net_pay: 1000, gross_pay: 1030.93, withholding_tax: 30.93 };
    const adjusted = applyPnd3ExportRowOverrides([row], [
      { row_key: "emp-1", base_selection_id: "emp-1", payment_date: "2026-05-31", net_pay: null, is_extra: false, display_order: 0 },
      { row_key: "extra-1", base_selection_id: "emp-1", payment_date: "2026-05-15", net_pay: 500, is_extra: true, display_order: 1 },
    ], "2026-05-31");

    expect(adjusted).toHaveLength(2);
    expect(adjusted[0]).toMatchObject({ selection_id: "emp-1", pnd3_payment_date: "2026-05-31", net_pay: 1000 });
    expect(adjusted[1]).toMatchObject({
      selection_id: "extra-1",
      pnd3_base_selection_id: "emp-1",
      pnd3_is_extra: true,
      pnd3_payment_date: "2026-05-15",
      net_pay: 500,
      gross_pay: 515.46,
      withholding_tax: 15.46,
    });
  });

  it("exports PND3 rows with each row date instead of forcing one payment date", () => {
    const rows = applyPnd3ExportRowOverrides([
      { ...baseRow, include_pnd3_export: true, net_pay: 1000, gross_pay: 1030.93, withholding_tax: 30.93 },
    ], [
      { row_key: "extra-1", base_selection_id: "emp-1", payment_date: "2026-05-15", net_pay: 500, is_extra: true, display_order: 1 },
    ], "2026-05-31");

    const sheetRows = pnd3SheetRows(rows, "2026-05-31");

    expect(sheetRows[2][1]).toBe("31/5/2569");
    expect(sheetRows[3][1]).toBe("15/5/2569");
    expect(sheetRows[3][6]).toBe(515.46);
    expect(sheetRows[3][7]).toBe(15.46);
    expect(sheetRows[3][8]).toBe(500);
  });

  it("exports row-level PND3 tax id and address overrides without changing the base employee row", () => {
    const rows = applyPnd3ExportRowOverrides([
      { ...baseRow, include_pnd3_export: true, net_pay: 1000, gross_pay: 1030.93, withholding_tax: 30.93 },
    ], [
      {
        row_key: "emp-1",
        base_selection_id: "emp-1",
        payment_date: "2026-05-31",
        net_pay: null,
        national_id: "3 9999 88888 77 6",
        address: "ที่อยู่เฉพาะงวด ภงด.3",
        is_extra: false,
        display_order: 0,
      },
    ], "2026-05-31");

    expect(baseRow.national_id).toBe("1234567890123");
    expect(baseRow.address).toBe("Bangkok");
    expect(rows[0]).toMatchObject({
      national_id: "3 9999 88888 77 6",
      address: "ที่อยู่เฉพาะงวด ภงด.3",
      pnd3_national_id_override: "3 9999 88888 77 6",
      pnd3_address_override: "ที่อยู่เฉพาะงวด ภงด.3",
    });

    const sheetRows = pnd3SheetRows(rows, "2026-05-31");
    expect(sheetRows[2][3]).toBe("3 9999 88888 77 6");
    expect(sheetRows[2][4]).toBe("ที่อยู่เฉพาะงวด ภงด.3");
  });
});

