/**
 * POST /api/loan-payment/record
 * บันทึกการจ่าย (verified) → trigger ตัดยอดเข้างวดผ่อน (rebuild จากต้นทาง) อัตโนมัติ
 *
 * body: {
 *   contract_id, payment_date?, amount, paid_from?, reference?,
 *   principal?, interest?, penalty?, fee?,    // แยกยอดตามใบเสร็จธนาคาร (ไม่ส่ง = ให้ระบบเดา)
 *   receipt_no?, receipt_image?,              // เลขที่ใบเสร็จ + รูปใบเสร็จ (R2 key)
 *   lines?: [{ charge_type_id?, label, bucket, amount }],  // รายการเพิ่มเติมของแต่ละธนาคาร
 *   payment_method?                           // วิธีจ่าย (ไม่ส่ง = ใช้ของสัญญา)
 * }
 *
 * แยกยอดมา → ตัดตามช่อง (ดอกเข้าดอก เงินต้นเข้าเงินต้น ค่าธรรมเนียม/ดอกผิดนัดเข้าช่องตัวเอง)
 * ไม่แยก    → พฤติกรรมเดิม: ยอดก้อนเดียว ตัดดอกเบี้ยก่อนแล้วเงินต้น (งวดเก่าสุดก่อน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const money = (v: unknown) => {
  const n = Number(v);
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "loan_payments.create");
  if (denied) return denied;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: {
    contract_id?: string; payment_date?: string | null; amount?: number;
    paid_from?: string; reference?: string;
    principal?: number; interest?: number; penalty?: number; fee?: number;
    receipt_no?: string; receipt_image?: string;
    lines?: Array<Record<string, unknown>>;
    payment_method?: string;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const contract_id = typeof body.contract_id === "string" ? body.contract_id : "";
  const amount = money(body.amount);
  const payment_date = body.payment_date ? String(body.payment_date) : null;
  const paid_from = typeof body.paid_from === "string" ? body.paid_from : "";
  const reference = typeof body.reference === "string" ? body.reference : "";
  const principal = money(body.principal);
  const interest  = money(body.interest);
  const penalty   = money(body.penalty);
  const fee       = money(body.fee);
  const receipt_no    = typeof body.receipt_no === "string" ? body.receipt_no.trim().slice(0, 120) : "";
  const receipt_image = typeof body.receipt_image === "string" && /^[a-zA-Z0-9._/-]*$/.test(body.receipt_image) ? body.receipt_image : "";
  const METHODS = new Set(["auto_debit", "transfer", "counter", "cheque", "cash", "other"]);
  const payment_method = typeof body.payment_method === "string" && METHODS.has(body.payment_method) ? body.payment_method : "";

  // รายการแยกเพิ่มเติม (ประเภทตั้งค่าไว้ที่ /loan-charge-types หรือผู้ใช้พิมพ์เอง)
  const BUCKETS = new Set(["principal", "interest", "penalty", "fee", "other"]);
  const rawLines = Array.isArray(body.lines) ? body.lines.slice(0, 50) : [];
  const lines = rawLines
    .map((l) => ({
      charge_type_id: typeof l?.charge_type_id === "string" && UUID_RE.test(l.charge_type_id) ? l.charge_type_id : null,
      label: String(l?.label ?? "").trim().slice(0, 120) || "รายการอื่น",
      bucket: BUCKETS.has(String(l?.bucket ?? "")) ? String(l.bucket) : "fee",
      amount: money(l?.amount),
    }))
    .filter((l) => l.amount > 0);
  const lineTotal = Math.round(lines.reduce((a, l) => a + l.amount, 0) * 100) / 100;

  if (!contract_id) return NextResponse.json({ error: "กรุณาเลือกสัญญาเงินกู้" }, { status: 400 });
  if (amount <= 0) return NextResponse.json({ error: "ยอดจ่ายต้องมากกว่า 0" }, { status: 400 });

  const split = Math.round((principal + interest + penalty + fee + lineTotal) * 100) / 100;
  if (split > 0 && Math.abs(split - amount) > 0.01) {
    return NextResponse.json({
      error: `ยอดที่แยก (${split.toLocaleString("th-TH")}) ไม่เท่ากับยอดจ่ายรวม (${amount.toLocaleString("th-TH")})`,
    }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("loan_payment_record", {
    p_contract_id: contract_id,
    p_payment_date: payment_date,
    p_amount: amount,
    p_paid_from: paid_from,
    p_reference: reference,
    p_principal: principal,
    p_interest: interest,
    p_penalty: penalty,
    p_fee: fee,
    p_receipt_no: receipt_no,
    p_receipt_image: receipt_image,
    p_lines: lines,
    p_payment_method: payment_method,
  });
  if (error) return NextResponse.json({ error: "บันทึกการจ่ายไม่สำเร็จ: " + error.message }, { status: 500 });

  await writeAudit(admin, {
    action: "loan_payment.record",
    entityType: "loan_payments",
    entityId: data as string,
    actorId: user?.id,
    metadata: { contract_id, amount, split: split > 0 ? { principal, interest, penalty, fee } : null, lines: lines.length ? lines : null, receipt_no, has_image: !!receipt_image },
  });

  return NextResponse.json({ payment_id: data, error: null });
}
