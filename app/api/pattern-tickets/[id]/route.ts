/**
 * /api/pattern-tickets/[id] — ตั๋วงานช่าง Pattern รายใบ
 *
 * GET   → { data: ticket, actions: ปุ่มที่กดได้, can_edit, can_work }        (pattern.view)
 * PATCH { action: "transition", key, note? }     เปลี่ยนสถานะ (ประตูเดียว · กติกา lib/pattern-tickets allowedActions)
 *       { action: "update", fields: {...} }      แก้รายละเอียด (ผู้สั่ง/ผู้จัดการ)
 *       { action: "checklist", checklist }       ติ๊กเช็กลิสต์ (ช่างที่รับงาน/ผู้สั่ง/ผู้จัดการ)
 *       { action: "links", links }               ลิงก์ไฟล์ที่วางเอง
 *       { action: "assign", assignee_id, assignee_name }   มอบหมายช่าง (ผู้จัดการ/ผู้สั่ง)
 * ทุกการเปลี่ยนแปลงเขียน audit_logs (entity_type = pattern_tickets)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { allowedActions, canEditTicket, canWorkOn, cleanChecklist, cleanLinks, patternActionByKey } from "@/lib/pattern-tickets";
import { loadActor, PATTERN_TABLE } from "@/lib/pattern-tickets-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "pattern.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const [{ data, error }, actor] = await Promise.all([
    admin.from(PATTERN_TABLE).select("*").eq("id", id).maybeSingle(),
    loadActor(request, admin),
  ]);
  if (error) return NextResponse.json({ error: "โหลดตั๋วไม่สำเร็จ" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "ไม่พบตั๋วนี้" }, { status: 404 });
  return NextResponse.json({
    data,
    actions: allowedActions(data, actor),
    can_edit: canEditTicket(data, actor),
    can_work: canWorkOn(data, actor),
    can_assign: actor.canManage || (!!actor.userId && data.requester_id === actor.userId),
    error: null,
  });
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "pattern.view"); if (denied) return denied;
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const [{ data: t }, actor] = await Promise.all([
    admin.from(PATTERN_TABLE).select("*").eq("id", id).maybeSingle(),
    loadActor(request, admin),
  ]);
  if (!t) return NextResponse.json({ error: "ไม่พบตั๋วนี้" }, { status: 404 });
  const now = new Date().toISOString();
  const audit = (action: string, metadata: Record<string, unknown>) => writeAudit(admin, {
    action, entityType: PATTERN_TABLE, entityId: id, actorId: actor.userId, actorName: actor.name,
    metadata: { ticket_no: t.ticket_no, ...metadata },
  });
  const save = async (patch: Record<string, unknown>) => {
    const { data, error } = await admin.from(PATTERN_TABLE).update({ ...patch, updated_at: now }).eq("id", id).select("*").single();
    if (error || !data) return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
    return NextResponse.json({ data, error: null });
  };

  switch (body.action) {
    case "transition": {
      const act = patternActionByKey(String(body.key ?? ""));
      if (!act || !allowedActions(t, actor).some((a) => a.key === act.key)) {
        return NextResponse.json({ error: "คุณทำขั้นนี้กับตั๋วใบนี้ไม่ได้ (สถานะเปลี่ยนไปแล้ว หรือไม่มีสิทธิ์)" }, { status: 403 });
      }
      const note = String(body.note ?? "").trim().slice(0, 1000);
      if (act.needNote && !note) return NextResponse.json({ error: "กรุณาใส่เหตุผล" }, { status: 400 });
      const patch: Record<string, unknown> = { status: act.to };
      if (act.key === "claim") {
        patch.started_at = now;
        if (!t.assignee_id) { patch.assignee_id = actor.userId; patch.assignee_name = actor.name; }
      }
      if (act.key === "submit" || act.key === "resubmit") patch.submitted_at = now;
      if (act.key === "approve") patch.done_at = now;
      if (act.key === "reopen") patch.done_at = null;
      if (note) patch.last_note = note;
      const res = await save(patch);
      if (res.status === 200) await audit(`pattern.${act.key}`, { from: t.status, to: act.to, note: note || undefined });
      return res;
    }

    case "update": {
      if (!canEditTicket(t, actor)) return NextResponse.json({ error: "แก้ได้เฉพาะผู้สั่งงานหรือผู้จัดการ" }, { status: 403 });
      const f = (body.fields ?? {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      if (typeof f.title === "string") { const v = f.title.trim().slice(0, 200); if (!v) return NextResponse.json({ error: "ชื่องานห้ามว่าง" }, { status: 400 }); patch.title = v; }
      if (typeof f.description_th === "string") patch.description_th = f.description_th.trim().slice(0, 8000);
      if (typeof f.description_en === "string") patch.description_en = f.description_en.trim().slice(0, 8000);
      if (typeof f.en_edited === "boolean") patch.en_edited = f.en_edited;
      if (typeof f.sku_code === "string") patch.sku_code = f.sku_code.trim().slice(0, 80) || null;
      if (f.priority === "urgent" || f.priority === "normal") patch.priority = f.priority;
      if (f.due_date === null || (typeof f.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.due_date))) patch.due_date = f.due_date;
      if (!Object.keys(patch).length) return NextResponse.json({ error: "ไม่มีอะไรเปลี่ยน" }, { status: 400 });
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const k of Object.keys(patch)) if (t[k] !== patch[k]) changes[k] = { from: t[k], to: patch[k] };
      const res = await save(patch);
      if (res.status === 200 && Object.keys(changes).length) await audit("update", { changes });
      return res;
    }

    case "checklist": {
      if (!canWorkOn(t, actor)) return NextResponse.json({ error: "ติ๊กได้เฉพาะช่างที่รับงาน ผู้สั่ง หรือผู้จัดการ" }, { status: 403 });
      const checklist = cleanChecklist(body.checklist);
      const doneNow = checklist.filter((c) => c.done).length;
      const res = await save({ checklist });
      if (res.status === 200) await audit("pattern.checklist", { done: doneNow, total: checklist.length });
      return res;
    }

    case "links": {
      if (!canWorkOn(t, actor)) return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ลิงก์ของตั๋วนี้" }, { status: 403 });
      const links = cleanLinks(body.links);
      const res = await save({ links });
      if (res.status === 200) await audit("pattern.links", { count: links.length });
      return res;
    }

    case "assign": {
      const isRequester = !!actor.userId && t.requester_id === actor.userId;
      if (!actor.canManage && !isRequester) return NextResponse.json({ error: "มอบหมายได้เฉพาะผู้สั่งงานหรือผู้จัดการ" }, { status: 403 });
      const aid = typeof body.assignee_id === "string" && body.assignee_id ? body.assignee_id : null;
      const aname = aid ? String(body.assignee_name ?? "").trim() || null : null;
      const res = await save({ assignee_id: aid, assignee_name: aname });
      if (res.status === 200) await audit("pattern.assign", { from: t.assignee_name, to: aname });
      return res;
    }
  }
  return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
}
