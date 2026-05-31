export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- PATCH /api/playground-products/[id] (update) ----

type UpdateBody = {
  sku?: string; name?: string; category_name?: string; brand_name?: string;
  seller_name?: string; uom_name?: string; color?: string; product_type?: string;
  list_price?: number; cost_price?: number; stock_on_hand?: number;
  active?: boolean; note?: string; actor?: string;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: UpdateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_products_update", {
    p_id:            id,
    p_sku:           body.sku           ?? null,
    p_name:          body.name          ?? null,
    p_category_name: body.category_name ?? null,
    p_brand_name:    body.brand_name    ?? null,
    p_seller_name:   body.seller_name   ?? null,
    p_uom_name:      body.uom_name      ?? null,
    p_color:         body.color         ?? null,
    p_list_price:    body.list_price    ?? null,
    p_cost_price:    body.cost_price    ?? null,
    p_stock_on_hand: body.stock_on_hand ?? null,
    p_active:        body.active        ?? null,
    p_note:          body.note          ?? null,
    p_actor:         body.actor         ?? null,
    p_product_type:  body.product_type  ?? null,
  });

  if (error) {
    console.error("[api/playground-products/[id]] PATCH", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data, error: null });
}

// ---- DELETE /api/playground-products/[id] ----

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actor = new URL(request.url).searchParams.get("actor");

  const { error } = await supabaseFromRequest(request).rpc("erp_playground_products_delete", { p_id: id, p_actor: actor });

  if (error) {
    console.error("[api/playground-products/[id]] DELETE", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, error: null });
}
