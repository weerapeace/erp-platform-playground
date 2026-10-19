/**
 * 🛠 โหมดทำงาน — ตัวช่วยฝั่งเซิร์ฟเวอร์ (ใช้ร่วมกันทุก route ใน /api/marketing/work-jobs)
 *   โหลดงาน + สรุปความคืบหน้า · โหลดรุ่นในงาน (พร้อมรหัส/ชื่อ/รูป) · ใส่รุ่นเข้างาน (จำราคาเต็ม + ติดป้ายอัตโนมัติ)
 */
import type { NextRequest } from "next/server";
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { appBaseUrl, nextTaskNo, setTaskAssignees } from "@/lib/creative-tasks-server";
import { defaultStatusKey } from "@/lib/creative-statuses-server";
import {
  assigneesOf, jobProgress, round2, snapshotBasePrice,
  type DiscountUnit, type StepDone, type StepSkip, type WorkJob, type WorkJobItem, type WorkStep,
} from "@/lib/marketing/work-jobs";

type Admin = ReturnType<typeof supabaseAdmin>;

export const JOB_COLS = "id, name, kind, steps, auto_label_id, assignees, assignee_id, assignee_name, due_date, status, note, created_by_name, created_at, updated_at, creative_task_id, creative_task:erp_creative_tasks!creative_task_id(task_no, is_active)";
const ITEM_COLS = "id, job_id, parent_sku_id, base_price_min, base_price_max, discount_value, discount_unit, step_done, step_skip, note, sort_order";
const CHUNK = 200;

export type Actor = { id: string | null; name: string | null };

/** ผู้ทำ (ไว้บันทึก "ใครติ๊ก" + audit) — ชื่อจาก user_profiles ไม่มีใช้อีเมล */
export async function actorOf(request: NextRequest, admin: Admin): Promise<Actor> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return { id: null, name: null };
  const { data: prof } = await admin.from("user_profiles").select("display_name").eq("id", user.id).maybeSingle();
  return { id: user.id, name: (prof?.display_name as string | null) || user.email || null };
}

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function toJob(r: Record<string, unknown>): WorkJob {
  // งาน Creative ที่ผูกไว้ — ถูกลบ (is_active=false) = ถือว่ายังไม่ผูก (ส่งใหม่ได้)
  const ct = (Array.isArray(r.creative_task) ? r.creative_task[0] : r.creative_task) as { task_no?: string | null; is_active?: boolean } | null;
  const linked = !!r.creative_task_id && !!ct && ct.is_active !== false;
  return {
    id: String(r.id), name: String(r.name ?? ""), kind: (r.kind as WorkJob["kind"]) ?? "custom",
    steps: Array.isArray(r.steps) ? (r.steps as WorkStep[]) : [],
    auto_label_id: (r.auto_label_id as string | null) ?? null,
    assignees: assigneesOf(r),
    assignee_id: (r.assignee_id as string | null) ?? null, assignee_name: (r.assignee_name as string | null) ?? null,
    due_date: (r.due_date as string | null) ?? null, status: (r.status as WorkJob["status"]) ?? "open",
    note: (r.note as string | null) ?? null, created_by_name: (r.created_by_name as string | null) ?? null,
    created_at: String(r.created_at ?? ""), updated_at: String(r.updated_at ?? ""),
    creative_task_id: linked ? String(r.creative_task_id) : null,
    creative_task_no: linked ? (ct?.task_no ?? null) : null,
  };
}

