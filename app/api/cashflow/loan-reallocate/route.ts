/**
 * ตัดยอดจ่ายเงินกู้เข้างวดผ่อนให้ตรง (Reconcile)
 *
 *   GET  → ดูก่อนว่าสัญญาไหนยังไม่ได้ตัดยอด (ไม่แก้อะไร)
 *   POST { contract_id? } → สั่งตัดยอด (ไม่ระบุ = ทุกสัญญาที่ยังไม่ได้ตัด)
 *
 * ปัญหาที่แก้: ระบบมีบันทึกการจ่ายเงินกู้อยู่ 38 รายการ (~2.4 ล้าน) แต่ตาราง
 * loan_payment_allocations ว่างเปล่า 0 แถว → งวดผ่อนทุกงวดยังเป็น "ยังไม่จ่าย"
 * ทำให้หน้ากระแสเงินสดคิดว่าต้องจ่ายหนี้ก้อนโตที่จริงจ่ายไปแล้ว
 *
 * สาเหตุ: การจ่ายพวกนี้เข้าฐานข้อมูลมาโดยไม่ผ่าน API /api/loan-payment/record
 * (ซึ่งเป็นตัวที่เรียกตัดยอดให้อัตโนมัติ) — ของเก่าเลยค้างไม่ถูกตัด
 *
 * วิธีแก้: เรียกฟังก์ชัน loan_contract_reallocate ที่มีอยู่แล้วในฐานข้อมูล
 * ฟังก์ชันนี้ "ล้างแล้วสร้างใหม่จากต้นทาง" → กดกี่รอบผลก็เท่าเดิม ไม่ตัดซ้ำ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LoanReconcileRow = {
  contract_id: string;
  loan_code: string;
  loan_name: string;
  payments: number;
  paid_total: number;
  installments: number;
  allocations: number;
  /** ตัดยอดได้ไหม — false เมื่อสัญญายังไม่มีตารางผ่อนที่ใช้งานอยู่ */
  canReconcile: boolean;
  reason: string | null;
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** สำรวจว่าสัญญาไหนมีเงินจ่ายค้างไม่ได้ตัด */
async function survey(admin: ReturnType<typeof supabaseAdmin>): Promise<LoanReconcileRow[]> {
  const [contractRes, payRes, verRes, allocRes] = await Promise.all([
    admin.from("loan_contracts").select("id, loan_code, loan_name").eq("is_active", true).limit(2000),
    admin.from("loan_payments").select("loan_contract_id, total_paid").eq("is_active", true).eq("status", "verified").limit(20000),
    admin.from("loan_schedule_versions").select("id, loan_contract_id").eq("status", "active").limit(2000),
    admin.from("loan_payment_allocations").select("loan_contract_id").limit(50000),
  ]);

  const payBy = new Map<string, { n: number; total: number }>();
  for (const p of payRes.data ?? []) {
    const k = String(p.loan_contract_id);
    const cur = payBy.get(k) ?? { n: 0, total: 0 };
    cur.n += 1; cur.total += num(p.total_paid);
    payBy.set(k, cur);
  }

  const activeVersionByContract = new Map<string, string>();
  for (const v of verRes.data ?? []) activeVersionByContract.set(String(v.loan_contract_id), String(v.id));

  const allocBy = new Map<string, number>();
  for (const a of allocRes.data ?? []) {
    const k = String(a.loan_contract_id);
    allocBy.set(k, (allocBy.get(k) ?? 0) + 1);
  }

  // นับงวดผ่อนของตารางที่ใช้งานอยู่
  const versionIds = [...activeVersionByContract.values()];
  const instBy = new Map<string, number>();
  if (versionIds.length) {
    const { data: insts } = await admin
      .from("loan_installments").select("loan_contract_id").in("schedule_version_id", versionIds)
      .eq("is_active", true).limit(20000);
    for (const i of insts ?? []) {
      const k = String(i.loan_contract_id);
      instBy.set(k, (instBy.get(k) ?? 0) + 1);
    }
  }

  const rows: LoanReconcileRow[] = [];
  for (const c of contractRes.data ?? []) {
    const id = String(c.id);
    const pay = payBy.get(id);
    if (!pay || pay.n === 0) continue;                 // ไม่มีการจ่าย = ไม่มีอะไรให้ตัด
    const installments = instBy.get(id) ?? 0;
    const allocations = allocBy.get(id) ?? 0;
    if (allocations > 0) continue;                     // ตัดไปแล้ว

    rows.push({
      contract_id: id,
      loan_code: String(c.loan_code ?? ""),
      loan_name: String(c.loan_name ?? ""),
      payments: pay.n,
      paid_total: Math.round(pay.total * 100) / 100,
      installments,
      allocations,
      canReconcile: installments > 0,
      reason: installments > 0 ? null : "สัญญานี้ยังไม่มีตารางผ่อนที่ใช้งานอยู่ — สร้างตารางผ่อนก่อนถึงจะตัดยอดได้",
    });
  }
  rows.sort((a, b) => b.paid_total - a.paid_total);
  return rows;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.view");
  if (denied) return denied;
  return NextResponse.json({ data: await survey(supabaseAdmin()), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ตัดยอดเข้างวด = แก้ตัวเลขหนี้จริง → ใช้สิทธิ์เดียวกับ "บันทึกการจ่ายเงินกู้"
  const denied = await guardApi(request, "loan_payments.create");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { contract_id?: string } = {};
  try { body = await request.json(); } catch { /* ไม่ส่ง body = ทำทุกสัญญา */ }

  const admin = supabaseAdmin();
  const pending = await survey(admin);
  const target = typeof body.contract_id === "string" && UUID_RE.test(body.contract_id)
    ? pending.filter((r) => r.contract_id === body.contract_id)
    : pending;

  const doable = target.filter((r) => r.canReconcile);
  if (!doable.length) {
    return NextResponse.json({ data: { done: 0, skipped: target.length, results: [] }, error: null });
  }

  const results: { loan_code: string; ok: boolean; message?: string; installmentsPaid?: number }[] = [];
  for (const row of doable) {
    const { error } = await admin.rpc("loan_contract_reallocate", { p_id: row.contract_id });
    if (error) {
      results.push({ loan_code: row.loan_code, ok: false, message: error.message });
      continue;
    }
    // นับผลลัพธ์กลับมาบอกผู้ใช้เป็นภาษาคน
    const { count } = await admin
      .from("loan_installments")
      .select("id", { count: "exact", head: true })
      .eq("loan_contract_id", row.contract_id).eq("is_active", true).eq("payment_status", "paid");
    results.push({ loan_code: row.loan_code, ok: true, installmentsPaid: count ?? 0 });
  }

  await writeAudit(admin, {
    action: "update", entityType: "loan_installments", entityId: null,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: {
      what: "ตัดยอดจ่ายเงินกู้เข้างวดผ่อน (reallocate)",
      contracts: doable.map((d) => d.loan_code),
      results,
    },
  });

  return NextResponse.json({
    data: { done: results.filter((r) => r.ok).length, skipped: target.length - doable.length, results },
    error: null,
  });
}
