/**
 * ใบจ่ายงาน — รายตัว
 * PATCH  /api/mo/work-orders/[id] → แก้สถานะ / รับงานคืน (received_qty) / จำนวน / ผู้รับ / กำหนดเสร็จ / หมายเหตุ / วันจ่าย
 *        sync_subs_worker = เปลี่ยนคนรับแล้วแก้ชื่อช่างในรอบส่งคืนเดิมให้ตรงด้วย (ค่าแรงรายเดือนนับตามชื่อในรอบส่งคืน)
 *        via/label = มาจากป๊อป "แก้ไข" ของโหมดอัปเดตงาน → ลง audit พร้อมเลขใบสั่งผลิต ไว้โชว์ประวัติการแก้
 * DELETE /api/mo/work-orders/[id] → ยกเลิก (archive)
 *
 * เขียนผ่าน supabaseAdmin, audit → audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

type PatchBody = {
  status?: string; received_qty?: number; qty?: number;
  assignee_type?: string; assignee_id?: string | null; assignee_name?: string | null;
  department_id?: string | null; department_name?: string | null;
  stage?: string; due_date?: string | null; note?: string | null; labor_cost?: number | null;
  dispatch_date?: string | null; sync_subs_worker?: boolean; via?: string; label?: string;
  /** คนรับหลายคน (แบบเดียวกับตอนจ่าย — crewFields) */
  assignees?: { id: string | null; name: string }[];
};
const isYmd = (v: unknown): v is string => typeof v === "string" && /^d{4}-d{2}-d{2}$/.test(v);

