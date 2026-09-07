/**
 * GET /api/bank-debts — ทะเบียนหนี้ธนาคารภาพรวม (หน้า /bank-debts)
 *
 * รวมหนี้ 3 ชนิดให้เป็น "รายการหนี้ 1 บรรทัด" หน้าตาเดียวกัน (DebtItem):
 *   • เงินกู้        ← loan_contracts (ยอดคงเหลือ/ค่างวด/งวดถัดไป/ปรับโครงสร้าง มาจากระบบเงินกู้เดิม)
 *   • วงเงิน OD      ← od_facilities
 *   • บัตรเครดิต ฯลฯ ← debt_cards (ยอดตามใบแจ้งยอด − จ่ายแล้ว)
 * ไม่มีตารางหนี้ใหม่ — หน้านี้เป็นแค่ "หน้าครอบ" ของเดิม แก้ที่โมดูลไหน ที่นี่เห็นทันที
 * สิทธิ์: loan_contracts.view
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DebtKind = "loan" | "od" | "card";
export type DebtItem = {
  id: string;
  kind: DebtKind;
  /** module key ของ MasterRecordDrawer */
  module: "loan-contracts" | "od-facilities" | "debt-cards";
  code: string;
  name: string;
  lender: string;
  product: string;
  owner_type: string;          // company | person
  company_id: string | null;
  company_name: string;
  /** ยอดหนี้คงเหลือ (เงินกู้ = เงินต้นคงเหลือ · OD = ใช้ไป · บัตร = ยอดแจ้ง − จ่ายแล้ว) */
  outstanding: number;
  /** วงเงิน (OD / บัตร) */
  limit: number | null;
  /** ต้องจ่ายต่อเดือน (ประมาณ) */
  monthly: number;
  rate: number | null;
  next_due_date: string | null;
  next_due_amount: number;
  /** ความคืบหน้า 0-100 (เงินกู้: ผ่อนไปแล้วกี่ % ของเงินต้น · OD/บัตร: ใช้ไปกี่ % ของวงเงิน) */
  progress: number | null;
  progress_label: string;
  has_schedule: boolean;
  restructure_count: number;
  lifecycle: string;
  /** ป้ายสถานะที่หน้าจอโชว์ — บอกว่า "ต้องทำอะไรต่อ" */
  flags: { key: string; label: string; tone: "good" | "warn" | "bad" | "grey" | "od" }[];
  end_date: string | null;
  note: string;
};

const num = (v: unknown): number => { const n = Number(v); return isFinite(n) ? n : 0; };
const todayISO = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // เวลาไทย

