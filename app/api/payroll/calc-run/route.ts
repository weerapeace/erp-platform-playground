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

    // ของเดิม: payroll_lines ของงวดนี้ (ล่าสุดต่อพนักงาน)
    const { data: existing } = await a.from("payroll_lines")
      .select("employee_id, gross_pay, total_deduction, net_pay, created_at")
      .eq("payroll_period_id", periodId).order("created_at", { ascending: false });
    const oldBy = new Map<string, { gross: number; net: number }>();
    (existing ?? []).forEach((e) => {
      const r = e as { employee_id: string; gross_pay: number; net_pay: number };
      if (!oldBy.has(r.employee_id)) oldBy.set(r.employee_id, { gross: money(r.gross_pay), net: money(r.net_pay) });
    });

    let match = 0, diff = 0, fresh = 0;
    const rows = lines.map((ln, i) => {
      const old = oldBy.get(String(ln.employee_id));
      const gross_new = money(ln.gross_pay), net_new = money(ln.net_pay);
      let status: string, ok = false;
      if (!old) { status = "ใหม่ (ยังไม่เคยคำนวณ)"; fresh++; }
      else if (NEAR(net_new, old.net) && NEAR(gross_new, old.gross)) { status = "ตรง"; ok = true; match++; }
      else { status = "ต่าง"; diff++; }
      return {
        id: `${ln.employee_id}-${i}`,
        employee_name: ln.employee_code as string,
        gross_new, gross_old: old?.gross ?? null,
        net_new, net_old: old?.net ?? null,
        diff_net: old ? Math.round((net_new - old.net) * 100) / 100 : null,
        status, ok,
      };
    });
    return NextResponse.json({
      data: rows, period_name: period.period_name, period_status: period.status,
      summary: { total: rows.length, match, diff, fresh }, error: null,
    });
  } catch (e) {
    return NextResponse.json({ data: [], summary: null, error: e instanceof Error ? e.message : "คำนวณไม่ได้" }, { status: 500 });
  }
}
