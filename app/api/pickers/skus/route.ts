import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";

type SkuPickerRow = {
  id: string;
  code: string | null;
  parent_sku_id: string | null;
  name_th: string | null;
  list_price: number | null;
  cover_image_r2_key: string | null;
  sale_ok: boolean | null;
  is_active: boolean | null;
  uom: { name: string | null } | { name: string | null }[] | null;
};

type ParentSkuMatchRow = {
  id: string;
};

const cleanSearch = (value: string) =>
  value.replace(/[%_,()*]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 4);

async function findParentSkuIds(request: NextRequest, token: string): Promise<string[]> {
  const { data, error } = await supabaseFromRequest(request)
    .from("parent_skus_v2")
    .select("id")
    .or(`code.ilike.%${token}%,name_th.ilike.%${token}%`)
    .limit(100);

  if (error) return [];
  return ((data ?? []) as ParentSkuMatchRow[]).map((row) => row.id);
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "24", 10)));
  const salesOnly = searchParams.get("sales_only") === "true";
  const tokens = cleanSearch(search);
  const parentIdsByToken = new Map<string, string[]>();
  for (const token of tokens) {
    parentIdsByToken.set(token, await findParentSkuIds(request, token));
  }

  let query = supabaseFromRequest(request)
    .from("skus_v2")
    .select(`
      id,
      code,
      parent_sku_id,
      name_th,
      list_price,
      cover_image_r2_key,
      sale_ok,
      is_active,
      uom:uoms!uom_id ( name )
    `)
    .eq("is_active", true);
  if (salesOnly) query = query.eq("sale_ok", true);

  for (const token of tokens) {
    const parentIds = parentIdsByToken.get(token) ?? [];
    const parts = [
      `code.ilike.%${token}%`,
      `name_th.ilike.%${token}%`,
      `barcode.ilike.%${token}%`,
    ];
    if (parentIds.length > 0) {
      parts.push(`parent_sku_id.in.(${parentIds.join(",")})`);
    }
    query = query.or(parts.join(","));
  }

  const { data, error } = await query.order("code", { ascending: true }).limit(limit);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const rows = ((data ?? []) as unknown as SkuPickerRow[]).map((row) => {
    const uom = Array.isArray(row.uom) ? row.uom[0] : row.uom;
    const code = row.code ?? "";
    return {
      id: row.id,
      code,
      name: row.name_th ?? code,
      uom_name: uom?.name ?? null,
      list_price: row.list_price,
      image_key: row.cover_image_r2_key,
      sale_ok: row.sale_ok,
    };
  });

  return NextResponse.json({ data: rows, error: null });
}
