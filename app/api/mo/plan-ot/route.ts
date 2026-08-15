/**
 * OT วางแผน ต่อแผนจ่ายงาน ต่อคน — /api/mo/plan-ot
 *   GET    ?plan_id=<uuid>                → รายการ OT ของแผนนั้น (ทุกคน)
 *   POST   { plan_id, employee_id, department_id?, rate_per_hour, hours_per_day, days, note? }
 *          → upsert (1 คน 1 แถวต่อแผน) · ยอด = ฿/ชม. × ชม./วัน × วัน (DB คิดให้)
 *   DELETE ?plan_id=&employee_id=         → ล้าง OT ของคนนั้นในแผนนั้น
 *
 * ⚠️ ตัวเลขนี้ "ใช้บนบอร์ดอย่างเดียว" — ไม่เข้าระบบเงินเดือน (overtime_entries) และไม่มีผลกับยอดจ่ายจริง
 *    (เจ้าของเลือกไว้ตอนออกแบบ: อยากได้ไว้วางแผนค่าแรงโต๊ะก่อน ไม่ผูกกับการจ่ายเงิน)
 * ของกลาง: guardApi + supabaseAdmin + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type PlanOtRow = {
  employee_id: string; department_id: string | null;
  rate_per_hour: number; hours_per_day: number; days: number; amount: number; note: string | null;
};

const num = (v: unknown) => { const n = Number(v); return isFinite(n) && n >= 0 ? n : 0; };
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const planId = (new URL(request.url).searchParams.get("plan_id") ?? "").trim();
  if (!isUuid(planId)) return NextResponse.json({ data: [], error: null });   // บอร์ด "ของจริง" ไม่ใช่แผน → ไม่มี OT
  const { data, error } = await supabaseAdmin().from("mo_plan_ot")
    .select("employee_id, department_id, rate_per_hour, hours_per_day, days, amount, note").eq("plan_id", planId);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const rows = (data ?? []).map((r) => ({
    employee_id: String(r.employee_id), department_id: r.department_id ? String(r.department_id) : null,
    rate_per_hour: Number(r.rate_per_hour) || 0, hours_per_day: Number(r.hours_per_day) || 0,
    days: Number(r.days) || 0, amount: Number(r.amount) || 0, note: (r.note as string) ?? null,
  })) as PlanOtRow[];
  return NextResponse.json({ data: rows, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const planId = String(b.plan_id ?? "").trim();
  const empId = String(b.employee_id ?? "").trim();
  if (!isUuid(planId)) return NextResponse.json({ error: "ตั้ง OT ได้เฉพาะในหน้าแผน (บอร์ดของจริงไม่ใช่แผน)" }, { status: 400 });
  if (!isUuid(empId)) return NextResponse.json({ error: "ต้องระบุพนักงาน" }, { status: 400 });

  const row = {
    plan_id: planId, employee_id: empId,
    department_id: b.department_id ? String(b.department_id) : null,
    rate_per_hour: num(b.rate_per_hour), hours_per_day: num(b.hours_per_day), days: num(b.days),
    note: b.note ? String(b.note).slice(0, 200) : null,
    created_by: user?.email ?? null,
    updated_at: new Date().toISOString(),
  };

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("mo_plan_ot").upsert(row, { onConflict: "plan_id,employee_id" })
    .select("employee_id, department_id, rate_per_hour, hours_per_day, days, amount, note").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "update", entityType: "mo_plan_ot", entityId: planId,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { employee_id: empId, rate_per_hour: row.rate_per_hour, hours_per_day: row.hours_per_day, days: row.days, amount: Number(data?.amount) || 0 },
  });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const sp = new URL(request.url).searchParams;
  const planId = (sp.get("plan_id") ?? "").trim(), empId = (sp.get("employee_id") ?? "").trim();
  if (!isUuid(planId) || !isUuid(empId)) return NextResponse.json({ error: "ต้องระบุแผนและพนักงาน" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("mo_plan_ot").delete().eq("plan_id", planId).eq("employee_id", empId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "mo_plan_ot", entityId: planId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { employee_id: empId } });
  return NextResponse.json({ error: null });
}