/** รายการงาน + สรุป (จำนวนรุ่น / รุ่นที่ครบ / ขั้นตอนที่ติ๊กแล้ว) */
export async function loadJobs(admin: Admin, includeArchived: boolean): Promise<{ jobs: WorkJob[] } | { error: string }> {
  let q = admin.from("marketing_work_jobs").select(JOB_COLS).order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  if (!includeArchived) q = q.neq("status", "archived");
  const { data, error } = await q;
  if (error) return { error: "โหลดรายการงานไม่สำเร็จ: " + error.message };
  // งานที่ยังทำอยู่ก่อน → เสร็จแล้ว → เก็บแล้ว (ในกลุ่มเดียวกันคงลำดับกำหนดส่ง)
  const rank = { open: 0, done: 1, archived: 2 } as const;
  const jobs = (data ?? []).map((r) => toJob(r as Record<string, unknown>)).sort((a, b) => rank[a.status] - rank[b.status]);
  if (!jobs.length) return { jobs };
  const ids = jobs.map((j) => j.id);
  const byJob = new Map<string, { step_done: StepDone; step_skip: StepSkip }[]>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data: its, error: e2 } = await admin.from("marketing_work_job_items").select("job_id, step_done, step_skip").in("job_id", ids.slice(i, i + CHUNK)).limit(20_000);
    if (e2) return { error: "โหลดความคืบหน้าไม่สำเร็จ: " + e2.message };
    for (const it of its ?? []) {
      const k = String(it.job_id);
      if (!byJob.has(k)) byJob.set(k, []);
      byJob.get(k)!.push({ step_done: (it.step_done as StepDone) ?? {}, step_skip: (it.step_skip as StepSkip) ?? {} });
    }
  }
  return {
    jobs: jobs.map((j) => {
      const p = jobProgress(byJob.get(j.id) ?? [], j.steps);
      return { ...j, item_count: p.models, item_done: p.modelsDone, step_done_count: p.stepsDone };
    }),
  };
}

export async function loadJob(admin: Admin, id: string): Promise<WorkJob | null> {
  const { data } = await admin.from("marketing_work_jobs").select(JOB_COLS).eq("id", id).maybeSingle();
  return data ? toJob(data as Record<string, unknown>) : null;
}

/** รุ่นในงาน + รหัส/ชื่อ/รูป/แบรนด์/ป้าย (จาก view marketing_sku_overview) */
export async function loadJobItems(admin: Admin, jobId: string): Promise<{ items: WorkJobItem[] } | { error: string }> {
  const { data, error } = await admin.from("marketing_work_job_items").select(ITEM_COLS).eq("job_id", jobId)
    .order("sort_order").order("created_at").limit(5000);
  if (error) return { error: "โหลดรุ่นในงานไม่สำเร็จ: " + error.message };
  const rows = (data ?? []) as Record<string, unknown>[];
  const pids = [...new Set(rows.map((r) => String(r.parent_sku_id)))];
  const info = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < pids.length; i += CHUNK) {
    const { data: ov } = await admin.from("marketing_sku_overview")
      .select("parent_sku_id, code, name_th, cover_image_r2_key, brand_id, label_id").in("parent_sku_id", pids.slice(i, i + CHUNK));
    for (const o of ov ?? []) info.set(String(o.parent_sku_id), o as Record<string, unknown>);
    // รุ่นที่ถูกปิดใช้ไปแล้ว ไม่อยู่ใน view → ดึงรหัส/ชื่อจากตารางตรง
    const miss = pids.slice(i, i + CHUNK).filter((p) => !info.has(p));
    if (miss.length) {
      const { data: ps } = await admin.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key, brand_id").in("id", miss);
      for (const p of ps ?? []) info.set(String(p.id), { ...p, parent_sku_id: p.id, label_id: null });
    }
  }
  return {
    items: rows.map((r) => {
      const o = info.get(String(r.parent_sku_id)) ?? {};
      return {
        id: String(r.id), job_id: String(r.job_id), parent_sku_id: String(r.parent_sku_id),
        code: String(o.code ?? ""), name: String(o.name_th ?? o.code ?? ""), image_key: (o.cover_image_r2_key as string | null) ?? null,
        brand_id: (o.brand_id as string | null) ?? null, label_id: (o.label_id as string | null) ?? null,
        base_price_min: num(r.base_price_min), base_price_max: num(r.base_price_max),
        discount_value: num(r.discount_value), discount_unit: (r.discount_unit as DiscountUnit) ?? "percent",
        step_done: (r.step_done as StepDone) ?? {}, step_skip: (r.step_skip as StepSkip) ?? {}, note: (r.note as string | null) ?? null, sort_order: Number(r.sort_order) || 0,
      };
    }),
  };
}

