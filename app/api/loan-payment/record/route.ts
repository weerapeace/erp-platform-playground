/**
 * POST /api/loan-payment/record
 * บันทึกการจ่าย (verified) → trigger ตัดยอดเข้าดอกเบี้ย/เงินต้นตามงวด (rebuild) อัตโนมัติ
 * body: { contract_id, payment_date?, amount, paid_from?, reference? }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "loan_payments.create");
  if (denied) return denied;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { contract_id?: string; payment_date?: string | null; amount?: number; paid_from?: string; reference?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const contract_id = typeof body.contract_id === "string" ? body.contract_id : "";
  const amount = Number(body.amount) || 0;
  const payment_date = body.payment_date ? String(body.payment_date) : null;
  const paid_from = typeof body.paid_from === "string" ? body.paid_from : "";
  const reference = typeof body.reference === "string" ? body.reference : "";

  if (!contract_id) return NextResponse.json({ error: "กรุณาเลือกสัญญาเงินกู้" }, { status: 400 });
  if (amount <= 0) return NextResponse.json({ error: "ยอดจ่ายต้องมากกว่า 0" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("loan_payment_record", {
    p_contract_id: contract_id,
    p_payment_date: payment_date,
    p_amount: amount,
    p_paid_from: paid_from,
    p_reference: reference,
  });
  if (error) return NextResponse.json({ error: "บันทึกการจ่ายไม่สำเร็จ: " + error.message }, { status: 500 });

  await writeAudit(admin, {
    action: "loan_payment.record",
    entityType: "loan_payments",
    entityId: data as string,
    actorId: user?.id,
    metadata: { contract_id, amount },
  });

  return NextResponse.json({ payment_id: data, error: null });
}
