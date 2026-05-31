export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type StockBalance = {
  product_id:       string;
  product_sku:      string | null;
  product_name:     string;
  warehouse_id:     string;
  warehouse_code:   string | null;
  warehouse_name:   string;
  qty_on_hand:      number;
  qty_reserved:     number;
  qty_available:    number;
  avg_cost:         number;
  total_value:      number;
  last_movement_at: string | null;
};

export type BalancesResponse = { data: StockBalance[]; error: string | null };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_stock_balances_list", {
    p_warehouse_id:   searchParams.get("warehouse_id") || null,
    p_low_stock_only: searchParams.get("low_stock") === "true",
    p_limit:          Math.min(1000, parseInt(searchParams.get("limit") ?? "500")),
  });
  if (error) return NextResponse.json({ data: [], error: error.message } satisfies BalancesResponse, { status: 500 });
  return NextResponse.json({ data: (data as StockBalance[]) ?? [], error: null } satisfies BalancesResponse);
}
