import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";

// ค้นหา Parent SKU (parent_skus_v2) สำหรับ ParentSkuPicker
type Row = { id: string; code: string | null; name_th: string | null; cover_image_r2_key: string | null };

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "24", 10)));

  let query = supabaseFromRequest(request)
    .from("parent_skus_v2")
    .select("id, code, name_th, cover_image_r2_key")
    .eq("is_active", true);
  if (search) { const t = search.replace(/[%_,()*]/g, " ").trim(); if (t) query = query.or(`code.ilike.%${t}%,name_th.ilike.%${t}%`); }

  const { data, error } = await query.order("code", { ascending: true }).limit(limit);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const rows = ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    code: r.code ?? "",
    name: r.name_th ?? r.code ?? "",
    image_key: r.cover_image_r2_key ?? null,
  }));
  return NextResponse.json({ data: rows, error: null });
}
