/**
 * ตัวโหลดข้อมูลหน้า "ตรวจทั้งงวด" (server-only) — อ่านอย่างเดียว ไม่เขียน DB
 * ดึงผลคำนวณที่บันทึก + รายการต้นทางทั้งหมดของงวด + คำนวณสดเทียบ แล้วส่งให้ buildPeriodRecheck
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { computePeriodPreview } from "@/lib/payroll-calc-engine";
import { validatePayrollPeriod } from "@/lib/payroll-validation";
import { buildPeriodRecheck, type PeriodRecheck } from "@/lib/payroll-period-recheck";

type Row = Record<string, unknown>;

export async function loadPeriodRecheck(periodId: string): Promise<PeriodRecheck> {
  const a = supabaseAdmin();
  const [preview, validation, runRes] = await Promise.all([
    computePeriodPreview(periodId).catch(() => null),
    validatePayrollPeriod(periodId).catch(() => null),
    a.from("payroll_runs").select("id, run_no, calculated_at, created_at").eq("payroll_period_id", periodId).order("run_no", { ascending: false }).limit(1),
  ]);
  if (runRes.error) throw new Error(runRes.error.message);
  const run = (runRes.data?.[0] ?? null) as Row | null;

  let period = preview?.period ?? null;
  if (!period) {
    const { data, error } = await a.from("payroll_periods").select("*, payroll_period_holidays(*)").eq("id", periodId).limit(1);
    if (error) throw new Error(error.message);
    period = (data?.[0] as Row) ?? null;
  }
  if (!period) throw new Error("ไม่พบงวดเงินเดือน");

  let savedLines: Row[] = [];
  if (run) {
    const { data, error } = await a.from("payroll_lines").select("*").eq("payroll_run_id", String(run.id));
    if (error) throw new Error(error.message);
    savedLines = (data ?? []) as Row[];
  }
  const liveLines = preview?.lines ?? null;
  const empIds = [...new Set([...savedLines, ...(liveLines ?? [])].map((l) => String(l.employee_id)))];
  const none = Promise.resolve({ data: [] as Row[], error: null });

  const [empRes, setRes, attRes, leaveRes, otRes, advRes, adjRes, recRes, batchRes] = await Promise.all([
    empIds.length ? a.from("employees").select("id, employee_code, first_name, last_name, nickname").in("id", empIds) : none,
    empIds.length ? a.from("employee_payroll_settings").select("*").in("employee_id", empIds) : none,
    a.from("attendance_entries").select("*").eq("payroll_period_id", periodId),
    a.from("leave_entries").select("*").eq("payroll_period_id", periodId),
    a.from("overtime_entries").select("*").eq("payroll_period_id", periodId),
    a.from("advance_payments").select("*").eq("payroll_period_id", periodId),
    a.from("payroll_adjustments").select("*").eq("payroll_period_id", periodId),
    empIds.length ? a.from("employee_recurring_pay_items").select("*").eq("status", "active").lte("start_date", String(period.end_date)).in("employee_id", empIds) : none,
    a.from("payment_batches").select("*, payment_batch_lines(*)").eq("payroll_period_id", periodId),
  ]);
  for (const r of [empRes, setRes, attRes, leaveRes, otRes, advRes, adjRes, recRes, batchRes]) if (r.error) throw new Error(r.error.message);

  return buildPeriodRecheck({
    period, run, savedLines, liveLines,
    employees: new Map(((empRes.data ?? []) as Row[]).map((e) => [String(e.id), e])),
    contracts: preview?.contracts ?? new Map(),
    settings: new Map(((setRes.data ?? []) as Row[]).map((s) => [String(s.employee_id), s])),
    attendance: (attRes.data ?? []) as Row[],
    leave: (leaveRes.data ?? []) as Row[],
    overtime: (otRes.data ?? []) as Row[],
    advances: (advRes.data ?? []) as Row[],
    adjustments: (adjRes.data ?? []) as Row[],
    recurring: (recRes.data ?? []) as Row[],
    batches: (batchRes.data ?? []) as Row[],
    validationIssues: validation?.issues,
  });
}
