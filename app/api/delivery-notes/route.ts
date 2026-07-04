import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type DeliveryNoteLine = {
  id?:           string;
  product_id?:   string | null;
  sku:           string | null;
  product_name:  string;
  qty:           number;
  unit:          string | null;
  note?:         string | null;
};

export type DeliveryNoteListItem = {
  id:            string;
  dn_number:     string | null;
  status:        string;
  customer_id:   string | null;
  customer_name: string | null;
  customer_code: string | null;
  delivery_date: string;
  total_qty:     number;
  line_count:    number;
  so_numbers:    string[] | null;
  created_at:    string;
  updated_at:    string;
  total_count:   number;
};

export type DeliveryNoteDetail = Omit<DeliveryNoteListItem, "line_count" | "total_count"> & {
  note:          string | null;
  reject_reason: string | null;
  delivered_at:  string | null;
  so_ids:        string[] | null;
  // เติมจาก partners_v2 ตอนดึงรายละเอียด (ใช้แสดง/พิมพ์)
  customer_address?: string | null;
  customer_phone?:   string | null;
  customer_tax_id?:  string | null;
  lines:         DeliveryNoteLine[];
};

export type DeliveryNoteListResponse = { data: DeliveryNoteListItem[]; total: number; error: string | null };

// ---- GET — list ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const limit  = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "200")));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0"));

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_delivery_note_list", {
    p_search: search || null, p_status: status || null, p_limit: limit, p_offset: offset,
  });
  if (error) return NextResponse.json({ data: [], total: 0, error: error.message } satisfies DeliveryNoteListResponse, { status: 500 });
  const rows = (data as DeliveryNoteListItem[]) ?? [];
  return NextResponse.json({ data: rows, total: Number(rows[0]?.total_count ?? 0), error: null } satisfies DeliveryNoteListResponse);
}

// ---- POST — create (รายการสินค้าเอง / ดึงจาก SO) ----

type CreateBody = { header: Record<string, unknown>; lines: DeliveryNoteLine[]; actor?: string };

export async function POST(request: NextRequest) {
  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_delivery_note_create", {
    p_header: body.header ?? {}, p_lines: body.lines ?? [], p_actor: body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data, error: null });
}
