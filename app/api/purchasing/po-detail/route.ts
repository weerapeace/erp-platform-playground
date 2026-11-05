/**
 * GET /api/purchasing/po-detail?id=<po_id> — รายละเอียดใบสั่งซื้อ 1 ใบ (หัวใบ + รายการสินค้า + รูป)
 * ใช้ใน popup ของแดชบอร์ดจัดซื้อ (กดแถวในรายการ จ่ายแล้ว / รอจ่าย)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { loadPoLines, type PoDetailLine } from "@/lib/po-lines-server";
import { buildPartnerMatcher, type PartnerLike } from "@/lib/partner-match";
import { formatCreditTerm } from "@/lib/credit-term";
import { computePoTotals, sumActiveLines } from "@/lib/po-total";
import { formatThaiAddress, formatTaxId } from "@/lib/thai-address";
import { loadPoPay } from "@/lib/po-pay-server";
import { isChinaShop } from "@/lib/po-currency";
import { loadPoChinaLinks, type PoChinaLink } from "@/lib/china-bill-po-server";
import type { PoPayState } from "@/lib/po-pay-state";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const isCNY = (c: unknown) => ["RMB", "YUAN", "CNY"].includes(String(c ?? "").toUpperCase());

/** บรรทัดสินค้า — ของกลาง lib/po-lines-server (อ่านทีละหลายใบได้ · แท็บต้องจ่ายหน้ากระแสเงินสดใช้ตัวเดียวกัน) */
export type { PoDetailLine };

/** ใบรับล่าสุดของ PO นี้ — ใช้เตือน "ใบนี้รับไปแล้ว" กันสแกนซ้ำ */
export type PoLastReceipt = { gr_no: string; receiver: string | null; receive_date: string | null };

