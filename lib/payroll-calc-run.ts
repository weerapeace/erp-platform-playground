/**
 * ของกลาง — คำนวณพรีวิวงวด payroll (แยกจาก route เพื่อให้ทั้ง API sync + job เบื้องหลังเรียกใช้ได้)
 * ใช้ supabaseAdmin (service role) — เรียกได้ทั้งใน request และ background job
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { computePeriodPreview } from "@/lib/payroll-calc-engine";
import { money } from "@/lib/payroll-calc";

const NEAR = (a: number, b: number) => Math.abs(money(a) - money(b)) < 0.01;

const COMPARE_COLS = [
  "base_salary", "daily_wage_amount", "hourly_wage_amount", "piece_rate_amount", "overtime_amount",
  "allowance_amount", "bonus_amount", "commission_amount", "late_deduction", "absence_deduction",
  "unpaid_leave_deduction", "advance_deduction", "damage_deduction", "social_security_employee",
  "social_security_employer", "withholding_tax", "other_deduction", "mid_month_paid",
  "gross_pay", "total_deduction", "net_pay", "recurring_earning_amount", "recurring_deduction_amount",
  "remaining_to_pay", "attendance_days", "attendance_hours", "company_cost_total",
];

export type CalcPreviewResult = {
  data: Record<string, unknown>[];
  period_name: string;
  period_status: string;
  period_id: string;
  editable: boolean;
  all_columns_match: boolean;
  columns_compared: number;
  summary: { total: number; match: number; diff: number; fresh: number; columnDiffs: { column: string; count: number }[] };
};

export async function runCalcPreview(periodIdInput?: string | null): Promise<CalcPreviewResult> {
  const a = supabaseAdmin();
  let periodId = periodIdInput ?? null;
  if (!periodId) {
    const { data } = await a.from("payroll_periods").select("id").order("start_date", { ascending: false }).limit(1);
    periodId = (data?.[0] as { id: string } | undefined)?.id ?? null;
  }
  if (!periodId) throw new Error("ไม่มีงวด");

  const { lines, period } = await computePeriodPreview(periodId);

  const { data: existing } = await a.from("payroll_lines")
    .select(`employee_id, created_at, ${COMPARE_COLS.join(", ")}`)
    .eq("payroll_period_id", periodId).order("created_at", { ascending: false });
  const oldBy = new Map<string, Record<string, unknown>>();
  (existing ?? []).forEach((e) => {
    const r = e as unknown as Record<string, unknown>;
    const id = String(r.employee_id);
    if (!oldBy.has(id)) oldBy.set(id, r);
  });

  let match = 0, diff = 0, fresh = 0;
  const colDiff: Record<string, number> = {};
  const rows = lines.map((lnRaw, i) => {
    const ln = lnRaw as unknown as Record<string, unknown>;
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
      id: `${String(ln.employee_id)}-${i}`,
      employee_name: ln.employee_code as string,
      employee_nickname: (ln.employee_nickname as string) ?? "",
      gross_new, gross_old: old ? money(old.gross_pay) : null,
      net_new, net_old: old ? money(old.net_pay) : null,
      diff_net: old ? Math.round((net_new - money(old.net_pay)) * 100) / 100 : null,
      status, ok,
    } as Record<string, unknown>;
  });
  const columnDiffs = Object.entries(colDiff).map(([column, count]) => ({ column, count })).sort((x, y) => y.count - x.count);
  const editable = ["draft", "review"].includes(String(period.status));
  const allColumnsMatch = diff === 0 && match > 0;
  return {
    data: rows, period_name: String(period.period_name), period_status: String(period.status), period_id: periodId,
    editable, all_columns_match: allColumnsMatch, columns_compared: COMPARE_COLS.length,
    summary: { total: rows.length, match, diff, fresh, columnDiffs },
  };
}
