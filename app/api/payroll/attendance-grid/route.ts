/**
 * Payroll module — attendance grid (employee x day)
 * GET /api/payroll/attendance-grid?period_id=...
 *
 * คืนข้อมูลรายวันทั้งงวดในคำขอเดียว เพื่อให้หน้า UI ไม่ยิง API ทีละช่อง
 * ใช้กฎวันทำงาน/วันหยุดตาม payroll engine เดิม และอ่าน raw input จากตาราง payroll จริง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardPayroll } from "@/lib/payroll-auth";
import { computePeriodPreview } from "@/lib/payroll-calc-engine";
import { money, roundMoney } from "@/lib/payroll-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;

const MANUAL = new Set(["approved", "review", "draft"]);
const SCHEDULES: Record<string, number[]> = {
  office_5d: [1, 2, 3, 4, 5],
  factory_6d: [1, 2, 3, 4, 5, 6],
  shift_a: [1, 2, 3, 4, 5, 6],
  shift_b: [1, 2, 3, 4, 5, 6],
  part_time_weekend: [0, 6],
};

function scheduleWeekdays(id: unknown): number[] {
  return SCHEDULES[String(id)] ?? SCHEDULES.factory_6d;
}

function durationLabel(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function eachDay(start: string, end: string): { iso: string; day: number; dow: number }[] {
  const out: { iso: string; day: number; dow: number }[] = [];
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return out;
  for (const d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push({ iso: d.toISOString().slice(0, 10), day: d.getUTCDate(), dow: d.getUTCDay() });
  }
  return out;
}

function key(employeeId: unknown, date: unknown): string {
  return `${String(employeeId)}::${String(date)}`;
}

function addCell(map: Map<string, Row>, employeeId: unknown, date: unknown, vals: Row) {
  const k = key(employeeId, date);
  const cur = map.get(k) ?? {};
  for (const [field, value] of Object.entries(vals)) cur[field] = money(cur[field]) + money(value);
  map.set(k, cur);
}

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req);
  if (denied) return denied;

  const periodId = req.nextUrl.searchParams.get("period_id");
  if (!periodId) return NextResponse.json({ error: "ต้องระบุ period_id" }, { status: 400 });

  try {
    const a = supabaseAdmin();
    const { lines, period } = await computePeriodPreview(periodId);
    const start = String(period.start_date);
    const end = String(period.end_date);
    const hoursPerDay = money(period.default_hours_per_day) || 8;
    const holidays = new Set(
      ((period.payroll_period_holidays as Row[]) ?? [])
        .map((h) => String(h.holiday_date ?? h.date ?? ""))
        .filter(Boolean),
    );
    const days = eachDay(start, end).map((d) => ({
      ...d,
      is_holiday: holidays.has(d.iso),
    }));

    const empIds = lines.map((l) => String(l.employee_id)).filter(Boolean);
    const [empRes, contractRes, attRes, leaveRes, otRes] = await Promise.all([
      empIds.length
        ? a.from("employees").select("id, first_name, last_name, nickname").in("id", empIds)
        : Promise.resolve({ data: [] as Row[] }),
      empIds.length
        ? a.from("employee_contracts").select("employee_id, work_schedule_id, attendance_scan_exempt, status, is_current").in("employee_id", empIds).eq("is_current", true).eq("status", "active")
        : Promise.resolve({ data: [] as Row[] }),
      a.from("attendance_entries").select("employee_id, work_date, late_minutes, late_deduction, absence_hours, absence_deduction, status, note").eq("payroll_period_id", periodId),
      a.from("leave_entries").select("employee_id, leave_date, days, hours, unpaid_leave_deduction, status, note").eq("payroll_period_id", periodId),
      a.from("overtime_entries").select("employee_id, work_date, hours, overtime_amount, status, note").eq("payroll_period_id", periodId),
    ]);

    const employeeName = new Map<string, string>();
    for (const e of (empRes.data ?? []) as Row[]) {
      const name = `${String(e.first_name ?? "")} ${String(e.last_name ?? "")}`.trim();
      employeeName.set(String(e.id), name + (e.nickname ? ` (${String(e.nickname)})` : ""));
    }
    const contractBy = new Map<string, Row>();
    for (const c of (contractRes.data ?? []) as Row[]) contractBy.set(String(c.employee_id), c);

    const inputByCell = new Map<string, Row>();
    for (const r of (attRes.data ?? []) as Row[]) if (MANUAL.has(String(r.status ?? "approved"))) {
      addCell(inputByCell, r.employee_id, r.work_date, {
        late_minutes: r.late_minutes,
        late_baht: r.late_deduction,
        absence_hours: r.absence_hours,
        absence_baht: r.absence_deduction,
      });
      const cur = inputByCell.get(key(r.employee_id, r.work_date));
      if (cur && r.note) cur.note = [cur.note, r.note].filter(Boolean).join(" · ");
    }
    for (const r of (leaveRes.data ?? []) as Row[]) if (MANUAL.has(String(r.status ?? "approved"))) {
      addCell(inputByCell, r.employee_id, r.leave_date, {
        leave_days: r.days,
        leave_hours: r.hours,
        leave_baht: r.unpaid_leave_deduction,
      });
      const cur = inputByCell.get(key(r.employee_id, r.leave_date));
      if (cur && r.note) cur.note = [cur.note, r.note].filter(Boolean).join(" · ");
    }
    for (const r of (otRes.data ?? []) as Row[]) if (MANUAL.has(String(r.status ?? "approved"))) {
      addCell(inputByCell, r.employee_id, r.work_date, {
        ot_hours: r.hours,
        ot_baht: r.overtime_amount,
      });
      const cur = inputByCell.get(key(r.employee_id, r.work_date));
      if (cur && r.note) cur.note = [cur.note, r.note].filter(Boolean).join(" · ");
    }

    const rows = lines
      .map((line) => {
        const employeeId = String(line.employee_id);
        const contract = contractBy.get(employeeId) ?? {};
        const schedule = scheduleWeekdays(contract.work_schedule_id);
        const cells = days.map((day) => {
          const scheduled = schedule.includes(day.dow);
          const holiday = day.is_holiday;
          const input = inputByCell.get(key(employeeId, day.iso)) ?? {};
          const lateMinutes = money(input.late_minutes);
          const absenceHours = money(input.absence_hours);
          const leaveHours = money(input.leave_hours) || money(input.leave_days) * hoursPerDay;
          const otHours = money(input.ot_hours);
          const hasInput = lateMinutes || absenceHours || leaveHours || otHours;
          const exempt = Boolean(contract.attendance_scan_exempt);

          let status: string = "off";
          let label = "+ OT";
          let sublabel = "";
          let amount = 0;

          if (scheduled && holiday) {
            status = "paid_holiday";
            label = "หยุด";
            sublabel = "จ่าย";
          } else if (scheduled && exempt) {
            status = "exempt";
            label = "ยกเว้น";
            sublabel = "ไม่สแกน";
          } else if (scheduled) {
            const workHours = Math.max(hoursPerDay - absenceHours - leaveHours - lateMinutes / 60, 0);
            label = durationLabel(workHours);
            status = workHours <= 0 ? "zero" : workHours < hoursPerDay ? "partial" : "full";
          }

          if (otHours > 0 && !scheduled) {
            status = "ot";
            label = `OT ${durationLabel(otHours)}`;
          } else if (otHours > 0 && scheduled && !lateMinutes && !absenceHours && !leaveHours) {
            status = "full";
            sublabel = `+OT ${durationLabel(otHours)}`;
          }

          if (lateMinutes || absenceHours || leaveHours) {
            amount = money(input.late_baht) + money(input.absence_baht) + money(input.leave_baht);
          } else if (otHours) {
            amount = money(input.ot_baht);
          }

          return {
            date: day.iso,
            status,
            label,
            sublabel,
            scheduled,
            is_holiday: holiday,
            editable: scheduled && !holiday,
            allow_ot: true,
            has_input: !!hasInput,
            late_minutes: lateMinutes,
            absence_hours: absenceHours,
            leave_days: money(input.leave_days),
            ot_hours: otHours,
            amount: roundMoney(amount),
            note: input.note ?? "",
          };
        });
        const manualDays = cells.filter((c) => c.has_input).length;
        return {
          employee_id: employeeId,
          employee_code: line.employee_code,
          employee_name: employeeName.get(employeeId) ?? "",
          net_estimate: money(line.net_pay),
          manual_days: manualDays,
          cells,
        };
      })
      .sort((x, y) => String(x.employee_code).localeCompare(String(y.employee_code)));

    return NextResponse.json({
      period: {
        id: period.id,
        period_name: period.period_name,
        status: period.status,
        start_date: period.start_date,
        end_date: period.end_date,
        default_hours_per_day: hoursPerDay,
      },
      days,
      rows,
      error: null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดตารางเข้างานไม่ได้" }, { status: 500 });
  }
}
