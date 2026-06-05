/**
 * Payroll module — กรอกเวลา/รายการคำนวณ (Phase B Manual Inputs)
 * GET  /api/payroll/time-entry?period_id=&employee_id=  → รายการ ot/late/absence/leave ของพนักงาน
 * POST /api/payroll/time-entry  { period_id, employee_id, kind, value }
 *   kind: 'ot' (ชม.) | 'late' (นาที) | 'absence' (วัน) | 'leave' (วัน, ลาไม่รับเงิน)
 *   ระบบคิดเป็นเงินจากเรทค่าจ้างของสัญญาให้อัตโนมัติ (สูตรเดียวกับเครื่องคำนวณ)
 *
 * ความปลอดภัย: employees.edit, เฉพาะงวด draft/review, status=approved (เครื่องนับทันที), audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardPayroll } from "@/lib/payroll-auth";
import { writeAudit } from "@/lib/audit";
import { money, roundMoney, salaryDayDivisor, lateDeduction, absenceDeduction, overtimeAmount } from "@/lib/payroll-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const EDITABLE = new Set(["draft", "review"]);

type Row = Record<string, unknown>;

/** หาวันทำงานจริงวันแรกในงวด (จ-ศ + ไม่ใช่วันหยุด) — กันเครื่องคำนวณข้าม entry ที่ลงวันหยุด */
function workableDate(start: string, end: string, holidays: Set<string>): string {
  const s = new Date(`${start}T00:00:00Z`), e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return end;
  for (const d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay(); const iso = d.toISOString().slice(0, 10);
    if (dow >= 1 && dow <= 5 && !holidays.has(iso)) return iso;   // จ-ศ payable ทุก schedule
  }
  return end;
}

