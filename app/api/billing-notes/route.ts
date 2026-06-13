import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type BillingNoteLine = {
  id?:           string;
  so_id:         string | null;
  so_number:     string | null;
  bill_date:     string | null;
  due_date:      string | null;
  amount:        number;
  vat_amount:    number;
  wht_amount:    number;
  total_amount:  number;
  note:          string | null;
};

export type BillingNoteListItem = {
  id:            string;
  bill_number:   string | null;
  status:        string;
  customer_id:   string | null;
  customer_name: string | null;
  customer_code: string | null;
  bill_date:     string;
  due_date:      string | null;
  grand_total:   number;
  amount_due:    number;
  line_count:    number;
  created_at:    string;
  updated_at:    string;
  total_count:   number;
};

export type BillingNoteDetail = Omit<BillingNoteListItem, "line_count" | "total_count"> & {
  subtotal:      number;
  total_vat:     number;
  total_wht:     number;
  note:          string | null;
  reject_reason: string | null;
  issued_at:     string | null;
  paid_at:       string | null;
  lines:         BillingNoteLine[];
};

export type BillingNoteListResponse = { data: BillingNoteListItem[]; total: number; error: string | null };

// ---- GET — list ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const limit  = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "200")));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0"));

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_billing_note_list", {
    p_search: search || null, p_status: status || null, p_limit: limit, p_offset: offset,
  });
  if (error) return NextResponse.json({ data: [], total: 0, error: error.message } satisfies BillingNoteListResponse, { status: 500 });
  const rows = (data as BillingNoteListItem[]) ?? [];
  return NextResponse.json({ data: rows, total: Number(rows[0]?.total_count ?? 0), error: null } satisfies BillingNoteListResponse);
}

// ---- POST — create จาก SO ที่เลือก ----

type CreateBody = { header: Record<string, unknown>; so_ids: string[]; actor?: string };

export async function POST(request: NextRequest) {
  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_billing_note_create", {
    p_header: body.header ?? {}, p_so_ids: body.so_ids ?? [], p_actor: body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data, error: null });
}
