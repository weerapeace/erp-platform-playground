/**
 * GET /api/creative-tasks/my-subtasks — งานย่อยที่มอบหมายให้ฉัน (ยังไม่เสร็จ/ไม่ยกเลิก + งานแม่ยัง active และยังไม่ปิด)
 * ใช้ junction m2m (erp_creative_subtask_assignees.user_id) เป็นหลัก
 * ช่องเดี่ยวระบบเก่า (subtasks.assignee_id) นับเฉพาะงานย่อยที่ "ยังไม่มีรายชื่อใน junction เลย"
 * (เดิมรวมทั้งคู่ → คนที่เคยถูกตั้งไว้แต่คนอื่นกดเริ่มทำไปแล้ว ยังเห็นงานนั้นค้างในรายการของตัวเอง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { terminalStatusKeys } from "@/lib/creative-statuses-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const me = user?.id ?? null;
  if (!me) return NextResponse.json({ data: [], error: null });

  const admin = supabaseAdmin();
  const [{ data: links }, { data: legacy }, terminal] = await Promise.all([
    admin.from("erp_creative_subtask_assignees").select("subtask_id").eq("user_id", me),
    admin.from("erp_creative_subtasks").select("id").eq("assignee_id", me),
    terminalStatusKeys(admin),
  ]);
  const legacyIds = ((legacy ?? []) as { id: string }[]).map((r) => r.id);
  const { data: legacyWithList } = legacyIds.length
    ? await admin.from("erp_creative_subtask_assignees").select("subtask_id").in("subtask_id", legacyIds)
    : { data: [] as { subtask_id: string }[] };
  const hasList = new Set(((legacyWithList ?? []) as { subtask_id: string }[]).map((r) => String(r.subtask_id)));
  const ids = [...new Set([
    ...((links ?? []) as { subtask_id: string }[]).map((r) => r.subtask_id),
    ...legacyIds.filter((id) => !hasList.has(String(id))),
  ])];
  if (!ids.length) return NextResponse.json({ data: [], error: null });

  const { data, error } = await admin.from("erp_creative_subtasks")
    .select("id, title, title_en, status, due_date, required_before_next, subtask_type, task_id, task:erp_creative_tasks!task_id(task_no, title, status, is_active, priority, cover_image_r2_key)")
    .in("id", ids)
    .not("status", "in", "(done,posted,approved,canceled)")
    .order("due_date", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });

  const rows = ((data ?? []) as Record<string, unknown>[]).filter((r) => {
    // งานหลักปิดแล้ว (เสร็จ/ยกเลิก) → งานย่อยไม่ใช่งานที่ต้องทำอีก
    const t = (Array.isArray(r.task) ? r.task[0] : r.task) as Record<string, unknown> | null;
    return !(t?.status && terminal.has(String(t.status)));
  }).map((r) => {
    const t = (Array.isArray(r.task) ? r.task[0] : r.task) as Record<string, unknown> | null;
    return {
      id: r.id, title: r.title, title_en: r.title_en ?? null, status: r.status, due_date: r.due_date, required_before_next: r.required_before_next,
      subtask_type: (r.subtask_type as string | null) ?? null, type_color: null as string | null, type_icon: null as string | null,
      task_id: r.task_id as string, task_no: t?.task_no ?? null, task_title: t?.title ?? null, task_status: t?.status ?? null,
      priority: t?.priority ?? null,
      cover_image_r2_key: (t?.cover_image_r2_key as string | null) ?? null,
      task_active: t?.is_active ?? true,
    };
  }).filter((r) => r.task_active);

  // สี/ไอคอน ตามชนิดงานย่อย (จาก registry erp_subtask_types)
  const { data: subTypes } = await admin.from("erp_subtask_types").select("key, color, icon");
  const typeMeta = new Map<string, { color: string | null; icon: string | null }>();
  for (const ty of ((subTypes ?? []) as { key: string; color: string | null; icon: string | null }[])) typeMeta.set(ty.key, { color: ty.color, icon: ty.icon });
  for (const r of rows) { const m = r.subtask_type ? typeMeta.get(r.subtask_type) : null; r.type_color = m?.color ?? null; r.type_icon = m?.icon ?? null; }

  // รูปปก fallback: งานที่ไม่มี cover เอง → ใช้รูป Parent SKU ที่ผูกกับงาน
  const needCover = [...new Set(rows.filter((r) => !r.cover_image_r2_key).map((r) => r.task_id))];
  if (needCover.length) {
    const { data: pl } = await admin.from("erp_creative_task_parent_skus").select("task_id, parent_sku_id").in("task_id", needCover);
    const taskToParent = new Map<string, string>();
    for (const r of ((pl ?? []) as { task_id: string; parent_sku_id: string }[])) if (r.parent_sku_id && !taskToParent.has(r.task_id)) taskToParent.set(r.task_id, r.parent_sku_id);
    const parentIds = [...new Set([...taskToParent.values()])];
    if (parentIds.length) {
      const { data: ps } = await admin.from("parent_skus_v2").select("id, cover_image_r2_key").in("id", parentIds);
      const parentCover = new Map<string, string | null>();
      for (const p of ((ps ?? []) as { id: string; cover_image_r2_key: string | null }[])) parentCover.set(p.id, p.cover_image_r2_key);
      for (const r of rows) if (!r.cover_image_r2_key) { const pid = taskToParent.get(r.task_id); if (pid) r.cover_image_r2_key = parentCover.get(pid) ?? null; }
    }
  }

  return NextResponse.json({ data: rows, error: null });
}
