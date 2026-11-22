/**
 * 🤝 โหลดสถิติต่อคู่ค้าจากเอกสารจริง (ฝั่ง server เท่านั้น)
 *
 * ใช้ร่วม 2 API: /api/partners/summary (หน้า Partners) + /api/partners/credit-terms (หน้าจัดการเครดิตเทอม)
 * → ตัวเลข "ยอดค้าง / ครบกำหนด / ซื้อขายล่าสุด" ในสองหน้าตรงกันเสมอ
 *
 *   ฝั่งซื้อ  = purchase_orders_v2 (ใบไม่ยกเลิก) · ใบเก่าที่ไม่ผูก id ร้าน → เดาจากชื่อด้วย lib/partner-match
 *              ยอดค้าง = grand_total - paid_amount_thb (ร้านจีนเป็นหยวน — ใช้จัดอันดับ/เตือน ยอดบาทจริงดูหน้ากระแสเงินสด)
 *   ฝั่งขาย  = erp_playground_sales_orders (สถานะยังไม่จบ) · ยอดค้าง = dueLeft (lib/receipts)
 *   สินค้า   = supplier_items (นับรายการต่อร้าน)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPartnerMatcher } from "@/lib/partner-match";
import { fetchAllPages } from "@/lib/fetch-all";
import { dueLeft } from "@/lib/receipts";
import { SO_ACTIVE_STATUSES } from "@/lib/so-status";
import { salesCreditTermOf } from "@/lib/credit-term";
import { foldOpenDocs, suspectSupplier, todayTH, type OpenDoc, type OpenDocsFold } from "@/lib/partner-insights";

export type PartnerSide = { count: number; last: string | null; open: OpenDocsFold };
export type PartnerStats = {
  items: number;
  buy: PartnerSide;    // ใบสั่งซื้อ (เราซื้อจากเขา)
  sell: PartnerSide;   // ใบสั่งขาย (เขาซื้อจากเรา)
  suspectSupplier: boolean;
};

type P = {
  id: string; code: string | null; display_name: string | null; name_th: string | null; name_en: string | null;
  is_customer: boolean | null; is_supplier: boolean | null;
  purchase_credit_term: string | null; sales_credit_term: string | null; payment_terms_days: number | null;
};

const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };

export async function loadPartnerStats(db: SupabaseClient): Promise<Map<string, PartnerStats>> {
  const [pRes, poRows, soRows, siRows] = await Promise.all([
    db.from("partners_v2")
      .select("id, code, display_name, name_th, name_en, is_customer, is_supplier, purchase_credit_term, sales_credit_term, payment_terms_days")
      .limit(5000),
    fetchAllPages<{ seller_partner_id: string | null; seller_name: string | null; order_date: string | null; payment_due_date: string | null; payment_status: string | null; grand_total: unknown; paid_amount_thb: unknown }>(
      (from, to) => db.from("purchase_orders_v2")
        .select("seller_partner_id, seller_name, order_date, payment_due_date, payment_status, grand_total, paid_amount_thb")
        .eq("is_active", true).neq("status", "cancelled").range(from, to)),
    fetchAllPages<{ customer_id: string | null; order_date: string | null; expected_payment_date: string | null; status: string | null; amount_due: unknown; grand_total: unknown }>(
      (from, to) => db.from("erp_playground_sales_orders")
        .select("customer_id, order_date, expected_payment_date, status, amount_due, grand_total")
        .range(from, to)),
    fetchAllPages<{ supplier_partner_id: string | null }>(
      (from, to) => db.from("supplier_items").select("supplier_partner_id").not("supplier_partner_id", "is", null).range(from, to)),
  ]);
  const partners = (pRes.data ?? []) as unknown as P[];
  const matcher = buildPartnerMatcher(partners);
  const activeSo = new Set<string>(SO_ACTIVE_STATUSES as readonly string[]);

  const items = new Map<string, number>();
  for (const r of siRows) { const k = String(r.supplier_partner_id); items.set(k, (items.get(k) ?? 0) + 1); }

  type Acc = { count: number; last: string | null; docs: OpenDoc[] };
  const blank = (): Acc => ({ count: 0, last: null, docs: [] });
  const buy = new Map<string, Acc>(), sell = new Map<string, Acc>();
  const bump = (m: Map<string, Acc>, id: string, date: string | null) => {
    const a = m.get(id) ?? blank(); a.count++;
    if (date && (!a.last || date > a.last)) a.last = date;
    m.set(id, a); return a;
  };

  for (const po of poRows) {
    const id = po.seller_partner_id ? String(po.seller_partner_id) : matcher.match(po.seller_name)?.id;
    if (!id) continue;
    const a = bump(buy, String(id), po.order_date);
    if (po.payment_status !== "paid") {
      const left = num(po.grand_total) - num(po.paid_amount_thb);
      if (left > 0) a.docs.push({ date: po.order_date, dueDate: po.payment_due_date, amount: left });
    }
  }
  for (const so of soRows) {
    if (!so.customer_id || so.status === "cancelled") continue;
    const a = bump(sell, String(so.customer_id), so.order_date);
    if (so.status && activeSo.has(so.status)) {
      const left = dueLeft(so.amount_due, so.grand_total);
      if (left > 0) a.docs.push({ date: so.order_date, dueDate: so.expected_payment_date, amount: left });
    }
  }

  const today = todayTH();
  const out = new Map<string, PartnerStats>();
  for (const p of partners) {
    const id = String(p.id);
    const b = buy.get(id) ?? blank(), s = sell.get(id) ?? blank();
    const it = items.get(id) ?? 0;
    out.set(id, {
      items: it,
      buy: { count: b.count, last: b.last, open: foldOpenDocs(b.docs, p.purchase_credit_term, today) },
      sell: { count: s.count, last: s.last, open: foldOpenDocs(s.docs, salesCreditTermOf(p), today) },
      suspectSupplier: suspectSupplier(p, { items: it, pos: b.count }),
    });
  }
  return out;
}
