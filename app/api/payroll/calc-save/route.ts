/**
 * Payroll module — บันทึกผลคำนวณลง payroll_lines จริง (Phase 3)
 * POST /api/payroll/calc-save  body: { period_id, actor? }
 *
 * ความปลอดภัย (ข้อมูลเงินจริง):
 *  - ต้องมีสิทธิ์ employees.edit
 *  - บันทึกได้เฉพาะงวดสถานะ draft/review (กัน locked/paid/approved)
 *  - สร้าง payroll_run ใหม่ (run_no +1) ทุกครั้ง — ไม่ลบของเดิม เก็บเป็นประวัติ
 *  - เขียน audit log
 * ⚠️ ใช้ computePeriodPreview (เครื่องคำนวณตัวเดียวกับหน้าพรีวิว) — ยอดตรงกับที่เทียบไว้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardPayroll } from "@/lib/payroll-auth";
import { computePeriodPreview } from "@/lib/payroll-calc-engine";
import { writeAudit } from "@/lib/audit";
import { validatePayrollPeriod } from "@/lib/payroll-validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EDITABLE = new Set(["draft", "review"]);

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;

  let body: { period_id?: string; actor?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const periodId = body.period_id;
  if (!periodId) return NextResponse.json({ error: "ต้องระบุงวด (period_id)" }, { status: 400 });

  // ผู้ทำ (สำหรับ calculated_by + audit)
  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(req).auth.getUser(); userId = data.user?.id ?? null; } catch { /* best-effort */ }

  try {
    const a = supabaseAdmin();
    // ตรวจสถานะงวด — กันบันทึกทับงวดที่ล็อก/จ่ายแล้ว
    const { data: pdata } = await a.from("payroll_periods").select("id, period_name, status").eq("id", periodId).limit(1);
    const period = pdata?.[0] as { id: string; period_name: string; status: string } | undefined;
    if (!period) return NextResponse.json({ error: "ไม่พบงวด" }, { status: 404 });
    if (!EDITABLE.has(String(period.status))) {
      return NextResponse.json({ error: `บันทึกไม่ได้ — งวดสถานะ "${period.status}" ถูกล็อกแล้ว (บันทึกได้เฉพาะ draft/review)` }, { status: 409 });
    }
    const validation = await validatePayrollPeriod(periodId);
    if (!validation.ready) return NextResponse.json({ error: "งวดยังไม่พร้อมบันทึกผลคำนวณ", validation }, { status: 409 });

    // คำนวณ (เครื่องเดียวกับหน้าพรีวิว)
    const { lines } = await computePeriodPreview(periodId);
    if (lines.length === 0) return NextResponse.json({ error: "ไม่มีบรรทัดให้บันทึก (ไม่มีพนักงาน/สัญญาที่เข้าเงื่อนไข)" }, { status: 400 });

    // run_no ถัดไป
    const { data: lastRun } = await a.from("payroll_runs")
      .select("run_no").eq("payroll_period_id", periodId).order("run_no", { ascending: false }).limit(1);
    const nextRunNo = Number((lastRun?.[0] as { run_no?: number } | undefined)?.run_no ?? 0) + 1;

    // สร้าง run
    const { data: runRows, error: runErr } = await a.from("payroll_runs").insert({
      payroll_period_id: periodId, run_no: nextRunNo, status: "calculated",
      calculated_by: userId, calculated_at: new Date().toISOString(),
      note: `คำนวณผ่าน ERP (Phase 3) — ${lines.length} คน`,
    }).select("id, run_no").limit(1);
    if (runErr || !runRows?.[0]) return NextResponse.json({ error: `สร้างรอบคำนวณไม่สำเร็จ: ${runErr?.message ?? ""}` }, { status: 500 });
    const run = runRows[0] as { id: string; run_no: number };

    // เขียน payroll_lines (ตัด employee_code ที่ไม่ใช่คอลัมน์จริงออก)
    const rows = lines.map((ln) => {
      const { employee_code: _ec, employee_nickname: _en, ...cols } = ln as Record<string, unknown>;
      void _en;
      void _ec;
      return { ...cols, payroll_period_id: periodId, payroll_run_id: run.id, status: "review" };
    });
    const { error: insErr } = await a.from("payroll_lines").insert(rows);
    if (insErr) {
      // ลบ run ที่เพิ่งสร้างเพื่อไม่ให้ค้าง (best-effort)
      await a.from("payroll_runs").delete().eq("id", run.id);
      return NextResponse.json({ error: `บันทึกบรรทัดไม่สำเร็จ: ${insErr.message}` }, { status: 500 });
    }

    await writeAudit(a, {
      action: "calculate", entityType: "payroll_runs", entityId: run.id, actorId: userId,
      actorName: body.actor ?? null,
      metadata: { period_id: periodId, period_name: period.period_name, run_no: run.run_no, line_count: rows.length },
    });

    return NextResponse.json({
      data: { run_id: run.id, run_no: run.run_no, line_count: rows.length, period_name: period.period_name },
      error: null,
    }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
