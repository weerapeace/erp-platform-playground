import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";
import { money } from "@/lib/payroll-calc";
import { payableWorkDays } from "@/lib/payroll-calc-engine";
import {
  normalizePayslipPrintLanguage,
  payslipLanguageForEmployee,
  uniquePayslipIds,
} from "@/lib/payroll-payslip-print";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SLIP_COLS = [
  "id",
  "payslip_no",
  "employee_id",
  "payroll_period_id",
  "payroll_line_id",
  "gross_pay",
  "total_deduction",
  "net_pay",
  "status",
  "slip_type",
  "issued_at",
  "payload",
].join(", ");

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function asObject(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function fullName(row: Row): string {
  return [row.first_name, row.last_name].map(text).filter(Boolean).join(" ") || text(row.nickname) || text(row.employee_code);
}

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req);
  if (denied) return denied;

  const periodId = text(req.nextUrl.searchParams.get("period_id"));
  if (!periodId) return NextResponse.json({ error: "ต้องระบุ period_id" }, { status: 400 });

  const requestedLanguage = normalizePayslipPrintLanguage(req.nextUrl.searchParams.get("lang"));
  const ids = uniquePayslipIds((req.nextUrl.searchParams.get("ids") ?? "").split(",")).slice(0, 200);

  let userId: string | null = null;
  let actorName: string | null = null;
  try {
    const { data } = await supabaseFromRequest(req).auth.getUser();
    userId = data.user?.id ?? null;
    actorName = data.user?.email ?? null;
  } catch {
    // Audit is best effort, same as the shared audit helper.
  }

  try {
    const admin = supabaseAdmin();
    const { data: periodRows } = await admin
      .from("payroll_periods")
      .select("id, period_name, status, start_date, end_date, default_work_days, default_hours_per_day, payroll_period_holidays(holiday_date)")
      .eq("id", periodId)
      .limit(1);
    const period = periodRows?.[0] as Row | undefined;
    if (!period) return NextResponse.json({ error: "ไม่พบงวดเงินเดือน" }, { status: 404 });

    let slipQuery = admin.from("payroll_payslips").select(SLIP_COLS).eq("payroll_period_id", periodId);
    if (ids.length) slipQuery = slipQuery.in("id", ids);
    const { data: slipRows, error: slipError } = await slipQuery;
    if (slipError) throw slipError;

    const slips = ((slipRows ?? []) as unknown as Row[]).sort((a, b) => text(a.payslip_no).localeCompare(text(b.payslip_no)));
    const empIds = uniquePayslipIds(slips.map((s) => s.employee_id));
    const employeesById: Record<string, Row> = {};
    const banksByEmployeeId: Record<string, Row> = {};

    if (empIds.length) {
      const { data: empRows } = await admin
        .from("employees")
        .select("id, employee_code, first_name, last_name, nickname, payslip_language")
        .in("id", empIds);
      (empRows ?? []).forEach((emp) => {
        const row = emp as Row;
        employeesById[text(row.id)] = row;
      });

      const { data: bankRows } = await admin
        .from("employee_bank_accounts")
        .select("employee_id, bank_name, bank_branch, account_no, account_name, is_primary")
        .in("employee_id", empIds)
        .order("is_primary", { ascending: false });
      (bankRows ?? []).forEach((bank) => {
        const row = bank as Row;
        const employeeId = text(row.employee_id);
        if (employeeId && !banksByEmployeeId[employeeId]) banksByEmployeeId[employeeId] = row;
      });
    }

    // วันทำงานจริง (paid_minutes) แบบเดียวกับหน้าคำนวณ: ฐานวันทำงานตามสัญญา − ขาด/ลา/สาย
    const hoursPerDay = money(period.default_hours_per_day) || 8;
    const baseFlat = Math.round((money(period.default_work_days) || 26) * hoursPerDay * 60);
    const paidMinBy: Record<string, number> = {};
    if (empIds.length) {
      const [conRes, attRes, lvRes] = await Promise.all([
        admin.from("employee_contracts").select("employee_id, work_schedule_id, start_date, end_date").in("employee_id", empIds).eq("is_current", true).eq("status", "active"),
        admin.from("attendance_entries").select("employee_id, late_minutes, absence_hours").eq("payroll_period_id", periodId),
        admin.from("leave_entries").select("employee_id, days, hours").eq("payroll_period_id", periodId),
      ]);
      const conBy: Record<string, Row> = {};
      (conRes.data ?? []).forEach((c) => { conBy[text((c as Row).employee_id)] = c as Row; });
      const lateBy: Record<string, number> = {}, absBy: Record<string, number> = {}, lvBy: Record<string, number> = {};
      (attRes.data ?? []).forEach((r) => { const id = text((r as Row).employee_id); lateBy[id] = (lateBy[id] ?? 0) + money((r as Row).late_minutes); absBy[id] = (absBy[id] ?? 0) + money((r as Row).absence_hours); });
      (lvRes.data ?? []).forEach((r) => { const id = text((r as Row).employee_id); lvBy[id] = (lvBy[id] ?? 0) + (money((r as Row).hours) || money((r as Row).days) * hoursPerDay); });
      empIds.forEach((id) => {
        const con = conBy[id] ?? {};
        const excluded = Math.max(payableWorkDays(period, { work_schedule_id: con.work_schedule_id }) - payableWorkDays(period, con), 0);
        const empBase = Math.max(baseFlat - Math.round(excluded * hoursPerDay * 60), 0);
        const deducted = Math.round(((absBy[id] ?? 0) + (lvBy[id] ?? 0)) * 60 + (lateBy[id] ?? 0));
        paidMinBy[id] = Math.max(empBase - deducted, 0);
      });
    }

    await writeAudit(admin, {
      action: "print_payslips",
      entityType: "payroll_periods",
      entityId: periodId,
      actorId: userId,
      actorName,
      metadata: {
        period_name: period.period_name,
        requested_language: requestedLanguage,
        selected_count: ids.length,
        printed_count: slips.length,
      },
    });

    return NextResponse.json({
      data: {
        period: {
          id: period.id,
          period_name: period.period_name,
          status: period.status,
          start_date: period.start_date,
          end_date: period.end_date,
        },
        requested_language: requestedLanguage,
        slips: slips.map((slip) => {
          const employeeId = text(slip.employee_id);
          const employee = employeesById[employeeId] ?? {};
          const bank = banksByEmployeeId[employeeId] ?? {};
          const payload = asObject(slip.payload);
          const line = asObject(payload.line);
          const run = asObject(payload.run);

          return {
            id: slip.id,
            payslip_no: slip.payslip_no,
            employee_id: employeeId,
            employee_code: text(employee.employee_code),
            employee_name: fullName(employee),
            nickname: text(employee.nickname),
            payslip_language: payslipLanguageForEmployee(requestedLanguage, employee.payslip_language),
            bank_name: text(bank.bank_name),
            bank_branch: text(bank.bank_branch),
            bank_account_no: text(bank.account_no),
            bank_account_name: text(bank.account_name),
            gross_pay: money(slip.gross_pay),
            total_deduction: money(slip.total_deduction),
            net_pay: money(slip.net_pay),
            paid_minutes: paidMinBy[employeeId] ?? null,
            status: slip.status,
            slip_type: slip.slip_type,
            issued_at: slip.issued_at,
            run_no: run.run_no ?? line.payroll_run_no ?? null,
            line,
          };
        }),
      },
      error: null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดข้อมูลพิมพ์สลิปไม่สำเร็จ" }, { status: 500 });
  }
}
