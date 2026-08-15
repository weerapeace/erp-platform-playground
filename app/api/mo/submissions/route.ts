/**
 * ส่งงาน (รับงานคืน เดิม) — บันทึกการส่งงานรายครั้ง
 * POST { wo_id, qty, wage } → บันทึก wo_submissions + บวก received_qty + ตั้ง labor_cost · ส่งครบ → ปิดใบ (status done)
 * GET  ?search= → รายการส่งงาน (ตารางส่งงาน) ล่าสุด
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { notifyEvent, pushLineTpl, boardLink } from "@/lib/board-notify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type WoSubmission = {
  id: string; wo_id: string | null; wo_no: string | null; mo_no: string | null;
  sku: string | null; sku_name: string | null; craftsman_name: string | null; department_name: string | null;
  qty: number; wage: number | null; submitted_at: string; due_date: string | null; created_at: string;
  /** true = ส่งงานไว้ก่อน ยังไม่ลงวันที่/ค่าแรงจริง (รอเติม) */
  info_pending?: boolean;
};

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  let q = supabaseAdmin().from("wo_submissions")
    .select("id, wo_id, wo_no, mo_no, sku, sku_name, craftsman_name, department_name, qty, wage, submitted_at, due_date, created_at, info_pending")
    .order("submitted_at", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (searchParams.get("pending") === "1") q = q.eq("info_pending", true);   // รายงาน "ยังไม่ครบ"
  const woId = (searchParams.get("wo_id") ?? "").trim();
  if (woId) q = q.eq("wo_id", woId);   // ใช้ตอนเปิดป๊อป QC เพื่อดูว่างานใบนี้ยังค้างข้อมูลไหม
  if (search) q = q.or(`wo_no.ilike.%${search}%,mo_no.ilike.%${search}%,sku.ilike.%${search}%,sku_name.ilike.%${search}%,craftsman_name.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const wo_id = String(body.wo_id ?? "");
  const qty = n(body.qty);
  const wage = body.wage == null || body.wage === "" ? null : n(body.wage);
  // แก้ช่างที่ผลิต (กรณีลงผิด แก้ตรงตอนส่ง) — ไม่ส่งมา = ใช้ช่างเดิมของใบงาน
  const overrideWorker = body.worker == null || String(body.worker).trim() === "" ? null : String(body.worker).trim();
  const overrideWorkerId = body.worker_id ? String(body.worker_id) : null;
  const allowOver = body.allow_over === true;   // อนุญาตส่งเกินยอดที่จ่าย (เฉพาะจอ QC ที่เตือนสีเหลืองแล้ว) — จอบอร์ดจ่ายงานไม่ส่ง flag นี้ = คงเดิม
  if (!wo_id) return NextResponse.json({ error: "missing wo_id" }, { status: 400 });
  if (qty <= 0) return NextResponse.json({ error: "จำนวนต้องมากกว่า 0" }, { status: 400 });
  // ส่งงานไว้ก่อน ยังไม่ลงวันที่/ค่าแรง → ข้ามการบังคับใส่ค่าแรง แล้วไปโผล่ในรายงาน "ยังไม่ครบ"
  const infoPending = body.info_pending === true;
  if (wage == null && !infoPending) return NextResponse.json({ error: "กรุณาใส่ค่าแรงก่อนส่งงาน (หรือติ๊ก “ยังไม่ลงวันที่/ค่าแรง”)" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: wo } = await admin.from("mo_work_orders").select("id, wo_no, mo_no, product_sku, product_name, assignee_id, assignee_type, assignee_name, department_name, qty, received_qty, due_date").eq("id", wo_id).single();
  if (!wo) return NextResponse.json({ error: "ไม่พบใบจ่ายงาน" }, { status: 404 });

  // ช่างที่ผลิตจริง (ใช้ที่แก้ ถ้ามี ไม่งั้นช่างเดิม) — สำหรับบันทึก + แจ้งเตือน
  const effWorker = overrideWorker ?? (wo.assignee_name as string | null);
  const effWorkerId = overrideWorkerId ?? (wo.assignee_type === "craftsman" ? wo.assignee_id : null);

  // ส่งเกินยอดที่จ่าย: บล็อคเหมือนเดิม เว้นแต่ allow_over (จอ QC อนุญาต + เตือนสีเหลืองแล้ว)
  const remaining = Number(wo.qty ?? 0) - Number(wo.received_qty ?? 0);
  if (qty > remaining && !allowOver) return NextResponse.json({ error: `ส่งเกินจำนวนที่เหลือ (${remaining})` }, { status: 400 });
  const newReceived = Number(wo.received_qty ?? 0) + qty;

  // วันที่ส่งงาน — หน้าจอส่งมาได้ (เลือกวัน/ลงย้อนหลัง)
  // ⚠️ ถ้าไม่ส่งมา ฐานข้อมูลใส่ CURRENT_DATE ให้ ซึ่งเป็นวันที่ตามเวลา UTC
  //    → ช่วงเที่ยงคืน–07:00 เวลาไทย จะถูกบันทึกเป็น "เมื่อวาน" (กับดัก timezone เดิมของโปรเจกต์)
  const submittedAt = /^\d{4}-\d{2}-\d{2}$/.test(String(body.submitted_at ?? "")) ? String(body.submitted_at) : null;

  // 1) บันทึกการส่งงานรายครั้ง
  const { error: insErr } = await admin.from("wo_submissions").insert({
    wo_id, wo_no: wo.wo_no, mo_no: wo.mo_no, sku: wo.product_sku, sku_name: wo.product_name ?? wo.product_sku,
    craftsman_id: effWorkerId, craftsman_name: effWorker, department_name: wo.department_name,
    qty, wage, due_date: wo.due_date, created_by: user?.id ?? null, created_by_name: user?.email ?? null,
    info_pending: infoPending,
    ...(submittedAt ? { submitted_at: submittedAt } : {}),
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  // 2) อัปเดตใบจ่ายงาน — บวกยอดส่ง + ค่าแรง + ปิดใบถ้าส่งครบ + แก้ช่างถ้ามีการแก้
  const patch: Record<string, unknown> = { received_qty: newReceived };
  if (wage != null) patch.labor_cost = wage;   // ยังไม่ลงค่าแรง → ไม่ไปล้างค่าแรงเดิมของใบงาน
  if (overrideWorker) { patch.assignee_name = effWorker; if (overrideWorkerId) { patch.assignee_id = overrideWorkerId; patch.assignee_type = "craftsman"; } }
  if (newReceived >= Number(wo.qty ?? 0)) patch.status = "done";
  await admin.from("mo_work_orders").update(patch).eq("id", wo_id);

  await writeAudit(admin, { action: "wo.submit", entityType: "wo_submissions", entityId: wo_id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { sku: wo.product_sku, qty, wage, worker: effWorker, worker_changed: !!overrideWorker, done: newReceived >= Number(wo.qty ?? 0) } });

  // แจ้งเตือน "มีงานรอ QC" (best-effort): กระดิ่ง (หัวหน้า) + LINE กลุ่ม QC
  await notifyEvent(admin, "qc.pending", "mo_work_order", wo_id, user?.id ?? null, {
    sku: wo.product_sku, product_name: wo.product_name ?? wo.product_sku, worker: effWorker ?? "—", qty, mo_no: wo.mo_no,
  });
  await pushLineTpl(admin, "qc", "qc_pending", {
    sku: wo.product_sku ?? "", product_name: wo.product_name ?? "", worker: effWorker ?? "—", qty, link: boardLink("/master/qc-warehouse"),
  });

  return NextResponse.json({ error: null, done: newReceived >= Number(wo.qty ?? 0) });
}

/**
 * เติมข้อมูลที่ค้าง (วันที่/ค่าแรง) ของรายการส่งงาน — /api/mo/submissions PATCH
 * body { id, submitted_at?, wage?, info_pending? }
 * ใส่ค่าแรงแล้ว → อัปเดต labor_cost ของใบจ่ายงานให้ด้วย + ปลดธง "ยังไม่ครบ" อัตโนมัติ
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: sub } = await admin.from("wo_submissions").select("id, wo_id, qty, wage, submitted_at, info_pending").eq("id", id).single();
  if (!sub) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(body.submitted_at ?? ""))) patch.submitted_at = String(body.submitted_at);
  const wage = body.wage == null || body.wage === "" ? null : n(body.wage);
  if ("wage" in body) patch.wage = wage;
  // ครบเมื่อ: มีค่าแรงแล้ว (หรือสั่งปลดธงเอง)
  const nextWage = "wage" in body ? wage : (sub.wage as number | null);
  if ("info_pending" in body) patch.info_pending = body.info_pending === true;
  else if (nextWage != null) patch.info_pending = false;
  if (Object.keys(patch).length === 0) return NextResponse.json({ data: { id }, error: null });

  const { error } = await admin.from("wo_submissions").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // ใส่ค่าแรงแล้ว → ใบจ่ายงานต้องเห็นด้วย (ยอดค่าแรงรวมของโต๊ะคิดจากตรงนี้)
  if (sub.wo_id && nextWage != null) await admin.from("mo_work_orders").update({ labor_cost: nextWage }).eq("id", sub.wo_id);

  await writeAudit(admin, { action: "wo.submit_fill", entityType: "wo_submissions", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: patch });
  return NextResponse.json({ data: { id, ...patch }, error: null });
}

// ย้อนกลับ (ลบรายการส่งงาน กรณีส่งผิด) — คืน received_qty + เปิดใบกลับถ้าเคยปิด
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: sub } = await admin.from("wo_submissions").select("id, wo_id, qty, sku").eq("id", id).single();
  if (!sub) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });

  if (sub.wo_id) {
    const { data: wo } = await admin.from("mo_work_orders").select("received_qty, qc_pulled_qty, qty, status").eq("id", sub.wo_id).single();
    if (wo) {
      const newReceived = Number(wo.received_qty ?? 0) - Number(sub.qty);
      // กันข้อมูลขัดกัน: ถ้างานถูกดึงเข้า QC ไปแล้วเกินที่จะคืนได้ → ย้อนไม่ได้
      if (newReceived < Number(wo.qc_pulled_qty ?? 0)) return NextResponse.json({ error: "ส่งงานนี้ถูกดึงเข้าโกดัง QC แล้ว ย้อนกลับไม่ได้ (เอาออกจากโกดัง QC ก่อน)" }, { status: 400 });
      const patch: Record<string, unknown> = { received_qty: Math.max(0, newReceived) };
      if (wo.status === "done" && newReceived < Number(wo.qty ?? 0)) patch.status = "dispatched";   // เปิดใบกลับ → การ์ดกลับมาบนบอร์ด
      await admin.from("mo_work_orders").update(patch).eq("id", sub.wo_id);
    }
  }
  await admin.from("wo_submissions").delete().eq("id", id);
  await writeAudit(admin, { action: "wo.submit_undo", entityType: "wo_submissions", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { wo_id: sub.wo_id, qty: sub.qty } });
  return NextResponse.json({ error: null });
}
