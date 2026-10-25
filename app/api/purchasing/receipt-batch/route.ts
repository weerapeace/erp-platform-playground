/**
 * GET /api/purchasing/receipt-batch?no=RB-2026-0001 — ใบรับ (GR) ทั้งหมดใน "ชุดรับของ" เดียวกัน
 * ชุดรับ = รับของหลายใบสั่งซื้อพร้อมกันจากตะกร้าเดียว (ข้างในยังแยก 1 ใบสั่งซื้อ = 1 ใบรับ)
 * ใช้ที่: พิมพ์ใบรับรวมทั้งชุด /print/goods-receipt/RB-…
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type ReceiptBatch = {
  batch_no: string;
  grs: { id: string; gr_no: string; po_no: string; seller_name: string; receive_date: string | null; receiver: string }[];
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const no = String(request.nextUrl.searchParams.get("no") ?? "").trim();
  if (!/^RB-[\w-]{1,30}$/.test(no)) return NextResponse.json({ data: null, error: "เลขชุดรับไม่ถูกต้อง" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("goods_receipts_v2")
    .select("id, gr_no, po_no, seller_name, receive_date, receiver")
    .eq("receipt_batch_no", no).not("is_active", "is", false).order("po_no", { ascending: true });
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return NextResponse.json({ data: null, error: "ไม่พบชุดรับนี้" }, { status: 404 });
  const out: ReceiptBatch = {
    batch_no: no,
    grs: rows.map((g) => ({ id: String(g.id), gr_no: String(g.gr_no ?? ""), po_no: String(g.po_no ?? ""), seller_name: String(g.seller_name ?? ""), receive_date: (g.receive_date as string) ?? null, receiver: String(g.receiver ?? "") })),
  };
  return NextResponse.json({ data: out, error: null });
}
