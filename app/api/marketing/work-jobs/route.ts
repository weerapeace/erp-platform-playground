import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { cleanIds, isUuid } from "@/lib/marketing/sku-list";
import { cleanSteps, isJobKind, kindInfo, stepsFromLabels, MAX_JOB_NAME } from "@/lib/marketing/work-jobs";
import { actorOf, addItemsToJob, JOB_COLS, loadJobs, toJob } from "@/lib/marketing/work-jobs-db";

export const dynamic = "force-dynamic";

// 🛠 โหมดทำงาน (หน้า SKU การตลาด) — งาน = หลายรุ่น + เช็กลิสต์ · ดู lib/marketing/work-jobs.ts

// GET ?all=1 → รายการงาน + สรุปความคืบหน้า (ค่าเริ่ม: ไม่รวมงานที่เก็บแล้ว)
export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "marketing.sku.view");
  if (denied) return denied;
  const all = new URL(request.url).searchParams.get("all") === "1";
  const r = await loadJobs(supabaseAdmin(), all);
  if ("error" in r) return NextResponse.json({ data: null, error: r.error }, { status: 500 });
  return NextResponse.json({ data: r, error: null });
}

// POST { name, kind, steps?, auto_label_id?, assignee_id?, assignee_name?, due_date?, note?, parent_sku_ids? } → สร้างงาน (+ ใส่รุ่นเลยได้)
export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "marketing.sku.manage");
  if (denied) return denied;
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }

  const name = String(b.name ?? "").trim();
  if (!name) return NextResponse.json({ data: null, error: "ใส่ชื่องานก่อน" }, { status: 400 });
  if (name.length > MAX_JOB_NAME) return NextResponse.json({ data: null, error: `ชื่องานยาวเกิน ${MAX_JOB_NAME} ตัวอักษร` }, { status: 400 });
  const kind = isJobKind(b.kind) ? b.kind : "custom";
  const steps = "steps" in b ? cleanSteps(b.steps) : stepsFromLabels(kindInfo(kind).steps);
  const due = b.due_date ? String(b.due_date) : null;
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return NextResponse.json({ data: null, error: "วันครบกำหนดไม่ถูกต้อง" }, { status: 400 });
  if (b.assignee_id != null && b.assignee_id !== "" && !isUuid(b.assignee_id)) return NextResponse.json({ data: null, error: "ผู้รับผิดชอบไม่ถูกต้อง" }, { status: 400 });
  if (b.auto_label_id != null && b.auto_label_id !== "" && !isUuid(b.auto_label_id)) return NextResponse.json({ data: null, error: "ป้ายไม่ถูกต้อง" }, { status: 400 });

  const admin = supabaseAdmin();
  const actor = await actorOf(request, admin);
  const now = new Date().toISOString();
  const { data, error } = await admin.from("marketing_work_jobs").insert({
    name, kind, steps,
    auto_label_id: b.auto_label_id || null,
    assignee_id: b.assignee_id || null,
    assignee_name: b.assignee_id ? String(b.assignee_name ?? "").trim().slice(0, 120) || null : null,
    due_date: due, note: String(b.note ?? "").trim().slice(0, 1000) || null,
    created_by: actor.id, created_by_name: actor.name, created_at: now, updated_at: now,
  }).select(JOB_COLS).single();
  if (error || !data) return NextResponse.json({ data: null, error: "สร้างงานไม่สำเร็จ: " + (error?.message ?? "") }, { status: 500 });
  const job = toJob(data as Record<string, unknown>);
  await writeAudit(admin, {
    action: "marketing.work.create", entityType: "marketing_work_jobs", entityId: job.id, actorId: actor.id, actorName: actor.name,
    metadata: { name, kind, steps: steps.map((s) => s.label), assignee_name: job.assignee_name, due_date: due, auto_label_id: job.auto_label_id },
  });

  // ใส่รุ่นที่ติ๊กมาจากหน้าการ์ด/ตารางเลย
  const ids = cleanIds(b.parent_sku_ids);
  let added = { added: 0, skipped: 0, labeled: 0 };
  if (ids.length) {
    const r = await addItemsToJob(admin, job, ids, actor);
    if ("error" in r) return NextResponse.json({ data: { job, added: 0 }, error: "สร้างงานแล้ว แต่ใส่รุ่นไม่สำเร็จ: " + r.error }, { status: 207 });
    added = r;
  }
  return NextResponse.json({ data: { job, ...added }, error: null });
}
