/**
 * Payroll module — กรอกเวลา/รายการคำนวณ (Phase B Manual Inputs)
 * GET  /api/payroll/time-entry?period_id=&employee_id=  → รายการ ot/late/absence/leave ของพนักงาน
 * POST /api/payroll/time-entry  { period_id, employee_id, kind, value, work_date?, note?, preview_only?, paid_leave? }
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
type TimeKind = "ot" | "late" | "absence" | "leave";

function isoDate(v: unknown): string {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function dateInRange(date: string, start: string, end: string): boolean {
  return !!date && date >= start && date <= end;
}

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

function isWorkableDate(date: string, holidays: Set<string>, contract: Row): boolean {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const dow = d.getUTCDay();
  return scheduleWeekdays(contract.work_schedule_id).includes(dow) && !holidays.has(date);
}

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
      a.from("leave_entries").select("id, days, unpaid_leave_deduction, leave_type, paid, leave_date, note").eq("payroll_period_id", periodId).eq("employee_id", employeeId),
      a.from("overtime_entries").select("id, hours, overtime_amount, work_date, note").eq("payroll_period_id", periodId).eq("employee_id", employeeId),
    ]);
    const items: Row[] = [];
    for (const r of (att.data ?? []) as Row[]) {
      if (money(r.late_minutes) > 0) items.push({ id: r.id, kind: "late", value: money(r.late_minutes), amount: money(r.late_deduction), work_date: r.work_date, note: r.note });
      if (money(r.absence_hours) > 0) items.push({ id: r.id, kind: "absence", value: money(r.absence_hours) / 8, amount: money(r.absence_deduction), work_date: r.work_date, note: r.note });
    }
    for (const r of (leave.data ?? []) as Row[]) items.push({ id: r.id, kind: "leave", value: money(r.days), amount: money(r.unpaid_leave_deduction), paid_leave: r.paid === true, work_date: r.leave_date, note: r.note });
    for (const r of (ot.data ?? []) as Row[]) items.push({ id: r.id, kind: "ot", value: money(r.hours), amount: money(r.overtime_amount), work_date: r.work_date, note: r.note });
    return NextResponse.json({ data: items, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  let body: { period_id?: string; employee_id?: string; kind?: string; value?: unknown; work_date?: unknown; note?: unknown; preview_only?: boolean; paid_leave?: boolean; actor?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const periodId = String(body.period_id ?? ""), employeeId = String(body.employee_id ?? "");
  const kind = String(body.kind ?? "") as TimeKind; const value = money(body.value);
  const note = String(body.note ?? "").trim();
  const paidLeave = kind === "leave" && body.paid_leave === true;
  const previewOnly = body.preview_only === true;
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
    const startDate = String(period.start_date);
    const endDate = String(period.end_date);
    const requestedDate = isoDate(body.work_date);
    const workDate = requestedDate || workableDate(startDate, endDate, holidays);
    if (!dateInRange(workDate, startDate, endDate)) {
      return NextResponse.json({ error: "วันที่ต้องอยู่ในช่วงงวดเงินเดือน" }, { status: 400 });
    }

    const { data: cd } = await a.from("employee_contracts").select("*").eq("employee_id", employeeId).eq("is_current", true).eq("status", "active").limit(1);
    const contract = cd?.[0] as Row | undefined;
    if (!contract) return NextResponse.json({ error: "พนักงานนี้ไม่มีสัญญาที่ใช้งานอยู่" }, { status: 400 });
    if (kind !== "ot" && !isWorkableDate(workDate, holidays, contract)) {
      return NextResponse.json({ error: "วันที่นี้ไม่ใช่วันทำงานตามสัญญา หรือเป็นวันหยุด จึงลงสาย/ขาด/ลาไม่ได้" }, { status: 400 });
    }
    const { data: sd } = await a.from("employee_payroll_settings").select("payroll_group_id").eq("employee_id", employeeId).limit(1);
    const setting = (sd?.[0] as Row) ?? {};

    const rate = hourlyRate(contract, period, setting);
    const hoursPerDay = money(period.default_hours_per_day) || 8;
    const isOffice = String(setting?.payroll_group_id ?? "").trim().toLowerCase() === "office";
    const divisor = String(contract.wage_type ?? "monthly") === "monthly"
      ? salaryDayDivisor(isOffice, undefined, money(period.default_work_days))
      : 0;
    let amount = 0; let inserted: { id: string } | null = null; let table = "";
    let quantityLabel = ""; let formula = ""; let hours = 0;

    if (kind === "ot") {
      amount = overtimeAmount(value, rate, 1.5); table = "overtime_entries";
      quantityLabel = `${value} ชม.`;
      formula = `${value} ชม. × ${roundMoney(rate).toLocaleString("th-TH", { minimumFractionDigits: 2 })} × 1.5`;
      if (previewOnly) return NextResponse.json({ data: { kind, value, work_date: workDate, amount, sign: "+", rate: roundMoney(rate), divisor, hours_per_day: hoursPerDay, base_salary: money(contract.base_salary), quantity_label: quantityLabel, formula }, error: null });
      const { data, error } = await a.from(table).insert({ payroll_period_id: periodId, employee_id: employeeId, work_date: workDate, hours: value, rate_multiplier: 1.5, overtime_amount: amount, status: "approved", source_type: "manual", note: note || null }).select("id").limit(1);
      if (error) throw new Error(error.message); inserted = data?.[0] as { id: string };
    } else if (kind === "late") {
      amount = lateDeduction(value, rate); table = "attendance_entries";
      quantityLabel = `${value} นาที`;
      formula = `${value} นาที ÷ 60 × ${roundMoney(rate).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;
      if (previewOnly) return NextResponse.json({ data: { kind, value, work_date: workDate, amount, sign: "-", rate: roundMoney(rate), divisor, hours_per_day: hoursPerDay, base_salary: money(contract.base_salary), quantity_label: quantityLabel, formula }, error: null });
      const { data, error } = await a.from(table).insert({ payroll_period_id: periodId, employee_id: employeeId, work_date: workDate, late_minutes: value, late_deduction: amount, regular_hours: 0, absence_hours: 0, absence_deduction: 0, status: "approved", source_type: "manual", note: note || null }).select("id").limit(1);
      if (error) throw new Error(error.message); inserted = data?.[0] as { id: string };
    } else if (kind === "absence") {
      hours = roundMoney(value * hoursPerDay); amount = absenceDeduction(hours, rate); table = "attendance_entries";
      quantityLabel = `${value} วัน`;
      formula = `${value} วัน × ${hoursPerDay} ชม. × ${roundMoney(rate).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;
      if (previewOnly) return NextResponse.json({ data: { kind, value, work_date: workDate, amount, sign: "-", rate: roundMoney(rate), divisor, hours_per_day: hoursPerDay, base_salary: money(contract.base_salary), quantity_label: quantityLabel, formula, hours }, error: null });
      const { data, error } = await a.from(table).insert({ payroll_period_id: periodId, employee_id: employeeId, work_date: workDate, absence_hours: hours, absence_deduction: amount, late_minutes: 0, late_deduction: 0, regular_hours: 0, status: "approved", source_type: "manual", note: note || null }).select("id").limit(1);
      if (error) throw new Error(error.message); inserted = data?.[0] as { id: string };
    } else { // leave
      hours = roundMoney(value * hoursPerDay); amount = paidLeave ? 0 : absenceDeduction(hours, rate); table = "leave_entries";
      quantityLabel = `${value} วัน`;
      formula = paidLeave ? "ลาป่วย + มีใบรับรองแพทย์: ไม่หักเงิน" : `${value} วัน × ${hoursPerDay} ชม. × ${roundMoney(rate).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;
      if (previewOnly) return NextResponse.json({ data: { kind, value, work_date: workDate, amount, sign: paidLeave ? "0" : "-", rate: roundMoney(rate), divisor, hours_per_day: hoursPerDay, base_salary: money(contract.base_salary), quantity_label: quantityLabel, formula, hours, paid_leave: paidLeave }, error: null });
      const { data, error } = await a.from(table).insert({ payroll_period_id: periodId, employee_id: employeeId, leave_date: workDate, leave_type: paidLeave ? "sick_paid" : "unpaid", days: value, hours, paid: paidLeave, unpaid_leave_deduction: amount, status: "approved", source_type: "manual", note: note || null }).select("id").limit(1);
      if (error) throw new Error(error.message); inserted = data?.[0] as { id: string };
    }

    await writeAudit(a, { action: "create", entityType: table, entityId: inserted?.id, actorId: userId, actorName: body.actor ?? null,
      metadata: { period_name: period.period_name, kind, value, work_date: workDate, amount, paid_leave: paidLeave, note: note || null } });
    return NextResponse.json({ data: { id: inserted?.id, kind, value, work_date: workDate, amount }, error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
