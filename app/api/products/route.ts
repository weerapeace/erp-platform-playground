export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { ApiProduct, ApiProductsResponse } from "@/types/products";

export type { ApiProduct, ApiProductsResponse };

// ---- GET /api/products ----
//
// Query params:
//   search  — text search (sku / name / category_name)
//   page    — page number (default: 1)
//   limit   — rows per page (default: 100, max: 500)
//
// Data is fetched via erp_playground_get_products() — a SECURITY DEFINER
// PostgreSQL function that safely exposes public-safe product catalog fields
// without requiring direct table access or the service_role key.

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const search = searchParams.get("search") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "100")));
  const offset = (page - 1) * limit;

  const { data, error } = await supabase.rpc("erp_playground_get_products", {
    p_search: search || null,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error("[api/products] Supabase RPC error:", error);
    return NextResponse.json(
      { data: [], total: 0, page, limit, error: error.message } satisfies ApiProductsResponse,
      { status: 500 }
    );
  }

  const rows = (data as ApiProduct[]) ?? [];
  const total = rows[0]?.total_count ?? 0;

  return NextResponse.json({
    data: rows,
    total: Number(total),
    page,
    limit,
    error: null,
  } satisfies ApiProductsResponse);
}
