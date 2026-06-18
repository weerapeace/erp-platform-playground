/**
 * Creative Tasks API — งานหลัก (list + create)
 *
 * GET  /api/creative-tasks?search=&status=&priority=&task_type=&campaign_id=&assignee_id=&brand_id=&include_inactive=1&sort_by=&sort_dir=
 * POST /api/creative-tasks  body = { title, ...fields, subtasks?: [{title, assignee_id?}] }
 *
 * ของกลาง: guardApi (tasks.view/tasks.create) + writeAudit → audit_logs + erp_notifications
 * Join: brands / erp_creative_campaigns / skus_v2 / employees (assignee/reviewer/approver)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../master-v2/[entity]/route";
import { defaultStatusKey, getStatusMeta } from "@/lib/creative-statuses-server";
import { nextTaskNo, notify, employeeLabelMap, employeeAuthId, setSubtaskAssignees } from "@/lib/creative-tasks-server";
import { SELECT, flattenTask } from "./shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SORTABLE = ["task_no", "title", "status", "priority", "due_date", "created_at", "updated_at", "progress_percent"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const search    = (searchParams.get("search") ?? "").trim();
  const status    = (searchParams.get("status") ?? "").trim();
  const priority  = (searchParams.get("priority") ?? "").trim();
  const taskType  = (searchParams.get("task_type") ?? "").trim();
  const campaign  = (searchParams.get("campaign_id") ?? "").trim();
  const assignee  = (searchParams.get("assignee_id") ?? "").trim();
  const brandId   = (searchParams.get("brand_id") ?? "").trim();
  const mine      = searchParams.get("mine") === "1";
  const includeInactive = searchParams.get("include_inactive") === "1";
  const limit  = Math.min(1000, Math.max(1, parseInt(searchParams.get("limit") ?? "300", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
  const sortBy = searchParams.get("sort_by");
  const orderCol = sortBy && SORTABLE.includes(sortBy) ? sortBy : "updated_at";
  const orderAsc = sortBy ? searchParams.get("sort_dir") === "asc" : false;

  const admin = supabaseAdmin();

  // mine=1 → เฉพาะงานที่ฉันรับผิดชอบ (assignee = user จริงที่ login อยู่)
  let myUserId: string | null = null;
  if (mine) {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    myUserId = user?.id ?? null;
    if (!myUserId) return NextResponse.json({ data: [], total: 0, error: null });
  }

  let q = admin.from("erp_creative_tasks").select(SELECT, { count: "exact" })
    .order(orderCol, { ascending: orderAsc })
    .range(offset, offset + limit - 1);
  if (!includeInactive) q = q.eq("is_active", true);
  if (myUserId) q = q.eq("assignee_id", myUserId);
  if (search)   { const t = `%${search}%`; q = q.or(`title.ilike.${t},task_no.ilike.${t},product_name.ilike.${t}`); }
  if (status)   q = q.eq("status", status);
  if (priority) q = q.eq("priority", priority);
  if (taskType) q = q.eq("task_type", taskType);
  if (campaign) q = q.eq("campaign_id", campaign);
  if (assignee) q = q.eq("assignee_id", assignee);
  if (brandId)  q = q.eq("brand_id", brandId);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ data: [], total: 0, error: friendlyDbError(error.message) }, { status: 500 });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const empMap = await employeeLabelMap(admin, rows.flatMap((r) => [r.assignee_id as string, r.reviewer_id as string, r.approver_id as string]));
  const items = rows.map((r) => flattenTask(r, empMap));
  return NextResponse.json({ data: items, total: count ?? items.length, error: null });
}

type CreateBody = {
  title?: string; description?: string | null; task_type?: string | null;
  brand_id?: string | null; campaign_id?: string | null; sku_id?: string | null; parent_sku_id?: string | null; product_name?: string | null;
  sku_ids?: string[]; parent_sku_ids?: string[];
  priority?: string; status?: string; progress_percent?: number | null;
  assignee_id?: string | null; reviewer_id?: string | null; approver_id?: string | null;
  start_date?: string | null; due_date?: string | null;
  asset_status?: string | null; platforms?: string[] | null;
  drive_folder_url?: string | null;
  subtasks?: { title: string; description?: string | null; assignee_id?: string | null; assignee_ids?: string[]; required_before_next?: boolean }[];
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.create"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "กรุณาใส่ชื่องาน" }, { status: 400 });

  const admin = supabaseAdmin();
  const status = (body.status as string) || (await defaultStatusKey(admin));
  const statusMeta = await getStatusMeta(admin, status);
  const progress = typeof body.progress_percent === "number" ? body.progress_percent : (statusMeta?.progress_percent ?? 0);

  const insertRow = (taskNo: string) => ({
    task_no: taskNo, title, description: body.description?.trim() || null, task_type: body.task_type || null,
    brand_id: body.brand_id || null, campaign_id: body.campaign_id || null, sku_id: body.sku_id || null,
    parent_sku_id: body.parent_sku_id || null,
    product_name: body.product_name?.trim() || null, priority: body.priority || "normal", status,
    progress_percent: progress, assignee_id: body.assignee_id || null, reviewer_id: body.reviewer_id || null,
    approver_id: body.approver_id || null, start_date: body.start_date || null, due_date: body.due_date || null,
    asset_status: body.asset_status || "missing", platforms: body.platforms ?? [],
    drive_folder_url: body.drive_folder_url?.trim() || null, created_by: user?.id ?? null,
  });

  // เลขรันชนกัน (unique) → retry อีกครั้ง
  let taskNo = await nextTaskNo(admin);
  let { data: row, error } = await admin.from("erp_creative_tasks").insert(insertRow(taskNo)).select("id, task_no").single();
  if (error && /duplicate|unique/i.test(error.message)) {
    taskNo = await nextTaskNo(admin);
    ({ data: row, error } = await admin.from("erp_creative_tasks").insert(insertRow(taskNo)).select("id, task_no").single());
  }
  if (error || !row) return NextResponse.json({ error: friendlyDbError(error?.message ?? "insert failed") }, { status: 400 });

  // งานย่อยเริ่มต้น (ถ้าส่งมาจาก template) — รองรับ description + ผู้รับผิดชอบหลายคน
  if (Array.isArray(body.subtasks) && body.subtasks.length > 0) {
    const steps = body.subtasks.filter((s) => s?.title?.trim());
    if (steps.length) {
      const { data: subs } = await admin.from("erp_creative_subtasks")
        .insert(steps.map((s, i) => ({ task_id: row!.id, title: s.title.trim(), description: s.description ?? null, assignee_id: s.assignee_ids?.[0] || s.assignee_id || null, required_before_next: !!s.required_before_next, sort_order: i })))
        .select("id");
      const subIds = (subs ?? []) as { id: string }[];
      for (let i = 0; i < subIds.length; i++) {
        const ids = steps[i]?.assignee_ids;
        if (Array.isArray(ids) && ids.length) await setSubtaskAssignees(admin, subIds[i].id, ids);
      }
    }
  }

  // แพลตฟอร์ม m2m → junction (Phase A) — map code→id; ยังเขียน text[] คู่ขนานไว้ (insertRow) เป็น fallback
  if (Array.isArray(body.platforms) && body.platforms.length) {
    const { data: pf } = await admin.from("erp_platforms").select("id, code").in("code", body.platforms);
    const links = (pf ?? []).map((p) => ({ task_id: row!.id, platform_id: p.id as string }));
    if (links.length) await admin.from("erp_creative_task_platforms").insert(links);
  }

  // SKU / Parent SKU m2m → junction (② คง sku_id/parent_sku_id เดิม = ตัวแรก เป็น fallback)
  const skuIds = [...new Set((Array.isArray(body.sku_ids) ? body.sku_ids : (body.sku_id ? [body.sku_id] : [])).filter(Boolean))];
  if (skuIds.length) await admin.from("erp_creative_task_skus").insert(skuIds.map((s) => ({ task_id: row!.id, sku_id: s })));
  const parentIds = [...new Set((Array.isArray(body.parent_sku_ids) ? body.parent_sku_ids : (body.parent_sku_id ? [body.parent_sku_id] : [])).filter(Boolean))];
  if (parentIds.length) await admin.from("erp_creative_task_parent_skus").insert(parentIds.map((p) => ({ task_id: row!.id, parent_sku_id: p })));

  await writeAudit(admin, {
    action: "create", entityType: "creative_task", entityId: row.id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { task_no: taskNo, title },
  });

  // แจ้งเตือนผู้รับผิดชอบ (แปลง employee → auth user id ก่อน; ไม่มีบัญชีคู่ = ข้าม)
  if (body.assignee_id) {
    const authId = await employeeAuthId(admin, body.assignee_id);
    if (authId) {
      await notify(admin, {
        userId: authId, eventType: "task_assigned",
        title: `มอบหมายงานใหม่: ${title}`, body: taskNo, entityId: row.id, priority: "normal",
      });
    }
  }

  return NextResponse.json({ id: row.id, task_no: taskNo, error: null });
}
