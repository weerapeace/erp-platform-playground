/**
 * Payroll module — สรุปข้อมูลคำนวณรายคนต่องวด (Phase A — Manual Inputs)
 * GET /api/payroll/manual-input?period_id=...
 *
 * คืนรายชื่อพนักงานที่เข้าเงื่อนไขของงวด + ยอดสรุปรายคน (สาย/ขาด/ลา/OT/งานเหมา/เพิ่มพิเศษ/หักอื่น)
 * + "สุทธิประมาณ" ที่คิดด้วยเครื่องคำนวณตัวจริง (computePeriodPreview) → ประมาณ = ของจริง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardPayroll } from "@/lib/payroll-auth";
import { computePeriodPreview } from "@/lib/payroll-calc-engine";
import { money } from "@/lib/payroll-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MANUAL = new Set(["approved", "review", "draft"]);

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const periodId = req.nextUrl.searchParams.get("period_id");
  if (!periodId) return NextResponse.json({ error: "ต้องระบุ period_id" }, { status: 400 });

  try {
    const a = supabaseAdmin();
    const { data: pdata } = await a.from("payroll_periods").select("id, period_name, status, default_work_days, default_hours_per_day").eq("id", periodId).limit(1);
    const period = pdata?.[0] as { id: string; period_name: string; status: string; default_work_days?: number | null; default_hours_per_day?: number | null } | undefined;
    if (!period) return NextResponse.json({ error: "ไม่พบงวด" }, { status: 404 });

    // เครื่องคำนวณจริง → รายชื่อพนักงานที่เข้าเงื่อนไข + สุทธิประมาณ + วันทำงาน
    const { lines, recurring_items } = await computePeriodPreview(periodId);

    // ยอดดิบรายคน (สำหรับคอลัมน์แสดงผล)
    const [attRes, leaveRes, otRes, adjRes] = await Promise.all([
      a.from("attendance_entries").select("employee_id, late_minutes, late_deduction, absence_hours, absence_deduction, status").eq("payroll_period_id", periodId),
      a.from("leave_entries").select("employee_id, days, hours, unpaid_leave_deduction, status").eq("payroll_period_id", periodId),
      a.from("overtime_entries").select("employee_id, hours, overtime_amount, status").eq("payroll_period_id", periodId),
      a.from("payroll_adjustments").select("employee_id, adjustment_type, amount, status, source_type, item_code").eq("payroll_period_id", periodId).eq("status", "approved"),
    ]);
    const add = (m: Map<string, number>, id: string, v: unknown) => m.set(id, (m.get(id) ?? 0) + money(v));
    const hoursPerDay = money(period.default_hours_per_day) || 8;
    const workDaysBase = money(period.default_work_days) || 26;
    const basePayMinutes = Math.round(workDaysBase * hoursPerDay * 60);
    const lateBy = new Map<string, number>(), absBy = new Map<string, number>(), leaveBy = new Map<string, number>();
    const otBy = new Map<string, number>(), pieceBy = new Map<string, number>(), addBy = new Map<string, number>(), dedBy = new Map<string, number>();
    const lateMinBy = new Map<string, number>(), absHoursBy = new Map<string, number>(), leaveDaysBy = new Map<string, number>(), leaveHoursBy = new Map<string, number>(), otHoursBy = new Map<string, number>();
    const cntBy = new Map<string, number>();
    for (const r of (attRes.data ?? []) as Record<string, unknown>[]) if (MANUAL.has(String(r.status))) {
      add(lateBy, String(r.employee_id), r.late_deduction); add(absBy, String(r.employee_id), r.absence_deduction);
      add(lateMinBy, String(r.employee_id), r.late_minutes); add(absHoursBy, String(r.employee_id), r.absence_hours);
      cntBy.set(String(r.employee_id), (cntBy.get(String(r.employee_id)) ?? 0) + 1);
    }
    for (const r of (leaveRes.data ?? []) as Record<string, unknown>[]) if (MANUAL.has(String(r.status))) {
      add(leaveBy, String(r.employee_id), r.unpaid_leave_deduction);
      add(leaveDaysBy, String(r.employee_id), r.days);
      add(leaveHoursBy, String(r.employee_id), r.hours);
      cntBy.set(String(r.employee_id), (cntBy.get(String(r.employee_id)) ?? 0) + 1);
    }
    for (const r of (otRes.data ?? []) as Record<string, unknown>[]) if (MANUAL.has(String(r.status))) {
      add(otBy, String(r.employee_id), r.overtime_amount);
      add(otHoursBy, String(r.employee_id), r.hours);
      cntBy.set(String(r.employee_id), (cntBy.get(String(r.employee_id)) ?? 0) + 1);
    }
    for (const r of (adjRes.data ?? []) as Record<string, unknown>[]) {
      if (String(r.adjustment_type) === "deduction") add(dedBy, String(r.employee_id), r.amount);
      else if (String(r.source_type) === "piecework" || String(r.item_code) === "PIECEWORK") add(pieceBy, String(r.employee_id), r.amount);
      else if (String(r.adjustment_type) === "earning") add(addBy, String(r.employee_id), r.amount);
    }

    // ชื่อ + สถานะพนักงาน
    const empIds = lines.map((l) => String(l.employee_id));
    const nameBy: Record<string, string> = {};
    if (empIds.length) {
      const { data: emps } = await a.from("employees").select("id, first_name, last_name, nickname").in("id", empIds);
      (emps ?? []).forEach((e) => {
        const r = e as { id: string; first_name: string; last_name: string | null; nickname: string | null };
        nameBy[r.id] = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() + (r.nickname ? ` (${r.nickname})` : "");
      });
    }

    const rows = lines.map((l) => {
      const id = String(l.employee_id);
      const late = lateBy.get(id) ?? 0, absence = absBy.get(id) ?? 0, leave = leaveBy.get(id) ?? 0;
      const ot = otBy.get(id) ?? 0, piecework = pieceBy.get(id) ?? 0, special = addBy.get(id) ?? 0, other = dedBy.get(id) ?? 0;
      const lateMinutes = lateMinBy.get(id) ?? 0;
      const absenceHours = absHoursBy.get(id) ?? 0;
      const leaveHours = leaveHoursBy.get(id) ?? (leaveDaysBy.get(id) ?? 0) * hoursPerDay;
      const deductedMinutes = Math.round((absenceHours + leaveHours) * 60 + lateMinutes);
      const paidMinutes = Math.max(basePayMinutes - deductedMinutes, 0);
      const hasManual = late || absence || leave || ot || piecework || special || other;
      return {
        id, employee_id: id, employee_code: l.employee_code, employee_name: nameBy[id] ?? "",
        contract_type: l.contract_type ?? null,
        wage_type: l.wage_type ?? null,
        work_days: money(l.attendance_days),
        hours_per_day: hoursPerDay,
        paid_minutes: paidMinutes,
        base_pay_minutes: basePayMinutes,
        deducted_pay_minutes: deductedMinutes,
        late_baht: Math.round(late * 100) / 100,
        late_minutes: Math.round(lateMinutes * 100) / 100,
        absence_baht: Math.round(absence * 100) / 100,
        absence_days: Math.round(((absenceHours / hoursPerDay) || 0) * 100) / 100,
        absence_hours: Math.round(absenceHours * 100) / 100,
        leave_baht: Math.round(leave * 100) / 100,
        leave_days: Math.round((leaveDaysBy.get(id) ?? 0) * 100) / 100,
        leave_hours: Math.round(leaveHours * 100) / 100,
        ot_baht: Math.round(ot * 100) / 100,
        ot_hours: Math.round((otHoursBy.get(id) ?? 0) * 100) / 100,
        piecework_baht: Math.round(piecework * 100) / 100,
        special_add: Math.round(special * 100) / 100,
        other_deduct: Math.round(other * 100) / 100,
        social_security_baht: money(l.social_security_employee),
        withholding_tax_baht: money(l.withholding_tax),
        system_deduct_baht: Math.round((money(l.social_security_employee) + money(l.withholding_tax)) * 100) / 100,
        net_estimate: money(l.net_pay),
        has_manual: !!hasManual,
        entry_count: cntBy.get(id) ?? 0,
      };
    }).sort((x, y) => String(x.employee_code).localeCompare(String(y.employee_code)));

    return NextResponse.json({ period_name: period.period_name, period_status: period.status, count: rows.length, data: rows, recurring_items, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}
