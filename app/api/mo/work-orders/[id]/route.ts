/**
 * ใบจ่ายงาน — รายตัว
 * PATCH  /api/mo/work-orders/[id] → แก้สถานะ / รับงานคืน (received_qty) / จำนวน / ผู้รับ / กำหนดเสร็จ / หมายเหตุ
 * DELETE /api/mo/work-orders/[id] → ยกเลิก (archive)
 *
 * เขียนผ่าน supabaseAdmin, audit → audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

type PatchBody = {
  status?: string; received_qty?: number; qty?: number;
  assignee_type?: string; assignee_id?: string | null; assignee_name?: string | null;
  department_id?: string | null; department_name?: string | null;
  stage?: string; due_date?: string | null; note?: string | null;
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: PatchBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { data: cur, error: exErr } = await admin.from("mo_work_orders").select("id, wo_no, mo_no, qty, received_qty, status").eq("id", id).single();
  if (exErr) return NextResponse.json({ error: "ไม่พบใบจ่ายงาน" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.qty != null)           patch.qty = num(body.qty);
  if (body.stage != null)         patch.stage = body.stage;
  if (body.assignee_type != null) patch.assignee_type = body.assignee_type;
  if (body.assignee_id !== undefined)   patch.assignee_id = body.assignee_id ?? null;
  if (body.assignee_name !== undefined) patch.assignee_name = body.assignee_name ?? null;
  if (body.department_id !== undefined)   patch.department_id = body.department_id ?? null;
  if (body.department_name !== undefined) patch.department_name = body.department_name ?? null;
  if (body.due_date !== undefined) patch.due_date = body.due_date || null;
  if (body.note !== undefined)     patch.note = body.note ?? null;

  // รับงานคืน: ตั้ง received_qty + คำนวณสถานะอัตโนมัติ (รับครบ=done · รับบางส่วน=partial_return)
  if (body.received_qty != null) {
    const totalQty = body.qty != null ? num(body.qty) : num((cur as { qty: number }).qty);
    const recv = Math.max(0, Math.min(num(body.received_qty), totalQty));
    patch.received_qty = recv;
    patch.status = recv >= totalQty - 0.0001 && recv > 0 ? "done" : recv > 0 ? "partial_return" : "dispatched";
  }
  if (body.status != null) patch.status = body.status;  // ตั้งสถานะตรง ๆ override ได้

  const { error } = await admin.from("mo_work_orders").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ: " + error.message }, { status: 400 });

  await writeAudit(admin, { action: "update", entityType: "mo_work_order", entityId: id, actorId: user.id,
    actorName: user.email ?? null, metadata: { wo_no: (cur as { wo_no: string }).wo_no, ...patch } });
  return NextResponse.json({ id, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("mo_work_orders").update({ is_active: false, status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "mo_work_order", entityId: id, actorId: user.id, actorName: user.email ?? null });
  return NextResponse.json({ data: { archived: true }, error: null });
}
