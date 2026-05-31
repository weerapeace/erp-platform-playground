export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export type POLine = {
  id?: string;
  product_id?: string | null;
  sku: string | null;
  product_name: string;
  qty: number;
  unit: string;
  unit_price: number;
  discount_type?: "percent" | "amount";
  discount_value?: number;
  tax_code?: string | null;
  qty_received?: number;
  subtotal?: number; discount_amount?: number; net_amount?: number; vat_amount?: number; line_total?: number;
  note?: string | null;
};

export type POListItem = {
  id: string; po_number: string | null; status: string;
  supplier_id: string | null; supplier_name: string | null; supplier_code: string | null;
  buyer_name: string | null;
  to_warehouse_id: string | null; to_warehouse_code: string | null; to_warehouse_name: string | null;
  currency: string; grand_total: number; amount_due: number;
  order_date: string; expected_arrival_date: string | null;
  line_count: number;
  created_at: string; updated_at: string;
  total_count: number;
};

export type PODetail = POListItem & {
  exchange_rate: number;
  header_discount_type: "percent" | "amount"; header_discount_value: number;
  shipping_fee: number; vat_rate: number; vat_included: boolean; wht_rate: number;
  subtotal: number; total_line_discount: number; total_header_discount: number; total_shipping: number;
  taxable: number; total_vat: number; total_wht: number;
  confirmed_at: string | null; received_at: string | null; completed_at: string | null;
  stock_received: boolean;
  pr_id: string | null; pr_number: string | null;
  reject_reason: string | null; note: string | null;
  lines: POLine[];
};

export type POListResponse = { data: POListItem[]; total: number; error: string | null };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_po_list", {
    p_search: searchParams.get("search") || null,
    p_status: searchParams.get("status") || null,
    p_limit:  Math.min(500, parseInt(searchParams.get("limit") ?? "200")),
    p_offset: Math.max(0, parseInt(searchParams.get("offset") ?? "0")),
  });
  if (error) return NextResponse.json({ data: [], total: 0, error: error.message } satisfies POListResponse, { status: 500 });
  const rows = (data as POListItem[]) ?? [];
  return NextResponse.json({ data: rows, total: Number(rows[0]?.total_count ?? 0), error: null } satisfies POListResponse);
}

type CreateBody = { header: Record<string, unknown>; lines: POLine[]; actor?: string };
export async function POST(request: NextRequest) {
  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_po_create", {
    p_header: body.header ?? {}, p_lines: body.lines ?? [], p_actor: body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data, error: null });
}
