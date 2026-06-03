/**
 * GET /api/inventory/sku-stock
 * ยอดคงเหลือต่อ SKU จริง (ขั้น 4 แบบเล็ก — คลังรวม นับจำนวน)
 * อ่านจาก sku_stock_balances + join ชื่อ/รหัสจาก skus_v2
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SkuStockRow = {
  sku_id:           string;
  code:             string | null;
  name_th:          string | null;
  qty_on_hand:      number;
  last_movement_at: string | null;
};

type BalanceRow = {
  sku_id:           string;
  qty_on_hand:      number | string | null;
  last_movement_at: string | null;
  skus_v2:          { code: string | null; name_th: string | null } | { code: string | null; name_th: string | null }[] | null;
};

export async function GET(request: NextRequest) {
  const supabase = supabaseFromRequest(request);
  const { searchParams } = new URL(request.url);
  const limit = Math.min(2000, Math.max(1, parseInt(searchParams.get("limit") ?? "500", 10)));

  const { data, error } = await supabase
    .from("sku_stock_balances")
    .select("sku_id, qty_on_hand, last_movement_at, skus_v2:sku_id ( code, name_th )")
    .order("last_movement_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[api/inventory/sku-stock] GET", error);
    return NextResponse.json({ data: [], total: 0, error: error.message }, { status: 500 });
  }

  const rows: SkuStockRow[] = ((data ?? []) as unknown as BalanceRow[]).map((r) => {
    const s = Array.isArray(r.skus_v2) ? r.skus_v2[0] : r.skus_v2;
    return {
      sku_id:           r.sku_id,
      code:             s?.code ?? null,
      name_th:          s?.name_th ?? null,
      qty_on_hand:      Number(r.qty_on_hand ?? 0),
      last_movement_at: r.last_movement_at,
    };
  });

  return NextResponse.json({ data: rows, total: rows.length, error: null });
}
