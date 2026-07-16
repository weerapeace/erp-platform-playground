import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { addPaymentBatchLines, updatePaymentBatchLine } from "@/lib/payroll-payments-db";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/payroll/payment-batches/[id]/line — เพิ่มพนักงานเข้ารอบ (เฉพาะรอบร่าง)
// body: { lines: [{ employee_id, paid_amount }] }  (หรือแบบเดี่ยว { employee_id, paid_amount })
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const rawItems: Array<{ employee_id?: unknown; paid_amount?: unknown }> = Array.isArray(body.lines)
      ? body.lines
      : [{ employee_id: body.employee_id, paid_amount: body.paid_amount }];
    const items = rawItems.map((it) => ({
      employee_id: String(it.employee_id ?? ""),
      paid_amount: it.paid_amount === null || it.paid_amount === "" ? 0 : Number(it.paid_amount),
    }));
    if (!items.some((it) => it.employee_id)) return NextResponse.json({ error: "ต้องเลือกพนักงาน" }, { status: 400 });
    const { data: u } = await supabaseFromRequest(req).auth.getUser();
    const data = await addPaymentBatchLines(id, items, { actorId: u.user?.id ?? null, actorName: u.user?.email ?? null });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "เพิ่มพนักงานไม่สำเร็จ" }, { status: 500 });
  }
}

// PATCH /api/payroll/payment-batches/[id]/line — แก้บรรทัด (เฉพาะรอบร่าง)
// body: { line_id, paid_amount?, bank_name?, bank_account_no?, bank_account_name? }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const lineId = String(body.line_id ?? "");
    if (!lineId) return NextResponse.json({ error: "ต้องระบุ line_id" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (body.paid_amount !== undefined) patch.paid_amount = body.paid_amount === null || body.paid_amount === "" ? null : Number(body.paid_amount);
    if (body.bank_name !== undefined) patch.bank_name = body.bank_name;
    if (body.bank_account_no !== undefined) patch.bank_account_no = body.bank_account_no;
    if (body.bank_account_name !== undefined) patch.bank_account_name = body.bank_account_name;
    const { data: u } = await supabaseFromRequest(req).auth.getUser();
    const data = await updatePaymentBatchLine(id, lineId, patch, { actorId: u.user?.id ?? null, actorName: u.user?.email ?? null });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "แก้บรรทัดไม่สำเร็จ" }, { status: 500 });
  }
}
