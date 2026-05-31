/**
 * Master Data v2 — Generic CRUD API (list + create)
 *
 * GET  /api/master-v2/<entity>?search=&include_inactive=true&limit=200
 * POST /api/master-v2/<entity>     body = { ...fields, actor }
 *
 * รองรับ:
 *   parent-skus → parent_skus_v2 (join brands + collections)
 *   skus        → skus_v2        (join parent_skus_v2)
 *   partners    → partners_v2
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Entity config ----

type EntityConfig = {
  table:         string;
  selectColumns: string;
  searchColumns: string[];
  /** ค่า default ตอน insert ที่ไม่ได้รับจาก body */
  defaults?:     Record<string, unknown>;
  /** field ที่ใช้เป็น soft-delete (set false = archived) */
  softDeleteColumn?: string;
  /** map response row → flat ตามที่ frontend คาดหวัง (resolve nested join) */
  postProcess?:  (row: Record<string, unknown>) => Record<string, unknown>;
};

const flattenName = (k: string) => (j: Record<string, unknown> | null) => {
  if (!j) return null;
  const obj = (Array.isArray(j) ? j[0] : j) as Record<string, unknown> | undefined;
  return (obj?.[k] as string) ?? null;
};

export const ENTITIES: Record<string, EntityConfig> = {
  "parent-skus": {
    table: "parent_skus_v2",
    selectColumns: `id, code, product_family, name_th, name_en, sku_name,
                    introduction, description,
                    brand_id, collection_id, category_id,
                    size_summary, weight_g, custom_size,
                    materials, warranty,
                    sale_price, final_price, fake_price,
                    shopee_url, lazada_url, tiktok_url,
                    is_active, created_at, updated_at,
                    brands ( name ),
                    collections ( name )`,
    searchColumns: ["code", "name_th", "name_en", "sku_name"],
    softDeleteColumn: "is_active",
    defaults: { product_family: "general", is_active: true, attribute_values: {} },
    postProcess: (r) => ({
      ...r,
      brand_name:      flattenName("name")(r.brands as Record<string, unknown> | null),
      collection_name: flattenName("name")(r.collections as Record<string, unknown> | null),
      brands: undefined,
      collections: undefined,
    }),
  },
  skus: {
    table: "skus_v2",
    selectColumns: `id, code, name_th, barcode, parent_sku_id,
                    color, list_price, standard_price,
                    is_active, sale_ok, purchase_ok,
                    created_at, updated_at,
                    parent_skus_v2 ( code, name_th )`,
    searchColumns: ["code", "name_th", "barcode"],
    softDeleteColumn: "is_active",
    defaults: { is_active: true, sale_ok: true, purchase_ok: true, attribute_values: {} },
    postProcess: (r) => {
      const parent = r.parent_skus_v2 as { code?: string; name_th?: string }[] | { code?: string; name_th?: string } | null;
      const p = Array.isArray(parent) ? parent[0] : parent;
      return {
        ...r,
        parent_code:    p?.code ?? null,
        parent_name_th: p?.name_th ?? null,
        parent_skus_v2: undefined,
      };
    },
  },
  partners: {
    table: "partners_v2",
    selectColumns: `id, code, name_th, name_en, display_name,
                    is_customer, is_supplier, is_company,
                    phone, mobile, email, line_id, website,
                    address_line, sub_district, district, province, postal_code, country,
                    tax_id, tax_branch,
                    payment_terms_days, credit_limit, default_currency,
                    notes, tags, is_active,
                    created_at, updated_at`,
    searchColumns: ["code", "name_th", "name_en", "phone", "email", "tax_id"],
    softDeleteColumn: "is_active",
    defaults: { is_active: true, is_company: true, country: "TH", tax_branch: "00000" },
  },
};

// ---- GET — list ----

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
): Promise<NextResponse> {
  const { entity } = await params;
  const cfg = ENTITIES[entity];
  if (!cfg) return NextResponse.json({ data: [], error: "entity ไม่รองรับ" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const limit  = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "200", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
  const includeInactive = searchParams.get("include_inactive") === "true";

  const supabase = supabaseFromRequest(request);
  let query = supabase
    .from(cfg.table)
    .select(cfg.selectColumns, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (cfg.softDeleteColumn && !includeInactive) {
    query = query.eq(cfg.softDeleteColumn, true);
  }
  if (search && cfg.searchColumns.length > 0) {
    const orFilter = cfg.searchColumns.map((c) => `${c}.ilike.%${search}%`).join(",");
    query = query.or(orFilter);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const raw = (data ?? []) as unknown as Record<string, unknown>[];
  const rows = cfg.postProcess ? raw.map(cfg.postProcess) : raw;

  return NextResponse.json({ data: rows, total: count ?? rows.length, error: null });
}

// ---- POST — create ----

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
): Promise<NextResponse> {
  const { entity } = await params;
  const cfg = ENTITIES[entity];
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // strip 'actor' (used for audit log, not a column)
  const { actor: _actor, ...fields } = body;
  void _actor;

  // merge with defaults; drop undefined
  const payload: Record<string, unknown> = { ...cfg.defaults };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) payload[k] = v;
  }

  const supabase = supabaseFromRequest(request);
  const { data, error } = await supabase
    .from(cfg.table)
    .insert(payload)
    .select(cfg.selectColumns)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = cfg.postProcess ? cfg.postProcess(data as unknown as Record<string, unknown>) : data;
  return NextResponse.json({ data: row, error: null });
}
