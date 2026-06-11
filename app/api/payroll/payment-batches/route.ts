import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { createPaymentBatch, listPaymentBatches, previewPaymentBatch } from "@/lib/payroll-payments-db";
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

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req);
  if (denied) return denied;
  try {
    const periodId = req.nextUrl.searchParams.get("period_id");
    const preview = req.nextUrl.searchParams.get("preview");
    if (preview === "1") {
      if (!periodId) return NextResponse.json({ error: "ต้องระบุ period_id" }, { status: 400 });
      const batchType = req.nextUrl.searchParams.get("batch_type");
      const data = await previewPaymentBatch(periodId, batchType);
      return NextResponse.json({ data, error: null });
    }
    const data = await listPaymentBatches(periodId);
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "โหลดชุดจ่ายไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit");
  if (denied) return denied;
  try {
    const body = await req.json() as { period_id?: string; batch_type?: string; payment_date?: string | null; note?: string | null; lines?: { employee_id?: string; paid_amount?: unknown; selected?: boolean; note?: string | null; persist_default?: boolean }[] };
    const periodId = String(body.period_id ?? "").trim();
    if (!periodId) return NextResponse.json({ error: "ต้องระบุ period_id" }, { status: 400 });
    const data = await createPaymentBatch({
      periodId,
      batchType: body.batch_type,
      paymentDate: body.payment_date,
      note: body.note,
      lines: body.lines,
      ...(await actorFrom(req)),
    });
    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "สร้างชุดจ่ายไม่สำเร็จ" }, { status: 500 });
  }
}
