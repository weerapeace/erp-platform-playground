/**
 * POST /api/payroll/calc-enqueue — สั่งคำนวณงวด payroll แบบเบื้องหลัง (background job)
 * body: { period_id?: string, actor?: string }
 * คืน { job_id } ทันที → หน้าจอ poll /api/jobs/{job_id} เพื่อดูสถานะ/ผล
 *
 * เส้นทาง: สร้าง job → ส่งเข้า Cloudflare Queue (ถ้ามี binding) → consumer เรียก /api/jobs/run
 *          ถ้ายังไม่มี queue → fallback ใช้ ctx.waitUntil รันในเครื่องหลัง response
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { createJob, runInBackground, sendToQueue } from "@/lib/jobs";
import { runJob } from "@/lib/job-runner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = await guardPayroll(req); if (denied) return denied;
  let body: { period_id?: string; actor?: string };
  try { body = await req.json(); } catch { body = {}; }
  const jobId = await createJob("payroll_calc", { period_id: body.period_id ?? null }, body.actor);

  const queued = await sendToQueue({ job_id: jobId });   // มี Cloudflare Queue → ส่งเข้าคิว
  if (!queued) await runInBackground(() => runJob(jobId)); // ยังไม่มี queue → ทำเบื้องหลังด้วย waitUntil

  return NextResponse.json({ job_id: jobId, queued, error: null });
}
