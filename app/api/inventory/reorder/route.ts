import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type ReorderItem = {
  product_id:      string;
  sku:             string | null;
  name:            string;
  uom_name:        string | null;
  total_on_hand:   number;
  total_reserved:  number;
  total_available: number;
  min_stock:       number;
  reorder_qty:     number;
  suggested_qty:   number;
  avg_cost:        number;
};

export type ReorderResponse = { data: ReorderItem[]; error: string | null };

// ---- GET /api/inventory/reorder — รายการต้องสั่งเติม ----

export async function GET(request: NextRequest) {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_reorder_list");
  if (error) return NextResponse.json({ data: [], error: error.message } satisfies ReorderResponse, { status: 500 });
  return NextResponse.json({ data: (data as ReorderItem[]) ?? [], error: null } satisfies ReorderResponse);
}

// ---- PATCH /api/inventory/reorder — ตั้งค่า min_stock / reorder_qty ----

export async function PATCH(request: NextRequest) {
  let body: { product_id?: string; min_stock?: number; reorder_qty?: number; actor?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  if (!body.product_id) return NextResponse.json({ error: "ต้องมี product_id" }, { status: 400 });

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_set_min_stock", {
    p_product_id: body.product_id,
    p_min_stock:  body.min_stock ?? 0,
    p_reorder_qty: body.reorder_qty ?? 0,
    p_actor:      body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
