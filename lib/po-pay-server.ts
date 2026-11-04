/**
 * ฝั่ง server: เติม "สถานะจ่ายเงิน" (lib/po-pay-state) ให้ใบสั่งซื้อหลายใบ — ดึงเครดิตร้าน/ส่งก่อนจ่าย ครั้งเดียว
 * ร้านหาจาก seller_partner_id ก่อน · ไม่มี → ชื่อร้าน (name_th / display_name / code) ตรงตัว
 * ใช้ที่: /api/purchasing/receivable · /api/purchasing/po-list · /api/purchasing/po-detail
 * "ลงบิลแล้ว รอโอน" = china_bill_id ซึ่ง DB trigger ตั้งให้จากตาราง china_bill_po_links (ดู lib/china-bill-po-server) — ไม่ต้อง join ตารางผูกที่นี่
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { poPayState, todayBkk, type PoPayState } from "@/lib/po-pay-state";

type Row = Record<string, unknown>;
type PartnerPay = { credit_term: string | null; ship_before_pay: boolean };

/** คอลัมน์ใบสั่งซื้อที่ต้อง select มาด้วย */
export const PO_PAY_COLUMNS = "seller_name, seller_partner_id, order_date, payment_status, paid_date, payment_due_date, china_bill_id";

export async function loadPoPay(admin: SupabaseClient): Promise<(po: Row) => PoPayState> {
  // เฉพาะร้านที่ตั้งเครดิตหรือส่งก่อนจ่าย — ร้านอื่นนับเป็นไม่มีเครดิต (ไม่ต้องโหลด)
  const { data } = await admin.from("partners_v2")
    .select("id, name_th, display_name, code, purchase_credit_term, ship_before_pay")
    .or("purchase_credit_term.not.is.null,ship_before_pay.eq.true").limit(5000);
  const byId = new Map<string, PartnerPay>();
  const byName = new Map<string, PartnerPay>();
  for (const p of (data ?? []) as Row[]) {
    const info = { credit_term: (p.purchase_credit_term as string) ?? null, ship_before_pay: p.ship_before_pay === true };
    byId.set(String(p.id), info);
    for (const nm of [p.name_th, p.display_name, p.code]) { const k = String(nm ?? "").trim(); if (k && !byName.has(k)) byName.set(k, info); }
  }
  const today = todayBkk();
  return (po: Row) => {
    const pp = (po.seller_partner_id ? byId.get(String(po.seller_partner_id)) : undefined) ?? byName.get(String(po.seller_name ?? "").trim());
    return poPayState({
      payment_status: po.payment_status as string | null, paid_date: po.paid_date as string | null,
      china_bill_id: po.china_bill_id as string | null, payment_due_date: po.payment_due_date as string | null,
      order_date: po.order_date as string | null, credit_term: pp?.credit_term ?? null, ship_before_pay: pp?.ship_before_pay ?? false,
    }, today);
  };
}