// สถานะใบจ่ายงานที่ระบบรู้จัก — กันตั้งค่ามั่วผ่าน API
const WO_STATUSES = new Set(["dispatched", "partial_return", "done", "cancelled"]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "work_board.dispatch"); if (denied) return denied;   // สิทธิ์เดียวกับเส้นสร้าง/แก้แบบรวม (เดิมแค่ login = ช่องโหว่)
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: PatchBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { data: cur, error: exErr } = await admin.from("mo_work_orders").select("id, wo_no, mo_no, qty, received_qty, status, assignee_type, assignee_id, assignee_name").eq("id", id).single();
  if (exErr) return NextResponse.json({ error: "ไม่พบใบจ่ายงาน" }, { status: 404 });
  // ใบที่ "ยกเลิก" แล้ว ล็อกทุกฟิลด์ — แก้ได้ทางเดียวคือคืนสถานะกลับมาก่อน (status: dispatched)
  const curStatus = String((cur as { status?: string }).status ?? "");
  if (curStatus === "cancelled" && body.status !== "dispatched")
    return NextResponse.json({ error: "ใบจ่ายงานนี้ถูกยกเลิกแล้ว — คืนสถานะเป็น \"จ่ายงาน\" ก่อนจึงจะแก้ไขได้" }, { status: 400 });
  if (body.status != null && !WO_STATUSES.has(String(body.status)))
    return NextResponse.json({ error: "สถานะใบจ่ายงานไม่ถูกต้อง" }, { status: 400 });

  // จำนวนใบจ่าย ต่ำกว่าที่ช่างส่งคืนแล้วไม่ได้ (ยอดคืนผูกกับรอบส่งคืนจริง — ให้แก้/ลบรอบส่งคืนก่อน)
  if (body.qty != null && body.received_qty == null && num(body.qty) < num((cur as { received_qty: number }).received_qty) - 0.0001)
    return NextResponse.json({ error: `ช่างส่งคืนแล้ว ${num((cur as { received_qty: number }).received_qty)} ชิ้น — ลดจำนวนต่ำกว่านั้นไม่ได้ (แก้รอบส่งคืนก่อน)` }, { status: 400 });
  if ("dispatch_date" in body && body.dispatch_date !== null && !isYmd(body.dispatch_date))
    return NextResponse.json({ error: "วันที่จ่ายไม่ถูกต้อง" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.qty != null)           patch.qty = num(body.qty);
  if ("dispatch_date" in body)    patch.dispatch_date = body.dispatch_date ?? null;
  if (body.stage != null)         patch.stage = body.stage;
  if (body.assignee_type != null) patch.assignee_type = body.assignee_type;
  if (body.assignee_id !== undefined)   patch.assignee_id = body.assignee_id ?? null;
  if (body.assignee_name !== undefined) patch.assignee_name = body.assignee_name ?? null;
  if (Array.isArray(body.assignees))
    patch.assignees = body.assignees.filter((a) => a && typeof a.name === "string" && a.name.trim()).map((a) => ({ id: typeof a.id === "string" && a.id ? a.id : null, name: a.name.trim() }));
  if (body.department_id !== undefined)   patch.department_id = body.department_id ?? null;
  if (body.department_name !== undefined) patch.department_name = body.department_name ?? null;
  if (body.due_date !== undefined) patch.due_date = body.due_date || null;
  if (body.note !== undefined)     patch.note = body.note ?? null;
  if (body.labor_cost !== undefined) patch.labor_cost = body.labor_cost == null ? null : num(body.labor_cost);

  // รับงานคืน: ตั้ง received_qty + คำนวณสถานะอัตโนมัติ (รับครบ=done · รับบางส่วน=partial_return)
  if (body.received_qty != null) {
    const totalQty = body.qty != null ? num(body.qty) : num((cur as { qty: number }).qty);
    const recv = Math.max(0, Math.min(num(body.received_qty), totalQty));
    patch.received_qty = recv;
    patch.status = recv >= totalQty - 0.0001 && recv > 0 ? "done" : recv > 0 ? "partial_return" : "dispatched";
  }
  if (body.status != null) patch.status = body.status;  // ตั้งสถานะตรง ๆ override ได้
  // แก้จำนวนอย่างเดียว (ไม่ได้ส่ง received_qty) → สถานะตามยอดคืนเดิม (ลดจนเท่ายอดคืน = ปิดใบ · เพิ่มกลับ = เปิดใบ)
  if (body.qty != null && body.received_qty == null && body.status == null && curStatus !== "cancelled") {
    const q = num(body.qty), rq = num((cur as { received_qty: number }).received_qty);
    patch.status = rq >= q - 0.0001 && rq > 0 ? "done" : rq > 0 ? "partial_return" : "dispatched";
  }

  const { error } = await admin.from("mo_work_orders").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  // เปลี่ยนคนรับ → ชื่อช่างในรอบส่งคืนเดิมตามไปด้วย (ไม่งั้นค่าแรงรายเดือนยังนับเข้าคนเดิม)
  if (body.sync_subs_worker && body.assignee_name !== undefined) {
    const isCraft = (body.assignee_type ?? (cur as { assignee_type?: string }).assignee_type) === "craftsman";
    await admin.from("wo_submissions").update({ craftsman_name: body.assignee_name ?? null, craftsman_id: isCraft ? body.assignee_id ?? null : null,
      ...(body.department_name !== undefined ? { department_name: body.department_name ?? null } : {}) }).eq("wo_id", id);
  }

  const c = cur as { wo_no: string; mo_no: string | null };
  await writeAudit(admin, { action: "update", entityType: "mo_work_order", entityId: id, actorId: user.id,
    actorName: user.email ?? null, metadata: { wo_no: c.wo_no, mo_no: c.mo_no, ...patch, ...(body.via ? { via: String(body.via).slice(0, 30), label: String(body.label ?? "").slice(0, 300) } : {}) } });
  return NextResponse.json({ id, error: null });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "work_board.dispatch"); if (denied) return denied;   // สิทธิ์เดียวกับเส้นสร้าง (เดิมแค่ login = ช่องโหว่)
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  const url = new URL(request.url), via = url.searchParams.get("via"), label = url.searchParams.get("label");
  const viaMeta = via ? { via: via.slice(0, 30), label: (label ?? "").slice(0, 300) } : {};
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("mo_work_orders").select("wo_no, mo_no, received_qty").eq("id", id).maybeSingle();
  // มาจากป๊อปแก้ไข: ใบที่ช่างส่งคืนแล้วยกเลิกไม่ได้ (ต้องลบรอบส่งคืนก่อน ไม่งั้นยอดคืน/ค่าแรงลอย)
  if (via && cur && num((cur as { received_qty: unknown }).received_qty) > 0)
    return NextResponse.json({ error: "ใบนี้ช่างส่งคืนแล้ว — ลบรอบส่งคืนก่อนจึงจะยกเลิกใบจ่ายได้" }, { status: 400 });
  const { error } = await admin.from("mo_work_orders").update({ is_active: false, status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "mo_work_order", entityId: id, actorId: user.id, actorName: user.email ?? null,
    metadata: { wo_no: (cur as { wo_no?: string } | null)?.wo_no ?? null, mo_no: (cur as { mo_no?: string } | null)?.mo_no ?? null, ...viaMeta } });
  return NextResponse.json({ data: { archived: true }, error: null });
}
