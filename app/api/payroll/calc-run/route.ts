/**
 * Payroll module — คำนวณงวด (พรีวิว/เทียบ) — Phase 3, อ่านอย่างเดียว ไม่เขียน DB
 * GET /api/payroll/calc-run?period_id=...
 *   → รันเครื่องคำนวณเต็มจาก raw input + เทียบกับ payroll_lines เดิม (latest/พนักงาน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardPayroll } from "@/lib/payroll-auth";
import { computePeriodPreview } from "@/lib/payroll-calc-engine";
import { money } from "@/lib/payroll-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const NEAR = (a: number, b: number) => Math.abs(money(a) - money(b)) < 0.01;

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  let periodId = req.nextUrl.searchParams.get("period_id");
  try {
    const a = supabaseAdmin();
    if (!periodId) {
      const { data } = await a.from("payroll_periods").select("id").order("start_date", { ascending: false }).limit(1);
      periodId = (data?.[0] as { id: string } | undefined)?.id ?? null;
    }
    if (!periodId) return NextResponse.json({ data: [], summary: null, error: "ไม่มีงวด" }, { status: 400 });

    const { lines, period } = await computePeriodPreview(periodId);

    // เทียบทุกคอลัมน์ตัวเลขกับของเดิม (latest run ต่อพนักงาน) — Phase 3: ตรวจครบก่อนเปิดให้บันทึก
    const COMPARE_COLS = [
      "base_salary", "daily_wage_amount", "hourly_wage_amount", "piece_rate_amount", "overtime_amount",
      "allowance_amount", "bonus_amount", "commission_amount", "late_deduction", "absence_deduction",
      "unpaid_leave_deduction", "advance_deduction", "damage_deduction", "social_security_employee",
      "social_security_employer", "withholding_tax", "other_deduction", "mid_month_paid",
      "gross_pay", "total_deduction", "net_pay", "recurring_earning_amount", "recurring_deduction_amount",
      "remaining_to_pay", "attendance_days", "attendance_hours", "company_cost_total",
    ];
    const { data: existing } = await a.from("payroll_lines")
      .select(`employee_id, created_at, ${COMPARE_COLS.join(", ")}`)
      .eq("payroll_period_id", periodId).order("created_at", { ascending: false });
    const oldBy = new Map<string, Record<string, unknown>>();
    (existing ?? []).forEach((e) => {
      const r = e as Record<string, unknown>;
      const id = String(r.employee_id);
      if (!oldBy.has(id)) oldBy.set(id, r);   // แถวแรก = ล่าสุด (เรียง created_at desc)
    });

    let match = 0, diff = 0, fresh = 0;
    const colDiff: Record<string, number> = {};   // คอลัมน์ -> จำนวนคนที่ต่าง
    const rows = lines.map((ln, i) => {
      const old = oldBy.get(String(ln.employee_id));
      const gross_new = money(ln.gross_pay), net_new = money(ln.net_pay);
      let status: string, ok = false;
      if (!old) { status = "ใหม่ (ยังไม่เคยคำนวณ)"; fresh++; }
      else {
        const mismatched = COMPARE_COLS.filter((c) => !NEAR(money(ln[c]), money(old[c])));
        if (mismatched.length === 0) { status = "ตรง"; ok = true; match++; }
        else { status = "ต่าง"; diff++; mismatched.forEach((c) => { colDiff[c] = (colDiff[c] ?? 0) + 1; }); }
      }
      return {
        id: `${ln.employee_id}-${i}`,
        employee_name: ln.employee_code as string,
        gross_new, gross_old: old ? money(old.gross_pay) : null,
        net_new, net_old: old ? money(old.net_pay) : null,
        diff_net: old ? Math.round((net_new - money(old.net_pay)) * 100) / 100 : null,
        status, ok,
      };
    });
    const columnDiffs = Object.entries(colDiff).map(([column, count]) => ({ column, count }))
      .sort((x, y) => y.count - x.count);
    const editable = ["draft", "review"].includes(String(period.status));   // กันงวด locked/paid/approved
    const allColumnsMatch = diff === 0 && match > 0;   // มีของเดิมให้เทียบ และตรงครบทุกช่อง
    return NextResponse.json({
      data: rows, period_name: period.period_name, period_status: period.status,
      period_id: periodId, editable, all_columns_match: allColumnsMatch, columns_compared: COMPARE_COLS.length,
      summary: { total: rows.length, match, diff, fresh, columnDiffs }, error: null,
    });
  } catch (e) {
    return NextResponse.json({ data: [], summary: null, error: e instanceof Error ? e.message : "คำนวณไม่ได้" }, { status: 500 });
  }
}
