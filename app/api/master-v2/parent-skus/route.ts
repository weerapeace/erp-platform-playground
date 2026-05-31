export const runtime = "edge";

/**
 * Master Data v2 — Parent SKUs (Product Templates) API
 *
 * GET /api/master-v2/parent-skus?search=&limit=50&offset=0
 *
 * Returns list with brand/collection labels resolved via JOIN
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type ParentSkuV2Row = {
  id:             string;
  code:           string;
  product_family: string;
  name_th:        string;
  name_en:        string | null;
  brand_id:       string | null;
  brand_name:     string | null;
  collection_id:  string | null;
  collection_name: string | null;
  size_summary:   string | null;
  sale_price:     number | null;
  warranty:       string | null;
  is_active:      boolean;
  updated_at:     string;
};

export type ParentSkusV2Response = {
  data:  ParentSkuV2Row[];
  total: number;
  error: string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse<ParentSkusV2Response>> {
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const limit  = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
  const family = searchParams.get("family");
  const includeInactive = searchParams.get("include_inactive") === "true";

  const supabase = supabaseFromRequest(request);

  // Build query — join brand + collection
  let query = supabase
    .from("parent_skus_v2")
    .select(
      `id, code, product_family, name_th, name_en, brand_id, collection_id,
       size_summary, sale_price, warranty, is_active, updated_at,
       brands ( name ),
       collections ( name )`,
      { count: "exact" }
    )
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (!includeInactive) query = query.eq("is_active", true);
  if (family) query = query.eq("product_family", family);
  if (search) {
    // match code OR name_th
    query = query.or(`code.ilike.%${search}%,name_th.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json(
      { data: [], total: 0, error: error.message },
      { status: 500 }
    );
  }

  // Supabase returns embedded relations as arrays even for 1-to-1 FK
  type Joined = {
    id: string; code: string; product_family: string;
    name_th: string; name_en: string | null;
    brand_id: string | null; collection_id: string | null;
    size_summary: string | null; sale_price: number | null;
    warranty: string | null; is_active: boolean; updated_at: string;
    brands:      { name: string }[] | { name: string } | null;
    collections: { name: string }[] | { name: string } | null;
  };

  const pickName = (j: { name: string }[] | { name: string } | null | undefined): string | null => {
    if (!j) return null;
    if (Array.isArray(j)) return j[0]?.name ?? null;
    return j.name ?? null;
  };

  const rows: ParentSkuV2Row[] = ((data as unknown) as Joined[] ?? []).map((r) => ({
    id:              r.id,
    code:            r.code,
    product_family:  r.product_family,
    name_th:         r.name_th,
    name_en:         r.name_en,
    brand_id:        r.brand_id,
    brand_name:      pickName(r.brands),
    collection_id:   r.collection_id,
    collection_name: pickName(r.collections),
    size_summary:    r.size_summary,
    sale_price:      r.sale_price ? Number(r.sale_price) : null,
    warranty:        r.warranty,
    is_active:       r.is_active,
    updated_at:      r.updated_at,
  }));

  return NextResponse.json({ data: rows, total: count ?? rows.length, error: null });
}
