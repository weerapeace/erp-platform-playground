/**
 * /api/dashboard/sales-trend — ยอดขายรวมรายวัน 14 วัน (widget กราฟยอดขาย)
 * RPC erp_sales_trend (อ่าน marketing_product_daily) — SECURITY DEFINER
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_sales_trend", { p_days: 14 });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as { d: string; sales: number }[], error: null },
    { headers: { "Cache-Control": "private, max-age=300" } });
}
