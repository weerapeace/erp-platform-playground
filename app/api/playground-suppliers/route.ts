import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type SandboxSupplier = {
  id:            string;
  code:          string | null;
  name:          string;
  contact_name:  string | null;
  contact_phone: string | null;
  contact_email: string | null;
  category:      string | null;
  address:       string | null;
  tax_id:        string | null;
  note:          string | null;
  active:        boolean;
  created_at:    string;
  updated_at:    string;
  total_count:   number;
};

export type SandboxSuppliersResponse = {
  data:  SandboxSupplier[];
  total: number;
  error: string | null;
};

// ---- GET /api/playground-suppliers ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const limit  = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0"));

  const includeInactive = searchParams.get("include_inactive") === "true";
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_suppliers_list", {
    p_search: search || null, p_limit: limit, p_offset: offset, p_include_inactive: includeInactive,
  });

  if (error) {
    console.error("[api/playground-suppliers] GET", error);
    return NextResponse.json(
      { data: [], total: 0, error: error.message } satisfies SandboxSuppliersResponse,
      { status: 500 }
    );
  }
  const rows = (data as SandboxSupplier[]) ?? [];
  return NextResponse.json({
    data: rows, total: Number(rows[0]?.total_count ?? 0), error: null,
  } satisfies SandboxSuppliersResponse);
}

// ---- POST /api/playground-suppliers (create) ----

type CreateBody = {
  name: string; code?: string; contact_name?: string; contact_phone?: string;
  contact_email?: string; category?: string; address?: string;
  tax_id?: string; note?: string; actor?: string;
};

export async function POST(request: NextRequest) {
  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!body.name || body.name.trim() === "") {
    return NextResponse.json({ error: "ชื่อผู้จำหน่ายห้ามว่าง" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_suppliers_create", {
    p_name:          body.name,
    p_code:          body.code          ?? null,
    p_contact_name:  body.contact_name  ?? null,
    p_contact_phone: body.contact_phone ?? null,
    p_contact_email: body.contact_email ?? null,
    p_category:      body.category      ?? null,
    p_address:       body.address       ?? null,
    p_tax_id:        body.tax_id        ?? null,
    p_note:          body.note          ?? null,
    p_actor:         body.actor         ?? null,
  });

  if (error) {
    console.error("[api/playground-suppliers] POST", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data, error: null });
}
