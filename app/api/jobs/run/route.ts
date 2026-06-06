/**
 * POST /api/jobs/run — รันงานเบื้องหลัง (เรียกโดย Cloudflare Queue consumer เท่านั้น)
 * ป้องกันด้วย header x-job-secret == env JOB_RUNNER_SECRET (ห้ามให้ผู้ใช้ทั่วไปเรียก)
 * body: { job_id }
 */
import { NextRequest, NextResponse } from "next/server";
import { runJob } from "@/lib/job-runner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.JOB_RUNNER_SECRET ?? "";
  const got = req.headers.get("x-job-secret") ?? "";
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { job_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const jobId = String(body.job_id ?? "");
  if (!jobId) return NextResponse.json({ error: "no job_id" }, { status: 400 });
  await runJob(jobId);   // ทำให้จบ (consumer รอ ack)
  return NextResponse.json({ ok: true });
}
