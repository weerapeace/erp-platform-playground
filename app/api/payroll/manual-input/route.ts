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
import { computePeriodPreview, payableWorkDays } from "@/lib/payroll-calc-engine";
import { shouldReceivePaidPeriodHoliday } from "@/lib/payroll-attendance-rules";
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
    const { data: pdata } = await a
      .from("payroll_periods")
      .select("id, period_name, status, company_id, start_date, end_date, default_work_days, default_hours_per_day, payroll_period_holidays(holiday_date)")
      .eq("id", periodId)
      .limit(1);
    const period = pdata?.[0] as {
      id: string; period_name: string; status: string; company_id?: string | null; start_date?: string | null; end_date?: string | null;
      default_work_days?: number | null; default_hours_per_day?: number | null;
      payroll_period_holidays?: { holiday_date?: string | null }[];
    } | undefined;
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
    const scannerCodeBy: Record<string, string | null> = {};
    const contractMetaBy: Record<string, Record<string, unknown>> = {};
    const companyPaidTaxBy: Record<string, boolean> = {};
    if (empIds.length) {
      let contractQuery = a.from("employee_contracts")
        .select("employee_id, contract_type, employment_type, wage_type, work_schedule_id, work_time_profile_id, attendance_scan_exempt, start_date, end_date")
        .in("employee_id", empIds)
        .eq("is_current", true)
        .eq("status", "active");
      if (period.company_id) contractQuery = contractQuery.eq("company_id", period.company_id);
      const [empsRes, settingsRes, contractsRes] = await Promise.all([
        a.from("employees").select("id, first_name, last_name, nickname, scanner_employee_code").in("id", empIds),
        a.from("employee_payroll_settings").select("employee_id, withholding_tax_company_paid").in("employee_id", empIds),
        contractQuery,
      ]);
      const emps = empsRes.data;
      (emps ?? []).forEach((e) => {
        const r = e as { id: string; first_name: string; last_name: string | null; nickname: string | null; scanner_employee_code?: string | null };
        nameBy[r.id] = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() + (r.nickname ? ` (${r.nickname})` : "");
        scannerCodeBy[r.id] = r.scanner_employee_code ?? null;
      });
      (settingsRes.data ?? []).forEach((s) => {
        const r = s as { employee_id: string; withholding_tax_company_paid: boolean | null };
        companyPaidTaxBy[r.employee_id] = r.withholding_tax_company_paid === true;
      });
      (contractsRes.data ?? []).forEach((c) => {
        const r = c as Record<string, unknown> & { employee_id: string };
        contractMetaBy[r.employee_id] = r;
      });
      // โปรไฟล์เวลาทำงาน (เข้า/พักเที่ยง/เลิกงาน) → ให้การคิดมาสายใช้เวลาเข้าตามโปรไฟล์ของแต่ละคน
      // (ออฟฟิศ 08:00 / โรงงาน 07:50) แทนค่ากลางตัวเดียว
      const profileIds = [...new Set(Object.values(contractMetaBy)
        .map((c) => c.work_time_profile_id).filter(Boolean) as string[])];
      if (profileIds.length) {
        const { data: profiles } = await a.from("work_time_profiles")
          .select("id, morning_check_in_cutoff, noon_check_in_cutoff, checkout_required_at, early_checkout_grace_minutes")
          .in("id", profileIds);
        const profileBy: Record<string, Record<string, unknown>> = {};
        (profiles ?? []).forEach((p) => { profileBy[(p as { id: string }).id] = p as Record<string, unknown>; });
        Object.values(contractMetaBy).forEach((c) => {
          const p = c.work_time_profile_id ? profileBy[c.work_time_profile_id as string] : null;
          if (p) c.work_time_profiles = p;
        });
      }
    }

    const rows = lines.map((l) => {
      const id = String(l.employee_id);
      const late = lateBy.get(id) ?? 0, absence = absBy.get(id) ?? 0, leave = leaveBy.get(id) ?? 0;
      const ot = otBy.get(id) ?? 0, piecework = pieceBy.get(id) ?? 0, special = addBy.get(id) ?? 0, other = dedBy.get(id) ?? 0;
      const lateMinutes = lateMinBy.get(id) ?? 0;
      const absenceHours = absHoursBy.get(id) ?? 0;
      const leaveHours = leaveHoursBy.get(id) ?? (leaveDaysBy.get(id) ?? 0) * hoursPerDay;
      const deductedMinutes = Math.round((absenceHours + leaveHours) * 60 + lateMinutes);
      // ฐานวันจ่ายจริง:
      //  - รายเดือน (ได้เงินวันหยุด): วันทำงานมาตรฐาน − วันนอกช่วงสัญญา (เข้า/ออกกลางงวด) · วันหยุดยังนับเป็นวันได้เงิน
      //  - รายวัน/รายชม. (ไม่ได้เงินวันหยุด): วันทำงานที่จ่ายได้จริง = ตัดวันหยุด + คลิปช่วงสัญญาแล้ว
      const cMeta = contractMetaBy[id] ?? {};
      let empBaseMinutes: number;
      if (shouldReceivePaidPeriodHoliday(cMeta)) {
        const excludedDays = Math.max(payableWorkDays(period, { work_schedule_id: cMeta.work_schedule_id }) - payableWorkDays(period, cMeta), 0);
        empBaseMinutes = Math.max(basePayMinutes - Math.round(excludedDays * hoursPerDay * 60), 0);
      } else {
        empBaseMinutes = Math.round(payableWorkDays(period, cMeta) * hoursPerDay * 60);
      }
      const paidMinutes = Math.max(empBaseMinutes - deductedMinutes, 0);
      const hasManual = late || absence || leave || ot || piecework || special || other;
      return {
        id, employee_id: id, employee_code: l.employee_code, employee_name: nameBy[id] ?? "",
        scanner_employee_code: scannerCodeBy[id] ?? null,
        contract_type: l.contract_type ?? null,
        employment_type: contractMetaBy[id]?.employment_type ?? null,
        wage_type: l.wage_type ?? null,
        work_schedule_id: contractMetaBy[id]?.work_schedule_id ?? null,
        work_time_profile_id: contractMetaBy[id]?.work_time_profile_id ?? null,
        work_time_profile: (contractMetaBy[id]?.work_time_profiles as Record<string, unknown> | undefined) ?? null,
        attendance_scan_exempt: contractMetaBy[id]?.attendance_scan_exempt === true,
        contract_start_date: contractMetaBy[id]?.start_date ?? null,
        contract_end_date: contractMetaBy[id]?.end_date ?? null,
        work_days: money(l.attendance_days),
        hours_per_day: hoursPerDay,
        paid_minutes: paidMinutes,
        base_pay_minutes: empBaseMinutes,
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
        mid_month_paid: money(l.mid_month_paid),
        social_security_baht: money(l.social_security_employee),
        withholding_tax_baht: money(l.withholding_tax),
        system_deduct_baht: Math.round((money(l.social_security_employee) + (companyPaidTaxBy[id] ? 0 : money(l.withholding_tax))) * 100) / 100,
        net_estimate: money(l.net_pay),
        has_manual: !!hasManual,
        entry_count: cntBy.get(id) ?? 0,
      };
    }).sort((x, y) => String(x.employee_code).localeCompare(String(y.employee_code)));

    return NextResponse.json({
      period_name: period.period_name,
      period_status: period.status,
      period: {
        id: period.id,
        start_date: period.start_date,
        end_date: period.end_date,
        default_hours_per_day: period.default_hours_per_day,
        holidays: period.payroll_period_holidays ?? [],
      },
      count: rows.length,
      data: rows,
      recurring_items,
      error: null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}
