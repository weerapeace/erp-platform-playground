import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { cleanIds, isUuid } from "@/lib/marketing/sku-list";
import { discountProblem, type DiscountUnit, type StepDone, type StepSkip } from "@/lib/marketing/work-jobs";
import { actorOf, addItemsToJob, loadJob, parsePrice } from "@/lib/marketing/work-jobs-db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });

// POST { parent_sku_ids } → ใส่รุ่นเข้างาน (ข้ามที่มีอยู่แล้ว · จำราคาเต็ม · ติดป้ายอัตโนมัติถ้างานตั้งไว้)
export async function POST(request: NextRequest, { params }: Ctx) {
  const denied = await guardApi(request, "marketing.sku.manage");
  if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return bad("ไม่พบงาน", 404);
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return bad("invalid JSON"); }
  const ids = cleanIds(b.parent_sku_ids);
  if (!ids.length) return bad("ยังไม่ได้เลือกรุ่น");
  const admin = supabaseAdmin();
  const job = await loadJob(admin, id);
  if (!job) return bad("ไม่พบงาน (อาจถูกลบไปแล้ว)", 404);
  const r = await addItemsToJob(admin, job, ids, await actorOf(request, admin));
  if ("error" in r) return bad(r.error, 500);
  return NextResponse.json({ data: r, error: null });
}

