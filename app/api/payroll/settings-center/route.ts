import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PeriodRow = {
  id: string;
  period_name: string;
  status: string;
  start_date: string;
  end_date: string;
  default_work_days: number | null;
  default_hours_per_day: number | null;
  locked_at: string | null;
  paid_at: string | null;
};

async function countRows(table: string) {
  const { count, error } = await supabaseAdmin()
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req);
  if (denied) return denied;

  try {
    const a = supabaseAdmin();
    const [
      periodRes,
      employeeSettings,
      appSettings,
      attendanceEntries,
      leaveEntries,
      overtimeEntries,
      paymentBatches,
      payslips,
      payrollRuns,
    ] = await Promise.all([
      a
        .from("payroll_periods")
        .select("id, period_name, status, start_date, end_date, default_work_days, default_hours_per_day, locked_at, paid_at")
        .order("start_date", { ascending: false })
        .limit(1),
      countRows("employee_payroll_settings"),
      countRows("payroll_app_settings"),
      countRows("attendance_entries"),
      countRows("leave_entries"),
      countRows("overtime_entries"),
      countRows("payment_batches"),
      countRows("payslips"),
      countRows("payroll_runs"),
    ]);

    if (periodRes.error) throw new Error(periodRes.error.message);
    const latestPeriod = (periodRes.data?.[0] ?? null) as PeriodRow | null;

    return NextResponse.json({
      data: {
        latestPeriod,
        counts: {
          employeeSettings: employeeSettings.count,
          appSettings: appSettings.count,
          attendanceEntries: attendanceEntries.count,
          leaveEntries: leaveEntries.count,
          overtimeEntries: overtimeEntries.count,
          paymentBatches: paymentBatches.count,
          payslips: payslips.count,
          payrollRuns: payrollRuns.count,
        },
        readiness: {
          appRuleStorage: false,
          appRuleStorageReason: "payroll_app_settings ตอนนี้ใช้เก็บ admin password ของแอปเก่า ยังไม่มีช่อง value/json สำหรับกฎคำนวณกลาง",
          employeeSettingsReady: employeeSettings.count > 0,
          periodWorkflowReady: true,
          timestampImportReady: false,
          reportsReady: payslips.count > 0 || payrollRuns.count > 0,
          paymentBatchReady: paymentBatches.count > 0,
        },
      },
      error: null,
    });
  } catch (e) {
    return NextResponse.json(
      { data: null, error: e instanceof Error ? e.message : "โหลดศูนย์ตั้งค่า Payroll ไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
