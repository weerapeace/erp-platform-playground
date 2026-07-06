/**
 * หน้าอนุมัติเล็ก (เปิดจาก LINE) — สาธารณะ ไม่ต้อง login (ยืนยันตัวตนด้วย LINE ID token)
 * GET  /api/approve?token=<t>                → พรีวิวงานย่อย (ชื่อ/รูป/บรีฟ) สำหรับโชว์
 * POST /api/approve  { token, id_token, action:"approve"|"revise", reason? }
 *      → ยืนยัน LINE → หา user ที่ผูกไว้ → เช็กสิทธิ์ตรวจงาน → อนุมัติ/ตีกลับ (reuse ตรรกะเดิม)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { verifyApprovalToken, APPROVE_CHANNEL_ID } from "@/lib/approval-token";
import { verifyLineIdToken } from "@/lib/line-employee-portal-db";
import { applySubtaskSync, reverseSubtaskSync, restoreSkuImagesBackup } from "@/lib/subtask-sync";
import { userIdsReviewers, recomputeTaskStatusFromSubtasks } from "@/lib/creative-tasks-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;

// LINE userId → user (ผูกที่ user โดยตรงก่อน · ไม่เจอ fallback ผ่านพนักงาน line_memberships → employee_id)
async function resolveUserFromLine(admin: Admin, lineUserId: string): Promise<{ id: string; role: string | null; display_name: string | null } | null> {
  const { data: direct } = await admin.from("user_profiles").select("id, role, display_name").eq("line_user_id", lineUserId).maybeSingle();
  if (direct) return direct as { id: string; role: string | null; display_name: string | null };
  const { data: mem } = await admin.from("line_memberships").select("employee_id").eq("line_user_id", lineUserId).eq("status", "linked").maybeSingle();
  const empId = (mem as { employee_id?: string } | null)?.employee_id;
  if (empId) {
    const { data: up } = await admin.from("user_profiles").select("id, role, display_name").eq("employee_id", empId).maybeSingle();
    if (up) return up as { id: string; role: string | null; display_name: string | null };
  }
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const v = verifyApprovalToken(token);
  if (!v) return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: sub } = await admin.from("erp_creative_subtasks")
    .select("id, task_id, title, subtask_type, status, config, task:erp_creative_tasks!task_id(task_no, title)")
    .eq("id", v.subtaskId).maybeSingle();
  if (!sub) return NextResponse.json({ error: "ไม่พบงานย่อยนี้" }, { status: 404 });
  const t = (Array.isArray((sub as Record<string, unknown>).task) ? (sub as Record<string, unknown[]>).task[0] : (sub as Record<string, unknown>).task) as { task_no?: string; title?: string } | null;
  const { data: atts } = await admin.from("erp_creative_attachments").select("r2_key, file_name, kind").eq("subtask_id", v.subtaskId);
  const images = ((atts ?? []) as { r2_key: string | null; kind: string }[]).filter((a) => a.kind === "image" && a.r2_key)
    .map((a) => `/api/r2-image?key=${encodeURIComponent(a.r2_key as string)}`);
  const links = ((atts ?? []) as { r2_key: string | null; file_name: string | null; kind: string }[]).filter((a) => a.kind !== "image");
  return NextResponse.json({
    error: null,
    data: {
      id: (sub as { id: string }).id,
      title: (sub as { title?: string }).title ?? "",
      subtask_type: (sub as { subtask_type?: string }).subtask_type ?? null,
      status: (sub as { status?: string }).status ?? null,
      task_no: t?.task_no ?? null,
      task_title: t?.title ?? null,
      images,
      links: links.map((l) => ({ label: l.file_name, key: l.r2_key })),
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { token?: string; id_token?: string; action?: string; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const v = verifyApprovalToken(String(body.token ?? ""));
  if (!v) return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว" }, { status: 400 });
  const action = body.action === "revise" ? "revise" : body.action === "approve" ? "approve" : null;
  if (!action) return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });

  // ยืนยันตัวตนผ่าน LINE
  let lineSub = "";
  try { const p = await verifyLineIdToken(body.id_token, undefined, APPROVE_CHANNEL_ID); lineSub = String((p as { sub?: string }).sub ?? ""); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 401 }); }
  if (!lineSub) return NextResponse.json({ error: "ยืนยัน LINE ไม่สำเร็จ" }, { status: 401 });

  const admin = supabaseAdmin();
  const me = await resolveUserFromLine(admin, lineSub);
  if (!me) return NextResponse.json({ error: "บัญชี LINE นี้ยังไม่ได้ผูกกับผู้ใช้ในระบบ — ไปผูกที่หน้าบัญชีก่อน", need_link: true }, { status: 403 });

  const { data: sub } = await admin.from("erp_creative_subtasks").select("*").eq("id", v.subtaskId).maybeSingle();
  if (!sub) return NextResponse.json({ error: "ไม่พบงานย่อยนี้" }, { status: 404 });
  const row = sub as Record<string, unknown>;
  const taskId = String(row.task_id);
  const { data: parent } = await admin.from("erp_creative_tasks").select("created_by, reviewer_id").eq("id", taskId).maybeSingle();
  const reviewerSet = await userIdsReviewers(admin, taskId);
  const isManager = me.role === "admin" || me.role === "manager";
  const isReviewer = reviewerSet.has(me.id) || me.id === ((parent as { reviewer_id?: string } | null)?.reviewer_id ?? "");
  const isCreator = me.id === ((parent as { created_by?: string } | null)?.created_by ?? "");
  if (!(isManager || isReviewer || isCreator)) return NextResponse.json({ error: "คุณไม่มีสิทธิ์ตรวจงานนี้" }, { status: 403 });

  if (action === "approve") {
    if (row.status === "approved") return NextResponse.json({ ok: true, already: true, error: null });
    const { data: updated } = await admin.from("erp_creative_subtasks").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", v.subtaskId).select("*").single();
    const r = (updated ?? row) as Record<string, unknown>;
    try {
      await applySubtaskSync(admin, r as Parameters<typeof applySubtaskSync>[1], { actorId: me.id });
      const ist = (r.image_sync_targets as Record<string, unknown> | null) ?? null;
      if (ist && Object.keys((ist.sku_images as Record<string, unknown>) ?? {}).length) {
        await admin.from("erp_creative_subtasks").update({ image_sync_targets: { ...ist, sku_images_backup: ist.sku_images, sku_images: {}, moved_to_product: true } }).eq("id", v.subtaskId);
      }
    } catch { /* sync พลาดไม่ทำให้อนุมัติพัง */ }
    await writeAudit(admin, { action: "subtask:approve_line", entityType: "creative_task", entityId: taskId, actorId: me.id, actorName: me.display_name ?? null, metadata: { subtask_id: v.subtaskId, via: "line" } });
  } else {
    const reason = String(body.reason ?? "").trim();
    await admin.from("erp_creative_subtasks").update({ status: "revision_requested", updated_at: new Date().toISOString(), config: { ...((row.config as Record<string, unknown>) ?? {}), review_note: reason || null, review_status: "revision_requested" } }).eq("id", v.subtaskId);
    try { await reverseSubtaskSync(admin, v.subtaskId, { actorId: me.id, reason: reason || null }); } catch { /* noop */ }
    try { await restoreSkuImagesBackup(admin, v.subtaskId); } catch { /* noop */ }
    await writeAudit(admin, { action: "subtask:revise_line", entityType: "creative_task", entityId: taskId, actorId: me.id, actorName: me.display_name ?? null, metadata: { subtask_id: v.subtaskId, via: "line", reason } });
  }
  try { await recomputeTaskStatusFromSubtasks(admin, taskId); } catch { /* noop */ }
  return NextResponse.json({ ok: true, error: null, by: me.display_name ?? null });
}
