import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ตั้ง/แก้ชั้นวาง (ตำแหน่งหลัก) ของ สินค้า×คลัง
export async function PATCH(request: NextRequest) {
  let body: { product_id?: string; warehouse_id?: string; location_code?: string; actor?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!body.product_id || !body.warehouse_id) {
    return NextResponse.json({ error: "ต้องระบุสินค้าและคลัง" }, { status: 400 });
  }

  const { error } = await supabaseFromRequest(request).rpc("erp_playground_stock_set_location", {
    p_product_id:   body.product_id,
    p_warehouse_id: body.warehouse_id,
    p_location_code: body.location_code ?? "",
    p_actor:        body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ error: null });
}
