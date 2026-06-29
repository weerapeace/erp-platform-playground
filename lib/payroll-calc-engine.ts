/**
 * Payroll module — เครื่องคำนวณเต็มจาก raw input (Phase 3) — พอร์ต "เหมือนเดิม" จาก worker.js
 *
 * รวมยอด (attendance/leave/OT/advance/adjustments/recurring/mid-month) → buildPayrollLine
 * ⚠️ computePeriodPreview ไม่เขียน DB (อ่านอย่างเดียว) — ใช้เทียบกับ payroll_lines เดิมก่อนใช้จริง
 * ⚠️ ห้ามแก้สูตร (เจ้าของตกลง "เหมือนเดิมก่อน")
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { money, roundMoney } from "@/lib/payroll-calc";
import { isPayrollContractor, isPayrollDailyLike } from "@/lib/payroll-attendance-rules";

type Row = Record<string, unknown>;
const MANUAL_STATUSES = new Set(["approved", "review", "draft"]);
const isManualStatus = (s: unknown) => MANUAL_STATUSES.has(String(s ?? "approved"));
const hasInput = (v: unknown) => v !== undefined && v !== null && v !== "";

// ---- contract helpers (ตรง worker.js) ----
const isContractor = (c: Row = {}) => isPayrollContractor(c);
const isDailyPaid = (c: Row = {}) => isPayrollDailyLike(c);
const isOfficeGroup = (c: Row = {}) => {
  const v = String((c.payroll_group_id ?? c.payroll_group ?? "")).trim().toLowerCase();
  return v === "office";
};

// ---- work-day helpers (ตรง worker.js) ----
const SCHEDULES: Record<string, number[]> = {
  office_5d: [1, 2, 3, 4, 5], factory_6d: [1, 2, 3, 4, 5, 6],
  shift_a: [1, 2, 3, 4, 5, 6], shift_b: [1, 2, 3, 4, 5, 6], part_time_weekend: [0, 6],
};
const scheduleWeekdays = (id: unknown) => SCHEDULES[String(id)] ?? SCHEDULES.factory_6d;
const holidaySet = (period: Row) => new Set(
  ((period.payroll_period_holidays as Row[]) ?? []).map((h) => h?.holiday_date ?? h?.date).filter(Boolean) as string[],
);
function eachDay(start: string, end: string, fn: (d: Date, iso: string) => void) {
  const s = new Date(`${start}T00:00:00Z`), e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return;
  for (const d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) fn(d, d.toISOString().slice(0, 10));
}
function countWorkDays(start: string, end: string): number {
  let n = 0; eachDay(start, end, (d) => { if (d.getUTCDay() !== 0) n++; }); return n;
}
function scheduledWorkDays(period: Row, contract: Row): number {
  const wd = scheduleWeekdays(contract.work_schedule_id); let n = 0;
  eachDay(String(period.start_date), String(period.end_date), (d) => { if (wd.includes(d.getUTCDay())) n++; }); return n;
}
function payableWorkDays(period: Row, contract: Row): number {
  const wd = scheduleWeekdays(contract.work_schedule_id), hol = holidaySet(period); let n = 0;
  eachDay(String(period.start_date), String(period.end_date), (d, iso) => { if (wd.includes(d.getUTCDay()) && !hol.has(iso)) n++; }); return n;
}
function isPayableWorkDate(iso: string, contract: Row, period: Row): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return scheduleWeekdays(contract.work_schedule_id).includes(d.getUTCDay()) && !holidaySet(period).has(iso);
}

const socialSecurityAmount = (s: Row = {}) =>
  hasInput(s.social_security_employer_amount) ? money(s.social_security_employer_amount) : money(s.social_security_employee_amount);

function paidDailyAttendanceDays(workDays: number, absenceDeduction: number, dailyWage: number, manualOverride = false): number {
  const days = Math.max(money(workDays), 0);
  if (manualOverride) return roundMoney(days);
  const wage = money(dailyWage);
  if (!wage) return roundMoney(days);
  const absentDays = Math.min(days, Math.max(money(absenceDeduction) / wage, 0));
  return roundMoney(Math.max(days - absentDays, 0));
}

// ---- aggregation ----
const addInto = (map: Map<string, Row>, id: string, vals: Row) => {
  const cur = map.get(id) ?? {};
  for (const [f, v] of Object.entries(vals)) cur[f] = money(cur[f]) + money(v);
  map.set(id, cur);
};

function aggregateManual(entries: { attendance: Row[]; leave: Row[]; overtime: Row[]; advances: Row[] }, period: Row, contractBy: Map<string, Row>): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const row of entries.attendance.filter((e) => isManualStatus(e.status))) {
    const c = contractBy.get(String(row.employee_id));
    if (isContractor(c ?? {}) || !isPayableWorkDate(String(row.work_date), c ?? {}, period)) continue;
    const vals: Row = { hourly_wage_amount: row.hourly_wage_amount, late_deduction: row.late_deduction, absence_deduction: row.absence_deduction };
    if (!(isDailyPaid(c ?? {}) && c?.wage_type === "daily")) {
      vals.attendance_days = money(row.absence_hours) > 0 ? 0 : 1;
      vals.attendance_hours = row.regular_hours;
    }
    addInto(m, String(row.employee_id), vals);
  }
  for (const row of entries.leave.filter((e) => isManualStatus(e.status))) {
    const c = contractBy.get(String(row.employee_id));
    if (isContractor(c ?? {}) || !isPayableWorkDate(String(row.leave_date), c ?? {}, period)) continue;
    addInto(m, String(row.employee_id), { unpaid_leave_deduction: row.unpaid_leave_deduction });
  }
  for (const row of entries.overtime.filter((e) => isManualStatus(e.status))) {
    if (isContractor(contractBy.get(String(row.employee_id)) ?? {})) continue;
    addInto(m, String(row.employee_id), { overtime_amount: row.overtime_amount });
  }
  for (const row of entries.advances.filter((e) => ["approved", "paid", "deducted"].includes(String(e.status)))) {
    addInto(m, String(row.employee_id), { advance_deduction: row.deduction_amount });
  }
  return m;
}

function aggregateAdjustments(rows: Row[]): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const row of rows.filter((r) => r.status === "approved")) {
    const piece = row.source_type === "piecework" || row.category === "piecework" || row.item_code === "PIECEWORK";
    const field = row.adjustment_type === "deduction" ? "other_deduction" : piece ? "piece_rate_amount" : "allowance_amount";
    const id = String(row.employee_id); const cur = m.get(id) ?? {};
    cur[field] = money(cur[field]) + money(row.amount); m.set(id, cur);
  }
  return m;
}

const recurringAmount = (it: Row) => (it.calculation_method || "fixed") === "fixed"
  ? money(it.amount_per_period) : roundMoney(money(it.quantity_default) * money(it.rate_default));
function aggregateRecurring(items: Row[], period: Row): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const it of items) {
    if (it.end_date && String(it.end_date) < String(period.start_date)) continue;
    const amt = recurringAmount(it);
    const remaining = it.duration_type === "until_amount" ? roundMoney(money(it.target_total_amount) - money(it.paid_or_deducted_amount)) : amt;
    const applied = it.duration_type === "until_amount" ? Math.min(amt, Math.max(remaining, 0)) : amt;
    if (!applied) continue;
    const id = String(it.employee_id); const cur = m.get(id) ?? [];
    cur.push({ ...it, applied_amount: roundMoney(applied) }); m.set(id, cur);
  }
  return m;
}
const sumRecurring = (items: Row[], type: string) => items.filter((i) => i.item_type === type).reduce((t, i) => t + money(i.applied_amount), 0);

function aggregateMidMonth(batches: Row[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of batches) {
    if (!["mid_month", "special"].includes(String(b.batch_type)) || !["approved", "paid"].includes(String(b.status))) continue;
    for (const line of (b.lines as Row[]) ?? []) {
      if (!["approved", "paid"].includes(String(line.status)) || money(line.paid_amount) <= 0) continue;
      m.set(String(line.employee_id), money(m.get(String(line.employee_id))) + money(line.paid_amount));
    }
  }
  return m;
}

// ---- buildPayrollLine (ตรง worker.js 1868-1975) ----
const MONEY_FIELDS = ["base_salary", "daily_wage_amount", "hourly_wage_amount", "piece_rate_amount", "overtime_amount",
  "allowance_amount", "bonus_amount", "commission_amount", "late_deduction", "absence_deduction", "unpaid_leave_deduction",
  "advance_deduction", "damage_deduction", "social_security_employee", "withholding_tax", "other_deduction", "social_security_employer", "mid_month_paid"];

function buildLine(period: Row, employee: Row, contract: Row, setting: Row, manual: Row): Row {
  const values: Row = {};
  for (const f of MONEY_FIELDS) values[f] = money(manual[f]);
  values.advance_deduction = money(manual.advance_deduction);

  const contractor = isContractor(contract);
  const payByAttendance = isDailyPaid(contract);
  values.base_salary = payByAttendance ? 0 : money(manual.base_salary ?? contract.base_salary);
  const sched = scheduledWorkDays(period, contract) || money(period.default_work_days ?? countWorkDays(String(period.start_date), String(period.end_date)));
  const payable = payableWorkDays(period, contract) || sched;
  const defaultWorkDays = payByAttendance ? payable : sched;
  const hoursPerDay = money(period.default_hours_per_day ?? 8);
  const manualAtt = hasInput(manual.attendance_days);
  values.attendance_days = contractor ? 0 : manualAtt ? money(manual.attendance_days) : defaultWorkDays;
  // จ่ายแบบรายวัน: สัญญาที่จ่ายตามวันทำงาน (contract_type/wage_type รายวัน) + มีค่าจ้างรายวัน
  // (เดิมผูกกับ wage_type==="daily" อย่างเดียว → สัญญา "รายวัน" ที่ตั้ง ประเภทค่าจ้าง=รายเดือน เลยไม่ได้เงิน)
  const dailyPay = !contractor && payByAttendance && contract.wage_type !== "hourly" && money(contract.daily_wage) > 0;
  if (dailyPay) {
    values.attendance_days = paidDailyAttendanceDays(money(values.attendance_days), money(values.absence_deduction), money(contract.daily_wage), manualAtt);
    values.absence_deduction = 0;
  }
  values.attendance_hours = contractor ? 0 : hasInput(manual.attendance_hours) ? money(manual.attendance_hours) : roundMoney(money(values.attendance_days) * hoursPerDay);
  if (contractor) {
    values.daily_wage_amount = 0; values.hourly_wage_amount = 0; values.overtime_amount = 0;
    values.late_deduction = 0; values.absence_deduction = 0; values.unpaid_leave_deduction = 0;
  }
  if (dailyPay && !values.daily_wage_amount) values.daily_wage_amount = roundMoney(money(values.attendance_days) * money(contract.daily_wage));
  if (!contractor && contract.wage_type === "hourly" && !values.hourly_wage_amount) values.hourly_wage_amount = roundMoney(money(values.attendance_hours) * money(contract.hourly_wage));

  const grossPay = money(values.base_salary) + money(values.daily_wage_amount) + money(values.hourly_wage_amount) + money(values.piece_rate_amount)
    + money(values.overtime_amount) + money(values.allowance_amount) + money(values.bonus_amount) + money(values.commission_amount);

  if (setting.social_security_enabled !== false) {
    values.social_security_employee = money(values.social_security_employee) || socialSecurityAmount(setting);
    values.social_security_employer = 0;
  } else { values.social_security_employee = 0; values.social_security_employer = 0; }

  const preTax = money(values.late_deduction) + money(values.absence_deduction) + money(values.unpaid_leave_deduction)
    + money(values.advance_deduction) + money(values.damage_deduction) + money(values.social_security_employee) + money(values.other_deduction) + money(values.mid_month_paid);
  const withholdingBase = Math.max(roundMoney(grossPay - preTax), 0);
  if (setting.withholding_tax_enabled === true) {
    const rate = (money(setting.withholding_tax_rate) || 3);
    const taxRate = Math.max(rate, 0) / 100;
    values.withholding_tax = hasInput(manual.withholding_tax) ? money(values.withholding_tax)
      : (taxRate > 0 && taxRate < 1 ? roundMoney(roundMoney(withholdingBase / (1 - taxRate)) - withholdingBase) : 0);
  } else values.withholding_tax = 0;

  const companyPaidWithholding = setting.withholding_tax_company_paid === true;
  const totalDeduction = preTax + (companyPaidWithholding ? 0 : money(values.withholding_tax));
  const netPay = roundMoney(grossPay - totalDeduction);
  // คืน "เต็มทุกคอลัมน์" ตรงกับ worker.js เดิม (1951-1974) — เพื่อบันทึกลง payroll_lines ได้
  return {
    employee_id: employee.id,
    employee_code: employee.employee_code,
    contract_id: contract.id ?? null,
    company_id: contract.company_id ?? period.company_id ?? null,
    contract_type: contract.contract_type ?? null,
    department_id: employee.department_id ?? null,
    position_id: employee.position_id ?? null,
    cost_center_id: employee.cost_center_id ?? null,
    wage_type: contract.wage_type,
    base_salary: money(values.base_salary),
    daily_wage_amount: money(values.daily_wage_amount),
    hourly_wage_amount: money(values.hourly_wage_amount),
    piece_rate_amount: money(values.piece_rate_amount),
    overtime_amount: money(values.overtime_amount),
    allowance_amount: money(values.allowance_amount),
    bonus_amount: money(values.bonus_amount),
    commission_amount: money(values.commission_amount),
    late_deduction: money(values.late_deduction),
    absence_deduction: money(values.absence_deduction),
    unpaid_leave_deduction: money(values.unpaid_leave_deduction),
    advance_deduction: money(values.advance_deduction),
    damage_deduction: money(values.damage_deduction),
    social_security_employee: money(values.social_security_employee),
    social_security_employer: money(values.social_security_employer),
    withholding_tax: money(values.withholding_tax),
    other_deduction: money(values.other_deduction),
    mid_month_paid: money(values.mid_month_paid),
    gross_pay: roundMoney(grossPay),
    total_deduction: roundMoney(totalDeduction),
    net_pay: netPay,
    recurring_earning_amount: money(manual.recurring_earning_amount),
    recurring_deduction_amount: money(manual.recurring_deduction_amount),
    remaining_to_pay: netPay,
    attendance_days: money(values.attendance_days),
    attendance_hours: money(values.attendance_hours),
    company_cost_total: roundMoney(grossPay + money(values.social_security_employer)),
  };
}

const mergeMoney = (saved: Row = {}, manual: Row = {}) => {
  const m: Row = { ...saved };
  for (const [f, v] of Object.entries(manual)) m[f] = money(m[f]) + money(v);
  return m;
};

/** คำนวณงวด (ไม่เขียน DB) — คืนบรรทัดที่คำนวณได้ */
export async function computePeriodPreview(periodId: string): Promise<{ lines: Row[]; period: Row; recurring_items: Row[] }> {
  const a = supabaseAdmin();
  const periodRes = await a.from("payroll_periods").select("*, payroll_period_holidays(*)").eq("id", periodId).limit(1);
  const period = (periodRes.data?.[0] as Row) ?? null;
  if (!period) throw new Error("ไม่พบงวด");

  const companyId = period.company_id as string | null;
  const [empRes, conRes, setRes, attRes, leaveRes, otRes, advRes, adjRes, recRes, batchRes] = await Promise.all([
    a.from("employees").select("*").eq("employment_status", "active"),
    (() => { let q = a.from("employee_contracts").select("*").eq("is_current", true).eq("status", "active"); if (companyId) q = q.eq("company_id", companyId); return q; })(),
    a.from("employee_payroll_settings").select("*"),
    a.from("attendance_entries").select("*").eq("payroll_period_id", periodId),
    a.from("leave_entries").select("*").eq("payroll_period_id", periodId),
    a.from("overtime_entries").select("*").eq("payroll_period_id", periodId),
    a.from("advance_payments").select("*").eq("payroll_period_id", periodId),
    a.from("payroll_adjustments").select("*").eq("payroll_period_id", periodId),
    a.from("employee_recurring_pay_items").select("*").eq("status", "active").lte("start_date", String(period.end_date)),
    a.from("payment_batches").select("*, payment_batch_lines(*)").eq("payroll_period_id", periodId),
  ]);

  const contractBy = new Map<string, Row>((conRes.data ?? []).map((c) => [String((c as Row).employee_id), c as Row]));
  const settingBy = new Map<string, Row>((setRes.data ?? []).map((s) => [String((s as Row).employee_id), s as Row]));
  const savedManual = aggregateManual({
    attendance: (attRes.data ?? []) as Row[], leave: (leaveRes.data ?? []) as Row[],
    overtime: (otRes.data ?? []) as Row[], advances: (advRes.data ?? []) as Row[],
  }, period, contractBy);
  const adjustments = aggregateAdjustments((adjRes.data ?? []) as Row[]);
  const recurring = aggregateRecurring((recRes.data ?? []) as Row[], period);
  const midMonth = aggregateMidMonth(((batchRes.data ?? []) as Row[]).map((b) => ({ ...b, lines: (b as Row).payment_batch_lines })));

  const lines: Row[] = [];
  for (const employee of (empRes.data ?? []) as Row[]) {
    const contract = contractBy.get(String(employee.id));
    if (!contract) continue;
    const setting = settingBy.get(String(employee.id)) ?? {};
    const manual = mergeMoney(savedManual.get(String(employee.id)), adjustments.get(String(employee.id)));
    const recItems = recurring.get(String(employee.id)) ?? [];
    // เก็บยอดค่าประจำแยกคอลัมน์ (recurring_*) แล้วค่อยรวมเข้า allowance/other — ตรงลำดับ worker.js 1830-1833
    manual.recurring_earning_amount = sumRecurring(recItems, "earning");
    manual.recurring_deduction_amount = sumRecurring(recItems, "deduction");
    manual.allowance_amount = money(manual.allowance_amount) + money(manual.recurring_earning_amount);
    manual.other_deduction = money(manual.other_deduction) + money(manual.recurring_deduction_amount);
    manual.mid_month_paid = money(manual.mid_month_paid) + money(midMonth.get(String(employee.id)));
    lines.push(buildLine(period, employee, contract, setting, manual));
  }
  return { lines, period, recurring_items: Array.from(recurring.values()).flat() };
}
