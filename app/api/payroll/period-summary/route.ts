/**
 * Payroll module — สรุปผลเงินเดือนทั้งงวด (อ่านอย่างเดียว) — หน้า "ตรวจสอบเงินเดือน"
 * GET /api/payroll/period-summary?period_id=...&run_id=...
 *
 * คืนยอดรวมทั้งงวด (จำนวนคน/รายได้/หัก/ปกส./ภาษี/สุทธิ) + บรรทัดรายคน ของ "รอบคำนวณล่าสุด"
 * (หรือรอบที่ระบุ) — ต่างจากตารางกลางที่รวมได้แค่หน้าปัจจุบัน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardPayroll } from "@/lib/payroll-auth";
import { money } from "@/lib/payroll-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LINE_COLS = "id, employee_id, payroll_run_id, base_salary, gross_pay, total_deduction, social_security_employee, withholding_tax, net_pay, attendance_days, attendance_hours, recurring_earning_amount, recurring_deduction_amount, late_deduction, absence_deduction, unpaid_leave_deduction, overtime_amount, other_deduction, allowance_amount, bonus_amount, commission_amount, status";

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const periodId = req.nextUrl.searchParams.get("period_id");
  const runIdParam = req.nextUrl.searchParams.get("run_id");
  if (!periodId) return NextResponse.json({ error: "ต้องระบุ period_id" }, { status: 400 });

  try {
    const a = supabaseAdmin();
    const { data: pdata } = await a.from("payroll_periods").select("id, period_name, status, default_work_days, default_hours_per_day").eq("id", periodId).limit(1);
    const period = pdata?.[0] as { id: string; period_name: string; status: string; default_work_days?: number | null; default_hours_per_day?: number | null } | undefined;
    if (!period) return NextResponse.json({ error: "ไม่พบงวด" }, { status: 404 });

    // รอบคำนวณของงวดนี้ (ใหม่ → เก่า)
    const { data: runs } = await a.from("payroll_runs")
      .select("id, run_no, status, calculated_at").eq("payroll_period_id", periodId).order("run_no", { ascending: false });
    const runList = (runs ?? []) as { id: string; run_no: number; status: string; calculated_at: string | null }[];
    const run = runIdParam ? runList.find((r) => r.id === runIdParam) ?? runList[0] : runList[0];

    // บรรทัดของรอบที่เลือก (ถ้าไม่มี run ก็ดึงทั้งงวด — เผื่อข้อมูลเก่า)
    let lq = a.from("payroll_lines").select(LINE_COLS).eq("payroll_period_id", periodId);
    if (run) lq = lq.eq("payroll_run_id", run.id);
    const { data: lineRows } = await lq;
    const lines = (lineRows ?? []) as Record<string, unknown>[];

    // ชื่อพนักงาน
    const empIds = [...new Set(lines.map((l) => String(l.employee_id)))];
    const nameBy: Record<string, string> = {}; const codeBy: Record<string, string> = {};
    if (empIds.length) {
      const { data: emps } = await a.from("employees").select("id, employee_code, first_name, last_name, nickname").in("id", empIds);
      (emps ?? []).forEach((e) => {
        const r = e as { id: string; employee_code: string; first_name: string; last_name: string | null; nickname: string | null };
        codeBy[r.id] = r.employee_code;
        nameBy[r.id] = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() + (r.nickname ? ` (${r.nickname})` : "");
      });
    }

    // วันจ่ายจริงแบบ "วัน/ชม./นาที" (paid_minutes) — คิดเหมือนหน้าข้อมูลคำนวณ: ฐานวันทำงาน − (ขาด+ลา+สาย)
    const hoursPerDay = money(period.default_hours_per_day) || 8;
    const basePayMinutes = Math.round((money(period.default_work_days) || 26) * hoursPerDay * 60);
    const paidMinBy: Record<string, number> = {};
    if (empIds.length) {
      const lateMinBy: Record<string, number> = {}, absHrBy: Record<string, number> = {}, lvHrBy: Record<string, number> = {};
      const [attRes, lvRes] = await Promise.all([
        a.from("attendance_entries").select("employee_id, late_minutes, absence_hours").eq("payroll_period_id", periodId),
        a.from("leave_entries").select("employee_id, days, hours").eq("payroll_period_id", periodId),
      ]);
      (attRes.data ?? []).forEach((r) => { const id = String((r as Record<string, unknown>).employee_id); lateMinBy[id] = (lateMinBy[id] ?? 0) + money((r as Record<string, unknown>).late_minutes); absHrBy[id] = (absHrBy[id] ?? 0) + money((r as Record<string, unknown>).absence_hours); });
      (lvRes.data ?? []).forEach((r) => { const id = String((r as Record<string, unknown>).employee_id); const h = money((r as Record<string, unknown>).hours) || money((r as Record<string, unknown>).days) * hoursPerDay; lvHrBy[id] = (lvHrBy[id] ?? 0) + h; });
      empIds.forEach((id) => {
        const deducted = Math.round(((absHrBy[id] ?? 0) + (lvHrBy[id] ?? 0)) * 60 + (lateMinBy[id] ?? 0));
        paidMinBy[id] = Math.max(basePayMinutes - deducted, 0);
      });
    }

    const sum = (k: string) => lines.reduce((t, l) => t + money(l[k]), 0);
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const totals = {
      count: lines.length,
      gross_pay: round2(sum("gross_pay")),
      total_deduction: round2(sum("total_deduction")),
      social_security_employee: round2(sum("social_security_employee")),
      withholding_tax: round2(sum("withholding_tax")),
      net_pay: round2(sum("net_pay")),
    };
    const issueCounts = {
      negative_net: lines.filter((l) => money(l.net_pay) < 0).length,
      high_deduction: lines.filter((l) => money(l.gross_pay) > 0 && money(l.total_deduction) / money(l.gross_pay) >= 0.5).length,
      missing_base: lines.filter((l) => money(l.base_salary) <= 0 && money(l.gross_pay) <= 0).length,
      zero_work_days: lines.filter((l) => money(l.attendance_days) <= 0).length,
      has_recurring: lines.filter((l) => money(l.recurring_earning_amount) > 0 || money(l.recurring_deduction_amount) > 0).length,
    };

    const data = lines
      .map((l) => ({
        id: l.id,
        employee_code: codeBy[String(l.employee_id)] ?? "",
        employee_name: nameBy[String(l.employee_id)] ?? "",
        base_salary: money(l.base_salary),
        gross_pay: money(l.gross_pay),
        total_deduction: money(l.total_deduction),
        social_security_employee: money(l.social_security_employee),
        withholding_tax: money(l.withholding_tax),
        net_pay: money(l.net_pay),
        attendance_days: money(l.attendance_days),
        attendance_hours: money(l.attendance_hours),
        paid_minutes: paidMinBy[String(l.employee_id)] ?? null,
        recurring_earning_amount: money(l.recurring_earning_amount),
        recurring_deduction_amount: money(l.recurring_deduction_amount),
        late_deduction: money(l.late_deduction),
        absence_deduction: money(l.absence_deduction),
        unpaid_leave_deduction: money(l.unpaid_leave_deduction),
        overtime_amount: money(l.overtime_amount),
        other_deduction: money(l.other_deduction),
        allowance_amount: money(l.allowance_amount),
        bonus_amount: money(l.bonus_amount),
        commission_amount: money(l.commission_amount),
        status: l.status,
        issue_flags: [
          money(l.net_pay) < 0 ? "negative_net" : null,
          money(l.gross_pay) > 0 && money(l.total_deduction) / money(l.gross_pay) >= 0.5 ? "high_deduction" : null,
          money(l.base_salary) <= 0 && money(l.gross_pay) <= 0 ? "missing_base" : null,
          money(l.attendance_days) <= 0 ? "zero_work_days" : null,
          money(l.recurring_earning_amount) > 0 || money(l.recurring_deduction_amount) > 0 ? "has_recurring" : null,
        ].filter(Boolean),
      }))
      .sort((x, y) => x.employee_code.localeCompare(y.employee_code));

    return NextResponse.json({
      period_name: period.period_name, period_status: period.status,
      run: run ? { id: run.id, run_no: run.run_no, status: run.status, calculated_at: run.calculated_at } : null,
      runs: runList.map((r) => ({ id: r.id, run_no: r.run_no, calculated_at: r.calculated_at })),
      totals, issue_counts: issueCounts, data, error: null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}
