import { writeAudit } from "@/lib/audit";
import { money } from "@/lib/payroll-calc";
import {
  buildMidMonthPaymentLine,
  buildPaymentLineFromPayslip,
  comparePaymentLineWithPrevious,
  normalizePaymentBatchType,
  parsePaymentLineNote,
  paymentExportCsv,
  type PaymentBatchType,
} from "@/lib/payroll-payments";
import { computePayrollRegisterAmounts, formatThaiNationalId } from "@/lib/payroll-register-print";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Row = Record<string, unknown>;
type Actor = { actorId?: string | null; actorName?: string | null };
type PaymentLineInput = { employee_id?: string; paid_amount?: unknown; selected?: boolean; note?: string | null; persist_default?: boolean };
type PaymentBatchDetail = {
  batch: Row & {
    period_name: string;
    line_count: number;
    paid_amount: number;
    paid_count: number;
    latest_calc_run_no: number | null;
    latest_calc_line_count: number;
    latest_calc_net_pay: number;
  };
  lines: Row[];
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function bool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function employeeName(row: Row = {}): string {
  const full = [row.first_name, row.last_name].map(text).filter(Boolean).join(" ");
  const nick = text(row.nickname);
  const base = full || nick || text(row.employee_code);
  // โชว์ชื่อเล่นต่อท้ายด้วย (ถ้ามี และยังไม่อยู่ในชื่อแล้ว) เช่น "Khin Malar Tun (Khin)"
  return nick && full && !full.includes(nick) ? `${base} (${nick})` : base;
}

function identityNo(row: Row = {}): string {
  return formatThaiNationalId(text(row.national_id) || text(row.passport_no));
}

function batchPrefix(batchType: PaymentBatchType): string {
  if (batchType === "mid_month") return "MID-MONTH";
  if (batchType === "special") return "SPECIAL";
  return "MONTH-END";
}

function totals(lines: Row[]) {
  return {
    line_count: lines.length,
    paid_amount: Math.round(lines.reduce((sum, line) => sum + money(line.paid_amount), 0) * 100) / 100,
    paid_count: lines.filter((line) => line.status === "paid").length,
  };
}

async function latestPayrollCalcSummary(periodId: string) {
  const empty = { latest_calc_run_no: null as number | null, latest_calc_line_count: 0, latest_calc_net_pay: 0 };
  if (!periodId) return empty;
  const admin = supabaseAdmin();
  const { data: runs, error: runError } = await admin
    .from("payroll_runs")
    .select("id, run_no")
    .eq("payroll_period_id", periodId)
    .order("run_no", { ascending: false })
    .limit(1);
  if (runError) throw new Error(runError.message);
  const latestRun = runs?.[0] as Row | undefined;
  if (!latestRun) return empty;
  const { data: lines, error: lineError } = await admin
    .from("payroll_lines")
    .select("net_pay")
    .eq("payroll_period_id", periodId)
    .eq("payroll_run_id", text(latestRun.id));
  if (lineError) throw new Error(lineError.message);
  const lineRows = (lines ?? []) as Row[];
  return {
    latest_calc_run_no: Number(latestRun.run_no) || null,
    latest_calc_line_count: lineRows.length,
    latest_calc_net_pay: Math.round(lineRows.reduce((sum, line) => sum + money(line.net_pay), 0) * 100) / 100,
  };
}

async function getPeriod(periodId: string): Promise<Row> {
  const { data, error } = await supabaseAdmin()
    .from("payroll_periods")
    .select("id, period_name, status, payment_date")
    .eq("id", periodId)
    .limit(1);
  if (error) throw new Error(error.message);
  const period = data?.[0] as Row | undefined;
  if (!period) throw new Error("ไม่พบงวดเงินเดือน");
  return period;
}

async function periodNameMap(periodIds: string[]): Promise<Record<string, string>> {
  if (!periodIds.length) return {};
  const { data } = await supabaseAdmin().from("payroll_periods").select("id, period_name").in("id", periodIds);
  const map: Record<string, string> = {};
  (data ?? []).forEach((row) => {
    const r = row as Row;
    map[text(r.id)] = text(r.period_name);
  });
  return map;
}

async function employeeAndBankMaps(employeeIds: string[]) {
  const admin = supabaseAdmin();
  const [emps, banks, contracts] = await Promise.all([
    employeeIds.length
      ? admin.from("employees").select("id, employee_code, first_name, last_name, nickname, national_id, passport_no").in("id", employeeIds)
      : Promise.resolve({ data: [], error: null }),
    employeeIds.length
      ? admin.from("employee_bank_accounts").select("employee_id, bank_name, account_no, account_name, is_primary").in("employee_id", employeeIds).order("is_primary", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    employeeIds.length
      ? admin.from("employee_contracts").select("employee_id, contract_type, wage_type, is_current, status").in("employee_id", employeeIds).eq("is_current", true).eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (emps.error) throw new Error(emps.error.message);
  if (banks.error) throw new Error(banks.error.message);
  if (contracts.error) throw new Error(contracts.error.message);
  const empById: Record<string, Row> = {};
  ((emps.data ?? []) as Row[]).forEach((emp) => { empById[text(emp.id)] = emp; });
  const bankByEmp: Record<string, Row> = {};
  ((banks.data ?? []) as Row[]).forEach((bank) => {
    const employeeId = text(bank.employee_id);
    if (employeeId && !bankByEmp[employeeId]) bankByEmp[employeeId] = bank;
  });
  const contractByEmp: Record<string, Row> = {};
  ((contracts.data ?? []) as Row[]).forEach((contract) => {
    const employeeId = text(contract.employee_id);
    if (employeeId && !contractByEmp[employeeId]) contractByEmp[employeeId] = contract;
  });
  return { empById, bankByEmp, contractByEmp };
}

async function previousPaymentLineMap(periodId: string, batchType: PaymentBatchType, beforeDate?: string | null): Promise<Map<string, Row>> {
  const admin = supabaseAdmin();
  let query = admin
    .from("payment_batches")
    .select("id, batch_no, payment_date")
    .eq("batch_type", batchType)
    .neq("status", "cancelled")
    .neq("payroll_period_id", periodId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (beforeDate) query = query.lt("payment_date", beforeDate);
  let { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data?.length && beforeDate) {
    const fallback = await admin
      .from("payment_batches")
      .select("id, batch_no, payment_date")
      .eq("batch_type", batchType)
      .neq("status", "cancelled")
      .neq("payroll_period_id", periodId)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);
    data = fallback.data;
    error = fallback.error;
    if (error) throw new Error(error.message);
  }
  const batch = data?.[0] as Row | undefined;
  if (!batch) return new Map();
  const { data: lines, error: lineError } = await admin
    .from("payment_batch_lines")
    .select("employee_id, paid_amount, status, note")
    .eq("payment_batch_id", text(batch.id));
  if (lineError) throw new Error(lineError.message);
  const map = new Map<string, Row>();
  ((lines ?? []) as Row[]).forEach((line) => {
    const employeeId = text(line.employee_id);
    if (employeeId) map.set(employeeId, { ...line, previous_batch_no: batch.batch_no, previous_payment_date: batch.payment_date });
  });
  return map;
}

async function saveMidMonthDefaults(lines: PaymentLineInput[], actor: Actor = {}) {
  const rows = lines
    .filter((line) => line.persist_default && line.selected !== false && text(line.employee_id) && money(line.paid_amount) > 0)
    .map((line) => ({ employee_id: text(line.employee_id), amount: Math.round(money(line.paid_amount) * 100) / 100 }));
  if (!rows.length) return;
  const admin = supabaseAdmin();
  const employeeIds = rows.map((row) => row.employee_id);
  const { data: existing, error } = await admin.from("employee_payroll_settings").select("id, employee_id").in("employee_id", employeeIds);
  if (error) throw new Error(error.message);
  const existingByEmp = new Map(((existing ?? []) as Row[]).map((row) => [text(row.employee_id), text(row.id)]));
  for (const row of rows) {
    const id = existingByEmp.get(row.employee_id);
    if (id) {
      const { error: updateError } = await admin.from("employee_payroll_settings").update({
        advance_payment_allowed: true,
        default_mid_month_advance_amount: row.amount,
      }).eq("id", id);
      if (updateError) throw new Error(updateError.message);
    } else {
      const { error: insertError } = await admin.from("employee_payroll_settings").insert({
        employee_id: row.employee_id,
        tax_calculation_method: "manual",
        social_security_enabled: true,
        withholding_tax_enabled: false,
        withholding_tax_company_paid: false,
        overtime_enabled: false,
        piece_rate_enabled: false,
        attendance_bonus_enabled: false,
        advance_payment_allowed: true,
        max_advance_amount: 0,
        default_mid_month_advance_amount: row.amount,
        social_security_employee_amount: 0,
        social_security_employer_amount: 0,
        withholding_tax_rate: 0,
      });
      if (insertError) throw new Error(insertError.message);
    }
  }
  await writeAudit(admin, {
    action: "update_mid_month_defaults",
    entityType: "employee_payroll_settings",
    actorId: actor.actorId,
    actorName: actor.actorName,
    metadata: { employee_count: rows.length, employee_ids: employeeIds },
  });
}

export async function listPaymentBatches(periodId?: string | null) {
  const admin = supabaseAdmin();
  let query = admin.from("payment_batches").select("*").order("created_at", { ascending: false });
  if (periodId) query = query.eq("payroll_period_id", periodId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const batches = (data ?? []) as Row[];
  const batchIds = batches.map((batch) => text(batch.id)).filter(Boolean);
  const periodIds = [...new Set(batches.map((batch) => text(batch.payroll_period_id)).filter(Boolean))];
  const [periods, lineRows] = await Promise.all([
    periodNameMap(periodIds),
    batchIds.length
      ? admin.from("payment_batch_lines").select("payment_batch_id, paid_amount, status").in("payment_batch_id", batchIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (lineRows.error) throw new Error(lineRows.error.message);
  const linesByBatch = new Map<string, Row[]>();
  ((lineRows.data ?? []) as Row[]).forEach((line) => {
    const batchId = text(line.payment_batch_id);
    linesByBatch.set(batchId, [...(linesByBatch.get(batchId) ?? []), line]);
  });

  return batches.map((batch) => ({
    ...batch,
    period_name: periods[text(batch.payroll_period_id)] ?? "",
    ...totals(linesByBatch.get(text(batch.id)) ?? []),
  }));
}

export async function getPaymentBatchDetail(batchId: string): Promise<PaymentBatchDetail> {
  const admin = supabaseAdmin();
  const { data: batchRows, error: batchError } = await admin.from("payment_batches").select("*").eq("id", batchId).limit(1);
  if (batchError) throw new Error(batchError.message);
  const batch = (batchRows?.[0] as Row | undefined) ?? null;
  if (!batch) throw new Error("ไม่พบชุดจ่ายเงิน");

  const { data: lineRows, error: lineError } = await admin
    .from("payment_batch_lines")
    .select("*")
    .eq("payment_batch_id", batchId)
    .order("sort_order", { ascending: true, nullsFirst: false })   // ลำดับที่ลากเรียงไว้ก่อน
    .order("created_at", { ascending: true });
  if (lineError) throw new Error(lineError.message);
  const lines = (lineRows ?? []) as Row[];
  const empIds = [...new Set(lines.map((line) => text(line.employee_id)).filter(Boolean))];

  const periodId = text(batch.payroll_period_id);
  const [periods, maps, slips, latestCalc] = await Promise.all([
    periodNameMap([text(batch.payroll_period_id)].filter(Boolean)),
    employeeAndBankMaps(empIds),
    admin.from("payroll_payslips").select("id, payslip_no, employee_id, payment_batch_id").eq("payment_batch_id", batchId),
    latestPayrollCalcSummary(periodId),
  ]);
  if (slips.error) throw new Error(slips.error.message);
  const slipByEmp: Record<string, Row> = {};
  ((slips.data ?? []) as Row[]).forEach((slip) => { slipByEmp[text(slip.employee_id)] = slip; });

  const enrichedLines = lines.map((line) => {
    const employeeId = text(line.employee_id);
    const emp = maps.empById[employeeId] ?? {};
    const bank = maps.bankByEmp[employeeId] ?? {};
    const contract = maps.contractByEmp[employeeId] ?? {};
    const slip = slipByEmp[employeeId] ?? {};
    const note = parsePaymentLineNote(line.note);
    return {
      ...line,
      employee_code: text(emp.employee_code),
      employee_name: employeeName(emp),
      contract_type: text(contract.contract_type),
      wage_type: text(contract.wage_type),
      bank_name: text(line.bank_name_override) || text(bank.bank_name),
      bank_account_name: text(line.bank_account_name_override) || text(bank.account_name) || employeeName(emp),
      bank_account_no: text(line.bank_account_no_override) || text(bank.account_no),
      payslip_no: text(slip.payslip_no),
      payslip_id: text(slip.id || note.payslip_id),
      source: text(note.source),
      net_before_rounding: note.net_before_rounding ?? null,
      rounding_adjustment: note.rounding_adjustment ?? null,
      line_note: note.line_note ?? null,
    };
  });

  return {
    batch: { ...batch, period_name: periods[text(batch.payroll_period_id)] ?? "", ...totals(lines), ...latestCalc },
    lines: enrichedLines,
  };
}

export async function previewPaymentBatch(periodId: string, rawBatchType?: string | null) {
  const admin = supabaseAdmin();
  const period = await getPeriod(periodId);
  const batchType = normalizePaymentBatchType(rawBatchType);

  if (batchType === "month_end") {
    const { data: slips, error: slipError } = await admin
      .from("payroll_payslips")
      .select("id, payroll_period_id, payroll_line_id, employee_id, gross_pay, total_deduction, net_pay, status, voided_at, payment_batch_id, payslip_no")
      .eq("payroll_period_id", periodId)
      .is("voided_at", null)
      .is("payment_batch_id", null);
    if (slipError) throw new Error(slipError.message);
    const readySlips = ((slips ?? []) as Row[]).filter((slip) => !["cancelled", "voided"].includes(text(slip.status)));
    const payrollLineIds = [...new Set(readySlips.map((slip) => text(slip.payroll_line_id)).filter(Boolean))];
    const [maps, payrollLineRows] = await Promise.all([
      employeeAndBankMaps([...new Set(readySlips.map((slip) => text(slip.employee_id)).filter(Boolean))]),
      payrollLineIds.length
        ? admin.from("payroll_lines").select("id, base_salary, mid_month_paid, social_security_employee, net_pay").in("id", payrollLineIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (payrollLineRows.error) throw new Error(payrollLineRows.error.message);
    const payrollLineById: Record<string, Row> = {};
    ((payrollLineRows.data ?? []) as Row[]).forEach((line) => { payrollLineById[text(line.id)] = line; });
    const lines = readySlips.map((slip) => {
      const employeeId = text(slip.employee_id);
      const emp = maps.empById[employeeId] ?? {};
      const bank = maps.bankByEmp[employeeId] ?? {};
      const contract = maps.contractByEmp[employeeId] ?? {};
      const line = buildPaymentLineFromPayslip({
        id: text(slip.id),
        payroll_period_id: text(slip.payroll_period_id),
        payroll_line_id: text(slip.payroll_line_id),
        employee_id: employeeId,
        gross_pay: slip.gross_pay,
        total_deduction: slip.total_deduction,
        net_pay: slip.net_pay,
      });
      const note = parsePaymentLineNote(line.note);
      const payrollLine = payrollLineById[text(slip.payroll_line_id)] ?? {};
      const registerAmounts = computePayrollRegisterAmounts({ ...payrollLine, net_pay: line.paid_amount });
      return {
        ...line,
        ...registerAmounts,
        selected: true,
        employee_code: text(emp.employee_code),
        employee_name: employeeName(emp),
        contract_type: text(contract.contract_type),
        wage_type: text(contract.wage_type),
        identity_no: identityNo(emp),
        bank_name: text(bank.bank_name),
        bank_account_name: text(bank.account_name) || employeeName(emp),
        bank_account_no: text(bank.account_no),
        payslip_no: text(slip.payslip_no),
        net_before_rounding: note.net_before_rounding ?? null,
        rounding_adjustment: note.rounding_adjustment ?? null,
      };
    });
    return { period, batch_type: batchType, existing_count: 0, lines, totals: totals(lines) };
  }

  const { count: existingCount, error: existingError } = await admin
    .from("payment_batches")
    .select("id", { count: "exact", head: true })
    .eq("payroll_period_id", periodId)
    .eq("batch_type", batchType)
    .neq("status", "cancelled");
  if (existingError) throw new Error(existingError.message);

  const previousByEmp = await previousPaymentLineMap(periodId, batchType, text(period.payment_date));
  const { data: settings, error: settingsError } = await admin
    .from("employee_payroll_settings")
    .select("id, employee_id, advance_payment_allowed, default_mid_month_advance_amount")
    .eq("advance_payment_allowed", true);
  if (settingsError) throw new Error(settingsError.message);
  const settingRows = ((settings ?? []) as Row[])
    .filter((row) => bool(row.advance_payment_allowed))
    .filter((row) => money(row.default_mid_month_advance_amount) > 0);
  const settingEmpIds = settingRows.map((row) => text(row.employee_id)).filter(Boolean);
  const previousEmpIds = [...previousByEmp.keys()];
  const [activeEmployees, activeContracts] = await Promise.all([
    admin.from("employees").select("id, employee_code, first_name, last_name, nickname, employment_status").eq("employment_status", "active"),
    admin.from("employee_contracts").select("employee_id, is_current, status, contract_type, wage_type").eq("is_current", true).eq("status", "active"),
  ]);
  if (activeEmployees.error) throw new Error(activeEmployees.error.message);
  if (activeContracts.error) throw new Error(activeContracts.error.message);
  const activeEmpRows = (activeEmployees.data ?? []) as Row[];
  const activeEmpIds = new Set(activeEmpRows.map((emp) => text(emp.id)));
  const activeContractByEmp = new Map(((activeContracts.data ?? []) as Row[]).map((contract) => [text(contract.employee_id), contract]));
  const contractByEmp = new Set(activeContractByEmp.keys());
  const allMapEmpIds = [...new Set([...settingEmpIds, ...previousEmpIds, ...activeEmpRows.map((emp) => text(emp.id)).filter(Boolean)])];
  const maps = await employeeAndBankMaps(allMapEmpIds);

  const lines = settingRows.flatMap((setting) => {
    const employeeId = text(setting.employee_id);
    if (!activeEmpIds.has(employeeId) || !contractByEmp.has(employeeId)) return [];
    const emp = maps.empById[employeeId] ?? {};
    const bank = maps.bankByEmp[employeeId] ?? {};
    const contract = activeContractByEmp.get(employeeId) ?? {};
    const previous = previousByEmp.get(employeeId);
    const line = buildMidMonthPaymentLine({
      payroll_period_id: periodId,
      employee_id: employeeId,
      setting_id: text(setting.id),
      amount: setting.default_mid_month_advance_amount,
    });
    return [{
      ...line,
      selected: true,
      employee_code: text(emp.employee_code),
      employee_name: employeeName(emp),
      contract_type: text(contract.contract_type),
      wage_type: text(contract.wage_type),
      identity_no: identityNo(emp),
      bank_name: text(bank.bank_name),
      bank_account_name: text(bank.account_name) || employeeName(emp),
      bank_account_no: text(bank.account_no),
      source: "settings",
      default_paid_amount: money(setting.default_mid_month_advance_amount),
      ...comparePaymentLineWithPrevious(line.paid_amount, previous?.paid_amount ?? null),
    }];
  });
  const currentEmpIds = new Set(lines.map((line) => text(line.employee_id)));
  const missingPrevious = [...previousByEmp.entries()].flatMap(([employeeId, previous]) => {
    if (currentEmpIds.has(employeeId) || !activeEmpIds.has(employeeId) || !contractByEmp.has(employeeId)) return [];
    const emp = maps.empById[employeeId] ?? {};
    const bank = maps.bankByEmp[employeeId] ?? {};
    const contract = activeContractByEmp.get(employeeId) ?? {};
    return [{
      payroll_period_id: periodId,
      employee_id: employeeId,
      source_payroll_line_id: null,
      gross_amount: 0,
      deduction_amount: 0,
      paid_amount: 0,
      status: "draft",
      note: JSON.stringify({ source: "payroll_mid_month", line_note: "เดือนก่อนมี แต่เดือนนี้ยังไม่ตั้งค่า" }),
      selected: false,
      employee_code: text(emp.employee_code),
      employee_name: employeeName(emp),
      contract_type: text(contract.contract_type),
      wage_type: text(contract.wage_type),
      identity_no: identityNo(emp),
      bank_name: text(bank.bank_name),
      bank_account_name: text(bank.account_name) || employeeName(emp),
      bank_account_no: text(bank.account_no),
      source: "previous",
      ...comparePaymentLineWithPrevious(0, previous.paid_amount),
    }];
  });
  const previewLines = [...lines, ...missingPrevious];
  const previewEmpIds = new Set(previewLines.map((line) => text(line.employee_id)));
  const candidates = activeEmpRows.flatMap((emp) => {
    const employeeId = text(emp.id);
    if (!employeeId || previewEmpIds.has(employeeId) || !contractByEmp.has(employeeId)) return [];
    const bank = maps.bankByEmp[employeeId] ?? {};
    const contract = activeContractByEmp.get(employeeId) ?? {};
    const previous = previousByEmp.get(employeeId);
    return [{
      employee_id: employeeId,
      employee_code: text(emp.employee_code),
      employee_name: employeeName(emp),
      contract_type: text(contract.contract_type),
      wage_type: text(contract.wage_type),
      identity_no: identityNo(emp),
      bank_name: text(bank.bank_name),
      bank_account_name: text(bank.account_name) || employeeName(emp),
      bank_account_no: text(bank.account_no),
      suggested_amount: money(previous?.paid_amount),
      ...comparePaymentLineWithPrevious(0, previous?.paid_amount ?? null),
    }];
  });
  return { period, batch_type: batchType, existing_count: existingCount ?? 0, lines: previewLines, candidates, totals: totals(previewLines.filter((line) => line.selected !== false)) };
}

export async function createPaymentBatch(input: { periodId: string; batchType?: string; paymentDate?: string | null; note?: string | null; lines?: PaymentLineInput[] | null } & Actor) {
  const admin = supabaseAdmin();
  const periodId = input.periodId;
  const period = await getPeriod(periodId);
  if (["paid", "cancelled"].includes(text(period.status))) throw new Error("งวดนี้จ่ายแล้วหรือถูกยกเลิก ไม่สามารถสร้างชุดจ่ายใหม่ได้");
  const batchType = normalizePaymentBatchType(input.batchType);

  if (batchType !== "month_end") {
    const { count, error } = await admin
      .from("payment_batches")
      .select("id", { count: "exact", head: true })
      .eq("payroll_period_id", periodId)
      .eq("batch_type", batchType)
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);
    if (count) throw new Error("งวดนี้มีรอบจ่ายกลางเดือนที่ยังไม่ยกเลิกแล้ว ระบบกันไม่ให้จ่ายซ้ำ");
  }

  let readyLines: Row[] = [];
  if (batchType === "month_end") {
    const { data: slips, error } = await admin
      .from("payroll_payslips")
      .select("id, payroll_period_id, payroll_line_id, employee_id, gross_pay, total_deduction, net_pay, status, voided_at, payment_batch_id")
      .eq("payroll_period_id", periodId)
      .is("voided_at", null)
      .is("payment_batch_id", null);
    if (error) throw new Error(error.message);
    const readySlips = ((slips ?? []) as Row[]).filter((slip) => !["cancelled", "voided"].includes(text(slip.status)));
    if (!readySlips.length) throw new Error("ไม่มีสลิปที่พร้อมสร้างชุดจ่าย หรือสลิปทั้งหมดถูกผูกกับชุดจ่ายแล้ว");
    readyLines = readySlips.map((slip) => buildPaymentLineFromPayslip({
      id: text(slip.id),
      payroll_period_id: text(slip.payroll_period_id),
      payroll_line_id: text(slip.payroll_line_id),
      employee_id: text(slip.employee_id),
      gross_pay: slip.gross_pay,
      total_deduction: slip.total_deduction,
      net_pay: slip.net_pay,
    }));
  } else {
    const preview = await previewPaymentBatch(periodId, batchType);
    const overrides = new Map((input.lines ?? []).map((line) => [text(line.employee_id), line]));
    const sourceLines = new Map<string, Row>();
    for (const line of preview.lines as Row[]) sourceLines.set(text(line.employee_id), line);
    for (const candidate of ((preview as Row).candidates as Row[] | undefined) ?? []) {
      const employeeId = text(candidate.employee_id);
      if (!sourceLines.has(employeeId)) {
        sourceLines.set(employeeId, {
          payroll_period_id: periodId,
          employee_id: employeeId,
          paid_amount: money(candidate.suggested_amount),
          note: JSON.stringify({ source: "payroll_mid_month", line_note: "เพิ่มจาก popup รอบจ่าย" }),
        });
      }
    }
    const selectedSourceLines = input.lines?.length
      ? [...overrides.keys()].map((employeeId) => sourceLines.get(employeeId) ? { ...sourceLines.get(employeeId), employee_id: employeeId } as Row : null).filter(Boolean) as Row[]
      : [...sourceLines.values()];
    readyLines = selectedSourceLines.flatMap((line) => {
      const override = overrides.get(text(line.employee_id));
      if (override && override.selected === false) return [];
      const amount = override ? money(override.paid_amount) : money(line.paid_amount);
      if (amount <= 0) return [];
      return [buildMidMonthPaymentLine({
        payroll_period_id: periodId,
        employee_id: text(line.employee_id),
        setting_id: parsePaymentLineNote(line.note).setting_id,
        amount,
        note: override?.note ?? null,
      })];
    });
    if (!readyLines.length) throw new Error("ยังไม่มีรายการจ่ายกลางเดือน หรือยอดที่เลือกเป็น 0");
  }

  const batchNo = `${batchPrefix(batchType)}-${periodId.slice(0, 8)}-${Date.now().toString().slice(-6)}`;
  const { data: insertedBatch, error: batchInsertError } = await admin.from("payment_batches").insert({
    payroll_period_id: periodId,
    batch_no: batchNo,
    batch_type: batchType,
    payment_date: input.paymentDate || period.payment_date || new Date().toISOString().slice(0, 10),
    status: "draft",
    note: input.note || null,
  }).select("*").limit(1);
  if (batchInsertError) throw new Error(batchInsertError.message);
  const batch = insertedBatch?.[0] as Row | undefined;
  if (!batch) throw new Error("สร้างชุดจ่ายไม่สำเร็จ");

  const lines: Row[] = readyLines.map((line) => ({ payment_batch_id: batch.id, ...line }));
  const { error: lineInsertError } = await admin.from("payment_batch_lines").insert(lines);
  if (lineInsertError) throw new Error(lineInsertError.message);

  if (batchType === "month_end") {
    const slipIds = lines.map((line) => parsePaymentLineNote(line["note"]).payslip_id).filter(Boolean) as string[];
    if (slipIds.length) {
      const { error } = await admin.from("payroll_payslips").update({ payment_batch_id: batch.id, updated_at: new Date().toISOString() }).in("id", slipIds);
      if (error) throw new Error(error.message);
    }
  }
  if (batchType !== "month_end") {
    await saveMidMonthDefaults(input.lines ?? [], input);
  }

  await writeAudit(admin, {
    action: "create_payment_batch",
    entityType: "payment_batches",
    entityId: text(batch.id),
    actorId: input.actorId,
    actorName: input.actorName,
    metadata: { period_id: periodId, period_name: period.period_name, batch_no: batchNo, batch_type: batchType, line_count: lines.length },
  });

  return { batch, line_count: lines.length, paid_amount: totals(lines).paid_amount };
}

// อัปเดตยอดในรอบ "ร่าง" ให้ตรงกับการคำนวณล่าสุด — โดยไม่ต้องลบ-สร้างใหม่
//  - รายชื่อเดิม: อัปเดตยอดจ่าย/รายได้/หัก ตามสลิปล่าสุด (คง override ธนาคาร/ลำดับไว้)
//  - คนใหม่ที่ยังไม่อยู่ในรอบ: เพิ่มบรรทัดให้ + ผูกสลิป
// รองรับเฉพาะรอบสิ้นเดือน (month_end) และเฉพาะรอบที่ยังเป็น "ร่าง"
export async function resyncPaymentBatch(batchId: string, actor: Actor = {}) {
  const admin = supabaseAdmin();
  const { data: batchRows, error: batchError } = await admin.from("payment_batches").select("*").eq("id", batchId).limit(1);
  if (batchError) throw new Error(batchError.message);
  const batch = batchRows?.[0] as Row | undefined;
  if (!batch) throw new Error("ไม่พบชุดจ่ายเงิน");
  if (text(batch.status) !== "draft") throw new Error("อัปเดตยอดได้เฉพาะรอบจ่ายที่ยังเป็นร่างเท่านั้น");
  const batchType = normalizePaymentBatchType(batch.batch_type);
  if (batchType !== "month_end") throw new Error("อัปเดตยอดอัตโนมัติรองรับเฉพาะรอบสิ้นเดือน รอบกลางเดือนให้สร้างรอบใหม่");
  const periodId = text(batch.payroll_period_id);
  const now = new Date().toISOString();

  // สลิปปัจจุบันของงวด: เอาเฉพาะที่ "ยังไม่ผูกรอบใด" หรือ "ผูกกับรอบนี้อยู่แล้ว" (ไม่ไปแย่งของรอบอื่น)
  const { data: slipRows, error: slipError } = await admin
    .from("payroll_payslips")
    .select("id, payroll_period_id, payroll_line_id, employee_id, gross_pay, total_deduction, net_pay, status, voided_at, payment_batch_id")
    .eq("payroll_period_id", periodId)
    .is("voided_at", null);
  if (slipError) throw new Error(slipError.message);
  const readySlips = ((slipRows ?? []) as Row[]).filter((slip) => {
    if (["cancelled", "voided"].includes(text(slip.status))) return false;
    const linked = text(slip.payment_batch_id);
    return linked === "" || linked === batchId;
  });

  const { data: existingLines, error: lineLoadError } = await admin.from("payment_batch_lines").select("id, employee_id").eq("payment_batch_id", batchId);
  if (lineLoadError) throw new Error(lineLoadError.message);
  const lineIdByEmp = new Map<string, string>();
  ((existingLines ?? []) as Row[]).forEach((l) => lineIdByEmp.set(text(l.employee_id), text(l.id)));

  let updated = 0, inserted = 0;
  const slipIdsToLink: string[] = [];
  for (const slip of readySlips) {
    const draft = buildPaymentLineFromPayslip({
      id: text(slip.id),
      payroll_period_id: text(slip.payroll_period_id),
      payroll_line_id: text(slip.payroll_line_id),
      employee_id: text(slip.employee_id),
      gross_pay: slip.gross_pay,
      total_deduction: slip.total_deduction,
      net_pay: slip.net_pay,
    });
    slipIdsToLink.push(text(slip.id));
    const existingLineId = lineIdByEmp.get(text(slip.employee_id));
    if (existingLineId) {
      const { error } = await admin.from("payment_batch_lines").update({
        gross_amount: draft.gross_amount,
        deduction_amount: draft.deduction_amount,
        paid_amount: draft.paid_amount,
        source_payroll_line_id: draft.source_payroll_line_id,
        note: draft.note,
        updated_at: now,
      }).eq("id", existingLineId).eq("payment_batch_id", batchId);
      if (error) throw new Error(error.message);
      updated += 1;
    } else {
      const { error } = await admin.from("payment_batch_lines").insert({ payment_batch_id: batchId, ...draft });
      if (error) throw new Error(error.message);
      inserted += 1;
    }
  }
  if (slipIdsToLink.length) {
    const { error } = await admin.from("payroll_payslips").update({ payment_batch_id: batchId, updated_at: now }).in("id", slipIdsToLink);
    if (error) throw new Error(error.message);
  }

  await writeAudit(admin, {
    action: "resync_payment_batch",
    entityType: "payment_batches",
    entityId: batchId,
    actorId: actor.actorId,
    actorName: actor.actorName,
    metadata: { period_id: periodId, batch_no: text(batch.batch_no), updated, inserted },
  });

  const detail = await getPaymentBatchDetail(batchId);
  return { ...detail, resync: { updated, inserted } };
}

export async function approvePaymentBatch(batchId: string, actor: Actor = {}) {
  const admin = supabaseAdmin();
  const detail = await getPaymentBatchDetail(batchId);
  if (text(detail.batch.status) === "paid") throw new Error("ชุดจ่ายนี้จ่ายแล้ว ไม่สามารถย้อนมาอนุมัติได้");
  if (text(detail.batch.status) === "cancelled") throw new Error("ชุดจ่ายนี้ถูกยกเลิกแล้ว");
  const now = new Date().toISOString();
  const { error: lineError } = await admin.from("payment_batch_lines").update({ status: "approved", updated_at: now }).eq("payment_batch_id", batchId);
  if (lineError) throw new Error(lineError.message);
  const { error: batchError } = await admin.from("payment_batches").update({ status: "approved", approved_at: now, updated_at: now }).eq("id", batchId);
  if (batchError) throw new Error(batchError.message);
  await writeAudit(admin, {
    action: "approve_payment_batch",
    entityType: "payment_batches",
    entityId: batchId,
    actorId: actor.actorId,
    actorName: actor.actorName,
    metadata: { batch_no: detail.batch.batch_no, line_count: detail.lines.length },
  });
  return getPaymentBatchDetail(batchId);
}

export async function cancelPaymentBatch(batchId: string, actor: Actor = {}) {
  const admin = supabaseAdmin();
  const detail = await getPaymentBatchDetail(batchId);
  if (text(detail.batch.status) === "paid") throw new Error("ชุดจ่ายนี้จ่ายแล้ว ยกเลิกไม่ได้");
  const now = new Date().toISOString();
  const { error: lineError } = await admin.from("payment_batch_lines").update({ status: "cancelled", updated_at: now }).eq("payment_batch_id", batchId);
  if (lineError) throw new Error(lineError.message);
  const { error: batchError } = await admin.from("payment_batches").update({ status: "cancelled", updated_at: now }).eq("id", batchId);
  if (batchError) throw new Error(batchError.message);
  if (text(detail.batch.batch_type) === "month_end") {
    const { error } = await admin.from("payroll_payslips").update({ payment_batch_id: null, updated_at: now }).eq("payment_batch_id", batchId);
    if (error) throw new Error(error.message);
  }
  await writeAudit(admin, {
    action: "cancel_payment_batch",
    entityType: "payment_batches",
    entityId: batchId,
    actorId: actor.actorId,
    actorName: actor.actorName,
    metadata: { batch_no: detail.batch.batch_no, line_count: detail.lines.length },
  });
  return getPaymentBatchDetail(batchId);
}

// ลบรอบจ่าย — ได้เฉพาะรอบที่ "ยกเลิกแล้ว" เท่านั้น (กันลบรอบที่ยังใช้งาน/จ่ายแล้ว)
export async function deletePaymentBatch(batchId: string, actor: Actor = {}) {
  const admin = supabaseAdmin();
  const detail = await getPaymentBatchDetail(batchId);
  if (text(detail.batch.status) !== "cancelled") throw new Error("ลบได้เฉพาะรอบจ่ายที่ยกเลิกแล้ว");
  const now = new Date().toISOString();
  // ปลดลิงก์ payslip (ถ้ามี) ก่อนลบ กัน FK
  await admin.from("payroll_payslips").update({ payment_batch_id: null, updated_at: now }).eq("payment_batch_id", batchId);
  const { error: lineError } = await admin.from("payment_batch_lines").delete().eq("payment_batch_id", batchId);
  if (lineError) throw new Error(lineError.message);
  const { error: batchError } = await admin.from("payment_batches").delete().eq("id", batchId);
  if (batchError) throw new Error(batchError.message);
  await writeAudit(admin, {
    action: "delete_payment_batch",
    entityType: "payment_batches",
    entityId: batchId,
    actorId: actor.actorId,
    actorName: actor.actorName,
    metadata: { batch_no: detail.batch.batch_no, line_count: detail.lines.length },
  });
  return { deleted: true, batch_no: text(detail.batch.batch_no) };
}

// แก้ไขบรรทัด (เฉพาะรอบ "ร่าง") — ยอดจ่าย + override ธนาคาร/เลขบัญชี/ชื่อบัญชี (แก้แค่รอบนี้ ไม่กระทบข้อมูลพนักงาน)
export async function updatePaymentBatchLine(
  batchId: string,
  lineId: string,
  patch: { paid_amount?: number | null; bank_name?: string | null; bank_account_no?: string | null; bank_account_name?: string | null },
  actor: Actor = {},
) {
  const admin = supabaseAdmin();
  const detail = await getPaymentBatchDetail(batchId);
  if (text(detail.batch.status) !== "draft") throw new Error("แก้ได้เฉพาะรอบจ่ายที่เป็นร่าง");
  const now = new Date().toISOString();
  const upd: Record<string, unknown> = { updated_at: now };
  if (patch.paid_amount !== undefined) upd.paid_amount = patch.paid_amount;
  if (patch.bank_name !== undefined) upd.bank_name_override = (patch.bank_name ?? "").trim() || null;
  if (patch.bank_account_no !== undefined) upd.bank_account_no_override = (patch.bank_account_no ?? "").trim() || null;
  if (patch.bank_account_name !== undefined) upd.bank_account_name_override = (patch.bank_account_name ?? "").trim() || null;
  const { error } = await admin.from("payment_batch_lines").update(upd).eq("id", lineId).eq("payment_batch_id", batchId);
  if (error) throw new Error(error.message);
  await writeAudit(admin, {
    action: "update_payment_batch_line", entityType: "payment_batch_lines", entityId: lineId,
    actorId: actor.actorId, actorName: actor.actorName,
    metadata: { batch_id: batchId, changed: Object.keys(upd).filter((k) => k !== "updated_at") },
  });
  return getPaymentBatchDetail(batchId);
}

// บันทึกลำดับที่ลากเรียง (sort_order) — ให้ทุกคนเห็นเหมือนกัน
export async function reorderPaymentBatchLines(batchId: string, orderedIds: string[], actor: Actor = {}) {
  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin.from("payment_batch_lines").update({ sort_order: i, updated_at: now }).eq("id", orderedIds[i]).eq("payment_batch_id", batchId);
    if (error) throw new Error(error.message);
  }
  await writeAudit(admin, {
    action: "reorder_payment_batch_lines", entityType: "payment_batches", entityId: batchId,
    actorId: actor.actorId, actorName: actor.actorName, metadata: { count: orderedIds.length },
  });
  return getPaymentBatchDetail(batchId);
}

export async function exportPaymentBatchCsv(batchId: string, actor: Actor = {}) {
  const admin = supabaseAdmin();
  const detail = await getPaymentBatchDetail(batchId);
  await writeAudit(admin, {
    action: "export_payment_batch",
    entityType: "payment_batches",
    entityId: batchId,
    actorId: actor.actorId,
    actorName: actor.actorName,
    metadata: { batch_no: detail.batch.batch_no, line_count: detail.lines.length },
  });
  return paymentExportCsv(detail.lines);
}

export async function markPaymentBatchPaid(batchId: string, actor: Actor = {}) {
  const admin = supabaseAdmin();
  const detail = await getPaymentBatchDetail(batchId);
  if (detail.lines.length === 0) throw new Error("ชุดจ่ายนี้ยังไม่มีรายการจ่าย");
  const status = text(detail.batch.status);
  if (status === "paid") return { ...detail, period_marked_paid: false };
  if (status === "cancelled") throw new Error("ชุดจ่ายนี้ถูกยกเลิกแล้ว");
  if (status !== "approved") throw new Error("ต้องอนุมัติชุดจ่ายก่อนบันทึกว่าจ่ายแล้ว");

  const now = new Date().toISOString();
  const { error: lineError } = await admin.from("payment_batch_lines").update({ status: "paid", updated_at: now }).eq("payment_batch_id", batchId);
  if (lineError) throw new Error(lineError.message);

  const batchType = text(detail.batch.batch_type);
  if (batchType === "month_end") {
    const { error: slipError } = await admin.from("payroll_payslips").update({ status: "paid", issued_at: now, updated_at: now }).eq("payment_batch_id", batchId);
    if (slipError) throw new Error(slipError.message);
  }

  const { error: batchError } = await admin.from("payment_batches").update({ status: "paid", paid_at: now, updated_at: now }).eq("id", batchId);
  if (batchError) throw new Error(batchError.message);

  let periodMarkedPaid = false;
  const periodId = text(detail.batch.payroll_period_id);
  if (batchType === "month_end") {
    const { count: unpaidSlips, error: countError } = await admin
      .from("payroll_payslips")
      .select("id", { count: "exact", head: true })
      .eq("payroll_period_id", periodId)
      .neq("status", "paid");
    if (countError) throw new Error(countError.message);
    if (!unpaidSlips) {
      const { data: periodRows } = await admin.from("payroll_periods").select("id, status").eq("id", periodId).limit(1);
      const period = periodRows?.[0] as Row | undefined;
      if (period && ["locked", "approved"].includes(text(period.status))) {
        const { error: periodError } = await admin.from("payroll_periods").update({ status: "paid", paid_at: now, updated_at: now }).eq("id", periodId);
        if (periodError) throw new Error(periodError.message);
        periodMarkedPaid = true;
      }
    }
  }

  await writeAudit(admin, {
    action: "mark_payment_batch_paid",
    entityType: "payment_batches",
    entityId: batchId,
    actorId: actor.actorId,
    actorName: actor.actorName,
    metadata: { period_id: periodId, batch_no: detail.batch.batch_no, line_count: detail.lines.length, period_marked_paid: periodMarkedPaid },
  });

  if (periodMarkedPaid) {
    await writeAudit(admin, {
      action: "status_change",
      entityType: "payroll_periods",
      entityId: periodId,
      actorId: actor.actorId,
      actorName: actor.actorName,
      metadata: { from: "locked_or_approved", to: "paid", source: "payment_batch", batch_id: batchId },
    });
  }

  return { ...(await getPaymentBatchDetail(batchId)), period_marked_paid: periodMarkedPaid };
}
