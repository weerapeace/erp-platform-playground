/**
 * ใบสั่งขาย (Sales Order) — ตัวช่วยที่ใช้ร่วมกันของ API ชุดนี้
 *
 * เอกสารตัวนี้คือ "ลูกค้าสั่งของ" — ต้นทางของงาน:
 *   ใบเสนอราคา/ใบสั่งผลิต → **ใบสั่งขาย** → เปิดใบสั่งผลิต → ส่งของ → ออกใบขาย/บิล
 * (คนละใบกับ erp_playground_sales_orders ที่ระบบใช้เป็น "ใบขาย/บิล" ปลายทางอยู่แล้ว)
 *
 * ของกลางที่ใช้: lib/tax (calculateDocument — เลขเงินชุดเดียวกับใบขาย) · erp_next_number (เลขเอกสาร)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { calculateDocument } from "@/lib/tax";

export type SoOrderStatus = "confirmed" | "shipped" | "cancelled";

export type SoOrderLineInput = {
  id?: string;
  sku?: string | null;
  product_name?: string;
  qty?: number;
  unit?: string | null;
  unit_price?: number;
  discount_type?: "percent" | "amount";
  discount_value?: number;
  due_date?: string | null;
  mo_id?: string | null;
  mo_no?: string | null;
  source?: string | null;      // manual | quote | mo
  note?: string | null;
};

export type SoOrderHeaderInput = {
  company_id?: string | null;
  company_code?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_code?: string | null;
  customer_po_no?: string | null;
  sale_person_name?: string | null;
  order_date?: string | null;
  due_date?: string | null;
  currency?: string;
  header_discount_type?: "percent" | "amount";
  header_discount_value?: number;
  shipping_fee?: number;
  vat_rate?: number;
  vat_included?: boolean;
  wht_rate?: number;
  note?: string | null;
};

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

/** ยอดเงินของใบ — ใช้เครื่องคิดเงินกลาง (lib/tax) ตัวเดียวกับใบขาย เลขจะได้ตรงกันทั้งระบบ */
export function computeTotals(header: SoOrderHeaderInput, lines: SoOrderLineInput[]) {
  const r = calculateDocument({
    lines: lines
      .filter((l) => (l.product_name ?? "").trim() || l.sku)
      .map((l) => ({
        qty: num(l.qty),
        unit_price: num(l.unit_price),
        discount: num(l.discount_value) > 0 ? { type: l.discount_type ?? "amount", value: num(l.discount_value) } : undefined,
      })),
    header_discount: num(header.header_discount_value) > 0
      ? { type: header.header_discount_type ?? "amount", value: num(header.header_discount_value) }
      : undefined,
    shipping_fee: num(header.shipping_fee),
    tax: { vat_rate: num(header.vat_rate), vat_included: !!header.vat_included, wht_rate: num(header.wht_rate) },
  });
  return {
    subtotal:              r.subtotal.amount,
    total_line_discount:   r.total_line_discount.amount,
    total_header_discount: r.header_discount.amount,
    total_shipping:        r.shipping.amount,
    taxable:               r.taxable.amount,
    total_vat:             r.total_vat.amount,
    total_wht:             r.total_wht.amount,
    grand_total:           r.grand_total.amount,
  };
}

/** เลขที่ใบสั่งขาย — แยกชุดต่อบริษัท (so_order_<CODE>) เหมือนที่ใบกำกับภาษีทำอยู่ */
export async function nextOrderNo(admin: ReturnType<typeof supabaseAdmin>, companyCode: string | null): Promise<string> {
  const code = (companyCode ?? "").trim().toUpperCase();
  if (code) {
    const { data, error } = await admin.rpc("erp_next_number", { p_key: `so_order_${code}` });
    if (!error && data) return String(data);
  }
  const { data, error } = await admin.rpc("erp_next_number", { p_key: "so_order" });
  if (!error && data) return String(data);
  // กันพลาดสุดท้าย — ไม่ให้บันทึกไม่ได้เพราะเลขออกไม่ได้
  const d = new Date();
  const { count } = await admin.from("so_orders").select("id", { count: "exact", head: true });
  return `SO${d.getFullYear() + 543}-${String(d.getMonth() + 1).padStart(2, "0")}-${String((count ?? 0) + 1).padStart(3, "0")}`;
}

/** แถวใบสั่งขาย 1 ใบ + จำนวนบรรทัด (ใช้ในหน้ารายการ) */
export type SoOrderRow = {
  id: string; order_no: string | null; status: string;
  company_code: string | null; customer_name: string | null; customer_code: string | null;
  customer_po_no: string | null; sale_person_name: string | null;
  order_date: string; due_date: string | null;
  grand_total: number; line_count: number;
  mo_opened_at: string | null; invoice_so_id: string | null; shipped_at: string | null;
};
