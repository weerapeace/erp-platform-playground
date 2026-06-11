/**
 * Payroll module — เปลี่ยนสถานะงวด (workflow) — Phase 3 ต่อเนื่อง
 * POST /api/payroll/period-status  body: { period_id, to_status, actor? }
 *
 * ทำให้เส้นทางงวดเดินได้: draft → review → approved → locked → paid (+ ถอยกลับ/ยกเลิก)
 * ความปลอดภัย: ต้อง employees.edit, ตรวจ allowed transition, set locked_at/paid_at/approved_by, audit log
 * ⚠️ เปลี่ยนเฉพาะสถานะงวด — ไม่แตะตัวเลขเงินใน payroll_lines
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardPayroll } from "@/lib/payroll-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// เส้นทางที่อนุญาต (กันการกระโดดข้ามสถานะ)
const TRANSITIONS: Record<string, string[]> = {
  draft:     ["review", "cancelled"],
  review:    ["approved", "draft", "cancelled"],
  approved:  ["locked", "review", "cancelled"],
  locked:    ["paid", "approved"],   // approved = ปลดล็อกเพื่อแก้ (audited)
  paid:      [],                      // จ่ายแล้ว = สิ้นสุด
  cancelled: ["draft"],              // เปิดใช้งานใหม่
};

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;

  let body: { period_id?: string; to_status?: string; actor?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { period_id: periodId, to_status: toStatus } = body;
  if (!periodId || !toStatus) return NextResponse.json({ error: "ต้องระบุ period_id และ to_status" }, { status: 400 });

  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(req).auth.getUser(); userId = data.user?.id ?? null; } catch { /* best-effort */ }

  try {
    const a = supabaseAdmin();
    const { data: pdata } = await a.from("payroll_periods").select("id, period_name, status").eq("id", periodId).limit(1);
    const period = pdata?.[0] as { id: string; period_name: string; status: string } | undefined;
    if (!period) return NextResponse.json({ error: "ไม่พบงวด" }, { status: 404 });

    const from = String(period.status);
    const allowed = TRANSITIONS[from] ?? [];
    if (!allowed.includes(toStatus)) {
      return NextResponse.json({ error: `เปลี่ยนจาก "${from}" → "${toStatus}" ไม่ได้ (อนุญาต: ${allowed.join(", ") || "ไม่มี"})` }, { status: 409 });
    }

    if (["approved", "locked", "paid"].includes(toStatus)) {
      const { data: runs, error: runErr } = await a.from("payroll_runs")
        .select("id, run_no")
        .eq("payroll_period_id", periodId)
        .order("run_no", { ascending: false })
        .limit(1);
      if (runErr) return NextResponse.json({ error: `ตรวจรอบคำนวณไม่สำเร็จ: ${runErr.message}` }, { status: 500 });
      const latestRun = runs?.[0] as { id: string; run_no: number } | undefined;
      if (!latestRun) return NextResponse.json({ error: "งวดนี้ยังไม่มีผลคำนวณ — ไปคำนวณและบันทึกก่อน" }, { status: 409 });

      const { count: lineCount, error: lineErr } = await a.from("payroll_lines")
        .select("id", { count: "exact", head: true })
        .eq("payroll_period_id", periodId)
        .eq("payroll_run_id", latestRun.id);
      if (lineErr) return NextResponse.json({ error: `ตรวจบรรทัดเงินเดือนไม่สำเร็จ: ${lineErr.message}` }, { status: 500 });
      if (!lineCount) return NextResponse.json({ error: "รอบคำนวณล่าสุดยังไม่มีบรรทัดเงินเดือน — ให้คำนวณใหม่ก่อน" }, { status: 409 });
    }

    if (toStatus === "paid") {
      const { count: slipCount, error: slipErr } = await a.from("payroll_payslips")
        .select("id", { count: "exact", head: true })
        .eq("payroll_period_id", periodId);
      if (slipErr) return NextResponse.json({ error: `ตรวจสลิปไม่สำเร็จ: ${slipErr.message}` }, { status: 500 });
      if (!slipCount) return NextResponse.json({ error: "ยังไม่มีสลิปเงินเดือน — ออกสลิปก่อนทำเครื่องหมายว่าจ่ายแล้ว" }, { status: 409 });

      const { count: paidBatchCount, error: paidBatchErr } = await a.from("payment_batches")
        .select("id", { count: "exact", head: true })
        .eq("payroll_period_id", periodId)
        .eq("status", "paid");
      if (paidBatchErr) return NextResponse.json({ error: `ตรวจชุดจ่ายไม่สำเร็จ: ${paidBatchErr.message}` }, { status: 500 });
      if (!paidBatchCount) return NextResponse.json({ error: "ยังไม่มีชุดจ่ายที่บันทึกว่าจ่ายแล้ว — ให้สร้างชุดจ่ายและบันทึกจ่ายแล้วจากหน้ารอบจ่ายเงินก่อน" }, { status: 409 });

      const { count: unpaidSlipCount, error: unpaidSlipErr } = await a.from("payroll_payslips")
        .select("id", { count: "exact", head: true })
        .eq("payroll_period_id", periodId)
        .neq("status", "paid");
      if (unpaidSlipErr) return NextResponse.json({ error: `ตรวจสลิปที่ยังไม่จ่ายไม่สำเร็จ: ${unpaidSlipErr.message}` }, { status: 500 });
      if (unpaidSlipCount) return NextResponse.json({ error: `ยังมีสลิปที่ยังไม่จ่าย ${unpaidSlipCount} ใบ — ต้องจ่ายให้ครบก่อนปิดงวดเป็นจ่ายแล้ว` }, { status: 409 });
    }

    const patch: Record<string, unknown> = { status: toStatus, updated_at: new Date().toISOString() };
    const now = new Date().toISOString();
    if (toStatus === "locked") patch.locked_at = now;
    if (toStatus === "paid") patch.paid_at = now;
    if (toStatus === "approved") { patch.approved_by = userId; if (from === "locked") patch.locked_at = null; }

    const { error: upErr } = await a.from("payroll_periods").update(patch).eq("id", periodId);
    if (upErr) return NextResponse.json({ error: `เปลี่ยนสถานะไม่สำเร็จ: ${upErr.message}` }, { status: 500 });

    await writeAudit(a, {
      action: "status_change", entityType: "payroll_periods", entityId: periodId, actorId: userId,
      actorName: body.actor ?? null,
      metadata: { period_name: period.period_name, from, to: toStatus },
    });

    return NextResponse.json({ data: { period_id: periodId, from, to: toStatus, period_name: period.period_name }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "เปลี่ยนสถานะไม่สำเร็จ" }, { status: 500 });
  }
}
