import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { isUuid } from "@/lib/marketing/sku-list";
import { assigneesOf, cleanAssignees, cleanSteps, MAX_JOB_NAME } from "@/lib/marketing/work-jobs";
import { actorOf, countWorkNotes, JOB_COLS, loadJob, loadJobItems, syncLinkedTask, toJob } from "@/lib/marketing/work-jobs-db";
import { WORK_NOTE_ENTITY } from "@/lib/marketing/work-jobs";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET → งาน + รุ่นในงาน (พร้อมรหัส/ชื่อ/รูป/ราคา/ที่ติ๊กแล้ว)
export async function GET(request: NextRequest, { params }: Ctx) {
  const denied = await guardApi(request, "marketing.sku.view");
  if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ data: null, error: "ไม่พบงาน" }, { status: 404 });
  const admin = supabaseAdmin();
  const job = await loadJob(admin, id);
  if (!job) return NextResponse.json({ data: null, error: "ไม่พบงาน (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const r = await loadJobItems(admin, id);
  if ("error" in r) return NextResponse.json({ data: null, error: r.error }, { status: 500 });
  const jobNotes = await countWorkNotes(admin, WORK_NOTE_ENTITY.job, [id]);
  return NextResponse.json({ data: { job: { ...job, note_count: jobNotes.get(id) ?? 0 }, items: r.items }, error: null });
}

// PATCH { name?, steps?, auto_label_id?, assignees?: [{id,name}], due_date?, status?, note? } → แก้หัวงาน (ยังรับ assignee_id แบบเดิมได้)
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const denied = await guardApi(request, "marketing.sku.manage");
  if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ data: null, error: "ไม่พบงาน" }, { status: 404 });
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  if ("name" in b) {
    const name = String(b.name ?? "").trim();
    if (!name) return NextResponse.json({ data: null, error: "ใส่ชื่องานก่อน" }, { status: 400 });
    if (name.length > MAX_JOB_NAME) return NextResponse.json({ data: null, error: `ชื่องานยาวเกิน ${MAX_JOB_NAME} ตัวอักษร` }, { status: 400 });
    patch.name = name;
  }
  if ("steps" in b) patch.steps = cleanSteps(b.steps);
  if ("auto_label_id" in b) {
    if (b.auto_label_id && !isUuid(b.auto_label_id)) return NextResponse.json({ data: null, error: "ป้ายไม่ถูกต้อง" }, { status: 400 });
    patch.auto_label_id = b.auto_label_id || null;
  }
  if ("assignees" in b || "assignee_id" in b) {
    if (!("assignees" in b) && b.assignee_id && !isUuid(b.assignee_id)) return NextResponse.json({ data: null, error: "ผู้รับผิดชอบไม่ถูกต้อง" }, { status: 400 });
    // ผู้รับผิดชอบหลายคน · คนแรก = assignee_id/assignee_name (ของเก่าอ่านได้)
    const list = "assignees" in b ? cleanAssignees(b.assignees) : assigneesOf({ assignee_id: b.assignee_id, assignee_name: b.assignee_name });
    patch.assignees = list;
    patch.assignee_id = list[0]?.id ?? null;
    patch.assignee_name = list[0]?.name || null;
  }
  if ("due_date" in b) {
    const due = b.due_date ? String(b.due_date) : null;
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return NextResponse.json({ data: null, error: "วันครบกำหนดไม่ถูกต้อง" }, { status: 400 });
    patch.due_date = due;
  }
  if ("status" in b) {
    if (!["open", "done", "archived"].includes(String(b.status))) return NextResponse.json({ data: null, error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    patch.status = b.status;
  }
  if ("note" in b) patch.note = String(b.note ?? "").trim().slice(0, 1000) || null;
  if (!Object.keys(patch).length) return NextResponse.json({ data: null, error: "ไม่มีอะไรให้แก้" }, { status: 400 });

  const admin = supabaseAdmin();
  const before = await loadJob(admin, id);
  if (!before) return NextResponse.json({ data: null, error: "ไม่พบงาน (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { data, error } = await admin.from("marketing_work_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select(JOB_COLS).single();
  if (error || !data) return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ: " + (error?.message ?? "") }, { status: 500 });

  const actor = await actorOf(request, admin);
  const prev: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) prev[k] = (before as unknown as Record<string, unknown>)[k];
  await writeAudit(admin, {
    action: "marketing.work.update", entityType: "marketing_work_jobs", entityId: id, actorId: actor.id, actorName: actor.name,
    metadata: { job_name: before.name, changes: patch, before: prev },
  });
  if ("status" in patch || "steps" in patch) await syncLinkedTask(admin, id, actor);   // ปิด/เปิดงาน · เปลี่ยนขั้นตอน → การ์ดใน Task Manager
  return NextResponse.json({ data: { job: toJob(data as Record<string, unknown>) }, error: null });
}

// DELETE → ลบงาน (รุ่นในงาน/ที่ติ๊กไว้หายด้วย · ป้ายที่ติดให้รุ่นไปแล้วไม่ถูกเอาออก)
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const denied = await guardApi(request, "marketing.sku.manage");
  if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ data: null, error: "ไม่พบงาน" }, { status: 404 });
  const admin = supabaseAdmin();
  const job = await loadJob(admin, id);
  if (!job) return NextResponse.json({ data: null, error: "ไม่พบงาน (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { data: items } = await admin.from("marketing_work_job_items").select("parent_sku_id, discount_value, discount_unit, step_done").eq("job_id", id).limit(5000);
  const { error } = await admin.from("marketing_work_jobs").delete().eq("id", id);
  if (error) return NextResponse.json({ data: null, error: "ลบไม่สำเร็จ: " + error.message }, { status: 500 });
  const actor = await actorOf(request, admin);
  await writeAudit(admin, {
    action: "marketing.work.delete", entityType: "marketing_work_jobs", entityId: id, actorId: actor.id, actorName: actor.name,
    metadata: { job: job, items: items ?? [] },   // เก็บของเดิมไว้ทั้งก้อน เผื่อต้องย้อนดู
  });
  return NextResponse.json({ data: { deleted: true }, error: null });
}