/**
 * ใส่รุ่นเข้างาน: ข้ามรุ่นที่มีอยู่แล้ว · จำราคาเต็มตอนใส่ (ราคาขายของสีที่ยังเปิด) · ติดป้ายอัตโนมัติถ้างานตั้งไว้
 * คืน added = จำนวนที่เพิ่ม · skipped = มีอยู่แล้ว/ไม่พบ · labeled = รุ่นที่ถูกเปลี่ยนป้าย
 */
export async function addItemsToJob(admin: Admin, job: WorkJob, ids: string[], actor: Actor):
  Promise<{ added: number; skipped: number; labeled: number } | { error: string }> {
  if (!ids.length) return { added: 0, skipped: 0, labeled: 0 };
  // ต้องเป็นรุ่นที่มีอยู่จริง
  const { data: parents, error: pErr } = await admin.from("parent_skus_v2").select("id, sale_price, final_price").in("id", ids);
  if (pErr) return { error: "ตรวจรุ่นไม่สำเร็จ: " + pErr.message };
  const parentMap = new Map((parents ?? []).map((p) => [String(p.id), p]));
  const { data: existing } = await admin.from("marketing_work_job_items").select("parent_sku_id, sort_order").eq("job_id", job.id).limit(5000);
  const have = new Set((existing ?? []).map((e) => String(e.parent_sku_id)));
  const toAdd = ids.filter((id) => parentMap.has(id) && !have.has(id));
  if (!toAdd.length) return { added: 0, skipped: ids.length, labeled: 0 };

  // ราคาเต็ม: ราคาขาย (list_price) ของสี/แบบที่ยังเปิด → ไม่มีใช้ราคาระดับรุ่น
  const kidPrices = new Map<string, number[]>();
  for (let i = 0; i < toAdd.length; i += CHUNK) {
    const { data: kids } = await admin.from("skus_v2").select("parent_sku_id, list_price").in("parent_sku_id", toAdd.slice(i, i + CHUNK)).eq("is_active", true).limit(20_000);
    for (const k of kids ?? []) {
      const pid = String(k.parent_sku_id);
      if (!kidPrices.has(pid)) kidPrices.set(pid, []);
      kidPrices.get(pid)!.push(Number(k.list_price));
    }
  }
  let order = Math.max(0, ...(existing ?? []).map((e) => Number(e.sort_order) || 0));
  const now = new Date().toISOString();
  const rows = toAdd.map((pid) => {
    const p = parentMap.get(pid)!;
    const base = snapshotBasePrice(kidPrices.get(pid) ?? [], num(p.sale_price) || num(p.final_price));
    order += 10;
    return {
      job_id: job.id, parent_sku_id: pid, base_price_min: base.min, base_price_max: base.max,
      discount_unit: "percent", step_done: {}, sort_order: order, created_at: now, updated_at: now,
    };
  });
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin.from("marketing_work_job_items").upsert(rows.slice(i, i + CHUNK), { onConflict: "job_id,parent_sku_id", ignoreDuplicates: true });
    if (error) return { error: "ใส่รุ่นเข้างานไม่สำเร็จ: " + error.message };
  }

  // ติดป้ายหลักอัตโนมัติ (เช่น Clearance Products) — แทนป้ายเดิม · มีประวัติก่อนเปลี่ยน
  let labeled = 0;
  if (job.auto_label_id) {
    const { data: lb } = await admin.from("marketing_sku_labels").select("id").eq("id", job.auto_label_id).eq("kind", "status").maybeSingle();
    if (lb) {
      const { data: before } = await admin.from("marketing_skus").select("parent_sku_id, label_id").in("parent_sku_id", toAdd);
      const already = new Set((before ?? []).filter((b) => b.label_id === job.auto_label_id).map((b) => String(b.parent_sku_id)));
      const need = toAdd.filter((id) => !already.has(id));
      if (need.length) {
        const { error } = await admin.from("marketing_skus").upsert(need.map((parent_sku_id) => ({ parent_sku_id, label_id: job.auto_label_id, updated_at: now })), { onConflict: "parent_sku_id" });
        if (!error) {
          labeled = need.length;
          await writeAudit(admin, {
            action: "marketing.sku.update", entityType: "marketing_skus", entityId: need.length === 1 ? need[0] : null,
            actorId: actor.id, actorName: actor.name,
            metadata: { parent_sku_ids: need, changes: { label_id: job.auto_label_id }, before: before ?? [], via: `งาน "${job.name}"`, job_id: job.id },
          });
        }
      }
    }
  }

  await writeAudit(admin, {
    action: "marketing.work.items_add", entityType: "marketing_work_jobs", entityId: job.id, actorId: actor.id, actorName: actor.name,
    metadata: { job_name: job.name, parent_sku_ids: toAdd, labeled },
  });
  return { added: toAdd.length, skipped: ids.length - toAdd.length, labeled };
}

