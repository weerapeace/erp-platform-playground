/**
 * GET /api/purchasing/goods-receipt/<id> — ใบรับ GR 1 ใบ (หัว + รายการ พร้อมรหัส/รูป SKU) ไว้พิมพ์ "ใบรับ"
 * <id> รับได้ทั้ง uuid และเลขใบ GR-2026-00001
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { SKU_COVER_SELECT, resolveSkuCover, coverUrl } from "@/lib/sku-cover";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export type GrDetail = {
  id: string; gr_no: string; po_id: string | null; po_no: string; seller_name: string; receive_date: string | null; receiver: string; note: string | null; status: string;
  currency: string; voucher_id: string | null; pv_no: string | null; receipt_doc_r2_key: string | null; bill_doc_r2_key: string | null;
  lines: { id: string; po_line_id: string | null; item_sku_id: string | null; code: string; item_name: string; uom: string; qty_ordered: number; qty_received: number; qty_defective: number; case_type: string; image_url: string | null; note: string | null }[];
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const q = admin.from("goods_receipts_v2").select("*");
  const { data: gr } = await (isUuid(id) ? q.eq("id", id) : q.eq("gr_no", id)).maybeSingle();
  if (!gr) return NextResponse.json({ error: "ไม่พบใบรับ" }, { status: 404 });
  const g = gr as Row;

  const [{ data: ls }, { data: po }, { data: pv }] = await Promise.all([
    admin.from("goods_receipt_lines_v2").select("*").eq("gr_id", String(g.id)).not("is_active", "is", false).order("sort_order"),
    g.po_id ? admin.from("purchase_orders_v2").select("currency").eq("id", String(g.po_id)).maybeSingle() : Promise.resolve({ data: null }),
    g.voucher_id ? admin.from("purchase_vouchers_v2").select("pv_no").eq("id", String(g.voucher_id)).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const lines = (ls ?? []) as Row[];
  const skuIds = [...new Set(lines.map((l) => String(l.item_sku_id ?? "")).filter(Boolean))];
  const skuMap = new Map<string, Row>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const { data: sk } = await admin.from("skus_v2").select("id, code, " + SKU_COVER_SELECT).in("id", skuIds.slice(i, i + 300));
    for (const s of (sk ?? []) as unknown as Row[]) skuMap.set(String(s.id), s);
  }
  const out: GrDetail = {
    id: String(g.id), gr_no: String(g.gr_no ?? ""), po_id: (g.po_id as string) ?? null, po_no: String(g.po_no ?? ""), seller_name: String(g.seller_name ?? ""),
    receive_date: (g.receive_date as string) ?? null, receiver: String(g.receiver ?? ""), note: (g.note as string) ?? null, status: String(g.status ?? ""),
    currency: String(((po as Row | null)?.currency as string) ?? "THB").toUpperCase(), voucher_id: (g.voucher_id as string) ?? null, pv_no: ((pv as Row | null)?.pv_no as string) ?? null,
    receipt_doc_r2_key: (g.receipt_doc_r2_key as string) ?? null, bill_doc_r2_key: (g.bill_doc_r2_key as string) ?? null,
    lines: lines.map((l) => {
      const sku = l.item_sku_id ? skuMap.get(String(l.item_sku_id)) : undefined;
      return {
        id: String(l.id), po_line_id: (l.po_line_id as string) ?? null, item_sku_id: (l.item_sku_id as string) ?? null, code: sku ? String(sku.code ?? "") : "",
        item_name: String(l.item_name ?? ""), uom: String(l.uom ?? ""), qty_ordered: num(l.qty_ordered), qty_received: num(l.qty_received), qty_defective: num(l.qty_defective),
        case_type: String(l.case_type ?? ""), image_url: coverUrl(resolveSkuCover(sku).key), note: (l.note as string) ?? null,
      };
    }),
  };
  return NextResponse.json({ data: out, error: null });
}
