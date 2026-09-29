/**
 * Payroll module — แก้ / ลบ วันหยุดของงวด
 * PATCH  /api/payroll/holidays/<id>  { holiday_date?, holiday_name? }
 * DELETE /api/payroll/holidays/<id>
 * (เฉพาะงวด draft/review, employees.edit, audit)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardPayroll } from "@/lib/payroll-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const EDITABLE = new Set(["draft", "review"]);

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(req).auth.getUser(); userId = data.user?.id ?? null; } catch { /* */ }

  try {
    const a = supabaseAdmin();
    const { data: rd } = await a.from("payroll_period_holidays").select("id, payroll_period_id, holiday_date").eq("id", id).limit(1);
    const row = rd?.[0] as { payroll_period_id: string; holiday_date: string } | undefined;
    if (!row) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
    const { data: pd } = await a.from("payroll_periods").select("status, period_name").eq("id", row.payroll_period_id).limit(1);
    const period = pd?.[0] as { status: string; period_name: string } | undefined;
    if (period && !EDITABLE.has(String(period.status))) return NextResponse.json({ error: `งวดสถานะ "${period.status}" แก้ไม่ได้` }, { status: 409 });

    const { error } = await a.from("payroll_period_holidays").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeAudit(a, { action: "delete", entityType: "payroll_period_holidays", entityId: id, actorId: userId, metadata: { period_name: period?.period_name, date: row.holiday_date } });
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ลบไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  let body: { holiday_date?: string; holiday_name?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(req).auth.getUser(); userId = data.user?.id ?? null; } catch { /* */ }

  try {
    const a = supabaseAdmin();
    const { data: rd } = await a.from("payroll_period_holidays").select("id, payroll_period_id, holiday_date, holiday_name").eq("id", id).limit(1);
    const row = rd?.[0] as { payroll_period_id: string; holiday_date: string; holiday_name: string | null } | undefined;
    if (!row) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
    const { data: pd } = await a.from("payroll_periods").select("status, period_name, start_date, end_date").eq("id", row.payroll_period_id).limit(1);
    const period = pd?.[0] as { status: string; period_name: string; start_date: string; end_date: string } | undefined;
    if (period && !EDITABLE.has(String(period.status))) return NextResponse.json({ error: `งวดสถานะ "${period.status}" แก้ไม่ได้` }, { status: 409 });

    const patch: Record<string, unknown> = {};
    if (body.holiday_date !== undefined) {
      const date = String(body.holiday_date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "รูปแบบวันที่ไม่ถูกต้อง" }, { status: 400 });
      if (period && (date < String(period.start_date).slice(0, 10) || date > String(period.end_date).slice(0, 10))) {
        return NextResponse.json({ error: "วันหยุดต้องอยู่ในช่วงของงวด" }, { status: 400 });
      }
      if (date !== String(row.holiday_date).slice(0, 10)) {
        const { data: dup } = await a.from("payroll_period_holidays").select("id").eq("payroll_period_id", row.payroll_period_id).eq("holiday_date", date).neq("id", id).limit(1);
        if (dup?.[0]) return NextResponse.json({ error: "มีวันหยุดนี้อยู่แล้ว" }, { status: 409 });
        patch.holiday_date = date;
      }
    }
    if (body.holiday_name !== undefined) {
      const nm = String(body.holiday_name ?? "").trim() || null;
      if (nm !== (row.holiday_name ?? null)) patch.holiday_name = nm;
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ data: { id }, error: null });

    const { error } = await a.from("payroll_period_holidays").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeAudit(a, { action: "update", entityType: "payroll_period_holidays", entityId: id, actorId: userId,
      metadata: { period_name: period?.period_name, old: { date: row.holiday_date, name: row.holiday_name }, new: patch } });
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "แก้ไม่สำเร็จ" }, { status: 500 });
  }
}