// PATCH
//   { item_ids: string[], step_key, done: boolean }   → ติ๊ก/เอาติ๊กออก ขั้นตอนหนึ่ง (หลายรุ่นพร้อมกันได้)
//   { item_ids: string[], step_key, skip: boolean }   → ตั้ง "ไม่ต้องทำ" / กลับมาต้องทำ ขั้นตอนหนึ่ง (หลายรุ่น)
//   { item_id, discount_value?, discount_unit?, base_price_min?, base_price_max?, note? } → แก้ราคา/หมายเหตุของรุ่น
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const denied = await guardApi(request, "marketing.sku.manage");
  if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return bad("ไม่พบงาน", 404);
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return bad("invalid JSON"); }
  const admin = supabaseAdmin();
  const job = await loadJob(admin, id);
  if (!job) return bad("ไม่พบงาน (อาจถูกลบไปแล้ว)", 404);
  const actor = await actorOf(request, admin);
  const now = new Date().toISOString();

  // ── ตั้ง "ไม่ต้องทำ" ขั้นตอนนี้ สำหรับรุ่นที่เลือก (skip=true) / กลับมาต้องทำ (skip=false) ──
  //   ตั้งไม่ต้องทำ → เอาติ๊ก "ทำแล้ว" ของขั้นนั้นออกด้วย (ไม่นับซ้ำ) · ความคืบหน้านับเฉพาะขั้นที่ต้องทำ
  if ("step_key" in b && "skip" in b) {
    const step = job.steps.find((s) => s.key === b.step_key);
    if (!step) return bad("ไม่พบขั้นตอนนี้ในงาน (อาจถูกลบไปแล้ว) ลองโหลดหน้าใหม่");
    const ids = cleanIds(b.item_ids, 1000);
    if (!ids.length) return bad("ยังไม่ได้เลือกรุ่น");
    const skip = b.skip === true;
    const { data: rows, error } = await admin.from("marketing_work_job_items").select("id, parent_sku_id, step_done, step_skip").eq("job_id", id).in("id", ids);
    if (error) return bad("โหลดรุ่นไม่สำเร็จ: " + error.message, 500);
    let changed = 0;
    for (const r of rows ?? []) {
      const sk = { ...((r.step_skip as StepSkip) ?? {}) };
      if (skip === !!sk[step.key]) continue;
      const sd = { ...((r.step_done as StepDone) ?? {}) };
      if (skip) { sk[step.key] = { at: now, by: actor.name }; delete sd[step.key]; }
      else delete sk[step.key];
      const { error: e2 } = await admin.from("marketing_work_job_items").update({ step_skip: sk, step_done: sd, updated_at: now }).eq("id", r.id);
      if (e2) return bad(`บันทึกไม่สำเร็จ (สำเร็จไปแล้ว ${changed} รุ่น): ` + e2.message, 500);
      changed++;
    }
    if (changed) {
      await writeAudit(admin, {
        action: "marketing.work.skip", entityType: "marketing_work_jobs", entityId: id, actorId: actor.id, actorName: actor.name,
        metadata: { job_name: job.name, step: step.label, skip, item_ids: (rows ?? []).map((r) => r.id), parent_sku_ids: (rows ?? []).map((r) => r.parent_sku_id) },
      });
    }
    return NextResponse.json({ data: { changed, at: now, by: actor.name }, error: null });
  }

  // ── ติ๊กขั้นตอน ──
  if ("step_key" in b) {
    const step = job.steps.find((s) => s.key === b.step_key);
    if (!step) return bad("ไม่พบขั้นตอนนี้ในงาน (อาจถูกลบไปแล้ว) ลองโหลดหน้าใหม่");
    const ids = cleanIds(b.item_ids, 1000);
    if (!ids.length) return bad("ยังไม่ได้เลือกรุ่น");
    const done = b.done === true;
    const { data: rows, error } = await admin.from("marketing_work_job_items").select("id, parent_sku_id, step_done, step_skip").eq("job_id", id).in("id", ids);
    if (error) return bad("โหลดรุ่นไม่สำเร็จ: " + error.message, 500);
    let changed = 0;
    for (const r of rows ?? []) {
      const cur = { ...((r.step_done as StepDone) ?? {}) };
      if (done === !!cur[step.key]) continue;
      if (done && (r.step_skip as StepSkip | null)?.[step.key]) continue;   // ขั้นที่ตั้ง "ไม่ต้องทำ" ไว้ ติ๊กไม่ได้ (เอา "ไม่ต้องทำ" ออกก่อน)
      if (done) cur[step.key] = { at: now, by: actor.name };
      else delete cur[step.key];
      const { error: e2 } = await admin.from("marketing_work_job_items").update({ step_done: cur, updated_at: now }).eq("id", r.id);
      if (e2) return bad(`บันทึกไม่สำเร็จ (สำเร็จไปแล้ว ${changed} รุ่น): ` + e2.message, 500);
      changed++;
    }
    if (changed) {
      await writeAudit(admin, {
        action: "marketing.work.step", entityType: "marketing_work_jobs", entityId: id, actorId: actor.id, actorName: actor.name,
        metadata: { job_name: job.name, step: step.label, done, item_ids: (rows ?? []).map((r) => r.id), parent_sku_ids: (rows ?? []).map((r) => r.parent_sku_id) },
      });
    }
    return NextResponse.json({ data: { changed, at: now, by: actor.name }, error: null });
  }

  // ── แก้ราคา / หมายเหตุ ของรุ่นเดียว ──
  if (!isUuid(b.item_id)) return bad("ไม่พบรุ่นในงาน");
  const { data: item } = await admin.from("marketing_work_job_items")
    .select("id, parent_sku_id, base_price_min, base_price_max, discount_value, discount_unit, note").eq("id", b.item_id).eq("job_id", id).maybeSingle();
  if (!item) return bad("ไม่พบรุ่นในงาน (อาจถูกเอาออกไปแล้ว)", 404);

  const patch: Record<string, unknown> = {};
  for (const k of ["base_price_min", "base_price_max", "discount_value"] as const) {
    if (k in b) {
      const p = parsePrice(b[k]);
      if (!p.ok) return bad(k === "discount_value" ? "ส่วนลดต้องเป็นตัวเลขไม่ติดลบ" : "ราคาเต็มต้องเป็นตัวเลขไม่ติดลบ");
      patch[k] = p.value;
    }
  }
  // แก้ราคาเต็มช่องเดียว (ไม่มีช่วง) → ใช้ค่าเดียวกันทั้งต่ำสุด/สูงสุด
  if ("base_price_min" in patch && !("base_price_max" in patch)) patch.base_price_max = patch.base_price_min;
  if ("discount_unit" in b) {
    if (b.discount_unit !== "baht" && b.discount_unit !== "percent") return bad("หน่วยส่วนลดไม่ถูกต้อง");
    patch.discount_unit = b.discount_unit;
  }
  if ("note" in b) patch.note = String(b.note ?? "").trim().slice(0, 500) || null;
  if (!Object.keys(patch).length) return bad("ไม่มีอะไรให้แก้");

  const merged = { ...item, ...patch } as Record<string, unknown>;
  const minNum = (v: unknown) => (v == null ? null : Number(v));
  const baseMin = minNum(merged.base_price_min) ?? minNum(merged.base_price_max);
  if (minNum(merged.base_price_min) != null && minNum(merged.base_price_max) != null && Number(merged.base_price_min) > Number(merged.base_price_max)) {
    return bad("ราคาเต็มต่ำสุดมากกว่าสูงสุด");
  }
  const problem = discountProblem(baseMin, minNum(merged.discount_value), merged.discount_unit as DiscountUnit);
  if (problem) return bad(problem);

  const { error } = await admin.from("marketing_work_job_items").update({ ...patch, updated_at: now }).eq("id", item.id);
  if (error) return bad("บันทึกไม่สำเร็จ: " + error.message, 500);
  const prev: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) prev[k] = (item as Record<string, unknown>)[k];
  await writeAudit(admin, {
    action: "marketing.work.item_update", entityType: "marketing_work_jobs", entityId: id, actorId: actor.id, actorName: actor.name,
    metadata: { job_name: job.name, item_id: item.id, parent_sku_id: item.parent_sku_id, changes: patch, before: prev },
  });
  return NextResponse.json({ data: { updated: true }, error: null });
}

// DELETE { item_ids } → เอารุ่นออกจากงาน (ป้ายที่ติดให้ไปแล้วไม่ถูกเอาออก)
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const denied = await guardApi(request, "marketing.sku.manage");
  if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return bad("ไม่พบงาน", 404);
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return bad("invalid JSON"); }
  const ids = cleanIds(b.item_ids, 1000);
  if (!ids.length) return bad("ยังไม่ได้เลือกรุ่น");
  const admin = supabaseAdmin();
  const job = await loadJob(admin, id);
  if (!job) return bad("ไม่พบงาน (อาจถูกลบไปแล้ว)", 404);
  const { data: rows } = await admin.from("marketing_work_job_items").select("*").eq("job_id", id).in("id", ids);
  const { error } = await admin.from("marketing_work_job_items").delete().eq("job_id", id).in("id", ids);
  if (error) return bad("เอาออกไม่สำเร็จ: " + error.message, 500);
  const actor = await actorOf(request, admin);
  await writeAudit(admin, {
    action: "marketing.work.items_remove", entityType: "marketing_work_jobs", entityId: id, actorId: actor.id, actorName: actor.name,
    metadata: { job_name: job.name, removed: rows ?? [] },
  });
  return NextResponse.json({ data: { removed: (rows ?? []).length }, error: null });
}
