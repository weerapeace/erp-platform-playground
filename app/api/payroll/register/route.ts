import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";
import { money, roundMoney } from "@/lib/payroll-calc";
import { computePayrollRegisterAmounts, formatThaiNationalId } from "@/lib/payroll-register-print";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;

const COMPANY_NAME = "ห้างหุ้นส่วนจำกัด ไอ.เอส.จี. เทรดดิ้ง";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function fullName(row: Row): string {
  return [row.first_name, row.last_name].map(text).filter(Boolean).join(" ")
    || text(row.nickname)
    || text(row.employee_code);
}

function identityNo(row: Row): string {
  return formatThaiNationalId(text(row.national_id) || text(row.passport_no));
}

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req);
  if (denied) return denied;

  const periodId = text(req.nextUrl.searchParams.get("period_id"));
  if (!periodId) return NextResponse.json({ error: "ต้องระบุ period_id" }, { status: 400 });

  let userId: string | null = null;
  let actorName: string | null = null;
  try {
    const { data } = await supabaseFromRequest(req).auth.getUser();
    userId = data.user?.id ?? null;
    actorName = data.user?.email ?? null;
  } catch {
    // Audit is best effort.
  }

  try {
    const admin = supabaseAdmin();
    const { data: periodRows, error: periodError } = await admin
      .from("payroll_periods")
      .select("id, period_name, status, start_date, end_date")
      .eq("id", periodId)
      .limit(1);
    if (periodError) throw periodError;
    const period = periodRows?.[0] as Row | undefined;
    if (!period) return NextResponse.json({ error: "ไม่พบงวดเงินเดือน" }, { status: 404 });

    const { data: runRows, error: runError } = await admin
      .from("payroll_runs")
      .select("id, run_no, calculated_at")
      .eq("payroll_period_id", periodId)
      .order("run_no", { ascending: false })
      .limit(1);
    if (runError) throw runError;
    const run = runRows?.[0] as Row | undefined;

    let lineQuery = admin.from("payroll_lines").select("*").eq("payroll_period_id", periodId);
    if (run?.id) lineQuery = lineQuery.eq("payroll_run_id", run.id);
    const { data: lineRows, error: lineError } = await lineQuery;
    if (lineError) throw lineError;
    const lines = (lineRows ?? []) as Row[];

    const empIds = [...new Set(lines.map((line) => text(line.employee_id)).filter(Boolean))];
    const employeesById: Record<string, Row> = {};

    if (empIds.length) {
      const { data: empRows, error: empError } = await admin
        .from("employees")
        .select("id, employee_code, first_name, last_name, nickname, national_id, passport_no")
        .in("id", empIds);
      if (empError) throw empError;
      (empRows ?? []).forEach((emp) => {
        const row = emp as Row;
        employeesById[text(row.id)] = row;
      });
    }

    const rows = lines
      .map((line) => {
        const employeeId = text(line.employee_id);
        const employee = employeesById[employeeId] ?? {};
        const amounts = computePayrollRegisterAmounts(line);

        return {
          id: text(line.id),
          employee_id: employeeId,
          employee_code: text(employee.employee_code),
          employee_name: fullName(employee),
          nickname: text(employee.nickname),
          identity_no: identityNo(employee),
          ...amounts,
        };
      })
      .sort((a, b) => a.employee_code.localeCompare(b.employee_code, "th", { numeric: true }));

    const total = (key: keyof typeof rows[number]) => rows.reduce((sum, row) => sum + money(row[key]), 0);
    const totals = {
      count: rows.length,
      base_salary: roundMoney(total("base_salary")),
      mid_month_paid: roundMoney(total("mid_month_paid")),
      month_end_pay: roundMoney(total("month_end_pay")),
      transfer_net_pay: roundMoney(total("transfer_net_pay")),
      overtime_amount: roundMoney(total("overtime_amount")),
      cash_pay: roundMoney(total("cash_pay")),
      social_security: roundMoney(total("social_security")),
      balance: roundMoney(total("balance")),
    };

    await writeAudit(admin, {
      action: "preview_payroll_register",
      entityType: "payroll_periods",
      entityId: periodId,
      actorId: userId,
      actorName,
      metadata: {
        period_name: period.period_name,
        run_id: run?.id ?? null,
        run_no: run?.run_no ?? null,
        row_count: rows.length,
      },
    });

    return NextResponse.json({
      data: {
        company_name: COMPANY_NAME,
        period: {
          id: period.id,
          period_name: period.period_name,
          status: period.status,
          start_date: period.start_date,
          end_date: period.end_date,
        },
        run: run ? { id: run.id, run_no: run.run_no, calculated_at: run.calculated_at } : null,
        rows,
        totals,
      },
      error: null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดทะเบียนเงินเดือนไม่สำเร็จ" }, { status: 500 });
  }
}
