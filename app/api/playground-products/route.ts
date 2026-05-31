export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type SandboxProduct = {
  id:            string;
  sku:           string | null;
  name:          string;
  category_name: string | null;
  brand_name:    string | null;
  seller_name:   string | null;
  uom_name:      string | null;
  product_type:  string | null;
  color:         string | null;
  list_price:    number | null;
  cost_price:    number | null;
  stock_on_hand: number | null;
  active:        boolean | null;
  note:          string | null;
  primary_image_url: string | null;
  created_at:    string;
  updated_at:    string;
  total_count:   number;
};

export type SandboxProductsResponse = {
  data:  SandboxProduct[];
  total: number;
  error: string | null;
};

// ---- GET /api/playground-products ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const limit  = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "200")));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0"));

  const { data, error } = await supabase.rpc("erp_playground_products_list", {
    p_search: search || null,
    p_limit:  limit,
    p_offset: offset,
  });

  if (error) {
    console.error("[api/playground-products] GET", error);
    return NextResponse.json(
      { data: [], total: 0, error: error.message } satisfies SandboxProductsResponse,
      { status: 500 }
    );
  }

  const rows = (data as SandboxProduct[]) ?? [];
  return NextResponse.json({
    data:  rows,
    total: Number(rows[0]?.total_count ?? 0),
    error: null,
  } satisfies SandboxProductsResponse);
}

// ---- POST /api/playground-products (create) ----

type CreateBody = {
  sku?: string; name: string; category_name?: string; brand_name?: string;
  seller_name?: string; uom_name?: string; color?: string;
  list_price?: number; cost_price?: number; stock_on_hand?: number;
  active?: boolean; note?: string; actor?: string;
};

export async function POST(request: NextRequest) {
  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!body.name || body.name.trim() === "") {
    return NextResponse.json({ error: "ชื่อสินค้าห้ามว่าง" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_products_create", {
    p_sku:           body.sku           ?? null,
    p_name:          body.name,
    p_category_name: body.category_name ?? null,
    p_brand_name:    body.brand_name    ?? null,
    p_seller_name:   body.seller_name   ?? null,
    p_uom_name:      body.uom_name      ?? "ชิ้น",
    p_color:         body.color         ?? null,
    p_list_price:    body.list_price    ?? 0,
    p_cost_price:    body.cost_price    ?? 0,
    p_stock_on_hand: body.stock_on_hand ?? 0,
    p_active:        body.active        ?? true,
    p_note:          body.note          ?? null,
    p_actor:         body.actor         ?? null,
  });

  if (error) {
    console.error("[api/playground-products] POST", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data, error: null });
}