/** ข้อมูลผู้จำหน่ายสำหรับหัวเอกสาร (ใบสั่งซื้อแบบใบกำกับภาษี) */
export type PoSellerInfo = {
  /** ชื่อบริษัทเต็ม (ตามทะเบียน) — ใบสั่งซื้อต้องใช้ชื่อนี้ ไม่ใช่ชื่อเล่นร้าน */
  company_name: string | null;
  /** ที่อยู่ประกอบเสร็จแล้ว (แขวง/เขต/จังหวัด/ไปรษณีย์) ด้วยของกลาง lib/thai-address */
  address_full: string | null;
  /** เลขผู้เสียภาษี + สาขา (ซ่อนสาขา 00000 = สำนักงานใหญ่) */
  tax_id_full: string | null;
  address: string | null; phone: string | null; tax_id: string | null; tax_branch: string | null;
  /** เงื่อนไขชำระเงินของร้าน (ข้อความอ่านง่าย เช่น "เครดิต 30 วัน") */
  payment_terms: string | null;
};
export type PoDetail = {
  id: string; po_no: string; seller: string | null; order_date: string | null;
  /** id ร้านในทะเบียน partners_v2 ที่ผูกไว้ (null = พิมพ์ชื่อเอง ยังไม่ผูก) — ป๊อปแก้ใบใช้ตั้งค่าตัวเลือกร้าน */
  seller_partner_id: string | null;
  currency: string | null; amount_thb: number;
  /** เรทที่ใช้แปลงเป็นบาท (บาท ต่อ 1 หยวน) · po = ล็อกไว้ที่ใบ · daily = เรทรายวันล่าสุด · none = ใบบาท */
  fx_rate: number | null; fx_source: "po" | "daily" | "none"; fx_rate_date: string | null;
  payment_status: string | null; paid_date: string | null; paid_amount_thb: number | null;
  payment_due_date: string | null; expected_date: string | null;
  /** สถานะรับของรวมทั้งใบ: confirmed | partial | received | ... */
  status: string | null;
  /** ภาษีมูลค่าเพิ่ม */
  vat_rate: number;
  vat_included: boolean;
  /** ใบซื้อของบริษัทไหน (companies) — ใช้แยกกระแสเงินสดรายบริษัท */
  company_id: string | null;
  /** ยอดก่อนภาษี / ภาษี — คิดด้วยของกลาง lib/po-total */
  subtotal: number;
  vat_amount: number;
  last_receipt: PoLastReceipt | null;
  /** ใบสำคัญรับ (ใบซื้อ) ที่มีรายการของใบนี้ — จัดซื้อใส่ราคา+ค่าส่งหลังรับของ */
  vouchers: PoVoucherRef[];
  seller_info: PoSellerInfo | null;
  note: string | null;
  lines: PoDetailLine[];
  /** สถานะจ่ายเงิน (สีป้าย) ตามเครดิตร้าน — ของกลาง lib/po-pay-state */
  pay: PoPayState;
  /** ร้านอยู่จีน (lib/po-currency) — ใบบาทของร้านจีน = ป้ายเตือน + ปุ่มแก้สกุลเงิน */
  shop_china: boolean;
  /** บิลจีน (แอปโอนเงินจีน) ที่จ่ายใบนี้ — ตาราง china_bill_po_links (lib/china-bill-po-server) */
  china_links: PoChinaLink[];
};
export type PoVoucherRef = { id: string; pv_no: string | null; status: string; grand_total_thb: number; ship_total_thb: number };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const admin = supabaseAdmin();
  const rateRes = await admin.from("daily_rates").select("rate, rate_date").not("is_active", "is", false).order("rate_date", { ascending: false }).limit(1).maybeSingle();
  const dailyRate = num((rateRes.data as { rate?: number } | null)?.rate) || 5;
  const dailyRateDate = ((rateRes.data as { rate_date?: string } | null)?.rate_date) ?? null;

  const { data: po, error } = await admin.from("purchase_orders_v2")
    .select("id, po_no, seller_name, seller_partner_id, order_date, grand_total, currency, fx_rate, payment_status, paid_date, paid_amount_thb, payment_due_date, expected_date, status, note, vat_rate, vat_included, company_id, china_bill_id")
    .eq("id", id).single();
  if (error || !po) return NextResponse.json({ error: "ไม่พบใบสั่งซื้อ" }, { status: 404 });

  // บรรทัดสินค้า + รูป + หน่วย — ของกลาง (อ่านพลาด = ใบไม่มีรายการ เหมือนเดิม ไม่ทำทั้งป๊อปพัง)
  const lines: PoDetailLine[] = (await loadPoLines(admin, [id]).catch(() => new Map<string, PoDetailLine[]>())).get(id) ?? [];

  // ใบรับล่าสุด — หน้าสแกนเอาไปเตือน "ใบนี้รับไปแล้วเมื่อ..." กันกดซ้ำจนของเข้าเบิ้ล
  const { data: grs } = await admin.from("goods_receipts_v2")
    .select("gr_no, receiver, receive_date").eq("po_id", id)
    .order("receive_date", { ascending: false }).limit(1);
  const lastGr = ((grs ?? []) as Record<string, unknown>[])[0] ?? null;

  // ใบสำคัญรับ (ใบซื้อ) ที่ครอบใบนี้ — ผ่านบรรทัดใบสำคัญ (po_id) → หัวใบ
  const vouchers: PoVoucherRef[] = [];
  {
    const { data: vl } = await admin.from("purchase_voucher_lines_v2").select("voucher_id").eq("po_id", id).not("is_active", "is", false);
    const vids = [...new Set(((vl ?? []) as Record<string, unknown>[]).map((r) => String(r.voucher_id)))];
    if (vids.length) {
      const { data: vs } = await admin.from("purchase_vouchers_v2").select("id, pv_no, status, grand_total_thb, ship_total_thb").in("id", vids).not("is_active", "is", false).neq("status", "cancelled").order("created_at", { ascending: false });
      for (const v of (vs ?? []) as Record<string, unknown>[]) vouchers.push({ id: String(v.id), pv_no: (v.pv_no as string) ?? null, status: String(v.status ?? "draft"), grand_total_thb: num(v.grand_total_thb), ship_total_thb: num(v.ship_total_thb) });
    }
  }

  // ข้อมูลผู้จำหน่ายสำหรับหัวเอกสาร — ผูกจาก id ก่อน ถ้าไม่มีค่อยจับจากชื่อ (ของกลาง lib/partner-match)
  let sellerInfo: PoSellerInfo | null = null;
  let shopChina = false;
  {
    const p0 = po as Record<string, unknown>;
    let partnerId: string | null = (p0.seller_partner_id as string) ?? null;
    if (!partnerId && p0.seller_name) {
      const { data: all } = await admin.from("partners_v2").select("id, display_name, name_th, is_supplier, is_active");
      partnerId = buildPartnerMatcher((all ?? []) as unknown as PartnerLike[]).match(String(p0.seller_name))?.id ?? null;
    }
    if (partnerId) {
      const { data: pt } = await admin.from("partners_v2")
        .select("company_name, address_line, sub_district, district, province, postal_code, phone, tax_id, tax_branch, purchase_credit_term, shop_country, default_currency, is_taobao")
        .eq("id", partnerId).maybeSingle();
      const r = (pt ?? null) as Record<string, unknown> | null;
      shopChina = isChinaShop(r);
      if (r) {
        sellerInfo = {
          company_name: (r.company_name as string) ?? null,
          address_full: formatThaiAddress(r) || null,
          tax_id_full: formatTaxId(r.tax_id, r.tax_branch) || null,
          address: (r.address_line as string) ?? null,
          phone: (r.phone as string) ?? null,
          tax_id: (r.tax_id as string) ?? null,
          tax_branch: (r.tax_branch as string) ?? null,
          payment_terms: r.purchase_credit_term ? formatCreditTerm(r.purchase_credit_term as string) : null,
        };
      }
    }
  }

  const p = po as Record<string, unknown>;
  // ยอดก่อนภาษี/ภาษี — คิดจากบรรทัดจริงด้วยสูตรกลาง (grand_total ใน DB = ยอดจ่ายรวม VAT แล้ว)
  const poTotals = computePoTotals(
    sumActiveLines(lines.map((l) => ({ line_total: l.total }))),
    num(p.vat_rate), !!p.vat_included,
  );
  // เรทแปลงบาท: เรทที่ล็อกไว้ที่ใบ → ไม่มี = เรทรายวันล่าสุด (บอกที่มาให้หน้าจอโชว์ว่า "แปลงจากเรทอะไร")
  const foreign = isCNY(p.currency);
  const poRate = num(p.fx_rate);
  const rmb = foreign ? (poRate > 0 ? poRate : dailyRate) : 1;
  const detail: PoDetail = {
    id: String(p.id), po_no: String(p.po_no ?? "—"), seller: (p.seller_name as string) ?? null,
    seller_partner_id: (p.seller_partner_id as string) ?? null,
    order_date: (p.order_date as string) ?? null, currency: (p.currency as string) ?? null,
    amount_thb: Math.round(num(p.grand_total) * rmb),
    fx_rate: foreign ? rmb : null,
    fx_source: !foreign ? "none" : poRate > 0 ? "po" : "daily",
    fx_rate_date: foreign && !(poRate > 0) ? dailyRateDate : null,
    payment_status: (p.payment_status as string) ?? null,
    paid_date: (p.paid_date as string) ?? null,
    paid_amount_thb: p.paid_amount_thb == null ? null : num(p.paid_amount_thb),
    payment_due_date: (p.payment_due_date as string) ?? null,
    expected_date: (p.expected_date as string) ?? null,
    status: (p.status as string) ?? null,
    vat_rate: num(p.vat_rate),
    vat_included: !!p.vat_included,
    company_id: (p.company_id as string) ?? null,
    subtotal: poTotals.subtotal,
    vat_amount: poTotals.vat,
    seller_info: sellerInfo,
    note: (p.note as string) ?? null,
    last_receipt: lastGr
      ? { gr_no: String(lastGr.gr_no ?? ""), receiver: (lastGr.receiver as string) ?? null, receive_date: (lastGr.receive_date as string) ?? null }
      : null,
    vouchers,
    lines,
    pay: (await loadPoPay(admin))(p),
    shop_china: shopChina,
    china_links: await loadPoChinaLinks(admin, String(p.id)).catch(() => []),
  };
  return NextResponse.json({ data: detail, error: null });
}
