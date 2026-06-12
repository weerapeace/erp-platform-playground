/**
 * POST /api/purchasing/sku-open-orders
 * เช็ค "สั่งซ้ำ" — สินค้า (SKU) ไหนมีใบขอซื้อที่ยัง "ค้าง" อยู่บ้าง
 *
 * body: { sku_ids: string[] }
 * → { data: { [sku_id]: [{ pr_no, date, qty, uom, seller_name, status }] } }
 *
 * "ค้าง" = ยังไม่จบ/ไม่ถูกปฏิเสธ — สถานะไม่อยู่ใน rejected/cancelled/received/completed/done/short_closed
 * (รออนุมัติ/อนุมัติ/รอออก PO/ออก PO รอรับของ ถือว่ายังค้าง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CLOSED = ["rejected", "cancelled", "received", "completed", "done", "short_closed"];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;

  let body: { sku_ids?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const skuIds = Array.isArray(body.sku_ids) ? body.sku_ids.filter((x): x is string => typeof x === "string") : [];
  if (skuIds.length === 0) return NextResponse.json({ data: {}, error: null });

  const admin = supabaseAdmin();
  const map: Record<string, { pr_no: string; date: string | null; qty: number; uom: string; seller_name: string; status: string }[]> = {};

  // chunk กัน URL ยาว (in list ใหญ่)
  for (let i = 0; i < skuIds.length; i += 200) {
    const chunk = skuIds.slice(i, i + 200);
    const { data, error } = await admin
      .from("purchase_requests_v2")
      .select("item_sku_id, pr_no, order_date, created_at, qty, uom, seller_name, status")
      .in("item_sku_id", chunk)
      .eq("is_active", true)
      .not("status", "in", `(${CLOSED.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) return NextResponse.json({ data: {}, error: error.message }, { status: 500 });
    for (const p of (data ?? [])) {
      const sid = p.item_sku_id as string | null; if (!sid) continue;
      (map[sid] ??= []).push({
        pr_no: (p.pr_no as string) ?? "",
        date: (p.order_date as string | null) ?? (p.created_at as string | null) ?? null,
        qty: Number(p.qty) || 0,
        uom: (p.uom as string) || "",
        seller_name: (p.seller_name as string) || "—",
        status: (p.status as string) || "",
      });
    }
  }

  return NextResponse.json({ data: map, error: null });
}
