import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- Types ----

export type PRListItem = {
  id:             string;
  pr_number:      string | null;
  title:          string;
  requester_name: string | null;
  department:     string | null;
  status:         string;
  total_amount:   number;
  line_count:     number;
  created_at:     string;
  updated_at:     string;
  total_count:    number;
};

export type PRLine = {
  id?:          string;
  product_id?:  string | null;
  sku:          string | null;
  product_name: string;
  qty:          number;
  unit:         string;
  unit_price:   number;
  line_total?:  number;
  note?:        string | null;
};

export type PRDetail = {
  id:             string;
  pr_number:      string | null;
  title:          string;
  requester_name: string | null;
  department:     string | null;
  status:         string;
  note:           string | null;
  total_amount:   number;
  submitted_at:   string | null;
  approved_at:    string | null;
  approver_name:  string | null;
  reject_reason:  string | null;
  created_at:     string;
  updated_at:     string;
  lines:          PRLine[];
};

export type PRListResponse = {
  data:  PRListItem[];
  total: number;
  error: string | null;
};

// ---- GET /api/purchase-requests ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const limit  = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "200")));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0"));

  const { data, error } = await supabase.rpc("erp_playground_pr_list", {
    p_search: search || null, p_status: status || null, p_limit: limit, p_offset: offset,
  });

  if (error) {
    console.error("[api/purchase-requests] GET", error);
    return NextResponse.json({ data: [], total: 0, error: error.message } satisfies PRListResponse, { status: 500 });
  }
  const rows = (data as PRListItem[]) ?? [];
  return NextResponse.json({ data: rows, total: Number(rows[0]?.total_count ?? 0), error: null } satisfies PRListResponse);
}

// ---- POST /api/purchase-requests (create draft) ----

type CreateBody = {
  title: string; requester_name?: string; department?: string; note?: string; lines?: PRLine[]; actor?: string;
};

export async function POST(request: NextRequest) {
  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!body.title || body.title.trim() === "") {
    return NextResponse.json({ error: "หัวข้อใบขอซื้อห้ามว่าง" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_pr_create", {
    p_title:          body.title,
    p_requester_name: body.requester_name ?? null,
    p_department:     body.department     ?? null,
    p_note:           body.note           ?? null,
    p_lines:          body.lines ?? [],
    p_actor:          body.actor          ?? null,
  });

  if (error) {
    console.error("[api/purchase-requests] POST", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data, error: null });
}
