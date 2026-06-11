/**
 * GET /api/purchasing/receive-ledger
 * ประวัติการรับสินค้าทั้งหมด — ราย "บรรทัด" (1 แถว = รับสินค้า 1 ชนิด 1 ครั้ง)
 * join goods_receipt_lines_v2 → goods_receipts_v2 (วันที่/ผู้รับ/PO/ร้าน) + skus_v2 (รหัส)
 * ใช้ในหน้า "ประวัติการรับ" — ค้นหา/เรียง/กรองด้วยตารางกลาง
 * ดูประวัติของสินค้าตัวใดตัวหนึ่งได้ด้วยการค้นหาชื่อ/รหัส
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  // บรรทัดรับ (ใหม่สุดก่อน)
  const { data: grl, error } = await admin
    .from("goods_receipt_lines_v2")
    .select("id, gr_id, item_sku_id, item_name, uom, qty_received, qty_defective, case_type")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  if (!grl || grl.length === 0) return NextResponse.json({ data: [], error: null });

  // หัวใบรับ
  const grIds = [...new Set(grl.map((r) => r.gr_id).filter(Boolean) as string[])];
  const grMap = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < grIds.length; i += 300) {
    const chunk = grIds.slice(i, i + 300);
    const { data: gr } = await admin.from("goods_receipts_v2").select("id, gr_no, receive_date, receiver, po_no, seller_name").in("id", chunk);
    for (const g of (gr ?? []) as Record<string, unknown>[]) grMap.set(String(g.id), g);
  }

  // รหัส SKU
  const skuIds = [...new Set(grl.map((r) => r.item_sku_id).filter(Boolean) as string[])];
  const codeMap = new Map<string, string>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const chunk = skuIds.slice(i, i + 300);
    const { data: sk } = await admin.from("skus_v2").select("id, code").in("id", chunk);
    for (const s of (sk ?? []) as Record<string, unknown>[]) codeMap.set(String(s.id), (s.code as string) ?? "");
  }

  const rows = grl.map((r) => {
    const g = grMap.get(String(r.gr_id)) ?? {};
    return {
      id: String(r.id),
      receive_date: (g.receive_date as string) ?? null,
      gr_no: (g.gr_no as string) ?? "",
      po_no: (g.po_no as string) ?? "",
      seller_name: (g.seller_name as string) ?? "",
      receiver: (g.receiver as string) ?? "",
      item_sku_id: r.item_sku_id ?? null,
      code: r.item_sku_id ? (codeMap.get(String(r.item_sku_id)) ?? "") : "",
      item_name: (r.item_name as string) ?? "",
      uom: (r.uom as string) ?? "",
      qty_received: num(r.qty_received),
      qty_defective: num(r.qty_defective),
      case_type: (r.case_type as string) ?? "",
    };
  });
  // เรียงตามวันที่รับล่าสุดก่อน (created_at อาจไม่ตรง receive_date)
  rows.sort((a, b) => (a.receive_date || "") < (b.receive_date || "") ? 1 : -1);

  return NextResponse.json({ data: rows, error: null });
}
