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

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type WoSubmission = {
  id: string; wo_id: string | null; wo_no: string | null; mo_no: string | null;
  sku: string | null; sku_name: string | null; craftsman_name: string | null; department_name: string | null;
  qty: number; wage: number | null; submitted_at: string; due_date: string | null; created_at: string;
};

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  let q = supabaseAdmin().from("wo_submissions")
    .select("id, wo_id, wo_no, mo_no, sku, sku_name, craftsman_name, department_name, qty, wage, submitted_at, due_date, created_at")
    .order("submitted_at", { ascending: false }).order("created_at", { ascending: false }).limit(500);
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
  if (!wo_id) return NextResponse.json({ error: "missing wo_id" }, { status: 400 });
  if (qty <= 0) return NextResponse.json({ error: "จำนวนต้องมากกว่า 0" }, { status: 400 });
  if (wage == null) return NextResponse.json({ error: "กรุณาใส่ค่าแรงก่อนส่งงาน" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: wo } = await admin.from("mo_work_orders").select("id, wo_no, mo_no, product_sku, product_name, assignee_id, assignee_type, assignee_name, department_name, qty, received_qty, due_date").eq("id", wo_id).single();
  if (!wo) return NextResponse.json({ error: "ไม่พบใบจ่ายงาน" }, { status: 404 });

  const newReceived = Number(wo.received_qty ?? 0) + qty;
  const remaining = Number(wo.qty ?? 0) - Number(wo.received_qty ?? 0);
  if (qty > remaining) return NextResponse.json({ error: `ส่งเกินจำนวนที่เหลือ (${remaining})` }, { status: 400 });

  // 1) บันทึกการส่งงานรายครั้ง
  const { error: insErr } = await admin.from("wo_submissions").insert({
    wo_id, wo_no: wo.wo_no, mo_no: wo.mo_no, sku: wo.product_sku, sku_name: wo.product_name ?? wo.product_sku,
    craftsman_id: wo.assignee_type === "craftsman" ? wo.assignee_id : null, craftsman_name: wo.assignee_name, department_name: wo.department_name,
    qty, wage, due_date: wo.due_date, created_by: user?.id ?? null, created_by_name: user?.email ?? null,
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  // 2) อัปเดตใบจ่ายงาน — บวกยอดส่ง + ค่าแรง + ปิดใบถ้าส่งครบ
  const patch: Record<string, unknown> = { received_qty: newReceived, labor_cost: wage };
  if (newReceived >= Number(wo.qty ?? 0)) patch.status = "done";
  await admin.from("mo_work_orders").update(patch).eq("id", wo_id);

  await writeAudit(admin, { action: "wo.submit", entityType: "wo_submissions", entityId: wo_id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { sku: wo.product_sku, qty, wage, done: newReceived >= Number(wo.qty ?? 0) } });
  return NextResponse.json({ error: null, done: newReceived >= Number(wo.qty ?? 0) });
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
