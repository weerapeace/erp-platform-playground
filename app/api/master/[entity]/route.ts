export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Entity config (frontend/backend mapping) ----

type EntityConfig = {
  listRpc:   string;
  createRpc: string;
  /** map body fields → RPC params */
  createParams: (body: Record<string, unknown>) => Record<string, unknown>;
};

const ENTITY: Record<string, EntityConfig> = {
  customers: {
    listRpc:   "erp_playground_customers_list",
    createRpc: "erp_playground_customers_create",
    createParams: (b) => ({
      p_name:          b.name,
      p_code:          b.code ?? null,
      p_contact_phone: b.contact_phone ?? null,
      p_payment_terms: b.payment_terms ?? null,
      p_category:      b.category ?? null,
      p_actor:         b.actor ?? null,
    }),
  },
  employees: {
    listRpc:   "erp_playground_employees_list",
    createRpc: "erp_playground_employees_create",
    createParams: (b) => ({
      p_name:       b.name,
      p_code:       b.code ?? null,
      p_email:      b.email ?? null,
      p_department: b.department ?? null,
      p_position:   b.position ?? null,
      p_actor:      b.actor ?? null,
    }),
  },
  warehouses: {
    listRpc:   "erp_playground_warehouses_list",
    createRpc: "erp_playground_warehouses_create",
    createParams: (b) => ({
      p_name:   b.name,
      p_code:   b.code ?? null,
      p_branch: b.branch ?? null,
      p_actor:  b.actor ?? null,
    }),
  },
  departments: {
    listRpc:   "erp_playground_departments_list",
    createRpc: "erp_playground_departments_create",
    createParams: (b) => ({
      p_name:         b.name,
      p_code:         b.code ?? null,
      p_manager_name: b.manager_name ?? null,
      p_actor:        b.actor ?? null,
    }),
  },
  units: {
    listRpc:   "erp_playground_units_list",
    createRpc: "erp_playground_units_create",
    createParams: (b) => ({
      p_name:     b.name,
      p_code:     b.code ?? null,
      p_symbol:   b.symbol ?? null,
      p_category: b.category ?? "count",
      p_actor:    b.actor ?? null,
    }),
  },
  taxes: {
    listRpc:   "erp_playground_taxes_list",
    createRpc: "erp_playground_taxes_create",
    createParams: (b) => ({
      p_name:     b.name,
      p_code:     b.code ?? null,
      p_tax_type: b.tax_type ?? "VAT",
      p_rate:     b.rate ?? 0,
      p_included: b.included ?? false,
      p_actor:    b.actor ?? null,
    }),
  },
};

// ---- GET — list ----

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  const { entity } = await params;
  const cfg = ENTITY[entity];
  if (!cfg) return NextResponse.json({ data: [], error: "entity ไม่รองรับ" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const limit  = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0"));

  const includeInactive = searchParams.get("include_inactive") === "true";
  const { data, error } = await supabaseFromRequest(request).rpc(cfg.listRpc, {
    p_search: search || null, p_limit: limit, p_offset: offset, p_include_inactive: includeInactive,
  });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

// ---- POST — create ----

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  const { entity } = await params;
  const cfg = ENTITY[entity];
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.name) return NextResponse.json({ error: "ชื่อห้ามว่าง" }, { status: 400 });

  const { data, error } = await supabaseFromRequest(request).rpc(cfg.createRpc, cfg.createParams(body));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
