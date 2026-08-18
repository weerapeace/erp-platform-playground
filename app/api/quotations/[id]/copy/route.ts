/**
 * คัดลอกใบเสนอราคา — POST /api/quotations/[id]/copy
 *
 * อ่านใบต้นทางผ่าน RPC เดิม (erp_playground_quote_get) แล้วสร้างใบใหม่เป็น "ร่าง"
 * ด้วย erp_playground_quote_create → ได้เลขที่ใบใหม่ + คัดลอกทุกบรรทัด (รวมรูปที่แนบ/หมายเหตุ/ส่วนลด)
 *
 * ไม่ก๊อป: เลขที่ใบ · สถานะ (ใบใหม่เป็นร่างเสมอ) · ประวัติส่ง/ตอบรับ
 * วันที่: ใบใหม่ = วันนี้ · ยืนราคาถึง = เลื่อนตามช่วงเดิมของใบต้นทาง (ไม่มี = +30 วัน)
 * สิทธิ์: qt.create (บังคับใน RPC ด้วย erp_can) — เรียกด้วย client ของผู้ใช้เอง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import type { QuoteDetail } from "../../route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DAY = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();

  let body: { actor?: string } = {};
  try { body = await request.json(); } catch { /* ไม่ส่ง body ก็ได้ */ }

  const { data: src, error: gErr } = await client.rpc("erp_playground_quote_get", { p_id: id });
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });
  const q = src as QuoteDetail | null;
  if (!q) return NextResponse.json({ error: "ไม่พบใบเสนอราคาต้นทาง" }, { status: 404 });

  // ช่วงยืนราคาเดิมกี่วัน → ใช้ช่วงเดียวกันนับจากวันนี้
  const today = new Date();
  const days = q.quote_date && q.valid_until
    ? Math.max(1, Math.round((new Date(q.valid_until).getTime() - new Date(q.quote_date).getTime()) / DAY))
    : 30;

  const header = {
    customer_id: q.customer_id ?? null,
    customer_name: q.customer_name ?? null,
    customer_code: q.customer_code ?? null,
    sale_person_name: q.sale_person_name ?? null,
    currency: q.currency ?? "THB",
    exchange_rate: q.exchange_rate ?? 1,
    header_discount_type: q.header_discount_type ?? "percent",
    header_discount_value: q.header_discount_value ?? 0,
    shipping_fee: q.shipping_fee ?? 0,
    vat_rate: q.vat_rate ?? 7,
    vat_included: q.vat_included ?? false,
    wht_rate: q.wht_rate ?? 0,
    quote_date: iso(today),
    valid_until: iso(new Date(today.getTime() + days * DAY)),
    note: q.note ?? null,
  };
  const lines = (q.lines ?? []).map((l) => ({
    product_id: l.product_id ?? null, sku: l.sku ?? null, product_name: l.product_name,
    qty: l.qty, unit: l.unit, unit_price: l.unit_price,
    discount_type: l.discount_type ?? "percent", discount_value: l.discount_value ?? 0,
    tax_code: l.tax_code ?? null, note: l.note ?? null,
    image_key: l.image_key ?? null,      // รูปที่แนบไว้ติดไปด้วย
  }));

  const actor = body.actor ?? user?.email ?? null;
  const { data: newId, error } = await client.rpc("erp_playground_quote_create", {
    p_header: header, p_lines: lines, p_actor: actor,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: newId, copied_from: q.quote_number ?? id, lines: lines.length, error: null });
}
