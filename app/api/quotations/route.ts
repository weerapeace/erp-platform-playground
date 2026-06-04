import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type QuoteLine = {
  id?:              string;
  product_id?:      string | null;
  sku:              string | null;
  product_name:    string;
  qty:              number;
  unit:             string;
  unit_price:       number;
  discount_type?:   "percent" | "amount";
  discount_value?:  number;
  tax_code?:        string | null;
  subtotal?:        number;
  discount_amount?: number;
  net_amount?:      number;
  vat_amount?:      number;
  line_total?:      number;
  note?:            string | null;
};

export type QuoteListItem = {
  id:               string;
  quote_number:     string | null;
  status:           string;
  customer_id:      string | null;
  customer_name:    string | null;
  customer_code:    string | null;
  sale_person_name: string | null;
  currency:         string;
  grand_total:      number;
  amount_due:       number;
  quote_date:       string;
  valid_until:      string | null;
  converted_so_id:  string | null;
  line_count:       number;
  created_at:       string;
  updated_at:       string;
  total_count:      number;
};

export type QuoteDetail = QuoteListItem & {
  exchange_rate:           number;
  header_discount_type:    "percent" | "amount";
  header_discount_value:   number;
  shipping_fee:            number;
  vat_rate:                number;
  vat_included:            boolean;
  wht_rate:                number;
  subtotal:                number;
  total_line_discount:     number;
  total_header_discount:   number;
  total_shipping:          number;
  taxable:                 number;
  total_vat:               number;
  total_wht:               number;
  sent_at:                 string | null;
  accepted_at:             string | null;
  converted_at:            string | null;
  reject_reason:           string | null;
  note:                    string | null;
  lines:                   QuoteLine[];
};

export type QuoteListResponse = { data: QuoteListItem[]; total: number; error: string | null };

// ---- GET — list ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const limit  = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "200")));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0"));

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_quote_list", {
    p_search: search || null, p_status: status || null, p_limit: limit, p_offset: offset,
  });
  if (error) return NextResponse.json({ data: [], total: 0, error: error.message } satisfies QuoteListResponse, { status: 500 });
  const rows = (data as QuoteListItem[]) ?? [];
  return NextResponse.json({ data: rows, total: Number(rows[0]?.total_count ?? 0), error: null } satisfies QuoteListResponse);
}

// ---- POST — create ----

type CreateBody = { header: Record<string, unknown>; lines: QuoteLine[]; actor?: string };

export async function POST(request: NextRequest) {
  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_quote_create", {
    p_header: body.header ?? {}, p_lines: body.lines ?? [], p_actor: body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data, error: null });
}
