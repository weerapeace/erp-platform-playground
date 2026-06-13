/**
 * ใบจ่ายงาน (Work Dispatch) API — ผูกใบสั่งผลิต MO
 *
 * GET  /api/mo/work-orders?mo_no=MO-2026-00001  → รายการใบจ่ายงานของ MO นั้น
 * POST /api/mo/work-orders                       → จ่ายงาน 1 ใบ (เลข WO รันอัตโนมัติ)
 *
 * อ่านผ่าน auth (RLS select=true), เขียนผ่าน supabaseAdmin, audit → audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type WorkOrder = {
  id: string; wo_no: string; mo_no: string; product_sku: string | null; product_name: string | null;
  stage: string; assignee_type: string; assignee_id: string | null; assignee_name: string | null;
  department_id: string | null; department_name: string | null;
  qty: number; uom: string | null; received_qty: number;
  dispatch_date: string | null; due_date: string | null; status: string; note: string | null;
  created_at: string; updated_at: string; is_active: boolean;
  labor_cost?: number | null;
  // เสริมจาก board API
  image_url?: string | null; brand?: string | null; brand_color?: string | null; mo_id?: string | null;
};

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

async function nextWoNo(admin: ReturnType<typeof supabaseAdmin>): Promise<string> {
  const { data, error } = await admin.rpc("erp_next_number", { p_key: "wo" });
  if (!error && data) return String(data);
  const yr = new Date().getFullYear();
  const { count } = await admin.from("mo_work_orders").select("id", { count: "exact", head: true });
  return `WO-${yr}-${String((count ?? 0) + 1).padStart(5, "0")}`;
}

// ---- GET list ----
// ?mo_no=...  → ใบจ่ายงานของ MO นั้น
// (ไม่ใส่ mo_no) → ทุกใบจ่ายงานที่ยัง active (ใช้กับบอร์ด Kanban ทั้งโรงงาน)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const moNo = (new URL(request.url).searchParams.get("mo_no") ?? "").trim();
  let q = supabaseFromRequest(request).from("mo_work_orders").select("*").eq("is_active", true);
  q = moNo
    ? q.eq("mo_no", moNo).order("stage", { ascending: true }).order("created_at", { ascending: true })
    : q.order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(1000);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as WorkOrder[], error: null });
}

// ---- POST create (จ่ายงาน) ----
type CreateBody = {
  mo_no?: string; product_sku?: string | null; product_name?: string | null;
  stage?: string; assignee_type?: string; assignee_id?: string | null; assignee_name?: string | null;
  department_id?: string | null; department_name?: string | null;
  qty?: number; uom?: string | null; dispatch_date?: string | null; due_date?: string | null; note?: string | null;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "work_board.dispatch"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: CreateBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!body.mo_no) return NextResponse.json({ error: "ไม่พบใบสั่งผลิต" }, { status: 400 });
  const qty = num(body.qty);
  if (qty <= 0) return NextResponse.json({ error: "จำนวนที่จ่ายต้องมากกว่า 0" }, { status: 400 });
  if (!body.assignee_name) return NextResponse.json({ error: "ต้องเลือกผู้รับงาน" }, { status: 400 });

  const admin = supabaseAdmin();
  const woNo = await nextWoNo(admin);
  const { data: wo, error } = await admin.from("mo_work_orders").insert({
    wo_no: woNo, mo_no: body.mo_no, product_sku: body.product_sku ?? null, product_name: body.product_name ?? null,
    stage: body.stage || "cut", assignee_type: body.assignee_type || "craftsman",
    assignee_id: body.assignee_id ?? null, assignee_name: body.assignee_name ?? null,
    department_id: body.department_id ?? null, department_name: body.department_name ?? null,
    qty, uom: body.uom ?? null, received_qty: 0,
    dispatch_date: body.dispatch_date || new Date().toISOString().slice(0, 10),
    due_date: body.due_date || null, status: "dispatched", note: body.note ?? null,
    created_by: user.id, is_active: true,
  }).select("id, wo_no").single();
  if (error) return NextResponse.json({ error: "จ่ายงานไม่สำเร็จ: " + error.message }, { status: 400 });

  await writeAudit(admin, { action: "create", entityType: "mo_work_order", entityId: wo.id, actorId: user.id,
    actorName: user.email ?? null, metadata: { wo_no: woNo, mo_no: body.mo_no, qty, stage: body.stage } });
  return NextResponse.json({ id: wo.id, wo_no: woNo, error: null });
}
