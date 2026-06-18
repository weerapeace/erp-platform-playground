/**
 * แผนจ่ายงาน (ร่าง) — รายแผน — /api/mo/dispatch-plans/[id]
 * GET    → แผน + รายการร่าง (lines)
 * PATCH  { action } → rename | add_line | update_line | remove_line | apply (ดันเป็นของจริง)
 * DELETE → ลบแผน (soft)
 * ของกลาง: guardApi + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import type { DispatchPlanLine } from "../route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const stageOfDept = (name: string) => /ตัด|เตรียม/.test(name || "") ? "cut" : "assemble";

async function nextWoNo(admin: ReturnType<typeof supabaseAdmin>): Promise<string> {
  const { data, error } = await admin.rpc("erp_next_number", { p_key: "wo" });
  if (!error && data) return String(data);
  const yr = new Date().getFullYear();
  const { count } = await admin.from("mo_work_orders").select("id", { count: "exact", head: true });
  return `WO-${yr}-${String((count ?? 0) + 1).padStart(5, "0")}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const [{ data: plan }, { data: lines }] = await Promise.all([
    admin.from("mo_dispatch_plans").select("id, name, note, status, applied_at, sort_order, created_at, start_date, end_date").eq("id", id).maybeSingle(),
    admin.from("mo_dispatch_plan_lines").select("*").eq("plan_id", id).order("created_at", { ascending: true }),
  ]);
  if (!plan) return NextResponse.json({ error: "ไม่พบแผน" }, { status: 404 });
  return NextResponse.json({ data: { ...plan, lines: (lines ?? []) as DispatchPlanLine[] }, error: null });
}

type PatchBody = {
  action?: string;
  name?: string; note?: string; start_date?: string | null; end_date?: string | null;
  line?: Partial<DispatchPlanLine>;
  lineId?: string; qty?: number; assignee_id?: string | null; assignee_name?: string | null;
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "work_board.dispatch"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: PatchBody; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();

  const { data: plan } = await admin.from("mo_dispatch_plans").select("id, status, end_date").eq("id", id).maybeSingle();
  if (!plan) return NextResponse.json({ error: "ไม่พบแผน" }, { status: 404 });
  if ((plan as { status: string }).status === "applied" && b.action !== "rename")
    return NextResponse.json({ error: "แผนนี้ดันเป็นของจริงแล้ว แก้ไม่ได้" }, { status: 400 });

  if (b.action === "rename") {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.name !== undefined) patch.name = (b.name ?? "").trim() || "แผนไม่มีชื่อ";
    if (b.note !== undefined) patch.note = (b.note ?? "")?.toString().trim() || null;
    if (b.start_date !== undefined) patch.start_date = b.start_date || null;
    if (b.end_date !== undefined) patch.end_date = b.end_date || null;
    const { error } = await admin.from("mo_dispatch_plans").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  if (b.action === "add_line") {
    const l = b.line ?? {};
    const { data, error } = await admin.from("mo_dispatch_plan_lines").insert({
      plan_id: id, mo_no: l.mo_no ?? null, mo_id: l.mo_id ?? null,
      product_sku: l.product_sku ?? null, product_name: l.product_name ?? null, qty: num(l.qty),
      department_id: l.department_id ?? null, department_name: l.department_name ?? null,
      assignee_id: l.assignee_id ?? null, assignee_name: l.assignee_name ?? null,
    }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: data as DispatchPlanLine, error: null });
  }

  if (b.action === "update_line") {
    if (!b.lineId) return NextResponse.json({ error: "ต้องระบุ lineId" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (b.qty !== undefined) patch.qty = num(b.qty);
    if (b.assignee_id !== undefined) patch.assignee_id = b.assignee_id ?? null;
    if (b.assignee_name !== undefined) patch.assignee_name = b.assignee_name ?? null;
    const { error } = await admin.from("mo_dispatch_plan_lines").update(patch).eq("id", b.lineId).eq("plan_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  if (b.action === "remove_line") {
    if (!b.lineId) return NextResponse.json({ error: "ต้องระบุ lineId" }, { status: 400 });
    const { error } = await admin.from("mo_dispatch_plan_lines").delete().eq("id", b.lineId).eq("plan_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  if (b.action === "apply") {
    const { data: lines } = await admin.from("mo_dispatch_plan_lines").select("*").eq("plan_id", id);
    const rows = (lines ?? []) as DispatchPlanLine[];
    const valid = rows.filter((l) => l.mo_no && num(l.qty) > 0);
    if (valid.length === 0) return NextResponse.json({ error: "แผนนี้ยังไม่มีรายการที่จ่ายได้" }, { status: 400 });
    const planDue = (plan as { end_date?: string | null }).end_date || null;   // กำหนดเสร็จของแผน → ใส่เป็นกำหนดเสร็จของใบจ่ายงาน
    let created = 0;
    for (const l of valid) {
      const woNo = await nextWoNo(admin);
      const { error } = await admin.from("mo_work_orders").insert({
        wo_no: woNo, mo_no: l.mo_no, product_sku: l.product_sku ?? null, product_name: l.product_name ?? null,
        stage: stageOfDept(l.department_name ?? ""), assignee_type: l.assignee_id ? "craftsman" : "department",
        assignee_id: l.assignee_id ?? null, assignee_name: l.assignee_name ?? l.department_name ?? null,
        department_id: l.department_id ?? null, department_name: l.department_name ?? null,
        qty: num(l.qty), uom: "ชิ้น", received_qty: 0,
        dispatch_date: new Date().toISOString().slice(0, 10), due_date: planDue, status: "dispatched",
        note: `จากแผนจ่ายงาน`, created_by: user?.id ?? null, is_active: true,
      });
      if (!error) created += 1;
    }
    await admin.from("mo_dispatch_plans").update({ status: "applied", applied_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
    await writeAudit(admin, { action: "update", entityType: "mo_dispatch_plan", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { applied: created } });
    return NextResponse.json({ data: { applied: created }, error: null });
  }

  return NextResponse.json({ error: "action ไม่รองรับ" }, { status: 400 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "work_board.dispatch"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { error } = await admin.from("mo_dispatch_plans").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "mo_dispatch_plan", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
  return NextResponse.json({ data: { deleted: true }, error: null });
}
