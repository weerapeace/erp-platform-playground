/**
 * GET /api/cashflow — รวมเงินเข้า-เงินออกทั้งบริษัทจาก 5 แหล่ง แล้วคืนเป็น "รายการเงิน" หน้าตาเดียวกัน
 *
 * แหล่งข้อมูล (อ่านอย่างเดียว ไม่แก้ของเดิม):
 *   เงินเข้า  ← erp_playground_sales_orders (ใบขายยืนยันแล้ว) · erp_playground_billing_notes (ใบวางบิล)
 *   เงินออก  ← purchase_orders_v2 (ใบซื้อค้างจ่าย) · payment_batches (เงินเดือน)
 *              loan_installments (งวดผ่อน) · od_facilities (ดอกเบี้ย OD) · china_bills (โอนเงินจีน)
 *
 * เรื่องที่ต้องระวัง (เจอจากข้อมูลจริง):
 *   - ใบซื้อ 77/143 ใบเป็นเงินหยวน (currency = RMB หรือ YUAN — สะกด 2 แบบ แปลว่าอย่างเดียวกัน)
 *     และตาราง purchase_orders_v2 ไม่มีช่องอัตราแลกเปลี่ยน → ต้องคูณเรตเอง ไม่งั้นยอดจ่ายหายไปเกินครึ่ง
 *   - เครดิตลูกค้า/ร้านค้าแทบไม่มีใครตั้ง → ต้องเดาวันด้วยค่าเริ่มต้น และบอกผู้ใช้ว่าเดา (dateConfident = false)
 *   - ใบขายทุกใบ amount_due = ยอดเต็ม เพราะระบบยังไม่มีที่บันทึก "ลูกค้าจ่ายมาแล้ว" → เงินเข้าเป็นประมาณการ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { computeDueDate } from "@/lib/credit-term";
import { SO_ACTIVE_STATUSES } from "@/lib/so-status";
import {
  addDaysISO, dayOfMonthISO, endOfMonthISO, monthsBetween, todayISO,
  type CashflowEvent,
} from "@/lib/cashflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** ชื่อสกุลเงินหยวนที่เจอในข้อมูลจริง — สะกดต่างกันแต่หมายถึงอย่างเดียวกัน */
const RMB_CODES = new Set(["RMB", "YUAN", "CNY"]);
/** เรตสำรอง ถ้าหาเรตล่าสุดจากบิลจีนไม่เจอเลย */
const RMB_RATE_FALLBACK = 5;

export type CashflowWarning = { code: string; message: string; count?: number; href?: string };

export type CashflowMeta = {
  rmbRate: number;
  rmbRateSource: string;
  customerDefaultDays: number;
  supplierDefaultDays: number;
  openingBalance: number;
  openingAsOf: string | null;
  openingAccounts: { id: string; label: string; amount: number; as_of_date: string }[];
  warnings: CashflowWarning[];
};

