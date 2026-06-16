import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { reorderPaymentBatchLines } from "@/lib/payroll-payments-db";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/payroll/payment-batches/[id]/reorder — บันทึกลำดับที่ลากเรียง
// body: { ordered_ids: string[] }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const ids = Array.isArray(body.ordered_ids) ? body.ordered_ids.map((x: unknown) => String(x)).filter(Boolean) : [];
    if (!ids.length) return NextResponse.json({ error: "ต้องระบุ ordered_ids" }, { status: 400 });
    const { data: u } = await supabaseFromRequest(req).auth.getUser();
    const data = await reorderPaymentBatchLines(id, ids, { actorId: u.user?.id ?? null, actorName: u.user?.email ?? null });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกลำดับไม่สำเร็จ" }, { status: 500 });
  }
}
