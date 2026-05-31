export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type SearchHit = {
  entity_type: "product" | "supplier" | "pr" | "user";
  id:          string;
  label:       string;
  sublabel:    string | null;
  link_url:    string;
  score:       number;
};

export type GlobalSearchResponse = {
  data:  SearchHit[];
  error: string | null;
};

// ---- GET ?q=...&limit=8 ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q     = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") ?? "8")));

  if (!q) return NextResponse.json({ data: [], error: null } satisfies GlobalSearchResponse);

  const { data, error } = await supabaseFromRequest(request).rpc("erp_global_search", {
    p_query: q, p_limit: limit,
  });
  if (error) {
    return NextResponse.json({ data: [], error: error.message } satisfies GlobalSearchResponse, { status: 500 });
  }
  return NextResponse.json({ data: (data as SearchHit[]) ?? [], error: null } satisfies GlobalSearchResponse);
}
