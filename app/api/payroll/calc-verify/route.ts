/**
 * Payroll module — เทียบยอดเครื่องคำนวณใหม่ vs แอปเก่า (Phase 3, อ่านอย่างเดียว)
 *
 * รันสูตร computeLineTotals บน payroll_lines จริง (ที่แอปเก่าคำนวณไว้)
 * แล้วเทียบ gross/total_deduction/net ว่าตรงกันไหม → พิสูจน์ "เหมือนเดิม" ก่อนใช้จริง
 * ⚠️ ไม่เขียนอะไรลง DB
 *
 * GET /api/payroll/calc-verify?period_id=&mismatch_only=1
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardPayroll } from "@/lib/payroll-auth";
import { computeLineTotals, EARNING_FIELDS, PRE_TAX_DEDUCTION_FIELDS, money } from "@/lib/payroll-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NEAR = (a: number, b: number) => Math.abs(money(a) - money(b)) < 0.005;

async function fetchLines(periodId: string | null): Promise<Record<string, unknown>[]> {
  const cols = ["id", "employee_id", "payroll_period_id", ...EARNING_FIELDS, ...PRE_TAX_DEDUCTION_FIELDS,
    "withholding_tax", "gross_pay", "total_deduction", "net_pay"].join(", ");
  const out: Record<string, unknown>[] = [];
  let from = 0; const size = 1000;
  for (;;) {
    let q = supabaseAdmin().from("payroll_lines").select(cols).range(from, from + size - 1);
    if (periodId) q = q.eq("payroll_period_id", periodId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < size) break;
    from += size;
  }
  return out;
}

async function nameMaps() {
  const a = supabaseAdmin();
  const [emp, per] = await Promise.all([
    a.from("employees").select("id, employee_code, first_name, last_name, nickname"),
    a.from("payroll_periods").select("id, period_name"),
  ]);
  const em: Record<string, string> = {};
  (emp.data ?? []).forEach((e) => {
    const r = e as { id: string; employee_code: string; first_name: string; last_name: string; nickname: string | null };
    const nm = [r.first_name, r.last_name].filter((x) => x && x !== "-").join(" ") || r.nickname || r.employee_code;
    em[r.id] = `${r.employee_code} · ${nm}`;
  });
  const pm: Record<string, string> = {};
  (per.data ?? []).forEach((p) => { pm[(p as { id: string }).id] = (p as { period_name: string }).period_name; });
  return { em, pm };
}

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  try {
    const periodId = req.nextUrl.searchParams.get("period_id");
    const mismatchOnly = req.nextUrl.searchParams.get("mismatch_only") === "1";
    const summaryOnly = req.nextUrl.searchParams.get("summary_only") === "1";
    const emptyMaps: { em: Record<string, string>; pm: Record<string, string> } = { em: {}, pm: {} };
    const [lines, { em, pm }] = await Promise.all([fetchLines(periodId), summaryOnly ? Promise.resolve(emptyMaps) : nameMaps()]);
    const employeeIds = Array.from(new Set(lines.map((line) => String(line.employee_id ?? "")).filter(Boolean)));
    const companyPaidTaxBy: Record<string, boolean> = {};
    if (employeeIds.length > 0) {
      const { data: settings, error: settingsError } = await supabaseAdmin()
        .from("employee_payroll_settings")
        .select("employee_id, withholding_tax_company_paid")
        .in("employee_id", employeeIds);
      if (settingsError) throw new Error(settingsError.message);
      (settings ?? []).forEach((s) => {
        const row = s as { employee_id: string; withholding_tax_company_paid: boolean | null };
        companyPaidTaxBy[row.employee_id] = row.withholding_tax_company_paid === true;
      });
    }

    let match = 0, mismatch = 0;
    const rows = lines.map((line) => {
      const c = computeLineTotals(line, undefined, { withholdingTaxCompanyPaid: companyPaidTaxBy[String(line.employee_id ?? "")] === true });
      const ok = NEAR(c.gross_pay, money(line.gross_pay)) && NEAR(c.total_deduction, money(line.total_deduction)) && NEAR(c.net_pay, money(line.net_pay));
      if (ok) match++; else mismatch++;
      return {
        id: line.id as string,
        employee_name: em[line.employee_id as string] ?? "",
        period_name: pm[line.payroll_period_id as string] ?? "",
        gross_old: money(line.gross_pay), gross_new: c.gross_pay,
        deduct_old: money(line.total_deduction), deduct_new: c.total_deduction,
        net_old: money(line.net_pay), net_new: c.net_pay,
        diff_net: roundDiff(c.net_pay, money(line.net_pay)),
        match: ok,
      };
    });
    const summary = { total: rows.length, match, mismatch };
    if (summaryOnly) return NextResponse.json({ data: [], total: 0, summary, error: null });
    const result = mismatchOnly ? rows.filter((r) => !r.match) : rows;
    return NextResponse.json({ data: result, total: result.length, summary, error: null });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "เทียบยอดไม่ได้" }, { status: 500 });
  }
}

function roundDiff(a: number, b: number): number {
  return Math.round((money(a) - money(b)) * 100) / 100;
}
