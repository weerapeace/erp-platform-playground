/**
 * Payroll module — ลบรายการเวลา (ot/late/absence/leave)
 * DELETE /api/payroll/time-entry/<id>?kind=ot|late|absence|leave
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
const TABLE: Record<string, string> = { ot: "overtime_entries", late: "attendance_entries", absence: "attendance_entries", leave: "leave_entries" };

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  const { id } = await ctx.params;
  const kind = req.nextUrl.searchParams.get("kind") ?? "";
  const table = TABLE[kind];
  if (!id || !table) return NextResponse.json({ error: "ต้องระบุ id + kind" }, { status: 400 });

  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(req).auth.getUser(); userId = data.user?.id ?? null; } catch { /* */ }

  try {
    const a = supabaseAdmin();
    const { data: rd } = await a.from(table).select("id, payroll_period_id").eq("id", id).limit(1);
    const row = rd?.[0] as { payroll_period_id: string } | undefined;
    if (!row) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
    const { data: pd } = await a.from("payroll_periods").select("status, period_name").eq("id", row.payroll_period_id).limit(1);
    const period = pd?.[0] as { status: string; period_name: string } | undefined;
    if (period && !EDITABLE.has(String(period.status))) return NextResponse.json({ error: `งวดสถานะ "${period.status}" แก้ไม่ได้` }, { status: 409 });

    const { error } = await a.from(table).delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeAudit(a, { action: "delete", entityType: table, entityId: id, actorId: userId, metadata: { kind, period_name: period?.period_name } });
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
