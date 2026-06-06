/**
 * Payroll module — รายการเงินประจำที่มีผลในงวด
 * GET /api/payroll/recurring-summary?period_id=&employee_id=
 *
 * ใช้สำหรับหน้า Manual Input แสดงคอลัมน์ "รายการประจำ" ให้ตรงกับเครื่องคำนวณเงินเดือน
 * โดยไม่สร้างข้อมูลซ้ำใน payroll_adjustments
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardPayroll } from "@/lib/payroll-auth";
import { money, roundMoney } from "@/lib/payroll-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;

function recurringAmount(it: Row) {
  return String(it.calculation_method ?? "fixed") === "fixed"
    ? money(it.amount_per_period)
    : roundMoney(money(it.quantity_default) * money(it.rate_default));
}

function appliedRecurringAmount(it: Row) {
  const amount = recurringAmount(it);
  if (String(it.duration_type) !== "until_amount") return amount;
  const remaining = roundMoney(money(it.target_total_amount) - money(it.paid_or_deducted_amount));
  return Math.min(amount, Math.max(remaining, 0));
}

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req);
  if (denied) return denied;

  const periodId = req.nextUrl.searchParams.get("period_id");
  const employeeId = req.nextUrl.searchParams.get("employee_id");
  if (!periodId) return NextResponse.json({ data: [], error: "ต้องระบุ period_id" }, { status: 400 });

  try {
    const a = supabaseAdmin();
    const { data: periods, error: periodError } = await a
      .from("payroll_periods")
      .select("id, start_date, end_date")
      .eq("id", periodId)
      .limit(1);
    if (periodError) return NextResponse.json({ data: [], error: periodError.message }, { status: 500 });

    const period = periods?.[0] as Row | undefined;
    if (!period) return NextResponse.json({ data: [], error: "ไม่พบงวด" }, { status: 404 });

    let q = a
      .from("employee_recurring_pay_items")
      .select("*")
      .eq("status", "active")
      .lte("start_date", String(period.end_date))
      .order("employee_id", { ascending: true })
      .order("item_type", { ascending: true })
      .order("item_name", { ascending: true });

    if (employeeId) q = q.eq("employee_id", employeeId);

    const { data, error } = await q;
    if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

    const rows = ((data ?? []) as Row[])
      .filter((it) => !it.end_date || String(it.end_date) >= String(period.start_date))
      .map((it) => ({ ...it, applied_amount: roundMoney(appliedRecurringAmount(it)) }))
      .filter((it) => money(it.applied_amount) > 0);

    return NextResponse.json({ data: rows, error: null });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "โหลดรายการประจำไม่สำเร็จ" }, { status: 500 });
  }
}
