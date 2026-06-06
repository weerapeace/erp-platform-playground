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
    const { data: pdata } = await a.from("payroll_periods").select("id, period_name, status").eq("id", periodId).limit(1);
    const period = pdata?.[0] as { id: string; period_name: string; status: string } | undefined;
    if (!period) return NextResponse.json({ error: "ไม่พบงวด" }, { status: 404 });

    // เครื่องคำนวณจริง → รายชื่อพนักงานที่เข้าเงื่อนไข + สุทธิประมาณ + วันทำงาน
    const { lines, recurring_items } = await computePeriodPreview(periodId);

    // ยอดดิบรายคน (สำหรับคอลัมน์แสดงผล)
    const [attRes, leaveRes, otRes, adjRes] = await Promise.all([
      a.from("attendance_entries").select("employee_id, late_deduction, absence_deduction, status").eq("payroll_period_id", periodId),
      a.from("leave_entries").select("employee_id, unpaid_leave_deduction, status").eq("payroll_period_id", periodId),
      a.from("overtime_entries").select("employee_id, overtime_amount, status").eq("payroll_period_id", periodId),
      a.from("payroll_adjustments").select("employee_id, adjustment_type, amount, status, source_type, item_code").eq("payroll_period_id", periodId).eq("status", "approved"),
    ]);
    const add = (m: Map<string, number>, id: string, v: unknown) => m.set(id, (m.get(id) ?? 0) + money(v));
    const lateBy = new Map<string, number>(), absBy = new Map<string, number>(), leaveBy = new Map<string, number>();
    const otBy = new Map<string, number>(), pieceBy = new Map<string, number>(), addBy = new Map<string, number>(), dedBy = new Map<string, number>();
    const cntBy = new Map<string, number>();
    for (const r of (attRes.data ?? []) as Record<string, unknown>[]) if (MANUAL.has(String(r.status))) {
      add(lateBy, String(r.employee_id), r.late_deduction); add(absBy, String(r.employee_id), r.absence_deduction);
      cntBy.set(String(r.employee_id), (cntBy.get(String(r.employee_id)) ?? 0) + 1);
    }
    for (const r of (leaveRes.data ?? []) as Record<string, unknown>[]) if (MANUAL.has(String(r.status))) add(leaveBy, String(r.employee_id), r.unpaid_leave_deduction);
    for (const r of (otRes.data ?? []) as Record<string, unknown>[]) if (MANUAL.has(String(r.status))) add(otBy, String(r.employee_id), r.overtime_amount);
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
      const hasManual = late || absence || leave || ot || piecework || special || other;
      return {
        id, employee_id: id, employee_code: l.employee_code, employee_name: nameBy[id] ?? "",
        work_days: money(l.attendance_days),
        late_baht: Math.round(late * 100) / 100,
        absence_baht: Math.round(absence * 100) / 100,
        leave_baht: Math.round(leave * 100) / 100,
        ot_baht: Math.round(ot * 100) / 100,
        piecework_baht: Math.round(piecework * 100) / 100,
        special_add: Math.round(special * 100) / 100,
        other_deduct: Math.round(other * 100) / 100,
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
