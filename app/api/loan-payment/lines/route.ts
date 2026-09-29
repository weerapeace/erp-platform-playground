/**
 * รายการย่อยของใบจ่ายเงินกู้ (loan_payment_lines) — ค่าธรรมเนียม/รายการเพิ่มเติมที่แยกไว้ตอนบันทึกการจ่าย
 *   GET    ?payment_id=                       → รายการย่อย + ยอดแต่ละช่องของใบจ่าย
 *   PATCH  { id, label?, amount?, bucket? }   → แก้ชื่อ / จำนวน / ย้ายช่อง
 *   DELETE ?id=                               → เอารายการย่อยออก (ยอดยังอยู่ในช่องเดิมของใบจ่าย แค่ไม่แยกบรรทัดแล้ว)
 *
 * กฎสำคัญ: "ยอดจ่ายรวม" ของใบจ่ายไม่เปลี่ยน — รายการย่อยเป็นแค่รายละเอียดของยอดในแต่ละช่อง
 *   แก้จำนวน  → ยอดรวมรายการย่อยในช่องนั้น ต้องไม่เกินยอดของช่อง
 *   ย้ายช่อง  → ยอดของรายการย้ายจากช่องเดิมไปช่องใหม่ (ยอดจ่ายรวมเท่าเดิม) · ช่องเงินต้น/ดอกเบี้ยมีผลต่อการตัดงวด → ระบบตัดงวดใหม่ให้
 * สิทธิ์: loan_payments.view / loan_payments.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
type Admin = ReturnType<typeof supabaseAdmin>;
const BUCKETS = ["principal", "interest", "penalty", "fee", "other"] as const;
type Bucket = (typeof BUCKETS)[number];
const COL: Record<Bucket, string> = { principal: "principal_amount", interest: "interest_amount", penalty: "penalty_amount", fee: "fee_amount", other: "other_amount" };
const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const asBucket = (v: unknown): Bucket => (BUCKETS.includes(String(v) as Bucket) ? (String(v) as Bucket) : "fee");

export type LoanPaymentLine = { id: string; payment_id: string; charge_type_id: string | null; label: string; bucket: Bucket; amount: number; sort_order: number };

const PAY_SELECT = "id, payment_no, status, total_paid, principal_amount, interest_amount, penalty_amount, fee_amount, other_amount";

async function loadLine(admin: Admin, id: string) {
  const { data: line } = await admin.from("loan_payment_lines").select("id, payment_id, charge_type_id, label, bucket, amount, sort_order").eq("id", id).maybeSingle();
  if (!line) return null;
  const { data: pay } = await admin.from("loan_payments").select(PAY_SELECT).eq("id", String((line as Row).payment_id)).maybeSingle();
  const { data: sibs } = await admin.from("loan_payment_lines").select("id, bucket, amount").eq("payment_id", String((line as Row).payment_id));
  return { line: line as Row, pay: (pay ?? null) as Row | null, sibs: (sibs ?? []) as Row[] };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "loan_payments.view"); if (denied) return denied;
  const paymentId = (new URL(request.url).searchParams.get("payment_id") ?? "").trim();
  if (!paymentId) return NextResponse.json({ data: [], payment: null, error: null });
  const admin = supabaseAdmin();
  const [{ data: lines, error }, { data: pay }] = await Promise.all([
    admin.from("loan_payment_lines").select("id, payment_id, charge_type_id, label, bucket, amount, sort_order").eq("payment_id", paymentId).order("sort_order"),
    admin.from("loan_payments").select(PAY_SELECT).eq("id", paymentId).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ data: [], payment: null, error: "โหลดรายการย่อยไม่สำเร็จ" }, { status: 500 });
  const out: LoanPaymentLine[] = ((lines ?? []) as Row[]).map((l) => ({
    id: String(l.id), payment_id: String(l.payment_id), charge_type_id: (l.charge_type_id as string) ?? null,
    label: String(l.label ?? ""), bucket: asBucket(l.bucket), amount: num(l.amount), sort_order: num(l.sort_order),
  }));
  return NextResponse.json({ data: out, payment: pay ?? null, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "loan_payments.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { id?: string; label?: string; amount?: unknown; bucket?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุรายการ" }, { status: 400 });

  const admin = supabaseAdmin();
  const ctx = await loadLine(admin, id);
  if (!ctx || !ctx.pay) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  const { line, pay, sibs } = ctx;
  if (["cancelled", "reversed"].includes(String(pay.status))) return NextResponse.json({ error: "ใบจ่ายนี้ถูกยกเลิก/กลับรายการแล้ว แก้ไม่ได้" }, { status: 400 });

  const oldBucket = asBucket(line.bucket), oldAmt = num(line.amount);
  const newBucket = body.bucket !== undefined ? asBucket(body.bucket) : oldBucket;
  const newAmt = body.amount !== undefined ? r2(num(body.amount)) : oldAmt;
  if (!(newAmt > 0)) return NextResponse.json({ error: "จำนวนต้องมากกว่า 0 (ถ้าไม่ต้องการแยกรายการนี้แล้ว ให้กดเอาออก)" }, { status: 400 });
  const linePatch: Row = {};
  if (body.label !== undefined) {
    const label = String(body.label ?? "").trim();
    if (!label) return NextResponse.json({ error: "ต้องใส่ชื่อรายการ" }, { status: 400 });
    if (label !== String(line.label ?? "")) linePatch.label = label;
  }
  if (newBucket !== oldBucket) linePatch.bucket = newBucket;
  if (newAmt !== oldAmt) linePatch.amount = newAmt;
  if (Object.keys(linePatch).length === 0) return NextResponse.json({ data: { id }, error: null });

  // ยอดของแต่ละช่องหลังแก้ — ยอดจ่ายรวมต้องเท่าเดิม
  const payPatch: Row = {};
  if (newBucket !== oldBucket) {
    // ย้ายช่อง: เอายอดเดิมออกจากช่องเก่า ใส่ยอดใหม่ในช่องใหม่ (ส่วนต่างจำนวน ถ้ามี คืนไว้ที่ช่องเก่า)
    const fromTotal = r2(num(pay[COL[oldBucket]]) - oldAmt + (oldAmt - newAmt > 0 ? oldAmt - newAmt : 0));
    if (newAmt > oldAmt) return NextResponse.json({ error: "ย้ายช่องพร้อมเพิ่มจำนวนไม่ได้ — ย้ายช่องก่อน แล้วค่อยแก้จำนวน" }, { status: 400 });
    payPatch[COL[oldBucket]] = Math.max(0, fromTotal);
    payPatch[COL[newBucket]] = r2(num(pay[COL[newBucket]]) + newAmt);
  } else if (newAmt !== oldAmt) {
    // ช่องเดิม: ยอดรวมรายการย่อยในช่องต้องไม่เกินยอดของช่อง (ยอดช่องไม่เปลี่ยน)
    const others = sibs.filter((x) => String(x.id) !== id && asBucket(x.bucket) === oldBucket).reduce((t, x) => t + num(x.amount), 0);
    const cap = num(pay[COL[oldBucket]]);
    if (r2(others + newAmt) - cap > 0.01) {
      return NextResponse.json({ error: `จำนวนเกินยอดของช่องนี้ — ช่องนี้ในใบจ่ายมี ${cap.toLocaleString("th-TH")} · รายการย่อยอื่นใช้ไปแล้ว ${r2(others).toLocaleString("th-TH")} (ถ้ายอดจ่ายจริงเปลี่ยน ให้แก้ที่ใบจ่าย)` }, { status: 400 });
    }
  }

  const { error: lErr } = await admin.from("loan_payment_lines").update(linePatch).eq("id", id);
  if (lErr) return NextResponse.json({ error: "บันทึกไม่สำเร็จ: " + lErr.message }, { status: 400 });
  if (Object.keys(payPatch).length) {
    const { error: pErr } = await admin.from("loan_payments").update({ ...payPatch, updated_at: new Date().toISOString() }).eq("id", String(pay.id));
    if (pErr) {
      await admin.from("loan_payment_lines").update({ label: line.label, bucket: oldBucket, amount: oldAmt }).eq("id", id);   // คืนค่าเดิม
      return NextResponse.json({ error: "ย้ายช่องไม่สำเร็จ (คืนค่าเดิมแล้ว): " + pErr.message }, { status: 400 });
    }
  }
  await writeAudit(admin, { action: "update", entityType: "loan_payment_lines", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { payment_no: pay.payment_no ?? null, old: { label: line.label, bucket: oldBucket, amount: oldAmt }, new: linePatch, payment_buckets: payPatch } });
  return NextResponse.json({ data: { id }, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "loan_payments.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุรายการ" }, { status: 400 });

  const admin = supabaseAdmin();
  const ctx = await loadLine(admin, id);
  if (!ctx) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  // ยอดยังอยู่ในช่องเดิมของใบจ่าย — ลบแค่บรรทัดรายละเอียด (ยอดจ่ายรวม/การตัดงวดไม่เปลี่ยน)
  const { error } = await admin.from("loan_payment_lines").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "เอาออกไม่สำเร็จ: " + error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "loan_payment_lines", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { payment_no: ctx.pay?.payment_no ?? null, snapshot: ctx.line } });
  return NextResponse.json({ data: { id }, error: null });
}
