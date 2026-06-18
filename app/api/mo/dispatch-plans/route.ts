/**
 * แผนจ่ายงาน (ร่าง) — กลุ่ม D — /api/mo/dispatch-plans
 * GET  → รายการแผน (+จำนวนรายการในแผน)
 * POST { name } → สร้างแผนใหม่ (ตั้งชื่อเอง)
 * ของกลาง: guardApi + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DispatchPlan = { id: string; name: string; note: string | null; status: string; applied_at: string | null; sort_order: number | null; created_at: string; line_count?: number };
export type DispatchPlanLine = {
  id: string; plan_id: string; mo_no: string | null; mo_id: string | null;
  product_sku: string | null; product_name: string | null; qty: number;
  department_id: string | null; department_name: string | null;
  assignee_id: string | null; assignee_name: string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const { data: plans, error } = await admin.from("mo_dispatch_plans")
    .select("id, name, note, status, applied_at, sort_order, created_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  // นับจำนวนรายการต่อแผน
  const ids = (plans ?? []).map((p) => (p as { id: string }).id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: lines } = await admin.from("mo_dispatch_plan_lines").select("plan_id").in("plan_id", ids);
    for (const l of (lines ?? []) as { plan_id: string }[]) counts.set(l.plan_id, (counts.get(l.plan_id) ?? 0) + 1);
  }
  const data = (plans ?? []).map((p) => ({ ...(p as DispatchPlan), line_count: counts.get((p as { id: string }).id) ?? 0 }));
  return NextResponse.json({ data, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "work_board.dispatch"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: { name?: string; note?: string }; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (b.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ต้องตั้งชื่อแผน" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("mo_dispatch_plans")
    .insert({ name, note: (b.note ?? "")?.toString().trim() || null, status: "draft", created_by: user?.id ?? null })
    .select("id, name, note, status, applied_at, sort_order, created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "mo_dispatch_plan", entityId: (data as { id: string }).id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name } });
  return NextResponse.json({ data: { ...(data as DispatchPlan), line_count: 0 }, error: null });
}
