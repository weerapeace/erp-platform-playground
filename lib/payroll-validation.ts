import { supabaseAdmin } from "@/lib/supabase-admin";
import { money } from "@/lib/payroll-calc";

type Row = Record<string, unknown>;

export type PayrollValidationIssue = {
  level: "error" | "warning";
  code: string;
  title: string;
  detail: string;
  count?: number;
};

export type PayrollValidationResult = {
  period_id: string;
  period_name: string;
  period_status: string;
  summary: {
    errors: number;
    warnings: number;
    active_employees: number;
    active_contracts: number;
    recurring_items: number;
  };
  issues: PayrollValidationIssue[];
  ready: boolean;
};

const EDITABLE_FOR_CALC = new Set(["draft", "review"]);
const isBlank = (v: unknown) => v == null || String(v).trim() === "";

function issue(level: PayrollValidationIssue["level"], code: string, title: string, detail: string, count?: number): PayrollValidationIssue {
  return { level, code, title, detail, ...(count != null ? { count } : {}) };
}

function wageProblem(contract: Row): string | null {
  const wageType = String(contract.wage_type ?? "monthly");
  if (wageType === "daily" && money(contract.daily_wage) <= 0) return "ค่าแรงรายวันว่างหรือเป็น 0";
  if (wageType === "hourly" && money(contract.hourly_wage) <= 0) return "ค่าแรงรายชั่วโมงว่างหรือเป็น 0";
  if (wageType !== "daily" && wageType !== "hourly" && money(contract.base_salary) <= 0) return "เงินเดือนฐานว่างหรือเป็น 0";
  return null;
}

