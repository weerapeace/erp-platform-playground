/**
 * Generic Lookups API
 *
 * GET  /api/lookups?type=product_category&search=foo&include_inactive=true
 *   → list lookup values ของ type นั้น
 *
 * POST /api/lookups
 *   body: { lookup_type, name, code?, parent_id?, metadata?, sort_order? }
 *   → สร้าง value ใหม่ (RelationPicker "+ สร้างใหม่" จะเรียกอันนี้)
 *
 * ดูเพิ่ม:
 *   /api/lookups/[id]   — PATCH / DELETE (soft = is_active=false)
 *   /api/lookups/types  — GET list of lookup types
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type LookupRow = {
  id:           string;
  lookup_type:  string;
  code:         string | null;
  name:         string;
  sort_order:   number;
  parent_id:    string | null;
  is_active:    boolean;
  metadata:     Record<string, unknown>;
  created_at:   string;
  updated_at:   string;
};

const SAFE = /^[a-z_][a-z0-9_]*$/i;

// ---- GET ----
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const type   = searchParams.get("type") ?? "";
  const search = (searchParams.get("search") ?? "").trim();
  const includeInactive = searchParams.get("include_inactive") === "true";
  const includeIds = searchParams.get("include_ids")?.split(",").filter(Boolean);
  const limit  = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10)));

  if (!type || !SAFE.test(type)) {
    return NextResponse.json({ data: [], error: "invalid type" }, { status: 400 });
  }

  const supabase = supabaseFromRequest(request);
  let q = supabase
    .from("erp_lookups")
    .select("id, lookup_type, code, name, sort_order, parent_id, is_active, metadata, created_at, updated_at")
    .eq("lookup_type", type)
    .order("sort_order", { ascending: true })
    .order("name",       { ascending: true })
    .limit(limit);

  if (!includeInactive) q = q.eq("is_active", true);
  if (search)           q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`);

  let { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  let rows = (data ?? []) as LookupRow[];

  // include extra ids (current value of relation) — load แม้ไม่ match search
  if (includeIds && includeIds.length > 0) {
    const missing = includeIds.filter((id) => !rows.some((r) => r.id === id));
    if (missing.length > 0) {
      const extra = await supabase
        .from("erp_lookups")
        .select("id, lookup_type, code, name, sort_order, parent_id, is_active, metadata, created_at, updated_at")
        .in("id", missing);
      if (extra.data) rows = [...(extra.data as LookupRow[]), ...rows];
    }
  }

  return NextResponse.json({ data: rows, error: null });
}

// ---- POST ----
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Partial<LookupRow> & { lookup_type?: string; name?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const type = body.lookup_type;
  const name = (body.name ?? "").trim();
  if (!type || !SAFE.test(type)) return NextResponse.json({ error: "invalid lookup_type" }, { status: 400 });
  if (!name)                      return NextResponse.json({ error: "name required" },        { status: 400 });

  const supabase = supabaseFromRequest(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const payload = {
    lookup_type: type,
    name,
    code:        body.code ?? null,
    parent_id:   body.parent_id ?? null,
    sort_order:  body.sort_order ?? 0,
    metadata:    body.metadata ?? {},
    is_active:   true,
    created_by:  user.email,
  };

  const { data, error } = await supabase
    .from("erp_lookups")
    .insert(payload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
