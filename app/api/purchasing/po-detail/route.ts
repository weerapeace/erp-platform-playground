/**
 * GET /api/purchasing/po-detail?id=<po_id> — รายละเอียดใบสั่งซื้อ 1 ใบ (หัวใบ + รายการสินค้า + รูป)
 * ใช้ใน popup ของแดชบอร์ดจัดซื้อ (กดแถวในรายการ จ่ายแล้ว / รอจ่าย)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { buildPartnerMatcher, type PartnerLike } from "@/lib/partner-match";
import { formatCreditTerm } from "@/lib/credit-term";
import { computePoTotals, sumActiveLines } from "@/lib/po-total";
import { formatThaiAddress, formatTaxId } from "@/lib/th-address";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const isCNY = (c: unknown) => ["RMB", "YUAN", "CNY"].includes(String(c ?? "").toUpperCase());

export type PoDetailLine = {
  name: string; qty: number; received: number; uom: string | null;
  price: number; total: number; img: string | null; done: boolean;
  /** รหัสสินค้า — ใช้บนใบพิมพ์ที่แขวนไว้ที่โต๊ะรับของ */
  sku: string | null;
  /** id ของบรรทัด PO — ต้องมีเพื่อยืนยันรับของจากหน้าสแกน */
  id: string;
  defective: number;
};

/** ใบรับล่าสุดของ PO นี้ — ใช้เตือน "ใบนี้รับไปแล้ว" กันสแกนซ้ำ */
export type PoLastReceipt = { gr_no: string; receiver: string | null; receive_date: string | null };