/** ราคาเต็มที่หน้าจอแก้เอง: ว่าง = null · ติดลบ/ไม่ใช่ตัวเลข = ผิด */
export function parsePrice(v: unknown): { ok: true; value: number | null } | { ok: false } {
  if (v == null || v === "") return { ok: true, value: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return { ok: false };
  return { ok: true, value: round2(n) };
}

// ── ↔ Task Manager (งาน Creative) ─────────────────────────────────────────

/** % + สถานะของการ์ดงานใน Task Manager ตามงานชุดรุ่น
 *  ปิดงาน = เสร็จ (100%) · เปิดใหม่ = กำลังทำ · เริ่มติ๊กแล้ว (งานยังรอคิว/พร้อมทำ) = กำลังทำ · ไม่ผูก = ไม่ทำอะไร */
export async function syncLinkedTask(admin: Admin, jobId: string, actor?: Actor): Promise<void> {
  const { data: job } = await admin.from("marketing_work_jobs").select("id, name, status, steps, creative_task_id").eq("id", jobId).maybeSingle();
  if (!job?.creative_task_id) return;
  const { data: task } = await admin.from("erp_creative_tasks").select("id, task_no, status, progress_percent, is_active").eq("id", job.creative_task_id).maybeSingle();
  if (!task || task.is_active === false) return;
  const { data: its } = await admin.from("marketing_work_job_items").select("step_done, step_skip").eq("job_id", jobId).limit(20_000);
  const steps = Array.isArray(job.steps) ? (job.steps as WorkStep[]) : [];
  const p = jobProgress(((its ?? []) as { step_done: StepDone | null; step_skip: StepSkip | null }[]).map((x) => ({ step_done: x.step_done ?? {}, step_skip: x.step_skip ?? {} })), steps);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  const st = String(task.status ?? "");
  if (job.status === "done" && st !== "done") { patch.status = "done"; patch.completed_at = now; }
  else if (job.status === "open" && st === "done") { patch.status = "in_progress"; patch.completed_at = null; }
  else if (job.status === "open" && p.stepsDone > 0 && (st === "backlog" || st === "ready")) patch.status = "in_progress";
  const pct = job.status === "done" ? 100 : p.pct;
  if (pct !== Number(task.progress_percent)) patch.progress_percent = pct;
  if (!Object.keys(patch).length) return;
  await admin.from("erp_creative_tasks").update({ ...patch, updated_at: now }).eq("id", task.id);
  if (patch.status) {
    await writeAudit(admin, {
      action: "status_change", entityType: "creative_task", entityId: String(task.id), actorId: actor?.id ?? null, actorName: actor?.name ?? null,
      metadata: { task_no: task.task_no, from: st, to: patch.status, reason: `ซิงก์จากงานชุดรุ่น “${job.name}”`, marketing_work_job_id: jobId },
    });
  }
}

/** สร้างงานใน Task Manager ผูกกับงานชุดรุ่น (ชื่อ · ผู้รับผิดชอบ · กำหนดส่ง · แบรนด์หลัก · ลิงก์กลับ) — ผูกอยู่แล้ว = คืนตัวเดิม */
export async function createLinkedTask(admin: Admin, job: WorkJob, actor: Actor): Promise<{ taskId: string; taskNo: string | null; created: boolean } | { error: string }> {
  if (job.creative_task_id) return { taskId: job.creative_task_id, taskNo: job.creative_task_no, created: false };
  const { data: its } = await admin.from("marketing_work_job_items").select("parent_sku_id, step_done, step_skip").eq("job_id", job.id).limit(20_000);
  const items = (its ?? []) as { parent_sku_id: string; step_done: StepDone | null; step_skip: StepSkip | null }[];
  const p = jobProgress(items.map((x) => ({ step_done: x.step_done ?? {}, step_skip: x.step_skip ?? {} })), job.steps);
  // แบรนด์ที่มีในงานมากสุด → ใส่ให้งาน (กรองตามแบรนด์ใน Task Manager ได้)
  let brandId: string | null = null;
  if (items.length) {
    const ids = items.map((x) => x.parent_sku_id).slice(0, 1000);
    const { data: ps } = await admin.from("parent_skus_v2").select("brand_id").in("id", ids);
    const cnt = new Map<string, number>();
    for (const r of (ps ?? []) as { brand_id: string | null }[]) if (r.brand_id) cnt.set(r.brand_id, (cnt.get(r.brand_id) ?? 0) + 1);
    brandId = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
  const status = job.status === "done" ? "done" : p.stepsDone > 0 ? "in_progress" : await defaultStatusKey(admin);
  const link = `${appBaseUrl()}/marketing/skus?job=${job.id}`;
  const description = [
    `🛠 งานชุดรุ่นจากหน้า SKU การตลาด — ${items.length.toLocaleString("th-TH")} รุ่น`,
    job.steps.length ? `ขั้นตอน: ${job.steps.map((s) => s.label).join(" → ")}` : "",
    job.note ? `หมายเหตุ: ${job.note}` : "",
    `ติ๊กความคืบหน้าที่: ${link}`,
  ].filter(Boolean).join("\n");
  const now = new Date().toISOString();
  const row = (taskNo: string) => ({
    task_no: taskNo, title: job.name, description, task_type: null, brand_id: brandId, priority: "normal", status,
    progress_percent: job.status === "done" ? 100 : p.pct, assignee_id: job.assignees[0]?.id ?? null,
    due_date: job.due_date, completed_at: status === "done" ? now : null, created_by: actor.id, assigned_by_id: actor.id,
  });
  let taskNo = await nextTaskNo(admin);
  let { data: created, error } = await admin.from("erp_creative_tasks").insert(row(taskNo)).select("id, task_no").single();
  if (error && /duplicate|unique/i.test(error.message)) {
    taskNo = await nextTaskNo(admin);
    ({ data: created, error } = await admin.from("erp_creative_tasks").insert(row(taskNo)).select("id, task_no").single());
  }
  if (error || !created) return { error: "สร้างงานใน Task Manager ไม่สำเร็จ: " + (error?.message ?? "") };
  const taskId = String(created.id);
  if (job.assignees.length) await setTaskAssignees(admin, taskId, job.assignees.map((a) => a.id));
  const { error: e2 } = await admin.from("marketing_work_jobs").update({ creative_task_id: taskId, updated_at: now }).eq("id", job.id);
  if (e2) return { error: `สร้างงาน ${created.task_no} แล้ว แต่ผูกกับงานชุดรุ่นไม่สำเร็จ: ${e2.message}` };
  await writeAudit(admin, {
    action: "create", entityType: "creative_task", entityId: taskId, actorId: actor.id, actorName: actor.name,
    metadata: { task_no: created.task_no, title: job.name, from_marketing_work_job: job.id },
  });
  await writeAudit(admin, {
    action: "marketing.work.link_task", entityType: "marketing_work_jobs", entityId: job.id, actorId: actor.id, actorName: actor.name,
    metadata: { job_name: job.name, task_id: taskId, task_no: created.task_no },
  });
  return { taskId, taskNo: (created.task_no as string | null) ?? null, created: true };
}
