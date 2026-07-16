import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { listAddablePaymentEmployees } from "@/lib/payroll-payments-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/payroll/payment-batches/[id]/addable
// รายชื่อพนักงานที่เพิ่มเข้ารอบจ่ายนี้ได้ (active + มีสัญญา + ยังไม่อยู่ในรอบ) + ยอดเริ่มต้น
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const data = await listAddablePaymentEmployees(id);
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดรายชื่อพนักงานไม่สำเร็จ" }, { status: 500 });
  }
}