/** ข้อมูลผู้จำหน่ายสำหรับหัวเอกสาร (ใบสั่งซื้อแบบใบกำกับภาษี) */
export type PoSellerInfo = {
  /** ชื่อบริษัทเต็ม (ตามทะเบียน) — ใบสั่งซื้อต้องใช้ชื่อนี้ ไม่ใช่ชื่อเล่นร้าน */
  company_name: string | null;
  /** ที่อยู่ประกอบเสร็จแล้ว (แขวง/เขต/จังหวัด/ไปรษณีย์) ด้วยของกลาง lib/th-address */
  address_full: string | null;
  /** เลขผู้เสียภาษี + สาขา (ซ่อนสาขา 00000 = สำนักงานใหญ่) */
  tax_id_full: string | null;
  address: string | null; phone: string | null; tax_id: string | null; tax_branch: string | null;
  /** เงื่อนไขชำระเงินของร้าน (ข้อความอ่านง่าย เช่น "เครดิต 30 วัน") */
  payment_terms: string | null;
};
export type PoDetail = {
  id: string; po_no: string; seller: string | null; order_date: string | null;
  currency: string | null; amount_thb: number;
  payment_status: string | null; paid_date: string | null; paid_amount_thb: number | null;
  payment_due_date: string | null; expected_date: string | null;
  /** สถานะรับของรวมทั้งใบ: confirmed | partial | received | ... */
  status: string | null;
  /** ภาษีมูลค่าเพิ่ม */
  vat_rate: number;
  vat_included: boolean;
  /** ยอดก่อนภาษี / ภาษี — คิดด้วยของกลาง lib/po-total */
  subtotal: number;
  vat_amount: number;
  last_receipt: PoLastReceipt | null;
  seller_info: PoSellerInfo | null;
  note: string | null;
  lines: PoDetailLine[];
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const admin = supabaseAdmin();
  const rateRes = await admin.from("daily_rates").select("rate").order("rate_date", { ascending: false }).limit(1).maybeSingle();
  const rmb = num((rateRes.data as { rate?: number } | null)?.rate) || 5;

  const { data: po, error } = await admin.from("purchase_orders_v2")
    .select("id, po_no, seller_name, seller_partner_id, order_date, grand_total, currency, payment_status, paid_date, paid_amount_thb, payment_due_date, expected_date, status, note, vat_rate, vat_included")
    .eq("id", id).single();
  if (error || !po) return NextResponse.json({ error: "ไม่พบใบสั่งซื้อ" }, { status: 404 });

  const { data: ls } = await admin.from("purchase_order_lines_v2")
    .select("id, item_sku_id, item_name, qty, qty_received, qty_defective, uom, price_est, line_total, sort_order, line_status, is_active")
    .eq("po_id", id).order("sort_order", { ascending: true });
  const rows = ((ls ?? []) as Record<string, unknown>[]).filter((l) => l.is_active !== false);

  const skuIds = [...new Set(rows.map((l) => l.item_sku_id).filter(Boolean) as string[])];
  const coverMap = new Map<string, string | null>();
  const uomBySku = new Map<string, string | null>();
  const codeBySku = new Map<string, string | null>();
  if (skuIds.length) {
    const { data: sk } = await admin.from("skus_v2").select("id, code, cover_image_r2_key, uom_id").in("id", skuIds);
    const uomIds = [...new Set(((sk ?? []) as Record<string, unknown>[]).map((s) => s.uom_id).filter(Boolean) as string[])];
    const uomName = new Map<string, string>();
    if (uomIds.length) {
      const { data: us } = await admin.from("uoms").select("id, name").in("id", uomIds);
      for (const u of (us ?? []) as Record<string, unknown>[]) uomName.set(String(u.id), String(u.name ?? ""));
    }
    for (const s of (sk ?? []) as Record<string, unknown>[]) {
      coverMap.set(String(s.id), (s.cover_image_r2_key as string) ?? null);
      uomBySku.set(String(s.id), s.uom_id ? (uomName.get(String(s.uom_id)) ?? null) : null);
      codeBySku.set(String(s.id), (s.code as string) ?? null);
    }
  }

  // ใบรับล่าสุด — หน้าสแกนเอาไปเตือน "ใบนี้รับไปแล้วเมื่อ..." กันกดซ้ำจนของเข้าเบิ้ล
  const { data: grs } = await admin.from("goods_receipts_v2")
    .select("gr_no, receiver, receive_date").eq("po_id", id)
    .order("receive_date", { ascending: false }).limit(1);
  const lastGr = ((grs ?? []) as Record<string, unknown>[])[0] ?? null;

  // ข้อมูลผู้จำหน่ายสำหรับหัวเอกสาร — ผูกจาก id ก่อน ถ้าไม่มีค่อยจับจากชื่อ (ของกลาง lib/partner-match)
  let sellerInfo: PoSellerInfo | null = null;
  {
    const p0 = po as Record<string, unknown>;
    let partnerId: string | null = (p0.seller_partner_id as string) ?? null;
    if (!partnerId && p0.seller_name) {
      const { data: all } = await admin.from("partners_v2").select("id, display_name, name_th, is_supplier, is_active");
      partnerId = buildPartnerMatcher((all ?? []) as unknown as PartnerLike[]).match(String(p0.seller_name))?.id ?? null;
    }
    if (partnerId) {
      const { data: pt } = await admin.from("partners_v2")
        .select("company_name, address_line, sub_district, district, province, postal_code, phone, tax_id, tax_branch, purchase_credit_term")
        .eq("id", partnerId).maybeSingle();
      const r = (pt ?? null) as Record<string, unknown> | null;
      if (r) {
        sellerInfo = {
          company_name: (r.company_name as string) ?? null,
          address_full: formatThaiAddress({
            address_line: r.address_line as string, sub_district: r.sub_district as string,
            district: r.district as string, province: r.province as string, postal_code: r.postal_code as string,
          }) || null,
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
    sumActiveLines(rows as { line_total?: number | null; is_active?: boolean | null }[]),
    num(p.vat_rate), !!p.vat_included,
  );
  const detail: PoDetail = {
    id: String(p.id), po_no: String(p.po_no ?? "—"), seller: (p.seller_name as string) ?? null,
    order_date: (p.order_date as string) ?? null, currency: (p.currency as string) ?? null,
    amount_thb: Math.round(num(p.grand_total) * (isCNY(p.currency) ? rmb : 1)),
    payment_status: (p.payment_status as string) ?? null,
    paid_date: (p.paid_date as string) ?? null,
    paid_amount_thb: p.paid_amount_thb == null ? null : num(p.paid_amount_thb),
    payment_due_date: (p.payment_due_date as string) ?? null,
    expected_date: (p.expected_date as string) ?? null,
    status: (p.status as string) ?? null,
    vat_rate: num(p.vat_rate),
    vat_included: !!p.vat_included,
    subtotal: poTotals.subtotal,
    vat_amount: poTotals.vat,
    seller_info: sellerInfo,
    note: (p.note as string) ?? null,
    last_receipt: lastGr
      ? { gr_no: String(lastGr.gr_no ?? ""), receiver: (lastGr.receiver as string) ?? null, receive_date: (lastGr.receive_date as string) ?? null }
      : null,
    lines: rows.map((l) => {
      const sid = l.item_sku_id ? String(l.item_sku_id) : null;
      const key = sid ? coverMap.get(sid) : null;
      const st = String(l.line_status ?? "");
      const remain = Math.max(0, num(l.qty) - num(l.qty_received));
      return {
        name: String(l.item_name ?? ""), qty: num(l.qty), received: num(l.qty_received),
        uom: (l.uom as string) || (sid ? (uomBySku.get(sid) ?? null) : null),
        price: num(l.price_est), total: num(l.line_total),
        img: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null,
        done: st === "received" || st === "short_closed" || st === "closed_short" || remain === 0,
        sku: sid ? (codeBySku.get(sid) ?? null) : null,
        id: String(l.id),
        defective: num(l.qty_defective),
      };
    }),
  };
  return NextResponse.json({ data: detail, error: null });
}
