import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { archivePayrollRegisterRecurringItem, updatePayrollRegisterRecurringItem } from "@/lib/payroll-register-recurring-db";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function actorFrom(req: NextRequest) {
  try {
    const { data } = await supabaseFromRequest(req).auth.getUser();
    return { actorId: data.user?.id ?? null, actorName: data.user?.email ?? null };
  } catch {
    return { actorId: null, actorName: null };
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const data = await updatePayrollRegisterRecurringItem(id, body, await actorFrom(req));
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "แก้คนนอกประจำทะเบียนเงินเดือนไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const data = await archivePayrollRegisterRecurringItem(id, await actorFrom(req));
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ปิดใช้งานคนนอกประจำทะเบียนเงินเดือนไม่สำเร็จ" }, { status: 500 });
  }
}
