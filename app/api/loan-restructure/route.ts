/**
 * ปรับโครงสร้างหนี้ (Loan Restructuring)
 *
 * GET  /api/loan-restructure?contract_id=<uuid>
 *      → ประวัติการปรับโครงสร้างของสัญญานั้น (ล่าสุดก่อน) · สิทธิ์ loan_contracts.view
 *
 * POST /api/loan-restructure
 *      body: { contract_id, effective_date, kinds[], bank_ref, reason,
 *              opening_principal, capitalized_interest, fee_amount, fee_label,
 *              terms: { interest_rate, interest_rate_type, interest_rate_reference, repayment_method,
 *                       payment_due_day, holiday_periods, periods, installment_amount },
 *              rows: [{ due_date, principal_due, interest_due, fee_due }] }
 *      → เรียก loan_restructure_apply() ทำทุกอย่างใน transaction เดียว + จด audit
 *      สิทธิ์ loan_contracts.restructure (admin เท่านั้นตอนนี้)
 *
 * ทำไมไม่ใช้ master-v2 generic: การปรับโครงสร้างต้องแตะ 5 ตารางพร้อมกัน
 * (สัญญา/เวอร์ชันตาราง/งวด/ค่าธรรมเนียม/ใบเบิก) — ให้ DB function เป็นเจ้าของลำดับ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { RESTRUCTURE_KINDS, scheduleTotals, type ScheduleRow } from "@/lib/loan-restructure";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KIND_KEYS = new Set<string>(RESTRUCTURE_KINDS.map((k) => k.key));
const METHODS = new Set(["equal_installment", "equal_principal", "interest_only", "custom"]);
const RATE_TYPES = new Set(["fixed", "floating"]);

const num = (v: unknown, def = 0): number => { const n = Number(v); return isFinite(n) ? n : def; };
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "loan_contracts.view");
  if (denied) return denied;

  const contractId = request.nextUrl.searchParams.get("contract_id") ?? "";
  if (!UUID_RE.test(contractId)) return NextResponse.json({ data: [], error: "ไม่ระบุสัญญา" }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("loan_restructurings")
    .select("*")
    .eq("loan_contract_id", contractId)
    .order("seq_no", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ data: [], error: "โหลดประวัติปรับโครงสร้างไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

type Body = {
  contract_id?: string; effective_date?: string; kinds?: unknown; bank_ref?: string; reason?: string;
  opening_principal?: unknown; capitalized_interest?: unknown; fee_amount?: unknown; fee_label?: string;
  terms?: Record<string, unknown>; rows?: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "loan_contracts.restructure");
  if (denied) return denied;

  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const contractId = typeof body.contract_id === "string" ? body.contract_id : "";
  if (!UUID_RE.test(contractId)) return NextResponse.json({ error: "ไม่พบสัญญา" }, { status: 400 });

  const effective = typeof body.effective_date === "string" ? body.effective_date : "";
  if (!DATE_RE.test(effective)) return NextResponse.json({ error: "ต้องระบุวันที่มีผล" }, { status: 400 });

  const kinds = Array.isArray(body.kinds) ? body.kinds.filter((k): k is string => typeof k === "string" && KIND_KEYS.has(k)) : [];
  if (kinds.length === 0) return NextResponse.json({ error: "เลือกอย่างน้อย 1 อย่างว่าธนาคารให้อะไร" }, { status: 400 });

  const opening = r2(num(body.opening_principal));
  if (opening <= 0) return NextResponse.json({ error: "เงินต้นตั้งต้น ณ วันมีผล ต้องมากกว่า 0" }, { status: 400 });
  const cap = r2(Math.max(0, num(body.capitalized_interest)));
  const fee = r2(Math.max(0, num(body.fee_amount)));

  const t = body.terms ?? {};
  const rate = num(t.interest_rate, -1);
  if (rate < 0 || rate > 100) return NextResponse.json({ error: "อัตราดอกเบี้ยต้องอยู่ระหว่าง 0-100%" }, { status: 400 });
  const rateType = typeof t.interest_rate_type === "string" && RATE_TYPES.has(t.interest_rate_type) ? t.interest_rate_type : "";
  const method = typeof t.repayment_method === "string" && METHODS.has(t.repayment_method) ? t.repayment_method : "";
  const dueDay = t.payment_due_day == null || t.payment_due_day === "" ? null : Math.floor(num(t.payment_due_day));
  if (dueDay !== null && (dueDay < 1 || dueDay > 31)) return NextResponse.json({ error: "วันตัดงวดต้องอยู่ระหว่าง 1-31" }, { status: 400 });

  const rawRows = Array.isArray(body.rows) ? body.rows as Record<string, unknown>[] : [];
  if (rawRows.length === 0) return NextResponse.json({ error: "ต้องมีงวดใหม่อย่างน้อย 1 งวด" }, { status: 400 });
  if (rawRows.length > 600) return NextResponse.json({ error: "จำนวนงวดต้องไม่เกิน 600 งวด" }, { status: 400 });
  const rows: ScheduleRow[] = [];
  let prevDue = "";
  for (const r of rawRows) {
    const due = typeof r.due_date === "string" ? r.due_date : "";
    if (!DATE_RE.test(due)) return NextResponse.json({ error: "งวดใหม่ทุกงวดต้องมีวันครบกำหนด" }, { status: 400 });
    if (due < effective) return NextResponse.json({ error: `งวดวันที่ ${due} อยู่ก่อนวันมีผล ${effective}` }, { status: 400 });
    if (prevDue && due < prevDue) return NextResponse.json({ error: "วันครบกำหนดต้องเรียงจากเก่าไปใหม่" }, { status: 400 });
    prevDue = due;
    const p = num(r.principal_due), i = num(r.interest_due), f = num(r.fee_due);
    if (p < 0 || i < 0 || f < 0) return NextResponse.json({ error: "จำนวนเงินต้องไม่ติดลบ" }, { status: 400 });
    rows.push({ due_date: due, principal_due: r2(p), interest_due: r2(i), fee_due: r2(f) });
  }
  const totals = scheduleTotals(rows);
  if (Math.abs(totals.principal - opening) > 1) {
    return NextResponse.json({ error: `เงินต้นรวมในงวดใหม่ (${totals.principal.toLocaleString("th-TH")}) ไม่เท่ากับเงินต้นตั้งต้น (${opening.toLocaleString("th-TH")})` }, { status: 400 });
  }

  const payload = {
    effective_date: effective, kinds,
    bank_ref: typeof body.bank_ref === "string" ? body.bank_ref.slice(0, 200) : "",
    reason: typeof body.reason === "string" ? body.reason.slice(0, 2000) : "",
    opening_principal: opening, capitalized_interest: cap, fee_amount: fee,
    fee_label: typeof body.fee_label === "string" ? body.fee_label.slice(0, 200) : "",
    terms: {
      interest_rate: r2(rate),
      interest_rate_type: rateType,
      interest_rate_reference: typeof t.interest_rate_reference === "string" ? t.interest_rate_reference.slice(0, 100) : "",
      repayment_method: method,
      payment_due_day: dueDay,
      holiday_periods: Math.max(0, Math.floor(num(t.holiday_periods))),
      periods: Math.max(0, Math.floor(num(t.periods))),
      installment_amount: r2(Math.max(0, num(t.installment_amount))),
      total_interest: totals.interest,
      total_due: totals.total,
    },
    rows,
  };

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actorName = String(user?.user_metadata?.display_name ?? user?.user_metadata?.full_name ?? user?.email ?? "");

  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("loan_restructure_apply", {
    p_contract_id: contractId, p_payload: payload, p_actor: user?.id ?? null, p_actor_name: actorName,
  });
  if (error) {
    console.error("[loan-restructure] apply failed:", error.message);
    return NextResponse.json({ error: error.message.replace(/^.*?:\s*/, "") || "ปรับโครงสร้างหนี้ไม่สำเร็จ" }, { status: 400 });
  }

  await writeAudit(admin, {
    action: "restructure", entityType: "loan_contracts", entityId: contractId,
    actorId: user?.id ?? null, actorName,
    metadata: {
      restructuring_id: (data as Record<string, unknown>)?.restructuring_id ?? null,
      seq_no: (data as Record<string, unknown>)?.seq_no ?? null,
      effective_date: effective, kinds, bank_ref: payload.bank_ref,
      opening_principal: opening, capitalized_interest: cap, fee_amount: fee,
      terms: payload.terms, new_installments: rows.length,
    },
  });

  return NextResponse.json({ data, error: null });
}
