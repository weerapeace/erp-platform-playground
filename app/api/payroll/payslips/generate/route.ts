/**
 * Payroll module — ออกสลิปจากผลคำนวณ (Phase 4)
 * POST /api/payroll/payslips/generate  { period_id }
 *
 * สร้าง payroll_payslips จาก payroll_lines ของ "รอบคำนวณล่าสุด" (1 ใบ/พนักงาน/งวด)
 * - upsert ต่อพนักงาน (มีอยู่แล้ว → อัปเดต) — ออกซ้ำได้ ไม่สร้างซ้ำ
 * - เลขสลิป PS-{period8}-{run_no}-{employee_code} (ตรง worker.js เดิม)
 * - net บนสลิป = net_pay + withholding_tax (ตรง payslipNetBeforeWithholding เดิม)
 * ความปลอดภัย: employees.edit, ต้องมีรอบคำนวณ, audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardPayroll } from "@/lib/payroll-auth";
import { writeAudit } from "@/lib/audit";
import { money, roundMoney } from "@/lib/payroll-calc";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const BLOCKED = new Set(["cancelled"]);

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  let body: { period_id?: string; actor?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const periodId = String(body.period_id ?? "");
  if (!periodId) return NextResponse.json({ error: "ต้องระบุงวด" }, { status: 400 });

  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(req).auth.getUser(); userId = data.user?.id ?? null; } catch { /* */ }

  try {
    const a = supabaseAdmin();
    const { data: pd } = await a.from("payroll_periods").select("id, period_name, status").eq("id", periodId).limit(1);
    const period = pd?.[0] as { id: string; period_name: string; status: string } | undefined;
    if (!period) return NextResponse.json({ error: "ไม่พบงวด" }, { status: 404 });
    if (BLOCKED.has(String(period.status))) return NextResponse.json({ error: `งวดถูกยกเลิก ออกสลิปไม่ได้` }, { status: 409 });

    // รอบคำนวณล่าสุด
    const { data: runs } = await a.from("payroll_runs").select("id, run_no").eq("payroll_period_id", periodId).order("run_no", { ascending: false }).limit(1);
    const run = runs?.[0] as { id: string; run_no: number } | undefined;
    if (!run) return NextResponse.json({ error: "งวดนี้ยังไม่มีผลคำนวณ — ไปคำนวณ+บันทึกก่อน" }, { status: 400 });

    const { data: lineRows } = await a.from("payroll_lines").select("*").eq("payroll_period_id", periodId).eq("payroll_run_id", run.id);
    const lines = (lineRows ?? []) as Record<string, unknown>[];
    if (lines.length === 0) return NextResponse.json({ error: "รอบคำนวณนี้ไม่มีบรรทัดเงินเดือน" }, { status: 400 });

    // employee_code สำหรับเลขสลิป
    const empIds = [...new Set(lines.map((l) => String(l.employee_id)))];
    const codeBy: Record<string, string> = {};
    const { data: emps } = await a.from("employees").select("id, employee_code").in("id", empIds);
    (emps ?? []).forEach((e) => { const r = e as { id: string; employee_code: string }; codeBy[r.id] = r.employee_code; });

    // สลิปเดิมของงวด (upsert ต่อพนักงาน)
    const { data: existing } = await a.from("payroll_payslips").select("id, employee_id").eq("payroll_period_id", periodId);
    const existBy = new Map(((existing ?? []) as { id: string; employee_id: string }[]).map((r) => [r.employee_id, r.id]));

    let created = 0, updated = 0; const failed: string[] = [];
    for (const line of lines) {
      const empId = String(line.employee_id);
      const code = codeBy[empId] ?? empId;
      const row = {
        payroll_period_id: periodId, payroll_line_id: line.id, employee_id: empId,
        payslip_no: `PS-${periodId.slice(0, 8)}-${run.run_no}-${code}`.replace(/\s+/g, ""),
        gross_pay: money(line.gross_pay), total_deduction: money(line.total_deduction),
        net_pay: roundMoney(money(line.net_pay) + money(line.withholding_tax)),
        status: "draft", slip_type: "month_end", issued_at: null,
        payload: { run: { run_no: run.run_no }, line },
      };
      const exId = existBy.get(empId);
      const res = exId
        ? await a.from("payroll_payslips").update(row).eq("id", exId)
        : await a.from("payroll_payslips").insert(row);
      if (res.error) failed.push(`${code}: ${res.error.message}`);
      else if (exId) updated++; else created++;
    }

    await writeAudit(a, { action: "generate_payslips", entityType: "payroll_periods", entityId: periodId, actorId: userId, actorName: body.actor ?? null,
      metadata: { period_name: period.period_name, run_no: run.run_no, created, updated, failed: failed.length } });

    return NextResponse.json({ data: { created, updated, failed, total: lines.length, run_no: run.run_no }, error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ออกสลิปไม่สำเร็จ" }, { status: 500 });
  }
}