export async function validatePayrollPeriod(periodId: string): Promise<PayrollValidationResult> {
  const admin = supabaseAdmin();
  const issues: PayrollValidationIssue[] = [];

  const { data: periodRows, error: periodError } = await admin
    .from("payroll_periods")
    .select("id, period_name, status, start_date, end_date, company_id, default_work_days, default_hours_per_day")
    .eq("id", periodId)
    .limit(1);
  if (periodError) throw new Error(periodError.message);
  const period = periodRows?.[0] as Row | undefined;
  if (!period) throw new Error("ไม่พบงวดเงินเดือน");

  const periodName = String(period.period_name ?? "");
  const periodStatus = String(period.status ?? "");
  const startDate = String(period.start_date ?? "");
  const endDate = String(period.end_date ?? "");
  const companyId = period.company_id ? String(period.company_id) : null;

  if (!EDITABLE_FOR_CALC.has(periodStatus)) {
    issues.push(issue("error", "period_status_locked", "สถานะงวดไม่พร้อมคำนวณ", `งวดสถานะ "${periodStatus}" ไม่ควรคำนวณ/บันทึกใหม่ ให้ใช้เฉพาะ draft หรือ review`));
  }
  if (!startDate || !endDate || startDate > endDate) {
    issues.push(issue("error", "invalid_period_dates", "วันที่งวดไม่ถูกต้อง", "ต้องมีวันที่เริ่มและสิ้นสุด และวันที่เริ่มต้องไม่มากกว่าวันสิ้นสุด"));
  }
  if (money(period.default_work_days) <= 0) {
    issues.push(issue("error", "missing_work_days", "วันทำงานของงวดว่าง", "ตั้งค่า default_work_days ให้มากกว่า 0 ก่อนคำนวณ"));
  }
  if (money(period.default_hours_per_day) <= 0) {
    issues.push(issue("error", "missing_hours_per_day", "ชั่วโมงต่อวันว่าง", "ตั้งค่า default_hours_per_day ให้มากกว่า 0 ก่อนคำนวณ"));
  }

  const [empRes, conRes, recRes, runRes] = await Promise.all([
    admin.from("employees").select("id, employee_code, first_name, employment_status").eq("employment_status", "active"),
    (() => {
      let q = admin.from("employee_contracts").select("id, employee_id, contract_no, status, is_current, company_id, wage_type, base_salary, daily_wage, hourly_wage")
        .eq("is_current", true).eq("status", "active");
      if (companyId) q = q.eq("company_id", companyId);
      return q;
    })(),
    admin.from("employee_recurring_pay_items").select("id, employee_id, contract_id, item_name, item_type, amount_per_period, calculation_method, quantity_default, rate_default, status, start_date, end_date")
      .eq("status", "active").lte("start_date", endDate || "9999-12-31"),
    admin.from("payroll_runs").select("id", { count: "exact", head: true }).eq("payroll_period_id", periodId),
  ]);
  if (empRes.error) throw new Error(empRes.error.message);
  if (conRes.error) throw new Error(conRes.error.message);
  if (recRes.error) throw new Error(recRes.error.message);
  if (runRes.error) throw new Error(runRes.error.message);

  const employees = (empRes.data ?? []) as Row[];
  const contracts = (conRes.data ?? []) as Row[];
  const recurring = ((recRes.data ?? []) as Row[]).filter((r) => !r.end_date || String(r.end_date) >= startDate);
  const contractByEmployee = new Map(contracts.map((c) => [String(c.employee_id), c]));

  if (contracts.length === 0) {
    issues.push(issue("error", "no_active_contracts", "ไม่พบสัญญาที่ใช้คำนวณ", "งวดนี้ไม่มีสัญญา active/current ที่ตรงบริษัทของงวด จึงคำนวณไม่ได้"));
  }

  const employeesWithoutContract = companyId
    ? employees.filter((e) => !contractByEmployee.has(String(e.id))).length
    : employees.filter((e) => !contractByEmployee.has(String(e.id))).length;
  if (employeesWithoutContract > 0) {
    issues.push(issue("warning", "employees_without_contract", "มีพนักงานไม่มีสัญญาปัจจุบัน", "คนกลุ่มนี้จะไม่ถูกนำไปคำนวณเงินเดือน", employeesWithoutContract));
  }

  const badWages = contracts.filter((c) => wageProblem(c));
  if (badWages.length > 0) {
    issues.push(issue("error", "invalid_contract_wage", "มีสัญญาที่ค่าแรงไม่พร้อม", "ตรวจเงินเดือนฐาน/ค่าแรงรายวัน/รายชั่วโมงในสัญญาพนักงาน", badWages.length));
  }

  const recurringNoEmployee = recurring.filter((r) => isBlank(r.employee_id)).length;
  if (recurringNoEmployee > 0) {
    issues.push(issue("error", "recurring_missing_employee", "มีรายการประจำที่ไม่ผูกพนักงาน", "รายการประจำต้องเลือกพนักงานก่อน จึงจะเข้าคำนวณได้", recurringNoEmployee));
  }

  const recurringNoContract = recurring.filter((r) => isBlank(r.contract_id)).length;
  if (recurringNoContract > 0) {
    issues.push(issue("warning", "recurring_missing_contract", "มีรายการประจำที่ยังไม่ผูกสัญญา", "ยังคำนวณได้ แต่ควรผูกสัญญาเพื่อให้ตรวจย้อนหลังชัดเจน", recurringNoContract));
  }

  const recurringBadAmount = recurring.filter((r) => {
    if (String(r.calculation_method ?? "fixed") === "fixed") return money(r.amount_per_period) <= 0;
    return money(r.quantity_default) <= 0 || money(r.rate_default) <= 0;
  }).length;
  if (recurringBadAmount > 0) {
    issues.push(issue("error", "recurring_invalid_amount", "มีรายการประจำยอดไม่ถูกต้อง", "ยอด/จำนวน/อัตราต้องมากกว่า 0", recurringBadAmount));
  }

  if ((runRes.count ?? 0) > 0) {
    issues.push(issue("warning", "existing_runs", "งวดนี้เคยคำนวณแล้ว", "ถ้าบันทึกอีกครั้ง ระบบจะสร้างรอบคำนวณใหม่ ไม่ลบของเดิม", runRes.count ?? 0));
  }

  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.filter((i) => i.level === "warning").length;
  return {
    period_id: periodId,
    period_name: periodName,
    period_status: periodStatus,
    summary: {
      errors,
      warnings,
      active_employees: employees.length,
      active_contracts: contracts.length,
      recurring_items: recurring.length,
    },
    issues,
    ready: errors === 0,
  };
}
