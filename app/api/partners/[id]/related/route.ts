/**
 * GET /api/partners/[id]/related — รายการที่เชื่อมกับ partner (ตาม FK จริง)
 *   ผู้ขาย: วัตถุดิบที่รับซื้อ (supplier_items) · ใบสั่งซื้อ PO (purchase_orders_v2) · บิลจีน (china_bills)
 *   ลูกค้า: ใบเสนอราคา (offer_sheets)
 *   → { is_supplier, is_customer, materials[], purchase_orders[], china_bills[], offer_sheets[], counts }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIMIT = 25;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: p } = await admin.from("partners_v2").select("id, is_customer, is_supplier").eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ error: "ไม่พบ partner" }, { status: 404 });

  const out: Record<string, unknown> = { is_supplier: !!p.is_supplier, is_customer: !!p.is_customer };
  const counts: Record<string, number> = {};

  if (p.is_supplier) {
    // วัตถุดิบที่รับซื้อ — supplier_items + resolve sku code
    const { data: items } = await admin.from("supplier_items").select("id, item_sku_id, is_default").eq("supplier_partner_id", id).limit(LIMIT);
    const skuIds = [...new Set((items ?? []).map((r) => r.item_sku_id).filter(Boolean) as string[])];
    const codeMap = new Map<string, string>();
    if (skuIds.length) {
      const { data: skus } = await admin.from("skus_v2").select("id, code").in("id", skuIds);
      for (const s of (skus ?? []) as { id: string; code: string | null }[]) codeMap.set(s.id, s.code ?? "");
    }
    const { count: matCount } = await admin.from("supplier_items").select("id", { count: "exact", head: true }).eq("supplier_partner_id", id);
    out.materials = (items ?? []).map((r) => ({ id: r.id, sku_code: codeMap.get(r.item_sku_id as string) || "—", is_default: r.is_default }));
    counts.materials = matCount ?? (items ?? []).length;

    const { data: pos, count: poCount } = await admin.from("purchase_orders_v2")
      .select("id, po_no, order_date, grand_total, status", { count: "exact" })
      .eq("seller_partner_id", id).order("order_date", { ascending: false, nullsFirst: false }).limit(LIMIT);
    out.purchase_orders = pos ?? [];
    counts.purchase_orders = poCount ?? (pos ?? []).length;

    const { data: bills, count: billCount } = await admin.from("china_bills")
      .select("id, status, created_at", { count: "exact" })
      .eq("supplier_id", id).order("created_at", { ascending: false }).limit(LIMIT);
    out.china_bills = bills ?? [];
    counts.china_bills = billCount ?? (bills ?? []).length;
  }

  if (p.is_customer) {
    const { data: offers, count: offCount } = await admin.from("offer_sheets")
      .select("id, title, status, created_at", { count: "exact" })
      .eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT);
    out.offer_sheets = offers ?? [];
    counts.offer_sheets = offCount ?? (offers ?? []).length;
  }

  out.counts = counts;
  return NextResponse.json({ ...out, error: null });
}
