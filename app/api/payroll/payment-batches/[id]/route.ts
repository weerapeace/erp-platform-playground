import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { getPaymentBatchDetail, deletePaymentBatch, updatePaymentBatchHeader } from "@/lib/payroll-payments-db";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardPayroll(_req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const data = await getPaymentBatchDetail(id);
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดชุดจ่ายไม่สำเร็จ" }, { status: 500 });
  }
}

// แก้หัวรอบจ่าย (เฉพาะรอบร่าง) — body: { payment_date?, note? }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const patch: { payment_date?: string | null; note?: string | null } = {};
    if (body.payment_date !== undefined) patch.payment_date = body.payment_date;
    if (body.note !== undefined) patch.note = body.note;
    const { data: u } = await supabaseFromRequest(req).auth.getUser();
    const data = await updatePaymentBatchHeader(id, patch, { actorId: u.user?.id ?? null, actorName: u.user?.email ?? null });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "แก้รอบจ่ายไม่สำเร็จ" }, { status: 500 });
  }
}

// ลบรอบจ่าย (เฉพาะรอบที่ยกเลิกแล้ว)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const { data: u } = await supabaseFromRequest(req).auth.getUser();
    const data = await deletePaymentBatch(id, { actorId: u.user?.id ?? null, actorName: u.user?.email ?? null });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ลบรอบจ่ายไม่สำเร็จ" }, { status: 500 });
  }
}
