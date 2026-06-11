import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { getPaymentBatchDetail } from "@/lib/payroll-payments-db";

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
