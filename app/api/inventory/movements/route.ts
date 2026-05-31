import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type StockMovement = {
  id:                 string;
  movement_number:    string | null;
  movement_type:      "in" | "out" | "transfer" | "adjust";
  movement_date:      string;
  product_id:         string;
  product_sku:        string | null;
  product_name:       string;
  from_warehouse_id:  string | null;
  from_warehouse_code: string | null;
  to_warehouse_id:    string | null;
  to_warehouse_code:  string | null;
  qty:                number;
  unit:               string;
  unit_cost:          number;
  total_cost:         number;
  reference_type:     string | null;
  reference_id:       string | null;
  reference_label:    string | null;
  performed_by:       string | null;
  note:               string | null;
  created_at:         string;
  total_count:        number;
};

export type MovementsResponse = { data: StockMovement[]; total: number; error: string | null };

// ---- GET ?type=&warehouse_id=&product_id=&search= ----
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_stock_movements_list", {
    p_search:        searchParams.get("search") || null,
    p_movement_type: searchParams.get("type") || null,
    p_warehouse_id:  searchParams.get("warehouse_id") || null,
    p_product_id:    searchParams.get("product_id") || null,
    p_limit:         Math.min(500, parseInt(searchParams.get("limit") ?? "200")),
    p_offset:        Math.max(0, parseInt(searchParams.get("offset") ?? "0")),
  });
  if (error) return NextResponse.json({ data: [], total: 0, error: error.message } satisfies MovementsResponse, { status: 500 });
  const rows = (data as StockMovement[]) ?? [];
  return NextResponse.json({ data: rows, total: Number(rows[0]?.total_count ?? 0), error: null } satisfies MovementsResponse);
}

// ---- POST create movement ----
type CreateBody = {
  movement_type: "in" | "out" | "transfer" | "adjust";
  movement_date?: string;
  product_id: string;
  from_warehouse_id?: string | null;
  to_warehouse_id?:   string | null;
  qty: number;
  unit_cost?: number;
  reference_type?: string;
  reference_id?: string;
  reference_label?: string;
  note?: string;
  actor?: string;
};

export async function POST(request: NextRequest) {
  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.movement_type || !body.product_id || !body.qty) {
    return NextResponse.json({ error: "movement_type, product_id, qty จำเป็น" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_stock_movement_create", {
    p_movement_type:    body.movement_type,
    p_movement_date:    body.movement_date ?? null,
    p_product_id:       body.product_id,
    p_from_warehouse_id: body.from_warehouse_id ?? null,
    p_to_warehouse_id:   body.to_warehouse_id ?? null,
    p_qty:              body.qty,
    p_unit_cost:        body.unit_cost ?? 0,
    p_reference_type:   body.reference_type ?? null,
    p_reference_id:     body.reference_id ?? null,
    p_reference_label:  body.reference_label ?? null,
    p_note:             body.note ?? null,
    p_actor:            body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
