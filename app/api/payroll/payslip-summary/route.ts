/**
 * Payroll module — สรุปสลิปเงินเดือนทั้งงวด (อ่านอย่างเดียว) — หน้า "สลิปเงินเดือน"
 * GET /api/payroll/payslip-summary?period_id=...
 * คืนยอดรวมสลิปของงวด (จำนวนใบ/รายได้/หัก/สุทธิ) + รายการสลิป
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardPayroll } from "@/lib/payroll-auth";
import { money } from "@/lib/payroll-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLS = "id, payslip_no, employee_id, payroll_period_id, gross_pay, total_deduction, net_pay, status, slip_type, issued_at";

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const periodId = req.nextUrl.searchParams.get("period_id");
  if (!periodId) return NextResponse.json({ error: "ต้องระบุ period_id" }, { status: 400 });

  try {
    const a = supabaseAdmin();
    const { data: pdata } = await a.from("payroll_periods").select("id, period_name, status").eq("id", periodId).limit(1);
    const period = pdata?.[0] as { id: string; period_name: string; status: string } | undefined;
    if (!period) return NextResponse.json({ error: "ไม่พบงวด" }, { status: 404 });

    const { data: slipRows } = await a.from("payroll_payslips").select(COLS).eq("payroll_period_id", periodId);
    const slips = (slipRows ?? []) as Record<string, unknown>[];

    const empIds = [...new Set(slips.map((s) => String(s.employee_id)))];
    const nameBy: Record<string, string> = {}; const codeBy: Record<string, string> = {};
    if (empIds.length) {
      const { data: emps } = await a.from("employees").select("id, employee_code, first_name, last_name, nickname").in("id", empIds);
      (emps ?? []).forEach((e) => {
        const r = e as { id: string; employee_code: string; first_name: string; last_name: string | null; nickname: string | null };
        codeBy[r.id] = r.employee_code;
        nameBy[r.id] = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() + (r.nickname ? ` (${r.nickname})` : "");
      });
    }

    const sum = (k: string) => slips.reduce((t, s) => t + money(s[k]), 0);
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const totals = {
      count: slips.length,
      gross_pay: round2(sum("gross_pay")),
      total_deduction: round2(sum("total_deduction")),
      net_pay: round2(sum("net_pay")),
    };

    const data = slips
      .map((s) => ({
        id: s.id,
        payslip_no: s.payslip_no,
        employee_code: codeBy[String(s.employee_id)] ?? "",
        employee_name: nameBy[String(s.employee_id)] ?? "",
        slip_type: s.slip_type,
        gross_pay: money(s.gross_pay),
        total_deduction: money(s.total_deduction),
        net_pay: money(s.net_pay),
        status: s.status,
        issued_at: s.issued_at,
      }))
      .sort((x, y) => String(x.payslip_no).localeCompare(String(y.payslip_no)));

    return NextResponse.json({ period_name: period.period_name, period_status: period.status, totals, data, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}
