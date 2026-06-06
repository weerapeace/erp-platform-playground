/**
 * ของกลาง — ตัวรันงานเบื้องหลัง (dispatcher ตาม job.type)
 * ใช้ได้ทั้ง: (ก) ctx.waitUntil fallback  (ข) Cloudflare Queue consumer เรียกผ่าน /api/jobs/run
 * idempotent: ถ้า job done แล้วจะไม่ทำซ้ำ (กัน queue retry คำนวณซ้ำ)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { updateJob } from "@/lib/jobs";
import { runCalcPreview } from "@/lib/payroll-calc-run";

export async function runJob(jobId: string): Promise<void> {
  const { data } = await supabaseAdmin()
    .from("erp_jobs").select("id, type, payload, status").eq("id", jobId).maybeSingle();
  if (!data) return;
  const job = data as { type: string; payload: Record<string, unknown>; status: string };
  if (job.status === "done") return;   // idempotent — ทำไปแล้ว
  try {
    await updateJob(jobId, { status: "running" });
    if (job.type === "payroll_calc") {
      const result = await runCalcPreview((job.payload.period_id as string) ?? null);
      await updateJob(jobId, {
        status: "done", result,
        progress_done: result.summary.total, progress_total: result.summary.total,
      });
    } else {
      await updateJob(jobId, { status: "error", error: "ไม่รู้จักประเภทงาน: " + job.type });
    }
  } catch (e) {
    await updateJob(jobId, { status: "error", error: e instanceof Error ? e.message : "ทำงานไม่สำเร็จ" });
  }
}
