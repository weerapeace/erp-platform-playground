/**
 * GET /api/purchasing/receive-history?po_line_id=xxx
 * ประวัติการรับของ "บรรทัดสินค้า" หนึ่งบรรทัด (po_line_id) — ทุกครั้งที่เคยรับ
 * join goods_receipt_lines_v2 → goods_receipts_v2 (เลขใบรับ + วันที่ + ผู้รับ)
 * ใช้โชว์ในป๊อปกรอกจำนวนรับ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const poLineId = request.nextUrl.searchParams.get("po_line_id");
  if (!poLineId) return NextResponse.json({ data: [], error: "ไม่ระบุ po_line_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: grl, error } = await admin
    .from("goods_receipt_lines_v2")
    .select("gr_id, qty_received, qty_defective, case_type")
    .eq("po_line_id", poLineId);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  if (!grl || grl.length === 0) return NextResponse.json({ data: [], error: null });

  // หัวใบรับ: วันที่ + เลขใบ + ผู้รับ
  const grIds = [...new Set(grl.map((r) => r.gr_id).filter(Boolean) as string[])];
  const grMap = new Map<string, { gr_no: string; receive_date: string | null; receiver: string | null }>();
  for (let i = 0; i < grIds.length; i += 300) {
    const chunk = grIds.slice(i, i + 300);
    const { data: gr } = await admin.from("goods_receipts_v2").select("id, gr_no, receive_date, receiver").in("id", chunk);
    for (const g of (gr ?? []) as Record<string, unknown>[]) grMap.set(String(g.id), { gr_no: String(g.gr_no ?? ""), receive_date: (g.receive_date as string) ?? null, receiver: (g.receiver as string) ?? null });
  }

  const rows = grl.map((r) => {
    const g = grMap.get(String(r.gr_id));
    return {
      gr_no: g?.gr_no ?? "",
      receive_date: g?.receive_date ?? null,
      receiver: g?.receiver ?? "",
      qty_received: num(r.qty_received),
      qty_defective: num(r.qty_defective),
      case_type: (r.case_type as string) ?? "",
    };
  });
  // เรียงตามวันที่รับ (เก่า→ใหม่); ว่างไว้ท้าย
  rows.sort((a, b) => (a.receive_date || "9999") < (b.receive_date || "9999") ? -1 : 1);

  return NextResponse.json({ data: rows, error: null });
}
