import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isUuid } from "@/lib/marketing/sku-list";
import { jobProgress, kindInfo, type StepDone, type StepSkip, type WorkJobKind, type WorkStep } from "@/lib/marketing/work-jobs";

export const dynamic = "force-dynamic";

// GET /api/creative-tasks/[id]/work-job → งานชุดรุ่น (หน้า SKU การตลาด › 🛠 โหมดทำงาน) ที่ผูกกับงานนี้ + ความคืบหน้า
//   ไม่ผูก = { data: null } · สิทธิ์ tasks.view (คนใน Task Manager เห็นได้แม้ไม่มีสิทธิ์หน้าการตลาด)
type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const denied = await guardApi(request, "tasks.view");
  if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ data: null, error: null });
  const admin = supabaseAdmin();
  const { data: job, error } = await admin.from("marketing_work_jobs").select("id, name, kind, status, steps, due_date").eq("creative_task_id", id).maybeSingle();
  if (error) return NextResponse.json({ data: null, error: "โหลดงานชุดรุ่นไม่สำเร็จ: " + error.message }, { status: 500 });
  if (!job) return NextResponse.json({ data: null, error: null });
  const { data: its } = await admin.from("marketing_work_job_items").select("step_done, step_skip").eq("job_id", job.id).limit(20_000);
  const steps = Array.isArray(job.steps) ? (job.steps as WorkStep[]) : [];
  const p = jobProgress(((its ?? []) as { step_done: StepDone | null; step_skip: StepSkip | null }[]).map((x) => ({ step_done: x.step_done ?? {}, step_skip: x.step_skip ?? {} })), steps);
  const kind = kindInfo((job.kind as WorkJobKind) ?? "custom");
  return NextResponse.json({
    data: {
      id: job.id, name: job.name, status: job.status, kind_label: kind.label, kind_icon: kind.icon, due_date: job.due_date,
      steps: steps.map((s) => s.label), models: p.models, models_done: p.modelsDone, steps_done: p.stepsDone, steps_total: p.stepsTotal, pct: p.pct,
    },
    error: null,
  });
}