/** เรทค่าจ้างต่อชั่วโมง (สูตรตรงเครื่องคำนวณ) */
function hourlyRate(contract: Row, period: Row, setting: Row): number {
  const hoursPerDay = money(period.default_hours_per_day) || 8;
  const wt = String(contract.wage_type ?? "monthly");
  if (wt === "hourly") return money(contract.hourly_wage);
  if (wt === "daily") return hoursPerDay ? money(contract.daily_wage) / hoursPerDay : 0;
  const isOffice = String(setting?.payroll_group_id ?? "").trim().toLowerCase() === "office";
  const divisor = salaryDayDivisor(isOffice, undefined, money(period.default_work_days));
  return divisor && hoursPerDay ? money(contract.base_salary) / divisor / hoursPerDay : 0;
}

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const periodId = req.nextUrl.searchParams.get("period_id");
  const employeeId = req.nextUrl.searchParams.get("employee_id");
  if (!periodId || !employeeId) return NextResponse.json({ error: "ต้องระบุ period_id + employee_id" }, { status: 400 });
  try {
    const a = supabaseAdmin();
    const [att, leave, ot] = await Promise.all([
      a.from("attendance_entries").select("id, late_minutes, late_deduction, absence_hours, absence_deduction, work_date, note").eq("payroll_period_id", periodId).eq("employee_id", employeeId),
      a.from("leave_entries").select("id, days, unpaid_leave_deduction, leave_type, leave_date, note").eq("payroll_period_id", periodId).eq("employee_id", employeeId),
      a.from("overtime_entries").select("id, hours, overtime_amount, work_date, note").eq("payroll_period_id", periodId).eq("employee_id", employeeId),
    ]);
    const items: Row[] = [];
    for (const r of (att.data ?? []) as Row[]) {
      if (money(r.late_minutes) > 0) items.push({ id: r.id, kind: "late", value: money(r.late_minutes), amount: money(r.late_deduction), note: r.note });
      if (money(r.absence_hours) > 0) items.push({ id: r.id, kind: "absence", value: money(r.absence_hours) / 8, amount: money(r.absence_deduction), note: r.note });
    }
    for (const r of (leave.data ?? []) as Row[]) items.push({ id: r.id, kind: "leave", value: money(r.days), amount: money(r.unpaid_leave_deduction), note: r.note });
    for (const r of (ot.data ?? []) as Row[]) items.push({ id: r.id, kind: "ot", value: money(r.hours), amount: money(r.overtime_amount), note: r.note });
    return NextResponse.json({ data: items, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  let body: { period_id?: string; employee_id?: string; kind?: string; value?: unknown; actor?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const periodId = String(body.period_id ?? ""), employeeId = String(body.employee_id ?? "");
  const kind = String(body.kind ?? ""); const value = money(body.value);
  if (!periodId || !employeeId) return NextResponse.json({ error: "ต้องระบุงวด+พนักงาน" }, { status: 400 });
  if (!["ot", "late", "absence", "leave"].includes(kind)) return NextResponse.json({ error: "kind ไม่ถูกต้อง" }, { status: 400 });
  if (!(value > 0)) return NextResponse.json({ error: "ค่าต้องมากกว่า 0" }, { status: 400 });

  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(req).auth.getUser(); userId = data.user?.id ?? null; } catch { /* */ }

  try {
    const a = supabaseAdmin();
    const { data: pd } = await a.from("payroll_periods").select("id, period_name, status, start_date, end_date, default_hours_per_day, default_work_days, payroll_period_holidays(holiday_date)").eq("id", periodId).limit(1);
    const period = pd?.[0] as Row | undefined;
    if (!period) return NextResponse.json({ error: "ไม่พบงวด" }, { status: 404 });
    if (!EDITABLE.has(String(period.status))) return NextResponse.json({ error: `งวดสถานะ "${period.status}" แก้ไม่ได้` }, { status: 409 });
    const holidays = new Set(((period.payroll_period_holidays as Row[]) ?? []).map((h) => String(h.holiday_date)));

    const { data: cd } = await a.from("employee_contracts").select("*").eq("employee_id", employeeId).eq("is_current", true).eq("status", "active").limit(1);
    const contract = cd?.[0] as Row | undefined;
    if (!contract) return NextResponse.json({ error: "พนักงานนี้ไม่มีสัญญาที่ใช้งานอยู่" }, { status: 400 });
    const { data: sd } = await a.from("employee_payroll_settings").select("payroll_group_id").eq("employee_id", employeeId).limit(1);
    const setting = (sd?.[0] as Row) ?? {};

    const rate = hourlyRate(contract, period, setting);
    const hoursPerDay = money(period.default_hours_per_day) || 8;
    const workDate = workableDate(String(period.start_date), String(period.end_date), holidays);
    let amount = 0; let inserted: { id: string } | null = null; let table = "";

    if (kind === "ot") {
      amount = overtimeAmount(value, rate, 1.5); table = "overtime_entries";
      const { data, error } = await a.from(table).insert({ payroll_period_id: periodId, employee_id: employeeId, work_date: workDate, hours: value, rate_multiplier: 1.5, overtime_amount: amount, status: "approved", source_type: "manual" }).select("id").limit(1);
      if (error) throw new Error(error.message); inserted = data?.[0] as { id: string };
    } else if (kind === "late") {
      amount = lateDeduction(value, rate); table = "attendance_entries";
      const { data, error } = await a.from(table).insert({ payroll_period_id: periodId, employee_id: employeeId, work_date: workDate, late_minutes: value, late_deduction: amount, regular_hours: 0, absence_hours: 0, absence_deduction: 0, status: "approved", source_type: "manual" }).select("id").limit(1);
      if (error) throw new Error(error.message); inserted = data?.[0] as { id: string };
    } else if (kind === "absence") {
      const hours = roundMoney(value * hoursPerDay); amount = absenceDeduction(hours, rate); table = "attendance_entries";
      const { data, error } = await a.from(table).insert({ payroll_period_id: periodId, employee_id: employeeId, work_date: workDate, absence_hours: hours, absence_deduction: amount, late_minutes: 0, late_deduction: 0, regular_hours: 0, status: "approved", source_type: "manual" }).select("id").limit(1);
      if (error) throw new Error(error.message); inserted = data?.[0] as { id: string };
    } else { // leave (unpaid)
      const hours = roundMoney(value * hoursPerDay); amount = absenceDeduction(hours, rate); table = "leave_entries";
      const { data, error } = await a.from(table).insert({ payroll_period_id: periodId, employee_id: employeeId, leave_date: workDate, leave_type: "unpaid", days: value, hours, paid: false, unpaid_leave_deduction: amount, status: "approved", source_type: "manual" }).select("id").limit(1);
      if (error) throw new Error(error.message); inserted = data?.[0] as { id: string };
    }

    await writeAudit(a, { action: "create", entityType: table, entityId: inserted?.id, actorId: userId, actorName: body.actor ?? null,
      metadata: { period_name: period.period_name, kind, value, amount } });
    return NextResponse.json({ data: { id: inserted?.id, kind, value, amount }, error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
