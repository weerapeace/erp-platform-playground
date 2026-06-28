/**
 * Creative Task — งานย่อย (subtasks) — รองรับ รายละเอียด + ผู้รับผิดชอบหลายคน (m2m)
 * GET    /api/creative-tasks/[id]/subtasks
 * POST   /api/creative-tasks/[id]/subtasks   body = { title, description?, assignee_ids?: string[], due_date?, required_before_next? }
 * PATCH  /api/creative-tasks/[id]/subtasks   body = { subtask_id, ...fields, assignee_ids? }
 * DELETE /api/creative-tasks/[id]/subtasks?subtask_id=...
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";
import { subtaskAssigneesMap, setSubtaskAssignees, notify, userIdsReviewers } from "@/lib/creative-tasks-server";
import { applySubtaskSync, reverseSubtaskSync } from "@/lib/subtask-sync";
import { renderPrompt } from "@/lib/subtask-prompt";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// resolve ตัวแปร prompt จากงาน + สินค้า + รูปที่แนบ → คืน prompt พร้อมใช้ (ปุ่ม copy)
async function resolvePrompt(admin: ReturnType<typeof supabaseAdmin>, taskId: string, subId: string): Promise<NextResponse> {
  const { data: sub } = await admin.from("erp_creative_subtasks").select("config, description, subtask_type").eq("id", subId).eq("task_id", taskId).maybeSingle();
  const cfg = ((sub?.config ?? {}) as Record<string, unknown>);
  const { data: task } = await admin.from("erp_creative_tasks").select("title, brand_id, product_name, platforms, description").eq("id", taskId).maybeSingle();
  const tk = (task ?? {}) as Record<string, unknown>;
  // prompt: แบรนด์ทับค่าเริ่มต้น — ถ้าแบรนด์ตั้งไว้ใช้ของแบรนด์ ไม่งั้นใช้ของ config (เทมเพลต/registry)
  let promptTemplate = cfg.prompt_template as string | undefined;
  const stype = (sub as { subtask_type?: string | null } | null)?.subtask_type;
  if (tk.brand_id && stype) {
    const { data: bp } = await admin.from("erp_brand_subtask_prompts").select("prompt_template").eq("brand_id", tk.brand_id as string).eq("subtask_type", stype).maybeSingle();
    const bt = ((bp as { prompt_template?: string | null } | null)?.prompt_template ?? "").trim();
    if (bt) promptTemplate = bt;
  }
  let brand_name = "";
  if (tk.brand_id) { const { data: b } = await admin.from("brands").select("name").eq("id", tk.brand_id as string).maybeSingle(); brand_name = ((b as { name?: string } | null)?.name) ?? ""; }
  const { data: sl } = await admin.from("erp_creative_task_skus").select("sku_id").eq("task_id", taskId);
  const skuIds = ((sl ?? []) as { sku_id: string }[]).map((r) => r.sku_id).filter(Boolean);
  const skus = skuIds.length ? (((await admin.from("skus_v2").select("code, name_th, list_price").in("id", skuIds)).data) ?? []) as Record<string, unknown>[] : [];
  const { data: pl } = await admin.from("erp_creative_task_parent_skus").select("parent_sku_id").eq("task_id", taskId);
  const pIds = ((pl ?? []) as { parent_sku_id: string }[]).map((r) => r.parent_sku_id).filter(Boolean);
  const parents = pIds.length ? (((await admin.from("parent_skus_v2").select("code, name_th").in("id", pIds)).data) ?? []) as Record<string, unknown>[] : [];
  const { data: atts } = await admin.from("erp_creative_attachments").select("r2_key").eq("subtask_id", subId).eq("kind", "image");
  const imageUrls = ((atts ?? []) as { r2_key: string }[]).map((a) => `/api/r2-image?key=${encodeURIComponent(a.r2_key)}`).filter(Boolean);
  const price = skus[0]?.list_price != null ? Number(skus[0].list_price).toLocaleString("th-TH") : "";
  const prompt = renderPrompt(promptTemplate, {
    brand_name,
    task_name: (tk.title as string) ?? "",
    parent_sku: parents.map((p) => p.code as string).filter(Boolean).join(", "),
    sku_list: skus.map((s) => s.code as string).filter(Boolean).join(", "),
    product_name: (tk.product_name as string) || (skus[0]?.name_th as string) || (parents[0]?.name_th as string) || "",
    price,
    platforms: Array.isArray(tk.platforms) ? (tk.platforms as string[]).join(", ") : "",
    approved_image_urls: imageUrls.join("\n"),
    notes: (sub?.description as string) || (tk.description as string) || "",
  });
  return NextResponse.json({ prompt, image_urls: imageUrls, error: null });
}

// รายละเอียด Platform ของ Parent SKU ที่ผูกกับงาน — ใช้ "ยืนยัน" ตอนส่งงานเขียนคำอธิบาย (ไม่ต้องแนบไฟล์)
async function platformPreview(admin: ReturnType<typeof supabaseAdmin>, taskId: string): Promise<NextResponse> {
  // SKU ที่ผูกกับงาน (ใช้ prefill ปลายทางรูปในป๊อปอัปส่งงาน)
  const { data: sl } = await admin.from("erp_creative_task_skus").select("sku_id").eq("task_id", taskId);
  const linkedSkuIds = ((sl ?? []) as { sku_id: string }[]).map((r) => r.sku_id).filter(Boolean);
  const { data: pl } = await admin.from("erp_creative_task_parent_skus").select("parent_sku_id").eq("task_id", taskId);
  const pIds = ((pl ?? []) as { parent_sku_id: string }[]).map((r) => r.parent_sku_id).filter(Boolean);
  if (!pIds.length) return NextResponse.json({ parents: [], linked_sku_ids: linkedSkuIds, error: null });
  const { data } = await admin.from("parent_skus_v2").select("id, code, name_th, name_platform, introduction, description, english_description").in("id", pIds);
  const parents = ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: (p.id as string) ?? "",
    code: (p.code as string) ?? "",
    name_th: (p.name_th as string) ?? "",
    name_platform: (p.name_platform as string) ?? "",
    introduction: (p.introduction as string) ?? "",
    description: (p.description as string) ?? "",
    english_description: (p.english_description as string) ?? "",
    has_description: !!((p.description as string) ?? "").trim(),
  }));
  return NextResponse.json({ parents, linked_sku_ids: linkedSkuIds, error: null });
}

const EDITABLE = new Set(["title", "description", "assignee_id", "status", "due_date", "required_before_next", "sort_order", "image_sync_targets"]);

// อ่าน role ของผู้ใช้ปัจจุบัน (admin/manager/...) — ใช้คุมสิทธิ์ละเอียดของงานย่อย
async function currentRole(request: NextRequest): Promise<string> {
  try { const { data } = await supabaseFromRequest(request).rpc("erp_current_user"); return ((data as { role?: string | null } | null)?.role) ?? "viewer"; }
  catch { return "viewer"; }
}
// เช็คสิทธิ์ผ่าน erp_can (admin → true เสมอ)
async function canPerm(request: NextRequest, perm: string): Promise<boolean> {
  try { const { data } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: perm }); return data === true; }
  catch { return false; }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const sp = new URL(request.url).searchParams;
  const promptSubId = sp.get("prompt_subtask_id");
  if (promptSubId) return resolvePrompt(admin, id, promptSubId);
  if (sp.get("platform") === "1") return platformPreview(admin, id);
  const { data, error } = await admin.from("erp_creative_subtasks").select("*").eq("task_id", id).order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  const rows = (data ?? []) as Record<string, unknown>[];
  const subIds = rows.map((r) => String(r.id));
  const aMap = await subtaskAssigneesMap(admin, subIds);
  // ไฟล์/รูปแนบของแต่ละงานย่อย
  const attBy = new Map<string, Record<string, unknown>[]>();
  if (subIds.length) {
    const { data: atts } = await admin.from("erp_creative_attachments").select("*").in("subtask_id", subIds).order("created_at", { ascending: true });
    for (const a of (atts ?? []) as Record<string, unknown>[]) { const k = String(a.subtask_id); const arr = attBy.get(k) ?? []; arr.push(a); attBy.set(k, arr); }
  }
  return NextResponse.json({ data: rows.map((r) => ({ ...r, assignees: aMap.get(String(r.id)) ?? [], attachments: attBy.get(String(r.id)) ?? [] })), error: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "กรุณาใส่ชื่องานย่อย" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: maxRow } = await admin.from("erp_creative_subtasks").select("sort_order").eq("task_id", id).order("sort_order", { ascending: false }).limit(1);
  const sort = ((maxRow?.[0]?.sort_order as number) ?? -1) + 1;
  const ids = Array.isArray(body.assignee_ids) ? (body.assignee_ids as string[]) : [];
  const { data: row, error } = await admin.from("erp_creative_subtasks").insert({
    task_id: id, title, description: (body.description as string)?.trim() || null, assignee_id: ids[0] || (body.assignee_id as string) || null,
    due_date: (body.due_date as string) || null, required_before_next: !!body.required_before_next, sort_order: sort,
  }).select("*").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  if (ids.length) await setSubtaskAssignees(admin, row.id, ids);
  await writeAudit(admin, { action: "subtask:create", entityType: "creative_task", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { title } });
  const aMap = await subtaskAssigneesMap(admin, [row.id]);
  return NextResponse.json({ data: { ...row, assignees: aMap.get(String(row.id)) ?? [] }, error: null });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const subtaskId = String(body.subtask_id ?? "");
  if (!subtaskId) return NextResponse.json({ error: "subtask_id required" }, { status: 400 });

  const admin = supabaseAdmin();
  // งานแม่ (ผู้สร้าง + ผู้ตรวจ) + รายชื่อผู้ตรวจ (m2m) + role ผู้ใช้ — ใช้คุมสิทธิ์ละเอียด
  const [{ data: parent }, role, reviewerSet] = await Promise.all([
    admin.from("erp_creative_tasks").select("created_by, reviewer_id, task_no, title").eq("id", id).maybeSingle(),
    currentRole(request),
    userIdsReviewers(admin, id),
  ]);
  const isManager = role === "admin" || role === "manager";
  const isCreator = !!user?.id && user.id === (parent?.created_by as string | null);
  // ผู้ตรวจ = อยู่ในรายชื่อผู้ตรวจหลายคน หรือ reviewer_id เดี่ยว (เผื่อข้อมูลเก่า)
  const isReviewer = !!user?.id && (reviewerSet.has(user.id) || user.id === (parent?.reviewer_id as string | null));

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) if (EDITABLE.has(k)) patch[k] = v === "" ? null : v;

  // ⑤ แก้ "ผู้รับผิดชอบ" ได้เฉพาะ admin/ผจก./คนสร้างงานแม่
  if (Array.isArray(body.assignee_ids) && !(isManager || isCreator))
    return NextResponse.json({ error: "คุณไม่มีสิทธิ์เปลี่ยนผู้รับผิดชอบงานย่อย" }, { status: 403 });
  // ④ อนุมัติ (status → approved) ได้เฉพาะ admin/ผจก./ผู้ตรวจของงาน (หรือมีสิทธิ์ task_subtask.approve)
  if (patch.status === "approved" && !(isManager || isReviewer || await canPerm(request, "task_subtask.approve")))
    return NextResponse.json({ error: "คุณไม่มีสิทธิ์อนุมัติงานย่อยนี้" }, { status: 403 });
  if (patch.status === "revision_requested" && !(isManager || isReviewer || await canPerm(request, "task_subtask.revise")))
    return NextResponse.json({ error: "คุณไม่มีสิทธิ์ขอแก้งานย่อยนี้" }, { status: 403 });
  if (patch.status === "canceled" && !(isManager || await canPerm(request, "task_subtask.cancel")))
    return NextResponse.json({ error: "คุณไม่มีสิทธิ์ยกเลิกงานย่อยนี้" }, { status: 403 });

  if (Array.isArray(body.assignee_ids)) {
    const { data: curA } = await admin.from("erp_creative_subtask_assignees").select("user_id").eq("subtask_id", subtaskId);
    const oldSet = new Set(((curA ?? []) as { user_id: string }[]).map((r) => r.user_id));
    await setSubtaskAssignees(admin, subtaskId, body.assignee_ids as string[]);
    patch.assignee_id = (body.assignee_ids as string[])[0] || null; // sync legacy single field
    // แจ้งเตือนเฉพาะคนที่เพิ่งถูกเพิ่ม (ไม่เตือนตัวเอง/คนเดิม)
    const added = (body.assignee_ids as string[]).filter((uid) => uid && !oldSet.has(uid) && uid !== user?.id);
    if (added.length) {
      const { data: sub } = await admin.from("erp_creative_subtasks").select("title").eq("id", subtaskId).maybeSingle();
      const subTitle = ((sub as { title?: string } | null)?.title) ?? "งานย่อย";
      const taskLabel = `${parent?.task_no ? parent.task_no + " " : ""}${parent?.title ?? ""}`.trim();
      await Promise.all(added.map((uid) => notify(admin, { userId: uid, eventType: "subtask_assigned", priority: "normal", title: `มอบหมายงานย่อย: ${subTitle}`, body: taskLabel || null, linkUrl: `/tasks?task=${id}`, entityId: id })));
    }
  }

  // ⑦ "เริ่มงาน" = คนกดเป็นผู้รับผิดชอบ "คนเดียว" (ลบคนอื่นออก — งานย่อย 1 งาน = ผู้ทำ 1 คน)
  //    "ยกเลิกเริ่มงาน" (กลับเป็นยังไม่เริ่ม) = คืนผู้รับผิดชอบ "ทั้งหมด" ที่มีอยู่ก่อนเริ่ม · ส่งงาน/อนุมัติแล้วยกเลิกไม่ได้
  if (patch.status === "in_progress" && user?.id && !Array.isArray(body.assignee_ids)) {
    // เก็บ "ผู้รับผิดชอบเดิมทั้งหมด" ก่อนเริ่ม ไว้ใน config.pre_start_assignees → ใช้คืนทั้งหมดตอนยกเลิกเริ่ม
    const [{ data: curRow }, { data: curA }] = await Promise.all([
      admin.from("erp_creative_subtasks").select("config").eq("id", subtaskId).eq("task_id", id).maybeSingle(),
      admin.from("erp_creative_subtask_assignees").select("user_id").eq("subtask_id", subtaskId),
    ]);
    const before = ((curA ?? []) as { user_id: string }[]).map((r) => r.user_id).filter(Boolean);
    const prevCfg = (((curRow as { config?: Record<string, unknown> } | null)?.config) ?? {}) as Record<string, unknown>;
    patch.config = { ...prevCfg, pre_start_assignees: before };
    // เริ่มงาน = คนกดเป็นผู้ทำคนเดียว (ลบคนอื่น)
    await setSubtaskAssignees(admin, subtaskId, [user.id]);
  } else if (patch.status === "todo" && user?.id && !Array.isArray(body.assignee_ids)) {
    const { data: cur } = await admin.from("erp_creative_subtasks").select("status, assignee_id, config").eq("id", subtaskId).eq("task_id", id).maybeSingle();
    const curStatus = (cur as { status?: string } | null)?.status;
    if (curStatus === "submitted" || curStatus === "approved")
      return NextResponse.json({ error: "ส่งงานแล้ว ยกเลิกการเริ่มงานไม่ได้" }, { status: 400 });
    // ยกเลิกเริ่ม = คืน "ผู้รับผิดชอบทั้งหมด" ที่เก็บไว้ตอนเริ่ม · ไม่มี snapshot → ใช้ assignee_id เดิม · ไม่มีเลย → ว่าง
    const prevCfg = (((cur as { config?: Record<string, unknown> } | null)?.config) ?? {}) as Record<string, unknown>;
    const snapshot = Array.isArray(prevCfg.pre_start_assignees) ? (prevCfg.pre_start_assignees as string[]).filter(Boolean) : null;
    const def = (cur as { assignee_id?: string | null } | null)?.assignee_id ?? null;
    const restore = snapshot && snapshot.length ? snapshot : (def ? [def] : []);
    await setSubtaskAssignees(admin, subtaskId, restore);
    // ล้าง snapshot หลังคืนค่าแล้ว
    const restCfg: Record<string, unknown> = { ...prevCfg };
    delete restCfg.pre_start_assignees;
    patch.config = restCfg;
  }
  let row: Record<string, unknown> | null = null;
  if (Object.keys(patch).length > 1) {
    const { data, error } = await admin.from("erp_creative_subtasks").update(patch).eq("id", subtaskId).eq("task_id", id).select("*").single();
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
    row = data as Record<string, unknown>;
  } else {
    const { data } = await admin.from("erp_creative_subtasks").select("*").eq("id", subtaskId).maybeSingle();
    row = data as Record<string, unknown> | null;
  }
  await writeAudit(admin, { action: "subtask:update", entityType: "creative_task", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { subtask_id: subtaskId } });

  // ⑥ Sync เข้าสินค้า (best-effort) — อนุมัติ → ส่งรูป/ข้อความเข้า Parent SKU/SKU · ขอแก้/ยกเลิก → ถอดกลับ
  const reason = typeof body.comment === "string" ? body.comment.trim() : "";
  if (patch.status === "approved" && row) {
    try { await applySubtaskSync(admin, row as Parameters<typeof applySubtaskSync>[1], { actorId: user?.id ?? null }); } catch { /* sync พลาดไม่ทำให้อนุมัติพัง */ }
  } else if ((patch.status === "revision_requested" || patch.status === "canceled")) {
    try { await reverseSubtaskSync(admin, subtaskId, { actorId: user?.id ?? null, reason: reason || null }); } catch { /* ถอดพลาดไม่ทำให้บันทึกพัง */ }
    if (reason) { try { const cfg = (row?.config as Record<string, unknown>) ?? {}; await admin.from("erp_creative_subtasks").update({ config: { ...cfg, review_note: reason, review_status: patch.status } }).eq("id", subtaskId); } catch { /* noop */ } }
  }

  // ④ ส่งงาน (status → submitted) → แจ้งเตือน ผู้ตรวจ + admin/ผจก. ให้มากดอนุมัติ
  if (patch.status === "submitted") {
    try {
      const { data: mgrs } = await admin.from("user_profiles").select("id").in("role", ["admin", "manager"]);
      const recipients = new Set<string>([...((mgrs ?? []) as { id: string }[]).map((m) => m.id)]);
      if (parent?.reviewer_id) recipients.add(String(parent.reviewer_id));
      recipients.delete(String(user?.id ?? "")); // ไม่ต้องเตือนตัวเอง
      const subTitle = String(row?.title ?? "งานย่อย");
      const taskLabel = `${parent?.task_no ? parent.task_no + " " : ""}${parent?.title ?? ""}`.trim();
      await Promise.all([...recipients].map((uid) => notify(admin, {
        userId: uid, eventType: "subtask_submitted", priority: "high",
        title: `รออนุมัติงานย่อย: ${subTitle}`, body: taskLabel || null,
        linkUrl: `/tasks?task=${id}`, entityId: id,
      })));
    } catch { /* แจ้งเตือนล้มเหลวไม่ทำให้บันทึกพัง */ }
  }

  const aMap = await subtaskAssigneesMap(admin, [subtaskId]);
  return NextResponse.json({ data: row ? { ...row, assignees: aMap.get(subtaskId) ?? [] } : null, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const subtaskId = new URL(request.url).searchParams.get("subtask_id") ?? "";
  if (!subtaskId) return NextResponse.json({ error: "subtask_id required" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_creative_subtasks").delete().eq("id", subtaskId).eq("task_id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  return NextResponse.json({ success: true, error: null });
}
