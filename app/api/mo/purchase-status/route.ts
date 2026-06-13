/**
 * สถานะของที่ซื้อของใบสั่งผลิต — /api/mo/purchase-status?mo_no=MO-xxxx
 * ดึง purchase_requests_v2 ที่ source_mo_no = ใบนี้ → สถานะ + ผูกใบสั่งซื้อ (วันของจะถึง/สถานะ PO)
 * ของกลาง: guardApi(products.view) + supabaseAdmin
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type PurchaseStatusRow = {
  id: string; item_name: string; qty: number; uom: string | null;
  pr_no: string | null; pr_status: string; is_urgent: boolean; needed_date: string | null;
  po_no: string | null; po_status: string | null; expected_date: string | null; seller_name: string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const moNo = (new URL(request.url).searchParams.get("mo_no") ?? "").trim();
  if (!moNo) return NextResponse.json({ data: [], error: null });

  const admin = supabaseAdmin();
  const { data: prs, error } = await admin.from("purchase_requests_v2")
    .select("id, pr_no, item_name, qty, uom, status, is_urgent, needed_date, po_id")
    .eq("source_mo_no", moNo).eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const poIds = Array.from(new Set((prs ?? []).map((p: Record<string, unknown>) => p.po_id).filter(Boolean))) as string[];
  const poMap = new Map<string, { po_no: string; status: string; expected_date: string | null; seller_name: string | null }>();
  if (poIds.length) {
    const { data: pos } = await admin.from("purchase_orders_v2").select("id, po_no, status, expected_date, seller_name").in("id", poIds);
    for (const po of (pos ?? []) as Record<string, unknown>[]) {
      poMap.set(String(po.id), { po_no: String(po.po_no ?? ""), status: String(po.status ?? ""), expected_date: (po.expected_date as string) ?? null, seller_name: (po.seller_name as string) ?? null });
    }
  }

  const rows: PurchaseStatusRow[] = (prs ?? []).map((p: Record<string, unknown>) => {
    const po = p.po_id ? poMap.get(String(p.po_id)) : undefined;
    return {
      id: String(p.id), item_name: String(p.item_name ?? ""), qty: Number(p.qty) || 0, uom: (p.uom as string) ?? null,
      pr_no: (p.pr_no as string) ?? null, pr_status: String(p.status ?? ""), is_urgent: !!p.is_urgent, needed_date: (p.needed_date as string) ?? null,
      po_no: po?.po_no ?? null, po_status: po?.status ?? null, expected_date: po?.expected_date ?? null, seller_name: po?.seller_name ?? null,
    };
  });
  return NextResponse.json({ data: rows, error: null });
}
