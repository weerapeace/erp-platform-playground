import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { isUuid } from "@/lib/marketing/sku-list";
import { actorOf, createLinkedTask, loadJob, syncLinkedTask } from "@/lib/marketing/work-jobs-db";

export const dynamic = "force-dynamic";

// 🛠 งานชุดรุ่น ↔ 📋 Task Manager (งาน Creative 1 ใบ) — ดู lib/marketing/work-jobs-db (createLinkedTask / syncLinkedTask)
type Ctx = { params: Promise<{ id: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });

// POST → ส่งงานนี้เข้า Task Manager (สร้างการ์ดงาน ผูกไว้ · ผูกอยู่แล้ว = คืนตัวเดิม)
export async function POST(request: NextRequest, { params }: Ctx) {
  const denied = await guardApi(request, "marketing.sku.manage");
  if (denied) return denied;
  const deniedTask = await guardApi(request, "tasks.create");
  if (deniedTask) return deniedTask;
  const { id } = await params;
  if (!isUuid(id)) return bad("ไม่พบงาน", 404);
  const admin = supabaseAdmin();
  const job = await loadJob(admin, id);
  if (!job) return bad("ไม่พบงาน (อาจถูกลบไปแล้ว)", 404);
  const actor = await actorOf(request, admin);
  const r = await createLinkedTask(admin, job, actor);
  if ("error" in r) return bad(r.error, 500);
  if (!r.created) await syncLinkedTask(admin, id, actor);
  return NextResponse.json({ data: { task_id: r.taskId, task_no: r.taskNo, created: r.created }, error: null });
}

// DELETE → เลิกผูก (การ์ดใน Task Manager ยังอยู่ แค่ไม่ซิงก์ความคืบหน้าแล้ว)
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const denied = await guardApi(request, "marketing.sku.manage");
  if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return bad("ไม่พบงาน", 404);
  const admin = supabaseAdmin();
  const job = await loadJob(admin, id);
  if (!job) return bad("ไม่พบงาน (อาจถูกลบไปแล้ว)", 404);
  const { error } = await admin.from("marketing_work_jobs").update({ creative_task_id: null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return bad("เลิกผูกไม่สำเร็จ: " + error.message, 500);
  const actor = await actorOf(request, admin);
  await writeAudit(admin, {
    action: "marketing.work.unlink_task", entityType: "marketing_work_jobs", entityId: id, actorId: actor.id, actorName: actor.name,
    metadata: { job_name: job.name, task_id: job.creative_task_id, task_no: job.creative_task_no },
  });
  return NextResponse.json({ data: { unlinked: true }, error: null });
}
