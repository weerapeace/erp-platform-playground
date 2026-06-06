/**
 * POST /api/payroll/calc-enqueue — สั่งคำนวณงวด payroll แบบเบื้องหลัง (background job)
 * body: { period_id?: string, actor?: string }
 * คืน { job_id } ทันที → หน้าจอ poll /api/jobs/{job_id} เพื่อดูสถานะ/ผล
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { createJob, updateJob, runInBackground } from "@/lib/jobs";
import { runCalcPreview } from "@/lib/payroll-calc-run";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function processCalcJob(jobId: string, periodId: string | null): Promise<void> {
  try {
    await updateJob(jobId, { status: "running" });
    const result = await runCalcPreview(periodId);
    await updateJob(jobId, {
      status: "done", result,
      progress_done: result.summary.total, progress_total: result.summary.total,
    });
  } catch (e) {
    await updateJob(jobId, { status: "error", error: e instanceof Error ? e.message : "คำนวณไม่ได้" });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = await guardPayroll(req); if (denied) return denied;
  let body: { period_id?: string; actor?: string };
  try { body = await req.json(); } catch { body = {}; }
  const periodId = body.period_id ?? null;
  const jobId = await createJob("payroll_calc", { period_id: periodId }, body.actor);
  await runInBackground(() => processCalcJob(jobId, periodId));
  return NextResponse.json({ job_id: jobId, error: null });
}
