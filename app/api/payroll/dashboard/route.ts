/**
 * Payroll module — Dashboard summary API (read-only) / Phase 4
 * GET /api/payroll/dashboard → ตัวเลขสรุปภาพรวม
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function count(table: string, eq?: [string, string]): Promise<number> {
  let q = supabaseAdmin().from(table).select("id", { count: "exact", head: true });
  if (eq) q = q.eq(eq[0], eq[1]);
  const { count } = await q;
  return count ?? 0;
}

export async function GET() {
  try {
    const [
      employeesTotal, employeesActive, contractsActive,
      periodsTotal, payslips, paymentBatches, payrollLines, requestsPending,
    ] = await Promise.all([
      count("employees"),
      count("employees", ["employment_status", "active"]),
      count("employee_contracts", ["status", "active"]),
      count("payroll_periods"),
      count("payroll_payslips"),
      count("payment_batches"),
      count("payroll_lines"),
      count("employee_portal_requests", ["status", "pending"]),
    ]);

    // งวดล่าสุด
    const { data: latest } = await supabaseAdmin()
      .from("payroll_periods").select("period_name, status, start_date")
      .order("start_date", { ascending: false }).limit(1);

    return NextResponse.json({
      data: {
        employeesTotal, employeesActive, contractsActive,
        periodsTotal, payslips, paymentBatches, payrollLines, requestsPending,
        latestPeriod: latest?.[0] ?? null,
      },
      error: null,
    });
  } catch (e) {
    return NextResponse.json({ data: null, error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}
