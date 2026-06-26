/**
 * Creative Task — รายตัว (detail / update / status / approval / soft-delete)
 *
 * GET    /api/creative-tasks/[id]            → งาน + subtasks + comments + attachments
 * PATCH  /api/creative-tasks/[id]            → แก้ฟิลด์ทั่วไป หรือ { action: "transition", to } / { action: "approve"|"reject"|"revise", comment }
 * DELETE /api/creative-tasks/[id]            → soft delete (is_active=false)
 *
 * ของกลาง: guardApi + writeAudit + erp_notifications + workflow กลาง (canTransition)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { SELECT, flattenTask } from "../shared";
import { canTransition as canTransitionDB, getStatusMeta } from "@/lib/creative-statuses-server";
import { notify, employeeLabelMap, employeeAuthId, subtaskAssigneesMap } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ฟิลด์ที่แก้ผ่าน PATCH ธรรมดาได้ (กันเขียนทับคอลัมน์ระบบ)
const EDITABLE = new Set([
  "title", "description", "task_type", "brand_id", "campaign_id", "sku_id", "product_name",
  "priority", "progress_percent", "assignee_id", "reviewer_id", "approver_id",
  "start_date", "due_date", "asset_status", "platforms",
  "drive_folder_url", "final_asset_url", "published_url", "blocker_reason",
]);

async function loadTask(admin: ReturnType<typeof supabaseAdmin>, id: string) {
  const { data, error } = await admin.from("erp_creative_tasks").select(SELECT).eq("id", id).maybeSingle();
  if (error) return { error: error.message, row: null as Record<string, unknown> | null };
  return { error: null, row: (data as Record<string, unknown> | null) };
}

// ---- GET detail ----
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { error, row } = await loadTask(admin, id);
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });

  const [{ data: subtasks }, { data: comments }, { data: attachments }, { data: skuLinks }, { data: parentLinks }] = await Promise.all([
    admin.from("erp_creative_subtasks").select("*").eq("task_id", id).order("sort_order", { ascending: true }),
    admin.from("erp_creative_comments").select("*").eq("task_id", id).order("created_at", { ascending: true }),
    admin.from("erp_creative_attachments").select("*").eq("task_id", id).order("created_at", { ascending: true }),
    admin.from("erp_creative_task_skus").select("sku:skus_v2!sku_id(id, code, name_th, color, color_th, list_price, cover_image_r2_key)").eq("task_id", id),
    admin.from("erp_creative_task_parent_skus").select("parent:parent_skus_v2!parent_sku_id(id, code, name_th)").eq("task_id", id),
  ]);

  const skus = ((skuLinks ?? []) as Record<string, unknown>[]).map((l) => { const s = (Array.isArray(l.sku) ? l.sku[0] : l.sku) as Record<string, unknown> | null; return s ? { id: s.id, code: s.code, name: s.name_th, color: (s.color_th as string) ?? (s.color as string) ?? null, price: s.list_price, image_key: s.cover_image_r2_key } : null; }).filter(Boolean);
  const parent_skus = ((parentLinks ?? []) as Record<string, unknown>[]).map((l) => { const p = (Array.isArray(l.parent) ? l.parent[0] : l.parent) as Record<string, unknown> | null; return p ? { id: p.id, code: p.code, name: p.name_th } : null; }).filter(Boolean);

  const subRows = (subtasks ?? []) as Record<string, unknown>[];
  // empMap (จาก row) กับ aMap (จาก subRows) อิสระต่อกัน → ยิงพร้อมกัน ลด round-trip ตอนเปิดงาน
  const [empMap, aMap] = await Promise.all([
    employeeLabelMap(admin, [row.assignee_id as string, row.reviewer_id as string, row.approver_id as string]),
    subtaskAssigneesMap(admin, subRows.map((s) => String(s.id))),
  ]);
  const task = flattenTask(row, empMap);

  // แยกไฟล์แนบ: ระดับงาน (subtask_id null) vs ระดับ subtask
  const allAtt = (attachments ?? []) as Record<string, unknown>[];
  const taskAtt = allAtt.filter((a) => !a.subtask_id);
  const subAtt = new Map<string, Record<string, unknown>[]>();
  for (const a of allAtt) { if (a.subtask_id) { const k = String(a.subtask_id); const arr = subAtt.get(k) ?? []; arr.push(a); subAtt.set(k, arr); } }

  const subs = subRows.map((s) => ({ ...s, assignees: aMap.get(String(s.id)) ?? [], attachments: subAtt.get(String(s.id)) ?? [] }));

  return NextResponse.json({ data: { ...task, subtasks: subs, comments: comments ?? [], attachments: taskAtt, skus, parent_skus }, error: null });
}

// ---- PATCH ----
type PatchBody = Record<string, unknown> & { action?: string; to?: string; comment?: string | null; actor?: string };

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: PatchBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { row: current, error: loadErr } = await loadTask(admin, id);
  if (loadErr) return NextResponse.json({ error: friendlyDbError(loadErr) }, { status: 500 });
  if (!current) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });

  const action = body.action ?? "update";
  const patch: Record<string, unknown> = {};
  let auditAction = "update";
  let notifyTarget: { empId: string | null; eventType: string; title: string } | null = null;

  if (action === "transition") {
    // เปลี่ยนสถานะตาม workflow (อ่านจาก DB) — force=true ข้ามกฎ (โหมดย้ายอิสระบน Canvas)
    const to = String(body.to ?? "");
    const from = String(current.status);
    const force = body.force === true;
    const meta = await getStatusMeta(admin, to);
    if (force && !meta) return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    if (!force && !(await canTransitionDB(admin, from, to))) {
      return NextResponse.json({ error: `เปลี่ยนสถานะจาก "${from}" ไป "${to}" ไม่ได้` }, { status: 400 });
    }
    patch.status = to;
    patch.progress_percent = meta ? meta.progress_percent : current.progress_percent;
    if (meta?.is_approval_gate) patch.approval_status = "pending";
    if (meta?.is_terminal) patch.completed_at = new Date().toISOString();
    if (typeof body.comment === "string" && body.comment.trim()) patch.blocker_reason = body.comment.trim();
    auditAction = `status:${from}→${to}`;
    if (meta?.is_approval_gate) notifyTarget = { empId: (current.reviewer_id as string) ?? null, eventType: "task_need_review", title: `งานรอตรวจ: ${current.title}` };
  } else if (action === "approve" || action === "reject" || action === "revise") {
    // อนุมัติ / ไม่ผ่าน / ตีกลับแก้ — ต้องมีสิทธิ์ tasks.approve. ปลายทาง (to) มาจาก transition
    const denyApprove = await guardApi(request, "tasks.approve"); if (denyApprove) return denyApprove;
    const to = String(body.to ?? "");
    if (to && !(await canTransitionDB(admin, String(current.status), to))) {
      return NextResponse.json({ error: "เปลี่ยนสถานะไม่ได้ตาม workflow" }, { status: 400 });
    }
    const approvalMap: Record<string, string> = { approve: "approved", reject: "rejected", revise: "revision" };
    patch.approval_status = approvalMap[action];
    if (to) {
      const meta = await getStatusMeta(admin, to);
      patch.status = to;
      patch.progress_percent = meta ? meta.progress_percent : current.progress_percent;
      if (meta?.is_terminal) patch.completed_at = new Date().toISOString();
    }
    if (action !== "approve" && typeof body.comment === "string") patch.blocker_reason = body.comment.trim() || null;
    const label = action === "approve" ? "อนุมัติงาน" : action === "reject" ? "ตีกลับ (ไม่ผ่าน)" : "ขอให้แก้ไข";
    auditAction = `task_${action}`;
    notifyTarget = { empId: (current.assignee_id as string) ?? null, eventType: `task_${action}`, title: `${label}: ${current.title}` };
  } else {
    // แก้ฟิลด์ทั่วไป — เฉพาะ field ที่อนุญาต
    for (const [k, v] of Object.entries(body)) {
      if (k === "action" || k === "actor") continue;
      if (EDITABLE.has(k)) patch[k] = v === "" ? null : v;
    }
    // m2m: Parent SKU / SKU (quick edit) — แทนที่ทั้งชุด + sync ฟิลด์เดี่ยว legacy
    const mParents = Array.isArray(body.parent_sku_ids) ? [...new Set((body.parent_sku_ids as string[]).filter(Boolean))] : null;
    const mSkus = Array.isArray(body.sku_ids) ? [...new Set((body.sku_ids as string[]).filter(Boolean))] : null;
    if (mParents) {
      await admin.from("erp_creative_task_parent_skus").delete().eq("task_id", id);
      if (mParents.length) await admin.from("erp_creative_task_parent_skus").insert(mParents.map((p) => ({ task_id: id, parent_sku_id: p })));
      patch.parent_sku_id = mParents[0] ?? null;
    }
    if (mSkus) {
      await admin.from("erp_creative_task_skus").delete().eq("task_id", id);
      if (mSkus.length) await admin.from("erp_creative_task_skus").insert(mSkus.map((s) => ({ task_id: id, sku_id: s })));
      patch.sku_id = mSkus[0] ?? null;
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้ไข" }, { status: 400 });
    // เปลี่ยนผู้รับผิดชอบ → แจ้งคนใหม่
    if ("assignee_id" in patch && patch.assignee_id && patch.assignee_id !== current.assignee_id) {
      notifyTarget = { empId: String(patch.assignee_id), eventType: "task_assigned", title: `มอบหมายงาน: ${current.title}` };
    }
  }

  patch.updated_at = new Date().toISOString();
  const { data: updated, error } = await admin.from("erp_creative_tasks").update(patch).eq("id", id).select(SELECT).single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, {
    action: auditAction, entityType: "creative_task", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { task_no: current.task_no, changes: Object.keys(patch).filter((k) => k !== "updated_at") },
  });

  if (notifyTarget?.empId) {
    const authId = await employeeAuthId(admin, notifyTarget.empId);
    if (authId) await notify(admin, { userId: authId, eventType: notifyTarget.eventType, title: notifyTarget.title, body: String(current.task_no ?? ""), entityId: id });
  }

  const empMap = await employeeLabelMap(admin, [updated.assignee_id, updated.reviewer_id, updated.approver_id] as string[]);
  return NextResponse.json({ data: flattenTask(updated as Record<string, unknown>, empMap), error: null });
}

// ---- DELETE (soft) ----
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.delete"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_creative_tasks").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "creative_task", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ success: true, error: null });
}