export type CashflowApiData = { from: string; to: string; events: CashflowEvent[]; meta: CashflowMeta };

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.view");
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  const today = todayISO();
  const from = sp.get("from") || today;
  const to = sp.get("to") || addDaysISO(today, 90);
  /** เงินเข้านับจากอะไร: so = ใบขายยืนยันแล้ว · billing = ใบวางบิล · both = ทั้งสอง (ตัดใบขายที่วางบิลแล้วออก ไม่ให้ซ้ำ) */
  const incomeBasis = (sp.get("incomeBasis") || "both") as "so" | "billing" | "both";
  const customerDefaultDays = Math.max(0, Number(sp.get("customerDays") ?? 30) || 0);
  const supplierDefaultDays = Math.max(0, Number(sp.get("supplierDays") ?? 30) || 0);
  const rmbRateParam = Number(sp.get("rmbRate") ?? 0);

  const db = supabaseAdmin();
  const events: CashflowEvent[] = [];
  const warnings: CashflowWarning[] = [];

  // ------------------------------------------------------------
  // ข้อมูลตั้งต้นที่ใช้ร่วมกัน — คู่ค้า (เครดิต) + เรตหยวน + ยอดเงินตั้งต้น
  // ------------------------------------------------------------
  const [partnersRes, chinaRateRes, openingRes] = await Promise.all([
    db.from("partners_v2").select("id, display_name, name_th, code, payment_terms_days, purchase_credit_term").limit(5000),
    db.from("china_bills").select("rate, bill_date").not("rate", "is", null).order("bill_date", { ascending: false }).limit(1),
    db.from("cashflow_opening_balances").select("id, label, amount, as_of_date").eq("is_active", true).order("sort_order").limit(200),
  ]);

  type PartnerRow = {
    id: string; display_name: string | null; name_th: string | null; code: string | null;
    payment_terms_days: number | null; purchase_credit_term: string | null;
  };
  const partners = new Map<string, PartnerRow>();
  for (const p of (partnersRes.data ?? []) as PartnerRow[]) partners.set(p.id, p);
  const partnerName = (id: string | null | undefined, fallback: string) =>
    (id && (partners.get(id)?.display_name || partners.get(id)?.name_th)) || fallback || "ไม่ระบุ";

  const latestChinaRate = num((chinaRateRes.data ?? [])[0]?.rate);
  const rmbRate = rmbRateParam > 0 ? rmbRateParam : latestChinaRate > 0 ? latestChinaRate : RMB_RATE_FALLBACK;
  const rmbRateSource =
    rmbRateParam > 0 ? "ผู้ใช้กรอกเอง"
      : latestChinaRate > 0 ? `เรตล่าสุดจากบิลโอนเงินจีน (${latestChinaRate})`
        : `ค่าสำรองของระบบ (${RMB_RATE_FALLBACK}) — ยังไม่มีบิลจีนที่ระบุเรต`;

  const openingAccounts = (openingRes.data ?? []).map((r) => ({
    id: String(r.id), label: String(r.label ?? ""), amount: num(r.amount), as_of_date: String(r.as_of_date ?? ""),
  }));
  const openingBalance = openingAccounts.reduce((s, a) => s + a.amount, 0);
  const openingAsOf = openingAccounts.length
    ? openingAccounts.map((a) => a.as_of_date).sort().slice(-1)[0]
    : null;
  if (!openingAccounts.length) {
    warnings.push({
      code: "no_opening_balance",
      message: "ยังไม่ได้กรอกยอดเงินคงเหลือในบัญชี — กราฟจึงเริ่มจากศูนย์ ตัวเลข \"เงินคงเหลือ\" ยังเชื่อไม่ได้",
    });
  }

  // ------------------------------------------------------------
  // 1) เงินเข้า — ใบวางบิล (มีวันครบกำหนดจริง เลยแม่นกว่าใบขาย)
  // ------------------------------------------------------------
  const soCoveredByBilling = new Set<string>();
  if (incomeBasis === "billing" || incomeBasis === "both") {
    const [bnRes, bnLineRes] = await Promise.all([
      db.from("erp_playground_billing_notes")
        .select("id, bill_number, status, customer_name, bill_date, due_date, grand_total, amount_due, paid_at")
        .neq("status", "cancelled").is("paid_at", null).lte("bill_date", to).limit(5000),
      db.from("erp_playground_billing_note_lines").select("billing_note_id, so_id").limit(20000),
    ]);

    const liveBnIds = new Set((bnRes.data ?? []).map((b) => String(b.id)));
    for (const l of bnLineRes.data ?? []) {
      if (l.so_id && liveBnIds.has(String(l.billing_note_id))) soCoveredByBilling.add(String(l.so_id));
    }

    for (const b of bnRes.data ?? []) {
      const amount = num(b.amount_due) || num(b.grand_total);
      if (amount <= 0) continue;
      const hasDue = !!b.due_date;
      const date = String(b.due_date || b.bill_date || today).slice(0, 10);
      events.push({
        id: `bn:${b.id}`,
        date,
        direction: "in",
        source: "billing_note",
        certainty: "expected",
        ref: String(b.bill_number ?? "ใบวางบิล"),
        party: String(b.customer_name ?? "ไม่ระบุลูกค้า"),
        amount,
        dateConfident: hasDue,
        dateNote: hasDue ? undefined : "ใบวางบิลนี้ไม่ได้ระบุวันครบกำหนด — ใช้วันที่วางบิลแทน",
        note: b.status === "draft" ? "ใบวางบิลยังเป็นร่าง" : undefined,
        href: "/billing-notes",
      });
    }
  }

  // ------------------------------------------------------------
  // 2) เงินเข้า — ใบขายที่ยืนยันแล้ว (ยังไม่ได้วางบิล)
  // ------------------------------------------------------------
  if (incomeBasis === "so" || incomeBasis === "both") {
    const soRes = await db
      .from("erp_playground_sales_orders")
      .select("id, so_number, status, customer_id, customer_name, order_date, expected_ship_date, grand_total, amount_due")
      .in("status", SO_ACTIVE_STATUSES).limit(5000);

    let guessed = 0;
    for (const s of soRes.data ?? []) {
      if (incomeBasis === "both" && soCoveredByBilling.has(String(s.id))) continue;   // วางบิลแล้ว — นับที่ใบวางบิลแทน กันนับซ้ำ
      const amount = num(s.amount_due) || num(s.grand_total);
      if (amount <= 0) continue;

      const terms = num(partners.get(String(s.customer_id ?? ""))?.payment_terms_days);
      const base = String(s.order_date || s.expected_ship_date || today).slice(0, 10);
      const hasTerms = terms > 0;
      if (!hasTerms) guessed += 1;
      const date = addDaysISO(base, hasTerms ? terms : customerDefaultDays);

      events.push({
        id: `so:${s.id}`,
        date,
        direction: "in",
        source: "sales_order",
        certainty: "expected",
        ref: String(s.so_number ?? "ใบขาย"),
        party: String(s.customer_name ?? partnerName(s.customer_id as string, "ไม่ระบุลูกค้า")),
        amount,
        dateConfident: hasTerms,
        dateNote: hasTerms
          ? `เครดิตลูกค้า ${terms} วัน นับจากวันที่ขาย`
          : `ลูกค้ารายนี้ยังไม่ได้ตั้งเครดิต — ระบบใช้ค่าเริ่มต้น ${customerDefaultDays} วัน`,
        href: "/sales-orders",
      });
    }
    if (guessed > 0) {
      warnings.push({
        code: "so_no_credit_term",
        count: guessed,
        message: `ใบขาย ${guessed} ใบยังไม่รู้ว่าลูกค้าจ่ายกี่วัน — ระบบเดาให้ ${customerDefaultDays} วัน · ตั้งเครดิตทีเดียวหลายรายได้ที่หน้าตั้งเครดิต`,
        href: "/cashflow/credit-terms",
      });
    }
    // มีใบรับชำระแล้วหรือยัง — ถ้ายังไม่มีเลย ยอดค้างรับจะเท่ากับยอดขายเต็มตลอดกาล
    const { count: receiptCount } = await db
      .from("customer_receipts").select("id", { count: "exact", head: true })
      .eq("is_active", true).eq("status", "confirmed");
    if (!receiptCount) {
      warnings.push({
        code: "no_receipt_records",
        message: "ยังไม่มีใบรับชำระในระบบเลย — ใบขายทุกใบจึงยังนับเป็นเงินค้างรับเต็มจำนวน · บันทึกเงินที่เก็บได้แล้วที่หน้ารับชำระเงิน ตัวเลขเงินเข้าจะแม่นขึ้นทันที",
        href: "/receipts",
      });
    }
  }

  // ------------------------------------------------------------
  // 3) เงินออก — ใบซื้อค้างจ่าย
  // ------------------------------------------------------------
  {
    const poRes = await db
      .from("purchase_orders_v2")
      .select("id, po_no, seller_name, seller_partner_id, order_date, payment_due_date, currency, grand_total, paid_amount_thb, payment_status")
      .eq("is_active", true).neq("payment_status", "paid").limit(5000);

    let guessed = 0;
    let rmbCount = 0;
    for (const p of poRes.data ?? []) {
      const cur = String(p.currency ?? "THB").toUpperCase();
      const isRmb = RMB_CODES.has(cur);
      if (isRmb) rmbCount += 1;
      const gross = num(p.grand_total) * (isRmb ? rmbRate : 1);
      const amount = gross - num(p.paid_amount_thb);
      if (amount <= 0) continue;

      const partner = partners.get(String(p.seller_partner_id ?? ""));
      const orderDate = p.order_date ? String(p.order_date).slice(0, 10) : today;
      const fromTerm = computeDueDate(orderDate, partner?.purchase_credit_term);
      const date = String(p.payment_due_date ?? fromTerm ?? addDaysISO(orderDate, supplierDefaultDays)).slice(0, 10);
      const confident = !!p.payment_due_date || !!fromTerm;
      if (!confident) guessed += 1;

      events.push({
        id: `po:${p.id}`,
        date,
        direction: "out",
        source: "purchase_order",
        certainty: "expected",
        ref: String(p.po_no ?? "ใบซื้อ"),
        party: partnerName(p.seller_partner_id as string, String(p.seller_name ?? "")),
        amount,
        dateConfident: confident,
        dateNote: p.payment_due_date
          ? "ระบุวันครบกำหนดจ่ายไว้ในใบซื้อแล้ว"
          : fromTerm
            ? "คำนวณจากเครดิตที่ตั้งไว้ให้ร้านนี้"
            : `ร้านนี้ยังไม่ได้ตั้งเครดิต — ระบบใช้ค่าเริ่มต้น ${supplierDefaultDays} วันนับจากวันสั่งซื้อ`,
        note: isRmb ? `ยอดจริง ¥${num(p.grand_total).toLocaleString("th-TH")} × เรต ${rmbRate}` : undefined,
        href: "/purchasing/po-list",
      });
    }
    if (guessed > 0) {
      warnings.push({
        code: "po_no_credit_term",
        count: guessed,
        message: `ใบซื้อ ${guessed} ใบยังไม่รู้วันครบกำหนดจ่าย — ระบบเดาให้ ${supplierDefaultDays} วันนับจากวันสั่งซื้อ · ตั้งเครดิตทีเดียวหลายร้านได้ที่หน้าตั้งเครดิต`,
        href: "/cashflow/credit-terms",
      });
    }
    if (rmbCount > 0) {
      warnings.push({
        code: "po_rmb_rate",
        count: rmbCount,
        message: `ใบซื้อ ${rmbCount} ใบเป็นเงินหยวน และระบบไม่ได้เก็บเรตไว้ในใบ — แปลงเป็นบาทด้วยเรต ${rmbRate} (${rmbRateSource})`,
      });
    }
  }

  // ------------------------------------------------------------
  // 4) เงินออก — เงินเดือน (รอบที่ทำไว้แล้ว + ประมาณการเดือนที่ยังไม่ได้ทำ)
  // ------------------------------------------------------------
  {
    const [batchRes, lineRes] = await Promise.all([
      db.from("payment_batches").select("id, batch_no, batch_type, payment_date, status").limit(2000),
      db.from("payment_batch_lines").select("payment_batch_id, paid_amount, gross_amount").limit(50000),
    ]);

    const sumByBatch = new Map<string, number>();
    for (const l of lineRes.data ?? []) {
      const k = String(l.payment_batch_id);
      sumByBatch.set(k, (sumByBatch.get(k) ?? 0) + (num(l.paid_amount) || num(l.gross_amount)));
    }

    type Batch = { id: string; batch_no: string | null; batch_type: string | null; payment_date: string | null; status: string | null };
    const batches = ((batchRes.data ?? []) as Batch[]).filter((b) => b.status !== "cancelled");

    /** เดือน+ชนิดที่มีรอบจ่ายอยู่แล้ว — เดือนไหนมีของจริงแล้วห้ามใส่ประมาณการซ้ำ */
    const covered = new Set<string>();
    let pastUnmarked = 0;
    for (const b of batches) {
      const date = String(b.payment_date ?? "").slice(0, 10);
      if (!date) continue;
      covered.add(`${date.slice(0, 7)}|${b.batch_type ?? "other"}`);

      const amount = sumByBatch.get(String(b.id)) ?? 0;
      if (amount <= 0 || date > to) continue;
      if (b.status === "paid") continue;   // จ่ายออกไปแล้ว — ไม่ใช่เงินที่ต้องเตรียมในอนาคต
      if (date < today) pastUnmarked += 1;  // เลยวันจ่ายแล้วแต่ยังไม่กดว่า "จ่ายแล้ว"

      events.push({
        id: `pay:${b.id}`,
        date,
        direction: "out",
        source: "payroll",
        certainty: b.status === "approved" ? "actual" : "expected",
        ref: String(b.batch_no ?? "รอบจ่ายเงินเดือน"),
        party: b.batch_type === "mid_month" ? "เงินเดือน (กลางเดือน)" : "เงินเดือน (สิ้นเดือน)",
        amount,
        dateConfident: true,
        note: b.status === "draft" ? "รอบนี้ยังเป็นร่าง ยังไม่อนุมัติ" : undefined,
        href: "/payroll/payments",
      });
    }

    if (pastUnmarked > 0) {
      warnings.push({
        code: "payroll_unmarked_paid",
        count: pastUnmarked,
        message: `รอบจ่ายเงินเดือน ${pastUnmarked} รอบเลยวันจ่ายแล้วแต่ยังไม่ได้กดว่า "จ่ายแล้ว" — ถ้าจ่ายไปจริงแล้ว ยอดเงินออกในหน้านี้จะสูงเกินจริง`,
        href: "/payroll/payments",
      });
    }

    // ประมาณการเดือนที่ยังไม่ได้ทำรอบ — เฉลี่ยจากรอบชนิดเดียวกัน 3 รอบล่าสุดที่มียอดจริง
    const avgByType = new Map<string, number>();
    for (const type of ["mid_month", "month_end"]) {
      const recent = batches
        .filter((b) => (b.batch_type ?? "") === type && (sumByBatch.get(String(b.id)) ?? 0) > 0)
        .sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)))
        .slice(0, 3);
      if (!recent.length) continue;
      // รอบเดียวกันอาจถูกแตกเป็นหลายใบ (คนละบริษัท) → รวมยอดของ "วันจ่ายเดียวกัน" ก่อนค่อยเฉลี่ย
      const byDate = new Map<string, number>();
      for (const b of recent) {
        const d = String(b.payment_date);
        byDate.set(d, (byDate.get(d) ?? 0) + (sumByBatch.get(String(b.id)) ?? 0));
      }
      const vals = [...byDate.values()];
      avgByType.set(type, vals.reduce((s, v) => s + v, 0) / vals.length);
    }

    let estimated = 0;
    for (const monthStart of monthsBetween(from, to)) {
      const ym = monthStart.slice(0, 7);
      for (const [type, avg] of avgByType) {
        if (covered.has(`${ym}|${type}`)) continue;
        const date = type === "mid_month" ? dayOfMonthISO(monthStart, 15) : endOfMonthISO(monthStart);
        if (date < from || date > to) continue;
        estimated += 1;
        events.push({
          id: `pay-est:${ym}:${type}`,
          date,
          direction: "out",
          source: "payroll",
          certainty: "estimate",
          ref: `ประมาณการ ${ym}`,
          party: type === "mid_month" ? "เงินเดือน (กลางเดือน)" : "เงินเดือน (สิ้นเดือน)",
          amount: Math.round(avg),
          dateConfident: false,
          dateNote: type === "mid_month" ? "ปกติจ่ายกลางเดือน" : "ปกติจ่ายสิ้นเดือน",
          note: "ยังไม่ได้ทำรอบจ่ายเดือนนี้ — เฉลี่ยจาก 3 รอบล่าสุด",
          href: "/payroll/payments",
        });
      }
    }
    if (estimated > 0) {
      warnings.push({
        code: "payroll_estimated",
        count: estimated,
        message: `เงินเดือน ${estimated} รอบข้างหน้ายังไม่ได้ทำในระบบ — ใช้ค่าเฉลี่ยจากรอบล่าสุดแทน ตัวเลขจริงอาจต่างออกไป`,
        href: "/payroll/payments",
      });
    }
  }

  // ------------------------------------------------------------
  // 5) เงินออก — งวดผ่อนเงินกู้ (เฉพาะตารางผ่อนที่ใช้งานอยู่ · ตรงกับ RPC loan_dashboard)
  // ------------------------------------------------------------
  {
    const verRes = await db.from("loan_schedule_versions").select("id").eq("status", "active").limit(2000);
    const activeVersions = (verRes.data ?? []).map((v) => String(v.id));

    if (activeVersions.length) {
      const [instRes, contractRes] = await Promise.all([
        db.from("loan_installments")
          .select("id, loan_contract_id, installment_no, due_date, total_due, total_paid, payment_status")
          .in("schedule_version_id", activeVersions).eq("is_active", true).neq("payment_status", "paid")
          .lte("due_date", to).limit(5000),
        db.from("loan_contracts").select("id, loan_code, loan_name").limit(2000),
      ]);

      const contracts = new Map<string, { loan_code: string | null; loan_name: string | null }>();
      for (const c of contractRes.data ?? []) contracts.set(String(c.id), c);

      let overdue = 0;
      for (const i of instRes.data ?? []) {
        const amount = num(i.total_due) - num(i.total_paid);
        if (amount <= 0) continue;
        const date = String(i.due_date ?? "").slice(0, 10);
        if (!date) continue;
        if (date < today) overdue += 1;
        const c = contracts.get(String(i.loan_contract_id));
        events.push({
          id: `loan:${i.id}`,
          date,
          direction: "out",
          source: "loan",
          certainty: "actual",
          ref: `${c?.loan_code ?? "เงินกู้"} งวด ${i.installment_no ?? "-"}`,
          party: String(c?.loan_name ?? "สัญญาเงินกู้"),
          amount,
          dateConfident: true,
          note: date < today ? "เลยกำหนดชำระแล้ว" : undefined,
          href: "/loan-installments",
        });
      }
      if (overdue > 0) {
        warnings.push({
          code: "loan_overdue_unreconciled",
          count: overdue,
          message: `งวดผ่อน ${overdue} งวดเลยกำหนดแล้วแต่ยังไม่ได้ตัดว่าจ่ายในระบบ — ถ้ามีบันทึกการจ่ายอยู่แล้ว กดปุ่ม "ตัดยอดให้ตรง" ด้านล่างได้เลย`,
          href: "/loan-payments",
        });
      }
    }
  }

  // ------------------------------------------------------------
  // 6) เงินออก — ดอกเบี้ย OD (ประมาณการรายเดือน)
  // ------------------------------------------------------------
  {
    const odRes = await db
      .from("od_facilities")
      .select("id, od_code, lender_name, estimated_interest_this_month, current_used_amount")
      .eq("is_active", true).limit(500);

    for (const od of odRes.data ?? []) {
      const monthly = num(od.estimated_interest_this_month);
      if (monthly <= 0) continue;
      for (const monthStart of monthsBetween(from, to)) {
        const date = endOfMonthISO(monthStart);
        if (date < from || date > to) continue;
        events.push({
          id: `od:${od.id}:${monthStart.slice(0, 7)}`,
          date,
          direction: "out",
          source: "od_interest",
          certainty: "estimate",
          ref: String(od.od_code ?? "OD"),
          party: String(od.lender_name ?? "ธนาคาร"),
          amount: monthly,
          dateConfident: false,
          dateNote: "ธนาคารมักตัดดอกเบี้ยสิ้นเดือน",
          note: "ประมาณการจากยอดที่ใช้อยู่ปัจจุบัน",
          href: "/od-facilities",
        });
      }
    }
  }

  // ------------------------------------------------------------
  // 7) เงินออก — บิลโอนเงินจีนที่ยังไม่ได้โอน
  // ------------------------------------------------------------
  {
    const cbRes = await db
      .from("china_bills")
      .select("id, supplier_id, amount_rmb, fee_rmb, rate, amount_thb, bill_date, transfer_date, status, is_shipping")
      .eq("is_active", true).neq("status", "โอนแล้ว").limit(2000);

    let noRate = 0;
    for (const b of cbRes.data ?? []) {
      const rate = num(b.rate) > 0 ? num(b.rate) : rmbRate;
      if (!(num(b.rate) > 0) && num(b.amount_rmb) > 0) noRate += 1;
      const amount = num(b.amount_thb) > 0
        ? num(b.amount_thb)
        : (num(b.amount_rmb) + num(b.fee_rmb)) * rate;
      if (amount <= 0) continue;
      const date = String(b.transfer_date || b.bill_date || today).slice(0, 10);
      events.push({
        id: `china:${b.id}`,
        date,
        direction: "out",
        source: "china",
        certainty: "expected",
        ref: b.is_shipping ? "ค่าขนส่งจีน" : "บิลโอนเงินจีน",
        party: partnerName(b.supplier_id as string, "ร้านจีน"),
        amount,
        dateConfident: !!b.transfer_date,
        dateNote: b.transfer_date ? undefined : "ยังไม่ระบุวันโอน — ใช้วันที่บิล",
        note: num(b.amount_thb) > 0 ? undefined : `¥${(num(b.amount_rmb) + num(b.fee_rmb)).toLocaleString("th-TH")} × เรต ${rate}`,
        href: "/app/china-pay",
      });
    }
    if (noRate > 0) {
      warnings.push({
        code: "china_no_rate",
        count: noRate,
        message: `บิลจีน ${noRate} ใบยังไม่ได้ใส่เรตแลกเงิน — ใช้เรต ${rmbRate} แทน (${rmbRateSource})`,
        href: "/app/china-pay",
      });
    }
  }

  events.sort((a, b) => (a.date === b.date ? b.amount - a.amount : a.date.localeCompare(b.date)));

  const data: CashflowApiData = {
    from,
    to,
    events,
    meta: {
      rmbRate, rmbRateSource, customerDefaultDays, supplierDefaultDays,
      openingBalance, openingAsOf, openingAccounts, warnings,
    },
  };
  return NextResponse.json({ data, error: null });
}
