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
import { pushLineTpl, dmEmployeeById, boardLink } from "@/lib/board-notify";
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
  labor?: { prod_plan: number; prod_actual: number; piece_plan: number; piece_actual: number };
  central_rate?: number;   // ค่าแรงผลิต/ชิ้น ราคากลางจาก BOM (เติมในตอน board)
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
  labor_cost?: number | null;   // ค่าแรงผลิตรวม (กรอกตั้งแต่ตอนจ่ายงาน — default ราคากลาง × จำนวน)
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
    labor_cost: body.labor_cost != null ? num(body.labor_cost) : null,
    dispatch_date: body.dispatch_date || new Date().toISOString().slice(0, 10),
    due_date: body.due_date || null, status: "dispatched", note: body.note ?? null,
    created_by: user.id, is_active: true,
  }).select("id, wo_no").single();
  if (error) return NextResponse.json({ error: "จ่ายงานไม่สำเร็จ: " + error.message }, { status: 400 });

  await writeAudit(admin, { action: "create", entityType: "mo_work_order", entityId: wo.id, actorId: user.id,
    actorName: user.email ?? null, metadata: { wo_no: woNo, mo_no: body.mo_no, qty, stage: body.stage } });

  // B1: จ่ายงานใบแรกของ MO → ย้ายวัตถุดิบตาม BOM จาก WH-RAW → WH-WIP อัตโนมัติ (ระดับ MO ครั้งเดียว)
  // best-effort — ถ้าย้ายไม่สำเร็จ (ไม่มี BOM/คลัง) ก็ให้การจ่ายงานสำเร็จไปก่อน ไม่บล็อค
  try {
    const { data: mo } = await admin.from("manufacturing_orders")
      .select("id, materials_issued").eq("mo_no", body.mo_no).maybeSingle();
    const moRow = mo as { id?: string; materials_issued?: boolean } | null;
    if (moRow?.id && !moRow.materials_issued) {
      await admin.rpc("erp_mo_issue_to_wip", { p_mo_id: moRow.id, p_actor: user.email ?? null });
    }
  } catch (e) { console.error("[dispatch] ย้ายวัตถุดิบเข้า WIP ไม่สำเร็จ:", e instanceof Error ? e.message : e); }

  // แจ้งเตือน (best-effort): DM ช่างที่รับงาน + LINE กลุ่มผลิต (จ่ายงานบ่อย จึงไม่เด้งกระดิ่ง)
  const isCraft = body.assignee_type === "craftsman" && !!body.assignee_id;
  const link = boardLink("/master/work-board");
  await pushLineTpl(admin, "production", "wo_dispatched", {
    sku: body.product_sku ?? "", product_name: body.product_name ?? "",
    worker: isCraft ? (body.assignee_name ?? "") : "ทั้งแผนก", dept: body.department_name ?? "แผนก",
    qty, due: body.due_date ?? "—", mo_no: body.mo_no, link,
  });
  if (isCraft) await dmEmployeeById(admin, body.assignee_id, `📤 คุณได้รับงานใหม่\n${body.product_sku ?? ""} · ${body.product_name ?? ""}\nจำนวน ${qty} ชิ้น${body.due_date ? ` · กำหนด ${body.due_date}` : ""}\n🔗 ${link}`);

  return NextResponse.json({ id: wo.id, wo_no: woNo, error: null });
}

// PATCH — แก้ใบงานจริง (ค่าแรง / ผู้รับงาน) หลังจ่ายแล้ว
type PatchBody = { id?: string; labor_cost?: number | null; assignee_type?: string | null; assignee_id?: string | null; assignee_name?: string | null; assignees?: { id: string | null; name: string }[];
  // ย้ายโต๊ะ (ลากการ์ดข้ามคอลัมน์บนบอร์ด)
  department_id?: string | null; department_name?: string | null; stage?: string | null };
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "work_board.dispatch"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: PatchBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ไม่พบใบงาน" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("labor_cost" in body)    patch.labor_cost    = body.labor_cost != null ? num(body.labor_cost) : null;
  if ("assignee_type" in body) patch.assignee_type = body.assignee_type ?? "department";
  if ("assignee_id" in body)   patch.assignee_id   = body.assignee_id ?? null;
  if ("assignees" in body)     patch.assignees     = Array.isArray(body.assignees) ? body.assignees : [];
  if ("assignee_name" in body) patch.assignee_name = body.assignee_name ?? null;
  // ย้ายโต๊ะ — ลากการ์ดใบจ่ายงานข้ามคอลัมน์ (บอร์ด "ของจริง")
  if ("department_id" in body)   patch.department_id   = body.department_id ?? null;
  if ("department_name" in body) patch.department_name = body.department_name ?? null;
  if ("stage" in body)           patch.stage           = body.stage ?? null;
  if (Object.keys(patch).length === 1) return NextResponse.json({ id: body.id, error: null });   // มีแค่ updated_at = ไม่มีอะไรแก้

  const admin = supabaseAdmin();
  const { error } = await admin.from("mo_work_orders").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "mo_work_order", entityId: body.id, actorId: user.id, actorName: user.email ?? null, metadata: patch });
  return NextResponse.json({ id: body.id, error: null });
}