const LOAN_TYPE: Record<string, string> = {
  term: "เงินกู้มีกำหนดระยะเวลา", revolving: "วงเงินหมุนเวียน", leasing: "ลีสซิ่ง / เช่าซื้อ", director: "เงินกู้กรรมการ",
  vehicle: "สินเชื่อรถ / จำนำทะเบียน", machine: "สินเชื่อเครื่องจักร", short_term: "เงินกู้ระยะสั้น",
};
const CARD_KIND: Record<string, string> = { credit_card: "บัตรเครดิต", cash_plus: "บัตรกดเงินสด / Cash Plus", revolving: "วงเงินหมุนเวียน" };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "loan_contracts.view");
  if (denied) return denied;

  const db = supabaseAdmin();
  const today = todayISO();
  const [loansRes, odRes, cardsRes, compRes] = await Promise.all([
    db.from("loan_contracts")
      .select("id, loan_code, loan_name, lender_name, loan_type, contract_no, lifecycle_status, repayment_health, owner_type, company_id, interest_rate, outstanding_principal, contracted_principal, approved_limit, principal_paid_amount, estimated_monthly_payment, next_due_date, next_due_amount, total_installment_count, paid_installment_count, restructure_count, last_restructure_date, end_date, lump_sum_due_date, note")
      .eq("is_active", true).limit(500),
    db.from("od_facilities")
      .select("id, od_code, lender_name, bank_account, lifecycle_status, owner_type, company_id, interest_rate, limit_amount, current_used_amount, available_limit, utilization_percent, estimated_interest_this_month, expiry_date, review_date, note")
      .eq("is_active", true).limit(200),
    db.from("debt_cards")
      .select("id, card_name, lender_name, card_kind, card_no, owner_type, company_id, credit_limit, interest_rate, statement_date, statement_balance, minimum_due, due_date, paid_amount, paid_date, status, note")
      .eq("is_active", true).limit(200),
    db.from("companies").select("id, name, company_code").limit(50),
  ]);
  const firstErr = loansRes.error ?? odRes.error ?? cardsRes.error ?? compRes.error;
  if (firstErr) {
    console.error("[bank-debts]", firstErr.message);
    return NextResponse.json({ data: null, error: "โหลดข้อมูลหนี้ไม่สำเร็จ" }, { status: 500 });
  }

  const companies = (compRes.data ?? []).map((c) => ({ id: String(c.id), name: String(c.name ?? ""), code: String(c.company_code ?? "") }));
  const compName = (id: unknown) => companies.find((c) => c.id === String(id ?? ""))?.name ?? "";
  const items: DebtItem[] = [];

  // ---- เงินกู้ ----
  for (const c of loansRes.data ?? []) {
    const status = String(c.lifecycle_status ?? "");
    if (["closed", "cancelled"].includes(status)) continue;
    const outstanding = num(c.outstanding_principal);
    const base = num(c.contracted_principal) > 0 ? num(c.contracted_principal) : num(c.approved_limit);
    const paidPri = num(c.principal_paid_amount);
    const totalN = num(c.total_installment_count), paidN = num(c.paid_installment_count);
    const hasSchedule = totalN > 0;
    const nextDue = c.next_due_date ? String(c.next_due_date) : (c.lump_sum_due_date ? String(c.lump_sum_due_date) : null);
    const flags: DebtItem["flags"] = [];
    if (status === "draft") flags.push({ key: "draft", label: "ร่าง", tone: "grey" });
    if (outstanding < 0) flags.push({ key: "bad_balance", label: "ยอดคงเหลือผิด", tone: "bad" });
    if (String(c.repayment_health) === "overdue" || String(c.repayment_health) === "defaulted" || (nextDue && nextDue < today))
      flags.push({ key: "overdue", label: "เกินกำหนด", tone: "bad" });
    else if (nextDue && nextDue <= addDays(today, 7)) flags.push({ key: "due_soon", label: "ใกล้ครบกำหนด", tone: "warn" });
    if (!hasSchedule && outstanding > 0) flags.push({ key: "no_schedule", label: "ขาดตารางผ่อน", tone: "warn" });
    if (num(c.restructure_count) > 0) flags.push({ key: "restructured", label: `ปรับโครงสร้าง ${num(c.restructure_count)} ครั้ง`, tone: "od" });
    if (flags.length === 0) flags.push({ key: "ok", label: "ปกติ", tone: "good" });

    items.push({
      id: String(c.id), kind: "loan", module: "loan-contracts",
      code: String(c.loan_code ?? ""), name: String(c.loan_name ?? ""), lender: String(c.lender_name ?? "ไม่ระบุผู้ให้กู้"),
      product: LOAN_TYPE[String(c.loan_type)] ?? String(c.loan_type ?? ""),
      owner_type: String(c.owner_type ?? "company"), company_id: c.company_id ? String(c.company_id) : null, company_name: compName(c.company_id),
      outstanding, limit: num(c.approved_limit) > 0 ? num(c.approved_limit) : null,
      monthly: num(c.estimated_monthly_payment), rate: c.interest_rate == null ? null : num(c.interest_rate),
      next_due_date: nextDue, next_due_amount: num(c.next_due_amount),
      progress: base > 0 ? Math.max(0, Math.min(100, Math.round((paidPri / base) * 100))) : null,
      progress_label: hasSchedule ? `ผ่อนแล้ว ${paidN}/${totalN} งวด` : (base > 0 ? `ผ่อนแล้ว ${Math.round((paidPri / base) * 100)}% ของ ${fmtM(base)}` : ""),
      has_schedule: hasSchedule, restructure_count: num(c.restructure_count), lifecycle: status,
      flags, end_date: c.end_date ? String(c.end_date) : null, note: String(c.note ?? ""),
    });
  }

  // ---- OD ----
  for (const o of odRes.data ?? []) {
    const status = String(o.lifecycle_status ?? "");
    if (["closed", "cancelled"].includes(status)) continue;
    const used = num(o.current_used_amount), limit = num(o.limit_amount);
    const util = limit > 0 ? Math.round((used / limit) * 100) : 0;
    const flags: DebtItem["flags"] = [{ key: "od", label: "OD", tone: "od" }];
    if (util >= 90) flags.push({ key: "near_limit", label: "ใกล้เต็มวงเงิน", tone: "warn" });
    if (o.expiry_date && String(o.expiry_date) < today) flags.push({ key: "expired", label: "เลยวันต่ออายุ", tone: "bad" });
    else if (o.expiry_date && String(o.expiry_date) <= addDays(today, 30)) flags.push({ key: "renew_soon", label: "ใกล้ต่ออายุ", tone: "warn" });
    if (flags.length === 1) flags.push({ key: "ok", label: "ปกติ", tone: "good" });
    items.push({
      id: String(o.id), kind: "od", module: "od-facilities",
      code: String(o.od_code ?? ""), name: `วงเงิน OD${o.bank_account ? ` (บัญชี ${String(o.bank_account)})` : ""}`, lender: String(o.lender_name ?? "ไม่ระบุธนาคาร"),
      product: "วงเงินเบิกเกินบัญชี (OD)",
      owner_type: String(o.owner_type ?? "company"), company_id: o.company_id ? String(o.company_id) : null, company_name: compName(o.company_id),
      outstanding: used, limit, monthly: num(o.estimated_interest_this_month), rate: o.interest_rate == null ? null : num(o.interest_rate),
      next_due_date: null, next_due_amount: 0,
      progress: util, progress_label: `ใช้ไป ${util}% ของวงเงิน · เหลือ ${fmtM(Math.max(0, limit - used))}`,
      has_schedule: false, restructure_count: 0, lifecycle: status, flags,
      end_date: o.expiry_date ? String(o.expiry_date) : null, note: String(o.note ?? ""),
    });
  }

  // ---- บัตรเครดิต / วงเงินหมุนเวียน ----
  for (const k of cardsRes.data ?? []) {
    const bal = num(k.statement_balance), paid = num(k.paid_amount), limit = num(k.credit_limit);
    const outstanding = Math.max(0, bal - paid);
    const status = String(k.status ?? "unpaid");
    const due = k.due_date ? String(k.due_date) : null;
    const flags: DebtItem["flags"] = [];
    if (status === "paid") flags.push({ key: "paid", label: "จ่ายรอบนี้แล้ว", tone: "good" });
    else if (due && due < today) flags.push({ key: "overdue", label: "เกินกำหนด", tone: "bad" });
    else if (due && due <= addDays(today, 7)) flags.push({ key: "due_soon", label: "ใกล้ครบกำหนด", tone: "warn" });
    else flags.push({ key: "unpaid", label: status === "partial" ? "จ่ายบางส่วน" : "รอจ่าย", tone: "warn" });
    if (limit > 0 && bal / limit >= 0.9) flags.push({ key: "near_limit", label: "ใกล้เต็มวงเงิน", tone: "warn" });
    items.push({
      id: String(k.id), kind: "card", module: "debt-cards",
      code: String(k.card_no ?? ""), name: String(k.card_name ?? ""), lender: String(k.lender_name ?? "ไม่ระบุผู้ออกบัตร"),
      product: CARD_KIND[String(k.card_kind)] ?? String(k.card_kind ?? ""),
      owner_type: String(k.owner_type ?? "company"), company_id: k.company_id ? String(k.company_id) : null, company_name: compName(k.company_id),
      outstanding, limit: limit > 0 ? limit : null,
      monthly: status === "paid" ? 0 : (num(k.minimum_due) > 0 ? num(k.minimum_due) : outstanding),
      rate: k.interest_rate == null ? null : num(k.interest_rate),
      next_due_date: status === "paid" ? null : due, next_due_amount: status === "paid" ? 0 : outstanding,
      progress: limit > 0 ? Math.max(0, Math.min(100, Math.round((bal / limit) * 100))) : null,
      progress_label: limit > 0 ? `ใช้ไป ${Math.round((bal / limit) * 100)}% ของวงเงิน${k.statement_date ? ` · ใบแจ้งยอด ${String(k.statement_date)}` : ""}` : (k.statement_date ? `ใบแจ้งยอด ${String(k.statement_date)}` : ""),
      has_schedule: false, restructure_count: 0, lifecycle: status, flags,
      end_date: null, note: String(k.note ?? ""),
    });
  }

  return NextResponse.json({ data: { as_of: today, companies, items }, error: null });
}

function addDays(iso: string, d: number): string {
  const [y, m, dd] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10);
}
function fmtM(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} ล้าน`;
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}
