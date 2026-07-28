/**
 * GET /api/purchasing/shop-terms — รายชื่อร้านสำหรับตั้ง "เครดิตการจ่าย + ระยะเวลาส่งของ" รวดเดียว
 *
 * เรียงตาม "ซื้อบ่อยสุด" ก่อน (จำนวนใบสั่งซื้อ) → ตั้งร้านต้น ๆ ไม่กี่ร้านก็ครอบคลุมใบส่วนใหญ่แล้ว
 * คืนสถิติรวมด้วย เพื่อบอกความคืบหน้า (ตั้งไปแล้วกี่ร้าน / ครอบคลุมใบกี่ %)
 *
 * บันทึกค่า: ใช้ PATCH /api/master-v2/partners/{id} ของกลาง (เคารพสิทธิ์ + audit log)
 * ดู lib/credit-term (ตัวคำนวณวันจ่าย/วันของเข้า) · ปฏิทินจัดซื้อใช้ค่านี้คิดวันให้อัตโนมัติ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { buildPartnerMatcher } from "@/lib/partner-match";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type ShopTermRow = {
  id: string;
  name: string;
  code: string | null;
  is_china: boolean;
  po_count: number;
  last_order_date: string | null;
  unpaid_count: number;
  credit_term: string | null;
  lead_time: string | null;
};
export type ShopTermsResponse = {
  rows: ShopTermRow[];
  summary: { shops: number; with_credit: number; with_lead: number; pos: number; pos_covered: number };
  error: string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  const { data: pData, error } = await admin.from("partners_v2")
    .select("id, code, display_name, name_th, name_en, is_supplier, is_active, shop_country, is_taobao, default_currency, purchase_credit_term, purchase_lead_time")
    .limit(5000);
  if (error) return NextResponse.json({ rows: [], summary: { shops: 0, with_credit: 0, with_lead: 0, pos: 0, pos_covered: 0 }, error: error.message }, { status: 500 });

  type P = {
    id: string; code: string | null; display_name: string | null; name_th: string | null; name_en: string | null;
    is_supplier: boolean | null; is_active: boolean | null; shop_country: string | null; is_taobao: boolean | null;
    default_currency: string | null; purchase_credit_term: string | null; purchase_lead_time: string | null;
  };
  const partners = (pData ?? []) as unknown as P[];
  // ใบเก่าบางใบยังไม่ผูก id ร้าน → เดาจากชื่อด้วยของกลาง lib/partner-match
  const matcher = buildPartnerMatcher(partners);

  const { data: poData } = await admin.from("purchase_orders_v2")
    .select("id, seller_partner_id, seller_name, order_date, payment_status, status")
    .eq("is_active", true).neq("status", "cancelled").limit(5000);

  const stat = new Map<string, { pos: number; unpaid: number; last: string | null }>();
  let posTotal = 0;
  for (const raw of (poData ?? []) as unknown as { seller_partner_id: string | null; seller_name: string | null; order_date: string | null; payment_status: string | null }[]) {
    posTotal++;
    const pid = raw.seller_partner_id ? String(raw.seller_partner_id) : matcher.match(raw.seller_name)?.id;
    if (!pid) continue;
    const s = stat.get(pid) ?? { pos: 0, unpaid: 0, last: null };
    s.pos++;
    if (raw.payment_status === "unpaid") s.unpaid++;
    if (raw.order_date && (!s.last || raw.order_date > s.last)) s.last = raw.order_date;
    stat.set(pid, s);
  }

  const isChina = (p: P) => p.is_taobao === true || /จีน|china/i.test(String(p.shop_country ?? "")) || String(p.default_currency ?? "") === "RMB";
  // แสดงเฉพาะร้านที่เป็นผู้จำหน่าย หรือมีใบสั่งซื้อจริง (กันรายชื่อลูกค้าล้นหน้า)
  const rows: ShopTermRow[] = partners
    .filter((p) => p.is_active !== false && (p.is_supplier === true || (stat.get(String(p.id))?.pos ?? 0) > 0))
    .map((p) => {
      const s = stat.get(String(p.id));
      return {
        id: String(p.id),
        name: String(p.display_name || p.name_th || p.name_en || p.code || "(ไม่มีชื่อ)"),
        code: p.code ?? null,
        is_china: isChina(p),
        po_count: s?.pos ?? 0,
        last_order_date: s?.last ?? null,
        unpaid_count: s?.unpaid ?? 0,
        credit_term: String(p.purchase_credit_term ?? "").trim() || null,
        lead_time: String(p.purchase_lead_time ?? "").trim() || null,
      };
    })
    .sort((a, b) => b.po_count - a.po_count || a.name.localeCompare(b.name, "th"));

  const posCovered = rows.filter((r) => r.credit_term).reduce((a, r) => a + r.po_count, 0);
  return NextResponse.json({
    rows,
    summary: {
      shops: rows.length,
      with_credit: rows.filter((r) => r.credit_term).length,
      with_lead: rows.filter((r) => r.lead_time).length,
      pos: posTotal,
      pos_covered: posCovered,
    },
    error: null,
  } satisfies ShopTermsResponse);
}
